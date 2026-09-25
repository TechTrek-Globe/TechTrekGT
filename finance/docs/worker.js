/**
 * TechTrek Worker - hardened build.
 *
 * Fixes applied (see SECURITY-FIXES.md for the full list):
 *   C1  reset codes are never returned to the caller; delivered out of band only
 *   C2  PBKDF2 clamped to the Workers ceiling of 100,000 iterations
 *   C3  admin access driven by a DB role column, not a JWT email claim
 *   C4  no hardcoded sync passcode fallback; fails closed
 *   H5  UTF-8 safe base64url (btoa no longer throws on non-Latin1 names)
 *   H6  rememberMe honored via absolute session expiry + sliding token refresh
 *   H7  user enumeration removed from all unauthenticated endpoints
 *   H8  8-digit unbiased reset codes, stored hashed, per-account attempt cap
 *   H9  rate limiter fails closed on KV errors, uses atomic DO when bound
 *   M10 Vary: Origin, nonce-based CSP, no raw error leakage, CSRF, body caps
 */

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

// PBKDF2 configuration (benchmark validated 2026-09-25):
// Target is 600,000 iterations (OWASP recommendation), benchmarked at ~221ms in
// Cloudflare Workers runtime. PBKDF2_MAX_SUPPORTED is decoupled at 2,000,000
// as a fail-closed sanity ceiling against excessive CPU consumption.
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_MAX_SUPPORTED = 2000000;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_BITS = 256;

// NOTE: ACCESS_TOKEN_TTL is 2 hours regardless of the longer sexp granted for
// "remember me" (SESSION_TTL_REMEMBER = 30 days). The frontend MUST call
// /api/auth/refresh on an interval comfortably inside ACCESS_TOKEN_TTL
// (for example every 90 minutes) for "remember me" sessions to actually last
// SESSION_TTL_REMEMBER.
const ACCESS_TOKEN_TTL = 2 * 60 * 60;          // 2 hours
const SESSION_TTL_DEFAULT = 2 * 60 * 60;       // no rememberMe
const SESSION_TTL_REMEMBER = 30 * 24 * 60 * 60; // rememberMe

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const MAX_BODY_AUTH = 64 * 1024;        // 64 KB
const MAX_BODY_SYNC = 2 * 1024 * 1024;  // 2 MB

const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 254;
const MAX_PASS_LEN = 128;
const MAX_ANSWER_LEN = 200;
const MAX_QUESTION_LEN = 200;

const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

const ALLOWED_ORIGINS = [
  "https://techtrekgt.com",
  "https://techtrek-budget.pages.dev",
  "http://localhost:3000"
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}

/** Generic error body. Never echo internal exception text to clients. */
function fail(status, message) {
  return json({ error: message }, status);
}

function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Constant-time comparison of two byte arrays. Length is compared first
 *  because hash outputs here are fixed-width; no secret length leaks. */
function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time string compare that does not leak length via early exit. */
async function constantTimeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  return bytesEqual(new Uint8Array(ah), new Uint8Array(bh));
}

/* --- UTF-8 safe base64url (fix H5) --------------------------------- */

