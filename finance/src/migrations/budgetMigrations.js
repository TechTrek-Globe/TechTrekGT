/**
 * Versioned schema migration runner for TechTrek Budget payloads (Tier C5 & C8).
 * Ensures deterministic, schema-tracked transformations across client and cloud storage.
 */

export const CURRENT_BUDGET_SCHEMA_VERSION = 2;

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
      const directMatch = accList.find(a => a.id === targetAccountId);
      if (!directMatch) {
        let nameMatch = null;
        const lowTarget = String(targetAccountId).toLowerCase();
        if (lowTarget.includes('mortgage')) {
          nameMatch = accList.find(a => a.name && a.name.toLowerCase().includes('mortgage'));
        } else if (lowTarget.includes('hoa')) {
          nameMatch = accList.find(a => a.name && a.name.toLowerCase().includes('hoa'));
        } else if (lowTarget.includes('bills')) {
          nameMatch = accList.find(a => a.name && a.name.toLowerCase().includes('bills'));
        }
        if (nameMatch) {
          targetAccountId = nameMatch.id;
        }
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
    currentVersion = 2;
    wasMigrated = true;

    migrationDetails.v2 = {
      prunedGhostDayKeys: removedCount,
      removedKeys,
      goalsNormalized: (migrated.fundingGoals || []).length
    };
  }

  return { budget: migrated, wasMigrated, details: migrationDetails };
}
