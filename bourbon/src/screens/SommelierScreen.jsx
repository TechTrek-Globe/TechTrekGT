import { useState, useMemo } from 'react'
import { Sparkles, Trophy, Compass, Plus, Trash2, ChevronRight, Flame, Wine, DollarSign, Award, Bot, RefreshCw } from 'lucide-react'
import { useBourbon } from '../context/BourbonContext'

const FLAVOR_PROFILES = [
  {
    id: 'wheated',
    name: 'Sweet & Wheated',
    icon: '🌾',
    desc: 'Soft, velvety, caramel, honey, vanilla. Gentle on the palate.',
    keywords: ['wheat', 'weller', 'maker', 'vanilla', 'sweet', 'caramel', 'honey', 'soft']
  },
  {
    id: 'oaky',
    name: 'Rich, Aged & Oaky',
    icon: '🪵',
    desc: 'Deep char, antique oak, tobacco leaf, leather, dark cocoa.',
    keywords: ['oak', 'age', 'wood', 'tobacco', 'leather', 'chocolate', 'char', '10', '12', '15']
  },
  {
    id: 'spicy',
    name: 'Spicy & Rye-Forward',
    icon: '🌶️',
    desc: 'Cinnamon, nutmeg, baking spice, cracked pepper, mint.',
    keywords: ['rye', 'spice', 'pepper', 'cinnamon', 'mint', 'clove']
  },
  {
    id: 'cask',
    name: 'High Proof / Cask Strength',
    icon: '🔥',
    desc: 'Uncut, unfiltered, 110°+ proof. Explosive flavor and long finish.',
    minProof: 110,
    keywords: ['barrel proof', 'cask strength', 'full proof', 'uncut', 'hazmat', '120']
  },
  {
    id: 'budget_alpha',
    name: 'Under $15 Value Steals',
    icon: '🎯',
    desc: 'Sub-$15 pours where the math beats secondary retail hands down.',
    maxPrice: 15,
    minScore: 10,
    keywords: []
  }
]