function bytesToBase64(bytes) {
  let bin = "";
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

function base64UrlEncodeBytes(bytes) {
  return bytesToBase64(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncode(str) {
  return base64UrlEncodeBytes(enc.encode(str)); // UTF-8 first: no InvalidCharacterError
}

function base64UrlDecodeBytes(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("bad base64url");
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return base64ToBytes(b64);
}

function base64UrlDecode(str) {
  return dec.decode(base64UrlDecodeBytes(str));
}

/** Unbiased random integer in [0, max) via rejection sampling. */
function randomInt(max) {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let v;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % max;
}

/** Read a JSON body with a hard size cap. Returns null on anything invalid. */
async function readJson(request, maxBytes) {
  const declared = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  if (buf.byteLength === 0) return null;
  try {
    const parsed = JSON.parse(dec.decode(buf));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function asTrimmedString(value, maxLen) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

/* ------------------------------------------------------------------ */
/* Password hashing (fix C2)                                           */
/* ------------------------------------------------------------------ */

async function deriveBits(password, salt, iterations) {
  if (iterations > PBKDF2_MAX_SUPPORTED) {
    // Legacy records written with an unsupported cost can never be verified
    // on this runtime. Signal rather than throw so callers fail closed.
    const err = new Error("UNSUPPORTED_ITERATIONS");
    err.code = "UNSUPPORTED_ITERATIONS";
    throw err;
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    PBKDF2_BITS
  );
  return new Uint8Array(bits);
}

/** Format: saltHex:iterations:hashHex */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${toHex(salt)}:${PBKDF2_ITERATIONS}:${toHex(hash)}`;
}

function parseStoredHash(storedHash) {
  if (typeof storedHash !== "string") return null;
  const parts = storedHash.split(":");
  if (parts.length === 3) {
    const salt = fromHex(parts[0]);
    const iterations = parseInt(parts[1], 10);
    const hash = fromHex(parts[2]);
    if (!salt || !hash || !Number.isInteger(iterations) || iterations < 1) return null;
    return { salt, iterations, hash };
  }
  if (parts.length === 2) {
    // Legacy two-part records predate the stored cost.
    const salt = fromHex(parts[0]);
    const hash = fromHex(parts[1]);
    if (!salt || !hash) return null;
    return { salt, iterations: 1e5, hash, legacy: true };
  }
  return null;
}

async function verifyPassword(password, storedHash) {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  try {
    const candidate = await deriveBits(password, parsed.salt, parsed.iterations);
    return bytesEqual(candidate, parsed.hash);
  } catch (err) {
    if (err && err.code === "UNSUPPORTED_ITERATIONS") {
      console.error("[auth] stored hash uses an unsupported iteration count; account needs a reset");
    } else {
      console.error("[auth] verifyPassword failed:", err && err.message);
    }
    return false;
  }
}

/** True when a stored hash should be transparently upgraded after a good login. */
function needsRehash(storedHash) {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return true;
  return parsed.legacy || parsed.iterations !== PBKDF2_ITERATIONS;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

/* ------------------------------------------------------------------ */
/* JWT                                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param claims  userId, email, householdId, name, tv (token version), sid
 * @param ttl     access token lifetime in seconds
 * @param sessionExp  absolute session expiry (unix seconds); token never outlives it
 */
async function createToken(claims, secret, ttl = ACCESS_TOKEN_TTL, sessionExp = null) {
  if (!secret) throw new Error("JWT_SECRET is not configured");
  const now = Math.floor(Date.now() / 1000);
  const sexp = sessionExp || now + ttl;
  const exp = Math.min(now + ttl, sexp);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { ...claims, iat: now, exp, sexp };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataToSign));
  return { token: `${dataToSign}.${base64UrlEncodeBytes(new Uint8Array(sig))}`, payload };
}

async function verifyToken(token, secret) {
  if (!secret || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    // Reject alg confusion / "none" outright.
    if (!header || header.alg !== "HS256" || header.typ !== "JWT") return null;

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = base64UrlDecodeBytes(encodedSignature);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(`${encodedHeader}.${encodedPayload}`)
    );
    if (!ok) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.sexp === "number" && payload.sexp < now) return null;
    if (!payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Request auth, cookies, CSRF                                         */
/* ------------------------------------------------------------------ */

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match && match[1] ? match[1] : null;
}

/** Returns { token, source } so CSRF can be enforced only for cookie auth. */
function getTokenFromRequest(request) {
  const cookieToken = readCookie(request, "auth_token");
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && token !== "cookie-active" && token !== "null" && token !== "undefined") {
      return { token, source: "bearer" };
    }
  }
  return { token: null, source: null };
}

function newCsrfToken() {
  return base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(32)));
}

/** Double-submit cookie check. Only required when the caller authenticated
 *  with the cookie; Bearer callers are not subject to CSRF. */
async function csrfOk(request, source) {
  if (source !== "cookie") return true;
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const cookieValue = readCookie(request, "csrf_token");
  const headerValue = request.headers.get("X-CSRF-Token");
  if (!cookieValue || !headerValue) return false;
  return constantTimeStringEqual(cookieValue, headerValue);
}

// Both cookies SameSite=Strict uniformly. (M10)
// Cookie Path is scoped to /finance and /api to prevent transmission to unrelated app paths (e.g. /outpost, /auction).
// Note: True isolation requires moving unrelated apps (outpost/auction) to a separate subdomain rather than
// relying on cookie path scoping; filed as a longer-term architectural follow-up.
function sessionCookies(token, csrfToken, maxAge) {
  const financeBase = `Path=/finance; Secure; SameSite=Strict`;
  const apiBase = `Path=/api; Secure; SameSite=Strict`;
  return [
    `auth_token=${token}; HttpOnly; ${financeBase}; Max-Age=${maxAge}`,
    `csrf_token=${csrfToken}; ${financeBase}; Max-Age=${maxAge}`,
    `auth_token=${token}; HttpOnly; ${apiBase}; Max-Age=${maxAge}`,
    `csrf_token=${csrfToken}; ${apiBase}; Max-Age=${maxAge}`
  ];
}

function clearedCookies() {
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

function withCookies(response, cookies) {
  const headers = new Headers(response.headers);
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Full authentication: verify the JWT, then confirm the session is still
 * valid against the database (token_version). This is what invalidates
 * outstanding tokens after a password change or reset (fix H6).
 */
async function authenticate(context, { requireCsrf = true } = {}) {
  const { request, env } = context;
  const { token, source } = getTokenFromRequest(request);
  if (!token) return { error: fail(401, "Unauthorized") };

  const payload = await verifyToken(token, env?.JWT_SECRET);
  if (!payload) return { error: fail(401, "Unauthorized") };

  if (requireCsrf && !(await csrfOk(request, source))) {
    return { error: fail(403, "Invalid or missing CSRF token") };
  }

  if (!env?.DB) return { error: fail(503, "Service unavailable") };

  const user = await env.DB.prepare(
    "SELECT id, email, name, role, token_version, security_question, security_answer_hash, password_hash FROM users WHERE id = ?"
  ).bind(payload.userId).first();

  if (!user) return { error: fail(401, "Unauthorized") };

  const currentVersion = Number(user.token_version || 0);
  const tokenVersion = Number(payload.tv || 0);
  if (currentVersion !== tokenVersion) {
    return { error: fail(401, "Session expired. Please sign in again.") };
  }

  return { payload, user, source };
}

/* ------------------------------------------------------------------ */
/* Rate limiting (fix H9)                                              */
/* ------------------------------------------------------------------ */

/**
 * Atomic when env.RATE_LIMITER (Durable Object namespace) is bound.
 * Falls back to KV, which is eventually consistent and racy; in that mode
 * a KV *error* denies the request rather than failing open.
 */
async function checkRateLimit(env, key, maxRequests, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const retryAfter = windowSeconds - (now % windowSeconds);

  if (env?.RATE_LIMITER) {
    try {
      const id = env.RATE_LIMITER.idFromName(key);
      const stub = env.RATE_LIMITER.get(id);
      const res = await stub.fetch("https://rl/check", {
        method: "POST",
        body: JSON.stringify({ max: maxRequests, window: windowSeconds })
      });
      const data = await res.json();
      return data.allowed ? { allowed: true } : { allowed: false, retryAfter: data.retryAfter ?? retryAfter };
    } catch (err) {
      console.error("[rateLimit] durable object failed:", err && err.message);
      return { allowed: false, retryAfter };
    }
  }

  const kv = env?.RATE_LIMIT_KV;
  if (!kv) {
    console.error("[rateLimit] NO LIMITER BOUND - requests are not being rate limited");
    return { allowed: true };
  }

  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;
  try {
    const current = parseInt((await kv.get(windowKey)) || "0", 10);
    if (current >= maxRequests) return { allowed: false, retryAfter };
    await kv.put(windowKey, String(current + 1), { expirationTtl: Math.max(60, windowSeconds * 2) });
    return { allowed: true };
  } catch (err) {
    console.error("[rateLimit] KV error, failing closed:", err && err.message);
    return { allowed: false, retryAfter };
  }
}

async function enforceRateLimit(context, prefix, max, windowSeconds, customKey = null) {
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
  const effectiveKey = customKey || ip;
  const { allowed, retryAfter } = await checkRateLimit(context.env, `${prefix}:${effectiveKey}`, max, windowSeconds);
  if (allowed) return null;
  return json({ error: "Too many requests. Please wait and try again." }, 429, {
    "Retry-After": String(retryAfter)
  });
}

/* ------------------------------------------------------------------ */
/* Out-of-band delivery (fix C1)                                       */
/* ------------------------------------------------------------------ */

/**
 * Sends the reset code by email. Returns true on success.
 * Reset codes MUST NOT be returned in an HTTP response under any condition.
 */
async function sendResetEmail(env, toEmail, code, securityQuestion) {
  if (!env?.RESEND_API_KEY || !env?.MAIL_FROM) {
    console.error(
      "[forgot-password] mail delivery is not configured (RESEND_API_KEY / MAIL_FROM); reset code was generated but not sent"
    );
    return false;
  }
  const lines = [
    "You asked to reset your TechTrek password.",
    "",
    `Your reset code is: ${code}`,
    "",
    "The code expires in 15 minutes and can be used once."
  ];
  if (securityQuestion) {
    lines.push("", `You will also be asked your security question: ${securityQuestion}`);
  }
  lines.push("", "If you did not request this, you can ignore this message. No changes have been made.");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [toEmail],
        subject: "Your TechTrek password reset code",
        text: lines.join("\n")
      })
    });
    if (!res.ok) {
      console.error("[forgot-password] mail provider returned", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[forgot-password] mail send failed:", err && err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Handlers: register / login / me / logout                            */
/* ------------------------------------------------------------------ */

function validatePassword(password) {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters long.";
  if (password.length > MAX_PASS_LEN) return "Password exceeds maximum allowed length.";
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one uppercase letter and one number.";
  }
  return null;
}

async function issueSession(env, user, householdId, rememberMe) {
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

async function handleRegister(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, "register", 5, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, "Invalid request body.");

    const name = asTrimmedString(body.name, MAX_NAME_LEN);
    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const securityQuestion = asTrimmedString(body.securityQuestion, MAX_QUESTION_LEN);
    const securityAnswer = asTrimmedString(body.securityAnswer, MAX_ANSWER_LEN);
    const password = body.password;

    if (!name || !rawEmail || !password || !securityQuestion || !securityAnswer) {
      return fail(400, "Name, email, password, security question, and security answer are required.");
    }

    const cleanEmail = rawEmail.toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) return fail(400, "Invalid email address format.");
    const accountLimited = await enforceRateLimit(context, "register-account", 5, 300, cleanEmail);
    if (accountLimited) return accountLimited;

    const pwError = validatePassword(password);
    if (pwError) return fail(400, pwError);

    if (!env.DB || !env.JWT_SECRET) {
      console.error("[register] missing DB or JWT_SECRET binding");
      return fail(503, "Service unavailable. Please try again later.");
    }

    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
    if (existing) {
      // Registration necessarily reveals that an address is taken. Keep the
      // message neutral and rely on the rate limiter above.
      return fail(409, "That email address cannot be registered.");
    }

    const userId = `usr-${crypto.randomUUID()}`;
    const householdId = `hh-${crypto.randomUUID()}`;
    const memberId = `hm-${crypto.randomUUID()}`;
    const person1Id = `person-${crypto.randomUUID()}`;

    const passwordHash = await hashPassword(password);
    const securityAnswerHash = await hashPassword(securityAnswer.toLowerCase());

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, role, token_version) VALUES (?, ?, ?, ?, ?, ?, 'user', 0)"
      ).bind(userId, cleanEmail, passwordHash, name, securityQuestion, securityAnswerHash),
      env.DB.prepare("INSERT INTO households (id, name) VALUES (?, ?)").bind(householdId, `${name}'s Household`),
      env.DB.prepare(
        "INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)"
      ).bind(memberId, householdId, userId, "owner"),
      env.DB.prepare(
        "INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(person1Id, householdId, name, "Primary", "bi-weekly", "15", "last", 0, 0, "purple")
    ]);

    const user = { id: userId, email: cleanEmail, name, token_version: 0 };
    const { token, csrf, maxAge } = await issueSession(env, user, householdId, Boolean(body.rememberMe));

    return withCookies(
      json({ success: true, user: { id: userId, email: cleanEmail, name }, householdId, csrfToken: csrf }, 201),
      sessionCookies(token, csrf, maxAge)
    );
  } catch (err) {
    console.error("[register] handler error:", err && err.message);
    return fail(500, "An internal error occurred. Please try again.");
  }
}

async function handleLogin(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, "login", 10, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, "Invalid request body.");

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const password = body.password;
    if (!rawEmail || typeof password !== "string" || !password) {
      return fail(400, "Email and password are required.");
    }
    if (password.length > MAX_PASS_LEN) return fail(401, "Invalid email or password");

    if (!env.DB || !env.JWT_SECRET) {
      console.error("[login] missing DB or JWT_SECRET binding");
      return fail(503, "Service unavailable. Please try again later.");
    }

    const cleanEmail = rawEmail.toLowerCase();
    const accountLimited = await enforceRateLimit(context, "login-account", 10, 300, cleanEmail);
    if (accountLimited) return accountLimited;
    const user = await env.DB.prepare(
      "SELECT id, email, name, password_hash, token_version FROM users WHERE email = ?"
    ).bind(cleanEmail).first();

    // Burn comparable CPU on unknown accounts so response timing does not
    // distinguish "no such user" from "wrong password".
    if (!user) {
      await hashPassword(password).catch(() => {});
      return fail(401, "Invalid email or password");
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) return fail(401, "Invalid email or password");

    // Transparent cost upgrade for legacy or unsupported-cost records.
    if (needsRehash(user.password_hash)) {
      try {
        const upgraded = await hashPassword(password);
        await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(upgraded, user.id).run();
      } catch (err) {
        console.error("[login] rehash failed:", err && err.message);
      }
    }

    const member = await env.DB.prepare(
      "SELECT household_id FROM household_members WHERE user_id = ?"
    ).bind(user.id).first();
    const householdId = member ? member.household_id : null;

    const { token, csrf, maxAge } = await issueSession(env, user, householdId, Boolean(body.rememberMe));

    return withCookies(
      json({
        success: true,
        user: { id: user.id, email: user.email, name: user.name },
        householdId,
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, maxAge)
    );
  } catch (err) {
    console.error("[login] handler error:", err && err.message);
    return fail(500, "An internal error occurred. Please try again.");
  }
}

/** GET /api/auth/me - also slides the access token forward within the session window. */
async function handleMe(context) {
  const { env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    const userDetails = {
      id: user.id,
      email: user.email,
      name: user.name,
      securityQuestion: user.security_question || null,
      hasSecurityQuestion: Boolean(user.security_question && user.security_answer_hash),
      isAdmin: String(user.role || "user") === "admin"
    };

    const responseBody = {
      success: true,
      user: userDetails,
      householdId: payload.householdId
    };

    // Sliding refresh, bounded by the absolute session expiry.
    const now = Math.floor(Date.now() / 1000);
    const sexp = typeof payload.sexp === "number" ? payload.sexp : payload.exp;
    if (sexp > now + 60) {
      const { token } = await createToken(
        {
          userId: user.id,
          email: user.email,
          householdId: payload.householdId,
          name: user.name,
          tv: Number(user.token_version || 0),
          sid: payload.sid
        },
        env.JWT_SECRET,
        ACCESS_TOKEN_TTL,
        sexp
      );
      const csrf = readCookie(context.request, "csrf_token") || newCsrfToken();
      responseBody.csrfToken = csrf;
      return withCookies(json(responseBody), sessionCookies(token, csrf, sexp - now));
    }

    return json(responseBody);
  } catch (err) {
    console.error("[me] handler error:", err && err.message);
    return fail(500, "An internal error occurred.");
  }
}

async function handleLogout(context) {
  // Best effort: also bump token_version so the session dies server side.
  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (!auth.error && context.env?.DB) {
      await context.env.DB.prepare(
        "UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?"
      ).bind(auth.user.id).run();
    }
  } catch (err) {
    console.error("[logout] cleanup failed:", err && err.message);
  }
  return withCookies(json({ success: true }), clearedCookies());
}

