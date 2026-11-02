import React from 'react';
import { Route, Footprints, Sparkles, Navigation, ArrowRight, ShieldCheck, MapPin, ExternalLink, RefreshCw } from 'lucide-react';
import { generateGoogleMapsWalkingUrl } from '../../utils/routeOptimizer';
import { useSettings } from '../../context/SettingsContext';
import { formatDistance } from '../Formatters';

/**
 * WalkingLoopOptimizer - Interactive 2-Opt Walking Loop Control Bar
 * Provides travelers with real-time route untangling, winter walking distance/time savings,
 * customizable starting anchors (Market square, hotel, station), and 1-click Google Maps walking navigation.
 */
export function WalkingLoopOptimizer({
  city,
  isOptimized,
  setIsOptimized,
  optimizationResult,
  anchorMode,
  setAnchorMode,
  isRoundTrip,
  setIsRoundTrip,
  includeExcursions,
  setIncludeExcursions
}) {
  const { settings } = useSettings();
  const isMiles = settings?.distance === 'mi';

  const {
    savedKm,
    savedMinutes,
    optimizedLengthKm,
    optimizedMinutes,
    originalLengthKm,
    originalMinutes,
    hasSavings,
    orderedPlaces,
    distantExcursions
  } = optimizationResult;

  // Resolve active anchor for Google Maps navigation link
  let activeAnchor = null;
  if (anchorMode === 'market' && city.markets?.[0]) {
    activeAnchor = {
      lat: city.markets[0].lat,
      lng: city.markets[0].lng,
      name: city.markets[0].name || `${city.name} Main Market`
    };
  }

  const googleMapsUrl = generateGoogleMapsWalkingUrl(
    isOptimized ? orderedPlaces : (optimizationResult.originalPlaces || []),
    { startAnchor: activeAnchor, isRoundTrip }
  );

  return (
    <div className="glass-panel p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 relative overflow-hidden shadow-2xl space-y-3">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-amber-500/10 via-sky-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar: Title & Mode Toggle */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="space-y-1 max-w-xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider shadow-sm">
            <Route className="w-3.5 h-3.5 text-amber-400" />
            <span>2-Opt Walking Loop Optimizer</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>Walking Route for {city.name}</span>
          </h3>
          <p className="text-xs text-slate-300 font-medium leading-relaxed">
            Eliminates criss-crossing backtracking on snowy streets using nearest-neighbor greedy ordering and 2-opt sub-segment untangling.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-950/80 p-1.5 rounded-2xl border border-white/10 shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setIsOptimized(false)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              !isOptimized
                ? 'bg-white/15 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Guide Order</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOptimized(true)}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
              isOptimized
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Optimized Loop (2-Opt)</span>
          </button>
        </div>
      </div>

      {/* Telemetry & Route Configuration Options */}
      <div className="relative z-10 space-y-3">
        {/* Metrics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Status / Saved Metric */}
          <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {isOptimized ? 'Winter Savings' : 'Route Efficiency'}
            </span>
            <div className="flex items-center space-x-1.5">
              {isOptimized && hasSavings ? (
                <span className="text-base sm:text-lg font-black text-emerald-400">
                  -{formatDistance(savedKm, settings?.distance)} ({savedMinutes}m saved)
                </span>
              ) : isOptimized ? (
                <span className="text-sm sm:text-base font-bold text-amber-300">
                  Already Optimal
                </span>
              ) : (
                <span className="text-sm sm:text-base font-bold text-slate-300">
                  Standard Sequence
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              {isOptimized && hasSavings
                ? 'Less time in sub-zero cold'
                : 'Based on curated guide catalog'}
            </p>
          </div>

          {/* Total Walking Distance */}
          <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Distance
            </span>
            <div className="text-base sm:text-lg font-black text-white">
              {formatDistance(isOptimized ? optimizedLengthKm : originalLengthKm, settings?.distance)}
            </div>
            <p className="text-[10px] text-slate-400">
              {isRoundTrip ? 'Full closed loop' : 'Point-to-point path'}
            </p>
          </div>

          {/* Estimated Walking Duration */}
          <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Walking Time
            </span>
            <div className="text-base sm:text-lg font-black text-amber-300 flex items-center space-x-1">
              <Footprints className="w-4 h-4 text-amber-400" />
              <span>{isOptimized ? `~${optimizedMinutes} min` : `~${originalMinutes} min`}</span>
            </div>
            <p className="text-[10px] text-slate-400">
              {isMiles ? 'At 2.8 mph winter pace' : 'At 4.5 km/h winter pace'}
            </p>
          </div>

          {/* Stops Count & Untangling Certified */}
          <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Route Geometry
            </span>
            <div className="text-base sm:text-lg font-black text-sky-300 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>{isOptimized ? '2-Opt Untangled' : `${orderedPlaces.length} Sights`}</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Zero intersecting legs
            </p>
          </div>
        </div>

        {/* Controls Row: Base Anchor, Loop toggle, and Google Maps Launcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Left: Anchor Selector & Loop Settings */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-bold">Start Base:</span>
            {city.markets?.[0] && (
              <button
                type="button"
                onClick={() => setAnchorMode(anchorMode === 'market' ? 'none' : 'market')}
                className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                  anchorMode === 'market'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
              >
                🎄 {city.markets[0].shortName || 'Main Market'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setAnchorMode(anchorMode === 'none' ? 'market' : 'none')}
              className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                anchorMode === 'none'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              📍 First Sight
            </button>

            {anchorMode !== 'none' && (
              <button
                type="button"
                onClick={() => setIsRoundTrip(!isRoundTrip)}
                className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                  isRoundTrip
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                }`}
                title="When enabled, route returns to your starting base"
              >
                🔄 {isRoundTrip ? 'Round-Trip Loop' : 'One-Way Path'}
              </button>
            )}

            {distantExcursions?.length > 0 && (
              <button
                type="button"
                onClick={() => setIncludeExcursions(!includeExcursions)}
                className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                  includeExcursions
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                }`}
              >
                🚌 {includeExcursions ? 'Including Excursions' : `Separate Excursions (${distantExcursions.length})`}
              </button>
            )}
          </div>

          {/* Right: Google Maps Walking Navigation Deep Link */}
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-black transition-all flex items-center space-x-1.5 shadow-md shrink-0 ml-auto"
              title="Open full sequential route in Google Maps walking directions"
            >
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>Launch Google Maps Walking Route</span>
              <ExternalLink className="w-3 h-3 text-emerald-400 opacity-70" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default WalkingLoopOptimizer;
