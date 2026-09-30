import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, DollarSign, Calendar, Tag, Truck, Percent, CreditCard,
  TrendingUp, Loader2, AlertCircle, CheckCircle2, Search, Package, Zap
} from 'lucide-react';
import { createSale, updateSale, getItems, syncEbayItem } from '../utils/auctionApi';
import { computeSaleMetrics, daysBetween, fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { DEFAULT_PLATFORM_FEE_PCT, DEFAULT_PLATFORM_FLAT_FEE } from '../../functions/utils/constants.js';

/**
 * @param {{
 *   open: boolean,
 *   saleToEdit?: Object|null,
 *   preselectedItem?: Object|null,
 *   platforms: Array,
 *   onClose: () => void,
 *   onSaved: () => void
 * }} props
 */
export function LogSaleModal({ open, isOpen, saleToEdit, preselectedItem, item, platforms = [], onClose, onSaved, onCreated }) {
  const isModalOpen = open !== undefined ? Boolean(open) : Boolean(isOpen);
  const targetItem = preselectedItem || item;
  const handleSaved = onSaved || onCreated || (() => {});
  const isEdit = Boolean(saleToEdit);

  const [availableItems, setAvailableItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [platform, setPlatform] = useState('eBay');
  const [buyerHandle, setBuyerHandle] = useState('');
  const [grossSalePrice, setGrossSalePrice] = useState('');
  const [netEarnings, setNetEarnings] = useState('');
  const [isManualNetEarnings, setIsManualNetEarnings] = useState(false);
  const [showDetailedFees, setShowDetailedFees] = useState(false);

  const [buyerShippingPaid, setBuyerShippingPaid] = useState('0');
  const [actualShippingCost, setActualShippingCost] = useState('0');
  const [platformFeePct, setPlatformFeePct] = useState(String(DEFAULT_PLATFORM_FEE_PCT * 100));
  const [platformFlatFee, setPlatformFlatFee] = useState(DEFAULT_PLATFORM_FLAT_FEE.toFixed(2));
  const [paymentProcessingAmt, setPaymentProcessingAmt] = useState('0');
  const [promotedListingFee, setPromotedListingFee] = useState('0');

  const [syncingEbay, setSyncingEbay] = useState(false);
  const [autoFillNotice, setAutoFillNotice] = useState(null);
  const [ebayOrderId, setEbayOrderId] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Default platform fallback
  const defaultPlatform = useMemo(() => {
    return (platforms || []).find(p => p.is_default) || (platforms || [])[0] || { name: 'eBay', fee_pct: DEFAULT_PLATFORM_FEE_PCT, flat_fee: DEFAULT_PLATFORM_FLAT_FEE };
  }, [platforms]);

  const calculateAutoNetEarnings = (grossVal, bShipVal, aShipVal, fPctVal, fFlatVal, pProcVal, pListVal) => {
    const gross = parseFloat(grossVal) || 0;
    const bShip = parseFloat(bShipVal) || 0;
    const aShip = parseFloat(aShipVal) || 0;
    const fPct  = (parseFloat(fPctVal) || 0) / 100;
    const fFlat = parseFloat(fFlatVal) || 0;
    const pProc = parseFloat(pProcVal) || 0;
    const pList = parseFloat(pListVal) || 0;
    const feeAmt = (gross * fPct) + fFlat;
    const net = gross + bShip - aShip - feeAmt - pProc - pList;
    return net > 0 ? net.toFixed(2) : (net === 0 ? '0.00' : net.toFixed(2));
  };

  const handleAutoFillFromEbay = useCallback(async (target = selectedItem || targetItem) => {
    if (!target) return;
    setSyncingEbay(true);
    setAutoFillNotice(null);
    setError('');
    try {
      const res = await syncEbayItem(target.id, target.ebay_listing_id, target.ebay_promoted_rate);
      if (res?.sale || res?.is_sold) {
        const s = res.sale || {};
        const it = res.item || target;
        if (s.sale_date) setSaleDate(s.sale_date);
        if (s.buyer_handle) setBuyerHandle(s.buyer_handle);
        if (s.ebay_order_id) setEbayOrderId(s.ebay_order_id);
        if (s.gross_sale_price != null) setGrossSalePrice(Number(s.gross_sale_price).toFixed(2));
        if (s.net_proceeds != null) {
          setNetEarnings(Number(s.net_proceeds).toFixed(2));
          setIsManualNetEarnings(true);
        }
        if (s.buyer_shipping_paid != null) setBuyerShippingPaid(String(Number(s.buyer_shipping_paid).toFixed(2)));
        if (s.actual_shipping_cost != null) setActualShippingCost(String(Number(s.actual_shipping_cost).toFixed(2)));
        if (s.platform_fee_pct != null) setPlatformFeePct(String(parseFloat((s.platform_fee_pct * 100).toFixed(2))));
        if (s.platform_flat_fee != null) setPlatformFlatFee(String(Number(s.platform_flat_fee).toFixed(2)));
        if (s.promoted_listing_fee != null) setPromotedListingFee(String(Number(s.promoted_listing_fee).toFixed(2)));
        if (s.payment_processing_amt != null) setPaymentProcessingAmt(String(Number(s.payment_processing_amt).toFixed(2)));

        setAutoFillNotice({
          type: 'success',
          text: `🎉 Synced live from eBay Order #${s.ebay_order_id || it.ebay_listing_id || 'Live'} (Buyer: ${s.buyer_handle || 'Verified'}, Net: $${Number(s.net_proceeds || 0).toFixed(2)})`
        });
      } else if (res?.item) {
        const it = res.item;
        const defaultGross = it.current_list_price || it.suggested_list_price || '';
        if (defaultGross && !grossSalePrice) {
          setGrossSalePrice(Number(defaultGross).toFixed(2));
        }
        if (it.buyer_shipping_cost != null) setBuyerShippingPaid(String(Number(it.buyer_shipping_cost).toFixed(2)));
        if (it.est_shipping_cost != null) setActualShippingCost(String(Number(it.est_shipping_cost).toFixed(2)));
        if (it.platform_fee_pct != null) setPlatformFeePct(String(parseFloat((it.platform_fee_pct * 100).toFixed(2))));
        if (it.platform_flat_fee != null) setPlatformFlatFee(String(Number(it.platform_flat_fee).toFixed(2)));
        
        setAutoFillNotice({
          type: 'info',
          text: `Synced active listing info for #${it.ebay_listing_id || target.ebay_listing_id || 'Item'}. Pre-populated listed price & fee rates.`
        });
      }
    } catch (e) {
      setAutoFillNotice({
        type: 'warning',
        text: `eBay auto-fill: ${e.message || 'Unable to fetch from eBay'}. You can still log manually.`
      });
    } finally {
      setSyncingEbay(false);
    }
  }, [selectedItem, targetItem, grossSalePrice]);

  // Load available items if creating a new sale without a pre-selected item
  useEffect(() => {
    if (!isModalOpen) return;

    if (isEdit && saleToEdit) {
      setSelectedItem({
        id: saleToEdit.item_id,
        item_name: saleToEdit.item_name,
        category: saleToEdit.category,
        athlete_person: saleToEdit.athlete_person,
        true_total_cost: saleToEdit.true_total_cost,
        date_acquired: saleToEdit.date_acquired,
        date_listed: saleToEdit.date_listed
      });
      setSaleDate(saleToEdit.sale_date || new Date().toISOString().split('T')[0]);
      setPlatform(saleToEdit.platform || 'eBay');
      setBuyerHandle(saleToEdit.buyer_handle || '');
      setGrossSalePrice(saleToEdit.gross_sale_price != null ? Number(saleToEdit.gross_sale_price).toFixed(2) : '');
      setNetEarnings(saleToEdit.net_proceeds != null ? Number(saleToEdit.net_proceeds).toFixed(2) : '');
      setIsManualNetEarnings(saleToEdit.net_proceeds != null);
      setBuyerShippingPaid(String(saleToEdit.buyer_shipping_paid != null ? Number(saleToEdit.buyer_shipping_paid).toFixed(2) : '0.00'));
      setActualShippingCost(String(saleToEdit.actual_shipping_cost != null ? Number(saleToEdit.actual_shipping_cost).toFixed(2) : '0.00'));
      setPlatformFeePct(String(parseFloat(((saleToEdit.platform_fee_pct || DEFAULT_PLATFORM_FEE_PCT) * 100).toFixed(2))));
      setPlatformFlatFee(String(saleToEdit.platform_flat_fee != null ? Number(saleToEdit.platform_flat_fee).toFixed(2) : DEFAULT_PLATFORM_FLAT_FEE.toFixed(2)));
      setPaymentProcessingAmt(String(saleToEdit.payment_processing_amt != null ? Number(saleToEdit.payment_processing_amt).toFixed(2) : '0.00'));
      setPromotedListingFee(String(saleToEdit.promoted_listing_fee != null ? Number(saleToEdit.promoted_listing_fee).toFixed(2) : '0.00'));
      return;
    }

    if (targetItem) {
      setSelectedItem(targetItem);
      applyItemPlatformDefaults(targetItem, targetItem.platform || defaultPlatform.name);
      if (targetItem.platform === 'eBay' || targetItem.ebay_listing_id) {
        handleAutoFillFromEbay(targetItem);
      }
      return;
    }

    // Fetch active inventory items for selection
    const fetchInventory = async () => {
      setLoadingItems(true);
      try {
        const data = await getItems({ limit: 100 });
        setAvailableItems(data.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchInventory();
  }, [isModalOpen, isEdit, saleToEdit, targetItem, defaultPlatform, handleAutoFillFromEbay]);

  const applyItemPlatformDefaults = (item, platName) => {
    setPlatform(platName);
    const plat = (platforms || []).find(p => p.name === platName) || defaultPlatform;
    let feePct = String(DEFAULT_PLATFORM_FEE_PCT * 100);
    let flatFee = DEFAULT_PLATFORM_FLAT_FEE.toFixed(2);
    let estShip = '0';
    if (plat) {
      feePct = String(parseFloat((plat.fee_pct * 100).toFixed(4)));
      flatFee = plat.flat_fee.toString();
      setPlatformFeePct(feePct);
      setPlatformFlatFee(flatFee);
    }
    if (item && item.est_shipping_cost) {
      estShip = String(item.est_shipping_cost);
      setActualShippingCost(estShip);
    }
    if (item && item.current_list_price && !grossSalePrice) {
      setGrossSalePrice(String(Number(item.current_list_price).toFixed(2)));
    }
    if (!isManualNetEarnings && (grossSalePrice || item?.current_list_price)) {
      const net = calculateAutoNetEarnings(grossSalePrice || item?.current_list_price, buyerShippingPaid, estShip, feePct, flatFee, paymentProcessingAmt, promotedListingFee);
      setNetEarnings(net);
    }
  };

  const handlePlatformChange = (newPlat) => {
    setPlatform(newPlat);
    const plat = (platforms || []).find(p => p.name === newPlat);
    if (plat) {
      const feePct = String(parseFloat((plat.fee_pct * 100).toFixed(4)));
      const flatFee = plat.flat_fee.toString();
      setPlatformFeePct(feePct);
      setPlatformFlatFee(flatFee);
      if (!isManualNetEarnings && grossSalePrice) {
        const net = calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, feePct, flatFee, paymentProcessingAmt, promotedListingFee);
        setNetEarnings(net);
      }
    }
  };

  const handleGrossChange = (val) => {
    setGrossSalePrice(val);
    if (!isManualNetEarnings) {
      if (val === '') {
        setNetEarnings('');
      } else {
        const net = calculateAutoNetEarnings(val, buyerShippingPaid, actualShippingCost, platformFeePct, platformFlatFee, paymentProcessingAmt, promotedListingFee);
        setNetEarnings(net);
      }
    }
  };

  const handleNetEarningsChange = (val) => {
    setNetEarnings(val);
    setIsManualNetEarnings(true);
  };

  const handleResetToAutoCalc = () => {
    setIsManualNetEarnings(false);
    if (grossSalePrice) {
      const net = calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, platformFeePct, platformFlatFee, paymentProcessingAmt, promotedListingFee);
      setNetEarnings(net);
    }
  };

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    applyItemPlatformDefaults(item, item.platform || defaultPlatform.name);
  };

  // Live calculations
  const previewMetrics = useMemo(() => {
    if (!selectedItem) return null;
    const gross = parseFloat(grossSalePrice) || 0;
    const net = parseFloat(netEarnings) || 0;
    const cost = selectedItem.true_total_cost || 0;
    const netProfit = net - cost;
    const roiPct = cost > 0 ? netProfit / cost : 0;
    const deductions = Math.max(0, gross - net);

    const startDate = selectedItem.date_listed || selectedItem.date_acquired;
    const days = daysBetween(startDate, saleDate) ?? 0;

    return {
      gross_sale_price: gross,
      net_proceeds: net,
      net_profit: netProfit,
      roi_pct: roiPct,
      total_deductions: deductions,
      true_total_cost: cost,
      days_to_sell: days >= 0 ? days : 0
    };
  }, [selectedItem, grossSalePrice, netEarnings, saleDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItem) {
      setError('Please select an inventory item.');
      return;
    }

    const gross = parseFloat(grossSalePrice);
    if (isNaN(gross) || gross < 0) {
      setError('Please enter a valid gross sale price.');
      return;
    }

    const net = isManualNetEarnings
      ? parseFloat(netEarnings)
      : parseFloat(calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, platformFeePct, platformFlatFee, paymentProcessingAmt, promotedListingFee));

    if (isNaN(net)) {
      setError('Please provide a valid net earnings amount.');
      return;
    }

    if (!saleDate) {
      setError('Please select a sale date.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        item_id: selectedItem.id,
        sale_date: saleDate,
        platform,
        buyer_handle: buyerHandle.trim() || undefined,
        gross_sale_price: gross,
        net_proceeds: net,
        net_earnings: net,
        buyer_shipping_paid: parseFloat(buyerShippingPaid) || 0,
        actual_shipping_cost: parseFloat(actualShippingCost) || 0,
        platform_fee_pct: (parseFloat(platformFeePct) || 0) / 100,
        platform_flat_fee: parseFloat(platformFlatFee) || 0,
        payment_processing_amt: parseFloat(paymentProcessingAmt) || 0,
        promoted_listing_fee: parseFloat(promotedListingFee) || 0,
        ebay_order_id: ebayOrderId || undefined
      };

      if (isEdit && saleToEdit) {
        await updateSale(saleToEdit.id, payload);
      } else {
        await createSale(payload);
      }

      handleSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save sale.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isModalOpen) return null;

  const filteredItems = availableItems.filter(it => {
    if (!itemSearch) return true;
    let matchString = `${it.item_name} ${it.athlete_person || ''} ${it.category || ''}`;
    if (it.category && it.category.toLowerCase().includes('sport')) {
      matchString += ` ${it.team || ''}`;
    }
    return matchString.toLowerCase().includes(itemSearch.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-sm pt-6 pb-6 overflow-y-auto">
      <div className="w-full max-w-2xl mx-4 glass-card rounded-2xl shadow-2xl border border-slate-700/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-950/40">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              {isEdit ? 'Edit Recorded Sale' : 'Log Completed Sale'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Record gross sale price, net earnings, and track instant realized profit.
            </p>
          </div>
          <button
            id="close-log-sale-modal"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Item Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-400">Memorabilia Item *</label>
              {selectedItem && (selectedItem.platform === 'eBay' || selectedItem.ebay_listing_id || platform === 'eBay') && (
                <button
                  type="button"
                  disabled={syncingEbay}
                  onClick={() => handleAutoFillFromEbay(selectedItem)}
                  className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                  title="Auto-fetch buyer name, gross sale, and fee deductions directly from eBay"
                >
                  {syncingEbay ? <Loader2 className="w-3 h-3 animate-spin text-amber-400" /> : <Zap className="w-3 h-3 text-amber-400" />}
                  <span>{syncingEbay ? 'Syncing eBay...' : 'Auto-Fill from eBay'}</span>
                </button>
              )}
            </div>
            {selectedItem ? (
              <div className="glass-card-light rounded-xl p-2.5 border border-amber-500/30 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-100">{selectedItem.item_name}</p>
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-0.5">
                    <span>Category: <strong className="text-slate-300">{selectedItem.category || 'Memorabilia'}</strong></span>
                    {selectedItem.athlete_person && <span>Athlete: <strong className="text-slate-300">{selectedItem.athlete_person}</strong></span>}
                    <span>True Cost: <strong className="text-amber-400">{fmtCurrency(selectedItem.true_total_cost)}</strong></span>
                  </div>
                </div>
                {!isEdit && !preselectedItem && (
                  <button
                    type="button"
                    onClick={() => { setSelectedItem(null); setAutoFillNotice(null); }}
                    className="text-xs text-slate-400 hover:text-amber-400 transition-colors underline ml-3 flex-shrink-0"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 z-10 pointer-events-none" />
                  <input
                    type="text"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                    placeholder="Search inventory items..."
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-36 overflow-y-auto glass-card-light rounded-xl divide-y divide-slate-800/50 border border-slate-800">
                  {loadingItems ? (
                    <div className="p-3 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> Loading items...
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching items found
                    </div>
                  ) : (
                    filteredItems.map(it => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => handleSelectItem(it)}
                        className="w-full text-left p-2 text-xs hover:bg-slate-800/50 flex items-center justify-between transition-colors group"
                      >
                        <div>
                          <p className="font-medium text-slate-200 group-hover:text-amber-300">{it.item_name}</p>
                          <p className="text-[10px] text-slate-500">{it.category} · {it.athlete_person || 'Unspecified'} · Ref: {it.invoice_ref || 'None'}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-300 font-semibold">{fmtCurrency(it.true_total_cost)}</span>
                          <p className="text-[10px] text-emerald-400">Min: {fmtCurrency(it.min_sell_price)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {autoFillNotice && (
              <div className={`mt-2 p-2 rounded-xl text-xs flex items-center gap-2 ${autoFillNotice.type === 'success' ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300' : (autoFillNotice.type === 'info' ? 'bg-blue-950/40 border border-blue-800/40 text-blue-300' : 'bg-amber-950/40 border border-amber-800/40 text-amber-300')}`}>
                {autoFillNotice.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="flex-1">{autoFillNotice.text}</span>
              </div>
            )}
          </div>

          {/* Sale Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Sale Date *</label>
              <input
                id="sale-date-input"
                type="date"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-500"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Selling Platform *</label>
              <select
                id="sale-platform-select"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-500"
                value={platform}
                onChange={e => handlePlatformChange(e.target.value)}
              >
                {platforms.map(p => (
                  <option key={p.id || p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Buyer Handle / Name</label>
              <input
                id="sale-buyer-input"
                type="text"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500"
                placeholder="e.g. collector99"
                value={buyerHandle}
                onChange={e => setBuyerHandle(e.target.value)}
              />
            </div>
          </div>

          {/* Core Financial Inputs: Gross Sale & Net Earnings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
            <div>
              <label className="block text-xs font-bold text-amber-300 mb-1">Gross Sale ($) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                <input
                  id="sale-gross-input"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full bg-slate-900 border border-amber-500/40 rounded-lg pl-8 pr-3 py-2 text-sm font-bold text-amber-300 placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-500/20"
                  placeholder="0.00"
                  value={grossSalePrice}
                  onChange={e => handleGrossChange(e.target.value)}
                  required
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Total buyer purchase price</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-emerald-300">Net Earnings ($) *</label>
                {isManualNetEarnings && (
                  <button
                    type="button"
                    onClick={handleResetToAutoCalc}
                    className="text-[10px] text-amber-400 hover:underline"
                  >
                    Reset to auto-calc
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                <input
                  id="sale-net-earnings-input"
                  type="number"
                  step="0.01"
                  className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg pl-8 pr-3 py-2 text-sm font-bold text-emerald-300 placeholder-slate-500 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/20"
                  placeholder="0.00"
                  value={netEarnings}
                  onChange={e => handleNetEarningsChange(e.target.value)}
                  required
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {isManualNetEarnings ? 'Manual payout entry' : 'Bank deposit payout after fees & shipping'}
              </p>
              {parseFloat(netEarnings) < 0 && (
                <p className="text-[11px] text-amber-400 font-medium mt-1 flex items-center gap-1">
                  <span>ℹ️</span> This sale is recorded at a loss
                </p>
              )}
            </div>
          </div>

          {/* Optional Detailed Fee Breakdown Accordion */}
          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/20">
            <button
              type="button"
              onClick={() => setShowDetailedFees(v => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span>Optional: Detailed Fee & Shipping Breakdown</span>
              <span className="text-[11px] text-amber-400">{showDetailedFees ? 'Hide ▲' : 'Show ▼'}</span>
            </button>
            {showDetailedFees && (
              <div className="p-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-950/40">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Buyer Shipping ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200"
                    value={buyerShippingPaid}
                    onChange={e => {
                      setBuyerShippingPaid(e.target.value);
                      if (!isManualNetEarnings) {
                        setNetEarnings(calculateAutoNetEarnings(grossSalePrice, e.target.value, actualShippingCost, platformFeePct, platformFlatFee, paymentProcessingAmt, promotedListingFee));
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Actual Ship Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200"
                    value={actualShippingCost}
                    onChange={e => {
                      setActualShippingCost(e.target.value);
                      if (!isManualNetEarnings) {
                        setNetEarnings(calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, e.target.value, platformFeePct, platformFlatFee, paymentProcessingAmt, promotedListingFee));
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Platform Fee %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200"
                    value={platformFeePct}
                    onChange={e => {
                      setPlatformFeePct(e.target.value);
                      if (!isManualNetEarnings) {
                        setNetEarnings(calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, e.target.value, platformFlatFee, paymentProcessingAmt, promotedListingFee));
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Platform Flat Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200"
                    value={platformFlatFee}
                    onChange={e => {
                      setPlatformFlatFee(e.target.value);
                      if (!isManualNetEarnings) {
                        setNetEarnings(calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, platformFeePct, e.target.value, paymentProcessingAmt, promotedListingFee));
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Payment Proc ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200"
                    value={paymentProcessingAmt}
                    onChange={e => {
                      setPaymentProcessingAmt(e.target.value);
                      if (!isManualNetEarnings) {
                        setNetEarnings(calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, platformFeePct, platformFlatFee, e.target.value, promotedListingFee));
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Ad / Boost Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200"
                    value={promotedListingFee}
                    onChange={e => {
                      setPromotedListingFee(e.target.value);
                      if (!isManualNetEarnings) {
                        setNetEarnings(calculateAutoNetEarnings(grossSalePrice, buyerShippingPaid, actualShippingCost, platformFeePct, platformFlatFee, paymentProcessingAmt, e.target.value));
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live Outcome Summary Panel */}
          {previewMetrics && (
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-800/80">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Live Profit Breakdown</span>
                <span className="text-[11px] text-slate-400">{previewMetrics.days_to_sell} days on market</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                  <span className="text-slate-500 block text-[9px] uppercase font-semibold">Gross Sale</span>
                  <span className="text-slate-200 font-bold text-xs">{fmtCurrency(previewMetrics.gross_sale_price)}</span>
                </div>
                <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                  <span className="text-slate-500 block text-[9px] uppercase font-semibold">Net Earnings</span>
                  <span className={`font-bold text-xs ${previewMetrics.net_proceeds >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtCurrency(previewMetrics.net_proceeds)}
                    {previewMetrics.net_proceeds < 0 && <span className="text-[9px] font-normal block text-amber-400">Recorded at a loss</span>}
                  </span>
                </div>
                <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                  <span className="text-slate-500 block text-[9px] uppercase font-semibold">Landed Cost</span>
                  <span className="text-slate-300 font-bold text-xs">{fmtCurrency(previewMetrics.true_total_cost)}</span>
                </div>
                <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                  <span className="text-slate-500 block text-[9px] uppercase font-semibold">Net Profit</span>
                  <span className={`font-bold text-xs ${previewMetrics.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtCurrency(previewMetrics.net_profit)} <span className="text-[10px] font-normal">({fmtPct(previewMetrics.roi_pct)})</span>
                    {previewMetrics.net_profit < 0 && <span className="text-[9px] font-normal block text-red-300">Loss</span>}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              id="cancel-log-sale-btn"
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-all"
            >
              Cancel
            </button>
            <button
              id="submit-log-sale-btn"
              type="submit"
              disabled={submitting || !selectedItem}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Record Sale'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
