import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, Loader2, Zap, ExternalLink, Copy, AlertCircle, TrendingUp, Layers, Lock, Sparkles, Upload, ShoppingBag } from 'lucide-react';
import { updateItem, saveComp, fetchLiveComps, pushSkuToEbay } from '../../utils/auctionApi';
import { ALL_STATUSES, LISTING_FORMATS } from '../../utils/constants';
import { FeeBreakdownPanel } from './FeeBreakdownPanel';
import { buildEbaySearchUrl } from '../../utils/ebaySearch';
import { fmtCurrency, roundPrice, round2 } from '../../utils/formulaPreview';
import { generateSku } from '../../utils/skuGenerator';

const formatDec2 = (val) => {
  if (val == null || val === '' || isNaN(Number(val))) return '';
  return round2(val).toFixed(2);
};

export function QuickEditDrawer({
  item,
  isOpen,
  onClose,
  categoryOptions = [],
  platformOptions = [],
  onItemUpdated,
  onOpenCopyModal,
  onOpenQueryEdit
}) {
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [pushingSku, setPushingSku] = useState(false);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (item) {
      let itemAsin = item.asin || '';
      let itemOrderId = item.order_id || '';
      let isVine = Boolean(item.is_vinescout || item.is_amazon || (item.invoice_ref && item.invoice_ref.startsWith('AMAZON-')));
      let itemEtv = item.etv != null ? String(item.etv) : '';
      let itemTaxCost = item.tax_cost != null ? String(item.tax_cost) : '';

      if (item.attributes) {
        try {
          const parsed = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
          if (parsed && typeof parsed === 'object') {
            if (parsed.asin) itemAsin = parsed.asin;
            if (parsed.order_id) itemOrderId = parsed.order_id;
            if (parsed.source === 'amazon_vinescout' || parsed.is_vinescout) isVine = true;
            if (parsed.etv != null) itemEtv = String(parsed.etv);
            if (parsed.tax_cost != null) itemTaxCost = String(parsed.tax_cost);
          }
        } catch (_) {}
      }

      if (!itemAsin && item.notes) {
        const m = item.notes.match(/\b(B0[A-Z0-9]{8})\b/i);
        if (m) itemAsin = m[1].toUpperCase();
      }
      if (!itemOrderId && item.notes) {
        const m = item.notes.match(/\b(\d{3}-\d{7}-\d{7})\b/);
        if (m) itemOrderId = m[1];
      }
      if (itemAsin || itemOrderId) {
        isVine = true;
      }

      setDraft({
        item_name: item.item_name || '',
        sku: item.sku || '',
        category: item.category || '',
        athlete_person: item.athlete_person || '',
        authenticator: item.authenticator || '',
        cert_number: item.cert_number || '',
        quantity: item.quantity ?? 1,
        purchase_date: item.purchase_date || item.date_acquired || '',
        status: item.status || 'Available',
        platform: item.platform || 'eBay',
        listing_format: item.listing_format || 'Fixed Price',
        true_total_cost: formatDec2(item.true_total_cost),
        est_shipping_cost: formatDec2(item.est_shipping_cost),
        current_list_price: formatDec2(item.current_list_price),
        buy_it_now_price: formatDec2(item.buy_it_now_price),
        floor_price: formatDec2(item.floor_price),
        ebay_promoted_rate: item.ebay_promoted_rate ?? '',
        target_margin_pct: item.target_margin_pct != null ? (Number(item.target_margin_pct) * 100).toFixed(0) : '15',
        ebay_listing_id: item.ebay_listing_id || '',
        notes: item.notes || '',

        // VineScout / Amazon Vine Link
        is_vinescout: isVine,
        asin: itemAsin,
        order_id: itemOrderId,
        etv: formatDec2(itemEtv),
        tax_cost: formatDec2(itemTaxCost),

        // Comps
        comp_1: formatDec2(item.comp_1),
        comp_2: formatDec2(item.comp_2),
        comp_3: formatDec2(item.comp_3),
        active_comp_1: formatDec2(item.active_comp_1),
        active_comp_2: formatDec2(item.active_comp_2),
        active_comp_3: formatDec2(item.active_comp_3),
        recommended_list_price: formatDec2(item.recommended_list_price ?? item.current_list_price)
      });
      setFetchMsg(null);
      setSaveSuccess(false);
    }
  }, [item]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const updateField = (field, value) => {
    setDraft(prev => {
      const updated = { ...prev, [field]: value };

      // Auto update recommended price if comp 1/2/3 change
      if (field.startsWith('comp_')) {
        const c1 = field === 'comp_1' ? value : prev.comp_1;
        const c2 = field === 'comp_2' ? value : prev.comp_2;
        const c3 = field === 'comp_3' ? value : prev.comp_3;
        const vals = [c1, c2, c3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
        if (vals.length > 0) {
          updated.recommended_list_price = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
        }
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const itemPatch = {
        item_name: draft.item_name.trim(),
        sku: draft.sku ? draft.sku.trim() : null,
        category: draft.category || null,
        athlete_person: draft.athlete_person ? draft.athlete_person.trim() : null,
        authenticator: draft.authenticator ? draft.authenticator.trim() : null,
        cert_number: draft.cert_number ? draft.cert_number.trim() : null,
        quantity: parseInt(draft.quantity, 10) || 1,
        purchase_date: draft.purchase_date || null,
        status: draft.status,
        platform: draft.platform,
        listing_format: draft.listing_format,
        true_total_cost: draft.true_total_cost !== '' && draft.true_total_cost != null ? round2(draft.true_total_cost) : null,
        est_shipping_cost: draft.est_shipping_cost !== '' && draft.est_shipping_cost != null ? round2(draft.est_shipping_cost) : 0,
        current_list_price: draft.current_list_price !== '' && draft.current_list_price != null ? round2(draft.current_list_price) : null,
        buy_it_now_price: draft.buy_it_now_price !== '' && draft.buy_it_now_price != null ? round2(draft.buy_it_now_price) : null,
        floor_price: draft.floor_price !== '' && draft.floor_price != null ? round2(draft.floor_price) : null,
        ebay_promoted_rate: draft.ebay_promoted_rate !== '' ? parseFloat(draft.ebay_promoted_rate) : null,
        target_margin_pct: draft.target_margin_pct !== '' ? parseFloat(draft.target_margin_pct) / 100 : 0.15,
        ebay_listing_id: draft.ebay_listing_id ? draft.ebay_listing_id.trim() : null,
        notes: draft.notes || null,

        // VineScout / Amazon Vine Link
        is_vinescout: Boolean(draft.is_vinescout),
        asin: draft.asin ? draft.asin.trim().toUpperCase() : null,
        order_id: draft.order_id ? draft.order_id.trim() : null,
        etv: draft.etv !== '' && draft.etv != null ? round2(draft.etv) : null,
        tax_cost: draft.tax_cost !== '' && draft.tax_cost != null ? round2(draft.tax_cost) : null
      };

      const res = await updateItem(item.id, itemPatch);

      // Save comps if any comp value exists
      const hasComps = draft.comp_1 !== '' || draft.comp_2 !== '' || draft.comp_3 !== '' ||
                       draft.active_comp_1 !== '' || draft.active_comp_2 !== '' || draft.active_comp_3 !== '' ||
                       draft.recommended_list_price !== '';
      if (hasComps) {
        await saveComp({
          item_id: item.id,
          comp_1: draft.comp_1 !== '' ? round2(draft.comp_1) : null,
          comp_2: draft.comp_2 !== '' ? round2(draft.comp_2) : null,
          comp_3: draft.comp_3 !== '' ? round2(draft.comp_3) : null,
          active_comp_1: draft.active_comp_1 !== '' ? round2(draft.active_comp_1) : null,
          active_comp_2: draft.active_comp_2 !== '' ? round2(draft.active_comp_2) : null,
          active_comp_3: draft.active_comp_3 !== '' ? round2(draft.active_comp_3) : null,
          recommended_list_price: draft.recommended_list_price !== '' ? round2(draft.recommended_list_price) : null,
          apply_to_item: false
        });
      }

      if (onItemUpdated) {
        onItemUpdated(item.id, {
          ...itemPatch,
          ...(res?.item || res || {}),
          comp_1: draft.comp_1,
          comp_2: draft.comp_2,
          comp_3: draft.comp_3,
          active_comp_1: draft.active_comp_1,
          active_comp_2: draft.active_comp_2,
          active_comp_3: draft.active_comp_3,
          recommended_list_price: draft.recommended_list_price
        });
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2000);
    } catch (e) {
      alert(`Save error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFetchComps = () => {
    if (onOpenQueryEdit) {
      onOpenQueryEdit(item, async (query) => {
        setFetchingLive(true);
        setFetchMsg(null);
        try {
          const res = await fetchLiveComps(query, item.id);
          if (res && res.success && res.count > 0) {
            setDraft(prev => ({
              ...prev,
              comp_1: res.comp_1 != null ? roundPrice(res.comp_1) : prev.comp_1,
              comp_2: res.comp_2 != null ? roundPrice(res.comp_2) : prev.comp_2,
              comp_3: res.comp_3 != null ? roundPrice(res.comp_3) : prev.comp_3,
              recommended_list_price: roundPrice(res.live_avg || res.median || prev.recommended_list_price)
            }));
            setFetchMsg({ type: 'success', text: `Fetched ${res.count} eBay sold comps! Avg: ${fmtCurrency(res.live_avg)}` });
          } else {
            setFetchMsg({ type: 'info', text: 'No comps found on eBay.' });
          }
        } catch (e) {
          setFetchMsg({ type: 'error', text: e.message || 'Comp fetch failed.' });
        } finally {
          setFetchingLive(false);
        }
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 block">Quick Edit &amp; Pricing</span>
            <h2 className="text-sm font-bold text-white truncate">{draft.item_name || 'Edit Item'}</h2>
            {draft.sku && <span className="text-[10px] text-slate-500 font-mono">SKU: {draft.sku}</span>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close Drawer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Live Fee Breakdown Preview */}
          <FeeBreakdownPanel
            item={{
              ...item,
              ...draft,
              true_total_cost: draft.true_total_cost !== '' ? parseFloat(draft.true_total_cost) : item.true_total_cost,
              est_shipping_cost: draft.est_shipping_cost !== '' ? parseFloat(draft.est_shipping_cost) : item.est_shipping_cost,
              ebay_promoted_rate: draft.ebay_promoted_rate !== '' ? parseFloat(draft.ebay_promoted_rate) : item.ebay_promoted_rate
            }}
            customPrice={draft.current_list_price}
          />

          {/* Section 1: Item Details */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-800/80 pb-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> Item Identification
            </h3>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Title / Description</label>
              <input
                type="text"
                value={draft.item_name}
                onChange={e => updateField('item_name', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] text-slate-400 font-semibold">Custom SKU / Label</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateField('sku', generateSku())}
                      className="text-[9px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-0.5 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20"
                      title="Auto-generate structured SKU"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Auto</span>
                    </button>
                    {(draft.ebay_listing_id || item?.ebay_listing_id) && (
                      <button
                        type="button"
                        disabled={pushingSku || !draft.sku}
                        onClick={async () => {
                          if (!draft.sku) return;
                          setPushingSku(true);
                          try {
                            const res = await pushSkuToEbay(item.id, draft.sku);
                            setFetchMsg({ type: 'success', text: res.message || 'Pushed SKU to eBay!' });
                          } catch (e) {
                            setFetchMsg({ type: 'error', text: `eBay push failed: ${e.message}` });
                          } finally {
                            setPushingSku(false);
                          }
                        }}
                        className="text-[9px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-0.5 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 disabled:opacity-50"
                        title="Push this SKU to the linked eBay listing"
                      >
                        {pushingSku ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Upload className="w-2.5 h-2.5" />}
                        <span>eBay</span>
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. OP-260901-0001"
                  value={draft.sku}
                  onChange={e => updateField('sku', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Category</label>
                <select
                  value={draft.category}
                  onChange={e => updateField('category', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 focus:border-amber-500 outline-none"
                >
                  <option value="">-- None --</option>
                  {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Athlete / Signer</label>
                <input
                  type="text"
                  value={draft.athlete_person}
                  onChange={e => updateField('athlete_person', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Authenticator</label>
                <select
                  value={draft.authenticator}
                  onChange={e => updateField('authenticator', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 focus:border-amber-500 outline-none"
                >
                  <option value="">-- None --</option>
                  {['Beckett', 'JSA', 'PSA', 'ACOA', 'Upper Deck', 'Fanatics', 'Tristar', 'Steiner', 'Schwartz', 'Other'].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Cert #</label>
                <input
                  type="text"
                  value={draft.cert_number}
                  onChange={e => updateField('cert_number', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={draft.quantity}
                  onChange={e => updateField('quantity', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Acquisition Date</label>
                <input
                  type="date"
                  value={draft.purchase_date}
                  onChange={e => updateField('purchase_date', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section: VineScout & Amazon Vine Link */}
          <div className="p-3 bg-slate-950/50 border border-teal-800/40 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <h3 className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-teal-400" /> VineScout Link
              </h3>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(draft.is_vinescout)}
                  onChange={e => updateField('is_vinescout', e.target.checked)}
                  className="rounded border-slate-700 text-teal-500 focus:ring-teal-400 h-3 w-3"
                />
                <span className="text-[10px] font-semibold text-slate-300">VScout Item</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold flex items-center justify-between">
                  <span>ASIN</span>
                  {draft.asin && (
                    <a
                      href={`https://www.amazon.com/dp/${draft.asin.trim().toUpperCase()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-teal-400 hover:text-teal-300"
                    >
                      Open ↗
                    </a>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="e.g. B0GQ4KD8C5"
                  value={draft.asin || ''}
                  onChange={e => {
                    const val = e.target.value.trim().toUpperCase();
                    updateField('asin', val);
                    if (val && !draft.is_vinescout) updateField('is_vinescout', true);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-teal-300 focus:border-teal-500 outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Order ID</label>
                <input
                  type="text"
                  placeholder="e.g. 111-2345678-9876543"
                  value={draft.order_id || ''}
                  onChange={e => {
                    const val = e.target.value.trim();
                    updateField('order_id', val);
                    if (val && !draft.is_vinescout) updateField('is_vinescout', true);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:border-teal-500 outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">ETV ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={draft.etv || ''}
                  onChange={e => updateField('etv', e.target.value)}
                  onBlur={() => updateField('etv', formatDec2(draft.etv))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:border-teal-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold flex items-center justify-between">
                  <span>Tax Cost ($)</span>
                  {draft.tax_cost && Number(draft.tax_cost) > 0 && (
                    <button
                      type="button"
                      onClick={() => updateField('true_total_cost', formatDec2(draft.tax_cost))}
                      className="text-[9px] text-amber-400 hover:text-amber-300 underline"
                      title="Set as Cost Basis"
                    >
                      Use as Cost
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={draft.tax_cost || ''}
                  onChange={e => updateField('tax_cost', e.target.value)}
                  onBlur={() => updateField('tax_cost', formatDec2(draft.tax_cost))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-emerald-400 focus:border-teal-500 outline-none font-mono font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Pricing & eBay Listing Metadata */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-800/80 pb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" /> Pricing &amp; eBay Settings
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Status</label>
                <select
                  value={draft.status}
                  onChange={e => updateField('status', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Listing Format</label>
                <select
                  value={draft.listing_format}
                  onChange={e => updateField('listing_format', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  {LISTING_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Platform</label>
                <select
                  value={draft.platform}
                  onChange={e => updateField('platform', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Current List Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draft.current_list_price}
                  onChange={e => updateField('current_list_price', e.target.value)}
                  onBlur={() => updateField('current_list_price', formatDec2(draft.current_list_price))}
                  className="w-full bg-slate-900 border border-amber-500/60 rounded-lg p-2 text-xs text-amber-300 font-bold focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Buy It Now ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draft.buy_it_now_price}
                  onChange={e => updateField('buy_it_now_price', e.target.value)}
                  onBlur={() => updateField('buy_it_now_price', formatDec2(draft.buy_it_now_price))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Floor Price Override ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draft.floor_price}
                  onChange={e => updateField('floor_price', e.target.value)}
                  onBlur={() => updateField('floor_price', formatDec2(draft.floor_price))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-cyan-400 focus:border-amber-500 outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Landed COGS ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draft.true_total_cost}
                  onChange={e => updateField('true_total_cost', e.target.value)}
                  onBlur={() => updateField('true_total_cost', formatDec2(draft.true_total_cost))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Est Shipping ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draft.est_shipping_cost}
                  onChange={e => updateField('est_shipping_cost', e.target.value)}
                  onBlur={() => updateField('est_shipping_cost', formatDec2(draft.est_shipping_cost))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span>Promoted Rate (%)</span>
                    {draft.ebay_listing_id && <Lock className="w-2.5 h-2.5 text-amber-400" title="Locked - Synced from eBay" />}
                  </span>
                  {draft.ebay_listing_id && <span className="text-[9px] text-slate-500 font-normal">Synced from eBay</span>}
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 5.0"
                  value={draft.ebay_promoted_rate}
                  onChange={e => updateField('ebay_promoted_rate', e.target.value)}
                  disabled={Boolean(draft.ebay_listing_id)}
                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono ${
                    draft.ebay_listing_id ? 'bg-slate-900/60 text-slate-400 cursor-not-allowed opacity-80' : ''
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">eBay Listing ID</label>
              <input
                type="text"
                placeholder="e.g. 386123456789"
                value={draft.ebay_listing_id}
                onChange={e => updateField('ebay_listing_id', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono"
              />
            </div>
          </div>

          {/* Section 3: Market Comps */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Market Comps
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAutoFetchComps}
                  disabled={fetchingLive}
                  className="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-[10px] font-bold flex items-center gap-1 transition-all"
                >
                  {fetchingLive ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Auto-Fetch Sold
                </button>
                <a
                  href={buildEbaySearchUrl(draft.item_name, draft.athlete_person, draft.authenticator)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[10px] font-medium flex items-center gap-1 transition-all"
                >
                  <ExternalLink className="w-3 h-3" /> eBay
                </a>
              </div>
            </div>

            {fetchMsg && (
              <div className={`p-2 rounded-lg text-[10px] leading-tight flex items-start gap-1.5 ${
                fetchMsg.type === 'success' ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : fetchMsg.type === 'error' ? 'bg-red-950/60 border border-red-500/40 text-red-300'
                    : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              }`}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{fetchMsg.text}</span>
              </div>
            )}

            {/* Historical Sold Comps */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Historical Sold Comps ($)
              </span>
              <div className="grid grid-cols-3 gap-2">
                {['comp_1', 'comp_2', 'comp_3'].map((c, i) => (
                  <input
                    key={c}
                    type="number"
                    step="0.01"
                    placeholder={`Sold #${i + 1}`}
                    value={draft[c]}
                    onChange={e => updateField(c, e.target.value)}
                    onBlur={() => updateField(c, formatDec2(draft[c]))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-amber-500 outline-none font-mono text-center"
                  />
                ))}
              </div>
            </div>

            {/* Active Listing Comps */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                Active Listing Comps ($)
              </span>
              <div className="grid grid-cols-3 gap-2">
                {['active_comp_1', 'active_comp_2', 'active_comp_3'].map((c, i) => (
                  <input
                    key={c}
                    type="number"
                    step="0.01"
                    placeholder={`Active #${i + 1}`}
                    value={draft[c]}
                    onChange={e => updateField(c, e.target.value)}
                    onBlur={() => updateField(c, formatDec2(draft[c]))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:border-blue-500 outline-none font-mono text-center"
                  />
                ))}
              </div>
            </div>

            {/* Target Price */}
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Recommended / Target Price ($)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={draft.recommended_list_price}
                  onChange={e => updateField('recommended_list_price', e.target.value)}
                  onBlur={() => updateField('recommended_list_price', formatDec2(draft.recommended_list_price))}
                  className="flex-1 bg-slate-900 border border-amber-500/60 rounded-lg p-2 text-xs text-amber-300 font-bold focus:border-amber-500 outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => updateField('current_list_price', draft.recommended_list_price)}
                  disabled={!draft.recommended_list_price}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold disabled:opacity-40 transition-all"
                  title="Apply recommended price to list price"
                >
                  Apply to Item
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Sticky Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenCopyModal && onOpenCopyModal(item)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Listing Copy</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all ${
                saveSuccess
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
