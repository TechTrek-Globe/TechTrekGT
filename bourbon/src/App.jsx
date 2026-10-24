import { Crosshair, Layers, RefreshCw, Search, Zap } from 'lucide-react'
import { BourbonProvider, useBourbon } from './context/BourbonContext'
import LoadingScreen from './components/LoadingScreen'
import BottomNav from './components/BottomNav'
import BourbonDetail from './components/BourbonDetail'
import RadarScreen from './screens/RadarScreen'
import ExplorerScreen from './screens/ExplorerScreen'
import SearchScreen from './screens/SearchScreen'
import SommelierScreen from './screens/SommelierScreen'

const DESKTOP_TABS = [
  { id: 'radar',    label: 'Radar',    icon: Zap },
  { id: 'explorer', label: 'Explorer', icon: Layers },
  { id: 'search',   label: 'Search',   icon: Search },
  { id: 'about',    label: 'Sommelier',icon: Crosshair },
]

function AppContent() {
  const { loading, error, activeTab, data, unicorns, dataSource, reload, dispatch } = useBourbon()

  if (loading && data.length === 0) {
    return <LoadingScreen />
  }

  if (error && data.length === 0) {
    return <LoadingScreen error={error} />
  }

  return (
    <div className="relative min-h-screen bg-smoke-950 text-smoke-100 flex flex-col font-body w-full max-w-7xl mx-auto shadow-2xl">
      {/* Desktop Top Navigation (hidden on mobile) */}
      <header className="hidden md:flex items-center justify-between px-6 py-4 border-b border-smoke-800/60 glass-panel sticky top-0 z-30 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-bourbon-500/20 border border-bourbon-500/40 flex items-center justify-center text-xl shadow-inner">
            🥃
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base font-bold text-smoke-100 tracking-wide">
                Brown Water Society
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-bourbon-500/20 text-bourbon-300 border border-bourbon-500/30">
                Sprig Sommelier
              </span>
            </div>
            <p className="text-smoke-500 text-xs">
              Mathematical Spirits Intelligence &middot; {data.length} Pours Indexed
            </p>
          </div>
        </div>

        {/* Desktop Nav Tabs */}
        <nav className="flex items-center gap-1 bg-smoke-950/80 p-1 rounded-xl border border-smoke-800/80">
          {DESKTOP_TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => dispatch({ type: 'SET_TAB', payload: id })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? 'bg-bourbon-500 text-smoke-950 shadow-md shadow-bourbon-500/25'
                    : 'text-smoke-400 hover:text-smoke-200 hover:bg-smoke-900/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {id === 'radar' && unicorns.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      active
                        ? 'bg-smoke-950 text-bourbon-300'
                        : 'bg-purple-900/60 text-purple-200 border border-purple-500/40'
                    }`}
                  >
                    {unicorns.length}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Live sync status & refresh */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden lg:block">
            <p className="text-[10px] text-smoke-500 uppercase tracking-wider font-mono">Sync Source</p>
            <p className="text-xs text-smoke-300 font-mono">
              {dataSource === 'live' ? '🟢 Live Sheet' : dataSource === 'cache' ? '🟡 Edge Cache' : '⚪ Static Seed'}
            </p>
          </div>
          <button
            onClick={reload}
            disabled={loading}
            className="p-2.5 rounded-xl bg-smoke-900/80 border border-smoke-800 hover:border-smoke-700 text-smoke-300 hover:text-smoke-100 active:scale-95 transition-all"
            title="Refresh Catalog Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-bourbon-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Active Tab Screen */}
      <main className="flex-1 w-full">
        {activeTab === 'radar' && <RadarScreen />}
        {activeTab === 'explorer' && <ExplorerScreen />}
        {activeTab === 'search' && <SearchScreen />}
        {activeTab === 'about' && <SommelierScreen />}
      </main>

      {/* Selected Bourbon Modal / Sheet */}
      <BourbonDetail />

      {/* Bottom Sticky Navigation (Mobile) */}
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <BourbonProvider>
      <AppContent />
    </BourbonProvider>
  )
}
