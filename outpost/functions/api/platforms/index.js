import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { validateNonNegativeMoney, validatePercentage } from '../../utils/auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  ITEM_STATUSES
} from '../../utils/constants.js';
import { DEFAULT_PLATFORMS } from '../../utils/platforms.js';

export {
  DEFAULT_PLATFORMS,
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  ITEM_STATUSES
};

/**
 * GET /api/platforms - list platforms for current user
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    let rows = await env.DB.prepare(
      'SELECT * FROM auction_platforms WHERE user_id = ? ORDER BY is_default DESC, name ASC'
    ).bind(userId).all();

    // Auto-seed default platforms if user has none
    if (!rows.results || rows.results.length === 0) {
      for (const p of DEFAULT_PLATFORMS) {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, userId, p.name, p.fee_pct, p.flat_fee, p.notes, p.is_default).run();
      }
      rows = await env.DB.prepare(
        'SELECT * FROM auction_platforms WHERE user_id = ? ORDER BY is_default DESC, name ASC'
      ).bind(userId).all();
    }

    return ok({ platforms: rows.results || [] });
  });
}

/**
 * POST /api/platforms - create custom platform or action ('reset')
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));

    // Reset to defaults action
    if (body.action === 'reset_defaults') {
      await env.DB.prepare('DELETE FROM auction_platforms WHERE user_id = ?').bind(userId).run();
      for (const p of DEFAULT_PLATFORMS) {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, userId, p.name, p.fee_pct, p.flat_fee, p.notes, p.is_default).run();
      }
      const rows = await env.DB.prepare(
        'SELECT * FROM auction_platforms WHERE user_id = ? ORDER BY is_default DESC, name ASC'
      ).bind(userId).all();
      return ok({ platforms: rows.results || [], message: 'Reset to default platform fees' });
    }

    const { name, fee_pct = 0, flat_fee = 0, notes = '', is_default = 0 } = body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return err('Platform name is required');
    }

    let parsedFeePct;
    let parsedFlatFee;
    try {
      // T-10 item 7: fee_pct is a FRACTION in [0,1); flat_fee is bounded.
      parsedFeePct = validatePercentage(fee_pct, 'fee_pct') ?? 0;
      parsedFlatFee = validateNonNegativeMoney(flat_fee, 'flat_fee', 1000) ?? 0;
    } catch (e) {
      return err(e.message, 400);
    }

    // If marked default, unset other defaults
    if (is_default) {
      await env.DB.prepare('UPDATE auction_platforms SET is_default = 0 WHERE user_id = ?').bind(userId).run();
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, name.trim(), parsedFeePct, parsedFlatFee, notes.trim(), is_default ? 1 : 0).run();

    const created = await env.DB.prepare('SELECT * FROM auction_platforms WHERE id = ?').bind(id).first();
    return ok({ platform: created }, 201);
  });
}
