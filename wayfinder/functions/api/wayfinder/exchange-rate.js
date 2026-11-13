// TechTrek Wayfinder: Exchange Rate API Endpoint
// Fetches official daily NBP (National Bank of Poland) Table A mid rates (api.nbp.pl)
// with open.er-api.com secondary fallback and Cloudflare Cache API edge caching.

const FALLBACK_PLN_PER_UNIT = {
  PLN: 1.0,
  USD: 3.73,
  EUR: 4.30,
  GBP: 4.95,
};

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function buildPayload(plnPerUnit, { source, table = null, effectiveDate = null } = {}) {
  const usdPln = Number(plnPerUnit.USD) > 0 ? Number(plnPerUnit.USD) : FALLBACK_PLN_PER_UNIT.USD;
  const eurPln = Number(plnPerUnit.EUR) > 0 ? Number(plnPerUnit.EUR) : FALLBACK_PLN_PER_UNIT.EUR;
  const gbpPln = Number(plnPerUnit.GBP) > 0 ? Number(plnPerUnit.GBP) : FALLBACK_PLN_PER_UNIT.GBP;
  const usdToEur = usdPln / eurPln;
  const usdToGbp = usdPln / gbpPln;

  return {
    source: source || 'fallback',
    table,
    effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
    base: 'USD',
    plnPerUnit: {
      PLN: 1.0,
      USD: round4(usdPln),
      EUR: round4(eurPln),
      GBP: round4(gbpPln),
    },
    rates: {
      USD: 1.0,
      PLN: round4(usdPln),
      EUR: round4(usdToEur),
      GBP: round4(usdToGbp),
    },
    usdToPln: round2(usdPln),
    eurToPln: round2(eurPln),
    gbpToPln: round2(gbpPln),
    usdToEur: round4(usdToEur),
    usdToGbp: round4(usdToGbp),
    plnToUsd: round4(1 / usdPln),
    timestamp: Date.now(),
    lastUpdated: new Date().toISOString(),
  };
}

async function fetchNbpRates() {
  const res = await fetch('https://api.nbp.pl/api/exchangerates/tables/A/?format=json', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`NBP HTTP ${res.status}`);
  const tables = await res.json();
  const tableA = Array.isArray(tables) ? tables[0] : null;
  const entries = tableA?.rates || [];
  const byCode = new Map(entries.map((r) => [String(r.code || '').toUpperCase(), Number(r.mid)]));
  const usd = byCode.get('USD');
  const eur = byCode.get('EUR');
  const gbp = byCode.get('GBP');
  if (!(usd > 0) || !(eur > 0) || !(gbp > 0)) {
    throw new Error('NBP payload missing USD/EUR/GBP rates');
  }
  return buildPayload(
    { PLN: 1.0, USD: usd, EUR: eur, GBP: gbp },
    { source: 'nbp', table: tableA.no || 'A', effectiveDate: tableA.effectiveDate || null }
  );
}

async function fetchOpenErFallback() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD', {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`open.er-api HTTP ${res.status}`);
  const data = await res.json();
  const pln = Number(data?.rates?.PLN);
  const eurPerUsd = Number(data?.rates?.EUR);
  const gbpPerUsd = Number(data?.rates?.GBP);
  if (!(pln > 0)) throw new Error('open.er-api missing PLN rate');
  const eur = eurPerUsd > 0 ? pln / eurPerUsd : FALLBACK_PLN_PER_UNIT.EUR;
  const gbp = gbpPerUsd > 0 ? pln / gbpPerUsd : FALLBACK_PLN_PER_UNIT.GBP;
  return buildPayload(
    { PLN: 1.0, USD: pln, EUR: eur, GBP: gbp },
    { source: 'open.er-api' }
  );
}

export async function handleExchangeRate(context, url, method) {
  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let cache = null;
  let cacheKeyReq = null;
  try {
    if (typeof caches !== 'undefined' && caches.default) {
      cache = caches.default;
      const cacheUrl = new URL(url.toString());
      cacheUrl.search = '';
      cacheKeyReq = new Request(cacheUrl.toString(), { method: 'GET' });
      const cachedRes = await cache.match(cacheKeyReq);
      if (cachedRes) {
        const hit = new Response(cachedRes.body, cachedRes);
        hit.headers.set('X-Cache', 'HIT');
        return hit;
      }
    }
  } catch {
    cache = null;
  }

  let payload = null;
  try {
    payload = await fetchNbpRates();
  } catch (nbpErr) {
    console.warn('[exchange-rate] NBP fetch failed, trying secondary provider:', nbpErr?.message);
    try {
      payload = await fetchOpenErFallback();
    } catch (erErr) {
      console.warn('[exchange-rate] secondary FX fetch failed, serving static fallback:', erErr?.message);
      payload = buildPayload(FALLBACK_PLN_PER_UNIT, { source: 'fallback' });
    }
  }

  const isLive = payload.source !== 'fallback';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': isLive
      ? 'public, max-age=14400, s-maxage=14400'
      : 'no-store',
    'X-FX-Source': payload.source,
    'X-Cache': 'MISS',
  };

  const response = new Response(JSON.stringify(payload), { status: 200, headers });

  if (isLive && cache && cacheKeyReq) {
    try {
      const toCache = response.clone();
      if (context?.ctx?.waitUntil) {
        context.ctx.waitUntil(cache.put(cacheKeyReq, toCache));
      } else {
        await cache.put(cacheKeyReq, toCache);
      }
    } catch {
      // Ignore edge Cache API put failures
    }
  }

  return response;
}
