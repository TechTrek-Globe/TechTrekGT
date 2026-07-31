import * as XLSX from 'xlsx';

/**
 * Clean currency/number values from Excel strings or cells
 */
function cleanNum(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Clean string text
 */
function cleanText(val, defaultVal = '') {
  if (val === undefined || val === null) return defaultVal;
  return String(val).trim().replace(/[\r\n]+/g, ' ');
}

/**
 * Parse an Excel file ArrayBuffer or CSV string into budget state
 */
export function parseSpreadsheet(fileData, fileName = '') {
  try {
    const workbook = typeof fileData === 'string'
      ? XLSX.read(fileData, { type: 'string' })
      : XLSX.read(fileData, { type: 'array' });

    const accountsMap = new Map();
    const peopleMap = new Map();
    const billsList = [];
    const loansList = [];

    // System reserved matrix column names to ignore when extracting bill names
    const reservedCols = new Set([
      'date', 'beg balance', 'regular beg balance', 'extra beg balance', 'total beg balance',
      'regular ending balance', 'extra ending balance', 'extra payment balance', 'ending balance',
      'total balance', 'total end balance', 'day of week', '__empty', '__empty_1', '__empty_2'
    ]);

    // Iterate through all sheet names in workbook
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!rows || rows.length === 0) return;

      const lowerSheet = sheetName.toLowerCase().trim();

      // -------------------------------------------------------------
      // STRATEGY 1: Structured "Accounts" Sheet
      // -------------------------------------------------------------
      if (lowerSheet.includes('account')) {
        const headerRow = rows[0]?.map(c => cleanText(c).toLowerCase()) || [];
        const nameIdx = headerRow.findIndex(h => h.includes('name'));
        const typeIdx = headerRow.findIndex(h => h.includes('type'));
        const balIdx = headerRow.findIndex(h => h.includes('balance') || h.includes('starting'));

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const name = cleanText(r[nameIdx >= 0 ? nameIdx : 0]);
          if (!name) continue;

          const accId = `acc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          accountsMap.set(name.toLowerCase(), {
            id: accId,
            name: name,
            type: cleanText(r[typeIdx >= 0 ? typeIdx : 1], 'checking').toLowerCase().includes('sav') ? 'savings' : 'checking',
            startingBalance: cleanNum(r[balIdx >= 0 ? balIdx : 2], 0),
            extraStartingBalance: 0,
            saveExtraMonthly: 0,
            enableExtraSavings: true,
            color: 'blue'
          });
        }
        return;
      }

      // -------------------------------------------------------------
      // STRATEGY 2: Structured "Bills" Sheet
      // -------------------------------------------------------------
      if (lowerSheet.includes('bill')) {
        const headerRow = rows[0]?.map(c => cleanText(c).toLowerCase()) || [];
        const nameIdx = headerRow.findIndex(h => h.includes('name') || h.includes('bill'));
        const amtIdx = headerRow.findIndex(h => h.includes('amount') || h.includes('cost'));
        const accIdx = headerRow.findIndex(h => h.includes('account'));
        const dueIdx = headerRow.findIndex(h => h.includes('due') || h.includes('day'));

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const name = cleanText(r[nameIdx >= 0 ? nameIdx : 0]);
          if (!name) continue;

          const amount = cleanNum(r[amtIdx >= 0 ? amtIdx : 1], 0);
          const accountName = cleanText(r[accIdx >= 0 ? accIdx : 2]);
          const dueDay = Math.max(1, Math.min(31, Math.round(cleanNum(r[dueIdx >= 0 ? dueIdx : 3], 1))));

          billsList.push({
            id: `bill-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            name,
            amount,
            period: 'Monthly',
            accountId: accountName ? accountName.toLowerCase() : '',
            dueDay,
            paymentSource: accountName || 'Auto Pay',
            notes: '',
            splits: {}
          });
        }
        return;
      }

      // -------------------------------------------------------------
      // STRATEGY 3: Register Sheet (e.g. Mortgage Checking, HOA Savings, Bills Checking)
      // -------------------------------------------------------------
      if (rows.length >= 2 && (rows[0].some(c => cleanText(c).toLowerCase().includes('beg balance')))) {
        const headers = rows[0].map(c => cleanText(c));
        const accName = sheetName.trim();
        const accId = `acc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

        // Row 1 contains initial balances
        const row1 = rows[1] || [];
        let startingBal = 0;
        let extraStartingBal = 0;

        headers.forEach((h, colIdx) => {
          const lowerH = h.toLowerCase().trim();
          if (lowerH.includes('beg balance') && !lowerH.includes('extra') && startingBal === 0) {
            startingBal = cleanNum(row1[colIdx], 0);
          }
          if (lowerH.includes('extra beg balance')) {
            extraStartingBal = cleanNum(row1[colIdx], 0);
          }

          // Extract earners from credit columns
          if (lowerH.includes('credit')) {
            const earnerName = h.replace(/extra/i, '').replace(/credit/i, '').trim();
            if (earnerName && !peopleMap.has(earnerName.toLowerCase())) {
              peopleMap.set(earnerName.toLowerCase(), {
                id: `person-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                name: earnerName,
                role: 'Contributor',
                payFrequency: 'bi-weekly',
                payDay1: 15,
                payDay2: 'last',
                grossPerPay: 2500,
                netPerPay: 2000,
                color: 'blue'
              });
            }
          }

          // Extract bills from expense columns
          if (!reservedCols.has(lowerH) && !lowerH.includes('credit')) {
            const billName = cleanText(h);
            if (billName && billName.length > 1) {
              // Estimate bill amount by checking non-zero cells in column
              let estAmount = 0;
              for (let r = 1; r < rows.length; r++) {
                const cellVal = cleanNum(rows[r][colIdx], 0);
                if (cellVal > 0) {
                  estAmount = cellVal;
                  break;
                }
              }

              billsList.push({
                id: `bill-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                name: billName,
                amount: estAmount,
                period: 'Monthly',
                accountId: accId,
                dueDay: 1,
                paymentSource: accName,
                notes: `Imported from ${sheetName}`,
                splits: {}
              });
            }
          }
        });

        accountsMap.set(accName.toLowerCase(), {
          id: accId,
          name: accName,
          type: accName.toLowerCase().includes('sav') ? 'savings' : 'checking',
          startingBalance: startingBal,
          extraStartingBalance: extraStartingBal,
          saveExtraMonthly: 0,
          enableExtraSavings: extraStartingBal > 0,
          color: 'purple'
        });

        return;
      }

      // -------------------------------------------------------------
      // STRATEGY 4: Loan Amortization Sheet
      // -------------------------------------------------------------
      if (lowerSheet.includes('loan') || lowerSheet.includes('amortization')) {
        let loanName = 'Mortgage Loan';
        let principal = 250000;
        let rate = 6.25;
        let termMonths = 360;

        for (let i = 0; i < rows.length; i++) {
          const rowStr = rows[i].map(c => cleanText(c)).join(' ').toLowerCase();
          if (rowStr.includes('purchase description') || rowStr.includes('loan name')) {
            loanName = cleanText(rows[i][1] || rows[i][2]) || loanName;
          }
          if (rowStr.includes('principal') || rowStr.includes('loan amount')) {
            const foundNum = rows[i].map(c => cleanNum(c)).find(n => n > 1000);
            if (foundNum) principal = foundNum;
          }
          if (rowStr.includes('rate') || rowStr.includes('interest')) {
            const foundRate = rows[i].map(c => cleanNum(c)).find(n => n > 0 && n < 30);
            if (foundRate) rate = foundRate;
          }
          if (rowStr.includes('term') || rowStr.includes('months')) {
            const foundTerm = rows[i].map(c => cleanNum(c)).find(n => n >= 12 && n <= 480);
            if (foundTerm) termMonths = Math.round(foundTerm);
          }
        }

        loansList.push({
          id: `loan-${Date.now()}`,
          name: loanName,
          description: 'Amortization Loan',
          principal,
          annualInterestRate: rate,
          termMonths,
          monthlyPayment: 0,
          extraPayment: 0,
          accountId: '',
          startDate: '2024-01-01'
        });
      }
    });

    // If accountsMap is still empty, add default checking account
    if (accountsMap.size === 0) {
      const defaultAccId = `acc-${Date.now()}`;
      accountsMap.set('primary checking', {
        id: defaultAccId,
        name: 'Primary Checking',
        type: 'checking',
        startingBalance: 0,
        extraStartingBalance: 0,
        saveExtraMonthly: 0,
        enableExtraSavings: false,
        color: 'blue'
      });
    }

    // Resolve bill account ID mappings
    const accountsArray = Array.from(accountsMap.values());
    const peopleArray = Array.from(peopleMap.values());

    billsList.forEach(b => {
      if (typeof b.accountId === 'string' && b.accountId.startsWith('acc-')) return;
      const matchedAcc = accountsArray.find(a => a.name.toLowerCase().includes(b.accountId));
      b.accountId = matchedAcc ? matchedAcc.id : accountsArray[0].id;
    });

    return {
      success: true,
      budget: {
        lineItems: [],
        accounts: accountsArray,
        people: peopleArray,
        bills: billsList,
        loans: loansList
      }
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse spreadsheet: ${err.message}`
    };
  }
}
