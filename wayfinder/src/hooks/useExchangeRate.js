import { useState, useEffect } from 'react';

export function useExchangeRate() {
  const [rates, setRates] = useState({
    usdToPln: 3.73,
    eurToPln: 4.30,
    gbpToPln: 4.95,
    loading: true,
    lastUpdated: null,
    error: false,
  });

  useEffect(() => {
    let isMounted = true;
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((res) => {
        if (!res.ok) throw new Error('Network response failed');
        return res.json();
      })
      .then((data) => {
        if (isMounted && data && data.rates && data.rates.PLN) {
          const pln = data.rates.PLN;
          const eur = data.rates.EUR ? pln / data.rates.EUR : 4.30;
          const gbp = data.rates.GBP ? pln / data.rates.GBP : 4.95;
          setRates({
            usdToPln: parseFloat(pln.toFixed(2)),
            eurToPln: parseFloat(eur.toFixed(2)),
            gbpToPln: parseFloat(gbp.toFixed(2)),
            loading: false,
            lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            error: false,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setRates((prev) => ({ ...prev, loading: false, error: true }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return rates;
}
