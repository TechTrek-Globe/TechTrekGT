import React, { useState, useEffect } from 'react';
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle, Layers, X, Wifi } from 'lucide-react';
import { getQueue, getQueueCount, replayQueue } from '../../utils/mutationQueue';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export function OfflineSyncBadge({ className = '' }) {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const [attentionMessage, setAttentionMessage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queuedItems, setQueuedItems] = useState([]);

  useEscapeKey(isModalOpen, () => setIsModalOpen(false));

  // Subscribe to network and queue events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const refreshQueueState = () => {
      getQueue().then((items) => {
        setPendingCount(items.length);
        const authPaused = items.find((i) => i.status === 'auth_required');
        if (authPaused) {
          setAttentionMessage('Session expired. Sign in again to sync pending changes.');
        }
      });
    };

    const handleQueueUpdate = (e) => {
      setPendingCount(e.detail?.pendingCount ?? 0);
      refreshQueueState();
    };

    const handleSyncStart = () => {
      setIsSyncing(true);
      setJustSynced(false);
    };

    const handleSyncStatus = (e) => {
      if (e.detail?.status === 'needs_attention') {
        setAttentionMessage(e.detail.message || 'Offline sync needs attention.');
      } else if (e.detail?.status === 'synced') {
        setAttentionMessage(null);
      }
    };

    const handleSyncComplete = (e) => {
      setIsSyncing(false);
      const synced = e.detail?.syncedCount ?? 0;
      if (synced > 0 && (e.detail?.failedCount ?? 0) === 0) {
        setAttentionMessage(null);
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 4000);
      }
      refreshQueueState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wayfinder:queue-updated', handleQueueUpdate);
    window.addEventListener('wayfinder:sync-start', handleSyncStart);
    window.addEventListener('wayfinder:sync-status', handleSyncStatus);
    window.addEventListener('wayfinder:sync-complete', handleSyncComplete);

    // Initial check
    getQueueCount().then(c => setPendingCount(c));
    refreshQueueState();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wayfinder:queue-updated', handleQueueUpdate);
      window.removeEventListener('wayfinder:sync-start', handleSyncStart);
      window.removeEventListener('wayfinder:sync-status', handleSyncStatus);
      window.removeEventListener('wayfinder:sync-complete', handleSyncComplete);
    };
  }, []);

  const handleOpenModal = async () => {
    const items = await getQueue();
    setQueuedItems(items);
    setIsModalOpen(true);
  };

  const handleManualSync = async (e) => {
    e.stopPropagation();
    setIsSyncing(true);
    await replayQueue();
    const items = await getQueue();
    setQueuedItems(items);
  };

  // If online, not syncing, no pending items, no warning, and not recently synced: stay ambient
  if (isOnline && pendingCount === 0 && !isSyncing && !justSynced && !attentionMessage) {
    return null;
  }

  return (
    <>
      <div className={`inline-flex items-center space-x-1.5 transition-all animate-fade-in ${className}`}>
        {/* Needs Attention Alert */}
        {!isSyncing && attentionMessage && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold hover:bg-rose-500/30 transition-all shadow-sm cursor-pointer"
            title={attentionMessage}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Needs Attention</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-400 text-slate-950 text-[10px] font-black">
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {/* State 1: Currently Syncing */}
        {isSyncing && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/40 text-sky-300 text-xs font-bold hover:bg-sky-500/25 transition-all shadow-sm"
            title="Syncing offline changes..."
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
            <span className="hidden sm:inline">Syncing</span>
            <span className="px-1.5 py-0.2 rounded-full bg-sky-400/20 text-[10px] font-mono">
              {pendingCount}
            </span>
          </button>
        )}

        {/* State 2: Just Synced Success Banner */}
        {!isSyncing && justSynced && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Synced</span>
          </div>
        )}

        {/* State 3: Offline with or without pending items */}
        {!isSyncing && !justSynced && !isOnline && (
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-all shadow-sm cursor-pointer"
            title="Offline roaming mode. Changes saved to local queue."
          >
            <CloudOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Offline</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {/* State 4: Back Online with Pending Items Waiting to Sync */}
        {!isSyncing && !justSynced && isOnline && pendingCount > 0 && !attentionMessage && (
          <button
            type="button"
            onClick={handleManualSync}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-sm cursor-pointer group"
            title="Online with pending changes. Click to sync."
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-180 transition-transform" />
            <span>Sync {pendingCount} Pending</span>
          </button>
        )}
      </div>

      {/* Offline Queue Details Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl border border-amber-500/30 bg-slate-900/95 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2.5">
                {isOnline ? (
                  <Wifi className="w-5 h-5 text-emerald-400" />
                ) : (
                  <CloudOff className="w-5 h-5 text-amber-400" />
                )}
                <div>
                  <h3 className="text-base font-black text-white">
                    {isOnline ? 'Online Sync Queue' : 'Offline Roaming Storage'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isOnline ? 'Network connected' : 'No cellular/WiFi connection'} • {pendingCount} items queued
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When traveling through Polish tunnels or spots with zero cellular roaming, Wayfinder stores your checklist toggles, note edits, and expense entries in local IndexedDB with UUID idempotency keys. They replay automatically once reconnected.
            </p>

            {/* List of Queued Items */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {queuedItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 text-center text-xs text-slate-400">
                  Zero pending mutations. All traveler edits are synced with Cloudflare D1.
                </div>
              ) : (
                queuedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate flex items-center space-x-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono uppercase">
                          {item.method}
                        </span>
                        <span className="truncate">{item.action || item.url}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {item.entityType} • {new Date(item.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {item.attempts > 0 ? `Retry #${item.attempts}` : 'Pending'}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Idempotent X-Key replay
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-white text-xs"
                >
                  Close
                </button>
                {isOnline && pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
