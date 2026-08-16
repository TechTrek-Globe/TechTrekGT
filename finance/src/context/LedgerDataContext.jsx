// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { initialBudgetData } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useBudgetMetadata } from './BudgetMetadataContext';
import { getApiUrl, pushCloudBackupOptimistic, flushPendingCloudSync } from '../utils/api';
import { saveBudgetData, clearAndRestoreBudgetData, clearBudgetData } from '../utils/indexedDB';
import { normalizeIsoDate } from '../utils/importer';

export const LedgerDataContext = createContext(null);
export const LedgerDataStateContext = createContext(null);
export const LedgerDataDispatchContext = createContext(null);

export function LedgerDataProvider({ children }) {
  const metadata = useBudgetMetadata();
  const {
    metadataState,
    setMetadataState,
    isDbLoaded,
    setSaveError,
    initialLedgerSeed,
    getBillMonthlyCost,
    getAccountMonthlyExpenses,
    isAutoCloudBackupEnabled,
    setLastCloudSyncTime
  } = metadata;

  const [dailyMatrix, setDailyMatrix] = useState({});
  const [lineItems, setLineItems] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Memory-only storage for cloud vault
  const [syncPasscode, setSyncPasscode] = useState('');
  const [isSyncUnlocked, setIsSyncUnlocked] = useState(false);

  const dailyMatrixRef = useRef(dailyMatrix);
  const [matrixVersion, setMatrixVersion] = useState(0);

  const metadataStateRef = useRef(metadataState);
  useEffect(() => { metadataStateRef.current = metadataState; }, [metadataState]);

  const transactionsRef = useRef(transactions);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  const lineItemsRef = useRef(lineItems);
  useEffect(() => { lineItemsRef.current = lineItems; }, [lineItems]);

  const budgetRef = useRef(null);

  // Sync initial seed loaded from IndexedDB by BudgetMetadataProvider
  useEffect(() => {
    if (isDbLoaded && initialLedgerSeed) {
      if (initialLedgerSeed.dailyMatrix) {
        setDailyMatrix(initialLedgerSeed.dailyMatrix);
        dailyMatrixRef.current = initialLedgerSeed.dailyMatrix;
        setMatrixVersion(v => v + 1);
      }
      if (initialLedgerSeed.lineItems) setLineItems(initialLedgerSeed.lineItems);
      if (initialLedgerSeed.transactions) setTransactions(initialLedgerSeed.transactions);
    }
  }, [isDbLoaded, initialLedgerSeed]);

  // Combined full budget object representation for compatibility and persistence
  const budget = useMemo(() => {
    const b = {
      ...metadataState,
      dailyMatrix: dailyMatrixRef.current,
      lineItems,
      transactions
    };
    budgetRef.current = b;
    return b;
  }, [metadataState, matrixVersion, lineItems, transactions]);

  // Silently save combined budget to IndexedDB whenever metadata or ledger state changes (debounced 500ms)
  useEffect(() => {
    if (!isDbLoaded) return;
    const timer = setTimeout(() => {
      saveBudgetData(budget)
        .then(() => setSaveError(null))
        .catch(err => {
          console.error('Failed to save budget to IndexedDB:', err);
          setSaveError('Local storage save failed. Browser storage quota may be exceeded.');
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [budget, isDbLoaded, setSaveError]);

  // Cloud Vault Push Backup (Optimistic + Fallback Queue)
  const pushCloudBackup = useCallback(async (passcode) => {
    const result = await pushCloudBackupOptimistic(passcode, budgetRef.current);
    if (result.success) {
      setLastCloudSyncTime(new Date().toLocaleTimeString());
    }
    return result;
  }, [setLastCloudSyncTime]);

  // Restore budget state from imported JSON backup
  const restoreFromBackup = useCallback(async (parsedData) => {
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('Invalid backup file format.');
    }

    const mergedMetadata = {
      accounts: Array.isArray(parsedData.accounts) ? parsedData.accounts : initialBudgetData.accounts,
      people: Array.isArray(parsedData.people) ? parsedData.people : initialBudgetData.people,
      bills: Array.isArray(parsedData.bills) ? parsedData.bills : initialBudgetData.bills,
      loans: Array.isArray(parsedData.loans) ? parsedData.loans : initialBudgetData.loans,
      dashboardWidgets: Array.isArray(parsedData.dashboardWidgets) ? parsedData.dashboardWidgets : initialBudgetData.dashboardWidgets,
      theme: parsedData.theme || 'dark',
      hideDashboardHeader: Boolean(parsedData.hideDashboardHeader)
    };

    const newDailyMatrix = (parsedData.dailyMatrix && typeof parsedData.dailyMatrix === 'object') ? parsedData.dailyMatrix : {};
    const newLineItems = Array.isArray(parsedData.lineItems) ? parsedData.lineItems : [];
    const newTransactions = Array.isArray(parsedData.transactions) ? parsedData.transactions : [];

    const fullMerged = { ...mergedMetadata, dailyMatrix: newDailyMatrix, lineItems: newLineItems, transactions: newTransactions };

    await clearAndRestoreBudgetData(fullMerged);
    setMetadataState(mergedMetadata);
    setDailyMatrix(newDailyMatrix);
    setLineItems(newLineItems);
    setTransactions(newTransactions);
    return true;
  }, [setMetadataState]);

  // Cloud Vault Pull Restore
  const pullCloudRestore = useCallback(async (passcode) => {
    const res = await fetch(getApiUrl('/api/sync/restore'), {
      method: 'GET',
      headers: {
        'X-Sync-Passcode': passcode
      }
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.budget) {
      throw new Error(data.error || 'Failed to restore data from Cloud Vault.');
    }
    await restoreFromBackup(data.budget);
    return data;
  }, [restoreFromBackup]);

  // Export complete JSON backup helper
  const exportBackupJson = useCallback(() => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(budgetRef.current, null, 2));
      const downloadAnchor = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `techtrek_backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      return true;
    } catch (err) {
      console.error('Failed to export JSON backup:', err);
      return false;
    }
  }, []);

  // Financial data checksum key to prevent UI-only updates (theme, widgets) from triggering cloud backups
  const financialDataChecksum = `${(metadataState.accounts || []).length}_${(metadataState.bills || []).length}_${(metadataState.people || []).length}_${(metadataState.loans || []).length}_${(lineItems || []).length}_${Object.keys(dailyMatrix || {}).length}`;

  // Silent background retry effect for pending sync queue on app load or network recovery
  useEffect(() => {
    const handleOnlineRetry = async () => {
      if (!syncPasscode) return;
      const flushed = await flushPendingCloudSync(syncPasscode);
      if (flushed) {
        setLastCloudSyncTime(new Date().toLocaleTimeString());
      }
    };

    if (syncPasscode) {
      handleOnlineRetry();
    }

    window.addEventListener('online', handleOnlineRetry);
    return () => window.removeEventListener('online', handleOnlineRetry);
  }, [syncPasscode, setLastCloudSyncTime]);

  // Debounced Auto Cloud Backup effect (45-second debounce to mitigate Cloudflare D1 write lock contention)
  useEffect(() => {
    if (!isDbLoaded || !isAutoCloudBackupEnabled) return;

    if (!isSyncUnlocked || !syncPasscode) return;

    const timer = setTimeout(async () => {
      try {
        await pushCloudBackup(syncPasscode);
      } catch (err) {
        console.error('Auto cloud backup failed:', err);
      }
    }, 45000);

    return () => clearTimeout(timer);
  }, [financialDataChecksum, isDbLoaded, isAutoCloudBackupEnabled, isSyncUnlocked, syncPasscode, pushCloudBackup]);

  // Load 100% Fake Demo Preset Data
  const loadDemoPreset = useCallback(() => {
    setMetadataState({
      accounts: fakeDemoBudgetData.accounts || [],
      people: fakeDemoBudgetData.people || [],
      bills: fakeDemoBudgetData.bills || [],
      loans: fakeDemoBudgetData.loans || [],
      dashboardWidgets: fakeDemoBudgetData.dashboardWidgets || initialBudgetData.dashboardWidgets,
      theme: fakeDemoBudgetData.theme || 'dark',
      hideDashboardHeader: Boolean(fakeDemoBudgetData.hideDashboardHeader)
    });
    setDailyMatrix(fakeDemoBudgetData.dailyMatrix || {});
    setLineItems(fakeDemoBudgetData.lineItems || []);
    setTransactions(fakeDemoBudgetData.transactions || []);
  }, [setMetadataState]);

  // Reset to default budget data
  const resetToDefaults = useCallback(async () => {
    setMetadataState({
      accounts: initialBudgetData.accounts || [],
      people: initialBudgetData.people || [],
      bills: initialBudgetData.bills || [],
      loans: initialBudgetData.loans || [],
      dashboardWidgets: initialBudgetData.dashboardWidgets || [],
      theme: 'dark',
      hideDashboardHeader: false
    });
    setDailyMatrix(initialBudgetData.dailyMatrix || {});
    setLineItems(initialBudgetData.lineItems || []);
    setTransactions(initialBudgetData.transactions || []);
    await saveBudgetData(initialBudgetData);
  }, [setMetadataState]);

  // Clear all data (100% clean slate)
  const clearAllData = useCallback(async () => {
    await clearBudgetData();
    setMetadataState({
      accounts: [],
      people: [],
      bills: [],
      loans: [],
      dashboardWidgets: initialBudgetData.dashboardWidgets || [],
      theme: 'dark',
      hideDashboardHeader: false
    });
    setDailyMatrix({});
    setLineItems([]);
    setTransactions([]);
  }, [setMetadataState]);

  // Selective per-namespace spreadsheet import
  const importSpreadsheetSelective = useCallback(({ namespaces, strategies, data }) => {
    if (!namespaces || !data) return { success: false, error: 'Invalid payload.' };

    // 1. Process People
    if (namespaces.people && Array.isArray(data.people)) {
      if (strategies.people === 'override') {
        setMetadataState(prev => ({ ...prev, people: data.people }));
      } else {
        setMetadataState(prev => {
          const existingNames = new Set(prev.people.map(p => p.name.toLowerCase()));
          return { ...prev, people: [...prev.people, ...data.people.filter(p => !existingNames.has(p.name.toLowerCase()))] };
        });
      }
    }

    // 2. Process Accounts
    const accountIdMap = new Map();
    if (namespaces.accounts && Array.isArray(data.accounts)) {
      if (strategies.accounts === 'override') {
        setMetadataState(prev => ({ ...prev, accounts: data.accounts }));
        data.accounts.forEach(a => accountIdMap.set(a.id, a.id));
      } else {
        setMetadataState(prev => {
          const existingAccounts = [...(prev.accounts || [])];
          const newAccountsToAdd = [];

          data.accounts.forEach(incomingAcc => {
            const normName = incomingAcc.name.toLowerCase().trim();
            const matchIdx = existingAccounts.findIndex(a =>
              a.name.toLowerCase().trim() === normName ||
              a.name.toLowerCase().includes(normName) ||
              normName.includes(a.name.toLowerCase().trim())
            );

            if (matchIdx >= 0) {
              const match = existingAccounts[matchIdx];
              accountIdMap.set(incomingAcc.id, match.id);
              // Propagate imported ledger metadata onto the matched account
              const patches = {};
              if (incomingAcc.importedLedgerRows && Object.keys(incomingAcc.importedLedgerRows).length > 0) {
                patches.importedLedgerRows = incomingAcc.importedLedgerRows;
                patches.ledgerMode = 'import';
              }
              if (Object.keys(patches).length > 0) {
                existingAccounts[matchIdx] = { ...match, ...patches };
              }
            } else {
              newAccountsToAdd.push(incomingAcc);
              accountIdMap.set(incomingAcc.id, incomingAcc.id);
            }
          });

          return { ...prev, accounts: [...existingAccounts, ...newAccountsToAdd] };
        });
      }
    }

    // Direct Target Account Metadata Binding (for account-bound CSV/spreadsheet imports)
    if (data.targetAccountId) {
      setMetadataState(prev => ({
        ...prev,
        accounts: (prev.accounts || []).map(acc => {
          if (acc.id === data.targetAccountId) {
            const patches = {};
            if (data.importedLedgerRows && Object.keys(data.importedLedgerRows).length > 0) {
              patches.importedLedgerRows = { ...(acc.importedLedgerRows || {}), ...data.importedLedgerRows };
              patches.ledgerMode = 'import';
            }
            if (data.targetAccount && typeof data.targetAccount === 'object') {
              Object.assign(patches, data.targetAccount);
            }
            return Object.keys(patches).length > 0 ? { ...acc, ...patches } : acc;
          }
          return acc;
        })
      }));
    }

    // 3. Process Bills
    if (namespaces.bills && Array.isArray(data.bills)) {
      setMetadataState(prev => {
        if (strategies.bills === 'override') {
          return { ...prev, bills: data.bills };
        } else {
          const existingNames = new Set((prev.bills || []).map(b => b.name.toLowerCase().trim()));
          return { ...prev, bills: [...(prev.bills || []), ...data.bills.filter(b => !existingNames.has(b.name.toLowerCase().trim()))] };
        }
      });
    }

    // 4. Process Transactions
    if (namespaces.transactions && Array.isArray(data.transactions)) {
      const stampedTransactions = data.transactions.map(t => ({
        ...t,
        accountId: t.accountId || data.targetAccountId || ''
      }));

      if (strategies.transactions === 'override') {
        setTransactions(stampedTransactions);
      } else {
        setTransactions(prev => {
          const key = t => `${t.accountId || ''}|${t.date}|${(t.description || '').toLowerCase()}|${t.amount}`;
          const existingKeys = new Set(prev.map(key));
          return [...prev, ...stampedTransactions.filter(t => !existingKeys.has(key(t)))];
        });
      }
    }

    // Bug 2 fix (Option B): reconcile imported actual transactions against projected bills, deposits, and other expenses.
    // Uses month-scoped lineItem overrides for amount and dailyMatrix cell moves for date
    // shifts - non-destructive to future projections (bill definition is never altered).
    if (namespaces.transactions && Array.isArray(data.transactions)) {
      const lineItemUpdates = [];
      const matrixUpdates = {};
      const matrixNoteShifts = [];

      data.transactions.forEach(txn => {
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
        const accountId = txn.accountId || data.targetAccountId || (metadataState.accounts[0]?.id || '');
        const descLower = (txn.description || '').toLowerCase();

        if (isCredit) {
          // Check earner deposit match
          let matchedPerson = null;
          if (descLower.includes('hp') || descLower.includes('gym')) {
            matchedPerson = metadataState.people.find(p => p.name.toLowerCase().includes('gym'));
          } else if (descLower.includes('jon') || descLower.includes('usaa') || descLower.includes('transfer')) {
            matchedPerson = metadataState.people.find(p => p.name.toLowerCase() === 'jon') || metadataState.people[0];
          } else if (descLower.includes('ronnie')) {
            matchedPerson = metadataState.people.find(p => p.name.toLowerCase() === 'ronnie');
          } else {
            matchedPerson = metadataState.people.find(p => p.name && descLower.includes(p.name.toLowerCase()));
          }

          if (matchedPerson) {
            const creditKey = `${accountId}_${monthKey}_${actualDay}_credit_${matchedPerson.id}`;
            const existingCredit = matrixUpdates[creditKey] || 0;
            matrixUpdates[creditKey] = Math.round((existingCredit + actualAmount) * 100) / 100;

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
            // Unmatched credit -> credit other
            const otherKey = `${accountId}_${monthKey}_${actualDay}_other_amount`;
            const otherDescKey = `${accountId}_${monthKey}_${actualDay}_other_desc`;
            const existingOther = matrixUpdates[otherKey] || 0;
            matrixUpdates[otherKey] = Math.round((existingOther - actualAmount) * 100) / 100;
            matrixUpdates[otherDescKey] = txn.description;
          }
        } else {
          // Debit / Expense: resolve bill
          let resolvedBillId = txn.billId;
          if (!resolvedBillId && txn.description) {
            const matched = metadataState.bills.find(b => {
              if (b.accountId && accountId && b.accountId !== accountId) return false;
              const bName = b.name.toLowerCase();
              const pSource = (b.paymentSource || '').toLowerCase();
              if (bName && (descLower.includes(bName) || bName.includes(descLower))) return true;
              if (pSource && (descLower.includes(pSource) || pSource.includes(descLower))) return true;
              if (descLower.includes('wells fargo') && (bName.includes('cell') || pSource.includes('wells'))) return true;
              if (descLower.includes('bank of america') && (bName.includes('gym') || pSource.includes('america'))) return true;
              if (descLower.includes('georgia power') && (bName.includes('power') || bName.includes('electric'))) return true;
              if (descLower.includes('water') && bName.includes('water')) return true;
              if (descLower.includes('comcast') && bName.includes('comcast')) return true;
              if (descLower.includes('youtube') && bName.includes('youtube')) return true;
              if (Math.abs(parseFloat(b.amount || 0) - actualAmount) < 0.01 && (!b.accountId || b.accountId === accountId)) return true;
              return false;
            });
            if (matched) resolvedBillId = matched.id;
          }

          if (resolvedBillId) {
            lineItemUpdates.push({ billId: resolvedBillId, monthKey, actualAmount });
            const bill = metadataState.bills.find(b => b.id === resolvedBillId);
            const actualKey = `${accountId}_${monthKey}_${actualDay}_bill_${resolvedBillId}`;
            const existingBillAmt = matrixUpdates[actualKey] || 0;
            matrixUpdates[actualKey] = Math.round((existingBillAmt + actualAmount) * 100) / 100;

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
            const existingOther = matrixUpdates[otherKey] || 0;
            matrixUpdates[otherKey] = Math.round((existingOther + actualAmount) * 100) / 100;
            matrixUpdates[otherDescKey] = txn.description;
          }
        }
      });

      if (lineItemUpdates.length > 0 || strategies.transactions === 'override') {
        setLineItems(prev => {
          let base = prev;
          if (strategies.transactions === 'override' && data.targetAccountId) {
            const accountBillIds = new Set(metadataState.bills.filter(b => b.accountId === data.targetAccountId).map(b => b.id));
            base = prev.filter(li => !accountBillIds.has(li.billId));
          }
          const updated = [...base];
          lineItemUpdates.forEach(({ billId, monthKey, actualAmount }) => {
            const existingIdx = updated.findIndex(li => li.billId === billId && li.monthKey === monthKey);
            const entry = { billId, monthKey, actualAmount, updatedAt: Date.now() };
            if (existingIdx >= 0) {
              updated[existingIdx] = { ...updated[existingIdx], ...entry };
            } else {
              updated.push(entry);
            }
          });
          return updated;
        });
      }

      if (Object.keys(matrixUpdates).length > 0 || matrixNoteShifts.length > 0 || strategies.transactions === 'override') {
        setDailyMatrix(prev => {
          const next = {};
          if (strategies.transactions === 'override' && data.targetAccountId) {
            Object.entries(prev).forEach(([k, v]) => {
              if (!k.startsWith(`${data.targetAccountId}_`)) {
                next[k] = v;
              }
            });
          } else {
            Object.assign(next, prev);
          }
          Object.assign(next, matrixUpdates);

          matrixNoteShifts.forEach(({ projNoteKey, actualNoteKey }) => {
            const existingNote = prev[projNoteKey];
            if (existingNote) {
              if (!next[actualNoteKey]) next[actualNoteKey] = existingNote;
              next[projNoteKey] = '';
            }
          });
          return next;
        });
      }
    }

    return { success: true };
  }, [metadataState, setMetadataState]);

  // Import Parsed Spreadsheet Data (legacy path)
  const importParsedSpreadsheet = useCallback((parsedData, mode = 'replace') => {
    if (!parsedData || !parsedData.accounts) return { success: false, error: 'Invalid parsed data.' };

    if (mode === 'replace') {
      setMetadataState({
        accounts: parsedData.accounts || [],
        people: parsedData.people || [],
        bills: parsedData.bills || [],
        loans: parsedData.loans || [],
        dashboardWidgets: initialBudgetData.dashboardWidgets,
        theme: 'dark',
        hideDashboardHeader: false
      });
      setDailyMatrix({});
      setLineItems([]);
      setTransactions([]);
    } else {
      setMetadataState(prev => {
        const existingAccNames = new Set(prev.accounts.map(a => a.name.toLowerCase()));
        const newAccs = (parsedData.accounts || []).filter(a => !existingAccNames.has(a.name.toLowerCase()));

        const existingBillNames = new Set(prev.bills.map(b => b.name.toLowerCase()));
        const newBills = (parsedData.bills || []).filter(b => !existingBillNames.has(b.name.toLowerCase()));

        const existingPeopleNames = new Set(prev.people.map(p => p.name.toLowerCase()));
        const newPeople = (parsedData.people || []).filter(p => !existingPeopleNames.has(p.name.toLowerCase()));

        const existingLoanNames = new Set((prev.loans || []).map(l => l.name.toLowerCase()));
        const newLoans = (parsedData.loans || []).filter(l => !existingLoanNames.has(l.name.toLowerCase()));

        return {
          ...prev,
          accounts: [...prev.accounts, ...newAccs],
          people: [...prev.people, ...newPeople],
          bills: [...prev.bills, ...newBills],
          loans: [...(prev.loans || []), ...newLoans]
        };
      });
    }

    return { success: true };
  }, [setMetadataState]);

  // --- Line Item Operations ---
  const getLineItem = useCallback((billId, monthKey) => {
    return lineItemsRef.current.find(li => li.billId === billId && li.monthKey === monthKey);
  }, []);

  const upsertLineItem = useCallback((billId, monthKey, actualAmount) => {
    setLineItems(prev => {
      const existing = prev.findIndex(li => li.billId === billId && li.monthKey === monthKey);
      const updated = [...prev];
      const entry = { billId, monthKey, actualAmount: parseFloat(actualAmount) || 0, updatedAt: Date.now() };
      if (existing >= 0) {
        updated[existing] = { ...updated[existing], ...entry };
      } else {
        updated.push(entry);
      }
      return updated;
    });
  }, []);

  const getActualAmount = useCallback((billId, monthKey) => {
    const li = lineItemsRef.current.find(item => item.billId === billId && item.monthKey === monthKey);
    return li ? li.actualAmount : null;
  }, []);

  const getEffectiveAmount = useCallback((bill, monthKey) => {
    const li = lineItemsRef.current.find(item => item.billId === bill?.id && item.monthKey === monthKey);
    return li ? li.actualAmount : getBillMonthlyCost(bill);
  }, [getBillMonthlyCost]);

  const getTotalActualExpenses = useCallback((monthKey) => {
    return (metadataStateRef.current.bills || []).reduce((sum, b) => {
      const li = lineItemsRef.current.find(item => item.billId === b.id && item.monthKey === monthKey);
      return sum + (li ? li.actualAmount : getBillMonthlyCost(b));
    }, 0);
  }, [getBillMonthlyCost]);

  const getAccountActualExpenses = useCallback((accountId, monthKey) => {
    return (metadataStateRef.current.bills || [])
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getEffectiveAmount(b, monthKey), 0);
  }, [getEffectiveAmount]);

  // --- Derived Balance Helpers ---

  // Derives the latest known balance for an account from importedLedgerRows or transactions
  const getAccountDerivedBalance = useCallback((accountId) => {
    const acc = (metadataStateRef.current.accounts || []).find(a => a.id === accountId);
    if (!acc) return 0;

    // Priority 1: importedLedgerRows (most recent date's total ending balance)
    if (acc.importedLedgerRows && typeof acc.importedLedgerRows === 'object') {
      const dates = Object.keys(acc.importedLedgerRows).sort();
      if (dates.length > 0) {
        const latest = acc.importedLedgerRows[dates[dates.length - 1]];
        if (typeof latest === 'number') return latest;
        if (latest && typeof latest === 'object' && typeof latest.totalEnding === 'number') return latest.totalEnding;
      }
    }

    // Priority 2: transactions with running balance
    const accTxns = (transactionsRef.current || []).filter(t => t.accountId === accountId && t.balance !== undefined);
    if (accTxns.length > 0) {
      const sorted = [...accTxns].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return sorted[sorted.length - 1].balance;
    }

    return 0;
  }, []);

  const getAccountProjectedEndBalance = useCallback((accountId, monthKey) => {
    const derivedBalance = getAccountDerivedBalance(accountId);
    const projectedExpenses = monthKey ? getAccountActualExpenses(accountId, monthKey) : getAccountMonthlyExpenses(accountId);
    return derivedBalance - projectedExpenses;
  }, [getAccountDerivedBalance, getAccountActualExpenses, getAccountMonthlyExpenses]);

  const getAccountActualEndBalance = useCallback((accountId, monthKey) => {
    const derivedBalance = getAccountDerivedBalance(accountId);
    const actualExpenses = getAccountActualExpenses(accountId, monthKey);
    return derivedBalance - actualExpenses;
  }, [getAccountDerivedBalance, getAccountActualExpenses]);

  // --- Daily Matrix Cell Operations ---
  const getDailyMatrixCell = useCallback((accountId, monthKey, day, field) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    return dailyMatrixRef.current[key];
  }, [matrixVersion]);

  const updateDailyMatrixCell = useCallback((accountId, monthKey, day, field, value) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    
    const currentVal = dailyMatrixRef.current[key];
    if (currentVal === value) return;
    if ((currentVal === undefined || currentVal === null || currentVal === '') && (value === undefined || value === null || value === '')) {
      return;
    }
    
    // Mutate ref to eliminate O(N) full dictionary spread thrashing
    dailyMatrixRef.current[key] = value;
    setMatrixVersion(v => v + 1);
  }, []);

  const updateDailyMatrixCells = useCallback((updates) => {
    if (!updates || typeof updates !== 'object') return;
    let hasChanges = false;
    for (const [k, v] of Object.entries(updates)) {
      if (dailyMatrixRef.current[k] !== v) {
        dailyMatrixRef.current[k] = v;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      setMatrixVersion(v => v + 1);
    }
  }, []);

  const moveDailyMatrixCell = useCallback((accountId, sourceMonthKey, sourceDay, targetMonthKey, targetDay, field, value, extraData = {}) => {
    const sourceKey = `${accountId}_${sourceMonthKey}_${sourceDay}_${field}`;
    const targetKey = `${accountId}_${targetMonthKey}_${targetDay}_${field}`;

    let hasChanges = false;
    if (dailyMatrixRef.current[sourceKey] !== 0) {
      dailyMatrixRef.current[sourceKey] = 0;
      hasChanges = true;
    }
    if (dailyMatrixRef.current[targetKey] !== value) {
      dailyMatrixRef.current[targetKey] = value;
      hasChanges = true;
    }

    if (field === 'other_amount') {
      const sourceDescKey = `${accountId}_${sourceMonthKey}_${sourceDay}_other_desc`;
      const targetDescKey = `${accountId}_${targetMonthKey}_${targetDay}_other_desc`;
      const sourceDesc = extraData.otherDesc ?? (dailyMatrixRef.current[sourceDescKey] || '');
      dailyMatrixRef.current[sourceDescKey] = '';
      dailyMatrixRef.current[targetDescKey] = sourceDesc;
      hasChanges = true;
    }

    if (hasChanges) {
      setMatrixVersion(v => v + 1);
    }
  }, []);

  const stateValue = useMemo(() => ({
    budget,
    dailyMatrix,
    lineItems,
    transactions,
    syncPasscode,
    isSyncUnlocked
  }), [budget, dailyMatrix, lineItems, transactions, syncPasscode, isSyncUnlocked]);

  const actionsValue = useMemo(() => ({
    getDailyMatrixCell,
    updateDailyMatrixCell,
    updateDailyMatrixCells,
    moveDailyMatrixCell,
    upsertLineItem,
    getLineItem,
    getActualAmount,
    getEffectiveAmount,
    getTotalActualExpenses,
    getAccountActualExpenses,
    getAccountDerivedBalance,
    getAccountProjectedEndBalance,
    getAccountActualEndBalance,
    loadDemoPreset,
    resetToDefaults,
    clearAllData,
    importSpreadsheetSelective,
    importParsedSpreadsheet,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    setSyncPasscode,
    setIsSyncUnlocked
  }), [
    getDailyMatrixCell,
    updateDailyMatrixCell,
    updateDailyMatrixCells,
    moveDailyMatrixCell,
    upsertLineItem,
    getLineItem,
    getActualAmount,
    getEffectiveAmount,
    getTotalActualExpenses,
    getAccountActualExpenses,
    getAccountDerivedBalance,
    getAccountProjectedEndBalance,
    getAccountActualEndBalance,
    loadDemoPreset,
    resetToDefaults,
    clearAllData,
    importSpreadsheetSelective,
    importParsedSpreadsheet,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    setSyncPasscode,
    setIsSyncUnlocked
  ]);

  const contextValue = useMemo(() => ({
    ...stateValue,
    ...actionsValue
  }), [stateValue, actionsValue]);

  return (
    <LedgerDataDispatchContext.Provider value={actionsValue}>
      <LedgerDataStateContext.Provider value={stateValue}>
        <LedgerDataContext.Provider value={contextValue}>
          {children}
        </LedgerDataContext.Provider>
      </LedgerDataStateContext.Provider>
    </LedgerDataDispatchContext.Provider>
  );
}

export function useLedgerData() {
  const ctx = useContext(LedgerDataContext);
  if (!ctx) {
    throw new Error('useLedgerData must be used within a LedgerDataProvider');
  }
  return ctx;
}

export function useLedgerDataState() {
  const ctx = useContext(LedgerDataStateContext);
  if (!ctx) {
    throw new Error('useLedgerDataState must be used within a LedgerDataProvider');
  }
  return ctx;
}

export function useLedgerDataDispatch() {
  const ctx = useContext(LedgerDataDispatchContext);
  if (!ctx) {
    throw new Error('useLedgerDataDispatch must be used within a LedgerDataProvider');
  }
  return ctx;
}

