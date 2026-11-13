// TechTrek Wayfinder - Multi-Currency Expense Ledger & Debt Settle-Up Engine
// Provides multi-currency normalization, exact-cent split distribution,
// and a greedy bipartite graph algorithm for minimal debt settle-up transfers.

export const DEFAULT_EXCHANGE_RATES = {
  PLN: 1.0,
  USD: 3.73,  // NBP reference fallback until /api/wayfinder/exchange-rate hydrates
  EUR: 4.30,
  GBP: 4.95
};

let dynamicExchangeRates = { ...DEFAULT_EXCHANGE_RATES };

try {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('wayfinder_pln_usd_rate');
    if (raw) {
      const parsed = JSON.parse(raw);
      const plnPerUnit = parsed?.plnPerUnit || {};
      if (Number(plnPerUnit.USD) > 0) dynamicExchangeRates.USD = Number(plnPerUnit.USD);
      else if (Number(parsed?.usdToPln) > 0) dynamicExchangeRates.USD = Number(parsed.usdToPln);
      if (Number(plnPerUnit.EUR) > 0) dynamicExchangeRates.EUR = Number(plnPerUnit.EUR);
      else if (Number(parsed?.eurToPln) > 0) dynamicExchangeRates.EUR = Number(parsed.eurToPln);
      if (Number(plnPerUnit.GBP) > 0) dynamicExchangeRates.GBP = Number(plnPerUnit.GBP);
      else if (Number(parsed?.gbpToPln) > 0) dynamicExchangeRates.GBP = Number(parsed.gbpToPln);
    }
  }
} catch {
  // Ignore unavailable storage (Node tests / private mode)
}

export function setDynamicExchangeRates(plnPerUnit = {}) {
  if (!plnPerUnit || typeof plnPerUnit !== 'object') return;
  for (const code of ['USD', 'EUR', 'GBP']) {
    const val = Number(plnPerUnit[code]);
    if (val > 0 && Number.isFinite(val)) {
      dynamicExchangeRates[code] = val;
    }
  }
}

export function getExchangeRates() {
  return { ...dynamicExchangeRates };
}

/**
 * Convert an amount from one currency to another using reference rates relative to PLN.
 */
export function convertCurrency(amount, fromCurrency = 'PLN', toCurrency = 'PLN', customRates = {}) {
  const from = (fromCurrency || 'PLN').toUpperCase();
  const to = (toCurrency || 'PLN').toUpperCase();
  if (from === to) return Number(amount) || 0;

  const rates = { ...dynamicExchangeRates, ...customRates };
  const fromRate = rates[from] || 1.0;
  const toRate = rates[to] || 1.0;

  // Convert to PLN first, then to target
  const inPln = Number(amount) * fromRate;
  const target = inPln / toRate;
  return Math.round(target * 100) / 100;
}

/**
 * Format currency with appropriate symbol and precision.
 */
