import React, { useState, useEffect, useMemo } from 'react';
import {
  X, DollarSign, Calendar, Tag, Truck, Percent, CreditCard,
  TrendingUp, Loader2, AlertCircle, CheckCircle2, Search, Package
} from 'lucide-react';
import { createSale, updateSale, getItems } from '../utils/auctionApi';
import { computeSaleMetrics, daysBetween, fmtCurrency, fmtPct } from '../utils/formulaPreview';

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
export function LogSaleModal({ open, saleToEdit, preselectedItem, platforms, onClose, onSaved }) {
  const isEdit = Boolean(saleToEdit);

  const [availableItems, setAvailableItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [platform, setPlatform] = useState('eBay');
  const [buyerHandle, setBuyerHandle] = useState('');
  const [grossSalePrice, setGrossSalePrice] = useState('');
  const [buyerShippingPaid, setBuyerShippingPaid] = useState('0');
  const [actualShippingCost, setActualShippingCost] = useState('0');
  const [platformFeePct, setPlatformFeePct] = useState('13.6');
  const [platformFlatFee, setPlatformFlatFee] = useState('0.40');
  const [paymentProcessingAmt, setPaymentProcessingAmt] = useState('0');
  const [promotedListingFee, setPromotedListingFee] = useState('0');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Default platform fallback
  const defaultPlatform = useMemo(() => {
    return platforms.find(p => p.is_default) || platforms[0] || { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40 };
  }, [platforms]);

  // Load available items if creating a new sale without a pre-selected item
  useEffect(() => {
    if (!open) return;

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
      setGrossSalePrice(String(saleToEdit.gross_sale_price || ''));
      setBuyerShippingPaid(String(saleToEdit.buyer_shipping_paid ?? '0'));
      setActualShippingCost(String(saleToEdit.actual_shipping_cost ?? '0'));
      setPlatformFeePct(String((saleToEdit.platform_fee_pct * 100).toFixed(2)));
      setPlatformFlatFee(String(saleToEdit.platform_flat_fee ?? '0.40'));
      setPaymentProcessingAmt(String(saleToEdit.payment_processing_amt ?? '0'));
      setPromotedListingFee(String(saleToEdit.promoted_listing_fee ?? '0'));
      return;
    }

    if (preselectedItem) {
      setSelectedItem(preselectedItem);
      applyItemPlatformDefaults(preselectedItem, preselectedItem.platform || defaultPlatform.name);
      return;
    }

    // Fetch active inventory items for selection
    const fetchInventory = async () => {
      setLoadingItems(true);
      try {
        const data = await getItems({ limit: 100 });
        // Filter to Available or Listed items primarily
        setAvailableItems(data.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchInventory();
  }, [open, isEdit, saleToEdit, preselectedItem, defaultPlatform]);

  const applyItemPlatformDefaults = (item, platName) => {
    setPlatform(platName);
    const plat = platforms.find(p => p.name === platName) || defaultPlatform;
    if (plat) {
      setPlatformFeePct((plat.fee_pct * 100).toString());
      setPlatformFlatFee(plat.flat_fee.toString());
    }
    if (item && item.est_shipping_cost) {
      setActualShippingCost(String(item.est_shipping_cost));
    }
  };

  const handlePlatformChange = (newPlat) => {
    setPlatform(newPlat);
    const plat = platforms.find(p => p.name === newPlat);
    if (plat) {
      setPlatformFeePct((plat.fee_pct * 100).toString());
      setPlatformFlatFee(plat.flat_fee.toString());
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
    const bShip = parseFloat(buyerShippingPaid) || 0;
    const aShip = parseFloat(actualShippingCost) || 0;
    const fPct  = (parseFloat(platformFeePct) || 0) / 100;
    const fFlat = parseFloat(platformFlatFee) || 0;
    const pProc = parseFloat(paymentProcessingAmt) || 0;
    const pList = parseFloat(promotedListingFee) || 0;
    const cost  = selectedItem.true_total_cost || 0;

    const metrics = computeSaleMetrics({
      gross_sale_price: gross,
      buyer_shipping_paid: bShip,
      actual_shipping_cost: aShip,
      platform_fee_pct: fPct,
      platform_flat_fee: fFlat,
      payment_processing_amt: pProc,
      promoted_listing_fee: pList,
      true_total_cost: cost
    });

    const startDate = selectedItem.date_listed || selectedItem.date_acquired;
    const days = daysBetween(startDate, saleDate) ?? 0;

    return {
      ...metrics,
      days_to_sell: days >= 0 ? days : 0
    };
  }, [
    selectedItem, grossSalePrice, buyerShippingPaid, actualShippingCost,
    platformFeePct, platformFlatFee, paymentProcessingAmt, promotedListingFee, saleDate
  ]);

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
        buyer_shipping_paid: parseFloat(buyerShippingPaid) || 0,
        actual_shipping_cost: parseFloat(actualShippingCost) || 0,
        platform_fee_pct: (parseFloat(platformFeePct) || 0) / 100,
        platform_flat_fee: parseFloat(platformFlatFee) || 0,
        payment_processing_amt: parseFloat(paymentProcessingAmt) || 0,
        promoted_listing_fee: parseFloat(promotedListingFee) || 0
      };

      if (isEdit && saleToEdit) {
        await updateSale(saleToEdit.id, payload);
      } else {
        await createSale(payload);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save sale.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const filteredItems = availableItems.filter(it => {
    if (!itemSearch) return true;
    const match = `${it.item_name} ${it.athlete_person || ''} ${it.category || ''}`.toLowerCase();
    return match.includes(itemSearch.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/75 backdrop-blur-sm pt-6 pb-6 overflow-y-auto">
      <div className="w-full max-w-2xl mx-4 glass-card rounded-2xl shadow-2xl border border-slate-700/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/60 bg-slate-950/40">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              {isEdit ? 'Edit Recorded Sale' : 'Log Completed Sale'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEdit ? 'Update transaction details and recalculate net profit' : 'Record sale price, platform fees, and calculate instant net ROI'}
            </p>
          </div>
          <button
            id="close-log-sale-modal"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Item Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Memorabilia Item *</label>
            {selectedItem ? (
              <div className="glass-card-light rounded-xl p-3 border border-amber-500/30 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-100">{selectedItem.item_name}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span>Category: <strong className="text-slate-300">{selectedItem.category || 'Memorabilia'}</strong></span>
                    {selectedItem.athlete_person && <span>Athlete: <strong className="text-slate-300">{selectedItem.athlete_person}</strong></span>}
                    <span>True Cost: <strong className="text-amber-400">{fmtCurrency(selectedItem.true_total_cost)}</strong></span>
                  </div>
                </div>
                {!isEdit && !preselectedItem && (
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="text-xs text-slate-400 hover:text-amber-400 transition-colors underline ml-3"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    className="input-field pl-9 text-xs"
                    placeholder="Search inventory items..."
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-40 overflow-y-auto glass-card-light rounded-xl divide-y divide-slate-800/50 border border-slate-800">
                  {loadingItems ? (
                    <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> Loading items...
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No matching items found
                    </div>
                  ) : (
                    filteredItems.map(it => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => handleSelectItem(it)}
                        className="w-full text-left p-2.5 text-xs hover:bg-slate-800/50 flex items-center justify-between transition-colors group"
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
          </div>

          {/* Sale details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Sale Date *</label>
              <div className="relative">
                <input
                  id="sale-date-input"
                  type="date"
                  className="input-field text-xs"
                  value={saleDate}
                  onChange={e => setSaleDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Selling Platform *</label>
              <select
                id="sale-platform-select"
                className="input-field text-xs"
                value={platform}
                onChange={e => handlePlatformChange(e.target.value)}
              >
                {platforms.map(p => (
                  <option key={p.id || p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Buyer Handle / Name</label>
              <input
                id="sale-buyer-input"
                type="text"
                className="input-field text-xs"
                placeholder="e.g. collector99"
                value={buyerHandle}
                onChange={e => setBuyerHandle(e.target.value)}
              />
            </div>
          </div>

          {/* Financial inputs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Gross Sale ($) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input
                  id="sale-gross-input"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pl-7 font-bold text-amber-300 border-amber-500/40"
                  placeholder="0.00"
                  value={grossSalePrice}
                  onChange={e => setGrossSalePrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Buyer Shipping ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input
                  id="sale-buyer-shipping"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pl-7"
                  placeholder="0.00"
                  value={buyerShippingPaid}
                  onChange={e => setBuyerShippingPaid(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Actual Ship Cost ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input
                  id="sale-actual-shipping"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pl-7"
                  placeholder="0.00"
                  value={actualShippingCost}
                  onChange={e => setActualShippingCost(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Payment Proc ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input
                  id="sale-payment-proc"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pl-7"
                  placeholder="0.00"
                  value={paymentProcessingAmt}
                  onChange={e => setPaymentProcessingAmt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Fee fine-tuning */}
          <div className="grid grid-cols-3 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/40">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Platform Fee %</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pr-7"
                  value={platformFeePct}
                  onChange={e => setPlatformFeePct(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Platform Flat Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pl-7"
                  value={platformFlatFee}
                  onChange={e => setPlatformFlatFee(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Ad / Boost Fee ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field text-xs pl-7"
                  placeholder="0.00"
                  value={promotedListingFee}
                  onChange={e => setPromotedListingFee(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Live Outcome Summary Panel */}
          {previewMetrics && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center justify-between mb-3 border-b border-amber-500/20 pb-2">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">Live Transaction Breakdown</span>
                <span className="text-xs text-slate-400">{previewMetrics.days_to_sell} days on market</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Platform Fees:</span>
                  <span className="text-slate-200 font-semibold">{fmtCurrency(previewMetrics.platform_fees_amt)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Net Proceeds:</span>
                  <span className="text-slate-200 font-semibold">{fmtCurrency(previewMetrics.net_proceeds)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Net Profit:</span>
                  <span className={`font-bold text-sm ${previewMetrics.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtCurrency(previewMetrics.net_profit)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Return on Investment:</span>
                  <span className={`font-bold text-sm ${previewMetrics.roi_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPct(previewMetrics.roi_pct)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              id="cancel-log-sale-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-all"
            >
              Cancel
            </button>
            <button
              id="submit-log-sale-btn"
              type="submit"
              disabled={submitting || !selectedItem}
              className="btn-primary w-auto px-6 py-2.5 text-xs font-semibold"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
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
