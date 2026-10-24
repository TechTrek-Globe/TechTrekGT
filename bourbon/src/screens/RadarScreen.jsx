import { RefreshCw, Sparkles, TrendingUp, Trophy, Zap } from 'lucide-react'
import BourbonCard from '../components/BourbonCard'
import { useBourbon } from '../context/BourbonContext'

function StatPill({ icon: Icon, label, value, color = 'bourbon' }) {
  const colorMap = {
    bourbon: 'from-bourbon-800/40 to-bourbon-900/40 border-bourbon-700/40 text-bourbon-300',
    purple: 'from-purple-900/40 to-purple-950/40 border-purple-700/40 text-purple-300',
    green: 'from-green-900/40 to-green-950/40 border-green-700/40 text-green-300',
    smoke: 'from-smoke-800/40 to-smoke-900/40 border-smoke-700/40 text-smoke-300',
  }
  return (
    <div className={`rounded-xl p-3 border bg-gradient-to-br ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 opacity-70" />
        <p className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">{label}</p>
      </div>
      <p className="font-bold font-mono text-xl">{value}</p>
    </div>
  )
}

export default function RadarScreen() {
  const { data, unicorns, avgValueScore, loading, lastUpdated, reload } = useBourbon()

  const topUnicorns = unicorns.slice(0, 5)
  const topValue = [...data]
    .filter(b => b.valueScore !== null && !b.isUnicorn)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 5)

  const formatTime = (d) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div
        className="relative px-4 sm:px-6 lg:px-8 pt-8 md:pt-4 pb-6 sm:pb-8 overflow-hidden rounded-b-2xl sm:rounded-b-3xl"
        style={{ background: 'linear-gradient(180deg, #1a0d04 0%, #0d0c09 100%)' }}
      >
        {/* Ambient glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-36 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #e8b85c, transparent)' }}
        />
        <div className="relative max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl sm:text-3xl">🥃</span>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-smoke-50">Brown Water Society</h1>
                <p className="text-smoke-500 text-xs sm:text-sm">Sprig Bourbon Sommelier &middot; Mathematical Valuation Radar</p>
              </div>
            </div>
            <button
              id="refresh-btn"
              onClick={reload}
              disabled={loading}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-smoke-900/60 border border-smoke-800/60 flex items-center justify-center active:scale-90 transition-transform md:hidden"
              title="Refresh Catalog Data"
            >
              <RefreshCw className={`w-4 h-4 text-smoke-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-smoke-600 text-[11px] sm:text-xs">
            Last sync: {formatTime(lastUpdated)} &middot; {data.length} bourbons indexed &middot; Live Google Sheets edge pipeline
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mt-4 space-y-6 pb-28 md:pb-12">
        {/* Stats grid: 2 cols on mobile, 4 cols on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <StatPill
            icon={Trophy}
            label="Unicorns Found"
            value={unicorns.length}
            color="purple"
          />
          <StatPill
            icon={TrendingUp}
            label="Avg Value Score"
            value={avgValueScore ? `+${avgValueScore}%` : 'N/A'}
            color="green"
          />
          <StatPill
            icon={Zap}
            label="Total Indexed"
            value={data.length}
            color="bourbon"
          />
          <StatPill
            icon={Sparkles}
            label="Strong Value Pours"
            value={data.filter(b => b.tier === 'strong').length}
            color="smoke"
          />
        </div>

        {/* Unicorn section: multi-column grid on desktop */}
        {topUnicorns.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="unicorn-badge text-xs px-2.5 py-1">🦄 Mathematical Unicorns</div>
                <span className="text-smoke-500 text-xs font-mono">{unicorns.length} found</span>
              </div>
              {unicorns.length > 5 && (
                <span className="text-smoke-500 text-xs">
                  Top 5 highlighted &middot; Explore all in catalog
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {topUnicorns.map(b => (
                <BourbonCard key={b.id} bourbon={b} />
              ))}
            </div>
          </section>
        )}

        {/* Top Value section: multi-column grid on desktop */}
        {topValue.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <h2 className="text-smoke-200 font-semibold text-sm sm:text-base">Top Value Pours (Under Fair Bar Rate)</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {topValue.map(b => (
                <BourbonCard key={b.id} bourbon={b} />
              ))}
            </div>
          </section>
        )}

        {data.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🥃</p>
            <p className="text-smoke-400 text-sm">No data loaded yet.</p>
            <p className="text-smoke-600 text-xs mt-1">Check that your sheet is publicly readable.</p>
          </div>
        )}
      </div>
    </div>
  )
}
