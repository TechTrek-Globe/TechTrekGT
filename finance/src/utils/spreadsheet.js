import { normalizeIsoDate, mergeBills, mergeTransactions, detectTransactionConflicts } from './importer.js';
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
 *   transactions?: Array
 * }}
 */
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
  if (namespaces.accounts && Array.isArray(data.accounts)) {
    logDebug('RECONCILE', 'Reconciling accounts namespace', { strategy: strategies.accounts, incomingCount: data.accounts.length, existingCount: nextAccounts.length });
    if (strategies.accounts === 'override') {
      if (data.targetAccountId) {
        // Reset the specific target account's importedLedgerRows and ledger metadata
        const incomingTargetAcc = data.accounts.find(a => a.id === data.targetAccountId) || data.accounts[0];
        nextAccounts = nextAccounts.map(a => {
          if (a.id === data.targetAccountId) {
            const importedRows = incomingTargetAcc?.importedLedgerRows || data.importedLedgerRows || {};
            let newStartingBalance = a.startingBalance;
            let newExtraStarting = a.extraStartingBalance || 0;
            
            let newStartDate = a.startDate;
            let newBalanceAsOfDate = a.balanceAsOfDate;
            if (strategies.transactions === 'override') {
              const dates = Object.keys(importedRows).sort();
              if (dates.length > 0) {
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
              importedLedgerRows: importedRows,
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
          if (strategies.accounts === 'override') {
            patches.importedLedgerRows = data.importedLedgerRows;
          } else {
            patches.importedLedgerRows = { ...(acc.importedLedgerRows || {}), ...data.importedLedgerRows };
          }
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
        // Clear out existing transactions for THIS specific account, keep transactions of other accounts
        const otherAccTransactions = nextTransactions.filter(t => t.accountId !== data.targetAccountId);
        nextTransactions = [...otherAccTransactions, ...stampedTransactions];
      } else {
        nextTransactions = stampedTransactions;
      }
      transactionsChanged = true;
    } else {
      if (dryRun) {
        const conflicts = detectTransactionConflicts(nextTransactions, stampedTransactions);
        // Only return conflicts if there are any that haven't been resolved yet
        const unresolvedConflicts = conflicts.filter(c => !resolutions[c.incoming.id]);
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
    
    // If Overriding transactions, clean out existing matrix cells and line items for this account first
    if (strategies.transactions === 'override') {
      if (data.targetAccountId) {
        const nextCleanMatrix = {};
        Object.entries(nextDailyMatrix).forEach(([k, v]) => {
          if (!k.startsWith(`${data.targetAccountId}_`)) {
            nextCleanMatrix[k] = v;
          }
        });
        nextDailyMatrix = nextCleanMatrix;

        const accountBillIds = new Set(nextBills.filter(b => b.accountId === data.targetAccountId).map(b => b.id));
        nextLineItems = nextLineItems.filter(li => !accountBillIds.has(li.billId));
      } else {
        nextDailyMatrix = {};
        nextLineItems = [];
      }
      matrixChanged = true;
      lineItemsChanged = true;
    }

    const lineItemUpdates = [];
    const matrixUpdates = {};
    const matrixNoteShifts = [];

    data.transactions.forEach((txn, txnIdx) => {
      if (!txn.date || txn.amount === undefined) return;
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
        if (descLower.includes('hp') || descLower.includes('gym')) {
          matchedPerson = nextPeople.find(p => (p.name || '').toLowerCase().includes('gym'));
        } else if (descLower.includes('jon') || descLower.includes('usaa') || descLower.includes('transfer')) {
          matchedPerson = nextPeople.find(p => (p.name || '').toLowerCase() === 'jon') || nextPeople[0];
        } else if (descLower.includes('ronnie')) {
          matchedPerson = nextPeople.find(p => (p.name || '').toLowerCase() === 'ronnie');
        } else {
          matchedPerson = nextPeople.find(p => p.name && descLower.includes(p.name.toLowerCase()));
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

        // 1. Match by Bank Document Matching Key (Highest priority)
        if (!resolvedBillId && (descLower || notesLower)) {
          const matchedByKey = nextBills.find(b => {
            if (b.accountId && accountId && b.accountId !== accountId) return false;
            if (!b.matchingKey || !b.matchingKey.trim()) return false;
            const keys = String(b.matchingKey).split(/[,;/|]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
            return keys.some(k => (
              (descLower && descLower.includes(k)) ||
              (descLower && k.length >= 3 && k.includes(descLower)) ||
              (notesLower && notesLower.includes(k))
            ));
          });
          if (matchedByKey) {
            resolvedBillId = matchedByKey.id;
            matchStrategy = `bank_doc_key (${matchedByKey.matchingKey})`;
          }
        }

        // 2. Secondary match: Heuristic name and synonym matches
        if (!resolvedBillId && descLower) {
          const matched = nextBills.find(b => {
            if (b.accountId && accountId && b.accountId !== accountId) return false;
            const bName = (b.name || '').toLowerCase();
            const pSource = (b.paymentSource || '').toLowerCase();
            if (bName && (descLower.includes(bName) || bName.includes(descLower))) return true;
            if (pSource && (descLower.includes(pSource) || pSource.includes(descLower))) return true;
            if ((descLower.includes('insurance') || descLower.includes('progressive') || descLower.includes('geico')) && (bName.includes('insurance') || bName.includes('vehicle') || bName.includes('auto'))) return true;
            if (descLower.includes('cell') && (bName.includes('cell') || bName.includes('phone'))) return true;
            if (descLower.includes('phone') && (bName.includes('cell') || bName.includes('phone'))) return true;
            if (descLower.includes('gym') && (bName.includes('gym') || bName.includes('membership'))) return true;
            if (descLower.includes('wells fargo') && (bName.includes('cell') || pSource.includes('wells'))) return true;
            if (descLower.includes('bank of america') && (bName.includes('gym') || pSource.includes('america'))) return true;
            if (descLower.includes('georgia power') && (bName.includes('power') || bName.includes('electric'))) return true;
            if ((descLower.includes('power') || descLower.includes('electric')) && (bName.includes('power') || bName.includes('electric'))) return true;
            if (descLower.includes('water') && bName.includes('water')) return true;
            if (descLower.includes('gas') && bName.includes('gas')) return true;
            if (descLower.includes('hoa') && bName.includes('hoa')) return true;
            if (descLower.includes('mortgage') && bName.includes('mortgage')) return true;
            if (descLower.includes('comcast') && (bName.includes('comcast') || bName.includes('internet') || bName.includes('xfinity'))) return true;
            if (descLower.includes('youtube') && bName.includes('youtube')) return true;
            if (Math.abs(parseFloat(b.amount || 0) - actualAmount) < 0.01 && (!b.accountId || b.accountId === accountId)) return true;
            return false;
          });
          if (matched) {
            resolvedBillId = matched.id;
            matchStrategy = `heuristic_name (${matched.name})`;
          }
        }

        if (resolvedBillId) {
          lineItemUpdates.push({ billId: resolvedBillId, monthKey, actualAmount });
          const bill = nextBills.find(b => b.id === resolvedBillId);
          const actualKey = `${accountId}_${monthKey}_${actualDay}_bill_${resolvedBillId}`;
          const existingBillAmt = matrixUpdates[actualKey] ?? 0;
          matrixUpdates[actualKey] = Math.round((existingBillAmt + actualAmount) * 100) / 100;

          logDebug('MATCH', `Debit transaction #${txnIdx + 1} matched to bill "${bill?.name || resolvedBillId}" via ${matchStrategy}`, {
            date: normDate,
            desc: txn.description,
            amount: actualAmount,
            billId: resolvedBillId,
            actualKey
          });

          // If this bill previously had a recorded day in this month in nextDailyMatrix that differs from actualDay, zero it out so it cleanly moves to the new day
          Object.keys(nextDailyMatrix).forEach(k => {
            if (k.startsWith(`${accountId}_${monthKey}_`) && k.endsWith(`_bill_${resolvedBillId}`)) {
              const dayStr = k.replace(`${accountId}_${monthKey}_`, '').replace(`_bill_${resolvedBillId}`, '');
              const oldDay = parseInt(dayStr, 10);
              if (oldDay !== actualDay && matrixUpdates[k] === undefined) {
                matrixUpdates[k] = 0;
              }
            }
          });

          if (bill && bill.dueDay !== actualDay) {
            const projKey = `${accountId}_${monthKey}_${bill.dueDay}_bill_${resolvedBillId}`;
            if (matrixUpdates[projKey] === undefined) matrixUpdates[projKey] = 0;
            const projNoteKey = `${accountId}_${monthKey}_${bill.dueDay}_other_desc`;
            const actualNoteKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
            matrixNoteShifts.push({ projNoteKey, actualNoteKey });
          }
        } else {
          const isOther = txn.isOther || descLower === 'other' || descLower.startsWith('other ') || descLower.startsWith('other$') || descLower === 'other expense' || descLower === 'other $' || (/^other\b/i.test(descLower) && !descLower.includes('desc'));

          if (isOther) {
            // Unmatched debit from explicit Other column -> Other expense (negative in consolidated other_amount)
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

            logWarn('MATCH', `Debit transaction #${txnIdx + 1} from Other column routed to Other Expense`, {
              date: normDate,
              desc: txn.description,
              amount: actualAmount,
              otherKey,
              otherDescKey
            });
          } else {
            // Named column that had no matching bill: create a bill dynamically so it never routes to Other
            const billName = descLower.includes('insurance') ? 'Insurance (Vehicle)' : (txn.description || 'Discovered Bill');
            let autoBill = nextBills.find(b => b.name.toLowerCase() === billName.toLowerCase());
            if (!autoBill) {
              autoBill = {
                id: txn.billId || `bill-${Date.now()}-${nextBills.length}`,
                name: billName,
                amount: Math.abs(actualAmount),
                period: 'Monthly',
                dueDay: actualDay,
                accountId: accountId,
                paymentSource: 'Auto Pay',
                matchingKey: descLower.includes('insurance') ? 'PROGRESSIVE, AUTO INSURANCE, GEICO, INSURANCE, VEHICLE' : billName,
                splits: {}
              };
              nextBills.push(autoBill);
              metadataChanged = true;
            }
            resolvedBillId = autoBill.id;
            lineItemUpdates.push({ billId: resolvedBillId, monthKey, actualAmount });
            const actualKey = `${accountId}_${monthKey}_${actualDay}_bill_${resolvedBillId}`;
            const existingBillAmt = matrixUpdates[actualKey] ?? 0;
            matrixUpdates[actualKey] = Math.round((existingBillAmt + actualAmount) * 100) / 100;

            logDebug('MATCH', `Debit transaction #${txnIdx + 1} created new bill "${billName}" and routed to bill column`, {
              date: normDate,
              desc: txn.description,
              amount: actualAmount,
              billId: resolvedBillId,
              actualKey
            });
          }
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
      if (c !== undefined && c !== null && c !== '') dayCredits += parseFloat(c) || 0;
      const ec = dailyMatrix[`${targetAccountId}_${mKey}_${d}_extra_credit_${p.id}`];
      if (ec !== undefined && ec !== null && ec !== '') dayExtraCredits += parseFloat(ec) || 0;
    });

    let dayBills = 0;
    bills.forEach(b => {
      const bVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_bill_${b.id}`];
      if (bVal !== undefined && bVal !== null && bVal !== '') dayBills += parseFloat(bVal) || 0;
    });

    const oVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_amount`];
    const dayOther = oVal !== undefined && oVal !== null && oVal !== '' ? (parseFloat(oVal) || 0) : 0;

    const ocVal = dailyMatrix[`${targetAccountId}_${mKey}_${d}_other_credit_amount`];
    const dayOtherCredit = ocVal !== undefined && ocVal !== null && ocVal !== '' ? (parseFloat(ocVal) || 0) : 0;

    const tentativeReg = runningReg + dayCredits - dayBills;
    const tentativeExtra = runningExtra + dayExtraCredits + dayOtherCredit + dayOther;

    const customReg = dailyMatrix[`${targetAccountId}_${mKey}_${d}_reg_ending`];
    const customExtra = dailyMatrix[`${targetAccountId}_${mKey}_${d}_extra_ending`];

    let reg = customReg !== undefined && customReg !== null && customReg !== '' ? parseFloat(customReg) : tentativeReg;
    let extra = customExtra !== undefined && customExtra !== null && customExtra !== '' ? parseFloat(customExtra) : tentativeExtra;

    if ((customReg === undefined || customReg === null || customReg === '') &&
        (customExtra === undefined || customExtra === null || customExtra === '')) {
      if (reg < 0 && extra > 0) {
        const transfer = Math.min(extra, -reg);
        reg += transfer;
        extra -= transfer;
      } else if (extra < 0 && reg > 0) {
        const transfer = Math.min(reg, -extra);
        extra += transfer;
        reg -= transfer;
      }
    }

    runningReg = Math.round(reg * 100) / 100 || 0;
    runningExtra = Math.round(extra * 100) / 100 || 0;

    cur.setDate(cur.getDate() + 1);
  }

  return Math.round((runningReg + (showExtra ? runningExtra : 0)) * 100) / 100;
}
