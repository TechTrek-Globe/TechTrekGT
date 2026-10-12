// @ts-nocheck
import { normalizeIsoDate, mergeBills, mergeTransactions, detectTransactionConflicts, matchCreditToEarner } from './importer.js';
import { findMatchingBill } from './spreadsheetParser.js';
import { logDebug, logWarn, logInfo } from './debugLogger.js';
import { isPersonDepositDay, getPersonDepositAmountForAccount, getPersonExtraSavingsDepositAmountForAccount, getPersonTargetPayDaysForMonth, effectiveDueDay, isBillDueInMonth } from './paydayUtils.js';
import { allocateEarnerCredit } from './ledgerEngine.js';
import { round2, parseMoney } from './formatters.js';

/**
 * Pure utility function to reconcile and apply selective spreadsheet/CSV imports.
 * Reconciles imported namespaces (people, accounts, bills, transactions) against existing state,
 * and matches actual transactions to projected bills and earner deposits.
 *
 * @param {Object} params
 * @param {any} params.namespaces Map of namespaces enabled for import ({ people, accounts, bills, transactions })
 * @param {any} [params.strategies] Map of merge strategies per namespace ('override' | 'merge')
 * @param {any} params.data Imported data payload containing people, accounts, bills, transactions, targetAccountId, etc.
 * @param {any} [params.metadataState] Current metadata state (accounts, people, bills, loans, etc.)
 * @param {Array} [params.lineItems] Current line items
 * @param {any} [params.dailyMatrix] Current daily matrix
 * @param {Array} [params.transactions] Current transactions
 * @param {boolean} [params.dryRun] If true, halts and returns conflicts instead of committing
 * @param {any} [params.resolutions] Map of incoming ID -> { action, targetId } for resolving conflicts
 * @returns {{
 *   success: boolean,
 *   error?: string,
 *   requiresResolution?: boolean,
 *   conflicts?: Array,
 *   metadataState?: Object,
 *   lineItems?: Array,
 *   dailyMatrix?: Object,
 *   transactions?: Array
 * }}
 */
/**
 * Extracts and normalizes bank match statement aliases for a bill.
 * Supports bill.bankMatchNames, bill.matchingKey, or legacy bill.matching_key.
 * @param {Object} bill
 * @returns {string[]}
 */
export function getBillMatchAliases(bill) {
  if (!bill) return [];
  const raw = (bill.bankMatchNames !== undefined && bill.bankMatchNames !== '')
    ? bill.bankMatchNames
    : (bill.matchingKey || bill.matching_key || '');
  if (Array.isArray(raw)) {
    return raw.map(k => String(k).trim().toLowerCase()).filter(Boolean);
  }
  return String(raw)
    .split(/[,;\n\r|]+/)
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
}

