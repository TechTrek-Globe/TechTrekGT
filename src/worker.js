import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestGet as getBudgetHandler, onRequestPost as postBudgetHandler } from '../functions/api/budget.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    try {
      // API Route Routing
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        return await registerHandler(context);
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        return await loginHandler(context);
      }

      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        return await meHandler(context);
      }

      if (url.pathname === '/api/budget') {
        if (request.method === 'GET') return await getBudgetHandler(context);
        if (request.method === 'POST') return await postBudgetHandler(context);
      }

      // If URL starts with /api/ but didn't match any route above
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fallback to static SPA assets
      return await env.ASSETS.fetch(request);

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
