import React, { useState, useEffect, useRef } from 'react';
import { 
  Sun, 
  CloudSun, 
  Cloud, 
  CloudFog, 
  CloudDrizzle, 
  CloudRain, 
  Snowflake, 
  CloudLightning, 
  Sunrise, 
  Sunset, 
  Clock, 
  AlertTriangle,
  Info,
  X,
  Settings
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const WEATHER_CACHE_PREFIX = 'wf_weather_v3_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getWeatherIcon(main, size = 16) {
  const norm = (main || '').toLowerCase();
  if (norm.includes('clear')) return <Sun size={size} className="text-amber-400 shrink-0" />;
  if (norm.includes('mainly clear') || norm.includes('partly')) return <CloudSun size={size} className="text-amber-300 shrink-0" />;
  if (norm.includes('fog')) return <CloudFog size={size} className="text-slate-300 shrink-0" />;
  if (norm.includes('drizzle')) return <CloudDrizzle size={size} className="text-blue-300 shrink-0" />;
  if (norm.includes('rain')) return <CloudRain size={size} className="text-blue-400 shrink-0" />;
  if (norm.includes('snow')) return <Snowflake size={size} className="text-cyan-300 animate-pulse shrink-0" />;
  if (norm.includes('thunder')) return <CloudLightning size={size} className="text-purple-400 shrink-0" />;
  return <Cloud size={size} className="text-slate-300 shrink-0" />;
}

