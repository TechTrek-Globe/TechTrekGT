import React, { useState } from 'react';
import {
  ChevronDown, ChevronRight, Zap, Loader2,
  Save, CheckCircle2, ArrowUpRight, ExternalLink, Copy, AlertCircle
} from 'lucide-react';
import { saveComp, fetchLiveComps } from '../../utils/auctionApi';
import { fmtCurrency, roundPrice } from '../../utils/formulaPreview';
import { buildEbaySearchUrl } from '../../utils/ebaySearch';

/**
 * PricingDrawer - Collapsible inline pricing panel beneath each inventory table row.
 * Shows comp inputs, eBay auto-fetch, break-even floor, and apply-to-item action.
 * Collapsed by default; expands on user click.
 */
export function PricingDrawer({ item, colSpan, isOpen, onClose, onItemUpdated, onOpenCopyModal, onOpenQueryEdit }) {
  const initDraft = () => ({
    comp_1: item.comp_1 !== null && item.comp_1 !== undefined ? roundPrice(item.comp_1) : '',
    comp_2: item.comp_2 !== null && item.comp_2 !== undefined ? roundPrice(item.comp_2) : '',
    comp_3: item.comp_3 !== null && item.comp_3 !== undefined ? roundPrice(item.comp_3) : '',
    live_avg: item.live_avg !== null && item.live_avg !== undefined ? roundPrice(item.live_avg) : null,
    recommended_list_price: roundPrice(item.recommended_list_price || item.current_list_price || item.suggested_list_price || ''),
    saving: false,
    applied: false,
    fetchingLive: false,
    fetchMsg: null,
  });

  const [draft, setDraft] = useState(initDraft);

  // Sync draft if item changes when opened
  React.useEffect(() => {
    if (isOpen) setDraft(initDraft());
  }, [isOpen, item.id]);

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
        live_avg: draft.live_avg === null || draft.live_avg === '' ? null : Number(draft.live_avg),
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
          live_avg: res.live_avg !== null && res.live_avg !== undefined ? roundPrice(res.live_avg) : prev.live_avg,
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

  if (!isOpen) return null;

  return (
    <tr className="border-b border-amber-500/20 bg-slate-900/90 shadow-inner">
      <td colSpan={colSpan} className="px-4 py-2.5">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400">Pricing & Market Comps</span>
            <span className="text-[10px] text-slate-400 truncate max-w-md">for {item.item_name}</span>
          </div>
          <button
            onClick={onClose}
            className="text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Close ✕
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">

              {/* eBay + Listing Copy actions */}
              <div className="lg:col-span-3 space-y-1.5">
                {!draft.fetchingLive ? (
                  <button
                    type="button"
                    onClick={handlePrepareSearch}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 hover:border-amber-500/60 transition-all"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Auto-Fetch Sold Comps
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/40">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    Scanning eBay...
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <a
                    href={buildEbaySearchUrl(item.item_name, item.athlete_person, item.authenticator)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-blue-300/80 hover:text-blue-200 bg-blue-950/20 hover:bg-blue-900/30 border border-blue-500/20 transition-all"
                  >
                    <ExternalLink className="w-2.5 h-2.5" /> eBay Comps
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenCopyModal(item)}
                    className="flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-amber-300/90 hover:text-amber-200 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-500/20 transition-all"
                  >
                    <Copy className="w-2.5 h-2.5" /> Copy
                  </button>
                </div>

                {draft.fetchMsg && (
                  <div className={`p-1.5 rounded-md text-[10px] flex items-start gap-1 leading-tight ${
                    draft.fetchMsg.type === 'success'
                      ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                      : draft.fetchMsg.type === 'error'
                        ? 'bg-red-950/60 border border-red-500/40 text-red-300'
                        : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
                  }`}>
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{draft.fetchMsg.text}</span>
                  </div>
                )}
              </div>

              {/* 3 Comp inputs */}
              <div className="lg:col-span-5 grid grid-cols-3 gap-2">
                {['comp_1', 'comp_2', 'comp_3'].map((field, i) => (
                  <div key={field}>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Comp #{i + 1} ($)</label>
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

              {/* Avg + Target + Actions */}
              <div className="lg:col-span-4 flex items-center gap-3 bg-slate-900/60 rounded-xl px-3 py-2 border border-slate-800">
                {/* Comp avg */}
                <div>
                  <span className="text-[10px] text-slate-400">Comp Avg</span>
                  <p className="text-sm font-black text-amber-400">{liveAvg ? fmtCurrency(liveAvg) : '--'}</p>
                </div>

                {/* Break-even */}
                <div>
                  <span className="text-[10px] text-slate-400">Floor</span>
                  <p className="text-sm font-black text-cyan-400">{fmtCurrency(item.min_sell_price)}</p>
                </div>

                {/* Target price */}
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-slate-300 mb-0.5">Target Price</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={draft.recommended_list_price}
                      onChange={e => updateDraft('recommended_list_price', e.target.value)}
                      className="input-field py-1 pl-6 pr-2 text-xs font-bold text-white w-full"
                    />
                  </div>
                  {floorDiff !== null && (
                    <p className={`text-[9px] mt-0.5 font-semibold ${floorDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {floorDiff >= 0 ? '+' : ''}{fmtCurrency(floorDiff)} spread
                    </p>
                  )}
                </div>

                {/* Save / Apply buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleSave(false)}
                    disabled={draft.saving}
                    title="Save comps to DB"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center justify-center"
                  >
                    {draft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={draft.saving || !draft.recommended_list_price}
                    title="Apply target price to item"
                    className={`p-1.5 rounded-lg text-xs flex items-center justify-center transition-all ${
                      draft.applied
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {draft.applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

            </div>
          </td>
        </tr>
  );
}
