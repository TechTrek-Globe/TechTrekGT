import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

const DEFAULTS = {
  ebay_auto_sync: 0,
  ebay_sync_interval_m: 30,
  vscout_auto_sync: 0,
  vscout_sync_interval_m: 60,
  last_ebay_sync_at: null,
  last_vscout_sync_at: null
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

    const row = await env.DB.prepare(
      'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
    ).bind(userId).first();

    const settings = row ? {
      ebay_auto_sync: row.ebay_auto_sync ?? DEFAULTS.ebay_auto_sync,
      ebay_sync_interval_m: row.ebay_sync_interval_m ?? DEFAULTS.ebay_sync_interval_m,
      vscout_auto_sync: row.vscout_auto_sync ?? DEFAULTS.vscout_auto_sync,
      vscout_sync_interval_m: row.vscout_sync_interval_m ?? DEFAULTS.vscout_sync_interval_m,
      last_ebay_sync_at: row.last_ebay_sync_at ?? null,
      last_vscout_sync_at: row.last_vscout_sync_at ?? null,
      updated_at: row.updated_at ?? null
    } : { ...DEFAULTS };

    return ok({ settings });
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

    let body = {};
    try { body = await request.json(); } catch (_) {}

    const allowed = ['ebay_auto_sync', 'ebay_sync_interval_m', 'vscout_auto_sync', 'vscout_sync_interval_m', 'last_ebay_sync_at', 'last_vscout_sync_at'];
    const patch = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        patch[key] = key.endsWith('_at')
          ? (body[key] ? String(body[key]) : null)
          : Math.max(0, parseInt(body[key], 10) || 0);
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
      last_vscout_sync_at: patch.last_vscout_sync_at !== undefined ? patch.last_vscout_sync_at : (existing.last_vscout_sync_at ?? null)
    };

    await env.DB.prepare(`
      INSERT OR REPLACE INTO outpost_sync_settings
        (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_at, last_vscout_sync_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      merged.user_id,
      merged.ebay_auto_sync,
      merged.ebay_sync_interval_m,
      merged.vscout_auto_sync,
      merged.vscout_sync_interval_m,
      merged.last_ebay_sync_at,
      merged.last_vscout_sync_at
    ).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
    ).bind(userId).first();

    return ok({ settings: updated });
  });
}
