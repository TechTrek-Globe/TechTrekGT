// @ts-nocheck
/**
 * Smart Spreadsheet Import Engine
 * - Detects Emory Parc XLSX vs. generic CSV
 * - Auto-matches headers to internal field names
 * - Applies user-defined column maps to produce normalized records
 */
import * as XLSX from 'xlsx';
import { logDebug, logWarn, logInfo } from './debugLogger.js';

// --- Internal Field Definitions ---

export const INTERNAL_TRANSACTION_FIELDS = [
  { key: 'date',        label: 'Date',            required: true  },
  { key: 'description', label: 'Description',     required: true  },
  { key: 'amount',      label: 'Amount ($)',      required: true  },
  { key: 'balance',     label: 'Running Balance', required: false },
  { key: 'accountId',   label: 'Account',         required: false },
  { key: 'category',    label: 'Category',        required: false },
  { key: 'notes',       label: 'Notes',           required: false },
];

export const INTERNAL_BILL_FIELDS = [
  { key: 'name',          label: 'Bill Name',          required: true  },
  { key: 'amount',        label: 'Amount ($)',          required: true  },
  { key: 'accountId',    label: 'Account',            required: false },
  { key: 'period',        label: 'Period',             required: false },
  { key: 'dueDay',        label: 'Due Day',            required: false },
  { key: 'paymentSource', label: 'Payment Source',     required: false },
  { key: 'matchingKey',   label: 'Bank Document Key',  required: false },
  { key: 'notes',         label: 'Notes',              required: false },
];

// Synonym map for fuzzy column auto-match
const TRANSACTION_SYNONYMS = {
  date:        ['date', 'post date', 'posting date', 'transaction date', 'trans date', 'settled', 'value date', 'trans_date'],
  description: ['description', 'desc', 'memo', 'payee', 'merchant', 'name', 'details', 'narrative', 'transaction description'],
  amount:      ['amount', 'amt', 'debit', 'credit', 'charge', 'payment', 'withdrawal', 'deposit', 'value', 'transaction amount'],
  balance:     ['balance', 'running balance', 'ending balance', 'total balance', 'current balance', 'bal', 'running bal', 'account balance'],
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
  matchingKey:   ['matching key', 'matching_key', 'match key', 'bank key', 'bank document key', 'bank desc', 'bank description', 'bank doc key', 'reconciliation key', 'statement descriptor', 'identifier', 'doc key'],
  notes:         ['notes', 'note', 'comment', 'remarks'],
};

