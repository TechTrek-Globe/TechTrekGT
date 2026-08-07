import { useState, useEffect } from 'react';

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

  // Detect active destination country from window route
  const getActiveCurrencyInfo = () => {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('uk') || path.includes('london')) {
      return {
        country: 'United Kingdom',
        code: 'GBP',
        symbol: '£',
        rate: rates.usdToGbp || 0.78,
        presets: [5, 10, 20, 50, 100],
      };
    }
    if (path.includes('euro') || path.includes('france') || path.includes('germany')) {
      return {
        country: 'Eurozone',
        code: 'EUR',
        symbol: '€',
        rate: rates.usdToEur || 0.92,
        presets: [5, 10, 20, 50, 100],
      };
    }
    // Default country context for current TechTrek Poland trip
    return {
      country: 'Poland',
      code: 'PLN',
      symbol: 'zł',
      rate: rates.usdToPln || 3.73,
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
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('Network response failed');
      const data = await res.json();

      if (data && data.rates && data.rates.PLN) {
        const pln = data.rates.PLN;
        const eurRate = data.rates.EUR || 0.92;
        const gbpRate = data.rates.GBP || 0.78;
        const eur = pln / eurRate;
        const gbp = pln / gbpRate;
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
