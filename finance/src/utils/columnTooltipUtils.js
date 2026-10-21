// src/utils/columnTooltipUtils.js
// Utility functions for column header tooltip calculations, date clamping,
// and transaction/dailyMatrix reconciliation.

import { fmtMoney } from './formatters.js';
import { matchCreditToEarner } from './importer.js';

/**
 * Format raw date strings into MM/DD/YYYY cleanly without timezone drift.
 * @param {string|number|Date} rawDate
 * @returns {string}
 */
export function formatTxnDate(rawDate) {
  if (!rawDate) return '--/--/----';
  const str = String(rawDate).trim();
  // If already MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split('/');
    return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
  }
  // If YYYY-MM-DD or YYYY/MM/DD
  const mYmd = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (mYmd) {
    const [, y, m, d] = mYmd;
    return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
  }
  // Fallback to native Date parser
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${m}/${d}/${y}`;
  }
  return str;
}

/**
 * Normalizes statement aliases into an array of strings.
 * @param {Object} column
 * @param {string} type
 * @returns {string[]}
 */
export function getColumnAliases(column, type = 'bill') {
  if (!column) return [];
  const raw = (column.bankMatchNames !== undefined && column.bankMatchNames !== '')
    ? column.bankMatchNames
    : (column.matchingKey || column.matching_key || '');
  if (Array.isArray(raw)) {
    return raw.map(k => String(k).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;\n\r|]+/)
      .map(k => k.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Normalizes any date representation (YYYY-MM-DD, MM/DD/YYYY, Date instance) into a comparable 'YYYY-MM-DD' string.
 * @param {string|number|Date} rawDate
 * @returns {string}
 */
export function toYmd(rawDate) {
  if (!rawDate) return '';
  if (rawDate instanceof Date) {
    const y = rawDate.getFullYear();
    const m = String(rawDate.getMonth() + 1).padStart(2, '0');
    const d = String(rawDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(rawDate).trim();
  const mYmd = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (mYmd) {
    return `${mYmd[1]}-${String(mYmd[2]).padStart(2, '0')}-${String(mYmd[3]).padStart(2, '0')}`;
  }
  const mMdy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mMdy) {
    return `${mMdy[3]}-${String(mMdy[1]).padStart(2, '0')}-${String(mMdy[2]).padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return str;
}

/**
 * Gathers up to the last 10 transactions for a column from both the
 * transactions array (imports/ledger) and dailyMatrix cell entries.
 * Strictly limits results to prior transactions (dates on or before today / asOfDate).
 *
 * @param {Object} params
 * @param {Object} params.column Column object (person or bill)
 * @param {'bill'|'person'} [params.type='bill']
 * @param {Array} [params.transactions=[]]
 * @param {Object} [params.dailyMatrix={}]
 * @param {string} [params.selectedAccountId='all']
 * @param {string|Date|null} [params.asOfDate=null]
 * @param {Array} [params.people=[]]
 * @param {Array} [params.accounts=[]]
 * @returns {Array<{ id: string, date: string, amount: number, description: string }>}
 */