// Date normalization helper
export function normalizeIsoDate(rawDate) {
  if (rawDate === undefined || rawDate === null || rawDate === '') return null;
  if (typeof rawDate === 'number' || (!isNaN(Number(rawDate)) && !String(rawDate).includes('-') && !String(rawDate).includes('/') && !String(rawDate).includes('.'))) {
    const num = Number(rawDate);
    if (num > 1000 && num < 100000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }
  const str = String(rawDate).trim().replace(/^["']|["']$/g, '');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(str)) {
    const [m, d, y] = str.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
    const [d, m, y] = str.split('.');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && !/^\d+$/.test(str)) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

// --- File Type Detection ---

/**
 * Detects whether the uploaded file is an Emory Parc-style XLSX or a generic CSV.
 * @param {string} fileName
 * @param {string[]} sheetNames - workbook sheet names if available
 * @param {string[]} sampleHeaders - header list from first sheet if available
 * @returns {'emory_parc' | 'generic_csv'}
 */
export function detectFileType(fileName, sheetNames = [], sampleHeaders = []) {
  const isMatrixHeader = Array.isArray(sampleHeaders) && sampleHeaders.some(h => {
    const s = String(h || '').toLowerCase().trim();
    return s.includes('beg balance') || s.includes('ending balance') || s.includes('extra beg') || s.includes('regular beg') || s.includes('jon credit') || s.includes('ronnie credit');
  });

  if (isMatrixHeader) {
    logDebug('PARSER', 'Detected Emory Parc / Daily matrix headers in file', { fileName, sampleHeaders });
    return 'emory_parc';
  }

  const knownSheets = ['budget', 'dashboard', 'main', 'loan', 'amortization', 'account', 'checking', 'savings', 'ledger'];
  const hasKnownSheet = sheetNames.some(s =>
    knownSheets.some(k => s.toLowerCase().includes(k))
  );

  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.csv') && !hasKnownSheet) {
    logDebug('PARSER', 'File extension is .csv -> generic_csv', { fileName });
    return 'generic_csv';
  }

  const detected = hasKnownSheet ? 'emory_parc' : 'generic_csv';
  logDebug('PARSER', `Workbook classified as: ${detected}`, { fileName, sheetNames, hasKnownSheet });
  return detected;
}

// --- Generic CSV / Flat XLSX Parser ---

/**
 * Parses a flat file (CSV or single-sheet XLSX) into { headers, rows }.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], rows: Record<string, string>[], rawRows: any[][] }}
 */
export function parseGenericFlat(arrayBuffer) {
  logDebug('PARSER', 'Parsing generic flat spreadsheet / CSV buffer', { byteLength: arrayBuffer?.byteLength });
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length < 2) {
    logWarn('PARSER', 'Flat sheet has insufficient rows (< 2 rows found)', { rowCount: rawRows?.length || 0 });
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

  logDebug('PARSER', `Parsed sheet "${sheetName}": ${headers.length} headers, ${rows.length} data rows`, {
    headers,
    rowCount: rows.length,
    firstRowSample: rows[0] || null
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
  logDebug('MATCH', `Auto-matching columns for schema "${schema}"`, { headers, schema });
  const synonyms = schema === 'bills' ? BILL_SYNONYMS : TRANSACTION_SYNONYMS;
  const requiredFields = (schema === 'bills' ? INTERNAL_BILL_FIELDS : INTERNAL_TRANSACTION_FIELDS)
    .filter(f => f.required).map(f => f.key);

  const mapping = {};
  const usedKeys = new Set();
  const matchDetails = [];

  headers.forEach(header => {
    const h = header.toLowerCase().trim();
    let matched = '__ignore__';

    for (const [fieldKey, synonymList] of Object.entries(synonyms)) {
      if (usedKeys.has(fieldKey)) continue;
      if (synonymList.some(syn => h === syn || h.includes(syn) || syn.includes(h))) {
        matched = fieldKey;
        usedKeys.add(fieldKey);
        matchDetails.push({ header, mappedTo: fieldKey });
        break;
      }
    }

    if (matched === '__ignore__') {
      matchDetails.push({ header, mappedTo: '__ignore__' });
    }

    mapping[header] = matched;
  });

  const matchedRequired = requiredFields.filter(k => usedKeys.has(k)).length;
  const confidence = requiredFields.length > 0 ? matchedRequired / requiredFields.length : 0;
  const missingRequired = requiredFields.filter(k => !usedKeys.has(k));

  logDebug('MATCH', `Auto-match finished with confidence ${(confidence * 100).toFixed(0)}%`, {
    confidence,
    requiredFields,
    matchedRequiredCount: matchedRequired,
    missingRequired,
    mapping,
    matchDetails
  });

  if (missingRequired.length > 0) {
    logWarn('MATCH', `Auto-match incomplete. Missing required fields: ${missingRequired.join(', ')}`, { missingRequired });
  }

  return { mapping, confidence };
}

// --- Record Normalizers ---

/**
 * Applies a column map to produce normalized transaction records.
 * @param {Record<string, string>[]} rows
 * @param {Record<string, string>} columnMap - { detectedHeader -> internalFieldKey }
 * @param {string} defaultAccountId - Optional accountId to assign to all rows
 * @returns {{ records: object[], skipped: number, importedLedgerRows: Record<string, number>, earliestDate: string|null, startingBalance: number|null }}
 */
export function applyTransactionMapping(rows, columnMap, defaultAccountId = '') {
  logDebug('NORMALIZE', `Applying transaction column mapping to ${rows.length} rows`, { columnMap, defaultAccountId });
  const records = [];
  const importedLedgerRows = {};
  let skipped = 0;
  const skippedDetails = [];
  let earliestDate = null;

  rows.forEach((row, idx) => {
    const mapped = {};
    Object.entries(columnMap).forEach(([srcCol, destKey]) => {
      if (destKey !== '__ignore__') {
        let val = row[srcCol];
        if (val === undefined) {
          const cleanSrc = String(srcCol).trim().toLowerCase();
          const foundKey = Object.keys(row).find(k => String(k).trim().toLowerCase() === cleanSrc);
          if (foundKey) val = row[foundKey];
        }
        if (val !== undefined) {
          mapped[destKey] = val;
        }
      }
    });

    const rawAmt = String(mapped.amount !== undefined ? mapped.amount : '').replace(/[^0-9.-]+/g, '');
    const amount = parseFloat(rawAmt);
    const isoDate = normalizeIsoDate(mapped.date);

    if (!isoDate || isNaN(amount)) {
      skipped++;
      if (skippedDetails.length < 10) {
        skippedDetails.push({
          rowIdx: idx + 1,
          rawDate: mapped.date !== undefined ? mapped.date : null,
          normalizedDate: isoDate,
          rawAmount: mapped.amount !== undefined ? mapped.amount : null,
          parsedAmount: isNaN(amount) ? null : amount,
          reason: !isoDate ? 'Invalid Date' : 'Invalid Amount',
          rawData: row
        });
      }
      return;
    }

    const rawBal = mapped.balance !== undefined && mapped.balance !== '' ? String(mapped.balance).replace(/[^0-9.-]+/g, '') : null;
    const balance = rawBal !== null ? parseFloat(rawBal) : undefined;
    const desc = (mapped.description || '').trim();

    const record = {
      id: `txn-${Date.now()}-${idx}`,
      date: isoDate,
      description: desc,
      amount,
      balance: balance !== undefined && !isNaN(balance) ? balance : undefined,
      accountId: mapped.accountId || defaultAccountId,
      category: mapped.category || '',
      notes: mapped.notes || '',
      importedAt: Date.now(),
    };

    records.push(record);

    if (balance !== undefined && !isNaN(balance)) {
      // The balance recorded on a transaction row represents the post-transaction running balance
      importedLedgerRows[isoDate] = balance;

      if (earliestDate === null || isoDate < earliestDate) {
        earliestDate = isoDate;
      }
    }
  });

  logDebug('NORMALIZE', `Transaction normalization complete: ${records.length} valid records, ${skipped} skipped`, {
    validCount: records.length,
    skippedCount: skipped,
    skippedSamples: skippedDetails,
    earliestDate,
    ledgerPointsCount: Object.keys(importedLedgerRows).length
  });

  if (skipped > 0) {
    logWarn('NORMALIZE', `Skipped ${skipped} transaction rows during normalization`, { skippedSamples: skippedDetails });
  }

  return { records, skipped, importedLedgerRows, earliestDate };
}

/**
 * Applies a column map to produce normalized bill records.
 * @param {Record<string, string>[]} rows
 * @param {Record<string, string>} columnMap
 * @param {string} defaultAccountId
 * @returns {{ records: object[], skipped: number }}
 */
export function applyBillMapping(rows, columnMap, defaultAccountId = '') {
  logDebug('NORMALIZE', `Applying bill column mapping to ${rows.length} rows`, { columnMap, defaultAccountId });
  const records = [];
  let skipped = 0;
  const skippedDetails = [];

  rows.forEach((row, idx) => {
    const mapped = {};
    Object.entries(columnMap).forEach(([srcCol, destKey]) => {
      if (destKey !== '__ignore__') {
        let val = row[srcCol];
        if (val === undefined) {
          const cleanSrc = String(srcCol).trim().toLowerCase();
          const foundKey = Object.keys(row).find(k => String(k).trim().toLowerCase() === cleanSrc);
          if (foundKey) val = row[foundKey];
        }
        if (val !== undefined) {
          mapped[destKey] = val;
        }
      }
    });

    const name = (mapped.name || '').trim();
    const parsedAmt = parseFloat(String(mapped.amount || '').replace(/[^0-9.-]+/g, ''));
    if (!name || isNaN(parsedAmt)) {
      skipped++;
      if (skippedDetails.length < 10) {
        skippedDetails.push({
          rowIdx: idx + 1,
          rawName: mapped.name !== undefined ? mapped.name : null,
          rawAmount: mapped.amount !== undefined ? mapped.amount : null,
          reason: !name ? 'Missing Name' : 'Invalid Amount',
          rawData: row
        });
      }
      return;
    }
    const amount = Math.abs(parsedAmt);

    const rawPeriod = mapped.period || 'Monthly';
    const validPeriods = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Weekly'];
    const period = validPeriods.find(p => p.toLowerCase() === rawPeriod.toLowerCase()) || 'Monthly';
    const matchingKey = (mapped.matchingKey || '').trim();

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
      matchingKey,
      notes: mapped.notes || '',
      splits: {},
    });
  });

  logDebug('NORMALIZE', `Bill normalization complete: ${records.length} valid bills, ${skipped} skipped`, {
    validCount: records.length,
    skippedCount: skipped,
    skippedSamples: skippedDetails
  });

  if (skipped > 0) {
    logWarn('NORMALIZE', `Skipped ${skipped} bill rows during normalization`, { skippedSamples: skippedDetails });
  }

  return { records, skipped };
}

// --- Merge / Deduplication Helpers ---

/**
 * Row-by-row merge of incoming transactions with existing transactions.
 * Matches rows by date+amount+description, preserves existing comments/notes, and merges new data.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {object[]}
 */
export function mergeTransactions(existing = [], incoming = []) {
  const result = existing.map(e => ({ ...e }));

  incoming.forEach(inc => {
    const incDate = normalizeIsoDate(inc.date);
    const incDesc = (inc.description || '').toLowerCase().trim();
    const incAmt = Math.abs(parseFloat(inc.amount) || 0);

    const matchIdx = result.findIndex(ex => {
      const exDate = normalizeIsoDate(ex.date);
      const exDesc = (ex.description || '').toLowerCase().trim();
      const exAmt = Math.abs(parseFloat(ex.amount) || 0);

      const dateMatch = incDate && exDate && incDate === exDate;
      const amtMatch = Math.abs(incAmt - exAmt) < 0.01;
      const descMatch = incDesc === exDesc || (incDesc.length >= 3 && exDesc.includes(incDesc)) || (exDesc.length >= 3 && incDesc.includes(exDesc));

      return (dateMatch && amtMatch && descMatch) || (ex.id && inc.id && ex.id === inc.id);
    });

    if (matchIdx >= 0) {
      const ex = result[matchIdx];
      // Merge comments/notes: retain existing comment if incoming is empty, or join if both exist
      let mergedNotes = ex.notes || '';
      if (inc.notes && inc.notes.trim()) {
        const incNotesTrim = inc.notes.trim();
        if (!mergedNotes) {
          mergedNotes = incNotesTrim;
        } else if (!mergedNotes.includes(incNotesTrim) && !incNotesTrim.includes(mergedNotes)) {
          mergedNotes = `${mergedNotes} | ${incNotesTrim}`;
        }
      }

      result[matchIdx] = {
        ...ex,
        ...inc,
        id: ex.id || inc.id,
        notes: mergedNotes,
        accountId: inc.accountId || ex.accountId,
        category: inc.category || ex.category || '',
        billId: inc.billId || ex.billId || null
      };
    } else {
      result.push({ ...inc });
    }
  });

  return result;
}

/**
 * Row-by-row merge of incoming bills with existing bills.
 * Matches rows by bill name or bank document matching key, preserving existing comments/notes.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @returns {object[]}
 */
export function mergeBills(existing = [], incoming = []) {
  const result = existing.map(b => ({ ...b }));

  incoming.forEach(inc => {
    const incName = (inc.name || '').toLowerCase().trim();
    const incKey = (inc.matchingKey || '').toLowerCase().trim();

    const matchIdx = result.findIndex(ex => {
      const exName = (ex.name || '').toLowerCase().trim();
      const exKey = (ex.matchingKey || '').toLowerCase().trim();

      if (incName && exName && incName === exName) return true;
      if (incKey && exKey && (incKey.includes(exKey) || exKey.includes(incKey))) return true;
      if (incKey && exName && (exName.includes(incKey) || incKey.includes(exName))) return true;
      if (exKey && incName && (incName.includes(exKey) || exKey.includes(incName))) return true;
      return false;
    });

    if (matchIdx >= 0) {
      const ex = result[matchIdx];
      // Merge comments/notes: retain existing comments if incoming is empty, or join if both exist
      let mergedNotes = ex.notes || '';
      if (inc.notes && inc.notes.trim()) {
        const incNotesTrim = inc.notes.trim();
        if (!mergedNotes) {
          mergedNotes = incNotesTrim;
        } else if (!mergedNotes.includes(incNotesTrim) && !incNotesTrim.includes(mergedNotes)) {
          mergedNotes = `${mergedNotes} | ${incNotesTrim}`;
        }
      }

      // Merge matchingKey: retain existing if incoming is empty, or update if provided
      const mergedKey = inc.matchingKey && inc.matchingKey.trim() ? inc.matchingKey.trim() : (ex.matchingKey || '');

      result[matchIdx] = {
        ...ex,
        name: inc.name || ex.name,
        amount: inc.amount !== undefined ? inc.amount : ex.amount,
        period: inc.period || ex.period,
        dueDay: inc.dueDay || ex.dueDay,
        dueMonths: inc.dueMonths || ex.dueMonths,
        paymentSource: inc.paymentSource || ex.paymentSource,
        paymentNotes: inc.paymentNotes || inc.paymentSource || ex.paymentNotes || ex.paymentSource,
        accountId: inc.accountId || ex.accountId,
        matchingKey: mergedKey,
        notes: mergedNotes,
        splits: (inc.splits && Object.keys(inc.splits).length > 0) ? inc.splits : ex.splits
      };
    } else {
      result.push({
        ...inc,
        matchingKey: inc.matchingKey || '',
        notes: inc.notes || ''
      });
    }
  });

  return result;
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
