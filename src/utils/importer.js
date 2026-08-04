// @ts-nocheck
/**
 * Smart Spreadsheet Import Engine
 * - Detects Emory Parc XLSX vs. generic CSV
 * - Auto-matches headers to internal field names
 * - Applies user-defined column maps to produce normalized records
 */
import * as XLSX from 'xlsx';

// --- Internal Field Definitions ---

export const INTERNAL_TRANSACTION_FIELDS = [
  { key: 'date',        label: 'Date',        required: true  },
  { key: 'description', label: 'Description', required: true  },
  { key: 'amount',      label: 'Amount',      required: true  },
  { key: 'accountId',  label: 'Account',     required: false },
  { key: 'category',   label: 'Category',    required: false },
  { key: 'notes',      label: 'Notes',       required: false },
];

export const INTERNAL_BILL_FIELDS = [
  { key: 'name',          label: 'Bill Name',      required: true  },
  { key: 'amount',        label: 'Amount ($)',      required: true  },
  { key: 'accountId',    label: 'Account',        required: false },
  { key: 'period',        label: 'Period',         required: false },
  { key: 'dueDay',        label: 'Due Day',        required: false },
  { key: 'paymentSource', label: 'Payment Source', required: false },
  { key: 'notes',         label: 'Notes',          required: false },
];

// Synonym map for fuzzy column auto-match
const TRANSACTION_SYNONYMS = {
  date:        ['date', 'post date', 'posting date', 'transaction date', 'trans date', 'settled', 'value date'],
  description: ['description', 'desc', 'memo', 'payee', 'merchant', 'name', 'details', 'narrative'],
  amount:      ['amount', 'amt', 'debit', 'credit', 'charge', 'payment', 'withdrawal', 'deposit', 'value'],
  accountId:   ['account', 'account name', 'bank account', 'account number', 'acct'],
  category:    ['category', 'cat', 'type', 'transaction type', 'trans type'],
  notes:       ['notes', 'note', 'comment', 'reference', 'ref', 'remarks'],
};

const BILL_SYNONYMS = {
  name:          ['name', 'bill name', 'payee', 'description', 'desc', 'bill', 'expense'],
  amount:        ['amount', 'amt', 'cost', 'price', 'payment', 'value', 'monthly amount'],
  accountId:     ['account', 'account name', 'bank account', 'acct', 'paid from', 'charged to'],
  period:        ['period', 'frequency', 'recurrence', 'cycle'],
  dueDay:        ['due day', 'day', 'due date', 'payment day'],
  paymentSource: ['payment source', 'source', 'method', 'pay method', 'paid by'],
  notes:         ['notes', 'note', 'comment', 'remarks'],
};

// --- File Type Detection ---

/**
 * Detects whether the uploaded file is an Emory Parc-style XLSX or a generic CSV.
 * @param {string} fileName
 * @param {string[]} sheetNames - workbook sheet names if available
 * @returns {'emory_parc' | 'generic_csv'}
 */
export function detectFileType(fileName, sheetNames = []) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.csv')) return 'generic_csv';

  const knownSheets = ['budget', 'dashboard', 'main', 'loan', 'amortization', 'account'];
  const hasKnownSheet = sheetNames.some(s =>
    knownSheets.some(k => s.toLowerCase().includes(k))
  );
  return hasKnownSheet ? 'emory_parc' : 'generic_csv';
}

// --- Generic CSV / Flat XLSX Parser ---

/**
 * Parses a flat file (CSV or single-sheet XLSX) into { headers, rows }.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], rows: Record<string, string>[], rawRows: any[][] }}
 */
export function parseGenericFlat(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length < 2) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Find first non-empty row as header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    if (rawRows[i].some(c => c !== '')) { headerRowIdx = i; break; }
  }

  const headers = rawRows[headerRowIdx].map(h => String(h).trim()).filter(h => h !== '');
  const dataRows = rawRows.slice(headerRowIdx + 1)
    .filter(r => r.some(c => c !== ''));

  const rows = dataRows.map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]).trim() : ''; });
    return obj;
  });

  return { headers, rows, rawRows: dataRows };
}

// --- Auto Column Matcher ---

/**
 * Fuzzy-matches detected headers against internal field synonyms.
 * @param {string[]} headers
 * @param {'transactions' | 'bills'} schema
 * @returns {{ mapping: Record<string, string>, confidence: number }}
 */
