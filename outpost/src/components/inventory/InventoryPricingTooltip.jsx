import React from 'react';
import { fmtCurrency } from '../../utils/formulaPreview';
import { getItemFloorMetrics } from '../../utils/pricingMetrics';

export { getItemFloorMetrics };

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
  if (!m) return null;

  const hasPrice = m.hasPrice;
  const profitTone = hasPrice ? (m.trueNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400';

  const above = rect.top - 10 > 380;
  const isLeft = rect.left < 400;
  const leftPos = isLeft
    ? Math.min(window.innerWidth - 340, Math.max(10, rect.right + 10))
    : Math.min(window.innerWidth - 340, Math.max(10, rect.right - 320));

  const style = {
    top: above ? Math.max(10, rect.top - 8) : Math.max(10, Math.min(window.innerHeight - 400, rect.bottom + 8)),
    left: leftPos,
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
          <Row label="Current List Price:" value={hasPrice ? fmtCurrency(m.listPrice) : '--'} tone="text-slate-100 font-bold" />
          <Row
            label={`Platform Fees (${(m.platformFeePct * 100).toFixed(2)}%${m.platformFlatFee > 0 ? ' + flat' : ''}):`}
            value={hasPrice ? `-${fmtCurrency(m.platformFees)}` : '--'}
            tone="text-red-300"
            labelTone="text-red-300"
          />
          <Row
            label={`Promoted Ad Fees (${(m.adFeePct * 100).toFixed(1)}%):`}
            value={hasPrice ? (m.adFees > 0 ? `-${fmtCurrency(m.adFees)}` : fmtCurrency(0)) : '--'}
            tone={m.adFees > 0 ? 'text-red-300' : 'text-slate-500'}
            labelTone={m.adFees > 0 ? 'text-red-300' : 'text-slate-500'}
          />
          <div className="flex justify-between gap-3 border-t border-slate-800/80 pt-1 font-bold">
            <span className={profitTone}>True Net Profit:</span>
            <span className={`${profitTone} tabular-nums`}>
              {hasPrice ? `${m.trueNetProfit >= 0 ? '+' : ''}${fmtCurrency(m.trueNetProfit)}` : '--'}
            </span>
          </div>
          <Row label="Margin %:" value={hasPrice ? `${m.marginPct.toFixed(1)}%` : '--'} tone={profitTone} />
          <Row label="ROI %:" value={hasPrice ? `${m.roiPct.toFixed(1)}%` : '--'} tone={profitTone} />
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
          <Row label="Break-even Floor Price:" value={m.breakEvenFloor > 0 ? fmtCurrency(m.breakEvenFloor) : '--'} tone="text-cyan-300 font-bold" />
          <Row
            label={`Min Target Margin Floor (${(m.targetMarginPct * 100).toFixed(0)}%):`}
            value={m.targetMarginFloor > 0 ? fmtCurrency(m.targetMarginFloor) : '--'}
            tone="text-blue-300 font-bold"
          />
        </div>
      </div>
    </div>
  );
}
