// @ts-nocheck
import {
  isPersonDepositDay,
  getPersonDepositAmountForAccount,
  getPersonExtraSavingsDepositAmountForAccount,
  getPersonDepositDatesForMonth,
  effectiveDueDay,
  isBillDueInMonth
} from './paydayUtils.js';
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
  
  // Fix offset regression: negative extra savings should not mathematically inflate regular deposits
  const effectiveExtraToSubtract = Math.max(0, earnerExtra);
  const clampedExtraToSubtract = showExtra ? Math.min(effectiveExtraToSubtract, Math.max(0, earnerDeposit)) : 0;
  
  // earnerExtra preserves its true negative value if it's a deduction,
  // but we only subtract positive extra savings from the regular deposit.
  const clampedExtra = showExtra ? (earnerExtra < 0 ? earnerExtra : clampedExtraToSubtract) : 0;
  const earnerReg = Math.max(0, round2(earnerDeposit - clampedExtraToSubtract));
  
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

function parseIsoDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }
  if (typeof val === 'string') {
    const parts = val.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

/**
 * Canonical running balance calculator for Finance OS.
 * Unifies balance simulation across LedgerDataContext and spreadsheet export.
 *
 * @param {Object} options
 * @param {string} options.targetAccountId
 * @param {string|Date} options.targetDate
 * @param {Object} options.metadataState - { accounts, people, bills, lineItems }
 * @param {Object} [options.dailyMatrix]
 * @param {Array} [options.transactions]
 * @param {Array} [options.lineItems]
 * @param {boolean} [options.detailed] - If true, returns balance breakdown object
 * @param {string} [options.todayStr] - Custom ISO date string for today lock clamp
 * @param {number} [options.maxDays] - Safety cap for simulation loop iterations (default 1826: 5 years)
 * @returns {number|{reg: number, extra: number, total: number, regEnding: number, extraEnding: number, totalEnd: number}}
 */
export function calculateRunningBalanceAsOf({
  targetAccountId,
  targetDate,
  metadataState = {},
  dailyMatrix = {},
  transactions = [],
  lineItems = null,
  detailed = false,
  todayStr: customTodayStr = null,
  maxDays = 1826
}) {
  const accounts = metadataState.accounts || [];
  const targetAcc = accounts.find(a => a.id === targetAccountId) || accounts[0];
  if (!targetAcc) {
    const empty = { reg: 0, extra: 0, total: 0, regEnding: 0, extraEnding: 0, totalEnd: 0 };
    return detailed ? empty : 0;
  }

  const showExtra = targetAcc.enableExtraSavings !== false;
  const startReg = parseMoney(targetAcc.startingBalance, 0);
  const startExtra = showExtra ? parseMoney(targetAcc.extraStartingBalance, 0) : 0;
  const effectiveStartDateStr = targetAcc.balanceAsOfDate || targetAcc.startDate || '2024-01-01';

  if (!targetDate) {
    const total = round2(startReg + startExtra);
    const res = { reg: startReg, extra: startExtra, total, regEnding: startReg, extraEnding: startExtra, totalEnd: total };
    return detailed ? res : total;
  }

  const startDateObj = parseIsoDate(effectiveStartDateStr) || new Date(2024, 0, 1);
  const targetDateObj = parseIsoDate(targetDate);

  if (!targetDateObj || targetDateObj < startDateObj) {
    const targetIsoStr = targetDateObj ? `${targetDateObj.getFullYear()}-${String(targetDateObj.getMonth() + 1).padStart(2, '0')}-${String(targetDateObj.getDate()).padStart(2, '0')}` : '';
    const accTxns = (transactions || []).filter(t => t.accountId === targetAccountId && t.date && t.date <= targetIsoStr);
    const sum = accTxns.reduce((s, t) => s + parseMoney(t.amount, 0), 0);
    const reg = round2(startReg + sum);
    const total = round2(reg + startExtra);
    const res = { reg, extra: startExtra, total, regEnding: reg, extraEnding: startExtra, totalEnd: total };
    return detailed ? res : total;
  }

  const allAccTxnDates = (transactions || [])
    .filter(t => t.accountId === targetAccountId && t.date)
    .map(t => t.date)
    .sort();
  const earliestTxnDate = allAccTxnDates.length > 0 ? parseIsoDate(allAccTxnDates[0]) : null;

  let simulationStartDate = startDateObj;
  if (earliestTxnDate && earliestTxnDate < simulationStartDate) {
    simulationStartDate = earliestTxnDate;
  }

  const allPeople = metadataState.people || [];
  const people = (targetAcc.enabledEarners && Array.isArray(targetAcc.enabledEarners))
    ? allPeople.filter(p => targetAcc.enabledEarners.includes(p.id))
    : allPeople;
  const bills = (metadataState.bills || []).filter(b => b.accountId === targetAccountId);

  const accTxns = (transactions || []).filter(t => t.accountId === targetAccountId && t.date);
  const maxTxnDate = accTxns.length > 0 ? accTxns.map(t => t.date).sort().pop() : null;
  const isImportMode = targetAcc.ledgerMode === 'import' || (targetAcc.importedLedgerRows && Object.keys(targetAcc.importedLedgerRows).length > 0) || accTxns.length > 0;
  const importedRows = isImportMode ? (targetAcc.importedLedgerRows || {}) : {};
  const importedDatesList = Object.keys(importedRows);
  const maxImportDateStr = importedDatesList.length > 0 ? importedDatesList.reduce((a, b) => a > b ? a : b) : null;
  const maxDataDate = [maxImportDateStr, maxTxnDate].filter(Boolean).sort().pop() || null;
  const today = new Date();
  const todayStr = customTodayStr || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const effectiveLockEnd = maxDataDate && maxDataDate < todayStr ? maxDataDate : todayStr;

  const earnerPlanCache = new Map();
  people.forEach(p => {
    const planDep = round2(getPersonDepositAmountForAccount(p, targetAccountId, metadataState));
    const planExtra = planDep > 0 ? round2(getPersonExtraSavingsDepositAmountForAccount(p, targetAccountId, metadataState)) : 0;
    earnerPlanCache.set(p.id, { planDeposit: planDep, planExtra });
  });

  const resolvedLineItems = lineItems || metadataState.lineItems || [];
  const lineItemsMap = new Map();
  for (const li of resolvedLineItems) {
    if (li && li.billId && li.monthKey) {
      lineItemsMap.set(`${li.billId}_${li.monthKey}`, li.actualAmount);
    }
  }

  let runningReg = startReg;
  let runningExtra = startExtra;

  let cur = new Date(simulationStartDate);
  let iterations = 0;
  while (cur <= targetDateObj && iterations < maxDays) {
    iterations++;
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const d = cur.getDate();
    const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;
    const isoDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isLockedDay = Boolean(isImportMode && maxDataDate && isoDate <= effectiveLockEnd);

    let dayCredits = 0;
    let dayExtraCredits = 0;
    people.forEach(p => {
      const plan = earnerPlanCache.get(p.id);
      const alloc = allocateEarnerCredit(p, targetAccountId, y, m, d, metadataState, dailyMatrix, {
        isLockedDay,
        planDeposit: plan?.planDeposit,
        planExtra: plan?.planExtra
      });
      dayCredits = round2(dayCredits + alloc.earnerReg);
      dayExtraCredits = round2(dayExtraCredits + alloc.earnerExtra);
    });

    let dayBills = 0;
    bills.forEach(b => {
      const bVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_bill_${b.id}`];
      let amt = 0;
      const expectedBillAmt = round2(b.amount, 0);
      if (bVal !== undefined && bVal !== null && bVal !== '') {
        amt = parseMoney(bVal, 0);
      } else if (!isLockedDay) {
        const actualAmt = lineItemsMap.has(`${b.id}_${mKey}`) ? lineItemsMap.get(`${b.id}_${mKey}`) : null;
        if (actualAmt !== null && effectiveDueDay(b, y, m) === d && isBillDueInMonth(b, m, true)) {
          amt = parseMoney(actualAmt, 0);
        } else if (actualAmt !== null) {
          amt = 0;
        } else if (!b.isArchived && effectiveDueDay(b, y, m) === d && isBillDueInMonth(b, m, true)) {
          amt = expectedBillAmt;
        }
      }
      dayBills = round2(dayBills + amt);
    });

    const oVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_amount`];
    const dayOther = (oVal !== undefined && oVal !== null && oVal !== '') ? parseMoney(oVal, 0) : 0;

    const ocVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_credit_amount`];
    const dayOtherCredit = (ocVal !== undefined && ocVal !== null && ocVal !== '') ? parseMoney(ocVal, 0) : 0;

    let regEnding = round2(runningReg + dayCredits - dayBills + dayOtherCredit + dayOther);
    let extraEnding = showExtra ? round2(runningExtra + dayExtraCredits) : 0;
    if (extraEnding < 0 && regEnding > 0) {
      const transfer = Math.min(regEnding, -extraEnding);
      extraEnding = round2(extraEnding + transfer);
      regEnding = round2(regEnding - transfer);
    } else if (regEnding < 0 && extraEnding > 0) {
      const transfer = Math.min(extraEnding, -regEnding);
      regEnding = round2(regEnding + transfer);
      extraEnding = round2(extraEnding - transfer);
    }

    runningReg = regEnding;
    runningExtra = extraEnding;

    cur.setDate(cur.getDate() + 1);
  }

  const total = round2(runningReg + (showExtra ? runningExtra : 0));
  const res = {
    reg: runningReg,
    extra: runningExtra,
    total,
    regEnding: runningReg,
    extraEnding: runningExtra,
    totalEnd: total
  };
  return detailed ? res : total;
}
