// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initialBudgetData } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useBudgetMetadata } from './BudgetMetadataContext';
import { useAuth } from './AuthContext';
import { apiFetch, pushCloudBackupOptimistic, flushPendingCloudSync } from '../utils/api';
import { getBudgetData, saveBudgetData, clearAndRestoreBudgetData, clearBudgetData } from '../utils/indexedDB';
import { processSpreadsheetImport } from '../utils/spreadsheet';
import { isBillDueInMonth } from '../utils/paydayUtils';
import { logSync, logTransaction, logMatrix, logLedger, logState } from '../utils/logger';
import { AlertTriangle } from 'lucide-react';

export const LedgerDataContext = createContext(null);
export const LedgerDataStateContext = createContext(null);
export const LedgerDataDispatchContext = createContext(null);

export function LedgerDataProvider({ children }) {
  const { isAuthenticated } = useAuth();
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
    isSyncOnLoadEnabled,
    setLastCloudSyncTime,
    isPersonDepositDay,
    getPersonDepositAmountForAccount,
    getPersonExtraSavingsDepositAmountForAccount
  } = metadata;

  const [dailyMatrix, setDailyMatrix] = useState({});
  const [lineItems, setLineItems] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Cloud vault sync state (unlocked automatically when user is signed in)
  const [syncPasscode, setSyncPasscode] = useState('');
  const [isSyncUnlockedManual, setIsSyncUnlocked] = useState(false);
  const isSyncUnlocked = isAuthenticated || isSyncUnlockedManual;

  const dailyMatrixRef = useRef(dailyMatrix);
  const [matrixVersion, setMatrixVersion] = useState(0);

  const metadataStateRef = useRef(metadataState);
  metadataStateRef.current = metadataState;

  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;

  const budgetRef = useRef(null);

  // Track unsaved local changes to avoid losing data on tab close or navigation
  const isPendingSaveRef = useRef(false);

  const flushSaveToIndexedDB = useCallback(() => {
    if (!isPendingSaveRef.current || !budgetRef.current) return;
    isPendingSaveRef.current = false;
    saveBudgetData(budgetRef.current)
      .then(() => {
        setSaveError(null);
        logState('INDEXEDDB_FLUSH', 'Flushed pending budget state to IndexedDB', {
          accountsCount: budgetRef.current?.accounts?.length,
          billsCount: budgetRef.current?.bills?.length,
          matrixEntriesCount: Object.keys(budgetRef.current?.dailyMatrix || {}).length
        });
      })
      .catch(err => {
        console.error('Failed to flush budget to IndexedDB:', err);
        setSaveError('Local storage save failed. Browser storage quota may be exceeded.');
      });
  }, [setSaveError]);

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

  // Self-healing: continuously correct bill matrix cells and line items doubled by prior import accumulation bug
  useEffect(() => {
    if (!isDbLoaded) return;
    const bills = metadataState.bills || [];
    if (bills.length === 0) return;

    const billAmtMap = {};
    bills.forEach(b => {
      if (b.id) billAmtMap[b.id] = Math.round((parseFloat(b.amount) || 0) * 100) / 100;
    });

    const billKeyPattern = /_\d{4}-\d{2}_\d{1,2}_bill_(.+)$/;
    let matrixChanged = false;
    for (const [key, value] of Object.entries(dailyMatrixRef.current || {})) {
      const m = key.match(billKeyPattern);
      if (!m) continue;
      const expected = billAmtMap[m[1]];
      if (!expected || expected <= 0) continue;
      const stored = Math.round((parseFloat(value) || 0) * 100) / 100;
      if (stored > 0 && Math.abs(stored - 2 * expected) < 0.02) {
        dailyMatrixRef.current[key] = expected;
        matrixChanged = true;
      }
    }
    if (matrixChanged) {
      setDailyMatrix({ ...dailyMatrixRef.current });
      setMatrixVersion(v => v + 1);
      logLedger('REPAIR_BILL_DOUBLE', 'Healed doubled bill matrix cells in dailyMatrix');
    }

    let lineItemsChanged = false;
    const currentLineItems = lineItemsRef.current || [];
    const nextLineItems = currentLineItems.map(li => {
      const expected = billAmtMap[li.billId];
      if (expected && expected > 0 && Math.abs(li.actualAmount - 2 * expected) < 0.02) {
        lineItemsChanged = true;
        return { ...li, actualAmount: expected };
      }
      return li;
    });
    if (lineItemsChanged) {
      lineItemsRef.current = nextLineItems;
      setLineItems(nextLineItems);
      logLedger('REPAIR_BILL_DOUBLE', 'Healed doubled bill line items');
    }
  }, [isDbLoaded, metadataState.bills]);

  // Combined full budget object representation for compatibility and persistence
  const getFullBudget = useCallback(() => ({
    ...metadataStateRef.current,
    dailyMatrix: dailyMatrixRef.current,
    lineItems: lineItemsRef.current,
    transactions: transactionsRef.current
  }), []);

  // Sync full budget to ref for persistence
  useEffect(() => {
    budgetRef.current = getFullBudget();
  }, [metadataState, matrixVersion, lineItems, transactions, getFullBudget]);

  // UI-facing budget that excludes frequently changing matrix data to prevent re-renders
  const budgetForUI = useMemo(() => ({
    ...metadataState,
    lineItems,
    transactions
  }), [metadataState, lineItems, transactions]);

  // Silently save combined budget to IndexedDB whenever metadata or ledger state changes (debounced 500ms)
  useEffect(() => {
    if (!isDbLoaded) return;
    isPendingSaveRef.current = true;
    const timer = setTimeout(() => {
      if (isPendingSaveRef.current && budgetRef.current) {
        isPendingSaveRef.current = false;
        saveBudgetData(budgetRef.current)
          .then(() => {
            setSaveError(null);
            logState('INDEXEDDB_AUTO_SAVE', 'Debounced budget auto-save to IndexedDB complete');
          })
          .catch(err => {
            console.error('Failed to save budget to IndexedDB:', err);
            setSaveError('Local storage save failed. Browser storage quota may be exceeded.');
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [budgetForUI, matrixVersion, isDbLoaded, setSaveError]);

  // Flush pending save on tab close, page hide, or visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSaveToIndexedDB();
      }
    };
    const handleBeforeUnload = () => {
      flushSaveToIndexedDB();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      flushSaveToIndexedDB();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushSaveToIndexedDB]);

  const [cloudVersion, setCloudVersion] = useState(() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('tt_budget_cloud_version') : null;
      return v ? parseInt(v, 10) : 0;
    } catch {
      return 0;
    }
  });
  const cloudVersionRef = useRef(cloudVersion);
  useEffect(() => {
    cloudVersionRef.current = cloudVersion;
  }, [cloudVersion]);

  const [syncConflict, setSyncConflict] = useState(null);

  // Cloud Vault Push Backup (Optimistic + Fallback Queue)
  const pushCloudBackup = useCallback(async (passcode, options = {}) => {
    logSync('PUSH_DISPATCH', 'Executing pushCloudBackup from LedgerDataContext', { hasPasscode: Boolean(passcode), options });
    const effectiveBaseVersion = options.baseVersion !== undefined ? options.baseVersion : cloudVersionRef.current;
    const result = await pushCloudBackupOptimistic(passcode, budgetRef.current, {
      baseVersion: effectiveBaseVersion,
      force: options.force
    });
    if (result.success) {
      if (result.version) {
        setCloudVersion(result.version);
        try { localStorage.setItem('tt_budget_cloud_version', String(result.version)); } catch {}
      }
      setSyncConflict(null);
      setLastCloudSyncTime(new Date().toLocaleTimeString());
      try { localStorage.setItem('tt_budget_last_modified', String(Date.now())); } catch {}
    } else if (result.conflict) {
      setSyncConflict({
        serverData: result.serverData,
        serverVersion: result.serverVersion,
        localTimestamp: parseInt(localStorage.getItem('tt_budget_last_modified') || '0', 10) || Date.now()
      });
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
    dailyMatrixRef.current = newDailyMatrix;
    metadataStateRef.current = mergedMetadata;
    transactionsRef.current = newTransactions;
    lineItemsRef.current = newLineItems;
    budgetRef.current = fullMerged;

    setMetadataState(mergedMetadata);
    setDailyMatrix(newDailyMatrix);
    setMatrixVersion(v => v + 1);
    setLineItems(newLineItems);
    setTransactions(newTransactions);
    return true;
  }, [setMetadataState]);

  const resolveConflictKeepLocal = useCallback(async () => {
    logSync('CONFLICT_RESOLVE', 'User chose to keep local data (force push to cloud)');
    const res = await pushCloudBackup(syncPasscode, { force: true });
    if (res?.success) {
      setSyncConflict(null);
    }
    return res;
  }, [pushCloudBackup, syncPasscode]);

  const resolveConflictUseCloud = useCallback(async () => {
    if (!syncConflict || !syncConflict.serverData) return;
    logSync('CONFLICT_RESOLVE', 'User chose to use cloud data (restore cloud backup)');
    await restoreFromBackup(syncConflict.serverData);
    if (syncConflict.serverVersion) {
      setCloudVersion(syncConflict.serverVersion);
      try {
        localStorage.setItem('tt_budget_cloud_version', String(syncConflict.serverVersion));
        localStorage.setItem('tt_budget_last_modified', String(syncConflict.serverVersion));
      } catch {}
    }
    setLastCloudSyncTime(new Date().toLocaleTimeString());
    setSyncConflict(null);
  }, [syncConflict, restoreFromBackup, setLastCloudSyncTime]);

  // Cloud Vault Pull Restore
  const pullCloudRestore = useCallback(async (passcode) => {
    logSync('PULL_REQUEST', 'Requesting cloud restore from Cloudflare Worker API');
    const headers = { 'Content-Type': 'application/json' };
    const code = passcode || syncPasscode;
    if (code) {
      headers['X-Sync-Passcode'] = code;
    }
    const res = await apiFetch('/api/sync/restore', {
      method: 'GET',
      headers
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.budget) {
      logSync('PULL_FAILED', `Cloud restore failed: ${data.error || res.statusText}`, { status: res.status }, 'error');
      throw new Error(data.error || 'Failed to restore data from Cloud Vault.');
    }
    logSync('PULL_SUCCESS', 'Cloud restore payload received successfully', { updatedAt: data.updatedAt });
    await restoreFromBackup(data.budget);
    setLastCloudSyncTime(new Date().toLocaleTimeString());
    return data;
  }, [syncPasscode, restoreFromBackup, setLastCloudSyncTime]);

  // Export complete JSON backup helper using Blob API
  const exportBackupJson = useCallback(() => {
    try {
      const jsonStr = JSON.stringify(budgetRef.current, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.href = url;
      downloadAnchor.download = `techtrek_backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.error('Failed to export JSON backup:', err);
      return false;
    }
  }, []);

  // Silent background retry effect for pending sync queue on app load or network recovery
  useEffect(() => {
    const handleOnlineRetry = async () => {
      logSync('ONLINE_RECOVER', 'Browser back online; flushing pending sync queue');
      const flushed = await flushPendingCloudSync(syncPasscode);
      if (flushed) {
        setLastCloudSyncTime(new Date().toLocaleTimeString());
      }
    };

    if (isAuthenticated) {
      handleOnlineRetry();
    }

    window.addEventListener('online', handleOnlineRetry);
    return () => window.removeEventListener('online', handleOnlineRetry);
  }, [isAuthenticated, syncPasscode, setLastCloudSyncTime]);

  // Initial auto cloud restore / 2-way sync on authenticated load or fresh sign-in
  const hasAutoPulledRef = useRef(false);
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (!prevAuthRef.current && isAuthenticated) {
      hasAutoPulledRef.current = false;
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isDbLoaded || hasAutoPulledRef.current || isSyncOnLoadEnabled === false) return;

    (async () => {
      try {
        hasAutoPulledRef.current = true;
        const res = await apiFetch('/api/sync/restore', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const cloudData = await res.json().catch(() => null);

        if (res.ok && cloudData && cloudData.success && cloudData.budget) {
          const localTimeStr = localStorage.getItem('tt_budget_last_modified');
          const localTime = localTimeStr ? parseInt(localTimeStr, 10) : 0;
          const cloudTime = cloudData.version || (cloudData.updatedAt ? new Date(cloudData.updatedAt).getTime() : 0);
          const localData = budgetRef.current;
          const isLocalEmpty = !localData || (!localData.accounts?.length && !localData.bills?.length);
          const savedCloudVersion = cloudVersionRef.current || 0;

          logSync('CONFLICT_CHECK', 'Evaluated local vs cloud timestamps for 2-way sync', {
            localTime,
            cloudTime,
            savedCloudVersion,
            isLocalEmpty
          });

          if (isLocalEmpty) {
            await restoreFromBackup(cloudData.budget);
            setCloudVersion(cloudTime);
            setLastCloudSyncTime(new Date().toLocaleTimeString());
            if (cloudTime > 0) {
              try {
                localStorage.setItem('tt_budget_cloud_version', String(cloudTime));
                localStorage.setItem('tt_budget_last_modified', String(cloudTime));
              } catch {}
            }
          } else if (savedCloudVersion > 0 && cloudTime > savedCloudVersion && localTime > savedCloudVersion) {
            // Both local and cloud changed since last sync: Prompt user
            setSyncConflict({
              serverData: cloudData.budget,
              serverVersion: cloudTime,
              localTimestamp: localTime
            });
          } else if (cloudTime > savedCloudVersion && localTime <= savedCloudVersion) {
            // Cloud updated elsewhere, local is clean: apply cloud
            await restoreFromBackup(cloudData.budget);
            setCloudVersion(cloudTime);
            setLastCloudSyncTime(new Date().toLocaleTimeString());
            if (cloudTime > 0) {
              try {
                localStorage.setItem('tt_budget_cloud_version', String(cloudTime));
                localStorage.setItem('tt_budget_last_modified', String(cloudTime));
              } catch {}
            }
          } else if (localTime > savedCloudVersion && cloudTime <= savedCloudVersion) {
            // Local changed offline: push local
            await pushCloudBackup(syncPasscode, { baseVersion: savedCloudVersion });
          } else if (cloudTime !== localTime && savedCloudVersion === 0) {
            // First time syncing with both local and cloud populated: Prompt user
            setSyncConflict({
              serverData: cloudData.budget,
              serverVersion: cloudTime,
              localTimestamp: localTime
            });
          }
        }
      } catch (err) {
        logSync('AUTO_SYNC_CHECK_ERROR', `Initial auto cloud sync check failed: ${err?.message || err}`, { error: String(err) }, 'warn');
        console.info('Initial auto cloud sync check:', err?.message || err);
      }
    })();
  }, [isAuthenticated, isDbLoaded, isSyncOnLoadEnabled, restoreFromBackup, pushCloudBackup, syncPasscode, setLastCloudSyncTime]);

  // Debounced Auto Cloud Backup effect (5-second debounce on any data change)
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (!isDbLoaded || !isAuthenticated) return;
    if (isAutoCloudBackupEnabled === false) return;

    // Skip the initial mount trigger before the first sync check completes
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    try { localStorage.setItem('tt_budget_last_modified', String(Date.now())); } catch {}

    const timer = setTimeout(async () => {
      try {
        logSync('AUTO_BACKUP_TRIGGER', '5-second debounce expired; triggering auto cloud backup');
        await pushCloudBackup(syncPasscode);
      } catch (err) {
        logSync('AUTO_BACKUP_ERROR', `Auto cloud backup failed: ${err.message}`, { error: err.message }, 'error');
        console.error('Auto cloud backup failed:', err);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [budgetForUI, matrixVersion, isDbLoaded, isAutoCloudBackupEnabled, isAuthenticated, syncPasscode, pushCloudBackup]);

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

  // Clear all transactions, matrix actuals, and imported balance history for a specific account
  const clearAccountTransactions = useCallback(async (accountId) => {
    if (!accountId) return { success: false, error: 'No account specified.' };

    // 1. Remove all transactions for this account
    const remainingTransactions = (transactionsRef.current || []).filter(t => t.accountId !== accountId);
    const removedCount = (transactionsRef.current || []).length - remainingTransactions.length;
    transactionsRef.current = remainingTransactions;
    setTransactions(remainingTransactions);

    // 2. Clean out dailyMatrix cells for this account
    const cleanMatrix = {};
    let cellsPurged = 0;
    Object.entries(dailyMatrixRef.current || {}).forEach(([k, v]) => {
      if (!k.startsWith(`${accountId}_`)) {
        cleanMatrix[k] = v;
      } else {
        cellsPurged++;
      }
    });
    dailyMatrixRef.current = cleanMatrix;
    setDailyMatrix(cleanMatrix);
    setMatrixVersion(v => v + 1);

    logTransaction('BATCH_DELETE_TRANSACTIONS', `Cleared transactions & matrix cells for account ${accountId}`, {
      accountId,
      transactionsRemoved: removedCount,
      matrixCellsPurged: cellsPurged,
      remainingTxnCount: remainingTransactions.length
    });

    // 3. Reset the account's ledger metadata (importedLedgerRows, ledgerMode, startingBalance, extraStartingBalance)
    setMetadataState(prev => {
      const updatedAccounts = (prev.accounts || []).map(acc => {
        if (acc.id === accountId) {
          return {
            ...acc,
            importedLedgerRows: {},
            ledgerMode: 'projected',
            startingBalance: 0,
            extraStartingBalance: 0,
            startDate: '2026-01-01',
            balanceAsOfDate: '2026-01-01'
          };
        }
        return acc;
      });

      return {
        ...prev,
        accounts: updatedAccounts
      };
    });

    return { success: true };
  }, [setMetadataState]);

  // Selective per-namespace spreadsheet import
  const importSpreadsheetSelective = useCallback(({ namespaces, strategies, data, dryRun = false, resolutions = {} }) => {
    const result = processSpreadsheetImport({
      namespaces,
      strategies,
      data,
      metadataState: metadataStateRef.current,
      lineItems: lineItemsRef.current,
      dailyMatrix: dailyMatrixRef.current,
      transactions: transactionsRef.current,
      dryRun,
      resolutions
    });

    if (!result.success) return result;
    if (result.requiresResolution) return result;
    
    if (dryRun) {
      return { success: true, projected: result };
    }

    if (result.metadataState) {
      setMetadataState(result.metadataState);
    }
    if (result.lineItems) {
      setLineItems(result.lineItems);
    }
    if (result.dailyMatrix) {
      dailyMatrixRef.current = result.dailyMatrix;
      setDailyMatrix(result.dailyMatrix);
      setMatrixVersion(v => v + 1);
    }
    if (result.transactions) {
      setTransactions(result.transactions);
    }

    return { success: true };
  }, [setMetadataState]);


  // --- Line Item Operations ---
  const getLineItem = useCallback((billId, monthKey) => {
    return lineItemsRef.current.find(li => li.billId === billId && li.monthKey === monthKey);
  }, []);

  const upsertLineItem = useCallback((billId, monthKey, actualAmount) => {
    logLedger('UPSERT_LINE_ITEM', `Recorded actual line item for bill ${billId} in ${monthKey}: $${actualAmount}`, { billId, monthKey, actualAmount });
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

  const getTotalActualExpenses = useCallback((monthKey, billsOverride) => {
    const bills = billsOverride || metadataState.bills || [];
    return bills.reduce((sum, b) => {
      const li = (lineItemsRef.current || []).find(item => item.billId === b.id && item.monthKey === monthKey);
      return sum + (li ? li.actualAmount : getBillMonthlyCost(b));
    }, 0);
  }, [metadataState.bills, getBillMonthlyCost]);

  const getAccountActualExpenses = useCallback((accountId, monthKey, billsOverride) => {
    const bills = billsOverride || metadataState.bills || [];
    return bills
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getEffectiveAmount(b, monthKey), 0);
  }, [metadataState.bills, getEffectiveAmount]);

  // --- Derived Balance Helpers ---


  // Derives the latest known balance for an account from importedLedgerRows or transactions
  const getAccountDerivedBalance = useCallback((accountId, accountsOverride) => {
    const accounts = accountsOverride || metadataState.accounts || [];
    const acc = accounts.find(a => a.id === accountId);
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
  const getDailyMatrix = useCallback(() => dailyMatrixRef.current || {}, []);

  const getDailyMatrixCell = useCallback((accountId, monthKey, day, field) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    return dailyMatrixRef.current[key];
  }, []);

  const updateDailyMatrixCell = useCallback((accountId, monthKey, day, field, value) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    
    const currentVal = dailyMatrixRef.current[key];
    if (currentVal === value) return;
    if ((currentVal === undefined || currentVal === null || currentVal === '') && (value === undefined || value === null || value === '')) {
      return;
    }

    const prevNum = parseFloat(currentVal) || 0;
    const newNum = parseFloat(value) || 0;
    logTransaction('UPDATE_CELL_AMOUNT', `Matrix cell amount updated: ${key} = ${value}`, {
      accountId,
      monthKey,
      day,
      field,
      previousValue: currentVal,
      newValue: value,
      diff: Math.round((newNum - prevNum) * 100) / 100
    });
    
    // Mutate ref and sync state for reactive components and persistence
    dailyMatrixRef.current[key] = value;
    setDailyMatrix({ ...dailyMatrixRef.current });
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
      logTransaction('BATCH_UPDATE_CELLS', `Batch update applied to ${Object.keys(updates).length} matrix cells`, {
        updatedKeysCount: Object.keys(updates).length,
        sampleKeys: Object.keys(updates).slice(0, 5)
      });
      setDailyMatrix({ ...dailyMatrixRef.current });
      setMatrixVersion(v => v + 1);
    }
  }, []);

  const moveDailyMatrixCell = useCallback((accountId, sourceMonthKey, sourceDay, targetMonthKey, targetDay, field, value, extraData = {}) => {
    const sourceKey = `${accountId}_${sourceMonthKey}_${sourceDay}_${field}`;
    const targetKey = `${accountId}_${targetMonthKey}_${targetDay}_${field}`;

    logTransaction('MOVE_CELL_DATE', `Relocated cell [${field}] from ${sourceMonthKey}-${sourceDay} to ${targetMonthKey}-${targetDay}`, {
      accountId,
      sourceDate: `${sourceMonthKey}-${sourceDay}`,
      targetDate: `${targetMonthKey}-${targetDay}`,
      field,
      value,
      extraData
    });

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
    } else if (field === 'other_credit_amount') {
      // BUG-3 full fix: move paired other_credit_desc alongside other_credit_amount
      const sourceDescKey = `${accountId}_${sourceMonthKey}_${sourceDay}_other_credit_desc`;
      const targetDescKey = `${accountId}_${targetMonthKey}_${targetDay}_other_credit_desc`;
      const sourceDesc = extraData.otherCreditDesc ?? (dailyMatrixRef.current[sourceDescKey] || '');
      dailyMatrixRef.current[sourceDescKey] = '';
      dailyMatrixRef.current[targetDescKey] = sourceDesc;
      hasChanges = true;
    }

    if (hasChanges) {
      setDailyMatrix({ ...dailyMatrixRef.current });
      setMatrixVersion(v => v + 1);
    }
  }, []);

  // Calculates true running balance from start date to target date using matrix simulation rules
  const getCalculatedBalanceAsOf = useCallback((accountId, targetDateObj) => {
    if (!accountId || !targetDateObj) return { regEnding: 0, extraEnding: 0, totalEnd: 0 };
    const acc = (metadataStateRef.current.accounts || []).find(a => a.id === accountId);
    if (!acc) return { regEnding: 0, extraEnding: 0, totalEnd: 0 };

    const startDateStr = acc.balanceAsOfDate || acc.startDate || '2026-01-01';
    const [sy, sm, sd] = startDateStr.split('-');
    const startDateObj = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
    
    // Normalize targetDate to midnight
    const target = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate());
    
    if (target < startDateObj) {
        return { 
          regEnding: parseFloat(acc.startingBalance) || 0, 
          extraEnding: parseFloat(acc.extraStartingBalance) || 0, 
          totalEnd: (parseFloat(acc.startingBalance) || 0) + (parseFloat(acc.extraStartingBalance) || 0) 
        };
    }

    const isImportMode = acc.ledgerMode === 'import' || (acc.importedLedgerRows && Object.keys(acc.importedLedgerRows).length > 0);
    const importedRows = isImportMode ? (acc.importedLedgerRows || {}) : {};
    const importedDatesList = Object.keys(importedRows);
    const maxImportDateStr = importedDatesList.length > 0 ? importedDatesList.reduce((a, b) => a > b ? a : b) : null;

    let runningRegBeg = parseFloat(acc.startingBalance) || 0;
    let runningExtraBeg = parseFloat(acc.extraStartingBalance) || 0;

    const allPeople = metadataStateRef.current.people || [];
    const people = (acc.enabledEarners && Array.isArray(acc.enabledEarners))
      ? allPeople.filter(p => acc.enabledEarners.includes(p.id))
      : allPeople;
    const accountBills = (metadataStateRef.current.bills || []).filter(b => b.accountId === accountId);
    
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let cur = new Date(startDateObj);
    while (cur <= target) {
      const year = cur.getFullYear();
      const month = cur.getMonth();
      const day = cur.getDate();
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      const isLockedDay = isImportMode && maxImportDateStr && isoDate <= maxImportDateStr;

      // 1. Credits
      let dayCredits = 0;
      let dayExtraAdd = 0;
      people.forEach(p => {
        const isDepDay = isPersonDepositDay(p, year, month, day);
        const customCredit = getDailyMatrixCell(accountId, monthKey, day, `credit_${p.id}`);
        const customExtra = getDailyMatrixCell(accountId, monthKey, day, `extra_credit_${p.id}`);

        let earnerDeposit = 0;
        if (customCredit !== undefined) {
          earnerDeposit = parseFloat(customCredit) || 0;
        } else if (!isLockedDay && isDepDay) {
          earnerDeposit = getPersonDepositAmountForAccount(p, accountId, metadataStateRef.current);
        }

        let earnerExtra = 0;
        if (customExtra !== undefined) {
          earnerExtra = parseFloat(customExtra) || 0;
        } else if (earnerDeposit > 0) {
          earnerExtra = getPersonExtraSavingsDepositAmountForAccount(p, accountId, metadataStateRef.current);
        }

        earnerExtra = Math.min(earnerExtra, earnerDeposit);
        const earnerReg = Math.max(0, earnerDeposit - earnerExtra);

        dayCredits += earnerReg;
        dayExtraAdd += earnerExtra;
      });

      // 2. Bills
      let dayBills = 0;
      // Track whether any bill on this day has a manual dailyMatrix override so
      // the importedRows ending-balance anchor can be bypassed when needed.
      let hasDayBillOverride = false;
      accountBills.forEach(b => {
        const customBill = getDailyMatrixCell(accountId, monthKey, day, `bill_${b.id}`);
        let amt = 0;
        const expectedBillAmt = Math.round((parseFloat(b.amount) || 0) * 100) / 100;
        if (customBill !== undefined) {
          hasDayBillOverride = true;
          amt = parseFloat(customBill) || 0;
          if (expectedBillAmt > 0 && Math.abs(amt - 2 * expectedBillAmt) < 0.02) {
            amt = expectedBillAmt;
          }
        } else if (!isLockedDay) {
          const actualAmt = getActualAmount(b.id, monthKey);
          if (actualAmt !== null && parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
            amt = (expectedBillAmt > 0 && Math.abs(actualAmt - 2 * expectedBillAmt) < 0.02) ? expectedBillAmt : actualAmt;
          } else if (actualAmt !== null) {
            amt = 0;
          } else if (parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
            amt = expectedBillAmt;
          }
        }
        dayBills += amt;
      });

      // 3. Other
      const customOther = getDailyMatrixCell(accountId, monthKey, day, 'other_amount');
      const customOtherCredit = getDailyMatrixCell(accountId, monthKey, day, 'other_credit_amount');
      let otherAmt = 0;
      if (customOther !== undefined) otherAmt += parseFloat(customOther) || 0;
      if (customOtherCredit !== undefined) otherAmt += parseFloat(customOtherCredit) || 0;

      const tentativeRegEnding = runningRegBeg + dayCredits - dayBills;
      const tentativeExtraEnding = runningExtraBeg + dayExtraAdd + otherAmt;

      let reg = tentativeRegEnding;
      let extra = tentativeExtraEnding;

      if (reg < 0 && extra > 0) {
        const transfer = Math.min(extra, -reg);
        reg += transfer;
        extra -= transfer;
      } else if (extra < 0 && reg > 0) {
        const transfer = Math.min(reg, -extra);
        extra += transfer;
        reg -= transfer;
      }

      runningRegBeg = Math.round(reg * 100) / 100 || 0;
      runningExtraBeg = Math.round(extra * 100) / 100 || 0;

      cur.setDate(cur.getDate() + 1);
    }

    return {
      regEnding: runningRegBeg,
      extraEnding: runningExtraBeg,
      totalEnd: Math.round((runningRegBeg + runningExtraBeg) * 100) / 100
    };
  }, [getDailyMatrixCell, getActualAmount, isPersonDepositDay, getPersonDepositAmountForAccount, getPersonExtraSavingsDepositAmountForAccount]);

  const getTotalCashOnHand = useCallback((accountsOverride, asOfDate) => {
    const accounts = accountsOverride || metadataState.accounts || [];
    const targetDate = asOfDate || new Date();
    return accounts.reduce((sum, acc) => {
      const balObj = getCalculatedBalanceAsOf(acc.id, targetDate);
      return sum + (balObj?.totalEnd ?? (parseFloat(acc.startingBalance) || 0));
    }, 0);
  }, [metadataState.accounts, getCalculatedBalanceAsOf]);

  const getTotalMonthEndCashOnHand = useCallback((accountsOverride, targetDate) => {
    const accounts = accountsOverride || metadataState.accounts || [];
    const baseDate = targetDate || new Date();
    const endOfMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    return accounts.reduce((sum, acc) => {
      const balObj = getCalculatedBalanceAsOf(acc.id, endOfMonthDate);
      return sum + (balObj?.totalEnd ?? (parseFloat(acc.startingBalance) || 0));
    }, 0);
  }, [metadataState.accounts, getCalculatedBalanceAsOf]);

  const stateValue = useMemo(() => ({
    budget: budgetForUI,
    lineItems,
    transactions,
    matrixVersion,
    syncPasscode,
    isSyncUnlocked,
    syncConflict,
    cloudVersion
  }), [budgetForUI, lineItems, transactions, matrixVersion, syncPasscode, isSyncUnlocked, syncConflict, cloudVersion]);

  const actionsValue = useMemo(() => ({
    matrixVersion,
    getDailyMatrix,
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
    getCalculatedBalanceAsOf,
    getTotalCashOnHand,
    getTotalMonthEndCashOnHand,
    loadDemoPreset,
    resetToDefaults,
    clearAllData,
    clearAccountTransactions,
    importSpreadsheetSelective,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    setSyncPasscode,
    setIsSyncUnlocked,
    setSyncConflict,
    resolveConflictKeepLocal,
    resolveConflictUseCloud
  }), [
    getDailyMatrix,
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
    getCalculatedBalanceAsOf,
    getTotalCashOnHand,
    getTotalMonthEndCashOnHand,
    loadDemoPreset,
    resetToDefaults,
    clearAllData,
    clearAccountTransactions,
    importSpreadsheetSelective,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    setSyncPasscode,
    setIsSyncUnlocked,
    setSyncConflict,
    resolveConflictKeepLocal,
    resolveConflictUseCloud,
    matrixVersion
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
          {syncConflict && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-lg p-6 rounded-2xl glass-card border border-amber-600/60 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 text-slate-100 shadow-2xl space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Budget Sync Conflict</h3>
                    <p className="text-xs text-slate-400">
                      Your budget changed on another device. Keep local or use cloud?
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 space-y-1">
                    <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">Local Changes</div>
                    <div className="font-mono text-slate-200">
                      {syncConflict.localTimestamp ? new Date(syncConflict.localTimestamp).toLocaleString() : 'Recent offline'}
                    </div>
                    <p className="text-[10px] text-slate-400">Current device edits</p>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/60 space-y-1">
                    <div className="text-purple-300 text-[11px] font-semibold uppercase tracking-wider">Cloud Version</div>
                    <div className="font-mono text-slate-200">
                      {syncConflict.serverVersion ? new Date(syncConflict.serverVersion).toLocaleString() : 'Remote update'}
                    </div>
                    <p className="text-[10px] text-slate-400">Changed on another device</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resolveConflictKeepLocal}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                  >
                    Keep Local (Overwrite Cloud)
                  </button>
                  <button
                    type="button"
                    onClick={resolveConflictUseCloud}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Use Cloud (Overwrite Local)
                  </button>
                </div>
              </div>
            </div>
          )}
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

