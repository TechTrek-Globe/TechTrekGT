import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/sync/finance - returns realized profit metrics.
 *   Cross-portal Finance bridge is not yet configured; returns bridge_status: 'unavailable'.
 * POST /api/sync/finance - returns honest bridge-unavailable notice with live Outpost metrics.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    // 1. Calculate user's total realized net profit from sales
    const salesSummary = await env.DB.prepare(`
      SELECT
        COUNT(id) AS total_sales_count,
        COALESCE(SUM(gross_sale_price), 0) AS total_gross_revenue,
        COALESCE(SUM(net_profit), 0) AS total_realized_profit,
        COALESCE(SUM(net_proceeds), 0) AS total_net_proceeds
      FROM auction_sales
      WHERE user_id = ?
    `).bind(userId).first();

    // 2. Calculate active capital tied up in inventory
    const inventorySummary = await env.DB.prepare(`
      SELECT
        COUNT(id) AS active_item_count,
        COALESCE(SUM(true_total_cost), 0) AS capital_tied_up
      FROM auction_items
      WHERE user_id = ? AND status IN ('Available', 'Listed')
    `).bind(userId).first();

    return ok({
      metrics: {
        total_sales_count: Number(salesSummary?.total_sales_count || 0),
        total_gross_revenue: Number(salesSummary?.total_gross_revenue || 0),
        total_realized_profit: Number(salesSummary?.total_realized_profit || 0),
        total_net_proceeds: Number(salesSummary?.total_net_proceeds || 0),
        active_item_count: Number(inventorySummary?.active_item_count || 0),
        capital_tied_up: Number(inventorySummary?.capital_tied_up || 0)
      },
      households: [],
      accounts: [],
      bridge_status: 'unavailable',
      bridge_message: 'Cross-portal Finance bridge requires a shared Worker service binding - not yet configured.'
    });
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    // Compute realized net profit for display purposes only - no cross-DB writes
    const salesSummary = await env.DB.prepare(`
      SELECT COALESCE(SUM(net_profit), 0) AS total_realized_profit
      FROM auction_sales
      WHERE user_id = ?
    `).bind(userId).first();

    const netProfit = Number(salesSummary?.total_realized_profit || 0);

    return ok({
      success: false,
      bridge_unavailable: true,
      synced_net_profit: netProfit,
      message: 'Finance account sync is unavailable: the cross-portal database bridge has not been configured. Your metrics above reflect live data from Outpost.'
    });
  });
}

