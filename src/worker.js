import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestPost as forgotPasswordHandler } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordHandler } from '../functions/api/auth/reset-password.js';
import { onRequestPost as securityQuestionHandler } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfileHandler } from '../functions/api/auth/update-profile.js';
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
  const allowedOrigins = [
    'https://techtrekgt.com',
    'https://techtrek-budget.pages.dev',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const origin = response.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    newHeaders.set('Access-Control-Allow-Origin', origin);
  } else {
    newHeaders.set('Access-Control-Allow-Origin', 'https://techtrekgt.com');
  }
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
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

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return addSecurityHeaders(new Response(null, { status: 204 }), isLocalhost);
    }

    let response;
    try {
      // Normalize subpath /finance or /finance/ for API routing
      let apiPath = url.pathname;
      if (apiPath.startsWith('/finance/api/')) {
        apiPath = apiPath.slice('/finance'.length);
      } else if (apiPath === '/finance/api') {
        apiPath = '/api';
      }

      // API Route Routing
      if (apiPath === '/api/auth/register' && request.method === 'POST') {
        response = await registerHandler(context);
      } else if (apiPath === '/api/auth/login' && request.method === 'POST') {
        response = await loginHandler(context);
      } else if (apiPath === '/api/auth/forgot-password' && request.method === 'POST') {
        response = await forgotPasswordHandler(context);
      } else if (apiPath === '/api/auth/reset-password' && request.method === 'POST') {
        response = await resetPasswordHandler(context);
      } else if (apiPath === '/api/auth/security-question' && request.method === 'POST') {
        response = await securityQuestionHandler(context);
      } else if (apiPath === '/api/auth/update-profile' && request.method === 'POST') {
        response = await updateProfileHandler(context);
      } else if (apiPath === '/api/auth/me' && request.method === 'GET') {
        response = await meHandler(context);
      } else if (apiPath === '/api/auth/logout' && request.method === 'POST') {
        response = await logoutHandler(context);
      } else if (apiPath === '/api/budget') {
        if (request.method === 'GET') response = await getBudgetHandler(context);
        else if (request.method === 'POST') response = await postBudgetHandler(context);
        else response = new Response('Method not allowed', { status: 405 });
      } else if (apiPath.startsWith('/api/')) {
        // If URL starts with /api/ but didn't match any route above
        response = new Response(JSON.stringify({ error: 'Endpoint not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (url.pathname.startsWith('/finance/assets/')) {
        // Rewrite asset requests under /finance/assets/ to /assets/
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetUrl.pathname.slice('/finance'.length);
        response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      } else if (url.pathname === '/finance' || url.pathname.startsWith('/finance/')) {
        // SPA entry fallback for /finance subpath
        const spaUrl = new URL(request.url);
        spaUrl.pathname = '/';
        response = await env.ASSETS.fetch(new Request(spaUrl.toString(), request));
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
