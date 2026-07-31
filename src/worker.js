import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestGet as getBudgetHandler, onRequestPost as postBudgetHandler } from '../functions/api/budget.js';

function addSecurityHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self';");
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

    // Force HTTPS redirect if accessed via HTTP
    if (url.protocol === 'http:' || request.headers.get('x-forwarded-proto') === 'http') {
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

    return addSecurityHeaders(response);
  }
};
