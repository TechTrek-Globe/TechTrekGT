// WebCrypto Authentication & JWT helpers for Cloudflare Workers / D1
// All fixes from SECURITY-FIXES.md are implemented here.
// Do not simplify constant-time comparisons, fail-closed branches, or
// the PBKDF2 iteration cap - each maps to a specific security finding.

import { ERROR_CODES } from './errorCodes.js';
export { ERROR_CODES };

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

// PBKDF2 configuration (benchmark validated 2026-09-25):
// Benchmarks executed in Cloudflare Workers runtime (workerd):
//   - 100,000 iterations: ~36ms
//   - 300,000 iterations: ~107ms
//   - 600,000 iterations: ~221ms
//   - 1,000,000 iterations: ~360ms
//   - 2,000,000 iterations: ~724ms
// PBKDF2_ITERATIONS is set to 600,000 to meet OWASP's current recommendation
// for PBKDF2-HMAC-SHA256 while keeping deriveBits execution (~220ms) comfortably
// within Cloudflare Workers CPU time limits, leaving ample headroom (~256ms total
// during rehash-on-login) for D1 queries, rate limiting, and response handling.
// PBKDF2_MAX_SUPPORTED is decoupled as a 2,000,000 sanity ceiling against malicious
// or corrupted stored hashes forcing CPU exhaustion.
export const PBKDF2_ITERATIONS = 600000;
export const PBKDF2_MAX_SUPPORTED = 2000000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_BITS = 256;

// NOTE: ACCESS_TOKEN_TTL is 2 hours regardless of the longer sexp granted for
// "remember me" (SESSION_TTL_REMEMBER = 30 days). The frontend MUST call
// /api/auth/refresh on an interval comfortably inside ACCESS_TOKEN_TTL
// (for example every 90 minutes) for "remember me" sessions to actually last
// SESSION_TTL_REMEMBER.
export const ACCESS_TOKEN_TTL = 2 * 60 * 60;           // 2 hours
export const SESSION_TTL_DEFAULT = 2 * 60 * 60;         // no rememberMe
export const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60; // rememberMe

export const ONE_TIME_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const VERIFY_CODE_TTL_MS = ONE_TIME_CODE_TTL_MS;   // 24 hours (backward compatibility alias)
export const RESET_CODE_TTL_MS = 15 * 60 * 1000;         // 15 minutes

export const MAX_BODY_AUTH = 64 * 1024;          // 64 KB
export const MAX_BODY_SYNC = 2 * 1024 * 1024;   // 2 MB

export const MAX_NAME_LEN = 100;
export const MAX_EMAIL_LEN = 254;
export const MAX_PASS_LEN = 128;
export const MAX_ANSWER_LEN = 200;
export const MAX_QUESTION_LEN = 200;

export const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

// Generic error body. Never echo internal exception text to clients. (M10, Stage 6.2)
export function fail(code, status, message, requestId = null) {
  return json({ error: message, code, ...(requestId ? { requestId } : {}) }, status);
}

/**
 * Centralized public user serializer.
 * Strips internal and cryptographic credentials (password_hash, security_answer_hash, token_version).
 * Returns strictly safe client fields: id, email, name, role-derived isAdmin, emailVerified,
 * pendingEmail, securityQuestion, hasSecurityQuestion.
 *
 * @param {object} user - Internal user database record or base properties
 * @param {object} [overrides={}] - Optional explicit overrides from endpoint handlers
 * @returns {object|null} Client-safe public user object
 */
export function toPublicUser(user, overrides = {}) {
  if (!user || typeof user !== 'object') return null;
  const merged = { ...user, ...overrides };

  const isAdmin = merged.isAdmin !== undefined
    ? Boolean(merged.isAdmin)
    : (merged.role === 'admin');

  const emailVerified = merged.emailVerified !== undefined
    ? Boolean(merged.emailVerified)
    : Boolean(merged.email_verified);

  const pendingEmail = merged.pendingEmail !== undefined
    ? (merged.pendingEmail || null)
    : (merged.pending_email || null);

  const securityQuestion = merged.securityQuestion !== undefined
    ? (merged.securityQuestion || null)
    : (merged.security_question || null);

  let hasSecurityQuestion = false;
  if (merged.hasSecurityQuestion !== undefined) {
    hasSecurityQuestion = Boolean(merged.hasSecurityQuestion);
  } else if (securityQuestion && (merged.security_answer_hash || merged.hasSecurityAnswer)) {
    hasSecurityQuestion = true;
  }

  return {
    id: merged.id,
    email: merged.email,
    name: merged.name,
    isAdmin,
    emailVerified,
    pendingEmail,
    securityQuestion,
    hasSecurityQuestion
  };
}

