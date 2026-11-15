import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Check, AlertCircle, RefreshCw, Loader2, Sparkles,
  TrendingDown, ShieldAlert, Lock, Unlock, CheckCircle2,
  ExternalLink, ArrowDownRight, Tag, DollarSign
} from 'lucide-react';
import { apiFetch, updateItem } from '../../utils/auctionApi';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';

/**
 * AgingMarkdownModal
 *
 * Automated Repricing & Aging-Inventory Decay Engine Review Modal.
 * Scans active inventory for items in 31-60d (-10%), 61-90d (-20%), and 90d+ (liquidation)
 * decay buckets, validates 0% profit break-even floors, and applies batch revisions to D1 and eBay.
 */
export function AgingMarkdownModal({ isOpen, onClose, onApplied }) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTierFilter, setActiveTierFilter] = useState('all');
  const [syncEbay, setSyncEbay] = useState(true);
  const [successResult, setSuccessResult] = useState(null);

  // Fetch candidates from API
  const fetchCandidates = async () => {
    setLoading(true);
    setError('');
    setSuccessResult(null);
    try {
      const data = await apiFetch('/api/items/reprice-candidates');
      if (data?.candidates) {
        setCandidates(data.candidates);
        setSummary(data.summary);
        // Pre-select all eligible items by default
        const eligibleIds = new Set(data.candidates.filter(c => c.eligible).map(c => c.item_id));
        setSelectedIds(eligibleIds);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load repricing candidates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCandidates();
    }
  }, [isOpen]);

  // Filtered view by tier
  const filteredCandidates = useMemo(() => {
    if (activeTierFilter === 'all') return candidates;
    if (activeTierFilter === 'eligible') return candidates.filter(c => c.eligible);
    if (activeTierFilter === 'locked') return candidates.filter(c => c.reprice_locked);
    return candidates.filter(c => c.tier === activeTierFilter);
  }, [candidates, activeTierFilter]);

  // Selection handlers
  const handleToggleSelect = (itemId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const eligibleInFilter = filteredCandidates.filter(c => c.eligible).map(c => c.item_id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = eligibleInFilter.every(id => next.has(id));
      if (allSelected) {
        eligibleInFilter.forEach(id => next.delete(id));
      } else {
        eligibleInFilter.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Toggle lock state on an individual item
  const handleToggleLock = async (candidate) => {
    const newLockState = !candidate.reprice_locked;
    try {
      await updateItem(candidate.item_id, { reprice_locked: newLockState ? 1 : 0 });
      setCandidates(prev => prev.map(c => {
        if (c.item_id === candidate.item_id) {
          const updated = { ...c, reprice_locked: newLockState, eligible: !newLockState && !c.at_floor_blocked && c.dollar_drop > 0 };
          return updated;
        }
        return c;
      }));
      if (newLockState) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(candidate.item_id);
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to toggle reprice lock:', err);
    }
  };

  // Batch apply repricing
  const handleApplyRepricing = async () => {
    const itemsToApply = candidates
      .filter(c => selectedIds.has(c.item_id) && c.eligible)
      .map(c => ({
        id: c.item_id,
        suggested_price: c.suggested_price,
        tier: c.tier,
        sync_ebay: syncEbay
      }));

    if (itemsToApply.length === 0) return;

    setApplying(true);
    setError('');
    try {
      const result = await apiFetch('/api/items/reprice-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToApply })
      });

      setSuccessResult({
        count: result.updated_count || itemsToApply.length,
        results: result.results || []
      });

      if (onApplied) {
        onApplied(result);
      }
    } catch (err) {
      setError(err?.message || 'Failed to apply repricing markdown');
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  const selectedCount = selectedIds.size;
  const eligibleFilteredCount = filteredCandidates.filter(c => c.eligible).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-5xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden my-auto animate-scale-up flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider">
                  Automated Repricing &amp; Aging Decay Engine
                </h2>
                <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Floor-Guarded
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-1 sm:line-clamp-none">
                Data-driven markdown schedules clamped strictly at 0% profit break-even floor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex-shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Overlay Banner */}
        {successResult && (
          <div className="p-4 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                Successfully repriced <strong>{successResult.count} item(s)</strong> in inventory!
                {syncEbay && ' Listing revisions dispatched to active eBay channels.'}
              </span>
            </div>
            <button
              onClick={() => {
                setSuccessResult(null);
                fetchCandidates();
              }}
              className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded font-bold transition-colors"
            >
              Refresh Table
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-red-950/40 border-b border-red-500/30 flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 p-3.5 sm:p-6 space-y-5">
          {/* Summary Metric Cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">Eligible for Markdown</span>
                <span className="text-xl font-black text-amber-400 font-mono mt-0.5 block">
                  {summary.total_candidates} <span className="text-xs font-normal text-slate-500">/ {summary.total_inventory_scanned}</span>
                </span>
                <span className="text-[10px] text-slate-500 block">31+ days listed without sale</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">Total Markdown Relief</span>
                <span className="text-xl font-black text-emerald-400 font-mono mt-0.5 block">
                  -{fmtCurrency(summary.potential_price_drop)}
                </span>
                <span className="text-[10px] text-slate-500 block">To stimulate sales velocity</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">At Break-Even Floor</span>
                <span className="text-xl font-black text-cyan-400 font-mono mt-0.5 block">
                  {summary.at_floor_count}
                </span>
                <span className="text-[10px] text-slate-500 block">Protected from negative margin</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">Reprice Locked</span>
                <span className="text-xl font-black text-slate-300 font-mono mt-0.5 block">
                  {summary.locked_count}
                </span>
                <span className="text-[10px] text-slate-500 block">Excluded by user lock</span>
              </div>
            </div>
          )}

          {/* Controls Bar: Tier Filter Buttons + Select All + eBay Sync Toggle */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-xs">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: 'All Active' },
                { id: 'eligible', label: 'Eligible Only' },
                { id: '31-60d', label: '31-60d (-10%)' },
                { id: '61-90d', label: '61-90d (-20%)' },
                { id: '90d+', label: '90d+ (Liquidation)' },
                { id: 'locked', label: 'Locked' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTierFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activeTierFilter === tab.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Select All / eBay Sync */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncEbay}
                  onChange={e => setSyncEbay(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:outline-none"
                />
                <span className="font-semibold text-[11px]">Sync to eBay Listings</span>
              </label>

              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-bold"
              >
                Toggle Select All ({eligibleFilteredCount})
              </button>
            </div>
          </div>

          {/* Candidate Table */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-xs">Scanning inventory age and calculating break-even floors...</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No items matching filter.
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden overflow-x-auto border border-slate-800 bg-slate-950/60">
              <table className="w-full min-w-[680px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 text-[10.5px] uppercase tracking-wider">
                    <th className="p-2.5 w-10 text-center">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="p-2.5">Item &amp; SKU</th>
                    <th className="p-2.5 text-center">Days Listed</th>
                    <th className="p-2.5 text-center">Aging Decay Tier</th>
                    <th className="p-2.5 text-right">Current Price</th>
                    <th className="p-2.5 text-right">Suggested Markdown</th>
                    <th className="p-2.5 text-right">Break-Even Floor</th>
                    <th className="p-2.5 text-right">Price Drop</th>
                    <th className="p-2.5 text-center w-16">Lock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredCandidates.map(candidate => {
                    const isSelected = selectedIds.has(candidate.item_id);
                    return (
                      <tr
                        key={candidate.item_id}
                        className={`hover:bg-slate-900/40 transition-colors ${
                          isSelected ? 'bg-amber-500/[0.04]' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            disabled={!candidate.eligible}
                            checked={isSelected}
                            onChange={() => handleToggleSelect(candidate.item_id)}
                            className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:outline-none disabled:opacity-30 cursor-pointer"
                          />
                        </td>

                        {/* Item Name & Details */}
                        <td className="p-2.5 font-sans min-w-[200px]">
                          <div className="flex items-center gap-2">
                            {candidate.image_url ? (
                              <img
                                src={candidate.image_url}
                                alt="Item"
                                className="w-7 h-7 rounded object-cover flex-shrink-0 border border-slate-700"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 flex-shrink-0">
                                <Tag className="w-3 h-3" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-200 block truncate max-w-xs text-xs">
                                {candidate.item_name}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                {candidate.sku && <span>SKU: {candidate.sku}</span>}
                                {candidate.ebay_listing_id && (
                                  <span className="text-cyan-400 font-semibold">eBay #{candidate.ebay_listing_id}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Days Listed */}
                        <td className="p-2.5 text-center text-slate-300">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            candidate.days_listed > 90
                              ? 'bg-red-500/15 text-red-300 border-red-500/30'
                              : candidate.days_listed > 60
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : candidate.days_listed > 30
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {candidate.days_listed}d
                          </span>
                        </td>

                        {/* Aging Tier & Action */}
                        <td className="p-2.5 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold inline-block ${
                            candidate.tier === '90d+'
                              ? 'text-red-400 bg-red-500/10'
                              : candidate.tier === '61-90d'
                              ? 'text-amber-400 bg-amber-500/10'
                              : candidate.tier === '31-60d'
                              ? 'text-blue-400 bg-blue-500/10'
                              : 'text-slate-400 bg-slate-800'
                          }`}>
                            {candidate.tier_label}
                          </span>
                        </td>

                        {/* Current Price */}
                        <td className="p-2.5 text-right text-slate-300">
                          {fmtCurrency(candidate.current_price)}
                        </td>

                        {/* Suggested Markdown */}
                        <td className="p-2.5 text-right font-bold">
                          {candidate.eligible ? (
                            <span className="text-emerald-400 font-bold">
                              {fmtCurrency(candidate.suggested_price)}
                            </span>
                          ) : candidate.at_floor_blocked ? (
                            <span className="text-amber-400 text-[10.5px] font-sans">
                              At Floor ({fmtCurrency(candidate.break_even_floor)})
                            </span>
                          ) : candidate.reprice_locked ? (
                            <span className="text-slate-500 text-[10.5px] font-sans">
                              Locked
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10.5px] font-sans">
                              Hold
                            </span>
                          )}
                        </td>

                        {/* Break-Even Floor */}
                        <td className="p-2.5 text-right text-cyan-400">
                          {fmtCurrency(candidate.break_even_floor)}
                        </td>

                        {/* Price Drop */}
                        <td className="p-2.5 text-right">
                          {candidate.dollar_drop > 0 ? (
                            <span className="text-emerald-400 font-bold">
                              -{fmtCurrency(candidate.dollar_drop)}
                              <span className="text-[10px] text-slate-400 font-normal ml-1">
                                (-{candidate.pct_drop}%)
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-600">--</span>
                          )}
                        </td>

                        {/* Lock Toggle */}
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleLock(candidate)}
                            className={`p-1 rounded transition-colors ${
                              candidate.reprice_locked
                                ? 'text-amber-400 hover:text-amber-300 bg-amber-500/10'
                                : 'text-slate-600 hover:text-slate-400'
                            }`}
                            title={candidate.reprice_locked ? 'Unlock price' : 'Lock price against automated markdowns'}
                          >
                            {candidate.reprice_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90 shrink-0 flex-wrap gap-3">
          <div className="text-xs text-slate-400">
            Selected: <strong className="text-white font-mono">{selectedCount}</strong> item(s) to reprice
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Close
            </button>

            <button
              type="button"
              disabled={applying || selectedCount === 0}
              onClick={handleApplyRepricing}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{applying ? 'Applying Markdowns...' : `Apply Markdowns (${selectedCount})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
