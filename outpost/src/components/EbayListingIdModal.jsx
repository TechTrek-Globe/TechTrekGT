import React, { useState, useEffect } from 'react';
import {
  X, Link2, Loader2, AlertCircle, CheckCircle2, Search,
  ShoppingBag, ExternalLink, ChevronDown, ChevronUp, RefreshCw, Zap
} from 'lucide-react';
import { saveEbayListingId, getActiveEbayListings, syncEbayItem } from '../utils/auctionApi';

/**
 * EbayListingIdModal
 *
 * Modal for assigning an eBay listing ID to an inventory item.
 * Supports both manual entry and 1-click selection from live active eBay store listings.
 * Automatically synchronizes live price, listing date, platform fees, and status upon saving.
 *
 * Props:
 *   item     - auction_items row
 *   isOpen   - boolean
 *   onClose  - () => void
 *   onSaved  - (itemId, patch) => void
 */
export function EbayListingIdModal({ item, isOpen, onClose, onSaved }) {
  const [listingId, setListingId] = useState(item?.ebay_listing_id || '');
  const [promotedRate, setPromotedRate] = useState(
    item?.ebay_promoted_rate != null ? String(item.ebay_promoted_rate) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [syncSummary, setSyncSummary] = useState('');

  // Active eBay listings browser state
  const [showBrowser, setShowBrowser] = useState(true);
  const [activeListings, setActiveListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [browserSearch, setBrowserSearch] = useState('');
  const [selectedListing, setSelectedListing] = useState(null);

  useEffect(() => {
    if (isOpen && item) {
      setListingId(item.ebay_listing_id || '');
      setPromotedRate(item.ebay_promoted_rate != null ? String(item.ebay_promoted_rate) : '');
      setError('');
      setFetchError('');
      setSuccess(false);
      setSyncSummary('');
      setSelectedListing(null);

      // Start search empty so all active store listings are visible immediately
      setBrowserSearch('');

      // Fetch active listings on open
      fetchActiveListings();
    }
  }, [isOpen, item]);

  const fetchActiveListings = async () => {
    setLoadingListings(true);
    setFetchError('');
    try {
      const data = await getActiveEbayListings({ limit: 100 });
      setActiveListings(data.listings || []);
    } catch (err) {
      setFetchError(err.message || 'Failed to load eBay store listings.');
      setActiveListings([]);
    } finally {
      setLoadingListings(false);
    }
  };

  if (!isOpen || !item) return null;

  const normalizeStr = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim();

  const filteredListings = activeListings.filter(l => {
    if (!browserSearch.trim()) return true;
    const q = normalizeStr(browserSearch);
    const cleanQ = q.replace(/[^a-z0-9]/g, '');
    const cleanTitle = normalizeStr(l.title);
    const cleanSku = normalizeStr(l.sku);
    const listingId = String(l.listing_id || '').trim();

    // 1. Direct substring in title, sku, or listing_id
    if (cleanTitle.includes(q)) return true;
    if (cleanSku.includes(q)) return true;
    if (listingId.includes(browserSearch.trim())) return true;

    // 2. Normalized alphanumeric match (handles "Superbox" vs "Super Box")
    if (cleanTitle.replace(/\s+/g, '').includes(cleanQ)) return true;

    // 3. Token-based word match (all search words present in title)
    const tokens = q.split(/\s+/).filter(t => t.length > 1);
    if (tokens.length > 0 && tokens.every(token => cleanTitle.includes(token))) {
      return true;
    }

    return false;
  });

  const handleSelectListing = (listing) => {
    const id = listing.listing_id || listing.sku;
    setListingId(String(id));
    setSelectedListing(listing);
    setError('');
  };

  const handleSave = async () => {
    const trimmed = listingId.trim();
    if (!trimmed) { setError('eBay Listing ID is required.'); return; }
    if (!/^\d+$/.test(trimmed)) { setError('eBay Listing ID must be numeric (e.g. 123456789012).'); return; }

    setSaving(true);
    setError('');
    try {
      const rate = promotedRate !== '' ? parseFloat(promotedRate) : null;
      
      // Auto-sync with live eBay listing data
      const res = await syncEbayItem(item.id, trimmed, rate);
      const updatedItem = res?.item || { ebay_listing_id: trimmed, ebay_promoted_rate: rate, platform: 'eBay' };
      
      if (res?.is_sold || res?.sale) {
        const grossVal = res.sale?.gross_sale_price != null ? `$${Number(res.sale.gross_sale_price).toFixed(2)}` : `$${updatedItem.current_list_price?.toFixed(2) || '0.00'}`;
        const netVal = res.sale?.net_proceeds != null ? `$${Number(res.sale.net_proceeds).toFixed(2)}` : '--';
        setSyncSummary(`🎉 Item Sold on eBay! Auto-recorded Sale: ${grossVal} (Net: ${netVal}) · Status: Sold`);
      } else {
        setSyncSummary(`Synced! Price: $${updatedItem.current_list_price?.toFixed(2) || '0.00'} · Platform: eBay · Status: ${updatedItem.status}`);
      }
      setSuccess(true);
      
      if (onSaved) {
        onSaved(item.id, updatedItem);
      }
      setTimeout(() => { setSuccess(false); onClose(); }, 1400);
    } catch (e) {
      // Fallback to basic save if sync fails
      try {
        const rate = promotedRate !== '' ? parseFloat(promotedRate) : null;
        await saveEbayListingId(item.id, trimmed, null, rate);
        setSuccess(true);
        if (onSaved) onSaved(item.id, { ebay_listing_id: trimmed, ebay_promoted_rate: rate, platform: 'eBay' });
        setTimeout(() => { setSuccess(false); onClose(); }, 800);
      } catch (err2) {
        setError(err2.message || e.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const certUrl = item.cert_number ? buildCertUrl(item.authenticator, item.cert_number) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Link eBay Listing ID</h2>
              <p className="text-[11px] text-slate-400">Pair this inventory item with your active eBay listing</p>
            </div>
          </div>
          <button
            id="ebay-lid-modal-close"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Target Item summary */}
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">Target Inventory Item</div>
            <div className="text-slate-200 font-semibold line-clamp-2">{item.item_name}</div>
            <div className="flex items-center gap-2 text-slate-400 text-[11px]">
              {item.athlete_person && <span>{item.athlete_person}</span>}
              {item.cert_number && (
                <span className="text-amber-400/80">
                  · {item.authenticator}: {item.cert_number}
                  {certUrl && (
                    <a href={certUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-amber-400 hover:underline">
                      (Verify)
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Active eBay Listings Browser */}
          <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowBrowser(!showBrowser)}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Select from Active eBay Store Listings
                {activeListings.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {activeListings.length}
                  </span>
                )}
                {showBrowser ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchActiveListings}
                  disabled={loadingListings}
                  className="text-[10px] text-slate-400 hover:text-amber-400 underline transition-colors"
                >
                  Refresh
                </button>
                {loadingListings && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
              </div>
            </div>

            {showBrowser && (
              <div className="space-y-2 pt-1 animate-fade-in">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={browserSearch}
                    onChange={e => setBrowserSearch(e.target.value)}
                    placeholder="Search your store listings by title, SKU, or ID..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  {browserSearch && (
                    <button
                      type="button"
                      onClick={() => setBrowserSearch('')}
                      className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs p-0.5"
                      title="Clear search filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {filteredListings.slice(0, 30).map((listing, idx) => {
                    const isSelected = String(listing.listing_id || listing.sku) === listingId;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectListing(listing)}
                        className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500/50 text-white'
                            : 'bg-slate-900/90 hover:bg-amber-500/10 border-slate-800 hover:border-amber-500/30'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-slate-200 truncate">{listing.title}</div>
                          <div className="text-[10px] text-slate-400">
                            ID: {listing.listing_id || 'N/A'} {listing.sku ? `· SKU: ${listing.sku}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-bold text-emerald-400">${listing.price?.toFixed(2)}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                        </div>
                      </button>
                    );
                  })}

                  {!loadingListings && filteredListings.length === 0 && (
                    <div className="text-center py-4 text-slate-400 text-xs space-y-2">
                      {fetchError ? (
                        <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-left">
                          <div className="font-bold flex items-center gap-1.5 mb-1">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            <span>eBay Listing Discovery Notice</span>
                          </div>
                          <p className="text-[11px]">{fetchError}</p>
                        </div>
                      ) : activeListings.length === 0 ? (
                        <div>
                          <p>No active store listings found on your connected eBay account.</p>
                          <p className="text-[10px] text-slate-500 mt-1">You can enter your 12-digit eBay Listing ID manually below.</p>
                        </div>
                      ) : (
                        <div>
                          <p>No listings match <span className="text-amber-400 font-semibold">"{browserSearch}"</span>.</p>
                          <button
                            type="button"
                            onClick={() => setBrowserSearch('')}
                            className="mt-1 text-[11px] text-amber-400 hover:underline"
                          >
                            Clear filter to view all {activeListings.length} listings
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* eBay Listing ID Manual/Auto Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300" htmlFor="ebay-listing-id-input">
              eBay Listing ID
              <span className="ml-1 text-slate-500 font-normal">(12-digit numeric ID)</span>
            </label>
            <input
              id="ebay-listing-id-input"
              type="text"
              inputMode="numeric"
              value={listingId}
              onChange={e => { setListingId(e.target.value); setError(''); }}
              placeholder="e.g. 395123456789 (or select from above)"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
            {selectedListing && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Auto-Sync Real Listing Details:</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {selectedListing.category_tier || 'eBay Store Item'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300 pt-0.5 border-t border-emerald-500/20">
                  <div>Live Price: <span className="font-bold text-emerald-300">${selectedListing.price?.toFixed(2) || '0.00'}</span></div>
                  <div>Fees: <span className="font-semibold text-amber-300">{selectedListing.platform_fee_pct ? `${(selectedListing.platform_fee_pct * 100).toFixed(2)}% + $${selectedListing.platform_flat_fee?.toFixed(2)}` : '13.25% - 13.5% + $0.40'}</span></div>
                  <div>Shipping: <span className="font-semibold text-sky-300">{selectedListing.is_free_shipping ? 'Free Shipping (Seller Pays)' : `Buyer Pays (${selectedListing.buyer_shipping_cost ? `$${selectedListing.buyer_shipping_cost.toFixed(2)}` : 'Calculated'})`}</span></div>
                  <div>Status: <span className="font-semibold text-emerald-300">{selectedListing.status || 'Listed'}</span></div>
                </div>
                {selectedListing.specifics && (selectedListing.specifics.athlete || selectedListing.specifics.cert_number) && (
                  <div className="pt-1 border-t border-emerald-500/20 text-[10px] text-slate-400 flex flex-wrap gap-x-3">
                    {selectedListing.specifics.athlete && <span>Player: <strong className="text-slate-200">{selectedListing.specifics.athlete}</strong></span>}
                    {selectedListing.specifics.cert_number && <span>Cert: <strong className="text-slate-200">{selectedListing.specifics.cert_number}</strong> {selectedListing.specifics.authenticator ? `(${selectedListing.specifics.authenticator})` : ''}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Promoted Listings rate */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300" htmlFor="ebay-promoted-rate-input">
              Promoted Listings Rate (%)
              <span className="ml-1 text-slate-500 font-normal">optional (e.g. 3.5%)</span>
            </label>
            <input
              id="ebay-promoted-rate-input"
              type="number"
              min="0"
              max="20"
              step="0.5"
              value={promotedRate}
              onChange={e => setPromotedRate(e.target.value)}
              placeholder="e.g. 3.5"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{syncSummary || 'Linked & synchronized successfully!'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-900/60 flex-shrink-0">
          <button
            id="ebay-lid-modal-cancel"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            id="ebay-lid-modal-save"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50 shadow-sm"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Link Listing ID'}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildCertUrl(authenticator, certNumber) {
  if (!authenticator || !certNumber) return null;
  const auth = String(authenticator).toUpperCase();
  const num = String(certNumber).replace(/[^a-zA-Z0-9]/g, '');
  if (auth.includes('JSA')) return `https://www.jsa.net/certificate/${num}`;
  if (auth.includes('PSA')) return `https://www.psacard.com/cert/${num}`;
  if (auth.includes('BECKETT') || auth.includes('BAS')) return `https://www.beckett.com/autographs/certificate/${num}`;
  if (auth.includes('SGC')) return `https://www.sgccard.com/verify/${num}`;
  return null;
}

