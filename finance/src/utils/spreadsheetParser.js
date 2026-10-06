import * as XLSX from 'xlsx';
import { logDebug, logWarn, logError } from './debugLogger.js';
import { matchCreditToEarner, MAX_SPREADSHEET_FILE_SIZE, MAX_SPREADSHEET_ROW_COUNT } from './importer.js';

/**
 * Clean currency/number values from Excel strings or cells
 */
function cleanNum(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return defaultVal;
    const rounded = Math.round((val + (val >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  const str = String(val).trim();
  if (!str) return defaultVal;
  // If the cell contains words or 2+ letters (e.g. "OnlinePay ***********1234", "FUNDS TRANSFER CR", "Transfer")
  // it is text, not a currency/numeric cell.
  if (/[a-zA-Z]{2,}/.test(str)) {
    return defaultVal;
  }
  const isParenNeg = /^\s*\(.*\)\s*$/.test(str);
  const cleaned = str.replace(/[^0-9.-]+/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return defaultVal;
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return defaultVal;
  const signed = (isParenNeg && num > 0) ? -num : (str.startsWith('-') && num > 0 ? -num : num);
  const rounded = Math.round((signed + (signed >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Clean string text
 */
function cleanText(val, defaultVal = '') {
  if (val === undefined || val === null) return defaultVal;
  return String(val).trim().replace(/[\r\n]+/g, ' ');
}

// System reserved matrix column names to ignore when extracting bill names
const RESERVED_COLS = new Set([
  'date', 'beg balance', 'regular beg balance', 'extra beg balance', 'total beg balance',
  'regular ending balance', 'extra ending balance', 'extra payment balance', 'ending balance',
  'total balance', 'total end balance', 'day of week', '__empty', '__empty_1', '__empty_2',
  'credit', 'other', 'other explination', 'other explanation', 'extra patment withdrawl',
  'extra payment withdrawl', 'status', 'balance today', 'as of', 'days until due',
  'total monthly income', 'total monthly expenses', 'subtotal', 'total expenses',
  'total all accounts', 'account summary', 'key metrics & insights', 'simple budget worksheet',
  'totals', 'total', 'monthly savings rate', 'total cash on hand', 'how much can i save?',
  'bi-weekly #1', 'bi-weekly #2',
  'bi-weekly #1 - regular pay', 'bi-weekly #2 - income', 'income source',
  'expense/income item', 'current account balances (live)', 'current regular balance',
  'extra balance', 'total current balance', 'next 5 upcoming payments', 'where do i want to put my savings?',
  'income', 'debt payoff', 'other goals'
]);

/**
 * Parse an Excel file ArrayBuffer or string into clean budget state
 */
export function parseSpreadsheet(fileData, fileName = '', existingBills = []) {
  try {
    const byteLen = typeof fileData === 'string' ? fileData.length : (fileData?.byteLength || 0);
    if (byteLen > MAX_SPREADSHEET_FILE_SIZE) {
      throw new Error(`File size (${Math.round(byteLen / (1024 * 1024))}MB) exceeds maximum limit of 15MB.`);
    }
    logDebug('PARSER', `Starting Emory Parc workbook parsing: "${fileName}"`, { fileName });
    const workbook = typeof fileData === 'string'
      ? XLSX.read(fileData, { type: 'string', cellFormula: true })
      : XLSX.read(fileData, { type: 'array', cellFormula: true });

    logDebug('PARSER', `Workbook loaded with ${workbook.SheetNames.length} sheets`, { sheetNames: workbook.SheetNames });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (sheet && sheet['!ref']) {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const sheetRows = range.e.r - range.s.r + 1;
        if (sheetRows > MAX_SPREADSHEET_ROW_COUNT) {
          throw new Error(`Sheet "${sheetName}" contains ${sheetRows} rows, exceeding maximum limit of ${MAX_SPREADSHEET_ROW_COUNT}.`);
        }
      }
    }

    const accountsMap = new Map();
    const peopleMap = new Map();
    const billsList = [];
    const loansList = [];
    const lineItemsList = [];
    // GAP-4: monotonic counter prevents duplicate IDs when multiple txns are produced in the same ms
    let txnIdCounter = 0;



    // Track accounts by normalized search key
    function getOrCreateAccount(rawName, type = 'checking', balance = 0) {
      const name = cleanText(rawName);
      if (!name) return null;

      const norm = name.toLowerCase();

      // Check existing accounts
      for (const [key, acc] of accountsMap.entries()) {
        if (key === norm || key.includes(norm) || norm.includes(key)) {
          return acc.id;
        }
      }

      const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `acc-${slug || 'default'}`;

      let color = 'blue';
      if (norm.includes('mortgage')) color = 'indigo';
      if (norm.includes('hoa') || norm.includes('sav')) color = 'emerald';
      if (norm.includes('credit') || norm.includes('card')) color = 'purple';

      accountsMap.set(norm, {
        id,
        name,
        type: norm.includes('sav') ? 'savings' : norm.includes('credit') ? 'credit' : type,
        saveExtraMonthly: 0,
        enableExtraSavings: true,
        color,
        notes: ''
      });

      return id;
    }

    // Helper: Add Person
    function addPerson(name, role = 'Member', gross = 0, net = 0, color = 'purple') {
      const clean = cleanText(name);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!peopleMap.has(key)) {
        const slug = key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        peopleMap.set(key, {
          id: `person-${slug || Date.now()}`,
          name: clean,
          role,
          payFrequency: 'bi-weekly',
          payDay1: 15,
          payDay2: 'last',
          grossPerPay: gross,
          netPerPay: net,
          color
        });
      }
    }

    // Process all sheets
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length === 0) return;

      const lowerSheet = sheetName.toLowerCase().trim();

      // --- SECTION A: Scan for "Dashboard" or "Main Budget" Layout ---
      if (lowerSheet.includes('budget') || lowerSheet.includes('dashboard') || lowerSheet.includes('main')) {
        let currentAccountName = 'Checking';

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map(c => cleanText(c));
          const rowText = row.join(' ').toLowerCase();

          // Detect Account Header Sections
          if (rowText.includes('checking expenses')) currentAccountName = 'Checking';
          if (rowText.includes('savings expenses')) currentAccountName = 'Savings';

          // Detect Account Balances in Account Summary table
          if (rowText.includes('checking -') || rowText.includes('checking summary')) {
            const bal = cleanNum(row.find(cell => cleanNum(cell) > 0));
            getOrCreateAccount('Checking', 'checking', bal);
          }
          if (rowText.includes('savings -') || rowText.includes('savings summary')) {
            const bal = cleanNum(row.find(cell => cleanNum(cell) > 0));
            getOrCreateAccount('Savings', 'savings', bal);
          }

          // Detect People/Earners from headers
          const earnerMatch = rowText.match(/per paycheck allocation \(([^)]+)\)/i) || rowText.match(/([a-z0-9_-]+) portion/i);
          if (earnerMatch && earnerMatch[1] && !['subtotal', 'total', 'bills'].includes(earnerMatch[1].toLowerCase())) {
            addPerson(earnerMatch[1], 'Member', 0, 0, 'purple');
          }

          // Detect Bill Rows
          const col0 = row[0] || row[1] || '';
          const cleanCol0 = col0.toLowerCase();

          if (
            col0 &&
            col0.length >= 3 &&
            !RESERVED_COLS.has(cleanCol0) &&
            !cleanCol0.includes('expenses') &&
            !cleanCol0.includes('subtotal') &&
            !cleanCol0.includes('income') &&
            !cleanCol0.includes('budget') &&
            !cleanCol0.includes('account') &&
            !cleanCol0.includes('bill name') &&
            !cleanCol0.includes('item')
          ) {
            // Found a valid bill row
            const billName = col0;
            const amount = Math.abs(cleanNum(row[3] || row[2] || row[4], 0));
            const periodStr = rowText.includes('semi-annual') ? 'Semi-Annual' : rowText.includes('annual') ? 'Annual' : rowText.includes('quarterly') ? 'Quarterly' : rowText.includes('weekly') ? 'Weekly' : 'Monthly';

            // Find due day or date if present
            let dueDay = 15;
            const dayCell = row.find(c => /^\d{1,2}(st|nd|rd|th)?$/i.test(c));
            if (dayCell) dueDay = parseInt(dayCell) || 15;

            // Target Account
            const accCell = row.find(c => c.toLowerCase().includes('checking') || c.toLowerCase().includes('savings'));
            const targetAccName = accCell || currentAccountName;
            const accountId = getOrCreateAccount(targetAccName);

            // Payment Source & Notes & Matching Key
            const paymentSource = row[8] || row[7] || row[9] || 'Auto Pay';
            const notes = row[9] || row[10] || '';
            const matchingKey = cleanText(row[10] || row[11] || billName);

            const defaultDueMonths = periodStr === 'Annual' ? [1] : periodStr === 'Semi-Annual' ? [1, 7] : periodStr === 'Quarterly' ? [1, 4, 7, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

            // Check if already added
            const existingBill = billsList.find(b => b.name.toLowerCase() === billName.toLowerCase());
            if (!existingBill && billName) {
              billsList.push({
                id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                accountId,
                name: billName,
                amount,
                period: periodStr,
                dueDay: Math.max(1, Math.min(31, dueDay)),
                dueMonths: defaultDueMonths,
                paymentSource,
                matchingKey: matchingKey || billName,
                bankMatchNames: matchingKey || billName,
                notes,
                splits: {}
              });
            }
          }
        }
      }

      // --- SECTION D: Scan Checking & Savings Daily Matrix Sheets for Transactions ---
      const isDailyMatrixSheet = lowerSheet.includes('checking') || lowerSheet.includes('savings') || lowerSheet.includes('ledger') || lowerSheet.includes('matrix') ||
        (workbook.SheetNames.length === 1 && rows.some(r => r && r.some(c => {
          const s = String(c || '').toLowerCase();
          return s.includes('beg balance') || s.includes('ending balance') || s.includes('credit');
        })));

      if (isDailyMatrixSheet) {
        const headerRowIdx = rows.findIndex(r => r && r.some(c => c && String(c).toLowerCase().includes('date')));
        if (headerRowIdx >= 0) {
          const headers = (rows[headerRowIdx] || []).map(h => String(h || '').trim());
          const dateColIdx = headers.findIndex(h => String(h || '').toLowerCase().includes('date'));
          const otherDescIdx = headers.findIndex(h => String(h || '').toLowerCase().includes('other desc') || String(h || '').toLowerCase().includes('other expl'));

          const balanceRegex = /\b(beg|beginning|end|ending|balance|subtotal|total)\b/i;

          // Map sheet to target account
          const sheetAccName = cleanText(sheetName) || 'Checking';
          const targetAccountId = getOrCreateAccount(sheetAccName);

          // Safe date parsing helper
          const parseRowDate = (val) => {
            if (!val) return '';
            if (typeof val === 'number') {
              const ssf = XLSX.SSF;
              if (ssf && ssf.parse_date_code) {
                const d = ssf.parse_date_code(val);
                if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
              }
              const date = new Date(Math.round((val - 25569) * 86400 * 1000));
              if (!isNaN(date.getTime())) {
                const y = date.getUTCFullYear();
                const m = String(date.getUTCMonth() + 1).padStart(2, '0');
                const d = String(date.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
              }
            }
            return String(val).trim();
          };

          const lowerHeaders = headers.map(h => cleanText(h).toLowerCase());
          const isMatrixSheet = lowerHeaders.some(h =>
            h.includes('reg beg') ||
            h.includes('regular beg') ||
            h.includes('extra beg') ||
            h.includes('total beg') ||
            h.includes('beginning balance') ||
            h.includes('beg balance') ||
            h.includes('credit')
          );
          const amountColIdx = lowerHeaders.findIndex(h => h === 'amount' || h === 'amt' || h === 'transaction amount');
          const debitColIdx = lowerHeaders.findIndex(h => h === 'debit' || h === 'withdrawal' || h === 'outflow' || h === 'payments' || h === 'paid out' || h === 'charge');
          const creditColIdx = lowerHeaders.findIndex(h => (h === 'credit' || h === 'deposit' || h === 'inflow' || h === 'additions' || h === 'paid in') && !h.includes('card'));
          const hasAmountOrDebitCredit = amountColIdx >= 0 || debitColIdx >= 0 || creditColIdx >= 0;

          if (!isMatrixSheet && dateColIdx >= 0 && hasAmountOrDebitCredit) {
            // Flat bank statement branch
            const descColIdx = lowerHeaders.findIndex(h =>
              h === 'description' || h === 'desc' || h === 'payee' || h === 'merchant' || h === 'name' || h === 'transaction description' || h === 'details'
            );
            const origDescColIdx = lowerHeaders.findIndex(h =>
              (h.includes('orig') && h.includes('desc')) || h === 'memo' || h === 'notes' || h === 'note' || h === 'statement details'
            );
            const categoryColIdx = lowerHeaders.findIndex(h => h === 'category' || h === 'cat' || h === 'type' || h === 'transaction type');

            for (let i = headerRowIdx + 1; i < rows.length; i++) {
              const r = rows[i];
              if (!r || r.length === 0) continue;

              const rawDate = r[dateColIdx];
              if (!rawDate) continue;
              const dateStr = parseRowDate(rawDate);
              if (!dateStr || dateStr.length < 8) continue;

              let description = '';
              if (descColIdx >= 0 && r[descColIdx] !== undefined && r[descColIdx] !== null && String(r[descColIdx]).trim() !== '') {
                description = cleanText(r[descColIdx]);
              } else if (origDescColIdx >= 0 && r[origDescColIdx] !== undefined && r[origDescColIdx] !== null && String(r[origDescColIdx]).trim() !== '') {
                description = cleanText(r[origDescColIdx]);
              }
              if (!description) description = 'Transaction';

              let notes = '';
              if (origDescColIdx >= 0 && r[origDescColIdx] !== undefined && r[origDescColIdx] !== null) {
                const orig = cleanText(r[origDescColIdx]);
                if (orig && orig !== description) {
                  notes = orig;
                }
              }

              let category = 'Uncategorized';
              if (categoryColIdx >= 0 && r[categoryColIdx] !== undefined && r[categoryColIdx] !== null && String(r[categoryColIdx]).trim() !== '') {
                category = cleanText(r[categoryColIdx]);
              }

              let amount = 0;
              if (amountColIdx >= 0 && r[amountColIdx] !== undefined && r[amountColIdx] !== null && r[amountColIdx] !== '') {
                const rawAmtStr = String(r[amountColIdx]).trim();
                const isParenNeg = /^\s*\(.*\)\s*$/.test(rawAmtStr);
                const cleaned = rawAmtStr.replace(/[^0-9.-]+/g, '');
                const parsed = parseFloat(cleaned);
                if (Number.isFinite(parsed)) {
                  const signed = (isParenNeg && parsed > 0) ? -parsed : (rawAmtStr.startsWith('-') && parsed > 0 ? -parsed : parsed);
                  amount = Math.round((signed + (signed >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
                  amount = Object.is(amount, -0) ? 0 : amount;
                }
              } else if (debitColIdx >= 0 || creditColIdx >= 0) {
                const debitStr = debitColIdx >= 0 ? String(r[debitColIdx] || '').replace(/[^0-9.-]+/g, '') : '';
                const creditStr = creditColIdx >= 0 ? String(r[creditColIdx] || '').replace(/[^0-9.-]+/g, '') : '';
                const debit = debitStr && Number.isFinite(parseFloat(debitStr)) ? Math.abs(parseFloat(debitStr)) : 0;
                const credit = creditStr && Number.isFinite(parseFloat(creditStr)) ? Math.abs(parseFloat(creditStr)) : 0;
                amount = Math.round((credit - debit) * 100) / 100;
              }

              if (amount === 0 && (!description || description === 'Transaction')) continue;

              let billId = null;
              if (amount < 0) {
                const lowerDesc = description.toLowerCase();
                const lowerNotes = notes.toLowerCase();
                const isFee = lowerDesc.includes('fee') || lowerNotes.includes('fee');
                if (!isFee) {
                  const matchedBill = existingBills.find(b => {
                    const bName = (b.name || '').toLowerCase();
                    const bKey = (b.bankMatchNames || b.matchingKey || '').toLowerCase();
                    return (
                      (bKey && (lowerDesc.includes(bKey) || bKey.includes(lowerDesc) || (lowerNotes && lowerNotes.includes(bKey)))) ||
                      bName.includes(lowerDesc) ||
                      lowerDesc.includes(bName) ||
                      (lowerDesc.includes('hoa') && bName.includes('hoa')) ||
                      (lowerDesc.includes('mortgage') && bName.includes('mortgage')) ||
                      (lowerDesc.includes('water') && bName.includes('water')) ||
                      (lowerDesc.includes('power') && bName.includes('power')) ||
                      (lowerDesc.includes('gas') && bName.includes('gas')) ||
                      (lowerDesc.includes('electric') && bName.includes('electric')) ||
                      (lowerDesc.includes('insurance') && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) ||
                      (lowerDesc.includes('cell') && (bName.includes('cell') || bName.includes('phone'))) ||
                      (lowerDesc.includes('gym') && bName.includes('gym'))
                    );
                  });
                  if (matchedBill) {
                    billId = matchedBill.id;
                  }
                }
              }

              if (!category || category === 'Uncategorized') {
                const lowerDesc = description.toLowerCase();
                if (amount > 0) {
                  category = 'Income / Transfer';
                } else if (lowerDesc.includes('hoa') || lowerDesc.includes('mortgage') || lowerDesc.includes('rent')) {
                  category = 'Housing';
                } else if (lowerDesc.includes('power') || lowerDesc.includes('gas') || lowerDesc.includes('water') || lowerDesc.includes('electric') || lowerDesc.includes('utility')) {
                  category = 'Utilities';
                } else if (lowerDesc.includes('insurance')) {
                  category = 'Insurance (Vehicle)';
                } else if (lowerDesc.includes('gym') || lowerDesc.includes('phone') || lowerDesc.includes('youtube') || lowerDesc.includes('cell')) {
                  category = 'Subscriptions';
                }
              }

              lineItemsList.push({
                id: `txn-${Date.now()}-${txnIdCounter++}`,
                date: dateStr,
                description,
                amount,
                accountId: targetAccountId,
                billId,
                category,
                isOther: !billId,
                notes: notes || `Imported from ${sheetName}`
              });
            }

            return;
          }

          // Detect balance column indices
          const regBegIdx = headers.findIndex(h => h.toLowerCase().includes('regular beg') || h.toLowerCase().includes('reg beg'));
          const extraBegIdx = headers.findIndex(h => h.toLowerCase().includes('extra beg'));
          const totalBegIdx = headers.findIndex(h => h.toLowerCase().includes('total beg'));

          const regEndIdx = headers.findIndex(h => h.toLowerCase().includes('regular end') || h.toLowerCase().includes('reg end') || h.toLowerCase().includes('regular ending'));
          const extraEndIdx = headers.findIndex(h => h.toLowerCase().includes('extra end') || h.toLowerCase().includes('extra ending'));
          const totalEndIdx = headers.findIndex(h => h.toLowerCase().includes('total end') || h.toLowerCase().includes('total ending') || h.toLowerCase().includes('total balance'));

          // importedLedgerRows: { 'YYYY-MM-DD': { regEnding, extraEnding, totalEnding, regBeg, extraBeg } }
          const importedLedgerRows = {};

          for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[dateColIdx]) continue;
            const dateStr = parseRowDate(r[dateColIdx]);
            if (!dateStr || dateStr.length < 8) continue;

            const rRegBeg = regBegIdx >= 0 ? cleanNum(r[regBegIdx]) : 0;
            const rExtraBeg = extraBegIdx >= 0 ? cleanNum(r[extraBegIdx]) : 0;
            const rTotalBeg = totalBegIdx >= 0 ? cleanNum(r[totalBegIdx]) : (rRegBeg + rExtraBeg);

            const rRegEnd = regEndIdx >= 0 ? cleanNum(r[regEndIdx]) : null;
            const rExtraEnd = extraEndIdx >= 0 ? cleanNum(r[extraEndIdx]) : 0;
            const rTotalEnd = totalEndIdx >= 0 ? cleanNum(r[totalEndIdx]) : (rRegEnd !== null ? (rRegEnd + rExtraEnd) : null);

            if (rRegEnd !== null || rTotalEnd !== null) {
              let parsedRegEnd = rRegEnd !== null ? rRegEnd : (rTotalEnd - rExtraEnd);
              let parsedExtraEnd = rExtraEnd;
              if (parsedRegEnd < 0 && parsedExtraEnd > 0) {
                const transfer = Math.min(parsedExtraEnd, -parsedRegEnd);
                parsedRegEnd += transfer;
                parsedExtraEnd -= transfer;
              } else if (parsedExtraEnd < 0 && parsedRegEnd > 0) {
                const transfer = Math.min(parsedRegEnd, -parsedExtraEnd);
                parsedExtraEnd += transfer;
                parsedRegEnd -= transfer;
              }
              parsedRegEnd = Math.round(parsedRegEnd * 100) / 100 || 0;
              parsedExtraEnd = Math.round(parsedExtraEnd * 100) / 100 || 0;

              let parsedRegBeg = rRegBeg;
              let parsedExtraBeg = rExtraBeg;
              if (parsedRegBeg < 0 && parsedExtraBeg > 0) {
                const transfer = Math.min(parsedExtraBeg, -parsedRegBeg);
                parsedRegBeg += transfer;
                parsedExtraBeg -= transfer;
              } else if (parsedExtraBeg < 0 && parsedRegBeg > 0) {
                const transfer = Math.min(parsedRegBeg, -parsedExtraBeg);
                parsedExtraBeg += transfer;
                parsedRegBeg -= transfer;
              }
              parsedRegBeg = Math.round(parsedRegBeg * 100) / 100 || 0;
              parsedExtraBeg = Math.round(parsedExtraBeg * 100) / 100 || 0;

              importedLedgerRows[dateStr] = {
                regEnding: parsedRegEnd,
                extraEnding: parsedExtraEnd,
                totalEnding: rTotalEnd !== null ? rTotalEnd : Math.round((parsedRegEnd + parsedExtraEnd) * 100) / 100,
                regBeg: parsedRegBeg,
                extraBeg: parsedExtraBeg,
                totalBeg: rTotalBeg
              };
            }
          }

          // Attach the historical map and stamp ledgerMode on the account
          const accObj = Array.from(accountsMap.values()).find(a => a.id === targetAccountId);
          if (accObj && Object.keys(importedLedgerRows).length > 0) {
            accObj.importedLedgerRows = importedLedgerRows;
            accObj.ledgerMode = 'import';
          }

          for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length === 0) continue;

            const rawDate = r[dateColIdx];
            if (!rawDate) continue;
            const dateStr = parseRowDate(rawDate);
            if (!dateStr) continue;

            headers.forEach((h, colIdx) => {
              if (!h || colIdx === dateColIdx || colIdx === otherDescIdx) return;
              if (balanceRegex.test(h)) return; // Skip balance columns!

              const val = r[colIdx];
              const num = typeof val === 'number' ? val : parseFloat(String(val || '').replace(/[^0-9.-]+/g, ''));

              if (!isNaN(num) && num !== 0) {
                const lowerH = h.toLowerCase();
                const otherDesc = (otherDescIdx >= 0 && r[otherDescIdx]) ? String(r[otherDescIdx]).trim() : '';
                const isOtherCol = (lowerH === 'other' || lowerH.startsWith('other ') || lowerH.startsWith('other$') || lowerH === 'other $' || (/^other\b/i.test(lowerH) && !lowerH.includes('desc') && !lowerH.includes('credit')));
                const desc = isOtherCol ? (otherDesc || 'Other') : (lowerH.includes('insurance') ? 'Insurance (Vehicle)' : h);

                // Match to existing bill if debit
                let billId = null;

                if (!isOtherCol && !lowerH.includes('credit') && !lowerH.includes('deposit') && !lowerH.includes('income')) {
                  // 1. Primary matchingKey check on billsList
                  const matchedByKey = billsList.find(b => {
                    const rawKey = b.bankMatchNames || b.matchingKey;
                    if (!rawKey) return false;
                    const keys = String(rawKey).split(/[,;/|]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
                    return keys.some(k => lowerH.includes(k) || (k.length >= 3 && k.includes(lowerH)) || (otherDesc && otherDesc.toLowerCase().includes(k)));
                  });

                  if (matchedByKey) {
                    billId = matchedByKey.id;
                  } else {
                    const matchedBill = billsList.find(b => {
                      const bName = b.name.toLowerCase();
                      return bName.includes(lowerH) || lowerH.includes(bName) ||
                        (lowerH.includes('cell') && bName.includes('cell')) ||
                        (lowerH.includes('gym') && bName.includes('gym')) ||
                        (lowerH.includes('insurance') && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) ||
                        (lowerH.includes('hoa') && bName.includes('hoa')) ||
                        (lowerH.includes('mortgage') && bName.includes('mortgage')) ||
                        (lowerH.includes('water') && bName.includes('water')) ||
                        (lowerH.includes('power') && bName.includes('power')) ||
                        (lowerH.includes('gas') && bName.includes('gas')) ||
                        (lowerH.includes('comcast') && bName.includes('comcast')) ||
                        (lowerH.includes('youtube') && bName.includes('youtube'));
                    });

                    if (matchedBill) {
                      billId = matchedBill.id;
                    } else {
                      // Secondary match: cross-reference existing app bills by matchingKey first, then name
                      const existingKeyMatch = existingBills.find(b => {
                        const rawKey = b.bankMatchNames || b.matchingKey;
                        if (!rawKey) return false;
                        const keys = String(rawKey).split(/[,;/|]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
                        return keys.some(k => lowerH.includes(k) || (k.length >= 3 && k.includes(lowerH)) || (otherDesc && otherDesc.toLowerCase().includes(k)));
                      });

                      if (existingKeyMatch) {
                        billId = existingKeyMatch.id;
                      } else {
                        const existingMatch = existingBills.find(b => {
                          const bName = b.name.toLowerCase();
                          return bName.includes(lowerH) || lowerH.includes(bName) ||
                            (lowerH.includes('water') && bName.includes('water')) ||
                            (lowerH.includes('power') && bName.includes('power')) ||
                            (lowerH.includes('gas') && bName.includes('gas')) ||
                            (lowerH.includes('electric') && bName.includes('electric')) ||
                            (lowerH.includes('cell') && bName.includes('cell')) ||
                            (lowerH.includes('gym') && bName.includes('gym')) ||
                            (lowerH.includes('insurance') && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) ||
                            (lowerH.includes('hoa') && bName.includes('hoa')) ||
                            (lowerH.includes('mortgage') && bName.includes('mortgage')) ||
                            (lowerH.includes('comcast') && bName.includes('comcast')) ||
                            (lowerH.includes('youtube') && bName.includes('youtube'));
                        });
                        if (existingMatch) {
                          billId = existingMatch.id;
                        } else {
                          // Create new bill entry in billsList for this sheet
                          const targetBillName = lowerH.includes('insurance') ? 'Insurance (Vehicle)' : h;
                          let discovered = billsList.find(b => b.name.toLowerCase() === targetBillName.toLowerCase());
                          if (!discovered) {
                            discovered = {
                              id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                              accountId: targetAccountId,
                              name: targetBillName,
                              amount: Math.abs(num),
                              period: 'Monthly',
                              dueDay: 15,
                              dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                              paymentSource: 'Auto Pay',
                              matchingKey: lowerH.includes('insurance') ? 'PROGRESSIVE, AUTO INSURANCE, GEICO, INSURANCE, VEHICLE' : h,
                              notes: `Discovered from column ${h}`,
                              splits: {}
                            };
                            billsList.push(discovered);
                          }
                          billId = discovered.id;
                        }
                      }
                    }
                  }
                }

                const isCredit = isOtherCol
                  ? num > 0
                  : (lowerH.includes('credit') || lowerH.includes('deposit') || lowerH.includes('income'));
                // BUG-1 fix: For Other col preserve raw sign; for named cols enforce sign from category.
                const txnAmount = isOtherCol ? num : (isCredit ? Math.abs(num) : -Math.abs(num));

                // Infer category
                let category = 'Uncategorized';
                if (isOtherCol) category = 'Other';
                else if (isCredit) category = 'Income / Transfer';
                else if (lowerH.includes('power') || lowerH.includes('gas') || lowerH.includes('water') || lowerH.includes('comcast') || lowerH.includes('utility')) category = 'Utilities';
                else if (lowerH.includes('mortgage') || lowerH.includes('hoa') || lowerH.includes('rent')) category = 'Housing';
                else if (lowerH.includes('gym') || lowerH.includes('phone') || lowerH.includes('youtube') || lowerH.includes('cell')) category = 'Subscriptions';
                else if (lowerH.includes('insurance')) category = 'Insurance (Vehicle)';

                lineItemsList.push({
                  id: `txn-${Date.now()}-${txnIdCounter++}`,
                  date: dateStr,
                  description: desc,
                  amount: txnAmount,
                  accountId: targetAccountId,
                  billId,
                  category,
                  isOther: isOtherCol,
                  notes: `Imported from ${sheetName}`
                });
              }
            });
          }
        }
      }

      // --- SECTION B: Scan Structured "Accounts" Sheet ---
      if (lowerSheet.includes('account') && !lowerSheet.includes('budget')) {
        const headerRow = rows[0]?.map(c => cleanText(c).toLowerCase()) || [];
        const nameIdx = headerRow.findIndex(h => h.includes('name') || h.includes('account'));
        const balIdx = headerRow.findIndex(h => h.includes('balance') || h.includes('starting'));

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const name = cleanText(r[nameIdx >= 0 ? nameIdx : 0]);
          if (!name || RESERVED_COLS.has(name.toLowerCase())) continue;

          const bal = cleanNum(r[balIdx >= 0 ? balIdx : 1], 0);
          getOrCreateAccount(name, 'checking', bal);
        }
      }

      // --- SECTION C: Scan Structured "Loan Amortization" Sheet ---
      if (lowerSheet.includes('loan') || lowerSheet.includes('amortization')) {
        let principal = 0;
        let rate = 0;
        let term = 360;
        let desc = 'Home Loan';

        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const rowText = rows[i].map(c => cleanText(c)).join(' ').toLowerCase();
          if (rowText.includes('loan amount') || rowText.includes('total principal')) {
            const val = rows[i].find(c => typeof c === 'number' && c > 1000);
            if (val) principal = val;
          }
          if (rowText.includes('annual interest rate')) {
            const val = rows[i].find(c => typeof c === 'number' && c > 0 && c < 30);
            if (val) rate = val;
          }
          if (rowText.includes('loan term')) {
            const val = rows[i].find(c => typeof c === 'number' && c > 0 && c <= 480);
            if (val) term = val;
          }
        }

        if (principal > 0) {
          loansList.push({
            id: `loan-${Date.now()}`,
            description: desc,
            principal,
            annualInterestRate: rate || 5.5,
            termMonths: term || 360,
            monthlyPayment: 0,
            extraPayment: 0,
            startDate: new Date().toISOString().split('T')[0]
          });
        }
      }
    });



    const accounts = Array.from(accountsMap.values());
    const people = Array.from(peopleMap.values());

    logDebug('PARSER', `Emory Parc parsing complete: ${accounts.length} accounts, ${people.length} earners, ${billsList.length} bills, ${loansList.length} loans, ${lineItemsList.length} matrix entries`, {
      accountsCount: accounts.length,
      peopleCount: people.length,
      billsCount: billsList.length,
      loansCount: loansList.length,
      lineItemsCount: lineItemsList.length
    });

    return {
      success: true,
      budget: {
        accounts,
        people,
        bills: billsList,
        lineItems: lineItemsList,
        transactions: lineItemsList,
        loans: loansList
      }
    };

  } catch (err) {
    logError('PARSER', `Failed to parse Emory Parc spreadsheet: ${err.message}`, { error: err.message, stack: err.stack });
    return {
      success: false,
      error: `Failed to parse spreadsheet: ${err.message}`
    };
  }
}

/**
 * Parses a single sheet's raw rows with a specific header row index and target account.
 * @param {Object} params
 * @param {any[][]} params.rawRows
 * @param {string} params.sheetName
 * @param {number} params.headerRowIdx
 * @param {string} params.targetAccountId
 * @param {string} params.targetAccountName
 * @param {any[]} [params.existingBills]
 * @param {any[]} [params.existingPeople]
 * @param {any[]} [params.existingAccounts]
 * @returns {{ transactions: any[], importedLedgerRows: Object, discoveredBills: any[], discoveredPeople: any[] }}
 */
export function parseSingleSheet({
  rawRows = [],
  sheetName = 'Sheet',
  headerRowIdx = 0,
  targetAccountId = '',
  targetAccountName = '',
  existingBills = [],
  existingPeople = [],
  existingAccounts = []
}) {
  if (!rawRows || rawRows.length <= headerRowIdx) {
    return { transactions: [], importedLedgerRows: {}, discoveredBills: [], discoveredPeople: [] };
  }

  if (rawRows.length > MAX_SPREADSHEET_ROW_COUNT) {
    throw new Error(`Sheet contains ${rawRows.length} rows, exceeding maximum limit of ${MAX_SPREADSHEET_ROW_COUNT}.`);
  }

  const rawHeaders = rawRows[headerRowIdx] || [];
  const headers = rawHeaders.map(h => cleanText(h));
  const dateColIdx = headers.findIndex(h => h.toLowerCase().includes('date'));
  const otherDescIdx = headers.findIndex(h => h.toLowerCase().includes('other desc') || h.toLowerCase().includes('other expl'));

  if (dateColIdx < 0) {
    logWarn('PARSER', `No date column found at header row ${headerRowIdx} in sheet "${sheetName}"`);
    return { transactions: [], importedLedgerRows: {}, discoveredBills: [], discoveredPeople: [] };
  }

  const balanceRegex = /\b(beg|beginning|end|ending|balance|subtotal|total)\b/i;

  const parseRowDate = (val) => {
    if (!val) return '';
    if (typeof val === 'number') {
      const ssf = XLSX.SSF;
      if (ssf && ssf.parse_date_code) {
        const d = ssf.parse_date_code(val);
        if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    const str = String(val).trim().replace(/^["']|["']$/g, '');
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [m, d, y] = str.split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
      const [y, m, d] = str.split('-');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return str;
  };

  const lowerHeaders = headers.map(h => cleanText(h).toLowerCase());

  // Check for multi-column budget matrix markers (Emory Parc style):
  const isMatrixSheet = lowerHeaders.some(h =>
    h.includes('reg beg') ||
    h.includes('regular beg') ||
    h.includes('extra beg') ||
    h.includes('total beg') ||
    h.includes('beginning balance') ||
    h.includes('beg balance') ||
    h.includes('credit')
  );

  // Check for flat bank statement markers:
  const amountColIdx = lowerHeaders.findIndex(h => h === 'amount' || h === 'amt' || h === 'transaction amount');
  const debitColIdx = lowerHeaders.findIndex(h => h === 'debit' || h === 'withdrawal' || h === 'outflow' || h === 'payments' || h === 'paid out' || h === 'charge');
  const creditColIdx = lowerHeaders.findIndex(h => (h === 'credit' || h === 'deposit' || h === 'inflow' || h === 'additions' || h === 'paid in') && !h.includes('card'));
  const hasAmountOrDebitCredit = amountColIdx >= 0 || debitColIdx >= 0 || creditColIdx >= 0;

  if (!isMatrixSheet && dateColIdx >= 0 && hasAmountOrDebitCredit) {
    // --- FLAT BANK STATEMENT PARSER ---
    const descColIdx = lowerHeaders.findIndex(h =>
      h === 'description' || h === 'desc' || h === 'payee' || h === 'merchant' || h === 'name' || h === 'transaction description' || h === 'details'
    );
    const origDescColIdx = lowerHeaders.findIndex(h =>
      (h.includes('orig') && h.includes('desc')) || h === 'memo' || h === 'notes' || h === 'note' || h === 'statement details'
    );
    const categoryColIdx = lowerHeaders.findIndex(h => h === 'category' || h === 'cat' || h === 'type' || h === 'transaction type');
    const balanceColIdx = lowerHeaders.findIndex(h => h === 'balance' || h === 'running balance' || h === 'ending balance' || h === 'total balance');

    const importedLedgerRows = {};
    const transactions = [];
    const discoveredBills = [];
    const discoveredPeople = [];

    let isOldestFirst = false;
    if (rawRows.length > headerRowIdx + 2 && dateColIdx >= 0) {
      const dFirst = parseRowDate(rawRows[headerRowIdx + 1][dateColIdx]);
      const dLast = parseRowDate(rawRows[rawRows.length - 1][dateColIdx]);
      if (dFirst && dLast && dFirst < dLast) {
        isOldestFirst = true;
      }
    }

    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const r = rawRows[i];
      if (!r || r.length === 0) continue;

      const rawDate = r[dateColIdx];
      if (!rawDate) continue;
      const dateStr = parseRowDate(rawDate);
      if (!dateStr || dateStr.length < 8) continue;

      // 1. Description
      let description = '';
      if (descColIdx >= 0 && r[descColIdx] !== undefined && r[descColIdx] !== null && String(r[descColIdx]).trim() !== '') {
        description = cleanText(r[descColIdx]);
      } else if (origDescColIdx >= 0 && r[origDescColIdx] !== undefined && r[origDescColIdx] !== null && String(r[origDescColIdx]).trim() !== '') {
        description = cleanText(r[origDescColIdx]);
      }
      if (!description) description = 'Transaction';

      // 2. Notes / Original Description
      let notes = '';
      if (origDescColIdx >= 0 && r[origDescColIdx] !== undefined && r[origDescColIdx] !== null) {
        const orig = cleanText(r[origDescColIdx]);
        if (orig && orig !== description) {
          notes = orig;
        }
      }

      // 3. Category
      let category = 'Uncategorized';
      if (categoryColIdx >= 0 && r[categoryColIdx] !== undefined && r[categoryColIdx] !== null && String(r[categoryColIdx]).trim() !== '') {
        category = cleanText(r[categoryColIdx]);
      }

      // 4. Amount
      let amount = 0;
      if (amountColIdx >= 0 && r[amountColIdx] !== undefined && r[amountColIdx] !== null && r[amountColIdx] !== '') {
        const rawAmtStr = String(r[amountColIdx]).trim();
        const isParenNeg = /^\s*\(.*\)\s*$/.test(rawAmtStr);
        const cleaned = rawAmtStr.replace(/[^0-9.-]+/g, '');
        const parsed = parseFloat(cleaned);
        if (Number.isFinite(parsed)) {
          const signed = (isParenNeg && parsed > 0) ? -parsed : (rawAmtStr.startsWith('-') && parsed > 0 ? -parsed : parsed);
          amount = Math.round((signed + (signed >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
          amount = Object.is(amount, -0) ? 0 : amount;
        }
      } else if (debitColIdx >= 0 || creditColIdx >= 0) {
        const debitStr = debitColIdx >= 0 ? String(r[debitColIdx] || '').replace(/[^0-9.-]+/g, '') : '';
        const creditStr = creditColIdx >= 0 ? String(r[creditColIdx] || '').replace(/[^0-9.-]+/g, '') : '';
        const debit = debitStr && Number.isFinite(parseFloat(debitStr)) ? Math.abs(parseFloat(debitStr)) : 0;
        const credit = creditStr && Number.isFinite(parseFloat(creditStr)) ? Math.abs(parseFloat(creditStr)) : 0;
        amount = Math.round((credit - debit) * 100) / 100;
      }

      if (amount === 0 && (!description || description === 'Transaction')) continue;

      // 5. Match bill if debit
      let billId = null;
      if (amount < 0) {
        const lowerDesc = description.toLowerCase();
        const lowerNotes = notes.toLowerCase();
        const isFee = lowerDesc.includes('fee') || lowerNotes.includes('fee');
        if (!isFee) {
          const matchedBill = existingBills.find(b => {
            if (b.isArchived) return false;
            const bName = (b.name || '').toLowerCase();
            const bKey = (b.bankMatchNames || b.matchingKey || '').toLowerCase();
            const aliases = bKey ? bKey.split(/[,;\n\r|]+/).map(k => k.trim()).filter(Boolean) : [];
            const aliasMatch = aliases.some(alias =>
              alias.length >= 2 && (lowerDesc.includes(alias) || (lowerNotes && lowerNotes.includes(alias)))
            );
            if (aliasMatch) return true;
            return (
              bName.includes(lowerDesc) ||
              (lowerDesc.length >= 3 && lowerDesc.includes(bName)) ||
              (lowerDesc.includes('hoa') && bName.includes('hoa')) ||
              (lowerDesc.includes('mortgage') && bName.includes('mortgage')) ||
              (lowerDesc.includes('water') && bName.includes('water')) ||
              (lowerDesc.includes('power') && bName.includes('power')) ||
              ((lowerDesc.includes('gas') || lowerDesc.includes('energy') || lowerDesc.includes('geo')) && bName.includes('gas')) ||
              (lowerDesc.includes('energy inc') && (bName.includes('gas') || bName.includes('energy'))) ||
              (lowerDesc.includes('electric') && bName.includes('electric')) ||
              (lowerDesc.includes('insurance') && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) ||
              (lowerDesc.includes('cell') && (bName.includes('cell') || bName.includes('phone'))) ||
              (lowerDesc.includes('gym') && bName.includes('gym'))
            );
          });
          if (matchedBill) {
            billId = matchedBill.id;
          }
        }
      }

      // Match earner if deposit/credit
      let personId = null;
      if (amount > 0) {
        const match = matchCreditToEarner({
          amount,
          description,
          notes,
          category,
          targetAccountId,
          people: existingPeople,
          bills: existingBills,
          accounts: existingAccounts
        });
        if (match) {
          // @ts-ignore dynamic shape
          personId = match.person.id; // @ts-ignore
          category = 'Income / Transfer';
          // @ts-ignore dynamic shape
          logDebug("PARSER", `Matched credit transaction #${transactions.length + 1} to earner "${match.person.name}" via ${match.reason}`, { // @ts-ignore
            amount,
            description,
            personId
          });
        }
      }

      // 6. Infer / normalize Category if missing or default
      if (!category || category === 'Uncategorized') {
        const lowerDesc = description.toLowerCase();
        if (amount > 0) {
          category = 'Income / Transfer';
        } else if (lowerDesc.includes('hoa') || lowerDesc.includes('mortgage') || lowerDesc.includes('rent')) {
          category = 'Housing';
        } else if (lowerDesc.includes('power') || lowerDesc.includes('gas') || lowerDesc.includes('water') || lowerDesc.includes('electric') || lowerDesc.includes('utility')) {
          category = 'Utilities';
        } else if (lowerDesc.includes('insurance')) {
          category = 'Insurance (Vehicle)';
        } else if (lowerDesc.includes('gym') || lowerDesc.includes('phone') || lowerDesc.includes('youtube') || lowerDesc.includes('cell')) {
          category = 'Subscriptions';
        }
      }

      // 7. Optional running balance
      let parsedBalance = undefined;
      if (balanceColIdx >= 0 && r[balanceColIdx] !== undefined && r[balanceColIdx] !== null && r[balanceColIdx] !== '') {
        const parsedBal = parseFloat(String(r[balanceColIdx]).replace(/[^0-9.-]+/g, ''));
        if (!isNaN(parsedBal)) {
          parsedBalance = Math.round(parsedBal * 100) / 100;
          if (importedLedgerRows[dateStr] === undefined || isOldestFirst) {
            importedLedgerRows[dateStr] = {
              regEnding: parsedBalance,
              extraEnding: 0,
              totalEnding: parsedBalance
            };
          }
        }
      }

      transactions.push({
        id: `txn-${Date.now()}-${transactions.length}`,
        date: dateStr,
        description,
        amount,
        balance: parsedBalance !== undefined ? parsedBalance : undefined,
        accountId: targetAccountId,
        billId,
        personId,
        category,
        isOther: !billId && !personId,
        notes: notes || `Imported from ${sheetName}`
      });
    }

    logDebug('PARSER', `Parsed flat bank statement "${sheetName}": ${transactions.length} txns`, {
      targetAccountId,
      headerRowIdx,
      txnCount: transactions.length
    });

    return {
      transactions,
      importedLedgerRows,
      discoveredBills,
      discoveredPeople
    };
  }

  // Balance column indices
  const regBegIdx = headers.findIndex(h => h.toLowerCase().includes('regular beg') || h.toLowerCase().includes('reg beg'));
  const extraBegIdx = headers.findIndex(h => h.toLowerCase().includes('extra beg'));
  const totalBegIdx = headers.findIndex(h => h.toLowerCase().includes('total beg'));

  const regEndIdx = headers.findIndex(h => h.toLowerCase().includes('regular end') || h.toLowerCase().includes('reg end') || h.toLowerCase().includes('regular ending'));
  const extraEndIdx = headers.findIndex(h => h.toLowerCase().includes('extra end') || h.toLowerCase().includes('extra ending'));
  const totalEndIdx = headers.findIndex(h => h.toLowerCase().includes('total end') || h.toLowerCase().includes('total ending') || h.toLowerCase().includes('total balance'));

  const importedLedgerRows = {};
  const transactions = [];
  const discoveredBills = [];
  const discoveredPeople = [];

  // 1. Build importedLedgerRows map
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !r[dateColIdx]) continue;
    const dateStr = parseRowDate(r[dateColIdx]);
    if (!dateStr || dateStr.length < 8) continue;

    const rRegBeg = regBegIdx >= 0 ? cleanNum(r[regBegIdx]) : 0;
    const rExtraBeg = extraBegIdx >= 0 ? cleanNum(r[extraBegIdx]) : 0;
    const rTotalBeg = totalBegIdx >= 0 ? cleanNum(r[totalBegIdx]) : (rRegBeg + rExtraBeg);

    const rRegEnd = regEndIdx >= 0 ? cleanNum(r[regEndIdx]) : null;
    const rExtraEnd = extraEndIdx >= 0 ? cleanNum(r[extraEndIdx]) : 0;
    const rTotalEnd = totalEndIdx >= 0 ? cleanNum(r[totalEndIdx]) : (rRegEnd !== null ? (rRegEnd + rExtraEnd) : null);

    if (rRegEnd !== null || rTotalEnd !== null) {
      let parsedRegEnd = rRegEnd !== null ? rRegEnd : (rTotalEnd - rExtraEnd);
      let parsedExtraEnd = rExtraEnd;
      if (parsedRegEnd < 0 && parsedExtraEnd > 0) {
        const transfer = Math.min(parsedExtraEnd, -parsedRegEnd);
        parsedRegEnd += transfer;
        parsedExtraEnd -= transfer;
      } else if (parsedExtraEnd < 0 && parsedRegEnd > 0) {
        const transfer = Math.min(parsedRegEnd, -parsedExtraEnd);
        parsedExtraEnd += transfer;
        parsedRegEnd -= transfer;
      }
      parsedRegEnd = Math.round(parsedRegEnd * 100) / 100 || 0;
      parsedExtraEnd = Math.round(parsedExtraEnd * 100) / 100 || 0;

      let parsedRegBeg = rRegBeg;
      let parsedExtraBeg = rExtraBeg;
      if (parsedRegBeg < 0 && parsedExtraBeg > 0) {
        const transfer = Math.min(parsedExtraBeg, -parsedRegBeg);
        parsedRegBeg += transfer;
        parsedExtraBeg -= transfer;
      } else if (parsedExtraBeg < 0 && parsedRegBeg > 0) {
        const transfer = Math.min(parsedRegBeg, -parsedExtraBeg);
        parsedExtraBeg += transfer;
        parsedRegBeg -= transfer;
      }
      parsedRegBeg = Math.round(parsedRegBeg * 100) / 100 || 0;
      parsedExtraBeg = Math.round(parsedExtraBeg * 100) / 100 || 0;

      importedLedgerRows[dateStr] = {
        regEnding: parsedRegEnd,
        extraEnding: parsedExtraEnd,
        totalEnding: rTotalEnd !== null ? rTotalEnd : Math.round((parsedRegEnd + parsedExtraEnd) * 100) / 100,
        regBeg: parsedRegBeg,
        extraBeg: parsedExtraBeg,
        totalBeg: rTotalBeg
      };
    }
  }

  // 2. Discover Earner columns
  headers.forEach((h) => {
    const lowerH = h.toLowerCase();
    if (lowerH.includes('credit') && !lowerH.includes('card')) {
      const parts = h.split(/\s+/);
      const name = parts[0];
      if (name && name.length >= 2 && !['extra', 'total', 'beg', 'end', 'other'].includes(name.toLowerCase())) {
        if (!discoveredPeople.some(p => p.name.toLowerCase() === name.toLowerCase()) && !existingPeople.some(p => p.name.toLowerCase() === name.toLowerCase())) {
          discoveredPeople.push({
            id: `person-${name.toLowerCase()}`,
            name: name,
            role: 'Member',
            payFrequency: 'bi-weekly',
            grossPerPay: 0,
            netPerPay: 0
          });
        }
      }
    }
  });

  // 3. Parse Transactions from non-zero cells
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || r.length === 0) continue;

    const rawDate = r[dateColIdx];
    if (!rawDate) continue;
    const dateStr = parseRowDate(rawDate);
    if (!dateStr) continue;

    headers.forEach((h, colIdx) => {
      if (!h || colIdx === dateColIdx || colIdx === otherDescIdx) return;
      if (balanceRegex.test(h)) return;

      const num = cleanNum(r[colIdx]);

      if (num !== null && num !== 0) {
        const lowerH = h.toLowerCase();
        const otherDesc = (otherDescIdx >= 0 && r[otherDescIdx]) ? String(r[otherDescIdx]).trim() : '';

        const isOtherCol = (lowerH === 'other' || lowerH.startsWith('other ') || lowerH.startsWith('other$') || lowerH === 'other $' || (/^other\b/i.test(lowerH) && !lowerH.includes('desc') && !lowerH.includes('credit')));
        const desc = isOtherCol ? (otherDesc || 'Other') : (lowerH.includes('insurance') ? 'Insurance (Vehicle)' : h);

        const isCredit = isOtherCol
          ? num > 0
          : (lowerH.includes('credit') || lowerH.includes('deposit') || lowerH.includes('income'));
        // For Other col: preserve the sign directly. For named bill/credit cols: force sign from category.
        const txnAmount = isOtherCol ? num : (isCredit ? Math.abs(num) : -Math.abs(num));

        // Match bill
        let billId = null;
        if (!isCredit && !isOtherCol) {
          const matchedBill = existingBills.find(b => {
            const bName = b.name.toLowerCase();
            const bKey = (b.bankMatchNames || b.matchingKey || '').toLowerCase();
            return (
              (bKey && (lowerH.includes(bKey) || bKey.includes(lowerH))) ||
              bName.includes(lowerH) ||
              lowerH.includes(bName) ||
              (lowerH.includes('insurance') && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) ||
              (lowerH.includes('cell') && (bName.includes('cell') || bName.includes('phone'))) ||
              (lowerH.includes('phone') && (bName.includes('cell') || bName.includes('phone'))) ||
              (lowerH.includes('gym') && (bName.includes('gym') || bName.includes('membership'))) ||
              (lowerH.includes('water') && bName.includes('water')) ||
              (lowerH.includes('power') && (bName.includes('power') || bName.includes('electric'))) ||
              (lowerH.includes('electric') && (bName.includes('power') || bName.includes('electric'))) ||
              (lowerH.includes('gas') && bName.includes('gas')) ||
              (lowerH.includes('hoa') && bName.includes('hoa')) ||
              (lowerH.includes('mortgage') && bName.includes('mortgage')) ||
              (lowerH.includes('comcast') && (bName.includes('comcast') || bName.includes('internet') || bName.includes('xfinity'))) ||
              (lowerH.includes('youtube') && bName.includes('youtube'))
            );
          });
          if (matchedBill) {
            billId = matchedBill.id;
          } else if (!RESERVED_COLS.has(lowerH)) {
            // Discovered potential bill
            const targetBillName = lowerH.includes('insurance') ? 'Insurance (Vehicle)' : h;
            let disc = discoveredBills.find(db => db.name.toLowerCase() === targetBillName.toLowerCase());
            if (!disc) {
              const discMatchKey = lowerH.includes('insurance') ? 'PROGRESSIVE, AUTO INSURANCE, GEICO, INSURANCE, VEHICLE' : h;
              disc = {
                id: `bill-${Date.now()}-${discoveredBills.length}`,
                name: targetBillName,
                amount: Math.abs(num),
                period: 'Monthly',
                dueDay: 15,
                accountId: targetAccountId,
                paymentSource: 'Auto Pay',
                matchingKey: discMatchKey,
                bankMatchNames: discMatchKey
              };
              discoveredBills.push(disc);
            }
            billId = disc.id;
          }
        }

        let category = 'Uncategorized';
        if (isOtherCol) category = 'Other';
        else if (isCredit) category = 'Income / Transfer';
        else if (lowerH.includes('power') || lowerH.includes('gas') || lowerH.includes('water') || lowerH.includes('comcast') || lowerH.includes('utility') || lowerH.includes('electric')) category = 'Utilities';
        else if (lowerH.includes('mortgage') || lowerH.includes('hoa') || lowerH.includes('rent')) category = 'Housing';
        else if (lowerH.includes('gym') || lowerH.includes('phone') || lowerH.includes('youtube') || lowerH.includes('cell')) category = 'Subscriptions';
        else if (lowerH.includes('insurance')) category = 'Insurance (Vehicle)';

        transactions.push({
          id: `txn-${Date.now()}-${transactions.length}`,
          date: dateStr,
          description: desc,
          amount: txnAmount,
          accountId: targetAccountId,
          billId,
          category,
          isOther: isOtherCol,
          notes: otherDesc ? otherDesc : `Imported from ${sheetName}`
        });
      }
    });
  }

  logDebug('PARSER', `Parsed sheet "${sheetName}": ${transactions.length} txns, ${Object.keys(importedLedgerRows).length} ledger rows`, {
    targetAccountId,
    headerRowIdx,
    txnCount: transactions.length
  });

  return {
    transactions,
    importedLedgerRows,
    discoveredBills,
    discoveredPeople
  };
}