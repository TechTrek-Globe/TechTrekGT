// WebCrypto Authentication & JWT helper utilities for Cloudflare Workers / D1
// Verbatim port from TechTrek Finance - no changes required.

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
      iterations: 310000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  return `${saltHex}:310000:${hashHex}`;
}

// Check if a stored password hash strictly complies with 3-part format (salt:iterations:hash)
export function isThreePartHash(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [saltHex, iterationsStr, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  return Boolean(
    saltHex &&
    saltHex.length === 32 &&
    hashHex &&
    hashHex.length === 64 &&
    Number.isInteger(iterations) &&
    iterations >= 1000
  );
}

// ============================================================================
// PBKDF2 Password Verification & Iteration Consistency (HIGH-6 / MED-16)
//
// Historical Context:
// Early iterations of the platform created 2-part password hashes ("salt:hash")
// that relied on an implicit, hardcoded iteration count (100,000 iterations in
// early client/gateway services, vs. 600,000 iterations in finance). Modern
// platform accounts use the explicit 3-part format ("salt:iterations:hash",
// standardized at 310,000 iterations per OWASP/WebCrypto guidelines).
//
// Audit & Migration Plan (HIGH-6 / MED-16):
// 1. Data Audit: An audit script (`scripts/check-legacy-hashes.js`) scans user
//    accounts in Cloudflare D1 for non-compliant hashes.
// 2. Fallback Elimination: Rather than guessing iterations or silently falling back
//    to 100k (which creates security ambiguities and hides legacy debt), Outpost
//    strictly requires the 3-part format.
// 3. User Migration: Any account with a legacy 2-part hash or flagged with
//    `force_password_reset = 1` is intercepted at `/api/auth/login` (HTTP 403)
//    and guided to `/reset-password` to upgrade to the modern 310k 3-part format.
// 4. Removal Timeline: Legacy fallback logic is completely deprecated. The strict
//    3-part check (`parts.length === 3`) is the permanent security standard and
//    must NOT be reverted to allow unversioned 2-part hashes.
// ============================================================================
export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') return false;

  const parts = storedHash.split(':');
  if (parts.length !== 3) {
    // Non-3-part format is rejected: never silently guess iterations (HIGH-6 / MED-16)
    return false;
  }

  const [saltHex, iterationsStr, originalHashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!saltHex || !originalHashHex || !Number.isInteger(iterations) || iterations < 1) {
    return false;
  }

  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const enc = new TextEncoder();

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
      iterations: iterations,
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
}

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

// Truncated SHA-256 of credential to support correlation in logs without disclosure (PRIV-001)
export async function hashTokenForLog(token) {
  if (!token || typeof token !== 'string') return 'none';
  try {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(token.trim()));
    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 12);
  } catch (_) {
    return 'unknown';
  }
}

// Create Signed JWT Token (HIGH-5, PRIV-003: minimal claims { userId, exp, tv }, no PII)
export async function createToken(payload, secret, expiresInSeconds = 7200) {
  if (!secret) throw new Error('JWT_SECRET is not defined in environment variables');
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const tokenPayload = {
    userId: payload.userId || payload.id,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    tv: payload.tv !== undefined ? payload.tv : 1
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));

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
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Builds a canonical Set-Cookie header string for the auth_token.
 * All handlers MUST use this helper to ensure consistent cookie attributes.
 * @param {string} token - The signed JWT.
 * @param {number} maxAge - Max-Age in seconds (e.g. 7200 for 2 hours, 2592000 for 30 days).
 * @returns {string}
 */
export function buildAuthCookie(token, maxAge) {
  return [
    `auth_token=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`
  ].join('; ');
}

