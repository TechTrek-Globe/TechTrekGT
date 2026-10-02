// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { initialBudgetData } from '../initialData';
import { fakeDemoBudgetData } from '../demoPresetData';
import { useBudgetMetadata } from './BudgetMetadataContext';
import { useAuth } from './AuthContext';
import { apiFetch, pushCloudBackupOptimistic, flushPendingCloudSync, savePendingSync, getPendingSync, clearPendingSync, pendingSyncKey } from '../utils/api';
import { getBudgetData, saveBudgetData, clearAndRestoreBudgetData, clearBudgetData, migrateLegacyBudgetToUser, listBudgetRecordKeys, getCurrentUserId, budgetRecordKey } from '../utils/indexedDB';
import { processSpreadsheetImport } from '../utils/spreadsheet';
import { isBillDueInMonth, effectiveDueDay } from '../utils/paydayUtils';
import { allocateEarnerCredit } from '../utils/ledgerEngine';
import { pruneInvalidMatrixDayKeys } from '../migrations/budgetMigrations';
import { logSync, logTransaction, logMatrix, logLedger, logState } from '../utils/logger';
import { AlertTriangle } from 'lucide-react';
import { ALLOWED_BUDGET_KEYS } from '../worker.js';

export const LedgerDataContext = createContext(null);
export const LedgerDataStateContext = createContext(null);
export const LedgerDataDispatchContext = createContext(null);

