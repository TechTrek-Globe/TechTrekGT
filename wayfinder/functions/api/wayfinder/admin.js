// TechTrek Wayfinder - System Administration & Account Governance Handler
// Handles user account listing, statistics, API key entitlement management, and account status updates.
import { isPlatformAdmin } from '../../utils/agendaAccess.js';
import { deleteUserAccount } from '../../utils/deleteAccount.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/**
 * Validates whether the caller possesses administrator privileges.
 */
async function verifyAdminCaller(env, user) {
  return isPlatformAdmin(env, user);
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

      // Query journeys, shares, and invites to map collaborative trip groups
      let journeys = [];
      let shares = [];
      let invites = [];
      try {
        const jRes = await env.DB.prepare(
          'SELECT id, slug, title, visibility, created_by, created_at FROM wayfinder_journeys ORDER BY created_at ASC'
        ).all();
        journeys = jRes.results || [];

        const sRes = await env.DB.prepare(
          `SELECT s.id, s.agenda_id, s.user_id, s.role, s.created_at, u.email, u.name
           FROM wayfinder_agenda_shares s
           LEFT JOIN users u ON u.id = s.user_id`
        ).all();
        shares = sRes.results || [];

        const invRes = await env.DB.prepare(
          `SELECT id, agenda_id, invited_email, role, status, created_at, expires_at
           FROM wayfinder_agenda_invites
           WHERE status = 'pending'
           ORDER BY created_at DESC`
        ).all();
        invites = invRes.results || [];
      } catch (collErr) {
        console.warn('[admin/stats] collaboration query fallback:', collErr?.message);
      }

      // Build trip collaborator groups
      const trips = journeys.map(j => {
        const tripOwner = allUsers.find(u => u.id === j.created_by);
        const tripCollaborators = shares
          .filter(s => s.agenda_id === j.id && s.user_id !== j.created_by)
          .map(s => ({
            shareId: s.id,
            userId: s.user_id,
            email: s.email,
            name: s.name,
            role: s.role,
            createdAt: s.created_at
          }));
        const tripInvites = invites
          .filter(inv => inv.agenda_id === j.id)
          .map(inv => ({
            id: inv.id,
            invitedEmail: inv.invited_email,
            role: inv.role,
            status: inv.status,
            createdAt: inv.created_at,
            expiresAt: inv.expires_at
          }));
        const tiedUserIds = new Set([
          j.created_by,
          ...tripCollaborators.map(c => c.userId)
        ]);
        const unaffiliatedUsers = allUsers
          .filter(u => !tiedUserIds.has(u.id))
          .map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role
          }));

        return {
          id: j.id,
          slug: j.slug,
          title: j.title || 'Poland Christmas 2026',
          visibility: j.visibility,
          createdBy: j.created_by,
          owner: tripOwner ? { id: tripOwner.id, email: tripOwner.email, name: tripOwner.name } : null,
          collaborators: tripCollaborators,
          pendingInvites: tripInvites,
          unaffiliatedUsers
        };
      });

      const users = allUsers.map(u => {
        const userTripShares = shares.filter(s => s.user_id === u.id);
        const tripRoles = {};
        for (const s of userTripShares) {
          tripRoles[s.agenda_id] = { role: s.role, shareId: s.id };
        }
        for (const j of journeys) {
          if (j.created_by === u.id) {
            tripRoles[j.id] = { role: 'owner', shareId: null };
          }
        }
        const polandRole = tripRoles['poland-christmas-2026']?.role || 'none';

        return {
          id: u.id,
          email: u.email,
          name: u.name,
          status: u.status || 'Active',
          role: u.role || 'user',
          isAdmin: Boolean(u.is_admin === 1 || u.role === 'admin'),
          apiKeyEnabled: Boolean(u.api_key_enabled === 1 || u.is_admin === 1 || u.role === 'admin'),
          createdAt: u.created_at,
          documentCount: docCountMap[u.id] || 0,
          tripRoles,
          polandRole
        };
      });

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
        trips,
        journeys,
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

  // POST /api/admin/trip-membership or /api/wayfinder/admin/trip-membership (Tie account or update role)
  if (method === 'POST' && pathname.includes('/trip-membership') && !pathname.includes('/remove')) {
    try {
      const body = await request.json().catch(() => ({}));
      const { agendaId = 'poland-christmas-2026', userId, role } = body;

      if (!userId || !role) {
        return json({ error: 'User ID and collaborator role are required' }, 400);
      }

      if (!['viewer', 'editor', 'admin', 'none', 'unaffiliated'].includes(role)) {
        return json({ error: 'Invalid role. Must be viewer, editor, admin, or none' }, 400);
      }

      const targetUser = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(userId).first();
      if (!targetUser) return json({ error: 'User not found' }, 404);

      const journey = await env.DB.prepare(
        'SELECT id, title, created_by FROM wayfinder_journeys WHERE id = ? OR slug = ?'
      ).bind(agendaId, agendaId).first();
      if (!journey) return json({ error: 'Trip journey not found' }, 404);

      if (journey.created_by === userId) {
        return json({ error: 'Cannot modify permissions of the trip owner' }, 400);
      }

      if (role === 'none' || role === 'unaffiliated') {
        const auditId = crypto.randomUUID();
        await env.DB.batch([
          env.DB.prepare(
            'DELETE FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?'
          ).bind(journey.id, userId),
          env.DB.prepare(`
            INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, target_user_id, target_email, new_value, metadata_summary, details)
            VALUES (?, ?, ?, 'share', ?, 'admin_unaffiliate_trip_user', ?, ?, 'none', ?, ?)
          `).bind(auditId, user.userId, journey.id, userId, userId, targetUser.email, `unaffiliatedEmail=${targetUser.email}`, JSON.stringify({ unaffiliatedEmail: targetUser.email }))
        ]);

        return json({
          success: true,
          agendaId: journey.id,
          userId,
          role: 'none',
          message: `Moved ${targetUser.email} back to unaffiliated for "${journey.title}".`
        });
      }

      const shareId = crypto.randomUUID();
      const auditId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO wayfinder_agenda_shares (id, agenda_id, user_id, role, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(agenda_id, user_id) DO UPDATE SET role = excluded.role
        `).bind(shareId, journey.id, userId, role),
        env.DB.prepare(`
          INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, target_user_id, target_email, new_value, metadata_summary, details)
          VALUES (?, ?, ?, 'share', ?, 'admin_assign_trip_role', ?, ?, ?, ?, ?)
        `).bind(auditId, user.userId, journey.id, userId, userId, targetUser.email, role, `assignedRole=${role}; targetEmail=${targetUser.email}`, JSON.stringify({ assignedRole: role, targetEmail: targetUser.email }))
      ]);

      return json({
        success: true,
        agendaId: journey.id,
        userId,
        role,
        message: `Updated permissions to "${role}" for ${targetUser.email} on "${journey.title}".`
      });
    } catch (err) {
      console.error('[admin/trip-membership] error:', err);
      return json({ error: 'Failed to update trip collaborator membership' }, 500);
    }
  }

  // DELETE or POST remove /api/admin/trip-membership (Disconnect account from trip)
  if ((method === 'DELETE' && pathname.includes('/trip-membership')) || (method === 'POST' && pathname.includes('/trip-membership/remove'))) {
    try {
      let agendaId = url.searchParams.get('agenda_id') || url.searchParams.get('agendaId') || 'poland-christmas-2026';
      let userId = url.searchParams.get('user_id') || url.searchParams.get('userId');

      if (!userId && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (body.agendaId) agendaId = body.agendaId;
        if (body.userId) userId = body.userId;
      }

      if (!userId) {
        return json({ error: 'User ID is required' }, 400);
      }

      const journey = await env.DB.prepare(
        'SELECT id, title, created_by FROM wayfinder_journeys WHERE id = ? OR slug = ?'
      ).bind(agendaId, agendaId).first();
      if (!journey) return json({ error: 'Trip journey not found' }, 404);

      if (journey.created_by === userId) {
        return json({ error: 'Cannot disconnect the trip owner' }, 400);
      }

      const targetUser = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();

      const auditId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          'DELETE FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?'
        ).bind(journey.id, userId),
        env.DB.prepare(`
          INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, target_user_id, target_email, new_value, metadata_summary, details)
          VALUES (?, ?, ?, 'share', ?, 'admin_remove_trip_share', ?, ?, 'removed', ?, ?)
        `).bind(auditId, user.userId, journey.id, userId, userId, targetUser?.email || null, `removedEmail=${targetUser?.email || userId}`, JSON.stringify({ removedEmail: targetUser?.email }))
      ]);

      return json({
        success: true,
        agendaId: journey.id,
        userId,
        message: `Disconnected ${targetUser?.email || userId} from "${journey.title}".`
      });
    } catch (err) {
      console.error('[admin/trip-membership/remove] error:', err);
      return json({ error: 'Failed to remove user from trip' }, 500);
    }
  }

  // POST /api/admin/user-role or /api/wayfinder/admin/user-role (Platform role change: admin vs user)
  if (method === 'POST' && pathname.includes('/user-role')) {
    try {
      const body = await request.json().catch(() => ({}));
      const { userId, role } = body;

      if (!userId || !role) {
        return json({ error: 'User ID and role are required' }, 400);
      }

      if (role !== 'admin' && role !== 'user') {
        return json({ error: 'Role must be "admin" or "user"' }, 400);
      }

      if (userId === user.userId && role !== 'admin') {
        return json({ error: 'Cannot demote your own account' }, 400);
      }

      const targetUser = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(userId).first();
      if (!targetUser) return json({ error: 'User account not found' }, 404);

      const isAdminVal = role === 'admin' ? 1 : 0;
      await env.DB.prepare(
        'UPDATE users SET role = ?, is_admin = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
      ).bind(role, isAdminVal, userId).run();

      return json({
        success: true,
        userId,
        role,
        isAdmin: Boolean(isAdminVal),
        message: `Platform role updated to "${role.toUpperCase()}" for ${targetUser.email}.`
      });
    } catch (err) {
      console.error('[admin/user-role] error:', err);
      return json({ error: 'Failed to update platform role' }, 500);
    }
  }

  // POST /api/admin/user-delete or DELETE /api/admin/user
  if ((method === 'POST' && pathname.includes('/user-delete')) || (method === 'DELETE' && pathname.endsWith('/user'))) {
    try {
      let targetUserId;
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        targetUserId = body.userId;
      } else {
        targetUserId = url.searchParams.get('userId') || url.searchParams.get('user_id');
      }

      if (!targetUserId || typeof targetUserId !== 'string') {
        return json({ error: 'User ID is required' }, 400);
      }

      const result = await deleteUserAccount(env.DB, targetUserId, user.userId);
      if (!result.ok) {
        return json({ error: result.error || 'Failed to delete user account' }, result.status || 500);
      }

      const isSelf = targetUserId === user.userId;
      const extraHeaders = isSelf ? {
        'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
      } : {};

      return json({
        success: true,
        userId: targetUserId,
        isSelf,
        message: isSelf
          ? 'Your administrator account has been permanently deleted.'
          : `Account for ${result.email} has been permanently deleted.`
      }, 200, extraHeaders);
    } catch (err) {
      console.error('[admin/user-delete] error:', err);
      return json({ error: 'Failed to delete user account' }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
}
