import React, { useState, useMemo } from 'react';
import {
  DollarSign, TrendingUp, ShieldAlert, Sparkles, ExternalLink,
  CheckCircle2, Receipt, Tag, Percent, Calculator,
  Zap, ChevronDown, ChevronUp, ArrowUpRight, ShoppingBag,
  RefreshCw, Loader2, Search, X, Calendar, Unlink, Link2,
  Lock, Edit2, Truck, ListChecks, ArrowRight, Info
} from 'lucide-react';
import { ALL_STATUSES, LISTING_FORMATS, LISTING_STATUSES } from '../../utils/constants';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { computeTargetPriceFromMargin } from '../../utils/feeEngine';
import { DEFAULT_PLATFORM_FEE_PCT, DEFAULT_PLATFORM_FLAT_FEE } from '../../../functions/utils/constants.js';
import { MarginHealthBadge } from '../inventory/MarginHealthBadge';

export function EditTabFinancials({
  form,
  updateField,
  item,
  liveFees,
  compsDraft,
  handleSaveComps,
  sale,
  reconciliation,
  allPlatforms = [],
  onPlatformChange,
  handleSyncWithEbay,
  syncingEbay = false,
  ebayListings = [],
  loadingEbayListings = false,
  ebaySearch = '',
  setEbaySearch,
  fetchActiveListings,
  handlePairEbayListing
}) {
  const [showFormulas, setShowFormulas] = useState(false);
  const [appliedSuggested, setAppliedSuggested] = useState(false);

  // Pairing workflow states
  const [pairingMode, setPairingMode] = useState('browse'); // 'browse' | 'manual'
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [isPairingManual, setIsPairingManual] = useState(false);
  const [showChangePicker, setShowChangePicker] = useState(false);

  const isSold = form.status === 'Sold' || item?.status === 'Sold';
  const isEbaySynced = Boolean(form.ebay_listing_id);

  // Derived financial variables
  const sellPrice = parseFloat(form.current_list_price) || 0;
  const shippingCharged = parseFloat(form.buyer_shipping_cost || form.shipping_charged || 0) || 0;
  const isFreeShipping = shippingCharged === 0;

  // Landed Cost (COGS) details
  const basePrice = parseFloat(form.unit_price) || parseFloat(item?.unit_price) || 0;
  const proratedShipping = parseFloat(item?.prorated_shipping) || 0;
  const proratedTax = parseFloat(item?.prorated_tax) || 0;
  const proratedDiscount = parseFloat(item?.prorated_discount) || 0;
  const landedCost = parseFloat(form.true_total_cost) || parseFloat(item?.true_total_cost) || (basePrice + proratedShipping + proratedTax - proratedDiscount);
  const prorationWeight = item?.proration_weight != null ? (Number(item.proration_weight) * 100).toFixed(1) : null;

  // Realized completed sale & reconciled fee ledger
  const actualGross = parseFloat(sale?.gross_sale_price ?? item?.gross_sale_price ?? form.actual_sell_price ?? form.current_list_price) || 0;
  const actualBuyerShipping = parseFloat(sale?.buyer_shipping_paid ?? item?.buyer_shipping_paid ?? form.buyer_shipping_cost) || 0;
  const actualTotalGross = actualGross + actualBuyerShipping;

  const actualFvf = parseFloat(
    reconciliation?.final_value_fee ??
    item?.recon_final_value_fee ??
    (parseFloat(sale?.platform_fees_amt ?? item?.platform_fees_amt) - (parseFloat(sale?.promoted_listing_fee ?? item?.promoted_listing_fee) || 0))
  ) || (parseFloat(sale?.platform_fees_amt ?? item?.platform_fees_amt) || 0);

  const actualPromotedFee = parseFloat(
    reconciliation?.promoted_listing_fee ??
    item?.recon_promoted_listing_fee ??
    sale?.promoted_listing_fee ??
    item?.promoted_listing_fee
  ) || 0;

  const actualShippingLabel = parseFloat(
    reconciliation?.shipping_label_cost ??
    item?.recon_shipping_label_cost ??
    sale?.actual_shipping_cost ??
    item?.actual_shipping_cost
  ) || 0;

  const actualNetProceeds = parseFloat(sale?.net_proceeds ?? item?.net_proceeds) || (actualTotalGross - actualFvf - actualPromotedFee - actualShippingLabel);
  const actualNetProfit = parseFloat(sale?.net_profit ?? item?.net_profit) || (actualNetProceeds - landedCost);
  const actualMarginPct = actualTotalGross > 0 ? (actualNetProfit / actualTotalGross) : 0;
  const actualRoiPct = landedCost > 0 ? (actualNetProfit / landedCost) : 0;

  const orderId = sale?.ebay_order_id ?? item?.ebay_order_id ?? item?.order_id;
  const buyerHandle = sale?.buyer_handle ?? item?.buyer_handle;
  const isReconciled = Boolean(sale?.fee_reconciled_at || reconciliation?.id || item?.fee_reconciled_at);

  // Outbound fulfillment & platform assumptions (pre-sale listing)
  const estShippingCost = parseFloat(form.est_shipping_cost) || 0;
  const targetMarginPct = (parseFloat(form.target_margin_pct) || 15) / 100;
  const platformFeePct = (parseFloat(form.platform_fee_pct) || DEFAULT_PLATFORM_FEE_PCT * 100) / 100;
  const promotedRate = parseFloat(form.ebay_promoted_rate) || 0;
  const platformFlatFee = parseFloat(form.platform_flat_fee) || DEFAULT_PLATFORM_FLAT_FEE;

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

  // Robust string normalizer
  const normalizeText = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Extract 12-digit eBay item ID from raw numbers or full URLs
  const extractEbayId = (input) => {
    if (!input) return null;
    const clean = input.trim();
    const m = clean.match(/(?:itm\/|item=|\b)(\d{12})\b/);
    return m ? m[1] : null;
  };

  // Smart search, ranking, and suggested match detection for active store listings
  const { filteredListings, detectedIdMatch, hasSearchQuery, suggestedMatch } = useMemo(() => {
    const rawQ = (ebaySearch || '').trim();
    const itemSku = normalizeText(form.sku || item?.sku || '');
    const athlete = normalizeText(item?.athlete_person || '');
    const itemName = normalizeText(item?.item_name || '');

    let bestSuggestion = null;
    if (ebayListings.length > 0) {
      const athleteTokens = athlete.split(' ').filter(t => t.length > 2);
      const nameTokens = itemName.split(' ').filter(t => t.length > 3 && !['signed', 'autographed', 'auto', 'jersey', 'card', 'photo', 'ball', 'bat', 'helmet', 'framed'].includes(t));

      let maxScore = 0;
      let topListing = null;

      ebayListings.forEach(l => {
        const lTitle = normalizeText(l.title);
        const lSku = normalizeText(l.sku);
        let s = 0;

        if (itemSku && lSku && itemSku === lSku) s += 500;
        if (athlete && lTitle.includes(athlete)) s += 300;
        else if (athleteTokens.length > 0) {
          const matched = athleteTokens.filter(tok => lTitle.includes(tok));
          if (matched.length === athleteTokens.length) s += 250;
          else if (matched.length > 0) s += matched.length * 60;
        }

        if (nameTokens.length > 0) {
          const matchedNameTokens = nameTokens.filter(tok => lTitle.includes(tok));
          s += matchedNameTokens.length * 20;
        }

        if (s > maxScore) {
          maxScore = s;
          topListing = l;
        }
      });

      if (maxScore >= 100) {
        bestSuggestion = topListing;
      }
    }

    if (!rawQ) {
      return {
        filteredListings: ebayListings,
        detectedIdMatch: null,
        hasSearchQuery: false,
        suggestedMatch: bestSuggestion
      };
    }

    const detectedId = extractEbayId(rawQ);
    const normalizedQ = normalizeText(rawQ);
    const searchTokens = normalizedQ.split(' ').filter(t => t.length > 0);

    const scored = ebayListings.map(listing => {
      const listingTitle = normalizeText(listing.title);
      const listingSku = normalizeText(listing.sku);
      const listingId = String(listing.listing_id || '').trim();
      let score = 0;

      if (detectedId && listingId === detectedId) {
        score += 500;
      } else if (rawQ && listingId.includes(rawQ)) {
        score += 300;
      }

      if (itemSku && listingSku === itemSku) {
        score += 400;
      } else if (listingSku && normalizedQ && (listingSku.includes(normalizedQ) || normalizedQ.includes(listingSku))) {
        score += 200;
      }

      if (listingTitle.includes(normalizedQ)) {
        score += 150;
      }

      if (searchTokens.length > 0) {
        const matchedTokens = searchTokens.filter(token => listingTitle.includes(token));
        if (matchedTokens.length === searchTokens.length) {
          score += 100;
        } else if (matchedTokens.length > 0) {
          score += (matchedTokens.length / searchTokens.length) * 60;
        }
      }

      return { listing, score };
    });

    const matches = scored
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.listing);

    return {
      filteredListings: matches,
      detectedIdMatch: detectedId,
      hasSearchQuery: true,
      suggestedMatch: null
    };
  }, [ebayListings, ebaySearch, form.sku, item]);

  // Execute pairing action
  const executePair = async (listingOrId) => {
    if (handlePairEbayListing) {
      await handlePairEbayListing(listingOrId);
    } else {
      let id = '';
      let rate = null;
      if (typeof listingOrId === 'object' && listingOrId !== null) {
        id = listingOrId.listing_id;
        rate = listingOrId.promoted_rate;
        updateField('ebay_listing_id', id);
        if (listingOrId.price != null) updateField('current_list_price', Number(listingOrId.price).toFixed(2));
        if (listingOrId.sku && !form.sku) updateField('sku', listingOrId.sku);
      } else {
        id = String(listingOrId).trim();
        updateField('ebay_listing_id', id);
      }
      if (handleSyncWithEbay) await handleSyncWithEbay(id, rate);
    }
    setShowChangePicker(false);
  };

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
            <MarginHealthBadge marginPct={isSold ? actualMarginPct : liveFees?.marginPct} netProfit={isSold ? actualNetProfit : liveFees?.netProfit} />
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
          {isSold ? (
            <>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400 block">Sold Price</span>
                <span className="text-base font-black text-slate-100 font-mono mt-0.5 block">
                  {fmtCurrency(actualGross)}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {actualBuyerShipping > 0 ? `+${fmtCurrency(actualBuyerShipping)} Buyer Ship` : 'Free Buyer Shipping'}
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
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-cyan-400 block">Net Proceeds</span>
                <span className="text-base font-black text-cyan-300 font-mono mt-0.5 block">
                  {fmtCurrency(actualNetProceeds)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Gross - Fees - Shipping
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-emerald-500/20">
                <span className="text-[10.5px] uppercase tracking-wider font-bold text-emerald-400 block">Net Profit</span>
                <span className={`text-base font-black font-mono mt-0.5 block ${
                  actualNetProfit >= 0 ? 'text-emerald-300' : 'text-red-400'
                }`}>
                  {actualNetProfit >= 0 ? `+${fmtCurrency(actualNetProfit)}` : fmtCurrency(actualNetProfit)}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Margin: {formatPercent(actualMarginPct, 1)} · ROI: {formatPercent(actualRoiPct, 1)}
                </span>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MARKETPLACE CHANNEL & EBAY LISTING CONNECTION HUB                      */}
      {/* ========================================================================= */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {isSold ? 'Marketplace Channel & Completed Order Connection' : 'Marketplace Channel & Listing Connection'}
            </span>
          </div>

          {isEbaySynced && (
            <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              eBay Item #{form.ebay_listing_id}
            </span>
          )}
        </div>

        {isSold ? (
          /* COMPLETED ORDER CONNECTION VIEW FOR SOLD ITEMS */
          <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3 min-w-0">
                {(form.ebay_image_url || form.image_url || item?.image_url) && (
                  <div className="w-12 h-12 rounded-lg bg-slate-950 border border-blue-500/30 overflow-hidden flex-shrink-0">
                    <img
                      src={form.ebay_image_url || form.image_url || item?.image_url}
                      alt="Listing thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-100">Verified Completed Sale & Order</span>
                    <span className="text-[10px] text-blue-300 font-semibold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {isReconciled ? 'Reconciled from eBay' : 'Sold'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-mono flex items-center gap-2.5 flex-wrap">
                    {orderId && (
                      <span>Order: <strong className="text-white font-bold">#{orderId}</strong></span>
                    )}
                    {buyerHandle && (
                      <span className="text-slate-400">Buyer: <strong className="text-cyan-300">@{buyerHandle}</strong></span>
                    )}
                    {form.ebay_listing_id && (
                      <span>Listing: <strong className="text-slate-200">#{form.ebay_listing_id}</strong></span>
                    )}
                  </p>

                  <div className="flex items-center gap-3 pt-0.5 text-[11px]">
                    {orderId && (
                      <a
                        href={`https://www.ebay.com/sh/fin/transactions?q=orderId:${orderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 underline font-mono"
                      >
                        <ExternalLink className="w-3 h-3" /> View in eBay Seller Hub ↗
                      </a>
                    )}
                    {form.ebay_listing_id && (
                      <a
                        href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 underline font-mono"
                      >
                        <ExternalLink className="w-3 h-3" /> View listing on eBay.com ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={syncingEbay}
                  onClick={() => handleSyncWithEbay && handleSyncWithEbay()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Re-sync latest order fulfillment and fee reconciliation from live eBay API"
                >
                  {syncingEbay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{syncingEbay ? 'Syncing...' : 'Sync Order & Fees'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateField('ebay_listing_id', '')}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/20 transition-all flex items-center gap-1 cursor-pointer"
                  title="Unlink eBay Item ID"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Unlink</span>
                </button>
              </div>
            </div>

            {/* Lifecycle Dates & Realized Sale Price Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Date Listed</span>
                </label>
                <input
                  type="date"
                  value={form.date_listed || ''}
                  onChange={e => updateField('date_listed', e.target.value)}
                  className="input-field text-xs text-slate-200 bg-slate-900 border-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Date Sold</span>
                </label>
                <input
                  type="date"
                  value={form.date_sold || ''}
                  onChange={e => updateField('date_sold', e.target.value)}
                  className="input-field text-xs text-slate-200 bg-slate-900 border-slate-700"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-emerald-400 mb-1 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Realized Sale Price ($)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.actual_sell_price || (actualGross ? actualGross.toFixed(2) : '')}
                    onChange={e => updateField('actual_sell_price', e.target.value)}
                    className="input-field text-xs pl-6 font-mono text-emerald-300 font-bold bg-slate-900 border-emerald-500/40"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : isEbaySynced && !showChangePicker ? (
          /* CONNECTED VIEW FOR ACTIVE / UNSOLD ITEMS */
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-3 min-w-0">
                {(form.ebay_image_url || form.image_url || item?.image_url) && (
                  <div className="w-12 h-12 rounded-lg bg-slate-950 border border-emerald-500/30 overflow-hidden flex-shrink-0">
                    <img
                      src={form.ebay_image_url || form.image_url || item?.image_url}
                      alt="Listing thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-emerald-300">Live eBay Store Listing Connected</span>
                    <span className="text-[10px] text-slate-400 font-mono">({form.status || 'Active'})</span>
                  </div>
                  <p className="text-xs text-slate-300 font-mono flex items-center gap-2 flex-wrap">
                    <span>Listing ID: <strong className="text-white font-bold">#{form.ebay_listing_id}</strong></span>
                    {Number(form.ebay_promoted_rate) > 0 && (
                      <span className="text-amber-300 font-bold">• {form.ebay_promoted_rate}% Promoted Ad</span>
                    )}
                    {form.current_list_price && (
                      <span className="text-emerald-400 font-bold">• ${Number(form.current_list_price).toFixed(2)} Listed</span>
                    )}
                  </p>
                  <a
                    href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 underline pt-0.5"
                  >
                    <ExternalLink className="w-3 h-3" /> View live listing on eBay.com ↗
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={syncingEbay}
                  onClick={() => handleSyncWithEbay && handleSyncWithEbay()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Sync title, price, status, shipping and ad rate from live eBay API"
                >
                  {syncingEbay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>{syncingEbay ? 'Syncing...' : 'Sync Live Data'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowChangePicker(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1 cursor-pointer"
                  title="Change or re-pair eBay listing"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Change</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateField('ebay_listing_id', '')}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/20 transition-all flex items-center gap-1 cursor-pointer"
                  title="Unlink eBay Item ID"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Unlink</span>
                </button>
              </div>
            </div>

            {/* Quick Listing Attributes Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sales Platform</label>
                <select
                  value={form.platform || 'eBay'}
                  onChange={e => onPlatformChange ? onPlatformChange(e.target.value) : updateField('platform', e.target.value)}
                  className="input-field text-xs text-amber-300 bg-slate-900 border-slate-700 font-semibold"
                >
                  {allPlatforms.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Inventory Status</label>
                <select
                  value={form.status}
                  onChange={e => updateField('status', e.target.value)}
                  className="input-field text-xs text-white bg-slate-900 border-slate-700 font-semibold"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Listing Format</label>
                <select
                  value={form.listing_format || 'Fixed Price'}
                  onChange={e => updateField('listing_format', e.target.value)}
                  className="input-field text-xs text-slate-200 bg-slate-900 border-slate-700"
                >
                  {LISTING_FORMATS.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date Listed</label>
                <input
                  type="date"
                  value={form.date_listed || ''}
                  onChange={e => updateField('date_listed', e.target.value)}
                  className="input-field text-xs text-slate-200 bg-slate-900 border-slate-700"
                />
              </div>
            </div>
          </div>
        ) : (
          /* PAIRING WORKFLOW HUB (UNPAIRED OR CHANGE MODE) */
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-300 font-semibold">
                  {isEbaySynced ? 'Change Paired eBay Listing' : 'Pair with Active eBay Listing'}
                </span>
                {isEbaySynced && (
                  <button
                    type="button"
                    onClick={() => setShowChangePicker(false)}
                    className="text-[11px] text-slate-400 hover:text-white underline ml-2 cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Mode Switcher */}
              <div className="p-0.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center text-xs">
                <button
                  type="button"
                  onClick={() => setPairingMode('browse')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    pairingMode === 'browse'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Browse Store ({ebayListings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPairingMode('manual')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                    pairingMode === 'manual'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Enter ID / URL
                </button>
              </div>
            </div>

            {/* MODE A: BROWSE ACTIVE STORE LISTINGS */}
            {pairingMode === 'browse' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={ebaySearch}
                      onChange={(e) => setEbaySearch && setEbaySearch(e.target.value)}
                      placeholder="Search active store listings by Title, SKU, or 12-digit Item ID..."
                      className="w-full pl-8 pr-8 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    {ebaySearch && (
                      <button
                        type="button"
                        onClick={() => setEbaySearch && setEbaySearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={loadingEbayListings}
                    onClick={() => fetchActiveListings && fetchActiveListings(true)}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                    title="Refresh store listings from eBay"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingEbayListings ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {loadingEbayListings ? (
                  <div className="py-8 text-center space-y-2">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                    <p className="text-xs text-slate-400">Loading active listings from your eBay store...</p>
                  </div>
                ) : (
                  <>
                    {/* Auto-suggested Match Card */}
                    {suggestedMatch && !hasSearchQuery && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-300 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Suggested Match from eBay Store
                          </span>
                          <span className="text-[10px] text-amber-400/80 font-mono">Matched by SKU / Title</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-white font-semibold truncate">{suggestedMatch.title}</p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              ID: #{suggestedMatch.listing_id} {suggestedMatch.sku && `• SKU: ${suggestedMatch.sku}`} • ${Number(suggestedMatch.price).toFixed(2)}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={syncingEbay}
                            onClick={() => executePair(suggestedMatch)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Pair This Match</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Listings Display */}
                    {(filteredListings.length > 0 || ebayListings.length > 0) && (
                      <div className="space-y-1.5">
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                          {(hasSearchQuery && filteredListings.length > 0 ? filteredListings : ebayListings)
                            .slice(0, 50)
                            .map(l => (
                              <div
                                key={l.listing_id || l.sku}
                                className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                  {l.image_url ? (
                                    <img
                                      src={l.image_url}
                                      alt={l.title}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <ShoppingBag className="w-4 h-4 text-slate-600" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <p className="font-semibold text-slate-100 truncate">{l.title}</p>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap">
                                    <span>#{l.listing_id}</span>
                                    {l.sku && <span>SKU: {l.sku}</span>}
                                    {l.price != null && (
                                      <span className="text-emerald-400 font-bold">${Number(l.price).toFixed(2)}</span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  disabled={syncingEbay}
                                  onClick={() => executePair(l)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1 flex-shrink-0 cursor-pointer disabled:opacity-50"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                  <span>Pair</span>
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* MODE B: MANUAL ITEM ID OR URL ENTRY */}
            {pairingMode === 'manual' && (
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Enter 12-Digit eBay Item ID or Listing URL
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Paste the 12-digit numeric Item ID (e.g. <span className="font-mono text-slate-300">196351234567</span>) or the full eBay listing URL.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => {
                      setManualInput(e.target.value);
                      setManualError('');
                    }}
                    placeholder="e.g. 196351234567 or https://www.ebay.com/itm/196351234567..."
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    disabled={syncingEbay || isPairingManual || !manualInput.trim()}
                    onClick={async () => {
                      const cleanId = extractEbayId(manualInput);
                      if (!cleanId) {
                        setManualError('Please enter a valid 12-digit eBay Item ID or paste an eBay item URL.');
                        return;
                      }
                      setIsPairingManual(true);
                      setManualError('');
                      try {
                        await executePair(cleanId);
                        setManualInput('');
                      } catch (e) {
                        setManualError(e.message || 'Failed to pair with eBay listing ID.');
                      } finally {
                        setIsPairingManual(false);
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {syncingEbay || isPairingManual ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>Pair & Fetch Live Data</span>
                  </button>
                </div>

                {manualError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{manualError}</span>
                  </p>
                )}
              </div>
            )}

            {/* Manual Listing Controls Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sales Platform</label>
                <select
                  value={form.platform || 'eBay'}
                  onChange={e => onPlatformChange ? onPlatformChange(e.target.value) : updateField('platform', e.target.value)}
                  className="input-field text-xs text-amber-300 bg-slate-900 border-slate-700 font-semibold"
                >
                  {allPlatforms.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Inventory Status</label>
                <select
                  value={form.status}
                  onChange={e => updateField('status', e.target.value)}
                  className="input-field text-xs text-white bg-slate-900 border-slate-700 font-semibold"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Listing Format</label>
                <select
                  value={form.listing_format || 'Fixed Price'}
                  onChange={e => updateField('listing_format', e.target.value)}
                  className="input-field text-xs text-slate-200 bg-slate-900 border-slate-700"
                >
                  {LISTING_FORMATS.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Date Listed</label>
                <input
                  type="date"
                  value={form.date_listed || ''}
                  onChange={e => updateField('date_listed', e.target.value)}
                  className="input-field text-xs text-slate-200 bg-slate-900 border-slate-700"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. PRICING STRATEGY & OUTBOUND FULFILLMENT CONTROLS (ONLY WHEN NOT SOLD) */}
      {/* ========================================================================= */}
      {!isSold && (
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Pricing Strategy & Outbound Controls
              </span>
            </div>
            {targetAskingPrice > 0 && (
              <button
                type="button"
                onClick={() => updateField('current_list_price', targetAskingPrice.toFixed(2))}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all hover:bg-amber-500/20 cursor-pointer"
                title="Apply target asking price to active price"
              >
                <Zap className="w-3 h-3" />
                <span>Apply Target ({fmtCurrency(targetAskingPrice)})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
            {/* Buyer Shipping & Presets */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 flex items-center justify-between flex-wrap gap-1">
                <span>Shipping Charged to Buyer ($)</span>
                <span className={`text-[10px] font-semibold ${isFreeShipping ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {isFreeShipping ? 'Free to Buyer' : `+$${Number(shippingCharged).toFixed(2)} Inflow`}
                </span>
              </label>

              <div className="flex items-center gap-1.5 flex-wrap">
                {['0.00', '4.50', '8.50', '15.95'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateField('buyer_shipping_cost', val)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                      shippingCharged === parseFloat(val)
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {val === '0.00' ? 'Free ($0)' : `$${val}`}
                  </button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.buyer_shipping_cost ?? ''}
                  onChange={e => updateField('buyer_shipping_cost', e.target.value)}
                  className="input-field text-xs pl-8 font-mono text-white bg-slate-950"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Outbound Shipping Label Cost */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Est. Outbound Label Cost ($)</span>
                <span className="text-[10px] text-amber-400/90 font-mono">
                  {estShippingCost > 0 ? `-$${Number(estShippingCost).toFixed(2)} Expense` : '$0.00 (No Label)'}
                </span>
              </label>

              <div className="flex items-center gap-1.5 flex-wrap">
                {['0.00', '4.50', '8.50', '15.95'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateField('est_shipping_cost', val, true)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                      estShippingCost === parseFloat(val)
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    ${val}
                  </button>
                ))}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.est_shipping_cost ?? ''}
                  onChange={e => updateField('est_shipping_cost', e.target.value)}
                  className="input-field text-xs pl-8 font-mono text-slate-200 bg-slate-950"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
            {/* Target Margin % */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Target Profit Margin (%)</span>
                <span className="text-[10px] text-slate-400 font-mono">{form.target_margin_pct || '15'}%</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.target_margin_pct ?? ''}
                  onChange={e => updateField('target_margin_pct', e.target.value)}
                  className="input-field text-xs pr-8 font-mono text-blue-300 font-bold bg-slate-950"
                  placeholder="15"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
              </div>
            </div>

            {/* Promoted Ad Rate % */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Promoted Listing Ad Rate (%)</span>
                <span className="text-[10px] text-amber-400 font-mono font-bold">
                  {Number(form.ebay_promoted_rate || 0) > 0 ? `${form.ebay_promoted_rate}% Active` : '0% (Standard)'}
                </span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.ebay_promoted_rate ?? ''}
                  onChange={e => updateField('ebay_promoted_rate', e.target.value)}
                  className="input-field text-xs pr-8 font-mono text-amber-300 font-bold bg-slate-950"
                  placeholder="0.0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. THE FOUR IN-DEPTH FINANCIAL PILLARS                                    */}
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
                {isSold ? 'Pillar 1: Completed Sale & Fee Ledger' : 'Pillar 1: Net Profit & Margin Breakdown'}
              </span>
              <span className="text-[10.5px] text-slate-400">
                {isSold ? 'Actual accounting waterfall from buyer checkout to bank payout' : 'End-to-end accounting waterfall from buyer checkout to bank payout'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400">Gross: <strong className="text-slate-200">{fmtCurrency(isSold ? actualTotalGross : liveFees?.grossRevenue)}</strong></span>
            <span>→</span>
            <span className="text-slate-400">Proceeds: <strong className="text-slate-200">{fmtCurrency(isSold ? actualNetProceeds : liveFees?.netProceeds)}</strong></span>
            <span>→</span>
            <span className="text-emerald-400 font-bold">Profit: {fmtCurrency(isSold ? actualNetProfit : liveFees?.netProfit)}</span>
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
            {/* 1. Item List / Sale Price */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-200 font-medium flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">+</span> {isSold ? 'Item Final Sold Price' : 'Item Sale / List Price'}
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">{isSold ? 'eBay Final Sale' : 'Asking Price'}</span>
              <span className="col-span-3 text-right font-mono font-bold text-slate-100">{fmtCurrency(isSold ? actualGross : sellPrice)}</span>
            </div>

            {/* 2. Buyer Paid Shipping */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-200 font-medium flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">+</span> Buyer Shipping Inflow
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">
                {isSold ? (actualBuyerShipping > 0 ? 'Charged to Buyer' : 'Free Shipping') : (isFreeShipping ? 'Free Shipping' : 'Charged to Buyer')}
              </span>
              <span className="col-span-3 text-right font-mono font-semibold text-sky-300">
                {isSold ? (actualBuyerShipping > 0 ? `+${fmtCurrency(actualBuyerShipping)}` : '$0.00') : (isFreeShipping ? '$0.00' : `+${fmtCurrency(shippingCharged)}`)}
              </span>
            </div>

            {/* Subtotal: Gross Inflow */}
            <div className="grid grid-cols-12 px-3 py-1.5 items-center bg-slate-900/50 font-semibold text-[11px]">
              <span className="col-span-6 text-slate-300 uppercase tracking-wider">Total Gross Revenue Collected</span>
              <span className="col-span-3 text-right text-slate-500 font-mono">{isSold ? 'Sold + Buyer Ship' : 'List + Buyer Ship'}</span>
              <span className="col-span-3 text-right font-mono font-bold text-white">{fmtCurrency(isSold ? actualTotalGross : liveFees?.grossRevenue)}</span>
            </div>

            {/* 3. Marketplace Final Value Fee */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-300 flex items-center gap-1.5">
                <span className="text-red-400 font-bold">-</span> eBay Final Value Fee (FVF)
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">
                {isSold ? (isReconciled ? 'Reconciled from eBay' : `${(platformFeePct * 100).toFixed(2)}% on gross`) : `${(platformFeePct * 100).toFixed(2)}% on gross`}
              </span>
              <span className="col-span-3 text-right font-mono text-red-300">
                -{fmtCurrency(isSold ? actualFvf : liveFees?.finalValueFee)}
              </span>
            </div>

            {/* 4. Marketplace Flat Order Fee */}
            {!isSold && (
              <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
                <span className="col-span-6 text-slate-300 flex items-center gap-1.5">
                  <span className="text-red-400 font-bold">-</span> eBay Flat Order Fee
                </span>
                <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">Per-order transaction</span>
                <span className="col-span-3 text-right font-mono text-red-300">
                  -{fmtCurrency(platformFlatFee)}
                </span>
              </div>
            )}

            {/* 5. Promoted Listing Ad Fee */}
            {((isSold && actualPromotedFee > 0) || (!isSold && promotedRate > 0)) && (
              <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30 bg-amber-950/10">
                <span className="col-span-6 text-amber-300 flex items-center gap-1.5">
                  <span className="text-red-400 font-bold">-</span> Promoted Listings Ad Fee
                </span>
                <span className="col-span-3 text-right text-amber-400/80 font-mono text-[11px]">
                  {isSold ? (isReconciled ? 'Actual eBay ad fee' : `${promotedRate}% of item price`) : `${promotedRate}% of item price`}
                </span>
                <span className="col-span-3 text-right font-mono text-red-300">
                  -{fmtCurrency(isSold ? actualPromotedFee : liveFees?.promotedFee)}
                </span>
              </div>
            )}

            {/* 6. Outbound Shipping Label Cost */}
            <div className="grid grid-cols-12 px-3 py-2 items-center hover:bg-slate-900/30">
              <span className="col-span-6 text-slate-300 flex items-center gap-1.5">
                <span className="text-red-400 font-bold">-</span> Outbound Shipping Label (Seller Cost)
              </span>
              <span className="col-span-3 text-right text-slate-400 font-mono text-[11px]">
                {isSold ? (isReconciled ? 'eBay shipping label' : 'Actual label expense') : 'Est. label expense'}
              </span>
              <span className="col-span-3 text-right font-mono text-red-300">
                -{fmtCurrency(isSold ? actualShippingLabel : estShippingCost)}
              </span>
            </div>

            {/* Subtotal: Net Proceeds */}
            <div className="grid grid-cols-12 px-3 py-1.5 items-center bg-slate-900/50 font-semibold text-[11px]">
              <span className="col-span-6 text-slate-300 uppercase tracking-wider">Net Payout Proceeds</span>
              <span className="col-span-3 text-right text-slate-500 font-mono">Gross - Fees - Shipping</span>
              <span className="col-span-3 text-right font-mono font-bold text-cyan-300">{fmtCurrency(isSold ? actualNetProceeds : liveFees?.netProceeds)}</span>
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
                {formatPercent(isSold ? actualMarginPct : liveFees?.marginPct, 1)} Margin · {formatPercent(isSold ? actualRoiPct : liveFees?.roiPct, 1)} ROI
              </div>
              <div className="col-span-3 text-right">
                <span className={`text-base font-black font-mono ${
                  (isSold ? actualNetProfit : (liveFees?.netProfit ?? 0)) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(isSold ? actualNetProfit : (liveFees?.netProfit ?? 0)) >= 0 ? `+${fmtCurrency(isSold ? actualNetProfit : liveFees?.netProfit)}` : fmtCurrency(isSold ? actualNetProfit : liveFees?.netProfit)}
                </span>
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

      {/* PILLAR 3: FLOOR COST & BREAK-EVEN SAFETY SPREAD (ONLY WHEN NOT SOLD) */}
      {!isSold && (
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
      )}

      {/* PILLAR 4: SUGGESTED LIST PRICE & PRICING MODELS (ONLY WHEN NOT SOLD) */}
      {!isSold && (
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
      )}
    </div>
  );
}