export function LedgerDataProvider({ children }) {
  const { isAuthenticated, currentUserId } = useAuth();
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

  // CRIT-002: Legacy budget migration confirmation state
  const [showMigrationConfirm, setShowMigrationConfirm] = useState(false);
  const [pendingMigrationUserId, setPendingMigrationUserId] = useState(null);

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
    saveBudgetData(budgetRef.current, currentUserId || getCurrentUserId())
      .then(() => {
        setSaveError(null);
        logState('INDEXEDDB_FLUSH', 'Flushed pending budget state to IndexedDB', {
          recordKey: budgetRecordKey(currentUserId || getCurrentUserId()),
          accountsCount: budgetRef.current?.accounts?.length,
          billsCount: budgetRef.current?.bills?.length,
          matrixEntriesCount: Object.keys(budgetRef.current?.dailyMatrix || {}).length
        });
      })
      .catch(err => {
        console.error('Failed to flush budget to IndexedDB:', err);
        setSaveError('Local storage save failed. Browser storage quota may be exceeded.');
      });
  }, [setSaveError, currentUserId]);

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

  // CRIT-002: On sign-out or session-expiry, flush pending sync, then clear the
  // signed-in user's local budget record and pending sync queue so the next
  // signed-in user never inherits another user's data.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUserLogout = async (e) => {
      const userId = e?.detail?.userId;
      logSync('USER_LOGOUT', 'Clearing user-scoped local budget state', { userId, reason: e?.detail?.reason || 'logout' });
      try { flushSaveToIndexedDB(); } catch {}
      
      // Always clear the pending sync queue and version markers
      try { await clearPendingSync(userId || currentUserId || getCurrentUserId()); } catch {}
      
      // CRIT-002: Check "Remove data from this device" setting (defaults to true for shared devices)
      const shouldRemoveData = (() => {
        try {
          const stored = localStorage.getItem('tt_remove_data_on_logout');
          return stored === null ? true : stored === 'true';
        } catch {
          return true;
        }
      })();
      
      if (shouldRemoveData) {
        try { await clearBudgetData(userId || currentUserId || getCurrentUserId()); } catch {}
      } else {
        logSync('USER_LOGOUT', 'Preserving local budget data per user setting', { userId });
      }
      
      try {
        localStorage.removeItem('tt_budget_cloud_version');
        localStorage.removeItem('tt_budget_last_modified');
      } catch {}
      try { window.sessionStorage.removeItem('tt_signed_in_user_id'); } catch {}
    };
    window.addEventListener('techtrek:user-logout', handleUserLogout);
    return () => window.removeEventListener('techtrek:user-logout', handleUserLogout);
  }, [flushSaveToIndexedDB, currentUserId]);

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
        saveBudgetData(budgetRef.current, currentUserId || getCurrentUserId())
          .then(() => {
            setSaveError(null);
            logState('INDEXEDDB_AUTO_SAVE', 'Debounced budget auto-save to IndexedDB complete', {
              recordKey: budgetRecordKey(currentUserId || getCurrentUserId())
            });
          })
          .catch(err => {
            console.error('Failed to save budget to IndexedDB:', err);
            setSaveError('Local storage save failed. Browser storage quota may be exceeded.');
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [budgetForUI, matrixVersion, isDbLoaded, setSaveError, currentUserId]);

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
      const uid = getCurrentUserId();
      // P3: version marker scoped to userId so users cannot collide
      const vKey = uid ? `tt_budget_cloud_version:${uid}` : 'tt_budget_cloud_version';
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(vKey) : null;
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
    }, currentUserId || getCurrentUserId());
    if (result.success) {
      if (result.version) {
        setCloudVersion(result.version);
        // P3: scope to userId
        const uid = currentUserId || getCurrentUserId();
        const vKey = uid ? `tt_budget_cloud_version:${uid}` : 'tt_budget_cloud_version';
        const mKey = uid ? `tt_budget_last_modified:${uid}` : 'tt_budget_last_modified';
        try { localStorage.setItem(vKey, String(result.version)); } catch {}
        try { localStorage.setItem(mKey, String(Date.now())); } catch {}
      }
      setSyncConflict(null);
      setLastCloudSyncTime(new Date().toLocaleTimeString());
    } else if (result.conflict) {
      const uid = currentUserId || getCurrentUserId();
      const mKey = uid ? `tt_budget_last_modified:${uid}` : 'tt_budget_last_modified';
      setSyncConflict({
        serverData: result.serverData,
        serverVersion: result.serverVersion,
        localTimestamp: parseInt(localStorage.getItem(mKey) || '0', 10) || Date.now()
      });
    }
    return result;
  }, [setLastCloudSyncTime]);

  // Option A self-healing migration: clear legacy future credit cells (> today) from previous spreadsheet workbook
  useEffect(() => {
    if (!isDbLoaded) return;
    try {
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
      let removedCount = 0;
      const cleanMatrix = { ...dailyMatrixRef.current };

      for (const [key] of Object.entries(cleanMatrix)) {
        const match = key.match(creditKeyPattern);
        if (!match) continue;
        const [, accountId, monthKey, dayStr] = match;
        const day = parseInt(dayStr, 10);
        const cellIso = `${monthKey}-${String(day).padStart(2, '0')}`;

        if (cellIso > todayIso) {
          delete cleanMatrix[key];
          removedCount++;
        }
      }

      if (removedCount > 0) {
        dailyMatrixRef.current = cleanMatrix;
        setDailyMatrix(cleanMatrix);
        setMatrixVersion(v => v + 1);
        logLedger('REPAIR_FUTURE_CREDITS', `Auto-cleared ${removedCount} future stored credit cells so live projections take over`, {
          removedCount,
          asOfDate: todayIso
        });
        if (budgetRef.current) {
          budgetRef.current.dailyMatrix = cleanMatrix;
          isPendingSaveRef.current = true;
          saveBudgetData(budgetRef.current, currentUserId || getCurrentUserId()).catch(() => {});
          if (isAuthenticated) {
            pushCloudBackup(syncPasscode, { force: true }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('Failed to check/clear future credit cells:', err);
    }
  }, [isDbLoaded, matrixVersion, currentUserId, isAuthenticated, pushCloudBackup, syncPasscode]);

  // Restore budget state from imported JSON backup
  const restoreFromBackup = useCallback(async (parsedData) => {
    if (!parsedData || typeof parsedData !== 'object') {
      throw new Error('Invalid backup file format.');
    }

    // CRIT-003: Build merged metadata using ALLOWED_BUDGET_KEYS so every persisted key round-trips
    const mergedMetadata = {};
    for (const key of ALLOWED_BUDGET_KEYS) {
      const value = parsedData[key];
      if (Array.isArray(value)) {
        mergedMetadata[key] = value;
      } else if (key === 'theme') {
        mergedMetadata[key] = typeof value === 'string' && value ? value : 'dark';
      } else if (key === 'hideDashboardHeader') {
        mergedMetadata[key] = Boolean(value);
      } else if (key === 'dailyMatrix' || key === 'lineItems' || key === 'transactions') {
        // These are handled separately
        continue;
      } else if (value !== undefined && value !== null) {
        mergedMetadata[key] = value;
      } else {
        mergedMetadata[key] = initialBudgetData[key] || (Array.isArray(initialBudgetData[key]) ? [] : {});
      }
    }

    const rawDailyMatrix = (parsedData.dailyMatrix && typeof parsedData.dailyMatrix === 'object') ? parsedData.dailyMatrix : {};
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
    const newDailyMatrix = { ...rawDailyMatrix };
    for (const [key] of Object.entries(newDailyMatrix)) {
      const match = key.match(creditKeyPattern);
      if (!match) continue;
      const [, , monthKey, dayStr] = match;
      const day = parseInt(dayStr, 10);
      const cellIso = `${monthKey}-${String(day).padStart(2, '0')}`;
      if (cellIso > todayIso) {
        delete newDailyMatrix[key];
      }
    }
    const newLineItems = Array.isArray(parsedData.lineItems) ? parsedData.lineItems : [];
    const newTransactions = Array.isArray(parsedData.transactions) ? parsedData.transactions : [];

    const fullMerged = { ...mergedMetadata, dailyMatrix: newDailyMatrix, lineItems: newLineItems, transactions: newTransactions };

    await clearAndRestoreBudgetData(fullMerged, currentUserId || getCurrentUserId());
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
  const prevUserIdRef = useRef(currentUserId);
  useEffect(() => {
    if (!prevAuthRef.current && isAuthenticated) {
      hasAutoPulledRef.current = false;
    }
    if (currentUserId && currentUserId !== prevUserIdRef.current) {
      hasAutoPulledRef.current = false;
      // CRIT-002: migrate legacy unkeyed record only when the target user record is empty AND user confirms
      (async () => {
        try {
          const db = await (await import('../utils/indexedDB.js')).openDB();
          const legacyKey = (await import('../utils/indexedDB.js')).LEGACY_BUDGET_KEY;
          const userKey = (await import('../utils/indexedDB.js')).budgetRecordKey(currentUserId);
          
          const tx = db.transaction('app_state', 'readonly');
          const store = tx.objectStore('app_state');
          
          const legacyRequest = store.get(legacyKey);
          const userRequest = store.get(userKey);
          
          Promise.all([
            new Promise((resolve, reject) => {
              legacyRequest.onsuccess = () => resolve(legacyRequest.result);
              legacyRequest.onerror = () => reject(legacyRequest.error);
            }),
            new Promise((resolve, reject) => {
              userRequest.onsuccess = () => resolve(userRequest.result);
              userRequest.onerror = () => reject(userRequest.error);
            })
          ]).then(([legacy, userData]) => {
            if (legacy && typeof legacy === 'object' && (!userData || typeof userData !== 'object')) {
              // Legacy record exists and user record is empty - show confirmation
              setPendingMigrationUserId(currentUserId);
              setShowMigrationConfirm(true);
            }
          }).catch(err => {
            console.warn('Legacy budget migration check failed:', err?.message || err);
          });
        } catch (err) {
          console.warn('Legacy budget migration check failed:', err?.message || err);
        }
      })();
    }
    prevUserIdRef.current = currentUserId;
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, currentUserId]);

  useEffect(() => {
    if (!isAuthenticated || !isDbLoaded || hasAutoPulledRef.current) return;
    if (isSyncOnLoadEnabled === false) {
      const localData = budgetRef.current;
      const isLocalEmpty = !localData || (!localData.accounts?.length && !localData.bills?.length && !localData.fundingGoals?.length);
      if (!isLocalEmpty) return;
    }

    (async () => {
      try {
        hasAutoPulledRef.current = true;
        const res = await apiFetch('/api/sync/restore', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const cloudData = await res.json().catch(() => null);

        if (res.ok && cloudData && cloudData.success && cloudData.budget) {
          // P3: scope version markers to userId
          const uid = currentUserId || getCurrentUserId();
          const vKey = uid ? `tt_budget_cloud_version:${uid}` : 'tt_budget_cloud_version';
          const mKey = uid ? `tt_budget_last_modified:${uid}` : 'tt_budget_last_modified';
          const localTimeStr = localStorage.getItem(mKey);
          const localTime = localTimeStr ? parseInt(localTimeStr, 10) : 0;
          const cloudTime = cloudData.version || (cloudData.updatedAt ? new Date(cloudData.updatedAt).getTime() : 0);
          const localData = budgetRef.current;
          // P3: include fundingGoals in empty check - local with goals is never empty
          const isLocalEmpty = !localData || (!localData.accounts?.length && !localData.bills?.length && !localData.fundingGoals?.length);
          const savedCloudVersion = cloudVersionRef.current || parseInt(localStorage.getItem(vKey) || '0', 10) || 0;

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
                localStorage.setItem(vKey, String(cloudTime));
                localStorage.setItem(mKey, String(cloudTime));
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
            // P3: but never silently overwrite local fundingGoals with empty cloud goals
            const localGoals = localData?.fundingGoals;
            const cloudGoals = cloudData.budget?.fundingGoals;
            if (localGoals?.length > 0 && (!cloudGoals || cloudGoals.length === 0)) {
              logSync('GOALS_PROTECT', 'Cloud backup has no fundingGoals but local does; showing conflict dialog instead of silent overwrite', { localGoalCount: localGoals.length }, 'warn');
              setSyncConflict({
                serverData: cloudData.budget,
                serverVersion: cloudTime,
                localTimestamp: localTime
              });
            } else {
              await restoreFromBackup(cloudData.budget);
              setCloudVersion(cloudTime);
              setLastCloudSyncTime(new Date().toLocaleTimeString());
              if (cloudTime > 0) {
                try {
                  localStorage.setItem(vKey, String(cloudTime));
                  localStorage.setItem(mKey, String(cloudTime));
                } catch {}
              }
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
      fundingGoals: fakeDemoBudgetData.fundingGoals || [],
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
      fundingGoals: initialBudgetData.fundingGoals || [],
      dashboardWidgets: initialBudgetData.dashboardWidgets || [],
      theme: 'dark',
      hideDashboardHeader: false
    });
    setDailyMatrix(initialBudgetData.dailyMatrix || {});
    setLineItems(initialBudgetData.lineItems || []);
    setTransactions(initialBudgetData.transactions || []);
    await saveBudgetData(initialBudgetData, currentUserId || getCurrentUserId());
  }, [setMetadataState, currentUserId]);

  // Clear all data (100% clean slate)
  const clearAllData = useCallback(async () => {
    await clearBudgetData(currentUserId || getCurrentUserId());
    setMetadataState({
      accounts: [],
      people: [],
      bills: [],
      loans: [],
      fundingGoals: [],
      dashboardWidgets: initialBudgetData.dashboardWidgets || [],
      theme: 'dark',
      hideDashboardHeader: false
    });
    setDailyMatrix({});
    setLineItems([]);
    setTransactions([]);
  }, [setMetadataState, currentUserId]);

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
            // P12-a: preserve existing startingBalance/dates - clearing transactions does not reset the balance
            startingBalance: acc.startingBalance ?? 0,
            extraStartingBalance: acc.extraStartingBalance ?? 0,
            startDate: acc.startDate ?? acc.balanceAsOfDate ?? new Date().toISOString().split('T')[0],
            balanceAsOfDate: acc.balanceAsOfDate ?? acc.startDate ?? new Date().toISOString().split('T')[0]
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

  // Clears future matrix credit cells (> today) so live funding goals govern future months cleanly
  const clearFutureMatrixCredits = useCallback(async (asOfDate = new Date()) => {
    const todayMidnight = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
    const todayIso = `${todayMidnight.getFullYear()}-${String(todayMidnight.getMonth() + 1).padStart(2, '0')}-${String(todayMidnight.getDate()).padStart(2, '0')}`;

    const creditKeyPattern = /^(.+)_(\d{4}-\d{2})_(\d{1,2})_(?:extra_)?credit_(.+)$/;
    let removedCount = 0;
    const cleanMatrix = { ...dailyMatrixRef.current };

    for (const [key] of Object.entries(cleanMatrix)) {
      const match = key.match(creditKeyPattern);
      if (!match) continue;
      const [, accountId, monthKey, dayStr] = match;
      const day = parseInt(dayStr, 10);
      const cellIso = `${monthKey}-${String(day).padStart(2, '0')}`;

      if (cellIso > todayIso) {
        delete cleanMatrix[key];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      dailyMatrixRef.current = cleanMatrix;
      setDailyMatrix(cleanMatrix);
      setMatrixVersion(v => v + 1);
      logLedger('CLEAR_FUTURE_CREDITS', `Cleared ${removedCount} future stored credit cells`, {
        removedCount,
        asOfDate: todayIso
      });
      if (budgetRef.current) {
        budgetRef.current.dailyMatrix = cleanMatrix;
        isPendingSaveRef.current = true;
        saveBudgetData(budgetRef.current, currentUserId || getCurrentUserId()).catch(() => {});
        if (isAuthenticated) {
          await pushCloudBackup(syncPasscode, { force: true }).catch(() => {});
        }
      }
    }
    return { success: true, removedCount };
  }, [currentUserId, isAuthenticated, pushCloudBackup, syncPasscode]);

  // C8: Prunes ghost calendar day keys (e.g. Feb 30/31, Sep 31) from active matrix and syncs
  const pruneGhostMatrixDayKeys = useCallback(async () => {
    const { cleanedMatrix, removedCount, removedKeys } = pruneInvalidMatrixDayKeys(dailyMatrixRef.current || {});
    if (removedCount > 0) {
      dailyMatrixRef.current = cleanedMatrix;
      setDailyMatrix(cleanedMatrix);
      setMatrixVersion(v => v + 1);
      logLedger('PRUNE_GHOST_KEYS', `Pruned ${removedCount} invalid calendar day keys`, { removedKeys });
      if (budgetRef.current) {
        budgetRef.current.dailyMatrix = cleanedMatrix;
        isPendingSaveRef.current = true;
        saveBudgetData(budgetRef.current, currentUserId || getCurrentUserId()).catch(() => {});
        if (isAuthenticated) {
          await pushCloudBackup(syncPasscode, { force: true }).catch(() => {});
        }
      }
    }
    return { success: true, removedCount, removedKeys };
  }, [currentUserId, isAuthenticated, pushCloudBackup, syncPasscode]);

  // C4: Restores standard clean funding goals (Mortgage & Bills Checking) if deleted or empty
  const restoreStandardFundingGoals = useCallback(async () => {
    const accounts = metadataStateRef.current?.accounts || [];
    const people = metadataStateRef.current?.people || [];

    const mortgageAcc = accounts.find(a => a.name && a.name.toLowerCase().includes('mortgage')) || accounts.find(a => a.id.includes('mortgage'));
    const billsAcc = accounts.find(a => a.name && a.name.toLowerCase().includes('bills')) || accounts.find(a => a.id.includes('bills')) || accounts[0];

    const standardGoals = [];
    people.forEach(p => {
      const pName = p.name ? p.name.toLowerCase() : '';
      if (mortgageAcc) {
        if (pName.includes('ronnie')) {
          standardGoals.push({
            id: `goal-mortgage-${p.id}`,
            contributorId: p.id,
            accountId: mortgageAcc.id,
            name: 'Mortgage Contribution',
            amountPerPay: 1378.00
          });
        } else if (pName.includes('jon')) {
          standardGoals.push({
            id: `goal-mortgage-${p.id}`,
            contributorId: p.id,
            accountId: mortgageAcc.id,
            name: 'Mortgage Contribution',
            amountPerPay: 689.00
          });
        }
      }
      if (billsAcc && pName.includes('jon')) {
        standardGoals.push({
          id: `goal-bills-${p.id}-base`,
          contributorId: p.id,
          accountId: billsAcc.id,
          name: 'Bills Checking Base (Semi-Monthly)',
          amountPerPay: 85.00
        });
        standardGoals.push({
          id: `goal-bills-${p.id}-buffer`,
          contributorId: p.id,
          accountId: billsAcc.id,
          name: 'Bills Checking Buffer (Monthly)',
          amountPerPay: 78.08
        });
      }
    });

    if (standardGoals.length > 0) {
      if (metadata.setFundingGoals) {
        metadata.setFundingGoals(standardGoals);
      }
      if (budgetRef.current) {
        budgetRef.current.fundingGoals = standardGoals;
        isPendingSaveRef.current = true;
        await saveBudgetData(budgetRef.current, currentUserId || getCurrentUserId()).catch(() => {});
        if (isAuthenticated) {
          await pushCloudBackup(syncPasscode, { force: true }).catch(() => {});
        }
      }
    }
    return { success: true, count: standardGoals.length, goals: standardGoals };
  }, [currentUserId, isAuthenticated, metadata, pushCloudBackup, syncPasscode]);

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
    // P9: exclude archived bills from actual expense total
    return bills.filter(b => !b.isArchived).reduce((sum, b) => {
      const li = (lineItemsRef.current || []).find(item => item.billId === b.id && item.monthKey === monthKey);
      return sum + (li ? li.actualAmount : getBillMonthlyCost(b));
    }, 0);
  }, [metadataState.bills, getBillMonthlyCost]);

  const getAccountActualExpenses = useCallback((accountId, monthKey, billsOverride) => {
    const bills = billsOverride || metadataState.bills || [];
    return bills
      // P9: exclude archived bills from account actual expense total
      .filter(b => !b.isArchived && b.accountId === accountId)
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
      
      // P6: clamp import lock boundary to today so future dates project normally.
      const todayLockStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const effectiveLockEnd = maxImportDateStr && maxImportDateStr < todayLockStr ? maxImportDateStr : todayLockStr;
      const isLockedDay = isImportMode && maxImportDateStr && isoDate <= effectiveLockEnd;


      // 1. Credits
      let dayCredits = 0;
      let dayExtraAdd = 0;
      people.forEach(p => {
        const alloc = allocateEarnerCredit(p, accountId, year, month, day, metadataStateRef.current, dailyMatrixRef.current, { isLockedDay: isLockedDay });
        dayCredits += alloc.earnerReg;
        dayExtraAdd += alloc.earnerExtra;
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
          if (actualAmt !== null && effectiveDueDay(b, year, month) === day && isBillDueInMonth(b, month, true)) {
            amt = (expectedBillAmt > 0 && Math.abs(actualAmt - 2 * expectedBillAmt) < 0.02) ? expectedBillAmt : actualAmt;
          } else if (actualAmt !== null) {
            amt = 0;
          } else if (effectiveDueDay(b, year, month) === day && isBillDueInMonth(b, month, true)) {
            amt = expectedBillAmt;
          }
        }
        dayBills += amt;
      });

      // 3. Other (consolidated credit and debit affects regular operating balance)
      const customOther = getDailyMatrixCell(accountId, monthKey, day, 'other_amount');
      const customOtherCredit = getDailyMatrixCell(accountId, monthKey, day, 'other_credit_amount');
      let otherAmt = 0;
      if (customOther !== undefined) otherAmt += parseFloat(customOther) || 0;
      if (customOtherCredit !== undefined) otherAmt += parseFloat(customOtherCredit) || 0;

      const tentativeRegEnding = runningRegBeg + dayCredits - dayBills + otherAmt;
      const tentativeExtraEnding = runningExtraBeg + dayExtraAdd;

      let customRegEnd;
      let customExtraEnd;

      const accReg = getDailyMatrixCell(accountId, monthKey, day, 'reg_ending');
      const accExtra = getDailyMatrixCell(accountId, monthKey, day, 'extra_ending');
      if (accReg !== undefined && accReg !== null && accReg !== '') customRegEnd = parseFloat(accReg);
      if (accExtra !== undefined && accExtra !== null && accExtra !== '') customExtraEnd = parseFloat(accExtra);

      const impRow = importedRows[isoDate];
      if (customRegEnd === undefined && isImportMode && impRow !== undefined && !hasDayBillOverride) {
        if (typeof impRow === 'number') {
          customRegEnd = impRow;
        } else if (impRow && typeof impRow === 'object') {
          const statedEnd = impRow.regEnding ?? impRow.totalEnding ?? null;
          if (statedEnd !== null && statedEnd !== undefined && !isNaN(statedEnd)) {
            customRegEnd = statedEnd;
          }
        }
      }
      if (customExtraEnd === undefined && isImportMode && impRow !== undefined && !hasDayBillOverride) {
        if (impRow && typeof impRow === 'object') {
          const statedExtra = impRow.extraEnding ?? null;
          if (statedExtra !== null && statedExtra !== undefined && !isNaN(statedExtra)) {
            customExtraEnd = statedExtra;
          }
        }
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
    resolveConflictUseCloud,
    clearFutureMatrixCredits,
    pruneGhostMatrixDayKeys,
    restoreStandardFundingGoals
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
    clearFutureMatrixCredits,
    pruneGhostMatrixDayKeys,
    restoreStandardFundingGoals,
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
          {/* CRIT-002: Legacy Budget Migration Confirmation Dialog */}
          {showMigrationConfirm && pendingMigrationUserId && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="w-full max-w-md p-6 rounded-2xl glass-card border border-amber-600/60 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 text-slate-100 shadow-2xl space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Migrate Legacy Budget Data?</h3>
                    <p className="text-xs text-slate-400">
                      Found existing budget data from a previous version. Import it for this user?
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 space-y-1 text-xs">
                  <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">What This Does</div>
                  <p className="text-slate-300 leading-relaxed">
                    Copies your existing local budget (accounts, bills, earners, ledger) into the new user-scoped storage for <strong>{pendingMigrationUserId}</strong>. This is a one-time migration that only happens when a user record is empty.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMigrationConfirm(false);
                      setPendingMigrationUserId(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                  >
                    Skip (Start Fresh)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await migrateLegacyBudgetToUser(pendingMigrationUserId);
                        logSync('USER_MIGRATION', 'User confirmed legacy budget migration', { userId: pendingMigrationUserId });
                      } catch (err) {
                        console.warn('Legacy budget migration failed:', err?.message || err);
                      }
                      setShowMigrationConfirm(false);
                      setPendingMigrationUserId(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Migrate My Data
                  </button>
                </div>
              </div>
            </div>
          )}

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

