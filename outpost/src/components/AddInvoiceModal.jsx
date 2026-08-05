import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Trash2, ChevronDown, Loader2, AlertCircle,
  Package, DollarSign, Truck, Tag
} from 'lucide-react';
import { createInvoice, getItems } from '../utils/auctionApi';
import { computeItemProration, computePricingFloors } from '../utils/formulaPreview';

const CATEGORIES = ['Jersey', 'Photo', 'Card', 'Baseball', 'Bat', 'Football',
  'Mask', 'Drum Stick', 'Helmet', 'Glove', 'Poster', 'Puck', 'Other'];
const AUTHENTICATORS = ['JSA', 'Beckett', 'PSA', 'ACOA', 'Schwartz', 'SGC', 'Unlabeled', 'Other'];
const STATUSES = ['Available', 'Listed', 'Kept for Self', 'Returned'];

const emptyItem = () => ({
  _key: crypto.randomUUID(),
  item_name: '', category: 'Jersey', sport_genre: '', athlete_person: '',
  authenticator: 'JSA', cert_number: '', unit_price: '',
  platform: 'eBay', boost_pct: 0, est_shipping_cost: 6.5,
  target_margin_pct: 0.30, status: 'Available',
  notes: '', best_listing_window: '',
  // preview-only (computed client-side)
  _preview: null
});

/**
 * @param {{ open: boolean, platforms: Array, onClose: () => void, onCreated: () => void }} props
 */
