import React, { useState, useEffect } from 'react';
import {
  X, RefreshCw, CheckCircle2, AlertCircle, Loader2,
  DollarSign, ArrowRightLeft, Building2, Wallet, ExternalLink,
  ShieldCheck, Sparkles, TrendingUp
} from 'lucide-react';
import { getFinanceSyncMetrics, syncToFinance } from '../utils/auctionApi';
import { fmtCurrency } from '../utils/formulaPreview';

export function FinanceSyncModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetchMetrics();
  }, [isOpen]);

  const fetchMetrics = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await getFinanceSyncMetrics();
      setData(res);
      if (res.accounts && res.accounts.length > 0) {
        const outpostAcc = res.accounts.find(a => a.name.toLowerCase().includes('outpost') || a.name.toLowerCase().includes('auction'));
        setSelectedAccountId(outpostAcc ? outpostAcc.id : res.accounts[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load TechTrek Finance metrics.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');

    try {
      const hhId = data?.households?.[0]?.id || null;
      const res = await syncToFinance({
        accountId: selectedAccountId || undefined,
        householdId: hhId,
        accountName: 'TechTrek Outpost Proceeds'
      });

      if (res && res.success) {
        setSuccess(`Successfully synchronized ${fmtCurrency(res.synced_net_profit)} to your TechTrek Finance account!`);
        // Refresh metrics
        await fetchMetrics();
      } else {
        setError(res?.error || 'Synchronization failed.');
      }
    } catch (err) {
      setError(err.message || 'Synchronization failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const metrics = data?.metrics || {};
  const accounts = data?.accounts || [];
  const households = data?.households || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black">
              <ArrowRightLeft className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                TechTrek Finance Integration
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live D1 Bridge
                </span>
              </h2>
              <p className="text-xs text-slate-400">Sync realized auction net profits to your household budget</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-2" />
              <p className="text-xs">Connecting to TechTrek Finance D1 Database...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs flex gap-2 items-center">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* Financial Snapshot Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Realized Net Profit</p>
                  <p className="text-lg font-black text-emerald-400 mt-0.5">{fmtCurrency(metrics.total_realized_profit)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{metrics.total_sales_count || 0} completed sales</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Gross Volume</p>
                  <p className="text-lg font-black text-slate-200 mt-0.5">{fmtCurrency(metrics.total_gross_revenue)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Net: {fmtCurrency(metrics.total_net_proceeds)}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Active Capital</p>
                  <p className="text-lg font-black text-amber-400 mt-0.5">{fmtCurrency(metrics.capital_tied_up)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{metrics.active_item_count || 0} items in stock</p>
                </div>
              </div>

              {/* Destination Account Selection */}
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    Target Finance Account
                  </label>
                  {households.length > 0 && (
                    <span className="text-[10px] text-slate-500">
                      Household: <strong className="text-slate-300">{households[0].name}</strong>
                    </span>
                  )}
                </div>

                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  className="input-field py-2 text-xs w-full"
                >
                  <option value="">-- Auto-Create / Update "TechTrek Outpost Proceeds" --</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type}) - Current: {fmtCurrency(acc.starting_balance)}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Syncing updates the starting balance of the selected TechTrek Finance account to match your cumulative realized net profit (${metrics.total_realized_profit?.toFixed(2) || '0.00'}).
                </p>
              </div>

              {/* Quick Actions & Links */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <a
                  href="https://techtrekgt.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
                >
                  Open TechTrek Finance ↗
                </a>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-5 py-2 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                        <span>Synchronizing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                        <span>Sync with Finance</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
