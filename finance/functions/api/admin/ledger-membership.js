import { authenticate, readJson, json, fail, MAX_BODY_AUTH, ERROR_CODES } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';
import { ensureLedgerTables } from '../../utils/ledgerAccess.js';

export async function handleLedgerMembership(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'admin-ledger-membership', 30, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: request.method !== 'GET' });
    if (auth.error) return auth.error;
    const { user: caller } = auth;

    if (String(caller.role || 'user') !== 'admin') {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden: Administrator privileges required', requestId);
    }

    if (!env?.DB) {
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Database binding not available', requestId);
    }

    await ensureLedgerTables(env.DB);

    let body = {};
    if (request.method === 'POST') {
      body = await readJson(request, MAX_BODY_AUTH);
    }

    const url = new URL(request.url);
    const ledgerId = body?.ledgerId || url.searchParams.get('ledgerId') || url.searchParams.get('ledger_id') || caller.id;
    const userId = body?.userId || url.searchParams.get('userId') || url.searchParams.get('user_id');
    const role = body?.role || url.searchParams.get('role');

    if (!userId) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'User ID is required', requestId);
    }

    const targetUser = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(userId).first();
    if (!targetUser) {
      return fail(ERROR_CODES.NOT_FOUND, 404, 'User account not found', requestId);
    }

    const isRemove = request.method === 'DELETE' || request.url.includes('/remove') || role === 'none' || role === 'unaffiliated';

    if (isRemove) {
      await env.DB.prepare(
        'DELETE FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(ledgerId, userId).run();

      return json({
        success: true,
        ledgerId,
        userId,
        role: 'none',
        message: `Removed ${targetUser.email} from ledger collaboration.`
      });
    }

    if (!['viewer', 'editor', 'admin'].includes(role)) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid role. Must be viewer, editor, or admin', requestId);
    }

    // Ensure ledger row exists
    const existingLedger = await env.DB.prepare('SELECT id, name FROM finance_ledgers WHERE id = ?').bind(ledgerId).first();
    if (!existingLedger) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO finance_ledgers (id, owner_id, name) VALUES (?, ?, ?)'
      ).bind(ledgerId, caller.id, 'Household Budget').run();
    }

    const shareId = `shr-${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO ledger_shares (id, ledger_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(ledger_id, user_id) DO UPDATE SET role = excluded.role
    `).bind(shareId, ledgerId, userId, role).run();

    return json({
      success: true,
      ledgerId,
      userId,
      role,
      message: `Associated ${targetUser.email} with ledger as ${role}.`
    });
  } catch (err) {
    console.error('[admin/ledger-membership] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update ledger membership', requestId);
  }
}

