import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { updateItem, saveComp, fetchLiveComps, getActiveEbayListings, syncEbayItem, fetchEbayItemAnalytics } from '../utils/auctionApi';
import { computeFeeBreakdown } from '../utils/feeEngine';
import { roundPrice } from '../utils/formulaPreview';
import { cleanEbaySearchQuery } from '../utils/ebaySearch';

// Subcomponents
import { EditModalHeader } from './edit/EditModalHeader';
import { EditModalFooter } from './edit/EditModalFooter';
import { EditTabNav } from './edit/EditTabNav';
import { EditTabDetails } from './edit/EditTabDetails';
import { EditTabListingPricing } from './edit/EditTabListingPricing';
import { EditTabComps } from './edit/EditTabComps';
import { EditTabPerformance } from './edit/EditTabPerformance';

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

const EMPTY_FORM = {
  item_name: '',
  sku: '',
  category: '',
  sport_genre: '',
  athlete_person: '',
  quantity: 1,
  best_listing_window: '',
  notes: '',
  // Costs
  unit_price: '',
  true_total_cost: '',
  // Listing & Status
  status: 'Available',
  listing_format: 'Fixed Price',
  listing_status: 'Draft',
  platform: 'eBay',
  platform_fee_pct: '13.5',
  platform_flat_fee: '0.40',
  est_shipping_cost: '0.00',
  buyer_shipping_cost: '0.00',
  // Pricing
  current_list_price: '',
  buy_it_now_price: '',
  floor_price: '',
  actual_sell_price: '',
  target_margin_pct: '30',
  ebay_promoted_rate: '',
  // Dates
  purchase_date: '',
  date_acquired: '',
  date_listed: '',
  date_sold: '',
  // Auth & Sync
  authenticator: '',
  cert_number: '',
  cert_verification_url: '',
  ebay_listing_id: ''
};

