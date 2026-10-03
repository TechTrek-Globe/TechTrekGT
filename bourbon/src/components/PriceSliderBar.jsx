import { DollarSign, Sparkles, X } from 'lucide-react'
import { useBourbon } from '../context/BourbonContext'

const PRESETS = [
  { label: '≤ $12', value: 12 },
  { label: '≤ $15 ⭐', value: 15, isFavorite: true },
  { label: '≤ $20', value: 20 },
  { label: '≤ $30', value: 30 },
  { label: 'Any Price', value: null },
]

export default function PriceSliderBar() {
  const { maxPrice, data, filtered, dispatch } = useBourbon()

  // Calculate count of pours under $15 for instant feedback
  const countUnder15 = data.filter((b) => b.sprigPrice !== null && b.sprigPrice <= 15).length
  const currentCount = filtered.length

  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value, 10)
    dispatch({ type: 'SET_MAX_PRICE', payload: val >= 50 ? null : val })
  }

  const handlePreset = (val) => {
    dispatch({ type: 'SET_MAX_PRICE', payload: val })
  }

  return (
    <div className="rounded-2xl p-3.5 bg-smoke-900/90 border border-bourbon-500/30 backdrop-blur-md shadow-lg mb-3">
      {/* Top row: Label & Current Active Price */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-bourbon-500/20 text-bourbon-400 flex items-center justify-center font-bold text-xs">
            $
          </div>
          <span className="text-xs font-bold text-smoke-100 uppercase tracking-wide">
            Max Pour Price
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {maxPrice !== null ? (
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-bourbon-500/25 border border-bourbon-500 text-bourbon-300 font-mono text-xs font-bold shadow-sm shadow-bourbon-500/20">
              <span>≤ ${maxPrice}</span>
              <button
                onClick={() => dispatch({ type: 'SET_MAX_PRICE', payload: null })}
                className="text-bourbon-400 hover:text-smoke-100 ml-0.5"
                title="Remove price limit"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="text-xs font-mono text-smoke-400">All Prices</span>
          )}
        </div>
      </div>

      {/* Slider input */}
      <div className="relative flex items-center mb-2 px-1">
        <input
          id="pour-price-range-slider"
          type="range"
          min="8"
          max="50"
          step="1"
          value={maxPrice === null ? 50 : maxPrice}
          onChange={handleSliderChange}
          className="w-full h-2 bg-smoke-800 rounded-lg appearance-none cursor-pointer accent-bourbon-500 transition-all"
          style={{
            background: maxPrice
              ? `linear-gradient(to right, #c97320 0%, #e8b85c ${((maxPrice - 8) / (50 - 8)) * 100}%, #2c2822 ${((maxPrice - 8) / (50 - 8)) * 100}%, #2c2822 100%)`
              : 'rgba(201, 115, 32, 0.4)',
          }}
        />
      </div>

      {/* Slider labels */}
      <div className="flex justify-between text-[10px] text-smoke-500 font-mono px-1 mb-2.5">
        <span>$8 min</span>
        <span className={maxPrice === 15 ? 'text-bourbon-300 font-bold underline' : ''}>$15</span>
        <span>$25</span>
        <span>$50+ (Any)</span>
      </div>

      {/* Quick 1-Tap Preset Buttons */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide text-xs">
        {PRESETS.map((preset) => {
          const isActive =
            (preset.value === null && maxPrice === null) ||
            (preset.value !== null && maxPrice === preset.value)

          return (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset.value)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-xl font-medium transition-all active:scale-95 ${
                isActive
                  ? 'bg-bourbon-500 text-smoke-950 font-bold shadow-md shadow-bourbon-500/30'
                  : preset.isFavorite
                  ? 'bg-bourbon-950/60 text-bourbon-300 border border-bourbon-500/50 hover:border-bourbon-400'
                  : 'bg-smoke-950/70 text-smoke-400 border border-smoke-800 hover:text-smoke-200'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
