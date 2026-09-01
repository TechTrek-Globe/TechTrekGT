import React, { useRef, useEffect } from 'react';
import {
  Search, X, UploadCloud, Tag, Package,
  RefreshCw, TableProperties, LayoutGrid
} from 'lucide-react';
import { SortPresetDropdown } from './SortPresetDropdown';
import { ALL_STATUSES, LISTING_FORMATS } from '../../utils/constants';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';

export function InventoryCommandBar({
  viewMode,
  setViewMode,
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  categoryOptions = [],
  listingFormatFilter,
  setListingFormatFilter,
  sortPreset,
  applySortPreset,
  statusFilter,
  setStatusFilter,
  statusCounts = {},
  totalCount = 0,
  showMetrics,
  setShowMetrics,
  loading,
  onRefresh,
  onOpenAddInvoice,
  onOpenAmazonModal,
  onOpenImporter,
  activeCount,
  totalCost,
  totalListValue,
  totalPotentialProfit,
  overallMargin
}) {
  const searchInputRef = useRef(null);

  // Focus search on '/' key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex items-center justify-between gap-2 flex-wrap flex-shrink-0 bg-slate-900/70 px-2.5 py-1.5 rounded-xl border border-slate-800/80 backdrop-blur-sm">
      {/* Left: Title + Search + Status Dropdown + Category Dropdown + Format Dropdown + Sort */}
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <h1 className="text-sm font-black text-white flex items-center gap-1.5 flex-shrink-0 mr-1">
          <Package className="w-4 h-4 text-amber-400" />
          <span>Inventory</span>
        </h1>

        {/* Search Box */}
        <div className="relative min-w-[140px] max-w-[190px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 z-10 pointer-events-none" />
          <input
            ref={searchInputRef}
            id="inventory-search"
            type="text"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-6 py-1 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
            placeholder="Search (/)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <select
          id="inventory-status-filter"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={`bg-slate-950 border rounded-lg py-1 px-2 text-xs outline-none transition-colors cursor-pointer flex-shrink-0 ${
            statusFilter
              ? 'border-amber-500/50 text-amber-400 font-semibold bg-amber-500/10'
              : 'border-slate-700/80 text-slate-300 focus:border-amber-500'
          }`}
        >
          <option value="">All Status ({totalCount})</option>
          {ALL_STATUSES.map(s => {
            const count = statusCounts[s] || 0;
            return (
              <option key={s} value={s}>
                {s} ({count})
              </option>
            );
          })}
        </select>

        {/* Category Dropdown */}
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className={`bg-slate-950 border rounded-lg py-1 px-2 text-xs outline-none transition-colors cursor-pointer flex-shrink-0 ${
            categoryFilter !== 'All'
              ? 'border-amber-500/50 text-amber-400 font-semibold bg-amber-500/10'
              : 'border-slate-700/80 text-slate-300 focus:border-amber-500'
          }`}
        >
          <option value="All">All Categories</option>
          {categoryOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Listing Format Filter */}
        <select
          value={listingFormatFilter}
          onChange={e => setListingFormatFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-slate-300 outline-none focus:border-amber-500 flex-shrink-0 cursor-pointer hidden 2xl:block"
        >
          <option value="All">All Formats</option>
          {LISTING_FORMATS.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        {/* Sort Preset Dropdown */}
        <SortPresetDropdown
          sortPreset={sortPreset}
          onSelectPreset={applySortPreset}
        />
      </div>

      {/* Right: Inline Telemetry + View Mode + Action Buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        {/* Inline Telemetry Badges (Hidden on compact screens, visible on large) */}
        {totalCost > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] mr-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">
              <span className="text-[10px] text-amber-500/70">COGS</span>
              <span className="font-bold">{fmtCurrency(totalCost)}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
              <span className="text-[10px] text-blue-500/70">Val</span>
              <span className="font-bold">{fmtCurrency(totalListValue)}</span>
            </span>
            <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
              <span className="text-[10px] text-emerald-500/70">ROI</span>
              <span className="font-bold">{fmtCurrency(totalPotentialProfit)}</span>
              <span className="text-[10px] text-emerald-500/80 font-semibold">({formatPercent(overallMargin, 1)})</span>
            </span>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-xs">
          <button
            onClick={() => setViewMode('table')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all text-xs flex items-center gap-1 ${
              viewMode === 'table'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Table View (Rapid inline editing)"
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
          <button
            onClick={() => setViewMode('pricing')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all text-xs flex items-center gap-1 ${
              viewMode === 'pricing'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Pricing Cards View (Comps & fee analytics)"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>

        <button
          onClick={() => setShowMetrics(v => !v)}
          className={`px-2 py-0.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
            showMetrics
              ? 'bg-slate-800 text-amber-400 border-amber-500/30'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
          title="Toggle expanded stats analytics"
        >
          Stats {showMetrics ? '▲' : '▼'}
        </button>

        <button
          onClick={onOpenImporter}
          className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 flex items-center gap-1 transition-all"
          title="Import Excel or CSV sheet"
        >
          <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Import</span>
        </button>

        <button
          onClick={onOpenAmazonModal}
          className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 flex items-center gap-1 transition-all"
          title="Import item directly via Amazon ASIN / Order ID"
        >
          <Tag className="w-3.5 h-3.5 text-[#ff9900]" />
          <span className="hidden sm:inline">Amazon</span>
        </button>

        <button
          onClick={onOpenAddInvoice}
          className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm transition-all"
          title="Add a manual purchase or wholesale invoice"
        >
          <Package className="w-3.5 h-3.5" />
          <span>+ Invoice</span>
        </button>

        <button
          id="refresh-btn"
          onClick={onRefresh}
          className="w-6 h-6 rounded-lg border border-slate-700 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all flex-shrink-0"
          title="Refresh inventory"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
