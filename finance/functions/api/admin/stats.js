import { authenticate, json, fail, ERROR_CODES } from '../../utils/auth.js';

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const { user } = auth;

    // Authorization comes from the database role column, not an env var or
    // self-asserted email claim in the JWT (fix C3).
    if (String(user.role || 'user') !== 'admin') {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden');
    }

    if (!env?.DB) {
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Database binding not available');
    }

    const usersResult = await env.DB.prepare(
      'SELECT id, email, name, status, created_at FROM users ORDER BY created_at ASC LIMIT 1000'
    ).all();
    const backupsResult = await env.DB.prepare('SELECT id, updated_at FROM user_backups').all();

    const backupMap = {};
    for (const row of backupsResult.results || []) {
      backupMap[row.id] = { backupCount: 1, lastBackupAt: row.updated_at };
    }

    const users = (usersResult.results || []).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status || 'Active',
      createdAt: u.created_at,
      backupCount: backupMap[u.id]?.backupCount ?? 0,
      lastBackupAt: backupMap[u.id]?.lastBackupAt ?? null
    }));

    return json({ totalUsers: users.length, users });
  } catch (err) {
    console.error('[admin/stats] query error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch admin stats');
  }
}
