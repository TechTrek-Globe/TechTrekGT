import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Zap, ExternalLink, Loader2, CheckCircle2,
  ArrowUpRight, DollarSign, Layers, Tag, Eye, ShoppingCart,
  Clock, ShieldCheck, ChevronDown, ChevronUp, Sparkles, Check,
  X, Search, RefreshCw
} from 'lucide-react';
import { buildEbaySearchUrl, buildStructuredCompQuery } from '../../utils/ebaySearch';
import { fmtCurrency } from '../../utils/formulaPreview';

export function EditTabComps({
  form,
  compsDraft,
  updateCompDraft,
  handleFetchLiveComps,
  handleSaveComps,
  handleLookupEbayItem,
  minSellPrice
}) {
  const [hoveredListing, setHoveredListing] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [activeListingTab, setActiveListingTab] = useState('active');
  const [showAllListings, setShowAllListings] = useState(true);

  // Synchronize activeListingTab when listings change
  useEffect(() => {
    if (compsDraft.sold_comps && compsDraft.sold_comps.length > 0) {
      setActiveListingTab('sold');
    } else if (compsDraft.active_comps && compsDraft.active_comps.length > 0) {
      setActiveListingTab('active');
    }
  }, [compsDraft.sold_comps?.length, compsDraft.active_comps?.length]);

  const defaultStructuredQuery = buildStructuredCompQuery(
    form.item_name,
    form.athlete_person,
    form.category,
    form.authenticator
  );
  const [searchQuery, setSearchQuery] = useState(compsDraft.query_used || defaultStructuredQuery);

  // Sync searchQuery if query_used updates
  useEffect(() => {
    if (compsDraft.query_used) {
      setSearchQuery(compsDraft.query_used);
    }
  }, [compsDraft.query_used]);

  // 1-Click Sold Comp Importer state
  const [soldUrlInput, setSoldUrlInput] = useState('');
  const [targetSoldSlot, setTargetSoldSlot] = useState(() => {
    if (!compsDraft.comp_1) return 'comp_1';
    if (!compsDraft.comp_2) return 'comp_2';
    if (!compsDraft.comp_3) return 'comp_3';
    return 'comp_1';
  });
  const [lookingUpSold, setLookingUpSold] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState(null);

  const soldVals = [compsDraft.comp_1, compsDraft.comp_2, compsDraft.comp_3]
    .filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0)
    .map(Number);
  const soldAvg = soldVals.length > 0 ? soldVals.reduce((a, b) => a + b, 0) / soldVals.length : null;

  const activeVals = [compsDraft.active_comp_1, compsDraft.active_comp_2, compsDraft.active_comp_3]
    .filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0)
    .map(Number);
  const activeAvg = activeVals.length > 0 ? activeVals.reduce((a, b) => a + b, 0) / activeVals.length : null;

  const hasAnyCompData = soldVals.length > 0 || activeVals.length > 0 || Boolean(compsDraft.recommended_list_price);

  const effectiveFloor = parseFloat(form.floor_price) || parseFloat(minSellPrice) || null;
  const floorSpread = compsDraft.recommended_list_price && effectiveFloor
    ? Number(compsDraft.recommended_list_price) - effectiveFloor
    : null;

  const activeSearchQuery = searchQuery.trim() || defaultStructuredQuery;
  const ebaySearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(activeSearchQuery)}&LH_Sold=1&LH_Complete=1`;

  const handleMouseEnter = (listing, e) => {
    if (!listing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 220;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    let top = rect.top - tooltipHeight - 10;

    // Viewport bounds checking
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth - 10) {
      left = window.innerWidth - tooltipWidth - 10;
    }
    if (top < 10) {
      top = rect.bottom + 10;
    }

    setTooltipPos({ top, left });
    setHoveredListing(listing);
  };

  const handleMouseLeave = () => {
    setHoveredListing(null);
  };

  const assignListingToComp = (listing, compKey, itemKey) => {
    if (!listing) return;
    updateCompDraft(compKey, Number(listing.price).toFixed(2));
    if (itemKey) {
      updateCompDraft(itemKey, listing);
    }
  };

  const clearCompSlot = (slot) => {
    updateCompDraft(slot, '');
    updateCompDraft(`${slot}_item`, null);
  };

  const getListingAssignment = (listing) => {
    if (!listing) return null;
    const url = listing.item_url;
    const id = String(listing.ebay_item_id || '');

    // Check sold slots
    for (const num of [1, 2, 3]) {
      const item = compsDraft[`comp_${num}_item`];
      if (item && (
        (id && String(item.ebay_item_id) === id) ||
        (url && item.item_url === url) ||
        (item.title && item.title === listing.title && Number(item.price) === Number(listing.price))
      )) {
        return { type: 'sold', slot: `comp_${num}`, label: `Sold Comp #${num}` };
      }
    }
    // Check active slots
    for (const num of [1, 2, 3]) {
      const item = compsDraft[`active_comp_${num}_item`];
      if (item && (
        (id && String(item.ebay_item_id) === id) ||
        (url && item.item_url === url) ||
        (item.title && item.title === listing.title && Number(item.price) === Number(listing.price))
      )) {
        return { type: 'active', slot: `active_comp_${num}`, label: `Active Comp #${num}` };
      }
    }
    return null;
  };

  const handleImportSold = async (e) => {
    if (e) e.preventDefault();
    const val = soldUrlInput.trim();
    if (!val) {
      setLookupFeedback({ type: 'error', text: 'Please enter an eBay item URL or 12-digit Item ID.' });
      return;
    }
    if (!handleLookupEbayItem) {
      setLookupFeedback({ type: 'error', text: 'eBay item lookup is not available.' });
      return;
    }
    setLookingUpSold(true);
    setLookupFeedback(null);
    try {
      const res = await handleLookupEbayItem(val, targetSoldSlot);
      if (res && res.success) {
        setLookupFeedback({
          type: 'success',
          text: `Imported "${res.detail?.title?.slice(0, 40)}..." ($${Number(res.detail?.price || 0).toFixed(2)}) into ${targetSoldSlot.replace('_', ' ').toUpperCase()}!`
        });
        setSoldUrlInput('');
        // Auto-advance target slot to next empty slot if possible
        if (targetSoldSlot === 'comp_1') setTargetSoldSlot('comp_2');
        else if (targetSoldSlot === 'comp_2') setTargetSoldSlot('comp_3');
      } else {
        setLookupFeedback({ type: 'error', text: 'Could not fetch item details from eBay.' });
      }
    } catch (err) {
      setLookupFeedback({ type: 'error', text: err.message || 'Lookup failed.' });
    } finally {
      setLookingUpSold(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Live Comps Intelligence Auto-Fetch Header */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Live eBay Market Comps Intelligence
            </span>
          </div>
          <a
            href={ebaySearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> View Completed Sales on eBay ↗
          </a>
        </div>

        {/* Search Query Input with Re-fetch */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleFetchLiveComps(searchQuery);
                }
              }}
              placeholder="Structured eBay search query keywords..."
              className="input-field text-xs pl-9 py-2 bg-slate-950 border-slate-700 text-slate-100 font-mono focus:border-amber-400"
            />
          </div>
          <button
            type="button"
            disabled={compsDraft.fetchingLive}
            onClick={() => handleFetchLiveComps(searchQuery)}
            className="px-4 py-2 text-xs rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-amber-500/20 cursor-pointer flex-shrink-0"
          >
            {compsDraft.fetchingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-current" />}
            <span>{compsDraft.fetchingLive ? 'Fetching...' : 'Re-fetch Comps'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-slate-400 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {form.athlete_person && <span className="text-slate-300">👤 {form.athlete_person}</span>}
            {form.category && <span className="text-slate-300">🏷️ {form.category}</span>}
            {form.authenticator && <span className="text-slate-300">🛡️ {form.authenticator}</span>}
          </div>
          <span className="text-slate-400 italic">
            Press Enter or click Re-fetch to search eBay with updated keywords
          </span>
        </div>

        {compsDraft.fetchMsg && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            compsDraft.fetchMsg.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
              : compsDraft.fetchMsg.type === 'error'
              ? 'bg-red-950/40 border border-red-500/30 text-red-300'
              : 'bg-slate-900 border border-slate-800 text-slate-300'
          }`}>
            {compsDraft.fetchMsg.text}
          </div>
        )}
      </div>

      {/* 1-Click Sold Comp Importer */}
      <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-300">Import Sold Comp via eBay Item ID or URL</span>
          </div>
          <a
            href={ebaySearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> View Completed & Sold on eBay ↗
          </a>
        </div>

        <form onSubmit={handleImportSold} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Target Slot Selector */}
          <div className="flex items-center gap-1 bg-slate-950/80 rounded-lg p-1 border border-slate-800 text-[11px] flex-shrink-0">
            <span className="text-slate-400 text-[10px] font-bold px-1.5">Target:</span>
            {['comp_1', 'comp_2', 'comp_3'].map((slot, idx) => (
              <button
                key={slot}
                type="button"
                onClick={() => setTargetSoldSlot(slot)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  targetSoldSlot === slot
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Comp #{idx + 1}
              </button>
            ))}
          </div>

          {/* URL or Item ID Input */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={soldUrlInput}
              onChange={(e) => setSoldUrlInput(e.target.value)}
              placeholder="Paste eBay sold listing URL or 12-digit Item ID (e.g. 336796769215)..."
              className="input-field text-xs py-1.5 px-3 bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-amber-400"
            />
          </div>

          {/* Import Button */}
          <button
            type="submit"
            disabled={lookingUpSold || !soldUrlInput.trim()}
            className="px-3.5 py-1.5 text-xs rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-all disabled:opacity-50 flex-shrink-0 cursor-pointer shadow-sm"
          >
            {lookingUpSold ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            <span>{lookingUpSold ? 'Importing...' : 'Import Comp'}</span>
          </button>
        </form>

        {lookupFeedback && (
          <div className={`p-2 rounded-lg text-[11px] flex items-center justify-between gap-2 ${
            lookupFeedback.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/40 border border-red-500/30 text-red-300'
          }`}>
            <span>{lookupFeedback.text}</span>
            <button
              type="button"
              onClick={() => setLookupFeedback(null)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 3 Sold Comps */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            Recent Sold Comps ($)
          </span>
          <span className="text-[10px] text-slate-400 italic">Select candidates below or paste eBay item above</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(num => {
            const item = compsDraft[`comp_${num}_item`];
            const hasVal = compsDraft[`comp_${num}`] !== '' && compsDraft[`comp_${num}`] != null;
            return (
              <div key={`comp_${num}`} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Sold Comp #{num}
                  </label>
                  <div className="flex items-center gap-1.5">
                    {item && item.sold_date && (
                      <span className="text-[9.5px] text-slate-500 font-mono">
                        {item.sold_date.slice(0, 10)}
                      </span>
                    )}
                    {hasVal && (
                      <button
                        type="button"
                        onClick={() => clearCompSlot(`comp_${num}`)}
                        className="text-[10px] text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors flex items-center gap-0.5"
                        title={`Clear Sold Comp #${num}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={compsDraft[`comp_${num}`] ?? ''}
                    onChange={e => updateCompDraft(`comp_${num}`, e.target.value)}
                    className="input-field text-xs pl-8 font-mono font-bold text-amber-300"
                    placeholder="0.00"
                  />
                </div>

                {/* Attached Listing Preview & Tooltip Trigger */}
                {item ? (
                  <div
                    onMouseEnter={(e) => handleMouseEnter(item, e)}
                    onMouseLeave={handleMouseLeave}
                    className="p-1.5 rounded-lg bg-slate-950/80 border border-amber-500/20 hover:border-amber-500/40 flex items-center justify-between gap-2 transition-colors cursor-help group/comp"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt="Comp Thumbnail"
                          className="w-5 h-5 rounded object-cover border border-slate-700 flex-shrink-0"
                        />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      )}
                      <span className="text-[10px] text-slate-300 truncate group-hover/comp:text-amber-300 font-medium">
                        {item.title}
                      </span>
                    </div>
                    {item.item_url && (
                      <a
                        href={item.item_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-amber-400 hover:text-amber-300 flex-shrink-0 p-0.5 rounded hover:bg-amber-500/10"
                        title="Open eBay listing in new tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-[9.5px] text-slate-600 italic px-1">Import above or choose candidate below</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3 Active Comps */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            Active Listing Comps ($)
          </span>
          <span className="text-[10px] text-slate-400 italic">Click candidate listings below to assign</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(num => {
            const item = compsDraft[`active_comp_${num}_item`];
            const hasVal = compsDraft[`active_comp_${num}`] !== '' && compsDraft[`active_comp_${num}`] != null;
            return (
              <div key={`active_comp_${num}`} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Active Comp #{num}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9.5px] text-cyan-500/80 font-mono">Buy It Now</span>
                    {hasVal && (
                      <button
                        type="button"
                        onClick={() => clearCompSlot(`active_comp_${num}`)}
                        className="text-[10px] text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors flex items-center gap-0.5"
                        title={`Clear Active Comp #${num}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={compsDraft[`active_comp_${num}`] ?? ''}
                    onChange={e => updateCompDraft(`active_comp_${num}`, e.target.value)}
                    className="input-field text-xs pl-8 font-mono font-semibold text-cyan-300"
                    placeholder="0.00"
                  />
                </div>

                {/* Attached Listing Preview & Tooltip Trigger */}
                {item ? (
                  <div
                    onMouseEnter={(e) => handleMouseEnter(item, e)}
                    onMouseLeave={handleMouseLeave}
                    className="p-1.5 rounded-lg bg-slate-950/80 border border-cyan-500/20 hover:border-cyan-500/40 flex items-center justify-between gap-2 transition-colors cursor-help group/comp"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt="Active Comp Thumbnail"
                          className="w-5 h-5 rounded object-cover border border-slate-700 flex-shrink-0"
                        />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      )}
                      <span className="text-[10px] text-slate-300 truncate group-hover/comp:text-cyan-300 font-medium">
                        {item.title}
                      </span>
                    </div>
                    {item.item_url && (
                      <a
                        href={item.item_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-cyan-400 hover:text-cyan-300 flex-shrink-0 p-0.5 rounded hover:bg-cyan-500/10"
                        title="Open active eBay listing in new tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-[9.5px] text-slate-600 italic px-1">Choose candidate listing below</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Valuation Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Sold Average</span>
          <p className="text-sm font-black text-amber-400 mt-0.5 font-mono">
            {soldAvg ? fmtCurrency(soldAvg) : '--'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Average</span>
          <p className="text-sm font-black text-cyan-400 mt-0.5 font-mono">
            {activeAvg ? fmtCurrency(activeAvg) : '--'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Min Floor Price</span>
          <p className="text-sm font-black text-emerald-400 mt-0.5 font-mono">
            {effectiveFloor ? fmtCurrency(effectiveFloor) : '--'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Spread Over Floor</span>
          <p className={`text-sm font-black mt-0.5 font-mono ${
            floorSpread != null
              ? floorSpread >= 0 ? 'text-emerald-400' : 'text-red-400'
              : 'text-slate-500'
          }`}>
            {floorSpread != null ? fmtCurrency(floorSpread) : '--'}
          </p>
        </div>
      </div>

      {/* Recommended Target Price Card with Actions */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-300">Recommended List Price (Comps Target)</span>
          </div>
          <span className="text-[11px] text-amber-400/80">Suggested asking price based on live marketplace comps</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[140px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-xs font-bold pointer-events-none">$</span>
            <input
              type="number"
              step="0.01"
              value={compsDraft.recommended_list_price ?? ''}
              onChange={e => updateCompDraft('recommended_list_price', e.target.value)}
              className="input-field text-sm pl-8 font-black text-amber-400 font-mono bg-slate-900 border-amber-500/40"
              placeholder="0.00"
            />
          </div>

          <button
            type="button"
            disabled={compsDraft.saving || !hasAnyCompData}
            onClick={() => handleSaveComps(false)}
            className="px-3.5 py-2 text-xs rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 flex-shrink-0 cursor-pointer"
          >
            {compsDraft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Comps'}
          </button>

          <button
            type="button"
            disabled={compsDraft.saving || (!compsDraft.recommended_list_price && !soldAvg && !activeAvg)}
            onClick={() => handleSaveComps(true)}
            className={`px-3.5 py-2 text-xs rounded-xl font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 cursor-pointer ${
              compsDraft.applied
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
            }`}
          >
            {compsDraft.applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            <span>{compsDraft.applied ? 'Applied to Item!' : 'Apply to Listing'}</span>
          </button>
        </div>
      </div>

      {/* Live Listings Browser / Selector Accordion */}
      {((compsDraft.sold_comps && compsDraft.sold_comps.length > 0) || (compsDraft.active_comps && compsDraft.active_comps.length > 0)) && (
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-md">
          <div className="p-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> All Fetched eBay Listings
              </span>
              <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 ml-2">
                <button
                  type="button"
                  onClick={() => setActiveListingTab('sold')}
                  className={`px-2.5 py-0.5 rounded text-[10.5px] font-bold transition-colors ${
                    activeListingTab === 'sold'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sold ({compsDraft.sold_comps?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveListingTab('active')}
                  className={`px-2.5 py-0.5 rounded text-[10.5px] font-bold transition-colors ${
                    activeListingTab === 'active'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Active ({compsDraft.active_comps?.length || 0})
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAllListings(!showAllListings)}
              className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 cursor-pointer"
            >
              {showAllListings ? (
                <><span>Collapse</span> <ChevronUp className="w-3.5 h-3.5" /></>
              ) : (
                <><span>Expand</span> <ChevronDown className="w-3.5 h-3.5" /></>
              )}
            </button>
          </div>

          {showAllListings && (
            <div className="p-3 divide-y divide-slate-800/60 max-h-[300px] overflow-y-auto space-y-2">
              {(activeListingTab === 'sold' ? (compsDraft.sold_comps || []) : (compsDraft.active_comps || [])).map((listing, idx) => {
                const assignment = getListingAssignment(listing);
                return (
                  <div
                    key={listing.ebay_item_id || idx}
                    className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs group/item hover:bg-slate-800/30 p-1.5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {listing.image_url ? (
                        <img
                          src={listing.image_url}
                          alt="Thumbnail"
                          className="w-8 h-8 rounded object-cover border border-slate-700 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-[10px] text-slate-500">
                          eBay
                        </div>
                      )}
                      <div className="min-w-0">
                        <a
                          href={listing.item_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-200 font-semibold text-[11px] hover:text-amber-400 truncate block transition-colors flex items-center gap-1"
                          title={listing.title}
                        >
                          <span className="truncate">{listing.title}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-slate-500 flex-shrink-0 opacity-0 group-hover/item:opacity-100" />
                        </a>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span className="font-bold text-amber-400 font-mono">{fmtCurrency(listing.price)}</span>
                          {listing.sold_date && <span>· Sold {listing.sold_date.slice(0, 10)}</span>}
                          {listing.condition && <span>· {listing.condition}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Assign Buttons & Assignment Status */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {assignment && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                          assignment.type === 'sold'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        }`}>
                          <Check className="w-2.5 h-2.5" /> {assignment.label}
                        </span>
                      )}

                      {activeListingTab === 'sold' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => assignListingToComp(listing, 'comp_1', 'comp_1_item')}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                              assignment?.slot === 'comp_1'
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                                : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border-slate-700'
                            }`}
                            title="Assign as Sold Comp #1"
                          >
                            Comp 1
                          </button>
                          <button
                            type="button"
                            onClick={() => assignListingToComp(listing, 'comp_2', 'comp_2_item')}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                              assignment?.slot === 'comp_2'
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                                : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border-slate-700'
                            }`}
                            title="Assign as Sold Comp #2"
                          >
                            Comp 2
                          </button>
                          <button
                            type="button"
                            onClick={() => assignListingToComp(listing, 'comp_3', 'comp_3_item')}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                              assignment?.slot === 'comp_3'
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                                : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border-slate-700'
                            }`}
                            title="Assign as Sold Comp #3"
                          >
                            Comp 3
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => assignListingToComp(listing, 'active_comp_1', 'active_comp_1_item')}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                              assignment?.slot === 'active_comp_1'
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-sm'
                                : 'bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border-slate-700'
                            }`}
                            title="Assign as Active Comp #1"
                          >
                            Active 1
                          </button>
                          <button
                            type="button"
                            onClick={() => assignListingToComp(listing, 'active_comp_2', 'active_comp_2_item')}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                              assignment?.slot === 'active_comp_2'
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-sm'
                                : 'bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border-slate-700'
                            }`}
                            title="Assign as Active Comp #2"
                          >
                            Active 2
                          </button>
                          <button
                            type="button"
                            onClick={() => assignListingToComp(listing, 'active_comp_3', 'active_comp_3_item')}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                              assignment?.slot === 'active_comp_3'
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-sm'
                                : 'bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border-slate-700'
                            }`}
                            title="Assign as Active Comp #3"
                          >
                            Active 3
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Hover Tooltip for Listing Details */}
      {hoveredListing && (
        <div
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
            width: 320,
            zIndex: 99999,
          }}
          className="bg-slate-900/98 border border-amber-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md pointer-events-auto space-y-2 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
              🏷️ Real eBay Listing Comp
            </span>
            <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${
              hoveredListing.type === 'sold'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
            }`}>
              {hoveredListing.type === 'sold' ? 'Sold' : 'Active'}
            </span>
          </div>

          <div className="flex items-start gap-2.5">
            {hoveredListing.image_url ? (
              <img
                src={hoveredListing.image_url}
                alt="Listing"
                className="w-14 h-14 rounded-lg object-cover border border-slate-700 flex-shrink-0 shadow"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-500 text-xs">
                No Img
              </div>
            )}
            <div className="min-w-0 space-y-1 flex-1">
              <p className="text-slate-100 font-bold text-[11px] leading-snug line-clamp-2">
                {hoveredListing.title}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-black font-mono text-amber-400">
                  {fmtCurrency(hoveredListing.price)}
                </span>
                {hoveredListing.sold_date && (
                  <span className="text-[9.5px] text-slate-400 font-mono">
                    {hoveredListing.sold_date.slice(0, 10)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
            <span>{hoveredListing.condition || 'Pre-Owned'}</span>
            {hoveredListing.item_url && (
              <a
                href={hoveredListing.item_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
              >
                View on eBay <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
