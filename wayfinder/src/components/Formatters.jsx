import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { useExchangeRate } from '../hooks/useExchangeRate';

// Formats a raw distance string (e.g. "1.4 km", "150m")
export function FormatDistance({ val }) {
  const { settings } = useSettings();
  if (!val) return null;

  const isMiles = settings?.distance === 'mi';
  if (!isMiles) return <>{val}</>;

  const match = val.match(/^([\d.]+)\s*(km|m)$/);
  if (!match) return <>{val}</>;

  const num = parseFloat(match[1]);
  const unit = match[2];

  if (unit === 'km') {
    const miles = (num * 0.621371).toFixed(1);
    return <>{miles} mi</>;
  } else if (unit === 'm') {
    const feet = Math.round(num * 3.28084);
    return <>{feet} ft</>;
  }
  
  return <>{val}</>;
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
    // Remove the fahrenheit part: " -2°C to 4°C (28°F-39°F)" -> "-2°C to 4°C"
    formatted = formatted.replace(/\s*\([\d]+°F[\u2013-][\d]+°F\)/g, '');
  } else {
    // Replace the whole chunk with just Fahrenheit
    formatted = formatted.replace(/-2°C to 4°C \((28°F[\u2013-]39°F)\)/g, '$1');
  }

  // 2. Process Mixed Currencies e.g., "25-35 PLN (~$6.70-$9.40)", "15 PLN", "450-650 PLN/night"
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
