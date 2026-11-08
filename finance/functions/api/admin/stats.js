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

    // Authorization comes from the database role column
    if (String(user.role || 'user') !== 'admin') {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden');
    }

    if (!env?.DB) {
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Database binding not available');
    }

    // 1. Fetch all users
    let usersResult = { results: [] };
    try {
      usersResult = await env.DB.prepare(
        'SELECT id, email, name, status, role, is_admin, email_verified, email_verified_at, created_at, created_app FROM users ORDER BY created_at ASC LIMIT 1000'
      ).all();
    } catch {
      // Fallback if created_app column not present in legacy test fixtures
      usersResult = await env.DB.prepare(
        'SELECT id, email, name, status, role, is_admin, email_verified, email_verified_at, created_at FROM users ORDER BY created_at ASC LIMIT 1000'
      ).all();
    }

    // 2. Fetch backups and historical versions
    const backupsResult = await env.DB.prepare('SELECT id, updated_at FROM user_backups LIMIT 1000').all();

    let versionsResult = { results: [] };
    try {
      versionsResult = await env.DB.prepare(
        'SELECT user_id, COUNT(*) as count, MAX(saved_at) as last_saved FROM user_backup_versions GROUP BY user_id LIMIT ?'
      ).bind(1000).all();
    } catch {
      // Fallback if table not present
    }

    const backupMap = {};
    for (const row of backupsResult.results || []) {
      backupMap[row.id] = { backupCount: 1, lastBackupAt: row.updated_at };
    }

    for (const row of versionsResult.results || []) {
      const uid = row.user_id;
      const count = Number(row.count) || 0;
      const versionLastSaved = row.last_saved ? new Date(Number(row.last_saved)).toISOString() : null;
      if (!backupMap[uid]) {
        backupMap[uid] = {
          backupCount: count,
          lastBackupAt: versionLastSaved
        };
      } else {
        backupMap[uid].backupCount += count;
        if (versionLastSaved) {
          if (!backupMap[uid].lastBackupAt || new Date(versionLastSaved) > new Date(backupMap[uid].lastBackupAt)) {
            backupMap[uid].lastBackupAt = versionLastSaved;
          }
        }
      }
    }

    // 3. Fetch finance ledgers, collaborator shares, and invites (strictly read-only on GET)
    let financeLedgers = [];
    let ledgerShares = [];
    let ledgerInvites = [];
    try {
      const lRes = await env.DB.prepare('SELECT id, owner_id, name, created_at FROM finance_ledgers').all();
      financeLedgers = lRes.results || [];

      const sRes = await env.DB.prepare(`
        SELECT s.id, s.ledger_id, s.user_id, s.role, s.created_at, u.email, u.name
        FROM ledger_shares s
        LEFT JOIN users u ON u.id = s.user_id
      `).all();
      ledgerShares = sRes.results || [];

      const iRes = await env.DB.prepare(`
        SELECT id, ledger_id, invited_email, role, status, created_at, expires_at
        FROM ledger_invites WHERE status = 'pending'
      `).all();
      ledgerInvites = iRes.results || [];
    } catch (collErr) {
      console.warn('[admin/stats] collaboration query fallback:', collErr && collErr.message);
    }

    const existingLedgerIds = new Set(financeLedgers.map(l => l.id));
    for (const u of usersResult.results || []) {
      const hasBackup = Boolean(backupMap[u.id]?.backupCount > 0);
      const isFinUser = hasBackup || u.created_app === 'finance' || String(u.role || '') === 'admin';
      if (isFinUser && !existingLedgerIds.has(u.id)) {
        existingLedgerIds.add(u.id);
        financeLedgers.push({
          id: u.id,
          owner_id: u.id,
          name: u.name ? `${u.name}'s Budget` : 'Personal Budget',
          created_at: u.created_at
        });
      }
    }

    // 4. Build sets of Finance-associated users
    const financeUserIds = new Set();
    for (const row of backupsResult.results || []) financeUserIds.add(row.id);
    for (const l of financeLedgers) financeUserIds.add(l.owner_id);
    for (const s of ledgerShares) financeUserIds.add(s.user_id);

    // Map strictly Finance users (ignore any user belonging to other platforms)
    const financeUsers = [];
    for (const u of usersResult.results || []) {
      const backupCount = backupMap[u.id]?.backupCount ?? 0;
      const isFinance = financeUserIds.has(u.id) || u.created_app === 'finance' || backupCount > 0 || String(u.role || '') === 'admin';

      // Skip non-Finance users completely
      if (!isFinance) continue;

      const lastBackupAt = backupMap[u.id]?.lastBackupAt ?? null;
      const userShares = ledgerShares.filter(s => s.user_id === u.id);

      financeUsers.push({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status || 'Active',
        role: u.role || 'user',
        isAdmin: Boolean(u.is_admin === 1 || u.role === 'admin'),
        emailVerified: Number(u.email_verified) === 1 || Boolean(u.email_verified_at),
        createdAt: u.created_at,
        createdApp: u.created_app || null,
        backupCount,
        lastBackupAt,
        shares: userShares.map(s => ({ ledgerId: s.ledger_id, role: s.role, shareId: s.id }))
      });
    }

    // 5. Map Ledgers for collaboration management
    const ledgers = financeLedgers.map(l => {
      const owner = financeUsers.find(u => u.id === l.owner_id);
      const collaborators = ledgerShares
        .filter(s => s.ledger_id === l.id && s.user_id !== l.owner_id)
        .map(s => ({
          shareId: s.id,
          userId: s.user_id,
          email: s.email,
          name: s.name,
          role: s.role,
          createdAt: s.created_at
        }));
      const pendingInvites = ledgerInvites
        .filter(i => i.ledger_id === l.id)
        .map(i => ({
          id: i.id,
          invitedEmail: i.invited_email,
          role: i.role,
          status: i.status,
          createdAt: i.created_at,
          expiresAt: i.expires_at
        }));

      return {
        id: l.id,
        name: l.name,
        ownerId: l.owner_id,
        ownerName: owner?.name || owner?.email || 'Ledger Owner',
        ownerEmail: owner?.email,
        collaborators,
        pendingInvites
      };
    });

    const activeCount = financeUsers.filter(u => (u.status || 'Active') === 'Active').length;
    const lockedCount = financeUsers.filter(u => u.status === 'Locked' || u.status === 'Suspended').length;
    const backedUpCount = financeUsers.filter(u => u.backupCount > 0).length;

    return json({
      totalUsers: financeUsers.length,
      financeCount: financeUsers.length,
      activeCount,
      lockedCount,
      backedUpCount,
      // Strict Finance-only accounts list
      users: financeUsers,
      financeUsers,
      otherUsers: [],
      allUsers: financeUsers,
      ledgers
    });
  } catch (err) {
    console.error('[admin/stats] query error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to fetch admin stats');
  }
}
