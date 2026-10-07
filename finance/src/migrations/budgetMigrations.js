/**
 * Versioned schema migration runner for TechTrek Budget payloads (Tier C5 & C8).
 * Ensures deterministic, schema-tracked transformations across client and cloud storage.
 */

import { round2 } from '../utils/formatters.js';

export const CURRENT_BUDGET_SCHEMA_VERSION = 3;

/**
 * Prunes orphaned matrix keys that reference nonexistent calendar days (Tier C8).
 * E.g. day 31 in September/April/June/November, or days 29/30/31 in February.
 *
 * @param {Object} dailyMatrix
 * @returns {{ cleanedMatrix: Object, removedCount: number, removedKeys: string[] }}
 */
export function pruneInvalidMatrixDayKeys(dailyMatrix) {
  if (!dailyMatrix || typeof dailyMatrix !== 'object') {
    return { cleanedMatrix: {}, removedCount: 0, removedKeys: [] };
  }

  const cleanedMatrix = {};
  const removedKeys = [];

  for (const [key, val] of Object.entries(dailyMatrix)) {
    const match = key.match(/_(\d{4})-(\d{2})_(\d+)_/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const maxDays = new Date(year, month, 0).getDate();
      if (day > maxDays) {
        removedKeys.push(key);
        continue;
      }
    }
    cleanedMatrix[key] = val;
  }

  return { cleanedMatrix, removedCount: removedKeys.length, removedKeys };
}

/**
 * Heals corrupted ledger rows and accounts where extra savings ending or beginning
 * balance was forced negative (Tier C / FIX-16).
 * Reallocates the negative offset back to the regular operating balance.
 *
 * @param {Array} accounts
 * @returns {{ healedAccounts: Array, modifiedCount: number }}
 */
export function healCorruptedLedgerRows(accounts = []) {
  if (!Array.isArray(accounts)) return { healedAccounts: [], modifiedCount: 0 };
  let modifiedCount = 0;
  const healedAccounts = accounts.map(acc => {
    let accModified = false;
    let newStartingBalance = acc.startingBalance;
    let newExtraStartingBalance = acc.extraStartingBalance;

    if (acc.extraStartingBalance !== undefined && acc.extraStartingBalance !== null && Number(acc.extraStartingBalance) < 0) {
      const neg = Number(acc.extraStartingBalance);
      newStartingBalance = round2((Number(newStartingBalance) || 0) + neg);
      newExtraStartingBalance = 0;
      accModified = true;
    }

    let newImportedRows = acc.importedLedgerRows;
    if (acc.importedLedgerRows && typeof acc.importedLedgerRows === 'object') {
      newImportedRows = { ...acc.importedLedgerRows };
      for (const [dateKey, row] of Object.entries(newImportedRows)) {
        if (!row || typeof row !== 'object') continue;
        let rowModified = false;
        let rRegEnd = row.regEnding;
        let rExtraEnd = row.extraEnding;
        let rRegBeg = row.regBeg;
        let rExtraBeg = row.extraBeg;

        if (rExtraEnd !== undefined && rExtraEnd !== null && Number(rExtraEnd) < 0) {
          const neg = Number(rExtraEnd);
          rRegEnd = round2((Number(rRegEnd) || 0) + neg);
          rExtraEnd = 0;
          rowModified = true;
        }
        if (rExtraBeg !== undefined && rExtraBeg !== null && Number(rExtraBeg) < 0) {
          const neg = Number(rExtraBeg);
          rRegBeg = round2((Number(rRegBeg) || 0) + neg);
          rExtraBeg = 0;
          rowModified = true;
        }

        if (rowModified) {
          newImportedRows[dateKey] = {
            ...row,
            regEnding: rRegEnd,
            extraEnding: rExtraEnd,
            regBeg: rRegBeg,
            extraBeg: rExtraBeg,
            totalEnding: round2(rRegEnd + rExtraEnd),
            totalBeg: round2(rRegBeg + rExtraBeg)
          };
          accModified = true;
        }
      }
    }

    if (accModified) {
      modifiedCount++;
      return {
        ...acc,
        startingBalance: newStartingBalance,
        extraStartingBalance: newExtraStartingBalance,
        importedLedgerRows: newImportedRows
      };
    }
    return acc;
  });

  return { healedAccounts, modifiedCount };
}

