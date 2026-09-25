import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestPost as forgotPasswordHandler } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordHandler } from '../functions/api/auth/reset-password.js';
import { onRequestGet as securityQuestionHandler } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfileHandler } from '../functions/api/auth/update-profile.js';
import { onRequestGet as adminStatsHandler } from '../functions/api/admin/stats.js';
import {
  authenticate,
  readJson,
  json,
  fail,
  base64UrlEncodeBytes,
  constantTimeStringEqual,
  MAX_BODY_AUTH,
  MAX_BODY_SYNC
} from '../functions/utils/auth.js';
import { enforceRateLimit } from '../functions/utils/rateLimit.js';

export { RateLimiter } from './RateLimiter.js';

/* ------------------------------------------------------------------ */
/* Allowed Origins & Security Configuration                            */
/* ------------------------------------------------------------------ */

export const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://techtrekgt.com',
  'https://techtrek-budget.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8787'
];

function buildCsp(nonce) {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // No 'unsafe-inline' for scripts. Nonce + strict-dynamic instead.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    "connect-src 'self' https://techtrekgt.com https://challenges.cloudflare.com",
    "img-src 'self' data: blob: https://challenges.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src 'self' https://challenges.cloudflare.com blob:",
    "child-src 'self' https://challenges.cloudflare.com blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
}

class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }
  element(el) {
    el.setAttribute('nonce', this.nonce);
  }
}

function addSecurityHeaders(response, { isLocalhost = false, requestOrigin = '', nonce = '' } = {}) {
  const headers = new Headers(response.headers);

  if (!isLocalhost) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    headers.set('Content-Security-Policy', buildCsp(nonce));
  }

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '0');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Only emit CORS headers for origins on the allowlist, and always Vary on Origin
  headers.append('Vary', 'Origin');
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers.set('Access-Control-Allow-Origin', requestOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Sync-Passcode');
    headers.set('Access-Control-Max-Age', '86400');
  }

  const contentType = headers.get('content-type') || '';
  const isHtml = contentType.includes('text/html');

  if (isHtml) {
    headers.set('Cache-Control', 'no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }
  if (contentType.includes('application/json')) {
    headers.set('Cache-Control', 'no-store');
  }

  const rewritten = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  if (isHtml && nonce && response.body) {
    return new HTMLRewriter().on('script', new NonceInjector(nonce)).transform(rewritten);
  }
  return rewritten;
}

/* ------------------------------------------------------------------ */
/* Sync Handlers (hardened)                                            */
/* ------------------------------------------------------------------ */

async function handleVerifySyncCode(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, 'sync-code', 5, 300);
  if (limited) return limited;

  // Fails closed when unconfigured. No "123456" fallback (fix C4).
  const secretCode = env?.SYNC_UNLOCK_CODE;
  if (!secretCode) {
    console.error('[verify-sync-code] SYNC_UNLOCK_CODE is not configured');
    return fail(503, 'Service unavailable.');
  }

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    const code = body && typeof body.code === 'string' ? body.code.trim() : '';
    if (!code || !(await constantTimeStringEqual(code, String(secretCode).trim()))) {
      return fail(401, 'Invalid access passcode');
    }
    return json({ success: true, token: 'vault-unlocked' });
  } catch (err) {
    console.error('[verify-sync-code] error:', err && err.message);
    return fail(500, 'Verification failed');
  }
}

