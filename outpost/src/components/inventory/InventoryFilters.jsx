import React from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { STATUS_META, ALL_STATUSES } from '../../utils/constants';

/**
 * InventoryFilters - Compact filter bar for the consolidated Inventory & Pricing view.
 */
export function InventoryFilters({
  viewMode,
  setViewMode,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  categoryOptions,
  statusCounts,
  totalCount,
  loading,
  onRefresh,
}) {
  return (
    <div className="space-y-1.5 flex-shrink-0">
      {/* Row 1: View Toggle, Search, Category, Refresh */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left cluster: View toggle + Search + Category */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs flex-shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all text-xs ${viewMode === 'table' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('pricing')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all text-xs ${viewMode === 'pricing' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Pricing View
            </button>
          </div>

          {/* Category Dropdown (Moved to left side) */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2.5 text-xs text-slate-300 outline-none focus:border-amber-500 flex-shrink-0"
          >
            <option value="All">All Categories</option>
            {categoryOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 z-10 pointer-events-none" />
            <input
              id="inventory-search"
              type="text"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
              placeholder="Search items, cert #..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Refresh button */}
        <button
          id="refresh-btn"
          onClick={onRefresh}
          className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all flex-shrink-0"
          title="Refresh inventory"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Row 2: Status filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all border ${!statusFilter ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'text-slate-500 border-slate-800/80 hover:text-slate-300'}`}
        >
          All ({totalCount})
        </button>
        {ALL_STATUSES.map(s => {
          const m = STATUS_META[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all border ${active ? `${m.color} ${m.bg} ${m.border}` : 'text-slate-500 border-slate-800/80 hover:text-slate-300'}`}
            >
              {s} ({statusCounts[s] || 0})
            </button>
          );
        })}
      </div>
    </div>
  );
}
