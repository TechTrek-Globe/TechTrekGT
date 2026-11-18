import React, { useState } from 'react';
import {
  Tag, Hash, Trophy, User, Layers, Calendar,
  Shield, ShieldCheck, ExternalLink, Award, CheckCircle2, Receipt, ShoppingBag,
  Sparkles, Upload, Loader2, Image as ImageIcon, ImageOff,
  Wrench, Frame, MapPin, ChevronDown, ChevronUp, FileText, SlidersHorizontal
} from 'lucide-react';
import { AUTHENTICATORS, getCertVerificationUrl, getAuthenticatorMeta } from '../../utils/certLookup';
import { fmtCurrency } from '../../utils/formulaPreview';
import { generateSku } from '../../utils/skuGenerator';
import { pushSkuToEbay } from '../../utils/auctionApi';
import {
  MEMORABILIA_CATEGORIES,
  GENERAL_CATEGORIES,
  ITEM_CONDITIONS,
  AUTH_TYPES,
  PREP_STATUSES,
  FRAMING_STATUSES,
  SOURCE_VENDORS,
  INK_COLORS,
  ITEM_COLOR_PRESETS,
  JERSEY_STYLES,
  WEARABLE_SIZE_PRESETS,
  PHOTO_DIMENSIONS,
  PHOTO_FINISHES,
  GUITAR_TYPES,
  MEDIA_FORMATS,
  SIGNATURE_LOCATIONS,
  SUBTYPE_PRESETS_BY_GROUP,
  CATEGORY_GROUP_LABELS,
  resolveCategoryGroup,
  isMemorabiliaCategory,
  isFramedStatus
} from '../../utils/itemCategories';

function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  return trimmed;
}