export function formatCurrency(amount, currency = 'PLN') {
  const num = Number(amount) || 0;
  const cur = (currency || 'PLN').toUpperCase();

  switch (cur) {
    case 'USD':
      return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'EUR':
      return `€${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'GBP':
      return `£${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'PLN':
    default:
      return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
  }
}

/**
 * Split a total amount equally across participants, distributing remainder cents.
 * Guarantees sum of split amounts equals totalAmount exactly down to the penny.
 */
export function splitEqually(totalAmount, participants = []) {
  if (!participants.length || totalAmount <= 0) return [];
  const totalCents = Math.round(Number(totalAmount) * 100);
  const count = participants.length;
  const baseCents = Math.floor(totalCents / count);
  let remainderCents = totalCents % count;

  return participants.map((p, idx) => {
    const extra = remainderCents > 0 ? 1 : 0;
    if (remainderCents > 0) remainderCents--;
    const personCents = baseCents + extra;
    return {
      userId: p.id || p.userId,
      userName: p.name || p.userName || 'Member',
      amountOwed: personCents / 100,
      percentage: Math.round((100 / count) * 10) / 10
    };
  });
}

/**
 * Calculate net balances and generate simplified settle-up transfers.
 * Uses a greedy bipartite matching algorithm to minimize total payments.
 *
 * @param {Array} expenses - list of expense records with payer and splits
 * @param {Array} settlements - list of recorded direct payments between members
 * @param {string} displayCurrency - currency for calculating settle-up amounts (default PLN)
 * @returns {Object} { balances: Array, transfers: Array, totalSpend: Object }
 */
export function calculateSettleUp(expenses = [], settlements = [], displayCurrency = 'PLN') {
  const balances = {}; // userId -> { id, name, paid, owed, net, settlementsPaid, settlementsReceived }
  const totalSpendByCurrency = { PLN: 0, USD: 0, EUR: 0 };

  const ensureUser = (id, name = 'Member') => {
    if (!id) return;
    if (!balances[id]) {
      balances[id] = { id, name, paid: 0, owed: 0, net: 0, settlementsPaid: 0, settlementsReceived: 0 };
    } else if (name && balances[id].name === 'Member' && name !== 'Member') {
      balances[id].name = name;
    }
  };

  // 1. Process all expenses
  for (const exp of expenses) {
    const payerId = exp.paid_by_user_id || exp.user_id || exp.payerId;
    const payerName = exp.paid_by_name || exp.payerName || 'Member';
    const currency = (exp.currency_original || exp.currency || 'PLN').toUpperCase();
    const rawAmount = Number(exp.amount_original || exp.amount || 0);

    // Track total spend
    totalSpendByCurrency[currency] = (totalSpendByCurrency[currency] || 0) + rawAmount;

    // Convert to display currency for balance calculations
    const amountInDisplay = convertCurrency(rawAmount, currency, displayCurrency);

    ensureUser(payerId, payerName);
    if (balances[payerId]) {
      balances[payerId].paid += amountInDisplay;
    }

    // Process splits for this expense - EVERY participant owes their split share
    const splits = exp.splits || [];
    if (splits.length > 0) {
      for (const split of splits) {
        const debtorId = split.user_id || split.userId;
        const debtorName = split.user_name || split.userName || 'Member';
        ensureUser(debtorId, debtorName);

        const splitOwed = Number(split.amount_owed || split.amount || 0);
        const splitInDisplay = convertCurrency(splitOwed, currency, displayCurrency);

        if (balances[debtorId]) {
          balances[debtorId].owed += splitInDisplay;
        }
      }
    } else {
      // If no split details exist, assume payer pays for own share
      if (balances[payerId]) {
        balances[payerId].owed += amountInDisplay;
      }
    }
  }

  // 2. Process recorded settlements (Alice paid Bob)
  for (const set of settlements) {
    const fromId = set.from_user_id || set.fromUserId;
    const toId = set.to_user_id || set.toUserId;
    const fromName = set.from_user_name || set.fromUserName || 'Member';
    const toName = set.to_user_name || set.toUserName || 'Member';
    const currency = (set.currency || 'PLN').toUpperCase();
    const rawAmount = Number(set.amount || 0);
    const inDisplay = convertCurrency(rawAmount, currency, displayCurrency);

    ensureUser(fromId, fromName);
    ensureUser(toId, toName);

    // fromUser transferred money to toUser:
    // fromUser's net improves (paid debt), toUser's net decreases (reimbursed)
    if (balances[fromId]) balances[fromId].settlementsPaid += inDisplay;
    if (balances[toId]) balances[toId].settlementsReceived += inDisplay;
  }

  // 3. Compute net balance for each member
  // Net = (Expenses Paid - Expense Share) + (Settlements Paid - Settlements Received)
  const balanceList = Object.values(balances).map((b) => {
    const rawExpensesPaid = b.paid;
    const rawExpenseShare = b.owed;
    const net = Math.round((rawExpensesPaid - rawExpenseShare + b.settlementsPaid - b.settlementsReceived) * 100) / 100;
    return {
      ...b,
      paid: Math.round(rawExpensesPaid * 100) / 100,
      owed: Math.round(rawExpenseShare * 100) / 100,
      settlementsPaid: Math.round(b.settlementsPaid * 100) / 100,
      settlementsReceived: Math.round(b.settlementsReceived * 100) / 100,
      net
    };
  });

  // 4. Greedy Debt Simplification
  // Separate members into Creditors (net > 0.01) and Debtors (net < -0.01)
  const creditors = balanceList
    .filter((b) => b.net > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net);

  const debtors = balanceList
    .filter((b) => b.net < -0.01)
    .map((b) => ({ ...b, net: Math.abs(b.net) }))
    .sort((a, b) => b.net - a.net);

  const transfers = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];
    const settleAmount = Math.min(creditor.net, debtor.net);

    if (settleAmount > 0.01) {
      transfers.push({
        id: `tx-${debtor.id}-${creditor.id}-${transfers.length}`,
        fromUserId: debtor.id,
        fromUserName: debtor.name,
        toUserId: creditor.id,
        toUserName: creditor.name,
        amount: Math.round(settleAmount * 100) / 100,
        currency: displayCurrency
      });
    }

    creditor.net = Math.round((creditor.net - settleAmount) * 100) / 100;
    debtor.net = Math.round((debtor.net - settleAmount) * 100) / 100;

    if (creditor.net <= 0.01) cIdx++;
    if (debtor.net <= 0.01) dIdx++;
  }

  return {
    balances: balanceList,
    transfers,
    totalSpendByCurrency
  };
}

