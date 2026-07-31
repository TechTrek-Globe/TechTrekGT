import { hashPassword, createToken } from '../../utils/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return new Response(JSON.stringify({ error: 'Name, email, and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
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

    const cleanEmail = email.trim().toLowerCase();

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

    const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const householdId = `hh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
    const memberId = `hm-${Date.now()}`;
    await env.DB.prepare(
      'INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)'
    ).bind(memberId, householdId, userId, 'owner').run();

    // Insert initial Person record for the new user (clean slate)
    const person1Id = `person-${Date.now()}-1`;
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

    return new Response(JSON.stringify({
      success: true,
      user: { id: userId, email: cleanEmail, name: name.trim() },
      token,
      householdId
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Registration failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
