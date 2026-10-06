// @ts-nocheck
import { isPersonDepositDay, getPersonDepositAmountForAccount, getPersonExtraSavingsDepositAmountForAccount, getPersonDepositDatesForMonth } from './paydayUtils.js';
import { round2, parseMoney } from './formatters.js';

export const LEDGER_SOURCE = {
  PROJECTED: 'projected',
  ACTUAL_IMPORT: 'actual-import',
  MANUAL: 'manual',
  MOVED: 'moved'
};

export function allocateEarnerCredit(person, accountId, year, month, day, budget, dailyMatrix = {}, options = {}) {
  if (!person) return { earnerDeposit: 0, earnerExtra: 0, earnerReg: 0, source: LEDGER_SOURCE.PROJECTED };

  if (accountId === 'all' && budget?.accounts?.length) {
    let totalDeposit = 0;
    let totalExtra = 0;
    let totalReg = 0;
    let anyActual = false;
    let anyManual = false;

    const subOptions = { ...options };
    delete subOptions.planDeposit;
    delete subOptions.planExtra;

    budget.accounts.forEach(acc => {
      const isEnabled = !acc.enabledEarners || (Array.isArray(acc.enabledEarners) && acc.enabledEarners.includes(person.id));
      if (!isEnabled) return;
      const subAlloc = allocateEarnerCredit(person, acc.id, year, month, day, budget, dailyMatrix, subOptions);
      totalDeposit = round2(totalDeposit + subAlloc.earnerDeposit);
      totalExtra = round2(totalExtra + subAlloc.earnerExtra);
      totalReg = round2(totalReg + subAlloc.earnerReg);
      if (subAlloc.source === LEDGER_SOURCE.ACTUAL_IMPORT) anyActual = true;
      if (subAlloc.source === LEDGER_SOURCE.MANUAL) anyManual = true;
    });

    const source = anyManual ? LEDGER_SOURCE.MANUAL : (anyActual ? LEDGER_SOURCE.ACTUAL_IMPORT : LEDGER_SOURCE.PROJECTED);
    return {
      earnerDeposit: round2(totalDeposit),
      earnerExtra: round2(totalExtra),
      earnerReg: round2(totalReg),
      source
    };
  }

  const targetAcc = (budget?.accounts || []).find(a => a.id === accountId);
  const showExtra = targetAcc ? targetAcc.enableExtraSavings !== false : true;

  const mKey = year + '-' + String(month + 1).padStart(2, '0');
  const c = dailyMatrix[accountId + '_' + mKey + '_' + day + '_credit_' + person.id];
  const ec = dailyMatrix[accountId + '_' + mKey + '_' + day + '_extra_credit_' + person.id];
  const isDepDay = isPersonDepositDay(person, year, month, day);
  const projectedPlanDeposit = options.planDeposit !== undefined ? options.planDeposit : round2(getPersonDepositAmountForAccount(person, accountId, budget));
  const projectedPlanExtra = (!showExtra) ? 0 : (options.planExtra !== undefined ? options.planExtra : (projectedPlanDeposit > 0 ? round2(getPersonExtraSavingsDepositAmountForAccount(person, accountId, budget)) : 0));
  const projectedDeposit = (!options.isLockedDay && isDepDay) ? projectedPlanDeposit : 0;
  const projectedExtra = projectedDeposit > 0 ? projectedPlanExtra : 0;
  let earnerDeposit, earnerExtra, source;
  if (c !== undefined && c !== null && c !== '') {
    earnerDeposit = parseMoney(c, 0);
    if (ec !== undefined && ec !== null && ec !== '') {
      earnerExtra = parseMoney(ec, 0);
      source = LEDGER_SOURCE.MANUAL;
    } else {
      const billPortion = Math.max(0, round2(projectedPlanDeposit - projectedPlanExtra));
      const availableForExtra = Math.max(0, round2(earnerDeposit - billPortion));
      earnerExtra = showExtra ? Math.min(projectedPlanExtra, availableForExtra) : 0;
      source = LEDGER_SOURCE.ACTUAL_IMPORT;
    }
  } else {
    let finalProjected = projectedDeposit;
    if (finalProjected > 0 && hasImportedCreditInPayPeriod(person, accountId, year, month, day, budget, dailyMatrix)) {
      finalProjected = 0;
    }
    earnerDeposit = finalProjected;
    earnerExtra = finalProjected > 0 ? projectedExtra : 0;
    source = LEDGER_SOURCE.PROJECTED;
  }
  const clampedExtra = showExtra ? Math.min(earnerExtra, earnerDeposit) : 0;
  const earnerReg = Math.max(0, round2(earnerDeposit - clampedExtra));
  return {
    earnerDeposit: round2(earnerDeposit),
    earnerExtra: round2(clampedExtra),
    earnerReg: round2(earnerReg),
    source
  };
}

/**
 * Checks whether an imported/stored credit exists for a person in the given account
 * within the pay period corresponding to the specified day.
 */
export function hasImportedCreditInPayPeriod(person, accountId, year, month, day, budget, dailyMatrix = {}) {
  if (!person || !accountId || !dailyMatrix) return false;
  const mKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const targetDates = getPersonDepositDatesForMonth(person, year, month);
  const targetDays = targetDates.map(d => d.getDate()).sort((a, b) => a - b);
  if (targetDays.length === 0) return false;

  let startDay = 1;
  let endDay = daysInMonth;

  if (targetDays.length > 1) {
    let idx = targetDays.indexOf(day);
    if (idx === -1) {
      idx = targetDays.reduce((best, cur, i) => Math.abs(cur - day) < Math.abs(targetDays[best] - day) ? i : best, 0);
    }
    startDay = idx === 0 ? 1 : Math.floor((targetDays[idx - 1] + targetDays[idx]) / 2) + 1;
    endDay = idx === targetDays.length - 1 ? daysInMonth : Math.floor((targetDays[idx] + targetDays[idx + 1]) / 2);
  }

  for (let d = startDay; d <= endDay; d++) {
    if (d === day) continue;
    const val = dailyMatrix[`${accountId}_${mKey}_${d}_credit_${person.id}`];
    if (val !== undefined && val !== null && val !== '') {
      const num = parseMoney(val, 0);
      if (num > 0) return true;
    }
  }

  return false;
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
          const override = parseMoney(c, 0);
          const projected = round2(getPersonDepositAmountForAccount(p, acc.id, budget));
          if (Math.abs(override - projected) > 0.005) {
            results.push({
              accountId: acc.id,
              accountName: acc.name,
              monthKey: mKey,
              day,
              personId: p.id,
              personName: p.name,
              override: round2(override),
              projected: round2(projected),
              diff: round2(override - projected)
            });
          }
        }
      }
    });
  });

  return results;
}
