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
  } catch (err2) {
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
  } catch (err2) {
    console.error("[rateLimit] failed to check KV:", err2);
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
async function onRequestPost$8(context) {
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
  } catch (err2) {
    console.error("[auction register] handler error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$7(context) {
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
  } catch (err2) {
    console.error("[auction login] handler error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestGet$8(context) {
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
  } catch (err2) {
    console.error("[auction me] handler error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$6() {
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
async function onRequestPost$5(context) {
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
  } catch (err2) {
    console.error("[auction forgot-password] error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$4(context) {
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
  } catch (err2) {
    console.error("[auction reset-password] error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$3(context) {
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
  } catch (err2) {
    console.error("[auction security-question] error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function onRequestPost$2(context) {
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
  } catch (err2) {
    console.error("[auction update-profile] error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
async function requireAuth(request, env) {
  if (!env.JWT_SECRET) {
    throw new Response(JSON.stringify({ error: "Server misconfiguration: missing JWT_SECRET" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized: missing token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || !payload.userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized: invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }
  return payload;
}
async function withAuth(fn) {
  try {
    return await fn();
  } catch (err2) {
    if (err2 instanceof Response) return err2;
    console.error("[withAuth] unexpected error:", err2);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function computeItemProration(item, invoice) {
  const base = invoice.base_total;
  const weight = base > 0 ? item.unit_price / base : 0;
  const prorated_discount = weight * invoice.discount;
  const prorated_shipping = weight * invoice.shipping;
  const prorated_tax = weight * invoice.tax;
  const true_total_cost = item.unit_price - prorated_discount + prorated_shipping + prorated_tax;
  return {
    proration_weight: weight,
    prorated_discount,
    prorated_shipping,
    prorated_tax,
    true_total_cost
  };
}
function computeSaleMetrics(sale) {
  const platform_fees_amt = sale.gross_sale_price * sale.platform_fee_pct + sale.platform_flat_fee;
  const net_proceeds = sale.gross_sale_price + sale.buyer_shipping_paid - sale.actual_shipping_cost - platform_fees_amt - sale.payment_processing_amt - sale.promoted_listing_fee;
  const net_profit = net_proceeds - sale.true_total_cost;
  const roi_pct = sale.true_total_cost > 0 ? net_profit / sale.true_total_cost : 0;
  return { platform_fees_amt, net_proceeds, net_profit, roi_pct };
}
function computePricingFloors(item) {
  const divisor = 1 - item.platform_fee_pct - item.boost_pct;
  const min_sell_price = divisor > 0 ? (item.true_total_cost + item.est_shipping_cost + item.platform_flat_fee) / divisor : 0;
  const suggested_list_price = min_sell_price * (1 + item.target_margin_pct);
  return { min_sell_price, suggested_list_price };
}
function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return Math.floor(ms / (1e3 * 60 * 60 * 24));
}
async function onRequestGet$7(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const rows = await env.DB.prepare(`
      SELECT
        i.id, i.invoice_ref, i.description, i.base_total,
        i.discount, i.shipping, i.tax, i.date_acquired, i.created_at,
        COUNT(it.id) AS item_count,
        SUM(it.true_total_cost) AS total_landed_cost
      FROM auction_invoices i
      LEFT JOIN auction_items it ON it.invoice_id = i.id
      WHERE i.user_id = ?
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).bind(payload.userId).all();
    return ok({ invoices: rows.results || [] });
  });
}
async function onRequestPost$1(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const body = await request.json();
    const { invoice_ref, description, discount, shipping, tax, date_acquired, items } = body;
    if (!invoice_ref) return err("invoice_ref is required");
    if (!Array.isArray(items) || items.length === 0) return err("At least one item is required");
    for (const it of items) {
      if (!it.item_name || !it.item_name.trim()) return err("Each item must have a name");
      if (typeof it.unit_price !== "number" || it.unit_price <= 0) return err(`Item "${it.item_name}" must have a positive unit_price`);
    }
    const base_total = items.reduce((sum, it) => sum + (it.unit_price || 0), 0);
    const invDiscount = discount || 0;
    const invShipping = shipping || 0;
    const invTax = tax || 0;
    const invoiceId = `inv-${crypto.randomUUID()}`;
    const invoicePayload = {
      base_total,
      discount: invDiscount,
      shipping: invShipping,
      tax: invTax
    };
    await env.DB.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref, description, base_total, discount, shipping, tax, date_acquired)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      invoiceId,
      payload.userId,
      invoice_ref.trim(),
      description || null,
      base_total,
      invDiscount,
      invShipping,
      invTax,
      date_acquired || null
    ).run();
    const insertedItems = [];
    for (const it of items) {
      const itemId = `item-${crypto.randomUUID()}`;
      const proration = computeItemProration({ unit_price: it.unit_price }, invoicePayload);
      let feePct = it.platform_fee_pct || 0;
      let flatFee = it.platform_flat_fee || 0;
      if (it.platform && !it.platform_fee_pct) {
        const plat = await env.DB.prepare(
          "SELECT fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name = ?"
        ).bind(payload.userId, it.platform).first();
        if (plat) {
          feePct = plat.fee_pct;
          flatFee = plat.flat_fee;
        }
      }
      const boostPct = it.boost_pct || 0;
      const estShipping = it.est_shipping_cost || 0;
      const targetMarginPct = it.target_margin_pct || 0;
      const pricing = computePricingFloors({
        true_total_cost: proration.true_total_cost,
        est_shipping_cost: estShipping,
        platform_flat_fee: flatFee,
        platform_fee_pct: feePct,
        boost_pct: boostPct,
        target_margin_pct: targetMarginPct
      });
      await env.DB.prepare(`
        INSERT INTO auction_items (
          id, user_id, invoice_id, item_name, category, sport_genre, athlete_person,
          authenticator, cert_number, unit_price, item_base_total,
          proration_weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost,
          status, platform, platform_fee_pct, platform_flat_fee,
          est_shipping_cost, boost_pct, min_sell_price, suggested_list_price,
          current_list_price, target_margin_pct,
          date_acquired, date_listed, notes, best_listing_window
        ) VALUES (
          ?,?,?,?,?,?,?,
          ?,?,?,?,
          ?,?,?,?,?,
          ?,?,?,?,
          ?,?,?,?,
          ?,?,
          ?,?,?,?
        )
      `).bind(
        itemId,
        payload.userId,
        invoiceId,
        it.item_name.trim(),
        it.category || null,
        it.sport_genre || null,
        it.athlete_person || null,
        it.authenticator || null,
        it.cert_number || null,
        it.unit_price,
        it.unit_price,
        proration.proration_weight,
        proration.prorated_discount,
        proration.prorated_shipping,
        proration.prorated_tax,
        proration.true_total_cost,
        it.status || "Available",
        it.platform || null,
        feePct,
        flatFee,
        estShipping,
        boostPct,
        pricing.min_sell_price,
        pricing.suggested_list_price,
        it.current_list_price || null,
        targetMarginPct,
        date_acquired || null,
        it.date_listed || null,
        it.notes || null,
        it.best_listing_window || null
      ).run();
      insertedItems.push({
        id: itemId,
        item_name: it.item_name.trim(),
        unit_price: it.unit_price,
        ...proration,
        min_sell_price: pricing.min_sell_price,
        suggested_list_price: pricing.suggested_list_price,
        status: it.status || "Available"
      });
    }
    return ok({
      success: true,
      invoice: { id: invoiceId, invoice_ref, base_total, discount: invDiscount, shipping: invShipping, tax: invTax },
      items: insertedItems
    }, 201);
  });
}
function getInvoiceId(url) {
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] || null;
}
async function onRequestGet$6(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getInvoiceId(new URL(request.url));
    if (!id) return err("Invoice ID required", 400);
    const invoice = await env.DB.prepare(
      "SELECT * FROM auction_invoices WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!invoice) return err("Invoice not found", 404);
    const items = await env.DB.prepare(
      "SELECT * FROM auction_items WHERE invoice_id = ? AND user_id = ? ORDER BY created_at ASC"
    ).bind(id, payload.userId).all();
    return ok({ invoice, items: items.results || [] });
  });
}
async function onRequestPut$2(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const url = new URL(request.url);
    const id = getInvoiceId(url);
    if (!id) return err("Invoice ID required", 400);
    const invoice = await env.DB.prepare(
      "SELECT * FROM auction_invoices WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!invoice) return err("Invoice not found", 404);
    const body = await request.json();
    const { invoice_ref, description, discount, shipping, tax, date_acquired } = body;
    const newDiscount = discount ?? invoice.discount;
    const newShipping = shipping ?? invoice.shipping;
    const newTax = tax ?? invoice.tax;
    const newRef = invoice_ref ?? invoice.invoice_ref;
    const newDesc = description ?? invoice.description;
    const newDateAcq = date_acquired ?? invoice.date_acquired;
    await env.DB.prepare(`
      UPDATE auction_invoices
      SET invoice_ref = ?, description = ?, discount = ?, shipping = ?, tax = ?, date_acquired = ?
      WHERE id = ? AND user_id = ?
    `).bind(newRef, newDesc, newDiscount, newShipping, newTax, newDateAcq, id, payload.userId).run();
    const existing = await env.DB.prepare(
      "SELECT * FROM auction_items WHERE invoice_id = ? AND user_id = ?"
    ).bind(id, payload.userId).all();
    const updatedInvoice = { ...invoice, discount: newDiscount, shipping: newShipping, tax: newTax };
    for (const item of existing.results || []) {
      const proration = computeItemProration({ unit_price: item.unit_price }, updatedInvoice);
      const pricing = computePricingFloors({
        true_total_cost: proration.true_total_cost,
        est_shipping_cost: item.est_shipping_cost || 0,
        platform_flat_fee: item.platform_flat_fee || 0,
        platform_fee_pct: item.platform_fee_pct || 0,
        boost_pct: item.boost_pct || 0,
        target_margin_pct: item.target_margin_pct || 0
      });
      await env.DB.prepare(`
        UPDATE auction_items
        SET proration_weight = ?, prorated_discount = ?, prorated_shipping = ?,
            prorated_tax = ?, true_total_cost = ?,
            min_sell_price = ?, suggested_list_price = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).bind(
        proration.proration_weight,
        proration.prorated_discount,
        proration.prorated_shipping,
        proration.prorated_tax,
        proration.true_total_cost,
        pricing.min_sell_price,
        pricing.suggested_list_price,
        item.id,
        payload.userId
      ).run();
    }
    return ok({ success: true, message: `Invoice updated and ${existing.results?.length || 0} items re-prorated.` });
  });
}
async function onRequestDelete$2(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getInvoiceId(new URL(request.url));
    if (!id) return err("Invoice ID required", 400);
    const invoice = await env.DB.prepare(
      "SELECT id FROM auction_invoices WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!invoice) return err("Invoice not found", 404);
    const soldCheck = await env.DB.prepare(`
      SELECT COUNT(*) AS cnt FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      WHERE i.invoice_id = ? AND s.user_id = ?
    `).bind(id, payload.userId).first();
    if (soldCheck && soldCheck.cnt > 0) {
      return err("Cannot delete an invoice that has recorded sales. Archive items instead.", 409);
    }
    await env.DB.prepare("DELETE FROM auction_items WHERE invoice_id = ? AND user_id = ?").bind(id, payload.userId).run();
    await env.DB.prepare("DELETE FROM auction_invoices WHERE id = ? AND user_id = ?").bind(id, payload.userId).run();
    return ok({ success: true });
  });
}
async function onRequestGet$5(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    const invoice_id = url.searchParams.get("invoice_id") || "";
    const q = url.searchParams.get("q") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;
    const conditions = ["i.user_id = ?"];
    const bindings = [payload.userId];
    if (status) {
      conditions.push("i.status = ?");
      bindings.push(status);
    }
    if (invoice_id) {
      conditions.push("i.invoice_id = ?");
      bindings.push(invoice_id);
    }
    if (q) {
      conditions.push("(i.item_name LIKE ? OR i.athlete_person LIKE ? OR i.category LIKE ?)");
      const like = `%${q}%`;
      bindings.push(like, like, like);
    }
    const whereClause = conditions.join(" AND ");
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM auction_items i WHERE ${whereClause}`
    ).bind(...bindings).first();
    const rows = await env.DB.prepare(`
      SELECT
        i.*,
        inv.invoice_ref,
        inv.discount AS inv_discount,
        inv.shipping AS inv_shipping,
        inv.tax      AS inv_tax
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();
    return ok({
      items: rows.results || [],
      pagination: {
        total: countRow?.total || 0,
        page,
        limit,
        pages: Math.ceil((countRow?.total || 0) / limit)
      }
    });
  });
}
function getItemId(url) {
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] || null;
}
async function onRequestGet$4(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getItemId(new URL(request.url));
    if (!id) return err("Item ID required", 400);
    const item = await env.DB.prepare(
      "SELECT * FROM auction_items WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!item) return err("Item not found", 404);
    return ok({ item });
  });
}
async function onRequestPut$1(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getItemId(new URL(request.url));
    if (!id) return err("Item ID required", 400);
    const item = await env.DB.prepare(
      "SELECT * FROM auction_items WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!item) return err("Item not found", 404);
    const body = await request.json();
    const updated = {
      item_name: body.item_name ?? item.item_name,
      category: body.category ?? item.category,
      sport_genre: body.sport_genre ?? item.sport_genre,
      athlete_person: body.athlete_person ?? item.athlete_person,
      authenticator: body.authenticator ?? item.authenticator,
      cert_number: body.cert_number ?? item.cert_number,
      status: body.status ?? item.status,
      platform: body.platform ?? item.platform,
      platform_fee_pct: body.platform_fee_pct ?? item.platform_fee_pct,
      platform_flat_fee: body.platform_flat_fee ?? item.platform_flat_fee,
      est_shipping_cost: body.est_shipping_cost ?? item.est_shipping_cost,
      boost_pct: body.boost_pct ?? item.boost_pct,
      target_margin_pct: body.target_margin_pct ?? item.target_margin_pct,
      current_list_price: body.current_list_price ?? item.current_list_price,
      actual_sell_price: body.actual_sell_price ?? item.actual_sell_price,
      date_listed: body.date_listed ?? item.date_listed,
      date_sold: body.date_sold ?? item.date_sold,
      notes: body.notes ?? item.notes,
      best_listing_window: body.best_listing_window ?? item.best_listing_window
    };
    if (body.platform && body.platform !== item.platform && !body.platform_fee_pct) {
      const plat = await env.DB.prepare(
        "SELECT fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name = ?"
      ).bind(payload.userId, body.platform).first();
      if (plat) {
        updated.platform_fee_pct = plat.fee_pct;
        updated.platform_flat_fee = plat.flat_fee;
      }
    }
    const pricing = computePricingFloors({
      true_total_cost: item.true_total_cost,
      est_shipping_cost: updated.est_shipping_cost,
      platform_flat_fee: updated.platform_flat_fee,
      platform_fee_pct: updated.platform_fee_pct,
      boost_pct: updated.boost_pct,
      target_margin_pct: updated.target_margin_pct
    });
    let days_on_market = item.days_on_market;
    if (updated.status === "Sold" && updated.date_listed && updated.date_sold) {
      const from = new Date(updated.date_listed).getTime();
      const to = new Date(updated.date_sold).getTime();
      days_on_market = Math.floor((to - from) / (1e3 * 60 * 60 * 24));
    }
    await env.DB.prepare(`
      UPDATE auction_items SET
        item_name = ?, category = ?, sport_genre = ?, athlete_person = ?,
        authenticator = ?, cert_number = ?,
        status = ?, platform = ?, platform_fee_pct = ?, platform_flat_fee = ?,
        est_shipping_cost = ?, boost_pct = ?, target_margin_pct = ?,
        min_sell_price = ?, suggested_list_price = ?,
        current_list_price = ?, actual_sell_price = ?,
        date_listed = ?, date_sold = ?, days_on_market = ?,
        notes = ?, best_listing_window = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      updated.item_name,
      updated.category,
      updated.sport_genre,
      updated.athlete_person,
      updated.authenticator,
      updated.cert_number,
      updated.status,
      updated.platform,
      updated.platform_fee_pct,
      updated.platform_flat_fee,
      updated.est_shipping_cost,
      updated.boost_pct,
      updated.target_margin_pct,
      pricing.min_sell_price,
      pricing.suggested_list_price,
      updated.current_list_price,
      updated.actual_sell_price,
      updated.date_listed,
      updated.date_sold,
      days_on_market,
      updated.notes,
      updated.best_listing_window,
      id,
      payload.userId
    ).run();
    return ok({
      success: true,
      min_sell_price: pricing.min_sell_price,
      suggested_list_price: pricing.suggested_list_price,
      days_on_market
    });
  });
}
async function onRequestDelete$1(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getItemId(new URL(request.url));
    if (!id) return err("Item ID required", 400);
    const item = await env.DB.prepare(
      "SELECT id FROM auction_items WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!item) return err("Item not found", 404);
    const saleCheck = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM auction_sales WHERE item_id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (saleCheck && saleCheck.cnt > 0) {
      return err('Cannot delete an item that has recorded sales. Set status to "Returned" instead.', 409);
    }
    await env.DB.prepare("DELETE FROM auction_comps WHERE item_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM auction_items WHERE id = ? AND user_id = ?").bind(id, payload.userId).run();
    return ok({ success: true });
  });
}
async function onRequestGet$3(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform") || "";
    const q = url.searchParams.get("q") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;
    const conditions = ["s.user_id = ?"];
    const bindings = [payload.userId];
    if (platform) {
      conditions.push("s.platform = ?");
      bindings.push(platform);
    }
    if (q) {
      conditions.push("(i.item_name LIKE ? OR i.athlete_person LIKE ? OR s.buyer_handle LIKE ?)");
      const like = `%${q}%`;
      bindings.push(like, like, like);
    }
    const whereClause = conditions.join(" AND ");
    const aggRow = await env.DB.prepare(`
      SELECT
        COUNT(s.id) AS total_count,
        COALESCE(SUM(s.gross_sale_price), 0) AS total_gross,
        COALESCE(SUM(s.net_proceeds), 0) AS total_net_proceeds,
        COALESCE(SUM(s.true_total_cost), 0) AS total_cost,
        COALESCE(SUM(s.net_profit), 0) AS total_net_profit,
        COALESCE(AVG(s.days_to_sell), 0) AS avg_days_to_sell
      FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      WHERE ${whereClause}
    `).bind(...bindings).first();
    const count = aggRow?.total_count || 0;
    const totalCost = aggRow?.total_cost || 0;
    const totalProfit = aggRow?.total_net_profit || 0;
    const blendedRoi = totalCost > 0 ? totalProfit / totalCost : 0;
    const rows = await env.DB.prepare(`
      SELECT
        s.*,
        i.item_name,
        i.category,
        i.athlete_person,
        i.authenticator,
        i.cert_number,
        i.date_acquired,
        i.date_listed,
        inv.invoice_ref
      FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      WHERE ${whereClause}
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();
    return ok({
      sales: rows.results || [],
      summary: {
        total_count: count,
        total_gross: aggRow?.total_gross || 0,
        total_net_proceeds: aggRow?.total_net_proceeds || 0,
        total_cost: totalCost,
        total_net_profit: totalProfit,
        blended_roi: blendedRoi,
        avg_days_to_sell: Math.round(aggRow?.avg_days_to_sell || 0)
      },
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    });
  });
}
async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const body = await request.json();
    const {
      item_id,
      sale_date,
      platform,
      buyer_handle,
      gross_sale_price,
      buyer_shipping_paid,
      actual_shipping_cost,
      platform_fee_pct,
      platform_flat_fee,
      payment_processing_amt,
      promoted_listing_fee
    } = body;
    if (!item_id) return err("item_id is required");
    if (!sale_date) return err("sale_date is required");
    if (!platform) return err("platform is required");
    if (typeof gross_sale_price !== "number" || gross_sale_price < 0) {
      return err("Valid gross_sale_price is required");
    }
    const item = await env.DB.prepare(
      "SELECT * FROM auction_items WHERE id = ? AND user_id = ?"
    ).bind(item_id, payload.userId).first();
    if (!item) return err("Item not found", 404);
    let feePct = platform_fee_pct;
    let flatFee = platform_flat_fee;
    if (feePct == null || flatFee == null) {
      const plat = await env.DB.prepare(
        "SELECT fee_pct, flat_fee FROM auction_platforms WHERE user_id = ? AND name = ?"
      ).bind(payload.userId, platform).first();
      feePct = feePct ?? (plat?.fee_pct || 0);
      flatFee = flatFee ?? (plat?.flat_fee || 0);
    }
    const bShippingPaid = buyer_shipping_paid || 0;
    const aShippingCost = actual_shipping_cost || 0;
    const pProcessingAmt = payment_processing_amt || 0;
    const pListingFee = promoted_listing_fee || 0;
    const metrics = computeSaleMetrics({
      gross_sale_price,
      buyer_shipping_paid: bShippingPaid,
      actual_shipping_cost: aShippingCost,
      platform_fee_pct: feePct,
      platform_flat_fee: flatFee,
      payment_processing_amt: pProcessingAmt,
      promoted_listing_fee: pListingFee,
      true_total_cost: item.true_total_cost
    });
    const startDate = item.date_listed || item.date_acquired;
    const daysToSell = daysBetween(startDate, sale_date) ?? 0;
    const saleId = `sale-${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO auction_sales (
        id, user_id, item_id, sale_date, platform, buyer_handle,
        gross_sale_price, buyer_shipping_paid, actual_shipping_cost,
        platform_fee_pct, platform_flat_fee, platform_fees_amt,
        payment_processing_amt, promoted_listing_fee,
        net_proceeds, true_total_cost, net_profit, roi_pct,
        days_to_sell
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?
      )
    `).bind(
      saleId,
      payload.userId,
      item_id,
      sale_date,
      platform,
      buyer_handle || null,
      gross_sale_price,
      bShippingPaid,
      aShippingCost,
      feePct,
      flatFee,
      metrics.platform_fees_amt,
      pProcessingAmt,
      pListingFee,
      metrics.net_proceeds,
      item.true_total_cost,
      metrics.net_profit,
      metrics.roi_pct,
      daysToSell >= 0 ? daysToSell : 0
    ).run();
    await env.DB.prepare(`
      UPDATE auction_items SET
        status = 'Sold',
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      gross_sale_price,
      sale_date,
      daysToSell >= 0 ? daysToSell : 0,
      item_id,
      payload.userId
    ).run();
    return ok({
      success: true,
      sale: {
        id: saleId,
        item_id,
        sale_date,
        platform,
        gross_sale_price,
        net_profit: metrics.net_profit,
        roi_pct: metrics.roi_pct,
        net_proceeds: metrics.net_proceeds,
        days_to_sell: daysToSell >= 0 ? daysToSell : 0
      }
    }, 201);
  });
}
function getSaleId(url) {
  const parts = url.pathname.split("/");
  return parts[parts.length - 1] || null;
}
async function onRequestGet$2(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getSaleId(new URL(request.url));
    if (!id) return err("Sale ID required", 400);
    const sale = await env.DB.prepare(`
      SELECT
        s.*,
        i.item_name,
        i.category,
        i.athlete_person,
        i.authenticator,
        i.cert_number,
        i.date_acquired,
        i.date_listed,
        inv.invoice_ref
      FROM auction_sales s
      JOIN auction_items i ON i.id = s.item_id
      LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id
      WHERE s.id = ? AND s.user_id = ?
    `).bind(id, payload.userId).first();
    if (!sale) return err("Sale not found", 404);
    return ok({ sale });
  });
}
async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getSaleId(new URL(request.url));
    if (!id) return err("Sale ID required", 400);
    const existing = await env.DB.prepare(
      "SELECT * FROM auction_sales WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!existing) return err("Sale not found", 404);
    const item = await env.DB.prepare(
      "SELECT * FROM auction_items WHERE id = ? AND user_id = ?"
    ).bind(existing.item_id, payload.userId).first();
    if (!item) return err("Associated item not found", 404);
    const body = await request.json();
    const sale_date = body.sale_date ?? existing.sale_date;
    const platform = body.platform ?? existing.platform;
    const buyer_handle = body.buyer_handle !== void 0 ? body.buyer_handle : existing.buyer_handle;
    const gross_sale_price = typeof body.gross_sale_price === "number" ? body.gross_sale_price : existing.gross_sale_price;
    const buyer_shipping_paid = typeof body.buyer_shipping_paid === "number" ? body.buyer_shipping_paid : existing.buyer_shipping_paid;
    const actual_shipping_cost = typeof body.actual_shipping_cost === "number" ? body.actual_shipping_cost : existing.actual_shipping_cost;
    const platform_fee_pct = typeof body.platform_fee_pct === "number" ? body.platform_fee_pct : existing.platform_fee_pct;
    const platform_flat_fee = typeof body.platform_flat_fee === "number" ? body.platform_flat_fee : existing.platform_flat_fee;
    const payment_processing_amt = typeof body.payment_processing_amt === "number" ? body.payment_processing_amt : existing.payment_processing_amt;
    const promoted_listing_fee = typeof body.promoted_listing_fee === "number" ? body.promoted_listing_fee : existing.promoted_listing_fee;
    const metrics = computeSaleMetrics({
      gross_sale_price,
      buyer_shipping_paid,
      actual_shipping_cost,
      platform_fee_pct,
      platform_flat_fee,
      payment_processing_amt,
      promoted_listing_fee,
      true_total_cost: item.true_total_cost
    });
    const startDate = item.date_listed || item.date_acquired;
    const daysToSell = daysBetween(startDate, sale_date) ?? existing.days_to_sell;
    await env.DB.prepare(`
      UPDATE auction_sales SET
        sale_date = ?,
        platform = ?,
        buyer_handle = ?,
        gross_sale_price = ?,
        buyer_shipping_paid = ?,
        actual_shipping_cost = ?,
        platform_fee_pct = ?,
        platform_flat_fee = ?,
        platform_fees_amt = ?,
        payment_processing_amt = ?,
        promoted_listing_fee = ?,
        net_proceeds = ?,
        true_total_cost = ?,
        net_profit = ?,
        roi_pct = ?,
        days_to_sell = ?
      WHERE id = ? AND user_id = ?
    `).bind(
      sale_date,
      platform,
      buyer_handle || null,
      gross_sale_price,
      buyer_shipping_paid,
      actual_shipping_cost,
      platform_fee_pct,
      platform_flat_fee,
      metrics.platform_fees_amt,
      payment_processing_amt,
      promoted_listing_fee,
      metrics.net_proceeds,
      item.true_total_cost,
      metrics.net_profit,
      metrics.roi_pct,
      daysToSell >= 0 ? daysToSell : 0,
      id,
      payload.userId
    ).run();
    await env.DB.prepare(`
      UPDATE auction_items SET
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      gross_sale_price,
      sale_date,
      daysToSell >= 0 ? daysToSell : 0,
      existing.item_id,
      payload.userId
    ).run();
    return ok({ success: true, message: "Sale updated successfully" });
  });
}
async function onRequestDelete(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const id = getSaleId(new URL(request.url));
    if (!id) return err("Sale ID required", 400);
    const existing = await env.DB.prepare(
      "SELECT id, item_id FROM auction_sales WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).first();
    if (!existing) return err("Sale not found", 404);
    await env.DB.prepare(
      "DELETE FROM auction_sales WHERE id = ? AND user_id = ?"
    ).bind(id, payload.userId).run();
    await env.DB.prepare(`
      UPDATE auction_items SET
        status = CASE WHEN date_listed IS NOT NULL AND date_listed != '' THEN 'Listed' ELSE 'Available' END,
        actual_sell_price = NULL,
        date_sold = NULL,
        days_on_market = NULL,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(existing.item_id, payload.userId).run();
    return ok({ success: true, message: "Sale deleted and item status reverted" });
  });
}
async function onRequestGet$1(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err("Database not available", 500);
    const rows = await env.DB.prepare(
      "SELECT * FROM auction_platforms WHERE user_id = ? ORDER BY is_default DESC, name ASC"
    ).bind(payload.userId).all();
    return ok({ platforms: rows.results || [] });
  });
}
async function onRequestGet(context) {
  return withAuth(async () => {
    const { request, env } = context;
    const { userId } = await requireAuth(request, env);
    const db = env.DB;
    const invStats = await db.prepare(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_items,
        SUM(CASE WHEN status = 'Listed' THEN 1 ELSE 0 END) as listed_items,
        SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) as sold_items,
        SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as returned_items,
        SUM(CASE WHEN status IN ('Available', 'Listed') THEN true_total_cost ELSE 0 END) as capital_tied_up,
        SUM(CASE WHEN status = 'Listed' THEN COALESCE(list_price, 0) ELSE 0 END) as listed_potential_revenue,
        SUM(CASE WHEN status != 'Returned' THEN true_total_cost ELSE 0 END) as total_capital_invested
      FROM auction_items
      WHERE user_id = ?
    `).bind(userId).first();
    const salesStats = await db.prepare(`
      SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(gross_sale_price), 0) as total_gross_sales,
        COALESCE(SUM(net_proceeds), 0) as total_net_proceeds,
        COALESCE(SUM(platform_fees_amt), 0) as total_platform_fees,
        COALESCE(SUM(actual_shipping_cost), 0) as total_shipping_costs,
        COALESCE(SUM(net_profit), 0) as total_net_profit,
        COALESCE(AVG(days_to_sell), 0) as avg_days_to_sell
      FROM auction_sales
      WHERE user_id = ?
    `).bind(userId).first();
    const soldCostRow = await db.prepare(`
      SELECT COALESCE(SUM(i.true_total_cost), 0) as total_sold_cost
      FROM auction_sales s
      JOIN auction_items i ON s.item_id = i.id
      WHERE s.user_id = ?
    `).bind(userId).first();
    const totalSoldCost = soldCostRow?.total_sold_cost || 0;
    const totalNetProfit = salesStats?.total_net_profit || 0;
    const blendedRoi = totalSoldCost > 0 ? totalNetProfit / totalSoldCost : 0;
    const categoryStats = await db.prepare(`
      SELECT
        category,
        COUNT(*) as item_count,
        SUM(CASE WHEN status IN ('Available', 'Listed') THEN true_total_cost ELSE 0 END) as capital_tied_up,
        SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) as sold_count
      FROM auction_items
      WHERE user_id = ? AND status != 'Returned'
      GROUP BY category
      ORDER BY capital_tied_up DESC, item_count DESC
    `).bind(userId).all();
    const authenticatorStats = await db.prepare(`
      SELECT
        COALESCE(NULLIF(authenticator, ''), 'Uncertified / Raw') as authenticator,
        COUNT(*) as count,
        SUM(CASE WHEN status IN ('Available', 'Listed') THEN true_total_cost ELSE 0 END) as capital_tied_up
      FROM auction_items
      WHERE user_id = ? AND status != 'Returned'
      GROUP BY authenticator
      ORDER BY count DESC
    `).bind(userId).all();
    const platformSalesStats = await db.prepare(`
      SELECT
        platform,
        COUNT(*) as sales_count,
        COALESCE(SUM(gross_sale_price), 0) as gross_volume,
        COALESCE(SUM(net_profit), 0) as net_profit,
        COALESCE(SUM(platform_fees_amt), 0) as total_fees
      FROM auction_sales
      WHERE user_id = ?
      GROUP BY platform
      ORDER BY sales_count DESC
    `).bind(userId).all();
    const monthlyTrend = await db.prepare(`
      SELECT
        strftime('%Y-%m', sale_date) as month,
        COUNT(*) as sales_count,
        COALESCE(SUM(gross_sale_price), 0) as gross_volume,
        COALESCE(SUM(net_profit), 0) as net_profit
      FROM auction_sales
      WHERE user_id = ?
      GROUP BY strftime('%Y-%m', sale_date)
      ORDER BY month ASC
      LIMIT 12
    `).bind(userId).all();
    const recentSales = await db.prepare(`
      SELECT
        s.id,
        s.sale_date,
        s.platform,
        s.gross_sale_price,
        s.net_profit,
        s.roi_pct,
        s.days_to_sell,
        i.item_name,
        i.category,
        i.athlete_person
      FROM auction_sales s
      JOIN auction_items i ON s.item_id = i.id
      WHERE s.user_id = ?
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT 5
    `).bind(userId).all();
    const recentAcquisitions = await db.prepare(`
      SELECT
        i.id,
        i.item_name,
        i.category,
        i.athlete_person,
        i.status,
        i.unit_price,
        i.true_total_cost,
        i.min_sell_price,
        i.suggested_list_price,
        i.created_at,
        inv.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
      LIMIT 5
    `).bind(userId).all();
    return ok({
      inventory: {
        total_items: invStats?.total_items || 0,
        available_items: invStats?.available_items || 0,
        listed_items: invStats?.listed_items || 0,
        sold_items: invStats?.sold_items || 0,
        returned_items: invStats?.returned_items || 0,
        capital_tied_up: invStats?.capital_tied_up || 0,
        listed_potential_revenue: invStats?.listed_potential_revenue || 0,
        total_capital_invested: invStats?.total_capital_invested || 0
      },
      sales: {
        total_sales: salesStats?.total_sales || 0,
        total_gross_sales: salesStats?.total_gross_sales || 0,
        total_net_proceeds: salesStats?.total_net_proceeds || 0,
        total_platform_fees: salesStats?.total_platform_fees || 0,
        total_shipping_costs: salesStats?.total_shipping_costs || 0,
        total_net_profit: totalNetProfit,
        total_sold_cost: totalSoldCost,
        blended_roi: blendedRoi,
        avg_days_to_sell: Math.round((salesStats?.avg_days_to_sell || 0) * 10) / 10
      },
      categories: categoryStats?.results || [],
      authenticators: authenticatorStats?.results || [],
      platforms: platformSalesStats?.results || [],
      monthly_trend: monthlyTrend?.results || [],
      recent_sales: recentSales?.results || [],
      recent_acquisitions: recentAcquisitions?.results || []
    });
  });
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
        response = await onRequestPost$8(context);
      } else if (apiPath === "/api/auth/login" && request.method === "POST") {
        response = await onRequestPost$7(context);
      } else if (apiPath === "/api/auth/forgot-password" && request.method === "POST") {
        response = await onRequestPost$5(context);
      } else if (apiPath === "/api/auth/reset-password" && request.method === "POST") {
        response = await onRequestPost$4(context);
      } else if (apiPath === "/api/auth/security-question" && request.method === "POST") {
        response = await onRequestPost$3(context);
      } else if (apiPath === "/api/auth/update-profile" && request.method === "POST") {
        response = await onRequestPost$2(context);
      } else if (apiPath === "/api/auth/me" && request.method === "GET") {
        response = await onRequestGet$8(context);
      } else if (apiPath === "/api/auth/logout" && request.method === "POST") {
        response = await onRequestPost$6(context);
      } else if (apiPath === "/api/invoices" && request.method === "GET") {
        response = await onRequestGet$7(context);
      } else if (apiPath === "/api/invoices" && request.method === "POST") {
        response = await onRequestPost$1(context);
      } else if (/^\/api\/invoices\/[^/]+$/.test(apiPath) && request.method === "GET") {
        response = await onRequestGet$6(context);
      } else if (/^\/api\/invoices\/[^/]+$/.test(apiPath) && request.method === "PUT") {
        response = await onRequestPut$2(context);
      } else if (/^\/api\/invoices\/[^/]+$/.test(apiPath) && request.method === "DELETE") {
        response = await onRequestDelete$2(context);
      } else if (apiPath === "/api/items" && request.method === "GET") {
        response = await onRequestGet$5(context);
      } else if (/^\/api\/items\/[^/]+$/.test(apiPath) && request.method === "GET") {
        response = await onRequestGet$4(context);
      } else if (/^\/api\/items\/[^/]+$/.test(apiPath) && request.method === "PUT") {
        response = await onRequestPut$1(context);
      } else if (/^\/api\/items\/[^/]+$/.test(apiPath) && request.method === "DELETE") {
        response = await onRequestDelete$1(context);
      } else if (apiPath === "/api/sales" && request.method === "GET") {
        response = await onRequestGet$3(context);
      } else if (apiPath === "/api/sales" && request.method === "POST") {
        response = await onRequestPost(context);
      } else if (/^\/api\/sales\/[^/]+$/.test(apiPath) && request.method === "GET") {
        response = await onRequestGet$2(context);
      } else if (/^\/api\/sales\/[^/]+$/.test(apiPath) && request.method === "PUT") {
        response = await onRequestPut(context);
      } else if (/^\/api\/sales\/[^/]+$/.test(apiPath) && request.method === "DELETE") {
        response = await onRequestDelete(context);
      } else if (apiPath === "/api/platforms" && request.method === "GET") {
        response = await onRequestGet$1(context);
      } else if (apiPath === "/api/dashboard" && request.method === "GET") {
        response = await onRequestGet(context);
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
    } catch (err2) {
      const errorMessage = err2 instanceof Error ? err2.message : String(err2 || "Server error");
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