/* ------------------------------------------------------------------ */
/* Password reset (fixes C1, H7, H8)                                   */
/* ------------------------------------------------------------------ */

const GENERIC_RESET_RESPONSE = {
  success: true,
  message: "If an account exists for that address, a reset code has been sent to it."
};

async function handleForgotPassword(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, "forgot", 5, 600);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, "Invalid request body.");

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    if (!rawEmail || !EMAIL_REGEX.test(rawEmail.toLowerCase())) {
      // Format errors are safe to report; they reveal nothing about accounts.
      return fail(400, "Invalid email address format.");
    }
    const cleanEmail = rawEmail.toLowerCase();
    const accountLimited = await enforceRateLimit(context, "forgot-account", 5, 600, cleanEmail);
    if (accountLimited) return accountLimited;

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error("[forgot-password] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding");
      return fail(503, "Service unavailable. Please try again later.");
    }

    const user = await env.DB.prepare(
      "SELECT id, email, security_question FROM users WHERE email = ?"
    ).bind(cleanEmail).first();

    // Identical response whether or not the account exists (fix H7).
    if (!user) return json(GENERIC_RESET_RESPONSE);

    // Per-account throttle on top of the per-IP limiter (fix H8).
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM password_resets WHERE email = ? AND created_at > ?"
    ).bind(cleanEmail, Date.now() - 60 * 60 * 1000).first();
    if (recent && Number(recent.n) >= 5) return json(GENERIC_RESET_RESPONSE);

    // 8 digits, unbiased, ~26.6 bits.
    let resetCode = "";
    for (let i = 0; i < 8; i++) resetCode += String(randomInt(10));

    // Store only an HMAC of the code so a database leak does not yield
    // usable reset tokens (fix H8).
    const codeHash = await hmacHex(env.CODE_HMAC_SECRET, `reset:${cleanEmail}:${resetCode}`);
    const resetId = `rst-${crypto.randomUUID()}`;
    const now = Date.now();

    await env.DB.batch([
      env.DB.prepare("UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0").bind(cleanEmail),
      env.DB.prepare(
        "INSERT INTO password_resets (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)"
      ).bind(resetId, user.id, cleanEmail, codeHash, now + RESET_CODE_TTL_MS, now)
    ]);

    await sendResetEmail(env, user.email, resetCode, user.security_question || null);

    // The code is NEVER included in the response body.
    return json(GENERIC_RESET_RESPONSE);
  } catch (err) {
    console.error("[forgot-password] error:", err && err.message);
    return fail(500, "An internal error occurred. Please try again.");
  }
}

