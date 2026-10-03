import { Crosshair, Layers, Search, Zap } from 'lucide-react'
import { useBourbon } from '../context/BourbonContext'

const TABS = [
  { id: 'radar',    label: 'Radar',    icon: Zap },
  { id: 'explorer', label: 'Explorer', icon: Layers },
  { id: 'search',   label: 'Search',   icon: Search },
  { id: 'about',    label: 'Sommelier',icon: Crosshair },
]

export default function BottomNav() {
  const { activeTab, dispatch } = useBourbon()

  return (
    <nav
      id="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-smoke-800/60 pb-safe"
    >
      <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              id={`nav-${id}`}
              onClick={() => dispatch({ type: 'SET_TAB', payload: id })}
              className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 active:scale-90"
              style={{
                color: active ? '#e8b85c' : '#6b6459',
              }}
            >
              <Icon
                className="w-5 h-5 transition-all duration-200"
                strokeWidth={active ? 2.5 : 1.5}
              />
              <span
                className="text-[10px] font-medium transition-all duration-200"
                style={{ color: active ? '#e8b85c' : '#6b6459' }}
              >
                {label}
              </span>
              {active && (
                <div className="w-1 h-1 rounded-full bg-bourbon-400 mt-0.5" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
