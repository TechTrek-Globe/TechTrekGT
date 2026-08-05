import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

export const DEFAULT_PLATFORMS = [
  { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40, notes: '13.6% final value fee + $0.40 per order (avg)', is_default: 1 },
  { name: 'eBay (Promoted 2%)', fee_pct: 0.156, flat_fee: 0.40, notes: 'FVF + 2% promoted listing rate', is_default: 0 },
  { name: 'eBay (Promoted 5%)', fee_pct: 0.186, flat_fee: 0.40, notes: 'FVF + 5% promoted listing rate', is_default: 0 },
  { name: 'Facebook Marketplace (Local)', fee_pct: 0, flat_fee: 0, notes: 'No fees for local pickup', is_default: 0 },
  { name: 'Facebook Marketplace (Shipped)', fee_pct: 0.05, flat_fee: 0, notes: '5% seller fee on shipped orders', is_default: 0 },
  { name: 'OfferUp', fee_pct: 0.129, flat_fee: 0, notes: '12.9% on shipped orders', is_default: 0 },
  { name: 'Mercari', fee_pct: 0.10, flat_fee: 0, notes: '10% seller fee + payment processing', is_default: 0 },
  { name: 'Whatnot (Live)', fee_pct: 0.08, flat_fee: 0.30, notes: '8% + $0.30, live auction platform', is_default: 0 },
  { name: 'COMC', fee_pct: 0.20, flat_fee: 0, notes: 'Consignment ~20% depending on tier', is_default: 0 },
  { name: 'PWCC', fee_pct: 0.20, flat_fee: 0, notes: 'Vault/consignment ~20%', is_default: 0 },
  { name: 'Craigslist', fee_pct: 0, flat_fee: 0, notes: 'No fees - local only', is_default: 0 },
  { name: 'Other', fee_pct: 0, flat_fee: 0, notes: 'Custom', is_default: 0 },
];

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

    // If marked default, unset other defaults
    if (is_default) {
      await env.DB.prepare('UPDATE auction_platforms SET is_default = 0 WHERE user_id = ?').bind(userId).run();
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee, notes, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, name.trim(), Number(fee_pct) || 0, Number(flat_fee) || 0, notes.trim(), is_default ? 1 : 0).run();

    const created = await env.DB.prepare('SELECT * FROM auction_platforms WHERE id = ?').bind(id).first();
    return ok({ platform: created }, 201);
  });
}
