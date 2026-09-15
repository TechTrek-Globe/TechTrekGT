import { onRequestPost as loginPost }   from '../functions/api/auth/login.js';
import { onRequestPost as logoutPost }  from '../functions/api/auth/logout.js';
import { onRequestGet  as meGet }       from '../functions/api/auth/me.js';
import { onRequestGet  as itemsGet }    from '../functions/api/vinescout/items.js';
import { onRequestPost as syncPost }    from '../functions/api/vinescout/sync.js';
import { onRequestGet  as ordersGet }   from '../functions/api/vinescout/orders.js';
import { onRequestGet  as taxGet, onRequestPut as taxPut } from '../functions/api/vinescout/tax.js';

/**
 * techtrek-vinescout Cloudflare Worker
 *
 * Strips the /vinescout prefix before routing API calls.
 * Falls back to ASSETS (dist/client SPA) for all non-/api/* requests.
 * SSO auth via shared JWT_SECRET HttpOnly cookie (credentials: 'include').
 */

const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://localhost:5175',  // vinescout dev
  'http://localhost:3000',  // finance dev
  'http://localhost:3001',  // outpost dev
  'http://localhost:5174',  // wayfinder dev
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
    const url       = new URL(request.url);
    const origin    = request.headers.get('Origin') || '';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    // Strip /vinescout prefix for routing - always normalized to /api/...
    let pathname = url.pathname;
    if (pathname.startsWith('/vinescout/')) {
      pathname = pathname.slice('/vinescout'.length);
    } else if (pathname === '/vinescout') {
      pathname = '/';
    }

    // 1. HTTPS redirect (skip localhost)
    if (!isLocalhost && url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // 2. OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }), origin, isLocalhost);
    }

    // 3. API route matching
    if (pathname.startsWith('/api/')) {
      const context = { request, env, ctx };
      let response;

      try {
        // Auth routes (public)
        if (pathname === '/api/auth/login'  && request.method === 'POST')  response = await loginPost(context);
        else if (pathname === '/api/auth/logout' && request.method === 'POST') response = await logoutPost(context);
        else if (pathname === '/api/auth/me'     && request.method === 'GET')  response = await meGet(context);

        // VScout domain routes (JWT-guarded inside each handler)
        else if (pathname === '/api/vinescout/items'  && request.method === 'GET')  response = await itemsGet(context);
        else if (pathname === '/api/vinescout/sync'   && request.method === 'POST') response = await syncPost(context);
        else if (pathname === '/api/vinescout/orders' && request.method === 'GET')  response = await ordersGet(context);
        else if (pathname === '/api/vinescout/tax'    && request.method === 'GET')  response = await taxGet(context);
        else if (pathname === '/api/vinescout/tax'    && request.method === 'PUT')  response = await taxPut(context);

        // Health check (no auth)
        else if (pathname === '/api/health') {
          response = new Response(
            JSON.stringify({ status: 'ok', worker: 'techtrek-vinescout', ts: Date.now() }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Unknown /api/* route
        else {
          response = new Response(
            JSON.stringify({ error: 'Endpoint not found', path: pathname }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Worker error';
        console.error('[vinescout worker] unhandled error:', msg);
        response = new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return addCorsHeaders(response, origin, isLocalhost);
    }

    // 4. SPA fallback - serve dist/client via ASSETS binding
    return env.ASSETS.fetch(request);
  }
};
