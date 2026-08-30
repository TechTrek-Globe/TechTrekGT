import React from 'react';
import {
  ListChecks, ShoppingBag, ExternalLink, RefreshCw, Loader2,
  CheckCircle2, Search, X, Calendar, DollarSign, Unlink, Link2
} from 'lucide-react';
import { ALL_STATUSES, LISTING_FORMATS, LISTING_STATUSES } from '../../utils/constants';

export function EditTabListing({
  form,
  updateField,
  allPlatforms = [],
  onPlatformChange,
  handleSyncWithEbay,
  syncingEbay,
  ebayListings = [],
  loadingEbayListings = false,
  ebaySearch = '',
  setEbaySearch
}) {
  const isSold = form.status === 'Sold';

  return (
    <div className="space-y-4">
      {/* Status, Format, Listing Status & Platform Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-amber-400" />
            <span>Inventory Status</span>
          </label>
          <select
            value={form.status}
            onChange={e => updateField('status', e.target.value)}
            className="input-field text-xs font-semibold text-white"
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">Listing Format</label>
          <select
            value={form.listing_format || 'Fixed Price'}
            onChange={e => updateField('listing_format', e.target.value)}
            className="input-field text-xs font-semibold text-slate-200"
          >
            {LISTING_FORMATS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">Listing Status</label>
          <select
            value={form.listing_status || (form.status === 'Listed' ? 'Active' : form.status === 'Sold' ? 'Sold' : 'Draft')}
            onChange={e => updateField('listing_status', e.target.value)}
            className="input-field text-xs font-semibold text-slate-200"
          >
            {LISTING_STATUSES.map(ls => (
              <option key={ls} value={ls}>{ls}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">Sales Platform</label>
          <select
            value={form.platform || ''}
            onChange={e => onPlatformChange(e.target.value)}
            className="input-field text-xs font-semibold text-amber-300"
          >
            <option value="">-- Select Platform --</option>
            {allPlatforms.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Dates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Date Acquired</span>
          </label>
          <input
            type="date"
            value={form.date_acquired || form.purchase_date || ''}
            onChange={e => {
              updateField('date_acquired', e.target.value);
              updateField('purchase_date', e.target.value);
            }}
            className="input-field text-xs text-slate-200"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Date Listed</span>
          </label>
          <input
            type="date"
            value={form.date_listed || ''}
            onChange={e => updateField('date_listed', e.target.value)}
            className="input-field text-xs text-slate-200"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Date Sold</span>
          </label>
          <input
            type="date"
            value={form.date_sold || ''}
            onChange={e => updateField('date_sold', e.target.value)}
            className="input-field text-xs text-slate-200"
          />
        </div>
      </div>

      {/* Conditional Sold Price Box */}
      {isSold && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2">
          <label className="block text-xs font-bold text-emerald-400 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Actual Realized Sale Price ($)</span>
          </label>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-bold pointer-events-none">$</span>
            <input
              type="number"
              step="0.01"
              value={form.actual_sell_price || ''}
              onChange={e => updateField('actual_sell_price', e.target.value)}
              className="input-field text-sm pl-8 font-mono text-emerald-300 font-black bg-slate-900 border-emerald-500/50"
              placeholder="0.00"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Realized gross sale price recorded in sales analytics.
          </p>
        </div>
      )}

      {/* eBay Listing Integration Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-200">eBay Marketplace Sync & Listing ID</span>
          </div>
          {form.ebay_listing_id && (
            <span className="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              #{form.ebay_listing_id}
            </span>
          )}
        </div>

        {form.ebay_listing_id ? (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-bold text-emerald-300">Linked to Active eBay Listing</span>
              </div>
              <p className="text-xs text-slate-300 font-mono">
                Listing ID: <strong className="text-white font-bold">{form.ebay_listing_id}</strong>
              </p>
              <a
                href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 underline pt-0.5"
              >
                <ExternalLink className="w-3 h-3" /> View live on eBay.com
              </a>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                disabled={syncingEbay}
                onClick={handleSyncWithEbay}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Sync title, price, status and ad rate from live eBay API"
              >
                {syncingEbay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{syncingEbay ? 'Syncing...' : 'Sync Live Data'}</span>
              </button>

              <button
                type="button"
                onClick={() => updateField('ebay_listing_id', '')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/20 transition-all flex items-center gap-1"
                title="Unlink eBay Item ID"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Unlink</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Not currently linked to an active eBay store listing.</span>
              <span className="text-[11px] text-amber-400 font-semibold">Select a listing below to pair</span>
            </div>

            {/* Active eBay Listings Browser */}
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={ebaySearch}
                  onChange={e => setEbaySearch(e.target.value)}
                  placeholder="Filter active eBay store listings by title, SKU, or item ID..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                {ebaySearch && (
                  <button
                    type="button"
                    onClick={() => setEbaySearch('')}
                    className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {loadingEbayListings ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading active eBay store listings...</span>
                </div>
              ) : ebayListings && ebayListings.length > 0 ? (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                  {ebayListings
                    .filter(l => {
                      if (!ebaySearch) return true;
                      const q = ebaySearch.toLowerCase();
                      return (
                        (l.title && l.title.toLowerCase().includes(q)) ||
                        (l.listing_id && l.listing_id.includes(q)) ||
                        (l.sku && l.sku.toLowerCase().includes(q))
                      );
                    })
                    .slice(0, 20)
                    .map(l => (
                      <div
                        key={l.listing_id}
                        className="p-2 rounded-lg bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/30 flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-200 truncate">{l.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                            <span>ID: #{l.listing_id}</span>
                            {l.sku && <span>SKU: {l.sku}</span>}
                            {l.current_price != null && (
                              <span className="text-emerald-400 font-bold">${Number(l.current_price).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateField('ebay_listing_id', l.listing_id);
                            if (l.current_price != null && !form.current_list_price) {
                              updateField('current_list_price', Number(l.current_price).toFixed(2));
                            }
                            if (l.sku && !form.sku) {
                              updateField('sku', l.sku);
                            }
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1 flex-shrink-0"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>Link</span>
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-3 text-center text-xs text-slate-500">
                  <span>No active eBay listings found. Enter an eBay Listing ID manually above if needed.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
