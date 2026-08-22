import React, { useState, useEffect } from 'react';
import {
  X, ShoppingCart, Link, DollarSign, Loader2, AlertCircle, CheckCircle2, Search, ExternalLink, PackageCheck,
  Sparkles, ClipboardPaste
} from 'lucide-react';
import { createInvoice, getApiUrl } from '../utils/auctionApi';
import { parseAmazonProductContent } from '../utils/amazonParser';

const CATEGORIES = [
  'Electronics', 'Toys & Games', 'Books', 'Home & Kitchen', 'Sports', 'Health',
  'Clothing', 'Tools', 'Office', 'Pet Supplies', 'Beauty', 'Automotive',
  'Jersey', 'Card', 'Photo', 'Other'
];

/**
 * Extracts Order ID or ASIN from an input string or Amazon URL.
 */
function parseAmazonInput(input) {
  if (!input) return { asin: '', orderId: '' };
  const trimmed = input.trim();

  // Extract Order ID (e.g. 111-2212343-5265805)
  const orderMatch = trimmed.match(/\b(\d{3}-\d{7}-\d{7})\b/);
  const orderId = orderMatch ? orderMatch[1] : '';

  // Extract ASIN (10 alphanumeric chars)
  let asin = '';
  const asinMatch = trimmed.match(/\/(?:dp|gp\/product|asin)\/([A-Z0-9]{10})/i)
    || trimmed.match(/[?&]pd_rd_i=([A-Z0-9]{10})/i)
    || trimmed.match(/[?&]asin=([A-Z0-9]{10})/i);

  if (asinMatch) {
    asin = asinMatch[1].toUpperCase();
  } else if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
    asin = trimmed.toUpperCase();
  }

  return { asin, orderId };
}

function buildAmazonUrl(asin, orderId) {
  if (orderId) return `https://www.amazon.com/gp/your-account/order-details?orderID=${orderId}`;
  if (asin) return `https://www.amazon.com/dp/${asin}`;
  return '';
}

