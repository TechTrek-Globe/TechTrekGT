import React, { useState, useEffect } from 'react';
import {
  X, ShoppingCart, Link, Hash, DollarSign, Tag, Loader2, AlertCircle, CheckCircle2
} from 'lucide-react';
import { createInvoice } from '../utils/auctionApi';

const CATEGORIES = [
  'Electronics', 'Toys & Games', 'Books', 'Home & Kitchen', 'Sports', 'Health',
  'Clothing', 'Tools', 'Office', 'Pet Supplies', 'Beauty', 'Automotive',
  'Jersey', 'Card', 'Photo', 'Other'
];

/**
 * Extracts an ASIN from an Amazon URL or raw ASIN string.
 * Handles /dp/ASIN, /gp/product/ASIN, or bare 10-char ASIN.
 */
function extractAsin(input) {
  if (!input) return '';
  const trimmed = input.trim();

  // Match /dp/ASIN or /gp/product/ASIN
  const match = trimmed.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (match) return match[1].toUpperCase();

  // Bare ASIN: 10 alphanumeric chars
  if (/^[A-Z0-9]{10}$/i.test(trimmed)) return trimmed.toUpperCase();

  return '';
}

function buildAmazonUrl(asin) {
  return asin ? `https://www.amazon.com/dp/${asin}` : '';
}

export function AmazonItemModal({ isOpen, platforms = [], onClose, onCreated }) {
  const [asinInput, setAsinInput]     = useState('');
  const [asin, setAsin]               = useState('');
  const [itemName, setItemName]       = useState('');
  const [category, setCategory]       = useState('Electronics');
  const [unitPrice, setUnitPrice]     = useState('');
  const [notes, setNotes]             = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  const defaultPlatform = (platforms || []).find(p => p.is_default)
    || (platforms || [])[0]
    || { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40 };

  // Auto-extract ASIN whenever asinInput changes
  useEffect(() => {
    const extracted = extractAsin(asinInput);
    setAsin(extracted);
  }, [asinInput]);

  const reset = () => {
    setAsinInput(''); setAsin(''); setItemName('');
    setCategory('Electronics'); setUnitPrice('');
    setNotes(''); setError(''); setSuccess(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!asin) { setError('Enter a valid Amazon URL or 10-character ASIN.'); return; }
    if (!itemName.trim()) { setError('Product name is required.'); return; }
    const price = parseFloat(unitPrice);
    if (!price || price <= 0) { setError('Enter a valid purchase price greater than $0.'); return; }

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const invoiceRef = `AMAZON-${asin}-${today}`;

      await createInvoice({
        invoice_ref: invoiceRef,
        description: `Amazon import - ASIN ${asin}`,
        date_acquired: today,
        discount: 0,
        shipping: 0,
        tax: 0,
        items: [{
          item_name: itemName.trim(),
          category,
          athlete_person: '',
          authenticator: '',
          cert_number: '',
          unit_price: price,
          platform: defaultPlatform.name,
          platform_fee_pct: defaultPlatform.fee_pct || 0,
          platform_flat_fee: defaultPlatform.flat_fee || 0,
          est_shipping_cost: 0,
          boost_pct: 0,
          target_margin_pct: 0.20,
          status: 'Available',
          notes: notes.trim()
            ? `ASIN: ${asin} | ${notes.trim()}`
            : `ASIN: ${asin} | Imported from Amazon`,
          best_listing_window: ''
        }]
      });

      setSuccess(true);
      if (onCreated) onCreated();
      setTimeout(() => { reset(); onClose(); }, 1800);
    } catch (err) {
      setError(err.message || 'Failed to add item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-gradient-to-r from-orange-950/60 to-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <ShoppingCart className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add Amazon Item</h2>
              <p className="text-[11px] text-slate-400">Paste a link or ASIN to import into inventory</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700/60 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* ASIN / URL */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
              Amazon URL or ASIN
            </label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                autoFocus
                type="text"
                className="input-field !pl-10 text-sm"
                placeholder="https://amazon.com/dp/B0XXXXXXXX  or  B0XXXXXXXX"
                value={asinInput}
                onChange={e => setAsinInput(e.target.value)}
              />
            </div>
            {asin ? (
              <div className="flex items-center gap-2 mt-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-[11px] text-emerald-400 font-mono">ASIN: {asin}</span>
                <a
                  href={buildAmazonUrl(asin)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:underline ml-auto"
                >
                  View on Amazon →
                </a>
              </div>
            ) : asinInput.trim() ? (
              <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Could not extract a valid ASIN from this input.
              </p>
            ) : null}
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
              Product Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="e.g. LEGO Star Wars Millennium Falcon"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              required
            />
          </div>

          {/* Category + Purchase Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Category
              </label>
              <select
                className="input-field text-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Purchase Price (True Cost) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input-field !pl-9 text-sm"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={e => setUnitPrice(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
              Notes <span className="text-slate-600 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              rows={2}
              className="input-field text-sm resize-none"
              placeholder="Condition, variant, listing notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Invoice ref preview */}
          {asin && (
            <div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Invoice Reference (auto-generated)</p>
              <p className="text-xs font-mono text-amber-400">AMAZON-{asin}-{new Date().toISOString().split('T')[0]}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs flex gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> Item added to inventory!
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success || !asin}
              className="flex-1 btn-primary px-4 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
                : success
                  ? <><CheckCircle2 className="w-4 h-4" /> Added!</>
                  : <><ShoppingCart className="w-4 h-4" /> Add to Inventory</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