export function EditItemModal({
  isOpen,
  item,
  categoryOptions = [],
  platformOptions = [],
  onClose,
  onUpdated,
  onOpenCopyModal
}) {
  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);

  // Active eBay listings browser state
  const [ebayListings, setEbayListings] = useState([]);
  const [loadingEbayListings, setLoadingEbayListings] = useState(false);
  const [syncingEbay, setSyncingEbay] = useState(false);
  const [ebaySearch, setEbaySearch] = useState('');

  // Comps Draft state
  const [compsDraft, setCompsDraft] = useState({
    comp_1: '',
    comp_2: '',
    comp_3: '',
    active_comp_1: '',
    active_comp_2: '',
    active_comp_3: '',
    recommended_list_price: '',
    saving: false,
    applied: false,
    fetchingLive: false,
    fetchMsg: null,
  });

  // eBay Listing Performance Analytics state
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsRange, setAnalyticsRange] = useState(30);

  // Populate form on item change
  useEffect(() => {
    if (item) {
      const populated = {
        item_name: item.item_name || '',
        sku: item.sku || '',
        category: item.category || '',
        sport_genre: item.sport_genre || '',
        athlete_person: item.athlete_person || '',
        quantity: item.quantity != null ? item.quantity : 1,
        best_listing_window: item.best_listing_window || '',
        notes: item.notes || '',

        unit_price: item.unit_price != null ? Number(item.unit_price).toFixed(2) : '',
        true_total_cost: item.true_total_cost != null ? Number(item.true_total_cost).toFixed(2) : '',

        status: item.status || 'Available',
        listing_format: item.listing_format || 'Fixed Price',
        listing_status: item.listing_status || (item.status === 'Listed' ? 'Active' : item.status === 'Sold' ? 'Sold' : 'Draft'),
        platform: item.platform || 'eBay',
        platform_fee_pct: item.platform_fee_pct != null
          ? String(parseFloat((Number(item.platform_fee_pct) * 100).toFixed(2)))
          : '13.5',
        platform_flat_fee: item.platform_flat_fee != null
          ? Number(item.platform_flat_fee).toFixed(2)
          : '0.40',
        est_shipping_cost: item.est_shipping_cost != null
          ? Number(item.est_shipping_cost).toFixed(2)
          : '0.00',
        buyer_shipping_cost: item.buyer_shipping_cost != null
          ? Number(item.buyer_shipping_cost).toFixed(2)
          : (item.shipping_charged != null ? Number(item.shipping_charged).toFixed(2) : '0.00'),

        current_list_price: item.current_list_price != null ? Number(item.current_list_price).toFixed(2) : '',
        buy_it_now_price: item.buy_it_now_price != null ? Number(item.buy_it_now_price).toFixed(2) : '',
        floor_price: item.floor_price != null ? Number(item.floor_price).toFixed(2) : '',
        actual_sell_price: item.actual_sell_price != null ? Number(item.actual_sell_price).toFixed(2) : '',
        target_margin_pct: item.target_margin_pct != null
          ? String(parseFloat((Number(item.target_margin_pct) * 100).toFixed(2)))
          : '30',
        ebay_promoted_rate: item.ebay_promoted_rate != null
          ? String(item.ebay_promoted_rate)
          : (item.boost_pct != null && Number(item.boost_pct) > 0 ? String(parseFloat((Number(item.boost_pct) * 100).toFixed(2))) : ''),

        purchase_date: item.purchase_date || item.date_acquired || '',
        date_acquired: item.date_acquired || item.purchase_date || '',
        date_listed: item.date_listed || '',
        date_sold: item.date_sold || '',

        authenticator: item.authenticator ? item.authenticator.replace(/#.*$/, '').trim() : '',
        cert_number: item.cert_number || '',
        cert_verification_url: item.cert_verification_url || '',
        ebay_listing_id: item.ebay_listing_id || ''
      };

      setForm(populated);
      setInitialForm(populated);

      // Comps
      setCompsDraft({
        comp_1: item.comp_1 != null && item.comp_1 !== '' ? Number(item.comp_1).toFixed(2) : '',
        comp_2: item.comp_2 != null && item.comp_2 !== '' ? Number(item.comp_2).toFixed(2) : '',
        comp_3: item.comp_3 != null && item.comp_3 !== '' ? Number(item.comp_3).toFixed(2) : '',
        active_comp_1: item.active_comp_1 != null && item.active_comp_1 !== '' ? Number(item.active_comp_1).toFixed(2) : '',
        active_comp_2: item.active_comp_2 != null && item.active_comp_2 !== '' ? Number(item.active_comp_2).toFixed(2) : '',
        active_comp_3: item.active_comp_3 != null && item.active_comp_3 !== '' ? Number(item.active_comp_3).toFixed(2) : '',
        recommended_list_price: (item.recommended_list_price || item.current_list_price || item.suggested_list_price)
          ? Number(item.recommended_list_price || item.current_list_price || item.suggested_list_price).toFixed(2)
          : '',
        saving: false,
        applied: false,
        fetchingLive: false,
        fetchMsg: null,
      });

      // Reset Analytics on item change
      setAnalytics(null);
      setLoadingAnalytics(false);
      setAnalyticsError('');
      setAnalyticsRange(30);

      const initialQuery = item.item_name ? item.item_name.split(' ').slice(0, 3).join(' ') : '';
      setEbaySearch(initialQuery);
      fetchActiveListings();

      setError('');
      setSuccess('');
      setSaveSuccess(false);
    }
  }, [item]);

  // Dirty state calculation
  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  // Handle escape key
  const handleClose = useCallback(() => {
    if (isDirty) {
      const confirmDiscard = window.confirm('You have unsaved changes. Discard changes and close?');
      if (!confirmDiscard) return;
    }
    onClose();
  }, [isDirty, onClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const updateField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

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

  const handleSyncWithEbay = async () => {
    if (!form.ebay_listing_id) return;
    setSyncingEbay(true);
    setError('');
    setSuccess('');
    try {
      const res = await syncEbayItem(item.id, form.ebay_listing_id, form.ebay_promoted_rate);
      if (res?.item) {
        const it = res.item;
        const liveListing = res.liveListing || {};
        const syncPromotedRate = (it.ebay_promoted_rate != null && Number(it.ebay_promoted_rate) > 0)
          ? String(it.ebay_promoted_rate)
          : (liveListing.promoted_rate != null && Number(liveListing.promoted_rate) > 0
              ? String(liveListing.promoted_rate)
              : form.ebay_promoted_rate || '');

        const syncBuyerShipping = liveListing.buyer_shipping_cost != null && liveListing.buyer_shipping_cost > 0
          ? String(Number(liveListing.buyer_shipping_cost).toFixed(2))
          : (liveListing.is_free_shipping ? '0.00' : form.buyer_shipping_cost || '0.00');

        setForm(prev => ({
          ...prev,
          current_list_price: it.current_list_price != null ? Number(it.current_list_price).toFixed(2) : prev.current_list_price,
          status: it.status || prev.status,
          platform: 'eBay',
          platform_fee_pct: it.platform_fee_pct != null ? String((it.platform_fee_pct * 100).toFixed(2)) : '13.25',
          platform_flat_fee: it.platform_flat_fee != null ? String(Number(it.platform_flat_fee).toFixed(2)) : '0.40',
          date_listed: it.date_listed || prev.date_listed,
          est_shipping_cost: it.est_shipping_cost != null ? String(Number(it.est_shipping_cost).toFixed(2)) : prev.est_shipping_cost,
          buyer_shipping_cost: syncBuyerShipping,
          ebay_promoted_rate: syncPromotedRate
        }));
        setSuccess(`Synchronized with live eBay listing #${form.ebay_listing_id} (Price: $${it.current_list_price || '--'}, Ad Rate: ${syncPromotedRate || '0'}%)`);
        if (onUpdated) onUpdated(item.id, it);
      }
    } catch (e) {
      setError(e.message || 'Sync with eBay failed');
    } finally {
      setSyncingEbay(false);
    }
  };

  // Comps calculations & actions
  const updateCompDraft = (field, value) => {
    setCompsDraft(prev => {
      const updated = { ...prev, [field]: value, applied: false };
      if (field.startsWith('comp_')) {
        const c1 = field === 'comp_1' ? value : prev.comp_1;
        const c2 = field === 'comp_2' ? value : prev.comp_2;
        const c3 = field === 'comp_3' ? value : prev.comp_3;
        const vals = [c1, c2, c3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
        if (vals.length > 0) {
          updated.recommended_list_price = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
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
        active_comp_1: compsDraft.active_comp_1 === '' ? null : Number(compsDraft.active_comp_1),
        active_comp_2: compsDraft.active_comp_2 === '' ? null : Number(compsDraft.active_comp_2),
        active_comp_3: compsDraft.active_comp_3 === '' ? null : Number(compsDraft.active_comp_3),
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

  // eBay Listing Performance Analytics fetch handler
  const handleFetchAnalytics = useCallback(async (range = 30, force = false) => {
    if (!item?.id || !form.ebay_listing_id) return;
    setLoadingAnalytics(true);
    setAnalyticsError('');
    try {
      const data = await fetchEbayItemAnalytics(item.id, range, force);
      if (data?.needsReauth) {
        setAnalytics(data);
        setAnalyticsError(data.error || 'eBay Analytics scope approval required.');
      } else {
        setAnalytics(data);
      }
    } catch (e) {
      setAnalyticsError(e.message || 'Failed to fetch listing performance data');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [item?.id, form.ebay_listing_id]);

  // Auto-fetch analytics when navigating to the Performance tab
  useEffect(() => {
    if (activeTab === 'performance' && !analytics && !loadingAnalytics && form.ebay_listing_id) {
      handleFetchAnalytics(analyticsRange, false);
    }
  }, [activeTab, analytics, loadingAnalytics, form.ebay_listing_id, analyticsRange, handleFetchAnalytics]);


  const handleFetchLiveComps = async () => {
    setCompsDraft(prev => ({ ...prev, fetchingLive: true, fetchMsg: null }));
    try {
      const q = cleanEbaySearchQuery(form.item_name || item.item_name, form.athlete_person || item.athlete_person, form.authenticator || item.authenticator);
      const res = await fetchLiveComps(q, item.id);
      if (res && res.success && res.count > 0) {
        setCompsDraft(prev => ({
          ...prev,
          comp_1: res.comp_1 != null ? roundPrice(res.comp_1) : prev.comp_1,
          comp_2: res.comp_2 != null ? roundPrice(res.comp_2) : prev.comp_2,
          comp_3: res.comp_3 != null ? roundPrice(res.comp_3) : prev.comp_3,
          recommended_list_price: roundPrice(res.live_avg || res.median || prev.recommended_list_price),
          fetchingLive: false,
          fetchMsg: { type: 'success', text: `Found ${res.count} sold comps on eBay! Live Avg: $${res.live_avg}` },
          applied: false,
        }));
      } else {
        setCompsDraft(prev => ({
          ...prev,
          fetchingLive: false,
          fetchMsg: { type: 'info', text: 'No sold comps found. Click eBay link to inspect query.' }
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

  // Real-time fee engine calculation
  const liveFees = useMemo(() => {
    return computeFeeBreakdown({
      sellPrice: parseFloat(form.current_list_price) || 0,
      buyer_shipping_cost: parseFloat(form.buyer_shipping_cost) || 0,
      cogs: parseFloat(form.true_total_cost) || parseFloat(form.unit_price) || 0,
      platform_fee_pct: (parseFloat(form.platform_fee_pct) || 13.5) / 100,
      platform_flat_fee: parseFloat(form.platform_flat_fee) || 0.40,
      ebay_promoted_rate: parseFloat(form.ebay_promoted_rate) || 0,
      est_shipping_cost: parseFloat(form.est_shipping_cost) || 0,
      target_margin_pct: (parseFloat(form.target_margin_pct) || 30) / 100
    });
  }, [
    form.current_list_price,
    form.buyer_shipping_cost,
    form.true_total_cost,
    form.unit_price,
    form.platform_fee_pct,
    form.platform_flat_fee,
    form.ebay_promoted_rate,
    form.est_shipping_cost,
    form.target_margin_pct
  ]);

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item_name.trim()) {
      setError('Item title & description is required.');
      setActiveTab('details');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        item_name: form.item_name.trim(),
        sku: form.sku?.trim() || null,
        category: form.category || null,
        sport_genre: form.sport_genre?.trim() || null,
        athlete_person: form.athlete_person?.trim() || null,
        quantity: parseInt(form.quantity, 10) || 1,
        best_listing_window: form.best_listing_window?.trim() || null,
        notes: form.notes?.trim() || null,

        unit_price: form.unit_price !== '' ? parseFloat(form.unit_price) : 0,
        true_total_cost: form.true_total_cost !== '' ? parseFloat(form.true_total_cost) : undefined,

        status: form.status,
        listing_format: form.listing_format || null,
        listing_status: form.listing_status || null,
        platform: form.platform || null,
        platform_fee_pct: form.platform_fee_pct !== '' ? parseFloat(form.platform_fee_pct) / 100 : 0.135,
        platform_flat_fee: form.platform_flat_fee !== '' ? parseFloat(form.platform_flat_fee) : 0.40,
        est_shipping_cost: form.est_shipping_cost !== '' ? parseFloat(form.est_shipping_cost) : 0,
        buyer_shipping_cost: form.buyer_shipping_cost !== '' ? parseFloat(form.buyer_shipping_cost) : 0,

        current_list_price: form.current_list_price !== '' ? parseFloat(form.current_list_price) : null,
        buy_it_now_price: form.buy_it_now_price !== '' ? parseFloat(form.buy_it_now_price) : null,
        floor_price: form.floor_price !== '' ? parseFloat(form.floor_price) : null,
        actual_sell_price: form.actual_sell_price !== '' ? parseFloat(form.actual_sell_price) : null,
        target_margin_pct: form.target_margin_pct !== '' ? parseFloat(form.target_margin_pct) / 100 : 0.30,

        ebay_promoted_rate: form.ebay_promoted_rate !== '' ? parseFloat(form.ebay_promoted_rate) : null,
        boost_pct: form.ebay_promoted_rate !== '' ? (parseFloat(form.ebay_promoted_rate) / 100) : 0,

        purchase_date: form.purchase_date || form.date_acquired || null,
        date_acquired: form.date_acquired || form.purchase_date || null,
        date_listed: form.date_listed || null,
        date_sold: form.date_sold || null,

        authenticator: form.authenticator || null,
        cert_number: form.cert_number?.trim() || null,
        cert_verification_url: form.cert_verification_url || null,
        ebay_listing_id: form.ebay_listing_id?.trim() || null
      };

      const res = await updateItem(item.id, payload);
      setSaveSuccess(true);
      setSuccess('Item updated successfully!');
      const merged = { ...item, ...payload, ...(res?.item || res || {}) };
      if (onUpdated) onUpdated(item.id, merged);

      // Snapshot new state as clean initial state
      setInitialForm(form);

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to update item.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !item) return null;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <EditModalHeader
          form={form}
          item={item}
          isDirty={isDirty}
          onClose={handleClose}
        />

        {/* Tab Navigation Strip */}
        <EditTabNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          form={form}
        />

        {/* Scrollable Form Body */}
        <form
          id="edit-item-form"
          onSubmit={handleSubmit}
          className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 scrollbar-thin scrollbar-thumb-slate-800"
        >
          {activeTab === 'details' && (
            <EditTabDetails
              form={form}
              updateField={updateField}
              allCategories={allCategories}
              item={item}
            />
          )}

          {activeTab === 'listing_pricing' && (
            <EditTabListingPricing
              form={form}
              updateField={updateField}
              allPlatforms={allPlatforms}
              onPlatformChange={handlePlatformChange}
              handleSyncWithEbay={handleSyncWithEbay}
              syncingEbay={syncingEbay}
              ebayListings={ebayListings}
              loadingEbayListings={loadingEbayListings}
              ebaySearch={ebaySearch}
              setEbaySearch={setEbaySearch}
              liveFees={liveFees}
            />
          )}

          {activeTab === 'comps' && (
            <EditTabComps
              form={form}
              compsDraft={compsDraft}
              updateCompDraft={updateCompDraft}
              handleFetchLiveComps={handleFetchLiveComps}
              handleSaveComps={handleSaveComps}
              minSellPrice={item.min_sell_price}
            />
          )}

          {activeTab === 'performance' && (
            <EditTabPerformance
              item={item}
              form={form}
              analytics={analytics}
              loadingAnalytics={loadingAnalytics}
              analyticsError={analyticsError}
              analyticsRange={analyticsRange}
              setAnalyticsRange={setAnalyticsRange}
              onFetchAnalytics={handleFetchAnalytics}
            />
          )}
        </form>

        {/* Sticky Footer */}
        <EditModalFooter
          isDirty={isDirty}
          saving={saving}
          saveSuccess={saveSuccess}
          error={error}
          success={success}
          onClose={handleClose}
          onOpenCopyModal={onOpenCopyModal}
        />
      </div>
    </div>
  );
}
