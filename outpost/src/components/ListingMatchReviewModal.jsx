import React, { useState, useMemo } from 'react';
import {
  X, Search, CheckCircle2, AlertTriangle, Loader2,
  ExternalLink, Link2, ShoppingBag, Layers, Filter, Check, ArrowRight, Zap
} from 'lucide-react';
import { saveEbayListingId, syncEbayItem } from '../utils/auctionApi';

/**
 * ListingMatchReviewModal
 *
 * Interactive hub for reviewing auto-matches, selecting eBay listings for unmatched items,
 * and browsing active eBay store listings to link directly to inventory items.
 *
 * Props:
 *   matches   - Array of fuzzy matches from findEbayListings()
 *   matchData - Full payload { matches, ebay_listings, unmatched_items, unmatched_ebay_listings, all_internal_items }
 *   isOpen    - Boolean
 *   onClose   - () => void
 *   onSaved   - (itemId, patch) => void
 */
export function ListingMatchReviewModal({ matches = [], matchData = null, isOpen, onClose, onSaved }) {
  const [activeTab, setActiveTab] = useState('suggested'); // 'suggested' | 'unmatched_items' | 'all_ebay'
  const [states, setStates] = useState({});
  const [itemListingOverrides, setItemListingOverrides] = useState({}); // itemId -> selected ebay_listing
  const [selectingForItemId, setSelectingForItemId] = useState(null); // itemId currently picking a listing for
  const [searchQuery, setSearchQuery] = useState('');

  // Extract datasets from matchData or fallbacks
  const allEbayListings = useMemo(() => matchData?.ebay_listings || [], [matchData]);
  const unmatchedItems = useMemo(() => matchData?.unmatched_items || [], [matchData]);
  const allInternalItems = useMemo(() => matchData?.all_internal_items || [], [matchData]);

  if (!isOpen) return null;

  // Filtered eBay listings for the picker
  const filteredEbayListings = allEbayListings.filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const cleanQ = q.replace(/[^a-z0-9]/g, '');

    if (l.title && l.title.toLowerCase().includes(q)) return true;
    if (l.sku && l.sku.toLowerCase().includes(q)) return true;
    if (l.listing_id && String(l.listing_id).includes(q)) return true;

    const cleanTitle = (l.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanTitle && cleanQ && cleanTitle.includes(cleanQ)) return true;

    const tokens = q.split(/\s+/).filter(t => t.length > 1);
    if (tokens.length > 0 && tokens.every(token => (l.title || '').toLowerCase().includes(token))) {
      return true;
    }

    return false;
  });

  const handleConfirmSuggested = async (match, idx) => {
    const itemId = match.matched_item.id;
    const listingId = match.ebay_listing.listing_id || match.ebay_listing.sku;
    setStates(prev => ({ ...prev, [`suggested_${idx}`]: { saving: true, error: '' } }));

    try {
      const res = await syncEbayItem(itemId, String(listingId), null);
      const updatedItem = res?.item || { ebay_listing_id: String(listingId), platform: 'eBay', current_list_price: match.ebay_listing.price };
      setStates(prev => ({ ...prev, [`suggested_${idx}`]: { saving: false, saved: true } }));
      if (onSaved) onSaved(itemId, updatedItem);
    } catch (e) {
      try {
        await saveEbayListingId(itemId, String(listingId), null, null);
        setStates(prev => ({ ...prev, [`suggested_${idx}`]: { saving: false, saved: true } }));
        if (onSaved) onSaved(itemId, { ebay_listing_id: String(listingId), platform: 'eBay' });
      } catch (err2) {
        setStates(prev => ({ ...prev, [`suggested_${idx}`]: { saving: false, error: err2.message || e.message } }));
      }
    }
  };

  const handleConfirmCustom = async (item, selectedListing, keyPrefix) => {
    const listingId = selectedListing.listing_id || selectedListing.sku;
    setStates(prev => ({ ...prev, [`${keyPrefix}_${item.id}`]: { saving: true, error: '' } }));

    try {
      const res = await syncEbayItem(item.id, String(listingId), null);
      const updatedItem = res?.item || { ebay_listing_id: String(listingId), platform: 'eBay', current_list_price: selectedListing.price };
      setStates(prev => ({ ...prev, [`${keyPrefix}_${item.id}`]: { saving: false, saved: true } }));
      setSelectingForItemId(null);
      if (onSaved) onSaved(item.id, updatedItem);
    } catch (e) {
      try {
        await saveEbayListingId(item.id, String(listingId), null, null);
        setStates(prev => ({ ...prev, [`${keyPrefix}_${item.id}`]: { saving: false, saved: true } }));
        setSelectingForItemId(null);
        if (onSaved) onSaved(item.id, { ebay_listing_id: String(listingId), platform: 'eBay' });
      } catch (err2) {
        setStates(prev => ({ ...prev, [`${keyPrefix}_${item.id}`]: { saving: false, error: err2.message || e.message } }));
      }
    }
  };

  const handleSkip = (key) => {
    setStates(prev => ({ ...prev, [key]: { rejected: true } }));
  };

  const savedCount = Object.values(states).filter(s => s?.saved).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">eBay Listing Match & Discovery</h2>
              <p className="text-[11px] text-slate-400">Pair your active eBay store listings with Outpost inventory</p>
            </div>
          </div>
          <button
            id="lmr-modal-close"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 border-b border-slate-800 bg-slate-950 flex-shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => { setActiveTab('suggested'); setSelectingForItemId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'suggested'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Suggested Matches
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'suggested' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {matches.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('unmatched_items'); setSelectingForItemId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'unmatched_items'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Unmatched Inventory
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'unmatched_items' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {unmatchedItems.length}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('all_ebay'); setSelectingForItemId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                activeTab === 'all_ebay'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              All Active eBay Listings
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'all_ebay' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}>
                {allEbayListings.length}
              </span>
            </button>
          </div>

          {savedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-500/10 px-2.5 py-1 rounded-lg border border-green-500/20">
              <Check className="w-3.5 h-3.5" /> {savedCount} linked
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* TAB 1: SUGGESTED MATCHES */}
          {activeTab === 'suggested' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Review suggested pairs. High-confidence matches ({'>'}80%) are highlighted.
                You can confirm a pair, skip it, or select a different eBay listing.
              </p>

              {matches.map((match, idx) => {
                const key = `suggested_${idx}`;
                const state = states[key] || {};
                if (state.rejected) return null;

                const isPicking = selectingForItemId === match.matched_item.id;
                const activeListing = itemListingOverrides[match.matched_item.id] || match.ebay_listing;
                const isHigh = match.high_confidence && !itemListingOverrides[match.matched_item.id];
                const pct = Math.round(match.confidence * 100);

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3.5 space-y-3 transition-all ${
                      state.saved
                        ? 'border-green-500/30 bg-green-500/5'
                        : isHigh
                          ? 'border-amber-500/30 bg-amber-500/5'
                          : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    {state.saved ? (
                      <div className="flex items-center justify-between text-xs text-green-400">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span>Linked: {match.matched_item.item_name}</span>
                          <span className="text-green-300/70 font-normal">→ eBay #{activeListing.listing_id || activeListing.sku}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                          {/* Internal Item Card */}
                          <div className="md:col-span-5 p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Outpost Inventory</div>
                            <div className="text-xs font-semibold text-white line-clamp-2">{match.matched_item.item_name}</div>
                            {match.matched_item.athlete_person && (
                              <div className="text-[11px] text-slate-400">{match.matched_item.athlete_person}</div>
                            )}
                            {match.matched_item.cert_number && (
                              <div className="text-[10px] text-amber-400/80">
                                {match.matched_item.authenticator}: {match.matched_item.cert_number}
                              </div>
                            )}
                          </div>

                          {/* Confidence / Match Connector */}
                          <div className="md:col-span-2 flex flex-col items-center justify-center text-center py-1">
                            <div className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                              isHigh ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {itemListingOverrides[match.matched_item.id] ? 'MANUAL' : `${pct}%`}
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-600 my-1 hidden md:block" />
                          </div>

                          {/* eBay Listing Card */}
                          <div className="md:col-span-5 p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">eBay Active Listing</span>
                              {activeListing.listing_url && (
                                <a
                                  href={activeListing.listing_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 hover:underline"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" /> View on eBay
                                </a>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-white line-clamp-2">{activeListing.title}</div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span className="text-emerald-400 font-semibold">${activeListing.price?.toFixed(2)}</span>
                              <span>·</span>
                              <span>SKU: {activeListing.sku || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Interactive In-Card Listing Picker */}
                        {isPicking && (
                          <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-300">Select an eBay Listing to Pair</span>
                              <button
                                onClick={() => setSelectingForItemId(null)}
                                className="text-[11px] text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by title, SKU, or listing ID..."
                                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                              {filteredEbayListings.slice(0, 30).map((l, lIdx) => (
                                <button
                                  key={lIdx}
                                  onClick={() => {
                                    setItemListingOverrides(prev => ({ ...prev, [match.matched_item.id]: l }));
                                    setSelectingForItemId(null);
                                    setSearchQuery('');
                                  }}
                                  className="w-full text-left p-2 rounded-lg bg-slate-900 hover:bg-amber-500/10 border border-slate-800 hover:border-amber-500/30 transition-all flex items-center justify-between text-xs"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="font-semibold text-slate-200 truncate">{l.title}</div>
                                    <div className="text-[10px] text-slate-400">SKU: {l.sku} · ID: {l.listing_id || 'Pending'}</div>
                                  </div>
                                  <span className="font-bold text-emerald-400 flex-shrink-0">${l.price?.toFixed(2)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {state.error && (
                          <div className="flex items-center gap-1.5 text-xs text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {state.error}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                          <button
                            onClick={() => {
                              setSelectingForItemId(isPicking ? null : match.matched_item.id);
                              setSearchQuery('');
                            }}
                            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline"
                          >
                            <Search className="w-3 h-3" />
                            {isPicking ? 'Close Picker' : 'Choose Different Listing...'}
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSkip(key)}
                              className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            >
                              Skip
                            </button>
                            <button
                              onClick={() => handleConfirmSuggested(match, idx)}
                              disabled={state.saving}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-sm disabled:opacity-50"
                            >
                              {state.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                              Confirm Link
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {matches.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs bg-slate-900/30 rounded-xl border border-slate-800 space-y-2">
                  <p className="font-semibold text-slate-300">No high-confidence auto matches found.</p>
                  <p className="text-slate-500">Switch to the "Unmatched Inventory" tab to manually link items from your active eBay store listings.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: UNMATCHED INVENTORY */}
          {activeTab === 'unmatched_items' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                These inventory items have status "Listed" or "Available" without an assigned eBay listing ID.
                Click <strong>"Choose eBay Listing"</strong> to select from your live store listings.
              </p>

              {unmatchedItems.map((item, idx) => {
                const key = `unmatched_${item.id}`;
                const state = states[key] || {};
                if (state.rejected) return null;

                const isPicking = selectingForItemId === item.id;
                const chosenListing = itemListingOverrides[item.id];

                return (
                  <div
                    key={item.id || idx}
                    className={`rounded-xl border p-3.5 space-y-3 transition-all ${
                      state.saved
                        ? 'border-green-500/30 bg-green-500/5'
                        : chosenListing
                          ? 'border-amber-500/40 bg-amber-500/5'
                          : 'border-slate-800 bg-slate-900/40'
                    }`}
                  >
                    {state.saved ? (
                      <div className="flex items-center gap-2 text-xs text-green-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Linked: {item.item_name} → eBay #{chosenListing?.listing_id || chosenListing?.sku}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-bold text-white">{item.item_name}</div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              {item.athlete_person && <span>{item.athlete_person}</span>}
                              {item.category && <span>· {item.category}</span>}
                              {item.cert_number && <span className="text-amber-400/80">· {item.authenticator}: {item.cert_number}</span>}
                            </div>
                          </div>

                          {chosenListing ? (
                            <div className="text-right flex-shrink-0">
                              <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                Selected Listing
                              </span>
                              <div className="text-xs font-semibold text-emerald-400 mt-1">${chosenListing.price?.toFixed(2)}</div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectingForItemId(isPicking ? null : item.id);
                                setSearchQuery(item.item_name?.split(' ').slice(0, 3).join(' ') || '');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all flex-shrink-0"
                            >
                              <Search className="w-3.5 h-3.5" />
                              Choose eBay Listing
                            </button>
                          )}
                        </div>

                        {chosenListing && (
                          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                            <div className="truncate pr-2">
                              <div className="font-semibold text-slate-200 truncate">{chosenListing.title}</div>
                              <div className="text-[10px] text-slate-400">SKU: {chosenListing.sku} · ID: {chosenListing.listing_id || 'N/A'}</div>
                            </div>
                            <button
                              onClick={() => {
                                setSelectingForItemId(item.id);
                                setSearchQuery('');
                              }}
                              className="text-[11px] text-amber-400 hover:underline flex-shrink-0"
                            >
                              Change
                            </button>
                          </div>
                        )}

                        {/* Searchable Listing Selector */}
                        {isPicking && (
                          <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2 animate-fade-in">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-300">Pick from Active eBay Store Listings</span>
                              <button
                                onClick={() => setSelectingForItemId(null)}
                                className="text-[11px] text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by title, SKU, or listing ID..."
                                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                              {filteredEbayListings.slice(0, 30).map((l, lIdx) => (
                                <button
                                  key={lIdx}
                                  onClick={() => {
                                    setItemListingOverrides(prev => ({ ...prev, [item.id]: l }));
                                    setSelectingForItemId(null);
                                    setSearchQuery('');
                                  }}
                                  className="w-full text-left p-2 rounded-lg bg-slate-900 hover:bg-amber-500/10 border border-slate-800 hover:border-amber-500/30 transition-all flex items-center justify-between text-xs"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="font-semibold text-slate-200 truncate">{l.title}</div>
                                    <div className="text-[10px] text-slate-400">SKU: {l.sku} · ID: {l.listing_id || 'N/A'}</div>
                                  </div>
                                  <span className="font-bold text-emerald-400 flex-shrink-0">${l.price?.toFixed(2)}</span>
                                </button>
                              ))}
                              {filteredEbayListings.length === 0 && (
                                <div className="text-center py-4 text-slate-500 text-xs">
                                  No eBay listings found matching "{searchQuery}"
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {state.error && (
                          <div className="flex items-center gap-1.5 text-xs text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {state.error}
                          </div>
                        )}

                        {chosenListing && (
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              onClick={() => handleConfirmCustom(item, chosenListing, 'unmatched')}
                              disabled={state.saving}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-sm disabled:opacity-50"
                            >
                              {state.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                              Save & Link Listing ID
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {unmatchedItems.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs bg-slate-900/30 rounded-xl border border-slate-800 space-y-1">
                  <p className="font-semibold text-emerald-400">All available inventory items are already linked!</p>
                  <p className="text-slate-500">No unmapped items found in your inventory.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ALL ACTIVE EBAY LISTINGS */}
          {activeTab === 'all_ebay' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Showing {allEbayListings.length} active listings currently in your eBay store.
                </p>
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Filter store listings..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {filteredEbayListings.map((listing, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-200 truncate">{listing.title}</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>SKU: {listing.sku || 'N/A'}</span>
                        <span>·</span>
                        <span>ID: {listing.listing_id || 'Pending'}</span>
                        <span>·</span>
                        <span>{listing.condition || 'USED'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-bold text-emerald-400 text-sm">${listing.price?.toFixed(2)}</span>
                      {listing.listing_url && (
                        <a
                          href={listing.listing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title="View on eBay"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}

                {filteredEbayListings.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No active listings match your search filter.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-slate-400">
            {savedCount} item{savedCount === 1 ? '' : 's'} linked in this session
          </span>
          <button
            id="lmr-done-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

