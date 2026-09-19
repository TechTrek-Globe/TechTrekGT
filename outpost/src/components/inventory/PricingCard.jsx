import React, { useState } from 'react';
import { ExternalLink, Copy, AlertCircle, Loader2, Save, CheckCircle2, ArrowUpRight, Zap, Edit3, ShoppingBag, ShieldCheck } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { MarginHealthBadge } from './MarginHealthBadge';
import { cleanItemDescription, cleanAthleteName } from '../../utils/spreadsheetParser';
import { fmtCurrency, roundPrice } from '../../utils/formulaPreview';
import { buildEbaySearchUrl } from '../../utils/ebaySearch';
import { saveComp, fetchLiveComps } from '../../utils/auctionApi';
import { FeeBreakdownPanel } from './FeeBreakdownPanel';
import { computeFeeBreakdown } from '../../utils/feeEngine';

function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  return trimmed;
}

export function PricingCard({
  item,
  onOpenCopyModal,
  onOpenQueryEdit,
  onItemUpdated,
  onOpenQuickEdit,
  onOpenListingIdModal,
  onOpenEditModal
}) {
  const [imgError, setImgError] = useState(false);
  const imageUrl = normalizeHttps(item.image_url);

  const initDraft = () => ({
    comp_1: item.comp_1 !== null && item.comp_1 !== undefined ? roundPrice(item.comp_1) : '',
    comp_2: item.comp_2 !== null && item.comp_2 !== undefined ? roundPrice(item.comp_2) : '',
    comp_3: item.comp_3 !== null && item.comp_3 !== undefined ? roundPrice(item.comp_3) : '',
    active_comp_1: item.active_comp_1 !== null && item.active_comp_1 !== undefined ? roundPrice(item.active_comp_1) : '',
    active_comp_2: item.active_comp_2 !== null && item.active_comp_2 !== undefined ? roundPrice(item.active_comp_2) : '',
    active_comp_3: item.active_comp_3 !== null && item.active_comp_3 !== undefined ? roundPrice(item.active_comp_3) : '',
    recommended_list_price: roundPrice(item.recommended_list_price || item.current_list_price || item.suggested_list_price || ''),
    saving: false,
    applied: false,
    fetchingLive: false,
    fetchMsg: null,
  });

  const [draft, setDraft] = useState(initDraft);

  const updateDraft = (field, value) => {
    setDraft(prev => {
      const updated = { ...prev, [field]: value, applied: false };
      if (field.startsWith('comp_')) {
        const c1 = field === 'comp_1' ? value : prev.comp_1;
        const c2 = field === 'comp_2' ? value : prev.comp_2;
        const c3 = field === 'comp_3' ? value : prev.comp_3;
        const vals = [c1, c2, c3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
        if (vals.length > 0) {
          updated.recommended_list_price = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        }
      }
      return updated;
    });
  };

  const handleSave = async (applyToItem = false) => {
    setDraft(prev => ({ ...prev, saving: true }));
    try {
      await saveComp({
        item_id: item.id,
        comp_1: draft.comp_1 === '' ? null : Number(draft.comp_1),
        comp_2: draft.comp_2 === '' ? null : Number(draft.comp_2),
        comp_3: draft.comp_3 === '' ? null : Number(draft.comp_3),
        active_comp_1: draft.active_comp_1 === '' ? null : Number(draft.active_comp_1),
        active_comp_2: draft.active_comp_2 === '' ? null : Number(draft.active_comp_2),
        active_comp_3: draft.active_comp_3 === '' ? null : Number(draft.active_comp_3),
        recommended_list_price: draft.recommended_list_price === '' ? null : Number(draft.recommended_list_price),
        apply_to_item: applyToItem
      });
      setDraft(prev => ({ ...prev, saving: false, applied: applyToItem }));
      if (onItemUpdated) {
        const patch = {
          comp_1: draft.comp_1,
          comp_2: draft.comp_2,
          comp_3: draft.comp_3,
          active_comp_1: draft.active_comp_1,
          active_comp_2: draft.active_comp_2,
          active_comp_3: draft.active_comp_3,
          recommended_list_price: draft.recommended_list_price
        };
        if (applyToItem && draft.recommended_list_price) {
          patch.current_list_price = Number(draft.recommended_list_price);
        }
        onItemUpdated(item.id, patch);
      }
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      setDraft(prev => ({ ...prev, saving: false }));
    }
  };

  const handlePrepareSearch = () => {
    if (onOpenQueryEdit) {
      onOpenQueryEdit(item, (confirmedQuery) => handleConfirmSearch(confirmedQuery));
    }
  };

  const handleConfirmSearch = async (query) => {
    setDraft(prev => ({ ...prev, fetchingLive: true, fetchMsg: null }));
    try {
      const res = await fetchLiveComps(query, item.id);
      if (res && res.success && res.count > 0) {
        setDraft(prev => ({
          ...prev,
          comp_1: res.comp_1 !== null && res.comp_1 !== undefined ? roundPrice(res.comp_1) : prev.comp_1,
          comp_2: res.comp_2 !== null && res.comp_2 !== undefined ? roundPrice(res.comp_2) : prev.comp_2,
          comp_3: res.comp_3 !== null && res.comp_3 !== undefined ? roundPrice(res.comp_3) : prev.comp_3,
          recommended_list_price: roundPrice(res.live_avg || res.median || prev.recommended_list_price),
          fetchingLive: false,
          fetchMsg: { type: 'success', text: `Found ${res.count} sold comps! Avg: ${fmtCurrency(res.live_avg)}` },
          applied: false,
        }));
      } else {
        setDraft(prev => ({
          ...prev,
          fetchingLive: false,
          fetchMsg: { type: 'info', text: 'No comps found. Try clicking eBay Comps directly.' }
        }));
      }
    } catch (err) {
      setDraft(prev => ({
        ...prev,
        fetchingLive: false,
        fetchMsg: { type: 'error', text: err.message || 'Auto-fetch error.' }
      }));
    }
  };

  const soldVals = [draft.comp_1, draft.comp_2, draft.comp_3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  const soldAvg = soldVals.length > 0 ? soldVals.reduce((a, b) => a + b, 0) / soldVals.length : null;

  const activeVals = [draft.active_comp_1, draft.active_comp_2, draft.active_comp_3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  const activeAvg = activeVals.length > 0 ? activeVals.reduce((a, b) => a + b, 0) / activeVals.length : null;

  const breakdown = computeFeeBreakdown({
    ...item,
    sellPrice: draft.recommended_list_price || item.current_list_price
  });

  return (
    <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden flex flex-col transition-all hover:border-slate-700 bg-slate-900/60">
      {/* Header */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-950/40 relative">
        <div className="flex gap-3">
          {/* Image */}
          <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {imageUrl && !imgError ? (
              <img
                src={imageUrl}
                alt="Item"
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : (
              <span className="text-[9px] text-slate-600 font-medium">No Img</span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h3
              onClick={() => (onOpenEditModal ? onOpenEditModal(item) : (onOpenQuickEdit && onOpenQuickEdit(item)))}
              className="text-xs font-bold text-white leading-tight truncate hover:text-amber-400 hover:underline cursor-pointer transition-colors"
              title="Click to view & edit full item details"
            >
              {cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
            </h3>
            {item.athlete_person && (
              <p className="text-[11px] text-amber-400 mt-0.5 truncate font-medium">
                {cleanAthleteName(item.athlete_person)}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <StatusBadge status={item.status} />
              {item.sku && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700/60">
                  {item.sku}
                </span>
              )}
              {item.authenticator && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-flex items-center gap-1 ${
                  item.cert_verified
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-300'
                }`} title={item.cert_verified ? `Verified Certificate: ${item.authenticator} ${item.cert_number || ''}` : undefined}>
                  {item.cert_verified && <ShieldCheck className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />}
                  <span>{item.authenticator} {item.cert_number}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Edit trigger */}
          <button
            onClick={() => (onOpenEditModal ? onOpenEditModal(item) : (onOpenQuickEdit && onOpenQuickEdit(item)))}
            className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
            title="Open Item Details & Quick Edit"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-3">
        {/* eBay Quick Actions */}
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {!draft.fetchingLive ? (
              <button
                type="button"
                onClick={handlePrepareSearch}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 transition-all truncate"
              >
                <Zap className="w-3 h-3 text-amber-400" /> Auto-Fetch Comps
              </button>
            ) : (
              <div className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-amber-300 bg-amber-950/40 border border-amber-500/40 truncate">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" /> Scanning...
              </div>
            )}

            <a
              href={buildEbaySearchUrl(item.item_name, item.athlete_person, item.authenticator)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-blue-300/90 hover:text-blue-200 bg-blue-950/30 hover:bg-blue-900/40 border border-blue-500/30 transition-all truncate"
            >
              <ExternalLink className="w-3 h-3" /> eBay Comps
            </a>
          </div>

          {draft.fetchMsg && (
            <div className={`p-1.5 rounded-lg text-[10px] leading-tight flex items-start gap-1 ${
              draft.fetchMsg.type === 'success' ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                : draft.fetchMsg.type === 'error' ? 'bg-red-950/60 border border-red-500/40 text-red-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
            }`}>
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{draft.fetchMsg.text}</span>
            </div>
          )}
        </div>

        {/* Historical Sold Comps (1-3) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-400">Sold Comps</span>
            <span className="text-[10px] font-bold text-amber-400">Avg: {soldAvg ? fmtCurrency(soldAvg) : '--'}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {['comp_1', 'comp_2', 'comp_3'].map((field, i) => (
              <input
                key={field}
                type="number"
                step="0.01"
                placeholder={`Sold #${i + 1}`}
                value={draft[field]}
                onChange={e => updateDraft(field, e.target.value)}
                className="bg-slate-950/80 border border-slate-700/80 rounded-lg p-1 text-xs font-mono text-center text-white focus:border-amber-500 outline-none"
              />
            ))}
          </div>
        </div>

        {/* Active Comps (1-3) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-400">Active Comps</span>
            <span className="text-[10px] font-bold text-blue-400">Avg: {activeAvg ? fmtCurrency(activeAvg) : '--'}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {['active_comp_1', 'active_comp_2', 'active_comp_3'].map((field, i) => (
              <input
                key={field}
                type="number"
                step="0.01"
                placeholder={`Active #${i + 1}`}
                value={draft[field]}
                onChange={e => updateDraft(field, e.target.value)}
                className="bg-slate-950/80 border border-slate-700/80 rounded-lg p-1 text-xs font-mono text-center text-white focus:border-blue-500 outline-none"
              />
            ))}
          </div>
        </div>

        {/* Fee & Margin Mini Summary */}
        <FeeBreakdownPanel item={item} customPrice={draft.recommended_list_price} compact={true} />

        {/* Target Price & Action Row */}
        <div className="flex items-center justify-between gap-2 bg-slate-950/80 rounded-xl p-2 border border-slate-800 mt-auto">
          <div className="flex-1 min-w-0">
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Target Price</label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={draft.recommended_list_price}
                onChange={e => updateDraft('recommended_list_price', e.target.value)}
                className="w-full bg-slate-900 border border-amber-500/60 rounded-lg pl-5 pr-1.5 py-0.5 text-xs font-bold text-amber-300 outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 self-end">
            <button
              onClick={() => handleSave(false)}
              disabled={draft.saving}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center justify-center"
              title="Save comps to DB"
            >
              {draft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => handleSave(true)}
              disabled={draft.saving || !draft.recommended_list_price}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                draft.applied
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
              }`}
              title="Apply target price to item list price"
            >
              {draft.applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
