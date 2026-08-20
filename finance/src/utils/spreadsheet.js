import { normalizeIsoDate, mergeBills, mergeTransactions } from './importer.js';
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
 * @returns {{
 *   success: boolean,
 *   error?: string,
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
  transactions = []
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
                if (rawReg < 0) {
                  newStartingBalance = 0;
                  newExtraStarting = Math.round((rawExtra + rawReg) * 100) / 100;
                } else {
                  newStartingBalance = rawReg;
                  newExtraStarting = rawExtra;
                }
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
                if (rawReg < 0) {
                  patches.startingBalance = 0;
                  patches.extraStartingBalance = Math.round((rawExtra + rawReg) * 100) / 100;
                } else {
                  patches.startingBalance = rawReg;
                  patches.extraStartingBalance = rawExtra;
                }
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
              if (rawReg < 0) {
                patches.startingBalance = 0;
                patches.extraStartingBalance = Math.round((rawExtra + rawReg) * 100) / 100;
              } else {
                patches.startingBalance = rawReg;
                patches.extraStartingBalance = rawExtra;
              }
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
      nextTransactions = mergeTransactions(nextTransactions, stampedTransactions);
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
          // Unmatched credit: accumulate into the dedicated other_credit_amount key.
          // BUG-3 full fix: credits and debits are now separated into distinct matrix keys.
          // other_amount (debit) and other_credit_amount (credit) never share a cell.
          const otherCreditKey = `${accountId}_${monthKey}_${actualDay}_other_credit_amount`;
          const otherCreditDescKey = `${accountId}_${monthKey}_${actualDay}_other_credit_desc`;
          const existingCredit = matrixUpdates[otherCreditKey] ?? nextDailyMatrix[otherCreditKey] ?? 0;
          matrixUpdates[otherCreditKey] = Math.round((parseFloat(existingCredit) + actualAmount) * 100) / 100;

          const cleanDesc = (txn.description || '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim() || txn.description;
          const existingCreditDesc = (matrixUpdates[otherCreditDescKey] ?? nextDailyMatrix[otherCreditDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
          if (existingCreditDesc && cleanDesc && !existingCreditDesc.includes(cleanDesc)) {
            matrixUpdates[otherCreditDescKey] = `${existingCreditDesc} | ${cleanDesc}`;
          } else if (!existingCreditDesc) {
            matrixUpdates[otherCreditDescKey] = cleanDesc || '';
          }

          logDebug('MATCH', `Credit transaction #${txnIdx + 1} unmatched to known earner; routed to other_credit_amount`, {
            date: normDate,
            desc: txn.description,
            amount: actualAmount,
            otherCreditKey,
            otherCreditDescKey
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
            if (descLower.includes('insurance') && bName.includes('insurance')) return true;
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
          // Unmatched debit -> Other expense
          const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
          const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
          const existingOther = matrixUpdates[otherKey] ?? 0;
          matrixUpdates[otherKey] = Math.round((existingOther + Math.abs(actualAmount)) * 100) / 100;

          const cleanDesc = (txn.description || '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim() || txn.description;
          const existingOtherDesc = (matrixUpdates[otherDescKey] ?? nextDailyMatrix[otherDescKey] ?? '').replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
          if (existingOtherDesc && cleanDesc && !existingOtherDesc.includes(cleanDesc)) {
            matrixUpdates[otherDescKey] = `${existingOtherDesc} | ${cleanDesc}`;
          } else {
            matrixUpdates[otherDescKey] = existingOtherDesc || cleanDesc;
          }

          logWarn('MATCH', `Debit transaction #${txnIdx + 1} unmatched to any bill; routed to Other Expense`, {
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
