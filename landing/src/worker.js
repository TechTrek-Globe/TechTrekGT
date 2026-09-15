import { onRequestGet as ebayCompsGet, onRequestPost as ebayCompsPost }
  from './gateway/ebay.js';
import { onRequestGet as ebayCatalogGet }
  from './gateway/ebayCatalog.js';
import { onRequestGet as ebayItemGet }
  from './gateway/ebayItem.js';
import { onRequestPost as amazonFetchPost }
  from './gateway/amazon.js';
import {
  onRequestGetStart as ebayOAuthStart,
  onRequestGetCallback as ebayOAuthCallback,
  onRequestGetStatus as ebayOAuthStatus,
  onRequestDelete as ebayOAuthDisconnect
} from './gateway/ebayOAuth.js';
import {
  onRequestGet as ebayWebhookGet,
  onRequestPost as ebayWebhookPost
} from './gateway/ebayWebhook.js';
import { onRequestGet as ebayFinancesGet } from './gateway/ebayFinances.js';
import { onRequestGet as ebayListingsGet } from './gateway/ebayListings.js';

/**
 * techtrek-landing API Gateway Worker
 *
 * Routes /api/* requests to the appropriate gateway handler.
 * Validates JWT via shared SSO cookie (stateless - no D1 binding in Phase 1).
 * Falls back to static ASSETS for all non-/api/* requests (landing page HTML/CSS/JS).
 */

const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://localhost:3001',  // outpost dev
  'http://localhost:3000',  // finance dev
  'http://localhost:5174',  // wayfinder dev
  'http://localhost:5175',  // vinescout dev
  'http://localhost:5173',  // bigworm dev
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
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  newHeaders.set('Access-Control-Max-Age', '86400');
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const origin = request.headers.get('Origin') || '';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    // 1. HTTPS redirect (skip localhost)
    if (!isLocalhost && url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // 2. OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }), origin, isLocalhost);
    }

    // 3. Gateway API route matching - intercept /api/* before ASSETS
    if (pathname.startsWith('/api/')) {
      const context = { request, env, ctx };
      let response;

      try {
        // --- eBay Comps Gateway ---
        if (pathname === '/api/ebay/comps' && request.method === 'GET') {
          response = await ebayCompsGet(context);
        } else if (pathname === '/api/ebay/comps' && request.method === 'POST') {
          response = await ebayCompsPost(context);

        // --- eBay Catalog Gateway ---
        } else if (pathname === '/api/ebay/catalog' && request.method === 'GET') {
          response = await ebayCatalogGet(context);

        // --- eBay Item Detail Gateway ---
        } else if (pathname.startsWith('/api/ebay/item/') && request.method === 'GET') {
          response = await ebayItemGet(context);

        // --- eBay OAuth ACG Flow ---
        } else if (pathname === '/api/ebay/oauth/start' && request.method === 'GET') {
          response = await ebayOAuthStart(context);
        } else if (pathname === '/api/ebay/oauth/callback' && request.method === 'GET') {
          response = await ebayOAuthCallback(context);
        } else if (pathname === '/api/ebay/oauth/status' && request.method === 'GET') {
          response = await ebayOAuthStatus(context);
        } else if (pathname === '/api/ebay/oauth/disconnect' && request.method === 'DELETE') {
          response = await ebayOAuthDisconnect(context);

        // --- eBay Webhook Listener ---
        } else if (pathname === '/api/ebay/webhook' && request.method === 'GET') {
          response = await ebayWebhookGet(context);
        } else if (pathname === '/api/ebay/webhook' && request.method === 'POST') {
          response = await ebayWebhookPost(context);

        // --- eBay Finances API Proxy ---
        } else if (pathname === '/api/ebay/finances' && request.method === 'GET') {
          response = await ebayFinancesGet(context);

        // --- eBay Listings API Proxy ---
        } else if ((pathname === '/api/ebay/listings' || pathname.startsWith('/api/ebay/listings/')) && request.method === 'GET') {
          response = await ebayListingsGet(context);

        // --- Amazon Fetch Gateway ---
        } else if (pathname === '/api/amazon/fetch' && request.method === 'POST') {
          response = await amazonFetchPost(context);

        // --- Health check (no auth required) ---
        } else if (pathname === '/api/health') {
          response = new Response(
            JSON.stringify({ status: 'ok', worker: 'techtrek-landing', ts: Date.now() }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );

        // --- Unknown /api/* ---
        } else {
          response = new Response(
            JSON.stringify({ error: 'Gateway endpoint not found', path: pathname }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gateway error';
        console.error('[landing worker] unhandled error:', msg);
        response = new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return addCorsHeaders(response, origin, isLocalhost);
    }

    // 4. Static asset fallback for landing page HTML, CSS, JS
    return env.ASSETS.fetch(request);
  }
};