async function handleResetPassword(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, "reset", 5, 600);
  if (limited) return limited;

  const GENERIC_BAD = "Invalid or expired reset code.";

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, "Invalid request body.");

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const code = asTrimmedString(body.token, 32);
    const newPassword = body.newPassword;
    const securityAnswer = typeof body.securityAnswer === "string" ? body.securityAnswer.trim() : "";

    if (!rawEmail || !code || typeof newPassword !== "string") {
      return fail(400, "Email, reset code, and new password are required.");
    }

    const pwError = validatePassword(newPassword);
    if (pwError) return fail(400, pwError);

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error("[reset-password] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding");
      return fail(503, "Service unavailable. Please try again later.");
    }

    const cleanEmail = rawEmail.toLowerCase();
    const codeHash = await hmacHex(env.CODE_HMAC_SECRET, `reset:${cleanEmail}:${code}`);

    const record = await env.DB.prepare(
      "SELECT id, user_id, expires_at, attempts FROM password_resets WHERE email = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
    ).bind(cleanEmail).first();

    if (!record) return fail(400, GENERIC_BAD);

    if (Number(record.expires_at) < Date.now()) {
      await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(record.id).run();
      return fail(400, GENERIC_BAD);
    }

    if (Number(record.attempts || 0) >= RESET_MAX_ATTEMPTS) {
      await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(record.id).run();
      return fail(400, GENERIC_BAD);
    }

    const stored = await env.DB.prepare(
      "SELECT token FROM password_resets WHERE id = ?"
    ).bind(record.id).first();

    const codeMatches = await constantTimeStringEqual(String(stored?.token || ""), codeHash);

    const user = await env.DB.prepare(
      "SELECT id, password_hash, security_answer_hash FROM users WHERE id = ?"
    ).bind(record.user_id).first();

    let answerMatches = true;
    if (user && user.security_answer_hash) {
      answerMatches = securityAnswer
        ? await verifyPassword(securityAnswer.toLowerCase(), user.security_answer_hash)
        : false;
    }

    if (!codeMatches || !answerMatches || !user) {
      // Single generic failure for a bad code, a bad answer, or a missing
      // user, with a per-account attempt counter (fix H8).
      await env.DB.prepare(
        "UPDATE password_resets SET attempts = COALESCE(attempts, 0) + 1 WHERE id = ?"
      ).bind(record.id).run();
      return fail(400, GENERIC_BAD);
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Bumping token_version kills every outstanding session for this account.
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?"
      ).bind(newPasswordHash, user.id),
      env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(record.id),
      env.DB.prepare("UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0").bind(cleanEmail)
    ]);

    return withCookies(
      json({ success: true, message: "Password reset successfully. Please sign in with your new password." }),
      clearedCookies()
    );
  } catch (err) {
    console.error("[reset-password] error:", err && err.message);
    return fail(500, "An internal error occurred. Please try again.");
  }
}

