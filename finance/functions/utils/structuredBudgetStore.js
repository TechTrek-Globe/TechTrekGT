// Structured Relational D1 Storage Engine for Finance OS (finance-os-db)
// Security Mandate: All runtime SQL queries MUST use positional '?' bindings (FIN-AUDIT-001).

const initializedDbInstances = new WeakSet();

const STRUCTURED_TABLES_DDL = [
  `CREATE TABLE IF NOT EXISTS finance_ledger_settings (
    ledger_id TEXT PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    theme TEXT NOT NULL DEFAULT 'dark',
    hide_dashboard_header INTEGER NOT NULL DEFAULT 0,
    dashboard_widgets_json TEXT NOT NULL DEFAULT '[]',
    custom_categories_json TEXT NOT NULL DEFAULT '[]',
    saved_filter_views_json TEXT NOT NULL DEFAULT '[]',
    spending_limits_json TEXT NOT NULL DEFAULT '{}',
    savings_targets_json TEXT NOT NULL DEFAULT '{}',
    archived_years_json TEXT NOT NULL DEFAULT '{}',
    audit_log_json TEXT NOT NULL DEFAULT '[]',
    extra_meta_json TEXT NOT NULL DEFAULT '{}',
    data_byte_length INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at_ms INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS finance_accounts (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'checking',
    save_extra_monthly REAL NOT NULL DEFAULT 0.0,
    enable_extra_savings INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT 'blue',
    notes TEXT DEFAULT '',
    starting_balance REAL DEFAULT 0.0,
    extra_starting_balance REAL DEFAULT 0.0,
    balance_as_of_date TEXT,
    start_date TEXT,
    ledger_mode TEXT DEFAULT 'auto',
    is_archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_people (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Primary',
    pay_frequency TEXT NOT NULL DEFAULT 'semi-monthly',
    pay_day1 TEXT NOT NULL DEFAULT '15',
    pay_day2 TEXT DEFAULT 'last',
    pay_offset_days INTEGER NOT NULL DEFAULT 0,
    account_allocations TEXT NOT NULL DEFAULT '{}',
    gross_per_pay REAL NOT NULL DEFAULT 0.0,
    net_per_pay REAL NOT NULL DEFAULT 0.0,
    color TEXT NOT NULL DEFAULT 'purple',
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_bills (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0.0,
    period TEXT NOT NULL DEFAULT 'Monthly',
    due_day INTEGER NOT NULL DEFAULT 1,
    due_months TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12]',
    payment_source TEXT NOT NULL DEFAULT 'Auto Pay',
    category TEXT DEFAULT 'Uncategorized',
    splits_json TEXT NOT NULL DEFAULT '{}',
    bank_match_names TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    matching_key TEXT DEFAULT '',
    is_archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_transactions (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    account_id TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0.0,
    type TEXT NOT NULL DEFAULT 'expense',
    category TEXT DEFAULT 'Uncategorized',
    status TEXT DEFAULT 'cleared',
    matched_bill_id TEXT,
    person_id TEXT,
    is_other INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_line_items (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    bill_id TEXT NOT NULL DEFAULT '',
    month_key TEXT NOT NULL DEFAULT '',
    actual_amount REAL,
    is_paid INTEGER NOT NULL DEFAULT 0,
    paid_date TEXT,
    notes TEXT DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_funding_goals (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    account_id TEXT DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    target_amount REAL NOT NULL DEFAULT 0.0,
    current_amount REAL NOT NULL DEFAULT 0.0,
    monthly_contribution REAL NOT NULL DEFAULT 0.0,
    target_date TEXT,
    color TEXT DEFAULT 'emerald',
    icon TEXT DEFAULT 'Target',
    contributor_id TEXT,
    frequency TEXT DEFAULT 'monthly',
    amount_per_pay REAL DEFAULT 0.0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_loans (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'New Loan',
    description TEXT DEFAULT '',
    principal REAL NOT NULL DEFAULT 0.0,
    annual_interest_rate REAL NOT NULL DEFAULT 0.0,
    term_months INTEGER NOT NULL DEFAULT 0,
    monthly_payment REAL NOT NULL DEFAULT 0.0,
    extra_payment REAL NOT NULL DEFAULT 0.0,
    start_date TEXT NOT NULL DEFAULT '',
    is_archived INTEGER NOT NULL DEFAULT 0,
    interest_compounding TEXT NOT NULL DEFAULT 'monthly',
    payment_frequency TEXT NOT NULL DEFAULT 'monthly',
    payment_type TEXT NOT NULL DEFAULT 'amortizing',
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_daily_matrix (
    ledger_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    month_key TEXT NOT NULL,
    day_num INTEGER NOT NULL,
    field_key TEXT NOT NULL,
    num_value REAL,
    str_value TEXT,
    PRIMARY KEY (ledger_id, account_id, month_key, day_num, field_key)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_account_statement_rows (
    ledger_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    reg_beg REAL,
    extra_beg REAL,
    total_beg REAL,
    reg_end REAL,
    extra_end REAL,
    total_end REAL,
    bank_balance REAL,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, account_id, date_key)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_bill_splits (
    ledger_id TEXT NOT NULL,
    bill_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    percentage REAL NOT NULL DEFAULT 0.0,
    PRIMARY KEY (ledger_id, bill_id, person_id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_person_allocations (
    ledger_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    allocation_value REAL NOT NULL DEFAULT 0.0,
    PRIMARY KEY (ledger_id, person_id, account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_account_splits (
    ledger_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    split_type TEXT NOT NULL CHECK(split_type IN ('save_extra', 'overflow')),
    person_id TEXT NOT NULL,
    percentage REAL NOT NULL DEFAULT 0.0,
    PRIMARY KEY (ledger_id, account_id, split_type, person_id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_dashboard_widgets (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    category TEXT DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 1,
    width TEXT DEFAULT 'full',
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS finance_categories (
    ledger_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    extra_json TEXT DEFAULT '{}',
    PRIMARY KEY (ledger_id, id)
  )`
];