export function AddInvoiceModal({ open, platforms, onClose, onCreated }) {
  const [step, setStep]         = useState(1); // 1=header, 2=items
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  // Invoice header fields
  const [invoiceRef,    setInvoiceRef]    = useState('');
  const [description,   setDescription]  = useState('');
  const [dateAcquired,  setDateAcquired]  = useState('');
  const [discount,      setDiscount]      = useState('');
  const [shipping,      setShipping]      = useState('');
  const [tax,           setTax]           = useState('');

  // Line items
  const [items, setItems] = useState([emptyItem()]);

  // Default platform (eBay)
  const defaultPlatform = platforms.find(p => p.is_default) || platforms[0] || { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40 };

  const reset = () => {
    setStep(1); setError('');
    setInvoiceRef(''); setDescription(''); setDateAcquired('');
    setDiscount(''); setShipping(''); setTax('');
    setItems([emptyItem()]);
  };

  const handleClose = () => { reset(); onClose(); };

  // Recompute previews whenever header or items change
  useEffect(() => {
    const baseTotal = items.reduce((s, it) => s + (parseFloat(it.unit_price) || 0), 0);
    const inv = {
      base_total: baseTotal,
      discount: parseFloat(discount) || 0,
      shipping: parseFloat(shipping) || 0,
      tax: parseFloat(tax) || 0
    };

    setItems(prev => prev.map(it => {
      const price = parseFloat(it.unit_price) || 0;
      if (!price) return { ...it, _preview: null };
      const plat = platforms.find(p => p.name === it.platform) || defaultPlatform;
      const proration = computeItemProration({ unit_price: price }, inv);
      const pricing   = computePricingFloors({
        true_total_cost:   proration.true_total_cost,
        est_shipping_cost: parseFloat(it.est_shipping_cost) || 0,
        platform_flat_fee: plat.flat_fee || 0,
        platform_fee_pct:  plat.fee_pct  || 0,
        boost_pct:         parseFloat(it.boost_pct) || 0,
        target_margin_pct: parseFloat(it.target_margin_pct) || 0
      });
      return { ...it, _preview: { ...proration, ...pricing } };
    }));
  }, [discount, shipping, tax, items.map(i => `${i._key}:${i.unit_price}:${i.platform}:${i.est_shipping_cost}:${i.boost_pct}:${i.target_margin_pct}`).join('|')]);

  const addItem = () => setItems(prev => [...prev, { ...emptyItem(), platform: defaultPlatform.name }]);
  const removeItem = (key) => setItems(prev => prev.filter(i => i._key !== key));
  const updateItem = (key, field, val) => setItems(prev => prev.map(i => i._key === key ? { ...i, [field]: val } : i));

  const handleNext = () => {
    if (!invoiceRef.trim()) { setError('Invoice Reference is required.'); return; }
    setError(''); setStep(2);
  };

  const handleSubmit = async () => {
    for (const it of items) {
      if (!it.item_name.trim()) { setError('All items must have a name.'); return; }
      if (!parseFloat(it.unit_price) || parseFloat(it.unit_price) <= 0) {
        setError(`Item "${it.item_name || '(unnamed)'}" needs a valid price.`); return;
      }
    }

    setSubmitting(true); setError('');
    try {
      await createInvoice({
        invoice_ref:   invoiceRef.trim(),
        description:   description.trim() || undefined,
        date_acquired: dateAcquired || undefined,
        discount:      parseFloat(discount) || 0,
        shipping:      parseFloat(shipping) || 0,
        tax:           parseFloat(tax)      || 0,
        items: items.map(it => {
          const plat = platforms.find(p => p.name === it.platform) || defaultPlatform;
          return {
            item_name:         it.item_name.trim(),
            category:          it.category,
            sport_genre:       it.sport_genre || undefined,
            athlete_person:    it.athlete_person || undefined,
            authenticator:     it.authenticator || undefined,
            cert_number:       it.cert_number || undefined,
            unit_price:        parseFloat(it.unit_price),
            platform:          it.platform,
            platform_fee_pct:  plat.fee_pct,
            platform_flat_fee: plat.flat_fee,
            est_shipping_cost: parseFloat(it.est_shipping_cost) || 0,
            boost_pct:         parseFloat(it.boost_pct) || 0,
            target_margin_pct: parseFloat(it.target_margin_pct) || 0,
            status:            it.status,
            notes:             it.notes || undefined,
            best_listing_window: it.best_listing_window || undefined
          };
        })
      });
      reset();
      onCreated();
    } catch (e) {
      setError(e.message || 'Failed to create invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const baseTotal = items.reduce((s, it) => s + (parseFloat(it.unit_price) || 0), 0);
  const netLanded = baseTotal - (parseFloat(discount) || 0) + (parseFloat(shipping) || 0) + (parseFloat(tax) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-6 pb-6 overflow-y-auto">
      <div className="w-full max-w-3xl mx-4 glass-card rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/60">
          <div>
            <h2 className="text-lg font-black text-white">
              {step === 1 ? 'New Invoice — Header' : `New Invoice — Line Items (${items.length})`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 1 ? 'Enter the invoice totals. Proration is computed automatically.' : 'Add each signed item. True cost updates live as you type.'}
            </p>
          </div>
          <button id="modal-close" onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-800/40 bg-slate-950/30">
          {[{ n: 1, label: 'Invoice Header' }, { n: 2, label: 'Line Items' }].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${step >= n ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-500'}`}>{n}</div>
              <span className={`text-xs font-medium ${step >= n ? 'text-amber-400' : 'text-slate-600'}`}>{label}</span>
              {n < 2 && <div className="w-12 h-px bg-slate-800 mx-1" />}
            </div>
          ))}
          {baseTotal > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              <span>Base: <span className="text-slate-300 font-semibold">${baseTotal.toFixed(2)}</span></span>
              <span>Landed: <span className="text-amber-400 font-semibold">${netLanded.toFixed(2)}</span></span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
          </div>
        )}

        {/* Step 1: Invoice Header */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Invoice Reference *</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input id="inv-ref" type="text" className="input-field pl-9 text-sm" placeholder="e.g. 4809173" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} />
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Date Acquired</label>
                <input id="inv-date" type="date" className="input-field text-sm" value={dateAcquired} onChange={e => setDateAcquired(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Description (optional)</label>
                <input id="inv-desc" type="text" className="input-field text-sm" placeholder="Lot description, source..." value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'inv-discount', label: 'Total Discount ($)', val: discount, set: setDiscount, Icon: Tag, hint: 'e.g. 45.00' },
                { id: 'inv-shipping', label: 'Total Shipping ($)', val: shipping, set: setShipping, Icon: Truck, hint: 'e.g. 25.77' },
                { id: 'inv-tax',      label: 'Total Tax ($)',      val: tax,      set: setTax,      Icon: DollarSign, hint: 'e.g. 13.01' },
              ].map(({ id, label, val, set, Icon, hint }) => (
                <div key={id}>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input id={id} type="number" step="0.01" min="0" className="input-field pl-9 text-sm" placeholder={hint} value={val} onChange={e => set(e.target.value)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/40">
              <p className="text-xs font-semibold text-slate-400 mb-2">Proration Formula Preview</p>
              <p className="text-xs text-slate-500 font-mono leading-relaxed">
                Weight = Item Price / Base Total<br />
                True Cost = Price − (Weight × Discount) + (Weight × Shipping) + (Weight × Tax)
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button id="inv-cancel" type="button" className="px-5 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-all" onClick={handleClose}>Cancel</button>
              <button id="inv-next" type="button" className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all" onClick={handleNext}>Next: Add Items →</button>
            </div>
          </div>
        )}

        {/* Step 2: Line Items */}
        {step === 2 && (
          <div className="p-6">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={it._key} className="glass-card-light rounded-xl p-4 relative hover-border-amber">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-amber-400/70">Item {idx + 1}</span>
                    <div className="flex items-center gap-2">
                      {it._preview && (
                        <span className="text-xs text-slate-400">
                          True Cost: <span className="text-amber-400 font-semibold">${it._preview.true_total_cost.toFixed(2)}</span>
                          {' · '}Min Sell: <span className="text-emerald-400 font-semibold">${it._preview.min_sell_price.toFixed(2)}</span>
                        </span>
                      )}
                      {items.length > 1 && (
                        <button onClick={() => removeItem(it._key)} className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-3">
                    {/* Item Name - full width */}
                    <div className="col-span-12">
                      <input
                        id={`item-name-${idx}`}
                        type="text"
                        className="input-field text-sm"
                        placeholder="Item name (e.g. Shawn Kemp Signed Jersey JSA)"
                        value={it.item_name}
                        onChange={e => updateItem(it._key, 'item_name', e.target.value)}
                      />
                    </div>

                    {/* Category */}
                    <div className="col-span-4">
                      <select id={`item-cat-${idx}`} className="input-field text-sm" value={it.category} onChange={e => updateItem(it._key, 'category', e.target.value)}>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>

                    {/* Authenticator */}
                    <div className="col-span-4">
                      <select id={`item-auth-${idx}`} className="input-field text-sm" value={it.authenticator} onChange={e => updateItem(it._key, 'authenticator', e.target.value)}>
                        {AUTHENTICATORS.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>

                    {/* Unit Price */}
                    <div className="col-span-4">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                        <input
                          id={`item-price-${idx}`}
                          type="number" step="0.01" min="0"
                          className="input-field text-sm pl-7"
                          placeholder="Unit price"
                          value={it.unit_price}
                          onChange={e => updateItem(it._key, 'unit_price', e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Athlete */}
                    <div className="col-span-6">
                      <input id={`item-athlete-${idx}`} type="text" className="input-field text-sm" placeholder="Athlete / Person" value={it.athlete_person} onChange={e => updateItem(it._key, 'athlete_person', e.target.value)} />
                    </div>

                    {/* Sport/Genre */}
                    <div className="col-span-6">
                      <input id={`item-sport-${idx}`} type="text" className="input-field text-sm" placeholder="Sport / Genre (e.g. Basketball, Movie)" value={it.sport_genre} onChange={e => updateItem(it._key, 'sport_genre', e.target.value)} />
                    </div>

                    {/* Platform */}
                    <div className="col-span-4">
                      <select id={`item-plat-${idx}`} className="input-field text-sm" value={it.platform} onChange={e => updateItem(it._key, 'platform', e.target.value)}>
                        {platforms.map(p => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>

                    {/* Est Shipping */}
                    <div className="col-span-4">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                        <input id={`item-ship-${idx}`} type="number" step="0.01" min="0" className="input-field text-sm pl-7" placeholder="Est. shipping" value={it.est_shipping_cost} onChange={e => updateItem(it._key, 'est_shipping_cost', e.target.value)} />
                      </div>
                    </div>

                    {/* Target Margin % */}
                    <div className="col-span-4">
                      <div className="relative">
                        <input id={`item-margin-${idx}`} type="number" step="1" min="0" max="999" className="input-field text-sm pr-7" placeholder="Margin %" value={Math.round((parseFloat(it.target_margin_pct) || 0) * 100)} onChange={e => updateItem(it._key, 'target_margin_pct', (parseFloat(e.target.value) || 0) / 100)} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="col-span-4">
                      <select id={`item-status-${idx}`} className="input-field text-sm" value={it.status} onChange={e => updateItem(it._key, 'status', e.target.value)}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* Notes */}
                    <div className="col-span-8">
                      <input id={`item-notes-${idx}`} type="text" className="input-field text-sm" placeholder="Notes / Best listing window" value={it.notes} onChange={e => updateItem(it._key, 'notes', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add item + submit */}
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800/40">
              <button id="add-item-btn" type="button" onClick={addItem} className="flex items-center gap-2 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors">
                <Plus className="w-4 h-4" /> Add Another Item
              </button>
              <div className="flex items-center gap-3">
                <button id="step2-back" type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 border border-slate-700 transition-all">← Back</button>
                <button id="create-invoice-submit" type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary w-auto px-6 py-2.5 text-sm">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Create Invoice (${items.length} item${items.length !== 1 ? 's' : ''})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
