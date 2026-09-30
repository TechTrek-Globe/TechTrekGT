import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { updateItem, saveComp, getComps, fetchLiveComps, getActiveEbayListings, syncEbayItem, fetchEbayItemAnalytics, fetchEbayItemDetail } from '../utils/auctionApi';
import { computeFeeBreakdown } from '../utils/feeEngine';
import { roundPrice, round2 } from '../utils/formulaPreview';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  DEFAULT_TARGET_MARGIN_PCT
} from '../../functions/utils/constants.js';
import { cleanEbaySearchQuery, buildStructuredCompQuery } from '../utils/ebaySearch';

// Subcomponents
import { EditModalHeader } from './edit/EditModalHeader';
import { EditModalFooter } from './edit/EditModalFooter';
import { EditTabNav } from './edit/EditTabNav';
import { EditTabFinancials } from './edit/EditTabFinancials';
import { EditTabDetails } from './edit/EditTabDetails';
import { EditTabListingPricing } from './edit/EditTabListingPricing';
import { EditTabComps } from './edit/EditTabComps';
import { EditTabPerformance } from './edit/EditTabPerformance';
import { EditTabVineScout } from './edit/EditTabVineScout';

const PLATFORM_FEE_PRESETS = {
  // T-10 item 3: the eBay preset uses the shared default rather than an inline
  // 13.5, so the preset, the seed row and every write path agree.
  'eBay':         { fee_pct: DEFAULT_PLATFORM_FEE_PCT * 100, flat_fee: DEFAULT_PLATFORM_FLAT_FEE },
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
  platform_fee_pct: String(DEFAULT_PLATFORM_FEE_PCT * 100),
  platform_flat_fee: DEFAULT_PLATFORM_FLAT_FEE.toFixed(2),
  est_shipping_cost: '0.00',
  buyer_shipping_cost: '0.00',
  // Pricing
  current_list_price: '',
  buy_it_now_price: '',
  floor_price: '',
  actual_sell_price: '',
  target_margin_pct: String(DEFAULT_TARGET_MARGIN_PCT * 100),
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
  cert_verified: false,
  ebay_listing_id: '',
  // VineScout / Amazon Vine Link
  is_vinescout: false,
  asin: '',
  order_id: '',
  etv: '',
  tax_cost: ''
};