/**
 * Compute itemized category breakdown for a specific person.
 * Returns map of canonical categories with out-of-pocket paid, fair share liability, and settled share.
 */
export function computePersonCategoryBreakdown(expenses = [], personId, displayCurrency = 'PLN') {
  const categories = ['flight', 'lodging', 'transit', 'activity', 'dining', 'market', 'other'];
  const breakdown = {};
  for (const cat of categories) {
    breakdown[cat] = { paidByPerson: 0, shareOwed: 0, settled: 0 };
  }

  const normalizeCat = (cat) => {
    const c = (cat || 'other').toLowerCase();
    if (c === 'hotel') return 'lodging';
    if (c === 'train' || c === 'rail') return 'transit';
    if (c === 'restaurant') return 'dining';
    if (c === 'excursion' || c === 'tour') return 'activity';
    return categories.includes(c) ? c : 'other';
  };

  for (const exp of expenses) {
    const payerId = exp.paid_by_user_id || exp.user_id;
    const cat = normalizeCat(exp.category);
    const cur = exp.currency_original || exp.currency || 'PLN';
    const amount = Number(exp.amount_original || exp.amount || 0);

    if (payerId === personId) {
      const inDisplay = convertCurrency(amount, cur, displayCurrency);
      breakdown[cat].paidByPerson += inDisplay;
    }

    const splits = exp.splits || [];
    for (const split of splits) {
      if (split.user_id === personId) {
        const splitOwed = Number(split.amount_owed || split.amount || 0);
        const splitInDisplay = convertCurrency(splitOwed, cur, displayCurrency);
        breakdown[cat].shareOwed += splitInDisplay;
        if (split.is_settled) {
          breakdown[cat].settled += splitInDisplay;
        }
      }
    }
  }

  for (const cat of categories) {
    breakdown[cat].paidByPerson = Math.round(breakdown[cat].paidByPerson * 100) / 100;
    breakdown[cat].shareOwed = Math.round(breakdown[cat].shareOwed * 100) / 100;
    breakdown[cat].settled = Math.round(breakdown[cat].settled * 100) / 100;
  }

  return breakdown;
}

/**
 * Compute payment methods breakdown for expenses paid by a specific person.
 */
export function computePersonPaymentMethods(expenses = [], personId, displayCurrency = 'PLN') {
  const methodMap = {};

  for (const exp of expenses) {
    const payerId = exp.paid_by_user_id || exp.user_id;
    if (payerId !== personId) continue;

    const rawMethod = (exp.payment_method || '').trim() || 'Unknown';
    const cur = exp.currency_original || exp.currency || 'PLN';
    const amount = Number(exp.amount_original || exp.amount || 0);
    const inDisplay = convertCurrency(amount, cur, displayCurrency);

    if (!methodMap[rawMethod]) {
      methodMap[rawMethod] = { method: rawMethod, totalPaid: 0, count: 0 };
    }
    methodMap[rawMethod].totalPaid += inDisplay;
    methodMap[rawMethod].count += 1;
  }

  return Object.values(methodMap)
    .map(item => ({
      ...item,
      totalPaid: Math.round(item.totalPaid * 100) / 100
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);
}

/**
 * Build mathematical summary strings for formula explanation tooltip.
 */
export function buildNetFormula(balance = {}, displayCurrency = 'PLN') {
  const paid = balance.paid || 0;
  const share = balance.owed || 0;
  const sent = balance.settlementsPaid || 0;
  const received = balance.settlementsReceived || 0;
  const net = balance.net || 0;

  return {
    paid: formatCurrency(paid, displayCurrency),
    share: formatCurrency(share, displayCurrency),
    sent: formatCurrency(sent, displayCurrency),
    received: formatCurrency(received, displayCurrency),
    net: (net > 0 ? '+' : '') + formatCurrency(net, displayCurrency),
    isPositive: net > 0.01,
    isNegative: net < -0.01,
    isZero: Math.abs(net) <= 0.01
  };
}
