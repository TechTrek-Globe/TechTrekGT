// BigWorm Worker - auth-checking reverse proxy for Guacamole
// Responsibilities:
// - Route /api/auth/* to auth function handlers
// - Route /api/guac-token to guac-token handler
// - Proxy /tunnel/* to Guacamole (ONLY after JWT validation)
// - Serve SPA assets for everything else

import { verifyToken, getTokenFromRequest } from '../functions/utils/auth.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestGet as guacTokenHandler } from '../functions/api/guac-token.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // --- Auth API routes (no JWT required) ---
    if (path === '/api/auth/login' && method === 'POST') {
      return loginHandler({ request, env, ctx });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      return logoutHandler({ request, env, ctx });
    }
    if (path === '/api/auth/me' && method === 'GET') {
      return meHandler({ request, env, ctx });
    }

    // --- Guacamole token exchange (JWT required) ---
    if (path === '/api/guac-token' && method === 'GET') {
      return guacTokenHandler({ request, env, ctx });
    }

    // --- Guacamole tunnel proxy (JWT required) ---
    if (path.startsWith('/tunnel/')) {
      return handleTunnelProxy(request, env, url, path);
    }

    // --- Serve SPA static assets ---
    return env.ASSETS.fetch(request);
  }
};

/**
 * Validates JWT then proxies the request to Guacamole via Cloudflare Tunnel.
 * Supports both HTTP and WebSocket upgrade requests.
 */
async function handleTunnelProxy(request, env, url, path) {
  // Validate JWT before forwarding anything to Guacamole
  const token = getTokenFromRequest(request);
  const payload = await verifyToken(token, env.JWT_SECRET);

  if (!payload) {
    const isWs = request.headers.get('Upgrade') === 'websocket';
    if (isWs) {
      // WebSocket auth failure - close with 1008 (policy violation)
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      server.close(1008, 'Unauthorized');
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.GUACAMOLE_INTERNAL_URL) {
    return new Response(JSON.stringify({ error: 'Guacamole tunnel not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build target URL: /tunnel/websocket-tunnel -> /guacamole/websocket-tunnel
  const guacPath = path.replace('/tunnel', '/guacamole');
  const targetUrl = `${env.GUACAMOLE_INTERNAL_URL}${guacPath}${url.search}`;

  try {
    // Forward request to Guacamole - Cloudflare handles WS upgrade transparently
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });

    return await fetch(proxyRequest);
  } catch (err) {
    console.error('[bigworm/tunnel] proxy error:', err);
    return new Response(JSON.stringify({ error: 'Guacamole service unreachable. Check tunnel status.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://bigworm.techtrekgt.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}
