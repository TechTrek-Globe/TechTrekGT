import { normalizeIsoDate, mergeBills, mergeTransactions, detectTransactionConflicts, matchCreditToEarner } from './importer.js';
import { logDebug, logWarn, logInfo } from './debugLogger.js';

/**
 * Pure utility function to reconcile and apply selective spreadsheet/CSV imports.
 * Reconciles imported namespaces (people, accounts, bills, transactions) against existing state,
 * and matches actual transactions to projected bills and earner deposits.
 *
 * @param {Object} params
 * @param {Object} params.namespaces Map of namespaces enabled for import ({ people, accounts, bills, transactions })
 * @param {Object} params.strategies Map of merge strategies per namespace ('override' | 'merge')
 * @param {Object} params.data Imported data payload containing people, accounts, bills, transactions, targetAccountId, etc.
 * @param {Object} params.metadataState Current metadata state (accounts, people, bills, loans, etc.)
 * @param {Array} [params.lineItems] Current line items
 * @param {Object} [params.dailyMatrix] Current daily matrix
 * @param {Array} [params.transactions] Current transactions
 * @param {boolean} [params.dryRun] If true, halts and returns conflicts instead of committing
 * @param {Object} [params.resolutions] Map of incoming ID -> { action, targetId } for resolving conflicts
 * @returns {{
 *   success: boolean,
 *   error?: string,
 *   requiresResolution?: boolean,
 *   conflicts?: Array,
 *   metadataState?: Object,
 *   lineItems?: Array,
 *   dailyMatrix?: Object,
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
  metadataState = {},
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
            // Never wipe earlier historical ledger rows: merge incoming on top of existing
            const mergedRows = { ...(a.importedLedgerRows || {}), ...importedRows };
            let newStartingBalance = a.startingBalance;
            let newExtraStarting = a.extraStartingBalance || 0;
            
            let newStartDate = a.startDate;
            let newBalanceAsOfDate = a.balanceAsOfDate;
            if (strategies.transactions === 'override') {
              const dates = Object.keys(mergedRows).sort();
              // Only adopt earliest date/balance if account has no prior startDate or if dates[0] is earlier than existing startDate
              if (dates.length > 0 && (!a.startDate || dates[0] < a.startDate)) {
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
              if (dates.length > 0 && (!match.startDate || dates[0] < match.startDate)) {
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
          patches.importedLedgerRows = { ...(acc.importedLedgerRows || {}), ...data.importedLedgerRows };
          patches.ledgerMode = 'import';
          
          if (strategies.transactions === 'override') {
            const dates = Object.keys(data.importedLedgerRows).sort();
            if (dates.length > 0 && (!acc.startDate || dates[0] < acc.startDate)) {
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
      if (data.targetAccountId) {
        if (minImportDate && maxImportDate) {
          // Date-scoped override: ONLY replace transactions for THIS target account that fall within [minImportDate, maxImportDate].
          // Historical transactions prior to minImportDate and future projected transactions after maxImportDate are strictly preserved.
          const preservedTransactions = nextTransactions.filter(t => {
            if (t.accountId !== data.targetAccountId) return true;
            const tDate = normalizeIsoDate(t.date);
            if (!tDate) return true;
            return tDate < minImportDate || tDate > maxImportDate;
          });
          nextTransactions = [...preservedTransactions, ...stampedTransactions];
        } else {
          const otherAccTransactions = nextTransactions.filter(t => t.accountId !== data.targetAccountId);
          nextTransactions = [...otherAccTransactions, ...stampedTransactions];
        }
      } else {
        if (minImportDate && maxImportDate) {
          const preservedTransactions = nextTransactions.filter(t => {
            const tDate = normalizeIsoDate(t.date);
            if (!tDate) return true;
            return tDate < minImportDate || tDate > maxImportDate;
          });
          nextTransactions = [...preservedTransactions, ...stampedTransactions];
        } else {
          nextTransactions = stampedTransactions;
        }
      }
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
    
    // If Overriding transactions, clean out existing matrix cells and line items for this account only within the imported date range
    if (strategies.transactions === 'override') {
      if (data.targetAccountId) {
        if (minImportDate && maxImportDate) {
          const nextCleanMatrix = {};
          Object.entries(nextDailyMatrix).forEach(([k, v]) => {
            if (!k.startsWith(`${data.targetAccountId}_`)) {
              nextCleanMatrix[k] = v;
              return;
            }
            const parts = k.split('_');
            const mKey = parts[1];
            if (!mKey || mKey < minImportMonth || mKey > maxImportMonth) {
              nextCleanMatrix[k] = v;
              return;
            }
            const rawDay = parseInt(parts[2], 10);
            if (!isNaN(rawDay)) {
              const keyDate = `${mKey}-${String(rawDay).padStart(2, '0')}`;
              if (keyDate < minImportDate || keyDate > maxImportDate) {
                nextCleanMatrix[k] = v;
                return;
              }
            }
          });
          nextDailyMatrix = nextCleanMatrix;

          const accountBillIds = new Set(nextBills.filter(b => b.accountId === data.targetAccountId).map(b => b.id));
          nextLineItems = nextLineItems.filter(li => {
            if (!accountBillIds.has(li.billId)) return true;
            if (!li.monthKey) return true;
            return li.monthKey < minImportMonth || li.monthKey > maxImportMonth;
          });
        } else {
          const nextCleanMatrix = {};
          Object.entries(nextDailyMatrix).forEach(([k, v]) => {
            if (!k.startsWith(`${data.targetAccountId}_`)) {
              nextCleanMatrix[k] = v;
            }
          });
          nextDailyMatrix = nextCleanMatrix;

          const accountBillIds = new Set(nextBills.filter(b => b.accountId === data.targetAccountId).map(b => b.id));
          nextLineItems = nextLineItems.filter(li => !accountBillIds.has(li.billId));
        }
      } else {
        if (minImportDate && maxImportDate) {
          const nextCleanMatrix = {};
          Object.entries(nextDailyMatrix).forEach(([k, v]) => {
            const parts = k.split('_');
            const mKey = parts[1];
            if (!mKey || mKey < minImportMonth || mKey > maxImportMonth) {
              nextCleanMatrix[k] = v;
              return;
            }
            const rawDay = parseInt(parts[2], 10);
            if (!isNaN(rawDay)) {
              const keyDate = `${mKey}-${String(rawDay).padStart(2, '0')}`;
              if (keyDate < minImportDate || keyDate > maxImportDate) {
                nextCleanMatrix[k] = v;
                return;
              }
            }
          });
          nextDailyMatrix = nextCleanMatrix;

          nextLineItems = nextLineItems.filter(li => {
            if (!li.monthKey) return true;
            return li.monthKey < minImportMonth || li.monthKey > maxImportMonth;
          });
        } else {
          nextDailyMatrix = {};
          nextLineItems = [];
        }
      }
      matrixChanged = true;
      lineItemsChanged = true;
    }

    const lineItemUpdates = [];
    const matrixUpdates = {};
    const matrixNoteShifts = [];

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

      if (isCredit) {
        // Check earner deposit match
        let matchedPerson = null;
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
          const creditKey = `${accountId}_${monthKey}_${actualDay}_credit_${matchedPerson.id}`;
          const existingCredit = matrixUpdates[creditKey] ?? 0;
          matrixUpdates[creditKey] = Math.round((existingCredit + actualAmount) * 100) / 100;

          logDebug('MATCH', `Matched credit transaction #${txnIdx + 1} to earner "${matchedPerson.name}"`, {
            date: normDate,
            desc: txn.description,
            amount: actualAmount,
            personId: matchedPerson.id,
            creditKey
          });

          // Zero out the scheduled payday in this half of the month so it isn't duplicated
          const targetPayDay = actualDay <= 15 ? (matchedPerson.payDay1 || 15) : (matchedPerson.payDay2 === 'last' ? 31 : (matchedPerson.payDay2 || 30));
          const numericPayDay = typeof targetPayDay === 'number' ? targetPayDay : parseInt(targetPayDay) || (actualDay <= 15 ? 15 : 30);
          if (numericPayDay !== actualDay) {
            const schedCreditKey = `${accountId}_${monthKey}_${numericPayDay}_credit_${matchedPerson.id}`;
            if (matrixUpdates[schedCreditKey] === undefined) {
              matrixUpdates[schedCreditKey] = 0;
            }
          }
        } else {
          // Unmatched credit: accumulate into consolidated other_amount (positive) and other_desc
          const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
          const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
          const existingOther = matrixUpdates[otherKey] ?? nextDailyMatrix[otherKey] ?? 0;
          matrixUpdates[otherKey] = Math.round((parseFloat(existingOther) + actualAmount) * 100) / 100;

          const cleanDesc = (txn.description || '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim() || txn.description;
          const existingOtherDesc = (matrixUpdates[otherDescKey] ?? nextDailyMatrix[otherDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
          if (existingOtherDesc && cleanDesc && !existingOtherDesc.includes(cleanDesc)) {
            matrixUpdates[otherDescKey] = `${existingOtherDesc} | ${cleanDesc}`;
          } else if (!existingOtherDesc) {
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
      } else {
        // Debit / Expense: resolve bill
        let resolvedBillId = txn.billId;
        let matchStrategy = resolvedBillId ? 'explicit_bill_id' : null;

        // If explicitly set as isOther, do NOT match to any bill
        if (txn.isOther) {
          resolvedBillId = null;
        }

        // Tier 1: Match by Bank Match Names (Statement Aliases) - Highest priority
        if (!resolvedBillId && !txn.isOther && (descLower || notesLower)) {
          // Check bills assigned to target account first
          const accountBills = nextBills.filter(b => !b.isArchived && (!b.accountId || b.accountId === accountId));
          let bestMatch = null;
          let longestMatchLen = 0;

          for (const b of accountBills) {
            const aliases = getBillMatchAliases(b);
            for (const alias of aliases) {
              if (alias.length < 2) continue;
              const inDesc = descLower && descLower.includes(alias);
              const inNotes = notesLower && notesLower.includes(alias);
              if (inDesc || inNotes) {
                if (alias.length > longestMatchLen) {
                  bestMatch = { bill: b, alias };
                  longestMatchLen = alias.length;
                }
              }
            }
          }

          // If no match on target account, check other accounts
          if (!bestMatch) {
            const otherBills = nextBills.filter(b => !b.isArchived && b.accountId && b.accountId !== accountId);
            for (const b of otherBills) {
              const aliases = getBillMatchAliases(b);
              for (const alias of aliases) {
                if (alias.length < 2) continue;
                const inDesc = descLower && descLower.includes(alias);
                const inNotes = notesLower && notesLower.includes(alias);
                if (inDesc || inNotes) {
                  if (alias.length > longestMatchLen) {
                    bestMatch = { bill: b, alias };
                    longestMatchLen = alias.length;
                  }
                }
              }
            }
          }

          if (bestMatch) {
            resolvedBillId = bestMatch.bill.id;
            matchStrategy = `bank_match_alias ("${bestMatch.alias}" -> ${bestMatch.bill.name})`;
          }
        }

        // Tier 2 (Fallback): Heuristics (Bill Name similarity, domain synonyms, expected dollar amount)
        if (!resolvedBillId && !txn.isOther && descLower) {
          // 2A: Bill Name & Domain synonyms - Check target account bills first, then other accounts
          const candidateBills = [
            ...nextBills.filter(b => !b.isArchived && (!b.accountId || b.accountId === accountId)),
            ...nextBills.filter(b => !b.isArchived && b.accountId && b.accountId !== accountId)
          ];
          const matchedHeuristic = candidateBills.find(b => {
            const bName = (b.name || '').toLowerCase().trim();

            if (bName && (descLower.includes(bName) || bName.includes(descLower))) return true;
            if ((descLower.includes('insurance') || descLower.includes('progressive') || descLower.includes('geico') || descLower.includes('allstate')) &&
                (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) return true;
            if ((descLower.includes('cell') || descLower.includes('phone') || descLower.includes('verizon') || descLower.includes('t-mobile') || descLower.includes('att')) &&
                (bName.includes('cell') || bName.includes('phone') || bName.includes('wireless'))) return true;
            if ((descLower.includes('gym') || descLower.includes('planet fitness') || descLower.includes('la fitness')) &&
                (bName.includes('gym') || bName.includes('fitness') || bName.includes('membership'))) return true;
            if (descLower.includes('wells fargo') && (bName.includes('cell') || bName.includes('wells'))) return true;
            if (descLower.includes('bank of america') && (bName.includes('gym') || bName.includes('america'))) return true;
            if ((descLower.includes('power') || descLower.includes('electric') || descLower.includes('georgia power')) &&
                (bName.includes('power') || bName.includes('electric') || bName.includes('utility'))) return true;
            if (descLower.includes('water') && bName.includes('water')) return true;
            if ((descLower.includes('gas') || descLower.includes('energy') || descLower.includes('geo')) && bName.includes('gas')) return true;
            if (descLower.includes('energy inc') && (bName.includes('gas') || bName.includes('energy'))) return true;
            if (descLower.includes('hoa') && bName.includes('hoa')) return true;
            if (descLower.includes('mortgage') && bName.includes('mortgage')) return true;
            if ((descLower.includes('comcast') || descLower.includes('xfinity') || descLower.includes('spectrum')) &&
                (bName.includes('comcast') || bName.includes('internet') || bName.includes('xfinity') || bName.includes('cable'))) return true;
            if (descLower.includes('youtube') && bName.includes('youtube')) return true;
            if (descLower.includes('netflix') && bName.includes('netflix')) return true;

            return false;
          });

          if (matchedHeuristic) {
            resolvedBillId = matchedHeuristic.id;
            matchStrategy = `heuristic_name (${matchedHeuristic.name})`;
          } else {
            // 2B: Expected Dollar Amount Match
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
          const actualKey = `${billTargetAccId}_${monthKey}_${actualDay}_bill_${resolvedBillId}`;
          const existingBillAmt = matrixUpdates[actualKey] ?? 0;
          matrixUpdates[actualKey] = Math.round((existingBillAmt + actualAmount) * 100) / 100;

          logDebug('MATCH', `Debit transaction #${txnIdx + 1} matched to bill "${bill?.name || resolvedBillId}" via ${matchStrategy}`, {
            date: normDate,
            desc: txn.description,
            amount: actualAmount,
            billId: resolvedBillId,
            billTargetAccId,
            actualKey
          });

          // If this bill previously had a recorded day in this month in nextDailyMatrix that differs from actualDay, zero it out so it cleanly moves to the new day
          Object.keys(nextDailyMatrix).forEach(k => {
            if (k.startsWith(`${billTargetAccId}_${monthKey}_`) && k.endsWith(`_bill_${resolvedBillId}`)) {
              const dayStr = k.replace(`${billTargetAccId}_${monthKey}_`, '').replace(`_bill_${resolvedBillId}`, '');
              const oldDay = parseInt(dayStr, 10);
              if (oldDay !== actualDay && matrixUpdates[k] === undefined) {
                matrixUpdates[k] = 0;
              }
            }
          });

          if (bill && bill.dueDay !== actualDay) {
            const projKey = `${billTargetAccId}_${monthKey}_${bill.dueDay}_bill_${resolvedBillId}`;
            if (matrixUpdates[projKey] === undefined) matrixUpdates[projKey] = 0;
            const projNoteKey = `${billTargetAccId}_${monthKey}_${bill.dueDay}_other_desc`;
            const actualNoteKey = `${billTargetAccId}_${monthKey}_${actualDay}_other_desc`;
            matrixNoteShifts.push({ projNoteKey, actualNoteKey });
          }
        } else {
          // Unmatched debit -> Other expense (negative in consolidated other_amount)
          const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
          const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
          const existingOther = matrixUpdates[otherKey] ?? nextDailyMatrix[otherKey] ?? 0;
          matrixUpdates[otherKey] = Math.round((parseFloat(existingOther) - Math.abs(actualAmount)) * 100) / 100;

          const cleanDesc = (txn.description || '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim() || txn.description;
          const existingOtherDesc = (matrixUpdates[otherDescKey] ?? nextDailyMatrix[otherDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
          if (existingOtherDesc && cleanDesc && !existingOtherDesc.includes(cleanDesc)) {
            matrixUpdates[otherDescKey] = `${existingOtherDesc} | ${cleanDesc}`;
          } else {
            matrixUpdates[otherDescKey] = existingOtherDesc || cleanDesc;
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

    // Ultimate Truth: Sync stated imported ledger balances and transaction balances directly into dailyMatrix as reg_ending
    if (data.importedLedgerRows && typeof data.importedLedgerRows === 'object') {
      const accId = data.targetAccountId || (nextAccounts[0]?.id);
      Object.entries(data.importedLedgerRows).forEach(([dateStr, rowData]) => {
        const parts = dateStr.split('-');
        if (parts.length === 3 && accId) {
          const y = parts[0];
          const m = parts[1];
          const d = parseInt(parts[2], 10);
          const mKey = `${y}-${m}`;
          let stated = null;
          if (typeof rowData === 'number') {
            stated = rowData;
          } else if (rowData && typeof rowData === 'object') {
            stated = rowData.regEnding ?? rowData.totalEnding ?? null;
          }
          if (stated !== null && !isNaN(stated)) {
            const regEndKey = `${accId}_${mKey}_${d}_reg_ending`;
            matrixUpdates[regEndKey] = Math.round(stated * 100) / 100;
          }
        }
      });
    }

    if (Array.isArray(data.transactions)) {
      const dateBalances = {};
      data.transactions.forEach(t => {
        if (t.date && t.balance !== undefined && t.balance !== null && !isNaN(parseFloat(t.balance))) {
          const accId = t.accountId || data.targetAccountId || (nextAccounts[0]?.id);
          const key = `${accId}_${t.date}`;
          dateBalances[key] = {
            accId,
            date: t.date,
            balance: Math.round(parseFloat(t.balance) * 100) / 100
          };
        }
      });

      Object.values(dateBalances).forEach(({ accId, date, balance }) => {
        const parts = date.split('-');
        if (parts.length === 3) {
          const y = parts[0];
          const m = parts[1];
          const d = parseInt(parts[2], 10);
          const mKey = `${y}-${m}`;
          const regEndKey = `${accId}_${mKey}_${d}_reg_ending`;
          if (matrixUpdates[regEndKey] === undefined) {
            matrixUpdates[regEndKey] = balance;
          }
        }
      });
    }

    if (Object.keys(matrixUpdates).length > 0 || matrixNoteShifts.length > 0) {
      const next = { ...nextDailyMatrix, ...matrixUpdates };

      matrixNoteShifts.forEach(({ projNoteKey, actualNoteKey }) => {
        const existingProjNote = nextDailyMatrix[projNoteKey];
        const existingActualNote = next[actualNoteKey] || nextDailyMatrix[actualNoteKey] || '';
        if (existingProjNote) {
          if (!existingActualNote) {
            next[actualNoteKey] = existingProjNote;
          } else if (!existingActualNote.includes(existingProjNote)) {
            next[actualNoteKey] = `${existingActualNote} | ${existingProjNote}`;
          }
          next[projNoteKey] = '';
        }
      });
      nextDailyMatrix = next;
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
    transactions: transactionsChanged ? nextTransactions : transactions
  };
}

/**
 * Calculates the ledger's running balance for a specific account as of a given date (YYYY-MM-DD).
 * Simulates daily cash flow up to targetDate (credits, bills, other debits/credits, overrides).
 *
 * @param {Object} params
 * @param {string} params.targetAccountId Account ID to calculate balance for
 * @param {string} [params.targetDate] Max date (YYYY-MM-DD) to calculate balance as of
 * @param {Object} params.metadataState Metadata containing accounts, people, bills
 * @param {Object} [params.dailyMatrix] Daily matrix key-value mapping
 * @param {Array} [params.transactions] Transactions list
 * @returns {number} The calculated running balance as of targetDate
 */
