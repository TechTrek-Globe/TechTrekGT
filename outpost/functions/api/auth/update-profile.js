import {
  verifyToken,
  getTokenFromRequest,
  getAllTokensFromRequest,
  hashPassword,
  verifyPassword,
  createToken,
  buildAuthCookie,
  maskEmail,
  sendEmailChangeConfirmation,
  sendEmailChangeNotification
} from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let tokens = [];
    try {
      tokens = getAllTokensFromRequest(request);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    let payload = null;
    for (const t of tokens) {
      const p = await verifyToken(t, env.JWT_SECRET);
      if (p && p.userId) {
        payload = p;
        break;
      }
    }

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

    // Token version check (T-14 / SEC-020)
    const currentTv = user.token_version ?? 1;
    const tokenTv = payload.tv ?? payload.token_version ?? 1;
    if (tokenTv < currentTv) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Token has been invalidated. Please sign in again.' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    let updatedName         = user.name;
    let updatedQuestion     = user.security_question;
    let updatedAnswerHash   = user.security_answer_hash;
    let updatedPasswordHash = user.password_hash;
    let updatedTokenVersion = currentTv;
    let emailChangePending  = false;
    let pendingEmailValue   = null;

    if (name && typeof name === 'string' && name.trim()) {
      updatedName = name.trim();
    }

    // Pending email change workflow (T-13 / SEC-015)
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

        // Rate limit email changes per account (T-13 constraint: 5 changes per 15 min)
        const emailChangeKey = `email-change:${user.id}`;
        const changeLimit = await checkRateLimit(env.RATE_LIMIT_KV, emailChangeKey, 5, 900);
        if (!changeLimit.allowed) {
          return new Response(JSON.stringify({ error: 'Too many email change requests. Please wait.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': String(changeLimit.retryAfter) }
          });
        }

        // Invalidate any existing unused change tokens for this user
        await env.DB.prepare(
          "UPDATE email_verifications SET used = 1 WHERE user_id = ? AND used = 0 AND (change_type = 'email_change' OR email != ?)"
        ).bind(user.id, user.email).run().catch(() => {});

        // Issue single-use 24-hour verification token for new email address
        const verifId = `vfy-${crypto.randomUUID()}`;
        const changeToken = crypto.randomUUID();
        const now = Date.now();
        const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

        try {
          await env.DB.prepare(`
            INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, created_at, change_type)
            VALUES (?, ?, ?, ?, ?, 0, ?, 'email_change')
          `).bind(verifId, user.id, cleanEmail, changeToken, expiresAt, now).run();
        } catch (_) {
          // Fallback if change_type column not yet present
          await env.DB.prepare(`
            INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
          `).bind(verifId, user.id, cleanEmail, changeToken, expiresAt, now).run();
        }

        // Dispatch confirmation to NEW address & notification with masked address to OLD address
        await sendEmailChangeConfirmation(env, cleanEmail, changeToken);
        await sendEmailChangeNotification(env, user.email, maskEmail(cleanEmail));

        emailChangePending = true;
        pendingEmailValue = cleanEmail;
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
      // Invalidate existing sessions on password change by bumping token_version (T-14 / SEC-020)
      updatedTokenVersion = currentTv + 1;
    }

    // Notice: email column in users remains user.email (NOT modified until confirmation)
    await env.DB.prepare(`
      UPDATE users
      SET name = ?, security_question = ?, security_answer_hash = ?, password_hash = ?, token_version = ?
      WHERE id = ?
    `).bind(updatedName, updatedQuestion, updatedAnswerHash, updatedPasswordHash, updatedTokenVersion, user.id).run();

    // Reissue JWT with only the REMAINING lifetime; NEVER extend beyond original expiry (T-13 / Item 6)
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingSeconds = payload.exp
      ? Math.max(payload.exp - nowSec, 1)
      : 7200;

    const newToken = await createToken({
      userId: user.id,
      tv: updatedTokenVersion
    }, env.JWT_SECRET, remainingSeconds);

    const message = emailChangePending
      ? 'Profile updated. A confirmation link has been sent to your new email address.'
      : 'Profile updated successfully.';

    return new Response(JSON.stringify({
      success: true,
      message,
      emailChangePending,
      pendingEmail: pendingEmailValue,
      user: {
        id: user.id,
        email: user.email,
        name: updatedName,
        pendingEmail: pendingEmailValue,
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
