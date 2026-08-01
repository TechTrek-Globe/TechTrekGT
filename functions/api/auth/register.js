import { hashPassword, createToken } from '../../utils/auth.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

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
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: 'Name, email, and password are required' }), {
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
    const householdId = `hh-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);

    // Insert User
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
    ).bind(userId, cleanEmail, passwordHash, name.trim()).run();

    // Insert Household
    await env.DB.prepare(
      'INSERT INTO households (id, name) VALUES (?, ?)'
    ).bind(householdId, `${name.trim()}'s Household`).run();

    // Insert Household Member
    const memberId = `hm-${crypto.randomUUID()}`;
    await env.DB.prepare(
      'INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).bind(memberId, householdId, userId, 'owner').run();

    // Insert initial Person record for the new user (clean slate)
    const person1Id = `person-${crypto.randomUUID()}`;
    await env.DB.prepare(
      'INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(person1Id, householdId, name.trim(), 'Primary', 'bi-weekly', '15', 'last', 0, 0, 'purple').run();

    if (!env.JWT_SECRET) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing JWT_SECRET' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create JWT token
    const token = await createToken({ userId, email: cleanEmail, householdId, name: name.trim() }, env.JWT_SECRET);

    const cookieOptions = [
      `auth_token=${token}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${body.rememberMe ? 5 * 24 * 3600 : 0}`
    ].join('; ');

    return new Response(JSON.stringify({
      success: true,
      user: { id: userId, email: cleanEmail, name: name.trim() },
      householdId
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
