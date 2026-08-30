import React, { useState, useEffect } from 'react';
import {
  Package, X, Save, Loader2, ExternalLink, ShieldCheck, Tag,
  DollarSign, Calendar, CheckCircle2, AlertCircle, TrendingUp, Zap,
  ArrowUpRight, ShoppingBag, Search, Link2, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { updateItem, saveComp, fetchLiveComps, getActiveEbayListings, syncEbayItem } from '../utils/auctionApi';
import { getCertVerificationUrl, getAuthenticatorMeta } from '../utils/certLookup';
import { fmtCurrency, roundPrice, computePricingFloors } from '../utils/formulaPreview';
import { cleanAthleteName, cleanItemDescription } from '../utils/spreadsheetParser';
import { buildEbaySearchUrl, cleanEbaySearchQuery } from '../utils/ebaySearch';

const PLATFORM_FEE_PRESETS = {
  'eBay':         { fee_pct: 13.5, flat_fee: 0.40 },
  'Whatnot':      { fee_pct: 8.0,  flat_fee: 0.30 },
  'Mercari':      { fee_pct: 10.0, flat_fee: 0.50 },
  'Poshmark':     { fee_pct: 20.0, flat_fee: 0.00 },
  'SidelineSwap': { fee_pct: 12.0, flat_fee: 0.50 },
  'StockX':       { fee_pct: 10.0, flat_fee: 0.00 },
  'Private Sale': { fee_pct: 0.0,  flat_fee: 0.00 },
};

const STANDARD_CATEGORIES = [
  'Electronics', 'Toys & Games', 'Books', 'Home & Kitchen', 'Sports', 'Health',
  'Clothing', 'Tools', 'Office', 'Pet Supplies', 'Beauty', 'Automotive',
  'Jersey', 'Photo', 'Card', 'Baseball', 'Bat', 'Football', 'Mask', 'Drum Stick',
  'Helmet', 'Glove', 'Poster', 'Puck', 'Other'
];

export function EditItemModal({ isOpen, item, categoryOptions = [], platformOptions = [], onClose, onUpdated }) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'pricing' | 'financials' | 'status' | 'ebay'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Active eBay listings browser state
  const [ebayListings, setEbayListings] = useState([]);
  const [loadingEbayListings, setLoadingEbayListings] = useState(false);
  const [syncingEbay, setSyncingEbay] = useState(false);
  const [ebaySearch, setEbaySearch] = useState('');

  const [form, setForm] = useState({
    item_name: '',
    category: '',
    sport_genre: '',
    athlete_person: '',
    authenticator: '',
    cert_number: '',
    unit_price: '',
    true_total_cost: '',
    status: 'Available',
    platform: '',
    platform_fee_pct: '13.5',
    platform_flat_fee: '0.40',
    current_list_price: '',
    actual_sell_price: '',
    target_margin_pct: '20',
    boost_pct: '0',
    est_shipping_cost: '0',
    date_acquired: '',
    date_listed: '',
    date_sold: '',
    best_listing_window: '',
    notes: '',
    ebay_listing_id: '',
    ebay_promoted_rate: ''
  });

  const [compsDraft, setCompsDraft] = useState({
    comp_1: '',
    comp_2: '',
    comp_3: '',
    recommended_list_price: '',
    saving: false,
    applied: false,
    fetchingLive: false,
    fetchMsg: null,
  });

  useEffect(() => {
    if (item) {
      setForm({
        item_name: item.item_name || '',
        category: item.category || '',
        sport_genre: item.sport_genre || '',
        athlete_person: item.athlete_person || '',
        authenticator: item.authenticator ? item.authenticator.replace(/#.*$/, '').trim() : '',
        cert_number: item.cert_number || '',
        unit_price: item.unit_price != null ? Number(item.unit_price).toFixed(2) : '',
        true_total_cost: item.true_total_cost != null ? Number(item.true_total_cost).toFixed(2) : '',
        status: item.status || 'Available',
        platform: item.platform || '',
        platform_fee_pct: item.platform_fee_pct != null ? String(parseFloat((item.platform_fee_pct * 100).toFixed(2))) : '13.5',
        platform_flat_fee: item.platform_flat_fee != null ? Number(item.platform_flat_fee).toFixed(2) : '0.40',
        current_list_price: item.current_list_price != null ? Number(item.current_list_price).toFixed(2) : '',
        actual_sell_price: item.actual_sell_price != null ? Number(item.actual_sell_price).toFixed(2) : '',
        target_margin_pct: item.target_margin_pct != null ? String(parseFloat((item.target_margin_pct * 100).toFixed(2))) : '20',
        boost_pct: item.boost_pct != null ? String(parseFloat((item.boost_pct * 100).toFixed(2))) : '0',
        est_shipping_cost: item.est_shipping_cost != null ? Number(item.est_shipping_cost).toFixed(2) : '0.00',
        date_acquired: item.date_acquired || '',
        date_listed: item.date_listed || '',
        date_sold: item.date_sold || '',
        best_listing_window: item.best_listing_window || '',
        notes: item.notes || '',
        ebay_listing_id: item.ebay_listing_id || '',
        ebay_promoted_rate: item.ebay_promoted_rate != null ? String(item.ebay_promoted_rate) : ''
      });

      const initialQuery = item.item_name ? item.item_name.split(' ').slice(0, 3).join(' ') : '';
      setEbaySearch(initialQuery);
      fetchActiveListings();

      setCompsDraft({
        comp_1: item.comp_1 !== null && item.comp_1 !== undefined && item.comp_1 !== '' ? Number(item.comp_1).toFixed(2) : '',
        comp_2: item.comp_2 !== null && item.comp_2 !== undefined && item.comp_2 !== '' ? Number(item.comp_2).toFixed(2) : '',
        comp_3: item.comp_3 !== null && item.comp_3 !== undefined && item.comp_3 !== '' ? Number(item.comp_3).toFixed(2) : '',
        recommended_list_price: (item.recommended_list_price || item.current_list_price || item.suggested_list_price) ? Number(item.recommended_list_price || item.current_list_price || item.suggested_list_price).toFixed(2) : '',
        saving: false,
        applied: false,
        fetchingLive: false,
        fetchMsg: null,
      });

      setError('');
      setSuccess('');
    }
  }, [item]);

  const fetchActiveListings = async () => {
    setLoadingEbayListings(true);
    try {
      const data = await getActiveEbayListings({ limit: 100 });
      setEbayListings(data.listings || []);
    } catch (_) {
      setEbayListings([]);
    } finally {
      setLoadingEbayListings(false);
    }
  };

  const handleSyncWithEbay = async () => {
    if (!form.ebay_listing_id) return;
    setSyncingEbay(true);
    setError('');
    setSuccess('');
    try {
      const res = await syncEbayItem(item.id, form.ebay_listing_id, form.ebay_promoted_rate);
      if (res?.item) {
        const it = res.item;
        setForm(prev => ({
          ...prev,
          current_list_price: it.current_list_price != null ? Number(it.current_list_price).toFixed(2) : prev.current_list_price,
          status: it.status || prev.status,
          platform: 'eBay',
          platform_fee_pct: it.platform_fee_pct != null ? String((it.platform_fee_pct * 100).toFixed(2)) : '13.25',
          platform_flat_fee: it.platform_flat_fee != null ? String(Number(it.platform_flat_fee).toFixed(2)) : '0.40',
          date_listed: it.date_listed || prev.date_listed,
          est_shipping_cost: it.est_shipping_cost != null ? String(Number(it.est_shipping_cost).toFixed(2)) : prev.est_shipping_cost,
          ebay_promoted_rate: it.ebay_promoted_rate != null ? String(it.ebay_promoted_rate) : prev.ebay_promoted_rate,
          boost_pct: it.ebay_promoted_rate != null ? String(it.ebay_promoted_rate) : (it.boost_pct != null ? String(it.boost_pct * 100) : prev.boost_pct)
        }));
        setSuccess(`Successfully synchronized with live eBay listing #${form.ebay_listing_id}!`);
        if (onUpdated) onUpdated(item.id, it);
      }
    } catch (e) {
      setError(e.message || 'Sync with eBay failed');
    } finally {
      setSyncingEbay(false);
    }
  };

  if (!isOpen || !item) return null;

  const certMeta = getAuthenticatorMeta(form.authenticator);
  const certUrl = getCertVerificationUrl(form.authenticator, form.cert_number);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item_name.trim()) {
      setError('Item name is required.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        item_name: form.item_name.trim(),
        category: form.category,
        sport_genre: form.sport_genre.trim(),
        athlete_person: form.athlete_person.trim(),
        authenticator: form.authenticator,
        cert_number: form.cert_number.trim(),
        unit_price: form.unit_price !== '' ? parseFloat(form.unit_price) : 0,
        true_total_cost: form.true_total_cost !== '' ? parseFloat(form.true_total_cost) : undefined,
        status: form.status,
        platform: form.platform,
        platform_fee_pct: form.platform_fee_pct !== '' ? parseFloat(form.platform_fee_pct) / 100 : 0.135,
        platform_flat_fee: form.platform_flat_fee !== '' ? parseFloat(form.platform_flat_fee) : 0.40,
        current_list_price: form.current_list_price !== '' ? parseFloat(form.current_list_price) : null,
        actual_sell_price: form.actual_sell_price !== '' ? parseFloat(form.actual_sell_price) : null,
        target_margin_pct: form.target_margin_pct !== '' ? parseFloat(form.target_margin_pct) / 100 : 0.20,
        boost_pct: form.ebay_promoted_rate !== '' ? (parseFloat(form.ebay_promoted_rate) / 100) : (form.boost_pct !== '' ? parseFloat(form.boost_pct) / 100 : 0),
        est_shipping_cost: form.est_shipping_cost !== '' ? parseFloat(form.est_shipping_cost) : 0,
        date_acquired: form.date_acquired || null,
        date_listed: form.date_listed || null,
        date_sold: form.date_sold || null,
        best_listing_window: form.best_listing_window.trim() || null,
        notes: form.notes.trim() || null,
        ebay_listing_id: form.ebay_listing_id ? form.ebay_listing_id.trim() : null,
        ebay_promoted_rate: form.ebay_promoted_rate !== '' ? parseFloat(form.ebay_promoted_rate) : null
      };

      const res = await updateItem(item.id, payload);
      setSuccess('Item updated successfully!');
      const merged = { ...payload, ...(res?.item || res || {}) };
      if (onUpdated) onUpdated(item.id, merged);
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to update item.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlatformChange = (p) => {
    const preset = PLATFORM_FEE_PRESETS[p];
    if (preset) {
      setForm(prev => ({
        ...prev,
        platform: p,
        platform_fee_pct: String(preset.fee_pct),
        platform_flat_fee: Number(preset.flat_fee).toFixed(2)
      }));
    } else {
      setForm(prev => ({ ...prev, platform: p }));
    }
  };

  // Merge full categories and platforms
  const allCategories = Array.from(new Set([
    ...STANDARD_CATEGORIES,
    ...(categoryOptions || []),
    form.category
  ].filter(Boolean))).sort();

  const allPlatforms = Array.from(new Set([
    ...Object.keys(PLATFORM_FEE_PRESETS),
    ...(platformOptions || []),
    form.platform
  ].filter(Boolean)));

  // Pricing calculations
  const parsedFeePct = (parseFloat(form.platform_fee_pct) || 0) / 100;
  const parsedFlatFee = parseFloat(form.platform_flat_fee) || 0;
  const parsedBoost = (parseFloat(form.boost_pct) || 0) / 100;
  const parsedMargin = (parseFloat(form.target_margin_pct) || 0) / 100;
  const parsedShip = parseFloat(form.est_shipping_cost) || 0;
  const currentCost = form.true_total_cost !== '' ? (parseFloat(form.true_total_cost) || 0) : (form.unit_price !== '' ? (parseFloat(form.unit_price) || 0) : (item?.true_total_cost || 0));

  const { min_sell_price: liveMinSell, suggested_list_price: liveSuggestedList } = computePricingFloors({
    true_total_cost: currentCost,
    platform_fee_pct: parsedFeePct,
    boost_pct: parsedBoost,
    platform_flat_fee: parsedFlatFee,
    est_shipping_cost: parsedShip,
    target_margin_pct: parsedMargin
  });

  // Comps calculations
  const updateCompDraft = (field, value) => {
    setCompsDraft(prev => {
      const updated = { ...prev, [field]: value, applied: false };
      if (field.startsWith('comp_')) {
        const c1 = field === 'comp_1' ? value : prev.comp_1;
        const c2 = field === 'comp_2' ? value : prev.comp_2;
        const c3 = field === 'comp_3' ? value : prev.comp_3;
        const vals = [c1, c2, c3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
        if (vals.length > 0) {
          updated.recommended_list_price = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        }
      }
      return updated;
    });
  };

  const handleSaveComps = async (applyToItem = false) => {
    setCompsDraft(prev => ({ ...prev, saving: true }));
    setError('');
    setSuccess('');
    try {
      await saveComp({
        item_id: item.id,
        comp_1: compsDraft.comp_1 === '' ? null : Number(compsDraft.comp_1),
        comp_2: compsDraft.comp_2 === '' ? null : Number(compsDraft.comp_2),
        comp_3: compsDraft.comp_3 === '' ? null : Number(compsDraft.comp_3),
        recommended_list_price: compsDraft.recommended_list_price === '' ? null : Number(compsDraft.recommended_list_price),
        apply_to_item: applyToItem
      });
      setCompsDraft(prev => ({ ...prev, saving: false, applied: applyToItem }));
      setSuccess(applyToItem ? 'Target price applied to item listing!' : 'Market comps saved successfully!');
      if (applyToItem && compsDraft.recommended_list_price) {
        setForm(prev => ({ ...prev, current_list_price: String(compsDraft.recommended_list_price) }));
        if (onUpdated) {
          onUpdated(item.id, { current_list_price: Number(compsDraft.recommended_list_price) });
        }
      }
    } catch (err) {
      setError(`Save comps failed: ${err.message}`);
      setCompsDraft(prev => ({ ...prev, saving: false }));
    }
  };

  const handleFetchLiveComps = async () => {
    setCompsDraft(prev => ({ ...prev, fetchingLive: true, fetchMsg: null }));
    try {
      const q = cleanEbaySearchQuery(form.item_name || item.item_name, form.athlete_person || item.athlete_person, form.authenticator || item.authenticator);
      const res = await fetchLiveComps(q, item.id);
      if (res && res.success && res.count > 0) {
        setCompsDraft(prev => ({
          ...prev,
          comp_1: res.comp_1 !== null && res.comp_1 !== undefined ? roundPrice(res.comp_1) : prev.comp_1,
          comp_2: res.comp_2 !== null && res.comp_2 !== undefined ? roundPrice(res.comp_2) : prev.comp_2,
          comp_3: res.comp_3 !== null && res.comp_3 !== undefined ? roundPrice(res.comp_3) : prev.comp_3,
          recommended_list_price: roundPrice(res.live_avg || res.median || prev.recommended_list_price),
          fetchingLive: false,
          fetchMsg: { type: 'success', text: `Found ${res.count} sold comps on eBay! Avg: $${res.live_avg}` },
          applied: false,
        }));
      } else {
        setCompsDraft(prev => ({
          ...prev,
          fetchingLive: false,
          fetchMsg: { type: 'info', text: 'No sold comps found. Click eBay Comps link to inspect.' }
        }));
      }
    } catch (err) {
      setCompsDraft(prev => ({
        ...prev,
        fetchingLive: false,
        fetchMsg: { type: 'error', text: err.message || 'Error fetching live eBay comps.' }
      }));
    }
  };

  const compVals = [compsDraft.comp_1, compsDraft.comp_2, compsDraft.comp_3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  const liveCompAvg = compVals.length > 0 ? compVals.reduce((a, b) => a + b, 0) / compVals.length : null;
  const floorSpread = compsDraft.recommended_list_price && item.min_sell_price
    ? (Number(compsDraft.recommended_list_price) - item.min_sell_price)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Edit Inventory Item</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Item ID: <span className="font-mono text-slate-300">{item.id ? item.id.slice(0, 8) : '--'}...</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-6 gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'details'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> General & Auth
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'pricing'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Pricing Intelligence
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('financials')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'financials'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" /> Costs & Platform Fees
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'status'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" /> Lifecycle & Notes
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ebay')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'ebay'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            eBay Listing
            {form.ebay_listing_id && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" title={`Linked to eBay #${form.ebay_listing_id}`} />
            )}
          </button>
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Form Body */}
        <form id="edit-item-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* TAB 1: GENERAL & AUTHENTICATION */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Item Description <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.item_name}
                  onChange={e => setForm({ ...form, item_name: e.target.value })}
                  className="input-field text-sm font-medium"
                  placeholder="e.g. Patrick Mahomes Signed Red Jersey JSA COA"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="input-field text-xs font-semibold"
                  >
                    <option value="">-- Select Category --</option>
                    {allCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Sport / Genre</label>
                  <input
                    type="text"
                    value={form.sport_genre}
                    onChange={e => setForm({ ...form, sport_genre: e.target.value })}
                    className="input-field text-xs"
                    placeholder="e.g. NFL, MLB, Boxing, Entertainment"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Athlete / Signer / Personality</label>
                <input
                  type="text"
                  value={form.athlete_person}
                  onChange={e => setForm({ ...form, athlete_person: e.target.value })}
                  className="input-field text-xs"
                  placeholder="e.g. Patrick Mahomes"
                />
              </div>

              {/* Authentication & Cert Verification */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-200">Authentication & Cert Details</span>
                  </div>
                  {certUrl && (
                    <a
                      href={certUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> Verify Cert Database
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Authenticator Company</label>
                    <select
                      value={form.authenticator}
                      onChange={e => setForm({ ...form, authenticator: e.target.value })}
                      className="input-field text-xs font-semibold text-amber-300"
                    >
                      <option value="">-- Unauthenticated / None --</option>
                      {['Beckett', 'JSA', 'PSA', 'ACOA', 'Upper Deck', 'Fanatics', 'Tristar', 'Steiner', 'Schwartz', 'Other'].map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    {form.authenticator && certMeta?.name && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Recognized Authenticator: <span className="text-amber-400 font-semibold">{certMeta.name}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Cert / Hologram #</label>
                    <input
                      type="text"
                      value={form.cert_number}
                      onChange={e => setForm({ ...form, cert_number: e.target.value })}
                      className="input-field text-xs font-mono"
                      placeholder="e.g. WIT384919, or 104928"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRICING INTELLIGENCE & COMPS */}
          {activeTab === 'pricing' && (
            <div className="space-y-4">
              {/* Live eBay Comps fetcher bar */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-200">Live Sold Comps Intelligence</span>
                  </div>
                  <a
                    href={buildEbaySearchUrl(form.item_name || item.item_name, form.athlete_person || item.athlete_person, form.authenticator || item.authenticator)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Search Sold on eBay ↗
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={compsDraft.fetchingLive}
                    onClick={handleFetchLiveComps}
                    className="px-3.5 py-2 text-xs rounded-xl font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {compsDraft.fetchingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>{compsDraft.fetchingLive ? 'Fetching Live Comps...' : 'Auto-Fetch eBay Sold Comps'}</span>
                  </button>
                  <p className="text-[11px] text-slate-400">
                    Queries sold marketplace data based on title and signer
                  </p>
                </div>

                {compsDraft.fetchMsg && (
                  <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    compsDraft.fetchMsg.type === 'success'
                      ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                      : compsDraft.fetchMsg.type === 'error'
                      ? 'bg-red-950/40 border border-red-500/30 text-red-300'
                      : 'bg-slate-900 border border-slate-800 text-slate-300'
                  }`}>
                    {compsDraft.fetchMsg.text}
                  </div>
                )}
              </div>

              {/* 3 Comps manual entry inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[1, 2, 3].map(num => (
                  <div key={num}>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Recent Comp #{num} ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={compsDraft[`comp_${num}`]}
                        onChange={e => updateCompDraft(`comp_${num}`, e.target.value)}
                        className="input-field text-xs pl-8 font-mono font-bold text-amber-300"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Valuation metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Comp Average</span>
                  <p className="text-sm font-black text-amber-400 mt-0.5">
                    {liveCompAvg ? fmtCurrency(liveCompAvg) : '--'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Min Floor Price</span>
                  <p className="text-sm font-black text-emerald-400 mt-0.5">
                    {item.min_sell_price ? fmtCurrency(item.min_sell_price) : '--'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Spread Over Floor</span>
                  <p className={`text-sm font-black mt-0.5 ${
                    floorSpread != null
                      ? floorSpread >= 0 ? 'text-emerald-400' : 'text-red-400'
                      : 'text-slate-500'
                  }`}>
                    {floorSpread != null ? fmtCurrency(floorSpread) : '--'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Target Profit Margin</span>
                  <p className="text-sm font-black text-blue-400 mt-0.5">
                    {form.target_margin_pct ? parseFloat(Number(form.target_margin_pct).toFixed(2)) : '20'}%
                  </p>
                </div>
              </div>

              {/* Recommended Target Price */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">Target Recommended List Price</span>
                  </div>
                  <span className="text-[11px] text-amber-400/80">Suggested asking price</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-xs font-bold pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={compsDraft.recommended_list_price}
                      onChange={e => updateCompDraft('recommended_list_price', e.target.value)}
                      className="input-field text-sm pl-8 font-black text-amber-400 font-mono bg-slate-900 border-amber-500/40"
                      placeholder="0.00"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={compsDraft.saving || !compsDraft.recommended_list_price}
                    onClick={() => handleSaveComps(false)}
                    className="px-3.5 py-2 text-xs rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
                  >
                    {compsDraft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Comps'}
                  </button>

                  <button
                    type="button"
                    disabled={compsDraft.saving || !compsDraft.recommended_list_price}
                    onClick={() => handleSaveComps(true)}
                    className={`px-3.5 py-2 text-xs rounded-xl font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 ${
                      compsDraft.applied
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                    }`}
                  >
                    {compsDraft.applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    <span>{compsDraft.applied ? 'Applied to Item!' : 'Apply to Listing'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: COSTS & PRICING FLOORS */}
          {activeTab === 'financials' && (
            <div className="space-y-4">
              {/* Landed & Unit Cost Breakdown (Fully Editable) */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-400">Acquisition & Landed Cost</span>
                    <p className="text-[10px] text-slate-400">Edit unit purchase price or override total landed cost</p>
                  </div>
                  <div className="text-right text-[11px] text-slate-400">
                    <p>Prorated Tax/Ship/Disc: <span className="font-mono text-slate-300">{fmtCurrency((item.prorated_tax || 0) + (item.prorated_shipping || 0) - (item.prorated_discount || 0))}</span></p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Purchase / Unit Price ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={form.unit_price}
                        onChange={e => {
                          const val = e.target.value;
                          const parsed = parseFloat(val);
                          const proratedDiff = (item.prorated_tax || 0) + (item.prorated_shipping || 0) - (item.prorated_discount || 0);
                          const autoLanded = !isNaN(parsed) ? (parsed + proratedDiff).toFixed(2) : '';
                          setForm({ ...form, unit_price: val, true_total_cost: autoLanded });
                        }}
                        className="input-field text-xs pl-8 font-mono text-white font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Total Landed Cost / True Cost ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs font-bold pointer-events-none">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={form.true_total_cost}
                        onChange={e => setForm({ ...form, true_total_cost: e.target.value })}
                        className="input-field text-xs pl-8 font-mono text-amber-400 font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Selling Platform</label>
                  <select
                    value={form.platform}
                    onChange={e => handlePlatformChange(e.target.value)}
                    className="input-field text-xs font-semibold text-amber-300"
                  >
                    <option value="">-- Select Platform --</option>
                    {allPlatforms.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Current Active List Price ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.current_list_price}
                      onChange={e => setForm({ ...form, current_list_price: e.target.value })}
                      className="input-field text-xs pl-8 font-mono text-emerald-300 font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Listing Company Fees & Rates */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <span>Listing Company Fee Breakdown</span>
                    <span className="text-[10px] font-mono font-normal text-slate-400">({form.platform || 'Custom'})</span>
                  </p>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {form.platform_fee_pct || 0}% + ${Number(form.platform_flat_fee || 0).toFixed(2)} per order
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Platform Fee Rate (%) <span className="text-slate-500 font-normal">(eBay 13.5%)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.05"
                        value={form.platform_fee_pct}
                        onChange={e => setForm({ ...form, platform_fee_pct: e.target.value })}
                        className="input-field text-xs pr-8 font-mono text-amber-300 font-bold"
                        placeholder="13.5"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Per-Order Flat Fee ($) <span className="text-slate-500 font-normal">(eBay $0.40)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                      <input
                        type="number"
                        step="0.05"
                        value={form.platform_flat_fee}
                        onChange={e => setForm({ ...form, platform_flat_fee: e.target.value })}
                        className="input-field text-xs pl-8 font-mono text-amber-300 font-bold"
                        placeholder="0.40"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Target Margin %</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      value={form.target_margin_pct}
                      onChange={e => setForm({ ...form, target_margin_pct: e.target.value })}
                      className="input-field text-xs pr-8 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Promoted Listing Boost %</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={form.boost_pct}
                      onChange={e => setForm({ ...form, boost_pct: e.target.value })}
                      className="input-field text-xs pr-8 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Est. Outbound Shipping ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.5"
                      value={form.est_shipping_cost}
                      onChange={e => setForm({ ...form, est_shipping_cost: e.target.value })}
                      className="input-field text-xs pl-8 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Min Floor Break-Even</span>
                  <p className="text-base font-black text-emerald-400 mt-0.5">{fmtCurrency(liveMinSell)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Suggested List Price</span>
                  <p className="text-base font-black text-blue-400 mt-0.5">{fmtCurrency(liveSuggestedList)}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STATUS & NOTES */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Inventory Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    className="input-field text-xs font-semibold"
                  >
                    <option value="Available">Available</option>
                    <option value="Listed">Listed</option>
                    <option value="Sold">Sold</option>
                    <option value="Kept for Self">Kept for Self</option>
                    <option value="Returned">Returned</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Date Acquired</label>
                  <input
                    type="date"
                    value={form.date_acquired}
                    onChange={e => setForm({ ...form, date_acquired: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Date Listed</label>
                  <input
                    type="date"
                    value={form.date_listed}
                    onChange={e => setForm({ ...form, date_listed: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Date Sold</label>
                  <input
                    type="date"
                    value={form.date_sold}
                    onChange={e => setForm({ ...form, date_sold: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>
              </div>

              {form.status === 'Sold' && (
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                  <label className="block text-xs font-bold text-emerald-400 mb-1">
                    Actual Realized Sale Price ($)
                  </label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.actual_sell_price}
                      onChange={e => setForm({ ...form, actual_sell_price: e.target.value })}
                      className="input-field text-xs pl-8 font-mono text-emerald-300 font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Best Target Selling Window</label>
                <input
                  type="text"
                  value={form.best_listing_window}
                  onChange={e => setForm({ ...form, best_listing_window: e.target.value })}
                  className="input-field text-xs"
                  placeholder="e.g. NFL Season Kickoff, Playoffs, Christmas"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Notes & Memorabilia Details</label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input-field text-xs"
                  placeholder="Condition notes, inscription details, framing dimensions..."
                />
              </div>
            </div>
          )}

          {/* TAB 5: EBAY LISTING */}
          {activeTab === 'ebay' && (
            <div className="space-y-4">
              {/* Linked Status Banner */}
              {form.ebay_listing_id ? (
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-xs font-bold text-emerald-300">Linked to Active eBay Listing</span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono">Listing ID: #{form.ebay_listing_id}</p>
                    <a
                      href={`https://www.ebay.com/itm/${form.ebay_listing_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline pt-0.5"
                    >
                      <ExternalLink className="w-3 h-3" /> View live on eBay.com
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={syncingEbay}
                      onClick={handleSyncWithEbay}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 transition-all flex items-center gap-1"
                    >
                      {syncingEbay ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      <span>Sync Live Data</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, ebay_listing_id: '' }))}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/20 transition-all flex-shrink-0"
                    >
                      Disconnect Listing
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>Not currently linked to an active eBay store listing.</span>
                  <span className="text-[11px] text-amber-400 font-semibold">Select a listing below to pair</span>
                </div>
              )}

              {/* Active eBay Listings Browser */}
              <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <ShoppingBag className="w-4 h-4" />
                    <span>Select from Active eBay Store Listings</span>
                  </div>
                  {loadingEbayListings && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={ebaySearch}
                    onChange={e => setEbaySearch(e.target.value)}
                    placeholder="Filter your active eBay listings by title, SKU, or ID..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  {ebaySearch && (
                    <button
                      type="button"
                      onClick={() => setEbaySearch('')}
                      className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs p-0.5"
                      title="Clear search filter"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {ebayListings
                    .filter(l => {
                      if (!ebaySearch.trim()) return true;
                      const q = ebaySearch.trim().toLowerCase();
                      const cleanQ = q.replace(/[^a-z0-9]/g, '');

                      if (l.title && l.title.toLowerCase().includes(q)) return true;
                      if (l.sku && l.sku.toLowerCase().includes(q)) return true;
                      if (l.listing_id && String(l.listing_id).includes(q)) return true;

                      const cleanTitle = (l.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                      if (cleanTitle && cleanQ && cleanTitle.includes(cleanQ)) return true;

                      const tokens = q.split(/\s+/).filter(t => t.length > 1);
                      if (tokens.length > 0 && tokens.every(token => (l.title || '').toLowerCase().includes(token))) {
                        return true;
                      }

                      return false;
                    })
                    .slice(0, 30)
                    .map((listing, idx) => {
                      const id = String(listing.listing_id || listing.sku);
                      const isSelected = form.ebay_listing_id === id;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setForm(prev => ({
                            ...prev,
                            ebay_listing_id: id,
                            current_list_price: listing.price ? String(listing.price.toFixed(2)) : prev.current_list_price,
                            platform: 'eBay',
                            platform_fee_pct: '13.5',
                            platform_flat_fee: '0.40',
                            status: 'Listed'
                          }))}
                          className={`w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between text-xs ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500/50 text-white'
                              : 'bg-slate-900/90 hover:bg-amber-500/10 border-slate-800 hover:border-amber-500/30'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-slate-200 truncate">{listing.title}</div>
                            <div className="text-[10px] text-slate-400">
                              ID: {listing.listing_id || 'N/A'} {listing.sku ? `· SKU: ${listing.sku}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="font-bold text-emerald-400">${listing.price?.toFixed(2)}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                          </div>
                        </button>
                      );
                    })}

                  {!loadingEbayListings && ebayListings.length === 0 && (
                    <div className="text-center py-4 text-slate-500 text-xs">
                      No active listings found on your connected eBay account.
                    </div>
                  )}

                  {!loadingEbayListings && ebayListings.length > 0 && ebayListings.filter(l => {
                    if (!ebaySearch.trim()) return true;
                    const q = ebaySearch.trim().toLowerCase();
                    const cleanQ = q.replace(/[^a-z0-9]/g, '');
                    if (l.title && l.title.toLowerCase().includes(q)) return true;
                    const cleanTitle = (l.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    return cleanTitle && cleanQ && cleanTitle.includes(cleanQ);
                  }).length === 0 && (
                    <div className="text-center py-4 text-slate-400 text-xs">
                      <p>No listings match <span className="text-amber-400 font-semibold">"{ebaySearch}"</span>.</p>
                      <button
                        type="button"
                        onClick={() => setEbaySearch('')}
                        className="mt-1 text-[11px] text-amber-400 hover:underline"
                      >
                        Clear filter to view all {ebayListings.length} listings
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    eBay Listing ID <span className="text-slate-500 font-normal">(12-digit numeric)</span>
                  </label>
                  <input
                    type="text"
                    value={form.ebay_listing_id}
                    onChange={e => setForm({ ...form, ebay_listing_id: e.target.value })}
                    className="input-field text-xs font-mono text-amber-300 font-bold"
                    placeholder="e.g. 395123456789"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    From URL: ebay.com/itm/<strong>123456789012</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Promoted Listings Rate (%) <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      value={form.ebay_promoted_rate}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(prev => ({
                          ...prev,
                          ebay_promoted_rate: val,
                          boost_pct: val
                        }));
                      }}
                      className="input-field text-xs pr-8 font-mono text-amber-300 font-bold"
                      placeholder="e.g. 3.5"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Incorporated into ad boost (%) and minimum break-even pricing floor.
                  </p>
                </div>
              </div>

              {/* Real-time eBay Pricing Floor Calculation Breakdown */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    <span>Live eBay Break-Even & Profit Floor Calculation</span>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">
                    Floor: ${liveMinSell?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                  <div>
                    <span className="block text-[10px] text-slate-500">True Acquisition Cost:</span>
                    <span className="font-semibold text-white">${currentCost.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">Est. Shipping Charge:</span>
                    <span className="font-semibold text-sky-400">${parsedShip.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">eBay Fee Rate:</span>
                    <span className="font-semibold text-amber-300">{(parsedFeePct * 100).toFixed(2)}% + ${parsedFlatFee.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-500">Promoted Ad Rate:</span>
                    <span className="font-semibold text-purple-400">{(parsedBoost * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
                  <span className="text-slate-400 text-[11px]">
                    Min Break-Even Floor: <strong className="text-emerald-400">${liveMinSell?.toFixed(2) || '0.00'}</strong>
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Suggested List (+{((parseFloat(form.target_margin_pct) || 20)).toFixed(0)}% Margin): <strong className="text-amber-300">${liveSuggestedList?.toFixed(2) || '0.00'}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-slate-500">
              Invoice Ref: <span className="text-slate-300 font-mono">{item.invoice_ref || '--'}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs rounded-xl font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-2 shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
