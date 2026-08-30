import React from 'react';
import { computeFeeBreakdown } from '../../utils/feeEngine';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { MarginHealthBadge } from './MarginHealthBadge';
import { TrendingUp, ShieldAlert, DollarSign, Percent } from 'lucide-react';

export function FeeBreakdownPanel({ item, customPrice, compact = false }) {
  const priceToEvaluate = customPrice != null && customPrice !== '' ? Number(customPrice) : item.current_list_price || item.suggested_list_price || item.unit_price;
  const breakdown = computeFeeBreakdown({
    ...item,
    sellPrice: priceToEvaluate
  });

  const isProfitPositive = breakdown.netProfit >= 0;

  if (compact) {
    return (
      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400 font-medium">Profit & Margin Health</span>
          <MarginHealthBadge marginPct={breakdown.marginPct} netProfit={breakdown.netProfit} />
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Est Fees</span>
            <span className="text-xs font-semibold text-slate-300">{fmtCurrency(breakdown.totalFees)}</span>
          </div>
          <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Net Profit</span>
            <span className={`text-xs font-bold ${isProfitPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtCurrency(breakdown.netProfit)}
            </span>
          </div>
          <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 block">ROI</span>
            <span className="text-xs font-bold text-amber-400">
              {formatPercent(breakdown.roiPct, 1)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Fee & Margin Engine</span>
        </div>
        <MarginHealthBadge marginPct={breakdown.marginPct} netProfit={breakdown.netProfit} />
      </div>

      {/* Fee Itemization Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block font-medium">eBay Final Value</span>
          <span className="text-xs font-semibold text-slate-200">{fmtCurrency(breakdown.finalValueFee)}</span>
          <span className="text-[9px] text-slate-500 block">{(breakdown.platformFeePct * 100).toFixed(1)}% + $0.40</span>
        </div>

        <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block font-medium">Promoted Ad Fee</span>
          <span className="text-xs font-semibold text-slate-200">{fmtCurrency(breakdown.promotedFee)}</span>
          <span className="text-[9px] text-slate-500 block">{breakdown.promotedRate ? `${breakdown.promotedRate}% rate` : 'None'}</span>
        </div>

        <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block font-medium">Est Shipping</span>
          <span className="text-xs font-semibold text-slate-200">{fmtCurrency(breakdown.shippingCost)}</span>
          <span className="text-[9px] text-slate-500 block">Out of pocket</span>
        </div>

        <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
          <span className="text-[10px] text-slate-400 block font-medium">Total Deductions</span>
          <span className="text-xs font-bold text-amber-300">{fmtCurrency(breakdown.totalFees + breakdown.shippingCost)}</span>
          <span className="text-[9px] text-slate-500 block">Fees + Ship</span>
        </div>
      </div>

      {/* Net Summary Bar */}
      <div className="grid grid-cols-3 gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-center">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Net Proceeds</span>
          <span className="text-sm font-bold text-slate-100">{fmtCurrency(breakdown.netProceeds)}</span>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Net Profit</span>
          <span className={`text-sm font-black ${isProfitPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtCurrency(breakdown.netProfit)}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">ROI / Margin</span>
          <span className="text-sm font-bold text-amber-400">
            {formatPercent(breakdown.roiPct, 1)} <span className="text-xs font-normal text-slate-400">({formatPercent(breakdown.marginPct, 1)})</span>
          </span>
        </div>
      </div>

      {/* Floor Warning / Guidance */}
      <div className="flex items-center justify-between text-[11px] px-1 text-slate-400 pt-1">
        <span className="flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
          <span>Break-Even Floor: <strong className="text-cyan-300">{fmtCurrency(breakdown.breakEvenFloor)}</strong></span>
        </span>
        <span>
          Acquisition COGS: <strong className="text-slate-200">{fmtCurrency(breakdown.cogs)}</strong>
        </span>
      </div>
    </div>
  );
}
