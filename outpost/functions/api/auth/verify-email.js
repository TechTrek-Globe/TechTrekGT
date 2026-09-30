import { createToken, buildAuthCookie } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

async function handleVerification(context, token, rememberMe = false) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipRlKey = `verify-email:${ip}`;
  const ipLimit = await checkRateLimit(env.RATE_LIMIT_KV, ipRlKey, 15, 60, true, env.RATE_LIMIT_DO);

  if (!ipLimit.allowed) {
    return new Response(JSON.stringify({ error: 'Too many verification attempts. Please wait.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(ipLimit.retryAfter || 60)
      }
    });
  }

  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    return new Response(JSON.stringify({ error: 'Verification token is required.' }), {
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

  if (!env.JWT_SECRET) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const verifRecord = await env.DB.prepare(
      'SELECT id, user_id, email, expires_at, used FROM email_verifications WHERE token = ? AND used = 0'
    ).bind(cleanToken).first();

    if (!verifRecord) {
      return new Response(JSON.stringify({ error: 'Invalid or expired verification token.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const expTime = typeof verifRecord.expires_at === 'number'
      ? verifRecord.expires_at
      : (!isNaN(Number(verifRecord.expires_at))
        ? Number(verifRecord.expires_at)
        : new Date(verifRecord.expires_at).getTime());

    if (expTime < Date.now()) {
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(verifRecord.id).run();
      return new Response(JSON.stringify({ error: 'Verification token has expired. Please request a new one.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = await env.DB.prepare(
      'SELECT id, email, name, role FROM users WHERE id = ?'
    ).bind(verifRecord.user_id).first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User account not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const nowIso = new Date().toISOString();
    if (typeof env.DB.batch === 'function') {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET email_verified = 1, email_verified_at = ? WHERE id = ?').bind(nowIso, user.id),
        env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(verifRecord.id),
        env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id)
      ]);
    } else {
      await env.DB.prepare('UPDATE users SET email_verified = 1, email_verified_at = ? WHERE id = ?').bind(nowIso, user.id).run();
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').bind(verifRecord.id).run();
      await env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND used = 0').bind(user.id).run();
    }

    const maxAge = rememberMe ? 30 * 24 * 3600 : 7200;
    const authToken = await createToken(
      { userId: user.id, tv: user.token_version ?? 1 },
      env.JWT_SECRET,
      maxAge
    );

    const acceptHeader = request.headers.get('Accept') || '';
    if (request.method === 'GET' && acceptHeader.includes('text/html')) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/outpost?verified=true',
          'Set-Cookie': buildAuthCookie(authToken, maxAge)
        }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      verified: true,
      message: 'Email successfully verified.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
        emailVerifiedAt: nowIso
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildAuthCookie(authToken, maxAge)
      }
    });

  } catch (err) {
    console.error('[verify-email] error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred during email verification.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || url.searchParams.get('code') || '';
  const rememberMe = url.searchParams.get('rememberMe') === 'true';
  return handleVerification(context, token, rememberMe);
}

export async function onRequestPost(context) {
  const { request } = context;
  let token = '';
  let rememberMe = false;

  try {
    const body = await request.json().catch(() => ({}));
    token = body?.token || body?.code || '';
    rememberMe = Boolean(body?.rememberMe);
  } catch (_) {
    // fallback to url search params if json parsing completely fails
  }

  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get('token') || url.searchParams.get('code') || '';
    if (!rememberMe) {
      rememberMe = url.searchParams.get('rememberMe') === 'true';
    }
  }

  return handleVerification(context, token, rememberMe);
}
