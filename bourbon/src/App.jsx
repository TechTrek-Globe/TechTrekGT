import { BourbonProvider, useBourbon } from './context/BourbonContext'
import LoadingScreen from './components/LoadingScreen'
import BottomNav from './components/BottomNav'
import BourbonDetail from './components/BourbonDetail'
import RadarScreen from './screens/RadarScreen'
import ExplorerScreen from './screens/ExplorerScreen'
import SearchScreen from './screens/SearchScreen'
import SommelierScreen from './screens/SommelierScreen'

function AppContent() {
  const { loading, error, activeTab, data } = useBourbon()

  if (loading && data.length === 0) {
    return <LoadingScreen />
  }

  if (error && data.length === 0) {
    return <LoadingScreen error={error} />
  }

  return (
    <div className="relative min-h-screen bg-smoke-950 text-smoke-100 flex flex-col font-body max-w-md mx-auto shadow-2xl">
      {/* Active Tab Screen */}
      <main className="flex-1 w-full">
        {activeTab === 'radar' && <RadarScreen />}
        {activeTab === 'explorer' && <ExplorerScreen />}
        {activeTab === 'search' && <SearchScreen />}
        {activeTab === 'about' && <SommelierScreen />}
      </main>

      {/* Selected Bourbon Modal / Sheet */}
      <BourbonDetail />

      {/* Bottom Sticky Navigation */}
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