export function EditTabDetails({ form, updateField, allCategories = [], item, onSwitchTab }) {
  const [imgError, setImgError] = useState(false);
  const [pushingSku, setPushingSku] = useState(false);
  const [skuFeedback, setSkuFeedback] = useState(null);

  const categoryGroup = resolveCategoryGroup(form.category, form.item_name);
  const isMemorabilia = isMemorabiliaCategory(form.category, form.item_name) || Boolean(
    form.athlete_person || form.authenticator || form.cert_number || form.inscription
  );

  // Collapsible controls for non-memorabilia items and optional platform guardrail overrides
  const [forceShowMemorabilia, setForceShowMemorabilia] = useState(false);
  const [showAuthCard, setShowAuthCard] = useState(
    () => isMemorabilia || Boolean(form.authenticator || form.cert_number || form.auth_type)
  );
  const [showGuardrailOverrides, setShowGuardrailOverrides] = useState(false);

  const showMemorabiliaSections = isMemorabilia || forceShowMemorabilia;
  const showAuthSection = showMemorabiliaSections || showAuthCard || Boolean(form.authenticator || form.cert_number);
  const showFrameDims = isFramedStatus(form.framing_status);

  const certMeta = getAuthenticatorMeta(form.authenticator);
  const autoCertUrl = getCertVerificationUrl(form.authenticator, form.cert_number);
  const effectiveCertUrl = form.cert_verification_url || autoCertUrl;

  const proratedTax = Number(item?.prorated_tax || 0);
  const proratedShip = Number(item?.prorated_shipping || 0);
  const proratedDisc = Number(item?.prorated_discount || 0);
  const proratedNet = proratedTax + proratedShip - proratedDisc;

  const subtypePresets = SUBTYPE_PRESETS_BY_GROUP[categoryGroup] || SUBTYPE_PRESETS_BY_GROUP.general;
  const extraCategories = allCategories.filter(
    c => !MEMORABILIA_CATEGORIES.includes(c) && !GENERAL_CATEGORIES.includes(c)
  );

  // Extract primary image URL safely from item or form
  let rawImg = item?.image_url || null;
  let imageSource = null;
  let additionalImages = [];
  if (item?.attributes) {
    try {
      const parsed = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
      if (Array.isArray(parsed?.image_urls)) {
        additionalImages = parsed.image_urls.filter(Boolean);
      }
      if (!rawImg) {
        if (parsed?.ebay_image_url) {
          rawImg = parsed.ebay_image_url;
          imageSource = 'eBay Active Listing';
        } else if (parsed?.image_url) {
          rawImg = parsed.image_url;
          imageSource = 'Amazon Product';
        } else if (additionalImages[0]) {
          rawImg = additionalImages[0];
          imageSource = 'Amazon Product';
        }
      }
    } catch (_) {}
  }
  if (!imageSource && rawImg) {
    imageSource = rawImg.includes('ebayimg') ? 'eBay Active Listing' : (rawImg.includes('amazon') ? 'Amazon Product' : 'Outpost Media');
  }
  const imageUrl = normalizeHttps(form.image_url || rawImg);

  const handleCategoryChange = (newCat) => {
    updateField('category', newCat);
    const nextGroup = resolveCategoryGroup(newCat, form.item_name);
    if (nextGroup === 'jersey_apparel') {
      updateField('is_wearable', true);
    } else if (['sports_gear', 'music_instrument', 'music_media', 'photo_print', 'trading_card'].includes(nextGroup)) {
      updateField('is_wearable', false);
    }
    if (nextGroup === 'music_instrument' && String(newCat).toLowerCase() === 'pickguard') {
      updateField('signed_surface', 'Pickguard');
    }
  };

  const handleJerseyStyleChange = (style) => {
    updateField('jersey_style', style);
    updateField('is_wearable', true);
    updateField('is_custom_jersey', style === 'Custom Stitched');
    if (style === 'Custom Stitched' && !form.item_subtype) {
      updateField('item_subtype', 'Custom Stitched');
    }
  };

  const handleGuitarSurfaceChange = (surface) => {
    updateField('signed_surface', surface);
    const isPickguard = surface.toLowerCase().includes('pickguard');
    if (categoryGroup === 'music_instrument') {
      updateField('is_pickguard_guitar', isPickguard && String(form.guitar_type || '').toLowerCase() !== 'pickguard only');
    }
  };

  const handleGuitarTypeChange = (gType) => {
    updateField('guitar_type', gType);
    const lower = gType.toLowerCase();
    const isPickguardSurface = String(form.signed_surface || '').toLowerCase().includes('pickguard');
    if (lower.includes('display acoustic')) {
      updateField('is_pickguard_guitar', isPickguardSurface || !form.signed_surface);
      if (!form.signed_surface) updateField('signed_surface', 'Pickguard');
    } else if (lower === 'pickguard only') {
      updateField('is_pickguard_guitar', false);
      updateField('signed_surface', 'Pickguard');
    }
  };

  const isVineLinked = Boolean(form.is_vinescout || form.asin || form.order_id);

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
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {imageUrl && !imgError && (
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3 text-amber-400" />
                <span>Open Full-Resolution Photo</span>
              </a>
            )}
            {onSwitchTab && (
              <button
                type="button"
                onClick={() => onSwitchTab('vinescout')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  isVineLinked
                    ? 'bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border-teal-500/35'
                    : 'bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-teal-300 border-slate-700/80'
                }`}
              >
                <ShoppingBag className="w-3 h-3" />
                <span>{isVineLinked ? `VineScout Linked${form.asin ? ` (${form.asin})` : ''}` : 'Link VineScout ->'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Gallery Strip if multiple image assets exist */}
      {additionalImages.length > 1 && (
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Asset Gallery ({additionalImages.length} photos)
            </span>
            <span className="text-[10px] text-slate-500">Click to set as primary photo</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {additionalImages.map((imgUrl, idx) => {
              const isSelected = imgUrl === imageUrl;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    updateField('image_url', imgUrl);
                    setImgError(false);
                  }}
                  className={`relative w-14 h-14 rounded-lg border overflow-hidden flex-shrink-0 transition-all ${
                    isSelected
                      ? 'border-amber-400 ring-2 ring-amber-400/30'
                      : 'border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={imgUrl} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-contain p-0.5" />
                  {isSelected && (
                    <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-[8px] font-bold text-slate-950 text-center py-0.5">
                      Primary
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. Core Identity, Category & Storage */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Core Identity &amp; Inventory Location
            </span>
          </div>
          {!isMemorabilia && (
            <button
              type="button"
              onClick={() => {
                setForceShowMemorabilia(prev => !prev);
                if (!forceShowMemorabilia) setShowAuthCard(true);
              }}
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>{forceShowMemorabilia ? 'Hide Memorabilia & Auth Fields' : 'Signed / Memorabilia Item?'}</span>
            </button>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Item Title &amp; Description <span className="text-amber-400">*</span></span>
            <span className="text-[10px] text-slate-500 font-normal">
              Primary title used for marketplace listings &amp; comps matching
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

        {/* Row 1: Category, Subtype, Color, SKU, Bin & Qty */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Category</span>
            </label>
            <select
              value={form.category || ''}
              onChange={e => handleCategoryChange(e.target.value)}
              className="input-field text-xs font-semibold text-slate-200"
            >
              <option value="">-- Select Category --</option>
              <optgroup label="Memorabilia & Collectibles">
                {MEMORABILIA_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </optgroup>
              <optgroup label="General & Retail">
                {GENERAL_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </optgroup>
              {extraCategories.length > 0 && (
                <optgroup label="Custom">
                  {extraCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Item Subtype / Variant
            </label>
            <input
              type="text"
              list="outpost-subtype-presets"
              value={form.item_subtype || ''}
              onChange={e => updateField('item_subtype', e.target.value)}
              className="input-field text-xs text-slate-200"
              placeholder={subtypePresets[0] || 'e.g. Custom Stitched, OMLB'}
            />
            <datalist id="outpost-subtype-presets">
              {subtypePresets.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Item Color
            </label>
            <input
              type="text"
              list="outpost-color-presets"
              value={form.color || ''}
              onChange={e => updateField('color', e.target.value)}
              className="input-field text-xs text-slate-200"
              placeholder="e.g. Red, Black, White, Gold"
            />
            <datalist id="outpost-color-presets">
              {ITEM_COLOR_PRESETS.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

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
              placeholder="e.g. OP-261117-A1B2"
            />
            {skuFeedback && (
              <p className={`text-[10px] mt-1 font-medium ${skuFeedback.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {skuFeedback.msg}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span>Bin / Slot</span>
              </label>
              <input
                type="text"
                value={form.storage_location || ''}
                onChange={e => updateField('storage_location', e.target.value)}
                className="input-field text-xs font-mono text-slate-200"
                placeholder="Bin A3"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Qty
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
        </div>
      </div>

      {/* 2. Conditional Category-Specific Details & Subject */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/25 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              {CATEGORY_GROUP_LABELS[categoryGroup]}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Tailored to <strong className="text-amber-300">{form.category || 'General'}</strong> - feeds eBay Specifics, Comps &amp; AI Copy
          </span>
        </div>

        {/* Shared Memorabilia Subject Row (hidden for non-memorabilia retail unless toggled) */}
        {showMemorabiliaSections && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                <User className="w-3 h-3 text-slate-400" />
                <span>Athlete / Artist / Signer</span>
              </label>
              <input
                type="text"
                value={form.athlete_person || ''}
                onChange={e => updateField('athlete_person', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Brock Bowers, Taylor Swift"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Team / Band / Franchise
              </label>
              <input
                type="text"
                value={form.team_or_band || ''}
                onChange={e => updateField('team_or_band', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Georgia Bulldogs, Braves"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Sport / Music Genre
              </label>
              <input
                type="text"
                value={form.sport_genre || ''}
                onChange={e => updateField('sport_genre', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. NFL, MLB, Country, Rock"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Inscription (Exact)
              </label>
              <input
                type="text"
                value={form.inscription || ''}
                onChange={e => updateField('inscription', e.target.value)}
                className="input-field text-xs"
                placeholder='e.g. HOF 20, Go Dawgs'
              />
            </div>
          </div>
        )}

        {/* Category Group 1: Jerseys & Apparel */}
        {categoryGroup === 'jersey_apparel' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Jersey / Apparel Style
              </label>
              <select
                value={form.jersey_style || ''}
                onChange={e => handleJerseyStyleChange(e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Style --</option>
                {JERSEY_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Wearable Size
              </label>
              <input
                type="text"
                list="outpost-wearable-sizes"
                value={form.size || ''}
                onChange={e => updateField('size', e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="e.g. XL, 52"
              />
              <datalist id="outpost-wearable-sizes">
                {WEARABLE_SIZE_PRESETS.map(sz => <option key={sz} value={sz} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Colorway / Style
              </label>
              <input
                type="text"
                value={form.colorway || ''}
                onChange={e => updateField('colorway', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Home White, Black Alternate"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Jersey #
                </label>
                <input
                  type="text"
                  value={form.jersey_number || ''}
                  onChange={e => updateField('jersey_number', e.target.value)}
                  className="input-field text-xs font-mono"
                  placeholder="15"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Brand
                </label>
                <input
                  type="text"
                  value={form.brand || ''}
                  onChange={e => updateField('brand', e.target.value)}
                  className="input-field text-xs"
                  placeholder={form.is_custom_jersey ? 'Unbranded' : 'Nike, M&N'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Category Group 2: Balls, Helmets, Bats & Sports Equipment */}
        {categoryGroup === 'sports_gear' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Ball / Equipment Model
              </label>
              <input
                type="text"
                value={form.equipment_model || ''}
                onChange={e => updateField('equipment_model', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. OMLB, Riddell Speed Mini"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Signature Placement
              </label>
              <input
                type="text"
                list="outpost-sig-locations"
                value={form.signature_location || ''}
                onChange={e => updateField('signature_location', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Sweet Spot, Crown, Barrel"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Ink Color / Pen
              </label>
              <select
                value={form.ink_color || ''}
                onChange={e => updateField('ink_color', e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Ink --</option>
                {INK_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="flex flex-col justify-between">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Brand / Maker
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.brand || ''}
                  onChange={e => updateField('brand', e.target.value)}
                  className="input-field text-xs flex-1"
                  placeholder="Rawlings, Wilson, Riddell"
                />
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.case_included)}
                    onChange={e => updateField('case_included', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                  />
                  <span>Case</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Category Group 3: Guitars, Pickguards & Music Instruments */}
        {categoryGroup === 'music_instrument' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Instrument / Gear Type
              </label>
              <select
                value={form.guitar_type || ''}
                onChange={e => handleGuitarTypeChange(e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Type --</option>
                {GUITAR_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Signed Surface
              </label>
              <input
                type="text"
                list="outpost-sig-locations"
                value={form.signed_surface || ''}
                onChange={e => handleGuitarSurfaceChange(e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Pickguard, Guitar Body"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Finish / Color
              </label>
              <input
                type="text"
                value={form.instrument_finish || ''}
                onChange={e => updateField('instrument_finish', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Gloss Black, Sunburst"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Ink Color / Pen
              </label>
              <select
                value={form.ink_color || ''}
                onChange={e => updateField('ink_color', e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Ink --</option>
                {INK_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Category Group 4: CDs, Vinyl & Album Flats */}
        {categoryGroup === 'music_media' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Media Format
              </label>
              <select
                value={form.media_format || ''}
                onChange={e => updateField('media_format', e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Format --</option>
                {MEDIA_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Album / Release Title
              </label>
              <input
                type="text"
                value={form.album_title || ''}
                onChange={e => updateField('album_title', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Midnights, Dark Side of the Moon"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Signed Surface &amp; Ink
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  list="outpost-sig-locations"
                  value={form.signed_surface || ''}
                  onChange={e => updateField('signed_surface', e.target.value)}
                  className="input-field text-xs"
                  placeholder="Booklet"
                />
                <select
                  value={form.ink_color || ''}
                  onChange={e => updateField('ink_color', e.target.value)}
                  className="input-field text-xs text-slate-200"
                >
                  <option value="">Ink</option>
                  {INK_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer bg-slate-950/70 px-3 py-2 rounded-lg border border-slate-800 w-full">
                <input
                  type="checkbox"
                  checked={Boolean(form.media_included)}
                  onChange={e => updateField('media_included', e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                />
                <span>Disc / Vinyl Included</span>
              </label>
            </div>
          </div>
        )}

        {/* Category Group 5: Photos & Posters */}
        {categoryGroup === 'photo_print' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Photo / Print Dimensions
              </label>
              <input
                type="text"
                list="outpost-photo-dims"
                value={form.dimensions || ''}
                onChange={e => updateField('dimensions', e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="e.g. 8x10, 11x14, 16x20"
              />
              <datalist id="outpost-photo-dims">
                {PHOTO_DIMENSIONS.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Paper / Finish
              </label>
              <select
                value={form.photo_finish || ''}
                onChange={e => updateField('photo_finish', e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Finish --</option>
                {PHOTO_FINISHES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Ink Color / Pen
              </label>
              <select
                value={form.ink_color || ''}
                onChange={e => updateField('ink_color', e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Ink --</option>
                {INK_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Category Group 6: Trading Cards */}
        {categoryGroup === 'trading_card' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1 border-t border-slate-800/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Year</label>
              <input
                type="text"
                value={form.card_year || ''}
                onChange={e => updateField('card_year', e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="2024"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-300 mb-1">Set / Brand</label>
              <input
                type="text"
                value={form.card_set || ''}
                onChange={e => updateField('card_set', e.target.value)}
                className="input-field text-xs"
                placeholder="Panini Prizm, Topps Chrome"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Card #</label>
              <input
                type="text"
                value={form.card_number || ''}
                onChange={e => updateField('card_number', e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="#101"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Parallel / Serial</label>
              <input
                type="text"
                value={form.parallel_serial || ''}
                onChange={e => updateField('parallel_serial', e.target.value)}
                className="input-field text-xs"
                placeholder="Silver /99"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Grade / Auto</label>
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="text"
                  value={form.card_grade || ''}
                  onChange={e => updateField('card_grade', e.target.value)}
                  className="input-field text-xs font-mono px-1.5"
                  placeholder="PSA 10"
                />
                <input
                  type="text"
                  value={form.auto_grade || ''}
                  onChange={e => updateField('auto_grade', e.target.value)}
                  className="input-field text-xs font-mono px-1.5"
                  placeholder="Auto 10"
                />
              </div>
            </div>
          </div>
        )}

        {/* Category Group 7: General / Retail */}
        {categoryGroup === 'general' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Brand</label>
              <input
                type="text"
                value={form.brand || ''}
                onChange={e => updateField('brand', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. Sony, DeWalt, Kemimoto"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Model / Part #</label>
              <input
                type="text"
                value={form.model || ''}
                onChange={e => updateField('model', e.target.value)}
                className="input-field text-xs font-mono"
                placeholder="e.g. WH-1000XM5"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Size / Dimensions</label>
              <input
                type="text"
                value={form.dimensions || form.size || ''}
                onChange={e => updateField('dimensions', e.target.value)}
                className="input-field text-xs"
                placeholder="e.g. 12x8x4 in, Large"
              />
            </div>
          </div>
        )}

        <datalist id="outpost-sig-locations">
          {SIGNATURE_LOCATIONS.map(loc => <option key={loc} value={loc} />)}
        </datalist>

        {/* Collapsible Listing Guardrails & Target Net Strip */}
        <div className="pt-2 border-t border-slate-800/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowGuardrailOverrides(prev => !prev)}
              className="text-[11px] font-semibold text-slate-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Multi-Platform Rule Guardrails &amp; Target Net</span>
              {showGuardrailOverrides ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <div className="flex items-center gap-1.5 flex-wrap">
              {form.is_wearable && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                  Wearable{form.size ? `: ${form.size}` : ''}
                </span>
              )}
              {form.is_custom_jersey && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                  Custom Jersey Guard
                </span>
              )}
              {form.is_pickguard_guitar && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/25">
                  Pickguard Guitar Guard
                </span>
              )}
              {form.target_net && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                  Net Target: ${form.target_net}
                </span>
              )}
            </div>
          </div>

          {showGuardrailOverrides && (
            <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Target Net Payout ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.target_net ?? ''}
                    onChange={e => updateField('target_net', e.target.value)}
                    className="input-field text-xs font-mono tabular-nums text-amber-300 font-bold"
                    placeholder="e.g. 200"
                  />
                </div>
                {categoryGroup !== 'jersey_apparel' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Ink Color (Optional)
                    </label>
                    <select
                      value={form.ink_color || ''}
                      onChange={e => updateField('ink_color', e.target.value)}
                      className="input-field text-xs text-slate-200"
                    >
                      <option value="">-- Select Ink --</option>
                      {INK_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Included In Sale (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.included_in_sale || ''}
                    onChange={e => updateField('included_in_sale', e.target.value)}
                    className="input-field text-xs"
                    placeholder="e.g. Original COA card, UV display cube"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_wearable)}
                    onChange={e => updateField('is_wearable', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                  />
                  <span>Wearable Apparel / Jersey (Size token)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_custom_jersey)}
                    onChange={e => updateField('is_custom_jersey', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                  />
                  <span>Custom Stitched Jersey (anti-spoofing)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_pickguard_guitar)}
                    onChange={e => updateField('is_pickguard_guitar', e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-amber-400 focus:ring-amber-500"
                  />
                  <span>Signed Pickguard Display Guitar (anti-spoofing)</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Authentication & COA Card (Consolidated - zero duplicates) */}
      {showAuthSection && (
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Authentication &amp; Certification</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => updateField('cert_verified', !form.cert_verified)}
                className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer ${
                  form.cert_verified
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700'
                }`}
                title={form.cert_verified ? 'Click to unmark verification' : 'Click to mark as verified'}
              >
                {form.cert_verified ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Verified (Click to Unverify)</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>Unverified (Mark Verified)</span>
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
                  <span>Open Lookup</span>
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="truncate">{certMeta.name}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Auth Tier / Type
              </label>
              <select
                value={form.auth_type || ''}
                onChange={e => updateField('auth_type', e.target.value)}
                className="input-field text-xs text-slate-200"
              >
                <option value="">-- Select Tier --</option>
                {AUTH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Certificate / Hologram #
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
                placeholder="e.g. WIT384919, AB12345"
              />
            </div>
          </div>

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
      )}

      {/* 4. Condition, Prep & Framing Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Condition, Prep &amp; Framing
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Condition feeds eBay ConditionID &amp; public listing copy
          </span>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${showFrameDims ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Item Condition
            </label>
            <select
              value={form.item_condition || ''}
              onChange={e => updateField('item_condition', e.target.value)}
              className="input-field text-xs font-semibold text-slate-200"
            >
              <option value="">-- Select Condition --</option>
              {ITEM_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Prep Workflow Status
            </label>
            <select
              value={form.prep_status || 'Ready'}
              onChange={e => updateField('prep_status', e.target.value)}
              className={`input-field text-xs font-semibold ${
                form.prep_status && form.prep_status !== 'Ready' ? 'text-amber-300 border-amber-500/40' : 'text-emerald-300'
              }`}
            >
              {PREP_STATUSES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1">
              <Frame className="w-3 h-3 text-slate-400" />
              <span>Framing / Display Case</span>
            </label>
            <select
              value={form.framing_status || ''}
              onChange={e => updateField('framing_status', e.target.value)}
              className="input-field text-xs text-slate-200"
            >
              <option value="">-- Select Display --</option>
              {FRAMING_STATUSES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {showFrameDims && (
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Frame Outer Size
              </label>
              <input
                type="text"
                value={form.frame_dimensions || ''}
                onChange={e => updateField('frame_dimensions', e.target.value)}
                className="input-field text-xs font-mono text-cyan-300"
                placeholder="e.g. 34x42 in"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Public Condition &amp; Flaw Disclosure</span>
            </span>
            <span className="text-[10px] text-emerald-400/90 font-normal">
              Buyer-facing (safe for eBay, Reverb, Whatnot &amp; AI copy)
            </span>
          </label>
          <textarea
            rows={2}
            value={form.condition_notes || ''}
            onChange={e => updateField('condition_notes', e.target.value)}
            className="input-field text-xs resize-none"
            placeholder="e.g. Bold clean signature on sweet spot; zero toning or smudging; minor scuff on lower frame corner..."
          />
        </div>
      </div>

      {/* 5. Sourcing, Acquisition & Landed Cost (COGS) */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Sourcing, Acquisition &amp; Landed Cost (COGS)
            </span>
          </div>

          {item?.invoice_ref && (
            <span className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Batch: {item.invoice_ref}
            </span>
          )}
        </div>

        {/* Sourcing Vendor & Lot Ref */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Source Vendor / Auction House
            </label>
            <select
              value={form.source_vendor || ''}
              onChange={e => updateField('source_vendor', e.target.value)}
              className="input-field text-xs text-slate-200"
            >
              <option value="">-- Select Source --</option>
              {SOURCE_VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Auction Lot / Consignment Ref (Private)
            </label>
            <input
              type="text"
              value={form.source_lot_ref || ''}
              onChange={e => updateField('source_lot_ref', e.target.value)}
              className="input-field text-xs font-mono text-slate-300"
              placeholder="e.g. Lot #12862710 / Item #8183938"
            />
          </div>
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

      {/* 6. Target Listing Window & Internal Warehouse Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Target Listing Window &amp; Seasonality</span>
          </label>
          <input
            type="text"
            value={form.best_listing_window || ''}
            onChange={e => updateField('best_listing_window', e.target.value)}
            className="input-field text-xs"
            placeholder="e.g. NFL Kickoff, Playoffs, Tour Dates, Holiday"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Private Internal Notes</span>
            </span>
            <span className="text-[10px] text-slate-500 font-normal">Internal only - never published</span>
          </label>
          <textarea
            rows={2}
            value={form.notes || ''}
            onChange={e => updateField('notes', e.target.value)}
            className="input-field text-xs resize-none"
            placeholder="Private framer quotes, auction house notes, reserve reminders..."
          />
        </div>
      </div>
    </div>
  );
}