/**
 * GET /api/auth/security-question - now authenticated.
 *
 * The previous unauthenticated POST version handed any caller the security
 * question for any email address, which was both account enumeration and a
 * head start on the answer. The question is no longer exposed publicly; it
 * is delivered in the reset email instead (fix H7).
 */
async function handleSecurityQuestion(context) {
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { user } = auth;
    return json({
      success: true,
      email: user.email,
      securityQuestion: user.security_question || null,
      hasSecurityQuestion: Boolean(user.security_question && user.security_answer_hash)
    });
  } catch (err) {
    console.error("[security-question] error:", err && err.message);
    return fail(500, "An internal error occurred.");
  }
}

/* ------------------------------------------------------------------ */
/* Profile update                                                      */
/* ------------------------------------------------------------------ */

async function handleUpdateProfile(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, "profile", 20, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, "Invalid request body.");

    const { currentPassword, newPassword } = body;

    let updatedName = user.name;
    let updatedEmail = user.email;
    let updatedQuestion = user.security_question;
    let updatedAnswerHash = user.security_answer_hash;
    let updatedPasswordHash = user.password_hash;
    let bumpTokenVersion = false;

    const name = asTrimmedString(body.name, MAX_NAME_LEN);
    if (name) updatedName = name;

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    if (rawEmail) {
      const cleanEmail = rawEmail.toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) return fail(400, "Invalid email address format.");
      if (cleanEmail !== user.email) {
        // Changing the address that owns the account is a security-sensitive
        // action; require the current password.
        if (!currentPassword || !(await verifyPassword(String(currentPassword), user.password_hash))) {
          return fail(400, "Current password is required to change your email address.");
        }
        const existing = await env.DB.prepare(
          "SELECT id FROM users WHERE email = ? AND id != ?"
        ).bind(cleanEmail, user.id).first();
        if (existing) return fail(409, "That email address cannot be used.");
        updatedEmail = cleanEmail;
        bumpTokenVersion = true;
      }
    }

    const securityQuestion = asTrimmedString(body.securityQuestion, MAX_QUESTION_LEN);
    if (securityQuestion) {
      const securityAnswer = asTrimmedString(body.securityAnswer, MAX_ANSWER_LEN);
      if (!securityAnswer) {
        return fail(400, "A security answer is required when changing the security question.");
      }
      if (!currentPassword || !(await verifyPassword(String(currentPassword), user.password_hash))) {
        return fail(400, "Current password is required to change your security question.");
      }
      updatedQuestion = securityQuestion;
      updatedAnswerHash = await hashPassword(securityAnswer.toLowerCase());
    }

    if (typeof newPassword === "string" && newPassword.length > 0) {
      if (!currentPassword || typeof currentPassword !== "string") {
        return fail(400, "Current password is required to set a new password.");
      }
      if (!(await verifyPassword(currentPassword, user.password_hash))) {
        return fail(400, "Current password is incorrect.");
      }
      const pwError = validatePassword(newPassword);
      if (pwError) return fail(400, pwError);
      updatedPasswordHash = await hashPassword(newPassword);
      bumpTokenVersion = true;
    }

    const newTokenVersion = Number(user.token_version || 0) + (bumpTokenVersion ? 1 : 0);

    await env.DB.prepare(
      `UPDATE users
          SET name = ?, email = ?, security_question = ?, security_answer_hash = ?, password_hash = ?, token_version = ?
        WHERE id = ?`
    ).bind(
      updatedName,
      updatedEmail,
      updatedQuestion,
      updatedAnswerHash,
      updatedPasswordHash,
      newTokenVersion,
      user.id
    ).run();

    // Re-issue within the existing session window rather than silently
    // extending the session (fix H6).
    const now = Math.floor(Date.now() / 1000);
    const sexp = typeof payload.sexp === "number" && payload.sexp > now ? payload.sexp : now + SESSION_TTL_DEFAULT;
    const { token } = await createToken(
      {
        userId: user.id,
        email: updatedEmail,
        householdId: payload.householdId,
        name: updatedName,
        tv: newTokenVersion,
        sid: payload.sid || crypto.randomUUID()
      },
      env.JWT_SECRET,
      ACCESS_TOKEN_TTL,
      sexp
    );
    const csrf = newCsrfToken();

    return withCookies(
      json({
        success: true,
        message: "Profile updated successfully.",
        user: {
          id: user.id,
          email: updatedEmail,
          name: updatedName,
          securityQuestion: updatedQuestion,
          hasSecurityQuestion: Boolean(updatedQuestion && updatedAnswerHash)
        },
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, sexp - now)
    );
  } catch (err) {
    console.error("[update-profile] error:", err && err.message);
    return fail(500, "An internal error occurred.");
  }
}