export function EditItemModal({
  isOpen,
  item,
  categoryOptions = [],
  platformOptions = [],
  onClose,
  onUpdated,
  onOpenCopyModal,
  initialTab = 'financial'
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'financial');
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

  // Auto-saving state for immediate seller assumption synchronization
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSavedTime, setAutoSavedTime] = useState(null);
  // T-11 item 9: auto-save failures were swallowed by console.warn only, so a
  // rejected partial update was invisible. These are surfaced in the header.
  const [autoSaveError, setAutoSaveError] = useState('');
  const autoSaveTimerRef = useRef(null);

  const autoSaveField = useCallback(async (fieldName, value) => {
    if (!item?.id) return;
    try {
      setAutoSaving(true);
      setAutoSaveError('');
      const parsedVal = value === '' ? 0 : parseFloat(value);
      const payload = {
        [fieldName]: fieldName === 'target_margin_pct' ? (parsedVal / 100) : parsedVal
      };
      const res = await updateItem(item.id, payload);
      if (res?.item || res) {
        const merged = { ...item, ...payload, ...(res.item || res) };
        if (onUpdated) onUpdated(item.id, merged);
        setInitialForm(prev => ({ ...prev, [fieldName]: value }));
        setAutoSavedTime(Date.now());
      }
    } catch (e) {
      const msg = e?.message || 'Auto-save failed';
      console.warn('[EditItemModal] Auto-save error:', e);
      setAutoSaveError(`Could not save ${fieldName.replace(/_/g, ' ')}: ${msg}`);
    } finally {
      setAutoSaving(false);
    }
  }, [item, onUpdated]);

  const updateField = (key, value, immediate = false) => {
    setForm(prev => ({ ...prev, [key]: value }));

    // Real-time auto-persistence for seller assumptions (est_shipping_cost, target_margin_pct).
    // The payload carries ONLY the edited field, so the server must leave every
    // other column untouched; that is enforced in functions/api/items/[id].js.
    if (key === 'est_shipping_cost' || key === 'target_margin_pct') {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (immediate) {
        autoSaveField(key, value);
      } else {
        autoSaveTimerRef.current = setTimeout(() => {
          autoSaveField(key, value);
        }, 500);
      }
    }
  };

  const fmtCompVal = (val) => (val != null && val !== '' && !isNaN(Number(val)) && Number(val) > 0) ? Number(val).toFixed(2) : '';

  const lastItemIdRef = useRef(null);
  const fetchedCompItemIdRef = useRef(null);

  // Reset tracking when modal closes
  useEffect(() => {
    if (!isOpen) {
      lastItemIdRef.current = null;
      fetchedCompItemIdRef.current = null;
    }
  }, [isOpen]);

  // Populate form only when modal opens for a new item
  useEffect(() => {
    if (!isOpen || !item) return;

    if (item.id !== lastItemIdRef.current) {
      lastItemIdRef.current = item.id;

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
          : String(DEFAULT_PLATFORM_FEE_PCT * 100),
        platform_flat_fee: item.platform_flat_fee != null
          ? Number(item.platform_flat_fee).toFixed(2)
          : DEFAULT_PLATFORM_FLAT_FEE.toFixed(2),
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
          // T-10 item 4: this used to be a hardcoded '30'. Opening the modal on
          // an item with a null margin showed 30%, and saving without touching
          // the field persisted 30% - silently changing the item's pricing
          // assumption merely by viewing it. Same constant as EMPTY_FORM and the
          // submit branch.
          : String(DEFAULT_TARGET_MARGIN_PCT * 100),
        ebay_promoted_rate: (item.ebay_promoted_rate != null && Number(item.ebay_promoted_rate) > 0)
          ? String(item.ebay_promoted_rate)
          : (item.boost_pct != null && Number(item.boost_pct) > 0 ? String(parseFloat((Number(item.boost_pct) * 100).toFixed(2))) : ''),

        purchase_date: item.purchase_date || item.date_acquired || '',
        date_acquired: item.date_acquired || item.purchase_date || '',
        date_listed: item.date_listed || '',
        date_sold: item.date_sold || '',

        authenticator: item.authenticator ? item.authenticator.replace(/#.*$/, '').trim() : '',
        cert_number: item.cert_number || '',
        cert_verification_url: item.cert_verification_url || '',
        cert_verified: Boolean(item.cert_verified || (item.attributes && (typeof item.attributes === 'string' ? item.attributes.includes('"cert_verified":true') : item.attributes?.cert_verified))),
        ebay_listing_id: item.ebay_listing_id || '',

        // VineScout / Amazon Vine
        is_vinescout: Boolean(item.is_vinescout || item.is_amazon || (item.invoice_ref && item.invoice_ref.startsWith('AMAZON-')) || item.asin),
        asin: item.asin || '',
        order_id: item.order_id || '',
        etv: item.etv != null ? String(item.etv) : '',
        tax_cost: item.tax_cost != null ? String(item.tax_cost) : ''
      };

      setForm(populated);
      setInitialForm(populated);

      // Comps
      setCompsDraft({
        comp_1: fmtCompVal(item.comp_1),
        comp_2: fmtCompVal(item.comp_2),
        comp_3: fmtCompVal(item.comp_3),
        active_comp_1: fmtCompVal(item.active_comp_1),
        active_comp_2: fmtCompVal(item.active_comp_2),
        active_comp_3: fmtCompVal(item.active_comp_3),
        recommended_list_price: fmtCompVal(item.recommended_list_price || item.current_list_price || item.suggested_list_price),
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
      setActiveTab(initialTab || 'financial');

      // Start search empty so all active store listings are visible immediately
      setEbaySearch('');
      fetchActiveListings();

      setError('');
      setSuccess('');
      setSaveSuccess(false);
    }
  }, [isOpen, item?.id, initialTab]);

  // Synchronize comps directly from database once per opened item
  useEffect(() => {
    if (!isOpen || !item?.id) return;
    if (fetchedCompItemIdRef.current === item.id) return;
    fetchedCompItemIdRef.current = item.id;

    let cancelled = false;

    getComps({ item_id: item.id })
      .then((data) => {
        if (cancelled) return;
        const comp = data?.comps?.[0] || data?.comp;
        if (comp) {
          const fresh1 = fmtCompVal(comp.comp_1);
          const fresh2 = fmtCompVal(comp.comp_2);
          const fresh3 = fmtCompVal(comp.comp_3);
          const freshActive1 = fmtCompVal(comp.active_comp_1);
          const freshActive2 = fmtCompVal(comp.active_comp_2);
          const freshActive3 = fmtCompVal(comp.active_comp_3);
          const freshRec = fmtCompVal(comp.recommended_list_price);

          setCompsDraft(prev => ({
            ...prev,
            comp_1: fresh1 || prev.comp_1,
            comp_2: fresh2 || prev.comp_2,
            comp_3: fresh3 || prev.comp_3,
            active_comp_1: freshActive1 || prev.active_comp_1,
            active_comp_2: freshActive2 || prev.active_comp_2,
            active_comp_3: freshActive3 || prev.active_comp_3,
            recommended_list_price: freshRec || prev.recommended_list_price
          }));
        }
      })
      .catch((err) => {
        console.warn('[EditItemModal] Background comps load note:', err?.message || err);
      });

    return () => { cancelled = true; };
  }, [isOpen, item?.id]);

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

  const fetchActiveListings = async () => {
    setLoadingEbayListings(true);
    try {
      const data = await getActiveEbayListings({ limit: 200 });
      setEbayListings(data.listings || []);
    } catch (err) {
      console.error('[EditItemModal] Failed to fetch active eBay listings:', err);
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

  const handleSyncWithEbay = async (targetListingId = null, targetPromotedRate = null) => {
    const listingIdToSync = targetListingId || form.ebay_listing_id;
    if (!listingIdToSync) return;
    setSyncingEbay(true);
    setError('');
    setSuccess('');
    try {
      const rateToSync = targetPromotedRate != null ? targetPromotedRate : form.ebay_promoted_rate;
      const res = await syncEbayItem(item.id, listingIdToSync, rateToSync);
      if (res?.item) {
        const it = res.item;
        const liveListing = res.liveListing || {};
        const syncPromotedRate = (it.ebay_promoted_rate != null && Number(it.ebay_promoted_rate) > 0)
          ? String(it.ebay_promoted_rate)
          : (liveListing.promoted_rate != null && Number(liveListing.promoted_rate) > 0
              ? String(liveListing.promoted_rate)
              : (Number(rateToSync) > 0 ? String(rateToSync) : ''));

        const syncBuyerShipping = liveListing.buyer_shipping_cost != null && liveListing.buyer_shipping_cost > 0
          ? String(Number(liveListing.buyer_shipping_cost).toFixed(2))
          : (liveListing.is_free_shipping ? '0.00' : form.buyer_shipping_cost || '0.00');

        setForm(prev => ({
          ...prev,
          ebay_listing_id: listingIdToSync,
          current_list_price: it.current_list_price != null ? Number(it.current_list_price).toFixed(2) : prev.current_list_price,
          status: it.status || (res.is_sold ? 'Sold' : 'Listed'),
          platform: 'eBay',
          platform_fee_pct: it.platform_fee_pct != null ? String((it.platform_fee_pct * 100).toFixed(2)) : '13.25',
          platform_flat_fee: it.platform_flat_fee != null ? String(Number(it.platform_flat_fee).toFixed(2)) : '0.40',
          date_listed: it.date_listed || prev.date_listed,
          est_shipping_cost: it.est_shipping_cost != null ? String(Number(it.est_shipping_cost).toFixed(2)) : prev.est_shipping_cost,
          buyer_shipping_cost: syncBuyerShipping,
          ebay_promoted_rate: syncPromotedRate
        }));
        if (res.is_sold || res.sale) {
          const grossStr = res.sale?.gross_sale_price != null ? `$${Number(res.sale.gross_sale_price).toFixed(2)}` : `$${it.current_list_price || '--'}`;
          const netStr = res.sale?.net_proceeds != null ? `$${Number(res.sale.net_proceeds).toFixed(2)}` : '--';
          const profitStr = res.sale?.net_profit != null ? `${res.sale.net_profit >= 0 ? '+' : ''}$${Number(res.sale.net_profit).toFixed(2)}` : '--';
          setSuccess(`🎉 Item Sold on eBay! Auto-recorded Sale: ${grossStr} (Net: ${netStr}, Profit: ${profitStr})`);
        } else {
          setSuccess(`Synchronized with live eBay listing #${listingIdToSync} (Price: $${it.current_list_price || '--'}, Ad Rate: ${syncPromotedRate || '0'}%)`);
        }
        if (onUpdated) onUpdated(item.id, it, { fromEbaySync: true, is_sold: res.is_sold, sale: res.sale });
      }
    } catch (e) {
      setError(e.message || 'Sync with eBay failed');
    } finally {
      setSyncingEbay(false);
    }
  };

  const handlePairEbayListing = async (listingOrId) => {
    let id = '';
    let price = null;
    let sku = null;
    let rate = null;
    let shipCost = null;

    if (typeof listingOrId === 'object' && listingOrId !== null) {
      id = String(listingOrId.listing_id || '').trim();
      price = listingOrId.price;
      sku = listingOrId.sku;
      rate = listingOrId.promoted_rate;
      shipCost = listingOrId.buyer_shipping_cost;
    } else {
      id = String(listingOrId || '').trim();
    }

    if (!id) return;

    setForm(prev => ({
      ...prev,
      ebay_listing_id: id,
      platform: 'eBay',
      status: prev.status === 'Draft' || prev.status === 'Available' ? 'Listed' : prev.status,
      current_list_price: price != null && !prev.current_list_price ? Number(price).toFixed(2) : prev.current_list_price,
      sku: sku && !prev.sku ? sku : prev.sku,
      ebay_promoted_rate: rate != null && rate > 0 ? String(rate) : prev.ebay_promoted_rate,
      buyer_shipping_cost: shipCost != null ? String(Number(shipCost).toFixed(2)) : prev.buyer_shipping_cost
    }));

    await handleSyncWithEbay(id, rate);
  };

  // Comps calculations & actions
  const updateCompDraft = (field, value) => {
    setCompsDraft(prev => {
      const updated = { ...prev, [field]: value, applied: false };
      const c1 = field === 'comp_1' ? value : updated.comp_1;
      const c2 = field === 'comp_2' ? value : updated.comp_2;
      const c3 = field === 'comp_3' ? value : updated.comp_3;
      const a1 = field === 'active_comp_1' ? value : updated.active_comp_1;
      const a2 = field === 'active_comp_2' ? value : updated.active_comp_2;
      const a3 = field === 'active_comp_3' ? value : updated.active_comp_3;

      const soldVals = [c1, c2, c3].filter(v => v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0).map(Number);
      const activeVals = [a1, a2, a3].filter(v => v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0).map(Number);

      const soldAvg = soldVals.length > 0 ? (soldVals.reduce((a, b) => a + b, 0) / soldVals.length) : null;
      const activeAvg = activeVals.length > 0 ? (activeVals.reduce((a, b) => a + b, 0) / activeVals.length) : null;

      if (field.startsWith('comp_') || field.startsWith('active_comp_')) {
        const target = soldAvg || activeAvg;
        if (target != null) {
          updated.recommended_list_price = Number(target).toFixed(2);
        }
      }
      return updated;
    });
  };

  const handleLookupEbayItem = async (idOrUrl, targetSlot = 'comp_1') => {
    if (!idOrUrl || !idOrUrl.trim()) return;
    try {
      const detail = await fetchEbayItemDetail(idOrUrl);
      if (detail && detail.price != null) {
        const itemObj = {
          title: detail.title || 'eBay Listing',
          price: detail.price,
          image_url: detail.image_url || null,
          item_url: detail.item_url || (detail.itemId ? `https://www.ebay.com/itm/${detail.itemId}` : null),
          ebay_item_id: detail.itemId || null,
          condition: detail.condition || 'Sold / Ended'
        };
        const itemKey = `${targetSlot}_item`;
        setCompsDraft(prev => {
          const updated = {
            ...prev,
            [targetSlot]: Number(detail.price).toFixed(2),
            [itemKey]: itemObj,
            applied: false
          };
          const c1 = targetSlot === 'comp_1' ? detail.price : updated.comp_1;
          const c2 = targetSlot === 'comp_2' ? detail.price : updated.comp_2;
          const c3 = targetSlot === 'comp_3' ? detail.price : updated.comp_3;
          const a1 = targetSlot === 'active_comp_1' ? detail.price : updated.active_comp_1;
          const a2 = targetSlot === 'active_comp_2' ? detail.price : updated.active_comp_2;
          const a3 = targetSlot === 'active_comp_3' ? detail.price : updated.active_comp_3;
          const soldVals = [c1, c2, c3].filter(v => v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0).map(Number);
          const activeVals = [a1, a2, a3].filter(v => v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0).map(Number);
          const target = soldVals.length > 0 ? (soldVals.reduce((a, b) => a + b, 0) / soldVals.length) : (activeVals.length > 0 ? (activeVals.reduce((a, b) => a + b, 0) / activeVals.length) : null);
          if (target != null) {
            updated.recommended_list_price = Number(target).toFixed(2);
          }
          return updated;
        });
        return { success: true, detail: itemObj };
      } else {
        throw new Error('Listing found, but no sale/list price was returned.');
      }
    } catch (err) {
      throw new Error(err.message || 'Failed to lookup eBay listing.');
    }
  };

  const handleSaveComps = async (applyToItem = false) => {
    setCompsDraft(prev => ({ ...prev, saving: true }));
    setError('');
    setSuccess('');
    try {
      const c1 = (compsDraft.comp_1 !== '' && compsDraft.comp_1 != null && !isNaN(Number(compsDraft.comp_1)) && Number(compsDraft.comp_1) > 0) ? Number(compsDraft.comp_1) : null;
      const c2 = (compsDraft.comp_2 !== '' && compsDraft.comp_2 != null && !isNaN(Number(compsDraft.comp_2)) && Number(compsDraft.comp_2) > 0) ? Number(compsDraft.comp_2) : null;
      const c3 = (compsDraft.comp_3 !== '' && compsDraft.comp_3 != null && !isNaN(Number(compsDraft.comp_3)) && Number(compsDraft.comp_3) > 0) ? Number(compsDraft.comp_3) : null;
      const a1 = (compsDraft.active_comp_1 !== '' && compsDraft.active_comp_1 != null && !isNaN(Number(compsDraft.active_comp_1)) && Number(compsDraft.active_comp_1) > 0) ? Number(compsDraft.active_comp_1) : null;
      const a2 = (compsDraft.active_comp_2 !== '' && compsDraft.active_comp_2 != null && !isNaN(Number(compsDraft.active_comp_2)) && Number(compsDraft.active_comp_2) > 0) ? Number(compsDraft.active_comp_2) : null;
      const a3 = (compsDraft.active_comp_3 !== '' && compsDraft.active_comp_3 != null && !isNaN(Number(compsDraft.active_comp_3)) && Number(compsDraft.active_comp_3) > 0) ? Number(compsDraft.active_comp_3) : null;
      const rec = (compsDraft.recommended_list_price !== '' && compsDraft.recommended_list_price != null && !isNaN(Number(compsDraft.recommended_list_price)) && Number(compsDraft.recommended_list_price) > 0) ? Number(compsDraft.recommended_list_price) : null;

      await saveComp({
        item_id: item.id,
        comp_1: c1,
        comp_2: c2,
        comp_3: c3,
        active_comp_1: a1,
        active_comp_2: a2,
        active_comp_3: a3,
        recommended_list_price: rec,
        apply_to_item: applyToItem
      });
      setCompsDraft(prev => ({ ...prev, saving: false, applied: applyToItem }));
      setSuccess(applyToItem ? 'Target price applied to item listing!' : 'Market comps saved successfully!');

      const compsPatch = {
        comp_1: c1,
        comp_2: c2,
        comp_3: c3,
        active_comp_1: a1,
        active_comp_2: a2,
        active_comp_3: a3,
        recommended_list_price: rec
      };

      if (applyToItem && rec) {
        setForm(prev => ({ ...prev, current_list_price: String(rec) }));
        compsPatch.current_list_price = rec;
      }

      if (onUpdated) {
        onUpdated(item.id, compsPatch);
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


  const handleFetchLiveComps = async (customQuery = null) => {
    setCompsDraft(prev => ({ ...prev, fetchingLive: true, fetchMsg: null }));
    try {
      const q = (customQuery && customQuery.trim()) || buildStructuredCompQuery(
        form.item_name || item.item_name,
        form.athlete_person || item.athlete_person,
        form.category || item.category,
        form.authenticator || item.authenticator
      );
      const res = await fetchLiveComps(q, item.id);
      if (res && res.success && res.count > 0) {
        setCompsDraft(prev => ({
          ...prev,
          comp_1: res.comp_1 != null ? roundPrice(res.comp_1) : prev.comp_1,
          comp_2: res.comp_2 != null ? roundPrice(res.comp_2) : prev.comp_2,
          comp_3: res.comp_3 != null ? roundPrice(res.comp_3) : prev.comp_3,
          comp_1_item: res.comp_1_item || null,
          comp_2_item: res.comp_2_item || null,
          comp_3_item: res.comp_3_item || null,
          active_comp_1: res.active_comp_1 != null ? roundPrice(res.active_comp_1) : prev.active_comp_1,
          active_comp_2: res.active_comp_2 != null ? roundPrice(res.active_comp_2) : prev.active_comp_2,
          active_comp_3: res.active_comp_3 != null ? roundPrice(res.active_comp_3) : prev.active_comp_3,
          active_comp_1_item: res.active_comp_1_item || null,
          active_comp_2_item: res.active_comp_2_item || null,
          active_comp_3_item: res.active_comp_3_item || null,
          sold_comps: res.sold_comps || [],
          active_comps: res.active_comps || [],
          query_used: res.query || q,
          recommended_list_price: roundPrice(res.recommended_list_price || res.live_avg || res.median || prev.recommended_list_price),
          fetchingLive: false,
          fetchMsg: {
            type: 'success',
            text: res.sold_count > 0
              ? `Found ${res.sold_count} sold comps & ${res.active_count} active listings on eBay! (Sold Avg: $${res.sold_avg || '0.00'})`
              : `Found ${res.active_count} live eBay market comps! (Market Avg: $${res.active_avg || '0.00'})`
          },
          applied: false,
        }));
      } else {
        setCompsDraft(prev => ({
          ...prev,
          fetchingLive: false,
          fetchMsg: { type: 'info', text: 'No live comps found on eBay. Click the eBay link to test your search.' }
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
      platform_fee_pct: (parseFloat(form.platform_fee_pct) || DEFAULT_PLATFORM_FEE_PCT * 100) / 100,
      platform_flat_fee: parseFloat(form.platform_flat_fee) || DEFAULT_PLATFORM_FLAT_FEE,
      ebay_promoted_rate: parseFloat(form.ebay_promoted_rate) || 0,
      est_shipping_cost: parseFloat(form.est_shipping_cost) || 0,
      target_margin_pct: (parseFloat(form.target_margin_pct) || DEFAULT_TARGET_MARGIN_PCT * 100) / 100
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

        unit_price: form.unit_price !== '' ? round2(form.unit_price) : 0,
        true_total_cost: form.true_total_cost !== '' && form.true_total_cost != null ? round2(form.true_total_cost) : undefined,

        status: form.status,
        listing_format: form.listing_format || null,
        listing_status: form.listing_status || null,
        platform: form.platform || null,
        platform_fee_pct: form.platform_fee_pct !== '' ? parseFloat(form.platform_fee_pct) / 100 : DEFAULT_PLATFORM_FEE_PCT,
        platform_flat_fee: form.platform_flat_fee !== '' ? parseFloat(form.platform_flat_fee) : DEFAULT_PLATFORM_FLAT_FEE,
        est_shipping_cost: form.est_shipping_cost !== '' ? round2(form.est_shipping_cost) : 0,
        buyer_shipping_cost: form.buyer_shipping_cost !== '' ? round2(form.buyer_shipping_cost) : 0,

        current_list_price: form.current_list_price !== '' ? round2(form.current_list_price) : null,
        buy_it_now_price: form.buy_it_now_price !== '' ? round2(form.buy_it_now_price) : null,
        floor_price: form.floor_price !== '' ? round2(form.floor_price) : null,
        actual_sell_price: form.actual_sell_price !== '' ? round2(form.actual_sell_price) : null,
        target_margin_pct: form.target_margin_pct !== '' ? parseFloat(form.target_margin_pct) / 100 : DEFAULT_TARGET_MARGIN_PCT,

        ebay_promoted_rate: form.ebay_promoted_rate !== '' ? parseFloat(form.ebay_promoted_rate) : null,
        boost_pct: form.ebay_promoted_rate !== '' ? (parseFloat(form.ebay_promoted_rate) / 100) : 0,

        purchase_date: form.purchase_date || form.date_acquired || null,
        date_acquired: form.date_acquired || form.purchase_date || null,
        date_listed: form.date_listed || null,
        date_sold: form.date_sold || null,

        authenticator: form.authenticator || null,
        cert_number: form.cert_number?.trim() || null,
        cert_verification_url: form.cert_verification_url || null,
        cert_verified: Boolean(form.cert_verified),
        ebay_listing_id: form.ebay_listing_id?.trim() || null,

        // VineScout / Amazon Vine fields
        is_vinescout: Boolean(form.is_vinescout),
        asin: form.asin?.trim() || null,
        order_id: form.order_id?.trim() || null,
        etv: form.etv !== '' && form.etv != null ? parseFloat(form.etv) : null,
        tax_cost: form.tax_cost !== '' && form.tax_cost != null ? parseFloat(form.tax_cost) : null
      };

      // Auto-save comps if any comp value exists in draft
      const hasCompsData = [
        compsDraft.comp_1, compsDraft.comp_2, compsDraft.comp_3,
        compsDraft.active_comp_1, compsDraft.active_comp_2, compsDraft.active_comp_3,
        compsDraft.recommended_list_price
      ].some(v => v !== '' && v != null && !isNaN(Number(v)) && Number(v) > 0);

      let savedComps = null;
      if (hasCompsData) {
        try {
          const compPayload = {
            item_id: item.id,
            comp_1: (compsDraft.comp_1 !== '' && compsDraft.comp_1 != null && !isNaN(Number(compsDraft.comp_1)) && Number(compsDraft.comp_1) > 0) ? Number(compsDraft.comp_1) : null,
            comp_2: (compsDraft.comp_2 !== '' && compsDraft.comp_2 != null && !isNaN(Number(compsDraft.comp_2)) && Number(compsDraft.comp_2) > 0) ? Number(compsDraft.comp_2) : null,
            comp_3: (compsDraft.comp_3 !== '' && compsDraft.comp_3 != null && !isNaN(Number(compsDraft.comp_3)) && Number(compsDraft.comp_3) > 0) ? Number(compsDraft.comp_3) : null,
            active_comp_1: (compsDraft.active_comp_1 !== '' && compsDraft.active_comp_1 != null && !isNaN(Number(compsDraft.active_comp_1)) && Number(compsDraft.active_comp_1) > 0) ? Number(compsDraft.active_comp_1) : null,
            active_comp_2: (compsDraft.active_comp_2 !== '' && compsDraft.active_comp_2 != null && !isNaN(Number(compsDraft.active_comp_2)) && Number(compsDraft.active_comp_2) > 0) ? Number(compsDraft.active_comp_2) : null,
            active_comp_3: (compsDraft.active_comp_3 !== '' && compsDraft.active_comp_3 != null && !isNaN(Number(compsDraft.active_comp_3)) && Number(compsDraft.active_comp_3) > 0) ? Number(compsDraft.active_comp_3) : null,
            recommended_list_price: (compsDraft.recommended_list_price !== '' && compsDraft.recommended_list_price != null && !isNaN(Number(compsDraft.recommended_list_price)) && Number(compsDraft.recommended_list_price) > 0) ? Number(compsDraft.recommended_list_price) : null,
            apply_to_item: false
          };
          await saveComp(compPayload);
          savedComps = compPayload;
        } catch (compErr) {
          console.warn('[EditItemModal] Auto-saving comps on submit warning:', compErr);
        }
      }

      const res = await updateItem(item.id, payload);
      setSaveSuccess(true);
      setSuccess('Item updated successfully!');
      const merged = {
        ...item,
        ...payload,
        ...(savedComps || {}),
        ...(res?.item || res || {})
      };
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
          autoSaving={autoSaving}
          autoSavedTime={autoSavedTime}
          autoSaveError={autoSaveError}
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
          {activeTab === 'financial' && (
            <EditTabFinancials
              form={form}
              updateField={updateField}
              item={item}
              liveFees={liveFees}
              compsDraft={compsDraft}
              handleSaveComps={handleSaveComps}
            />
          )}

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
              fetchActiveListings={fetchActiveListings}
              handlePairEbayListing={handlePairEbayListing}
              item={item}
            />
          )}

          {activeTab === 'comps' && (
            <EditTabComps
              form={form}
              compsDraft={compsDraft}
              updateCompDraft={updateCompDraft}
              handleFetchLiveComps={handleFetchLiveComps}
              handleSaveComps={handleSaveComps}
              handleLookupEbayItem={handleLookupEbayItem}
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

          {activeTab === 'vinescout' && (
            <EditTabVineScout
              form={form}
              updateField={updateField}
              item={item}
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
