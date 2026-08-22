import React from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { STATUS_META, ALL_STATUSES } from '../../utils/constants';

/**
 * InventoryFilters - Shared filter bar for the consolidated Inventory & Pricing view.
 * Contains: view mode toggle, search input, status filter pills, category dropdown, refresh button.
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
    <div className="space-y-3 flex-shrink-0">
      {/* View mode toggle + Search + Refresh */}
      <div className="flex items-center gap-3">
        {/* View Mode Toggle */}
        <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs flex-shrink-0">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'table' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Table View
          </button>
          <button
            onClick={() => setViewMode('pricing')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === 'pricing' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Pricing View
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10 pointer-events-none" />
          <input
            id="inventory-search"
            type="text"
            className="input-field !pl-10 text-sm"
            placeholder="Search items, athletes, cert #..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Category Dropdown */}
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="input-field py-1.5 px-3 text-xs w-auto"
        >
          <option value="All">All Categories</option>
          {categoryOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          id="refresh-btn"
          onClick={onRefresh}
          className="w-9 h-9 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all flex-shrink-0"
          title="Refresh inventory"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${!statusFilter ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${active ? `${m.color} ${m.bg} ${m.border}` : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}
            >
              {s} ({statusCounts[s] || 0})
            </button>
          );
        })}
      </div>
    </div>
  );
}
