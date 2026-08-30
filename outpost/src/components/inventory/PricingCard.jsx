import React, { useState } from 'react';
import { ExternalLink, Copy, AlertCircle, Loader2, Save, CheckCircle2, ArrowUpRight, Zap } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { cleanItemDescription, cleanAthleteName } from '../../utils/spreadsheetParser';
import { fmtCurrency, roundPrice } from '../../utils/formulaPreview';
import { buildEbaySearchUrl } from '../../utils/ebaySearch';
import { saveComp, fetchLiveComps } from '../../utils/auctionApi';

export function PricingCard({ item, onOpenCopyModal, onOpenQueryEdit, onItemUpdated }) {
  const initDraft = () => ({
    comp_1: item.comp_1 !== null && item.comp_1 !== undefined ? roundPrice(item.comp_1) : '',
    comp_2: item.comp_2 !== null && item.comp_2 !== undefined ? roundPrice(item.comp_2) : '',
    comp_3: item.comp_3 !== null && item.comp_3 !== undefined ? roundPrice(item.comp_3) : '',
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
        recommended_list_price: draft.recommended_list_price === '' ? null : Number(draft.recommended_list_price),
        apply_to_item: applyToItem
      });
      setDraft(prev => ({ ...prev, saving: false, applied: applyToItem }));
      if (applyToItem && draft.recommended_list_price) {
        onItemUpdated(item.id, { current_list_price: Number(draft.recommended_list_price) });
      }
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      setDraft(prev => ({ ...prev, saving: false }));
    }
  };

  const handlePrepareSearch = () => {
    onOpenQueryEdit(item, (confirmedQuery) => handleConfirmSearch(confirmedQuery));
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
          fetchMsg: { type: 'success', text: `Found ${res.count} sold comps on eBay! Avg: ${fmtCurrency(res.live_avg)}` },
          applied: false,
        }));
      } else {
        setDraft(prev => ({
          ...prev,
          fetchingLive: false,
          fetchMsg: { type: 'info', text: 'No comps found. Try editing the search term or click eBay Comps.' }
        }));
      }
    } catch (err) {
      setDraft(prev => ({
        ...prev,
        fetchingLive: false,
        fetchMsg: { type: 'error', text: err.message || 'Auto-fetch error. Click eBay Comps to view sold listings.' }
      }));
    }
  };

  const vals = [draft.comp_1, draft.comp_2, draft.comp_3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
  const liveAvg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const floorDiff = draft.recommended_list_price && item.min_sell_price
    ? (Number(draft.recommended_list_price) - item.min_sell_price)
    : null;

  return (
    <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden flex flex-col transition-all hover:border-slate-700">
      {/* Header */}
      <div className="p-3 border-b border-slate-800/60 bg-slate-900/40 relative">
        <div className="flex gap-3">
          {/* Image */}
          <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {item.image_url ? (
              <img src={item.image_url} alt="Item" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <span className="text-[10px] text-slate-600 font-medium">No Img</span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h3 className="text-sm font-bold text-white leading-tight truncate">
              {cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
            </h3>
            {item.athlete_person && (
              <p className="text-xs text-amber-400 mt-0.5 truncate font-medium">
                {cleanAthleteName(item.athlete_person)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={item.status} />
              {item.authenticator && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300">
                  {item.authenticator} {item.cert_number}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-3">
        {/* eBay auto-fetch & Links */}
        <div className="flex flex-col gap-1.5">
          {!draft.fetchingLive ? (
            <button
              type="button"
              onClick={handlePrepareSearch}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Auto-Fetch Sold Comps
            </button>
          ) : (
            <div className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/40">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              Scanning eBay...
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <a
              href={buildEbaySearchUrl(item.item_name, item.athlete_person, item.authenticator)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-blue-300/80 hover:text-blue-200 bg-blue-950/20 hover:bg-blue-900/30 border border-blue-500/20 transition-all truncate"
            >
              <ExternalLink className="w-2.5 h-2.5" /> eBay Comps
            </a>
            <button
              type="button"
              onClick={() => onOpenCopyModal(item)}
              className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-amber-300/90 hover:text-amber-200 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-500/20 transition-all"
            >
              <Copy className="w-2.5 h-2.5" /> Listing Copy
            </button>
          </div>
          {draft.fetchMsg && (
            <div className={`p-2 rounded-lg text-[10px] leading-tight flex items-start gap-1 ${
              draft.fetchMsg.type === 'success' ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                : draft.fetchMsg.type === 'error' ? 'bg-red-950/60 border border-red-500/40 text-red-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
            }`}>
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{draft.fetchMsg.text}</span>
            </div>
          )}
        </div>

        {/* 3 Comp Inputs */}
        <div className="grid grid-cols-3 gap-2 mt-auto">
          {['comp_1', 'comp_2', 'comp_3'].map((field, i) => (
            <div key={field}>
              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Comp #{i + 1} ($)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={draft[field]}
                onChange={e => updateDraft(field, e.target.value)}
                className="input-field py-1 px-2 text-xs font-mono text-center"
              />
            </div>
          ))}
        </div>

        {/* Average & Target Price */}
        <div className="flex items-center justify-between gap-3 bg-slate-900/40 rounded-xl p-2.5 border border-slate-800">
          <div className="relative group">
            <span className="text-[10px] text-slate-400 cursor-help">Comp Avg:</span>
            <p className="text-sm font-black text-amber-400">
              {liveAvg ? fmtCurrency(liveAvg) : '--'}
            </p>
          </div>

          <div className="w-28 relative group">
            <label className="block text-[10px] font-bold text-slate-300 mb-0.5 cursor-help">Target Price</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={draft.recommended_list_price}
                onChange={e => updateDraft('recommended_list_price', e.target.value)}
                className="input-field py-1 pl-6 pr-2 text-xs font-bold text-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <button
              onClick={() => handleSave(false)}
              disabled={draft.saving}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center justify-center gap-1"
              title="Save Comps to DB"
            >
              {draft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={draft.saving || !draft.recommended_list_price}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                draft.applied
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
              }`}
              title="Apply Target Price to Item List Price"
            >
              {draft.applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Floor Indicator */}
      {floorDiff !== null && (
        <div className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-slate-900/30 border-t border-slate-800/40 text-slate-400">
          <span>
            Spread over Floor: <strong className={floorDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}>{floorDiff >= 0 ? '+' : ''}{fmtCurrency(floorDiff)}</strong>
          </span>
          {draft.recommended_list_price && item.true_total_cost > 0 && (
            <span>
              Margin: <strong className="text-amber-400">{Math.round(((Number(draft.recommended_list_price) - item.true_total_cost) / Number(draft.recommended_list_price)) * 100)}%</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
