// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initialBudgetData } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useBudgetMetadata } from './BudgetMetadataContext';
import { getApiUrl, pushCloudBackupOptimistic, flushPendingCloudSync } from '../utils/api';
import { saveBudgetData, clearAndRestoreBudgetData, clearBudgetData } from '../utils/indexedDB';
import { processSpreadsheetImport } from '../utils/spreadsheet';

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
  }, [budget, isDbLoaded, setSaveError]);

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
    const result = processSpreadsheetImport({
      namespaces,
      strategies,
      data,
      metadataState: metadataStateRef.current,
      lineItems: lineItemsRef.current,
      dailyMatrix: dailyMatrixRef.current,
      transactions: transactionsRef.current
    });

    if (!result.success) return result;

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

