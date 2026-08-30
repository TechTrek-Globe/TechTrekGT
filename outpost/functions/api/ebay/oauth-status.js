import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/ebay/oauth-status
 *
 * Returns the eBay OAuth connection status for the authenticated user
 * directly from D1 (personal-budget-db).
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const auth = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const row = await env.DB.prepare(
      'SELECT ebay_user_id, scopes, access_token_exp, refresh_token_exp, connected_at, last_refreshed_at FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(auth.userId).first();

    if (!row) return ok({ connected: false });

    const now = Date.now();
    const refreshExpMs = row.refresh_token_exp ? new Date(row.refresh_token_exp).getTime() : 0;
    const daysUntilExpiry = refreshExpMs ? Math.floor((refreshExpMs - now) / (1000 * 60 * 60 * 24)) : 0;

    return ok({
      connected: true,
      ebay_user_id: row.ebay_user_id,
      scopes: row.scopes,
      access_token_exp: row.access_token_exp,
      refresh_token_exp: row.refresh_token_exp,
      connected_at: row.connected_at,
      last_refreshed_at: row.last_refreshed_at,
      days_until_expiry: daysUntilExpiry,
      expiry_warning: daysUntilExpiry < 30,
      scope_flags: {
        has_sell_inventory: (row.scopes || '').includes('sell.inventory.readonly'),
        has_sell_finances: (row.scopes || '').includes('sell.finances'),
        has_sell_fulfillment: (row.scopes || '').includes('sell.fulfillment.readonly')
      }
    });
  });
}