export function AmazonItemModal({ isOpen, platforms = [], onClose, onCreated }) {
  const [asinInput, setAsinInput]     = useState('');
  const [asin, setAsin]               = useState('');
  const [orderId, setOrderId]         = useState('');
  const [itemName, setItemName]       = useState('');
  const [category, setCategory]       = useState('Electronics');
  const [unitPrice, setUnitPrice]     = useState('');
  const [notes, setNotes]             = useState('');
  const [imageUrl, setImageUrl]       = useState('');
  
  const [fetching, setFetching]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [fetchMsg, setFetchMsg]       = useState('');
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState('');

  const defaultPlatform = (platforms || []).find(p => p.is_default)
    || (platforms || [])[0]
    || { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40 };

  // Parse ASIN & Order ID whenever input changes
  useEffect(() => {
    const { asin: parsedAsin, orderId: parsedOrderId } = parseAmazonInput(asinInput);
    setAsin(parsedAsin);
    setOrderId(parsedOrderId);
  }, [asinInput]);

  const reset = () => {
    setAsinInput(''); setAsin(''); setOrderId(''); setItemName('');
    setCategory('Electronics'); setUnitPrice(''); setNotes(''); setImageUrl('');
    setFetching(false); setError(''); setFetchMsg(''); setSuccess(false);
    setShowSmartPaste(false); setSmartPasteText('');
  };

  const handleClose = () => { reset(); onClose(); };

  const nameInputRef = React.useRef(null);

  // Handle Client-Side Smart Paste Extraction
  const handleExtractSmartPaste = (customText) => {
    const textToProcess = (customText !== undefined ? customText : smartPasteText).trim();
    if (!textToProcess) {
      setError('Please paste text or HTML from the Amazon product page first.');
      return;
    }

    const parsed = parseAmazonProductContent(textToProcess);
    let populatedCount = 0;
    if (parsed.title) { setItemName(parsed.title); populatedCount++; }
    if (parsed.price) { setUnitPrice(String(parsed.price)); populatedCount++; }
    if (parsed.image) { setImageUrl(parsed.image); populatedCount++; }
    if (parsed.brand && !notes.includes(parsed.brand)) {
      setNotes(prev => prev ? `Brand: ${parsed.brand} | ${prev}` : `Brand: ${parsed.brand}`);
      populatedCount++;
    }

    if (populatedCount > 0) {
      setFetchMsg(`Smart Paste extracted ${populatedCount} item fields successfully!`);
      setError('');
      setSmartPasteText('');
      setShowSmartPaste(false);
    } else {
      setError('Could not auto-detect standard Amazon patterns. Please enter fields manually.');
    }
  };

  // Search / Fetch Info from backend endpoint
  const handleFetchInfo = async () => {
    if (!asinInput.trim()) {
      setError('Please paste an Amazon URL, Order URL, ASIN, or Order ID first.');
      return;
    }

    setError('');
    setFetching(true);
    setFetchMsg('Fetching product metadata...');

    try {
      const res = await fetch(getApiUrl('/api/import/amazon-fetch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ input: asinInput.trim() })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error === 'AMAZON_BLOCKED' || data.success === false) {
        if (data.asin && !asin) setAsin(data.asin);
        if (data.orderId && !orderId) setOrderId(data.orderId);
        setFetchMsg('');
        setShowSmartPaste(true);
        setError(data.message || data.error || 'Automated lookup challenged by Amazon bot protection. Use Smart Paste below.');
        setTimeout(() => nameInputRef.current?.focus(), 100);
        return;
      }

      if (data.asin && !asin) setAsin(data.asin);
      if (data.orderId && !orderId) setOrderId(data.orderId);

      if (data.title) setItemName(data.title);
      if (data.price) setUnitPrice(String(data.price));
      if (data.image) setImageUrl(data.image);

      if (data.title) {
        setFetchMsg('Product title & info populated from Amazon!');
      } else if (data.orderId) {
        setFetchMsg(`Order #${data.orderId} linked! (Order pages require Amazon login, so enter Product Name below).`);
        setTimeout(() => nameInputRef.current?.focus(), 100);
      } else if (data.asin) {
        setFetchMsg(`ASIN ${data.asin} linked! Enter item name below or paste product link.`);
        setTimeout(() => nameInputRef.current?.focus(), 100);
      } else {
        setFetchMsg('Parsed URL. Please enter product details below.');
        setTimeout(() => nameInputRef.current?.focus(), 100);
      }
    } catch (err) {
      console.error(err);
      setFetchMsg('');
      setShowSmartPaste(true);
      setError(err.message || 'Could not auto-fetch metadata. Use Smart Paste below.');
      setTimeout(() => nameInputRef.current?.focus(), 100);
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!asin && !orderId) {
      setError('Enter a valid Amazon URL, Order ID, or ASIN.');
      return;
    }
    if (!itemName.trim()) { setError('Product name is required.'); return; }
    const price = parseFloat(unitPrice);
    if (isNaN(price) || price < 0) { setError('Enter a valid purchase price (enter 0.00 for Vine $0 ETV items).'); return; }

    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const invoiceRef = orderId
        ? `AMAZON-ORDER-${orderId}`
        : `AMAZON-${asin}-${today}`;

      const noteParts = [];
      if (orderId) noteParts.push(`Order ID: ${orderId}`);
      if (asin) noteParts.push(`ASIN: ${asin}`);
      if (imageUrl) noteParts.push(`Image: ${imageUrl}`);
      if (notes.trim()) noteParts.push(notes.trim());

      await createInvoice({
        invoice_ref: invoiceRef,
        description: orderId ? `Amazon Order ${orderId}` : `Amazon import - ASIN ${asin}`,
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
          notes: noteParts.join(' | ') || 'Imported from Amazon',
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
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-gradient-to-r from-orange-950/60 to-slate-900/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
              <ShoppingCart className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add Amazon Item</h2>
              <p className="text-[11px] text-slate-400">Paste Product URL, Order URL, ASIN, or Order ID</p>
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
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 flex-1 overflow-y-auto min-h-0">

          {/* URL / ASIN / Order ID input + Search Button */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Amazon Product URL, Order Link, ASIN, or Order #
              </label>
              <button
                type="button"
                onClick={() => setShowSmartPaste(!showSmartPaste)}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 border transition-colors ${
                  showSmartPaste
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>{showSmartPaste ? 'Hide Smart Paste' : 'Smart Paste'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  className="input-field !pl-10 text-sm"
                  placeholder="https://amazon.com/dp/... or order-details?orderID=111-..."
                  value={asinInput}
                  onChange={e => setAsinInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !itemName) {
                      e.preventDefault();
                      handleFetchInfo();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleFetchInfo}
                disabled={fetching || !asinInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-orange-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                title="Search and auto-fetch product information"
              >
                {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5 stroke-[2.5]" />}
                <span>{fetching ? 'Searching...' : 'Search'}</span>
              </button>
            </div>

            {/* Parsing badges */}
            <div className="flex items-center flex-wrap gap-2 mt-2">
              {orderId && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono text-amber-300">
                  <PackageCheck className="w-3 h-3 text-amber-400" /> Order #: {orderId}
                </span>
              )}
              {asin && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> ASIN: {asin}
                </span>
              )}
              {(asin || orderId) && (
                <a
                  href={buildAmazonUrl(asin, orderId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 ml-auto"
                >
                  View on Amazon <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Smart Paste Drawer */}
            {showSmartPaste && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-blue-900/40 space-y-2 mt-2.5 animate-in fade-in-0 duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-300 flex items-center gap-1">
                    <ClipboardPaste className="w-3.5 h-3.5 text-blue-400" />
                    1-Click Smart Paste (Bypasses Bot Checks)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Paste text or HTML copied from Amazon
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={smartPasteText}
                  onChange={e => setSmartPasteText(e.target.value)}
                  placeholder="Paste product details or page HTML from Amazon..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleExtractSmartPaste()}
                    disabled={!smartPasteText.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 bg-blue-400 hover:bg-blue-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Extract Details</span>
                  </button>
                </div>
              </div>
            )}

            {fetchMsg && (
              <p className="text-[11px] text-emerald-400 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {fetchMsg}
              </p>
            )}
          </div>

          {/* Fetched Product Image Preview */}
          {imageUrl && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <img src={imageUrl} alt="Product" className="w-12 h-12 object-contain rounded-lg bg-white p-1 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">{itemName || 'Fetched Product'}</p>
                <p className="text-[10px] text-emerald-400 font-mono mt-0.5">{unitPrice ? `$${unitPrice}` : 'Price extracted'}</p>
              </div>
            </div>
          )}

          {/* Product Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
              Product Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
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
                  min="0"
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
          {(orderId || asin) && (
            <div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Invoice Reference (auto-generated)</p>
              <p className="text-xs font-mono text-amber-400">
                {orderId ? `AMAZON-ORDER-${orderId}` : `AMAZON-${asin}-${new Date().toISOString().split('T')[0]}`}
              </p>
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
              disabled={submitting || success || (!asin && !orderId)}
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
