import { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getApiUrl } from '../utils/api';

const STORAGE_KEY = 'wayfinder_pln_usd_rate';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function useExchangeRate() {
  const [rates, setRates] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const isFresh = Date.now() - (parsed.timestamp || 0) < CACHE_TTL_MS;
        return {
          usdToPln: parsed.usdToPln || 3.73,
          usdToEur: parsed.usdToEur || 0.92,
          usdToGbp: parsed.usdToGbp || 0.78,
          eurToPln: parsed.eurToPln || 4.30,
          gbpToPln: parsed.gbpToPln || 4.95,
          loading: false,
          lastUpdated: parsed.lastUpdated || 'Cached',
          timestamp: parsed.timestamp || null,
          error: false,
          isOfflineFallback: !isFresh,
        };
      }
    } catch {
      // Fall through to default initial state
    }
    return {
      usdToPln: 3.73,
      usdToEur: 0.92,
      usdToGbp: 0.78,
      eurToPln: 4.30,
      gbpToPln: 4.95,
      loading: true,
      lastUpdated: null,
      timestamp: null,
      error: false,
      isOfflineFallback: false,
    };
  });

  const { settings } = useSettings();

  // Detect active destination country from window route
  const getActiveCurrencyInfo = () => {
    const path = (window.location.pathname || '').toLowerCase();
    const baseCode = settings?.currency || 'USD';
    const baseSymbol = baseCode === 'EUR' ? '€' : baseCode === 'GBP' ? '£' : '$';

    if (path.includes('uk') || path.includes('london')) {
      let rate = rates.usdToGbp || 0.78;
      if (baseCode === 'EUR') rate = (rates.usdToGbp || 0.78) / (rates.usdToEur || 0.92);
      if (baseCode === 'GBP') rate = 1.0;
      return {
        country: 'United Kingdom',
        code: 'GBP',
        symbol: '£',
        baseCode,
        baseSymbol,
        rate,
        presets: [5, 10, 20, 50, 100],
      };
    }
    if (path.includes('euro') || path.includes('france') || path.includes('germany')) {
      let rate = rates.usdToEur || 0.92;
      if (baseCode === 'EUR') rate = 1.0;
      if (baseCode === 'GBP') rate = (rates.usdToEur || 0.92) / (rates.usdToGbp || 0.78);
      return {
        country: 'Eurozone',
        code: 'EUR',
        symbol: '€',
        baseCode,
        baseSymbol,
        rate,
        presets: [5, 10, 20, 50, 100],
      };
    }
    // Default country context for current TechTrek Poland trip
    let rate = rates.usdToPln || 3.73;
    if (baseCode === 'EUR') rate = rates.eurToPln || 4.30;
    if (baseCode === 'GBP') rate = rates.gbpToPln || 4.95;

    return {
      country: 'Poland',
      code: 'PLN',
      symbol: 'zł',
      baseCode,
      baseSymbol,
      rate,
      presets: [10, 25, 50, 100, 200],
    };
  };

  const fetchRates = async (force = false) => {
    try {
      if (!force) {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL_MS) {
            setRates({
              usdToPln: parsed.usdToPln,
              usdToEur: parsed.usdToEur || 0.92,
              usdToGbp: parsed.usdToGbp || 0.78,
              eurToPln: parsed.eurToPln,
              gbpToPln: parsed.gbpToPln,
              loading: false,
              lastUpdated: parsed.lastUpdated,
              timestamp: parsed.timestamp,
              error: false,
              isOfflineFallback: false,
            });
            return;
          }
        }
      }

      setRates((prev) => ({ ...prev, loading: true }));
      const res = await fetch(getApiUrl('/api/wayfinder/exchange-rate'));
      if (!res.ok) throw new Error('Network response failed');
      const data = await res.json();

      if (data && data.rates && data.rates.PLN) {
        const pln = data.rates.PLN;
        const eurRate = data.rates.EUR || 0.92;
        const gbpRate = data.rates.GBP || 0.78;
        const eur = data.rates.EUR ? (pln / data.rates.EUR) : 4.30;
        const gbp = data.rates.GBP ? (pln / data.rates.GBP) : 4.95;
        const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const now = Date.now();

        const newRates = {
          usdToPln: parseFloat(pln.toFixed(2)),
          usdToEur: parseFloat(eurRate.toFixed(2)),
          usdToGbp: parseFloat(gbpRate.toFixed(2)),
          eurToPln: parseFloat(eur.toFixed(2)),
          gbpToPln: parseFloat(gbp.toFixed(2)),
          loading: false,
          lastUpdated: formattedTime,
          timestamp: now,
          error: false,
          isOfflineFallback: false,
        };

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newRates));
        } catch {
          // Ignore quota errors
        }

        setRates(newRates);
      } else {
        throw new Error('Invalid rate payload');
      }
    } catch {
      setRates((prev) => ({
        ...prev,
        loading: false,
        error: true,
        isOfflineFallback: true,
      }));
    }
  };

  useEffect(() => {
    fetchRates(false);
  }, []);

  return {
    ...rates,
    activeCurrency: getActiveCurrencyInfo(),
    refreshRates: () => fetchRates(true),
  };
}
