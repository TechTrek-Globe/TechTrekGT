import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Search, ExternalLink, Save, CheckCircle2,
  AlertCircle, Loader2, RefreshCw, BarChart2, ShieldCheck,
  DollarSign, ArrowUpRight, Filter, Sparkles, SlidersHorizontal, Zap, Copy
} from 'lucide-react';
import { getComps, saveComp, updateItem, fetchLiveComps } from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { getCertVerificationUrl, getAuthenticatorMeta } from '../utils/certLookup';
import { ListingCopyModal } from './ListingCopyModal';
import { cleanItemName, cleanAthleteName, cleanItemDescription } from '../utils/spreadsheetParser';

function cleanEbaySearchQuery(itemName, athlete, authenticator) {
  let text = String(itemName || '').trim();

  // Strip leading Item #, Lot #, or standalone 5-12 digit numbers
  text = text.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  text = text.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  text = text.replace(/^\d{5,12}\s+/g, '');

  // Strip standalone non-year 5-12 digit numbers anywhere in text (e.g. internal lot IDs like "5261 894")
  text = text.replace(/\b(?!(?:19|20)\d{2})\d{5,12}\b/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  // If athlete provided and not in text, prepend athlete
  if (athlete && athlete.trim()) {
    const cleanAthlete = athlete.replace(/^\d{5,12}\s+/, '').trim();
    if (cleanAthlete && !text.toLowerCase().includes(cleanAthlete.toLowerCase())) {
      text = `${cleanAthlete} ${text}`;
    }
  }

  // If authenticator provided and not in text, append authenticator
  if (authenticator && authenticator.trim() && authenticator.toLowerCase() !== 'other') {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    if (cleanAuth && !text.toLowerCase().includes(cleanAuth.toLowerCase())) {
      text = `${text} ${cleanAuth}`;
    }
  }

  // Clean special characters except word characters, spaces, and hyphens
  text = text.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

  return text;
}

function buildEbaySearchUrl(itemName, athlete, authenticator) {
  const query = cleanEbaySearchQuery(itemName, athlete, authenticator);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}

function roundPrice(val) {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '';
  return Math.round(Number(val) * 100) / 100;
}

export function PricingIntelligenceView() {
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [copyModalItem, setCopyModalItem] = useState(null);
  const [queryEditModal, setQueryEditModal] = useState(null); // { item, query }
  
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
        const rawRec = item.recommended_list_price || item.current_list_price || item.suggested_list_price || '';
        initialDrafts[item.item_id] = {
          comp_1: item.comp_1 !== null && item.comp_1 !== undefined ? roundPrice(item.comp_1) : '',
          comp_2: item.comp_2 !== null && item.comp_2 !== undefined ? roundPrice(item.comp_2) : '',
          comp_3: item.comp_3 !== null && item.comp_3 !== undefined ? roundPrice(item.comp_3) : '',
          recommended_list_price: roundPrice(rawRec),
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

  // Step 1: generate the cleaned query and open the edit popup
  const handlePrepareSearch = (item) => {
    const query = cleanEbaySearchQuery(item.item_name, item.athlete_person, item.authenticator);
    setQueryEditModal({ item, query });
    setDrafts(prev => ({ ...prev, [item.item_id]: { ...(prev[item.item_id] || {}), fetchMsg: null } }));
  };

  // Step 2: user confirmed (possibly edited) query - fire the actual API
  const handleConfirmSearch = async (item, query) => {
    const draft = drafts[item.item_id] || {};
    setDrafts(prev => ({
      ...prev,
      [item.item_id]: { ...draft, fetchingLive: true, fetchQueryDraft: null, fetchMsg: null }
    }));

    try {
      const res = await fetchLiveComps(query, item.item_id);

      if (res && res.success && res.count > 0) {
        setDrafts(prev => {
          const cur = prev[item.item_id] || {};
          const c1 = res.comp_1 !== null && res.comp_1 !== undefined ? roundPrice(res.comp_1) : cur.comp_1;
          const c2 = res.comp_2 !== null && res.comp_2 !== undefined ? roundPrice(res.comp_2) : cur.comp_2;
          const c3 = res.comp_3 !== null && res.comp_3 !== undefined ? roundPrice(res.comp_3) : cur.comp_3;
          const recPrice = res.live_avg || res.median || cur.recommended_list_price;
          return {
            ...prev,
            [item.item_id]: {
              ...cur,
              comp_1: c1, comp_2: c2, comp_3: c3,
              recommended_list_price: roundPrice(recPrice),
              fetchingLive: false,
              fetchMsg: { type: 'success', text: `Found ${res.count} sold comps on eBay! Avg: $${res.live_avg}` },
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
          [item.item_id]: {
            ...(prev[item.item_id] || {}),
            fetchingLive: false,
            fetchMsg: { type: 'info', text: 'No comps found for that query. Try editing the search term or click eBay Comps ↗.' }
          }
        }));
      }
    } catch (err) {
      setDrafts(prev => ({
        ...prev,
        [item.item_id]: {
          ...(prev[item.item_id] || {}),
          fetchingLive: false,
          fetchMsg: { type: 'error', text: err.message || 'Auto-fetch error. Click eBay Comps ↗ to view sold listings.' }
        }
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
    <div className="flex-1 flex flex-col min-h-0 space-y-3">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Pricing Intelligence &amp; Market Comps
          </h1>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Cross-reference live eBay sold comps, calculate market averages, and safeguard your profit margins
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-comps-btn"
            onClick={fetchCompsData}
            className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all mr-1"
            title="Refresh Comps"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Overview Metric Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="glass-card rounded-lg p-2.5 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400">Inventory Monitored</p>
            <p className="text-lg font-black text-white mt-0.5">{totalItems} <span className="text-[10px] font-normal text-slate-500">items</span></p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="glass-card rounded-lg p-2.5 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400">Market Comps Coverage</p>
            <p className="text-lg font-black text-amber-400 mt-0.5">{itemsWithComps} <span className="text-[10px] font-normal text-slate-500">/ {totalItems} ({Math.round(coveragePct)}%)</span></p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="glass-card rounded-lg p-2.5 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400">Comp Strategy</p>
            <p className="text-[11px] font-semibold text-slate-200 mt-0.5">3-Comp Median &amp; Sold Valuation</p>
            <p className="text-[9px] text-slate-500">Automated query builder with eBay API sync</p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold">
            <ExternalLink className="w-4 h-4" />
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
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by player, item title, or cert #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field !pl-10 py-1.5 text-xs"
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
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
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
                <div className="flex items-start gap-4 border-b border-slate-800/60 pb-4">

                  {/* Product Thumbnail */}
                  <div className="flex-shrink-0">
                    {item.image_url ? (
                      <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center overflow-hidden border border-slate-700/60 shadow-md">
                        <img
                          src={item.image_url}
                          alt={item.item_name}
                          className="w-full h-full object-contain p-1"
                          onError={e => { e.target.style.display = 'none'; e.target.parentNode.classList.add('placeholder-icon'); }}
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700/40 flex-shrink-0">
                        <img
                          src="https://raw.githubusercontent.com/TechTrek-Globe/TechTrekGT/main/outpost/public/ebay-banner-sports.png"
                          alt="Item"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {/* Left: Title + meta */}
                  <div className="min-w-0 flex-1">
                    {/* Badge row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {item.category || 'General'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.status === 'Sold' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : item.status === 'Listed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-300 border border-slate-700/40'}`}>
                        {item.status}
                      </span>
                      {/* Auth badge - suppressed for Amazon items and blank/Other authenticators */}
                      {!item.is_amazon && item.authenticator && item.authenticator.toLowerCase() !== 'other' && item.cert_number && (() => {
                        const authMeta = getAuthenticatorMeta(item.authenticator);
                        const certUrl = getCertVerificationUrl(item.authenticator, item.cert_number);
                        const badgeContent = (
                          <>
                            <ShieldCheck className="w-3 h-3" />
                            {item.authenticator} #{item.cert_number}
                            {certUrl && <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" />}
                          </>
                        );
                        return certUrl ? (
                          <a
                            href={certUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 hover:opacity-80 transition-opacity ${authMeta.badgeColor}`}
                            title={`Verify with ${item.authenticator} Database`}
                          >
                            {badgeContent}
                          </a>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 ${authMeta.badgeColor}`}>
                            {badgeContent}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Item title */}
                    <h3 className="text-base font-black text-slate-100 leading-tight line-clamp-2">
                      {item.is_amazon ? item.item_name : cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
                    </h3>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
                      {item.athlete_person && (
                        <span>
                          Player: <strong className="text-slate-300 font-semibold">{cleanAthleteName(item.athlete_person)}</strong>
                        </span>
                      )}
                      {item.sport_genre && (
                        <span>Sport: <strong className="text-slate-400 font-medium">{item.sport_genre}</strong></span>
                      )}
                      {item.platform && (
                        <span>Platform: <strong className="text-slate-400 font-medium">{item.platform}</strong></span>
                      )}
                      {item.date_acquired && (
                        <span>Acquired: <strong className="text-slate-400 font-medium">{item.date_acquired}</strong></span>
                      )}
                      {item.invoice_ref && (
                        <span className="font-mono text-slate-600 text-[10px]">{item.invoice_ref}</span>
                      )}
                    </div>

                    {/* User note blurb */}
                    {item.user_note && (
                      <p className="mt-1.5 text-[11px] text-slate-500 italic line-clamp-1">
                        {item.user_note}
                      </p>
                    )}
                  </div>

                  {/* Financial Safeguards */}
                  <div className="flex items-center gap-4 bg-slate-900/60 rounded-xl px-3.5 py-2 border border-slate-800 flex-shrink-0">

                    {/* True Landed Cost */}
                    <div className="text-right relative group">
                      <p className="text-[10px] text-slate-500 cursor-help">True Landed Cost</p>
                      <p className="text-xs font-black text-amber-400">{fmtCurrency(item.true_total_cost)}</p>
                      <div className="absolute bottom-full right-0 mb-2 w-64 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                        <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-left shadow-2xl shadow-black/60">
                          <p className="text-[10px] font-bold text-amber-400 mb-1.5 uppercase tracking-wider">True Landed Cost</p>
                          <div className="space-y-0.5 text-[10px] text-slate-300">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-500">Unit Purchase Price</span>
                              <span className="font-mono text-white">{fmtCurrency(item.unit_price)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-500">+ Prorated Shipping / Tax</span>
                              <span className="font-mono text-slate-300">{fmtCurrency((item.true_total_cost || 0) - (item.unit_price || 0))}</span>
                            </div>
                            <div className="border-t border-slate-800 my-1" />
                            <div className="flex justify-between gap-4 font-bold">
                              <span className="text-amber-300">= True Landed Cost</span>
                              <span className="font-mono text-amber-400">{fmtCurrency(item.true_total_cost)}</span>
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-600 mt-2">Unit Price + prorated invoice shipping, taxes &amp; discounts</p>
                        </div>
                        <div className="w-2 h-2 bg-slate-950 border-r border-b border-amber-500/30 rotate-45 absolute -bottom-1 right-4" />
                      </div>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    {/* Break-Even Floor */}
                    <div className="text-right relative group">
                      <p className="text-[10px] text-slate-500 cursor-help">Break-Even Floor</p>
                      <p className="text-xs font-black text-cyan-400">{fmtCurrency(item.min_sell_price)}</p>
                      <div className="absolute bottom-full right-0 mb-2 w-72 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                        <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-3 text-left shadow-2xl shadow-black/60">
                          <p className="text-[10px] font-bold text-cyan-400 mb-1.5 uppercase tracking-wider">Break-Even Floor</p>
                          <div className="space-y-0.5 text-[10px] text-slate-300">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-500">True Landed Cost</span>
                              <span className="font-mono text-white">{fmtCurrency(item.true_total_cost)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-500">+ Est. Outbound Shipping</span>
                              <span className="font-mono text-slate-300">{fmtCurrency(item.est_shipping_cost)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-500">Platform Fee %</span>
                              <span className="font-mono text-slate-300">{((item.platform_fee_pct || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="border-t border-slate-800 my-1" />
                            <div className="flex justify-between gap-4 font-bold">
                              <span className="text-cyan-300">= (Cost + Ship) / (1 - Fee%)</span>
                              <span className="font-mono text-cyan-400">{fmtCurrency(item.min_sell_price)}</span>
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-600 mt-2">Minimum list price to fully recover all costs after platform fees</p>
                        </div>
                        <div className="w-2 h-2 bg-slate-950 border-r border-b border-cyan-500/30 rotate-45 absolute -bottom-1 right-4" />
                      </div>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    {/* Active List Price */}
                    <div className="text-right relative group">
                      <p className="text-[10px] text-slate-500 cursor-help">Active List Price</p>
                      <p className="text-xs font-black text-white">{item.current_list_price ? fmtCurrency(item.current_list_price) : 'Not Listed'}</p>
                      {item.current_list_price && item.min_sell_price > 0 && (
                        <div className="absolute bottom-full right-0 mb-2 w-64 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                          <div className="bg-slate-950 border border-slate-600/40 rounded-xl p-3 text-left shadow-2xl shadow-black/60">
                            <p className="text-[10px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">Active List Price</p>
                            <div className="space-y-0.5 text-[10px] text-slate-300">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Current List Price</span>
                                <span className="font-mono text-white">{fmtCurrency(item.current_list_price)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Break-Even Floor</span>
                                <span className="font-mono text-cyan-400">{fmtCurrency(item.min_sell_price)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Spread over Floor</span>
                                <span className={`font-mono font-bold ${item.current_list_price >= item.min_sell_price ? 'text-emerald-400' : 'text-red-400'}`}>{item.current_list_price >= item.min_sell_price ? '+' : ''}{fmtCurrency(item.current_list_price - item.min_sell_price)}</span>
                              </div>
                              <div className="border-t border-slate-800 my-1" />
                              <div className="flex justify-between gap-4 font-bold">
                                <span className="text-slate-300">Gross Margin</span>
                                <span className={`font-mono ${item.current_list_price > item.true_total_cost ? 'text-emerald-400' : 'text-red-400'}`}>{item.true_total_cost > 0 ? Math.round(((item.current_list_price - item.true_total_cost) / item.current_list_price) * 100) : 0}%</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-600/40 rotate-45 absolute -bottom-1 right-4" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Comps Inputs & Calculations */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* eBay Lookup & Live Auto-Fetch */}
                  <div className="lg:col-span-3 space-y-1.5">
                    {/* Auto-fetch button */}
                    {!draft.fetchingLive && (
                      <button
                        type="button"
                        onClick={() => handlePrepareSearch(item)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 hover:border-amber-500/60 transition-all shadow-sm"
                        title="Preview and edit the search query before sending to eBay"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Auto-Fetch Sold Comps</span>
                      </button>
                    )}

                    {/* Scanning state */}
                    {draft.fetchingLive && (
                      <div className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/40">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Scanning eBay...</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5">
                      <a
                        href={buildEbaySearchUrl(item.item_name, item.athlete_person, item.authenticator)}
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
                    {draft.fetchMsg && (
                      <div className={`p-2 rounded-lg text-[10px] leading-tight flex items-start gap-1 ${
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
                    {/* Comp Avg */}
                    <div className="relative group">
                      <span className="text-[10px] text-slate-400 cursor-help">Comp Avg:</span>
                      <p className="text-sm font-black text-amber-400">
                        {liveAvg ? fmtCurrency(liveAvg) : '--'}
                      </p>
                      {liveAvg && (
                        <div className="absolute bottom-full left-0 mb-2 w-60 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                          <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-left shadow-2xl shadow-black/60">
                            <p className="text-[10px] font-bold text-amber-400 mb-1.5 uppercase tracking-wider">Comp Average</p>
                            <div className="space-y-0.5 text-[10px] text-slate-300">
                              {[draft.comp_1, draft.comp_2, draft.comp_3].filter(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0).map((v, i) => (
                                <div key={i} className="flex justify-between gap-4">
                                  <span className="text-slate-500">Comp #{i + 1}</span>
                                  <span className="font-mono text-white">{fmtCurrency(Number(v))}</span>
                                </div>
                              ))}
                              <div className="border-t border-slate-800 my-1" />
                              <div className="flex justify-between gap-4 font-bold">
                                <span className="text-amber-300">= Sum / {vals.length} comps</span>
                                <span className="font-mono text-amber-400">{fmtCurrency(liveAvg)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-2 h-2 bg-slate-950 border-r border-b border-amber-500/30 rotate-45 absolute -bottom-1 left-4" />
                        </div>
                      )}
                    </div>

                    {/* Target Price */}
                    <div className="w-28 relative group">
                      <label className="block text-[10px] font-bold text-slate-300 mb-0.5 cursor-help">Target Price</label>
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
                      {draft.recommended_list_price && item.min_sell_price > 0 && (
                        <div className="absolute bottom-full right-0 mb-2 w-64 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                          <div className="bg-slate-950 border border-slate-500/30 rounded-xl p-3 text-left shadow-2xl shadow-black/60">
                            <p className="text-[10px] font-bold text-slate-200 mb-1.5 uppercase tracking-wider">Target Price Breakdown</p>
                            <div className="space-y-0.5 text-[10px] text-slate-300">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Target List Price</span>
                                <span className="font-mono text-white">{fmtCurrency(Number(draft.recommended_list_price))}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Break-Even Floor</span>
                                <span className="font-mono text-cyan-400">{fmtCurrency(item.min_sell_price)}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">Spread</span>
                                <span className={`font-mono font-bold ${Number(draft.recommended_list_price) >= item.min_sell_price ? 'text-emerald-400' : 'text-red-400'}`}>{Number(draft.recommended_list_price) >= item.min_sell_price ? '+' : ''}{fmtCurrency(Number(draft.recommended_list_price) - item.min_sell_price)}</span>
                              </div>
                              {item.true_total_cost > 0 && (
                                <>
                                  <div className="border-t border-slate-800 my-1" />
                                  <div className="flex justify-between gap-4">
                                    <span className="text-slate-500">Gross Margin</span>
                                    <span className="font-mono font-bold text-amber-400">{Math.round(((Number(draft.recommended_list_price) - item.true_total_cost) / Number(draft.recommended_list_price)) * 100)}%</span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-slate-500">Gross Profit $</span>
                                    <span className={`font-mono font-bold ${Number(draft.recommended_list_price) > item.true_total_cost ? 'text-emerald-400' : 'text-red-400'}`}>{fmtCurrency(Number(draft.recommended_list_price) - item.true_total_cost)}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-500/30 rotate-45 absolute -bottom-1 right-4" />
                        </div>
                      )}
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

      {/* eBay Query Edit Popup */}
      {queryEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setQueryEditModal(null)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-white">Edit eBay Search Query</h3>
              <p className="text-xs text-slate-400 mt-1">
                Trim or refine the query below before sending. Include the model name for better comp accuracy.
              </p>
            </div>

            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Item</div>
            <p className="text-sm text-slate-300 leading-snug -mt-2 line-clamp-2">{queryEditModal.item.item_name}</p>

            <div>
              <label className="block text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1.5">Search Query</label>
              <textarea
                autoFocus
                rows={3}
                value={queryEditModal.query}
                onChange={e => setQueryEditModal(prev => ({ ...prev, query: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleConfirmSearch(queryEditModal.item, queryEditModal.query);
                    setQueryEditModal(null);
                  }
                  if (e.key === 'Escape') setQueryEditModal(null);
                }}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 resize-none leading-relaxed"
                placeholder="e.g. Kawasaki Mule UTV Windshield"
              />
              <p className="text-[10px] text-slate-500 mt-1">Tip: Ctrl+Enter to search. Shorter focused queries work best on eBay.</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { handleConfirmSearch(queryEditModal.item, queryEditModal.query); setQueryEditModal(null); }}
                disabled={!queryEditModal.query?.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50"
              >
                <Search className="w-4 h-4" /> Search eBay for Sold Comps
              </button>
              <button
                type="button"
                onClick={() => setQueryEditModal(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
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
