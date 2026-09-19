import React, { useState } from 'react';
import {
  Tag, Hash, Trophy, User, Layers, Calendar, FileText,
  Shield, ShieldCheck, ExternalLink, Award, CheckCircle2, Receipt, Calculator, ShoppingBag,
  Sparkles, Upload, Loader2, Image as ImageIcon, ImageOff
} from 'lucide-react';
import { AUTHENTICATORS, getCertVerificationUrl, getAuthenticatorMeta } from '../../utils/certLookup';
import { fmtCurrency } from '../../utils/formulaPreview';
import { generateSku } from '../../utils/skuGenerator';
import { pushSkuToEbay } from '../../utils/auctionApi';

function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  return trimmed;
}

export function EditTabDetails({ form, updateField, allCategories = [], item }) {
  const [imgError, setImgError] = useState(false);
  const [pushingSku, setPushingSku] = useState(false);
  const [skuFeedback, setSkuFeedback] = useState(null);

  const certMeta = getAuthenticatorMeta(form.authenticator);
  const autoCertUrl = getCertVerificationUrl(form.authenticator, form.cert_number);
  const effectiveCertUrl = form.cert_verification_url || autoCertUrl;

  const proratedTax = Number(item?.prorated_tax || 0);
  const proratedShip = Number(item?.prorated_shipping || 0);
  const proratedDisc = Number(item?.prorated_discount || 0);
  const proratedNet = proratedTax + proratedShip - proratedDisc;

  // Extract primary image URL safely from item or form
  let rawImg = item?.image_url || null;
  let imageSource = null;
  if (!rawImg && item?.attributes) {
    try {
      const parsed = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
      if (parsed?.ebay_image_url) {
        rawImg = parsed.ebay_image_url;
        imageSource = 'eBay Active Listing';
      } else if (parsed?.image_url) {
        rawImg = parsed.image_url;
        imageSource = 'Amazon Product';
      } else if (Array.isArray(parsed?.image_urls) && parsed.image_urls[0]) {
        rawImg = parsed.image_urls[0];
        imageSource = 'Amazon Product';
      }
    } catch (_) {}
  }
  if (!imageSource && rawImg) {
    imageSource = rawImg.includes('ebayimg') ? 'eBay Active Listing' : (rawImg.includes('amazon') ? 'Amazon Product' : 'Outpost Media');
  }
  const imageUrl = normalizeHttps(rawImg);

  return (
    <div className="space-y-4">
      {/* 0. Product Media Card */}
      <div className="flex flex-col sm:flex-row gap-4 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="w-full sm:w-28 h-28 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
          {imageUrl && !imgError ? (
            <img
              src={imageUrl}
              alt="Item Media"
              className="w-full h-full object-contain p-1 rounded-lg"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-600 gap-1 text-center p-2">
              <ImageOff className="w-6 h-6" />
              <span className="text-[10px]">No photo</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Product Media &amp; Visual Assets</span>
              </span>
              {imageSource && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {imageSource}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Primary listing photo synchronized from live marketplace listings or inbound invoice records.
            </p>
          </div>
          {imageUrl && !imgError && (
            <div className="mt-2 flex items-center gap-2">
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3 text-amber-400" />
                <span>Open Full-Resolution Photo</span>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 1. Primary Title / Description */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>Item Title & Description <span className="text-amber-400">*</span></span>
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            Primary title used for marketplace listings & comps matching
          </span>
        </label>
        <input
          type="text"
          required
          value={form.item_name}
          onChange={e => updateField('item_name', e.target.value)}
          className="input-field text-sm font-medium text-white placeholder-slate-500"
          placeholder="e.g. Patrick Mahomes Signed Red Jersey JSA COA"
        />
      </div>

      {/* 2. SKU & Category & Quantity */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-amber-400/80" />
              <span>Store SKU</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateField('sku', generateSku(form.purchase_date || form.date_acquired || new Date()))}
                className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/20 transition-colors cursor-pointer"
                title="Auto-generate store SKU (OP-YYMMDD-XXXX)"
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>Auto</span>
              </button>
              {(form.ebay_listing_id || item?.ebay_listing_id) && (
                <button
                  type="button"
                  disabled={pushingSku || !form.sku}
                  onClick={async () => {
                    if (!form.sku || !item?.id) return;
                    setPushingSku(true);
                    setSkuFeedback(null);
                    try {
                      const res = await pushSkuToEbay(item.id, form.sku);
                      setSkuFeedback({ ok: true, msg: res?.message || 'Pushed SKU to eBay!' });
                    } catch (e) {
                      setSkuFeedback({ ok: false, msg: e.message || 'Push failed.' });
                    } finally {
                      setPushingSku(false);
                      setTimeout(() => setSkuFeedback(null), 4000);
                    }
                  }}
                  className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/20 transition-colors cursor-pointer disabled:opacity-40"
                  title="Push this SKU to the live linked eBay listing"
                >
                  {pushingSku ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
                  <span>Push</span>
                </button>
              )}
            </div>
          </div>
          <input
            type="text"
            value={form.sku || ''}
            onChange={e => updateField('sku', e.target.value)}
            className="input-field text-xs font-mono text-amber-300 font-semibold"
            placeholder="e.g. TT-NFL-0042"
          />
          {skuFeedback && (
            <p className={`text-[10px] mt-1 font-medium ${skuFeedback.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {skuFeedback.msg}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Category</span>
          </label>
          <select
            value={form.category || ''}
            onChange={e => updateField('category', e.target.value)}
            className="input-field text-xs font-semibold text-slate-200"
          >
            <option value="">-- Select Category --</option>
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Quantity</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={form.quantity ?? 1}
            onChange={e => updateField('quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="input-field text-xs font-mono text-slate-200"
            placeholder="1"
          />
        </div>
      </div>

      {/* 3. Sport/Genre & Athlete/Signer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-slate-400" />
            <span>Sport / Genre</span>
          </label>
          <input
            type="text"
            value={form.sport_genre || ''}
            onChange={e => updateField('sport_genre', e.target.value)}
            className="input-field text-xs"
            placeholder="e.g. NFL, MLB, Entertainment, Marvel"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>Athlete / Signer / Subject</span>
          </label>
          <input
            type="text"
            value={form.athlete_person || ''}
            onChange={e => updateField('athlete_person', e.target.value)}
            className="input-field text-xs"
            placeholder="e.g. Patrick Mahomes, Michael Jordan"
          />
        </div>
      </div>

      {/* 4. Integrated Acquisition, Landed Cost & Consignment Section */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Acquisition & Landed Cost (COGS)
            </span>
          </div>

          {item?.invoice_ref && (
            <span className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Batch: {item.invoice_ref}
            </span>
          )}
        </div>

        {/* Cost Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Base Unit Purchase Price ($)</span>
              <span className="text-[10px] text-slate-400 font-normal">Invoice line price</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.unit_price ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  const parsed = parseFloat(val);
                  const autoLanded = !isNaN(parsed) ? (parsed + proratedNet).toFixed(2) : '';
                  updateField('unit_price', val);
                  updateField('true_total_cost', autoLanded);
                }}
                className="input-field text-sm pl-8 font-mono font-bold text-white bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Total Landed Cost / COGS ($)</span>
              <span className="text-[10px] text-amber-400 font-semibold">True Cost Basis</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.true_total_cost ?? ''}
                onChange={e => updateField('true_total_cost', e.target.value)}
                className="input-field text-sm pl-8 font-mono font-black text-amber-400 bg-slate-950 border-amber-500/40"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Compact Prorated Invoicing Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Prorated Tax</span>
            <span className="text-xs font-semibold text-slate-200">{fmtCurrency(proratedTax)}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Prorated Shipping</span>
            <span className="text-xs font-semibold text-slate-200">{fmtCurrency(proratedShip)}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Prorated Discount</span>
            <span className="text-xs font-semibold text-emerald-400">-{fmtCurrency(proratedDisc)}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Net Proration</span>
            <span className="text-xs font-bold text-amber-300">+{fmtCurrency(proratedNet)}</span>
          </div>
        </div>
      </div>

      {/* 5. Authentication & Cert Verification Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Authentication & Certification</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateField('cert_verified', !form.cert_verified)}
              className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all ${
                form.cert_verified
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700'
              }`}
              title={form.cert_verified ? 'Click to unmark verification' : 'Click to mark as verified'}
            >
              {form.cert_verified ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Verified ✓ (Click to Unverify)</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unverified (Click to Mark Verified)</span>
                </>
              )}
            </button>
            {effectiveCertUrl && (
              <a
                href={effectiveCertUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 bg-cyan-500/10 px-3 py-1 rounded-lg border border-cyan-500/30 transition-all hover:bg-cyan-500/20"
                title="Open official database search in a new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Database Lookup ↗</span>
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Authenticator Company
            </label>
            <select
              value={form.authenticator || ''}
              onChange={e => {
                const newAuth = e.target.value;
                updateField('authenticator', newAuth);
                const generated = getCertVerificationUrl(newAuth, form.cert_number);
                if (generated) updateField('cert_verification_url', generated);
              }}
              className="input-field text-xs font-semibold text-amber-300"
            >
              <option value="">-- Unauthenticated / Raw --</option>
              {AUTHENTICATORS.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {form.authenticator && certMeta?.name && (
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Recognized: <strong className="text-slate-200">{certMeta.name}</strong></span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Certificate / Serial / Hologram #
            </label>
            <input
              type="text"
              value={form.cert_number || ''}
              onChange={e => {
                const newCert = e.target.value;
                updateField('cert_number', newCert);
                const generated = getCertVerificationUrl(form.authenticator, newCert);
                if (generated) updateField('cert_verification_url', generated);
              }}
              className="input-field text-xs font-mono text-cyan-300 font-bold"
              placeholder="e.g. WIT384919, 104928, or PSA cert #"
            />
          </div>
        </div>

        {/* Verification URL (Auto-Generated or Custom) */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Official Verification URL</span>
            <span className="text-[10px] text-slate-400 font-normal">Auto-generated or custom web link</span>
          </label>
          <input
            type="url"
            value={form.cert_verification_url || ''}
            onChange={e => updateField('cert_verification_url', e.target.value)}
            className="input-field text-xs font-mono text-slate-300"
            placeholder="https://..."
          />
        </div>
      </div>

      {/* 6. VineScout & Amazon Vine Link Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-teal-800/40 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">VineScout &amp; Amazon Vine Link</span>
            {form.is_vinescout && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
                Linked to VScout
              </span>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={Boolean(form.is_vinescout)}
              onChange={e => updateField('is_vinescout', e.target.checked)}
              className="rounded border-slate-700 text-teal-500 focus:ring-teal-400 h-3.5 w-3.5"
            />
            <span className="text-[11px] font-semibold text-slate-200">Assign as VScout Item</span>
          </label>
        </div>

        <p className="text-[11px] text-slate-400">
          Assign an Amazon ASIN or Order ID to synchronize this item with the VScout extension (live eBay pricing, ETV tax cost basis, and automated sold reconciliation).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Amazon ASIN (Product ID)</span>
              {form.asin && (
                <a
                  href={`https://www.amazon.com/dp/${form.asin.trim().toUpperCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Product ↗</span>
                </a>
              )}
            </label>
            <input
              type="text"
              value={form.asin || ''}
              onChange={e => {
                const val = e.target.value.trim().toUpperCase();
                updateField('asin', val);
                if (val && !form.is_vinescout) updateField('is_vinescout', true);
              }}
              className="input-field text-xs font-mono text-teal-300 font-bold"
              placeholder="e.g. B0GQ4KD8C5"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Amazon Vine Order ID</span>
              {form.order_id && (
                <a
                  href={`https://www.amazon.com/gp/your-account/order-details?orderID=${form.order_id.trim()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Order Details ↗</span>
                </a>
              )}
            </label>
            <input
              type="text"
              value={form.order_id || ''}
              onChange={e => {
                const val = e.target.value.trim();
                updateField('order_id', val);
                if (val && !form.is_vinescout) updateField('is_vinescout', true);
              }}
              className="input-field text-xs font-mono text-slate-300 font-medium"
              placeholder="e.g. 111-2345678-9876543"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-slate-800/60">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Vine Estimated Tax Value (ETV)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.etv || ''}
                onChange={e => updateField('etv', e.target.value)}
                className="input-field pl-6 text-xs font-mono text-slate-200 font-semibold"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Vine Acquisition Tax Cost</span>
              {form.tax_cost && Number(form.tax_cost) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    updateField('unit_price', String(Number(form.tax_cost).toFixed(2)));
                    updateField('true_total_cost', String(Number(form.tax_cost).toFixed(2)));
                  }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline font-semibold"
                  title="Apply tax cost as item base unit price"
                >
                  Set as Item Cost Basis
                </button>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.tax_cost || ''}
                onChange={e => updateField('tax_cost', e.target.value)}
                className="input-field pl-6 text-xs font-mono text-emerald-400 font-semibold"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 7. Best Listing Window */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Target Listing Window & Seasonality</span>
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            When this item yields peak market demand
          </span>
        </label>
        <input
          type="text"
          value={form.best_listing_window || ''}
          onChange={e => updateField('best_listing_window', e.target.value)}
          className="input-field text-xs"
          placeholder="e.g. NFL Season Kickoff, Playoffs, Super Bowl Week, Christmas"
        />
      </div>

      {/* 7. Condition & Memorabilia Notes */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-amber-400" />
          <span>Condition Notes & Inscriptions</span>
        </label>
        <textarea
          rows={3}
          value={form.notes || ''}
          onChange={e => updateField('notes', e.target.value)}
          className="input-field text-xs resize-none"
          placeholder="Item condition, ink color, inscriptions (e.g. 'SB LIV MVP'), framing dimensions, storage bin location..."
        />
      </div>
    </div>
  );
}
