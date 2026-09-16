import { getTokenFromRequest, verifyToken } from '../../utils/auth.js';

// Constant-time string comparison - prevents timing attacks on admin email check
async function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  const aHash = await crypto.subtle.digest('SHA-256', aBuf);
  const bHash = await crypto.subtle.digest('SHA-256', bBuf);
  const aView = new Uint8Array(aHash);
  const bView = new Uint8Array(bHash);
  let mismatch = 0;
  for (let i = 0; i < aView.length; i++) {
    mismatch |= (aView[i] ^ bView[i]);
  }
  return mismatch === 0;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // 1. Verify JWT
  const token = getTokenFromRequest(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload = await verifyToken(token, env?.JWT_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. Admin email gate - constant-time comparison against ADMIN_EMAIL env var
  const adminEmail = env?.ADMIN_EMAIL || '';
  if (!adminEmail) {
    console.error('[admin/stats] ADMIN_EMAIL env var is not configured');
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const isAdmin = await timingSafeStringEqual(
    (payload.email || '').trim().toLowerCase(),
    adminEmail.trim().toLowerCase()
  );

  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. DB availability check
  if (!env?.DB) {
    return new Response(JSON.stringify({ error: 'Database binding not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 4. Fetch all users
    const usersResult = await env.DB.prepare(
      'SELECT id, email, name, status, created_at FROM users ORDER BY created_at ASC'
    ).all();

    // 5. Fetch all backup records (one row per user, id = userId)
    const backupsResult = await env.DB.prepare(
      'SELECT id, updated_at FROM user_backups'
    ).all();

    // Build a lookup map: userId -> { backupCount, lastBackupAt }
    const backupMap = {};
    for (const row of (backupsResult.results || [])) {
      backupMap[row.id] = { backupCount: 1, lastBackupAt: row.updated_at };
    }

    const users = (usersResult.results || []).map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status || 'Active',
      createdAt: u.created_at,
      backupCount: backupMap[u.id]?.backupCount ?? 0,
      lastBackupAt: backupMap[u.id]?.lastBackupAt ?? null
    }));

    return new Response(JSON.stringify({
      totalUsers: users.length,
      users
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[admin/stats] query error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch admin stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
