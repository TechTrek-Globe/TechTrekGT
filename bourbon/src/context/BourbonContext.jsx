import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'
import { fetchBourbonData } from '../data/sheetService'

const BourbonContext = createContext(null)

const INITIAL_STATE = {
  data: [],
  headers: [],
  loading: false,
  error: null,
  lastUpdated: null,
  dataSource: 'loading',
  searchQuery: '',
  activeTab: 'radar',       // 'radar' | 'explorer' | 'search' | 'about'
  sortBy: 'valueScore',     // 'valueScore' | 'sprigPrice' | 'fairPrice' | 'name' | 'msrp'
  sortDir: 'desc',
  filterTier: 'all',        // 'all' | 'unicorn' | 'strong' | 'fair' | 'weak'
  filterPrice: 'all',       // 'all' | 'under15' | '15to25' | 'over25'
  maxPrice: null,           // numeric cap e.g. 15 or null
  filterType: 'all',        // 'all' | 'wheated' | 'rye' | 'barrel proof' | 'single barrel' | 'bond'
  filterDistillery: 'all',
  selectedBourbon: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return {
        ...state,
        loading: false,
        data: action.payload.data,
        headers: action.payload.headers,
        lastUpdated: action.payload.lastUpdated,
        dataSource: action.payload.source || 'live',
      }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload }
    case 'SET_TAB':
      return { ...state, activeTab: action.payload }
    case 'SET_SORT':
      return {
        ...state,
        sortBy: action.payload.field,
        sortDir: state.sortBy === action.payload.field && state.sortDir === 'desc' ? 'asc' : 'desc',
      }
    case 'SET_FILTER':
      return { ...state, [action.payload.key]: action.payload.value }
    case 'SET_MAX_PRICE':
      return { ...state, maxPrice: action.payload, filterPrice: 'all' }
    case 'CLEAR_FILTERS':
      return {
        ...state,
        filterTier: 'all',
        filterPrice: 'all',
        maxPrice: null,
        filterType: 'all',
        filterDistillery: 'all',
        searchQuery: '',
      }
    case 'SELECT_BOURBON':
      return { ...state, selectedBourbon: action.payload }
    default:
      return state
  }
}

