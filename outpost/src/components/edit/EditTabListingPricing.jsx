import React, { useState, useMemo } from 'react';
import {
  ShoppingBag, ExternalLink, RefreshCw, Loader2,
  CheckCircle2, Search, X, Calendar, DollarSign, Unlink, Link2,
  Zap, Percent, ShieldCheck, ShieldAlert, Truck, ListChecks, ArrowRight, Lock,
  TrendingUp, Info, Sparkles, Edit2
} from 'lucide-react';
import { ALL_STATUSES, LISTING_FORMATS, LISTING_STATUSES } from '../../utils/constants';
import { LiveFeeReadout } from './LiveFeeReadout';
import { computeTargetPriceFromMargin } from '../../utils/feeEngine';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { MarginHealthBadge } from '../inventory/MarginHealthBadge';

export function EditTabListingPricing({
  form,
  updateField,
  allPlatforms = [],
  onPlatformChange,
  handleSyncWithEbay,
  syncingEbay,
  ebayListings = [],
  loadingEbayListings = false,
  ebaySearch = '',
  setEbaySearch,
  liveFees,
  fetchActiveListings,
  handlePairEbayListing,
  item
}) {
  const isSold = form.status === 'Sold';
  const isEbaySynced = Boolean(form.ebay_listing_id);
  const shippingCharged = parseFloat(form.buyer_shipping_cost || form.shipping_charged || 0) || 0;
  const isFreeShipping = shippingCharged === 0;

  // Pairing workflow states
  const [pairingMode, setPairingMode] = useState('browse'); // 'browse' | 'manual'
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [isPairingManual, setIsPairingManual] = useState(false);
  const [showChangePicker, setShowChangePicker] = useState(false);

  // Compute suggested target price from target margin
  const cogs = parseFloat(form.true_total_cost) || parseFloat(form.unit_price) || 0;
  const targetMarginPct = (parseFloat(form.target_margin_pct) || 15) / 100;
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
    flatFee,
    shippingCharged
  );

  // Robust string normalizer: strips accents (e.g. Acuña -> Acuna) and removes punctuation
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

    // 1. Identify suggested match when no query is typed
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

      // 1. Direct 12-digit ID match
      if (detectedId && listingId === detectedId) {
        score += 500;
      } else if (rawQ && listingId.includes(rawQ)) {
        score += 300;
      }

      // 2. Exact or partial SKU match
      if (itemSku && listingSku === itemSku) {
        score += 400;
      } else if (listingSku && normalizedQ && (listingSku.includes(normalizedQ) || normalizedQ.includes(listingSku))) {
        score += 200;
      }

      // 3. Normalized phrase match
      if (listingTitle.includes(normalizedQ)) {
        score += 150;
      }

      // 4. Token-based word matches
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
      {/* 1. MARKETPLACE CHANNEL & EBAY SYNC HEADER                                */}
      {/* ========================================================================= */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Marketplace Channel & Listing Connection
            </span>
          </div>
          {isEbaySynced && (
            <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              eBay Item #{form.ebay_listing_id}
            </span>
          )}
        </div>

        {isEbaySynced && !showChangePicker ? (
          /* CONNECTED STATE */
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0">
              {(form.ebay_image_url || form.image_url) && (
                <div className="w-12 h-12 rounded-lg bg-slate-950 border border-emerald-500/30 overflow-hidden flex-shrink-0">
                  <img
                    src={form.ebay_image_url || form.image_url}
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
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Sync title, price, status, shipping and ad rate from live eBay API"
              >
                {syncingEbay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{syncingEbay ? 'Syncing...' : 'Sync Live Data'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowChangePicker(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-400 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1"
                title="Change or re-pair eBay listing"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Change</span>
              </button>

              <button
                type="button"
                onClick={() => updateField('ebay_listing_id', '')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/20 transition-all flex items-center gap-1"
                title="Unlink eBay Item ID"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Unlink</span>
              </button>
            </div>
          </div>
        ) : (
          /* PAIRING WORKFLOW HUB */
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
                    className="text-[11px] text-slate-400 hover:text-white underline ml-2"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Mode Switcher & Refresh Button */}
              <div className="flex items-center gap-1.5">
                <div className="p-0.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center text-xs">
                  <button
                    type="button"
                    onClick={() => setPairingMode('browse')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
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
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      pairingMode === 'manual'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Enter ID / URL
                  </button>
                </div>

                {fetchActiveListings && (
                  <button
                    type="button"
                    disabled={loadingEbayListings}
                    onClick={() => fetchActiveListings()}
                    className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-50"
                    title="Reload active eBay store listings"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingEbayListings ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* MODE A: BROWSE & SEARCH STORE LISTINGS */}
            {pairingMode === 'browse' && (
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={ebaySearch}
                    onChange={e => setEbaySearch(e.target.value)}
                    placeholder="Search by athlete, title, SKU, or paste eBay Item ID..."
                    className="w-full pl-8 pr-20 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    {hasSearchQuery && (
                      <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {filteredListings.length} found
                      </span>
                    )}
                    {ebaySearch && (
                      <button
                        type="button"
                        onClick={() => setEbaySearch('')}
                        className="text-slate-500 hover:text-slate-300 text-xs p-0.5"
                        title="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Detected ID Quick-Pair Shortcut if user typed/pasted a 12-digit number */}
                {detectedIdMatch && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs">
                    <span className="text-amber-300 font-medium">
                      Detected eBay Item ID: <strong className="text-white font-mono">#{detectedIdMatch}</strong>
                    </span>
                    <button
                      type="button"
                      disabled={syncingEbay}
                      onClick={() => executePair(detectedIdMatch)}
                      className="px-3 py-1 rounded-md font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors flex items-center gap-1 text-[11px]"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Pair ID #{detectedIdMatch}</span>
                    </button>
                  </div>
                )}

                {loadingEbayListings ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                    <span>Loading active eBay store listings...</span>
                  </div>
                ) : (
                  <>
                    {/* Zero-result empty state banner with fail-safe fallback */}
                    {hasSearchQuery && filteredListings.length === 0 && (
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-center space-y-2">
                        <p className="text-xs text-slate-300">
                          No active listings matched <strong className="text-amber-400">"{ebaySearch}"</strong>
                        </p>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setEbaySearch('')}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                          >
                            Clear search to show all {ebayListings.length} listings
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPairingMode('manual');
                              const extracted = extractEbayId(ebaySearch);
                              if (extracted) setManualInput(extracted);
                            }}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                          >
                            Enter Item ID manually
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Top Suggested Match Highlight Card (When detected and no active search) */}
                    {!hasSearchQuery && suggestedMatch && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            <span>✨ Suggested Match for "{item?.athlete_person || item?.item_name || 'This Item'}"</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
                            Top Match
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 text-xs bg-slate-950/70 p-2.5 rounded-lg border border-amber-500/20">
                          {/* Photo */}
                          <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                            {suggestedMatch.image_url ? (
                              <img
                                src={suggestedMatch.image_url}
                                alt={suggestedMatch.title}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <ShoppingBag className="w-5 h-5 text-slate-500" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-semibold text-white truncate text-xs">{suggestedMatch.title}</p>
                            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300 flex-wrap">
                              <span>ID: <strong className="text-amber-300">#{suggestedMatch.listing_id}</strong></span>
                              {suggestedMatch.sku && <span>SKU: <strong className="text-slate-200">{suggestedMatch.sku}</strong></span>}
                              {suggestedMatch.price != null && (
                                <span className="text-emerald-400 font-bold">${Number(suggestedMatch.price).toFixed(2)}</span>
                              )}
                              {suggestedMatch.is_free_shipping ? (
                                <span className="text-blue-400 font-medium">Free Shipping</span>
                              ) : suggestedMatch.buyer_shipping_cost > 0 ? (
                                <span className="text-slate-400">+${Number(suggestedMatch.buyer_shipping_cost).toFixed(2)} Ship</span>
                              ) : null}
                              {suggestedMatch.promoted_rate > 0 && (
                                <span className="text-amber-400 font-semibold">{suggestedMatch.promoted_rate}% Ad</span>
                              )}
                            </div>
                          </div>

                          {/* 1-Click Pair Button */}
                          <button
                            type="button"
                            disabled={syncingEbay}
                            onClick={() => executePair(suggestedMatch)}
                            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 flex-shrink-0 shadow-md disabled:opacity-50"
                          >
                            <Link2 className="w-4 h-4" />
                            <span>Pair This Match</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Listings Display: shows filtered listings or all listings if search is empty/fallback */}
                    {((hasSearchQuery && filteredListings.length > 0) || (!hasSearchQuery && ebayListings.length > 0) || (hasSearchQuery && filteredListings.length === 0 && ebayListings.length > 0)) && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between pt-1">
                          <span>{hasSearchQuery ? `Filtered Listings (${filteredListings.length}):` : `All Active Store Listings (${ebayListings.length}):`}</span>
                          {!hasSearchQuery && (
                            <span className="text-[10px] text-slate-500 lowercase font-normal">showing all active items in your eBay store</span>
                          )}
                        </div>
                        <div className="max-h-64 sm:max-h-72 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                          {(hasSearchQuery && filteredListings.length > 0 ? filteredListings : ebayListings)
                            .slice(0, 50)
                            .map(l => {
                              const itemSku = (form.sku || item?.sku || '').trim().toLowerCase();
                              const listingSku = (l.sku || '').trim().toLowerCase();
                              const isExactSku = Boolean(itemSku && listingSku && itemSku === listingSku);

                              return (
                                <div
                                  key={l.listing_id || l.sku}
                                  className={`p-3 rounded-xl bg-slate-900/90 hover:bg-slate-850 border transition-all flex items-center justify-between gap-3 text-xs ${
                                    isExactSku ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 hover:border-slate-700'
                                  }`}
                                >
                                  {/* Listing Photo Thumbnail */}
                                  <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                    {l.image_url ? (
                                      <img
                                        src={l.image_url}
                                        alt={l.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <ShoppingBag className="w-5 h-5 text-slate-600" />
                                    )}
                                  </div>

                                  {/* Listing Info */}
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-semibold text-slate-100 truncate">{l.title}</p>
                                      {isExactSku && (
                                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                          SKU Match
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2.5 text-[11px] text-slate-400 font-mono flex-wrap">
                                      <span className="text-slate-300">ID: <strong className="text-white">#{l.listing_id}</strong></span>
                                      {l.sku && <span>SKU: <strong className="text-amber-300">{l.sku}</strong></span>}
                                      {l.price != null && (
                                        <span className="text-emerald-400 font-bold">${Number(l.price).toFixed(2)}</span>
                                      )}
                                      {l.is_free_shipping ? (
                                        <span className="text-blue-400 font-medium">Free Shipping</span>
                                      ) : l.buyer_shipping_cost > 0 ? (
                                        <span className="text-slate-400">+${Number(l.buyer_shipping_cost).toFixed(2)} Ship</span>
                                      ) : null}
                                      {l.promoted_rate > 0 && (
                                        <span className="text-amber-400 font-semibold">{l.promoted_rate}% Ad</span>
                                      )}
                                      {l.listing_id && (
                                        <a
                                          href={`https://www.ebay.com/itm/${l.listing_id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-amber-400 hover:text-amber-300 underline font-sans text-[10px] flex items-center gap-0.5"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="w-2.5 h-2.5" /> View on eBay ↗
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {/* Pair Button */}
                                  <button
                                    type="button"
                                    disabled={syncingEbay}
                                    onClick={() => executePair(l)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 flex-shrink-0 shadow-sm disabled:opacity-50"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                    <span>Pair with Item</span>
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {ebayListings.length === 0 && (
                      <div className="py-6 text-center text-xs text-slate-400 space-y-2">
                        <p>No active listings returned from your eBay store.</p>
                        <p className="text-[11px] text-slate-500">
                          If this item was listed recently, click the refresh button above or switch to "Enter ID / URL" mode.
                        </p>
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
                    Paste the 12-digit numeric Item ID (e.g. <span className="font-mono text-slate-300">196351234567</span>) or the full eBay listing URL from your browser address bar.
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
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
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
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. CORE FINANCIAL & PRICING COMMAND CENTER                                */}
      {/* ========================================================================= */}
      {isEbaySynced ? (
        /* CONNECTED VIEW: Clean 2-column card with Live eBay Data on left, Editable Dials on right */
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Live Pricing & Profit Economics
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Channel: <strong className="text-slate-200">eBay Store</strong></span>
              <span>•</span>
              <span>Listing: <strong className="text-emerald-400">{form.status || 'Active'}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Real-Time Live eBay Stream (Read-Only) */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span>Live Stream from eBay</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Auto-Synced
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">List Price</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {form.current_list_price ? `$${Number(form.current_list_price).toFixed(2)}` : '$0.00'}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Buyer Shipping</span>
                  <span className="text-xs font-mono font-semibold text-sky-300">
                    {isFreeShipping ? 'Free' : `+$${Number(shippingCharged).toFixed(2)}`}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Promoted Ad</span>
                  <span className="text-xs font-mono font-bold text-amber-300">
                    {Number(form.ebay_promoted_rate || 0) > 0 ? `${form.ebay_promoted_rate}%` : '0%'}
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 pt-0.5">
                Total Gross Revenue collected: <strong className="text-slate-300 font-mono">${(Number(form.current_list_price || 0) + shippingCharged).toFixed(2)}</strong> (subject to platform final value fees).
              </p>
            </div>

            {/* Right: Seller Cost & Margin Controls (The 2 Editable Dials) */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Seller Assumptions & Goals</span>
                </span>
                <span className="text-[10px] text-slate-400">Editable Inputs</span>
              </div>

              <div className="space-y-2.5">
                {/* Est. Outbound Label Cost */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Est. Outbound Label Cost ($)</span>
                    <span className="text-[10px] text-amber-400/90 font-mono">
                      {shippingCost > 0 ? `-$${Number(shippingCost).toFixed(2)} Expense` : '$0.00'}
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="relative flex-1 min-w-[80px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.est_shipping_cost ?? ''}
                        onChange={e => updateField('est_shipping_cost', e.target.value)}
                        className="input-field text-xs pl-6 font-mono text-white bg-slate-900 border-slate-700"
                        placeholder="0.00"
                      />
                    </div>
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
                          className={`px-2 py-1 text-[10px] font-bold rounded border transition-all ${
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
                </div>

                {/* Target Profit Margin */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Target Profit Margin (%)</span>
                    {targetAskingPrice > 0 && (
                      <span className="text-[10px] text-cyan-300 font-mono">
                        Target Price: <strong>{fmtCurrency(targetAskingPrice)}</strong>
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.target_margin_pct ?? ''}
                      onChange={e => updateField('target_margin_pct', e.target.value)}
                      className="input-field text-xs pr-8 font-mono text-blue-300 font-bold bg-slate-900 border-slate-700"
                      placeholder="30"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Embedded Real-Time Fee & Margin Engine Readout */}
          <LiveFeeReadout liveFees={liveFees} />
        </div>
      ) : (
        /* UNCONNECTED VIEW: Full Manual Pricing & Strategy */
        <div className="space-y-4">
          {/* Status, Format & Platform Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-amber-400" />
                <span>Inventory Status</span>
              </label>
              <select
                value={form.status}
                onChange={e => updateField('status', e.target.value)}
                className="input-field text-xs font-semibold text-white"
              >
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Listing Format</label>
              <select
                value={form.listing_format || 'Fixed Price'}
                onChange={e => updateField('listing_format', e.target.value)}
                className="input-field text-xs font-semibold text-slate-200"
              >
                {LISTING_FORMATS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Marketplace Status</label>
              <select
                value={form.listing_status || (form.status === 'Listed' ? 'Active' : form.status === 'Sold' ? 'Sold' : 'Draft')}
                onChange={e => updateField('listing_status', e.target.value)}
                className="input-field text-xs font-semibold text-slate-200"
              >
                {LISTING_STATUSES.map(ls => (
                  <option key={ls} value={ls}>{ls}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Sales Platform</label>
              <select
                value={form.platform || ''}
                onChange={e => onPlatformChange(e.target.value)}
                className="input-field text-xs font-semibold text-amber-300"
              >
                <option value="">-- Select Platform --</option>
                {allPlatforms.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing Strategy Grid */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Pricing Strategy</span>
              </div>
              {targetAskingPrice > 0 && (
                <button
                  type="button"
                  onClick={() => updateField('current_list_price', targetAskingPrice.toFixed(2))}
                  className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all hover:bg-amber-500/20"
                  title="Apply target asking price to active price"
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

          {/* Shipping & Ad Rate Strategy */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Shipping Strategy & Ad Rate
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Buyer Shipping */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 flex items-center justify-between flex-wrap gap-1">
                  <span>Shipping Charged to Buyer ($)</span>
                  <span className={`text-[10px] font-semibold ${isFreeShipping ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {isFreeShipping ? 'Free to Buyer' : `+$${Number(shippingCharged).toFixed(2)} Revenue`}
                  </span>
                </label>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {['0.00', '4.50', '8.50', '15.95'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateField('buyer_shipping_cost', val)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
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

              {/* Outbound Label Cost */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Est. Outbound Label Cost ($)</span>
                  <span className="text-[10px] text-amber-400/90 font-mono">
                    {shippingCost > 0 ? `-$${Number(shippingCost).toFixed(2)} Expense` : '$0.00 (No Label)'}
                  </span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['0.00', '4.50', '8.50', '15.95'].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updateField('est_shipping_cost', val, true)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                        shippingCost === parseFloat(val)
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

            {/* Target Margin & Promoted Ad Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
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
                    className="input-field text-xs pr-8 font-mono text-blue-300 font-bold"
                    placeholder="15"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                </div>
              </div>

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
                    className="input-field text-xs pr-8 font-mono text-amber-300 font-bold"
                    placeholder="0.0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Embedded Real-Time Fee & Margin Engine Readout */}
          <LiveFeeReadout liveFees={liveFees} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. LIFECYCLE DATES & SOLD SETTLEMENT                                      */}
      {/* ========================================================================= */}
      <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Date Listed on Marketplace</span>
            </label>
            <input
              type="date"
              value={form.date_listed || ''}
              onChange={e => updateField('date_listed', e.target.value)}
              className="input-field text-xs text-slate-200"
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
              className="input-field text-xs text-slate-200"
            />
          </div>
        </div>

        {/* Conditional Sold Settlement Price */}
        {isSold && (
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-1.5 animate-fade-in">
            <label className="block text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Actual Realized Sale Price ($)</span>
            </label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.actual_sell_price || ''}
                onChange={e => updateField('actual_sell_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-emerald-300 font-black bg-slate-900 border-emerald-500/50"
                placeholder="0.00"
              />
            </div>
            <p className="text-[10px] text-slate-400">
              Gross sale price recorded in historical sales analytics and ROI reports.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
