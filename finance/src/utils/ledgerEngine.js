// @ts-nocheck
import { isPersonDepositDay, getPersonDepositAmountForAccount, getPersonExtraSavingsDepositAmountForAccount } from './paydayUtils.js';

export const LEDGER_SOURCE = {
  PROJECTED: 'projected',
  ACTUAL_IMPORT: 'actual-import',
  MANUAL: 'manual',
  MOVED: 'moved'
};

export function allocateEarnerCredit(person, accountId, year, month, day, budget, dailyMatrix = {}, options = {}) {
  if (!person) return { earnerDeposit: 0, earnerExtra: 0, earnerReg: 0, source: LEDGER_SOURCE.PROJECTED };
  const mKey = year + '-' + String(month + 1).padStart(2, '0');
  const c = dailyMatrix[accountId + '_' + mKey + '_' + day + '_credit_' + person.id];
  const ec = dailyMatrix[accountId + '_' + mKey + '_' + day + '_extra_credit_' + person.id];
  const isDepDay = isPersonDepositDay(person, year, month, day);
  const projectedDeposit = (!options.isLockedDay && isDepDay) ? getPersonDepositAmountForAccount(person, accountId, budget) : 0;
  const projectedExtra = projectedDeposit > 0 ? getPersonExtraSavingsDepositAmountForAccount(person, accountId, budget) : 0;
  let earnerDeposit, earnerExtra, source;
  if (c !== undefined && c !== null && c !== '') {
    earnerDeposit = parseFloat(c) || 0;
    if (ec !== undefined && ec !== null && ec !== '') {
      earnerExtra = parseFloat(ec) || 0;
      source = LEDGER_SOURCE.MANUAL;
    } else {
      const billPortion = Math.max(0, projectedDeposit - projectedExtra);
      const availableForExtra = Math.max(0, earnerDeposit - billPortion);
      earnerExtra = Math.min(projectedExtra, availableForExtra);
      source = LEDGER_SOURCE.ACTUAL_IMPORT;
    }
  } else {
    earnerDeposit = projectedDeposit;
    earnerExtra = projectedExtra;
    source = LEDGER_SOURCE.PROJECTED;
  }
  const clampedExtra = Math.min(earnerExtra, earnerDeposit);
  const earnerReg = Math.max(0, earnerDeposit - clampedExtra);
  return {
    earnerDeposit: Math.round(earnerDeposit * 100) / 100,
    earnerExtra: Math.round(clampedExtra * 100) / 100,
    earnerReg: Math.round(earnerReg * 100) / 100,
    source
  };
}

/**
 * Read-only diagnostic: lists future-dated credit overrides that differ from plan.
 * @param {Object} budget budget context
 * @param {Object} [dailyMatrix]
 * @returns {Array<{accountId, monthKey, day, personId, override:number, projected:number, diff:number}>}
 */
export function listFutureCreditOverrideDiagnostics(budget, dailyMatrix = {}) {
  const accounts = budget?.accounts || [];
  const people = budget?.people || [];
  const today = new Date();
  const results = [];

  accounts.forEach(acc => {
    const accPeople = (acc.enabledEarners && Array.isArray(acc.enabledEarners))
      ? people.filter(p => acc.enabledEarners.includes(p.id))
      : people;

    accPeople.forEach(p => {
      for (let m = 0; m < 12; m++) {
        const date = new Date(today.getFullYear(), m, 1);
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const mKey = year + '-' + String(month + 1).padStart(2, '0');

        for (let day = 1; day <= daysInMonth; day++) {
          const c = dailyMatrix[acc.id + '_' + mKey + '_' + day + '_credit_' + p.id];
          if (c === undefined || c === null || c === '') continue;
          const override = parseFloat(c) || 0;
          const projected = getPersonDepositAmountForAccount(p, acc.id, budget);
          if (Math.abs(override - projected) > 0.005) {
            results.push({
              accountId: acc.id,
              accountName: acc.name,
              monthKey,
              day,
              personId: p.id,
              personName: p.name,
              override: Math.round(override * 100) / 100,
              projected: Math.round(projected * 100) / 100,
              diff: Math.round((override - projected) * 100) / 100
            });
          }
        }
      }
    });
  });

  return results;
}
