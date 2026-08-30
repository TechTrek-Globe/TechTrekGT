import React from 'react';
import { DollarSign, Percent, TrendingUp, ShieldCheck, Zap, ArrowRight, ShieldAlert } from 'lucide-react';
import { LiveFeeReadout } from './LiveFeeReadout';
import { computeTargetPriceFromMargin } from '../../utils/feeEngine';
import { fmtCurrency } from '../../utils/formulaPreview';

export function EditTabPricing({ form, updateField, liveFees }) {
  // Compute suggested target price using target margin
  const cogs = parseFloat(form.true_total_cost) || parseFloat(form.unit_price) || 0;
  const targetMarginPct = (parseFloat(form.target_margin_pct) || 30) / 100;
  const platformFeePct = (parseFloat(form.platform_fee_pct) || 13.5) / 100;
  const promotedRate = parseFloat(form.ebay_promoted_rate) || 0;
  const shippingCost = parseFloat(form.est_shipping_cost) || 0;
  const flatFee = parseFloat(form.platform_flat_fee) || 0.40;

  const targetAskingPrice = computeTargetPriceFromMargin(
    cogs,
    targetMarginPct,
    platformFeePct,
    promotedRate,
    shippingCost,
    flatFee
  );

  return (
    <div className="space-y-4">
      {/* Primary Asking & Target Price Grid */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Pricing Strategy</span>
          </div>
          {targetAskingPrice > 0 && (
            <button
              type="button"
              onClick={() => updateField('current_list_price', targetAskingPrice.toFixed(2))}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all hover:bg-amber-500/20"
              title="Apply computed target price to active asking price"
            >
              <Zap className="w-3 h-3" />
              <span>Apply Target ({fmtCurrency(targetAskingPrice)})</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Active Asking Price ($)</span>
              <span className="text-[10px] text-amber-400 font-semibold">Primary</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.current_list_price || ''}
                onChange={e => updateField('current_list_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-emerald-300 font-black bg-slate-950 border-emerald-500/40"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Buy-It-Now Target ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.buy_it_now_price || ''}
                onChange={e => updateField('buy_it_now_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-amber-300 font-bold bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Hard Floor Price ($)</span>
              <span className="text-[10px] text-red-400 font-normal">Min Accepted</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.floor_price || ''}
                onChange={e => updateField('floor_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-cyan-300 font-bold bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Target Margins, Ad Rates & Shipping Costs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Target Profit Margin (%)</span>
            <span className="text-[10px] text-slate-400 font-mono">{form.target_margin_pct || '30'}%</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="1"
              value={form.target_margin_pct || ''}
              onChange={e => updateField('target_margin_pct', e.target.value)}
              className="input-field text-xs pr-8 font-mono text-blue-300 font-bold"
              placeholder="30"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Promoted Listing Ad Rate (%)</span>
            <span className="text-[10px] text-slate-400 font-mono">{form.ebay_promoted_rate || '0'}%</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.5"
              value={form.ebay_promoted_rate || ''}
              onChange={e => updateField('ebay_promoted_rate', e.target.value)}
              className="input-field text-xs pr-8 font-mono text-amber-300 font-bold"
              placeholder="0.0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Est. Outbound Shipping ($)</span>
            <span className="text-[10px] text-slate-400 font-normal">Seller cost</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
            <input
              type="number"
              step="0.50"
              value={form.est_shipping_cost || ''}
              onChange={e => updateField('est_shipping_cost', e.target.value)}
              className="input-field text-xs pl-8 font-mono text-slate-200"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Platform Fee Overrides (eBay 13.5% + $0.40) */}
      <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <span>Platform Fee Structure</span>
            <span className="text-[10px] text-slate-400 font-mono font-normal">({form.platform || 'eBay'})</span>
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {form.platform_fee_pct || '13.5'}% + ${Number(form.platform_flat_fee || 0.40).toFixed(2)} / order
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Platform Fee Percentage Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.05"
                value={form.platform_fee_pct || ''}
                onChange={e => updateField('platform_fee_pct', e.target.value)}
                className="input-field text-xs pr-8 font-mono"
                placeholder="13.5"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Platform Per-Order Flat Fee ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.05"
                value={form.platform_flat_fee || ''}
                onChange={e => updateField('platform_flat_fee', e.target.value)}
                className="input-field text-xs pl-8 font-mono"
                placeholder="0.40"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Live Fee Engine Readout */}
      <LiveFeeReadout liveFees={liveFees} />
    </div>
  );
}