export function processSpreadsheetImport({
  namespaces,
  strategies = {},
  data,
  /** @type {any} */
  metadataState = null,
  lineItems = [],
  dailyMatrix = {},
  transactions = [],
  dryRun = false,
  resolutions = {}
}) {
  if (!namespaces || !data) {
    logWarn('RECONCILE', 'processSpreadsheetImport invoked with invalid payload', { namespaces, dataExists: Boolean(data) });
    return { success: false, error: 'Invalid payload.' };
  }

  logDebug('RECONCILE', 'Starting spreadsheet import reconciliation', {
    namespaces,
    strategies,
    targetAccountId: data.targetAccountId,
    peopleCount: data.people?.length || 0,
    accountsCount: data.accounts?.length || 0,
    billsCount: data.bills?.length || 0,
    transactionsCount: data.transactions?.length || 0
  });

  let nextPeople = Array.isArray(metadataState.people) ? [...metadataState.people] : [];
  let nextAccounts = Array.isArray(metadataState.accounts) ? [...metadataState.accounts] : [];
  let nextBills = Array.isArray(metadataState.bills) ? [...metadataState.bills] : [];
  let nextLineItems = Array.isArray(lineItems) ? [...lineItems] : [];
  let nextDailyMatrix = { ...dailyMatrix };
  let nextTransactions = Array.isArray(transactions) ? [...transactions] : [];

  let metadataChanged = false;
  let lineItemsChanged = false;
  let matrixChanged = false;
  let transactionsChanged = false;

  // Derive date boundaries of incoming import data to prevent historical/future data wipes
  const incomingTxDates = (Array.isArray(data.transactions) ? data.transactions : [])
    .map(t => normalizeIsoDate(t.date))
    .filter(Boolean);
  const incomingLedgerDates = (data.importedLedgerRows && typeof data.importedLedgerRows === 'object')
    ? Object.keys(data.importedLedgerRows).map(d => normalizeIsoDate(d)).filter(Boolean)
    : [];
  const allIncomingDates = [...new Set([...incomingTxDates, ...incomingLedgerDates])].sort();
  const minImportDate = allIncomingDates.length > 0 ? allIncomingDates[0] : null;
  const maxImportDate = allIncomingDates.length > 0 ? allIncomingDates[allIncomingDates.length - 1] : null;
  const minImportMonth = minImportDate ? minImportDate.slice(0, 7) : null;
  const maxImportMonth = maxImportDate ? maxImportDate.slice(0, 7) : null;

  // 1. Process People
  if (namespaces.people && Array.isArray(data.people)) {
    logDebug('RECONCILE', 'Reconciling people namespace', { strategy: strategies.people, incomingCount: data.people.length, existingCount: nextPeople.length });
    if (strategies.people === 'override') {
      if (data.people.length > 0) {
        nextPeople = data.people;
        metadataChanged = true;
      }
    } else {
      const existingNames = new Set(nextPeople.map(p => (p.name || '').toLowerCase()));
      const toAdd = data.people.filter(p => !existingNames.has((p.name || '').toLowerCase()));
      if (toAdd.length > 0) {
        logDebug('RECONCILE', `Adding ${toAdd.length} new people earners`, { toAdd });
        nextPeople = [...nextPeople, ...toAdd];
        metadataChanged = true;
      }
    }
  }

  // 2. Process Accounts
  const accountIdMap = new Map();
  nextAccounts.forEach(a => accountIdMap.set(a.id, a.id));
  if (data.targetAccountId) {
    accountIdMap.set(data.targetAccountId, data.targetAccountId);
  }
  if (namespaces.accounts && Array.isArray(data.accounts)) {
    logDebug('RECONCILE', 'Reconciling accounts namespace', { strategy: strategies.accounts, incomingCount: data.accounts.length, existingCount: nextAccounts.length });
    if (strategies.accounts === 'override') {
      if (data.targetAccountId) {
        // Reset the specific target account's importedLedgerRows and ledger metadata
        const incomingTargetAcc = data.accounts.find(a => a.id === data.targetAccountId) || data.accounts[0];
        nextAccounts = nextAccounts.map(a => {
          if (a.id === data.targetAccountId) {
            const importedRows = incomingTargetAcc?.importedLedgerRows || data.importedLedgerRows || {};
            const isFullOverride = strategies.accounts === 'override' || strategies.transactions === 'override';
            const mergedRows = isFullOverride ? importedRows : { ...(a.importedLedgerRows || {}), ...importedRows };
            let newStartingBalance = a.startingBalance;
            let newExtraStarting = a.extraStartingBalance || 0;
            
            let newStartDate = a.startDate;
            let newBalanceAsOfDate = a.balanceAsOfDate;
            if (strategies.transactions === 'override') {
              const dates = Object.keys(mergedRows).sort();
              // Force adopt earliest date/balance if we are overriding the entire ledger
              if (dates.length > 0) {
                const earliestRow = mergedRows[dates[0]];
                const rawReg = earliestRow.regBeg ?? earliestRow.totalBeg ?? newStartingBalance;
                const rawExtra = earliestRow.extraBeg ?? (newExtraStarting ?? 0);
                let startReg = rawReg;
                let startExtra = rawExtra;
                if (startReg < 0 && startExtra > 0) {
                  const transfer = Math.min(startExtra, -startReg);
                  startReg += transfer;
                  startExtra -= transfer;
                } else if (startExtra < 0 && startReg > 0) {
                  const transfer = Math.min(startReg, -startExtra);
                  startExtra += transfer;
                  startReg -= transfer;
                }
                newStartingBalance = Math.round(startReg * 100) / 100 || 0;
                newExtraStarting = Math.round(startExtra * 100) / 100 || 0;
                newStartDate = dates[0];
                newBalanceAsOfDate = dates[0];
              }
            }

            return {
              ...a,
              ...(incomingTargetAcc || {}),
              id: a.id,
              name: incomingTargetAcc?.name || a.name,
              importedLedgerRows: mergedRows,
              ledgerMode: 'import',
              startingBalance: newStartingBalance,
              extraStartingBalance: newExtraStarting,
              startDate: newStartDate,
              balanceAsOfDate: newBalanceAsOfDate
            };
          }
          return a;
        });
        accountIdMap.set(data.targetAccountId, data.targetAccountId);
      } else {
        nextAccounts = data.accounts;
        data.accounts.forEach(a => accountIdMap.set(a.id, a.id));
      }
      metadataChanged = true;
    } else {
      const updatedAccounts = [...nextAccounts];
      const newAccountsToAdd = [];

      data.accounts.forEach(incomingAcc => {
        const normName = (incomingAcc.name || '').toLowerCase().trim();
        const matchIdx = updatedAccounts.findIndex(a => {
          const aNorm = (a.name || '').toLowerCase().trim();
          return aNorm === normName || aNorm.includes(normName) || normName.includes(aNorm);
        });

        if (matchIdx >= 0) {
          const match = updatedAccounts[matchIdx];
          accountIdMap.set(incomingAcc.id, match.id);
          logDebug('RECONCILE', `Matched incoming account "${incomingAcc.name}" to existing "${match.name}" (${match.id})`);
          // Propagate imported ledger metadata onto the matched account
          const patches = {};
          if (incomingAcc.importedLedgerRows && Object.keys(incomingAcc.importedLedgerRows).length > 0) {
            patches.importedLedgerRows = { ...(match.importedLedgerRows || {}), ...incomingAcc.importedLedgerRows };
            patches.ledgerMode = 'import';
            
            if (strategies.transactions === 'override') {
              const dates = Object.keys(incomingAcc.importedLedgerRows).sort();
              if (dates.length > 0) {
                const earliestRow = incomingAcc.importedLedgerRows[dates[0]];
                const rawReg = earliestRow.regBeg ?? earliestRow.totalBeg ?? match.startingBalance;
                const rawExtra = earliestRow.extraBeg ?? (match.extraStartingBalance || 0);
                let startReg = rawReg;
                let startExtra = rawExtra;
                if (startReg < 0 && startExtra > 0) {
                  const transfer = Math.min(startExtra, -startReg);
                  startReg += transfer;
                  startExtra -= transfer;
                } else if (startExtra < 0 && startReg > 0) {
                  const transfer = Math.min(startReg, -startExtra);
                  startExtra += transfer;
                  startReg -= transfer;
                }
                patches.startingBalance = Math.round(startReg * 100) / 100 || 0;
                patches.extraStartingBalance = Math.round(startExtra * 100) / 100 || 0;
                patches.startDate = dates[0];
                patches.balanceAsOfDate = dates[0];
              }
            }
          }
          if (Object.keys(patches).length > 0) {
            updatedAccounts[matchIdx] = { ...match, ...patches };
            metadataChanged = true;
          }
        } else {
          logDebug('RECONCILE', `Registering new account "${incomingAcc.name}" (${incomingAcc.id})`);
          newAccountsToAdd.push(incomingAcc);
          accountIdMap.set(incomingAcc.id, incomingAcc.id);
        }
      });

      if (newAccountsToAdd.length > 0 || metadataChanged) {
        nextAccounts = [...updatedAccounts, ...newAccountsToAdd];
        metadataChanged = true;
      }
    }
  }

  // Direct Target Account Metadata Binding (for account-bound CSV/spreadsheet imports)
  if (data.targetAccountId) {
    logDebug('RECONCILE', `Binding metadata directly to target account ID ${data.targetAccountId}`, {
      hasImportedLedgerRows: Boolean(data.importedLedgerRows && Object.keys(data.importedLedgerRows).length > 0)
    });
    nextAccounts = nextAccounts.map(acc => {
      if (acc.id === data.targetAccountId) {
        const patches = {};
        if (data.importedLedgerRows && Object.keys(data.importedLedgerRows).length > 0) {
          patches.importedLedgerRows = strategies.transactions === 'override'
            ? data.importedLedgerRows
            : { ...(acc.importedLedgerRows || {}), ...data.importedLedgerRows };
          patches.ledgerMode = 'import';
          
          if (strategies.transactions === 'override') {
            const dates = Object.keys(data.importedLedgerRows).sort();
            if (dates.length > 0) {
              const earliestRow = data.importedLedgerRows[dates[0]];
              const rawReg = earliestRow.regBeg ?? earliestRow.totalBeg ?? acc.startingBalance;
              const rawExtra = earliestRow.extraBeg ?? (acc.extraStartingBalance || 0);
              let startReg = rawReg;
              let startExtra = rawExtra;
              if (startReg < 0 && startExtra > 0) {
                const transfer = Math.min(startExtra, -startReg);
                startReg += transfer;
                startExtra -= transfer;
              } else if (startExtra < 0 && startReg > 0) {
                const transfer = Math.min(startReg, -startExtra);
                startExtra += transfer;
                startReg -= transfer;
              }
              patches.startingBalance = Math.round(startReg * 100) / 100 || 0;
              patches.extraStartingBalance = Math.round(startExtra * 100) / 100 || 0;
              patches.startDate = dates[0];
              patches.balanceAsOfDate = dates[0];
            }
          }
        } else if (strategies.transactions === 'override') {
          // If overriding transactions without incoming statement rows, purge stale future/phantom importedLedgerRows
          // so obsolete ending balance markers do not cause false-positive statement difference warnings
          patches.importedLedgerRows = {};
          patches.ledgerMode = 'import';
        }
        if (data.targetAccount && typeof data.targetAccount === 'object') {
          Object.assign(patches, data.targetAccount);
        }
        if (Object.keys(patches).length > 0) {
          metadataChanged = true;
          return { ...acc, ...patches };
        }
      }
      return acc;
    });
  }

  // 3. Process Bills
  if (namespaces.bills && Array.isArray(data.bills)) {
    logDebug('RECONCILE', 'Reconciling bills namespace', { strategy: strategies.bills, incomingCount: data.bills.length, existingCount: nextBills.length });
    
    // Ensure all incoming bills are stamped with targetAccountId
    const incomingBills = data.bills.map(b => ({
      ...b,
      accountId: b.accountId || data.targetAccountId || (nextAccounts[0]?.id || '')
    }));

    if (strategies.bills === 'override') {
      if (data.targetAccountId) {
        // Clear out existing bills for THIS specific account, keep bills of other accounts
        const otherAccBills = nextBills.filter(b => b.accountId !== data.targetAccountId);
        nextBills = [...otherAccBills, ...incomingBills];
      } else {
        nextBills = incomingBills;
      }
      metadataChanged = true;
    } else {
      nextBills = mergeBills(nextBills, incomingBills);
      metadataChanged = true;
    }
  }

  const importWarnings = [];

  // 4. Process Transactions
  if (namespaces.transactions && Array.isArray(data.transactions)) {
    logDebug('RECONCILE', 'Reconciling transactions namespace', { strategy: strategies.transactions, incomingCount: data.transactions.length, existingCount: nextTransactions.length });
    const stampedTransactions = data.transactions.map(t => {
      let accId = t.accountId;
      if (accountIdMap.has(accId)) {
        accId = accountIdMap.get(accId);
      } else if (data.targetAccountId) {
        accId = data.targetAccountId;
      }
      return {
        ...t,
        accountId: accId || data.targetAccountId || ''
      };
    });

    if (strategies.transactions === 'override') {
      nextTransactions = stampedTransactions;
      transactionsChanged = true;
    } else {
      if (dryRun) {
        const conflicts = detectTransactionConflicts(nextTransactions, stampedTransactions);
        // Only return conflicts if there are any that haven't been resolved yet
        const unresolvedConflicts = conflicts.filter(c => {
          const r = resolutions[c.incoming.id];
          return !r || !r.action;
        });
        if (unresolvedConflicts.length > 0) {
          logDebug('RECONCILE', `Dry run detected ${unresolvedConflicts.length} unresolved transaction conflicts`);
          return { success: true, requiresResolution: true, conflicts: unresolvedConflicts };
        }
      }
      nextTransactions = mergeTransactions(nextTransactions, stampedTransactions, resolutions);
      transactionsChanged = true;
    }
  }

  // Reconcile imported actual transactions against projected bills, deposits, and other expenses.
  if (namespaces.transactions && Array.isArray(data.transactions)) {
    logDebug('RECONCILE', `Reconciling ${data.transactions.length} actual transactions against projected bills/deposits`);
    
    // If Overriding transactions, clear target account's transaction matrix cells and line items,
    // while strictly preserving all user comments (other_desc / other_credit_desc) and other accounts.
    if (strategies.transactions === 'override') {
      const preservedMatrix = {};
      Object.entries(nextDailyMatrix).forEach(([key, val]) => {
        const isTargetAcc = !data.targetAccountId || key.startsWith(`${data.targetAccountId}_`);
        const isComment = key.endsWith('_other_desc') || key.endsWith('_other_credit_desc');
        if (!isTargetAcc || isComment) {
          preservedMatrix[key] = val;
        }
      });
      nextDailyMatrix = preservedMatrix;
      if (data.targetAccountId) {
        nextLineItems = nextLineItems.filter(li => {
          const b = nextBills.find(bill => bill.id === li.billId);
          return b && b.accountId !== data.targetAccountId;
        });
      } else {
        nextLineItems = [];
      }
      matrixChanged = true;
      lineItemsChanged = true;
    }

    const lineItemUpdates = [];
    const matrixUpdates = {};

    data.transactions.forEach((txn, txnIdx) => {
      if (!txn.date || txn.amount === undefined) return;
      // If transaction was explicitly resolved to skip/ignore, do not process into matrix
      if (resolutions[txn.id]?.action === 'skip') return;

      const normDate = normalizeIsoDate(txn.date);
      if (!normDate) return;
      const parts = normDate.split('-');
      if (parts.length !== 3) return;
      const actualDay = parseInt(parts[2], 10);
      const rawAmount = parseFloat(txn.amount);
      if (isNaN(actualDay) || isNaN(rawAmount)) return;
      const actualAmount = Math.abs(rawAmount);
      const isCredit = rawAmount > 0;
      const monthKey = `${parts[0]}-${parts[1]}`;
      let accountId = txn.accountId;
      if (accountIdMap.has(accountId)) {
        accountId = accountIdMap.get(accountId);
      } else if (data.targetAccountId) {
        accountId = data.targetAccountId;
      }
      if (!accountId) accountId = nextAccounts[0]?.id || '';

      const descLower = (txn.description || '').toLowerCase();
      const notesLower = (txn.notes || '').toLowerCase();
      const isInterest = descLower.includes('interest') || notesLower.includes('interest') || (txn.category && txn.category.toLowerCase().includes('interest'));

      if (isCredit) {
        if (isInterest) {
          // Interest credit: periodic bank earning that routes directly into Other $ without requiring review
          const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
          const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
          const existingOther = matrixUpdates[otherKey] ?? 0;
          matrixUpdates[otherKey] = round2(parseMoney(existingOther, 0) + parseMoney(actualAmount, 0));

          const priorUserDesc = (nextDailyMatrix[otherDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
          matrixUpdates[otherDescKey] = priorUserDesc || matrixUpdates[otherDescKey] || 'Interest Credit';

          logDebug('MATCH', `Credit transaction #${txnIdx + 1} recognized as Interest Credit; routed to Other $`, {
            date: normDate,
            amount: actualAmount,
            otherKey
          });
        } else {
          // Check earner deposit match
          let matchedPerson;
          if (txn.personId) {
            matchedPerson = nextPeople.find(p => p.id === txn.personId);
          } else {
            const match = matchCreditToEarner({
              amount: actualAmount,
              description: txn.description,
              notes: txn.notes,
              category: txn.category,
              targetAccountId: accountId,
              people: nextPeople,
              bills: nextBills,
              accounts: nextAccounts
            });
            if (match) {
              matchedPerson = match.person;
            } else {
              // Last-resort literal name scan (only fires if matchCreditToEarner returned null)
              matchedPerson = nextPeople.find(p => p.name && descLower.includes(p.name.toLowerCase()));
            }
          }

          if (matchedPerson) {
            // Auto-persist manual earner mapping alias so future imports remember it
            if (txn.personId && txn.description) {
              const cleanDesc = txn.description.trim();
              const existingRaw = matchedPerson.bankMatchNames || matchedPerson.matchingKey || '';
              const existingList = existingRaw.split(/[,;\n\r|]+/).map(a => a.trim().toLowerCase());
              if (!existingList.includes(cleanDesc.toLowerCase()) && !matchedPerson.name.toLowerCase().includes(cleanDesc.toLowerCase())) {
                const updatedAliases = existingRaw ? `${existingRaw}, ${cleanDesc}` : cleanDesc;
                matchedPerson.bankMatchNames = updatedAliases;
                matchedPerson.matchingKey = updatedAliases;
                metadataChanged = true;
              }
            }

            const creditKey = `${accountId}_${monthKey}_${actualDay}_credit_${matchedPerson.id}`;
            const existingCredit = matrixUpdates[creditKey] ?? 0;
            matrixUpdates[creditKey] = round2(parseMoney(existingCredit, 0) + parseMoney(actualAmount, 0));

            logDebug('MATCH', `Matched credit transaction #${txnIdx + 1} to earner "${matchedPerson.name}"`, {
              date: normDate,
              desc: txn.description,
              amount: actualAmount,
              personId: matchedPerson.id,
              creditKey
            });

            // Zero out the corresponding scheduled payday for this pay cycle so it is not duplicated.
            const txnYear = parseInt(parts[0], 10);
            const txnMonthOneBased = parseInt(parts[1], 10); // 1-12
            const daysInTxnMonth = new Date(txnYear, txnMonthOneBased, 0).getDate();

            const personPayDays = getPersonTargetPayDaysForMonth(matchedPerson, txnYear, txnMonthOneBased - 1);
            let targetDayToSuppress = null;

            if (personPayDays.length > 0) {
              let minDiff = Infinity;
              personPayDays.forEach(pDate => {
                const pDay = pDate.getDate();
                const diff = Math.abs(pDay - actualDay);
                if (diff < minDiff) {
                  minDiff = diff;
                  targetDayToSuppress = pDay;
                }
              });
            }

            if (targetDayToSuppress === null) {
              const targetPayDay = actualDay <= 15
                ? (matchedPerson.payDay1 || 15)
                : (matchedPerson.payDay2 === 'last' ? daysInTxnMonth : (matchedPerson.payDay2 || daysInTxnMonth));
              const rawNumericPayDay = typeof targetPayDay === 'number'
                ? targetPayDay
                : parseInt(targetPayDay) || (actualDay <= 15 ? 15 : daysInTxnMonth);
              targetDayToSuppress = Math.min(rawNumericPayDay, daysInTxnMonth);
            }

            if (targetDayToSuppress !== null && targetDayToSuppress !== actualDay) {
              const schedCreditKey = `${accountId}_${monthKey}_${targetDayToSuppress}_credit_${matchedPerson.id}`;
              if (matrixUpdates[schedCreditKey] === undefined) {
                matrixUpdates[schedCreditKey] = 0;
              }
            }
          } else {
            importWarnings.push({
              kind: 'unmatched',
              message: `${normDate}: credit $${actualAmount.toFixed(2)} "${txn.description || ''}" matched no earner and was placed in Other $.`
            });
            // Unmatched credit: accumulate into consolidated other_amount (positive) and other_desc
            const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
            const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
            const existingOther = matrixUpdates[otherKey] ?? 0;
            matrixUpdates[otherKey] = round2(parseMoney(existingOther, 0) + parseMoney(actualAmount, 0));

            const cleanDesc = (txn.description || '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim() || txn.description;
            const priorUserDesc = (nextDailyMatrix[otherDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
            if (priorUserDesc) {
              // Strictly preserve existing user comment / description
              matrixUpdates[otherDescKey] = priorUserDesc;
            } else if (matrixUpdates[otherDescKey]) {
              if (cleanDesc && !matrixUpdates[otherDescKey].includes(cleanDesc)) {
                matrixUpdates[otherDescKey] = `${matrixUpdates[otherDescKey]} | ${cleanDesc}`;
              }
            } else {
              matrixUpdates[otherDescKey] = cleanDesc || '';
            }

            logDebug('MATCH', `Credit transaction #${txnIdx + 1} unmatched to known earner; routed to other_amount`, {
              date: normDate,
              desc: txn.description,
              amount: actualAmount,
              otherKey,
              otherDescKey
            });
          }
        }
      } else {
        // Debit / Expense: resolve bill
        let resolvedBillId = txn.billId;
        let matchStrategy = resolvedBillId ? 'explicit_bill_id' : null;

        // If explicitly set as isOther, do NOT match to any bill
        if (txn.isOther) {
          resolvedBillId = null;
        }

        // Tier 1: Match using unified findMatchingBill (exact name, exact alias, alias substring, name substring, keyword)
        if (!resolvedBillId && !txn.isOther) {
          const accountBills = nextBills.filter(b => !b.isArchived && (!b.accountId || b.accountId === accountId));
          const matched = findMatchingBill(txn.description, txn.notes, accountBills) ||
                          findMatchingBill(txn.description, txn.notes, nextBills.filter(b => !b.isArchived));
          if (matched) {
            resolvedBillId = matched.id;
            matchStrategy = `findMatchingBill (${matched.name})`;
          } else {
            // Tier 2: Expected Dollar Amount Match
            const candidateBills = [
              ...accountBills,
              ...nextBills.filter(b => !b.isArchived && b.accountId && b.accountId !== accountId)
            ];
            const matchedByAmount = candidateBills.find(b => {
              const billAmt = Math.abs(parseFloat(b.amount || 0));
              return Math.abs(billAmt - actualAmount) < 0.01;
            });

            if (matchedByAmount) {
              resolvedBillId = matchedByAmount.id;
              matchStrategy = `heuristic_amount ($${actualAmount} -> ${matchedByAmount.name})`;
            }
          }
        }

        if (resolvedBillId) {
          lineItemUpdates.push({ billId: resolvedBillId, monthKey, actualAmount });
          const bill = nextBills.find(b => b.id === resolvedBillId);
          const billTargetAccId = bill?.accountId || accountId;

          // Auto-persist manual bill mapping alias so future imports remember it
          if (bill && matchStrategy === 'explicit_bill_id' && txn.description) {
            const cleanDesc = txn.description.trim();
            const existingRaw = bill.bankMatchNames || bill.matchingKey || '';
            const existingList = existingRaw.split(/[,;\n\r|]+/).map(a => a.trim().toLowerCase());
            if (!existingList.includes(cleanDesc.toLowerCase()) && !bill.name.toLowerCase().includes(cleanDesc.toLowerCase())) {
              const updatedAliases = existingRaw ? `${existingRaw}, ${cleanDesc}` : cleanDesc;
              bill.bankMatchNames = updatedAliases;
              bill.matchingKey = updatedAliases;
              metadataChanged = true;
            }
          }

          if (bill?.accountId && bill.accountId !== accountId) {
            importWarnings.push({
              kind: 'cross_account',
              message: `${normDate}: debit $${actualAmount.toFixed(2)} "${txn.description || ''}" matched bill "${bill.name}", which belongs to a different account. It will not appear in this account's ledger.`
            });
          }
          const actualKey = `${billTargetAccId}_${monthKey}_${actualDay}_bill_${resolvedBillId}`;
          matrixUpdates[actualKey] = round2(parseMoney(matrixUpdates[actualKey] || 0) + actualAmount);

          logDebug('MATCH', `Debit transaction #${txnIdx + 1} matched to bill "${bill?.name || resolvedBillId}" via ${matchStrategy}`, {
            date: normDate,
            desc: txn.description,
            amount: actualAmount,
            billId: resolvedBillId,
            billTargetAccId,
            actualKey
          });

          // Zero out any prior recorded cell for this bill within 35 days (e.g. moved from prior month end or adjacent day)
          Object.keys(nextDailyMatrix).forEach(k => {
            if (k.includes(`_bill_${resolvedBillId}`)) {
              const match = k.match(/^(.+)_(\d{4}-\d{2})_(\d+)_bill_(.+)$/);
              if (match) {
                const [_, kAccId, kMonthKey, kDayStr, kBillId] = match;
                if (kAccId === billTargetAccId && kBillId === resolvedBillId) {
                  const kDateStr = `${kMonthKey}-${String(kDayStr).padStart(2, '0')}`;
                  if (kDateStr !== normDate) {
                    const diffDays = Math.abs(new Date(kDateStr) - new Date(normDate)) / 86400000;
                    if (diffDays <= 35 && matrixUpdates[k] === undefined) {
                      matrixUpdates[k] = 0;
                    }
                  }
                }
              }
            }
          });

          if (txn.previousDate && txn.previousDate !== normDate) {
            const prevParts = txn.previousDate.split('-');
            if (prevParts.length === 3) {
              const prevMonthKey = `${prevParts[0]}-${prevParts[1]}`;
              const prevDay = parseInt(prevParts[2], 10);
              const prevKey = `${billTargetAccId}_${prevMonthKey}_${prevDay}_bill_${resolvedBillId}`;
              if (matrixUpdates[prevKey] === undefined) {
                matrixUpdates[prevKey] = 0;
              }
            }
          }

          if (bill && bill.dueDay !== actualDay) {
            const projKey = `${billTargetAccId}_${monthKey}_${bill.dueDay}_bill_${resolvedBillId}`;
            if (matrixUpdates[projKey] === undefined) matrixUpdates[projKey] = 0;
          }
        } else {
          importWarnings.push({
            kind: 'unmatched',
            message: `${normDate}: debit $${actualAmount.toFixed(2)} "${txn.description || ''}" matched no bill and was placed in Other $.`
          });
          // Unmatched debit -> Other expense (negative in consolidated other_amount)
          const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
          const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
          const existingOther = matrixUpdates[otherKey] ?? 0;
          matrixUpdates[otherKey] = round2(parseMoney(existingOther, 0) - Math.abs(parseMoney(actualAmount, 0)));

          const cleanDesc = (txn.description || '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim() || txn.description;
          const priorUserDesc = (nextDailyMatrix[otherDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
          if (priorUserDesc) {
            // Strictly preserve existing user comment / description
            matrixUpdates[otherDescKey] = priorUserDesc;
          } else if (matrixUpdates[otherDescKey]) {
            if (cleanDesc && !matrixUpdates[otherDescKey].includes(cleanDesc)) {
              matrixUpdates[otherDescKey] = `${matrixUpdates[otherDescKey]} | ${cleanDesc}`;
            }
          } else {
            matrixUpdates[otherDescKey] = cleanDesc || '';
          }

          if (txn.previousDate && txn.previousDate !== normDate) {
            const prevParts = txn.previousDate.split('-');
            if (prevParts.length === 3) {
              const prevMonthKey = `${prevParts[0]}-${prevParts[1]}`;
              const prevDay = parseInt(prevParts[2], 10);
              const prevKey = `${accountId}_${prevMonthKey}_${prevDay}_other_amount`;
              if (matrixUpdates[prevKey] === undefined) {
                matrixUpdates[prevKey] = 0;
              }
            }
          }

          logWarn('MATCH', `Debit transaction #${txnIdx + 1} routed to Other Expense`, {
            date: normDate,
            desc: txn.description,
            amount: actualAmount,
            otherKey,
            otherDescKey
          });
        }
      }
    });

    if (lineItemUpdates.length > 0) {
      const updated = [...nextLineItems];
      lineItemUpdates.forEach(({ billId, monthKey, actualAmount }) => {
        const existingIdx = updated.findIndex(li => li.billId === billId && li.monthKey === monthKey);
        const entry = { billId, monthKey, actualAmount, updatedAt: Date.now() };
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], ...entry };
        } else {
          updated.push(entry);
        }
      });
      nextLineItems = updated;
      lineItemsChanged = true;
    }

    // FIX-10: Bank import must not write ending balances into dailyMatrix.
    // Store bank running balances only in importedLedgerRows (comparison data).
    // Do not remove existing reg_ending cells; FIX-08 already ignores them for calculation.
    const accIdForImport = data.targetAccountId || (nextAccounts[0]?.id);
    if (accIdForImport) {
      const incomingRows = {};
      if (data.importedLedgerRows && typeof data.importedLedgerRows === 'object') {
        Object.entries(data.importedLedgerRows).forEach(([dateStr, rowData]) => {
          if (typeof rowData === 'number') {
            incomingRows[dateStr] = { regEnding: rowData, extraEnding: 0, totalEnding: rowData };
          } else if (rowData && typeof rowData === 'object') {
            incomingRows[dateStr] = { ...rowData };
          }
        });
      }

      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        let isOldestFirst = false;
        const validDateTxns = data.transactions.filter(t => t.date);
        if (validDateTxns.length >= 2) {
          const firstDate = normalizeIsoDate(validDateTxns[0].date);
          const lastDate = normalizeIsoDate(validDateTxns[validDateTxns.length - 1].date);
          if (firstDate && lastDate && firstDate < lastDate) {
            isOldestFirst = true;
          }
        }
        data.transactions.forEach(t => {
          if (t.date && t.balance !== undefined && t.balance !== null && !isNaN(parseFloat(t.balance))) {
            const bal = Math.round(parseFloat(t.balance) * 100) / 100;
            if (incomingRows[t.date] === undefined || isOldestFirst) {
              incomingRows[t.date] = { regEnding: bal, extraEnding: 0, totalEnding: bal };
            }
          }
        });
      }

      if (strategies.transactions === 'override') {
        // OVERRIDE: fully replace target account's importedLedgerRows with incoming statement rows.
        // If the imported file has no running balance column, purge stale ledger rows so phantom bank diffs are not retained.
        const hasTxns = Array.isArray(data.transactions) && data.transactions.length > 0;
        nextAccounts = nextAccounts.map(acc => {
          if (acc.id === accIdForImport || acc.name === accIdForImport || (!data.targetAccountId && nextAccounts.length === 1)) {
            metadataChanged = true;
            return {
              ...acc,
              importedLedgerRows: incomingRows,
              ledgerMode: (Object.keys(incomingRows).length > 0 || hasTxns) ? 'import' : acc.ledgerMode
            };
          }
          return acc;
        });
      } else if (Object.keys(incomingRows).length > 0) {
        nextAccounts = nextAccounts.map(acc => {
          if (acc.id === accIdForImport) {
            const merged = { ...(acc.importedLedgerRows || {}), ...incomingRows };
            metadataChanged = true;
            return {
              ...acc,
              importedLedgerRows: merged,
              ledgerMode: 'import'
            };
          }
          return acc;
        });
      }
    }

    if (Object.keys(matrixUpdates).length > 0) {
      nextDailyMatrix = { ...nextDailyMatrix, ...matrixUpdates };
      matrixChanged = true;
    }
  }

  const updatedMetadataState = metadataChanged ? {
    ...metadataState,
    people: nextPeople,
    accounts: nextAccounts,
    bills: nextBills
  } : metadataState;

  logDebug('RECONCILE', 'Reconciliation complete', {
    metadataChanged,
    lineItemsChanged,
    matrixChanged,
    transactionsChanged,
    peopleCount: nextPeople.length,
    accountsCount: nextAccounts.length,
    billsCount: nextBills.length,
    transactionsCount: nextTransactions.length
  });

  return {
    success: true,
    metadataState: updatedMetadataState,
    lineItems: lineItemsChanged ? nextLineItems : lineItems,
    dailyMatrix: matrixChanged ? nextDailyMatrix : dailyMatrix,
    transactions: transactionsChanged ? nextTransactions : transactions,
    importWarnings
  };
}

/**
 * Calculates the ledger's running balance for a specific account as of a given date (YYYY-MM-DD).
 * Simulates daily cash flow up to targetDate (credits, bills, other debits/credits, overrides).
 *
 * @param {Object} params
 * @param {string} params.targetAccountId Account ID to calculate balance for
 * @param {string} [params.targetDate] Max date (YYYY-MM-DD) to calculate balance as of
 * @param {any} [params.metadataState] Metadata containing accounts, people, bills
 * @param {any} [params.dailyMatrix] Daily matrix key-value mapping
 * @param {Array} [params.transactions] Transactions list
 * @returns {number} The calculated running balance as of targetDate
 */
export function getLedgerRunningBalanceAsOfDate({
  targetAccountId,
  targetDate,
  metadataState = {},
  dailyMatrix = {},
  transactions = [],
  detailed = false
}) {
  const accounts = metadataState.accounts || [];
  const targetAcc = accounts.find(a => a.id === targetAccountId) || accounts[0];
  if (!targetAcc) return detailed ? { reg: 0, extra: 0, total: 0, regEnding: 0, extraEnding: 0, totalEnd: 0 } : 0;

  const showExtra = targetAcc.enableExtraSavings !== false;
  const startReg = parseMoney(targetAcc.startingBalance, 0);
  const startExtra = showExtra ? parseMoney(targetAcc.extraStartingBalance, 0) : 0;

  const effectiveStartDateStr = targetAcc.balanceAsOfDate || targetAcc.startDate || '2024-01-01';

  if (!targetDate) {
    const total = round2(startReg + startExtra);
    return detailed ? { reg: startReg, extra: startExtra, total, regEnding: startReg, extraEnding: startExtra, totalEnd: total } : total;
  }

  const parseIso = (str) => {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
    }
    return null;
  };

  const startDateObj = parseIso(effectiveStartDateStr) || new Date(2024, 0, 1);
  const targetDateObj = parseIso(targetDate);

  if (!targetDateObj || targetDateObj < startDateObj) {
    const accTxns = (transactions || []).filter(t => t.accountId === targetAccountId && t.date && t.date <= targetDate);
    const sum = accTxns.reduce((s, t) => s + parseMoney(t.amount, 0), 0);
    const reg = round2(startReg + sum);
    const total = round2(reg + startExtra);
    return detailed ? { reg, extra: startExtra, total, regEnding: reg, extraEnding: startExtra, totalEnd: total } : total;
  }

  const allAccTxnDates = (transactions || [])
    .filter(t => t.accountId === targetAccountId && t.date)
    .map(t => t.date)
    .sort();
  const earliestTxnDate = allAccTxnDates.length > 0 ? parseIso(allAccTxnDates[0]) : null;

  let simulationStartDate = startDateObj;
  if (earliestTxnDate && earliestTxnDate < simulationStartDate) {
    simulationStartDate = earliestTxnDate;
  }

  const allPeople = metadataState.people || [];
  const people = (targetAcc.enabledEarners && Array.isArray(targetAcc.enabledEarners))
    ? allPeople.filter(p => targetAcc.enabledEarners.includes(p.id))
    : allPeople;
  // P9: exclude archived bills from the running balance simulation
  const bills = (metadataState.bills || []).filter(b => !b.isArchived && b.accountId === targetAccountId);

  const accTxns = (transactions || []).filter(t => t.accountId === targetAccountId && t.date);
  const maxTxnDate = accTxns.length > 0 ? accTxns.map(t => t.date).sort().pop() : null;
  const isImportMode = targetAcc.ledgerMode === 'import' || (targetAcc.importedLedgerRows && Object.keys(targetAcc.importedLedgerRows).length > 0) || accTxns.length > 0;
  const importedRows = isImportMode ? (targetAcc.importedLedgerRows || {}) : {};
  const importedDatesList = Object.keys(importedRows);
  const maxImportDateStr = importedDatesList.length > 0 ? importedDatesList.reduce((a, b) => a > b ? a : b) : null;
  const maxDataDate = [maxImportDateStr, maxTxnDate].filter(Boolean).sort().pop() || null;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const effectiveLockEnd = maxDataDate && maxDataDate < todayStr ? maxDataDate : todayStr;

  const earnerPlanCache = new Map();
  people.forEach(p => {
    const planDep = round2(getPersonDepositAmountForAccount(p, targetAccountId, metadataState));
    const planExtra = planDep > 0 ? round2(getPersonExtraSavingsDepositAmountForAccount(p, targetAccountId, metadataState)) : 0;
    earnerPlanCache.set(p.id, { planDeposit: planDep, planExtra });
  });

  let runningReg = startReg;
  let runningExtra = startExtra;

  let cur = new Date(simulationStartDate);
  while (cur <= targetDateObj) {
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
      const expectedBillAmt = round2(b.amount, 0);
      if (bVal !== undefined && bVal !== null && bVal !== '') {
        const amt = parseMoney(bVal, 0);
        dayBills = round2(dayBills + amt);
      } else if (!isLockedDay) {
        if (!b.isArchived && effectiveDueDay(b, y, m) === d && isBillDueInMonth(b, m, true)) {
          dayBills = round2(dayBills + expectedBillAmt);
        }
      }
    });

    const oVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_amount`];
    const dayOther = (oVal !== undefined && oVal !== null && oVal !== '') ? parseMoney(oVal, 0) : 0;

    const ocVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_credit_amount`];
    const dayOtherCredit = (ocVal !== undefined && ocVal !== null && ocVal !== '') ? parseMoney(ocVal, 0) : 0;

    // FIX-08 / FIX-16: ending = round2(beginning + credits - bills + other) every day.
    // Other $ belongs to regular operating deductions/credits.
    // Never replace it with reg_ending, extra_ending, or importedLedgerRows values.
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
  if (detailed) {
    return {
      reg: runningReg,
      extra: runningExtra,
      total,
      regEnding: runningReg,
      extraEnding: runningExtra,
      totalEnd: total
    };
  }
  return total;
}
