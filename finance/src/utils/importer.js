// @ts-nocheck
/**
 * Smart Spreadsheet Import Engine
 * - Detects Emory Parc XLSX vs. generic CSV
 * - Auto-matches headers to internal field names
 * - Applies user-defined column maps to produce normalized records
 */
import * as XLSX from 'xlsx';
import { logDebug, logWarn, logInfo } from './debugLogger.js';
import { getPersonDepositAmountForAccount } from './paydayUtils.js';
import { round2, parseMoney } from './formatters.js';

// Enforce maximum file size (15 MB) and row count (50,000 rows) before parsing (FIX-11)
export const MAX_SPREADSHEET_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
export const MAX_SPREADSHEET_ROW_COUNT = 50000; // 50,000 rows

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
  { key: 'name',          label: 'Bill Name',                  required: true  },
  { key: 'amount',        label: 'Amount ($)',                 required: true  },
  { key: 'accountId',    label: 'Account',                    required: false },
  { key: 'period',        label: 'Period',                     required: false },
  { key: 'dueDay',        label: 'Due Day',                    required: false },
  { key: 'paymentSource', label: 'Payment Source',             required: false },
  { key: 'matchingKey',   label: 'Bank Match Names (Aliases)', required: false },
  { key: 'notes',         label: 'Notes',                      required: false },
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
  matchingKey:   ['matching key', 'matching_key', 'match key', 'bank key', 'bank match names', 'bank match', 'bank aliases', 'aliases', 'statement aliases', 'bank statement match', 'bank document key', 'bank desc', 'bank description', 'bank doc key', 'reconciliation key', 'statement descriptor', 'identifier', 'doc key'],
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
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
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
    return s.includes('beg balance') || s.includes('ending balance') || s.includes('extra beg') || s.includes('regular beg') || s.includes('credit');
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
  const byteLen = arrayBuffer?.byteLength ?? (typeof arrayBuffer === 'string' ? arrayBuffer.length : 0);
  if (byteLen > MAX_SPREADSHEET_FILE_SIZE) {
    throw new Error(`File size (${Math.round(byteLen / (1024 * 1024))}MB) exceeds maximum limit of 15MB.`);
  }
  logDebug('PARSER', 'Parsing generic flat spreadsheet / CSV buffer', { byteLength: arrayBuffer?.byteLength });
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (sheet && sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const totalRows = range.e.r - range.s.r + 1;
    if (totalRows > MAX_SPREADSHEET_ROW_COUNT) {
      throw new Error(`Sheet contains ${totalRows} rows, exceeding maximum limit of ${MAX_SPREADSHEET_ROW_COUNT}.`);
    }
  }
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

  // GAP-1: Strip UTF-8 BOM that Windows/Excel adds to the first CSV byte
  const headers = rawRows[headerRowIdx].map(h => String(h).replace(/^\uFEFF/, '').trim()).filter(h => h !== '');
  // GAP-3: Tighten filter - exclude rows where every cell is empty or whitespace-only
  const dataRows = rawRows.slice(headerRowIdx + 1)
    .filter(r => r.some(c => String(c).trim() !== ''));

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
  // GAP-4: Monotonic counter to guarantee unique IDs within the same millisecond
  let txnCounter = 0;
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

    // BUG-2: Detect accounting-style negatives like (1,234.56) before stripping non-numeric chars
    const rawAmtStr = String(mapped.amount !== undefined ? mapped.amount : '');
    const isParenNeg = /^\s*\(.*\)\s*$/.test(rawAmtStr.trim());
    const rawAmt = rawAmtStr.replace(/[^0-9.-]+/g, '');
    let amount = parseFloat(isParenNeg && rawAmt !== '' ? `-${rawAmt}` : rawAmt);
    if (Number.isFinite(amount)) amount = Math.round((amount + (amount >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
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
    let balance = rawBal !== null ? parseFloat(rawBal) : undefined;
    if (balance !== undefined && Number.isFinite(balance)) balance = Math.round((balance + (balance >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
    const desc = (mapped.description || '').trim();

    const record = {
      id: `txn-${Date.now()}-${txnCounter++}`,
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
  // GAP-4: Monotonic counter to guarantee unique IDs within the same millisecond
  let billCounter = 0;

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
    let parsedAmt = parseMoney(mapped.amount, NaN);
    if (Number.isFinite(parsedAmt)) parsedAmt = round2(parsedAmt);
    
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
    const matchingKey = (mapped.matchingKey || mapped.bankMatchNames || '').trim();

    records.push({
      id: `bill-${Date.now()}-${billCounter++}`,
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
      bankMatchNames: matchingKey,
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

export function detectTransactionConflicts(existing = [], incoming = []) {
  const conflicts = [];
  
  incoming.forEach(inc => {
    const incDate = normalizeIsoDate(inc.date);
    const incDesc = (inc.description || '').toLowerCase().trim();
    const incAmt = parseFloat(inc.amount) || 0;

    // If an incoming transaction already matches an existing entry (same account, same date, same amount),
    // it matches what is there in the ledger and should be automatically ignored / deduplicated - not a conflict.
    const alreadyMatches = existing.some(ex => {
      if (ex.accountId && inc.accountId && ex.accountId !== inc.accountId) return false;
      const exDate = normalizeIsoDate(ex.date);
      const exAmt = parseFloat(ex.amount) || 0;
      const dateMatch = incDate && exDate && incDate === exDate;
      const amtMatch = Math.abs(incAmt - exAmt) < 0.01;
      return dateMatch && amtMatch;
    });

    if (alreadyMatches) {
      return;
    }

    // Only flag true ambiguities as conflicts (e.g. same date and payee with a mismatched amount, or close date within 2 days with same amount)
    const matches = existing.filter(ex => {
      if (ex.id && inc.id && ex.id === inc.id) return true;
      if (ex.accountId && inc.accountId && ex.accountId !== inc.accountId) return false;

      const exDate = normalizeIsoDate(ex.date);
      const exDesc = (ex.description || '').toLowerCase().trim();
      const exAmt = parseFloat(ex.amount) || 0;

      const cleanInc = incDesc.replace(/\b(zelle|ach|deposit|transfer|payment|funds)\b/gi, '').trim();
      const cleanEx = exDesc.replace(/\b(zelle|ach|deposit|transfer|payment|funds)\b/gi, '').trim();
      const descMatch = incDesc === exDesc || 
        (cleanInc.length >= 3 && cleanEx.length >= 3 && (cleanInc.includes(cleanEx) || cleanEx.includes(cleanInc))) ||
        (incDesc.length >= 5 && exDesc.length >= 5 && (incDesc.includes(exDesc) || exDesc.includes(incDesc)));
      const dateMatch = incDate && exDate && incDate === exDate;
      const amtMatch = Math.abs(incAmt - exAmt) < 0.01;
      const dateDiff = (incDate && exDate) ? Math.abs(new Date(incDate) - new Date(exDate)) / 86400000 : 999;

      // Case 1: Same date and matching description, but mismatched amount
      if (dateMatch && descMatch && !amtMatch) return true;

      // Case 2: Close date (1-2 days diff, e.g. pending vs posted date) with matching amount and description
      if (dateDiff > 0 && dateDiff <= 2 && amtMatch && descMatch) return true;

      return false;
    });

    if (matches.length > 0) {
      conflicts.push({
        incoming: inc,
        matches: matches
      });
    }
  });

  return conflicts;
}

/**
 * Row-by-row merge of incoming transactions with existing transactions.
 * Matches rows by date+amount+description, preserves existing comments/notes, and merges new data.
 * @param {object[]} existing
 * @param {object[]} incoming
 * @param {object} resolutions - map of incoming ID to { action: 'merge'|'new'|'skip', targetId: 'existingTxnId' }
 * @returns {object[]}
 */
export function mergeTransactions(existing = [], incoming = [], resolutions = {}) {
  const result = existing.map(e => ({ ...e }));

  incoming.forEach(inc => {
    const res = resolutions[inc.id];
    if (res && res.action === 'skip') return;
    if (res && res.action === 'new') {
      result.push({ ...inc });
      return;
    }

    const incDate = normalizeIsoDate(inc.date);
    const incDesc = (inc.description || '').toLowerCase().trim();
    const incAmt = parseFloat(inc.amount) || 0;

    let matchIdx = -1;
    if (res && res.action === 'merge' && res.targetId) {
      matchIdx = result.findIndex(ex => ex.id === res.targetId);
    } else if (!res) {
      // Fallback heuristic: check if transaction matches an existing ledger record
      matchIdx = result.findIndex(ex => {
        if (ex.id && inc.id && ex.id === inc.id) return true;
        if (ex.accountId && inc.accountId && ex.accountId !== inc.accountId) return false;

        const exDate = normalizeIsoDate(ex.date);
        const exDesc = (ex.description || '').toLowerCase().trim();
        const exAmt = parseFloat(ex.amount) || 0;

        const descMatch = incDesc === exDesc || (incDesc.length >= 3 && exDesc.includes(incDesc)) || (exDesc.length >= 3 && incDesc.includes(exDesc));
        const dateMatch = incDate && exDate && incDate === exDate;
        const amtMatch = Math.abs(incAmt - exAmt) < 0.01;
        const dateDiff = (incDate && exDate) ? Math.abs(new Date(incDate) - new Date(exDate)) / 86400000 : 999;

        // Exact match on date and amount (already in ledger)
        if (dateMatch && amtMatch) return true;

        // Same date and matching description
        if (dateMatch && descMatch) return true;

        // Pending vs posted within 2 days with exact amount and matching description
        if (dateDiff <= 2 && amtMatch && descMatch) return true;

        return false;
      });
    }

    if (matchIdx >= 0) {
      const ex = result[matchIdx];
      let mergedNotes = ex.notes || '';
      if (inc.notes && inc.notes.trim()) {
        const incNotesTrim = inc.notes.trim();
        if (!mergedNotes) {
          mergedNotes = incNotesTrim;
        } else if (!mergedNotes.includes(incNotesTrim) && !incNotesTrim.includes(mergedNotes)) {
          mergedNotes = `${mergedNotes} | ${incNotesTrim}`;
        }
      }

      // Hierarchy rule: Imported file amounts and dates are truth.
      result[matchIdx] = {
        ...ex,
        ...inc,
        id: ex.id || inc.id,
        date: inc.date || ex.date,
        amount: inc.amount !== undefined ? inc.amount : ex.amount,
        notes: mergedNotes,
        accountId: inc.accountId || ex.accountId,
        category: inc.category || ex.category || '',
        billId: inc.billId || ex.billId || null,
        personId: inc.personId || ex.personId || null
      };
    } else {
      result.push({ ...inc });
    }
  });

  return result;
}

/**
 * Intelligently matches an incoming credit (deposit or transfer) to an earner profile.
 *
 * Matching priority:
 *   Tier 1 - Text: earner name / alias in description or notes
 *   Tier 2 - Account Allocation: per-paycheck amount defined in person.accountAllocations
 *   Tier 3 - Bill Splits: each earner's calculated monthly obligation for the target account
 *   Tier 4 - Net Pay: earner's net paycheck amount (payroll direct deposit)
 *
 * Guard rails:
 *   - Minimum match amount: $5.00 (prevents interest cents / tiny credits from matching)
 *   - Known non-earner categories are excluded before calling this function
 *   - Near-match tolerance scales with amount: ±0.5% with max cap of $2.00
 *   - A candidate with totalMonthly === 0 is NEVER matched by amount (prevents false $0.01 match)
 *
 * @param {object} params
 * @param {number|string} params.amount
 * @param {string} [params.description]
 * @param {string} [params.notes]
 * @param {string} [params.category]
 * @param {string} [params.targetAccountId]
 * @param {Array} [params.people]
 * @param {Array} [params.bills]
 * @param {Array} [params.accounts]
 * @returns {{ person: object, reason: string }|null}
 */
export function matchCreditToEarner({
  amount,
  description = '',
  notes = '',
  category = '',
  targetAccountId = '',
  people = [],
  bills = [],
  accounts = []
}) {
  if (!amount || !Array.isArray(people) || people.length === 0) return null;

  const rawAmt = Math.abs(parseMoney(amount, 0));
  if (!Number.isFinite(rawAmt) || rawAmt <= 0) return null;

  // Guard: minimum meaningful earner deposit - ignore tiny bank credits
  // Interest payments, fee reversals, dividend cents, etc. are never earner deposits
  const MIN_EARNER_AMOUNT = 5.00;
  if (rawAmt < MIN_EARNER_AMOUNT) return null;

  // Guard: exclude categories that are definitively NOT earner deposits
  const categoryLower = (category || '').toLowerCase();
  const NON_EARNER_CATEGORIES = [
    'interest income', 'interest paid', 'interest',
    'dividend', 'fee reversal', 'refund', 'cashback', 'cash back',
    'atm', 'tax refund', 'escrow'
  ];
  if (NON_EARNER_CATEGORIES.some(c => categoryLower.includes(c))) return null;

  // Guard: exclude descriptions that are definitively NOT earner deposits
  const descLower = (description || '').toLowerCase();
  const notesLower = (notes || '').toLowerCase();
  const NON_EARNER_DESC_PATTERNS = [
    'interest paid', 'interest earned', 'interest credit',
    'dividend', 'atm', 'cash deposit', 'check deposit',
    'tax refund', 'escrow refund'
  ];
  if (NON_EARNER_DESC_PATTERNS.some(p => descLower.includes(p) || notesLower.includes(p))) return null;

  // Tier 1: Direct Name or Alias text match
  // Strategy: A direct earner NAME in the description (e.g. "Payroll") is
  // unambiguous and returns immediately. However, ALIAS matches (e.g. "bank transfer")
  // can be generic descriptors shared across multiple earners' bank transfers.
  // When an alias matches, we validate it against known per-paycheck allocation amounts.
  // If another earner has a direct allocation that closely matches the transaction amount,
  // that earner wins - because amount evidence is stronger than a generic alias.
  let tier1AliasMatch = null;
  for (const p of people) {
    const pName = (p.name || '').toLowerCase().trim();
    const pAliases = (p.bankMatchNames || p.matchingKey || '')
      .toLowerCase()
      .split(/[,;\n\r|]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2);

    // Direct name match is unambiguous - return immediately
    if (pName && pName.length >= 2 && (descLower.includes(pName) || notesLower.includes(pName))) {
      return { person: p, reason: `name_match ("${p.name}")` };
    }

    // Alias match: hold as candidate, validate against amount evidence below
    if (!tier1AliasMatch) {
      for (const alias of pAliases) {
        if (descLower.includes(alias) || notesLower.includes(alias)) {
          tier1AliasMatch = { person: p, alias };
          break;
        }
      }
    }
  }

  // If Tier 1 found an alias match, cross-validate: does another earner have a
  // per-paycheck allocation that is a much closer amount match than the alias holder?
  // This prevents a generic transfer alias from displacing an earner's direct deposit.
  if (tier1AliasMatch) {
    const aliasPersonId = tier1AliasMatch.person.id;

    // Collect all account IDs to check
    const allAccountIds = [
      targetAccountId,
      ...accounts.map(a => a.id).filter(id => id !== targetAccountId)
    ].filter(Boolean);

    // Find the best direct allocation match for the alias holder.
    // Monthly-doubled values receive a confidence penalty (same as Tier 2) since they
    // are derived computations, not declared per-paycheck amounts.
    const MONTHLY_DOUBLE_PENALTY = 0.50;
    let aliasHolderBestDelta = Infinity;
    for (const accId of allAccountIds) {
      const allocAmt = getPersonDepositAmountForAccount(tier1AliasMatch.person, accId, { accounts, bills, people });
      if (allocAmt >= MIN_EARNER_AMOUNT) {
        const d = Math.abs(allocAmt - rawAmt);
        if (d < aliasHolderBestDelta) aliasHolderBestDelta = d;
        // Monthly equivalent for semi-monthly/bi-weekly earners (penalized)
        const freq = (tier1AliasMatch.person.payFrequency || '').toLowerCase();
        if (freq === 'semi-monthly' || freq === 'bi-weekly') {
          const monthlyD = Math.abs(Math.round(allocAmt * 2 * 100) / 100 - rawAmt) + MONTHLY_DOUBLE_PENALTY;
          if (monthlyD < aliasHolderBestDelta) aliasHolderBestDelta = monthlyD;
        }
      }
    }

    // Find the best direct allocation match across ALL other earners.
    // Same penalty logic applies for consistency.
    let rivalBestDelta = Infinity;
    let rivalPerson = null;
    for (const p of people) {
      if (p.id === aliasPersonId) continue;
      for (const accId of allAccountIds) {
        const allocAmt = getPersonDepositAmountForAccount(p, accId, { accounts, bills, people });
        if (allocAmt >= MIN_EARNER_AMOUNT) {
          const d = Math.abs(allocAmt - rawAmt);
          if (d < rivalBestDelta) { rivalBestDelta = d; rivalPerson = p; }
          const freq = (p.payFrequency || '').toLowerCase();
          if (freq === 'semi-monthly' || freq === 'bi-weekly') {
            const monthlyD = Math.abs(Math.round(allocAmt * 2 * 100) / 100 - rawAmt) + MONTHLY_DOUBLE_PENALTY;
            if (monthlyD < rivalBestDelta) { rivalBestDelta = monthlyD; rivalPerson = p; }
          }
        }
      }
    }

    // If a rival earner has a strictly better amount-based match, override the alias.
    // No threshold needed: any rival who beats the penalized alias holder wins.
    if (rivalPerson && rivalBestDelta < aliasHolderBestDelta) {
      // Don't return the alias match - fall through to Tier 2+ amount-based matching
    } else {
      return { person: tier1AliasMatch.person, reason: `alias_match ("${tier1AliasMatch.alias}")` };
    }
  }

  // Build helper: monthly bill cost for a bill
  const getBillCost = (b) => {
    if (!b) return 0;
    const period = b.period || 'Monthly';
    const bAmt = parseFloat(b.amount) || 0;
    if (period === 'Quarterly') return bAmt / 3;
    if (period === 'Semi-Annual') return bAmt / 6;
    if (period === 'Annual') return bAmt / 12;
    return bAmt;
  };

  // Scaled near-match tolerance: 0.5% of amount, minimum $0.02, maximum $2.00
  const tolerance = Math.min(2.00, Math.max(0.02, rawAmt * 0.005));

  let bestCandidate = null;
  let minDelta = Infinity;

  for (const p of people) {
    // --- Tier 2: Account Allocation scan across ALL configured accounts ---
    // The incoming credit amount is matched against what each person is expected to deposit
    // into ANY of their configured accounts - not just the target import account.
    //
    // Rationale: A credit into an account should match the contributor because of
    // their per-paycheck allocation to a configured account. The bank may consolidate transfers
    // across accounts, or the CSV may not precisely reflect which sub-account received the money.
    //
    // Priority: target account is tested first (score boost via lower delta floor),
    //           then all other accounts as secondary candidates.
    {
      // Collect all account IDs to check: target first, then all others
      const allAccountIds = [
        targetAccountId,
        ...accounts.map(a => a.id).filter(id => id !== targetAccountId)
      ].filter(Boolean);

      for (const accId of allAccountIds) {
        const allocAmt = getPersonDepositAmountForAccount(p, accId, { accounts, bills, people });
        if (allocAmt < MIN_EARNER_AMOUNT) continue;

        // Secondary accounts get a slight confidence penalty: require delta to beat
        // target-account matches by at least $0.01 (natural from minDelta tracking)
        const deltaAlloc = Math.abs(allocAmt - rawAmt);
        if (deltaAlloc <= tolerance && deltaAlloc < minDelta) {
          const accName = accounts.find(a => a.id === accId)?.name || accId;
          const label = accId === targetAccountId
            ? `${p.name} Paycheck Allocation ($${allocAmt.toFixed(2)})`
            : `${p.name} Paycheck Allocation via ${accName} ($${allocAmt.toFixed(2)})`;
          minDelta = deltaAlloc;
          bestCandidate = { person: p, label, delta: deltaAlloc };
        }

        // Monthly equivalent (two paychecks for semi-monthly / bi-weekly).
        // IMPORTANT: A monthly-doubled value is a derived/computed match, not a direct
        // per-paycheck allocation. Apply a synthetic confidence penalty of $0.50 so that
        // a direct per-paycheck allocation for any earner (even processed later in the loop)
        // always beats a monthly-double tie.
        const isBiOrSemi = p.payFrequency === 'semi-monthly' || p.payFrequency === 'bi-weekly';
        if (isBiOrSemi) {
          const monthlyAlloc = Math.round(allocAmt * 2 * 100) / 100;
          const deltaMonthly = Math.abs(monthlyAlloc - rawAmt);
          // Penalize the effective delta for a derived monthly-double to preserve ranking
          // priority for direct per-paycheck matches from any earner processed later.
          const MONTHLY_DOUBLE_PENALTY = 0.50;
          const effectiveDeltaMonthly = deltaMonthly + MONTHLY_DOUBLE_PENALTY;
          if (deltaMonthly <= tolerance && effectiveDeltaMonthly < minDelta) {
            const accName = accounts.find(a => a.id === accId)?.name || accId;
            const label = accId === targetAccountId
              ? `${p.name} Monthly Allocation ($${monthlyAlloc.toFixed(2)})`
              : `${p.name} Monthly Allocation via ${accName} ($${monthlyAlloc.toFixed(2)})`;
            minDelta = effectiveDeltaMonthly;
            bestCandidate = { person: p, label, delta: deltaMonthly };
          }
        }
      }
    }

    // --- Tier 3: Bill Splits ---
    // A credit into a bills-paying account = person depositing their monthly obligation.
    // Try two scopes and pick whichever one produces a candidate:
    //   Scope A: bills scoped to this specific account (exact account match)
    //   Scope B: ALL active bills (person's total monthly obligation across all accounts)
    // This handles the common case where the account IDs in bills don't exactly match
    // the account ID of the import target, but the transfer amount equals the person's
    // total monthly responsibility.
    const activeBills = bills.filter(b => !b.isArchived);
    const accountBills = targetAccountId
      ? activeBills.filter(b => b.accountId === targetAccountId)
      : activeBills;

    const calcMonthlyPortion = (billSet) =>
      billSet.reduce((sum, b) => {
        const cost = getBillCost(b);
        const splitPct = parseFloat(b.splits?.[p.id]) || 0;
        return sum + (cost * splitPct) / 100;
      }, 0);

    const targetAcc = accounts.find(a => a.id === targetAccountId);
    const extraPortion = (() => {
      if (targetAcc && targetAcc.enableExtraSavings !== false && parseFloat(targetAcc.saveExtraMonthly) > 0) {
        const totalExtra = parseFloat(targetAcc.saveExtraMonthly) || 0;
        if (!targetAcc.enabledEarners || targetAcc.enabledEarners.includes(p.id)) {
          const count = targetAcc.enabledEarners?.length || people.length || 2;
          return totalExtra / count;
        }
      }
      return 0;
    })();

    // Scope A: account-specific bills only
    const monthlyA = Math.round((calcMonthlyPortion(accountBills) + extraPortion) * 100) / 100;
    // Scope B: ALL bills (person's full monthly obligation - what they deposit into the bills account)
    const monthlyB = Math.round((calcMonthlyPortion(activeBills) + extraPortion) * 100) / 100;

    // Try both scopes; use the one that produces the better (smaller delta) match
    for (const { totalMonthly, scopeLabel } of [{ totalMonthly: monthlyA, scopeLabel: 'Account' }, { totalMonthly: monthlyB, scopeLabel: 'Total' }]) {
      // CRITICAL GUARD: only attempt matching if calculated amount is meaningful
      if (totalMonthly < MIN_EARNER_AMOUNT) continue;

      const perPaycheck = p.payFrequency === 'semi-monthly'
        ? Math.round((totalMonthly / 2) * 100) / 100
        : p.payFrequency === 'bi-weekly'
        ? Math.round(((totalMonthly * 12) / 26) * 100) / 100
        : p.payFrequency === 'weekly'
        ? Math.round(((totalMonthly * 12) / 52) * 100) / 100
        : totalMonthly;

      const deltaMonthly = Math.abs(totalMonthly - rawAmt);
      const deltaPaycheck = Math.abs(perPaycheck - rawAmt);

      // Use a wider tolerance for bill payments: 1% of amount, capped at $15
      // (bill splits can accumulate rounding from many line items)
      const billTolerance = Math.min(15.00, Math.max(0.02, rawAmt * 0.01));

      if (deltaMonthly <= billTolerance && deltaMonthly < minDelta) {
        minDelta = deltaMonthly;
        bestCandidate = { person: p, label: `${p.name} Monthly Payment - ${scopeLabel} ($${totalMonthly.toFixed(2)})`, delta: deltaMonthly };
      }
      if (perPaycheck >= MIN_EARNER_AMOUNT && deltaPaycheck <= billTolerance && deltaPaycheck < minDelta) {
        minDelta = deltaPaycheck;
        bestCandidate = { person: p, label: `${p.name} Semi-Monthly Payment - ${scopeLabel} ($${perPaycheck.toFixed(2)})`, delta: deltaPaycheck };
      }
    }

    // --- Tier 4: Net Pay (payroll direct deposit) ---
    const netPay = parseFloat(p.netPerPay) || 0;
    if (netPay >= MIN_EARNER_AMOUNT) {
      const deltaNet = Math.abs(netPay - rawAmt);
      if (deltaNet <= tolerance && deltaNet < minDelta) {
        minDelta = deltaNet;
        bestCandidate = { person: p, label: `${p.name} Net Paycheck ($${netPay.toFixed(2)})`, delta: deltaNet };
      }
      // Monthly net (two paychecks for semi-monthly / bi-weekly)
      const isBiOrSemi = p.payFrequency === 'semi-monthly' || p.payFrequency === 'bi-weekly';
      if (isBiOrSemi) {
        const netMonthly = Math.round(netPay * 2 * 100) / 100;
        const deltaNetMonthly = Math.abs(netMonthly - rawAmt);
        if (deltaNetMonthly <= tolerance && deltaNetMonthly < minDelta) {
          minDelta = deltaNetMonthly;
          bestCandidate = { person: p, label: `${p.name} Monthly Net ($${netMonthly.toFixed(2)})`, delta: deltaNetMonthly };
        }
      }
    }
  }

  if (bestCandidate) {
    return { person: bestCandidate.person, reason: bestCandidate.label };
  }

  return null;
}

/**
 * Row-by-row merge of incoming bills with existing bills.
 * Matches rows by bill name or bank document matching key, preserving existing comments/notes.
 * @param {any[]} existing
 * @param {any[]} incoming
 * @returns {any[]}
 */
export function mergeBills(existing = [], incoming = []) {
  const result = existing.map(b => ({ ...b }));

  incoming.forEach(inc => {
    const incName = (inc.name || '').toLowerCase().trim();
    const incKey = (inc.bankMatchNames || inc.matchingKey || '').toLowerCase().trim();

    const matchIdx = result.findIndex(ex => {
      const exName = (ex.name || '').toLowerCase().trim();
      const exKey = (ex.bankMatchNames || ex.matchingKey || '').toLowerCase().trim();

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

      // Merge matchingKey / bankMatchNames: retain existing if incoming is empty, or update if provided
      const rawIncKey = inc.bankMatchNames || inc.matchingKey;
      const rawExKey = ex.bankMatchNames || ex.matchingKey || '';
      const mergedKey = rawIncKey && rawIncKey.trim() ? rawIncKey.trim() : rawExKey;

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
        bankMatchNames: mergedKey,
        notes: mergedNotes,
        splits: (inc.splits && Object.keys(inc.splits).length > 0) ? inc.splits : ex.splits
      };
    } else {
      const newKey = inc.bankMatchNames || inc.matchingKey || '';
      result.push({
        ...inc,
        matchingKey: newKey,
        bankMatchNames: newKey,
        notes: inc.notes || ''
      });
    }
  });

  return result;
}



/**
 * Detects if a sheet's first row is an extra grouping/category row
 * (e.g. ",,,,Credits,,,,Outgoing Payments (Debits),,,,,,,,,,")
 * and row 1 is the actual column header row ("Date, Total Beg Balance, ...").
 * @param {any[][]} rawRows
 * @returns {{ hasExtraHeader: boolean, suggestedHeaderIdx: number, confidence: string, reason: string }}
 */
export function detectExtraHeaderRow(rawRows = []) {
  if (!rawRows || rawRows.length < 2) {
    return { hasExtraHeader: false, suggestedHeaderIdx: 0, confidence: 'low', reason: 'Too few rows' };
  }

  const row0 = (rawRows[0] || []).map(c => String(c || '').trim());
  const row1 = (rawRows[1] || []).map(c => String(c || '').trim());

  const row0Joined = row0.join(' ').toLowerCase();
  const row1Joined = row1.join(' ').toLowerCase();

  // Check for grouping keywords in row0
  const groupingKeywords = ['credit', 'outgoing', 'debit', 'payment', 'expense', 'income', 'category', 'transfer'];
  const hasGroupingWords = groupingKeywords.some(k => row0Joined.includes(k));

  // Check if row0 has many empty leading/sparse cells
  const row0NonEmptyCount = row0.filter(Boolean).length;
  const row1NonEmptyCount = row1.filter(Boolean).length;

  // Check if row1 has 'date', 'balance', 'total', etc.
  const hasDateInRow1 = row1.some(c => c.toLowerCase().includes('date'));
  const hasDateInRow0 = row0.some(c => c.toLowerCase().includes('date'));

  if (!hasDateInRow0 && hasDateInRow1) {
    return {
      hasExtraHeader: true,
      suggestedHeaderIdx: 1,
      confidence: 'high',
      reason: `Row 1 contains grouping headers (${row0.filter(Boolean).slice(0, 3).join(', ') || 'categories'}) while Row 2 contains column headers ("${row1.filter(Boolean).slice(0, 3).join(', ')}")`
    };
  }

  if (hasGroupingWords && row1NonEmptyCount > row0NonEmptyCount * 1.3) {
    return {
      hasExtraHeader: true,
      suggestedHeaderIdx: 1,
      confidence: 'high',
      reason: `Row 1 contains sparse category groupings, Row 2 contains ${row1NonEmptyCount} column names`
    };
  }

  return {
    hasExtraHeader: false,
    suggestedHeaderIdx: 0,
    confidence: 'medium',
    reason: 'Row 1 appears to be the primary column header row'
  };
}

/**
 * Inspects all sheets in a workbook array buffer, extracting metadata, previews, and header detection.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} fileName
 * @param {any[]} [existingAccounts]
 * @returns {{ isWorkbook: boolean, sheetNames: string[], sheetsInfo: any[] }}
 */
export function inspectWorkbookSheets(arrayBuffer, fileName = '', existingAccounts = []) {
  const byteLen = arrayBuffer?.byteLength ?? (typeof arrayBuffer === 'string' ? arrayBuffer.length : 0);
  if (byteLen > MAX_SPREADSHEET_FILE_SIZE) {
    throw new Error(`File size (${Math.round(byteLen / (1024 * 1024))}MB) exceeds maximum limit of 15MB.`);
  }
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true, cellDates: false });
  const sheetNames = workbook.SheetNames || [];

  const sheetsInfo = sheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    if (sheet && sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      const totalRows = range.e.r - range.s.r + 1;
      if (totalRows > MAX_SPREADSHEET_ROW_COUNT) {
        throw new Error(`Sheet "${name}" contains ${totalRows} rows, exceeding maximum limit of ${MAX_SPREADSHEET_ROW_COUNT}.`);
      }
    }
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const rowCount = rawRows.length;
    const previewRows = rawRows.slice(0, 5);

    const headerDetection = detectExtraHeaderRow(previewRows);

    // Match existing account by explicit ID or exact name match (no keyword heuristics)
    const lowerName = name.toLowerCase();
    const matchedAccount = existingAccounts.find(acc => {
      const accNorm = (acc.name || '').toLowerCase();
      const accId = (acc.id || '').toLowerCase();
      return accId === lowerName || accNorm === lowerName;
    });

    return {
      name,
      rowCount,
      previewRows,
      rawRows,
      hasExtraHeader: headerDetection.hasExtraHeader,
      suggestedHeaderIdx: headerDetection.suggestedHeaderIdx,
      detectionReason: headerDetection.reason,
      suggestedAccountId: matchedAccount ? matchedAccount.id : '',
      suggestedAccountName: matchedAccount ? matchedAccount.name : '',
    };
  });

  return {
    isWorkbook: sheetNames.length > 1,
    sheetNames,
    sheetsInfo
  };
}

