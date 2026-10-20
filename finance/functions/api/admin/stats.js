import { authenticate, json, fail, ERROR_CODES } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestGet(context) {
  const { env } = context;

  const limited = await enforceRateLimit(context, 'admin-stats', 30, 60);
  if (limited) return limited;

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
    const backupsResult = await env.DB.prepare('SELECT id, updated_at FROM user_backups LIMIT 1000').all();

    let versionsResult = { results: [] };
    try {
      versionsResult = await env.DB.prepare(
        'SELECT user_id, COUNT(*) as count, MAX(saved_at) as last_saved FROM user_backup_versions GROUP BY user_id LIMIT ?'
      ).bind(1000).all();
    } catch {
      // Fallback if table not present in test runner
    }

    const backupMap = {};
    for (const row of backupsResult.results || []) {
      backupMap[row.id] = { backupCount: 1, lastBackupAt: row.updated_at };
    }

    for (const row of versionsResult.results || []) {
      const uid = row.user_id;
      const count = Number(row.count) || 0;
      if (!backupMap[uid]) {
        backupMap[uid] = {
          backupCount: count,
          lastBackupAt: row.last_saved ? new Date(Number(row.last_saved)).toISOString() : null
        };
      } else {
        backupMap[uid].backupCount = count;
      }
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
