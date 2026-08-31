import React from 'react';
import {
  ShoppingBag, ExternalLink, RefreshCw, Loader2,
  CheckCircle2, Search, X, Calendar, DollarSign, Unlink, Link2,
  Zap, Percent, ShieldCheck, ShieldAlert, Truck, ListChecks, ArrowRight, Lock
} from 'lucide-react';
import { ALL_STATUSES, LISTING_FORMATS, LISTING_STATUSES } from '../../utils/constants';
import { LiveFeeReadout } from './LiveFeeReadout';
import { computeTargetPriceFromMargin } from '../../utils/feeEngine';
import { fmtCurrency } from '../../utils/formulaPreview';

export function EditTabListingPricing({
  form,
  updateField,
  allPlatforms = [],
  onPlatformChange,
  handleSyncWithEbay,
  syncingEbay,
  ebayListings = [],
  loadingEbayListings = false,
  ebaySearch = '',
  setEbaySearch,
  liveFees
}) {
  const isSold = form.status === 'Sold';
  const isEbaySynced = Boolean(form.ebay_listing_id);
  const shippingCharged = parseFloat(form.buyer_shipping_cost || form.shipping_charged || 0) || 0;
  const isFreeShipping = shippingCharged === 0;

  // Compute suggested target price from target margin
  const cogs = parseFloat(form.true_total_cost) || parseFloat(form.unit_price) || 0;
  const targetMarginPct = (parseFloat(form.target_margin_pct) || 30) / 100;
  const platformFeePct = (parseFloat(form.platform_fee_pct) || 13.5) / 100;
  const promotedRate = parseFloat(form.ebay_promoted_rate) || 0;
  const shippingCost = parseFloat(form.est_shipping_cost) || 0;
  const flatFee = parseFloat(form.platform_flat_fee) || 0.40;

  const targetAskingPrice = computeTargetPriceFromMargin(
    cogs,
    targetMarginPct,
    platformFeePct,
    promotedRate,
    shippingCost,
    flatFee,
    shippingCharged
  );

  return (
    <div className="space-y-4">
      {/* 1. LIVE EBAY MARKETPLACE INTEGRATION (MOVED TO THE TOP) */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-inner">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Live eBay Store Sync & Listing Connection
            </span>
          </div>
          {form.ebay_listing_id && (
            <span className="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Listing ID: #{form.ebay_listing_id}
            </span>
          )}
        </div>

        {form.ebay_listing_id ? (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-bold text-emerald-300">Connected to Active eBay Listing</span>
              </div>
              <p className="text-xs text-slate-300 font-mono">
                Item Number: <strong className="text-white font-bold">{form.ebay_listing_id}</strong>
                {Number(form.ebay_promoted_rate) > 0 && (
                  <span className="text-amber-300 font-bold ml-2">• {form.ebay_promoted_rate}% Promoted Ad</span>
                )}
              </p>
              <a
                href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 underline pt-0.5"
              >
                <ExternalLink className="w-3 h-3" /> View live listing on eBay.com ↗
              </a>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                disabled={syncingEbay}
                onClick={handleSyncWithEbay}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
                title="Sync title, price, status, shipping and ad rate from live eBay API"
              >
                {syncingEbay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{syncingEbay ? 'Syncing Live Data...' : 'Sync Live Data'}</span>
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
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Not currently linked to an active eBay store listing.</span>
              <span className="text-[11px] text-amber-400 font-semibold">Select an active listing to pair</span>
            </div>

            {/* Active eBay Listings Browser */}
            <div className="space-y-2 pt-0.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={ebaySearch}
                  onChange={e => setEbaySearch(e.target.value)}
                  placeholder="Filter your active eBay store listings by title, SKU, or item ID..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
                <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading active eBay store listings...</span>
                </div>
              ) : ebayListings && ebayListings.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
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
                        className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/30 flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-200 truncate">{l.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-mono">
                            <span>ID: #{l.listing_id}</span>
                            {l.sku && <span>SKU: {l.sku}</span>}
                            {l.price != null && (
                              <span className="text-emerald-400 font-bold">${Number(l.price).toFixed(2)}</span>
                            )}
                            {l.promoted_rate != null && l.promoted_rate > 0 && (
                              <span className="text-amber-400 font-semibold">{l.promoted_rate}% Ad</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateField('ebay_listing_id', l.listing_id);
                            if (l.price != null && !form.current_list_price) {
                              updateField('current_list_price', Number(l.price).toFixed(2));
                            }
                            if (l.sku && !form.sku) {
                              updateField('sku', l.sku);
                            }
                            if (l.promoted_rate != null && l.promoted_rate > 0) {
                              updateField('ebay_promoted_rate', String(l.promoted_rate));
                            }
                            if (l.buyer_shipping_cost != null && l.buyer_shipping_cost > 0) {
                              updateField('buyer_shipping_cost', String(l.buyer_shipping_cost));
                            } else if (l.is_free_shipping) {
                              updateField('buyer_shipping_cost', '0.00');
                            }
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1 flex-shrink-0"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>Link Item</span>
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="py-2 text-center text-xs text-slate-500">
                  <span>No active eBay listings found. Enter an eBay Listing ID manually if needed.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Listing Status, Format & Channel Grid */}
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
          <label className="block text-xs font-bold text-slate-300 mb-1.5">Marketplace Status</label>
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

      {/* 3. Pricing Strategy Grid */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Pricing Strategy</span>
          </div>
          {targetAskingPrice > 0 && (
            <button
              type="button"
              onClick={() => updateField('current_list_price', targetAskingPrice.toFixed(2))}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all hover:bg-amber-500/20"
              title="Apply target asking price to active price"
            >
              <Zap className="w-3 h-3" />
              <span>Apply Target ({fmtCurrency(targetAskingPrice)})</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Active Asking Price ($)</span>
              <span className="text-[10px] text-amber-400 font-semibold">Primary</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.current_list_price || ''}
                onChange={e => updateField('current_list_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-emerald-300 font-black bg-slate-950 border-emerald-500/40"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Buy-It-Now Target ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.buy_it_now_price || ''}
                onChange={e => updateField('buy_it_now_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-amber-300 font-bold bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Hard Floor Price ($)</span>
              <span className="text-[10px] text-red-400 font-normal">Min Accepted</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.floor_price || ''}
                onChange={e => updateField('floor_price', e.target.value)}
                className="input-field text-sm pl-8 font-mono text-cyan-300 font-bold bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Shipping Structure (Charging Buyer vs Free Shipping & Outbound Label Cost) */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Shipping Strategy & Margin Integration
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Buyer-Facing Shipping (Revenue) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 flex items-center justify-between flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <span>Shipping Charged to Buyer ($)</span>
                {isEbaySynced && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <Lock className="w-2.5 h-2.5" /> Synced
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-semibold ${isFreeShipping ? 'text-emerald-400' : 'text-blue-400'}`}>
                {isFreeShipping ? 'Free to Buyer' : `+$${Number(shippingCharged).toFixed(2)} Revenue`}
              </span>
            </label>

            {isEbaySynced ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400">
                <Lock className="w-3.5 h-3.5 text-amber-400/90 flex-shrink-0" />
                <span>Locked: Populated directly from live eBay shipping policy.</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => updateField('buyer_shipping_cost', '0.00')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                    shippingCharged === 0
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  Free ($0)
                </button>
                <button
                  type="button"
                  onClick={() => updateField('buyer_shipping_cost', '4.50')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                    shippingCharged === 4.5
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  $4.50
                </button>
                <button
                  type="button"
                  onClick={() => updateField('buyer_shipping_cost', '8.50')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                    shippingCharged === 8.5
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  $8.50
                </button>
                <button
                  type="button"
                  onClick={() => updateField('buyer_shipping_cost', '15.95')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                    shippingCharged === 15.95
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  $15.95
                </button>
              </div>
            )}

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={isEbaySynced}
                value={form.buyer_shipping_cost ?? ''}
                onChange={e => updateField('buyer_shipping_cost', e.target.value)}
                className={`input-field text-xs pl-8 font-mono ${
                  isEbaySynced
                    ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed pr-20'
                    : 'text-white bg-slate-950'
                }`}
                placeholder="0.00"
              />
              {isEbaySynced && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs flex items-center gap-1 pointer-events-none">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px]">eBay Synced</span>
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">
              {isEbaySynced
                ? 'Marketplace shipping revenue imported from eBay (included in eBay final value fee calculation).'
                : 'Amount added to buyer total on marketplace (included in platform final value fee calculation).'}
            </p>
          </div>

          {/* Seller Outbound Label Expense (Cost) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>Est. Outbound Label Cost ($)</span>
              <span className="text-[10px] text-amber-400/90 font-mono">
                {shippingCost > 0 ? `-$${Number(shippingCost).toFixed(2)} Expense` : '$0.00 (No Label Expense)'}
              </span>
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => updateField('est_shipping_cost', '0.00')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                  shippingCost === 0
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                $0.00
              </button>
              <button
                type="button"
                onClick={() => updateField('est_shipping_cost', '4.50')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                  shippingCost === 4.5
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                $4.50
              </button>
              <button
                type="button"
                onClick={() => updateField('est_shipping_cost', '8.50')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                  shippingCost === 8.5
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                $8.50
              </button>
              <button
                type="button"
                onClick={() => updateField('est_shipping_cost', '15.95')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                  shippingCost === 15.95
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                $15.95
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.est_shipping_cost ?? ''}
                onChange={e => updateField('est_shipping_cost', e.target.value)}
                className="input-field text-xs pl-8 font-mono text-slate-200 bg-slate-950"
                placeholder="0.00"
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Actual postage label expense paid by seller to carrier (USPS/UPS/FedEx).
            </p>
          </div>
        </div>
      </div>

      {/* 5. Margins, Promoted Ad Rate & Platform Fee Overrides */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Target Profit Margin (%)</span>
            <span className="text-[10px] text-slate-400 font-mono">{form.target_margin_pct || '30'}%</span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.target_margin_pct ?? ''}
              onChange={e => updateField('target_margin_pct', e.target.value)}
              className="input-field text-xs pr-8 font-mono text-blue-300 font-bold"
              placeholder="30"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Promoted Listing Ad Rate (%)</span>
            <span className="text-[10px] text-amber-400 font-mono font-bold">
              {Number(form.ebay_promoted_rate || 0) > 0 ? `${form.ebay_promoted_rate}% Active` : '0% (Standard)'}
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.ebay_promoted_rate ?? ''}
              onChange={e => updateField('ebay_promoted_rate', e.target.value)}
              className="input-field text-xs pr-8 font-mono text-amber-300 font-bold"
              placeholder="0.0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Platform Fee Structure</span>
            <span className="text-[10px] text-slate-400 font-mono">({form.platform || 'eBay'})</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.platform_fee_pct ?? ''}
                onChange={e => updateField('platform_fee_pct', e.target.value)}
                className="input-field text-xs pr-6 font-mono"
                placeholder="13.5"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
            </div>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.platform_flat_fee ?? ''}
                onChange={e => updateField('platform_flat_fee', e.target.value)}
                className="input-field text-xs pl-5 font-mono"
                placeholder="0.40"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 6. Lifecycle Dates & Sold Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl bg-slate-900/50 border border-slate-800">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Date Listed on Marketplace</span>
          </label>
          <input
            type="date"
            value={form.date_listed || ''}
            onChange={e => updateField('date_listed', e.target.value)}
            className="input-field text-xs text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
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

      {/* 7. Embedded Real-Time Fee Engine Readout */}
      <LiveFeeReadout liveFees={liveFees} />
    </div>
  );
}
