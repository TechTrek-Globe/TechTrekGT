import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { useExchangeRate } from '../hooks/useExchangeRate';

// Pure formatting utilities
export function formatWeight(grams, unit = 'lbs') {
  if (grams == null || isNaN(grams)) return '--';
  const g = Math.max(0, parseFloat(grams));
  
  if (unit === 'lbs') {
    const oz = g * 0.03527396;
    if (oz < 16) {
      return `${oz < 1 ? oz.toFixed(1) : Math.round(oz * 10) / 10} oz`;
    }
    const lbs = g * 0.00220462;
    return `${lbs.toFixed(1)} lbs`;
  }
  
  if (g >= 1000) {
    return `${(g / 1000).toFixed(1)} kg`;
  }
  return `${Math.round(g)} g`;
}

export function formatTemperature(celsius, unit = 'F') {
  if (celsius == null || isNaN(celsius)) return '--';
  const c = parseFloat(celsius);
  if (unit === 'F') {
    return `${Math.round((c * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(c)}°C`;
}

// Pure time formatting helper for single time token
export function formatSingleTime(token, is24h) {
  if (!token) return '';
  const match = String(token).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
  if (!match) return token;

  let hour = parseInt(match[1], 10);
  const min = match[2];
  const ampm = match[3] ? match[3].toUpperCase() : null;

  if (ampm) {
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
  }

  if (is24h) {
    const hh = String(hour).padStart(2, '0');
    return `${hh}:${min}`;
  } else {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${min} ${period}`;
  }
}

// Pure formatter: Formats time string or composite time range (e.g. "15:00", "07:38", "15:00 - 18:00 (3h)")
export function formatTime(valOrTime, format = '12h') {
  if (valOrTime == null || valOrTime === '') return '--';
  const str = String(valOrTime).trim();
  const is24h = format === '24h' || format === 'military';

  return str.replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?\b/gi, (match) => {
    return formatSingleTime(match, is24h);
  });
}

// React component: Formats raw weight in grams according to active settings
export function FormatWeight({ grams }) {
  const { settings } = useSettings();
  const unit = settings?.weight || 'lbs';
  return <>{formatWeight(grams, unit)}</>;
}

// React component: Formats raw temperature in Celsius according to active settings
export function FormatTemperature({ celsius }) {
  const { settings } = useSettings();
  const unit = settings?.temperature || 'F';
  return <>{formatTemperature(celsius, unit)}</>;
}

// React component: Formats a time string or range according to active settings
export function FormatTime({ time, format }) {
  const { settings } = useSettings();
  const activeFormat = format || settings?.timeFormat || '12h';
  if (!time) return null;
  return <>{formatTime(time, activeFormat)}</>;
}

// Pure formatter: Formats distance (e.g. "1.4 km", 1.4, "150 m")
export function formatDistance(valOrKm, unit = 'mi') {
  if (valOrKm == null || valOrKm === '') return '--';
  const str = String(valOrKm).trim();
  const isMiles = unit === 'mi';

  const match = str.match(/^([\d.]+)\s*(km|m|mi|ft)?$/i);
  if (!match) return str;

  const num = parseFloat(match[1]);
  const parsedUnit = (match[2] || 'km').toLowerCase();

  if (!isMiles) {
    if (parsedUnit === 'mi') {
      return `${(num * 1.60934).toFixed(1)} km`;
    }
    if (parsedUnit === 'ft') {
      return `${Math.round(num * 0.3048)} m`;
    }
    if (parsedUnit === 'm') {
      return num >= 1000 ? `${(num / 1000).toFixed(1)} km` : `${Math.round(num)} m`;
    }
    return `${num.toFixed(1)} km`;
  }

  // Unit is miles ('mi')
  if (parsedUnit === 'km') {
    return `${(num * 0.621371).toFixed(1)} mi`;
  }
  if (parsedUnit === 'm') {
    return `${Math.round(num * 3.28084)} ft`;
  }
  if (parsedUnit === 'ft') {
    return `${Math.round(num)} ft`;
  }
  return `${num.toFixed(1)} mi`;
}

// React component: Formats a raw distance string (e.g. "1.4 km", "150m")
export function FormatDistance({ val }) {
  const { settings } = useSettings();
  const unit = settings?.distance || 'mi';
  return <>{formatDistance(val, unit)}</>;
}

// Formats a raw PLN numeric value into the active base currency
export function FormatCurrency({ pln }) {
  const { activeCurrency } = useExchangeRate();
  if (pln == null) return null;

  const { baseSymbol, rate } = activeCurrency || {};
  if (!rate) return <>{pln} PLN</>;

  const baseAmount = pln / rate;
  return <>{baseSymbol || ''}{Math.round(baseAmount)}</>;
}

// A smart text processor that replaces known mixed patterns with localized formats
export function FormatText({ text }) {
  const { settings } = useSettings();
  const { activeCurrency } = useExchangeRate();
  if (!text) return null;

  let formatted = text;

  // 1. Process Temperatures
  const wantCelsius = settings?.temperature === 'C';
  if (wantCelsius) {
    // If Celsius: strip parenthetical Fahrenheit ranges: "-2°C to 4°C (28°F-39°F)" -> "-2°C to 4°C"
    formatted = formatted.replace(/(-?\d+°C\s*(?:to|-)\s*-?\d+°C)\s*\([^)]*°F[^)]*\)/gi, '$1');
    // If standalone Fahrenheit exists, convert to Celsius
    formatted = formatted.replace(/(\d+)\s*°F/gi, (match, f) => {
      const c = Math.round(((parseInt(f, 10) - 32) * 5) / 9);
      return `${c}°C`;
    });
  } else {
    // If Fahrenheit:
    // A: Replace parenthetical dual ranges: "-2°C to 4°C (28°F-39°F)" -> "28°F to 39°F"
    formatted = formatted.replace(/-?\d+°C\s*(?:to|-)\s*-?\d+°C\s*\(([\d]+°F)\s*[\u2013-]\s*([\d]+°F)\)/gi, '$1 to $2');
    // B: Replace parenthetical rating: "(-10°C rated)" -> "(14°F rated)"
    formatted = formatted.replace(/\((-?\d+)°C(\s*[^)]*)\)/gi, (match, c, rest) => {
      const f = Math.round((parseInt(c, 10) * 9) / 5 + 32);
      return `(${f}°F${rest})`;
    });
    // C: Replace unparenthesized Celsius ranges: "-1°C to 4°C" -> "30°F to 39°F"
    formatted = formatted.replace(/(-?\d+)\s*°C\s*(?:to|-)\s*(-?\d+)\s*°C/gi, (match, c1, c2) => {
      const f1 = Math.round((parseInt(c1, 10) * 9) / 5 + 32);
      const f2 = Math.round((parseInt(c2, 10) * 9) / 5 + 32);
      return `${f1}°F to ${f2}°F`;
    });
    // D: Replace standalone single Celsius: "-10°C" -> "14°F"
    formatted = formatted.replace(/(-?\d+)\s*°C/gi, (match, c) => {
      const f = Math.round((parseInt(c, 10) * 9) / 5 + 32);
      return `${f}°F`;
    });
  }

  // 2. Process Weights (if text mentions standard baggage limits)
  const isLbs = settings?.weight === 'lbs';
  if (isLbs) {
    formatted = formatted.replace(/23(?:\.0)?\s*kg/gi, '50.7 lbs');
    formatted = formatted.replace(/8(?:\.0)?\s*kg/gi, '17.6 lbs');
    formatted = formatted.replace(/5(?:\.0)?\s*kg/gi, '11.0 lbs');
  }

  // 3. Process Distances e.g., "12 km", "1.2 km", "745 km"
  const isMiles = settings?.distance === 'mi';
  if (isMiles) {
    formatted = formatted.replace(/(\d+(?:\.\d+)?)\s*km/gi, (match, kmStr) => {
      const km = parseFloat(kmStr);
      const mi = (km * 0.621371).toFixed(1);
      return `${mi} mi`;
    });
  }

  // 4. Process Mixed Currencies e.g., "25-35 PLN (~$6.70-$9.40)", "15 PLN", "450-650 PLN/night"
  const { baseSymbol, rate } = activeCurrency || {};
  if (rate) {
    formatted = formatted.replace(/(?:~)?(\d+)(?:\s*-\s*(\d+))?\s*PLN(?:(\/night|\s*per person))?(?:\s*\([^)]+\))?/gi, (match, minPln, maxPln, suffix) => {
      const minBase = Math.round(parseInt(minPln, 10) / rate);
      const safeSuffix = suffix || '';
      
      if (maxPln) {
        const maxBase = Math.round(parseInt(maxPln, 10) / rate);
        return `${minPln}-${maxPln} PLN (~${baseSymbol}${minBase}-${baseSymbol}${maxBase})${safeSuffix}`;
      } else {
        return `${minPln} PLN (~${baseSymbol}${minBase})${safeSuffix}`;
      }
    });
  }

  // 5. Process Times (switch between 12-hour AM/PM and 24-hour military)
  const is24h = settings?.timeFormat === '24h' || settings?.timeFormat === 'military';
  if (is24h) {
    formatted = formatted.replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (match, h, m, ampm) => {
      let hour = parseInt(h, 10);
      const isPM = ampm.toUpperCase() === 'PM';
      if (isPM && hour < 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${m}`;
    });
  } else {
    formatted = formatted.replace(/(?<![\d\-/])\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:AM|PM|am|pm|[./\-\d]))/g, (match, h, m) => {
      let hour = parseInt(h, 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 === 0 ? 12 : hour % 12;
      return `${h12}:${m} ${period}`;
    });
  }

  return <>{formatted}</>;
}

/**
 * Formats full stop date ranges into compact labels (e.g. "Dec 4 - Dec 7, 2026" -> "Dec 4-7").
 */
export function formatCompactStopDates(itineraryDates) {
  if (!itineraryDates) return '';
  const withoutYear = String(itineraryDates).split(',')[0].trim();
  const match = withoutYear.match(/^([A-Za-z]+)\s+(\d+)\s*-\s*([A-Za-z]+)\s+(\d+)$/);
  if (match) {
    const [, m1, d1, m2, d2] = match;
    return m1 === m2 ? `${m1} ${d1}-${d2}` : `${m1} ${d1}-${m2} ${d2}`;
  }
  return withoutYear;
}

