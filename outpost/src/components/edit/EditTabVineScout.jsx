import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag, ExternalLink, Sparkles, CheckCircle2, DollarSign,
  Tag, Hash, Loader2, AlertCircle, Link, Search, RefreshCw, Layers
} from 'lucide-react';
import { fetchAmazonProduct, getVineScoutCatalog } from '../../utils/auctionApi';

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

export function EditTabVineScout({ form, updateField, item }) {
  const isLinked = Boolean(form.is_vinescout || form.asin || form.order_id);
  const [quickInput, setQuickInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [fetchError, setFetchError] = useState('');

  // Synced Vine Catalog State
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogPicker, setShowCatalogPicker] = useState(true);

  // Load VineScout catalog from Outpost DB
  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await getVineScoutCatalog();
      setCatalog(res?.items || []);
    } catch (e) {
      console.warn('Could not load Vine catalog:', e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Filter catalog items
  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return catalog;
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter(c =>
      (c.item_name && c.item_name.toLowerCase().includes(q)) ||
      (c.asin && c.asin.toLowerCase().includes(q)) ||
      (c.order_id && c.order_id.toLowerCase().includes(q)) ||
      (c.sku && c.sku.toLowerCase().includes(q))
    );
  }, [catalog, catalogSearch]);

  // Handle Selecting an item from the Vine catalog
  const handleSelectCatalogItem = (vineItem) => {
    if (vineItem.asin) updateField('asin', vineItem.asin);
    if (vineItem.order_id) updateField('order_id', vineItem.order_id);
    updateField('is_vinescout', true);

    if (vineItem.etv != null && vineItem.etv > 0) {
      updateField('etv', String(vineItem.etv));
    }
    if (vineItem.tax_cost != null && vineItem.tax_cost > 0) {
      updateField('tax_cost', String(Number(vineItem.tax_cost).toFixed(2)));
      updateField('unit_price', String(Number(vineItem.tax_cost).toFixed(2)));
      updateField('true_total_cost', String(Number(vineItem.tax_cost).toFixed(2)));
    }

    setFetchMsg(`Linked to Vine item: "${vineItem.item_name.slice(0, 50)}..." (ASIN: ${vineItem.asin || 'N/A'})`);
    setFetchError('');
  };

  // Handle Fetch & Link from pasted URL, ASIN, or Order ID
  const handleFetchAndLink = async () => {
    if (!quickInput.trim()) {
      setFetchError('Please paste an Amazon URL, ASIN, or Order ID first.');
      return;
    }
    setFetchError('');
    setFetchMsg('');
    setFetching(true);

    const { asin: parsedAsin, orderId: parsedOrderId } = parseAmazonInput(quickInput);

    let assignedAsin = parsedAsin || form.asin || '';
    let assignedOrder = parsedOrderId || form.order_id || '';

    if (!assignedAsin && !assignedOrder) {
      setFetchError('Could not find a valid 10-character ASIN or Order ID in the text.');
      setFetching(false);
      return;
    }

    if (assignedAsin) updateField('asin', assignedAsin);
    if (assignedOrder) updateField('order_id', assignedOrder);
    updateField('is_vinescout', true);

    if (assignedAsin) {
      try {
        const data = await fetchAmazonProduct(assignedAsin);
        if (data && data.title) {
          setFetchMsg(`Successfully linked to Amazon product: "${data.title.slice(0, 65)}..."`);
          if (data.price && (!form.etv || form.etv === '0' || form.etv === '0.00')) {
            updateField('etv', String(data.price));
          }
        } else {
          setFetchMsg(`Linked ASIN ${assignedAsin} and assigned to VineScout!`);
        }
      } catch (err) {
        setFetchMsg(`Linked ASIN ${assignedAsin} and assigned to VineScout.`);
      }
    } else if (assignedOrder) {
      setFetchMsg(`Linked Amazon Vine Order #${assignedOrder} and assigned to VineScout!`);
    }

    setFetching(false);
    setQuickInput('');
  };

  // Auto-detect ASIN or Order ID from item title, SKU, or notes
  const handleAutoDetect = () => {
    setFetchError('');
    setFetchMsg('');
    const combined = `${form.item_name || ''} ${form.sku || ''} ${form.notes || ''} ${item?.invoice_ref || ''}`;
    let found = 0;
    
    // ASIN regex
    const mAsin = combined.match(/\b(B0[A-Z0-9]{8})\b/i);
    if (mAsin) {
      updateField('asin', mAsin[1].toUpperCase());
      found++;
    }

    // Order ID regex
    const mOrder = combined.match(/\b(\d{3}-\d{7}-\d{7})\b/);
    if (mOrder) {
      updateField('order_id', mOrder[1]);
      found++;
    }

    if (found > 0) {
      updateField('is_vinescout', true);
      setFetchMsg(`Auto-detected ${found} identifier(s) from item description/notes!`);
    } else {
      setFetchError('No ASIN (B0...) or Amazon Order ID found in item title, SKU, or notes.');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Link Switch Card */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-teal-800/50 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">VineScout &amp; Amazon Vine Sync</span>
                {isLinked && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-teal-400" />
                    Linked
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Synchronizes live eBay pricing, Vine tax basis, and automated sold reconciliation with VScout.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-teal-700/50 transition-colors">
            <input
              type="checkbox"
              checked={Boolean(form.is_vinescout)}
              onChange={e => updateField('is_vinescout', e.target.checked)}
              className="rounded border-slate-700 text-teal-500 focus:ring-teal-400 h-4 w-4"
            />
            <span className="text-xs font-bold text-teal-300">Assign as VScout Item</span>
          </label>
        </div>

        {fetchError && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {fetchMsg && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
            <span>{fetchMsg}</span>
          </div>
        )}
      </div>

      {/* 2. Select from Synced Vine Items Picker */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-400" /> Select from Synced VineScout Items ({catalog.length})
          </h4>
          <button
            type="button"
            onClick={loadCatalog}
            disabled={loadingCatalog}
            className="text-[11px] font-bold text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
            title="Refresh synced Vine items list"
          >
            <RefreshCw className={`w-3 h-3 ${loadingCatalog ? 'animate-spin text-amber-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-400">
          Pick an item from your synced Vine items to automatically link its ASIN, Order ID, ETV, and Tax Cost:
        </p>

        {/* Search Filter for Catalog */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={catalogSearch}
            onChange={e => setCatalogSearch(e.target.value)}
            placeholder="Search Vine items by title, ASIN, or Order ID..."
            className="input-field pl-8 text-xs text-white placeholder-slate-500"
          />
        </div>

        {/* Catalog Items Scroll Container */}
        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {loadingCatalog ? (
            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Loading synced Vine items...</span>
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-lg border border-slate-800/60">
              No matching Vine items found in Outpost database.
            </div>
          ) : (
            filteredCatalog.map(vineItem => {
              const isSelected = form.asin && vineItem.asin && form.asin.toUpperCase() === vineItem.asin.toUpperCase();
              return (
                <div
                  key={vineItem.id}
                  onClick={() => handleSelectCatalogItem(vineItem)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-teal-500/15 border-teal-500/50 shadow-sm'
                      : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {vineItem.image_url ? (
                      <img
                        src={vineItem.image_url}
                        alt=""
                        className="w-9 h-9 rounded object-cover bg-slate-800 flex-shrink-0 border border-slate-700"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-700">
                        <ShoppingBag className="w-4 h-4 text-slate-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${isSelected ? 'text-teal-300 font-bold' : 'text-slate-200'}`}>
                        {vineItem.item_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                        {vineItem.asin && (
                          <span className="font-mono bg-slate-800 px-1 rounded text-teal-400 font-bold">
                            ASIN: {vineItem.asin}
                          </span>
                        )}
                        {vineItem.order_id && (
                          <span className="font-mono text-slate-400">
                            Order: {vineItem.order_id}
                          </span>
                        )}
                        {vineItem.etv != null && (
                          <span className="text-amber-400">
                            ETV: ${Number(vineItem.etv).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition-all flex-shrink-0 ${
                      isSelected
                        ? 'bg-teal-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-teal-600 text-slate-300 hover:text-white'
                    }`}
                  >
                    {isSelected ? '✓ Linked' : 'Select'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Quick Paste Bar & Auto-Detect Fallback */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <label className="block text-xs font-bold text-slate-300">
          Or Paste Amazon URL / ASIN / Order ID Directly:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFetchAndLink(); } }}
            placeholder="e.g. https://www.amazon.com/dp/B0GQ4KD8C5 or B0GQ4KD8C5"
            className="input-field text-xs font-mono text-white flex-1 placeholder-slate-500"
          />
          <button
            type="button"
            disabled={fetching || !quickInput.trim()}
            onClick={handleFetchAndLink}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all flex-shrink-0"
          >
            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
            <span>Fetch &amp; Link</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-400">
            Already in item description or notes?
          </span>
          <button
            type="button"
            onClick={handleAutoDetect}
            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-all"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto-Detect from Title / Notes</span>
          </button>
        </div>
      </div>

      {/* 4. Active Linked Identifiers & Cost Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-teal-400" /> Active Vine Identifiers &amp; Cost Basis
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Amazon ASIN</span>
              {form.asin && (
                <a
                  href={`https://www.amazon.com/dp/${form.asin.trim().toUpperCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Amazon ↗</span>
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
              <span>Amazon Order ID</span>
              {form.order_id && (
                <a
                  href={`https://www.amazon.com/gp/your-account/order-details?orderID=${form.order_id.trim()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold"
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
              className="input-field text-xs font-mono text-slate-200 font-medium"
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
    </div>
  );
}
