import React, { useState } from 'react';
import { AlertTriangle, X, ShoppingCart, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { resolveDelistPending } from '../utils/auctionApi';

/**
 * DelistPendingAlert
 *
 * High-visibility dismissible alert rendered at the top of InventoryHubView
 * when one or more items have status = 'delist_pending'.
 *
 * These items were sold on eBay (ITEM_SOLD webhook received) but may still
 * be listed on COMC, MySlabs, or other platforms.
 *
 * Props:
 *   items   - array of auction_items rows with status === 'delist_pending'
 *   onResolved(itemId) - called after user clicks "Mark as Sold" on an item
 *   onDismiss() - called when the user dismisses the banner
 */
export function DelistPendingAlert({ items, onResolved, onDismiss }) {
  const [resolvingId, setResolvingId] = useState(null);
  const [resolvedIds, setResolvedIds] = useState(new Set());

  if (!items || items.length === 0) return null;

  const activeItems = items.filter(it => !resolvedIds.has(it.id));
  if (activeItems.length === 0) return null;

  const handleMarkSold = async (item) => {
    setResolvingId(item.id);
    try {
      await resolveDelistPending(item.id);
      setResolvedIds(prev => new Set([...prev, item.id]));
      if (onResolved) onResolved(item.id);
    } catch (e) {
      alert(`Failed to mark as sold: ${e.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  const otherPlatforms = (item) => {
    try {
      const parsed = JSON.parse(item.other_platform_listing_ids || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  };

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 space-y-3 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          </div>
          <span className="text-sm font-bold text-amber-300">
            {activeItems.length} Item{activeItems.length > 1 ? 's' : ''} Sold on eBay - Delist Required
          </span>
        </div>
        {onDismiss && (
          <button
            id="delist-banner-dismiss"
            onClick={onDismiss}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <p className="text-xs text-amber-200/70">
        eBay sent an <strong>ITEM_SOLD</strong> webhook for the items below.
        De-list them from any other platforms (COMC, MySlabs, etc.) to prevent double-selling,
        then click "Mark as Sold."
      </p>

      {/* Item list */}
      <div className="space-y-2">
        {activeItems.map(item => {
          const platforms = otherPlatforms(item);
          return (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-950/60 border border-amber-500/20"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs font-semibold text-white truncate">{item.item_name}</div>
                {item.athlete_person && (
                  <div className="text-[10px] text-slate-400">{item.athlete_person}</div>
                )}
                {item.ebay_listing_id && (
                  <a
                    href={`https://www.ebay.com/itm/${item.ebay_listing_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:underline"
                  >
                    <ExternalLink className="w-2.5 h-2.5" /> eBay #{item.ebay_listing_id}
                  </a>
                )}
                {platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {platforms.map((p, i) => (
                      <a
                        key={i}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200 transition-colors"
                      >
                        Delist on {p.platform}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <button
                id={`delist-mark-sold-${item.id}`}
                onClick={() => handleMarkSold(item)}
                disabled={resolvingId === item.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 transition-all disabled:opacity-50 flex-shrink-0"
              >
                {resolvingId === item.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <CheckCircle2 className="w-3 h-3" />
                }
                Mark as Sold
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
