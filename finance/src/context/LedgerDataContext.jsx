// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initialBudgetData } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useBudgetMetadata } from './BudgetMetadataContext';
import { useAuth } from './AuthContext';
import { getApiUrl, pushCloudBackupOptimistic, flushPendingCloudSync } from '../utils/api';
import { getBudgetData, saveBudgetData, clearAndRestoreBudgetData, clearBudgetData } from '../utils/indexedDB';
import { processSpreadsheetImport } from '../utils/spreadsheet';
import { isBillDueInMonth } from '../utils/paydayUtils';

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
    getPersonDepositAmountForAccount
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
  useEffect(() => { metadataStateRef.current = metadataState; }, [metadataState]);

  const transactionsRef = useRef(transactions);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  const lineItemsRef = useRef(lineItems);
  useEffect(() => { lineItemsRef.current = lineItems; }, [lineItems]);

  const budgetRef = useRef(null);

  // Track unsaved local changes to avoid losing data on tab close or navigation
  const isPendingSaveRef = useRef(false);

  const flushSaveToIndexedDB = useCallback(() => {
    if (!isPendingSaveRef.current || !budgetRef.current) return;
    isPendingSaveRef.current = false;
    saveBudgetData(budgetRef.current)
      .then(() => setSaveError(null))
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
          .then(() => setSaveError(null))
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

  // Cloud Vault Push Backup (Optimistic + Fallback Queue)
  const pushCloudBackup = useCallback(async (passcode) => {
    const result = await pushCloudBackupOptimistic(passcode, budgetRef.current);
    if (result.success) {
      setLastCloudSyncTime(new Date().toLocaleTimeString());
      try { localStorage.setItem('tt_budget_last_modified', String(Date.now())); } catch {}
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
    setMetadataState(mergedMetadata);
    setDailyMatrix(newDailyMatrix);
    setMatrixVersion(v => v + 1);
    setLineItems(newLineItems);
    setTransactions(newTransactions);
    return true;
  }, [setMetadataState]);

  // Cloud Vault Pull Restore
  const pullCloudRestore = useCallback(async (passcode) => {
    const headers = { 'Content-Type': 'application/json' };
    const code = passcode || syncPasscode;
    if (code) {
      headers['X-Sync-Passcode'] = code;
    }
    const res = await fetch(getApiUrl('/api/sync/restore'), {
      method: 'GET',
      credentials: 'include',
      headers
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.budget) {
      throw new Error(data.error || 'Failed to restore data from Cloud Vault.');
    }
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
        const res = await fetch(getApiUrl('/api/sync/restore'), {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        const cloudData = await res.json().catch(() => null);

        if (res.ok && cloudData && cloudData.success && cloudData.budget) {
          const localTimeStr = localStorage.getItem('tt_budget_last_modified');
          const localTime = localTimeStr ? parseInt(localTimeStr, 10) : 0;
          const cloudTime = cloudData.updatedAt ? new Date(cloudData.updatedAt).getTime() : 0;
          const localData = budgetRef.current;
          const isLocalEmpty = !localData || (!localData.accounts?.length && !localData.bills?.length);

          // If local is empty OR cloud is newer/equal to local, restore from cloud
          if (isLocalEmpty || cloudTime >= localTime) {
            await restoreFromBackup(cloudData.budget);
            setLastCloudSyncTime(new Date().toLocaleTimeString());
            if (cloudTime > 0) {
              try { localStorage.setItem('tt_budget_last_modified', String(cloudTime)); } catch {}
            }
          } else if (localTime > cloudTime && !isLocalEmpty) {
            // Local has newer unpushed changes made offline -> push to cloud
            await pushCloudBackup(syncPasscode);
          }
        }
      } catch (err) {
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
        await pushCloudBackup(syncPasscode);
      } catch (err) {
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
    transactionsRef.current = remainingTransactions;
    setTransactions(remainingTransactions);

    // 2. Clean out dailyMatrix cells for this account
    const cleanMatrix = {};
    Object.entries(dailyMatrixRef.current || {}).forEach(([k, v]) => {
      if (!k.startsWith(`${accountId}_`)) {
        cleanMatrix[k] = v;
      }
    });
    dailyMatrixRef.current = cleanMatrix;
    setDailyMatrix(cleanMatrix);
    setMatrixVersion(v => v + 1);

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
  }, []);

  const updateDailyMatrixCell = useCallback((accountId, monthKey, day, field, value) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    
    const currentVal = dailyMatrixRef.current[key];
    if (currentVal === value) return;
    if ((currentVal === undefined || currentVal === null || currentVal === '') && (value === undefined || value === null || value === '')) {
      return;
    }
    
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
      setDailyMatrix({ ...dailyMatrixRef.current });
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

    const startDateStr = acc.startDate || acc.balanceAsOfDate || '2026-01-01';
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

    const isImportMode = acc.ledgerMode === 'import';
    const importedRows = isImportMode ? (acc.importedLedgerRows || {}) : {};

    let runningRegBeg = parseFloat(acc.startingBalance) || 0;
    let runningExtraBeg = parseFloat(acc.extraStartingBalance) || 0;

    const people = metadataStateRef.current.people || [];
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
      
      const isLockedDay = isImportMode && importedRows[isoDate] !== undefined;

      // 1. Credits
      let dayCredits = 0;
      let dayExtraAdd = 0;
      people.forEach(p => {
        const customCredit = getDailyMatrixCell(accountId, monthKey, day, `credit_${p.id}`);
        if (customCredit !== undefined) {
          dayCredits += parseFloat(customCredit) || 0;
        } else if (!isLockedDay) {
          const isDepDay = isPersonDepositDay(p, year, month, day);
          dayCredits += isDepDay ? getPersonDepositAmountForAccount(p, accountId) : 0;
        }

        const customExtra = getDailyMatrixCell(accountId, monthKey, day, `extra_credit_${p.id}`);
        if (customExtra !== undefined) {
          dayExtraAdd += parseFloat(customExtra) || 0;
        }
      });

      // 2. Bills
      let dayBills = 0;
      accountBills.forEach(b => {
        const customBill = getDailyMatrixCell(accountId, monthKey, day, `bill_${b.id}`);
        let amt = 0;
        if (customBill !== undefined) {
          amt = parseFloat(customBill) || 0;
        } else if (!isLockedDay) {
          const actualAmt = getActualAmount(b.id, monthKey);
          if (actualAmt !== null && parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
            amt = actualAmt;
          } else if (actualAmt !== null) {
            amt = 0;
          } else if (parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
            amt = parseFloat(b.amount) || 0;
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

      let customRegEnd;
      let customExtraEnd;
      const accReg = getDailyMatrixCell(accountId, monthKey, day, 'reg_ending');
      const accExtra = getDailyMatrixCell(accountId, monthKey, day, 'extra_ending');
      if (accReg !== undefined && accReg !== null && accReg !== '') customRegEnd = parseFloat(accReg);
      if (accExtra !== undefined && accExtra !== null && accExtra !== '') customExtraEnd = parseFloat(accExtra);

      if (customRegEnd === undefined && isImportMode && importedRows[isoDate]?.regEnding !== undefined) {
        customRegEnd = importedRows[isoDate].regEnding;
      }
      if (customExtraEnd === undefined && isImportMode && importedRows[isoDate]?.extraEnding !== undefined) {
        customExtraEnd = importedRows[isoDate].extraEnding;
      }

      let reg = customRegEnd !== undefined && !isNaN(customRegEnd) ? customRegEnd : tentativeRegEnding;
      let extra = customExtraEnd !== undefined && !isNaN(customExtraEnd) ? customExtraEnd : tentativeExtraEnding;

      if (customRegEnd === undefined && customExtraEnd === undefined) {
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

      runningRegBeg = Math.round(reg * 100) / 100 || 0;
      runningExtraBeg = Math.round(extra * 100) / 100 || 0;

      cur.setDate(cur.getDate() + 1);
    }

    return {
      regEnding: runningRegBeg,
      extraEnding: runningExtraBeg,
      totalEnd: Math.round((runningRegBeg + runningExtraBeg) * 100) / 100
    };
  }, [getDailyMatrixCell, getActualAmount, isPersonDepositDay, getPersonDepositAmountForAccount]);

  const getTotalCashOnHand = useCallback(() => {
    const today = new Date();
    return (metadataStateRef.current.accounts || []).reduce((sum, acc) => {
      const balObj = getCalculatedBalanceAsOf(acc.id, today);
      return sum + (balObj?.totalEnd ?? (parseFloat(acc.startingBalance) || 0));
    }, 0);
  }, [getCalculatedBalanceAsOf]);

  const stateValue = useMemo(() => ({
    budget: budgetForUI,
    lineItems,
    transactions,
    syncPasscode,
    isSyncUnlocked
  }), [budgetForUI, lineItems, transactions, syncPasscode, isSyncUnlocked]);

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
    getCalculatedBalanceAsOf,
    getTotalCashOnHand,
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
    getCalculatedBalanceAsOf,
    getTotalCashOnHand,
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

