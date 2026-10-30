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

  return <>{formatted}</>;
}

