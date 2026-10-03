import React from 'react';
import { fmtCurrency } from '../../utils/formulaPreview';
import { computeFeeBreakdown, computeTargetPriceFromMargin } from '../../utils/feeEngine';
import { DEFAULT_TARGET_MARGIN_PCT } from '../../../functions/utils/constants.js';

export function getItemFloorMetrics(item) {
  const feeData = computeFeeBreakdown(item);
  const trueCost = Number(item.true_total_cost) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const proratedShip = Number(item.prorated_shipping || 0);
  const proratedTax = Number(item.prorated_tax || 0);
  const proratedDiscount = Number(item.prorated_discount || 0);
  const hasProration = proratedShip > 0 || proratedTax > 0 || proratedDiscount > 0;
  const acquisition = unitPrice > 0
    ? unitPrice
    : (hasProration ? Math.max(0, trueCost - proratedShip - proratedTax + proratedDiscount) : trueCost);

  const breakEven = Number(item.floor_price || item.min_sell_price || feeData.breakEvenFloor || 0);
  const targetRaw = Number(item.target_margin_pct) || DEFAULT_TARGET_MARGIN_PCT;
  const targetDecimal = targetRaw > 1 ? targetRaw / 100 : targetRaw;
  const targetFloor = computeTargetPriceFromMargin(
    feeData.cogs,
    targetDecimal,
    feeData.platformFeePct,
    feeData.promotedDecimal,
    feeData.shippingCost,
    feeData.platformFlatFee,
    feeData.shippingCharged
  );

  return {
    feeData,
    landed: trueCost || feeData.cogs,
    acquisition,
    proratedShip,
    breakEven,
    targetDecimal,
    targetFloor
  };
}

function Row({ label, value, tone = 'text-slate-200', labelTone = 'text-slate-400' }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={labelTone}>{label}</span>
      <span className={`${tone} tabular-nums`}>{value}</span>
    </div>
  );
}

export function InventoryPricingTooltip({ item, rect }) {
  const m = getItemFloorMetrics(item);
  const f = m.feeData;
  const hasPrice = f.sellPrice > 0;
  const profitTone = f.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400';
  const flatAndFva = f.finalValueFee + f.platformFlatFee;

  const above = rect.top - 10 > 380;
  const style = {
    top: above ? rect.top - 8 : Math.max(10, Math.min(window.innerHeight - 400, rect.bottom + 8)),
    left: Math.min(window.innerWidth - 340, Math.max(10, rect.right - 320)),
    transform: above ? 'translateY(-100%)' : 'none'
  };

  return (
    <div
      className="fixed z-50 w-80 rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
      style={style}
    >
      <div className="px-3 py-2 border-b border-slate-800 bg-amber-500/[0.06]">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-amber-300">List Price Breakdown</span>
          <span className="text-[10px] text-slate-400 font-mono">{item.status || 'Active'}</span>
        </div>
        <div className="space-y-1 mt-1.5 text-[10.5px] font-mono">
          <Row label="Current List Price:" value={hasPrice ? fmtCurrency(f.sellPrice) : '--'} tone="text-slate-100 font-bold" />
          <Row
            label={`Platform Fees (${(f.platformFeePct * 100).toFixed(2)}%${f.platformFlatFee > 0 ? ' + flat' : ''}):`}
            value={`-${fmtCurrency(flatAndFva)}`}
            tone="text-red-300"
            labelTone="text-red-300"
          />
          <Row
            label={`Promoted Ad Fees (${(f.promotedDecimal * 100).toFixed(1)}%):`}
            value={f.promotedFee > 0 ? `-${fmtCurrency(f.promotedFee)}` : fmtCurrency(0)}
            tone={f.promotedFee > 0 ? 'text-red-300' : 'text-slate-500'}
            labelTone={f.promotedFee > 0 ? 'text-red-300' : 'text-slate-500'}
          />
          <div className="flex justify-between gap-3 border-t border-slate-800/80 pt-1 font-bold">
            <span className={profitTone}>Projected Net Profit:</span>
            <span className={`${profitTone} tabular-nums`}>{f.netProfit >= 0 ? '+' : ''}{fmtCurrency(f.netProfit)}</span>
          </div>
          <Row label="Margin %:" value={`${(f.marginPct * 100).toFixed(1)}%`} tone={profitTone} />
          <Row label="ROI:" value={`${(f.roiPct * 100).toFixed(1)}%`} tone={profitTone} />
        </div>
      </div>

      <div className="px-3 py-2 bg-cyan-500/[0.04]">
        <div className="text-[11px] font-bold text-cyan-300">Landed & Floor Cost Metrics</div>
        <div className="space-y-1 mt-1.5 text-[10.5px] font-mono">
          <Row label="Item Acquisition (COGS):" value={fmtCurrency(m.acquisition)} />
          <Row label="Inbound Shipping:" value={m.proratedShip > 0 ? `+${fmtCurrency(m.proratedShip)}` : fmtCurrency(0)} tone={m.proratedShip > 0 ? 'text-slate-200' : 'text-slate-500'} />
          <Row label="Prep / Packaging:" value="N/A" tone="text-slate-500" labelTone="text-slate-500" />
          <div className="flex justify-between gap-3 border-t border-slate-800/80 pt-1 font-bold text-amber-300">
            <span>Total Landed Cost:</span>
            <span className="tabular-nums">{fmtCurrency(m.landed)}</span>
          </div>
          <Row label="Break-even Floor Price:" value={fmtCurrency(m.breakEven)} tone="text-cyan-300 font-bold" />
          <Row
            label={`Min Target Margin Floor (${(m.targetDecimal * 100).toFixed(0)}%):`}
            value={m.targetFloor > 0 ? fmtCurrency(m.targetFloor) : '--'}
            tone="text-blue-300 font-bold"
          />
        </div>
      </div>
    </div>
  );
}