// Structured observability metric event (Stage 9.2)
export function emitMetric(event, requestId = null) {
  try {
    console.log(JSON.stringify({ type: 'metric', event, ...(requestId ? { requestId } : {}), ts: Date.now() }));
  } catch {}
}

function toHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// Constant-time byte comparison. Length compared first; arrays here are
// fixed-width (SHA-256 outputs), so no secret length is leaked. (AGENTS rule 10)
export function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Constant-time string compare - hash both sides so length does not leak. (AGENTS rule 10)
export async function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  return bytesEqual(new Uint8Array(ah), new Uint8Array(bh));
}

/* ------------------------------------------------------------------ */
/* UTF-8 safe base64url (fix H5)                                      */
/* ------------------------------------------------------------------ */

function bytesToBase64(bytes) {
  // Chunk to avoid call-stack overflow on large buffers.
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlEncodeBytes(bytes) {
  return bytesToBase64(bytes).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// UTF-8 first so btoa never receives non-Latin1 characters. (H5)
export function base64UrlEncode(str) {
  return base64UrlEncodeBytes(enc.encode(str));
}

export function base64UrlDecodeBytes(str) {
  // Validate alphabet before calling atob. (H5)
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('bad base64url');
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return base64ToBytes(b64);
}

export function base64UrlDecode(str) {
  return dec.decode(base64UrlDecodeBytes(str));
}

/* ------------------------------------------------------------------ */
/* Unbiased random integer (fix H8)                                   */
/* ------------------------------------------------------------------ */

// Rejection sampling removes modulo bias. Math.random is banned. (AGENTS rule 9)
export function randomInt(max) {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let v;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % max;
}

/* ------------------------------------------------------------------ */
/* Request body cap (fix M10)                                         */
/* ------------------------------------------------------------------ */

// Checks both Content-Length header and actual byte length. (M10)
export async function readJson(request, maxBytes) {
  const declared = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  if (buf.byteLength === 0) return null;
  try {
    const parsed = JSON.parse(dec.decode(buf));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function asTrimmedString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

/* ------------------------------------------------------------------ */
/* Password hashing (fix C2)                                          */
/* ------------------------------------------------------------------ */

export async function deriveBits(password, salt, iterations) {
  // Fail closed rather than throw NotSupportedError at runtime. (C2)
  if (iterations > PBKDF2_MAX_SUPPORTED) {
    const err = new Error('UNSUPPORTED_ITERATIONS');
    err.code = 'UNSUPPORTED_ITERATIONS';
    throw err;
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    PBKDF2_BITS
  );
  return new Uint8Array(bits);
}

// Format: saltHex:iterations:hashHex  (stored cost enables transparent upgrade)
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${toHex(salt)}:${PBKDF2_ITERATIONS}:${toHex(hash)}`;
}

export function isThreePartHash(storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const salt = fromHex(parts[0]);
  const iterations = parseInt(parts[1], 10);
  const hash = fromHex(parts[2]);
  return Boolean(salt && hash && Number.isInteger(iterations) && iterations >= 1);
}

export function parseStoredHash(storedHash) {
  if (typeof storedHash !== 'string') return null;
  const parts = storedHash.split(':');
  if (parts.length === 3) {
    const salt = fromHex(parts[0]);
    const iterations = parseInt(parts[1], 10);
    const hash = fromHex(parts[2]);
    if (!salt || !hash || !Number.isInteger(iterations) || iterations < 1) return null;
    return { salt, iterations, hash };
  }
  return null;
}

export async function verifyPassword(password, storedHash) {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  try {
    const candidate = await deriveBits(password, parsed.salt, parsed.iterations);
    return bytesEqual(candidate, parsed.hash);
  } catch (err) {
    if (err && err.code === 'UNSUPPORTED_ITERATIONS') {
      console.error('[auth] stored hash uses an unsupported iteration count; account needs a reset');
    } else {
      console.error('[auth] verifyPassword failed:', err && err.message);
    }
    return false;
  }
}

// True when a stored hash should be transparently upgraded after a good login.
export function needsRehash(storedHash) {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  return parsed.iterations !== PBKDF2_ITERATIONS;
}

/* ------------------------------------------------------------------ */
/* HMAC helper (fix C1 / H8)                                          */
/* ------------------------------------------------------------------ */

// Used to store reset codes hashed so a DB leak yields no usable tokens. (H8)
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

/* ------------------------------------------------------------------ */
/* Password validation                                                 */
/* ------------------------------------------------------------------ */

export function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (password.length > MAX_PASS_LEN) return 'Password exceeds maximum allowed length.';
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one uppercase letter and one number.';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* JWT (fix H5, H6)                                                   */
/* ------------------------------------------------------------------ */

// Claims include tv (token_version) and sexp (absolute session expiry). (H6)
export async function createToken(claims, secret, ttl = ACCESS_TOKEN_TTL, sessionExp = null) {
  if (!secret) throw new Error('JWT_SECRET is not configured');
  const now = Math.floor(Date.now() / 1000);
  const sexp = sessionExp || now + ttl;
  const exp = Math.min(now + ttl, sexp);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { ...claims, iat: now, exp, sexp };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  return { token: `${dataToSign}.${base64UrlEncodeBytes(new Uint8Array(sig))}`, payload };
}

export async function verifyToken(token, secret) {
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    // Reject alg confusion and alg:none outright. (M10)
    if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlDecodeBytes(encodedSignature);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      enc.encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!ok) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp < now) return null;
    // Reject expired absolute session window. (H6)
    if (typeof payload.sexp === 'number' && payload.sexp < now) return null;
    if (!payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Cookies & CSRF (fix M10)                                           */
/* ------------------------------------------------------------------ */

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match && match[1] ? match[1] : null;
}

// Returns { token, source } so CSRF can be enforced only for cookie auth. (M10)
export function getTokenFromRequest(request) {
  const cookieToken = readCookie(request, 'auth_token');
  if (cookieToken) return { token: cookieToken, source: 'cookie' };

  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && token !== 'cookie-active' && token !== 'null' && token !== 'undefined') {
      return { token, source: 'bearer' };
    }
  }
  return { token: null, source: null };
}

export function newCsrfToken() {
  return base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32)));
}

// Double-submit cookie check. Only required when authenticated via cookie. (M10)
export async function csrfOk(request, source) {
  if (source !== 'cookie') return true;
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const cookieValue = readCookie(request, 'csrf_token');
  const headerValue = request.headers.get('X-CSRF-Token');
  if (!cookieValue || !headerValue) return false;
  return constantTimeStringEqual(cookieValue, headerValue);
}

// Both cookies SameSite=Strict uniformly. (M10)
// Cookie Path is scoped to /finance and /api to prevent transmission to unrelated app paths (e.g. /outpost, /auction).
// Note: True isolation requires moving unrelated apps (outpost/auction) to a separate subdomain rather than
// relying on cookie path scoping; filed as a longer-term architectural follow-up.
export function sessionCookies(token, csrfToken, maxAge) {
  const financeBase = `Path=/finance; Secure; SameSite=Strict`;
  const apiBase = `Path=/api; Secure; SameSite=Strict`;
  return [
    `auth_token=${token}; HttpOnly; ${financeBase}; Max-Age=${maxAge}`,
    `csrf_token=${csrfToken}; ${financeBase}; Max-Age=${maxAge}`,
    `auth_token=${token}; HttpOnly; ${apiBase}; Max-Age=${maxAge}`,
    `csrf_token=${csrfToken}; ${apiBase}; Max-Age=${maxAge}`
  ];
}

export function clearedCookies() {
  const financeBase = `Path=/finance; Secure; SameSite=Strict; Max-Age=0`;
  const apiBase = `Path=/api; Secure; SameSite=Strict; Max-Age=0`;
  const legacyBase = `Path=/; Secure; SameSite=Strict; Max-Age=0`;
  return [
    `auth_token=; HttpOnly; ${financeBase}`,
    `csrf_token=; ${financeBase}`,
    `auth_token=; HttpOnly; ${apiBase}`,
    `csrf_token=; ${apiBase}`,
    `auth_token=; HttpOnly; ${legacyBase}`,
    `csrf_token=; ${legacyBase}`
  ];
}

export function withCookies(response, cookies) {
  const headers = new Headers(response.headers);
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(response.body, { status: response.status, headers });
}

/* ------------------------------------------------------------------ */
/* Full authentication helper (fix H6)                                */
/* ------------------------------------------------------------------ */
/* Authenticated User Session Cache (REM-17)                         */
/* ------------------------------------------------------------------ */

export const USER_CACHE_TTL_SEC = 60;
const memoryUserCache = new Map();

export function toCachedUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    status: user.status || 'Active',
    token_version: Number(user.token_version || 0),
    email_verified: user.email_verified != null ? Number(user.email_verified) : (user.emailVerified ? 1 : 0),
    pending_email: user.pending_email || user.pendingEmail || null,
    security_question: user.security_question || user.securityQuestion || null,
    hasSecurityQuestion: user.hasSecurityQuestion !== undefined
      ? Boolean(user.hasSecurityQuestion)
      : Boolean(user.security_answer_hash || user.hasSecurityAnswer)
  };
}

export async function getCachedUser(userId, env) {
  if (!userId) return null;
  const key = `user-session:${userId}`;

  // 1. Try KV binding if present
  const kv = env?.USER_CACHE || env?.RATE_LIMIT_KV;
  if (kv && typeof kv.get === 'function') {
    try {
      const val = await kv.get(key, 'json');
      if (val) return val;
    } catch {}
  }

  // 2. Try Cloudflare Cache API (caches.default)
  if (typeof caches !== 'undefined' && caches?.default) {
    try {
      const req = new Request(`https://cache.techtrekgt.internal/users/${encodeURIComponent(userId)}`, { method: 'GET' });
      const res = await caches.default.match(req);
      if (res) {
        return await res.json();
      }
    } catch {}
  }

  // 3. Fallback: in-memory cache for local development/testing
  const mem = memoryUserCache.get(key);
  if (mem) {
    if (Date.now() < mem.expiresAt) {
      return mem.data;
    }
    memoryUserCache.delete(key);
  }

  return null;
}

export async function setCachedUser(userId, userData, env, ttlSeconds = USER_CACHE_TTL_SEC) {
  if (!userId || !userData) return;
  const key = `user-session:${userId}`;
  const safeData = toCachedUser(userData);

  // 1. KV if bound
  const kv = env?.USER_CACHE || env?.RATE_LIMIT_KV;
  if (kv && typeof kv.put === 'function') {
    try {
      await kv.put(key, JSON.stringify(safeData), { expirationTtl: Math.max(ttlSeconds, 60) });
    } catch {}
  }

  // 2. Cloudflare Cache API
  if (typeof caches !== 'undefined' && caches?.default) {
    try {
      const req = new Request(`https://cache.techtrekgt.internal/users/${encodeURIComponent(userId)}`, { method: 'GET' });
      const res = new Response(JSON.stringify(safeData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`
        }
      });
      await caches.default.put(req, res);
    } catch {}
  }

  // 3. In-memory cache
  memoryUserCache.set(key, {
    data: safeData,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
}

export async function invalidateCachedUser(userId, env) {
  if (!userId) return;
  const key = `user-session:${userId}`;

  const kv = env?.USER_CACHE || env?.RATE_LIMIT_KV;
  if (kv && typeof kv.delete === 'function') {
    try {
      await kv.delete(key);
    } catch {}
  }

  if (typeof caches !== 'undefined' && caches?.default) {
    try {
      const req = new Request(`https://cache.techtrekgt.internal/users/${encodeURIComponent(userId)}`, { method: 'GET' });
      await caches.default.delete(req);
    } catch {}
  }

  memoryUserCache.delete(key);
}

export function clearMemoryUserCache() {
  memoryUserCache.clear();
}

// Verifies the JWT, then confirms token_version against cache / D1.
// Checks short-TTL cache first to avoid repetitive D1 read round trips on frequent requests.
// Strictly excludes password_hash and security_answer_hash from the cache (REM-13/REM-17).
export async function authenticate(context, { requireCsrf = true, bypassCache = false } = {}) {
  const { request, env } = context;
  const { token, source } = getTokenFromRequest(request);
  if (!token) return { error: fail(ERROR_CODES.UNAUTHORIZED, 401, 'Unauthorized') };

  const payload = await verifyToken(token, env?.JWT_SECRET);
  if (!payload) return { error: fail(ERROR_CODES.UNAUTHORIZED, 401, 'Unauthorized') };

  if (requireCsrf && !(await csrfOk(request, source))) {
    return { error: fail(ERROR_CODES.CSRF_INVALID, 403, 'Invalid or missing CSRF token') };
  }

  let user = bypassCache ? null : await getCachedUser(payload.userId, env);

  if (!user) {
    if (!env?.DB) return { error: fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable') };

    const dbUser = await env.DB.prepare(
      'SELECT id, email, name, role, token_version, status, email_verified, pending_email, security_question, (security_answer_hash IS NOT NULL) AS hasSecurityQuestion FROM users WHERE id = ?'
    ).bind(payload.userId).first();

    if (!dbUser) return { error: fail(ERROR_CODES.UNAUTHORIZED, 401, 'Unauthorized') };

    user = toCachedUser(dbUser);
    await setCachedUser(payload.userId, user, env, USER_CACHE_TTL_SEC);
  }

  if (user.status === 'Suspended') {
    // REM-21: Distinct code so frontend does not treat suspension as simple login expiration
    return { error: fail(ERROR_CODES.ACCOUNT_SUSPENDED, 403, 'Account suspended. Please contact support.') };
  }

  const currentVersion = Number(user.token_version || 0);
  const tokenVersion = Number(payload.tv || 0);
  if (currentVersion !== tokenVersion) {
    return { error: fail(ERROR_CODES.SESSION_EXPIRED, 401, 'Session expired. Please sign in again.') };
  }

  return { payload, user, source };
}

/* ------------------------------------------------------------------ */
/* Session issuance (fix H6)                                          */
/* ------------------------------------------------------------------ */

export async function issueSession(env, user, options = {}) {
  const rememberMe = Boolean(options && options.rememberMe);
  const now = Math.floor(Date.now() / 1000);
  const sessionTtl = rememberMe ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
  const sessionExp = now + sessionTtl;
  const { token } = await createToken(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      tv: Number(user.token_version || 0),
      sid: crypto.randomUUID()
    },
    env.JWT_SECRET,
    ACCESS_TOKEN_TTL,
    sessionExp
  );
  return { token, csrf: newCsrfToken(), maxAge: sessionTtl };
}

/* ------------------------------------------------------------------ */
/* Out-of-band email delivery (fix C1)                                */
/* ------------------------------------------------------------------ */

/**
 * Shared transactional email delivery helper via Resend.
 * Handles configuration checks, request formatting, and structured logging.
 *
 * @param {Record<string, any>} env Worker environment bindings
 * @param {{
 *   to: string | string[],
 *   subject: string,
 *   bodyLines: string[],
 *   logPrefix?: string,
 *   devFallbackMessage?: string
 * }} options
 * @returns {Promise<boolean>}
 */
export async function sendTransactionalEmail(env, {
  to,
  subject,
  bodyLines = [],
  logPrefix = '[email]',
  devFallbackMessage = ''
}) {
  if (!env?.RESEND_API_KEY || !env?.MAIL_FROM) {
    if (devFallbackMessage) {
      console.error(`${logPrefix} ${devFallbackMessage}`);
    } else {
      console.error(`${logPrefix} mail delivery is not configured (RESEND_API_KEY / MAIL_FROM); dev notification for ${to}`);
    }
    return false;
  }

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: recipients,
        subject,
        text: bodyLines.join('\n')
      })
    });
    if (!res.ok) {
      console.error(`${logPrefix} mail provider returned`, res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${logPrefix} mail send failed:`, err && err.message);
    return false;
  }
}

// Reset codes MUST NOT be returned in an HTTP response under any condition. (C1)
// This function returns a boolean and never throws into the handler.
export async function sendResetEmail(env, toEmail, code, securityQuestion) {
  const lines = [
    'You asked to reset your TechTrek password.',
    '',
    `Your reset code is: ${code}`,
    '',
    'The code expires in 15 minutes and can be used once.'
  ];
  if (securityQuestion) {
    lines.push('', `You will also be asked your security question: ${securityQuestion}`);
  }
  lines.push('', 'If you did not request this, you can ignore this message. No changes have been made.');

  return sendTransactionalEmail(env, {
    to: toEmail,
    subject: 'Your TechTrek password reset code',
    bodyLines: lines,
    logPrefix: '[forgot-password]',
    // P14: never log the code or full email - redact in production
    devFallbackMessage: env?.ENVIRONMENT !== 'production'
      ? `mail delivery is not configured; dev reset code for ${toEmail}: ${code}`
      : `mail delivery is not configured; reset code issued (details redacted in production)`
  });
}

export async function sendVerificationEmail(env, toEmail, code, type = 'verify') {
  const subject = type === 'change'
    ? 'Verify your new TechTrek email address'
    : 'Verify your TechTrek account email';
  const lines = [
    type === 'change'
      ? 'You requested to change your TechTrek email address.'
      : 'Thank you for registering with TechTrek.',
    '',
    `Your verification code is: ${code}`,
    '',
    'The code expires in 24 hours and can be used once.',
    '',
    'If you did not request this, you can ignore this message. No changes have been made.'
  ];

  return sendTransactionalEmail(env, {
    to: toEmail,
    subject,
    bodyLines: lines,
    logPrefix: '[email-verify]',
    // P14: never log the code or full email in production
    devFallbackMessage: env?.ENVIRONMENT !== 'production'
      ? `mail delivery is not configured; dev code for ${toEmail}: ${code}`
      : `mail delivery is not configured; verification code issued (details redacted in production)`
  });
}

export async function sendEmailChangeNotification(env, oldEmail, newEmail) {
  const lines = [
    'A request was made to change the email address on your TechTrek account.',
    '',
    `New address requested: ${newEmail}`,
    '',
    'A verification code was sent to the new email address. If you did not request this change, please sign in to your TechTrek account and reset your password immediately.'
  ];

  return sendTransactionalEmail(env, {
    to: oldEmail,
    subject: 'Security Alert: Email change requested for your TechTrek account',
    bodyLines: lines,
    logPrefix: '[email-change-notice]',
    // P14: redact email addresses in production logs
    devFallbackMessage: env?.ENVIRONMENT !== 'production'
      ? `mail delivery is not configured; notice for ${oldEmail} -> ${newEmail}`
      : `mail delivery is not configured; email change notice issued (details redacted in production)`
  });
}

/* ------------------------------------------------------------------ */
/* One-time verification & password reset code issuance               */
/* ------------------------------------------------------------------ */

export async function issueOneTimeCode(env, {
  table,
  userId,
  email,
  purpose,
  ttlMs = ONE_TIME_CODE_TTL_MS
}) {
  if (table !== 'email_verifications' && table !== 'password_resets') {
    throw new Error(`Invalid table for one-time code: ${table}`);
  }
  if (!env?.CODE_HMAC_SECRET) {
    throw new Error('Missing CODE_HMAC_SECRET binding');
  }

  let code = '';
  for (let i = 0; i < 8; i++) code += String(randomInt(10));

  const codeHash = await hmacHex(env.CODE_HMAC_SECRET, `${purpose}:${email}:${code}`);
  const idPrefix = table === 'password_resets' ? 'rst-' : 'vfy-';
  const verificationId = `${idPrefix}${crypto.randomUUID()}`;
  const now = Date.now();

  const invalidateStmt = table === 'password_resets'
    ? env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(email)
    : env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND email = ? AND used = 0').bind(userId, email);

  const insertStmt = table === 'password_resets'
    ? env.DB.prepare('INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)')
    : env.DB.prepare('INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)');
  const boundInsertStmt = insertStmt.bind(verificationId, userId, email, codeHash, now + ttlMs, now);

  await env.DB.batch([invalidateStmt, boundInsertStmt]);

  return { code, verificationId, codeHash };
}

/* ------------------------------------------------------------------ */
/* Turnstile bot verification                                         */
/* ------------------------------------------------------------------ */

// Verifies a client-provided Turnstile token against Cloudflare's siteverify API.
// Cross-reference: CSP allowlists challenges.cloudflare.com in src/worker.js.
// Runs on /api/auth/login and /api/auth/register before DB calls or password hashing.
export async function verifyTurnstile(token, env, ip = null, requestId = null) {
  // If TURNSTILE_SECRET_KEY is not configured (e.g. in dev or testing without Turnstile),
  // skip verification gracefully so standard auth flows remain functional.
  if (!env?.TURNSTILE_SECRET_KEY) {
    return { success: true, skipped: true };
  }

  if (!token || typeof token !== 'string') {
    return { success: false, error: 'MISSING_TOKEN' };
  }

  try {
    const formData = new FormData();
    formData.append('secret', env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      console.error('[turnstile] siteverify returned HTTP', res.status, requestId ? { requestId } : '');
      return { success: false, error: 'HTTP_ERROR' };
    }

    const data = await res.json();
    return { success: Boolean(data?.success), data };
  } catch (err) {
    console.error('[turnstile] verification request failed:', requestId ? { requestId } : '', err && err.message);
    return { success: false, error: 'FETCH_ERROR' };
  }
}