async function handleSyncBackup(context) {
  const { request, env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await readJson(request, MAX_BODY_SYNC);
    if (!body) return fail(400, 'Invalid or oversized request body.');

    const payload = body.budget !== undefined ? body.budget : body;
    const dataStr = JSON.stringify(payload);
    if (dataStr.length > MAX_BODY_SYNC) return fail(413, 'Backup payload is too large.');

    await env.DB.prepare(
      `INSERT INTO user_backups (id, data, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
    ).bind(userId, dataStr).run();

    return json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[sync/backup] error:', err && err.message);
    return fail(500, 'Backup failed.');
  }
}

async function handleSyncRestore(context) {
  const { env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const row = await env.DB.prepare(
      'SELECT data, updated_at FROM user_backups WHERE id = ?'
    ).bind(userId).first();

    if (!row || !row.data) return fail(404, 'No cloud backup found');

    let parsed;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      console.error('[sync/restore] stored backup is not valid JSON for user', userId);
      return fail(500, 'Stored backup could not be read.');
    }

    return json({
      success: true,
      budget: parsed && parsed.budget !== undefined ? parsed.budget : parsed,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('[sync/restore] error:', err && err.message);
    return fail(500, 'Restore failed.');
  }
}

/* ------------------------------------------------------------------ */
/* Router & Dispatch                                                   */
/* ------------------------------------------------------------------ */

const ROUTES = {
  'POST /api/verify-sync-code': handleVerifySyncCode,
  'POST /api/sync/backup': handleSyncBackup,
  'GET /api/sync/restore': handleSyncRestore,
  'POST /api/auth/register': registerHandler,
  'POST /api/auth/login': loginHandler,
  'POST /api/auth/forgot-password': forgotPasswordHandler,
  'POST /api/auth/reset-password': resetPasswordHandler,
  'GET /api/auth/security-question': securityQuestionHandler,
  'POST /api/auth/update-profile': updateProfileHandler,
  'GET /api/auth/me': meHandler,
  'POST /api/auth/logout': logoutHandler,
  'GET /api/admin/stats': adminStatsHandler
};

async function fetchAsset(env, request, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  const assetRequest = new Request(assetUrl.toString(), request);
  if (env?.ASSETS?.fetch) return env.ASSETS.fetch(assetRequest);
  return fetch(assetRequest);
}

const worker = {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {any} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };
    const host = request.headers.get('host') || url.host || '';
    const isProduction = Boolean(request.headers.get('cf-ray'));
    const isLocalhost = !isProduction || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || host.includes('localhost') || host.includes('127.0.0.1') || Boolean(url.port);
    const requestOrigin = request.headers.get('Origin') || '';
    const nonce = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(16)));
    const headerOpts = { isLocalhost, requestOrigin, nonce };

    if (isProduction && !isLocalhost && (url.protocol === 'http:' || request.headers.get('x-forwarded-proto') === 'http')) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === 'OPTIONS') {
      if (!requestOrigin || !ALLOWED_ORIGINS.includes(requestOrigin)) {
        return addSecurityHeaders(new Response(null, { status: 403 }), headerOpts);
      }
      return addSecurityHeaders(new Response(null, { status: 204 }), headerOpts);
    }

    // Redirect requests for Outpost sub-site (/Outpost, /OUTPOST, /auction) to lowercase /outpost
    if (/^\/(outpost|auction)($|\/|\?)/i.test(url.pathname)) {
      if (!url.pathname.startsWith('/outpost')) {
        const outpostUrl = new URL(request.url);
        outpostUrl.pathname = outpostUrl.pathname.replace(/^\/(outpost|auction)/i, '/outpost');
        return Response.redirect(outpostUrl.toString(), 301);
      }
    }

    let response;
    try {
      let apiPath = url.pathname;
      if (apiPath.startsWith('/finance/api/')) {
        apiPath = apiPath.slice('/finance'.length);
      } else if (apiPath === '/finance/api') {
        apiPath = '/api';
      }

      const handler = ROUTES[`${request.method} ${apiPath}`];

      if (handler) {
        if (
          request.method !== 'GET' &&
          requestOrigin &&
          !ALLOWED_ORIGINS.includes(requestOrigin)
        ) {
          response = fail(403, 'Forbidden');
        } else {
          response = await handler(context);
        }
      } else if (apiPath.startsWith('/api/')) {
        response = fail(404, 'Endpoint not found');
      } else if (url.pathname.startsWith('/finance/assets/')) {
        response = await fetchAsset(env, request, url.pathname.slice('/finance'.length));
      } else if (url.pathname.startsWith('/finance/') && /\.[a-zA-Z0-9]+$/.test(url.pathname)) {
        response = await fetchAsset(env, request, url.pathname.slice('/finance'.length));
      } else if (url.pathname === '/finance' || url.pathname.startsWith('/finance/')) {
        response = await fetchAsset(env, request, '/');
      } else {
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(request) : await fetch(request);
      }
    } catch (err) {
      console.error('[worker] unhandled error:', err && err.message, err && err.stack);
      response = fail(500, 'An internal error occurred.');
    }

    return addSecurityHeaders(response, headerOpts);
  }
};

export default worker;
