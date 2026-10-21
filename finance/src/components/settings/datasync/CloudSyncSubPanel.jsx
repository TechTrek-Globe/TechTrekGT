// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, fetchBackupVersions, restoreBackupVersion } from '../../../utils/api';
import { useBudgetMetadata, useLedgerDataState, useLedgerDataDispatch } from '../../../context/BudgetContext';
import { useAuth } from '../../../context/AuthContext';
import { 
  Cloud, 
  Lock, 
  KeyRound, 
  Loader2, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  RotateCcw
} from 'lucide-react';
import { getApiUrl } from '../../../utils/api';

export function CloudSyncSubPanel() {
  const {
    isAutoCloudBackupEnabled,
    toggleAutoCloudBackup,
    isSyncOnLoadEnabled,
    toggleSyncOnLoad,
    lastCloudSyncTime,
  } = useBudgetMetadata();

  const { isAuthenticated, user } = useAuth();
  const { syncPasscode: cloudPasscode, isSyncUnlocked: isCloudUnlocked } = useLedgerDataState();
  const {
    pushCloudBackup,
    pullCloudRestore,
    restoreFromBackup,
    setSyncPasscode: setCloudPasscode,
    setIsSyncUnlocked: setIsCloudUnlocked,
  } = useLedgerDataDispatch();

  // Cloud sync state
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const handleUnlockCloudVault = async (e) => {
    if (e) e.preventDefault();
    if (!passcodeInput) return;
    setPasscodeError('');
    setIsVerifyingCode(true);

    try {
      // Contract note: POST /api/verify-sync-code requires an active authenticated session
      // (credentials: 'include' + X-CSRF-Token attached via apiFetch). Pre-login invocation is not supported.
      const res = await apiFetch('/api/verify-sync-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: passcodeInput })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCloudPasscode(passcodeInput);
        setIsCloudUnlocked(true);
        setPasscodeInput('');
        setCloudSyncStatus({ type: 'success', message: 'Cloud Vault unlocked successfully!' });
      } else {
        setPasscodeError(data.error || 'Invalid access passcode.');
      }
    } catch (err) {
      setPasscodeError(`Verification failed: ${err.message}`);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleLockCloudVault = () => {
    setIsCloudUnlocked(false);
    setCloudPasscode('');
    setCloudSyncStatus(null);
  };

  const [versions, setVersions] = useState([]);
  const [ongoingSyncInfo, setOngoingSyncInfo] = useState(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState(null);

  const loadVersions = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingVersions(true);
    try {
      const vers = await fetchBackupVersions();
      setVersions(vers);
      if (vers.ongoingSync) {
        setOngoingSyncInfo(vers.ongoingSync);
      }
    } catch (err) {
      console.warn('Failed to load backup versions:', err);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadVersions();
    }
  }, [isAuthenticated, loadVersions]);

  const handlePushCloudBackup = async () => {
    setIsPushing(true);
    setCloudSyncStatus({ type: 'info', message: 'Saving manual backup snapshot to Cloud Vault...' });
    try {
      const res = await pushCloudBackup(cloudPasscode, { manual: true, force: true });
      if (res && res.success) {
        setCloudSyncStatus({ type: 'success', message: `Manual backup saved to Cloud Vault! (${new Date().toLocaleTimeString()})` });
        await loadVersions();
      } else if (res?.conflict) {
        setCloudSyncStatus({ type: 'warning', message: 'Sync conflict: Cloud has newer changes from another device.' });
      } else if (res?.suspicious) {
        setCloudSyncStatus({ type: 'warning', message: 'Suspicious payload: incoming backup is suspiciously smaller than stored backup.' });
      } else {
        setCloudSyncStatus({ type: 'warning', message: `Saved locally. ${res?.error || 'Cloud sync queued for background retry.'}` });
      }
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Cloud backup error: ${err.message}` });
    } finally {
      setIsPushing(false);
    }
  };

  const handleRestoreVersion = async (versionId, savedAt) => {
    if (!versionId) return;
    setRestoringVersionId(versionId);
    try {
      const res = await restoreBackupVersion(versionId);
      if (res && res.budget) {
        await restoreFromBackup(res.budget);
        setCloudSyncStatus({
          type: 'success',
          message: `Full ledger restored from snapshot (${new Date(savedAt || res.version || Date.now()).toLocaleString()})! All accounts, bills, and transactions refreshed.`
        });
        await loadVersions();
      } else {
        throw new Error(res?.error || 'Version restore failed.');
      }
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Failed to restore version: ${err.message}` });
    } finally {
      setRestoringVersionId(null);
    }
  };

  const handlePullCloudRestore = async () => {
    setCloudSyncStatus(null);
    setIsCloudSyncing(true);
    try {
      await pullCloudRestore();
      setCloudSyncStatus({
        type: 'success',
        message: 'Full ledger restored from Ongoing Cloud Sync! All accounts, bills, and transactions refreshed.'
      });
      await loadVersions();
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Cloud restore failed: ${err.message}` });
    } finally {
      setIsCloudSyncing(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Account & Sync Overview Card */}
      <div className="p-5 rounded-2xl glass-card border border-purple-800/60 bg-gradient-to-br from-purple-950/20 via-slate-900/60 to-indigo-950/20 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 shadow-inner">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Cloudflare D1 Vault Sync
                {isAuthenticated && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-700">
                    Encrypted Cloud Vault
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-400">
                Automated 2-way cross-device synchronization on Cloudflare D1 SQLite.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 font-semibold flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Account Synced ({user?.email || 'Authenticated'})</span>
              </span>
            ) : (
              <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700 font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Sign-in Required</span>
              </span>
            )}
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-2">
            <p className="leading-relaxed">
              Sign in to your TechTrekGT account to enable automatic cloud backup and seamlessly synchronize your accounts, earners, bills, and ledgers across all your computers and devices.
            </p>
            <p className="text-slate-400 text-[11px]">
              Offline changes made while logged out are always safely preserved in your browser's local IndexedDB.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/40 text-xs text-blue-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Cloud synchronization is optional. Enable below to replicate your local IndexedDB vault to Cloudflare D1.</span>
              </div>
            </div>

            {/* Sync on Load Toggle Switch */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between hover:border-slate-700/80 transition-colors">
              <div className="space-y-1 pr-3">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>Sync on App Load and Sign-In</span>
                  {isSyncOnLoadEnabled && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Auto-Pull
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {isSyncOnLoadEnabled
                    ? 'Enabled: Automatically pulls latest Cloud Vault data when signing in or opening the app, comparing timestamps to avoid overwrites.'
                    : 'Disabled: App will start using local IndexedDB data without checking the cloud on launch.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleSyncOnLoad(!isSyncOnLoadEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isSyncOnLoadEnabled ? 'bg-purple-600' : 'bg-slate-700'
                }`}
                title={isSyncOnLoadEnabled ? 'Disable auto-sync on load' : 'Enable auto-sync on load'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isSyncOnLoadEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Sync After Every Change Toggle Switch */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between hover:border-slate-700/80 transition-colors">
              <div className="space-y-1 pr-3">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>Sync After Every Change (5s Debounce)</span>
                  {isAutoCloudBackupEnabled && (
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                      Auto-Push
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {isAutoCloudBackupEnabled
                    ? (lastCloudSyncTime ? `Enabled: Debounced cloud backup active (Last synced: ${lastCloudSyncTime})` : 'Enabled: Automatically pushes debounced backup to Cloud D1 after any ledger or metadata edit.')
                    : 'Disabled: Local edits will not push to Cloud D1 automatically.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAutoCloudBackup(!isAutoCloudBackupEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isAutoCloudBackupEnabled ? 'bg-purple-600' : 'bg-slate-700'
                }`}
                title={isAutoCloudBackupEnabled ? 'Disable auto-backup on change' : 'Enable auto-backup on change'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isAutoCloudBackupEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Status Feedback Banner */}
            {cloudSyncStatus && (
              <div className={`p-4 rounded-xl text-xs flex items-center justify-between animate-fade-in ${
                cloudSyncStatus.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                  : cloudSyncStatus.type === 'info'
                  ? 'bg-purple-950/80 border border-purple-800 text-purple-300'
                  : cloudSyncStatus.type === 'warning'
                  ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                  : 'bg-rose-950/80 border border-rose-800 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {cloudSyncStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : cloudSyncStatus.type === 'info' ? (
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="font-medium">{cloudSyncStatus.message}</span>
                </div>
                <button 
                  onClick={() => setCloudSyncStatus(null)} 
                  className="text-slate-400 hover:text-white font-bold ml-4 text-xs cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Ongoing Cloud Sync Card */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-purple-800/50 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-slate-100">Ongoing Single Sync (Current Cloud State)</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                  Continuous Live State
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Automatically updated in the background as you work. Restoring this recovers your latest ongoing ledger.
              </p>
              <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-300 font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Last synced: {ongoingSyncInfo?.updatedAt ? new Date(ongoingSyncInfo.updatedAt).toLocaleString() : (lastCloudSyncTime || 'Pending first sync')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isPushing}
                    onClick={handlePushCloudBackup}
                    className="py-1.5 px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isPushing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUpRight className="w-3 h-3" />}
                    <span>Save Manual Backup Now</span>
                  </button>
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={handlePullCloudRestore}
                    className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-800/70 disabled:opacity-50 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCloudSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3 text-purple-400" />}
                    <span>Restore Ongoing Sync</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Prior Manual Backups (Last 10 Versions) */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <History className="w-4 h-4 text-purple-400" />
                  <span>Prior Manual Backups (Last 10 Syncs)</span>
                </div>
                <button
                  type="button"
                  onClick={loadVersions}
                  disabled={isLoadingVersions}
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingVersions ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Permanent snapshots created whenever you click &quot;Save Manual Backup Now&quot;. Never overwritten by auto-sync.
              </p>
              {versions.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-500 italic">
                  No manual snapshots saved yet. Click &quot;Save Manual Backup Now&quot; above to preserve a dedicated rollback point.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {versions.map((ver, idx) => (
                    <div key={ver.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs hover:border-purple-800/60 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/80 font-bold">
                          Manual #{idx + 1}
                        </span>
                        <span className="text-slate-300 font-mono text-[11px]">
                          {new Date(ver.savedAt).toLocaleString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={restoringVersionId === ver.id}
                        onClick={() => handleRestoreVersion(ver.id, ver.savedAt)}
                        className="px-3 py-1 bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-700 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {restoringVersionId === ver.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3 text-purple-400" />
                        )}
                        <span>Restore Full Ledger</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Passcode Unlock Form (if protected) */}
      {!isCloudUnlocked && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <KeyRound className="w-4 h-4 text-purple-400" />
            <span>Vault Passcode Verification (Optional Extra Layer)</span>
          </div>
          <form onSubmit={handleUnlockCloudVault} className="flex items-center gap-2">
            <input
              type="password"
              placeholder="Enter SYNC_UNLOCK_CODE..."
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={isVerifyingCode || !passcodeInput}
              className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isVerifyingCode && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Unlock</span>
            </button>
          </form>
          {passcodeError && (
            <p className="text-[11px] text-rose-400 font-medium">{passcodeError}</p>
          )}
        </div>
      )}

      {/* 2-Way Conflict Handling & Architecture Notice */}
      <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400 space-y-2">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <RefreshCw className="w-4 h-4 text-blue-400" />
          <span>Automated Conflict Resolution Engine</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          When syncing across multiple devices, TechTrek compares the Cloudflare D1 backup timestamp against local IndexedDB modification records (<span className="font-mono text-slate-300">tt_budget_last_modified</span>). Newer cloud snapshots automatically restore upon authenticated load, while unpushed offline changes made locally take precedence and push to the cloud safely without data collisions.
        </p>
      </div>
    </div>
  );
}
