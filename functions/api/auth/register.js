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

    // Insert Initial Default Preset Data for the Household
    const acc1Id = `acc-${Date.now()}-1`;
    const acc2Id = `acc-${Date.now()}-2`;
    const acc3Id = `acc-${Date.now()}-3`;

    await env.DB.prepare(
      'INSERT INTO accounts (id, household_id, name, type, starting_balance, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(acc1Id, householdId, 'Checking - Main', 'checking', 2500, 'blue').run();

    await env.DB.prepare(
      'INSERT INTO accounts (id, household_id, name, type, starting_balance, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(acc2Id, householdId, 'Emergency Savings', 'savings', 10000, 'emerald').run();

    await env.DB.prepare(
      'INSERT INTO accounts (id, household_id, name, type, starting_balance, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(acc3Id, householdId, 'Rewards Credit Card', 'credit', 0, 'purple').run();

    const person1Id = `person-${Date.now()}-1`;
    await env.DB.prepare(
      'INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(person1Id, householdId, name.trim(), 'Primary', 'bi-weekly', '15', 'last', 3000, 2200, 'purple').run();

    const bill1Id = `bill-${Date.now()}-1`;
    await env.DB.prepare(
      'INSERT INTO bills (id, household_id, account_id, name, amount, period, due_day, payment_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(bill1Id, householdId, acc1Id, 'Housing / Rent', 1500, 'Monthly', 1, 'Auto Pay').run();

    await env.DB.prepare(
      'INSERT INTO bill_splits (bill_id, person_id, percentage) VALUES (?, ?, ?)'
    ).bind(bill1Id, person1Id, 100).run();

    // Create JWT token
    const token = await createToken({ userId, email: cleanEmail, householdId, name: name.trim() });

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