export async function ensureStructuredFinanceTables(db) {
  if (!db || typeof db.prepare !== 'function') return;
  if (initializedDbInstances.has(db)) return;
  try {
    const stmts = STRUCTURED_TABLES_DDL.map((ddl) => db.prepare(ddl));
    await db.batch(stmts);
    initializedDbInstances.add(db);
  } catch {
    // Allow fallback if mock D1 does not support DDL batching
  }
}

function parseJsonSafe(str, fallback) {
  if (!str || typeof str !== 'string') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function parseMatrixCompositeKey(rawKey) {
  const parts = String(rawKey).split('-');
  if (parts.length >= 5) {
    const fieldKey = parts.pop();
    const dayNum = Number(parts.pop()) || 0;
    const monthPart = parts.pop();
    const yearPart = parts.pop();
    const accountId = parts.join('-');
    return {
      accountId,
      monthKey: `${yearPart}-${monthPart}`,
      dayNum,
      fieldKey
    };
  }
  return {
    accountId: 'default',
    monthKey: '0000-00',
    dayNum: 0,
    fieldKey: String(rawKey)
  };
}

const STMT_ROW_KNOWN_KEYS = new Set([
  'regBeg', 'extraBeg', 'totalBeg', 'regEnd', 'extraEnd', 'totalEnd', 'bankBalance',
  'reg_beg', 'extra_beg', 'total_beg', 'reg_end', 'extra_end', 'total_end', 'bank_balance'
]);

const ACCOUNT_KNOWN_KEYS = new Set([
  'id', 'name', 'type', 'saveExtraMonthly', 'enableExtraSavings', 'color', 'notes',
  'startingBalance', 'extraStartingBalance', 'balanceAsOfDate', 'startDate', 'ledgerMode', 'isArchived',
  'importedLedgerRows', 'saveExtraSplits', 'overflowSplits', 'sortOrder'
]);

const PEOPLE_KNOWN_KEYS = new Set([
  'id', 'name', 'role', 'payFrequency', 'payDay1', 'payDay2', 'payOffsetDays',
  'accountAllocations', 'grossPerPay', 'netPerPay', 'color', 'sortOrder'
]);

const BILL_KNOWN_KEYS = new Set([
  'id', 'accountId', 'name', 'amount', 'period', 'dueDay', 'months', 'dueMonths',
  'paymentSource', 'category', 'splits', 'bankMatchNames', 'notes', 'matchingKey', 'isArchived', 'sortOrder'
]);

const TX_KNOWN_KEYS = new Set([
  'id', 'accountId', 'date', 'description', 'amount', 'type', 'category',
  'status', 'matchedBillId', 'billId', 'personId', 'isOther', 'notes', 'sortOrder'
]);

const LINE_ITEM_KNOWN_KEYS = new Set([
  'id', 'billId', 'monthKey', 'actualAmount', 'isPaid', 'paidDate', 'notes', 'updatedAt', 'sortOrder'
]);

const GOAL_KNOWN_KEYS = new Set([
  'id', 'accountId', 'name', 'targetAmount', 'amount', 'currentAmount',
  'monthlyContribution', 'amountPerPay', 'targetDate', 'color', 'icon',
  'contributorId', 'personId', 'frequency', 'sortOrder'
]);

const LOAN_KNOWN_KEYS = new Set([
  'id', 'name', 'description', 'principal', 'annualInterestRate', 'termMonths',
  'monthlyPayment', 'extraPayment', 'startDate', 'isArchived', 'interestCompounding',
  'paymentFrequency', 'paymentType', 'sortOrder'
]);

const WIDGET_KNOWN_KEYS = new Set([
  'id', 'title', 'description', 'category', 'visible', 'width', 'sortOrder'
]);

const CATEGORY_KNOWN_KEYS = new Set([
  'id', 'name', 'sortOrder'
]);

function extractUnknownFields(item, knownKeys) {
  if (!item || typeof item !== 'object') return '{}';
  const unknown = {};
  for (const [k, v] of Object.entries(item)) {
    if (!knownKeys.has(k) && v !== undefined) {
      unknown[k] = v;
    }
  }
  unknown._p = Object.keys(item);
  return JSON.stringify(unknown);
}

/**
 * Builds an array of D1 prepared statements using strict positional '?' bindings (FIN-AUDIT-001)
 * to atomically persist the Finance OS budget state across structured relational tables.
 */
export function buildStructuredWriteStatements(db, ledgerId, payload, dataByteLength, nowMs) {
  const stmts = [];
  const safePayload = payload && typeof payload === 'object' ? payload : {};

  const TOP_KNOWN_KEYS = new Set([
    'accounts',
    'people',
    'bills',
    'transactions',
    'lineItems',
    'fundingGoals',
    'loans',
    'dailyMatrix',
    'theme',
    'hideDashboardHeader',
    'dashboardWidgets',
    'categories'
  ]);

  const extraMeta = {};
  for (const [k, v] of Object.entries(safePayload)) {
    if (!TOP_KNOWN_KEYS.has(k)) {
      extraMeta[k] = v;
    }
  }
  // Store presence flags so we only emit keys that were present in the original payload
  const presentKeys = Object.keys(safePayload);
  extraMeta.__presentKeys = presentKeys;

  const theme = typeof safePayload.theme === 'string' ? safePayload.theme : 'dark';
  const hideDashboardHeader = safePayload.hideDashboardHeader ? 1 : 0;
  const dashboardWidgetsJson = JSON.stringify(safePayload.dashboardWidgets ?? []);
  const categoriesJson = JSON.stringify(safePayload.categories ?? []);
  const extraMetaJson = JSON.stringify(extraMeta);

  // 1. Upsert finance_ledger_settings
  stmts.push(
    db.prepare(
      `INSERT INTO finance_ledger_settings (
        ledger_id, version, theme, hide_dashboard_header,
        dashboard_widgets_json, custom_categories_json, extra_meta_json,
        data_byte_length, updated_at, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(ledger_id) DO UPDATE SET
        version = excluded.version,
        theme = excluded.theme,
        hide_dashboard_header = excluded.hide_dashboard_header,
        dashboard_widgets_json = excluded.dashboard_widgets_json,
        custom_categories_json = excluded.custom_categories_json,
        extra_meta_json = excluded.extra_meta_json,
        data_byte_length = excluded.data_byte_length,
        updated_at = excluded.updated_at,
        updated_at_ms = excluded.updated_at_ms`
    ).bind(
      ledgerId,
      Number(safePayload.schemaVersion) || 1,
      theme,
      hideDashboardHeader,
      dashboardWidgetsJson,
      categoriesJson,
      extraMetaJson,
      Number(dataByteLength) || 0,
      Number(nowMs) || Date.now()
    )
  );

  // 2. Replace accounts & normalized statement rows & splits
  stmts.push(db.prepare('DELETE FROM finance_accounts WHERE ledger_id = ?').bind(ledgerId));
  stmts.push(db.prepare('DELETE FROM finance_account_statement_rows WHERE ledger_id = ?').bind(ledgerId));
  stmts.push(db.prepare('DELETE FROM finance_account_splits WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.accounts)) {
    for (let i = 0; i < safePayload.accounts.length; i++) {
      const acc = safePayload.accounts[i];
      if (!acc || typeof acc !== 'object') continue;
      const id = acc.id !== undefined && acc.id !== null ? String(acc.id) : `acc_${i}`;
      const name = typeof acc.name === 'string' ? acc.name : '';
      const type = typeof acc.type === 'string' ? acc.type : 'checking';
      const saveExtraMonthly = typeof acc.saveExtraMonthly === 'number' ? acc.saveExtraMonthly : 0;
      const enableExtraSavings = acc.enableExtraSavings === false ? 0 : 1;
      const color = typeof acc.color === 'string' ? acc.color : 'blue';
      const notes = typeof acc.notes === 'string' ? acc.notes : '';
      const startingBalance = typeof acc.startingBalance === 'number' ? acc.startingBalance : 0.0;
      const extraStartingBalance = typeof acc.extraStartingBalance === 'number' ? acc.extraStartingBalance : 0.0;
      const balanceAsOfDate = typeof acc.balanceAsOfDate === 'string' ? acc.balanceAsOfDate : null;
      const startDate = typeof acc.startDate === 'string' ? acc.startDate : null;
      const ledgerMode = typeof acc.ledgerMode === 'string' ? acc.ledgerMode : 'auto';
      const isArchived = acc.isArchived ? 1 : 0;
      const extraJson = extractUnknownFields(acc, ACCOUNT_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_accounts (
            ledger_id, id, name, type, save_extra_monthly, enable_extra_savings, color, notes,
            starting_balance, extra_starting_balance, balance_as_of_date, start_date, ledger_mode,
            is_archived, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          ledgerId, id, name, type, saveExtraMonthly, enableExtraSavings, color, notes,
          startingBalance, extraStartingBalance, balanceAsOfDate, startDate, ledgerMode,
          isArchived, i, extraJson
        )
      );

      // Statement rows decomposition
      if (acc.importedLedgerRows && typeof acc.importedLedgerRows === 'object') {
        for (const [dateKey, row] of Object.entries(acc.importedLedgerRows)) {
          if (!row || typeof row !== 'object') continue;
          const regBeg = typeof row.regBeg === 'number' ? row.regBeg : (typeof row.reg_beg === 'number' ? row.reg_beg : null);
          const extraBeg = typeof row.extraBeg === 'number' ? row.extraBeg : (typeof row.extra_beg === 'number' ? row.extra_beg : null);
          const totalBeg = typeof row.totalBeg === 'number' ? row.totalBeg : (typeof row.total_beg === 'number' ? row.total_beg : null);
          const regEnd = typeof row.regEnd === 'number' ? row.regEnd : (typeof row.reg_end === 'number' ? row.reg_end : null);
          const extraEnd = typeof row.extraEnd === 'number' ? row.extraEnd : (typeof row.extra_end === 'number' ? row.extra_end : null);
          const totalEnd = typeof row.totalEnd === 'number' ? row.totalEnd : (typeof row.total_end === 'number' ? row.total_end : null);
          const bankBalance = typeof row.bankBalance === 'number' ? row.bankBalance : (typeof row.bank_balance === 'number' ? row.bank_balance : null);
          const rowExtra = extractUnknownFields(row, STMT_ROW_KNOWN_KEYS);
          stmts.push(
            db.prepare(
              `INSERT INTO finance_account_statement_rows (
                ledger_id, account_id, date_key, reg_beg, extra_beg, total_beg, reg_end, extra_end, total_end, bank_balance, extra_json
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(ledgerId, id, dateKey, regBeg, extraBeg, totalBeg, regEnd, extraEnd, totalEnd, bankBalance, rowExtra)
          );
        }
      }

      // Savings & overflow splits decomposition
      if (acc.saveExtraSplits && typeof acc.saveExtraSplits === 'object') {
        for (const [personId, pct] of Object.entries(acc.saveExtraSplits)) {
          stmts.push(
            db.prepare(
              `INSERT INTO finance_account_splits (
                ledger_id, account_id, split_type, person_id, percentage
              ) VALUES (?, ?, 'save_extra', ?, ?)`
            ).bind(ledgerId, id, personId, Number(pct) || 0)
          );
        }
      }
      if (acc.overflowSplits && typeof acc.overflowSplits === 'object') {
        for (const [personId, pct] of Object.entries(acc.overflowSplits)) {
          stmts.push(
            db.prepare(
              `INSERT INTO finance_account_splits (
                ledger_id, account_id, split_type, person_id, percentage
              ) VALUES (?, ?, 'overflow', ?, ?)`
            ).bind(ledgerId, id, personId, Number(pct) || 0)
          );
        }
      }
    }
  }

  // 3. Replace people & normalized person allocations
  stmts.push(db.prepare('DELETE FROM finance_people WHERE ledger_id = ?').bind(ledgerId));
  stmts.push(db.prepare('DELETE FROM finance_person_allocations WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.people)) {
    for (let i = 0; i < safePayload.people.length; i++) {
      const p = safePayload.people[i];
      if (!p || typeof p !== 'object') continue;
      const id = p.id !== undefined && p.id !== null ? String(p.id) : `person_${i}`;
      const name = typeof p.name === 'string' ? p.name : '';
      const role = typeof p.role === 'string' ? p.role : 'Primary';
      const payFrequency = typeof p.payFrequency === 'string' ? p.payFrequency : 'semi-monthly';
      const payDay1 = p.payDay1 !== undefined && p.payDay1 !== null ? String(p.payDay1) : '15';
      const payDay2 = p.payDay2 !== undefined && p.payDay2 !== null ? String(p.payDay2) : 'last';
      const payOffsetDays = typeof p.payOffsetDays === 'number' ? p.payOffsetDays : 0;
      const accountAllocations = JSON.stringify(p.accountAllocations ?? {});
      const grossPerPay = typeof p.grossPerPay === 'number' ? p.grossPerPay : 0;
      const netPerPay = typeof p.netPerPay === 'number' ? p.netPerPay : 0;
      const color = typeof p.color === 'string' ? p.color : 'purple';
      const extraJson = extractUnknownFields(p, PEOPLE_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_people (
            ledger_id, id, name, role, pay_frequency, pay_day1, pay_day2, pay_offset_days,
            account_allocations, gross_per_pay, net_per_pay, color, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          ledgerId, id, name, role, payFrequency, payDay1, payDay2, payOffsetDays,
          accountAllocations, grossPerPay, netPerPay, color, i, extraJson
        )
      );

      if (p.accountAllocations && typeof p.accountAllocations === 'object') {
        for (const [accountId, allocVal] of Object.entries(p.accountAllocations)) {
          stmts.push(
            db.prepare(
              `INSERT INTO finance_person_allocations (
                ledger_id, person_id, account_id, allocation_value
              ) VALUES (?, ?, ?, ?)`
            ).bind(ledgerId, id, accountId, Number(allocVal) || 0)
          );
        }
      }
    }
  }

  // 4. Replace bills & normalized bill splits
  stmts.push(db.prepare('DELETE FROM finance_bills WHERE ledger_id = ?').bind(ledgerId));
  stmts.push(db.prepare('DELETE FROM finance_bill_splits WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.bills)) {
    for (let i = 0; i < safePayload.bills.length; i++) {
      const b = safePayload.bills[i];
      if (!b || typeof b !== 'object') continue;
      const id = b.id !== undefined && b.id !== null ? String(b.id) : `bill_${i}`;
      const accountId = b.accountId !== undefined && b.accountId !== null ? String(b.accountId) : '';
      const name = typeof b.name === 'string' ? b.name : '';
      const amount = typeof b.amount === 'number' ? b.amount : 0;
      const period = typeof b.period === 'string' ? b.period : 'Monthly';
      const dueDay = Number(b.dueDay) || 1;
      const dueMonths = JSON.stringify(b.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      const paymentSource = typeof b.paymentSource === 'string' ? b.paymentSource : 'Auto Pay';
      const category = typeof b.category === 'string' ? b.category : 'Uncategorized';
      const splitsJson = JSON.stringify(b.splits ?? {});
      const bankMatchNames = JSON.stringify(b.bankMatchNames ?? []);
      const notes = typeof b.notes === 'string' ? b.notes : '';
      const matchingKey = typeof b.matchingKey === 'string' ? b.matchingKey : '';
      const isArchived = b.isArchived ? 1 : 0;
      const extraJson = extractUnknownFields(b, BILL_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_bills (
            ledger_id, id, account_id, name, amount, period, due_day, due_months,
            payment_source, category, splits_json, bank_match_names, notes, matching_key, is_archived, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          ledgerId, id, accountId, name, amount, period, dueDay, dueMonths,
          paymentSource, category, splitsJson, bankMatchNames, notes, matchingKey, isArchived, i, extraJson
        )
      );

      if (b.splits && typeof b.splits === 'object') {
        for (const [personId, pct] of Object.entries(b.splits)) {
          stmts.push(
            db.prepare(
              `INSERT INTO finance_bill_splits (
                ledger_id, bill_id, person_id, percentage
              ) VALUES (?, ?, ?, ?)`
            ).bind(ledgerId, id, personId, Number(pct) || 0)
          );
        }
      }
    }
  }

  // 5. Replace transactions
  stmts.push(db.prepare('DELETE FROM finance_transactions WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.transactions)) {
    for (let i = 0; i < safePayload.transactions.length; i++) {
      const tx = safePayload.transactions[i];
      if (!tx || typeof tx !== 'object') continue;
      const id = tx.id !== undefined && tx.id !== null ? String(tx.id) : `tx_${i}`;
      const accountId = tx.accountId !== undefined && tx.accountId !== null ? String(tx.accountId) : '';
      const date = typeof tx.date === 'string' ? tx.date : '';
      const description = typeof tx.description === 'string' ? tx.description : '';
      const amount = typeof tx.amount === 'number' ? tx.amount : 0;
      const type = typeof tx.type === 'string' ? tx.type : 'expense';
      const category = typeof tx.category === 'string' ? tx.category : 'Uncategorized';
      const status = typeof tx.status === 'string' ? tx.status : 'cleared';
      const matchedBillId = tx.billId !== undefined && tx.billId !== null ? String(tx.billId) : (tx.matchedBillId !== undefined && tx.matchedBillId !== null ? String(tx.matchedBillId) : null);
      const personId = tx.personId !== undefined && tx.personId !== null ? String(tx.personId) : null;
      const isOther = tx.isOther ? 1 : 0;
      const notes = typeof tx.notes === 'string' ? tx.notes : '';
      const extraJson = extractUnknownFields(tx, TX_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_transactions (
            ledger_id, id, account_id, date, description, amount, type, category,
            status, matched_bill_id, person_id, is_other, notes, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          ledgerId, id, accountId, date, description, amount, type, category,
          status, matchedBillId, personId, isOther, notes, i, extraJson
        )
      );
    }
  }

  // 6. Replace lineItems
  stmts.push(db.prepare('DELETE FROM finance_line_items WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.lineItems)) {
    for (let i = 0; i < safePayload.lineItems.length; i++) {
      const li = safePayload.lineItems[i];
      if (!li || typeof li !== 'object') continue;
      const billId = li.billId !== undefined && li.billId !== null ? String(li.billId) : '';
      const monthKey = typeof li.monthKey === 'string' ? li.monthKey : '';
      const id = li.id !== undefined && li.id !== null ? String(li.id) : `${billId}_${monthKey}_${i}`;
      const actualAmount = typeof li.actualAmount === 'number' ? li.actualAmount : null;
      const isPaid = li.isPaid ? 1 : 0;
      const paidDate = typeof li.paidDate === 'string' ? li.paidDate : null;
      const notes = typeof li.notes === 'string' ? li.notes : '';
      const updatedAt = Number(li.updatedAt) || 0;
      const extraJson = extractUnknownFields(li, LINE_ITEM_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_line_items (
            ledger_id, id, bill_id, month_key, actual_amount, is_paid, paid_date, notes, updated_at, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(ledgerId, id, billId, monthKey, actualAmount, isPaid, paidDate, notes, updatedAt, i, extraJson)
      );
    }
  }

  // 7. Replace fundingGoals
  stmts.push(db.prepare('DELETE FROM finance_funding_goals WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.fundingGoals)) {
    for (let i = 0; i < safePayload.fundingGoals.length; i++) {
      const fg = safePayload.fundingGoals[i];
      if (!fg || typeof fg !== 'object') continue;
      const id = fg.id !== undefined && fg.id !== null ? String(fg.id) : `goal_${i}`;
      const accountId = fg.accountId !== undefined && fg.accountId !== null ? String(fg.accountId) : '';
      const name = typeof fg.name === 'string' ? fg.name : '';
      const targetAmount = typeof fg.targetAmount === 'number' ? fg.targetAmount : (typeof fg.amount === 'number' ? fg.amount : 0);
      const currentAmount = typeof fg.currentAmount === 'number' ? fg.currentAmount : 0;
      const monthlyContribution = typeof fg.monthlyContribution === 'number' ? fg.monthlyContribution : (typeof fg.amountPerPay === 'number' ? fg.amountPerPay : 0);
      const targetDate = typeof fg.targetDate === 'string' ? fg.targetDate : null;
      const color = typeof fg.color === 'string' ? fg.color : 'emerald';
      const icon = typeof fg.icon === 'string' ? fg.icon : 'Target';
      const contributorId = fg.contributorId !== undefined && fg.contributorId !== null ? String(fg.contributorId) : (fg.personId !== undefined && fg.personId !== null ? String(fg.personId) : null);
      const frequency = typeof fg.frequency === 'string' ? fg.frequency : 'monthly';
      const amountPerPay = typeof fg.amountPerPay === 'number' ? fg.amountPerPay : 0.0;
      const extraJson = extractUnknownFields(fg, GOAL_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_funding_goals (
            ledger_id, id, account_id, name, target_amount, current_amount,
            monthly_contribution, target_date, color, icon, contributor_id, frequency, amount_per_pay, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          ledgerId, id, accountId, name, targetAmount, currentAmount,
          monthlyContribution, targetDate, color, icon, contributorId, frequency, amountPerPay, i, extraJson
        )
      );
    }
  }

  // 8. Replace loans
  stmts.push(db.prepare('DELETE FROM finance_loans WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.loans)) {
    for (let i = 0; i < safePayload.loans.length; i++) {
      const ln = safePayload.loans[i];
      if (!ln || typeof ln !== 'object') continue;
      const id = ln.id !== undefined && ln.id !== null ? String(ln.id) : `loan_${i}`;
      const name = typeof ln.name === 'string' ? ln.name : 'New Loan';
      const description = typeof ln.description === 'string' ? ln.description : '';
      const principal = typeof ln.principal === 'number' ? ln.principal : 0;
      const annualInterestRate = typeof ln.annualInterestRate === 'number' ? ln.annualInterestRate : 0;
      const termMonths = typeof ln.termMonths === 'number' ? ln.termMonths : 0;
      const monthlyPayment = typeof ln.monthlyPayment === 'number' ? ln.monthlyPayment : 0;
      const extraPayment = typeof ln.extraPayment === 'number' ? ln.extraPayment : 0;
      const startDate = typeof ln.startDate === 'string' ? ln.startDate : '';
      const isArchived = ln.isArchived ? 1 : 0;
      const extraJson = extractUnknownFields(ln, LOAN_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_loans (
            ledger_id, id, name, description, principal, annual_interest_rate,
            term_months, monthly_payment, extra_payment, start_date, is_archived, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          ledgerId, id, name, description, principal, annualInterestRate,
          termMonths, monthlyPayment, extraPayment, startDate, isArchived, i, extraJson
        )
      );
    }
  }

  // 9. Replace dailyMatrix
  stmts.push(db.prepare('DELETE FROM finance_daily_matrix WHERE ledger_id = ?').bind(ledgerId));
  if (safePayload.dailyMatrix && typeof safePayload.dailyMatrix === 'object') {
    for (const [rawKey, val] of Object.entries(safePayload.dailyMatrix)) {
      const { accountId, monthKey, dayNum } = parseMatrixCompositeKey(rawKey);
      const isStr = typeof val === 'string';
      const numVal = typeof val === 'number' && Number.isFinite(val) ? val : null;
      // Encode rawKey inside str_value if composite key was non-standard or preserve rawKey mapping
      const strVal = isStr ? val : (val === null ? '__NULL__' : null);
      // Store rawKey as field_key so round-trip reconstruction is 100% lossless
      stmts.push(
        db.prepare(
          `INSERT INTO finance_daily_matrix (
            ledger_id, account_id, month_key, day_num, field_key, num_value, str_value
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(ledgerId, accountId, monthKey, dayNum, rawKey, numVal, strVal)
      );
    }
  }

  // 10. Replace dashboard widgets
  stmts.push(db.prepare('DELETE FROM finance_dashboard_widgets WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.dashboardWidgets)) {
    for (let i = 0; i < safePayload.dashboardWidgets.length; i++) {
      const w = safePayload.dashboardWidgets[i];
      if (!w || typeof w !== 'object') continue;
      const id = w.id !== undefined && w.id !== null ? String(w.id) : `widget_${i}`;
      const title = typeof w.title === 'string' ? w.title : '';
      const description = typeof w.description === 'string' ? w.description : '';
      const category = typeof w.category === 'string' ? w.category : '';
      const visible = w.visible === false ? 0 : 1;
      const width = typeof w.width === 'string' ? w.width : 'full';
      const extraJson = extractUnknownFields(w, WIDGET_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_dashboard_widgets (
            ledger_id, id, title, description, category, visible, width, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(ledgerId, id, title, description, category, visible, width, i, extraJson)
      );
    }
  }

  // 11. Replace categories
  stmts.push(db.prepare('DELETE FROM finance_categories WHERE ledger_id = ?').bind(ledgerId));
  if (Array.isArray(safePayload.categories)) {
    for (let i = 0; i < safePayload.categories.length; i++) {
      const c = safePayload.categories[i];
      if (!c || typeof c !== 'object') continue;
      const id = c.id !== undefined && c.id !== null ? String(c.id) : `cat_${i}`;
      const name = typeof c.name === 'string' ? c.name : '';
      const extraJson = extractUnknownFields(c, CATEGORY_KNOWN_KEYS);
      stmts.push(
        db.prepare(
          `INSERT INTO finance_categories (
            ledger_id, id, name, sort_order, extra_json
          ) VALUES (?, ?, ?, ?, ?)`
        ).bind(ledgerId, id, name, i, extraJson)
      );
    }
  }

  return stmts;
}

/**
 * Reconstructs the complete Finance OS budget state from structured D1 relational tables
 * using positional '?' parameter binding (FIN-AUDIT-001). Falls back to parsing fallbackJsonStr
 * if structured rows have not yet been populated (e.g., direct raw SQL test fixtures).
 */
export async function readStructuredBudget(db, ledgerId, fallbackJsonStr = null) {
  await ensureStructuredFinanceTables(db);

  try {
    const settingsRow = await db.prepare(
      'SELECT * FROM finance_ledger_settings WHERE ledger_id = ?'
    ).bind(ledgerId).first();

    if (settingsRow) {
      const [
        accountsRes,
        peopleRes,
        billsRes,
        txRes,
        lineItemsRes,
        goalsRes,
        loansRes,
        matrixRes,
        stmtRowsRes,
        billSplitsRes,
        personAllocRes,
        acctSplitsRes,
        widgetsRes,
        categoriesRes
      ] = await Promise.all([
        db.prepare('SELECT * FROM finance_accounts WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_people WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_bills WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_transactions WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_line_items WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_funding_goals WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_loans WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_daily_matrix WHERE ledger_id = ?').bind(ledgerId).all(),
        db.prepare('SELECT * FROM finance_account_statement_rows WHERE ledger_id = ?').bind(ledgerId).all().catch(() => ({ results: [] })),
        db.prepare('SELECT * FROM finance_bill_splits WHERE ledger_id = ?').bind(ledgerId).all().catch(() => ({ results: [] })),
        db.prepare('SELECT * FROM finance_person_allocations WHERE ledger_id = ?').bind(ledgerId).all().catch(() => ({ results: [] })),
        db.prepare('SELECT * FROM finance_account_splits WHERE ledger_id = ?').bind(ledgerId).all().catch(() => ({ results: [] })),
        db.prepare('SELECT * FROM finance_dashboard_widgets WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all().catch(() => ({ results: [] })),
        db.prepare('SELECT * FROM finance_categories WHERE ledger_id = ? ORDER BY sort_order ASC').bind(ledgerId).all().catch(() => ({ results: [] }))
      ]);

      const stmtRowsByAcct = {};
      for (const r of stmtRowsRes?.results || []) {
        if (!stmtRowsByAcct[r.account_id]) {
          stmtRowsByAcct[r.account_id] = {};
        }
        const extra = parseJsonSafe(r.extra_json, {});
        stmtRowsByAcct[r.account_id][r.date_key] = {
          ...extra,
          regBeg: r.reg_beg !== null && r.reg_beg !== undefined ? Number(r.reg_beg) : null,
          extraBeg: r.extra_beg !== null && r.extra_beg !== undefined ? Number(r.extra_beg) : null,
          totalBeg: r.total_beg !== null && r.total_beg !== undefined ? Number(r.total_beg) : null,
          regEnd: r.reg_end !== null && r.reg_end !== undefined ? Number(r.reg_end) : null,
          extraEnd: r.extra_end !== null && r.extra_end !== undefined ? Number(r.extra_end) : null,
          totalEnd: r.total_end !== null && r.total_end !== undefined ? Number(r.total_end) : null,
          bankBalance: r.bank_balance !== null && r.bank_balance !== undefined ? Number(r.bank_balance) : null
        };
      }

      const saveExtraByAcct = {};
      const overflowByAcct = {};
      for (const r of acctSplitsRes?.results || []) {
        if (r.split_type === 'save_extra') {
          if (!saveExtraByAcct[r.account_id]) saveExtraByAcct[r.account_id] = {};
          saveExtraByAcct[r.account_id][r.person_id] = Number(r.percentage);
        } else if (r.split_type === 'overflow') {
          if (!overflowByAcct[r.account_id]) overflowByAcct[r.account_id] = {};
          overflowByAcct[r.account_id][r.person_id] = Number(r.percentage);
        }
      }

      const splitsByBill = {};
      for (const r of billSplitsRes?.results || []) {
        if (!splitsByBill[r.bill_id]) splitsByBill[r.bill_id] = {};
        splitsByBill[r.bill_id][r.person_id] = Number(r.percentage);
      }

      const allocByPerson = {};
      for (const r of personAllocRes?.results || []) {
        if (!allocByPerson[r.person_id]) allocByPerson[r.person_id] = {};
        allocByPerson[r.person_id][r.account_id] = Number(r.allocation_value);
      }

      const extraMeta = parseJsonSafe(settingsRow.extra_meta_json, {});
      const presentKeys = new Set(Array.isArray(extraMeta.__presentKeys) ? extraMeta.__presentKeys : []);

      const result = {};

      if (presentKeys.has('accounts')) {
        result.accounts = (accountsRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('name', r.name);
          setField('type', r.type);
          setField('saveExtraMonthly', Number(r.save_extra_monthly));
          setField('enableExtraSavings', Boolean(r.enable_extra_savings));
          setField('color', r.color);
          setField('notes', r.notes || '');
          setField('startingBalance', r.starting_balance !== null && r.starting_balance !== undefined ? Number(r.starting_balance) : 0);
          setField('extraStartingBalance', r.extra_starting_balance !== null && r.extra_starting_balance !== undefined ? Number(r.extra_starting_balance) : 0);
          setField('balanceAsOfDate', r.balance_as_of_date || '');
          setField('startDate', r.start_date || '');
          setField('ledgerMode', r.ledger_mode || 'auto');
          setField('isArchived', Boolean(r.is_archived));
          setField('importedLedgerRows', (stmtRowsByAcct[r.id] && Object.keys(stmtRowsByAcct[r.id]).length > 0)
            ? stmtRowsByAcct[r.id]
            : (extra.importedLedgerRows || {}));
          setField('saveExtraSplits', (saveExtraByAcct[r.id] && Object.keys(saveExtraByAcct[r.id]).length > 0)
            ? saveExtraByAcct[r.id]
            : (extra.saveExtraSplits || {}));
          setField('overflowSplits', (overflowByAcct[r.id] && Object.keys(overflowByAcct[r.id]).length > 0)
            ? overflowByAcct[r.id]
            : (extra.overflowSplits || {}));

          return out;
        });
      }

      if (presentKeys.has('people')) {
        result.people = (peopleRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('name', r.name);
          setField('role', r.role);
          setField('payFrequency', r.pay_frequency);
          setField('payDay1', r.pay_day1);
          setField('payDay2', r.pay_day2);
          setField('payOffsetDays', Number(r.pay_offset_days));
          setField('accountAllocations', (allocByPerson[r.id] && Object.keys(allocByPerson[r.id]).length > 0)
            ? allocByPerson[r.id]
            : (parseJsonSafe(r.account_allocations, extra.accountAllocations || {})));
          setField('grossPerPay', Number(r.gross_per_pay));
          setField('netPerPay', Number(r.net_per_pay));
          setField('color', r.color);

          return out;
        });
      }

      if (presentKeys.has('bills')) {
        result.bills = (billsRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('accountId', r.account_id);
          setField('name', r.name);
          setField('amount', Number(r.amount));
          setField('period', r.period);
          setField('dueDay', Number(r.due_day));
          setField('months', parseJsonSafe(r.due_months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
          setField('paymentSource', r.payment_source);
          setField('category', r.category);
          setField('splits', (splitsByBill[r.id] && Object.keys(splitsByBill[r.id]).length > 0)
            ? splitsByBill[r.id]
            : (parseJsonSafe(r.splits_json, extra.splits || {})));
          setField('bankMatchNames', parseJsonSafe(r.bank_match_names, []));
          setField('notes', r.notes || '');
          setField('matchingKey', r.matching_key || '');
          setField('isArchived', Boolean(r.is_archived));

          return out;
        });
      }

      if (presentKeys.has('transactions')) {
        result.transactions = (txRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('accountId', r.account_id);
          setField('date', r.date);
          setField('description', r.description);
          setField('amount', Number(r.amount));
          setField('type', r.type);
          setField('category', r.category);
          setField('status', r.status);
          setField('billId', r.matched_bill_id);
          setField('personId', r.person_id);
          setField('isOther', Boolean(r.is_other));
          setField('notes', r.notes || '');

          return out;
        });
      }

      if (presentKeys.has('lineItems')) {
        result.lineItems = (lineItemsRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('billId', r.bill_id);
          setField('monthKey', r.month_key);
          setField('actualAmount', r.actual_amount !== null && r.actual_amount !== undefined ? Number(r.actual_amount) : null);
          setField('isPaid', Boolean(r.is_paid));
          setField('paidDate', r.paid_date);
          setField('notes', r.notes || '');
          setField('updatedAt', r.updated_at ? Number(r.updated_at) : 0);

          return out;
        });
      }

      if (presentKeys.has('fundingGoals')) {
        result.fundingGoals = (goalsRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('accountId', r.account_id);
          setField('name', r.name);
          setField('targetAmount', Number(r.target_amount));
          if (p && p.has('amount') && !p.has('targetAmount')) {
            out.amount = Number(r.target_amount);
          }
          setField('currentAmount', Number(r.current_amount));
          setField('monthlyContribution', Number(r.monthly_contribution));
          if (p && p.has('amountPerPay') && !p.has('monthlyContribution')) {
            out.amountPerPay = Number(r.monthly_contribution);
          }
          setField('targetDate', r.target_date);
          setField('color', r.color);
          setField('icon', r.icon);
          setField('contributorId', r.contributor_id);
          setField('frequency', r.frequency || 'monthly');
          setField('amountPerPay', Number(r.amount_per_pay));

          return out;
        });
      }

      if (presentKeys.has('loans')) {
        result.loans = (loansRes?.results || []).map((r) => {
          const extra = parseJsonSafe(r.extra_json, {});
          const p = extra._p ? new Set(extra._p) : null;
          const out = {};
          for (const [k, v] of Object.entries(extra)) {
            if (k !== '_p') out[k] = v;
          }
          const setField = (key, val) => {
            if (!p || p.has(key)) out[key] = val;
          };

          setField('id', r.id);
          setField('name', r.name);
          setField('description', r.description || '');
          setField('principal', Number(r.principal));
          setField('annualInterestRate', Number(r.annual_interest_rate));
          setField('termMonths', Number(r.term_months));
          setField('monthlyPayment', Number(r.monthly_payment));
          setField('extraPayment', Number(r.extra_payment));
          setField('startDate', r.start_date);
          setField('isArchived', Boolean(r.is_archived));
          setField('interestCompounding', r.interest_compounding || 'monthly');
          setField('paymentFrequency', r.payment_frequency || 'monthly');
          setField('paymentType', r.payment_type || 'amortizing');

          return out;
        });
      }

      if (presentKeys.has('dailyMatrix')) {
        const matrixObj = {};
        for (const r of matrixRes?.results || []) {
          if (r.str_value === '__NULL__') {
            matrixObj[r.field_key] = null;
          } else if (r.str_value !== null && r.str_value !== undefined) {
            matrixObj[r.field_key] = r.str_value;
          } else {
            matrixObj[r.field_key] = r.num_value !== null && r.num_value !== undefined ? Number(r.num_value) : null;
          }
        }
        result.dailyMatrix = matrixObj;
      }

      if (presentKeys.has('theme')) {
        result.theme = settingsRow.theme;
      }
      if (presentKeys.has('hideDashboardHeader')) {
        result.hideDashboardHeader = Boolean(settingsRow.hide_dashboard_header);
      }
      if (presentKeys.has('dashboardWidgets')) {
        if (widgetsRes?.results && widgetsRes.results.length > 0) {
          result.dashboardWidgets = widgetsRes.results.map((w) => {
            const extra = parseJsonSafe(w.extra_json, {});
            return {
              ...extra,
              id: w.id,
              title: w.title,
              description: w.description || '',
              category: w.category || '',
              visible: Boolean(w.visible),
              width: w.width || 'full',
              sortOrder: Number(w.sort_order)
            };
          });
        } else {
          result.dashboardWidgets = parseJsonSafe(settingsRow.dashboard_widgets_json, []);
        }
      }
      if (presentKeys.has('categories')) {
        if (categoriesRes?.results && categoriesRes.results.length > 0) {
          result.categories = categoriesRes.results.map((c) => {
            const extra = parseJsonSafe(c.extra_json, {});
            return {
              ...extra,
              id: c.id,
              name: c.name,
              sortOrder: Number(c.sort_order)
            };
          });
        } else {
          result.categories = parseJsonSafe(settingsRow.custom_categories_json, []);
        }
      }

      for (const [k, v] of Object.entries(extraMeta)) {
        if (k !== '__presentKeys') {
          result[k] = v;
        }
      }

      return { ok: true, budget: result };
    }
  } catch {
    // Fall through to fallbackJsonStr if structured tables are not initialized on this DB instance
  }

  if (fallbackJsonStr !== null && fallbackJsonStr !== undefined) {
    try {
      const parsed = JSON.parse(fallbackJsonStr);
      return {
        ok: true,
        budget: parsed && parsed.budget !== undefined ? parsed.budget : parsed
      };
    } catch {
      return { ok: false, error: 'Stored backup could not be read.' };
    }
  }

  return { ok: false, error: 'No cloud backup found' };
}
