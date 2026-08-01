import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestGet as getBudgetHandler, onRequestPost as postBudgetHandler } from '../functions/api/budget.js';

/**
 * @param {Response} response
 * @param {boolean} [isLocalhost]
 */
function addSecurityHeaders(response, isLocalhost = false) {
  const newHeaders = new Headers(response.headers);
  if (!isLocalhost) {
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    newHeaders.set('Content-Security-Policy', [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'"
    ].join('; '));
  }
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('X-XSS-Protection', '0');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // CORS headers for production domain
  const allowedOrigins = ['https://techtrek-budget.pages.dev'];
  const origin = response.headers.get('Origin'); // Request isn't available here easily, so we might not be able to echo back origin dynamically unless passed.
  // Actually, we can just set it generically or use a wildcard for local/dev, but since it's a SPA served from same origin, CORS isn't strictly needed unless fetching from another domain.
  // However, it's good practice to set it.
  newHeaders.set('Access-Control-Allow-Origin', 'https://techtrek-budget.pages.dev');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newHeaders.set('Access-Control-Max-Age', '86400');


  const contentType = newHeaders.get('content-type') || '';
  if (contentType.includes('text/html')) {
    newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('Expires', '0');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

export default {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {any} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    // Force HTTPS redirect if accessed via HTTP (except localhost)
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!isLocalhost && (url.protocol === 'http:' || request.headers.get('x-forwarded-proto') === 'http')) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    let response;
    try {
      // API Route Routing
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        response = await registerHandler(context);
      } else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        response = await loginHandler(context);
      } else if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        response = await meHandler(context);
      } else if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        response = await logoutHandler(context);
      } else if (url.pathname === '/api/budget') {
        if (request.method === 'GET') response = await getBudgetHandler(context);
        else if (request.method === 'POST') response = await postBudgetHandler(context);
        else response = new Response('Method not allowed', { status: 405 });
      } else if (url.pathname.startsWith('/api/')) {
        // If URL starts with /api/ but didn't match any route above
        response = new Response(JSON.stringify({ error: 'Endpoint not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Fallback to static SPA assets
        response = await env.ASSETS.fetch(request);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err || 'Server error');
      response = new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return addSecurityHeaders(response, isLocalhost);
  }
};
