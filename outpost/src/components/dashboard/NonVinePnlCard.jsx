import React, { useState, useEffect, useRef } from 'react';
import {
  Receipt, TrendingUp, Scale, ShieldOff, Loader2, AlertCircle
} from 'lucide-react';
import { getNonVinePnl } from '../../utils/auctionApi';
import { fmtCurrency } from '../../utils/formulaPreview';

const RANGE_OPTIONS = [
  { id: 'all', label: 'All Time' },
  { id: 'ytd', label: 'YTD' },
  { id: '90d', label: '90d' },
  { id: '30d', label: '30d' }
];

export function NonVinePnlCard({ initialSummary = null }) {
  const [range, setRange] = useState('all');
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    if (range === 'all' && initialSummary) {
      setSummary(initialSummary);
    }
  }, [initialSummary, range]);

  const handleRangeChange = async (nextRange) => {
    setRange(nextRange);
    if (nextRange === 'all' && initialSummary) {
      fetchRequestIdRef.current++;
      setSummary(initialSummary);
      setError('');
      setLoading(false);
      return;
    }

    const reqId = ++fetchRequestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await getNonVinePnl(nextRange);
      if (reqId === fetchRequestIdRef.current && res?.summary) {
        setSummary(res.summary);
      }
    } catch (err) {
      if (reqId === fetchRequestIdRef.current) {
        setError(err.message || 'Failed to load non-Vine P&L breakdown.');
      }
    } finally {
      if (reqId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  if (!summary && !loading && !error) return null;

  const data = summary || {};
  const totalSpend = Number(data.total_non_vine_spend) || 0;
  const netPayouts = Number(data.net_payouts) || 0;
  const netStanding = Number(data.net_cash_standing) || 0;
  const isAhead = netStanding >= 0;
  const recoveryPct = Number(data.cost_recovery_pct) || 0;
  const clampedBarPct = Math.max(0, Math.min(100, recoveryPct));
  const excludedVineCount = Number(data.excluded_vine_items) || 0;

  return (
    <div className="glass-card rounded-2xl p-5 border border-amber-500/20 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Scale className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                Non-Vine Invoice Spend vs. Sold Net Standing
              </h3>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/25"
                title="Amazon VineScout items are excluded from invoice spend and sold comparisons here"
              >
                <ShieldOff className="w-3 h-3" />
                <span>{excludedVineCount} VineScout excluded</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Cash-basis comparison of paid invoice acquisitions against realized non-Vine net payouts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />}
          <div className="flex items-center bg-slate-950/90 p-0.5 rounded-lg border border-slate-800 text-[11px]">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleRangeChange(opt.id)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  range === opt.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Non-Vine Invoice Spend */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Non-Vine Invoice Cost
            </span>
            <Receipt className="w-3.5 h-3.5 text-amber-400/80" />
          </div>
          <p className="text-xl font-black font-mono text-white">
            {fmtCurrency(totalSpend)}
          </p>
          <p className="text-[11px] text-slate-400">
            <strong className="text-slate-200">{data.non_vine_item_count || 0}</strong> items across{' '}
            <strong className="text-slate-200">{data.non_vine_invoice_count || 0}</strong> invoices
          </p>
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-400">
            <span>Sold COGS: <strong className="text-slate-200 font-mono">{fmtCurrency(data.sold_non_vine_cogs || 0)}</strong></span>
            <span>Active Stock: <strong className="text-blue-300 font-mono">{fmtCurrency(data.active_non_vine_capital || 0)}</strong></span>
          </div>
        </div>

        {/* 2. Non-Vine Sold Net Payouts */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Non-Vine Sold Net Payouts
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400/80" />
          </div>
          <p className="text-xl font-black font-mono text-cyan-300">
            {fmtCurrency(netPayouts)}
          </p>
          <p className="text-[11px] text-slate-400">
            <strong className="text-slate-200">{data.sold_count || 0}</strong> sold · Gross{' '}
            <strong className="text-slate-200 font-mono">{fmtCurrency(data.gross_sales || 0)}</strong>
          </p>
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-400">
            <span>Fees/Labels: <strong className="text-rose-300 font-mono">-{fmtCurrency(data.total_fees_and_shipping || 0)}</strong></span>
            <span>Sold Profit: <strong className="text-emerald-400 font-mono">{fmtCurrency(data.realized_sold_profit || 0)}</strong></span>
          </div>
        </div>

        {/* 3. Current Net Standing */}
        <div className={`p-4 rounded-xl border space-y-2 ${
          isAhead
            ? 'bg-emerald-950/20 border-emerald-500/30'
            : 'bg-amber-950/15 border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              isAhead ? 'text-emerald-400' : 'text-amber-300'
            }`}>
              Current Net Standing
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border ${
              isAhead
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              {isAhead ? 'Net Ahead' : 'Recouping Cost'}
            </span>
          </div>
          <p className={`text-xl font-black font-mono ${
            isAhead ? 'text-emerald-400' : 'text-amber-300'
          }`}>
            {netStanding >= 0 ? '+' : '-'}{fmtCurrency(Math.abs(netStanding))}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10.5px] text-slate-300">
              <span>Invoice Cost Recovered</span>
              <span className="font-mono font-bold">{recoveryPct.toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                style={{ width: `${clampedBarPct}%` }}
                className={`h-full rounded-full transition-all ${
                  isAhead
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
                    : 'bg-gradient-to-r from-amber-500 to-amber-300'
                }`}
              />
            </div>
          </div>
          <p className="text-[10.5px] text-slate-400 pt-0.5">
            {isAhead
              ? `All non-Vine invoice costs covered, plus ${fmtCurrency(data.active_non_vine_capital || 0)} active stock remaining.`
              : `${fmtCurrency(Math.abs(netStanding))} needed in payouts to cover 100% of non-Vine invoice spend.`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default NonVinePnlCard;
