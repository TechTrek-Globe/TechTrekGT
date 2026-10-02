import { verifyPassword, sendResetEmail } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipRlKey = `forgot:${ip}`;
  const ipLimit = await checkRateLimit(env.RATE_LIMIT_KV, ipRlKey, 5, 600, true, env.RATE_LIMIT_DO);

  // Generic response used to prevent enumeration (HIGH-1, HIGH-2)
  const genericOk = new Response(JSON.stringify({
    success: true,
    message: 'If an account with this email exists, a password reset email has been sent.'
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    const body = await request.json().catch(() => ({}));
    const { email, token: bodyToken, resetToken: bodyResetToken, securityAnswer } = body;
    const activeToken = (bodyToken || bodyResetToken || '').trim();

    if (!email) {
      if (!ipLimit.allowed) {
        return new Response(JSON.stringify({ error: 'Too many reset attempts. Please wait.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
        });
      }
      return new Response(JSON.stringify({ error: 'Email address is required.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const accountRlKey = `forgot-account:${cleanEmail}`;
    const accountLimit = await checkRateLimit(env.RATE_LIMIT_KV, accountRlKey, 5, 900, true, env.RATE_LIMIT_DO);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(
        !ipLimit.allowed ? (ipLimit.retryAfter || 60) : 0,
        !accountLimit.allowed ? (accountLimit.retryAfter || 60) : 0
      );
      return new Response(JSON.stringify({ error: 'Too many reset attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
      });
    }
    const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email address format.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Artificial delay prevents timing-based enumeration regardless of path taken
    const delayPromise = new Promise(r => setTimeout(r, 200));

    const user = await env.DB.prepare(
      'SELECT id, email, name, security_question, security_answer_hash FROM users WHERE email = ?'
    ).bind(cleanEmail).first();

    // Secondary confirmation step: if emailed token is provided, validate token first
    if (activeToken) {
      const resetRecord = await env.DB.prepare(
        'SELECT * FROM password_resets WHERE token = ? AND email = ? AND used = 0'
      ).bind(activeToken, cleanEmail).first();

      let isTokenValid = Boolean(resetRecord && resetRecord.expires_at >= Date.now());
      if (resetRecord && resetRecord.expires_at < Date.now()) {
        await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').bind(resetRecord.id).run();
      }

      let isAnswerValid = true;
      if (user && user.security_answer_hash) {
        if (!securityAnswer) {
          isAnswerValid = false;
        } else {
          const cleanAnswer = securityAnswer.trim().toLowerCase();
          isAnswerValid = await verifyPassword(cleanAnswer, user.security_answer_hash);
        }
      }

      // Return ONE generic failure for any verification failure to prevent account enumeration (T-12 / SEC-012)
      if (!isTokenValid || !user || !isAnswerValid) {
        await delayPromise;
        return new Response(JSON.stringify({ error: 'Invalid reset token or security answer. Please check your details and try again.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }

      // Identity verified: issue short-lived HttpOnly session cookie scoped to Path=/ (T-12 / SEC-013)
      const resetSessionCookie = [
        `reset_session=${activeToken}`,
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
        'Path=/',
        'Max-Age=900'
      ].join('; ');

      await delayPromise;
      return new Response(JSON.stringify({
        success: true,
        message: 'Identity verified. You may now set a new password.'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': resetSessionCookie
        }
      });
    }

    // Primary path: generate single-use, time-limited reset token and email it (omits security question)
    if (user) {
      const resetToken = crypto.randomUUID();
      const resetId = `rst-${crypto.randomUUID()}`;
      const now = Date.now();
      const expiresAt = now + (15 * 60 * 1000); // 15-minute window

      const invalidateStmt = env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail);
      const insertResetStmt = env.DB.prepare(
        'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).bind(resetId, user.id, cleanEmail, resetToken, expiresAt, now);

      if (typeof env.DB.batch === 'function') {
        await env.DB.batch([invalidateStmt, insertResetStmt]);
      } else {
        await invalidateStmt.run();
        await insertResetStmt.run();
      }

      await sendResetEmail(env, user.email, resetToken);
    }

    await delayPromise;
    return genericOk;

  } catch (err) {
    if (ipLimit && !ipLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many reset attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(ipLimit.retryAfter) }
      });
    }
    console.error('[outpost forgot-password] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
