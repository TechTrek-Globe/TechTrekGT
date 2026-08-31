import React, { useState } from 'react';
import { DollarSign, ShieldAlert, TrendingUp, Percent, Truck, Info, HelpCircle, X } from 'lucide-react';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { MarginHealthBadge } from '../inventory/MarginHealthBadge';

export function LiveFeeReadout({ liveFees }) {
  const [showFloorTooltip, setShowFloorTooltip] = useState(false);

  if (!liveFees) return null;

  const isProfitPositive = liveFees.netProfit >= 0;
  const platformPctLabel = (liveFees.platformFeePct * 100).toFixed(1);
  const hasBuyerShipping = Number(liveFees.shippingCharged || 0) > 0;
  const hasPromotedAd = Number(liveFees.promotedRate || 0) > 0;

  // Break-even step calculation variables
  const platformFeePct = liveFees.platformFeePct || 0;
  const paymentProcessingPct = 0; // standard eBay FVF includes processing
  const totalVariableRate = platformFeePct + (liveFees.promotedDecimal || 0) + paymentProcessingPct;
  const retentionDivisor = Math.max(0.01, 1 - totalVariableRate);
  
  // Shipping revenue kept after platform fees are applied to the buyer's shipping charge
  const shippingRevenueKept = (liveFees.shippingCharged || 0) * (1 - (platformFeePct + paymentProcessingPct));
  
  // Total fixed costs to cover minus the shipping revenue we keep
  const fixedCostNumerator = (liveFees.cogs || 0) + (liveFees.shippingCost || 0) + (liveFees.platformFlatFee || 0) - shippingRevenueKept;

  return (
    <div className="rounded-2xl bg-slate-950/80 border border-slate-800/90 p-4 space-y-3.5 shadow-inner relative">
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFloorTooltip(!showFloorTooltip)}
            onMouseEnter={() => setShowFloorTooltip(true)}
            onMouseLeave={() => setShowFloorTooltip(false)}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer group"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
            <span>
              Break-Even Floor: <strong className="text-cyan-300 font-mono underline decoration-dotted decoration-cyan-400/50 underline-offset-2">{fmtCurrency(liveFees.breakEvenFloor)}</strong>
            </span>
            <Info className="w-3 h-3 text-cyan-400/70 group-hover:text-cyan-300" />
          </button>

          {/* Interactive Break-Even Floor Calculation Tooltip Popover */}
          {showFloorTooltip && (
            <div
              className="absolute left-0 bottom-full mb-2 w-80 sm:w-96 p-4 rounded-xl bg-slate-900 border border-cyan-500/40 shadow-2xl z-50 text-xs text-slate-300 space-y-2.5 backdrop-blur-md pointer-events-auto"
              onMouseEnter={() => setShowFloorTooltip(true)}
              onMouseLeave={() => setShowFloorTooltip(false)}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                  Break-Even Floor Calculation
                </span>
                <span className="text-cyan-300 font-mono font-bold">{fmtCurrency(liveFees.breakEvenFloor)}</span>
              </div>

              <div className="space-y-1.5 text-[11px] font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                <div className="text-slate-400 font-sans text-[10px] uppercase font-bold tracking-wider mb-1">Formula:</div>
                <div className="text-amber-300 font-bold">
                  Floor = (COGS + Label + Flat Fee - Net Ship Rev) ÷ (1 - Variable Rate)
                </div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-slate-400">1. Acquisition COGS:</span>
                  <span className="font-mono text-slate-200 font-bold">{fmtCurrency(liveFees.cogs)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-slate-400">2. Shipping Label Cost:</span>
                  <span className="font-mono text-slate-200">+{fmtCurrency(liveFees.shippingCost || 0)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-slate-400">3. Platform Flat Fee:</span>
                  <span className="font-mono text-slate-200">+{fmtCurrency(liveFees.platformFlatFee)}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-800/60">
                  <span className="text-emerald-400/80">4. Net Shipping Revenue:</span>
                  <div className="text-right">
                    <span className="font-mono text-emerald-300">-{fmtCurrency(shippingRevenueKept)}</span>
                    <span className="text-[9px] text-slate-500 block leading-tight">
                      (${Number(liveFees.shippingCharged || 0).toFixed(2)} paid - {(platformFeePct * 100).toFixed(1)}% fee)
                    </span>
                  </div>
                </div>
                <div className="flex justify-between py-0.5 font-semibold text-slate-200">
                  <span className="text-cyan-300">Total Fixed Costs (Numerator):</span>
                  <span className="font-mono text-cyan-300 font-bold">{fmtCurrency(fixedCostNumerator)}</span>
                </div>
              </div>

              <div className="space-y-1 text-[11px] pt-1 border-t border-slate-800">
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-400">Platform Fee % ({platformPctLabel}%):</span>
                  <span className="font-mono text-slate-200">{(liveFees.platformFeePct * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-400">Promoted Listing Ad Rate:</span>
                  <span className="font-mono text-amber-300 font-bold">{(liveFees.promotedRate || 0).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between py-0.5 font-semibold text-slate-200">
                  <span className="text-amber-400">Total Variable Fee Rate:</span>
                  <span className="font-mono text-amber-400 font-bold">{(totalVariableRate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between py-0.5 text-slate-300">
                  <span className="text-slate-400">Net Retention Divisor (1 - Rate):</span>
                  <span className="font-mono text-white font-bold">{retentionDivisor.toFixed(4)}</span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-[10px] text-cyan-200 font-sans">
                <strong>Result:</strong> Selling at <strong>{fmtCurrency(liveFees.breakEvenFloor)}</strong> covers all fees (${fmtCurrency(liveFees.finalValueFee)} eBay + ${fmtCurrency(liveFees.promotedFee)} Ad Fee + ${fmtCurrency(liveFees.platformFlatFee)} Flat), shipping label (${fmtCurrency(liveFees.shippingCost)}), and COGS (${fmtCurrency(liveFees.cogs)}), leaving exactly $0.00 profit.
              </div>
            </div>
          )}
        </div>

        <span>
          Acquisition COGS: <strong className="text-slate-200 font-mono">{fmtCurrency(liveFees.cogs)}</strong>
        </span>
      </div>
    </div>
  );
}
