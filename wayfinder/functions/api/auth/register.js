import { hashPassword, createToken } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';
import { sha256Hex } from '../../utils/agendaAccess.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `register:${ip}`;
  const { allowed, retryAfter } = await checkRateLimit(env.RATE_LIMIT_KV, rlKey, 5, 60);

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many registration attempts. Please wait.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    });
  }

  try {
    const body = await request.json();
    const { email, password, name, securityQuestion, securityAnswer } = body;

    if (!email || !password || !name || !securityQuestion || !securityAnswer) {
      return new Response(JSON.stringify({ error: 'Name, email, password, security question, and security answer are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const MAX_NAME_LEN = 100;
    const MAX_EMAIL_LEN = 254;
    const MAX_PASS_LEN = 128;

    if (name.length > MAX_NAME_LEN || email.length > MAX_EMAIL_LEN || password.length > MAX_PASS_LEN) {
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

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters long.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(JSON.stringify({ error: 'Password must contain at least one uppercase letter and one number.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if DB binding exists
    if (!env.DB) {
      return new Response(JSON.stringify({ error: 'Database binding DB not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check existing user
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
    if (existing) {
      return new Response(JSON.stringify({ error: 'User with this email already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = `usr-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);
    const cleanSecurityQuestion = securityQuestion.trim();
    const cleanSecurityAnswer = securityAnswer.trim().toLowerCase();
    const securityAnswerHash = await hashPassword(cleanSecurityAnswer);

    // Invite-link registration: receiving the link proves control of the invited inbox
    let emailVerified = 0;
    let emailVerifiedAt = null;
    if (body.inviteToken && typeof body.inviteToken === 'string') {
      try {
        const inviteHash = await sha256Hex(body.inviteToken);
        const inv = await env.DB.prepare(
          `SELECT id FROM wayfinder_agenda_invites
           WHERE token_hash = ? AND invited_email = ? AND status = 'pending' AND expires_at > datetime('now')`
        ).bind(inviteHash, cleanEmail).first();
        if (inv) {
          emailVerified = 1;
          emailVerifiedAt = new Date().toISOString();
        }
      } catch (e) {
        console.warn('[register] invite verification check skipped:', e?.message);
      }
    }

    // Insert user into shared users table (households table is deprecated across platform)
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, role, token_version, status, email_verified, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, 'user', 0, 'Active', ?, ?)`
    ).bind(userId, cleanEmail, passwordHash, name.trim(), cleanSecurityQuestion, securityAnswerHash, emailVerified, emailVerifiedAt).run();

    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const maxAge = body.rememberMe ? 30 * 24 * 3600 : 7200;

    // Create JWT token
    const token = await createToken(
      { userId, email: cleanEmail, householdId: null, name: name.trim(), role: 'user', isAdmin: false, apiKeyEnabled: false },
      env.JWT_SECRET,
      maxAge
    );

    const cookieOptions = [
      `auth_token=${token}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${maxAge}`
    ].join('; ');

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: userId,
        email: cleanEmail,
        name: name.trim(),
        role: 'user',
        isAdmin: false,
        apiKeyEnabled: false
      },
      householdId: null
    }), {
      status: 201,
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': cookieOptions
      }
    });

  } catch (err) {
    console.error('[register] handler error:', err);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}