/**
 * Extracts the JWT session token from an incoming HTTP request.
 *
 * Dual Authentication Acceptance Path (LOW-1):
 * 1. Primary (Browser Web SPA):
 *    Extracts the token from the HttpOnly `auth_token` cookie. The React SPA
 *    relies exclusively on HttpOnly session cookies (`credentials: 'include'`).
 *    Browser JavaScript never reads the JWT into client storage (no localStorage/
 *    sessionStorage usage), preventing token exfiltration via XSS.
 *
 * 2. Secondary (Non-Browser & API Clients):
 *    Accepts an `Authorization: Bearer <token>` header solely to support
 *    non-browser clients (desktop companion applications, automated CI/CD test
 *    suites, CLI automation scripts, and server-to-server API integrations).
 *    Browser web traffic will always match the HttpOnly cookie above first.
 *
 * @param {Request} request - Incoming HTTP Request
 * @returns {string|null} - Extracted JWT token string or null
 */
export function getAllTokensFromRequest(request) {
  const tokens = [];
  const cookieHeader = request.headers.get('Cookie') || '';
  const regex = /(?:^|;\s*)auth_token=([^;]+)/g;
  let match;
  while ((match = regex.exec(cookieHeader)) !== null) {
    if (match[1]) tokens.push(match[1]);
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && token !== 'cookie-active' && token !== 'null' && token !== 'undefined') {
      tokens.push(token);
    }
  }
  return tokens;
}

export function getTokenFromRequest(request) {
  const tokens = getAllTokensFromRequest(request);
  return tokens.length > 0 ? tokens[0] : null;
}

/**
 * Sends a transactional email using Cloudflare Email Workers, Resend API, or falls back to dev logging.
 */
export async function sendTransactionalEmail(env, {
  to,
  subject,
  bodyLines = [],
  logPrefix = '[email]',
  devFallbackMessage = ''
}) {
  const text = bodyLines.join('\n');
  const recipients = Array.isArray(to) ? to : [to];

  if (env?.SEND_EMAIL && typeof env.SEND_EMAIL.send === 'function') {
    try {
      await env.SEND_EMAIL.send({
        to: recipients[0],
        from: env.MAIL_FROM || 'no-reply@techtrekgt.com',
        subject,
        text
      });
      return true;
    } catch (e) {
      console.error(`${logPrefix} Cloudflare send_email failed:`, e && e.message);
    }
  }

  if (env?.RESEND_API_KEY && env?.MAIL_FROM) {
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
          text
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

  if (devFallbackMessage) {
    console.error(`${logPrefix} ${devFallbackMessage}`);
  } else {
    console.error(`${logPrefix} mail delivery is not configured; dev notification for ${recipients.join(', ')}`);
  }
  return false;
}

/**
 * Sends a password reset email containing the single-use reset token.
 */
export async function sendResetEmail(env, toEmail, token, securityQuestion) {
  const lines = [
    'You asked to reset your TechTrek Outpost password.',
    '',
    `Your password reset token is: ${token}`,
    '',
    'This token expires in 15 minutes and can only be used once.'
  ];
  if (securityQuestion) {
    lines.push('', `Security question: ${securityQuestion}`);
  }
  lines.push('', 'If you did not request this, you can safely ignore this email.');

  return sendTransactionalEmail(env, {
    to: toEmail,
    subject: 'TechTrek Outpost - Password Reset Token',
    bodyLines: lines,
    logPrefix: '[forgot-password]',
    devFallbackMessage: `mail delivery is not configured; dev reset token for ${toEmail}: ${token}`
  });
}

/**
 * Sends an email verification email containing the verification link and single-use token.
 */
export async function sendVerificationEmail(env, toEmail, token) {
  const verifyUrl = `https://techtrekgt.com/outpost/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const lines = [
    'Thank you for registering for TechTrek Outpost.',
    '',
    'Please verify your email address to complete your registration and activate your account:',
    verifyUrl,
    '',
    `Your single-use verification token is: ${token}`,
    '',
    'This verification token expires in 24 hours and can only be used once.',
    '',
    'If you did not create this account, you can safely ignore this email.'
  ];

  return sendTransactionalEmail(env, {
    to: toEmail,
    subject: 'TechTrek Outpost - Verify Your Email Address',
    bodyLines: lines,
    logPrefix: '[verify-email]',
    devFallbackMessage: `mail delivery is not configured; dev verification link for ${toEmail}: ${verifyUrl}`
  });
}