export function getColumnRecentTransactions({
  column,
  type = 'bill',
  transactions = [],
  dailyMatrix = {},
  selectedAccountId = 'all',
  asOfDate = null,
  people = [],
  accounts = []
}) {
  if (!column) return [];
  const results = [];
  const seenKeys = new Set();

  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cutoffYmd = asOfDate ? toYmd(asOfDate) : todayYmd;

  const colId = column.id;
  const colNameLower = (column.name || '').toLowerCase();
  const aliases = getColumnAliases(column, type).map(a => a.toLowerCase());

  const seenTxnDates = new Set();

  // Helper to retrieve any explicit dailyMatrix entry for a specific column on a date
  const getMatrixCell = (accId, mKey, day, kind, targetId) => {
    if (!dailyMatrix || typeof dailyMatrix !== 'object') return null;
    if (accId) {
      const directKey = `${accId}_${mKey}_${day}_${kind}_${targetId}`;
      if (dailyMatrix[directKey] !== undefined && dailyMatrix[directKey] !== null && dailyMatrix[directKey] !== '') {
        return { val: Math.abs(parseFloat(dailyMatrix[directKey]) || 0), key: directKey };
      }
    }
    const suffix = `_${mKey}_${day}_${kind}_${targetId}`;
    for (const [k, v] of Object.entries(dailyMatrix)) {
      if (k.endsWith(suffix) && v !== undefined && v !== null && v !== '') {
        return { val: Math.abs(parseFloat(v) || 0), key: k };
      }
    }
    return null;
  };

  // Helper to test if another column of the same kind has an active non-zero entry on that date
  const hasOtherMatrixCell = (accId, mKey, day, kind, targetId) => {
    if (!dailyMatrix || typeof dailyMatrix !== 'object') return false;
    const targetSuffix = `_${kind}_${targetId}`;
    if (accId) {
      const prefix = `${accId}_${mKey}_${day}_${kind}_`;
      for (const [k, v] of Object.entries(dailyMatrix)) {
        if (k.startsWith(prefix) && !k.endsWith(targetSuffix)) {
          if (v !== undefined && v !== null && v !== '' && Math.abs(parseFloat(v) || 0) > 0) {
            return true;
          }
        }
      }
      return false;
    }
    const daySegment = `_${mKey}_${day}_${kind}_`;
    for (const [k, v] of Object.entries(dailyMatrix)) {
      if (k.includes(daySegment) && !k.endsWith(targetSuffix)) {
        if (v !== undefined && v !== null && v !== '' && Math.abs(parseFloat(v) || 0) > 0) {
          return true;
        }
      }
    }
    return false;
  };

  // 1. Scan transactions array (strictly prior to cutoff date)
  if (Array.isArray(transactions)) {
    for (const t of transactions) {
      if (!t) continue;
      if (selectedAccountId !== 'all' && t.accountId && t.accountId !== selectedAccountId) {
        continue;
      }

      const dStr = t.date || '';
      const ymd = toYmd(dStr);
      if (!ymd || ymd > cutoffYmd) {
        continue;
      }

      const parts = ymd.split('-');
      const ymdAccId = t.accountId || (selectedAccountId !== 'all' ? selectedAccountId : column.accountId);
      const mKey = parts.length === 3 ? `${parts[0]}-${parts[1]}` : null;
      const day = parts.length === 3 ? parseInt(parts[2], 10) : null;

      let isMatch = false;
      if (type === 'bill') {
        if (t.billId === colId) {
          isMatch = !(mKey && day && !(getMatrixCell(ymdAccId, mKey, day, 'bill', colId)?.val > 0) && hasOtherMatrixCell(ymdAccId, mKey, day, 'bill', colId));
        } else if (!t.billId && !t.personId) {
          if (mKey && day) {
            const myCell = getMatrixCell(ymdAccId, mKey, day, 'bill', colId);
            if (myCell && myCell.val > 0) {
              isMatch = true;
            } else if (hasOtherMatrixCell(ymdAccId, mKey, day, 'bill', colId)) {
              isMatch = false;
            } else {
              const descLower = (t.description || '').toLowerCase();
              const notesLower = (t.notes || '').toLowerCase();
              const aliasMatch = aliases.some(a => a.length >= 2 && (descLower.includes(a) || notesLower.includes(a)));
              const nameMatch = colNameLower && (descLower.includes(colNameLower) || notesLower.includes(colNameLower));
              if (aliasMatch || nameMatch) isMatch = true;
            }
          } else {
            const descLower = (t.description || '').toLowerCase();
            const notesLower = (t.notes || '').toLowerCase();
            const aliasMatch = aliases.some(a => a.length >= 2 && (descLower.includes(a) || notesLower.includes(a)));
            const nameMatch = colNameLower && (descLower.includes(colNameLower) || notesLower.includes(colNameLower));
            if (aliasMatch || nameMatch) isMatch = true;
          }
        }
      } else if (type === 'person') {
        if (t.personId === colId) {
          isMatch = !(mKey && day && !(getMatrixCell(ymdAccId, mKey, day, 'credit', colId)?.val > 0) && hasOtherMatrixCell(ymdAccId, mKey, day, 'credit', colId));
        } else if (!t.billId && !t.personId) {
          if (mKey && day) {
            const myCell = getMatrixCell(ymdAccId, mKey, day, 'credit', colId);
            if (myCell && myCell.val > 0) {
              isMatch = true;
            } else if (hasOtherMatrixCell(ymdAccId, mKey, day, 'credit', colId)) {
              // Another earner owns this credit on the ledger; do not claim via alias
              isMatch = false;
            } else if (people && people.length > 0) {
              const creditMatch = matchCreditToEarner({
                amount: Math.abs(parseFloat(t.amount) || 0),
                description: t.description || '',
                notes: t.notes || '',
                category: t.category || '',
                targetAccountId: ymdAccId || selectedAccountId,
                people,
                accounts
              });
              if (creditMatch?.person?.id === colId) {
                isMatch = true;
              }
            } else {
              const descLower = (t.description || '').toLowerCase();
              const notesLower = (t.notes || '').toLowerCase();
              const aliasMatch = aliases.some(a => a.length >= 2 && (descLower.includes(a) || notesLower.includes(a)));
              const nameMatch = colNameLower && (descLower.includes(colNameLower) || notesLower.includes(colNameLower));
              if (aliasMatch || nameMatch) isMatch = true;
            }
          } else if (people && people.length > 0) {
            const creditMatch = matchCreditToEarner({
              amount: Math.abs(parseFloat(t.amount) || 0),
              description: t.description || '',
              notes: t.notes || '',
              category: t.category || '',
              targetAccountId: ymdAccId || selectedAccountId,
              people,
              accounts
            });
            if (creditMatch?.person?.id === colId) {
              isMatch = true;
            }
          } else {
            const descLower = (t.description || '').toLowerCase();
            const notesLower = (t.notes || '').toLowerCase();
            const aliasMatch = aliases.some(a => a.length >= 2 && (descLower.includes(a) || notesLower.includes(a)));
            const nameMatch = colNameLower && (descLower.includes(colNameLower) || notesLower.includes(colNameLower));
            if (aliasMatch || nameMatch) isMatch = true;
          }
        }
      }

      if (isMatch) {
        let amt = Math.abs(parseFloat(t.amount) || 0);
        // If dailyMatrix has an explicit recorded cell for this date, align amt with dailyMatrix cell
        if (mKey && day) {
          const kind = type === 'bill' ? 'bill' : 'credit';
          const matrixEntry = getMatrixCell(ymdAccId, mKey, day, kind, colId);
          if (matrixEntry && matrixEntry.val > 0) {
            if (Math.abs(amt - matrixEntry.val) > 0.009) {
              amt = matrixEntry.val;
            }
          }
        }

        if (amt > 0) {
          const dedupKey = `${ymd}_${amt.toFixed(2)}`;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            seenTxnDates.add(ymd);
            results.push({
              id: t.id || `txn-${dedupKey}`,
              date: ymd,
              amount: amt,
              description: t.description || column.name
            });
          }
        }
      }
    }
  }

  // 2. Scan dailyMatrix for recorded non-zero cell entries (strictly prior to cutoff date)
  if (dailyMatrix && typeof dailyMatrix === 'object') {
    const targetSuffix = type === 'bill' ? `_bill_${colId}` : `_credit_${colId}`;
    for (const [key, val] of Object.entries(dailyMatrix)) {
      const numVal = parseFloat(val);
      if (!numVal || numVal === 0 || isNaN(numVal)) continue;

      if (key.endsWith(targetSuffix)) {
        const prefix = key.slice(0, -targetSuffix.length);
        const parts = prefix.split('_');
        if (parts.length >= 3) {
          const accId = parts.slice(0, parts.length - 2).join('_');
          const monthKey = parts[parts.length - 2];
          const day = parts[parts.length - 1];

          if (selectedAccountId === 'all' || accId === selectedAccountId) {
            const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
            const ymd = toYmd(dateStr);
            if (!ymd || ymd > cutoffYmd || seenTxnDates.has(ymd)) {
              continue;
            }

            const amt = Math.abs(numVal);
            const dedupKey = `${ymd}_${amt.toFixed(2)}`;
            if (!seenKeys.has(dedupKey)) {
              seenKeys.add(dedupKey);
              results.push({
                id: `matrix-${key}`,
                date: ymd,
                amount: amt,
                description: column.name
              });
            }
          }
        }
      }
    }
  }

  // Sort descending by date (most recent prior first)
  results.sort((a, b) => {
    const ymdA = toYmd(a.date);
    const ymdB = toYmd(b.date);
    return ymdB.localeCompare(ymdA);
  });

  return results.slice(0, 10);
}
