import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { ensureSyncHistoryTable } from '../../utils/syncLogger.js';

const DEFAULTS = {
  ebay_auto_sync: 0,
  ebay_sync_interval_m: 30,
  vscout_auto_sync: 0,
  vscout_sync_interval_m: 60,
  last_ebay_sync_at: null,
  last_vscout_sync_at: null,
  last_ebay_sync_status: null,
  last_ebay_sync_error: null,
  last_vscout_sync_status: null,
  last_vscout_sync_error: null
};

/**
 * GET /api/sync/settings
 * Returns the user sync automation preferences.
 * If no row exists, returns defaults without writing.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    await ensureSyncHistoryTable(env.DB);

    const row = await env.DB.prepare(
      'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
    ).bind(userId).first();

    const historyRows = await env.DB.prepare(
      'SELECT * FROM outpost_sync_history WHERE user_id = ? ORDER BY started_at DESC LIMIT 10'
    ).bind(userId).all().catch(() => ({ results: [] }));

    const settings = row ? {
      ebay_auto_sync: row.ebay_auto_sync ?? DEFAULTS.ebay_auto_sync,
      ebay_sync_interval_m: row.ebay_sync_interval_m ?? DEFAULTS.ebay_sync_interval_m,
      vscout_auto_sync: row.vscout_auto_sync ?? DEFAULTS.vscout_auto_sync,
      vscout_sync_interval_m: row.vscout_sync_interval_m ?? DEFAULTS.vscout_sync_interval_m,
      last_ebay_sync_at: row.last_ebay_sync_at ?? null,
      last_vscout_sync_at: row.last_vscout_sync_at ?? null,
      last_ebay_sync_status: row.last_ebay_sync_status ?? null,
      last_ebay_sync_error: row.last_ebay_sync_error ?? null,
      last_vscout_sync_status: row.last_vscout_sync_status ?? null,
      last_vscout_sync_error: row.last_vscout_sync_error ?? null,
      updated_at: row.updated_at ?? null
    } : { ...DEFAULTS };

    return ok({ settings, sync_history: historyRows.results || [] });
  });
}

/**
 * PUT /api/sync/settings
 * Upserts the user sync automation preferences.
 * Accepts a partial body; unspecified fields are preserved via merge-before-replace.
 */
export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    await ensureSyncHistoryTable(env.DB);

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const allowed = [
      'ebay_auto_sync', 'ebay_sync_interval_m',
      'vscout_auto_sync', 'vscout_sync_interval_m',
      'last_ebay_sync_at', 'last_vscout_sync_at',
      'last_ebay_sync_status', 'last_ebay_sync_error',
      'last_vscout_sync_status', 'last_vscout_sync_error'
    ];
    const patch = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key.endsWith('_at') || key.endsWith('_status') || key.endsWith('_error')) {
          patch[key] = body[key] ? String(body[key]) : null;
        } else {
          patch[key] = Math.max(0, parseInt(body[key], 10) || 0);
        }
      }
    }

    const existing = await env.DB.prepare(
      'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
    ).bind(userId).first() || {};

    const merged = {
      user_id: userId,
      ebay_auto_sync: patch.ebay_auto_sync ?? existing.ebay_auto_sync ?? DEFAULTS.ebay_auto_sync,
      ebay_sync_interval_m: patch.ebay_sync_interval_m ?? existing.ebay_sync_interval_m ?? DEFAULTS.ebay_sync_interval_m,
      vscout_auto_sync: patch.vscout_auto_sync ?? existing.vscout_auto_sync ?? DEFAULTS.vscout_auto_sync,
      vscout_sync_interval_m: patch.vscout_sync_interval_m ?? existing.vscout_sync_interval_m ?? DEFAULTS.vscout_sync_interval_m,
      last_ebay_sync_at: patch.last_ebay_sync_at !== undefined ? patch.last_ebay_sync_at : (existing.last_ebay_sync_at ?? null),
      last_vscout_sync_at: patch.last_vscout_sync_at !== undefined ? patch.last_vscout_sync_at : (existing.last_vscout_sync_at ?? null),
      last_ebay_sync_status: patch.last_ebay_sync_status !== undefined ? patch.last_ebay_sync_status : (existing.last_ebay_sync_status ?? null),
      last_ebay_sync_error: patch.last_ebay_sync_error !== undefined ? patch.last_ebay_sync_error : (existing.last_ebay_sync_error ?? null),
      last_vscout_sync_status: patch.last_vscout_sync_status !== undefined ? patch.last_vscout_sync_status : (existing.last_vscout_sync_status ?? null),
      last_vscout_sync_error: patch.last_vscout_sync_error !== undefined ? patch.last_vscout_sync_error : (existing.last_vscout_sync_error ?? null)
    };

    await env.DB.prepare(`
      INSERT OR REPLACE INTO outpost_sync_settings
        (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_at, last_vscout_sync_at, last_ebay_sync_status, last_ebay_sync_error, last_vscout_sync_status, last_vscout_sync_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      merged.user_id,
      merged.ebay_auto_sync,
      merged.ebay_sync_interval_m,
      merged.vscout_auto_sync,
      merged.vscout_sync_interval_m,
      merged.last_ebay_sync_at,
      merged.last_vscout_sync_at,
      merged.last_ebay_sync_status,
      merged.last_ebay_sync_error,
      merged.last_vscout_sync_status,
      merged.last_vscout_sync_error
    ).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
    ).bind(userId).first();

    return ok({ settings: updated });
  });
}
