import { AlertCircle, RefreshCw, Wifi } from 'lucide-react'
import { useBourbon } from '../context/BourbonContext'

export default function LoadingScreen({ error }) {
  const { reload } = useBourbon()

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700/50 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="font-display text-xl font-semibold text-smoke-100 mb-2">Data Fetch Failed</h2>
        <p className="text-smoke-400 text-sm mb-2 max-w-xs">
          Could not load the Brown Water Society data engine.
        </p>
        <p className="text-smoke-600 text-xs mb-6 font-mono bg-smoke-900/60 px-3 py-1.5 rounded-lg">
          {error}
        </p>
        <p className="text-smoke-500 text-xs mb-4 max-w-xs">
          Make sure the Google Sheet is set to "Anyone with link can view".
        </p>
        <button
          id="retry-load-btn"
          onClick={reload}
          className="btn-primary"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      {/* Animated whiskey pour icon */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full border-2 border-bourbon-700/40 flex items-center justify-center">
          <span className="text-4xl animate-pulse-soft">🥃</span>
        </div>
        {/* Shimmer ring */}
        <div className="absolute inset-0 rounded-full border border-bourbon-500/30 animate-ping" />
      </div>

      <h1 className="font-display text-2xl font-semibold text-bourbon-300 mb-1">
        Brown Water Society
      </h1>
      <p className="text-smoke-400 text-sm mb-8">Loading the data engine...</p>

      {/* Shimmer bars */}
      <div className="w-full max-w-xs space-y-2">
        {[80, 60, 72, 50].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded-full shimmer"
            style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5 mt-8 text-smoke-600 text-xs">
        <Wifi className="w-3 h-3" />
        Connecting to sheet...
      </div>
    </div>
  )
}
