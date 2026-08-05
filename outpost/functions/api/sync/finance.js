import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/sync/finance - returns realized profit metrics and household accounts
 * POST /api/sync/finance - synchronizes auction sales profit to TechTrek Finance account
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

    // 3. Find user's households and accounts in TechTrek Finance
    let households = [];
    let accounts = [];
    try {
      const hhRows = await env.DB.prepare(`
        SELECT h.id, h.name
        FROM households h
        JOIN household_members hm ON hm.household_id = h.id
        WHERE hm.user_id = ?
      `).bind(userId).all();
      households = hhRows.results || [];

      if (households.length > 0) {
        const hhId = households[0].id;
        const accRows = await env.DB.prepare(`
          SELECT id, name, type, starting_balance, color
          FROM accounts
          WHERE household_id = ?
        `).bind(hhId).all();
        accounts = accRows.results || [];
      }
    } catch {
      // Table might not exist or user has no household yet
    }

    return ok({
      metrics: {
        total_sales_count: Number(salesSummary?.total_sales_count || 0),
        total_gross_revenue: Number(salesSummary?.total_gross_revenue || 0),
        total_realized_profit: Number(salesSummary?.total_realized_profit || 0),
        total_net_proceeds: Number(salesSummary?.total_net_proceeds || 0),
        active_item_count: Number(inventorySummary?.active_item_count || 0),
        capital_tied_up: Number(inventorySummary?.capital_tied_up || 0)
      },
      households,
      accounts
    });
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const body = await request.json().catch(() => ({}));
    const { accountId, householdId, accountName = 'TechTrek Outpost Proceeds' } = body;

    // Compute realized net proceeds
    const salesSummary = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(net_profit), 0) AS total_realized_profit,
        COALESCE(SUM(net_proceeds), 0) AS total_net_proceeds
      FROM auction_sales
      WHERE user_id = ?
    `).bind(userId).first();

    const netProfit = Number(salesSummary?.total_realized_profit || 0);

    let targetAccountId = accountId;

    // If no account specified, find or create "TechTrek Outpost Proceeds" in user's household
    if (!targetAccountId) {
      let hhId = householdId;
      if (!hhId) {
        const member = await env.DB.prepare(`
          SELECT household_id FROM household_members WHERE user_id = ? LIMIT 1
        `).bind(userId).first();
        hhId = member?.household_id;
      }

      if (hhId) {
        // Check if Outpost account already exists
        const existing = await env.DB.prepare(`
          SELECT id FROM accounts WHERE household_id = ? AND name LIKE '%Outpost%' LIMIT 1
        `).bind(hhId).first();

        if (existing) {
          targetAccountId = existing.id;
        } else {
          targetAccountId = `acc-${crypto.randomUUID()}`;
          await env.DB.prepare(`
            INSERT INTO accounts (id, household_id, name, type, starting_balance, color, notes)
            VALUES (?, ?, ?, 'checking', ?, 'amber', 'Synchronized from TechTrek Outpost auction sales')
          `).bind(targetAccountId, hhId, accountName, netProfit).run();
        }
      }
    }

    if (targetAccountId) {
      await env.DB.prepare(`
        UPDATE accounts
        SET starting_balance = ?, notes = ?
        WHERE id = ?
      `).bind(
        netProfit,
        `Synchronized from TechTrek Outpost on ${new Date().toISOString().slice(0, 10)}. Total Net Profit: $${netProfit.toFixed(2)}`,
        targetAccountId
      ).run();
    }

    return ok({
      success: true,
      synced_net_profit: netProfit,
      account_id: targetAccountId,
      synced_at: new Date().toISOString()
    });
  });
}