export function WeatherWidget({
  city,
  lat,
  lng,
  date,
  variant = 'compact',
  locationName = null,
  tooltipPlacement = 'bottom', // 'bottom' opens downward avoiding top-card overflow-hidden clipping
  tooltipAlign = 'left',
  className = ''
}) {
  const { settings, updateSettings, openSettings } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef(null);

  const isFahrenheit = settings?.temperature === 'F';

  // Handle click outside to close open tooltip
  useEffect(() => {
    if (!showTooltip) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowTooltip(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowTooltip(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showTooltip]);

  useEffect(() => {
    let isCancelled = false;

    const cacheKey = `${WEATHER_CACHE_PREFIX}${city || ''}_${lat || ''}_${lng || ''}_${date || 'current'}`;
    
    // 1. Check browser sessionStorage
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - (parsed.cachedAt || 0) < CACHE_TTL_MS) {
          setData(parsed.data);
          return;
        }
      }
    } catch {
      // Ignore cache storage error
    }

    // 2. Fetch from Wayfinder edge worker
    const fetchWeather = async () => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams();
        if (city) params.set('city', city);
        if (lat != null) params.set('lat', String(lat));
        if (lng != null) params.set('lng', String(lng));
        if (date) params.set('date', date);

        const baseUrl = import.meta.env.BASE_URL || '/wayfinder/';
        const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const apiUrl = `${normalizedBase}/api/wayfinder/weather?${params.toString()}`;

        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`Weather error status ${res.status}`);
        const result = await res.json();

        if (!isCancelled) {
          setData(result);
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: result, cachedAt: Date.now() }));
          } catch {
            // Quota limit ignored
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[WeatherWidget] could not load weather:', err.message);
          setError(true);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchWeather();

    return () => {
      isCancelled = true;
    };
  }, [city, lat, lng, date]);

  const formatTemp = (celsius) => {
    if (celsius === null || celsius === undefined || isNaN(celsius)) return '--';
    if (isFahrenheit) {
      return `${Math.round((celsius * 9) / 5 + 32)}°F`;
    }
    return `${Math.round(celsius)}°C`;
  };

  if (loading && !data) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-slate-800/60 text-slate-400 border border-slate-700/50 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span>Loading...</span>
      </span>
    );
  }

  if (error || !data) {
    return null; // Gracefully degrade with zero visual noise
  }

  // --- Variant 1: Compact inline pill badge ---
  if (variant === 'compact') {
    const isBottom = tooltipPlacement === 'bottom';
    const isAlignRight = tooltipAlign === 'right';

    return (
      <div 
        ref={containerRef}
        className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer select-none transition-all duration-200 ${
          data.is_winter_advisory
            ? 'bg-cyan-950/60 text-cyan-200 border border-cyan-800/60 hover:bg-cyan-900/70 hover:border-cyan-600'
            : 'bg-slate-800/80 text-slate-200 border border-slate-700/70 hover:bg-slate-700/80 hover:border-slate-500'
        } ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(prev => !prev);
        }}
      >
        {getWeatherIcon(data.main, 14)}
        <span className="font-semibold tracking-wide font-mono">{formatTemp(data.temp)}</span>
        <span className="text-[10px] text-slate-400 hidden sm:inline">({data.main})</span>

        {data.sunrise && data.sunset && (
          <span className="text-[10px] text-amber-300/90 pl-1 border-l border-slate-700/80 hidden md:inline-flex items-center gap-1">
            <Sunrise size={11} className="text-amber-400" />
            <span>{data.sunrise}</span>
            <span className="text-slate-500">-</span>
            <Sunset size={11} className="text-amber-400" />
            <span>{data.sunset}</span>
          </span>
        )}

        {/* Tooltip Card (positioned top-full mt-2 so it opens downwards inside the card without clipping) */}
        {showTooltip && (
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`absolute ${
              isBottom ? 'top-full mt-2.5' : 'bottom-full mb-2.5'
            } ${
              isAlignRight ? 'right-0' : 'left-0'
            } z-50 w-72 max-w-[calc(100vw-32px)] p-3.5 rounded-2xl bg-slate-950/95 border border-cyan-700/70 shadow-2xl backdrop-blur-xl text-left text-xs pointer-events-auto animate-fade-in`}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-1.5 min-w-0">
                {getWeatherIcon(data.main, 16)}
                <span className="font-bold text-slate-100 text-sm truncate">
                  {locationName || data.city || city || 'Poland Destination'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] uppercase font-extrabold text-cyan-400 tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/50">
                  {data.type === 'climate' ? 'Baseline' : 'Forecast'}
                </span>
                {/* Quick °C / °F toggle */}
                <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSettings({ temperature: 'C' });
                    }}
                    className={`px-1.5 py-0.5 rounded transition-all ${!isFahrenheit ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                    title="Display Celsius"
                  >
                    °C
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSettings({ temperature: 'F' });
                    }}
                    className={`px-1.5 py-0.5 rounded transition-all ${isFahrenheit ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                    title="Display Fahrenheit"
                  >
                    °F
                  </button>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSettings?.();
                  }}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                  title="Travel Preferences"
                >
                  <Settings size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTooltip(false)}
                  className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                  aria-label="Close weather popup"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between text-slate-300 py-0.5">
              <span>Expected Range:</span>
              <span className="font-mono text-cyan-300 font-semibold">
                {formatTemp(data.temp_min)} to {formatTemp(data.temp_max)}
              </span>
            </div>

            {data.snowfall_sum > 0 && (
              <div className="flex items-center justify-between text-cyan-200 py-0.5">
                <span className="flex items-center gap-1">
                  <Snowflake size={12} className="text-cyan-400" /> Snowfall:
                </span>
                <span className="font-mono font-semibold">{data.snowfall_sum} cm</span>
              </div>
            )}

            <div className="flex items-center justify-between text-amber-300/90 py-0.5">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-amber-400" /> Daylight Window:
              </span>
              <span className="font-mono font-medium">{data.daylight_hours || '~8 hrs'}</span>
            </div>

            {data.sunrise && data.sunset && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 py-0.5">
                <span className="flex items-center gap-1">
                  <Sunrise size={11} className="text-amber-400" /> {data.sunrise}
                </span>
                <span className="flex items-center gap-1">
                  <Sunset size={11} className="text-amber-400" /> {data.sunset}
                </span>
              </div>
            )}

            {data.advisory && (
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-amber-200 leading-relaxed flex items-start gap-1.5 bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
                <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <span>{data.advisory}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- Variant 2: Card (Expanded telemetry card for city hubs and stop details) ---
  return (
    <div className={`p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-slate-800/80 shadow-lg backdrop-blur-md ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              {data.type === 'climate' ? 'Historical Climate Baseline' : 'Live Winter Telemetry'}
            </span>
            {data.is_winter_advisory && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Cold Advisory
              </span>
            )}
          </div>
          <h4 className="text-base font-bold text-slate-100 mt-0.5">
            {locationName || data.city || city || 'Winter Conditions'}
          </h4>
        </div>

        <div className="text-right flex flex-col items-end">
          <div className="flex items-center justify-end gap-2">
            {getWeatherIcon(data.main, 24)}
            <span className="text-2xl font-extrabold text-slate-100 font-mono">
              {formatTemp(data.temp)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-400 font-medium">
              {data.description || data.main}
            </span>
            <div className="flex items-center bg-slate-950/80 border border-slate-700/60 rounded-lg p-0.5 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => updateSettings({ temperature: 'C' })}
                className={`px-1.5 py-0.5 rounded transition-all ${!isFahrenheit ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                title="Display Celsius"
              >
                °C
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ temperature: 'F' })}
                className={`px-1.5 py-0.5 rounded transition-all ${isFahrenheit ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
                title="Display Fahrenheit"
              >
                °F
              </button>
            </div>
            <button
              type="button"
              onClick={openSettings}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Travel Preferences"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-xl bg-slate-950/50 border border-slate-800/60 text-xs">
        <div>
          <span className="text-[11px] text-slate-400 block">Day Range</span>
          <span className="font-semibold text-slate-200 font-mono">
            {formatTemp(data.temp_min)} / {formatTemp(data.temp_max)}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">Precipitation</span>
          <span className="font-semibold text-cyan-300 font-mono">
            {data.precipitation_probability}%
            {data.snowfall_sum > 0 ? ` (${data.snowfall_sum}cm snow)` : ''}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-slate-400 block">Daylight Span</span>
          <span className="font-semibold text-amber-300 font-mono">
            {data.daylight_hours || '8h 05m'}
          </span>
        </div>
      </div>

      {data.sunrise && data.sunset && (
        <div className="flex items-center justify-between text-xs text-slate-300 mt-2.5 px-1">
          <div className="flex items-center gap-1.5">
            <Sunrise size={14} className="text-amber-400" />
            <span className="text-slate-400">Sunrise:</span>
            <span className="font-mono font-medium text-slate-200">{data.sunrise}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sunset size={14} className="text-amber-400" />
            <span className="text-slate-400">Sunset:</span>
            <span className="font-mono font-medium text-slate-200">{data.sunset}</span>
          </div>
        </div>
      )}

      {data.advisory && (
        <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 leading-relaxed flex items-start gap-2">
          <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <span>{data.advisory}</span>
        </div>
      )}
    </div>
  );
}

export default WeatherWidget;
