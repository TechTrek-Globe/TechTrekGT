import React, { useState } from 'react';
import { X, Link2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { saveEbayListingId } from '../utils/auctionApi';

/**
 * EbayListingIdModal
 *
 * Manual entry modal for assigning an eBay listing ID to an inventory item.
 * Opened from InventoryHubView when the user clicks "Set Listing ID" on a Listed item.
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

  if (!isOpen || !item) return null;

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  const certUrl = item.cert_number ? buildCertUrl(item.authenticator, item.cert_number) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Set eBay Listing ID</h2>
          </div>
          <button id="ebay-lid-modal-close" onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Item summary */}
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
            <div className="text-slate-200 font-semibold line-clamp-2">{item.item_name}</div>
            {item.athlete_person && <div className="text-slate-400">{item.athlete_person}</div>}
            {item.cert_number && (
              <div className="flex items-center gap-1 text-slate-500">
                <span>{item.authenticator}: {item.cert_number}</span>
                {certUrl && (
                  <a href={certUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">
                    Verify
                  </a>
                )}
              </div>
            )}
          </div>

          {/* eBay Listing ID input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300" htmlFor="ebay-listing-id-input">
              eBay Listing ID
              <span className="ml-1 text-slate-500 font-normal">(numeric, e.g. 123456789012)</span>
            </label>
            <input
              id="ebay-listing-id-input"
              type="text"
              inputMode="numeric"
              value={listingId}
              onChange={e => { setListingId(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="Paste from eBay listing URL"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              autoFocus
            />
            <p className="text-[10px] text-slate-500">
              From the eBay URL: ebay.com/itm/<strong>123456789012</strong>
            </p>
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
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
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
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save Listing ID'}
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
