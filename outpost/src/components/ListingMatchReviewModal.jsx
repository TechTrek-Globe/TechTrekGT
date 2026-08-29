import React, { useState } from 'react';
import {
  X, Search, CheckCircle2, AlertTriangle, Loader2,
  ExternalLink, ChevronDown, Link2
} from 'lucide-react';
import { saveEbayListingId } from '../utils/auctionApi';

/**
 * ListingMatchReviewModal
 *
 * Displays fuzzy-matched eBay listing <-> internal item pairs for user confirmation.
 * Opened from EbayConnectBanner after "Find Listings" returns results.
 *
 * No writes happen until user clicks "Confirm" on individual pairs.
 * Each row can be accepted, rejected, or reassigned to an alternative match.
 *
 * Props:
 *   matches   - array from findEbayListings() response
 *   isOpen    - boolean
 *   onClose   - () => void
 *   onSaved   - (itemId, patch) => void
 */
export function ListingMatchReviewModal({ matches, isOpen, onClose, onSaved }) {
  const [states, setStates] = useState(() =>
    Object.fromEntries((matches || []).map((m, i) => [i, { saving: false, saved: false, rejected: false, error: '' }]))
  );

  if (!isOpen) return null;

  const pendingMatches = (matches || []).filter((_, i) => !states[i]?.saved && !states[i]?.rejected);

  const handleConfirm = async (match, idx) => {
    setStates(prev => ({ ...prev, [idx]: { ...prev[idx], saving: true, error: '' } }));
    try {
      await saveEbayListingId(
        match.matched_item.id,
        match.ebay_listing.listing_id,
        null,
        null
      );
      setStates(prev => ({ ...prev, [idx]: { ...prev[idx], saving: false, saved: true } }));
      if (onSaved) onSaved(match.matched_item.id, { ebay_listing_id: match.ebay_listing.listing_id });
    } catch (e) {
      setStates(prev => ({ ...prev, [idx]: { ...prev[idx], saving: false, error: e.message } }));
    }
  };

  const handleReject = (idx) => {
    setStates(prev => ({ ...prev, [idx]: { ...prev[idx], rejected: true } }));
  };

  const savedCount = Object.values(states).filter(s => s.saved).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">eBay Listing Matches</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {matches?.length || 0} found
            </span>
          </div>
          <button id="lmr-modal-close" onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stats bar */}
        {savedCount > 0 && (
          <div className="px-5 py-2 bg-green-500/5 border-b border-green-500/20 text-xs text-green-400 flex items-center gap-1.5 flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> {savedCount} listing{savedCount > 1 ? 's' : ''} linked successfully
          </div>
        )}

        <p className="px-5 py-3 text-xs text-slate-400 flex-shrink-0">
          Review each suggested match. High confidence matches ({'>'}80%) are pre-highlighted.
          Confirm only pairs you are sure about - no data is written until you click Confirm.
        </p>

        {/* Match list */}
        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-3">
          {(matches || []).map((match, idx) => {
            const state = states[idx] || {};
            if (state.rejected) return null;

            const isHigh = match.high_confidence;
            const pct = Math.round(match.confidence * 100);

            return (
              <div
                key={idx}
                className={`rounded-xl border p-3 space-y-2 transition-all ${
                  state.saved
                    ? 'border-green-500/30 bg-green-500/5'
                    : isHigh
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-slate-700 bg-slate-900/50'
                }`}
              >
                {state.saved ? (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="font-semibold">Linked: {match.matched_item.item_name}</span>
                    <span className="text-green-300/60">→ eBay #{match.ebay_listing.listing_id}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      {/* eBay side */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">eBay Listing</div>
                        <div className="text-xs font-semibold text-white line-clamp-2">{match.ebay_listing.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-slate-400">
                            ${match.ebay_listing.price?.toFixed(2)} · {match.ebay_listing.condition || 'Unknown cond.'}
                          </span>
                          {match.ebay_listing.listing_url && (
                            <a href={match.ebay_listing.listing_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 hover:underline">
                              <ExternalLink className="w-2.5 h-2.5" /> View
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Confidence badge */}
                      <div className={`flex-shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold text-center ${
                        isHigh ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {pct}%<br />
                        <span className="text-[9px] font-normal">{isHigh ? 'HIGH' : 'MED'}</span>
                      </div>

                      {/* Item side */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Internal Item</div>
                        <div className="text-xs font-semibold text-white line-clamp-2">{match.matched_item.item_name}</div>
                        {match.matched_item.athlete_person && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{match.matched_item.athlete_person}</div>
                        )}
                        {match.matched_item.cert_number && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {match.matched_item.authenticator}: {match.matched_item.cert_number}
                          </div>
                        )}
                      </div>
                    </div>

                    {state.error && (
                      <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {state.error}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        id={`lmr-reject-${idx}`}
                        onClick={() => handleReject(idx)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                      >
                        Skip
                      </button>
                      <button
                        id={`lmr-confirm-${idx}`}
                        onClick={() => handleConfirm(match, idx)}
                        disabled={state.saving}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50"
                      >
                        {state.saving
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Link2 className="w-3 h-3" />
                        }
                        Confirm
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {matches?.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No matches found. Make sure items have status "Listed" and no listing ID assigned.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-slate-500">
            {pendingMatches.length} remaining · {savedCount} linked
          </span>
          <button
            id="lmr-done-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
