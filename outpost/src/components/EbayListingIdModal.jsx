import React, { useState, useEffect } from 'react';
import {
  X, Link2, Loader2, AlertCircle, CheckCircle2, Search,
  ShoppingBag, ExternalLink, ChevronDown, ChevronUp
} from 'lucide-react';
import { saveEbayListingId, getActiveEbayListings } from '../utils/auctionApi';

/**
 * EbayListingIdModal
 *
 * Modal for assigning an eBay listing ID to an inventory item.
 * Supports both manual entry and 1-click selection from live active eBay store listings.
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

  // Active eBay listings browser state
  const [showBrowser, setShowBrowser] = useState(true);
  const [activeListings, setActiveListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [browserSearch, setBrowserSearch] = useState('');
  const [selectedListingTitle, setSelectedListingTitle] = useState('');

  useEffect(() => {
    if (isOpen && item) {
      setListingId(item.ebay_listing_id || '');
      setPromotedRate(item.ebay_promoted_rate != null ? String(item.ebay_promoted_rate) : '');
      setError('');
      setSuccess(false);

      // Auto-populate search with first few words of item name
      const initialQuery = item.item_name ? item.item_name.split(' ').slice(0, 3).join(' ') : '';
      setBrowserSearch(initialQuery);

      // Fetch active listings on open
      fetchActiveListings();
    }
  }, [isOpen, item]);

  const fetchActiveListings = async () => {
    setLoadingListings(true);
    try {
      const data = await getActiveEbayListings({ limit: 100 });
      setActiveListings(data.listings || []);
    } catch (_) {
      // Non-fatal if offline or not connected
      setActiveListings([]);
    } finally {
      setLoadingListings(false);
    }
  };

  if (!isOpen || !item) return null;

  const filteredListings = activeListings.filter(l => {
    if (!browserSearch.trim()) return true;
    const q = browserSearch.toLowerCase();
    return (
      (l.title && l.title.toLowerCase().includes(q)) ||
      (l.sku && l.sku.toLowerCase().includes(q)) ||
      (l.listing_id && String(l.listing_id).includes(q))
    );
  });

  const handleSelectListing = (listing) => {
    const id = listing.listing_id || listing.sku;
    setListingId(String(id));
    setSelectedListingTitle(listing.title || '');
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
      const certUrl = item.cert_number
        ? buildCertUrl(item.authenticator, item.cert_number)
        : null;

      await saveEbayListingId(item.id, trimmed, certUrl, rate);
      setSuccess(true);
      if (onSaved) onSaved(item.id, {
        ebay_listing_id: trimmed,
        cert_verification_url: certUrl,
        ebay_promoted_rate: rate
      });
      setTimeout(() => { setSuccess(false); onClose(); }, 800);
    } catch (e) {
      setError(e.message || 'Save failed');
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

          {/* Interactive Active Listings Browser Section */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowBrowser(!showBrowser)}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Select from Active eBay Store Listings
                {showBrowser ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {loadingListings && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
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
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
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
                    <div className="text-center py-4 text-slate-500 text-xs">
                      {activeListings.length === 0
                        ? 'No active store listings found. Connect your account or enter ID manually below.'
                        : `No listings match "${browserSearch}"`}
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
            {selectedListingTitle && (
              <p className="text-[11px] text-amber-300/80 truncate">
                Selected: {selectedListingTitle}
              </p>
            )}
          </div>

          {/* Promoted Listings rate */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300" htmlFor="ebay-promoted-rate-input">
              Promoted Listings Rate (%)
              <span className="ml-1 text-slate-500 font-normal">optional</span>
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
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved successfully!
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

