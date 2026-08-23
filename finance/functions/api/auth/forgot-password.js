import { verifyPassword } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';


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

    // Verify security answer if configured for user
    if (user.security_answer_hash) {
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
    }

    // Generate 6-digit numeric verification code
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const resetCode = String((randomArray[0] % 900000) + 100000);
    const resetId = `rst-${crypto.randomUUID()}`;
    const now = Date.now();
    const expiresAt = now + (15 * 60 * 1000); // 15 minutes validity

    // Invalidate previous active tokens for this user
    await env.DB.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').bind(cleanEmail).run();

    // Insert new reset token
    await env.DB.prepare(
      'INSERT INTO password_resets (id, user_id, email, token, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).bind(resetId, user.id, cleanEmail, resetCode, expiresAt, now).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Password reset code generated successfully.',
      resetToken: resetCode,
      email: cleanEmail
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
