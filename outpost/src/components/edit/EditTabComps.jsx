import React from 'react';
import {
  TrendingUp, Zap, ExternalLink, Loader2, CheckCircle2,
  ArrowUpRight, DollarSign, Layers
} from 'lucide-react';
import { buildEbaySearchUrl } from '../../utils/ebaySearch';
import { fmtCurrency } from '../../utils/formulaPreview';

export function EditTabComps({
  form,
  compsDraft,
  updateCompDraft,
  handleFetchLiveComps,
  handleSaveComps,
  minSellPrice
}) {
  const soldVals = [compsDraft.comp_1, compsDraft.comp_2, compsDraft.comp_3]
    .filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0)
    .map(Number);
  const soldAvg = soldVals.length > 0 ? soldVals.reduce((a, b) => a + b, 0) / soldVals.length : null;

  const activeVals = [compsDraft.active_comp_1, compsDraft.active_comp_2, compsDraft.active_comp_3]
    .filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0)
    .map(Number);
  const activeAvg = activeVals.length > 0 ? activeVals.reduce((a, b) => a + b, 0) / activeVals.length : null;

  const effectiveFloor = parseFloat(form.floor_price) || parseFloat(minSellPrice) || null;
  const floorSpread = compsDraft.recommended_list_price && effectiveFloor
    ? Number(compsDraft.recommended_list_price) - effectiveFloor
    : null;

  const ebaySearchUrl = buildEbaySearchUrl(
    form.item_name,
    form.athlete_person,
    form.authenticator
  );

  return (
    <div className="space-y-4">
      {/* Live Comps Intelligence Auto-Fetch Header */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Live Sold Comps Intelligence</span>
          </div>
          <a
            href={ebaySearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Search Live on eBay ↗
          </a>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={compsDraft.fetchingLive}
            onClick={handleFetchLiveComps}
            className="px-3.5 py-2 text-xs rounded-xl font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {compsDraft.fetchingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            <span>{compsDraft.fetchingLive ? 'Fetching eBay Marketplace Comps...' : 'Auto-Fetch eBay Sold Comps'}</span>
          </button>
          <span className="text-[11px] text-slate-400">
            Queries recent completed sold transactions matching title, signer & cert
          </span>
        </div>

        {compsDraft.fetchMsg && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            compsDraft.fetchMsg.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
              : compsDraft.fetchMsg.type === 'error'
              ? 'bg-red-950/40 border border-red-500/30 text-red-300'
              : 'bg-slate-900 border border-slate-800 text-slate-300'
          }`}>
            {compsDraft.fetchMsg.text}
          </div>
        )}
      </div>

      {/* 3 Sold Comps */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
          Recent Sold Comps ($)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(num => (
            <div key={`comp_${num}`}>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Sold Comp #{num}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={compsDraft[`comp_${num}`] ?? ''}
                  onChange={e => updateCompDraft(`comp_${num}`, e.target.value)}
                  className="input-field text-xs pl-8 font-mono font-bold text-amber-300"
                  placeholder="0.00"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 Active Comps */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
          Active Listing Comps ($)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(num => (
            <div key={`active_comp_${num}`}>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Active Comp #{num}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={compsDraft[`active_comp_${num}`] ?? ''}
                  onChange={e => updateCompDraft(`active_comp_${num}`, e.target.value)}
                  className="input-field text-xs pl-8 font-mono font-semibold text-cyan-300"
                  placeholder="0.00"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Valuation Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Sold Average</span>
          <p className="text-sm font-black text-amber-400 mt-0.5 font-mono">
            {soldAvg ? fmtCurrency(soldAvg) : '--'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Average</span>
          <p className="text-sm font-black text-cyan-400 mt-0.5 font-mono">
            {activeAvg ? fmtCurrency(activeAvg) : '--'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Min Floor Price</span>
          <p className="text-sm font-black text-emerald-400 mt-0.5 font-mono">
            {effectiveFloor ? fmtCurrency(effectiveFloor) : '--'}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Spread Over Floor</span>
          <p className={`text-sm font-black mt-0.5 font-mono ${
            floorSpread != null
              ? floorSpread >= 0 ? 'text-emerald-400' : 'text-red-400'
              : 'text-slate-500'
          }`}>
            {floorSpread != null ? fmtCurrency(floorSpread) : '--'}
          </p>
        </div>
      </div>

      {/* Recommended Target Price Card with Actions */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-amber-300">Recommended List Price (Comps Target)</span>
          </div>
          <span className="text-[11px] text-amber-400/80">Suggested asking price based on research</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[140px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-xs font-bold pointer-events-none">$</span>
            <input
              type="number"
              step="0.01"
              value={compsDraft.recommended_list_price ?? ''}
              onChange={e => updateCompDraft('recommended_list_price', e.target.value)}
              className="input-field text-sm pl-8 font-black text-amber-400 font-mono bg-slate-900 border-amber-500/40"
              placeholder="0.00"
            />
          </div>

          <button
            type="button"
            disabled={compsDraft.saving || !compsDraft.recommended_list_price}
            onClick={() => handleSaveComps(false)}
            className="px-3.5 py-2 text-xs rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {compsDraft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Comps'}
          </button>

          <button
            type="button"
            disabled={compsDraft.saving || !compsDraft.recommended_list_price}
            onClick={() => handleSaveComps(true)}
            className={`px-3.5 py-2 text-xs rounded-xl font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 ${
              compsDraft.applied
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
            }`}
          >
            {compsDraft.applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            <span>{compsDraft.applied ? 'Applied to Item!' : 'Apply to Listing'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
