// @ts-nocheck
/**
 * Pure Importer & Matching Helpers (Decoupled from SheetJS / xlsx).
 * FIN-AUDIT: Extracted from importer.js and spreadsheetParser.js to allow
 * tooltips, budget migrations, and UI panels to import matching algorithms
 * without bundling the full xlsx library into the main chunk.
 */

import { getPersonDepositAmountForAccount } from './paydayUtils.js';
import { round2, parseMoney } from './formatters.js';

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

export const TRANSACTION_SYNONYMS = {
  date:        ['date', 'post date', 'posting date', 'transaction date', 'trans date', 'settled', 'value date', 'trans_date'],
  description: ['description', 'desc', 'memo', 'payee', 'merchant', 'name', 'details', 'narrative', 'transaction description'],
  amount:      ['amount', 'amt', 'debit', 'credit', 'charge', 'payment', 'withdrawal', 'deposit', 'value', 'transaction amount'],
  balance:     ['balance', 'running balance', 'ending balance', 'total balance', 'current balance', 'bal', 'running bal', 'account balance'],
  accountId:   ['account', 'account name', 'bank account', 'account number', 'acct'],
  category:    ['category', 'cat', 'type', 'transaction type', 'trans type'],
  notes:       ['notes', 'note', 'comment', 'reference', 'ref', 'remarks'],
};