/**
 * Normalizes funding goals into flat per-paycheck models without mutating stored dollar amounts.
 *
 * @param {Array} goals
 * @param {Array} people
 * @param {Array} accounts
 * @returns {Array}
 */
export function normalizeFundingGoals(goals = [], people = [], accounts = []) {
  if (!Array.isArray(goals)) return [];
  const accList = Array.isArray(accounts) ? accounts : [];

  return goals.map(g => {
    let amountPerPay = g.amountPerPay;
    if (amountPerPay === undefined) {
      amountPerPay = Number(g.amount) || 0;
    }

    let targetAccountId = g.accountId;
    if (accList.length > 0 && targetAccountId) {
      const directMatch = accList.find(a => a.id === targetAccountId || a.name === targetAccountId);
      if (directMatch) {
        targetAccountId = directMatch.id;
      }
    }

    const normalized = {
      ...g,
      accountId: targetAccountId,
      amountPerPay: Math.round(Number(amountPerPay || 0) * 100) / 100
    };
    delete normalized.amount;
    delete normalized.frequency;
    return normalized;
  });
}

/**
 * Executes all pending schema migrations sequentially up to CURRENT_BUDGET_SCHEMA_VERSION.
 *
 * @param {Object} budget
 * @returns {{ budget: Object, wasMigrated: boolean, details: Object }}
 */
export function runBudgetMigrations(budget) {
  if (!budget || typeof budget !== 'object') {
    return { budget, wasMigrated: false, details: {} };
  }

  let migrated = { ...budget };
  let currentVersion = Number(migrated.schemaVersion || 1);
  let wasMigrated = false;
  const migrationDetails = {};

  // Migration V1 -> V2: Prune invalid calendar day keys (C8) and normalize funding goals (C5)
  if (currentVersion < 2) {
    const { cleanedMatrix, removedCount, removedKeys } = pruneInvalidMatrixDayKeys(migrated.dailyMatrix || {});
    migrated.dailyMatrix = cleanedMatrix;

    migrated.fundingGoals = normalizeFundingGoals(
      migrated.fundingGoals || [],
      migrated.people || [],
      migrated.accounts || []
    );

    migrated.schemaVersion = 2;
    wasMigrated = true;

    migrationDetails.v2 = {
      prunedGhostDayKeys: removedCount,
      removedKeys,
      goalsNormalized: (migrated.fundingGoals || []).length
    };
    currentVersion = 2;
  }

  // Migration V2 -> V3: Heal corrupted ledger rows with negative extraEnding / extraBeg (FIX-16)
  if (currentVersion < 3) {
    const { healedAccounts, modifiedCount } = healCorruptedLedgerRows(migrated.accounts || []);
    if (modifiedCount > 0) {
      migrated.accounts = healedAccounts;
    }

    migrated.schemaVersion = 3;
    wasMigrated = true;

    migrationDetails.v3 = {
      healedAccountsCount: modifiedCount
    };
    currentVersion = 3;
  }

  return { budget: migrated, wasMigrated, details: migrationDetails };
}

/**
 * Proposed legacy bill amount correction (FIX-14).
 * Identifies legacy precision drift for explicit owner review and approval.
 * Does NOT run automatically on real user data during runBudgetMigrations.
 *
 * @param {Array} bills
 * @returns {{ proposedBills: Array, changes: Array }}
 */
export function proposeLegacyBillCorrections(bills = []) {
  if (!Array.isArray(bills)) return { proposedBills: [], changes: [] };
  const changes = [];
  const proposedBills = bills.map(b => {
    const amt = Number(b.amount) || 0;
    let newAmt = amt;
    if (Math.abs(amt - 442.32) < 0.01) {
      newAmt = 444.00;
      changes.push({
        billId: b.id,
        name: b.name,
        currentAmount: amt,
        proposedAmount: newAmt,
        reason: 'Legacy HOA rounding correction (requires owner approval)'
      });
    } else if (Math.abs(amt - 2601.45) < 0.01 || Math.abs(amt - 2757.68) < 0.01) {
      newAmt = 2756.00;
      changes.push({
        billId: b.id,
        name: b.name,
        currentAmount: amt,
        proposedAmount: newAmt,
        reason: 'Legacy Mortgage rounding correction (requires owner approval)'
      });
    }
    return { ...b, amount: newAmt };
  });

  return { proposedBills, changes };
}
