import { verifyPassword } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

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
    // Table already exists or error
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `forgot:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 600);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many reset attempts. Please wait.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    });
  }

  try {
    const body = await request.json();
    const { email, securityAnswer } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email address is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address format.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await ensureResetTable(env.DB);

    // Look up user
    const user = await env.DB.prepare(
      'SELECT id, email, name, security_question, security_answer_hash FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'No account found with this email address.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Require security question for automated account recovery
    if (!user.security_answer_hash) {
      return new Response(JSON.stringify({
        error: 'This account does not have a security question configured for automated recovery. Please contact support.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!securityAnswer) {
      return new Response(JSON.stringify({ error: 'Security answer is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanAnswer = securityAnswer.trim().toLowerCase();
    const isValidAnswer = await verifyPassword(cleanAnswer, user.security_answer_hash);

    if (!isValidAnswer) {
      return new Response(JSON.stringify({ error: 'Incorrect security answer. Please try again.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate 6-digit numeric verification code
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const resetCode = String((randomArray[0] % 900000) + 100000);
    const resetId = `rst-${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + (15 * 60 * 1000); // 15 minutes validity

    // Invalidate previous active tokens for this user and insert new reset token atomically
    await env.DB.batch([
      env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail),
      env.DB.prepare(
        'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).bind(resetId, user.id, cleanEmail, resetCode, expiresAt, now)
    ]);

    const origin = request.headers.get('Origin') || '';
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');

    console.log(`[forgot-password] Password reset code generated for ${cleanEmail}: ${resetCode}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Security answer verified. Enter your reset verification code to update your password.',
      email: cleanEmail,
      ...(isLocal ? { resetToken: resetCode } : {})
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[forgot-password] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}