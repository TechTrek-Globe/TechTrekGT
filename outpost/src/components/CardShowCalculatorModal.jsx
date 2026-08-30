import React, { useState, useMemo } from 'react';
import {
  X, Calculator, DollarSign, Zap, PlusCircle, CheckCircle2,
  AlertCircle, Loader2, Sparkles, TrendingUp, ShieldCheck, ArrowDown
} from 'lucide-react';
import { createInvoice, getPlatforms } from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';

const POPULAR_PLATFORMS = [
  { id: 'cash', name: 'Show Cash (0% Fee)', feePct: 0.0, feeFlat: 0 },
  { id: 'ebay', name: 'eBay (13.25% + $0.30)', feePct: 0.1325, feeFlat: 0.30 },
  { id: 'whatnot', name: 'Whatnot (11.4% + $0.30)', feePct: 0.114, feeFlat: 0.30 },
  { id: 'pristine', name: 'Pristine (15% Flat)', feePct: 0.15, feeFlat: 0 },
  { id: 'mercari', name: 'Mercari (10% Flat)', feePct: 0.10, feeFlat: 0 }
];

export function CardShowCalculatorModal({ isOpen, onClose, onItemAdded }) {
  const [askingPrice, setAskingPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [selectedPlatform, setSelectedPlatform] = useState(POPULAR_PLATFORMS[0]);
  const [targetMarginPct, setTargetMarginPct] = useState(30); // 30% default
  const [estimatedCompValue, setEstimatedCompValue] = useState('');

  // Quick draft intake fields
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('Cards');
  const [authenticator, setAuthenticator] = useState('PSA');
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  const calculations = useMemo(() => {
    const ask = parseFloat(askingPrice) || 0;
    const ship = parseFloat(shippingCost) || 0;
    const landedCost = ask + ship;

    const feeRate = selectedPlatform.feePct;
    const feeFlat = selectedPlatform.feeFlat;

    // Break-even floor price (Price * (1 - feeRate) - feeFlat = landedCost)
    const breakEven = (1 - feeRate) > 0 ? (landedCost + feeFlat) / (1 - feeRate) : landedCost;

    // Target Selling Price for desired margin
    const targetProfit = landedCost * (targetMarginPct / 100);
    const targetListPrice = (1 - feeRate) > 0 ? (landedCost + targetProfit + feeFlat) / (1 - feeRate) : (landedCost + targetProfit);

    // Max Bid Ceiling if Comp value is provided
    const compVal = parseFloat(estimatedCompValue) || 0;
    let maxBidCeiling = null;
    if (compVal > 0) {
      // Net payout from comp = Comp * (1 - feeRate) - feeFlat
      const netFromComp = compVal * (1 - feeRate) - feeFlat;
      // Max cost to get target margin: Cost * (1 + targetMarginPct/100) = netFromComp
      const maxLandedCost = netFromComp / (1 + targetMarginPct / 100);
      maxBidCeiling = Math.max(0, maxLandedCost - ship);
    }

    return {
      landedCost,
      breakEven: Math.round(breakEven * 100) / 100,
      targetListPrice: Math.round(targetListPrice * 100) / 100,
      targetProfit: Math.round(targetProfit * 100) / 100,
      maxBidCeiling: maxBidCeiling !== null ? Math.round(maxBidCeiling * 100) / 100 : null
    };
  }, [askingPrice, shippingCost, selectedPlatform, targetMarginPct, estimatedCompValue]);

  const handleQuickSave = async (e) => {
    e.preventDefault();
    if (!itemName.trim() || calculations.landedCost <= 0) return;

    setSavingDraft(true);
    setSaveError('');
    setSaveSuccess('');

    try {
      const now = new Date();
      const invoiceRef = `SHOW-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(1000 + Math.random()*9000)}`;

      await createInvoice({
        invoice_ref: invoiceRef,
        description: 'Card Show / Live Event',
        date_acquired: now.toISOString().slice(0, 10),
        discount: 0,
        shipping: parseFloat(shippingCost) || 0,
        tax: 0,
        items: [
          {
            item_name: itemName.trim(),
            category,
            athlete_person: '',
            authenticator,
            cert_number: '',
            unit_price: parseFloat(askingPrice) || 0,
            target_margin_pct: (targetMarginPct || 0) / 100,
            current_list_price: calculations.targetListPrice,
            platform: selectedPlatform.name,
            platform_fee_pct: selectedPlatform.feePct,
            platform_flat_fee: selectedPlatform.feeFlat
          }
        ]
      });

      setSaveSuccess(`Added "${itemName.trim()}" to inventory!`);
      setItemName('');
      setAskingPrice('');
      if (onItemAdded) onItemAdded();
    } catch (err) {
      setSaveError(err.message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg glass-card rounded-2xl border border-amber-500/30 shadow-2xl overflow-hidden my-auto animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 flex items-center gap-1.5">
                Card Show & Live Auction Calc
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Mobile Mode
                </span>
              </h2>
              <p className="text-[10px] text-slate-400">Instant break-even floor & max bid ceiling</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 text-xs">
          {/* Quick Input Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Sticker / Asking Price ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={askingPrice}
                  onChange={e => setAskingPrice(e.target.value)}
                  className="input-field pl-8 font-mono text-sm font-black text-amber-400 w-full"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Est. Shipping ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={shippingCost}
                  onChange={e => setShippingCost(e.target.value)}
                  className="input-field pl-8 font-mono text-sm w-full"
                />
              </div>
            </div>
          </div>

          {/* Platform Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
              Planned Resale Platform
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {POPULAR_PLATFORMS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlatform(p)}
                  className={`py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all text-center ${
                    selectedPlatform.id === p.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {p.name.split(' ')[0]}
                  <span className="block text-[8px] opacity-70">{(p.feePct * 100).toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target Margin % Quick Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-400">
                Target Desired Margin
              </label>
              <span className="text-xs font-black text-emerald-400">{targetMarginPct}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[15, 20, 25, 30, 40, 50].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTargetMarginPct(m)}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    targetMarginPct === m
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {m}%
                </button>
              ))}
            </div>
          </div>

          {/* Results Display HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800">
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-500">Total Landed Cost</p>
              <p className="text-base font-black text-amber-400">{fmtCurrency(calculations.landedCost)}</p>
            </div>

            <div>
              <p className="text-[9px] uppercase font-bold text-slate-500">Break-Even Floor</p>
              <p className="text-base font-black text-cyan-400">{fmtCurrency(calculations.breakEven)}</p>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <p className="text-[9px] uppercase font-bold text-slate-500">Target List Price</p>
              <p className="text-base font-black text-emerald-400">{fmtCurrency(calculations.targetListPrice)}</p>
            </div>
          </div>

          {/* Comp & Max Bid Calculator Section */}
          <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                Comp Value / Max Bid Ceiling
              </label>
              {calculations.maxBidCeiling !== null && (
                <span className="text-[10px] font-bold text-emerald-400">
                  Max Bid: <strong className="text-xs text-white">{fmtCurrency(calculations.maxBidCeiling)}</strong>
                </span>
              )}
            </div>
            <input
              type="number"
              step="any"
              placeholder="Enter Market Comp ($) to calculate Max Bid..."
              value={estimatedCompValue}
              onChange={e => setEstimatedCompValue(e.target.value)}
              className="input-field py-1.5 px-3 text-xs w-full font-mono"
            />
            {calculations.maxBidCeiling !== null && (
              <p className="text-[10px] text-slate-500">
                To make {targetMarginPct}% profit selling at {fmtCurrency(parseFloat(estimatedCompValue) || 0)}, do not pay more than <strong className="text-amber-300">{fmtCurrency(calculations.maxBidCeiling)}</strong>.
              </p>
            )}
          </div>

          {/* Quick Draft Save Form */}
          <form onSubmit={handleQuickSave} className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                <PlusCircle className="w-3 h-3 text-blue-400" />
                Quick Intake (Add to Inventory)
              </span>
            </div>

            {saveSuccess && (
              <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-[11px] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{saveSuccess}</span>
              </div>
            )}
            {saveError && (
              <div className="p-2 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 text-[11px] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                placeholder="Item name (e.g. 2024 Bowman Chrome Refractor)"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                className="input-field py-1.5 px-2.5 text-xs col-span-7"
              />
              <select
                value={authenticator}
                onChange={e => setAuthenticator(e.target.value)}
                className="input-field py-1.5 px-2 text-xs col-span-5"
              >
                <option value="PSA">PSA</option>
                <option value="Beckett">Beckett (BGS)</option>
                <option value="JSA">JSA</option>
                <option value="SGC">SGC</option>
                <option value="CGC">CGC</option>
                <option value="Raw">Raw / Uncertified</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={savingDraft || !itemName.trim() || calculations.landedCost <= 0}
              className="w-full py-2 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400 hover:opacity-90 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-lg shadow-amber-500/10"
            >
              {savingDraft ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Draft...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Save to Active Inventory</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
