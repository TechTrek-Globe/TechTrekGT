// WebCrypto Authentication & JWT helpers for Cloudflare Workers / D1
// All fixes from SECURITY-FIXES.md are implemented here.
// Do not simplify constant-time comparisons, fail-closed branches, or
// the PBKDF2 iteration cap - each maps to a specific security finding.

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

// Workers hard-caps PBKDF2 at 100,000 and throws NotSupportedError above it.
// Do not raise this value without verifying against the live runtime. (C2)
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_MAX_SUPPORTED = 100000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_BITS = 256;

export const ACCESS_TOKEN_TTL = 2 * 60 * 60;           // 2 hours
export const SESSION_TTL_DEFAULT = 2 * 60 * 60;         // no rememberMe
export const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60; // rememberMe

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

// Generic error body. Never echo internal exception text to clients. (M10)
export function fail(status, message) {
  return json({ error: message }, status);
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

async function deriveBits(password, salt, iterations) {
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

function parseStoredHash(storedHash) {
  if (typeof storedHash !== 'string') return null;
  const parts = storedHash.split(':');
  if (parts.length === 3) {
    const salt = fromHex(parts[0]);
    const iterations = parseInt(parts[1], 10);
    const hash = fromHex(parts[2]);
    if (!salt || !hash || !Number.isInteger(iterations) || iterations < 1) return null;
    return { salt, iterations, hash };
  }
  if (parts.length === 2) {
    // Legacy two-part records predate the stored cost field.
    const salt = fromHex(parts[0]);
    const hash = fromHex(parts[1]);
    if (!salt || !hash) return null;
    return { salt, iterations: 1e5, hash, legacy: true };
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
  if (!parsed) return true;
  return parsed.legacy || parsed.iterations !== PBKDF2_ITERATIONS;
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

function readCookie(request, name) {
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
export function sessionCookies(token, csrfToken, maxAge) {
  const base = `Path=/; Secure; SameSite=Strict`;
  return [
    `auth_token=${token}; HttpOnly; ${base}; Max-Age=${maxAge}`,
    `csrf_token=${csrfToken}; ${base}; Max-Age=${maxAge}`
  ];
}

export function clearedCookies() {
  const base = `Path=/; Secure; SameSite=Strict; Max-Age=0`;
  return [`auth_token=; HttpOnly; ${base}`, `csrf_token=; ${base}`];
}

export function withCookies(response, cookies) {
  const headers = new Headers(response.headers);
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(response.body, { status: response.status, headers });
}

/* ------------------------------------------------------------------ */
/* Full authentication helper (fix H6)                                */
/* ------------------------------------------------------------------ */

// Verifies the JWT, then confirms token_version against the DB.
// This is what makes password resets and logouts actually revoke sessions. (H6)
export async function authenticate(context, { requireCsrf = true } = {}) {
  const { request, env } = context;
  const { token, source } = getTokenFromRequest(request);
  if (!token) return { error: fail(401, 'Unauthorized') };

  const payload = await verifyToken(token, env?.JWT_SECRET);
  if (!payload) return { error: fail(401, 'Unauthorized') };

  if (requireCsrf && !(await csrfOk(request, source))) {
    return { error: fail(403, 'Invalid or missing CSRF token') };
  }

  if (!env?.DB) return { error: fail(503, 'Service unavailable') };

  const user = await env.DB.prepare(
    'SELECT id, email, name, role, token_version, security_question, security_answer_hash, password_hash FROM users WHERE id = ?'
  ).bind(payload.userId).first();

  if (!user) return { error: fail(401, 'Unauthorized') };

  const currentVersion = Number(user.token_version || 0);
  const tokenVersion = Number(payload.tv || 0);
  if (currentVersion !== tokenVersion) {
    return { error: fail(401, 'Session expired. Please sign in again.') };
  }

  return { payload, user, source };
}

/* ------------------------------------------------------------------ */
/* Session issuance (fix H6)                                          */
/* ------------------------------------------------------------------ */

export async function issueSession(env, user, householdId, rememberMe) {
  const now = Math.floor(Date.now() / 1000);
  const sessionTtl = rememberMe ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
  const sessionExp = now + sessionTtl;
  const { token } = await createToken(
    {
      userId: user.id,
      email: user.email,
      householdId,
      name: user.name,
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

// Reset codes MUST NOT be returned in an HTTP response under any condition. (C1)
// This function returns a boolean and never throws into the handler.
export async function sendResetEmail(env, toEmail, code, securityQuestion) {
  if (!env?.RESEND_API_KEY || !env?.MAIL_FROM) {
    console.error(
      '[forgot-password] mail delivery is not configured (RESEND_API_KEY / MAIL_FROM); reset code was generated but not sent'
    );
    return false;
  }
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

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [toEmail],
        subject: 'Your TechTrek password reset code',
        text: lines.join('\n')
      })
    });
    if (!res.ok) {
      console.error('[forgot-password] mail provider returned', res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[forgot-password] mail send failed:', err && err.message);
    return false;
  }
}
