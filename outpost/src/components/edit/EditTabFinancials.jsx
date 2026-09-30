import React, { useState } from 'react';
import {
  DollarSign, TrendingUp, ShieldAlert, Sparkles, ExternalLink,
  CheckCircle2, Receipt, Tag, Percent, Calculator,
  Zap, ChevronDown, ChevronUp, ArrowUpRight
} from 'lucide-react';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { computeTargetPriceFromMargin } from '../../utils/feeEngine';
import { DEFAULT_PLATFORM_FEE_PCT, DEFAULT_PLATFORM_FLAT_FEE } from '../../../functions/utils/constants.js';
import { MarginHealthBadge } from '../inventory/MarginHealthBadge';

export function EditTabFinancials({
  form,
  updateField,
  item,
  liveFees,
  compsDraft
}) {
  const [showFormulas, setShowFormulas] = useState(false);
  const [appliedSuggested, setAppliedSuggested] = useState(false);

  // Derived financial variables
  const sellPrice = parseFloat(form.current_list_price) || 0;
  const shippingCharged = parseFloat(form.buyer_shipping_cost) || 0;
  const isFreeShipping = shippingCharged === 0;

  // Landed Cost (COGS) details
  const basePrice = parseFloat(form.unit_price) || parseFloat(item?.unit_price) || 0;
  const proratedShipping = parseFloat(item?.prorated_shipping) || 0;
  const proratedTax = parseFloat(item?.prorated_tax) || 0;
  const proratedDiscount = parseFloat(item?.prorated_discount) || 0;
  const landedCost = parseFloat(form.true_total_cost) || parseFloat(item?.true_total_cost) || (basePrice + proratedShipping + proratedTax - proratedDiscount);
  const prorationWeight = item?.proration_weight != null ? (Number(item.proration_weight) * 100).toFixed(1) : null;

  // Outbound fulfillment & platform assumptions
  const estShippingCost = parseFloat(form.est_shipping_cost) || 0;
  const targetMarginPct = (parseFloat(form.target_margin_pct) || 15) / 100;
  const platformFeePct = (parseFloat(form.platform_fee_pct) || DEFAULT_PLATFORM_FEE_PCT * 100) / 100;
  const promotedRate = parseFloat(form.ebay_promoted_rate) || 0;
  const platformFlatFee = parseFloat(form.platform_flat_fee) || 0.40;

  // Floor Price (Break-Even)
  const breakEvenFloor = liveFees?.breakEvenFloor || parseFloat(form.floor_price) || parseFloat(item?.min_sell_price) || 0;
  const floorSpread = sellPrice > 0 && breakEvenFloor > 0 ? sellPrice - breakEvenFloor : null;
  const floorSpreadPct = breakEvenFloor > 0 && floorSpread != null ? (floorSpread / breakEvenFloor) : null;

  // Suggested Target Pricing (Cost-Plus Model)
  const targetAskingPrice = computeTargetPriceFromMargin(
    landedCost,
    targetMarginPct,
    platformFeePct,
    promotedRate,
    estShippingCost,
    platformFlatFee,
    shippingCharged
  );

  // Comps Pricing Model
  const compsRecommended = compsDraft?.recommended_list_price ? parseFloat(compsDraft.recommended_list_price) : null;
  const soldVals = [compsDraft?.comp_1, compsDraft?.comp_2, compsDraft?.comp_3]
    .filter(v => v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0)
    .map(Number);
  const soldAvg = soldVals.length > 0 ? soldVals.reduce((a, b) => a + b, 0) / soldVals.length : null;

  // Primary Suggested List Price
  const effectiveSuggestedPrice = compsRecommended || targetAskingPrice || parseFloat(item?.suggested_list_price) || 0;
  const suggestedVariance = sellPrice > 0 && effectiveSuggestedPrice > 0 ? sellPrice - effectiveSuggestedPrice : null;

  const handleApplySuggested = () => {
    if (!effectiveSuggestedPrice) return;
    const formatted = effectiveSuggestedPrice.toFixed(2);
    updateField('current_list_price', formatted);
    setAppliedSuggested(true);
    setTimeout(() => setAppliedSuggested(false), 3000);
  };

  const isEbaySynced = Boolean(form.ebay_listing_id);

  return (
    <div className="space-y-4">
      {/* ========================================================================= */}
      {/* 1. TOP FINANCIAL HERO BAR                                                */}
      {/* ========================================================================= */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {(form.ebay_image_url || form.image_url || item?.image_url) ? (
              <img
                src={form.ebay_image_url || form.image_url || item?.image_url}
                alt="Item thumbnail"
                className="w-12 h-12 rounded-xl object-cover border border-slate-700/80 flex-shrink-0 shadow-md"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 flex-shrink-0">
                <Tag className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-100 truncate max-w-[320px] sm:max-w-[480px]">
                  {form.item_name || item?.item_name || 'Inventory Item'}
                </h3>
                {form.sku && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    SKU: {form.sku}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                <span className="text-slate-300 font-semibold">{form.platform || 'eBay'}</span>
                <span>•</span>
                <span className={`font-semibold ${
                  form.status === 'Listed' ? 'text-emerald-400' :
                  form.status === 'Sold' ? 'text-blue-400' : 'text-amber-400'
                }`}>
                  {form.status || 'Available'}
                </span>
                {isEbaySynced && (
                  <>
                    <span>•</span>
                    <a
                      href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 font-mono font-bold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> eBay #{form.ebay_listing_id}
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <MarginHealthBadge marginPct={liveFees?.marginPct} netProfit={liveFees?.netProfit} />
            <button
              type="button"
              onClick={() => setShowFormulas(!showFormulas)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5 text-amber-400" />
              <span>{showFormulas ? 'Hide Formulas' : 'Show Math'}</span>
              {showFormulas ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Top 4 KPI Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400 block">List Price</span>
            <span className="text-base font-black text-slate-100 font-mono mt-0.5 block">
              {sellPrice > 0 ? fmtCurrency(sellPrice) : '--'}
            </span>
            <span className="text-[10px] text-slate-500 block">
              {isFreeShipping ? 'Free Buyer Shipping' : `+${fmtCurrency(shippingCharged)} Shipping`}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-blue-500/20">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-blue-400 block">Landed Cost (COGS)</span>
            <span className="text-base font-black text-blue-300 font-mono mt-0.5 block">
              {fmtCurrency(landedCost)}
            </span>
            <span className="text-[10px] text-slate-400 block">100% Inbound Absorbed</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-cyan-500/20">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-cyan-400 block">Break-Even Floor</span>
            <span className="text-base font-black text-cyan-300 font-mono mt-0.5 block">
              {breakEvenFloor > 0 ? fmtCurrency(breakEvenFloor) : '--'}
            </span>
            <span className="text-[10px] text-slate-400 block">
              {floorSpread != null
                ? floorSpread >= 0
                  ? `+${fmtCurrency(floorSpread)} buffer`
                  : `-${fmtCurrency(Math.abs(floorSpread))} deficit`
                : '$0.00 Net Loss Threshold'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-emerald-500/20">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-emerald-400 block">Net Profit</span>
            <span className={`text-base font-black font-mono mt-0.5 block ${
              (liveFees?.netProfit ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-400'
            }`}>
              {(liveFees?.netProfit ?? 0) >= 0 ? `+${fmtCurrency(liveFees?.netProfit)}` : fmtCurrency(liveFees?.netProfit)}
            </span>
            <span className="text-[10px] text-slate-400 block">
              Margin: {formatPercent(liveFees?.marginPct, 1)} · ROI: {formatPercent(liveFees?.roiPct, 1)}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THE FOUR IN-DEPTH FINANCIAL PILLARS                                    */}
      {/* ========================================================================= */}

      {/* PILLAR 1: NET PROFIT & WATERFALL BREAKDOWN */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider block">
                Pillar 1: Net Profit & Margin Breakdown
              </span>
              <span className="text-[10.5px] text-slate-400">
                End-to-end accounting waterfall from buyer checkout to bank payout
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400">Gross: <strong className="text-slate-200">{fmtCurrency(liveFees?.grossRevenue)}</strong></span>
            <span>→</span>
            <span className="text-slate-400">Proceeds: <strong className="text-slate-200">{fmtCurrency(liveFees?.netProceeds)}</strong></span>
            <span>→</span>
            <span className="text-emerald-400 font-bold">Profit: {fmtCurrency(liveFees?.netProfit)}</span>
          </div>
        </div>

        {/* Step-by-Step Accounting Waterfall Table */}
        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60 text-xs">
          <div className="grid grid-cols-12 px-3 py-2 bg-slate-950 font-semibold text-slate-400 border-b border-slate-800 text-[11px]">
            <span className="col-span-6">Financial Line Item</span>
            <span className="col-span-3 text-right">Calculation Basis</span>
            <span className="col-span-3 text-right">Amount</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {/* 1. Item List Price */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-200 font-medium flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">+</span> Item Sale / List Price
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">Asking Price</span>
              <span className="col-span-3 text-right font-mono font-bold text-slate-100">{fmtCurrency(sellPrice)}</span>
            </div>

            {/* 2. Buyer Paid Shipping */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-200 font-medium flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">+</span> Buyer Shipping Inflow
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">
                {isFreeShipping ? 'Free Shipping' : 'Charged to Buyer'}
              </span>
              <span className="col-span-3 text-right font-mono font-semibold text-sky-300">
                {isFreeShipping ? '$0.00' : `+${fmtCurrency(shippingCharged)}`}
              </span>
            </div>

            {/* Subtotal: Gross Inflow */}
            <div className="grid grid-cols-12 px-3 py-1.5 items-center bg-slate-900/50 font-semibold text-[11px]">
              <span className="col-span-6 text-slate-300 uppercase tracking-wider">Total Gross Revenue Collected</span>
              <span className="col-span-3 text-right text-slate-500 font-mono">List + Buyer Ship</span>
              <span className="col-span-3 text-right font-mono font-bold text-white">{fmtCurrency(liveFees?.grossRevenue)}</span>
            </div>

            {/* 3. Marketplace Final Value Fee */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-300 flex items-center gap-1.5">
                <span className="text-red-400 font-bold">-</span> eBay Final Value Fee (FVF)
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">
                {(platformFeePct * 100).toFixed(2)}% on gross
              </span>
              <span className="col-span-3 text-right font-mono text-red-300">
                -{fmtCurrency(liveFees?.finalValueFee)}
              </span>
            </div>

            {/* 4. Marketplace Flat Order Fee */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-300 flex items-center gap-1.5">
                <span className="text-red-400 font-bold">-</span> eBay Flat Order Fee
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">Per-order transaction</span>
              <span className="col-span-3 text-right font-mono text-red-300">
                -{fmtCurrency(platformFlatFee)}
              </span>
            </div>

            {/* 5. Promoted Listing Ad Fee */}
            {promotedRate > 0 && (
              <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30 bg-amber-950/10">
                <span className="col-span-6 text-amber-300 flex items-center gap-1.5">
                  <span className="text-red-400 font-bold">-</span> Promoted Listings Ad Fee
                </span>
                <span className="col-span-3 text-right text-amber-400/80 font-mono text-[11px]">
                  {promotedRate}% of item price
                </span>
                <span className="col-span-3 text-right font-mono text-red-300">
                  -{fmtCurrency(liveFees?.promotedFee)}
                </span>
              </div>
            )}

            {/* 6. Outbound Shipping Label Cost */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-300 flex items-center gap-1.5">
                <span className="text-red-400 font-bold">-</span> Outbound Shipping Label (Seller Cost)
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">
                Est. label expense
              </span>
              <span className="col-span-3 text-right font-mono text-red-300">
                -{fmtCurrency(estShippingCost)}
              </span>
            </div>

            {/* Subtotal: Net Proceeds */}
            <div className="grid grid-cols-12 px-3 py-1.5 items-center bg-slate-900/50 font-semibold text-[11px]">
              <span className="col-span-6 text-slate-300 uppercase tracking-wider">Net Payout Proceeds</span>
              <span className="col-span-3 text-right text-slate-500 font-mono">Gross - Fees - Shipping</span>
              <span className="col-span-3 text-right font-mono font-bold text-cyan-300">{fmtCurrency(liveFees?.netProceeds)}</span>
            </div>

            {/* 7. Landed Cost (COGS) */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30 bg-blue-950/10">
              <span className="col-span-6 text-blue-300 font-semibold flex items-center gap-1.5">
                <span className="text-red-400 font-bold">-</span> Landed Cost of Goods Sold (COGS)
              </span>
              <span className="col-span-3 text-right text-blue-400/80 font-mono text-[11px]">Pillar 2 Cost</span>
              <span className="col-span-3 text-right font-mono font-bold text-red-300">
                -{fmtCurrency(landedCost)}
              </span>
            </div>

            {/* Final Bottom Line */}
            <div className="grid grid-cols-12 px-3 py-2.5 items-center bg-emerald-950/30 border-t border-emerald-500/30 font-bold">
              <div className="col-span-6">
                <span className="text-emerald-300 uppercase tracking-wider text-xs block">Bottom-Line Net Profit</span>
                <span className="text-[10px] text-slate-400 font-normal">Take-home profit after all expenses</span>
              </div>
              <div className="col-span-3 text-right text-[11px] text-slate-300 font-mono">
                {formatPercent(liveFees?.marginPct, 1)} Margin · {formatPercent(liveFees?.roiPct, 1)} ROI
              </div>
              <div className="col-span-3 text-right">
                <span className={`text-base font-black font-mono ${
                  (liveFees?.netProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(liveFees?.netProfit ?? 0) >= 0 ? `+${fmtCurrency(liveFees?.netProfit)}` : fmtCurrency(liveFees?.netProfit)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Interactive Pricing & Fee Dials */}
        <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Interactive Sensitivity Dials (Adjust to preview instant profit changes):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* List Price Dial */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">List Price ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.current_list_price ?? ''}
                  onChange={e => updateField('current_list_price', e.target.value)}
                  className="input-field text-xs pl-7 font-mono font-bold text-emerald-400 bg-slate-900 border-slate-700"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Outbound Shipping Presets Dial */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Est. Outbound Label ($)</span>
                <span className="font-mono text-[10px] text-amber-400">${Number(estShippingCost).toFixed(2)}</span>
              </label>
              <div className="flex items-center gap-1">
                {[
                  { label: '$0', val: '0.00' },
                  { label: '$4.50', val: '4.50' },
                  { label: '$8.50', val: '8.50' },
                  { label: '$15.95', val: '15.95' }
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => updateField('est_shipping_cost', p.val, true)}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                      parseFloat(form.est_shipping_cost) === parseFloat(p.val)
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Promoted Ad Rate Dial */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center justify-between">
                <span>Promoted Ad Rate (%)</span>
                <span className="font-mono text-[10px] text-amber-400">{promotedRate}%</span>
              </label>
              <div className="flex items-center gap-1">
                {[
                  { label: '0%', val: '0' },
                  { label: '2%', val: '2' },
                  { label: '5%', val: '5' },
                  { label: '8%', val: '8' }
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => updateField('ebay_promoted_rate', p.val, true)}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded border transition-colors cursor-pointer ${
                      String(form.ebay_promoted_rate) === p.val
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PILLAR 2: LANDED COST & ACQUISITION BREAKDOWN */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-blue-500/30 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider block">
                Pillar 2: Landed Cost (COGS) Breakdown
              </span>
              <span className="text-[10.5px] text-slate-400">
                Fully absorbed purchase acquisition cost per unit from invoice
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 block">Total Landed Cost</span>
            <span className="text-base font-black text-blue-400 font-mono">{fmtCurrency(landedCost)}</span>
          </div>
        </div>

        {/* Itemized Cost Allocation Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">1. Base Hammer / Unit</span>
            <span className="text-sm font-black text-slate-100 font-mono mt-0.5 block">{fmtCurrency(basePrice)}</span>
            <span className="text-[10px] text-slate-500 block">Raw invoice item price</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">2. Inbound Shipping</span>
            <span className="text-sm font-black text-blue-300 font-mono mt-0.5 block">+{fmtCurrency(proratedShipping)}</span>
            <span className="text-[10px] text-slate-500 block">
              {prorationWeight ? `${prorationWeight}% invoice weight` : 'Prorated share'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">3. Inbound Tax / Duty</span>
            <span className="text-sm font-black text-blue-300 font-mono mt-0.5 block">+{fmtCurrency(proratedTax)}</span>
            <span className="text-[10px] text-slate-500 block">Sales tax & import duties</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">4. Invoice Discounts</span>
            <span className="text-sm font-black text-emerald-400 font-mono mt-0.5 block">
              {proratedDiscount > 0 ? `-${fmtCurrency(proratedDiscount)}` : '$0.00'}
            </span>
            <span className="text-[10px] text-slate-500 block">Promotions & credits</span>
          </div>
        </div>

        {/* Landed Cost Formula Bar */}
        <div className="p-3 rounded-xl bg-slate-950/90 border border-blue-500/20 text-xs flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap text-slate-300 font-mono">
            <span className="text-slate-400 font-sans font-bold">Landed Cost =</span>
            <span>{fmtCurrency(basePrice)} (Base)</span>
            <span className="text-blue-400">+{fmtCurrency(proratedShipping)} (Ship)</span>
            <span className="text-blue-400">+{fmtCurrency(proratedTax)} (Tax)</span>
            {proratedDiscount > 0 && <span className="text-emerald-400">-{fmtCurrency(proratedDiscount)} (Disc)</span>}
            <span className="text-slate-400">=</span>
            <strong className="text-blue-400 font-bold">{fmtCurrency(landedCost)}</strong>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {item?.invoice_ref && (
              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono">
                Invoice #{item.invoice_ref}
              </span>
            )}
            {form.purchase_date && (
              <span className="text-slate-400">Acquired: {form.purchase_date.slice(0, 10)}</span>
            )}
          </div>
        </div>

        {/* Amazon Vine ETV notice if applicable */}
        {form.is_vinescout && (
          <div className="p-2.5 rounded-xl bg-teal-950/30 border border-teal-500/30 text-xs flex items-center justify-between flex-wrap gap-2 text-teal-300">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>Amazon Vine Item: Estimated Tax Value (ETV): <strong>{fmtCurrency(form.etv)}</strong></span>
            </div>
            <span>Estimated Income Tax Liability: <strong>{fmtCurrency(form.tax_cost || landedCost)}</strong></span>
          </div>
        )}
      </div>

      {/* PILLAR 3: FLOOR COST & BREAK-EVEN SAFETY SPREAD */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider block">
                Pillar 3: Floor Cost (Break-Even Price) & Safety Buffer
              </span>
              <span className="text-[10.5px] text-slate-400">
                Absolute minimum list price to guarantee $0.00 loss after all fees and shipping
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 block">Break-Even Floor</span>
            <span className="text-base font-black text-cyan-400 font-mono">{fmtCurrency(breakEvenFloor)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Floor Equation Variables */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 block uppercase tracking-wider">
              Break-Even Math Breakdown:
            </span>
            <div className="space-y-1.5 text-slate-400 font-mono text-[11px]">
              <div className="flex justify-between">
                <span>1. Fixed Cash Burden:</span>
                <span className="text-slate-200">
                  {fmtCurrency(landedCost)} (COGS) + {fmtCurrency(estShippingCost)} (Label) + {fmtCurrency(platformFlatFee)} (Flat)
                </span>
              </div>
              <div className="flex justify-between">
                <span>2. Fee Retention Divisor:</span>
                <span className="text-slate-200">
                  1 - {(platformFeePct * 100).toFixed(1)}% (FVF) - {promotedRate}% (Ad) = {((1 - platformFeePct - (promotedRate / 100)) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="pt-1 border-t border-slate-800 flex justify-between font-bold text-cyan-300">
                <span>Floor Formula:</span>
                <span>(Burden - Shipping Kept) / Retention Rate</span>
              </div>
            </div>
          </div>

          {/* Safety Buffer vs Current List Price */}
          <div className={`p-3.5 rounded-xl border space-y-2 flex flex-col justify-between ${
            floorSpread != null && floorSpread >= 0
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-red-950/20 border-red-500/30'
          }`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-300">
                Safety Spread Over Floor:
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xl font-black font-mono ${
                  floorSpread != null && floorSpread >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {floorSpread != null
                    ? floorSpread >= 0 ? `+${fmtCurrency(floorSpread)}` : `-${fmtCurrency(Math.abs(floorSpread))}`
                    : '--'}
                </span>
                {floorSpreadPct != null && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    floorSpread >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                    {floorSpread >= 0 ? `+${(floorSpreadPct * 100).toFixed(1)}% Buffer` : 'Below Floor Risk!'}
                  </span>
                )}
              </div>
            </div>

            <p className="text-[10.5px] text-slate-400">
              {floorSpread != null && floorSpread >= 0
                ? `You have a healthy ${fmtCurrency(floorSpread)} cushion before this listing enters negative return territory.`
                : 'Listing price is currently below total cost burden. Adjust list price upward to avoid taking a loss.'}
            </p>
          </div>
        </div>
      </div>

      {/* PILLAR 4: SUGGESTED LIST PRICE & PRICING MODELS */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-amber-500/30 space-y-3.5 shadow-md">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                Pillar 4: Suggested List Price & Models Breakdown
              </span>
              <span className="text-[10.5px] text-slate-400">
                Data-driven asking price recommendations balancing target margin & eBay comps
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 block">Suggested Price</span>
            <span className="text-base font-black text-amber-400 font-mono">
              {effectiveSuggestedPrice > 0 ? fmtCurrency(effectiveSuggestedPrice) : '--'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Model A: Target Profit Margin Model */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1">
                <Percent className="w-3.5 h-3.5" /> Model A: Cost-Plus Target Margin
              </span>
              <span className="font-mono text-xs font-black text-amber-400">
                {targetAskingPrice > 0 ? fmtCurrency(targetAskingPrice) : '--'}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400">
              Calculated to guarantee your desired <strong className="text-slate-200">{(targetMarginPct * 100).toFixed(0)}% Net Profit Margin</strong> after deducting all platform fees, shipping label costs, and COGS.
            </p>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[10.5px] font-mono text-slate-300 flex justify-between">
              <span>Expected Net Profit:</span>
              <span className="text-emerald-400 font-bold">
                +{fmtCurrency(targetAskingPrice * targetMarginPct)}
              </span>
            </div>
          </div>

          {/* Model B: Live eBay Market Comps Model */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Model B: Live eBay Market Comps
              </span>
              <span className="font-mono text-xs font-black text-blue-400">
                {compsRecommended > 0 ? fmtCurrency(compsRecommended) : (soldAvg > 0 ? fmtCurrency(soldAvg) : '--')}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400">
              {soldAvg > 0
                ? `Benchmark based on ${soldVals.length} verified sold comp(s) on eBay (Sold Avg: ${fmtCurrency(soldAvg)}).`
                : 'Pulls active candidate comps and completed sold items from eBay to benchmark real buyer demand.'}
            </p>
            <div className="p-2 rounded bg-slate-900/80 border border-slate-800 text-[10.5px] font-mono text-slate-300 flex justify-between">
              <span>Market Comps Target:</span>
              <span className="text-blue-300 font-bold">
                {compsDraft?.recommended_list_price ? fmtCurrency(compsDraft.recommended_list_price) : 'See Comps Tab'}
              </span>
            </div>
          </div>
        </div>

        {/* 1-Click Action & Variance Bar */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs space-y-0.5">
            <span className="text-slate-300 font-semibold block">
              Suggested Recommendation: <strong className="text-amber-300 font-mono">{fmtCurrency(effectiveSuggestedPrice)}</strong>
            </span>
            <span className="text-[10.5px] text-slate-400">
              {suggestedVariance != null
                ? suggestedVariance === 0
                  ? 'Your current list price exactly matches the suggested recommendation.'
                  : suggestedVariance > 0
                  ? `Currently listed ${fmtCurrency(suggestedVariance)} above suggestion (maximizes margin).`
                  : `Currently listed ${fmtCurrency(Math.abs(suggestedVariance))} below suggestion (priced for quick sale).`
                : 'Click below to automatically apply the recommended target price.'}
            </span>
          </div>

          <button
            type="button"
            disabled={!effectiveSuggestedPrice || sellPrice === effectiveSuggestedPrice}
            onClick={handleApplySuggested}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
              appliedSuggested
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {appliedSuggested ? <CheckCircle2 className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
            <span>{appliedSuggested ? 'Applied to List Price!' : 'Apply Suggested as List Price'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