/* ------------------------------------------------------------------ */
/* Admin (fix C3)                                                      */
/* ------------------------------------------------------------------ */

async function handleAdminStats(context) {
  const { env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { user } = auth;

    // Authorization comes from the database, not from a self-asserted email
    // claim in the JWT. Registering ADMIN_EMAIL no longer grants anything.
    if (String(user.role || "user") !== "admin") {
      return fail(403, "Forbidden");
    }

    const usersResult = await env.DB.prepare(
      "SELECT id, email, name, status, created_at FROM users ORDER BY created_at ASC LIMIT 1000"
    ).all();
    const backupsResult = await env.DB.prepare("SELECT id, updated_at FROM user_backups").all();

    const backupMap = {};
    for (const row of backupsResult.results || []) {
      backupMap[row.id] = { backupCount: 1, lastBackupAt: row.updated_at };
    }

    const users = (usersResult.results || []).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status || "Active",
      createdAt: u.created_at,
      backupCount: backupMap[u.id]?.backupCount ?? 0,
      lastBackupAt: backupMap[u.id]?.lastBackupAt ?? null
    }));

    return json({ totalUsers: users.length, users });
  } catch (err) {
    console.error("[admin/stats] query error:", err && err.message);
    return fail(500, "Failed to fetch admin stats");
  }
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

