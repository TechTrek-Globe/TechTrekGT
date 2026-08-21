import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestPost as forgotPasswordHandler } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordHandler } from '../functions/api/auth/reset-password.js';
import { onRequestPost as securityQuestionHandler } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfileHandler } from '../functions/api/auth/update-profile.js';
import { getTokenFromRequest, verifyToken } from '../functions/utils/auth.js';

async function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  
  const aHash = await crypto.subtle.digest('SHA-256', aBuf);
  const bHash = await crypto.subtle.digest('SHA-256', bBuf);
  
  const aView = new Uint8Array(aHash);
  const bView = new Uint8Array(bHash);
  
  let mismatch = 0;
  for (let i = 0; i < aView.length; i++) {
    mismatch |= (aView[i] ^ bView[i]);
  }
  return mismatch === 0;
}

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
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' https://techtrekgt.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
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
    'http://localhost:3000'
  ];
  const origin = response.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    newHeaders.set('Access-Control-Allow-Origin', origin);
  } else {
    newHeaders.set('Access-Control-Allow-Origin', 'https://techtrekgt.com');
  }
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Passcode');
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

async function handleVerifySyncCode(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const code = body?.code || '';
    const secretCode = env?.SYNC_UNLOCK_CODE || '123456';

    if (!code || !(await timingSafeStringEqual(String(code).trim(), String(secretCode).trim()))) {
      return new Response(JSON.stringify({ error: 'Invalid access passcode' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, token: 'vault-unlocked' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function verifySyncGuard(request, env) {
  const passcode = request.headers.get('x-sync-passcode') || request.headers.get('authorization')?.replace('Bearer ', '') || '';
  const secretCode = env?.SYNC_UNLOCK_CODE || '123456';
  return await timingSafeStringEqual(String(passcode).trim(), String(secretCode).trim());
}

async function handleSyncBackup(context) {
  const { request, env } = context;

  const token = getTokenFromRequest(request);
  const payload = await verifyToken(token, env?.JWT_SECRET);
  const userId = payload?.userId || payload?.id;
  if (!payload || !userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid JWT session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!(await verifySyncGuard(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing vault passcode' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env?.DB) {
    return new Response(JSON.stringify({ error: 'D1 database binding not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const dataStr = JSON.stringify(body.budget || body);

    await env.DB.prepare(`
      INSERT INTO user_backups (user_id, data, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=datetime('now')
    `).bind(userId, dataStr).run();

    return new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Backup failed: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSyncRestore(context) {
  const { request, env } = context;

  const token = getTokenFromRequest(request);
  const payload = await verifyToken(token, env?.JWT_SECRET);
  const userId = payload?.userId || payload?.id;
  if (!payload || !userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid JWT session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!(await verifySyncGuard(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing vault passcode' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env?.DB) {
    return new Response(JSON.stringify({ error: 'D1 database binding not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const row = await env.DB.prepare('SELECT data, updated_at FROM user_backups WHERE user_id = ?').bind(userId).first();

    if (!row || !row.data) {
      return new Response(JSON.stringify({ error: 'No cloud vault backup found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsed = JSON.parse(row.data);
    return new Response(JSON.stringify({ success: true, budget: parsed.budget || parsed, updatedAt: row.updated_at }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: `Restore failed: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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

    // Redirect requests for Outpost sub-site (/Outpost, /OUTPOST, /auction) to lowercase /outpost
    if (/^\/(outpost|auction)($|\/|\?)/i.test(url.pathname)) {
      if (!url.pathname.startsWith('/outpost')) {
        const outpostUrl = new URL(request.url);
        outpostUrl.pathname = outpostUrl.pathname.replace(/^\/(outpost|auction)/i, '/outpost');
        return Response.redirect(outpostUrl.toString(), 301);
      }
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
      if (apiPath === '/api/verify-sync-code' && request.method === 'POST') {
        response = await handleVerifySyncCode(context);
      } else if (apiPath === '/api/sync/backup' && request.method === 'POST') {
        response = await handleSyncBackup(context);
      } else if (apiPath === '/api/sync/restore' && request.method === 'GET') {
        response = await handleSyncRestore(context);
      } else if (apiPath === '/api/auth/register' && request.method === 'POST') {
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
        if (env?.ASSETS?.fetch) {
          response = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
        } else {
          response = await fetch(new Request(assetUrl.toString(), request));
        }
      } else if (url.pathname === '/finance' || url.pathname.startsWith('/finance/')) {
        // SPA entry fallback for /finance subpath
        const spaUrl = new URL(request.url);
        spaUrl.pathname = '/';
        if (env?.ASSETS?.fetch) {
          response = await env.ASSETS.fetch(new Request(spaUrl.toString(), request));
        } else {
          response = await fetch(new Request(spaUrl.toString(), request));
        }
      } else {
        // Fallback to static SPA assets
        if (env?.ASSETS?.fetch) {
          response = await env.ASSETS.fetch(request);
        } else {
          response = await fetch(request);
        }
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
