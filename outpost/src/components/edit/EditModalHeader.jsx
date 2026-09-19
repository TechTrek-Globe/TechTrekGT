import React from 'react';
import { Package, X, ShieldCheck, Tag, ExternalLink, Check, Loader2 } from 'lucide-react';
import { STATUS_META } from '../../utils/constants';

function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  return trimmed;
}

export function EditModalHeader({ form, item, isDirty, autoSaving, autoSavedTime, onClose }) {
  const [imgError, setImgError] = React.useState(false);
  const statusMeta = STATUS_META[form.status] || STATUS_META['Available'];
  const title = form.item_name || item?.item_name || 'Untitled Inventory Item';
  const isRecentlySaved = autoSavedTime && (Date.now() - autoSavedTime < 4000);

  // Extract primary image URL safely from item or form
  let rawImg = item?.image_url || null;
  if (!rawImg && item?.attributes) {
    try {
      const parsed = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
      rawImg = parsed?.ebay_image_url || parsed?.image_url || (Array.isArray(parsed?.image_urls) ? parsed.image_urls[0] : null);
    } catch (_) {}
  }
  const imageUrl = normalizeHttps(rawImg);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0 pr-4">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-inner overflow-hidden relative">
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt="Thumbnail"
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <Package className="w-5 h-5 text-amber-400/80" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-white leading-tight truncate max-w-md sm:max-w-lg" title={title}>
              {title}
            </h2>
            {autoSaving ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Saving...
              </span>
            ) : isRecentlySaved ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Check className="w-3 h-3" />
                Auto-saved
              </span>
            ) : isDirty ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Unsaved Changes
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
            <span className="font-mono text-slate-400">
              ID: <span className="text-slate-200">{item?.id ? item.id.slice(0, 8) : '--'}</span>
            </span>
            {form.sku && (
              <>
                <span className="text-slate-600">•</span>
                <span className="font-mono text-amber-400/90 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-[11px]">
                  SKU: {form.sku}
                </span>
              </>
            )}
            {form.ebay_listing_id && (
              <>
                <span className="text-slate-600">•</span>
                <a
                  href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 hover:border-amber-500/40 transition-colors"
                  title="Open live eBay listing"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  eBay #{form.ebay_listing_id}
                </a>
              </>
            )}
            {form.category && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-slate-300 font-medium">{form.category}</span>
              </>
            )}
            <span className="text-slate-600">•</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${statusMeta.bg} ${statusMeta.border} ${statusMeta.color}`}>
              {form.status}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
        title="Close (Esc)"
        aria-label="Close modal"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
