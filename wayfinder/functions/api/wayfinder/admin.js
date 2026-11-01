// TechTrek Wayfinder - System Administration & Account Governance Handler
// Handles user account listing, statistics, API key entitlement management, and account status updates.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Validates whether the caller possesses administrator privileges.
 */
async function verifyAdminCaller(env, user) {
  if (!user || !user.userId) return false;
  if (user.isAdmin === true || user.role === 'admin') return true;

  if (env.DB) {
    try {
      const dbUser = await env.DB.prepare(
        'SELECT role, is_admin FROM users WHERE id = ?'
      ).bind(user.userId).first();
      return Boolean(dbUser && (dbUser.role === 'admin' || dbUser.is_admin === 1));
    } catch {
      return false;
    }
  }

  return false;
}

export async function handleAdmin(context, url, method) {
  const { env, user, request } = context;

  if (!env.DB) {
    return json({ error: 'Database service is unavailable' }, 503);
  }

  const isAdmin = await verifyAdminCaller(env, user);
  if (!isAdmin) {
    return json({ error: 'Forbidden: Administrator privileges required' }, 403);
  }

  const pathname = url.pathname;

  // GET /api/admin/stats or /api/wayfinder/admin/stats
  if (method === 'GET' && (pathname.endsWith('/stats') || pathname.endsWith('/stats/'))) {
    try {
      const usersResult = await env.DB.prepare(
        'SELECT id, email, name, status, role, is_admin, api_key_enabled, created_at FROM users ORDER BY created_at ASC LIMIT 1000'
      ).all();

      const allUsers = usersResult.results || [];

      // Query document counts per user
      let docCountMap = {};
      try {
        const docCounts = await env.DB.prepare(
          'SELECT user_id, COUNT(*) as doc_count FROM wayfinder_documents WHERE deleted_at IS NULL GROUP BY user_id'
        ).all();
        for (const row of docCounts.results || []) {
          docCountMap[row.user_id] = Number(row.doc_count) || 0;
        }
      } catch {
        // Fallback if table not queried
      }

      // Query general system activity metrics
      let totalJourneys = 0;
      let totalDocuments = 0;
      let totalItineraryItems = 0;
      try {
        const jCount = await env.DB.prepare('SELECT COUNT(*) as c FROM wayfinder_journeys').first();
        totalJourneys = Number(jCount?.c) || 0;
        const dCount = await env.DB.prepare('SELECT COUNT(*) as c FROM wayfinder_documents WHERE deleted_at IS NULL').first();
        totalDocuments = Number(dCount?.c) || 0;
        const iCount = await env.DB.prepare('SELECT COUNT(*) as c FROM wayfinder_itinerary_items').first();
        totalItineraryItems = Number(iCount?.c) || 0;
      } catch {
        // Fallback for metric counters
      }

      const users = allUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status || 'Active',
        role: u.role || 'user',
        isAdmin: Boolean(u.is_admin === 1 || u.role === 'admin'),
        apiKeyEnabled: Boolean(u.api_key_enabled === 1 || u.is_admin === 1 || u.role === 'admin'),
        createdAt: u.created_at,
        documentCount: docCountMap[u.id] || 0
      }));

      const activeCount = users.filter(u => u.status === 'Active').length;
      const suspendedCount = users.filter(u => u.status === 'Suspended').length;
      const apiKeyEnabledCount = users.filter(u => u.apiKeyEnabled).length;

      return json({
        totalUsers: users.length,
        activeCount,
        suspendedCount,
        apiKeyEnabledCount,
        stats: {
          totalJourneys,
          totalDocuments,
          totalItineraryItems
        },
        users
      });
    } catch (err) {
      console.error('[admin/stats] error:', err);
      return json({ error: 'Failed to retrieve administrative statistics' }, 500);
    }
  }

  // POST /api/admin/user-api-access or /api/wayfinder/admin/user-api-access
  if (method === 'POST' && pathname.includes('/user-api-access')) {
    try {
      const body = await request.json().catch(() => ({}));
      const { userId, enabled } = body;

      if (!userId || typeof userId !== 'string') {
        return json({ error: 'User ID is required' }, 400);
      }

      if (typeof enabled !== 'boolean') {
        return json({ error: 'Enabled flag must be a boolean' }, 400);
      }

      const targetUser = await env.DB.prepare(
        'SELECT id, email, role, is_admin FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!targetUser) {
        return json({ error: 'User account not found' }, 404);
      }

      const newFlag = enabled ? 1 : 0;
      await env.DB.prepare(
        'UPDATE users SET api_key_enabled = ? WHERE id = ?'
      ).bind(newFlag, userId).run();

      return json({
        success: true,
        userId,
        apiKeyEnabled: Boolean(enabled),
        message: `API Key access ${enabled ? 'enabled' : 'disabled'} for account ${targetUser.email}.`
      });
    } catch (err) {
      console.error('[admin/user-api-access] error:', err);
      return json({ error: 'Failed to update user API Key entitlement' }, 500);
    }
  }

  // POST /api/admin/user-status or /api/wayfinder/admin/user-status
  if (method === 'POST' && pathname.includes('/user-status')) {
    try {
      const body = await request.json().catch(() => ({}));
      const { userId, status } = body;

      if (!userId || typeof userId !== 'string') {
        return json({ error: 'User ID is required' }, 400);
      }

      if (status !== 'Active' && status !== 'Suspended') {
        return json({ error: 'Status must be either Active or Suspended' }, 400);
      }

      if (userId === user.userId && status === 'Suspended') {
        return json({ error: 'Cannot suspend your own account' }, 400);
      }

      const targetUser = await env.DB.prepare(
        'SELECT id, email, token_version FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!targetUser) {
        return json({ error: 'User account not found' }, 404);
      }

      const currentTv = Number(targetUser.token_version || 0);
      const newTv = status === 'Suspended' ? currentTv + 1 : currentTv;

      await env.DB.prepare(
        'UPDATE users SET status = ?, token_version = ? WHERE id = ?'
      ).bind(status, newTv, userId).run();

      return json({
        success: true,
        userId,
        status,
        message: `Account status updated to ${status} for ${targetUser.email}.`
      });
    } catch (err) {
      console.error('[admin/user-status] error:', err);
      return json({ error: 'Failed to update user account status' }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
}
