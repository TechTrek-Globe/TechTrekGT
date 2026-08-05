// @ts-nocheck
import React, { createContext, useContext, useState, useEffect } from 'react';
import { initialBudgetData } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useBudgetMetadata } from './BudgetMetadataContext';
import { getApiUrl, pushCloudBackupOptimistic, flushPendingCloudSync } from '../utils/api';
import { saveBudgetData, clearAndRestoreBudgetData, clearBudgetData } from '../utils/indexedDB';

const LedgerDataContext = createContext();

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

  // Sync initial seed loaded from IndexedDB by BudgetMetadataProvider
  useEffect(() => {
    if (isDbLoaded && initialLedgerSeed) {
      if (initialLedgerSeed.dailyMatrix) setDailyMatrix(initialLedgerSeed.dailyMatrix);
      if (initialLedgerSeed.lineItems) setLineItems(initialLedgerSeed.lineItems);
      if (initialLedgerSeed.transactions) setTransactions(initialLedgerSeed.transactions);
    }
  }, [isDbLoaded, initialLedgerSeed]);

  // Combined full budget object representation for compatibility and persistence
  const budget = {
    ...metadataState,
    dailyMatrix,
    lineItems,
    transactions
  };

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
  }, [metadataState, dailyMatrix, lineItems, transactions, isDbLoaded]);

  // Cloud Vault Push Backup (Optimistic + Fallback Queue)
  const pushCloudBackup = async (passcode) => {
    const result = await pushCloudBackupOptimistic(passcode, budget);
    if (result.success) {
      setLastCloudSyncTime(new Date().toLocaleTimeString());
    }
    return result;
  };

  // Restore budget state from imported JSON backup
  const restoreFromBackup = async (parsedData) => {
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
  };

  // Cloud Vault Pull Restore
  const pullCloudRestore = async (passcode) => {
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
  };

  // Export complete JSON backup helper
  const exportBackupJson = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(budget, null, 2));
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
  };

  // Financial data checksum key to prevent UI-only updates (theme, widgets) from triggering cloud backups
  const financialDataChecksum = `${(metadataState.accounts || []).length}_${(metadataState.bills || []).length}_${(metadataState.people || []).length}_${(metadataState.loans || []).length}_${(lineItems || []).length}_${Object.keys(dailyMatrix || {}).length}`;

  // Silent background retry effect for pending sync queue on app load or network recovery
  useEffect(() => {
    const handleOnlineRetry = async () => {
      const flushed = await flushPendingCloudSync();
      if (flushed) {
        setLastCloudSyncTime(new Date().toLocaleTimeString());
      }
    };

    handleOnlineRetry();

    window.addEventListener('online', handleOnlineRetry);
    return () => window.removeEventListener('online', handleOnlineRetry);
  }, []);

  // Debounced Auto Cloud Backup effect
  useEffect(() => {
    if (!isDbLoaded || !isAutoCloudBackupEnabled) return;

    const isUnlocked = localStorage.getItem('cf_sync_unlocked') === 'true';
    const passcode = localStorage.getItem('cf_sync_passcode');
    if (!isUnlocked || !passcode) return;

    const timer = setTimeout(async () => {
      try {
        await pushCloudBackup(passcode);
      } catch (err) {
        console.error('Auto cloud backup failed:', err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [financialDataChecksum, isDbLoaded, isAutoCloudBackupEnabled]);

  // Load 100% Fake Demo Preset Data
  const loadDemoPreset = () => {
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
  };

  // Reset to default budget data
  const resetToDefaults = async () => {
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
  };

  // Clear all data (100% clean slate)
  const clearAllData = async () => {
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
  };

  // Selective per-namespace spreadsheet import
  const importSpreadsheetSelective = ({ namespaces, strategies, data }) => {
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
            const match = existingAccounts.find(a =>
              a.name.toLowerCase().trim() === normName ||
              a.name.toLowerCase().includes(normName) ||
              normName.includes(a.name.toLowerCase().trim())
            );

            if (match) {
              accountIdMap.set(incomingAcc.id, match.id);
            } else {
              newAccountsToAdd.push(incomingAcc);
              accountIdMap.set(incomingAcc.id, incomingAcc.id);
            }
          });

          return { ...prev, accounts: [...existingAccounts, ...newAccountsToAdd] };
        });
      }
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
      if (strategies.transactions === 'override') {
        setTransactions(data.transactions);
      } else {
        setTransactions(prev => {
          const key = t => `${t.date}|${(t.description || '').toLowerCase()}|${t.amount}`;
          const existingKeys = new Set(prev.map(key));
          return [...prev, ...data.transactions.filter(t => !existingKeys.has(key(t)))];
        });
      }
    }

    return { success: true };
  };

  // Import Parsed Spreadsheet Data (legacy path)
  const importParsedSpreadsheet = (parsedData, mode = 'replace') => {
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
  };

  // --- Line Item Operations ---
  const getLineItem = (billId, monthKey) => {
    return lineItems.find(li => li.billId === billId && li.monthKey === monthKey);
  };

  const upsertLineItem = (billId, monthKey, actualAmount) => {
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
  };

  const getActualAmount = (billId, monthKey) => {
    const li = getLineItem(billId, monthKey);
    return li ? li.actualAmount : null;
  };

  const getEffectiveAmount = (bill, monthKey) => {
    const li = getLineItem(bill.id, monthKey);
    return li ? li.actualAmount : getBillMonthlyCost(bill);
  };

  const getTotalActualExpenses = (monthKey) => {
    return (metadataState.bills || []).reduce((sum, b) => {
      const li = getLineItem(b.id, monthKey);
      return sum + (li ? li.actualAmount : getBillMonthlyCost(b));
    }, 0);
  };

  const getAccountActualExpenses = (accountId, monthKey) => {
    return (metadataState.bills || [])
      .filter(b => b.accountId === accountId)
      .reduce((sum, b) => sum + getEffectiveAmount(b, monthKey), 0);
  };

  const getAccountProjectedEndBalance = (accountId, monthKey) => {
    const acc = (metadataState.accounts || []).find(a => a.id === accountId);
    if (!acc) return 0;
    const projectedExpenses = monthKey ? getAccountActualExpenses(accountId, monthKey) : getAccountMonthlyExpenses(accountId);
    return (acc.startingBalance || 0) - projectedExpenses;
  };

  const getAccountActualEndBalance = (accountId, monthKey) => {
    const acc = (metadataState.accounts || []).find(a => a.id === accountId);
    if (!acc) return 0;
    const actualExpenses = getAccountActualExpenses(accountId, monthKey);
    return (acc.startingBalance || 0) - actualExpenses;
  };

  // --- Daily Matrix Cell Operations ---
  const getDailyMatrixCell = (accountId, monthKey, day, field) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    return dailyMatrix[key];
  };

  const updateDailyMatrixCell = (accountId, monthKey, day, field, value) => {
    const key = `${accountId}_${monthKey}_${day}_${field}`;
    setDailyMatrix(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateDailyMatrixCells = (updates) => {
    setDailyMatrix(prev => ({
      ...prev,
      ...updates
    }));
  };

  const moveDailyMatrixCell = (accountId, sourceMonthKey, sourceDay, targetMonthKey, targetDay, field, value, extraData = {}) => {
    const sourceKey = `${accountId}_${sourceMonthKey}_${sourceDay}_${field}`;
    const targetKey = `${accountId}_${targetMonthKey}_${targetDay}_${field}`;

    const updates = {
      [sourceKey]: 0,
      [targetKey]: value
    };

    if (field === 'other_amount') {
      const sourceDescKey = `${accountId}_${sourceMonthKey}_${sourceDay}_other_desc`;
      const targetDescKey = `${accountId}_${targetMonthKey}_${targetDay}_other_desc`;
      const sourceDesc = extraData.otherDesc ?? (dailyMatrix[sourceDescKey] || '');
      updates[sourceDescKey] = '';
      updates[targetDescKey] = sourceDesc;
    }

    updateDailyMatrixCells(updates);
  };

  return (
    <LedgerDataContext.Provider
      value={{
        budget,
        dailyMatrix,
        lineItems,
        transactions,
        // actions
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
        pullCloudRestore
      }}
    >
      {children}
    </LedgerDataContext.Provider>
  );
}

export function useLedgerData() {
  const ctx = useContext(LedgerDataContext);
  if (!ctx) {
    throw new Error('useLedgerData must be used within a LedgerDataProvider');
  }
  return ctx;
}