export function BourbonProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  const loadData = useCallback(async () => {
    dispatch({ type: 'FETCH_START' })
    try {
      const result = await fetchBourbonData()
      dispatch({ type: 'FETCH_SUCCESS', payload: result })
    } catch (err) {
      dispatch({ type: 'FETCH_ERROR', payload: err.message })
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Robust multi-factor filtering engine
  const filtered = state.data.filter((b) => {
    // 1. Text Search query
    const q = state.searchQuery.trim().toLowerCase()
    let matchQ = true
    if (q) {
      if (q === 'unicorn' || q === 'unicorns') {
        matchQ = b.isUnicorn || b.tier === 'unicorn' || (b.valueRating && b.valueRating.includes('A+'))
      } else if (q === 'wheat' || q === 'wheated') {
        matchQ = b.type.toLowerCase().includes('wheat') || b.name.toLowerCase().includes('wheat') || b.notes.toLowerCase().includes('wheat')
      } else if (q === 'rye') {
        matchQ = b.type.toLowerCase().includes('rye') || b.name.toLowerCase().includes('rye')
      } else if (q === 'barrel proof' || q === 'cask strength' || q.includes('110')) {
        matchQ = (b.proof && b.proof >= 110) || b.type.toLowerCase().includes('barrel proof') || b.name.toLowerCase().includes('cask')
      } else if (q === 'bond' || q === 'bottled in bond') {
        matchQ = b.proof === 100 || b.type.toLowerCase().includes('bond') || b.name.toLowerCase().includes('bond')
      } else if (q === 'single barrel') {
        matchQ = b.type.toLowerCase().includes('single barrel') || b.name.toLowerCase().includes('single barrel')
      } else {
        matchQ =
          b.name.toLowerCase().includes(q) ||
          b.distillery.toLowerCase().includes(q) ||
          b.type.toLowerCase().includes(q) ||
          b.notes.toLowerCase().includes(q) ||
          (b.valueRating && b.valueRating.toLowerCase().includes(q))
      }
    }

    // 2. Value Rating / Tier filter
    let matchTier = true
    if (state.filterTier !== 'all') {
      const t = state.filterTier.toLowerCase()
      if (t === 'unicorn' || t === 'a+' || t === 'steal') {
        matchTier = b.isUnicorn || b.tier === 'unicorn' || (b.valueRating && b.valueRating.toUpperCase().includes('A+'))
      } else if (t === 'strong' || t === 'a') {
        matchTier = b.tier === 'strong' || (b.valueRating && b.valueRating.toUpperCase().startsWith('A') && !b.valueRating.toUpperCase().includes('A+'))
      } else if (t === 'fair' || t === 'b' || t === 'c') {
        matchTier = b.tier === 'fair' || (b.valueRating && (b.valueRating.toUpperCase().startsWith('B') || b.valueRating.toUpperCase().startsWith('C')))
      } else if (t === 'weak' || t === 'd' || t === 'f' || t === 'gouging') {
        matchTier = b.tier === 'weak' || (b.valueRating && (b.valueRating.toUpperCase().startsWith('D') || b.valueRating.toUpperCase().startsWith('F')))
      } else {
        matchTier = b.tier === state.filterTier || (b.valueRating && b.valueRating.toLowerCase().includes(t))
      }
    }

    // 3. Price Filter (maxPrice slider cap or bracket)
    let matchPrice = true
    if (state.maxPrice !== null && state.maxPrice !== undefined) {
      matchPrice = b.sprigPrice !== null && b.sprigPrice <= state.maxPrice
    } else if (state.filterPrice !== 'all') {
      const price = b.sprigPrice
      if (price === null) {
        matchPrice = false
      } else if (state.filterPrice === 'under15') {
        matchPrice = price <= 15
      } else if (state.filterPrice === '15to25') {
        matchPrice = price > 15 && price <= 25
      } else if (state.filterPrice === 'over25') {
        matchPrice = price > 25
      }
    }

    // 4. Style / Type filter
    let matchType = true
    if (state.filterType !== 'all') {
      const filterT = state.filterType.toLowerCase()
      matchType =
        b.type.toLowerCase().includes(filterT) ||
        b.name.toLowerCase().includes(filterT) ||
        b.notes.toLowerCase().includes(filterT)
    }

    // 5. Distillery filter
    let matchDistillery = true
    if (state.filterDistillery !== 'all') {
      matchDistillery = b.distillery === state.filterDistillery
    }

    return matchQ && matchTier && matchPrice && matchType && matchDistillery
  })

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    const field = state.sortBy
    const av = a[field] ?? -Infinity
    const bv = b[field] ?? -Infinity
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
    return state.sortDir === 'asc' ? cmp : -cmp
  })

  // Aggregates for statistics and quick counts
  const unicorns = state.data.filter((b) => b.isUnicorn || (b.valueRating && b.valueRating.includes('A+')))
  const strongValues = state.data.filter((b) => b.tier === 'strong' || (b.valueRating && b.valueRating.startsWith('A') && !b.valueRating.includes('A+')))
  const stealandGreat = state.data.filter((b) => b.isUnicorn || b.tier === 'strong')

  const distilleries = [...new Set(state.data.map((b) => b.distillery).filter(Boolean))].sort()
  const types = ['Wheated Bourbon', 'Rye Whiskey', 'Single Barrel', 'Bottled in Bond', 'Barrel Proof', 'Small Batch']

  const validScores = state.data.filter((b) => b.valueScore !== null)
  const avgValueScore = validScores.length
    ? Math.round(validScores.reduce((s, b) => s + b.valueScore, 0) / validScores.length)
    : 0

  const value = {
    ...state,
    filtered: sorted,
    unicorns,
    strongValues,
    stealandGreat,
    distilleries,
    types,
    avgValueScore,
    totalCount: state.data.length,
    filteredCount: sorted.length,
    dispatch,
    reload: loadData,
  }

  return <BourbonContext.Provider value={value}>{children}</BourbonContext.Provider>
}

export function useBourbon() {
  const ctx = useContext(BourbonContext)
  if (!ctx) throw new Error('useBourbon must be used within BourbonProvider')
  return ctx
}
