import { ArrowUpDown, Filter, X, Search, Sparkles, Check, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import BourbonCard from '../components/BourbonCard'
import PriceSliderBar from '../components/PriceSliderBar'
import { useBourbon } from '../context/BourbonContext'

const SORT_OPTIONS = [
  { field: 'valueScore', label: 'Value Score' },
  { field: 'sprigPrice', label: 'Price: Low' },
  { field: 'fairPrice', label: 'Fair Bar Price' },
  { field: 'msrp', label: 'Bottle MSRP' },
  { field: 'name', label: 'Name A-Z' },
]

export default function ExplorerScreen() {
  const {
    filtered,
    sortBy,
    sortDir,
    filterTier,
    filterPrice,
    maxPrice,
    filterType,
    filterDistillery,
    searchQuery,
    distilleries,
    types,
    dispatch,
    data,
  } = useBourbon()

  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasActiveFilters =
    filterTier !== 'all' ||
    filterPrice !== 'all' ||
    maxPrice !== null ||
    filterType !== 'all' ||
    filterDistillery !== 'all' ||
    searchQuery.trim() !== ''

  const handleQuickFilterTier = (tier) => {
    dispatch({
      type: 'SET_FILTER',
      payload: { key: 'filterTier', value: filterTier === tier ? 'all' : tier },
    })
  }

  const handleQuickFilterPrice = (priceKey) => {
    dispatch({
      type: 'SET_FILTER',
      payload: { key: 'filterPrice', value: filterPrice === priceKey ? 'all' : priceKey },
    })
  }

  const handleQuickFilterType = (typeKey) => {
    dispatch({
      type: 'SET_FILTER',
      payload: { key: 'filterType', value: filterType === typeKey ? 'all' : typeKey },
    })
  }

  const clearAll = () => {
    dispatch({ type: 'CLEAR_FILTERS' })
  }

  return (
    <div className="min-h-screen pb-28">
      {/* Sticky Filter & Search Header */}
      <div className="sticky top-0 z-20 glass-panel border-b border-smoke-800/60 px-4 pt-12 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-display text-lg font-bold text-smoke-100">Bourbon Explorer</h1>
            <p className="text-smoke-500 text-xs">
              Showing <span className="text-bourbon-300 font-semibold">{filtered.length}</span> of {data.length} Sprig pours
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {hasActiveFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-red-500/40 text-red-400 bg-red-950/20 text-xs font-medium active:scale-95 transition-all"
                title="Clear all filters"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}

            <button
              id="filter-toggle-btn"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-200 active:scale-95"
              style={{
                borderColor: hasActiveFilters ? 'rgba(201,115,32,0.6)' : 'rgba(107,100,89,0.4)',
                color: hasActiveFilters ? '#e8b85c' : '#a89f91',
                background: hasActiveFilters ? 'rgba(201,115,32,0.15)' : 'rgba(26,23,18,0.7)',
              }}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-bourbon-400 ml-0.5 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Quick Search inside Explorer */}
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-smoke-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
            placeholder="Quick search explorer (e.g. 1792, rye, cask, weller)..."
            className="search-input text-xs pl-8 pr-8 py-2"
          />
          {searchQuery && (
            <button
              onClick={() => dispatch({ type: 'SET_SEARCH', payload: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-smoke-500 hover:text-smoke-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Horizontal Quick Filter Chips (1-tap access) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide text-xs">
          <button
            onClick={() => handleQuickFilterTier('unicorn')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterTier === 'unicorn'
                ? 'bg-purple-900/60 text-purple-200 border border-purple-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            🦄 A+ Steals
          </button>

          <button
            onClick={() => handleQuickFilterTier('strong')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterTier === 'strong'
                ? 'bg-green-900/60 text-green-200 border border-green-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            📈 A Great Value
          </button>

          <button
            onClick={() => dispatch({ type: 'SET_MAX_PRICE', payload: maxPrice === 15 ? null : 15 })}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              maxPrice === 15
                ? 'bg-bourbon-500 text-smoke-950 font-bold shadow-md shadow-bourbon-500/30'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            💵 Under $15 ⭐
          </button>

          <button
            onClick={() => handleQuickFilterPrice('15to25')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterPrice === '15to25'
                ? 'bg-bourbon-900/60 text-bourbon-200 border border-bourbon-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            💰 $15 - $25
          </button>

          <button
            onClick={() => handleQuickFilterType('wheated')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterType === 'wheated'
                ? 'bg-bourbon-900/60 text-bourbon-200 border border-bourbon-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            🌾 Wheated
          </button>

          <button
            onClick={() => handleQuickFilterType('rye')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterType === 'rye'
                ? 'bg-bourbon-900/60 text-bourbon-200 border border-bourbon-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            🌶️ Rye
          </button>

          <button
            onClick={() => handleQuickFilterType('barrel proof')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterType === 'barrel proof'
                ? 'bg-bourbon-900/60 text-bourbon-200 border border-bourbon-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            🔥 Cask Strength
          </button>

          <button
            onClick={() => handleQuickFilterType('bond')}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterType === 'bond'
                ? 'bg-bourbon-900/60 text-bourbon-200 border border-bourbon-500'
                : 'bg-smoke-900/80 text-smoke-400 border border-smoke-800'
            }`}
          >
            📜 In Bond
          </button>
        </div>

        {/* Sort Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 -mx-1 px-1 scrollbar-hide text-[11px]">
          <span className="text-smoke-600 font-medium mr-0.5">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.field}
              onClick={() => dispatch({ type: 'SET_SORT', payload: { field: opt.field } })}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-all"
              style={{
                background: sortBy === opt.field ? 'rgba(201,115,32,0.2)' : 'rgba(26,23,18,0.7)',
                color: sortBy === opt.field ? '#e8b85c' : '#736758',
                border: `1px solid ${sortBy === opt.field ? 'rgba(201,115,32,0.4)' : 'rgba(107,100,89,0.2)'}`,
              }}
            >
              {opt.label}
              {sortBy === opt.field && <ArrowUpDown className="w-2.5 h-2.5 ml-0.5" />}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filter Drawer */}
      {showAdvanced && (
        <div className="mx-4 mt-3 rounded-2xl border border-smoke-800/80 p-4 space-y-4 bg-smoke-900/95 backdrop-blur-md shadow-xl animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-smoke-800">
            <h3 className="text-xs font-bold text-smoke-200 uppercase tracking-wider">Advanced Filter Matrix</h3>
            <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300">
              Clear All
            </button>
          </div>

          {/* Value Grade Filter */}
          <div>
            <p className="text-[10px] text-smoke-500 uppercase tracking-wide mb-1.5 font-semibold">
              Value Rating Tier
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { id: 'all', label: 'All Ratings' },
                { id: 'unicorn', label: '🦄 A+ (Steal)' },
                { id: 'strong', label: '📈 A (Great Value)' },
                { id: 'fair', label: '⚖️ B / C (Standard/Premium)' },
                { id: 'weak', label: '📉 D / F (Gouging)' },
              ].map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => dispatch({ type: 'SET_FILTER', payload: { key: 'filterTier', value: tier.id } })}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    filterTier === tier.id
                      ? 'border-bourbon-500 bg-bourbon-500/20 text-bourbon-200 font-semibold'
                      : 'border-smoke-800 bg-smoke-950/60 text-smoke-400'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range Filter */}
          <div>
            <p className="text-[10px] text-smoke-500 uppercase tracking-wide mb-1.5 font-semibold">
              Sprig Pour Price
            </p>
            <div className="grid grid-cols-4 gap-1.5 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'under15', label: '≤ $15' },
                { id: '15to25', label: '$15 - $25' },
                { id: 'over25', label: '> $25' },
              ].map((pr) => (
                <button
                  key={pr.id}
                  onClick={() => dispatch({ type: 'SET_FILTER', payload: { key: 'filterPrice', value: pr.id } })}
                  className={`py-1.5 px-2 rounded-xl text-center border transition-all ${
                    filterPrice === pr.id
                      ? 'border-bourbon-500 bg-bourbon-500/20 text-bourbon-200 font-semibold'
                      : 'border-smoke-800 bg-smoke-950/60 text-smoke-400'
                  }`}
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Whiskey Style */}
          <div>
            <p className="text-[10px] text-smoke-500 uppercase tracking-wide mb-1.5 font-semibold">
              Whiskey Style
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {['all', 'Wheated', 'Rye', 'Single Barrel', 'Bottled in Bond', 'Barrel Proof', 'Small Batch'].map((t) => {
                const isSelected = filterType.toLowerCase() === t.toLowerCase()
                return (
                  <button
                    key={t}
                    onClick={() => dispatch({ type: 'SET_FILTER', payload: { key: 'filterType', value: t === 'all' ? 'all' : t } })}
                    className={`px-2.5 py-1 rounded-lg border transition-all ${
                      isSelected
                        ? 'border-bourbon-500 bg-bourbon-500/20 text-bourbon-200 font-semibold'
                        : 'border-smoke-800 bg-smoke-950/60 text-smoke-400'
                    }`}
                  >
                    {t === 'all' ? 'All Styles' : t}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Distillery Dropdown */}
          {distilleries.length > 0 && (
            <div>
              <p className="text-[10px] text-smoke-500 uppercase tracking-wide mb-1.5 font-semibold">
                Producer / Distillery
              </p>
              <select
                value={filterDistillery}
                onChange={(e) => dispatch({ type: 'SET_FILTER', payload: { key: 'filterDistillery', value: e.target.value } })}
                className="w-full bg-smoke-950/80 border border-smoke-800 rounded-xl px-3 py-2 text-xs text-smoke-200 focus:outline-none focus:border-bourbon-500"
              >
                <option value="all">All Distilleries ({distilleries.length})</option>
                {distilleries.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Top Price Slider & Quick Selector */}
      <div className="px-4 mt-3">
        <PriceSliderBar />
      </div>

      {/* Active Filter Notice */}
      {hasActiveFilters && (
        <div className="mx-4 mt-1 flex items-center justify-between text-xs text-smoke-400 bg-smoke-900/60 py-1.5 px-3 rounded-xl border border-smoke-800/80">
          <span>Active filters &middot; {filtered.length} matching</span>
          <button onClick={clearAll} className="text-bourbon-400 font-semibold underline">
            Reset All
          </button>
        </div>
      )}

      {/* Results List */}
      <div className="px-4 mt-3 space-y-2">
        {filtered.length > 0 ? (
          filtered.map((b) => <BourbonCard key={b.id} bourbon={b} />)
        ) : (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-smoke-300 font-semibold text-sm">No bourbons match this filter combination.</p>
            <p className="text-smoke-500 text-xs mt-1">Try resetting your filters or broadening your search terms.</p>
            <button
              onClick={clearAll}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-bourbon-500 text-smoke-950 shadow-lg active:scale-95 transition-all"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
