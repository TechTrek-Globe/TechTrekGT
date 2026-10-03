/**
 * techtrek-bourbon Cloudflare Worker
 *
 * Strips the /bourbon prefix before routing API calls.
 * Falls back to ASSETS (dist/client SPA) for all non-/api/* requests.
 * Caches Google Sheet requests for 5 minutes to prevent rate limits.
 */

const SHEET_ID = '1XfZCAILlqCNuPkpAJ3alZc8XOBMFu4M24dH-mTrhlrA';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet1`;

const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://localhost:5176',  // bourbon dev
  'http://localhost:5175',  // vinescout dev
  'http://localhost:5174',  // wayfinder dev
  'http://localhost:3000',  // finance dev
  'http://localhost:3001',  // outpost dev
  'http://localhost:8787'   // landing dev
];

function addCorsHeaders(response, origin, isLocalhost) {
  const newHeaders = new Headers(response.headers);

  if (!isLocalhost) {
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const allowedOrigin = (isLocalhost || ALLOWED_ORIGINS.includes(origin))
    ? (origin || 'https://techtrekgt.com')
    : 'https://techtrekgt.com';

  newHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  newHeaders.set('Access-Control-Max-Age', '86400');
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }), origin, isLocalhost);
    }

    // Strip /bourbon prefix if present
    let path = url.pathname;
    if (path.startsWith('/bourbon')) {
      path = path.slice('/bourbon'.length) || '/';
    }

    // Health check
    if (path === '/api/bourbon/health' || path === '/api/health') {
      return addCorsHeaders(
        new Response(JSON.stringify({ status: 'ok', service: 'bourbon-sommelier', time: new Date().toISOString() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }),
        origin,
        isLocalhost
      );
    }

    // Proxy Google Sheet data with caching
    if (path === '/api/bourbon/data' || path === '/api/data') {
      try {
        const cache = caches.default;
        const cacheKey = new Request(CSV_URL, { method: 'GET' });
        let cachedResponse = await cache.match(cacheKey);

        if (!cachedResponse) {
          const sheetRes = await fetch(CSV_URL, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TechTrek-BourbonWorker/1.0'
            }
          });

          if (sheetRes.ok) {
            const csvText = await sheetRes.text();
            cachedResponse = new Response(csvText, {
              status: 200,
              headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Cache-Control': 'public, max-age=300, s-maxage=300'
              }
            });
            ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
          }
        }

        if (cachedResponse) {
          return addCorsHeaders(cachedResponse, origin, isLocalhost);
        }
      } catch (err) {
        console.error('Worker Google Sheet proxy error:', err);
      }

      return addCorsHeaders(
        new Response(JSON.stringify({ error: 'Failed to fetch upstream spreadsheet' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        }),
        origin,
        isLocalhost
      );
    }

    // Fall back to Cloudflare ASSETS (SPA)
    if (env.ASSETS) {
      try {
        // Rewrite request url without /bourbon prefix for static asset lookup
        const assetUrl = new URL(request.url);
        assetUrl.pathname = path;
        const assetReq = new Request(assetUrl.toString(), request);
        const assetResp = await env.ASSETS.fetch(assetReq);

        // If asset not found and requesting non-file, serve root SPA index
        if (assetResp.status === 404 && !path.includes('.')) {
          const indexUrl = new URL(request.url);
          indexUrl.pathname = '/';
          return await env.ASSETS.fetch(new Request(indexUrl.toString(), request));
        }

        return assetResp;
      } catch (err) {
        console.error('ASSETS fetch error:', err);
      }
    }

    return new Response('Sprig Bourbon Sommelier Worker Active', { status: 200 });
  }
};
