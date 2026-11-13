import { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getApiUrl } from '../utils/api';
import { setDynamicExchangeRates } from '../utils/expenseLedger';

const STORAGE_KEY = 'wayfinder_pln_usd_rate';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours (aligned with NBP cache)

const DEFAULT_PLN_PER_UNIT = {
  PLN: 1.0,
  USD: 3.73,
  EUR: 4.30,
  GBP: 4.95,
};

function deriveStateFromPlnMap(plnMap, extra = {}) {
  const usdToPln = Number(plnMap.USD) > 0 ? Number(plnMap.USD) : DEFAULT_PLN_PER_UNIT.USD;
  const eurToPln = Number(plnMap.EUR) > 0 ? Number(plnMap.EUR) : DEFAULT_PLN_PER_UNIT.EUR;
  const gbpToPln = Number(plnMap.GBP) > 0 ? Number(plnMap.GBP) : DEFAULT_PLN_PER_UNIT.GBP;
  return {
    plnPerUnit: {
      PLN: 1.0,
      USD: usdToPln,
      EUR: eurToPln,
      GBP: gbpToPln,
    },
    usdToPln: parseFloat(usdToPln.toFixed(4)),
    usdToEur: parseFloat((usdToPln / eurToPln).toFixed(4)),
    usdToGbp: parseFloat((usdToPln / gbpToPln).toFixed(4)),
    eurToPln: parseFloat(eurToPln.toFixed(4)),
    gbpToPln: parseFloat(gbpToPln.toFixed(4)),
    ...extra,
  };
}

export function useExchangeRate() {
  const [rates, setRates] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const plnMap = parsed.plnPerUnit || {
          PLN: 1.0,
          USD: parsed.usdToPln || DEFAULT_PLN_PER_UNIT.USD,
          EUR: parsed.eurToPln || DEFAULT_PLN_PER_UNIT.EUR,
          GBP: parsed.gbpToPln || DEFAULT_PLN_PER_UNIT.GBP,
        };
        setDynamicExchangeRates(plnMap);
        const isFresh = Date.now() - (parsed.timestamp || 0) < CACHE_TTL_MS;
        return deriveStateFromPlnMap(plnMap, {
          source: parsed.source || 'cache',
          loading: false,
          lastUpdated: parsed.lastUpdated || 'Cached',
          timestamp: parsed.timestamp || null,
          error: false,
          isOfflineFallback: !isFresh,
        });
      }
    } catch {
      // Fall through to default initial state
    }
    return deriveStateFromPlnMap(DEFAULT_PLN_PER_UNIT, {
      source: 'fallback',
      loading: true,
      lastUpdated: null,
      timestamp: null,
      error: false,
      isOfflineFallback: false,
    });
  });

  const { settings } = useSettings();

  // Detect active destination country from window route and compute unified base -> local FX rate
  const getActiveCurrencyInfo = () => {
    const path = (window.location.pathname || '').toLowerCase();
    const baseCode = (settings?.currency || 'USD').toUpperCase();
    const symbolMap = { USD: '$', EUR: '€', GBP: '£', PLN: 'zł' };
    const baseSymbol = symbolMap[baseCode] || '$';
    const plnPerUnit = rates.plnPerUnit || DEFAULT_PLN_PER_UNIT;
    const baseInPln = plnPerUnit[baseCode] || plnPerUnit.USD;

    if (path.includes('uk') || path.includes('london')) {
      return {
        country: 'United Kingdom',
        code: 'GBP',
        symbol: '£',
        baseCode,
        baseSymbol,
        rate: baseInPln / (plnPerUnit.GBP || DEFAULT_PLN_PER_UNIT.GBP),
        presets: [5, 10, 20, 50, 100],
      };
    }
    if (path.includes('euro') || path.includes('france') || path.includes('germany')) {
      return {
        country: 'Eurozone',
        code: 'EUR',
        symbol: '€',
        baseCode,
        baseSymbol,
        rate: baseInPln / (plnPerUnit.EUR || DEFAULT_PLN_PER_UNIT.EUR),
        presets: [5, 10, 20, 50, 100],
      };
    }
    return {
      country: 'Poland',
      code: 'PLN',
      symbol: 'zł',
      baseCode,
      baseSymbol,
      rate: baseInPln / (plnPerUnit.PLN || 1.0),
      presets: [10, 25, 50, 100, 200],
    };
  };

  const fetchRates = async (force = false) => {
    try {
      if (!force) {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - (parsed.timestamp || 0) < CACHE_TTL_MS && parsed.plnPerUnit?.USD) {
            setDynamicExchangeRates(parsed.plnPerUnit);
            setRates(deriveStateFromPlnMap(parsed.plnPerUnit, {
              source: parsed.source || 'cache',
              loading: false,
              lastUpdated: parsed.lastUpdated,
              timestamp: parsed.timestamp,
              error: false,
              isOfflineFallback: false,
            }));
            return;
          }
        }
      }

      setRates((prev) => ({ ...prev, loading: true }));
      const res = await fetch(getApiUrl('/api/wayfinder/exchange-rate'), { credentials: 'include' });
      if (!res.ok) throw new Error('Network response failed');
      const data = await res.json();

      const plnMap = data?.plnPerUnit || {
        PLN: 1.0,
        USD: data?.usdToPln || data?.rates?.PLN,
        EUR: data?.eurToPln || (data?.rates?.PLN && data?.rates?.EUR ? data.rates.PLN / data.rates.EUR : DEFAULT_PLN_PER_UNIT.EUR),
        GBP: data?.gbpToPln || (data?.rates?.PLN && data?.rates?.GBP ? data.rates.PLN / data.rates.GBP : DEFAULT_PLN_PER_UNIT.GBP),
      };

      if (Number(plnMap.USD) > 0) {
        setDynamicExchangeRates(plnMap);
        const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const now = Date.now();
        const isFallback = data?.source === 'fallback';

        const newRates = deriveStateFromPlnMap(plnMap, {
          source: data?.source || 'nbp',
          loading: false,
          lastUpdated: data?.effectiveDate || formattedTime,
          timestamp: now,
          error: false,
          isOfflineFallback: isFallback,
        });

        if (!isFallback) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newRates));
          } catch {
            // Ignore quota errors
          }
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
