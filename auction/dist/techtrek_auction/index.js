async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 31e4,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:310000:${hashHex}`;
}
async function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  const [saltHex, iterationsOrHash, maybeHash] = parts;
  const iterations = parts.length === 3 ? parseInt(iterationsOrHash, 10) : 1e5;
  const originalHashHex = parts.length === 3 ? maybeHash : iterationsOrHash;
  if (!saltHex || !originalHashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hashHex.length !== originalHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) {
    diff |= hashHex.charCodeAt(i) ^ originalHashHex.charCodeAt(i);
  }
  return diff === 0;
}
function base64UrlEncode(str) {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}
async function createToken(payload, secret) {
  if (!secret) throw new Error("JWT_SECRET is not defined in environment variables");
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1e3) + 24 * 60 * 60
  }));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(dataToSign));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${dataToSign}.${encodedSignature}`;
}
async function verifyToken(token, secret) {
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signatureBytes = new Uint8Array(
      atob(encodedSignature.replace(/-/g, "+").replace(/_/g, "/")).split("").map((c) => c.charCodeAt(0))
    );
    const isValid = await crypto.subtle.verify("HMAC", cryptoKey, signatureBytes, enc.encode(dataToSign));
    if (!isValid) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}
function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (match && match[1]) {
    return match[1];
  }
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    if (token && token !== "cookie-active" && token !== "null" && token !== "undefined") {
      return token;
    }
  }
  return null;
}
async function checkRateLimit(kv, key, maxRequests, windowSeconds) {
  if (!kv) return { allowed: true };
  const now = Math.floor(Date.now() / 1e3);
  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;
  try {
    const current = parseInt(await kv.get(windowKey) || "0", 10);
    if (current >= maxRequests) {
      return { allowed: false, retryAfter: windowSeconds - now % windowSeconds };
    }
    await kv.put(windowKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
    return { allowed: true };
  } catch (err) {
    console.error("[rateLimit] failed to check KV:", err);
    return { allowed: true };
  }
}
const DEFAULT_PLATFORMS = [
  { name: "eBay", fee_pct: 0.136, flat_fee: 0.4, notes: "13.6% final value fee + $0.40 per order (avg)", is_default: 1 },
  { name: "eBay (Promoted 2%)", fee_pct: 0.156, flat_fee: 0.4, notes: "FVF + 2% promoted listing rate", is_default: 0 },
  { name: "eBay (Promoted 5%)", fee_pct: 0.186, flat_fee: 0.4, notes: "FVF + 5% promoted listing rate", is_default: 0 },
  { name: "Facebook Marketplace (Local)", fee_pct: 0, flat_fee: 0, notes: "No fees for local pickup", is_default: 0 },
  { name: "Facebook Marketplace (Shipped)", fee_pct: 0.05, flat_fee: 0, notes: "5% seller fee on shipped orders", is_default: 0 },
  { name: "OfferUp", fee_pct: 0.129, flat_fee: 0, notes: "12.9% on shipped orders", is_default: 0 },
  { name: "Mercari", fee_pct: 0.1, flat_fee: 0, notes: "10% seller fee + payment processing", is_default: 0 },
  { name: "Whatnot (Live)", fee_pct: 0.08, flat_fee: 0.3, notes: "8% + $0.30, live auction platform", is_default: 0 },
  { name: "COMC", fee_pct: 0.2, flat_fee: 0, notes: "Consignment ~20% depending on tier", is_default: 0 },
  { name: "PWCC", fee_pct: 0.2, flat_fee: 0, notes: "Vault/consignment ~20%", is_default: 0 },
  { name: "Craigslist", fee_pct: 0, flat_fee: 0, notes: "No fees - local only", is_default: 0 },
  { name: "Other", fee_pct: 0, flat_fee: 0, notes: "Custom", is_default: 0 }
];
async function ensureUserSchema(db) {
  if (!db) return;
  try {
    await db.prepare("ALTER TABLE users ADD COLUMN security_question TEXT").run();
  } catch (e) {
  }
  try {
    await db.prepare("ALTER TABLE users ADD COLUMN security_answer_hash TEXT").run();
  } catch (e) {
  }
}
async function onRequestPost$6(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `register:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many registration attempts. Please wait." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) }
    });
  }
  try {
    const body = await request.json();
    const { email, password, name, securityQuestion, securityAnswer } = body;
    if (!email || !password || !name || !securityQuestion || !securityAnswer) {
      return new Response(JSON.stringify({ error: "Name, email, password, security question, and security answer are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (name.length > 100 || email.length > 254 || password.length > 128) {
      return new Response(JSON.stringify({ error: "Input exceeds maximum allowed length." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email address format." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters long." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(JSON.stringify({ error: "Password must contain at least one uppercase letter and one number." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    await ensureUserSchema(env.DB);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
    if (existing) {
      return new Response(JSON.stringify({ error: "User with this email already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }
    const userId = `usr-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const cleanSecurityQuestion = securityQuestion.trim();
    const cleanSecurityAnswer = securityAnswer.trim().toLowerCase();
    const securityAnswerHash = await hashPassword(cleanSecurityAnswer);
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(userId, cleanEmail, passwordHash, name.trim(), cleanSecurityQuestion, securityAnswerHash).run();
    for (const p of DEFAULT_PLATFORMS) {
      const pid = `plat-${crypto.randomUUID()}`;
      try {
        await env.DB.prepare(
          "INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(pid, userId, p.name, p.fee_pct, p.flat_fee, p.notes, p.is_default).run();
      } catch (e) {
      }
    }
    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: "Server misconfiguration: missing JWT_SECRET" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = await createToken({ userId, email: cleanEmail, name: name.trim() }, env.JWT_SECRET);
    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 24 * 3600;
    const cookieOptions = [
      `auth_token=${token}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${maxAge}`
    ].join("; ");
    return new Response(JSON.stringify({
      success: true,
      user: { id: userId, email: cleanEmail, name: name.trim() }
    }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieOptions
      }
    });
  } catch (err) {
    console.error("[auction register] handler error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$5(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `login:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 10, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many login attempts. Please wait." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter)
      }
    });
  }
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid email or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid email or password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: "Server misconfiguration: missing JWT_SECRET" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const token = await createToken(
      { userId: user.id, email: user.email, name: user.name },
      env.JWT_SECRET
    );
    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 24 * 3600;
    const cookieOptions = [
      `auth_token=${token}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${maxAge}`
    ].join("; ");
    return new Response(JSON.stringify({
      success: true,
      user: { id: user.id, email: user.email, name: user.name }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieOptions
      }
    });
  } catch (err) {
    console.error("[auction login] handler error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    let userDetails = { id: payload.userId, email: payload.email, name: payload.name };
    if (env.DB) {
      try {
        const dbUser = await env.DB.prepare(
          "SELECT id, email, name, security_question, security_answer_hash FROM users WHERE id = ?"
        ).bind(payload.userId).first();
        if (dbUser) {
          userDetails = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            securityQuestion: dbUser.security_question || null,
            hasSecurityQuestion: Boolean(dbUser.security_question && dbUser.security_answer_hash)
          };
        }
      } catch (e) {
      }
    }
    return new Response(JSON.stringify({
      success: true,
      user: userDetails
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[auction me] handler error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$4() {
  const cookieOptions = [
    "auth_token=",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=0"
  ].join("; ");
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieOptions
    }
  });
}
async function ensureResetTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `).run();
  } catch (e) {
  }
}
async function onRequestPost$3(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `forgot:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 600);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many reset attempts. Please wait." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) }
    });
  }
  try {
    const body = await request.json();
    const { email, securityAnswer } = body;
    if (!email) {
      return new Response(JSON.stringify({ error: "Email address is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email address format." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    await ensureResetTable(env.DB);
    const user = await env.DB.prepare(
      "SELECT id, email, name, security_question, security_answer_hash FROM users WHERE email = ?"
    ).bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "No account found with this email address." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (user.security_answer_hash) {
      if (!securityAnswer) {
        return new Response(JSON.stringify({ error: "Security answer is required." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const cleanAnswer = securityAnswer.trim().toLowerCase();
      const isValidAnswer = await verifyPassword(cleanAnswer, user.security_answer_hash);
      if (!isValidAnswer) {
        return new Response(JSON.stringify({ error: "Incorrect security answer. Please try again." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const resetCode = String(randomArray[0] % 9e5 + 1e5);
    const resetId = `rst-${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1e3;
    await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0").bind(cleanEmail).run();
    await env.DB.prepare(
      "INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
    ).bind(resetId, user.id, cleanEmail, resetCode, expiresAt, now).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Password reset code generated successfully.",
      resetToken: resetCode,
      email: cleanEmail
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[auction forgot-password] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$2(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `reset:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 600);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many password reset attempts. Please wait." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) }
    });
  }
  try {
    const body = await request.json();
    const { email, token, newPassword } = body;
    if (!email || !token || !newPassword) {
      return new Response(JSON.stringify({ error: "Email, reset token, and new password are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "New password must be at least 8 characters long." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return new Response(JSON.stringify({ error: "New password must contain at least one uppercase letter and one number." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (newPassword.length > 128) {
      return new Response(JSON.stringify({ error: "Password exceeds maximum allowed length." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const resetRecord = await env.DB.prepare(
      "SELECT * FROM password_resets WHERE email = ? AND token = ? AND used = 0"
    ).bind(cleanEmail, cleanToken).first();
    if (!resetRecord) {
      return new Response(JSON.stringify({ error: "Invalid or expired password reset token." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (resetRecord.expires_at < Date.now()) {
      await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(resetRecord.id).run();
      return new Response(JSON.stringify({ error: "Password reset token has expired. Please request a new code." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "User account not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    const newPasswordHash = await hashPassword(newPassword);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newPasswordHash, user.id).run();
    await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(resetRecord.id).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Password reset successfully. You can now sign in with your new password."
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[auction reset-password] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$1(context) {
  const { request, env } = context;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `sec-q:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 10, 60);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please wait." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) }
    });
  }
  try {
    const body = await request.json();
    const { email } = body;
    if (!email) {
      return new Response(JSON.stringify({ error: "Email address is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const user = await env.DB.prepare(
      "SELECT security_question FROM users WHERE email = ?"
    ).bind(cleanEmail).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "No account found with this email address." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      success: true,
      email: cleanEmail,
      securityQuestion: user.security_question || null,
      hasSecurityQuestion: Boolean(user.security_question)
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[auction security-question] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload || !payload.userId) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Database binding DB not available." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const body = await request.json();
    const { name, email, securityQuestion, securityAnswer, currentPassword, newPassword } = body;
    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.userId).first();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    let updatedName = user.name;
    let updatedEmail = user.email;
    let updatedQuestion = user.security_question;
    let updatedAnswerHash = user.security_answer_hash;
    let updatedPasswordHash = user.password_hash;
    if (name && typeof name === "string" && name.trim()) {
      updatedName = name.trim();
    }
    if (email && typeof email === "string" && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return new Response(JSON.stringify({ error: "Invalid email address format." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (cleanEmail !== user.email) {
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id != ?").bind(cleanEmail, user.id).first();
        if (existing) {
          return new Response(JSON.stringify({ error: "Email address is already in use by another account." }), {
            status: 409,
            headers: { "Content-Type": "application/json" }
          });
        }
        updatedEmail = cleanEmail;
      }
    }
    if (securityQuestion && typeof securityQuestion === "string" && securityQuestion.trim()) {
      updatedQuestion = securityQuestion.trim();
      if (securityAnswer && typeof securityAnswer === "string" && securityAnswer.trim()) {
        const cleanAnswer = securityAnswer.trim().toLowerCase();
        updatedAnswerHash = await hashPassword(cleanAnswer);
      }
    }
    if (newPassword && typeof newPassword === "string" && newPassword.length > 0) {
      if (user.password_hash) {
        if (!currentPassword) {
          return new Response(JSON.stringify({ error: "Current password is required to set a new password." }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        const isCurrentValid = await verifyPassword(currentPassword, user.password_hash);
        if (!isCurrentValid) {
          return new Response(JSON.stringify({ error: "Current password is incorrect." }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      if (newPassword.length < 8) {
        return new Response(JSON.stringify({ error: "New password must be at least 8 characters long." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return new Response(JSON.stringify({ error: "New password must contain at least one uppercase letter and one number." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      updatedPasswordHash = await hashPassword(newPassword);
    }
    await env.DB.prepare(`
      UPDATE users
      SET name = ?, email = ?, security_question = ?, security_answer_hash = ?, password_hash = ?
      WHERE id = ?
    `).bind(updatedName, updatedEmail, updatedQuestion, updatedAnswerHash, updatedPasswordHash, user.id).run();
    const newToken = await createToken({
      userId: user.id,
      email: updatedEmail,
      name: updatedName
    }, env.JWT_SECRET);
    const cookieOptions = [
      `auth_token=${newToken}`,
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/"
    ].join("; ");
    return new Response(JSON.stringify({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: user.id,
        email: updatedEmail,
        name: updatedName,
        securityQuestion: updatedQuestion,
        hasSecurityQuestion: Boolean(updatedQuestion && updatedAnswerHash)
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieOptions
      }
    });
  } catch (err) {
    console.error("[auction update-profile] error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
function addSecurityHeaders(response, isLocalhost = false) {
  const newHeaders = new Headers(response.headers);
  if (!isLocalhost) {
    newHeaders.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    newHeaders.set("Content-Security-Policy", [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' https://techtrekgt.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'"
    ].join("; "));
  }
  newHeaders.set("X-Content-Type-Options", "nosniff");
  newHeaders.set("X-Frame-Options", "DENY");
  newHeaders.set("X-XSS-Protection", "0");
  newHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
  newHeaders.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  const allowedOrigins = [
    "https://techtrekgt.com",
    "https://techtrek-auction.pages.dev",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
  ];
  const origin = response.headers.get("Origin");
  if (origin && allowedOrigins.includes(origin)) {
    newHeaders.set("Access-Control-Allow-Origin", origin);
  } else {
    newHeaders.set("Access-Control-Allow-Origin", "https://techtrekgt.com");
  }
  newHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  newHeaders.set("Access-Control-Allow-Credentials", "true");
  newHeaders.set("Access-Control-Max-Age", "86400");
  const contentType = newHeaders.get("content-type") || "";
  if (contentType.includes("text/html")) {
    newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
    newHeaders.set("Pragma", "no-cache");
    newHeaders.set("Expires", "0");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocalhost && (url.protocol === "http:" || request.headers.get("x-forwarded-proto") === "http")) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    if (request.method === "OPTIONS") {
      return addSecurityHeaders(new Response(null, { status: 204 }), isLocalhost);
    }
    let response;
    try {
      let apiPath = url.pathname;
      if (apiPath.startsWith("/auction/api/")) {
        apiPath = apiPath.slice("/auction".length);
      } else if (apiPath === "/auction/api") {
        apiPath = "/api";
      }
      if (apiPath === "/api/auth/register" && request.method === "POST") {
        response = await onRequestPost$6(context);
      } else if (apiPath === "/api/auth/login" && request.method === "POST") {
        response = await onRequestPost$5(context);
      } else if (apiPath === "/api/auth/forgot-password" && request.method === "POST") {
        response = await onRequestPost$3(context);
      } else if (apiPath === "/api/auth/reset-password" && request.method === "POST") {
        response = await onRequestPost$2(context);
      } else if (apiPath === "/api/auth/security-question" && request.method === "POST") {
        response = await onRequestPost$1(context);
      } else if (apiPath === "/api/auth/update-profile" && request.method === "POST") {
        response = await onRequestPost(context);
      } else if (apiPath === "/api/auth/me" && request.method === "GET") {
        response = await onRequestGet(context);
      } else if (apiPath === "/api/auth/logout" && request.method === "POST") {
        response = await onRequestPost$4(context);
      } else if (apiPath.startsWith("/api/")) {
        response = new Response(JSON.stringify({ error: "Endpoint not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      } else if (url.pathname.startsWith("/auction/assets/")) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetUrl.pathname.slice("/auction".length);
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(new Request(assetUrl.toString(), request)) : await fetch(new Request(assetUrl.toString(), request));
      } else if (url.pathname === "/auction" || url.pathname.startsWith("/auction/")) {
        const spaUrl = new URL(request.url);
        spaUrl.pathname = "/";
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(new Request(spaUrl.toString(), request)) : await fetch(new Request(spaUrl.toString(), request));
      } else {
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(request) : await fetch(request);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err || "Server error");
      response = new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    return addSecurityHeaders(response, isLocalhost);
  }
};
const workerEntry = worker ?? {};
export {
  workerEntry as default
};
