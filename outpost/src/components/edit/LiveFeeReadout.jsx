import React from 'react';
import { DollarSign, ShieldAlert, TrendingUp, Percent, Truck } from 'lucide-react';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { MarginHealthBadge } from '../inventory/MarginHealthBadge';

export function LiveFeeReadout({ liveFees }) {
  if (!liveFees) return null;

  const isProfitPositive = liveFees.netProfit >= 0;
  const platformPctLabel = (liveFees.platformFeePct * 100).toFixed(1);
  const hasBuyerShipping = Number(liveFees.shippingCharged || 0) > 0;
  const hasPromotedAd = Number(liveFees.promotedRate || 0) > 0;

  return (
    <div className="rounded-2xl bg-slate-950/80 border border-slate-800/90 p-4 space-y-3.5 shadow-inner">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-bold text-white uppercase tracking-wider block">
              Real-Time Fee & Margin Engine
            </span>
            <span className="text-[10px] text-slate-400">
              {hasBuyerShipping
                ? `Gross Revenue: ${fmtCurrency(liveFees.grossRevenue)} (${fmtCurrency(liveFees.sellPrice)} Item + ${fmtCurrency(liveFees.shippingCharged)} Buyer Shipping)`
                : `Gross Revenue: ${fmtCurrency(liveFees.sellPrice)} (Free Shipping)`
              }
            </span>
          </div>
        </div>
        <MarginHealthBadge marginPct={liveFees.marginPct} netProfit={liveFees.netProfit} />
      </div>

      {/* Fee Itemization Breakdown Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">eBay Final Value</span>
          <span className="text-sm font-bold text-slate-200 block mt-0.5 font-mono">{fmtCurrency(liveFees.finalValueFee)}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {platformPctLabel}% on total + ${Number(liveFees.platformFlatFee).toFixed(2)}
          </span>
        </div>

        <div className={`p-2.5 rounded-xl border transition-all ${
          hasPromotedAd
            ? 'bg-amber-950/20 border-amber-500/30'
            : 'bg-slate-900/80 border-slate-800/80'
        }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Promoted Ad Fee</span>
          <span className={`text-sm font-bold block mt-0.5 font-mono ${hasPromotedAd ? 'text-amber-300' : 'text-slate-200'}`}>
            {fmtCurrency(liveFees.promotedFee)}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {hasPromotedAd ? `${liveFees.promotedRate}% of item price` : '0% (Standard Organic)'}
          </span>
        </div>

        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Shipping Net</span>
          <span className={`text-sm font-bold block mt-0.5 font-mono ${
            hasBuyerShipping && liveFees.shippingNet >= 0
              ? 'text-emerald-400'
              : liveFees.shippingCost > 0
              ? 'text-slate-200'
              : 'text-slate-400'
          }`}>
            {hasBuyerShipping
              ? `${liveFees.shippingNet >= 0 ? '+' : ''}${fmtCurrency(liveFees.shippingNet)}`
              : liveFees.shippingCost > 0
              ? `-${fmtCurrency(liveFees.shippingCost)}`
              : '$0.00'}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {hasBuyerShipping
              ? `+${fmtCurrency(liveFees.shippingCharged)} in / -${fmtCurrency(liveFees.shippingCost)} out`
              : liveFees.shippingCost > 0
              ? 'Free ship (Seller pays label)'
              : 'Free shipping'}
          </span>
        </div>

        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Deductions</span>
          <span className="text-sm font-black text-amber-300 block mt-0.5 font-mono">
            {fmtCurrency(liveFees.totalFees + liveFees.shippingCost)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Fees + Outbound Ship</span>
        </div>
      </div>

      {/* Net Summary Metrics Strip */}
      <div className="grid grid-cols-3 gap-2.5 bg-slate-900/90 p-3 rounded-xl border border-slate-800/90 text-center">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Net Proceeds</span>
          <span className="text-sm sm:text-base font-extrabold text-slate-100 block mt-0.5 font-mono">
            {fmtCurrency(liveFees.netProceeds)}
          </span>
          <span className="text-[10px] text-slate-500 block">Gross - Fees - Shipping</span>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Net Profit</span>
          <span className={`text-sm sm:text-base font-black block mt-0.5 font-mono ${isProfitPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfitPositive ? `+${fmtCurrency(liveFees.netProfit)}` : fmtCurrency(liveFees.netProfit)}
          </span>
          <span className="text-[10px] text-slate-500 block">Proceeds - COGS</span>
        </div>

        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">ROI / Margin</span>
          <span className="text-sm sm:text-base font-extrabold text-amber-400 block mt-0.5 font-mono">
            {formatPercent(liveFees.roiPct, 1)}
          </span>
          <span className="text-[10px] text-slate-400 block">
            Margin: {formatPercent(liveFees.marginPct, 1)}
          </span>
        </div>
      </div>

      {/* Floor & COGS Base Reference Footer */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-400 pt-0.5 flex-wrap gap-2">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span>
            Break-Even Floor: <strong className="text-cyan-300 font-mono">{fmtCurrency(liveFees.breakEvenFloor)}</strong>
          </span>
        </span>
        <span>
          Acquisition COGS: <strong className="text-slate-200 font-mono">{fmtCurrency(liveFees.cogs)}</strong>
        </span>
      </div>
    </div>
  );
}