async function handleVerifySyncCode(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, "sync-code", 5, 300);
  if (limited) return limited;

  const auth = await authenticate(context, { requireCsrf: true });
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const userLimited = await enforceRateLimit(context, "sync-code-account", 5, 300, userId);
  if (userLimited) return userLimited;

  // Fails closed when unconfigured. No "123456" fallback (fix C4).
  const secretCode = env?.SYNC_UNLOCK_CODE;
  if (!secretCode) {
    console.error("[verify-sync-code] SYNC_UNLOCK_CODE is not configured");
    return fail(503, "Service unavailable.");
  }

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    const code = body && typeof body.code === "string" ? body.code.trim() : "";
    if (!code || !(await constantTimeStringEqual(code, String(secretCode).trim()))) {
      return fail(401, "Invalid access passcode");
    }
    return json({ success: true });
  } catch (err) {
    console.error("[verify-sync-code] error:", err && err.message);
    return fail(500, "Verification failed");
  }
}

async function handleSyncBackup(context) {
  const { request, env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await readJson(request, MAX_BODY_SYNC);
    if (!body) return fail(400, "Invalid or oversized request body.");

    const payload = body.budget !== undefined ? body.budget : body;
    const dataStr = JSON.stringify(payload);
    if (dataStr.length > MAX_BODY_SYNC) return fail(413, "Backup payload is too large.");

    await env.DB.prepare(
      `INSERT INTO user_backups (id, data, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`
    ).bind(userId, dataStr).run();

    return json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[sync/backup] error:", err && err.message);
    return fail(500, "Backup failed.");
  }
}

async function handleSyncRestore(context) {
  const { env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const row = await env.DB.prepare(
      "SELECT data, updated_at FROM user_backups WHERE id = ?"
    ).bind(userId).first();

    if (!row || !row.data) return fail(404, "No cloud backup found");

    let parsed;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      console.error("[sync/restore] stored backup is not valid JSON for user", userId);
      return fail(500, "Stored backup could not be read.");
    }

    return json({
      success: true,
      budget: parsed && parsed.budget !== undefined ? parsed.budget : parsed,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error("[sync/restore] error:", err && err.message);
    return fail(500, "Restore failed.");
  }
}

/* ------------------------------------------------------------------ */
/* Security headers (fix M10)                                          */
/* ------------------------------------------------------------------ */

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
  ].join("; ");
}

class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }
  element(element) {
    element.setAttribute("nonce", this.nonce);
  }
}

