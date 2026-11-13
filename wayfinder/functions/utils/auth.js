// WebCrypto Authentication & JWT helper utilities for Cloudflare Workers / D1

// Cloudflare Workers WebCrypto rejects PBKDF2 iteration counts above 100000.
const PBKDF2_ITERATIONS = 100000;

// Generate PBKDF2 Password Hash
export async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${saltHex}:${PBKDF2_ITERATIONS}:${hashHex}`;
}

// Verify PBKDF2 Password Hash (HIGH-6 / MED-16)
//
// Historical Context:
// Early accounts used a legacy 2-part format ("salt:hash") with an implicit 100k iteration count.
// Modern platform accounts use the 3-part format ("salt:iterations:hash", standardized at 310k).
//
// Migration Plan & Fallback Removal:
// The legacy 100k fallback exists temporarily to support legacy sessions during rollout.
// Once all legacy accounts have reset passwords via /reset-password (audited via
// check-legacy-hashes.js), this fallback can be removed in favor of strict 3-part verification.
export async function verifyPassword(password, storedHash) {
  const parts = storedHash.split(':');
  // Fallback to 100k iterations for legacy 2-part hashes (deprecated: see MED-16)
  const [saltHex, iterationsOrHash, maybeHash] = parts;
  const iterations = parts.length === 3 ? parseInt(iterationsOrHash, 10) : 100000;
  const originalHashHex = parts.length === 3 ? maybeHash : iterationsOrHash;

  if (!saltHex || !originalHashHex) return false;
  
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const enc = new TextEncoder();
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  try {
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: Math.min(iterations, 100000),
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (hashHex.length !== originalHashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < hashHex.length; i++) {
      diff |= hashHex.charCodeAt(i) ^ originalHashHex.charCodeAt(i);
    }
    return diff === 0;
  } catch (err) {
    console.warn('[auth] PBKDF2 verify failed:', err?.message);
    return false;
  }
}

// Helper: Base64URL encoding/decoding
function base64UrlEncode(str) {
  return btoa(str)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

// Create Signed JWT Token
export async function createToken(payload, secret, expiresInSeconds = 2 * 60 * 60) {
  if (!secret) throw new Error("JWT_SECRET is not defined in environment variables");
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  }));

  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(dataToSign));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${encodedSignature}`;
}

// Verify JWT Token
export async function verifyToken(token, secret) {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = new Uint8Array(
      atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'))
        .split('').map(c => c.charCodeAt(0))
    );
    const isValid = await crypto.subtle.verify('HMAC', cryptoKey, signatureBytes, enc.encode(dataToSign));

    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired token
    }

    return payload;
  } catch (err) {
    return null;
  }
}

const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Build a hardened HttpOnly Strict SSO cookie header value.
 */
export function buildAuthCookieHeader(token, maxAge) {
  return [
    `${AUTH_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`
  ].join('; ');
}

/**
 * Build a cookie-clearing header aligned with SameSite=Strict and Path=/.
 */
export function buildClearCookieHeader() {
  return `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/**
 * Extract all candidate auth tokens from Cookie and Authorization headers.
 * Enforces single-credential transport: simultaneous Cookie + Bearer returns conflict: true.
 */
export function getAllTokensFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieTokens = [];
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const name = trimmed.slice(0, eqIdx).trim();
      if (name !== AUTH_COOKIE_NAME) continue;
      const value = trimmed.slice(eqIdx + 1).trim();
      if (value && value !== 'null' && value !== 'undefined') {
        cookieTokens.push(value);
      }
    }
  }

  let bearerToken = null;
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const candidate = authHeader.slice(7).trim();
    if (candidate && candidate !== 'cookie-active' && candidate !== 'null' && candidate !== 'undefined') {
      bearerToken = candidate;
    }
  }

  if (cookieTokens.length > 0 && bearerToken) {
    return {
      tokens: [],
      cookieTokens,
      bearerToken,
      conflict: true,
      source: 'conflict'
    };
  }

  const seen = new Set();
  const tokens = [];
  for (const tok of cookieTokens) {
    if (!seen.has(tok)) {
      seen.add(tok);
      tokens.push(tok);
    }
  }
  if (bearerToken && !seen.has(bearerToken)) {
    tokens.push(bearerToken);
  }

  return {
    tokens,
    cookieTokens,
    bearerToken,
    conflict: false,
    source: cookieTokens.length > 0 ? 'cookie' : (bearerToken ? 'bearer' : null)
  };
}

export function getTokenFromRequest(request) {
  const { tokens, conflict } = getAllTokensFromRequest(request);
  if (conflict) return null;
  return tokens[0] || null;
}

/**
 * Authenticate a request using multi-cookie / Bearer extraction plus live D1 verification
 * of `users.status` and `users.token_version` (`tv` claim).
 */
export async function authenticateRequest(request, env, options = {}) {
  const { tokens, conflict, source } = getAllTokensFromRequest(request);
  if (conflict) {
    return {
      ok: false,
      status: 400,
      error: 'Conflicting authentication credentials provided. Use either Cookie or Bearer token, not both.',
      clearCookie: false,
      payload: null,
      dbUser: null
    };
  }

  if (tokens.length === 0) {
    return {
      ok: false,
      status: 401,
      error: 'Unauthorized',
      clearCookie: false,
      payload: null,
      dbUser: null
    };
  }

  if (!env?.DB && !options.allowWithoutDb) {
    return {
      ok: false,
      status: 503,
      error: 'Database binding DB not available.',
      clearCookie: false,
      payload: null,
      dbUser: null
    };
  }

  const userCache = new Map();
  let rejection = {
    status: 401,
    error: 'Unauthorized: Invalid, expired, or revoked session.'
  };

  for (const token of tokens) {
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload || !payload.userId) {
      continue;
    }

    if (!env?.DB) {
      return { ok: true, status: 200, payload, dbUser: null, token, source };
    }

    let dbUser = userCache.get(payload.userId);
    if (dbUser === undefined) {
      dbUser = await env.DB.prepare(
        `SELECT id, email, name, role, is_admin, api_key_enabled, status, token_version, security_question, security_answer_hash
         FROM users WHERE id = ?`
      ).bind(payload.userId).first();
      userCache.set(payload.userId, dbUser || null);
    }

    if (!dbUser) {
      continue;
    }

    const userStatus = dbUser.status || 'Active';
    if (userStatus === 'Suspended' || (userStatus !== 'Active' && userStatus !== 'active')) {
      rejection = { status: 403, error: 'Account is suspended.' };
      continue;
    }

    const expectedTv = Number(dbUser.token_version ?? 1);
    if (payload.tv === undefined || Number(payload.tv) !== expectedTv) {
      continue;
    }

    return { ok: true, status: 200, payload, dbUser, token, source };
  }

  return {
    ok: false,
    status: rejection.status,
    error: rejection.error,
    clearCookie: true,
    payload: null,
    dbUser: null
  };
}

export async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function constantTimeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateVerificationCode() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const n = (buf[0] % 90000000) + 10000000;
  return String(n);
}

