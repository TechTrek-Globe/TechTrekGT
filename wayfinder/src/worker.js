// TechTrek Wayfinder Worker
// - Routes /api/auth/* to auth handlers (shared JWT with Finance/Outpost)
// - Routes /api/wayfinder/* to wayfinder API handlers (auth required)
// - Serves SPA assets for all other paths

import { verifyToken, getTokenFromRequest } from '../functions/utils/auth.js';
import { onRequestPost as loginHandler }  from '../functions/api/auth/login.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestGet  as meHandler }     from '../functions/api/auth/me.js';
import { handleJourneys }   from '../functions/api/wayfinder/journeys.js';
import { handleItinerary }  from '../functions/api/wayfinder/itinerary.js';
import { handleDocuments }  from '../functions/api/wayfinder/documents.js';
import { handleImportJobs } from '../functions/api/wayfinder/import-jobs.js';
import { handleBudget }     from '../functions/api/wayfinder/budget.js';

const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://techtrekgt.com';
  return {
    'Access-Control-Allow-Origin':      allowed,
    'Access-Control-Allow-Methods':     'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age':           '86400',
  };
}

function addSecurityHeaders(response, isLocal = false) {
  const h = new Headers(response.headers);
  if (!isLocal) {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    h.set('Content-Security-Policy', [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' https://techtrekgt.com",
      "img-src 'self' data: blob: https://fonts.gstatic.com https://www.transparenttextures.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join('; '));
  }
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('X-XSS-Protection', '0');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  const ct = h.get('content-type') || '';
  if (ct.includes('text/html')) {
    h.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    h.set('Pragma', 'no-cache');
    h.set('Expires', '0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

async function requireAuth(request, env) {
  const token = getTokenFromRequest(request);
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) {
    return { ok: false, error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })};
  }
  return { ok: true, payload };
}

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin') || '';
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // --- Public auth routes ---
    if (path === '/api/auth/login'  && method === 'POST') return loginHandler({ request, env, ctx });
    if (path === '/api/auth/logout' && method === 'POST') return logoutHandler({ request, env, ctx });
    if (path === '/api/auth/me'     && method === 'GET')  return meHandler({ request, env, ctx });

    // --- Protected wayfinder API routes ---
    if (path.startsWith('/api/wayfinder/')) {
      const auth = await requireAuth(request, env);
      if (!auth.ok) return auth.error;

      const context = { request, env, ctx, user: auth.payload };

      if (path.startsWith('/api/wayfinder/journeys'))    return handleJourneys(context, url, method);
      if (path.startsWith('/api/wayfinder/itinerary'))   return handleItinerary(context, url, method);
      if (path.startsWith('/api/wayfinder/documents'))   return handleDocuments(context, url, method);
      if (path.startsWith('/api/wayfinder/import-jobs')) return handleImportJobs(context, url, method);
      if (path.startsWith('/api/wayfinder/budget'))      return handleBudget(context, url, method);

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- Serve SPA assets ---
    let assetReq = request;
    if (path.startsWith('/wayfinder/assets/')) {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = assetUrl.pathname.slice('/wayfinder'.length);
      assetReq = new Request(assetUrl.toString(), request);
    } else if (path === '/wayfinder' || path.startsWith('/wayfinder/')) {
      const spaUrl = new URL(request.url);
      spaUrl.pathname = '/';
      assetReq = new Request(spaUrl.toString(), request);
    }
    const assetResp = await env.ASSETS.fetch(assetReq);
    return addSecurityHeaders(assetResp, isLocal);
  },
};
