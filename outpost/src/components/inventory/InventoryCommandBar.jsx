import React, { useRef, useEffect } from 'react';
import { Search, RefreshCw, UploadCloud, Tag, Package, X, LayoutGrid, TableProperties } from 'lucide-react';
import { SortPresetDropdown } from './SortPresetDropdown';
import { LISTING_FORMATS } from '../../utils/constants';

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
  showMetrics,
  setShowMetrics,
  loading,
  onRefresh,
  onOpenAddInvoice,
  onOpenAmazonModal,
  onOpenImporter
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
    <div className="space-y-2 flex-shrink-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left Side: View Mode, Search, Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-xs flex-shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all text-xs flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Table View (Rapid inline editing)"
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('pricing')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all text-xs flex items-center gap-1.5 ${
                viewMode === 'pricing'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Pricing Cards View (Comps & fee analytics)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 z-10 pointer-events-none" />
            <input
              ref={searchInputRef}
              id="inventory-search"
              type="text"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
              placeholder="Search title, athlete, SKU, cert... (/)"
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

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-slate-300 outline-none focus:border-amber-500 flex-shrink-0 cursor-pointer"
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
            className="bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2 text-xs text-slate-300 outline-none focus:border-amber-500 flex-shrink-0 cursor-pointer hidden md:block"
          >
            <option value="All">All Formats</option>
            {LISTING_FORMATS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* Right Side: Sort Preset & Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <SortPresetDropdown
            sortPreset={sortPreset}
            onSelectPreset={applySortPreset}
          />

          <button
            onClick={() => setShowMetrics(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
              showMetrics
                ? 'bg-slate-800 text-amber-400 border-amber-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle stats metrics strip"
          >
            Stats {showMetrics ? '▲' : '▼'}
          </button>

          <button
            onClick={onOpenImporter}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 flex items-center gap-1.5 transition-all"
            title="Import Excel or CSV sheet"
          >
            <UploadCloud className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Import</span>
          </button>

          <button
            onClick={onOpenAmazonModal}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 flex items-center gap-1.5 transition-all"
            title="Import item directly via Amazon ASIN / Order ID"
          >
            <Tag className="w-3.5 h-3.5 text-[#ff9900]" />
            <span className="hidden sm:inline">Amazon</span>
          </button>

          <button
            onClick={onOpenAddInvoice}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-all"
            title="Add a manual purchase or wholesale invoice"
          >
            <Package className="w-3.5 h-3.5" />
            <span>+ Invoice</span>
          </button>

          <button
            id="refresh-btn"
            onClick={onRefresh}
            className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all flex-shrink-0"
            title="Refresh inventory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
