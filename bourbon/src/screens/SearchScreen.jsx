import { Search as SearchIcon, X, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useRef } from 'react'
import { useBourbon } from '../context/BourbonContext'
import BourbonCard from '../components/BourbonCard'

const QUICK_FILTERS = [
  { label: '≤ $15 ⭐ (Sweet Spot)', maxPrice: 15 },
  { label: '🦄 Unicorns', query: 'unicorn' },
  { label: 'Wheated', query: 'wheat' },
  { label: 'Rye', query: 'rye' },
  { label: 'High Proof (110+)', query: 'barrel proof' },
  { label: 'Single Barrel', query: 'single barrel' },
  { label: 'Bottled in Bond', query: 'bond' },
  { label: 'Buffalo Trace', query: 'buffalo' },
  { label: 'Weller', query: 'weller' },
]

export default function SearchScreen() {
  const { searchQuery, maxPrice, filtered, data, dispatch } = useBourbon()
  const inputRef = useRef(null)

  const handleClear = () => {
    dispatch({ type: 'SET_SEARCH', payload: '' })
    if (inputRef.current) inputRef.current.focus()
  }

  const handleQuickFilter = (chip) => {
    if (chip.maxPrice !== undefined) {
      dispatch({
        type: 'SET_MAX_PRICE',
        payload: maxPrice === chip.maxPrice ? null : chip.maxPrice,
      })
    } else {
      const active = searchQuery.toLowerCase() === chip.query.toLowerCase()
      dispatch({ type: 'SET_SEARCH', payload: active ? '' : chip.query })
    }
  }

  return (
    <div className="min-h-screen pb-28">
      {/* Header & Search Input */}
      <div className="sticky top-0 z-20 glass-panel border-b border-smoke-800/50 px-4 pt-12 pb-3">
        <h1 className="font-display text-lg font-bold text-smoke-100 mb-2">Live Search</h1>

        {/* Input box */}
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-smoke-500" />
          <input
            ref={inputRef}
            id="bourbon-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
            placeholder="Search by bottle, distillery, notes, proof..."
            className="search-input pl-10 pr-9"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-smoke-500 hover:text-smoke-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex gap-1.5 overflow-x-auto pt-2.5 pb-0.5 -mx-1 px-1 scrollbar-hide">
          {QUICK_FILTERS.map((chip) => {
            const active =
              chip.maxPrice !== undefined
                ? maxPrice === chip.maxPrice
                : searchQuery.toLowerCase() === chip.query.toLowerCase()

            return (
              <button
                key={chip.label}
                onClick={() => handleQuickFilter(chip)}
                className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: active ? 'rgba(201,115,32,0.3)' : 'rgba(26,23,18,0.7)',
                  color: active ? '#e8b85c' : '#a89f91',
                  border: `1px solid ${active ? 'rgba(201,115,32,0.6)' : 'rgba(107,100,89,0.3)'}`,
                }}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Results Content */}
      <div className="px-4 mt-3">
        <div className="flex items-center justify-between text-xs text-smoke-500 mb-2">
          <span>{searchQuery ? `Results for "${searchQuery}"` : 'All Available Pours'}</span>
          <span>{filtered.length} matches</span>
        </div>

        <div className="space-y-2">
          {filtered.length > 0 ? (
            filtered.map((b) => <BourbonCard key={b.id} bourbon={b} />)
          ) : (
            <div className="text-center py-16">
              <p className="text-3xl mb-2">🥃</p>
              <p className="text-smoke-400 text-sm">No bourbons found matching that query.</p>
              <p className="text-smoke-600 text-xs mt-1">Try searching for a distillery like "Heaven Hill" or "Willet"</p>
              <button
                onClick={handleClear}
                className="mt-4 px-4 py-1.5 rounded-lg text-xs font-medium text-bourbon-400 bg-smoke-900 border border-smoke-800"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
