// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useBudgetMetadata, useLedgerDataDispatch } from '../../../context/BudgetContext';
import { 
  HardDrive, 
  RotateCcw, 
  Trash2, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle,
  FileSpreadsheet,
  Database,
  RefreshCw,
  Server
} from 'lucide-react';
import { saveBudgetData } from '../../../utils/indexedDB';

export function StorageResetSubPanel() {
  const { budget } = useBudgetMetadata();
  const {
    resetToDefaults,
    clearAllData,
    loadDemoPreset,
  } = useLedgerDataDispatch();

  // Storage Quota State
  const [storageEstimate, setStorageEstimate] = useState(null);
  const [isFlushingCache, setIsFlushingCache] = useState(false);
  const [flushStatus, setFlushStatus] = useState(null);

  // Danger zone confirmations
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false);

  // Query browser storage estimate
  const checkStorageQuota = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorageEstimate(estimate);
      }
    } catch (err) {
      console.warn('Storage estimate failed:', err);
    }
  };

  useEffect(() => {
    checkStorageQuota();
  }, []);

  const handleFlushCache = async () => {
    setIsFlushingCache(true);
    setFlushStatus(null);
    try {
      await saveBudgetData(budget);
      await checkStorageQuota();
      setFlushStatus({ type: 'success', message: 'Current budget state committed directly to IndexedDB disk storage.' });
    } catch (err) {
      setFlushStatus({ type: 'error', message: `Disk flush failed: ${err.message}` });
    } finally {
      setIsFlushingCache(false);
    }
  };

  // Helper to format bytes
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const usagePercent = (storageEstimate?.usage && storageEstimate?.quota)
    ? Math.min(100, Math.max(0.01, (storageEstimate.usage / storageEstimate.quota) * 100))
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Local-First Architecture & Security Origin Sandbox Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/50 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">100% Local-First Architecture</h3>
              <p className="text-xs text-slate-400">Strict Browser Origin Sandboxing and Zero Cloud Footprint</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>IndexedDB Engine Active</span>
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          All financial data (accounts, earners, bills, transactions, loan schedules) is saved entirely within your browser&apos;s native IndexedDB database. Data remains isolated on your device and is never transmitted to external cloud servers unless you explicitly sync with Cloudflare D1.
        </p>
      </div>

      {/* Database Record Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-center hover:border-slate-700 transition-colors">
          <div className="text-2xl font-mono font-bold text-blue-400">{budget.accounts?.length || 0}</div>
          <div className="text-xs text-slate-400 font-medium mt-1">Bank Accounts</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-center hover:border-slate-700 transition-colors">
          <div className="text-2xl font-mono font-bold text-purple-400">{budget.people?.length || 0}</div>
          <div className="text-xs text-slate-400 font-medium mt-1">Household Earners</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-center hover:border-slate-700 transition-colors">
          <div className="text-2xl font-mono font-bold text-emerald-400">{budget.bills?.length || 0}</div>
          <div className="text-xs text-slate-400 font-medium mt-1">Recurring Bills</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-center hover:border-slate-700 transition-colors">
          <div className="text-2xl font-mono font-bold text-amber-400">{budget.lineItems?.length || 0}</div>
          <div className="text-xs text-slate-400 font-medium mt-1">Ledger Entries</div>
        </div>
      </div>

      {/* Browser Storage Quota & Local Persistence Engine */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800 bg-slate-900/60 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <HardDrive className="w-5 h-5" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-100">Browser Storage Quota and Cache Health</h4>
              <p className="text-xs text-slate-400">IndexedDB database storage allocation on this machine.</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isFlushingCache}
            onClick={handleFlushCache}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isFlushingCache ? 'animate-spin' : ''}`} />
            <span>{isFlushingCache ? 'Flushing...' : 'Flush Cache to Disk'}</span>
          </button>
        </div>

        {storageEstimate ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">
                Used: <strong className="text-slate-200">{formatBytes(storageEstimate.usage)}</strong> of <span className="text-slate-400">{formatBytes(storageEstimate.quota)}</span>
              </span>
              <span className="text-blue-400 font-bold">
                {usagePercent !== null ? `${usagePercent.toFixed(3)}% Allocated` : 'N/A'}
              </span>
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(1, usagePercent || 1)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Storage estimate is being computed by the browser storage manager...
          </p>
        )}

        {flushStatus && (
          <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between animate-fade-in ${
            flushStatus.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/80 border border-rose-800 text-rose-300'
          }`}>
            <span>{flushStatus.message}</span>
            <button onClick={() => setFlushStatus(null)} className="text-slate-400 hover:text-white font-bold ml-4 text-xs cursor-pointer">✕</button>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Danger Zone</h3>
        </div>

        {/* Clear All Data */}
        <div className="p-5 rounded-xl glass-card border border-rose-800/60 bg-rose-950/10 space-y-4 hover:border-rose-700/80 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Clear All Budget Data (Clean Slate)
            </h3>
            <span className="text-[10px] font-mono text-rose-400 bg-rose-950 px-2.5 py-1 rounded-full border border-rose-800">
              Empty Household
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Deletes all accounts, earners, recurring bills, monthly line items, and loan schedules. This will wipe your active budget and leave a completely empty household dashboard.
          </p>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <div className="text-xs text-slate-400 font-mono">
              Will remove {budget.accounts?.length || 0} accounts, {budget.bills?.length || 0} bills, {budget.people?.length || 0} earners
            </div>

            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-medium">Are you sure?</span>
                <button
                  type="button"
                  onClick={() => {
                    clearAllData();
                    setConfirmClearAll(false);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Yes, Delete Everything
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="px-5 py-2.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Load Demo Dataset */}
        <div className="p-5 rounded-xl glass-card border border-indigo-800/60 bg-indigo-950/10 space-y-4 hover:border-indigo-700/80 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
              Load 100% Fake Demo Dataset
            </h3>
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-2.5 py-1 rounded-full border border-indigo-800">
              Full Demo Household
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Populates a full demonstration household with 100% fictional data: 2 earners (Alex and Taylor), 3 mock accounts (Apex Checking, Emergency Savings, Sapphire Credit), recurring rent/utility bills, custom split allocations, and a mortgage loan schedule.
          </p>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <div className="text-xs text-slate-400 font-mono">
              Includes 3 demo accounts, 6 sample bills, 2 earners, and 1 mortgage schedule
            </div>

            {confirmLoadDemo ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-indigo-400 font-medium">Load fake demo data?</span>
                <button
                  type="button"
                  onClick={() => {
                    loadDemoPreset();
                    setConfirmLoadDemo(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Yes, Load Fake Demo Data
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLoadDemo(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLoadDemo(true)}
                className="px-5 py-2.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Load Fake Demo Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Reset to Empty Starter */}
        <div className="p-5 rounded-xl glass-card border border-amber-800/60 bg-amber-950/10 space-y-4 hover:border-amber-700/80 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-400" />
              Reset to Empty Starter Template
            </h3>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-950 px-2.5 py-1 rounded-full border border-amber-800">
              Blank Starter
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Resets to a clean starter template with zero pre-filled balances or bills.
          </p>

          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <div className="text-xs text-slate-400">
              Resets active household to empty defaults.
            </div>

            {confirmResetDefaults ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400 font-medium">Replace current data?</span>
                <button
                  type="button"
                  onClick={() => {
                    resetToDefaults();
                    setConfirmResetDefaults(false);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Yes, Restore Blank Template
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetDefaults(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetDefaults(true)}
                className="px-5 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset to Empty Starter</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
