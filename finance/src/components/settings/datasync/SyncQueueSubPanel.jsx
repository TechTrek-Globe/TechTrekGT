// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { useBudgetMetadata, useLedgerDataState } from '../../../context/BudgetContext';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  Clock, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Terminal, 
  Layers, 
  ArrowRight,
  Loader2,
  Check
} from 'lucide-react';
import { getPendingSync, clearPendingSync, flushPendingCloudSync } from '../../../utils/api';
import { logSync } from '../../../utils/logger';

export function SyncQueueSubPanel() {
  const { lastCloudSyncTime, setSettingsTab } = useBudgetMetadata();
  const { syncPasscode } = useLedgerDataState();

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [pendingSync, setPendingSync] = useState(() => getPendingSync());
  const [isFlushing, setIsFlushing] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const refreshQueue = useCallback(() => {
    setPendingSync(getPendingSync());
  }, []);

  // Listen to network status changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshQueue();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshQueue]);

  const handleForceFlush = async () => {
    if (!pendingSync) return;
    setIsFlushing(true);
    setActionStatus(null);

    try {
      logSync('MANUAL_FLUSH_TRIGGER', 'User triggered manual flush of pending sync queue');
      const success = await flushPendingCloudSync(syncPasscode);
      refreshQueue();
      if (success) {
        setActionStatus({ type: 'success', message: 'Pending sync queue successfully flushed to Cloudflare D1!' });
      } else {
        setActionStatus({ type: 'warning', message: 'Flush attempt completed. Some items may have been retained if server was unreachable.' });
      }
    } catch (err) {
      setActionStatus({ type: 'error', message: `Flush failed: ${err.message}` });
    } finally {
      setIsFlushing(false);
    }
  };

  const handlePurgeQueue = () => {
    clearPendingSync();
    refreshQueue();
    setConfirmPurge(false);
    setActionStatus({ type: 'info', message: 'Offline sync queue has been purged.' });
  };

  const handleTriggerTestLog = () => {
    logSync('DIAGNOSTIC_HEARTBEAT', 'User executed sync queue diagnostics test event', {
      isOnline,
      hasPendingSync: Boolean(pendingSync),
      lastSyncRecorded: lastCloudSyncTime || 'none',
      evaluatedAt: new Date().toISOString()
    });
    setActionStatus({ type: 'success', message: 'Recorded diagnostic telemetry event in Debug Console.' });
  };

  const payload = pendingSync?.payload;
  const accountsCount = payload?.accounts?.length || 0;
  const billsCount = payload?.bills?.length || 0;
  const peopleCount = payload?.people?.length || 0;
  const matrixCount = Object.keys(payload?.dailyMatrix || {}).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Network & Session Status Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${isOnline ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-600/20 text-rose-400 border border-rose-500/30'}`}>
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">Network Connectivity</div>
              <div className="text-[11px] text-slate-400">
                {isOnline ? 'Browser is connected to the internet' : 'Browser is offline; changes queued'}
              </div>
            </div>
          </div>
          <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-semibold border ${
            isOnline 
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800' 
              : 'bg-rose-950 text-rose-300 border-rose-800'
          }`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">Last Cloud Sync</div>
              <div className="text-[11px] text-slate-400">
                {lastCloudSyncTime ? `Synchronized at ${lastCloudSyncTime}` : 'No sync recorded this session'}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
            {lastCloudSyncTime ? 'Active' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Action Status Feedback */}
      {actionStatus && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between animate-fade-in ${
          actionStatus.type === 'success'
            ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
            : actionStatus.type === 'info'
            ? 'bg-blue-950/80 border border-blue-800 text-blue-300'
            : actionStatus.type === 'warning'
            ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
            : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {actionStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : actionStatus.type === 'info' ? (
              <Activity className="w-5 h-5 text-blue-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <span className="font-medium">{actionStatus.message}</span>
          </div>
          <button 
            onClick={() => setActionStatus(null)} 
            className="text-slate-400 hover:text-white font-bold ml-4 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pending Sync Queue Inspector */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
              <Layers className="w-5 h-5" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Offline Pending Sync Queue
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  pendingSync 
                    ? 'bg-amber-950 text-amber-300 border-amber-800' 
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}>
                  {pendingSync ? '1 Item Queued' : 'Queue Clear'}
                </span>
              </h4>
              <p className="text-xs text-slate-400">
                Inspect changes waiting to push when network or cloud connectivity was interrupted.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={refreshQueue}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Refresh</span>
          </button>
        </div>

        {pendingSync ? (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-800/50 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-semibold">Queued Snapshot Metadata</span>
              </div>
              <div className="text-slate-400 font-mono text-[11px]">
                Enqueued: {new Date(pendingSync.timestamp).toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                <div className="text-lg font-mono font-bold text-blue-400">{accountsCount}</div>
                <div className="text-[10px] text-slate-400">Accounts</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                <div className="text-lg font-mono font-bold text-purple-400">{peopleCount}</div>
                <div className="text-[10px] text-slate-400">Earners</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                <div className="text-lg font-mono font-bold text-emerald-400">{billsCount}</div>
                <div className="text-[10px] text-slate-400">Bills</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                <div className="text-lg font-mono font-bold text-amber-400">{matrixCount}</div>
                <div className="text-[10px] text-slate-400">Matrix Entries</div>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-900">
              <div className="text-[11px] text-slate-400">
                Payload safely stored in local fallback storage (<span className="font-mono text-slate-300">cf_pending_sync</span>).
              </div>

              <div className="flex items-center gap-2">
                {confirmPurge ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-400 font-medium">Discard queued data?</span>
                    <button
                      type="button"
                      onClick={handlePurgeQueue}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      Yes, Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPurge(false)}
                      className="px-2.5 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmPurge(true)}
                    className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Discard Queue</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isFlushing || !isOnline}
                  onClick={handleForceFlush}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-[0.99]"
                >
                  {isFlushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>Force Flush Queue</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-950/40 border border-slate-800 text-center space-y-2">
            <div className="inline-flex p-3 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h5 className="text-xs font-bold text-slate-200">Offline Sync Queue is Clear</h5>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              All edits and changes have successfully synced with Cloudflare D1 or are already committed to local IndexedDB. No pending payloads are waiting in retry queue.
            </p>
          </div>
        )}
      </div>

      {/* Diagnostics & Debugging Bridge */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-200">Real-Time Telemetry and Tracing</div>
            <div className="text-[11px] text-slate-400">
              Inspect granular log records for [SYNC:D1_PUSH], [SYNC:D1_PULL], and conflict evaluations.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTriggerTestLog}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-all cursor-pointer"
          >
            Emit Test Log
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab('debug')}
            className="px-3.5 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span>Open Debug Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
