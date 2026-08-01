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
  'amount to usaa bill checking - 7071', 'amount to usaa mortgage checking - 3223',
  'amount to usaa hoa savings - 9575', 'usaa bills checking - 7071',
  'usaa mortgage checking - 3223', 'usaa hoa savings - 9575', 'bi-weekly #1', 'bi-weekly #2',
  'bi-weekly #1 - regular pay', 'bi-weekly #2 - income', 'income source',
  'expense/income item', 'current account balances (live)', 'current regular balance',
  'extra balance', 'total current balance', 'next 5 upcoming payments', 'where do i want to put my savings?',
  'income', 'debt payoff', 'other goals', 'amount to usaa bill checking', 'amount to usaa mortgage checking',
  'amount to usaa hoa savings'
]);

/**
 * Parse an Excel file ArrayBuffer or string into clean budget state
 */
export function parseSpreadsheet(fileData, fileName = '') {
  try {
    const workbook = typeof fileData === 'string'
      ? XLSX.read(fileData, { type: 'string', cellFormulas: true })
      : XLSX.read(fileData, { type: 'array', cellFormulas: true });

    const accountsMap = new Map();
    const peopleMap = new Map();
    const billsList = [];
    const loansList = [];
    const lineItemsList = [];

    // Pre-populate Jon Kemp's known earners if detected
    const defaultJonId = 'person-jon';
    const defaultRonnieId = 'person-ronnie';

    // Track accounts by normalized search key
    function getOrCreateAccount(rawName, type = 'checking', balance = 0) {
      const name = cleanText(rawName);
      if (!name) return null;

      const norm = name.toLowerCase();

      // Check existing accounts
      for (const [key, acc] of accountsMap.entries()) {
        if (key.includes(norm) || norm.includes(key)) {
          if (balance > 0 && acc.startingBalance === 0) acc.startingBalance = balance;
          return acc.id;
        }
      }

      const id = `acc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let color = 'blue';
      if (norm.includes('mortgage')) color = 'indigo';
      if (norm.includes('hoa') || norm.includes('sav')) color = 'emerald';
      if (norm.includes('credit') || norm.includes('card')) color = 'purple';

      accountsMap.set(norm, {
        id,
        name,
        type: norm.includes('sav') ? 'savings' : norm.includes('credit') ? 'credit' : type,
        startingBalance: balance,
        extraStartingBalance: 0,
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
        peopleMap.set(key, {
          id: key === 'jon' ? defaultJonId : key === 'ronnie' ? defaultRonnieId : `person-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
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

      // --- SECTION A: Scan for Jon Kemp "Dashboard" or "Main Budget" Layout ---
      if (lowerSheet.includes('budget') || lowerSheet.includes('dashboard') || lowerSheet.includes('main')) {
        let currentAccountName = 'USAA Bills Checking';

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map(c => cleanText(c));
          const rowText = row.join(' ').toLowerCase();

          // Detect Account Header Sections
          if (rowText.includes('bills checking expenses')) currentAccountName = 'USAA Bills Checking - 7071';
          if (rowText.includes('mortgage checking expenses')) currentAccountName = 'USAA Mortgage Checking - 3223';
          if (rowText.includes('hoa savings expenses')) currentAccountName = 'USAA HOA Savings - 9575';

          // Detect Account Balances in Account Summary table
          if (rowText.includes('usaa bills checking') || rowText.includes('bills checking -')) {
            const bal = cleanNum(row.find(cell => cleanNum(cell) > 0));
            getOrCreateAccount('USAA Bills Checking - 7071', 'checking', bal);
          }
          if (rowText.includes('usaa mortgage checking') || rowText.includes('mortgage checking -')) {
            const bal = cleanNum(row.find(cell => cleanNum(cell) > 0));
            getOrCreateAccount('USAA Mortgage Checking - 3223', 'checking', bal);
          }
          if (rowText.includes('usaa hoa savings') || rowText.includes('hoa savings -')) {
            const bal = cleanNum(row.find(cell => cleanNum(cell) > 0));
            getOrCreateAccount('USAA HOA Savings - 9575', 'savings', bal);
          }

          // Detect People/Earners from headers
          if (rowText.includes('jon portion') || rowText.includes('per paycheck allocation (jon)')) addPerson('Jon', 'Primary', 0, 0, 'purple');
          if (rowText.includes('ronnie portion')) addPerson('Ronnie', 'Partner', 0, 0, 'emerald');

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
            const amount = cleanNum(row[3] || row[2] || row[4], 0);
            const periodStr = rowText.includes('semi-annual') ? 'Semi-Annual' : rowText.includes('annual') ? 'Annual' : rowText.includes('weekly') ? 'Weekly' : 'Monthly';

            // Find due day or date if present
            let dueDay = 15;
            const dayCell = row.find(c => /^\d{1,2}(st|nd|rd|th)?$/i.test(c));
            if (dayCell) dueDay = parseInt(dayCell) || 15;

            // Target Account
            const accCell = row.find(c => c.toLowerCase().includes('usaa') || c.toLowerCase().includes('checking') || c.toLowerCase().includes('savings'));
            const targetAccName = accCell || currentAccountName;
            const accountId = getOrCreateAccount(targetAccName);

            // Payment Source & Notes
            const paymentSource = row[8] || row[7] || row[9] || 'Auto Pay';
            const notes = row[9] || row[10] || '';

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
                notes,
                splits: {
                  [defaultJonId]: 50,
                  [defaultRonnieId]: 50
                }
              });
            }
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

    // Ensure default earners exist if none parsed
    if (peopleMap.size === 0) {
      addPerson('Jon', 'Primary', 3000, 2200, 'purple');
      addPerson('Ronnie', 'Partner', 3000, 2200, 'emerald');
    }

    // Ensure accounts exist if none parsed
    if (accountsMap.size === 0) {
      getOrCreateAccount('USAA Bills Checking - 7071', 'checking', 257.50);
      getOrCreateAccount('USAA Mortgage Checking - 3223', 'checking', 200.00);
      getOrCreateAccount('USAA HOA Savings - 9575', 'savings', 0.00);
    }

    const accounts = Array.from(accountsMap.values());
    const people = Array.from(peopleMap.values());

    return {
      success: true,
      budget: {
        accounts,
        people,
        bills: billsList,
        lineItems: lineItemsList,
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