export function autoMatchColumns(headers, schema = 'transactions') {
  const synonyms = schema === 'bills' ? BILL_SYNONYMS : TRANSACTION_SYNONYMS;
  const requiredFields = (schema === 'bills' ? INTERNAL_BILL_FIELDS : INTERNAL_TRANSACTION_FIELDS)
    .filter(f => f.required).map(f => f.key);

  const mapping = {};
  const usedKeys = new Set();

  headers.forEach(header => {
    const h = header.toLowerCase().trim();
    let matched = '__ignore__';

    for (const [fieldKey, synonymList] of Object.entries(synonyms)) {
      if (usedKeys.has(fieldKey)) continue;
      if (synonymList.some(syn => h === syn || h.includes(syn) || syn.includes(h))) {
        matched = fieldKey;
        usedKeys.add(fieldKey);
        break;
      }
    }

    mapping[header] = matched;
  });

  const matchedRequired = requiredFields.filter(k => usedKeys.has(k)).length;
  const confidence = requiredFields.length > 0 ? matchedRequired / requiredFields.length : 0;

  return { mapping, confidence };
}

// --- Record Normalizers ---

/**
 * Applies a column map to produce normalized transaction records.
 * @param {Record<string, string>[]} rows
 * @param {Record<string, string>} columnMap - { detectedHeader -> internalFieldKey }
 * @returns {{ records: object[], skipped: number }}
 */
export function applyTransactionMapping(rows, columnMap) {
  const records = [];
  let skipped = 0;

  rows.forEach((row, idx) => {
    const mapped = {};
    Object.entries(columnMap).forEach(([srcCol, destKey]) => {
      if (destKey !== '__ignore__' && row[srcCol] !== undefined) {
        mapped[destKey] = row[srcCol];
      }
    });

    const amount = parseFloat(String(mapped.amount || '').replace(/[^0-9.-]+/g, ''));
    if (!mapped.date || isNaN(amount)) { skipped++; return; }

    records.push({
      id: `txn-${Date.now()}-${idx}`,
      date: mapped.date,
      description: mapped.description || '',
      amount,
      category: mapped.category || '',
      notes: mapped.notes || '',
      importedAt: Date.now(),
    });
  });

  return { records, skipped };
}

/**
 * Applies a column map to produce normalized bill records.
 * @param {Record<string, string>[]} rows
 * @param {Record<string, string>} columnMap
 * @param {string} defaultAccountId
 * @returns {{ records: object[], skipped: number }}
 */
export function applyBillMapping(rows, columnMap, defaultAccountId = '') {
  const records = [];
  let skipped = 0;

  rows.forEach((row, idx) => {
    const mapped = {};
    Object.entries(columnMap).forEach(([srcCol, destKey]) => {
      if (destKey !== '__ignore__' && row[srcCol] !== undefined) {
        mapped[destKey] = row[srcCol];
      }
    });

    const name = (mapped.name || '').trim();
    const amount = parseFloat(String(mapped.amount || '').replace(/[^0-9.-]+/g, ''));
    if (!name || isNaN(amount)) { skipped++; return; }

    const rawPeriod = mapped.period || 'Monthly';
    const validPeriods = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Weekly'];
    const period = validPeriods.find(p => p.toLowerCase() === rawPeriod.toLowerCase()) || 'Monthly';

    records.push({
      id: `bill-${Date.now()}-${idx}`,
      name,
      amount,
      period,
      accountId: defaultAccountId,
      dueDay: parseInt(mapped.dueDay) || 1,
      dueMonths: period === 'Annual' ? [1]
        : period === 'Semi-Annual' ? [1, 7]
        : period === 'Quarterly' ? [1, 4, 7, 10]
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      paymentSource: mapped.paymentSource || 'Auto Pay',
      notes: mapped.notes || '',
      splits: {},
    });
  });

  return { records, skipped };
}

// --- Merge / Deduplication Helpers ---

/**
 * Merges incoming transactions, deduplicating by date+description+amount.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {object[]}
 */
export function mergeTransactions(existing, incoming) {
  const key = t => `${t.date}|${(t.description || '').toLowerCase()}|${t.amount}`;
  const existingKeys = new Set(existing.map(key));
  return [...existing, ...incoming.filter(t => !existingKeys.has(key(t)))];
}

/**
 * Merges incoming bills, deduplicating by name.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {object[]}
 */
export function mergeBills(existing, incoming) {
  const existingNames = new Set(existing.map(b => b.name.toLowerCase()));
  return [...existing, ...incoming.filter(b => !existingNames.has(b.name.toLowerCase()))];
}

/**
 * Merges incoming people, deduplicating by name.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {object[]}
 */
export function mergePeople(existing, incoming) {
  const existingNames = new Set(existing.map(p => p.name.toLowerCase()));
  return [...existing, ...incoming.filter(p => !existingNames.has(p.name.toLowerCase()))];
}
