import { createContext, useContext, useState, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';

const VScoutContext = createContext(null);

export function VScoutProvider({ children }) {
  const [taxSettings, setTaxSettings] = useState(null);
  const [loadingTax, setLoadingTax]   = useState(false);

  const fetchTaxSettings = useCallback(async () => {
    setLoadingTax(true);
    try {
      const data = await apiFetch('/api/vinescout/tax');
      setTaxSettings(data.settings || null);
    } catch (err) {
      console.error('Failed to fetch tax settings', err);
    } finally {
      setLoadingTax(false);
    }
  }, []);

  return (
    <VScoutContext.Provider value={{ taxSettings, loadingTax, fetchTaxSettings }}>
      {children}
    </VScoutContext.Provider>
  );
}

export function useVScout() {
  const ctx = useContext(VScoutContext);
  if (!ctx) throw new Error('useVScout must be used within VScoutProvider');
  return ctx;
}
