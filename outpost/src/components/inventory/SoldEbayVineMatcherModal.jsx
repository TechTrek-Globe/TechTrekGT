import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Search, CheckCircle2, AlertCircle, Loader2,
  ExternalLink, Link2, Sparkles, ArrowRight, ArrowRightLeft,
  Package, ShoppingBag, Check, RefreshCw, Layers, Filter,
  DollarSign, TrendingUp, AlertTriangle, Eye, ChevronRight
} from 'lucide-react';
import { getSoldEbayVineMatches, confirmSoldEbayVineMatch } from '../../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../../utils/formulaPreview';

/**
 * SoldEbayVineMatcherModal
 *
 * Interactive workspace for matching and reconciling completed/sold eBay orders
 * with Amazon Vine (Vine Scout) inventory items in Outpost Tracker.
 */
export function SoldEbayVineMatcherModal({ isOpen, onClose, onMatched }) {
  const [activeTab, setActiveTab] = useState('suggested'); // 'suggested' | 'manual' | 'history'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matchData, setMatchData] = useState({
    suggested_matches: [],
    unmatched_sold_ebay: [],
    unmatched_vinescout_items: [],
    already_matched: []
  });

  // Action states
  const [cardStates, setCardStates] = useState({}); // { [orderId]: { saving, saved, error } }
  const [batchSaving, setBatchSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Manual matcher selection states
  const [selectedEbayOrder, setSelectedEbayOrder] = useState(null);
  const [selectedVScoutItem, setSelectedVScoutItem] = useState(null);
  const [manualEbaySearch, setManualEbaySearch] = useState('');
  const [manualVScoutSearch, setManualVScoutSearch] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  // Inline replacement state for suggested card
  const [replacingOrderId, setReplacingOrderId] = useState(null);
  const [replaceSearch, setReplaceSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSoldEbayVineMatches();
      setMatchData(res || {
        suggested_matches: [],
        unmatched_sold_ebay: [],
        unmatched_vinescout_items: [],
        already_matched: []
      });
    } catch (err) {
      console.error('[SoldEbayVineMatcherModal] fetch error:', err);
      setError(err.message || 'Failed to load sold eBay matches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setCardStates({});
      setSelectedEbayOrder(null);
      setSelectedVScoutItem(null);
      setReplacingOrderId(null);
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  // Single item match confirmation
  const handleConfirmMatch = async (ebayOrder, vscoutItem) => {
    const orderId = ebayOrder.order_id;
    setCardStates(prev => ({ ...prev, [orderId]: { saving: true, error: '' } }));

    try {
      await confirmSoldEbayVineMatch({
        confirm: true,
        item_id: vscoutItem.id,
        ebay_order_id: ebayOrder.order_id,
        ebay_listing_id: ebayOrder.legacy_item_id,
        sale_price: ebayOrder.price,
        sale_date: ebayOrder.sale_date,
        buyer_handle: ebayOrder.buyer_handle,
        buyer_shipping_paid: ebayOrder.delivery_cost || 0
      });

      setCardStates(prev => ({ ...prev, [orderId]: { saving: false, saved: true } }));
      if (onMatched) onMatched();
    } catch (err) {
      setCardStates(prev => ({ ...prev, [orderId]: { saving: false, error: err.message || 'Match failed' } }));
    }
  };

  // Batch confirm high-confidence matches
  const handleBatchConfirmHighConfidence = async () => {
    const highConfidence = matchData.suggested_matches.filter(m => {
      const state = cardStates[m.ebay_order.order_id];
      const isHigh = m.high_confidence !== undefined ? m.high_confidence : m.confidence >= 0.80;
      return isHigh && (!state || !state.saved);
    });

    if (highConfidence.length === 0) return;
    setBatchSaving(true);

    for (const match of highConfidence) {
      try {
        await confirmSoldEbayVineMatch({
          confirm: true,
          item_id: match.vinescout_item.id,
          ebay_order_id: match.ebay_order.order_id,
          ebay_listing_id: match.ebay_order.legacy_item_id,
          sale_price: match.ebay_order.price,
          sale_date: match.ebay_order.sale_date,
          buyer_handle: match.ebay_order.buyer_handle,
          buyer_shipping_paid: match.ebay_order.delivery_cost || 0
        });
        setCardStates(prev => ({ ...prev, [match.ebay_order.order_id]: { saving: false, saved: true } }));
      } catch (err) {
        setCardStates(prev => ({ ...prev, [match.ebay_order.order_id]: { saving: false, error: err.message } }));
      }
    }

    setBatchSaving(false);
    if (onMatched) onMatched();
  };

  // Manual pair confirmation
  const handleConfirmManualMatch = async () => {
    if (!selectedEbayOrder || !selectedVScoutItem) return;
    setManualSaving(true);
    setManualError('');

    try {
      await confirmSoldEbayVineMatch({
        confirm: true,
        item_id: selectedVScoutItem.id,
        ebay_order_id: selectedEbayOrder.order_id,
        ebay_listing_id: selectedEbayOrder.legacy_item_id,
        sale_price: selectedEbayOrder.price,
        sale_date: selectedEbayOrder.sale_date,
        buyer_handle: selectedEbayOrder.buyer_handle,
        buyer_shipping_paid: selectedEbayOrder.delivery_cost || 0
      });

      // Remove from unmatched and refresh
      setSelectedEbayOrder(null);
      setSelectedVScoutItem(null);
      loadData();
      if (onMatched) onMatched();
    } catch (err) {
      setManualError(err.message || 'Failed to match selected items');
    } finally {
      setManualSaving(false);
    }
  };

  // Filtered suggested matches
  const filteredSuggested = useMemo(() => {
    if (!searchFilter.trim()) return matchData.suggested_matches;
    const q = searchFilter.trim().toLowerCase();
    return matchData.suggested_matches.filter(m =>
      (m.ebay_order.title || '').toLowerCase().includes(q) ||
      (m.vinescout_item.item_name || '').toLowerCase().includes(q) ||
      (m.ebay_order.order_id || '').toLowerCase().includes(q) ||
      (m.vinescout_item.asin || '').toLowerCase().includes(q)
    );
  }, [matchData.suggested_matches, searchFilter]);

  // Filtered lists for manual matcher
  const filteredManualEbay = useMemo(() => {
    if (!manualEbaySearch.trim()) return matchData.unmatched_sold_ebay;
    const q = manualEbaySearch.trim().toLowerCase();
    return matchData.unmatched_sold_ebay.filter(o =>
      (o.title || '').toLowerCase().includes(q) ||
      (o.order_id || '').toLowerCase().includes(q) ||
      (o.buyer_handle || '').toLowerCase().includes(q) ||
      (o.sku || '').toLowerCase().includes(q)
    );
  }, [matchData.unmatched_sold_ebay, manualEbaySearch]);

  const filteredManualVScout = useMemo(() => {
    if (!manualVScoutSearch.trim()) return matchData.unmatched_vinescout_items;
    const q = manualVScoutSearch.trim().toLowerCase();
    return matchData.unmatched_vinescout_items.filter(it =>
      (it.item_name || '').toLowerCase().includes(q) ||
      (it.asin || '').toLowerCase().includes(q) ||
      (it.sku || '').toLowerCase().includes(q)
    );
  }, [matchData.unmatched_vinescout_items, manualVScoutSearch]);

  const highConfidenceCount = matchData.suggested_matches.filter(m => {
    const state = cardStates[m.ebay_order.order_id];
    const isHigh = m.high_confidence !== undefined ? m.high_confidence : m.confidence >= 0.80;
    return isHigh && (!state || !state.saved);
  }).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b101d] border border-slate-700/80 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Match Sold eBay Orders to Vine Scout</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Automated Reconciliation
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Reconcile completed eBay transactions with Amazon Vine inventory to log accurate COGS, calculate net profits, and stamp liquidation status.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-all disabled:opacity-50"
              title="Refresh matches from eBay"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 border-b border-slate-800/80 bg-slate-950/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('suggested')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'suggested'
                  ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Suggested Matches
              {matchData.suggested_matches.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'suggested' ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                }`}>
                  {matchData.suggested_matches.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'manual'
                  ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Manual Matcher
              {matchData.unmatched_sold_ebay.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                  {matchData.unmatched_sold_ebay.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'history'
                  ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Matched History
              {matchData.already_matched.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                  {matchData.already_matched.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Stats Toolbar */}
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>Sold eBay Orders: <strong className="text-slate-200 font-mono">{matchData.unmatched_sold_ebay.length + matchData.already_matched.length}</strong></span>
            <span>·</span>
            <span>VScout Catalog Items: <strong className="text-slate-200 font-mono">{matchData.unmatched_vinescout_items.length + matchData.already_matched.length}</strong></span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#080c16]/50">
          
          {loading && (
            <div className="flex flex-col items-center justify-center h-72 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-sm">Pulling recent eBay Fulfillment orders & analyzing Vine Scout catalog...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="font-semibold">Unable to fetch matches</p>
                <p className="text-red-400/80">{error}</p>
              </div>
              <button
                onClick={loadData}
                className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 font-semibold text-red-200 text-xs transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* ================= TAB 1: SUGGESTED MATCHES ================= */}
          {!loading && activeTab === 'suggested' && (
            <div className="space-y-4">
              {/* Batch Action Bar */}
              <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter suggested matches by title, ASIN, order ID..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-slate-200 text-xs focus:outline-none focus:border-amber-400 transition-colors"
                  />
                  {searchFilter && (
                    <button onClick={() => setSearchFilter('')} className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {highConfidenceCount > 0 && (
                  <button
                    onClick={handleBatchConfirmHighConfidence}
                    disabled={batchSaving}
                    className="px-3.5 py-1.5 rounded-lg font-bold text-xs bg-emerald-500 hover:bg-emerald-600 text-slate-950 flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {batchSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Confirm All High-Confidence ({highConfidenceCount})
                  </button>
                )}
              </div>

              {filteredSuggested.length === 0 ? (
                <div className="text-center py-16 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/20">
                  <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-300">No Auto-Suggested Matches Found</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    All recent eBay sold orders are either already reconciled or titles did not meet the auto-match confidence threshold. Use the <strong>Manual Matcher</strong> tab to manually pair any order.
                  </p>
                  <button
                    onClick={() => setActiveTab('manual')}
                    className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all inline-flex items-center gap-1.5"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Go to Manual Matcher
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {filteredSuggested.map((match) => {
                    const ebay = match.ebay_order;
                    const vscout = match.vinescout_item;
                    const orderState = cardStates[ebay.order_id] || {};
                    const isSaved = orderState.saved;
                    const isSaving = orderState.saving;
                    const isReplacing = replacingOrderId === ebay.order_id;

                    const estGross = ebay.price || 0;
                    const estCogs = vscout.true_total_cost || (vscout.unit_price || 0);
                    const estProfit = estGross - estCogs;

                    return (
                      <div
                        key={ebay.order_id}
                        className={`p-4 rounded-xl border transition-all ${
                          isSaved
                            ? 'bg-emerald-950/20 border-emerald-500/40 opacity-75'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 shadow-md'
                        }`}
                      >
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                          
                          {/* 1. Left: eBay Sold Order */}
                          <div className="lg:col-span-5 flex items-start gap-3 min-w-0">
                            <div className="w-16 h-16 rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden p-1">
                              {ebay.image_url ? (
                                <img src={ebay.image_url} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <ShoppingBag className="w-6 h-6 text-slate-700" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                  <ExternalLink className="w-2.5 h-2.5" /> eBay Order #{ebay.order_id.slice(-8)}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">{ebay.sale_date}</span>
                                {ebay.buyer_handle && (
                                  <span className="text-[10px] text-slate-400 truncate">Buyer: @{ebay.buyer_handle}</span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-snug" title={ebay.title}>
                                {ebay.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-xs font-mono">
                                <span className="text-emerald-400 font-bold">{fmtCurrency(ebay.price)}</span>
                                {ebay.delivery_cost > 0 && (
                                  <span className="text-slate-500 text-[10px]">+{fmtCurrency(ebay.delivery_cost)} ship</span>
                                )}
                                {ebay.sku && (
                                  <span className="text-slate-500 text-[10px] truncate max-w-[120px]">SKU: {ebay.sku}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 2. Center: Match Indicator */}
                          <div className="lg:col-span-2 flex flex-col items-center justify-center gap-1 text-center py-2 px-1 border-y lg:border-y-0 lg:border-x border-slate-800/80">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              (match.high_confidence !== undefined ? match.high_confidence : match.confidence >= 0.80)
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : match.confidence >= 0.60
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                              {(match.confidence * 100).toFixed(0)}% Match {(match.high_confidence !== undefined ? match.high_confidence : match.confidence >= 0.80) ? '(High Confidence)' : '(Requires Review)'}
                            </span>
                            <span className="text-[9px] text-slate-400 leading-tight">
                              {match.match_reason}
                            </span>
                            <div className="text-[10px] font-mono mt-1 text-slate-300">
                              Est. Net: <span className={estProfit >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{fmtCurrency(estProfit)}</span>
                            </div>
                          </div>

                          {/* 3. Right: Matched Vine Scout Item */}
                          <div className="lg:col-span-5 flex items-start gap-3 min-w-0">
                            <div className="w-16 h-16 rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden p-1">
                              {vscout.image_url ? (
                                <img src={vscout.image_url} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <Package className="w-6 h-6 text-slate-700" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">
                                  VScout Inventory
                                </span>
                                {vscout.asin && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                    ASIN: {vscout.asin}
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  vscout.status === 'Sold'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}>
                                  {vscout.status}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-snug" title={vscout.item_name}>
                                {vscout.item_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-xs font-mono">
                                <span className="text-slate-400 text-[10px]">
                                  Landed COGS: <strong className="text-slate-200">{fmtCurrency(estCogs)}</strong>
                                </span>
                                {vscout.etv != null && (
                                  <span className="text-slate-500 text-[10px]">ETV: {fmtCurrency(vscout.etv)}</span>
                                )}
                              </div>
                            </div>
                          </div>

                        </div>

                        {/* Card Action Footer */}
                        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 mt-3">
                          <div className="text-[11px] text-slate-400">
                            {orderState.error && (
                              <span className="text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {orderState.error}
                              </span>
                            )}
                            {isSaved && (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled & Logged to Sales Log!
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {!isSaved && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedEbayOrder(ebay);
                                    setSelectedVScoutItem(vscout);
                                    setActiveTab('manual');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                                >
                                  Change Pair...
                                </button>
                                <button
                                  onClick={() => handleConfirmMatch(ebay, vscout)}
                                  disabled={isSaving}
                                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
                                >
                                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  Confirm Match & Reconcile
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 2: MANUAL MATCHER ================= */}
          {!loading && activeTab === 'manual' && (
            <div className="flex flex-col h-full space-y-4">
              {manualError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{manualError}</span>
                </div>
              )}

              {/* 2-Column Split Pane */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-[450px]">
                
                {/* Left Pane: Sold eBay Orders */}
                <div className="flex flex-col p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        1. Select Sold eBay Order ({filteredManualEbay.length})
                      </h3>
                    </div>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={manualEbaySearch}
                      onChange={(e) => setManualEbaySearch(e.target.value)}
                      placeholder="Search sold orders by title, buyer, order ID..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
                    {filteredManualEbay.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-10">No unmatched sold eBay orders found.</p>
                    ) : (
                      filteredManualEbay.map((order) => {
                        const isSelected = selectedEbayOrder?.order_id === order.order_id;
                        return (
                          <div
                            key={order.order_id}
                            onClick={() => setSelectedEbayOrder(order)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-400 shadow-md'
                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-12 h-12 rounded bg-slate-900 border border-slate-800 flex-shrink-0 flex items-center justify-center p-0.5 overflow-hidden">
                                {order.image_url ? (
                                  <img src={order.image_url} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <ShoppingBag className="w-4 h-4 text-slate-700" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="text-[10px] font-mono text-amber-400 font-bold">#{order.order_id.slice(-8)}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">{order.sale_date}</span>
                                </div>
                                <p className="text-xs font-medium text-slate-200 truncate leading-snug" title={order.title}>
                                  {order.title}
                                </p>
                                <div className="flex items-center justify-between mt-1 text-xs font-mono">
                                  <span className="text-emerald-400 font-bold">{fmtCurrency(order.price)}</span>
                                  {order.buyer_handle && (
                                    <span className="text-slate-500 text-[10px] truncate max-w-[120px]">@{order.buyer_handle}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Pane: Available Vine Scout Items */}
                <div className="flex flex-col p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        2. Select Vine Scout Item ({filteredManualVScout.length})
                      </h3>
                    </div>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={manualVScoutSearch}
                      onChange={(e) => setManualVScoutSearch(e.target.value)}
                      placeholder="Search inventory by title, ASIN, SKU..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
                    {filteredManualVScout.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-10">No Vine Scout inventory items found.</p>
                    ) : (
                      filteredManualVScout.map((it) => {
                        const isSelected = selectedVScoutItem?.id === it.id;
                        const cogs = it.true_total_cost || it.unit_price || 0;
                        return (
                          <div
                            key={it.id}
                            onClick={() => setSelectedVScoutItem(it)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-teal-500/15 border-teal-400 shadow-md'
                                : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="w-12 h-12 rounded bg-slate-900 border border-slate-800 flex-shrink-0 flex items-center justify-center p-0.5 overflow-hidden">
                                {it.image_url ? (
                                  <img src={it.image_url} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <Package className="w-4 h-4 text-slate-700" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  {it.asin ? (
                                    <span className="text-[10px] font-mono font-bold text-teal-400">ASIN: {it.asin}</span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500">VScout Item</span>
                                  )}
                                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                                    it.status === 'Sold' ? 'bg-purple-500/20 text-purple-300' : 'bg-emerald-500/20 text-emerald-300'
                                  }`}>
                                    {it.status}
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-slate-200 truncate leading-snug" title={it.item_name}>
                                  {it.item_name}
                                </p>
                                <div className="flex items-center justify-between mt-1 text-xs font-mono">
                                  <span className="text-slate-400 text-[10px]">COGS: <strong className="text-slate-200">{fmtCurrency(cogs)}</strong></span>
                                  {it.current_list_price != null && (
                                    <span className="text-slate-500 text-[10px]">Listed: {fmtCurrency(it.current_list_price)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

              {/* Bottom Matching Action Bar */}
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs">
                  {selectedEbayOrder && selectedVScoutItem ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-200 font-medium truncate max-w-[200px]">
                          {selectedEbayOrder.title}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-teal-300 font-medium truncate max-w-[200px]">
                        {selectedVScoutItem.item_name}
                      </span>
                      <div className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 font-bold">
                        Est. Net: {fmtCurrency(selectedEbayOrder.price - (selectedVScoutItem.true_total_cost || selectedVScoutItem.unit_price || 0))}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400">
                      Select 1 sold order on the left and 1 Vine Scout inventory item on the right to link.
                    </span>
                  )}
                </div>

                <button
                  onClick={handleConfirmManualMatch}
                  disabled={!selectedEbayOrder || !selectedVScoutItem || manualSaving}
                  className="w-full sm:w-auto px-6 py-2 rounded-lg font-bold text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Link & Record Sale
                </button>
              </div>
            </div>
          )}

          {/* ================= TAB 3: MATCHED HISTORY ================= */}
          {!loading && activeTab === 'history' && (
            <div className="space-y-4">
              {matchData.already_matched.length === 0 ? (
                <div className="text-center py-16 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/20">
                  <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-300">No Matched Items Yet</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Confirmed matches between sold eBay orders and Vine Scout items will appear here with liquidation status and links to the Sales Log.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">eBay Sold Order</th>
                        <th className="py-2.5 px-3">Linked VScout Item</th>
                        <th className="py-2.5 px-3 text-right">Sold Price</th>
                        <th className="py-2.5 px-3 text-right">Landed COGS</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {matchData.already_matched.map((pair, idx) => {
                        const ebay = pair.ebay_order || {};
                        const vscout = pair.vinescout_item || {};
                        const cogs = vscout.true_total_cost || vscout.unit_price || 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap text-[11px]">
                              {ebay.sale_date || '--'}
                            </td>
                            <td className="py-2 px-3 max-w-xs">
                              <div className="flex items-center gap-1 text-slate-200 font-medium truncate" title={ebay.title}>
                                {ebay.title || 'eBay Order'}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500">
                                #{ebay.order_id} {ebay.buyer_handle ? `· @${ebay.buyer_handle}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 max-w-xs">
                              <div className="flex items-center gap-1 text-teal-300 font-medium truncate" title={vscout.item_name}>
                                {vscout.item_name || 'VScout Item'}
                              </div>
                              {vscout.asin && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  ASIN: {vscout.asin}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              {fmtCurrency(ebay.price)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                              {fmtCurrency(cogs)}
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Reconciled & Liquidated
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex-shrink-0">
          <span className="text-[11px] text-slate-500">
            Matching an item automatically updates inventory status to <strong>Sold</strong>, logs true landed COGS, and writes liquidation metadata to Vine Scout.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