export const BILL_SYNONYMS = {
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

/**
 * Tiered bill matcher ensuring exact name and alias matches precede fuzzy keyword fallbacks
 */
export function findMatchingBill(desc, notes, bills) {
  if (!desc || !Array.isArray(bills) || bills.length === 0) return null;
  const lowerDesc = desc.toLowerCase().trim();
  const lowerNotes = (notes || '').toLowerCase().trim();

  // Tier 1: Exact bill name match
  const exactName = bills.find(b => !b.isArchived && (b.name || '').toLowerCase().trim() === lowerDesc);
  if (exactName) return exactName;

  // Tier 2: Exact alias / bankMatchNames match
  const getAliases = (b) => {
    const raw = b.bankMatchNames || b.matchingKey || '';
    let arr = raw ? raw.split(/[,;\n\r|]+/).map(k => k.trim()).filter(Boolean) : [];
    if (Array.isArray(b.aliases)) {
      arr = arr.concat(b.aliases.map(a => String(a).trim()).filter(Boolean));
    } else if (typeof b.aliases === 'string') {
      arr = arr.concat(b.aliases.split(/[,;\n\r|]+/).map(k => k.trim()).filter(Boolean));
    }
    return arr.map(a => a.toLowerCase());
  };

  const exactAlias = bills.find(b => {
    if (b.isArchived) return false;
    const aliases = getAliases(b);
    return aliases.some(a => a === lowerDesc);
  });
  if (exactAlias) return exactAlias;

  // Tier 3: Alias contained in description/notes
  const aliasContained = bills.find(b => {
    if (b.isArchived) return false;
    const aliases = getAliases(b);
    return aliases.some(a => a.length >= 2 && (lowerDesc.includes(a) || (lowerNotes && lowerNotes.includes(a))));
  });
  if (aliasContained) return aliasContained;

  // Tier 4: Substring bill name match (prioritizing longer matching bill names)
  const matchingSubstrings = bills.filter(b => {
    if (b.isArchived) return false;
    const bName = (b.name || '').toLowerCase().trim();
    return bName.length >= 3 && (lowerDesc.includes(bName) || bName.includes(lowerDesc));
  });
  if (matchingSubstrings.length > 0) {
    matchingSubstrings.sort((a, b) => (b.name || '').length - (a.name || '').length);
    return matchingSubstrings[0];
  }

  // Tier 5: Generic keyword matches (only if not a generic bank fee unless bill has fee in name)
  const isGenericFee = (lowerDesc.includes('fee') || lowerNotes.includes('fee'));
  const candidateBills = isGenericFee
    ? bills.filter(b => !b.isArchived && (b.name || '').toLowerCase().includes('fee'))
    : bills.filter(b => !b.isArchived);

  return candidateBills.find(b => {
    const bName = (b.name || '').toLowerCase();
    return (
      ((lowerDesc.includes('hoa') || lowerDesc.includes('homeo') || lowerDesc.includes('emory')) && (bName.includes('hoa') || bName.includes('dues') || bName.includes('emory'))) ||
      (lowerDesc.includes('mortgage') && bName.includes('mortgage')) ||
      (lowerDesc.includes('water') && bName.includes('water')) ||
      (lowerDesc.includes('power') && (bName.includes('power') || bName.includes('electric'))) ||
      (lowerDesc.includes('electric') && (bName.includes('power') || bName.includes('electric'))) ||
      ((lowerDesc.includes('gas') || lowerDesc.includes('energy') || lowerDesc.includes('geo')) && bName.includes('gas')) ||
      (lowerDesc.includes('insurance') && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) ||
      (lowerDesc.includes('cell') && (bName.includes('cell') || bName.includes('phone'))) ||
      (lowerDesc.includes('phone') && (bName.includes('cell') || bName.includes('phone'))) ||
      (lowerDesc.includes('gym') && (bName.includes('gym') || bName.includes('membership')))
    );
  }) || null;
}

/**
 * Intelligent Earner Credit Matcher
 * Supports both options object and positional parameter calling conventions.
 */
export function matchCreditToEarner(...args) {
  const isObjectCall = args.length === 1 && typeof args[0] === 'object' && args[0] !== null;
  const opts = isObjectCall ? args[0] : null;

  const amount = isObjectCall ? opts.amount : args[0];
  const description = isObjectCall ? (opts.description || '') : (args[1] || '');
  const notes = isObjectCall ? (opts.notes || '') : (args[2] || '');
  const category = isObjectCall ? (opts.category || '') : '';
  const people = isObjectCall ? (Array.isArray(opts.people) ? opts.people : []) : (Array.isArray(args[3]) ? args[3] : []);
  const bills = isObjectCall ? (Array.isArray(opts.bills) ? opts.bills : []) : (Array.isArray(args[4]) ? args[4] : []);
  const accounts = isObjectCall ? (Array.isArray(opts.accounts) ? opts.accounts : []) : (Array.isArray(args[5]) ? args[5] : []);
  const targetAccountId = isObjectCall ? (opts.targetAccountId || '') : (args[6] || '');

  if (!amount || !Array.isArray(people) || people.length === 0) return null;

  const rawAmt = Math.abs(parseMoney(amount, 0));
  if (!Number.isFinite(rawAmt) || rawAmt <= 0) return null;

  const MIN_EARNER_AMOUNT = 5.00;
  if (rawAmt < MIN_EARNER_AMOUNT) return null;

  const categoryLower = (category || '').toLowerCase();
  const NON_EARNER_CATEGORIES = [
    'interest income', 'interest paid', 'interest',
    'dividend', 'fee reversal', 'refund', 'cashback', 'cash back',
    'atm', 'tax refund', 'escrow'
  ];
  if (NON_EARNER_CATEGORIES.some(c => categoryLower.includes(c))) return null;

  const descLower = (description || '').toLowerCase();
  const notesLower = (notes || '').toLowerCase();
  const NON_EARNER_DESC_PATTERNS = [
    'interest paid', 'interest earned', 'interest credit',
    'dividend', 'atm', 'cash deposit', 'check deposit',
    'tax refund', 'escrow refund'
  ];
  if (NON_EARNER_DESC_PATTERNS.some(p => descLower.includes(p) || notesLower.includes(p))) return null;

  let tier1AliasMatch = null;
  for (const p of people) {
    const pName = (p.name || '').toLowerCase().trim();
    const pAliases = (p.bankMatchNames || p.matchingKey || '')
      .toLowerCase()
      .split(/[,;\n\r|]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2);

    if (pName && pName.length >= 2 && (descLower.includes(pName) || notesLower.includes(pName))) {
      return { person: p, reason: `name_match ("${p.name}")` };
    }

    if (!tier1AliasMatch) {
      for (const alias of pAliases) {
        if (descLower.includes(alias) || notesLower.includes(alias)) {
          tier1AliasMatch = { person: p, alias };
          break;
        }
      }
    }
  }

  if (tier1AliasMatch) {
    const aliasPersonId = tier1AliasMatch.person.id;
    const allAccountIds = [
      targetAccountId,
      ...accounts.map(a => a.id).filter(id => id !== targetAccountId)
    ].filter(Boolean);

    const MONTHLY_DOUBLE_PENALTY = 0.50;
    let aliasHolderBestDelta = Infinity;
    for (const accId of allAccountIds) {
      const allocAmt = getPersonDepositAmountForAccount(tier1AliasMatch.person, accId, { accounts, bills, people });
      if (allocAmt >= MIN_EARNER_AMOUNT) {
        const d = Math.abs(allocAmt - rawAmt);
        if (d < aliasHolderBestDelta) aliasHolderBestDelta = d;
        const freq = (tier1AliasMatch.person.payFrequency || '').toLowerCase();
        if (freq === 'semi-monthly' || freq === 'bi-weekly') {
          const monthlyD = Math.abs(round2(allocAmt * 2) - rawAmt) + MONTHLY_DOUBLE_PENALTY;
          if (monthlyD < aliasHolderBestDelta) aliasHolderBestDelta = monthlyD;
        }
      }
    }

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
            const monthlyD = Math.abs(round2(allocAmt * 2) - rawAmt) + MONTHLY_DOUBLE_PENALTY;
            if (monthlyD < rivalBestDelta) { rivalBestDelta = monthlyD; rivalPerson = p; }
          }
        }
      }
    }

    if (rivalPerson && rivalBestDelta < aliasHolderBestDelta) {
      // Rival amount match wins
    } else {
      return { person: tier1AliasMatch.person, reason: `alias_match ("${tier1AliasMatch.alias}")` };
    }
  }

  const getBillCost = (b) => {
    if (!b) return 0;
    const period = b.period || 'Monthly';
    const bAmt = parseMoney(b.amount, 0);
    if (period === 'Quarterly') return round2(bAmt / 3);
    if (period === 'Semi-Annual') return round2(bAmt / 6);
    if (period === 'Annual') return round2(bAmt / 12);
    return round2(bAmt);
  };

  const tolerance = Math.min(2.00, Math.max(0.02, rawAmt * 0.005));

  let bestCandidate = null;
  let minDelta = Infinity;

  for (const p of people) {
    const allAccountIds = [
      targetAccountId,
      ...accounts.map(a => a.id).filter(id => id !== targetAccountId)
    ].filter(Boolean);

    for (const accId of allAccountIds) {
      const allocAmt = getPersonDepositAmountForAccount(p, accId, { accounts, bills, people });
      if (allocAmt < MIN_EARNER_AMOUNT) continue;

      const deltaAlloc = Math.abs(allocAmt - rawAmt);
      if (deltaAlloc <= tolerance && deltaAlloc < minDelta) {
        const accName = accounts.find(a => a.id === accId)?.name || accId;
        const label = accId === targetAccountId
          ? `${p.name} Paycheck Allocation ($${allocAmt.toFixed(2)})`
          : `${p.name} Paycheck Allocation via ${accName} ($${allocAmt.toFixed(2)})`;
        minDelta = deltaAlloc;
        bestCandidate = { person: p, label, delta: deltaAlloc };
      }

      const isSemi = p.payFrequency === 'semi-monthly';
      const isBi = p.payFrequency === 'bi-weekly';
      if (isSemi || isBi) {
        const monthlyAlloc = isBi ? round2((allocAmt * 26) / 12) : round2(allocAmt * 2);
        const deltaMonthly = Math.abs(monthlyAlloc - rawAmt);
        const MONTHLY_DOUBLE_PENALTY = 0.50;
        const effectiveDeltaMonthly = deltaMonthly + MONTHLY_DOUBLE_PENALTY;
        if (deltaMonthly <= tolerance && effectiveDeltaMonthly < minDelta) {
          const accName = accounts.find(a => a.id === accId)?.name || accId;
          const cadenceName = isBi ? 'Annualized Monthly' : 'Monthly';
          const label = accId === targetAccountId
            ? `${p.name} ${cadenceName} Allocation ($${monthlyAlloc.toFixed(2)})`
            : `${p.name} ${cadenceName} Allocation via ${accName} ($${monthlyAlloc.toFixed(2)})`;
          minDelta = effectiveDeltaMonthly;
          bestCandidate = { person: p, label, delta: deltaMonthly };
        }
      }
    }

    const billsForPerson = bills.filter(b => !b.isArchived && b.splits && (b.splits[p.id] > 0));
    if (billsForPerson.length > 0) {
      const totalMonthlyBills = billsForPerson.reduce((sum, b) => {
        const cost = getBillCost(b);
        const pct = (b.splits[p.id] || 0) / 100;
        return round2(sum + round2(cost * pct));
      }, 0);

      const deltaBills = Math.abs(totalMonthlyBills - rawAmt);
      if (deltaBills <= tolerance && deltaBills < minDelta) {
        minDelta = deltaBills;
        bestCandidate = { person: p, label: `${p.name} Monthly Bills Share ($${totalMonthlyBills.toFixed(2)})`, delta: deltaBills };
      }

      const isBiWeekly = p.payFrequency === 'bi-weekly';
      const isSemiMonthly = p.payFrequency === 'semi-monthly';
      if (isBiWeekly || isSemiMonthly) {
        const biWeeklyBills = isBiWeekly
          ? round2((totalMonthlyBills * 12) / 26)
          : round2(totalMonthlyBills / 2);

        const deltaBiWeekly = Math.abs(biWeeklyBills - rawAmt);
        if (deltaBiWeekly <= tolerance && deltaBiWeekly < minDelta) {
          minDelta = deltaBiWeekly;
          bestCandidate = { person: p, label: `${p.name} Per-Paycheck Bills Share ($${biWeeklyBills.toFixed(2)})`, delta: deltaBiWeekly };
        }
      }
    }

    const netPay = parseFloat(p.netPerPay) || 0;
    if (netPay >= MIN_EARNER_AMOUNT) {
      const deltaNet = Math.abs(netPay - rawAmt);
      if (deltaNet <= tolerance && deltaNet < minDelta) {
        minDelta = deltaNet;
        bestCandidate = { person: p, label: `${p.name} Net Paycheck ($${netPay.toFixed(2)})`, delta: deltaNet };
      }
      const isSemi = p.payFrequency === 'semi-monthly';
      const isBi = p.payFrequency === 'bi-weekly';
      if (isSemi || isBi) {
        const netMonthly = isBi ? round2((netPay * 26) / 12) : round2(netPay * 2);
        const deltaNetMonthly = Math.abs(netMonthly - rawAmt);
        if (deltaNetMonthly <= tolerance && deltaNetMonthly < minDelta) {
          minDelta = deltaNetMonthly;
          const cadenceName = isBi ? 'Annualized Monthly' : 'Monthly';
          bestCandidate = { person: p, label: `${p.name} ${cadenceName} Net ($${netMonthly.toFixed(2)})`, delta: deltaNetMonthly };
        }
      }
    }
  }

  if (bestCandidate) {
    return { person: bestCandidate.person, reason: bestCandidate.label };
  }

  return null;
}
