import {
  Award,
  ChevronDown,
  DollarSign,
  ExternalLink,
  FlaskConical,
  MapPin,
  RefreshCw,
  Star,
  TrendingUp,
  X,
  ShieldCheck,
  TrendingDown,
  Calculator,
} from 'lucide-react'
import { useEffect } from 'react'
import { useBourbon } from '../context/BourbonContext'

function DetailRow({ icon: Icon, label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-smoke-800/40 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-smoke-900/60 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-bourbon-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-smoke-600 uppercase tracking-wider">{label}</p>
        <p className="text-smoke-200 text-sm mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function SommelierNote({ bourbon }) {
  const { valueScore, valueRating, sprigPrice, fairPrice, msrp, rawCost, proof, isUnicorn, name } = bourbon

  const lines = []

  if (isUnicorn || (valueRating && valueRating.includes('A+'))) {
    lines.push(`🦄 Mathematical Unicorn Alert: "${name}" is rated "${valueRating}". At Sprig's pour price of $${sprigPrice?.toFixed(2) || '?'}, this is one of the highest-alpha bargains in the restaurant's entire inventory.`)
  } else if (valueRating && valueRating.startsWith('A')) {
    lines.push(`📈 Top-Tier Value: Rated "${valueRating}". Sprig pours this significantly below fair commercial bar markup. A prime recommendation for brown water enthusiasts.`)
  } else if (valueRating && (valueRating.startsWith('B') || valueRating.startsWith('C'))) {
    lines.push(`⚖️ Fair to Standard: Rated "${valueRating}". Sprig charges fair market rates for this pour. Drink with confidence if it's on your tasting list.`)
  } else if (valueRating && (valueRating.startsWith('D') || valueRating.startsWith('F'))) {
    lines.push(`📉 Premium Overhead: Rated "${valueRating}". The bar markup on this specific bottle is high relative to raw bottle cost. Sip only if it's an unobtainable grail.`)
  }

  if (fairPrice && sprigPrice) {
    const diff = fairPrice - sprigPrice
    if (diff > 0) {
      lines.push(`Pour Economics: Standard 3.6x bar fair price is $${fairPrice.toFixed(2)}. Sprig only charges $${sprigPrice.toFixed(2)} (you save $${diff.toFixed(2)} / +${valueScore}% value).`)
    } else {
      lines.push(`Pour Economics: Standard 3.6x bar fair price is $${fairPrice.toFixed(2)} vs Sprig's $${sprigPrice.toFixed(2)}.`)
    }
  }

  if (rawCost && msrp) {
    lines.push(`Bottle Context: Standard 750ml retail bottle MSRP is $${msrp.toFixed(2)} (yielding ~12.7 2-oz pours at ~$${rawCost.toFixed(2)} raw cost).`)
  }

  if (proof && proof >= 110) {
    lines.push(`Palate Notice: High proof / cask strength at ${proof}°. Expect intense spice, rich mouthfeel, and an expansive finish.`)
  }

  return (
    <div className="rounded-xl p-3.5 mt-4" style={{ background: 'rgba(201, 115, 32, 0.08)', border: '1px solid rgba(201, 115, 32, 0.25)' }}>
      <p className="text-[10px] text-bourbon-400 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
        <Award className="w-3.5 h-3.5" />
        Brown Water Society Sommelier Assessment
      </p>
      {lines.map((line, i) => (
        <p key={i} className="text-smoke-300 text-xs leading-relaxed mb-1.5 last:mb-0">{line}</p>
      ))}
    </div>
  )
}

export default function BourbonDetail() {
  const { selectedBourbon, dispatch } = useBourbon()

  useEffect(() => {
    if (selectedBourbon) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedBourbon])

  if (!selectedBourbon) return null

  const {
    name, distillery, type, age, proof,
    sprigPrice, fairPrice, msrp, rawCost, valueScore,
    valueRating, syncStatus, isUnicorn,
  } = selectedBourbon

  const close = () => dispatch({ type: 'SELECT_BOURBON', payload: null })

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={close}
      />

      {/* Sheet */}
      <div
        id="bourbon-detail-sheet"
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up max-w-md mx-auto"
        style={{ maxHeight: '92dvh' }}
      >
        <div
          className="rounded-t-3xl border-t border-smoke-800/80 overflow-hidden flex flex-col"
          style={{
            background: 'linear-gradient(160deg, #1c1813, #0d0c09)',
            maxHeight: '92dvh',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-12 h-1 rounded-full bg-smoke-700" />
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-4 pb-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pt-3 pb-4 border-b border-smoke-800/60">
              <div className="flex-1 min-w-0">
                {(isUnicorn || (valueRating && valueRating.includes('A+'))) && (
                  <div className="unicorn-badge mb-2">
                    🦄 Mathematical Unicorn &middot; A+ Steal
                  </div>
                )}
                <h2 className="font-display text-xl font-bold text-smoke-50 leading-tight">
                  {name}
                </h2>
                {distillery && (
                  <p className="text-smoke-400 text-xs mt-1">{distillery}</p>
                )}
              </div>
              <button
                id="close-detail-btn"
                onClick={close}
                className="w-8 h-8 rounded-full bg-smoke-800/80 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
              >
                <X className="w-4 h-4 text-smoke-300" />
              </button>
            </div>

            {/* Value rating banner */}
            <div className="rounded-xl p-3 mt-4 flex items-center justify-between bg-smoke-900/80 border border-bourbon-500/30">
              <div>
                <p className="text-smoke-500 text-[10px] uppercase tracking-wider font-semibold">Inventory Grade</p>
                <p className="text-smoke-100 font-bold text-sm mt-0.5">{valueRating || 'Unclassified'}</p>
              </div>
              {valueScore !== null && (
                <div className="text-right">
                  <p className="text-[10px] text-smoke-500 uppercase tracking-wider font-semibold">Alpha vs Fair Bar</p>
                  <p className={`font-bold font-mono text-base ${valueScore > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {valueScore > 0 ? '+' : ''}{valueScore}%
                  </p>
                </div>
              )}
            </div>

            {/* Price Economics Grid */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {sprigPrice !== null && (
                <div className="stat-box">
                  <p className="text-[9px] text-smoke-500 uppercase tracking-wide">Sprig Pour Price</p>
                  <p className="text-bourbon-300 font-bold font-mono text-xl mt-0.5">${sprigPrice.toFixed(2)}</p>
                  <p className="text-[10px] text-smoke-500 mt-0.5">2oz restaurant pour</p>
                </div>
              )}

              {fairPrice !== null && (
                <div className="stat-box">
                  <p className="text-[9px] text-smoke-500 uppercase tracking-wide">Fair Bar Price (3.6x)</p>
                  <p className="text-smoke-200 font-bold font-mono text-xl mt-0.5">${fairPrice.toFixed(2)}</p>
                  <p className="text-[10px] text-smoke-500 mt-0.5">Industry benchmark pour</p>
                </div>
              )}

              {rawCost !== null && (
                <div className="stat-box">
                  <p className="text-[9px] text-smoke-500 uppercase tracking-wide">Raw 2oz Cost</p>
                  <p className="text-smoke-300 font-mono font-semibold text-sm mt-0.5">${rawCost.toFixed(2)}</p>
                  <p className="text-[10px] text-smoke-500 mt-0.5">Wholesale cost/pour</p>
                </div>
              )}

              {msrp !== null && (
                <div className="stat-box">
                  <p className="text-[9px] text-smoke-500 uppercase tracking-wide">Bottle MSRP (750ml)</p>
                  <p className="text-smoke-300 font-mono font-semibold text-sm mt-0.5">${msrp.toFixed(2)}</p>
                  <p className="text-[10px] text-smoke-500 mt-0.5">Full bottle retail</p>
                </div>
              )}
            </div>

            {/* Mathematical Transparency Box */}
            <div className="rounded-xl p-3 bg-smoke-900/70 border border-smoke-800/80 mt-3 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-bourbon-400 font-bold text-[10px] uppercase tracking-wider">
                <Calculator className="w-3.5 h-3.5" />
                How the Mathematical Rating Works
              </div>
              <p className="text-smoke-300 leading-relaxed">
                • <strong className="text-smoke-100">Bottle MSRP (${msrp ? `$${msrp.toFixed(2)}` : 'N/A'}):</strong> Sourced from your Master Registry for a standard 750ml bottle.
              </p>
              <p className="text-smoke-300 leading-relaxed">
                • <strong className="text-smoke-100">Raw Wholesale Cost:</strong> A 750ml bottle yields ~12.7 2-oz pours, making raw liquid cost ~${rawCost ? `$${rawCost.toFixed(2)}` : 'N/A'} per pour.
              </p>
              <p className="text-smoke-300 leading-relaxed">
                • <strong className="text-smoke-100">Fair Bar Pour Price (3.6x):</strong> Standard restaurant beverage markup sets fair pour price at ${fairPrice ? `$${fairPrice.toFixed(2)}` : 'N/A'}.
              </p>
              <p className="text-smoke-300 leading-relaxed">
                • <strong className="text-smoke-100">Sprig Pricing Verdict:</strong> Sprig charges ${sprigPrice ? `$${sprigPrice.toFixed(2)}` : 'N/A'}, earning it a <strong className="text-bourbon-300 font-semibold">{valueRating}</strong> rating!
              </p>
            </div>

            {/* Pour Specs */}
            <div className="mt-4 rounded-xl overflow-hidden border border-smoke-800/60">
              <div className="bg-smoke-900/60 px-3 py-2 border-b border-smoke-800/40">
                <p className="text-[10px] text-smoke-400 uppercase tracking-wide font-semibold">Pour Specs</p>
              </div>
              <div className="px-3">
                <DetailRow icon={FlaskConical} label="Style" value={type} />
                <DetailRow icon={ChevronDown} label="Age" value={age} />
                <DetailRow icon={TrendingUp} label="Proof" value={proof ? `${proof}°` : null} />
                <DetailRow icon={ShieldCheck} label="Sprig Registry Sync" value={syncStatus} />
              </div>
            </div>

            {/* Sommelier Assessment */}
            <SommelierNote bourbon={selectedBourbon} />

            {/* Link to Sprig website */}
            <a
              href="https://sprigrestaurant.com/bourbon-menu"
              target="_blank"
              rel="noopener noreferrer"
              id="sprig-menu-link"
              className="btn-ghost w-full justify-center mt-4 text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on Sprig Official Bourbon Menu
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