function addSecurityHeaders(response, options = {}) {
  const opts = typeof options === 'object' && options !== null ? options : { isLocalhost: Boolean(options) };
  const { isLocalhost = false, requestOrigin = '', nonce = '', requestPath: rawRequestPath = '' } = opts;
  const rawPath = rawRequestPath || opts.path || opts.pathname || (opts.url ? new URL(opts.url, 'http://localhost').pathname : '') || (response.url ? new URL(response.url).pathname : '');
  const requestPath = rawPath ? rawPath.split('?')[0].split('#')[0] : '';
  const headers = new Headers(response.headers);

  if (!isLocalhost) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    headers.set("Content-Security-Policy", buildCsp(nonce));
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "0");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // Only emit CORS headers for origins on the allowlist, and always Vary on
  // Origin so a shared cache cannot serve one origin's grant to another.
  headers.append("Vary", "Origin");
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers.set("Access-Control-Allow-Origin", requestOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, X-Sync-Passcode");
    headers.set("Access-Control-Max-Age", "86400");
  }

  const contentType = headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");

  if (isHtml) {
    // Nonce-bearing HTML must never be cached: a reused nonce is no nonce.
    headers.set("Cache-Control", "no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }
  if (contentType.includes("application/json")) {
    headers.set("Cache-Control", "no-store");
  }

  const isStaticAsset =
    !isHtml &&
    !contentType.includes("application/json") &&
    (contentType.startsWith("application/javascript") ||
      contentType.startsWith("text/javascript") ||
      contentType.startsWith("text/css") ||
      contentType.startsWith("image/") ||
      contentType.startsWith("font/") ||
      contentType.startsWith("application/font") ||
      contentType.startsWith("application/wasm") ||
      requestPath.startsWith("/finance/assets/") ||
      requestPath.startsWith("/assets/") ||
      /\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|webmanifest|wasm)$/i.test(requestPath));

  if (isStaticAsset && (response.status < 400 || response.status === 304)) {
    // Check if filename is content-hashed (e.g., name-hash.ext, name.hash.ext, or assets under /finance/assets/)
    const isHashedAsset =
      /[-.][a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/i.test(requestPath) ||
      requestPath.startsWith("/finance/assets/") ||
      requestPath.startsWith("/assets/");

    if (isHashedAsset) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      // TODO: Immutable caching requires content-hashed filenames to be safe against stale browser caches.
      headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    }
  }

  const rewritten = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  if (isHtml && nonce && response.body) {
    return new HTMLRewriter().on("script", new NonceInjector(nonce)).transform(rewritten);
  }
  return rewritten;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const ROUTES = {
  "POST /api/verify-sync-code": handleVerifySyncCode,
  "POST /api/sync/backup": handleSyncBackup,
  "GET /api/sync/restore": handleSyncRestore,
  "POST /api/auth/register": handleRegister,
  "POST /api/auth/login": handleLogin,
  "POST /api/auth/forgot-password": handleForgotPassword,
  "POST /api/auth/reset-password": handleResetPassword,
  "GET /api/auth/security-question": handleSecurityQuestion,
  "POST /api/auth/update-profile": handleUpdateProfile,
  "GET /api/auth/me": handleMe,
  "POST /api/auth/logout": handleLogout,
  "GET /api/admin/stats": handleAdminStats
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
    const requestOrigin = request.headers.get("Origin") || "";
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const nonce = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(16)));
    const headerOpts = { isLocalhost, requestOrigin, nonce, requestPath: url.pathname };

    if (!isLocalhost && (url.protocol === "http:" || request.headers.get("x-forwarded-proto") === "http")) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === "OPTIONS") {
      // Preflight is only answered for allowlisted origins.
      if (!requestOrigin || !ALLOWED_ORIGINS.includes(requestOrigin)) {
        return addSecurityHeaders(new Response(null, { status: 403 }), headerOpts);
      }
      return addSecurityHeaders(new Response(null, { status: 204 }), headerOpts);
    }

    if (/^\/auction($|\/|\?)/i.test(url.pathname)) {
      const outpostUrl = new URL(request.url);
      outpostUrl.pathname = outpostUrl.pathname.replace(/^\/auction/i, "/outpost");
      return Response.redirect(outpostUrl.toString(), 301);
    }

    let response;
    try {
      let apiPath = url.pathname;
      if (apiPath.startsWith("/finance/api/")) {
        apiPath = apiPath.slice("/finance".length);
      } else if (apiPath === "/finance/api") {
        apiPath = "/api";
      }

      const handler = ROUTES[`${request.method} ${apiPath}`];

      if (handler) {
        // Reject cross-site state-changing calls from non-allowlisted origins
        // before they reach a handler.
        if (
          request.method !== "GET" &&
          requestOrigin &&
          !ALLOWED_ORIGINS.includes(requestOrigin)
        ) {
          response = fail(403, "Forbidden");
        } else {
          response = await handler(context);
        }
      } else if (apiPath.startsWith("/api/")) {
        response = fail(404, "Endpoint not found");
      } else if (
        url.pathname.startsWith("/finance/assets/") ||
        (url.pathname.startsWith("/finance/") && /\.[a-zA-Z0-9]+$/.test(url.pathname))
      ) {
        response = await fetchAsset(env, request, url.pathname.slice("/finance".length));
      } else if (url.pathname === "/finance" || url.pathname.startsWith("/finance/")) {
        response = await fetchAsset(env, request, "/");
      } else {
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(request) : await fetch(request);
      }
    } catch (err) {
      // Never surface internal exception text to the client (fix M10).
      console.error("[worker] unhandled error:", err && err.message, err && err.stack);
      response = fail(500, "An internal error occurred.");
    }

    return addSecurityHeaders(response, headerOpts);
  }
};

/**
 * Optional Durable Object for atomic rate limiting.
 * Bind as RATE_LIMITER in wrangler.toml to replace the racy KV counter.
 */
export class RateLimiter {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const { max, window } = await request.json();
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / window);
    const retryAfter = window - (now % window);

    return this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get("bucket")) || { bucket: -1, count: 0 };
      if (stored.bucket !== bucket) {
        stored.bucket = bucket;
        stored.count = 0;
      }
      if (stored.count >= max) {
        return new Response(JSON.stringify({ allowed: false, retryAfter }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      stored.count += 1;
      await this.state.storage.put("bucket", stored);
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { "Content-Type": "application/json" }
      });
    });
  }
}

export default worker;
