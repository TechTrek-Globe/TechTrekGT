import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Search, ExternalLink, Save, CheckCircle2,
  AlertCircle, Loader2, RefreshCw, BarChart2, ShieldCheck,
  DollarSign, ArrowUpRight, Filter, Sparkles, SlidersHorizontal, Zap, Copy
} from 'lucide-react';
import { getComps, saveComp, updateItem, fetchLiveComps } from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { getCertVerificationUrl } from '../utils/certLookup';
import { ListingCopyModal } from './ListingCopyModal';

export function PricingIntelligenceView() {
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [copyModalItem, setCopyModalItem] = useState(null);
  
  // Local draft state for quick inputs: { [itemId]: { comp_1, comp_2, comp_3, rec_price, saving, applied } }
  const [drafts, setDrafts] = useState({});

  const fetchCompsData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getComps({ status: statusFilter === 'active' ? 'active' : undefined });
      const itemsList = res.comps || [];
      setComps(itemsList);

      // Populate draft inputs
      const initialDrafts = {};
      itemsList.forEach(item => {
        initialDrafts[item.item_id] = {
          comp_1: item.comp_1 !== null && item.comp_1 !== undefined ? item.comp_1 : '',
          comp_2: item.comp_2 !== null && item.comp_2 !== undefined ? item.comp_2 : '',
          comp_3: item.comp_3 !== null && item.comp_3 !== undefined ? item.comp_3 : '',
          recommended_list_price: item.recommended_list_price || item.current_list_price || item.suggested_list_price || '',
          saving: false,
          applied: false
        };
      });
      setDrafts(initialDrafts);
    } catch (err) {
      setError(err.message || 'Failed to load pricing intelligence data.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCompsData();
  }, [fetchCompsData]);

  const handleDraftChange = (itemId, field, value) => {
    setDrafts(prev => {
      const cur = prev[itemId] || { comp_1: '', comp_2: '', comp_3: '', recommended_list_price: '' };
      const updated = { ...cur, [field]: value, applied: false };

      // Auto compute average when comps change if recommended_list_price wasn't manually overridden
      if (field.startsWith('comp_')) {
        const c1 = field === 'comp_1' ? value : cur.comp_1;
        const c2 = field === 'comp_2' ? value : cur.comp_2;
        const c3 = field === 'comp_3' ? value : cur.comp_3;
        const vals = [c1, c2, c3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
        if (vals.length > 0) {
          const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          updated.recommended_list_price = avg;
        }
      }

      return { ...prev, [itemId]: updated };
    });
  };

  const handleSaveComp = async (item, applyToItem = false) => {
    const draft = drafts[item.item_id] || {};
    setDrafts(prev => ({
      ...prev,
      [item.item_id]: { ...draft, saving: true }
    }));

    try {
      await saveComp({
        item_id: item.item_id,
        comp_1: draft.comp_1 === '' ? null : Number(draft.comp_1),
        comp_2: draft.comp_2 === '' ? null : Number(draft.comp_2),
        comp_3: draft.comp_3 === '' ? null : Number(draft.comp_3),
        recommended_list_price: draft.recommended_list_price === '' ? null : Number(draft.recommended_list_price),
        apply_to_item: applyToItem
      });

      setDrafts(prev => ({
        ...prev,
        [item.item_id]: {
          ...draft,
          saving: false,
          applied: applyToItem
        }
      }));

      // Update local item row if applied
      if (applyToItem && draft.recommended_list_price) {
        setComps(prev => prev.map(c => c.item_id === item.item_id ? { ...c, current_list_price: Number(draft.recommended_list_price) } : c));
      }
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      setDrafts(prev => ({
        ...prev,
        [item.item_id]: { ...draft, saving: false }
      }));
    }
  };

  const handleAutoFetchLiveComps = async (item) => {
    const draft = drafts[item.item_id] || {};
    setDrafts(prev => ({
      ...prev,
      [item.item_id]: { ...draft, fetchingLive: true }
    }));

    try {
      const query = item.item_name || `${item.athlete_person || ''} ${item.category || ''} ${item.authenticator || ''}`.trim();
      const res = await fetchLiveComps(query, item.item_id);

      if (res && res.success) {
        setDrafts(prev => {
          const cur = prev[item.item_id] || {};
          const c1 = res.comp_1 !== null && res.comp_1 !== undefined ? res.comp_1 : cur.comp_1;
          const c2 = res.comp_2 !== null && res.comp_2 !== undefined ? res.comp_2 : cur.comp_2;
          const c3 = res.comp_3 !== null && res.comp_3 !== undefined ? res.comp_3 : cur.comp_3;
          const recPrice = res.live_avg || res.median || cur.recommended_list_price;

          return {
            ...prev,
            [item.item_id]: {
              ...cur,
              comp_1: c1,
              comp_2: c2,
              comp_3: c3,
              recommended_list_price: recPrice,
              fetchingLive: false,
              applied: false
            }
          };
        });

        if (res.ebay_search_url) {
          setComps(prev => prev.map(c => c.item_id === item.item_id ? { ...c, ebay_search_url: res.ebay_search_url } : c));
        }
      } else {
        setDrafts(prev => ({
          ...prev,
          [item.item_id]: { ...draft, fetchingLive: false }
        }));
      }
    } catch (err) {
      alert(`Auto-fetch error: ${err.message}`);
      setDrafts(prev => ({
        ...prev,
        [item.item_id]: { ...draft, fetchingLive: false }
      }));
    }
  };

  // Filter items
  const filteredComps = comps.filter(c => {
    const matchesSearch =
      !search ||
      c.item_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.athlete_person?.toLowerCase().includes(search.toLowerCase()) ||
      c.category?.toLowerCase().includes(search.toLowerCase()) ||
      c.cert_number?.toLowerCase().includes(search.toLowerCase()) ||
      c.authenticator?.toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === 'All' || c.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const categories = ['All', ...Array.from(new Set(comps.map(c => c.category).filter(Boolean)))];

  // Quick stats
  const totalItems = comps.length;
  const itemsWithComps = comps.filter(c => c.comp_1 > 0 || c.comp_2 > 0 || c.comp_3 > 0 || c.manual_avg > 0).length;
  const coveragePct = totalItems > 0 ? (itemsWithComps / totalItems) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
            Pricing Intelligence & Market Comps
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-reference live eBay sold comps, calculate market averages, and safeguard your profit margins
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-comps-btn"
            onClick={fetchCompsData}
            className="w-9 h-9 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all mr-1"
            title="Refresh Comps"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Overview Metric Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Inventory Monitored</p>
            <p className="text-2xl font-black text-white mt-1">{totalItems} <span className="text-xs font-normal text-slate-500">items</span></p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Market Comps Coverage</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{itemsWithComps} <span className="text-xs font-normal text-slate-500">/ {totalItems} ({Math.round(coveragePct)}%)</span></p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Comp Strategy</p>
            <p className="text-xs font-semibold text-slate-200 mt-1">3-Comp Median & Sold Valuation</p>
            <p className="text-[10px] text-slate-500">Automated query builder with eBay API sync</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold">
            <ExternalLink className="w-5 h-5" />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-card rounded-xl p-3 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by player, item title, or cert #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 py-1.5 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${statusFilter === 'active' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Active Stock
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${statusFilter === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All Items
            </button>
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="input-field py-1.5 px-3 text-xs w-auto"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comps List Table */}
      {loading && comps.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin text-amber-400 mb-2" />
          <p className="text-xs">Loading Pricing Comps...</p>
        </div>
      ) : filteredComps.length === 0 ? (
        <div className="p-12 text-center text-slate-500 glass-card rounded-2xl border border-slate-800">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold text-slate-400">No matching items found</p>
          <p className="text-xs text-slate-600 mt-1">Try clearing your search query or switching filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredComps.map(item => {
            const draft = drafts[item.item_id] || {
              comp_1: '', comp_2: '', comp_3: '',
              recommended_list_price: item.recommended_list_price || item.current_list_price || item.suggested_list_price || '',
              saving: false, applied: false
            };

            const vals = [draft.comp_1, draft.comp_2, draft.comp_3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map(Number);
            const liveAvg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
            const floorDiff = draft.recommended_list_price && item.min_sell_price ? (Number(draft.recommended_list_price) - item.min_sell_price) : null;

            return (
              <div
                key={item.item_id}
                className="glass-card rounded-2xl p-5 border border-slate-800/80 hover:border-amber-500/30 transition-all space-y-4"
              >
                {/* Item Top Info Bar */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {item.category || 'General'}
                      </span>
                      {item.authenticator && (
                        getCertVerificationUrl(item.authenticator, item.cert_number) ? (
                          <a
                            href={getCertVerificationUrl(item.authenticator, item.cert_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20 hover:text-blue-200 transition-colors flex items-center gap-1"
                            title={`Verify with ${item.authenticator} Database`}
                          >
                            <ShieldCheck className="w-3 h-3 text-blue-400" />
                            {item.authenticator} {item.cert_number ? `#${item.cert_number}` : ''}
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-blue-400" />
                            {item.authenticator} {item.cert_number ? `#${item.cert_number}` : ''}
                          </span>
                        )
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.status === 'Sold' ? 'bg-purple-500/10 text-purple-400' : item.status === 'Listed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                        {item.status}
                      </span>
                    </div>
                    <h3 className="text-base font-black text-slate-100 mt-1 truncate">{item.item_name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.athlete_person ? <span>Player: <strong className="text-slate-300">{item.athlete_person}</strong> · </span> : ''}
                      Invoice Ref: <span className="font-mono text-slate-300">{item.invoice_ref || 'N/A'}</span>
                    </p>
                  </div>

                  {/* Financial Safeguards */}
                  <div className="flex items-center gap-4 bg-slate-900/60 rounded-xl px-3.5 py-2 border border-slate-800">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">True Landed Cost</p>
                      <p className="text-xs font-black text-amber-400">{fmtCurrency(item.true_total_cost)}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Break-Even Floor</p>
                      <p className="text-xs font-black text-cyan-400">{fmtCurrency(item.min_sell_price)}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Active List Price</p>
                      <p className="text-xs font-black text-white">{item.current_list_price ? fmtCurrency(item.current_list_price) : 'Not Listed'}</p>
                    </div>
                  </div>
                </div>

                {/* Comps Inputs & Calculations */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* eBay Lookup & Live Auto-Fetch */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => handleAutoFetchLiveComps(item)}
                      disabled={draft.fetchingLive}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 hover:border-amber-500/60 transition-all shadow-sm disabled:opacity-50"
                      title="Automatically fetch real completed eBay sales and populate comps"
                    >
                      {draft.fetchingLive ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Scanning eBay...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          <span>Auto-Fetch Sold Comps</span>
                        </>
                      )}
                    </button>
                    <div className="grid grid-cols-2 gap-1.5">
                      <a
                        href={item.ebay_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-blue-300/80 hover:text-blue-200 bg-blue-950/20 hover:bg-blue-900/30 border border-blue-500/20 transition-all truncate"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>eBay Comps ↗</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setCopyModalItem({
                          item_name: item.item_name,
                          athlete_person: item.athlete_person,
                          category: item.category,
                          authenticator: item.authenticator,
                          cert_number: item.cert_number,
                          current_list_price: item.current_list_price || item.recommended_list_price
                        })}
                        className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-amber-300/90 hover:text-amber-200 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-500/20 transition-all"
                        title="Generate formatted multi-channel listing copy"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        <span>Listing Copy</span>
                      </button>
                    </div>
                  </div>

                  {/* 3 Comp Inputs */}
                  <div className="lg:col-span-5 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">Comp #1 ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={draft.comp_1}
                        onChange={e => handleDraftChange(item.item_id, 'comp_1', e.target.value)}
                        className="input-field py-1 px-2 text-xs font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">Comp #2 ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={draft.comp_2}
                        onChange={e => handleDraftChange(item.item_id, 'comp_2', e.target.value)}
                        className="input-field py-1 px-2 text-xs font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">Comp #3 ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={draft.comp_3}
                        onChange={e => handleDraftChange(item.item_id, 'comp_3', e.target.value)}
                        className="input-field py-1 px-2 text-xs font-mono text-center"
                      />
                    </div>
                  </div>

                  {/* Average & Recommended Price Target */}
                  <div className="lg:col-span-4 flex items-center justify-between gap-3 bg-slate-900/40 rounded-xl p-2.5 border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400">Comp Avg:</span>
                      <p className="text-sm font-black text-amber-400">
                        {liveAvg ? fmtCurrency(liveAvg) : '--'}
                      </p>
                    </div>

                    <div className="w-28">
                      <label className="block text-[10px] font-bold text-slate-300 mb-0.5">Target Price</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={draft.recommended_list_price}
                          onChange={e => handleDraftChange(item.item_id, 'recommended_list_price', e.target.value)}
                          className="input-field py-1 pl-5 pr-2 text-xs font-bold text-white"
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleSaveComp(item, false)}
                        disabled={draft.saving}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center justify-center gap-1"
                        title="Save Comps to DB"
                      >
                        {draft.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleSaveComp(item, true)}
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

                {/* Profit Margin Spread / Floor Indicator */}
                {floorDiff !== null && (
                  <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-lg bg-slate-900/30 border border-slate-800/40 text-slate-400">
                    <span>
                      Spread over Break-Even Floor: <strong className={floorDiff >= 0 ? 'text-emerald-400' : 'text-red-400'}>{floorDiff >= 0 ? '+' : ''}{fmtCurrency(floorDiff)}</strong>
                    </span>
                    {draft.recommended_list_price && item.true_total_cost > 0 && (
                      <span>
                        Projected Gross Margin: <strong className="text-amber-400">{Math.round(((Number(draft.recommended_list_price) - item.true_total_cost) / Number(draft.recommended_list_price)) * 100)}%</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-Channel Listing Copy Modal */}
      <ListingCopyModal
        isOpen={!!copyModalItem}
        item={copyModalItem}
        onClose={() => setCopyModalItem(null)}
      />
    </div>
  );
}