export default function SommelierScreen() {
  const { data, unicorns, dispatch } = useBourbon()
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [flight, setFlight] = useState([])
  const [sommelierPrompt, setSommelierPrompt] = useState('')
  const [sommelierAnswer, setSommelierAnswer] = useState(null)

  // Profile-based recommendations
  const profileRecommendations = useMemo(() => {
    if (!selectedProfile) return []
    const prof = FLAVOR_PROFILES.find(p => p.id === selectedProfile)
    if (!prof) return []

    return data.filter(b => {
      if (prof.minProof && (!b.proof || b.proof < prof.minProof)) return false
      if (prof.maxPrice && (b.sprigPrice === null || b.sprigPrice > prof.maxPrice)) return false
      if (prof.minScore && (b.valueScore === null || b.valueScore < prof.minScore)) return false

      if (prof.keywords.length > 0) {
        const text = `${b.name} ${b.distillery} ${b.type} ${b.notes}`.toLowerCase()
        return prof.keywords.some(k => text.includes(k))
      }
      return true
    }).sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0)).slice(0, 6)
  }, [selectedProfile, data])

  // Flight calculations
  const flightStats = useMemo(() => {
    const totalSprig = flight.reduce((sum, b) => sum + (b.sprigPrice || 0), 0)
    const validProofs = flight.filter(b => b.proof)
    const avgProof = validProofs.length > 0
      ? (validProofs.reduce((sum, b) => sum + b.proof, 0) / validProofs.length).toFixed(1)
      : null
    const validScores = flight.filter(b => b.valueScore !== null)
    const avgScore = validScores.length > 0
      ? Math.round(validScores.reduce((sum, b) => sum + b.valueScore, 0) / validScores.length)
      : null
    return { totalSprig, avgProof, avgScore }
  }, [flight])

  const addToFlight = (bourbon) => {
    if (flight.length >= 4) return
    if (!flight.some(b => b.id === bourbon.id)) {
      setFlight(prev => [...prev, bourbon])
    }
  }

  const removeFromFlight = (id) => {
    setFlight(prev => prev.filter(b => b.id !== id))
  }

  // Brown Water Society Sommelier Q&A Logic
  const handleConsultSommelier = (e) => {
    e.preventDefault()
    if (!sommelierPrompt.trim()) return

    const query = sommelierPrompt.toLowerCase()
    let answerText = ''
    let recommendedPours = []

    // Pattern matching against inventory
    if (query.includes('unicorn') || query.includes('rare') || query.includes('best value') || query.includes('math')) {
      const topPours = [...unicorns].slice(0, 3)
      if (topPours.length > 0) {
        recommendedPours = topPours
        answerText = `By Brown Water Society mathematical protocols, our highest-alpha inventory allocation right now is ${topPours.map(p => `"${p.name}" (Sprig: $${p.sprigPrice?.toFixed(2) || '?'}, Value: +${p.valueScore}%)`).join(', ')}. Order one before the barrel runs dry.`
      } else {
        const topScores = [...data].sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0)).slice(0, 3)
        recommendedPours = topScores
        answerText = `Top mathematical value pours currently on the grid: ${topScores.map(p => `"${p.name}" (+${p.valueScore}%)`).join(', ')}.`
      }
    } else if (query.includes('under') || query.includes('cheap') || query.includes('budget') || query.includes('$15') || query.includes('$10') || query.includes('$12')) {
      const budget = data.filter(b => b.sprigPrice && b.sprigPrice <= 15).sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0)).slice(0, 3)
      recommendedPours = budget
      answerText = `Looking for high-yield sips under $15? Sprig's grid reveals ${budget.map(b => `"${b.name}" at $${b.sprigPrice.toFixed(2)} (+${b.valueScore}% vs MSRP/oz)`).join(', ')}. Maximum satisfaction, zero wallet remorse.`
    } else if (query.includes('strong') || query.includes('cask') || query.includes('proof') || query.includes('hazmat') || query.includes('hot')) {
      const highProof = data.filter(b => b.proof && b.proof >= 110).sort((a, b) => b.proof - a.proof).slice(0, 3)
      recommendedPours = highProof
      answerText = `If you have the palate for heat and unadulterated cask strength, consult: ${highProof.map(b => `"${b.name}" at ${b.proof}° proof`).join(', ')}. Pour neat, let it breathe 5 minutes, and take a Kentucky chew.`
    } else {
      // General search against name / distillery
      const matches = data.filter(b =>
        b.name.toLowerCase().includes(query) ||
        b.distillery.toLowerCase().includes(query) ||
        b.type.toLowerCase().includes(query) ||
        b.notes.toLowerCase().includes(query)
      ).slice(0, 3)

      if (matches.length > 0) {
        recommendedPours = matches
        answerText = `Regarding "${sommelierPrompt}": On the Sprig grid, I recommend ${matches.map(m => `"${m.name}" ($${m.sprigPrice ? m.sprigPrice.toFixed(2) : '?'})`).join(', ')}. Each presents a distinct mathematical and sensory profile.`
      } else {
        const topAlpha = [...data].sort((a, b) => (b.valueScore ?? 0) - (a.valueScore ?? 0)).slice(0, 2)
        recommendedPours = topAlpha
        answerText = `I don't see an exact hit for "${sommelierPrompt}", but the Brown Water Society data engine won't let you leave empty-handed. Try "${topAlpha[0]?.name}" ($${topAlpha[0]?.sprigPrice?.toFixed(2)}) for undisputed mathematical superiority.`
      }
    }

    setSommelierAnswer({
      text: answerText,
      pours: recommendedPours
    })
  }

  return (
    <div className="min-h-screen pb-32">
      {/* Top Header */}
      <div className="glass-panel border-b border-smoke-800/50 px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-bourbon-500/20 border border-bourbon-500/40 flex items-center justify-center">
            <Award className="w-4 h-4 text-bourbon-400" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-smoke-100">Brown Water Sommelier</h1>
            <p className="text-smoke-500 text-xs">Mathematical Unicorns & Curated Flights</p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-6">
        {/* Interactive Sommelier Consultation */}
        <section className="bourbon-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-bourbon-400" />
            <h2 className="font-display font-semibold text-sm text-smoke-100">Ask the Data Sommelier</h2>
          </div>
          <p className="text-smoke-400 text-xs mb-3">
            Inquire about unicorn pours, proof profiles, budget alpha, or specific flavor requests.
          </p>

          <form onSubmit={handleConsultSommelier} className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={sommelierPrompt}
                onChange={(e) => setSommelierPrompt(e.target.value)}
                placeholder="e.g. 'Show me the best mathematical unicorn' or 'sweet wheated pour under $16'"
                className="search-input text-xs pr-16"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-bourbon-500 text-smoke-950 active:scale-95 transition-all"
              >
                Ask
              </button>
            </div>
          </form>

          {sommelierAnswer && (
            <div className="mt-3 p-3 rounded-xl bg-smoke-900/90 border border-bourbon-500/30 animate-fade-in">
              <p className="text-smoke-200 text-xs leading-relaxed mb-2 font-body">
                {sommelierAnswer.text}
              </p>
              {sommelierAnswer.pours.length > 0 && (
                <div className="space-y-1.5 mt-2 pt-2 border-t border-smoke-800">
                  {sommelierAnswer.pours.map(b => (
                    <div
                      key={b.id}
                      onClick={() => dispatch({ type: 'SELECT_BOURBON', payload: b })}
                      className="flex items-center justify-between p-2 rounded-lg bg-smoke-950/60 border border-smoke-800/80 cursor-pointer active:scale-98 transition-all"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-smoke-100 truncate">{b.name}</p>
                        <p className="text-[10px] text-smoke-500">{b.distillery || 'Distillery N/A'} &middot; {b.proof ? `${b.proof}°` : 'Proof N/A'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-mono font-bold text-bourbon-400">
                          ${b.sprigPrice ? b.sprigPrice.toFixed(2) : '--'}
                        </span>
                        {b.valueScore !== null && (
                          <p className={`text-[10px] font-mono ${b.valueScore > 0 ? 'text-green-400' : 'text-smoke-500'}`}>
                            {b.valueScore > 0 ? `+${b.valueScore}%` : `${b.valueScore}%`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Custom 3-Pour Flight Builder */}
        <section className="bourbon-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wine className="w-4 h-4 text-bourbon-400" />
              <h2 className="font-display font-semibold text-sm text-smoke-100">Custom Tasting Flight</h2>
            </div>
            <span className="text-[11px] font-mono text-bourbon-400">
              {flight.length}/4 pours
            </span>
          </div>
          <p className="text-smoke-400 text-xs mb-3">
            Build a custom flight directly from the Sprig list to analyze combined math, price, and ABV average.
          </p>

          {flight.length === 0 ? (
            <div className="rounded-xl border border-dashed border-smoke-800 p-4 text-center">
              <p className="text-xs text-smoke-500">Your flight tray is empty.</p>
              <p className="text-[11px] text-smoke-600 mt-1">Tap the "+" button below recommended pours or choose from Explorer.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flight.map((b, idx) => (
                <div key={b.id} className="flex items-center justify-between p-2.5 rounded-xl bg-smoke-900/80 border border-smoke-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-bourbon-500/20 text-bourbon-400 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-smoke-100 truncate">{b.name}</p>
                      <p className="text-[10px] text-smoke-500">{b.proof ? `${b.proof}°` : 'Proof N/A'} &middot; Sprig: ${b.sprigPrice?.toFixed(2) || '?'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromFlight(b.id)}
                    className="p-1.5 text-smoke-500 hover:text-red-400 active:scale-90 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {/* Flight Summary Bar */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-smoke-800/80">
                <div className="stat-box text-center">
                  <p className="text-[9px] text-smoke-500 uppercase">Total Sprig</p>
                  <p className="text-xs font-mono font-bold text-bourbon-300 mt-0.5">${flightStats.totalSprig.toFixed(2)}</p>
                </div>
                <div className="stat-box text-center">
                  <p className="text-[9px] text-smoke-500 uppercase">Avg Proof</p>
                  <p className="text-xs font-mono font-bold text-smoke-200 mt-0.5">{flightStats.avgProof ? `${flightStats.avgProof}°` : '--'}</p>
                </div>
                <div className="stat-box text-center">
                  <p className="text-[9px] text-smoke-500 uppercase">Avg Value</p>
                  <p className={`text-xs font-mono font-bold mt-0.5 ${flightStats.avgScore > 0 ? 'text-green-400' : 'text-smoke-300'}`}>
                    {flightStats.avgScore !== null ? `+${flightStats.avgScore}%` : '--'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Curated Flavor Journey Archetypes */}
        <section>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Compass className="w-4 h-4 text-bourbon-400" />
            <h2 className="font-display font-semibold text-sm text-smoke-100">Flavor Archetypes</h2>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {FLAVOR_PROFILES.map(prof => {
              const isSelected = selectedProfile === prof.id
              return (
                <div
                  key={prof.id}
                  onClick={() => setSelectedProfile(isSelected ? null : prof.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-bourbon-500/60 bg-bourbon-950/40 shadow-lg shadow-bourbon-500/10'
                      : 'border-smoke-800/60 bg-smoke-900/40 hover:border-smoke-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{prof.icon}</span>
                      <div>
                        <h3 className="text-xs font-semibold text-smoke-100">{prof.name}</h3>
                        <p className="text-[11px] text-smoke-500 mt-0.5">{prof.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-smoke-500 transition-transform ${isSelected ? 'rotate-90 text-bourbon-400' : ''}`} />
                  </div>

                  {/* Expanded matching pours */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-smoke-800/60 space-y-2 animate-fade-in">
                      <p className="text-[10px] text-bourbon-400 font-semibold uppercase tracking-wider">
                        Matched Pours from Sprig Inventory ({profileRecommendations.length})
                      </p>
                      {profileRecommendations.length > 0 ? (
                        profileRecommendations.map(b => (
                          <div
                            key={b.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-smoke-950/70 border border-smoke-800"
                          >
                            <div
                              onClick={() => dispatch({ type: 'SELECT_BOURBON', payload: b })}
                              className="min-w-0 flex-1 cursor-pointer"
                            >
                              <p className="text-xs font-semibold text-smoke-100 truncate">{b.name}</p>
                              <p className="text-[10px] text-smoke-500">{b.distillery || 'Distillery N/A'} &middot; {b.proof ? `${b.proof}°` : 'Proof N/A'}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <span className="text-xs font-mono font-bold text-bourbon-400">
                                  ${b.sprigPrice ? b.sprigPrice.toFixed(2) : '--'}
                                </span>
                                {b.valueScore !== null && (
                                  <p className="text-[10px] font-mono text-green-400">+{b.valueScore}%</p>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  addToFlight(b)
                                }}
                                disabled={flight.some(f => f.id === b.id) || flight.length >= 4}
                                className="w-6 h-6 rounded-lg bg-bourbon-500/20 text-bourbon-300 border border-bourbon-500/40 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 transition-transform"
                                title="Add to Flight"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-smoke-500 italic">No specific pours match this category on current menu.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
