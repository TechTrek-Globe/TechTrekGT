import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ExternalLink, Package, ImageOff, ImageIcon } from 'lucide-react';
import { getItemImagePreview } from '../../utils/auctionApi';

// Global in-memory cache for positive image hits across hovers
const PREVIEW_CACHE = new Map();

/**
 * Normalizes an image URL to secure HTTPS and handles protocol-relative paths.
 */
function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  return trimmed;
}

/**
 * Safely extracts an attributes object from an item record.
 */
function extractSafeAttributes(target) {
  if (!target?.attributes) return {};
  if (typeof target.attributes === 'object' && target.attributes !== null) {
    return target.attributes;
  }
  if (typeof target.attributes === 'string') {
    try {
      const parsed = JSON.parse(target.attributes);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Synchronously resolves an image directly from the item properties, attributes, or notes.
 * Fully aligned with the extraction hierarchy in EditModalHeader.jsx and EditTabDetails.jsx.
 */
function resolveItemImage(target, attrs) {
  let rawImg = target?.image_url || target?.ebay_image_url || target?.imageUrl || null;
  let source = null;

  if (!rawImg && attrs) {
    if (attrs.ebay_image_url) {
      rawImg = attrs.ebay_image_url;
      source = 'eBay';
    } else if (attrs.image_url) {
      rawImg = attrs.image_url;
      source = 'Amazon';
    } else if (Array.isArray(attrs.image_urls) && attrs.image_urls[0]) {
      rawImg = attrs.image_urls[0];
      source = 'Amazon';
    } else if (typeof attrs.image_urls === 'string') {
      try {
        const parsed = JSON.parse(attrs.image_urls);
        if (Array.isArray(parsed) && parsed[0]) {
          rawImg = parsed[0];
          source = 'Amazon';
        }
      } catch (_) {}
    }
  }

  if (!rawImg && target?.notes) {
    const m = String(target.notes).match(/Image:\s*(https?:\/\/[^\s\n\r|]+)/i) ||
              String(target.notes).match(/(https?:\/\/(?:m\.media-amazon\.com|i\.ebayimg\.com)[^\s\n\r|]+)/i);
    if (m && m[1]) {
      rawImg = m[1];
    }
  }

  const norm = normalizeHttps(rawImg);
  if (norm) {
    if (!source) {
      if (norm.includes('ebayimg') || target?.ebay_listing_id) source = 'eBay';
      else if (norm.includes('amazon') || attrs?.asin || target?.asin) source = 'Amazon';
      else source = 'Outpost';
    }
    return { imageUrl: norm, source, loading: false, notFound: false };
  }

  return null;
}

function resolveSyncImage(target, attrs, cacheKey) {
  // 1. Inspect live target record directly (highest priority)
  const direct = resolveItemImage(target, attrs);
  if (direct) {
    if (cacheKey) PREVIEW_CACHE.set(cacheKey, direct);
    return direct;
  }

  // 2. Check in-memory cache for previously confirmed positive hits
  if (cacheKey && PREVIEW_CACHE.has(cacheKey)) {
    const cached = PREVIEW_CACHE.get(cacheKey);
    if (cached && cached.imageUrl) {
      return cached;
    }
  }

  // 3. If the item has an identifier, allow async fallback
  const hasIdentifier = Boolean(target?.id || target?.item_id || target?.ebay_listing_id || attrs?.asin || target?.asin);
  return {
    imageUrl: null,
    source: target?.ebay_listing_id ? 'eBay' : (attrs?.asin || target?.asin ? 'Amazon' : null),
    loading: hasIdentifier,
    notFound: !hasIdentifier
  };
}

/**
 * Floating tooltip that displays an item's product photo (eBay or Amazon) on hover.
 * Renders via React Portal directly into document.body to prevent clipping by overflow containers.
 */
export function ItemImageHoverTooltip({ target, rect }) {
  if (!target || !rect) return null;

  const itemId = target.id || target.item_id;
  const ebayListingId = target.ebay_listing_id;
  const attrs = extractSafeAttributes(target);
  const asin = attrs.asin || target.asin || null;

  const cacheKey = itemId || ebayListingId || asin || target.item_name;
  const [imgError, setImgError] = useState(false);
  const [state, setState] = useState(() => resolveSyncImage(target, attrs, cacheKey));

  useEffect(() => {
    setImgError(false);
    const resolved = resolveSyncImage(target, attrs, cacheKey);
    setState(resolved);
  }, [cacheKey]);

  // Secondary fallback if primary source fails to render
  const secondaryFallback = useMemo(() => {
    if (state.source === 'eBay') {
      const amz = attrs.image_url || (Array.isArray(attrs.image_urls) ? attrs.image_urls[0] : null);
      return normalizeHttps(amz);
    }
    return null;
  }, [state.source, attrs]);

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
        const normUrl = normalizeHttps(res?.imageUrl);
        if (res?.success && normUrl) {
          const loadedData = {
            imageUrl: normUrl,
            source: res.source || (ebayListingId ? 'eBay' : 'Amazon'),
            loading: false,
            notFound: false
          };
          if (cacheKey) PREVIEW_CACHE.set(cacheKey, loadedData);
          setState(loadedData);
        } else {
          // Do not poison the global cache with notFound; allow subsequent attempts
          setState({ imageUrl: null, source: null, loading: false, notFound: true });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setState({ imageUrl: null, source: null, loading: false, notFound: true });
      });

    return () => {
      isMounted = false;
    };
  }, [cacheKey, itemId, ebayListingId, asin, state.loading]);

  // Position calculation
  const tooltipWidth = 256;
  const tooltipHeight = 280;

  // Horizontal clamp
  let left = Math.max(16, rect.left);
  if (left + tooltipWidth > window.innerWidth - 16) {
    left = Math.max(16, window.innerWidth - tooltipWidth - 16);
  }

  // Vertical placement (prefer above, flip below if not enough room)
  const spaceAbove = rect.top;
  const placeAbove = spaceAbove >= tooltipHeight + 16;
  const top = placeAbove
    ? Math.max(16, rect.top - 8)
    : Math.min(window.innerHeight - tooltipHeight - 16, rect.bottom + 8);
  const transform = placeAbove ? 'translateY(-100%)' : 'none';

  const tooltipContent = (
    <div
      className="fixed z-[9999] w-64 p-3 rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-md pointer-events-none transition-opacity duration-100"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transform
      }}
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

        {!state.loading && state.imageUrl && !imgError && (
          <img
            src={state.imageUrl}
            alt={target.item_name || 'Product Photo'}
            className="w-full h-full object-contain p-1.5 rounded-lg"
            loading="eager"
            onError={() => {
              if (secondaryFallback && state.imageUrl !== secondaryFallback) {
                setState(prev => ({ ...prev, imageUrl: secondaryFallback, source: 'Amazon' }));
              } else {
                setImgError(true);
              }
            }}
          />
        )}

        {!state.loading && (state.notFound || !state.imageUrl || imgError) && (
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
    </div>
  );

  return typeof document !== 'undefined' && document.body
    ? createPortal(tooltipContent, document.body)
    : tooltipContent;
}