export function getLedgerRunningBalanceAsOfDate({
  targetAccountId,
  targetDate,
  metadataState = {},
  dailyMatrix = {},
  transactions = []
}) {
  const accounts = metadataState.accounts || [];
  const targetAcc = accounts.find(a => a.id === targetAccountId) || accounts[0];
  if (!targetAcc) return 0;

  const showExtra = targetAcc.enableExtraSavings !== false;
  const startReg = parseFloat(targetAcc.startingBalance) || 0;
  const startExtra = showExtra ? (parseFloat(targetAcc.extraStartingBalance) || 0) : 0;

  const effectiveStartDateStr = targetAcc.balanceAsOfDate || targetAcc.startDate || '2024-01-01';

  if (!targetDate) {
    return Math.round((startReg + startExtra) * 100) / 100;
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
    const sum = accTxns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    return Math.round((startReg + startExtra + sum) * 100) / 100;
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

  const people = metadataState.people || [];
  const bills = (metadataState.bills || []).filter(b => b.accountId === targetAccountId);

  let runningReg = startReg;
  let runningExtra = startExtra;

  let cur = new Date(simulationStartDate);
  while (cur <= targetDateObj) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const d = cur.getDate();
    const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;

    let dayCredits = 0;
    let dayExtraCredits = 0;
    people.forEach(p => {
      const c = dailyMatrix[`${targetAccountId}_${mKey}_${d}_credit_${p.id}`];
      const ec = dailyMatrix[`${targetAccountId}_${mKey}_${d}_extra_credit_${p.id}`];
      const earnerDeposit = (c !== undefined && c !== null && c !== '') ? (parseFloat(c) || 0) : 0;
      const earnerExtra = (ec !== undefined && ec !== null && ec !== '') ? (parseFloat(ec) || 0) : 0;
      const clampedExtra = Math.min(earnerExtra, earnerDeposit);
      const earnerReg = Math.max(0, earnerDeposit - clampedExtra);
      dayCredits += earnerReg;
      dayExtraCredits += (earnerDeposit > 0 ? clampedExtra : earnerExtra);
    });

    let dayBills = 0;
    // Track whether any bill has a manual dailyMatrix override on this day.
    let hasDayBillOverride = false;
    bills.forEach(b => {
      const bVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_bill_${b.id}`];
      if (bVal !== undefined && bVal !== null && bVal !== '') {
        hasDayBillOverride = true;
        dayBills += parseFloat(bVal) || 0;
      }
    });

    const oVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_amount`];
    const dayOther = oVal !== undefined && oVal !== null && oVal !== '' ? (parseFloat(oVal) || 0) : 0;

    const ocVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_credit_amount`];
    const dayOtherCredit = ocVal !== undefined && ocVal !== null && ocVal !== '' ? (parseFloat(ocVal) || 0) : 0;

    const tentativeReg = runningReg + dayCredits - dayBills;
    const tentativeExtra = runningExtra + dayExtraCredits + dayOtherCredit + dayOther;

    let reg = tentativeReg;
    let extra = tentativeExtra;

    if (reg < 0 && extra > 0) {
      const transfer = Math.min(extra, -reg);
      reg += transfer;
      extra -= transfer;
    } else if (extra < 0 && reg > 0) {
      const transfer = Math.min(reg, -extra);
      extra += transfer;
      reg -= transfer;
    }

    runningReg = Math.round(reg * 100) / 100 || 0;
    runningExtra = Math.round(extra * 100) / 100 || 0;

    cur.setDate(cur.getDate() + 1);
  }

  return Math.round((runningReg + (showExtra ? runningExtra : 0)) * 100) / 100;
}
