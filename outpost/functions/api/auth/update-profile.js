import { verifyToken, getTokenFromRequest, hashPassword, verifyPassword, createToken, buildAuthCookie } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    const payload = await verifyToken(token, env.JWT_SECRET);
    if (!payload || !payload.userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limit update-profile by userId to prevent currentPassword brute-force (HIGH-3)
    const rlKey = `profile:${payload.userId}`;
    const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 300);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many profile update attempts. Please wait.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) }
      });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();

    if (body && ('is_admin' in body || body.is_admin !== undefined || 'isAdmin' in body || body.isAdmin !== undefined)) {
      return new Response(JSON.stringify({ error: 'Field is_admin cannot be set via client request.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { name, email, securityQuestion, securityAnswer, currentPassword, newPassword } = body;

    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.userId).first();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      });
    }

    let updatedName         = user.name;
    let updatedEmail        = user.email;
    let updatedQuestion     = user.security_question;
    let updatedAnswerHash   = user.security_answer_hash;
    let updatedPasswordHash = user.password_hash;

    if (name && typeof name === 'string' && name.trim()) {
      updatedName = name.trim();
    }

    if (email && typeof email === 'string' && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return new Response(JSON.stringify({ error: 'Invalid email address format.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      if (cleanEmail !== user.email) {
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(cleanEmail, user.id).first();
        if (existing) {
          return new Response(JSON.stringify({ error: 'Email address is already in use by another account.' }), {
            status: 409, headers: { 'Content-Type': 'application/json' }
          });
        }
        updatedEmail = cleanEmail;
      }
    }

    if (securityQuestion && typeof securityQuestion === 'string' && securityQuestion.trim()) {
      updatedQuestion = securityQuestion.trim();
      if (securityAnswer && typeof securityAnswer === 'string' && securityAnswer.trim()) {
        const cleanAnswer = securityAnswer.trim().toLowerCase();
        updatedAnswerHash = await hashPassword(cleanAnswer);
      }
    }

    if (newPassword && typeof newPassword === 'string' && newPassword.length > 0) {
      if (user.password_hash) {
        if (!currentPassword) {
          return new Response(JSON.stringify({ error: 'Current password is required to set a new password.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
          });
        }
        const isCurrentValid = await verifyPassword(currentPassword, user.password_hash);
        if (!isCurrentValid) {
          return new Response(JSON.stringify({ error: 'Current password is incorrect.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      if (newPassword.length < 8) {
        return new Response(JSON.stringify({ error: 'New password must be at least 8 characters long.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return new Response(JSON.stringify({ error: 'New password must contain at least one uppercase letter and one number.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      updatedPasswordHash = await hashPassword(newPassword);
    }

    await env.DB.prepare(`
      UPDATE users
      SET name = ?, email = ?, security_question = ?, security_answer_hash = ?, password_hash = ?
      WHERE id = ?
    `).bind(updatedName, updatedEmail, updatedQuestion, updatedAnswerHash, updatedPasswordHash, user.id).run();

    // Preserve remaining JWT lifetime so rememberMe users don't get downgraded (MEDIUM-2, HIGH-5)
    const remainingSeconds = payload.exp
      ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 3600)
      : 7200;

    const newToken = await createToken({
      userId: user.id,
      email: updatedEmail,
      name: updatedName
    }, env.JWT_SECRET, remainingSeconds);

    return new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully.',
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
        'Content-Type': 'application/json',
        'Set-Cookie': buildAuthCookie(newToken, remainingSeconds)
      }
    });

  } catch (err) {
    console.error('[outpost update-profile] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
