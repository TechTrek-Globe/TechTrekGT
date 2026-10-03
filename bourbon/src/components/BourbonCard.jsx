import { ChevronRight, Star, TrendingDown, TrendingUp, Sparkles } from 'lucide-react'
import { useBourbon } from '../context/BourbonContext'

function extractGrade(valueRating) {
  if (!valueRating) return null
  const vr = valueRating.toUpperCase()
  if (vr.includes('A+')) return 'A+'
  if (vr.startsWith('A')) return 'A'
  if (vr.startsWith('B')) return 'B'
  if (vr.startsWith('C')) return 'C'
  if (vr.startsWith('D')) return 'D'
  if (vr.startsWith('F')) return 'F'
  return null
}

function ValueScoreRing({ score, tier, valueRating, size = 46 }) {
  const radius = (size - 8) / 2
  const circ = 2 * Math.PI * radius
  const capped = Math.max(0, Math.min(100, Math.abs(score ?? 0)))
  const dash = (capped / 100) * circ

  const grade = extractGrade(valueRating)

  const colors = {
    unicorn: '#c084fc',
    strong: '#4ade80',
    fair: '#e8b85c',
    weak: '#f87171',
    unknown: '#9ca3af',
  }

  let color = colors[tier] || colors.unknown
  if (grade === 'A+') color = '#c084fc'
  else if (grade === 'A') color = '#4ade80'
  else if (grade === 'B') color = '#e8b85c'
  else if (grade === 'C') color = '#fbbf24'
  else if (grade === 'D' || grade === 'F') color = '#f87171'

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        />
      </svg>
      <span
        className="absolute text-xs font-bold font-mono tracking-tight"
        style={{ color }}
      >
        {grade || (score !== null ? `${score > 0 ? '+' : ''}${score}%` : '?')}
      </span>
    </div>
  )
}

function TierBadge({ valueRating, tier }) {
  if (valueRating) {
    const vr = valueRating.toUpperCase()
    if (vr.includes('A+') || vr.includes('STEAL')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/50 text-purple-200 border border-purple-500 shadow-sm shadow-purple-500/30">
          🦄 A+ Steal (Unicorn)
        </span>
      )
    }
    if (vr.startsWith('A') || vr.includes('GREAT VALUE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-900/40 text-green-300 border border-green-600/50">
          📈 A Great Value
        </span>
      )
    }
    if (vr.startsWith('B') || vr.includes('FAIR') || vr.includes('STANDARD')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-bourbon-900/40 text-bourbon-300 border border-bourbon-600/50">
          ⚖️ B Fair Bar Rate
        </span>
      )
    }
    if (vr.startsWith('C') || vr.includes('SLIGHT PREMIUM')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-900/30 text-amber-300 border border-amber-600/40">
          ⚖️ C Slight Premium
        </span>
      )
    }
    if (vr.startsWith('D') || vr.startsWith('F') || vr.includes('GOUGING') || vr.includes('OVERPRICED')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/30 text-red-300 border border-red-600/40">
          📉 Gouging
        </span>
      )
    }
  }

  const configs = {
    unicorn: { label: '🦄 A+ Steal', cls: 'tier-unicorn' },
    strong:  { label: '📈 Strong',  cls: 'tier-strong' },
    fair:    { label: '⚖️ Fair',    cls: 'tier-fair' },
    weak:    { label: '📉 Weak',    cls: 'tier-weak' },
    unknown: { label: '? Unclassified', cls: 'bg-smoke-800/60 text-smoke-400 border border-smoke-700/50' },
  }
  const { label, cls } = configs[tier] || configs.unknown
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

export default function BourbonCard({ bourbon, compact = false }) {
  const { dispatch } = useBourbon()
  const {
    name,
    distillery,
    type,
    proof,
    sprigPrice,
    fairPrice,
    msrp,
    valueScore,
    tier,
    isUnicorn,
    valueRating,
    age,
  } = bourbon

  const handleTap = () => dispatch({ type: 'SELECT_BOURBON', payload: bourbon })

  return (
    <button
      id={`card-${bourbon.id}`}
      onClick={handleTap}
      className="bourbon-card w-full text-left p-3.5 animate-slide-up"
    >
      {/* Unicorn glow overlay */}
      {(isUnicorn || (valueRating && valueRating.includes('A+'))) && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(236,72,153,0.06))',
            boxShadow: 'inset 0 0 0 1px rgba(168,85,247,0.4)',
          }}
        />
      )}

      <div className="flex items-start gap-3">
        {/* Score Ring with Grade inside */}
        <ValueScoreRing score={valueScore} tier={tier} valueRating={valueRating} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-smoke-100 text-sm leading-snug truncate">
                {name}
              </h3>
              {distillery && (
                <p className="text-smoke-500 text-xs mt-0.5 truncate">{distillery}</p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-smoke-600 flex-shrink-0 mt-0.5" />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <TierBadge valueRating={valueRating} tier={tier} />
            {type && (
              <span className="text-[10px] text-smoke-400 bg-smoke-900/80 px-1.5 py-0.5 rounded-md border border-smoke-800">
                {type}
              </span>
            )}
            {age && (
              <span className="text-[10px] text-smoke-400 bg-smoke-900/80 px-1.5 py-0.5 rounded-md border border-smoke-800">
                {age}
              </span>
            )}
            {proof && (
              <span className="text-[10px] text-smoke-400 bg-smoke-900/80 px-1.5 py-0.5 rounded-md border border-smoke-800">
                {proof}°
              </span>
            )}
          </div>

          {!compact && (
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              {sprigPrice !== null && (
                <div className="stat-box py-1.5 px-2">
                  <p className="text-[8px] text-smoke-500 uppercase tracking-wide">Sprig Pour</p>
                  <p className="text-bourbon-300 font-semibold font-mono text-xs mt-0.5">
                    ${sprigPrice?.toFixed(2)}
                  </p>
                </div>
              )}
              {fairPrice !== null && (
                <div className="stat-box py-1.5 px-2">
                  <p className="text-[8px] text-smoke-500 uppercase tracking-wide">Fair Bar (3.6x)</p>
                  <p className="text-smoke-300 font-semibold font-mono text-xs mt-0.5">
                    ${fairPrice?.toFixed(2)}
                  </p>
                </div>
              )}
              {msrp !== null && (
                <div className="stat-box py-1.5 px-2">
                  <p className="text-[8px] text-smoke-500 uppercase tracking-wide">Bottle (750ml)</p>
                  <p className="text-smoke-300 font-semibold font-mono text-xs mt-0.5">
                    ${msrp?.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
