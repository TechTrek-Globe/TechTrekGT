import { hashPassword, sendVerificationEmail } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

const DEFAULT_PLATFORMS = [
  { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40, notes: '13.6% final value fee + $0.40 per order (avg)', is_default: 1 },
  { name: 'eBay (Promoted 2%)', fee_pct: 0.156, flat_fee: 0.40, notes: 'FVF + 2% promoted listing rate', is_default: 0 },
  { name: 'eBay (Promoted 5%)', fee_pct: 0.186, flat_fee: 0.40, notes: 'FVF + 5% promoted listing rate', is_default: 0 },
  { name: 'Facebook Marketplace (Local)', fee_pct: 0, flat_fee: 0, notes: 'No fees for local pickup', is_default: 0 },
  { name: 'Facebook Marketplace (Shipped)', fee_pct: 0.05, flat_fee: 0, notes: '5% seller fee on shipped orders', is_default: 0 },
  { name: 'OfferUp', fee_pct: 0.129, flat_fee: 0, notes: '12.9% on shipped orders', is_default: 0 },
  { name: 'Mercari', fee_pct: 0.10, flat_fee: 0, notes: '10% seller fee + payment processing', is_default: 0 },
  { name: 'Whatnot (Live)', fee_pct: 0.08, flat_fee: 0.30, notes: '8% + $0.30, live auction platform', is_default: 0 },
  { name: 'COMC', fee_pct: 0.20, flat_fee: 0, notes: 'Consignment ~20% depending on tier', is_default: 0 },
  { name: 'PWCC', fee_pct: 0.20, flat_fee: 0, notes: 'Vault/consignment ~20%', is_default: 0 },
  { name: 'Craigslist', fee_pct: 0, flat_fee: 0, notes: 'No fees - local only', is_default: 0 },
  { name: 'Other', fee_pct: 0, flat_fee: 0, notes: 'Custom', is_default: 0 },
];


export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipRlKey = `register:${ip}`;
  const ipLimit = await checkRateLimit(env.RATE_LIMIT_KV, ipRlKey, 5, 60, true);

  try {
    const body = await request.json();

    if (body && ('is_admin' in body || body.is_admin !== undefined || 'isAdmin' in body || body.isAdmin !== undefined)) {
      return new Response(JSON.stringify({ error: 'Field is_admin cannot be set via client request.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { email, password, name, securityQuestion, securityAnswer } = body;

    if (!email || !password || !name || !securityQuestion || !securityAnswer) {
      if (!ipLimit.allowed) {
        return new Response(JSON.stringify({ error: 'Too many registration attempts. Please wait.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
        });
      }
      return new Response(JSON.stringify({ error: 'Name, email, password, security question, and security answer are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (name.length > 100 || email.length > 254 || password.length > 128) {
      return new Response(JSON.stringify({ error: 'Input exceeds maximum allowed length.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address format.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const accountRlKey = `register-account:${cleanEmail}`;
    const accountLimit = await checkRateLimit(env.RATE_LIMIT_KV, accountRlKey, 5, 900, true);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(
        !ipLimit.allowed ? (ipLimit.retryAfter || 60) : 0,
        !accountLimit.allowed ? (accountLimit.retryAfter || 60) : 0
      );
      return new Response(JSON.stringify({ error: 'Too many registration attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
      });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters long.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(JSON.stringify({ error: 'Password must contain at least one uppercase letter and one number.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
    if (existing) {
      return new Response(JSON.stringify({ error: 'User with this email already exists' }), {
        status: 409, headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = `usr-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const cleanSecurityQuestion = securityQuestion.trim();
    const cleanSecurityAnswer = securityAnswer.trim().toLowerCase();
    const securityAnswerHash = await hashPassword(cleanSecurityAnswer);

    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, email_verified, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)'
    ).bind(userId, cleanEmail, passwordHash, name.trim(), cleanSecurityQuestion, securityAnswerHash).run();

    // Seed default platform fee records for new user
    for (const p of DEFAULT_PLATFORMS) {
      const pid = `plat-${crypto.randomUUID()}`;
      try {
        await env.DB.prepare(
          'INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(pid, userId, p.name, p.fee_pct, p.flat_fee, p.notes, p.is_default).run();
      } catch (e) { /* skip if table not yet migrated */ }
    }

    // Issue single-use email verification token (MED-3)
    const verifId = `vfy-${crypto.randomUUID()}`;
    const verificationToken = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    await env.DB.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(verifId, userId, cleanEmail, verificationToken, expiresAt, now).run();

    await sendVerificationEmail(env, cleanEmail, verificationToken).catch(e => {
      console.error('[register] failed to dispatch verification email:', e);
    });

    return new Response(JSON.stringify({
      success: true,
      verificationPending: true,
      message: 'Registration successful. A verification email has been sent. Please verify your email address to activate your account.',
      user: {
        id: userId,
        email: cleanEmail,
        name: name.trim(),
        email_verified: 0,
        email_verified_at: null
      }
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (err) {
    if (ipLimit && !ipLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many registration attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
      });
    }
    console.error('[auction register] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
