// TechTrek Wayfinder: Exchange Rate API Endpoint
// Fetches daily exchange rate for PLN/USD from open.er-api.com and returns cached JSON payload.

export async function handleExchangeRate(context, url, method) {
  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const apiRes = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!apiRes.ok) {
      throw new Error('Upstream rates provider error');
    }
    const data = await apiRes.json();

    const pln = data?.rates?.PLN || 3.73;
    const eur = data?.rates?.EUR ? pln / data.rates.EUR : 4.30;
    const gbp = data?.rates?.GBP ? pln / data.rates.GBP : 4.95;

    const payload = {
      base: 'USD',
      rates: {
        PLN: parseFloat(pln.toFixed(4)),
        EUR: parseFloat(eur.toFixed(4)),
        GBP: parseFloat(gbp.toFixed(4)),
      },
      usdToPln: parseFloat(pln.toFixed(2)),
      timestamp: Date.now(),
      lastUpdated: new Date().toISOString(),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch rates',
        fallback: { usdToPln: 3.73, eurToPln: 4.30, gbpToPln: 4.95 },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
