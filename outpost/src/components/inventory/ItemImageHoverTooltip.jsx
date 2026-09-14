import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ExternalLink, Package, ImageOff, ImageIcon } from 'lucide-react';
import { getItemImagePreview } from '../../utils/auctionApi';

// Global in-memory cache to prevent duplicate fetches across hovers
const PREVIEW_CACHE = new Map();

/**
 * Floating tooltip that displays an item's product photo (eBay or Amazon) on hover.
 * Renders via React Portal directly into document.body to prevent clipping by overflow containers.
 */
export function ItemImageHoverTooltip({ target, rect }) {
  if (!target || !rect) return null;

  const itemId = target.id || target.item_id;
  const ebayListingId = target.ebay_listing_id;
  
  // Extract attributes safely
  let attrs = {};
  if (target.attributes) {
    try {
      attrs = typeof target.attributes === 'string' ? JSON.parse(target.attributes) : target.attributes;
    } catch (_) {}
  }
  const asin = attrs.asin || null;

  const cacheKey = itemId || ebayListingId || asin || target.item_name;

  const [state, setState] = useState(() => {
    // 1. Check cache first
    if (PREVIEW_CACHE.has(cacheKey)) {
      return PREVIEW_CACHE.get(cacheKey);
    }

    // 2. Check synchronous fields
    if (attrs.ebay_image_url) {
      const data = { imageUrl: attrs.ebay_image_url, source: 'eBay', loading: false, notFound: false };
      PREVIEW_CACHE.set(cacheKey, data);
      return data;
    }
    if (attrs.image_url) {
      const data = { imageUrl: attrs.image_url, source: 'Amazon', loading: false, notFound: false };
      PREVIEW_CACHE.set(cacheKey, data);
      return data;
    }
    // Handle image_urls as a JS array or as a double-serialized JSON string
    const resolvedImageUrls = Array.isArray(attrs.image_urls)
      ? attrs.image_urls
      : (typeof attrs.image_urls === 'string' ? (() => { try { return JSON.parse(attrs.image_urls); } catch (_) { return []; } })() : []);
    if (resolvedImageUrls.length > 0 && resolvedImageUrls[0]) {
      const data = { imageUrl: resolvedImageUrls[0], source: 'Amazon', loading: false, notFound: false };
      PREVIEW_CACHE.set(cacheKey, data);
      return data;
    }
    // Check top-level image_url pre-parsed by enriched.js from notes (Image: https://...)
    if (target.image_url) {
      const isEbay = String(target.image_url).includes('ebayimg');
      const data = { imageUrl: target.image_url, source: isEbay ? 'eBay' : 'Amazon', loading: false, notFound: false };
      PREVIEW_CACHE.set(cacheKey, data);
      return data;
    }
    if (target.notes) {
      const m = target.notes.match(/Image:\s*(https?:\/\/[^\s\n\r]+)/i) ||
                target.notes.match(/(https?:\/\/(?:m\.media-amazon\.com|i\.ebayimg\.com)[^\s\n\r]+)/i);
      if (m && m[1]) {
        const isEbay = m[1].includes('ebayimg');
        const data = { imageUrl: m[1], source: isEbay ? 'eBay' : 'Amazon', loading: false, notFound: false };
        PREVIEW_CACHE.set(cacheKey, data);
        return data;
      }
    }

    // Otherwise initiate async fetch
    return { imageUrl: null, source: null, loading: true, notFound: false };
  });

  useEffect(() => {
    if (!state.loading) return;

    let isMounted = true;

    getItemImagePreview({
      id: itemId,
      ebay_listing_id: ebayListingId,
      asin: asin
    })
      .then(res => {
        if (!isMounted) return;
        if (res?.success && res?.imageUrl) {
          const loadedData = {
            imageUrl: res.imageUrl,
            source: res.source || (ebayListingId ? 'eBay' : 'Amazon'),
            loading: false,
            notFound: false
          };
          PREVIEW_CACHE.set(cacheKey, loadedData);
          setState(loadedData);
        } else {
          const failData = { imageUrl: null, source: null, loading: false, notFound: true };
          PREVIEW_CACHE.set(cacheKey, failData);
          setState(failData);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const failData = { imageUrl: null, source: null, loading: false, notFound: true };
        PREVIEW_CACHE.set(cacheKey, failData);
        setState(failData);
      });

    return () => {
      isMounted = false;
    };
  }, [cacheKey, itemId, ebayListingId, asin, state.loading]);

  // Position calculation
  const tooltipWidth = 256;
  const tooltipHeight = 280;

  // Horizontal clamp
  let left = rect.left;
  if (left + tooltipWidth > window.innerWidth - 16) {
    left = Math.max(16, window.innerWidth - tooltipWidth - 16);
  }

  // Vertical placement (prefer above, flip below if not enough room)
  const spaceAbove = rect.top;
  const placeAbove = spaceAbove >= tooltipHeight + 16;
  const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
  const transform = placeAbove ? 'translateY(-100%)' : 'none';

  return createPortal(
    <div
      className="fixed z-[9999] w-64 p-3 rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-100"
      style={{ top, left, transform }}
    >
      {/* Header with Title and Platform Badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-slate-200 font-semibold text-xs leading-snug line-clamp-2" title={target.item_name}>
          {target.item_name}
        </p>
        {state.source === 'eBay' && (
          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex-shrink-0 flex items-center gap-0.5">
            <ExternalLink className="w-2 h-2" /> eBay
          </span>
        )}
        {state.source === 'Amazon' && (
          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 flex-shrink-0 flex items-center gap-0.5">
            <Package className="w-2 h-2" /> Amazon
          </span>
        )}
      </div>

      {/* Image Display Card */}
      <div className="w-full h-48 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-center overflow-hidden relative">
        {state.loading && (
          <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <span className="text-[10px] font-medium">Pulling live photo...</span>
          </div>
        )}

        {!state.loading && state.imageUrl && (
          <img
            src={state.imageUrl}
            alt={target.item_name}
            className="w-full h-full object-contain p-1.5 rounded-lg"
            loading="eager"
          />
        )}

        {!state.loading && (state.notFound || !state.imageUrl) && (
          <div className="flex flex-col items-center justify-center gap-1.5 text-slate-500 p-4 text-center">
            <ImageOff className="w-6 h-6 text-slate-600" />
            <span className="text-[10px]">No photo found on eBay or Amazon</span>
          </div>
        )}
      </div>

      {/* Subtle interaction tip */}
      <div className="mt-2 text-center">
        <p className="text-[9px] text-slate-500 font-medium">Click item to open full details</p>
      </div>
    </div>,
    document.body
  );
}
