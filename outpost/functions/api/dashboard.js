import { requireAuth, withAuth, ok, err } from '../utils/guard.js';
import { round2 } from '../utils/auction.js';

/**
 * GET /api/dashboard
 * Aggregates portfolio KPIs: capital tied up, inventory counts, realized profit,
 * blended ROI, category distribution, authenticator distribution, platform breakdown,
 * monthly sales velocity, and recent activity.
 */
export async function onRequestGet(context) {
  return withAuth(async () => {
    const { request, env } = context;
    const { userId } = await requireAuth(request, env);
    const db = env.DB;

    // 1-12. Batch all 12 Dashboard queries into a single D1 round-trip
    const [
      invRes,
      salesRes,
      soldCostRes,
      categoryRes,
      authenticatorRes,
      platformSalesRes,
      monthlyTrendRes,
      recentSalesRes,
      recentAcquisitionsRes,
      agingSummaryRes,
      stagnantListingsRes,
      unlistedQueueRes
    ] = await db.batch([
      // 1. Inventory Aggregations
      db.prepare(`
        SELECT
          COUNT(*) as total_items,
          SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) as available_items,
          SUM(CASE WHEN status = 'Listed' THEN 1 ELSE 0 END) as listed_items,
          SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) as sold_items,
          SUM(CASE WHEN status = 'Returned' THEN 1 ELSE 0 END) as returned_items,
          SUM(CASE WHEN status IN ('Available', 'Listed') THEN true_total_cost ELSE 0 END) as capital_tied_up,
          SUM(CASE WHEN status = 'Available' THEN true_total_cost ELSE 0 END) as available_capital,
          SUM(CASE WHEN status = 'Listed' THEN true_total_cost ELSE 0 END) as listed_capital,
          SUM(CASE WHEN status = 'Listed' THEN COALESCE(current_list_price, 0) ELSE 0 END) as listed_potential_revenue,
          SUM(CASE WHEN status != 'Returned' THEN true_total_cost ELSE 0 END) as total_capital_invested
        FROM auction_items
        WHERE user_id = ?
      `).bind(userId),

      // 2. Sales Aggregations
      db.prepare(`
        SELECT
          COUNT(*) as total_sales,
          COALESCE(SUM(gross_sale_price), 0) as total_gross_sales,
          COALESCE(SUM(net_proceeds), 0) as total_net_proceeds,
          COALESCE(SUM(platform_fees_amt), 0) as total_platform_fees,
          COALESCE(SUM(actual_shipping_cost), 0) as total_shipping_costs,
          COALESCE(SUM(net_profit), 0) as total_net_profit,
          COALESCE(AVG(days_to_sell), 0) as avg_days_to_sell
        FROM auction_sales
        WHERE user_id = ?
      `).bind(userId),

      // 3. Landed cost of items that were sold (for accurate blended ROI and avg COGS)
      db.prepare(`
        SELECT
          COALESCE(SUM(i.true_total_cost), 0) as total_sold_cost,
          COALESCE(AVG(i.true_total_cost), 0) as avg_cogs
        FROM auction_sales s
        JOIN auction_items i ON s.item_id = i.id
        WHERE s.user_id = ?
      `).bind(userId),

      // 4. Category Breakdown (Active + All)
      db.prepare(`
        SELECT
          category,
          COUNT(*) as item_count,
          SUM(CASE WHEN status IN ('Available', 'Listed') THEN true_total_cost ELSE 0 END) as capital_tied_up,
          SUM(CASE WHEN status = 'Sold' THEN 1 ELSE 0 END) as sold_count
        FROM auction_items
        WHERE user_id = ? AND status != 'Returned'
        GROUP BY category
        ORDER BY capital_tied_up DESC, item_count DESC
      `).bind(userId),

      // 5. Authenticator Breakdown
      db.prepare(`
        SELECT
          COALESCE(NULLIF(authenticator, ''), 'Uncertified / Raw') as authenticator,
          COUNT(*) as count,
          SUM(CASE WHEN status IN ('Available', 'Listed') THEN true_total_cost ELSE 0 END) as capital_tied_up
        FROM auction_items
        WHERE user_id = ? AND status != 'Returned'
        GROUP BY authenticator
        ORDER BY count DESC
      `).bind(userId),

      // 6. Platform Sales Breakdown
      db.prepare(`
        SELECT
          platform,
          COUNT(*) as sales_count,
          COALESCE(SUM(gross_sale_price), 0) as gross_volume,
          COALESCE(SUM(net_profit), 0) as net_profit,
          COALESCE(SUM(platform_fees_amt), 0) as total_fees
        FROM auction_sales
        WHERE user_id = ?
        GROUP BY platform
        ORDER BY sales_count DESC
      `).bind(userId),

      // 7. Monthly Sales Trend (Last 12 months)
      db.prepare(`
        SELECT
          strftime('%Y-%m', sale_date) as month,
          COUNT(*) as sales_count,
          COALESCE(SUM(gross_sale_price), 0) as gross_volume,
          COALESCE(SUM(net_profit), 0) as net_profit
        FROM auction_sales
        WHERE user_id = ?
        GROUP BY strftime('%Y-%m', sale_date)
        ORDER BY month ASC
        LIMIT 12
      `).bind(userId),

      // 8. Recent Sales (top 5)
      db.prepare(`
        SELECT
          s.id,
          s.sale_date,
          s.platform,
          s.gross_sale_price,
          s.net_profit,
          s.roi_pct,
          s.days_to_sell,
          i.item_name,
          i.category,
          i.athlete_person
        FROM auction_sales s
        JOIN auction_items i ON s.item_id = i.id
        WHERE s.user_id = ?
        ORDER BY s.sale_date DESC, s.created_at DESC
        LIMIT 5
      `).bind(userId),

      // 9. Recent Acquisitions (top 5 active)
      db.prepare(`
        SELECT
          i.id,
          i.item_name,
          i.category,
          i.athlete_person,
          i.status,
          i.unit_price,
          i.true_total_cost,
          i.min_sell_price,
          i.suggested_list_price,
          i.created_at,
          inv.invoice_ref
        FROM auction_items i
        LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
        WHERE i.user_id = ?
        ORDER BY i.created_at DESC
        LIMIT 5
      `).bind(userId),

      // 10. Aging Decay Summary for Actively Listed Items
      db.prepare(`
        SELECT
          SUM(CASE WHEN status = 'Listed' AND (julianday('now') - julianday(COALESCE(date_listed, created_at))) <= 30 THEN 1 ELSE 0 END) as fresh_count,
          SUM(CASE WHEN status = 'Listed' AND (julianday('now') - julianday(COALESCE(date_listed, created_at))) > 30 AND (julianday('now') - julianday(COALESCE(date_listed, created_at))) <= 60 THEN 1 ELSE 0 END) as decay_10_count,
          SUM(CASE WHEN status = 'Listed' AND (julianday('now') - julianday(COALESCE(date_listed, created_at))) > 60 AND (julianday('now') - julianday(COALESCE(date_listed, created_at))) <= 90 THEN 1 ELSE 0 END) as decay_20_count,
          SUM(CASE WHEN status = 'Listed' AND (julianday('now') - julianday(COALESCE(date_listed, created_at))) > 90 THEN 1 ELSE 0 END) as liquidation_count,
          SUM(CASE WHEN status = 'Listed' AND reprice_locked = 1 THEN 1 ELSE 0 END) as locked_count
        FROM auction_items
        WHERE user_id = ?
      `).bind(userId),

      // 11. Stagnant Listed Items (top 5 oldest active listings needing attention)
      db.prepare(`
        SELECT
          i.id,
          i.sku,
          i.item_name,
          i.category,
          i.platform,
          i.current_list_price,
          i.min_sell_price,
          i.true_total_cost,
          i.date_listed,
          i.created_at,
          i.reprice_locked,
          i.image_url,
          CAST(ROUND(julianday('now') - julianday(COALESCE(i.date_listed, i.created_at))) AS INTEGER) as days_listed
        FROM auction_items i
        WHERE i.user_id = ? AND i.status = 'Listed'
        ORDER BY COALESCE(i.date_listed, i.created_at) ASC
        LIMIT 5
      `).bind(userId),

      // 12. Unlisted Intake Queue (top 5 highest-cost items in Available waiting to be listed)
      db.prepare(`
        SELECT
          i.id,
          i.sku,
          i.item_name,
          i.category,
          i.unit_price,
          i.true_total_cost,
          i.min_sell_price,
          i.suggested_list_price,
          i.created_at,
          i.image_url,
          inv.invoice_ref
        FROM auction_items i
        LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
        WHERE i.user_id = ? AND i.status = 'Available'
        ORDER BY i.true_total_cost DESC, i.created_at DESC
        LIMIT 5
      `).bind(userId)
    ]);

    const invStats = invRes?.results?.[0];
    const salesStats = salesRes?.results?.[0];
    const soldCostRow = soldCostRes?.results?.[0];
    const agingRow = agingSummaryRes?.results?.[0];

    const totalSoldCost = soldCostRow?.total_sold_cost || 0;
    const avgCogs        = soldCostRow?.avg_cogs       || 0;
    const totalNetProfit = salesStats?.total_net_profit || 0;
    const blendedRoi = totalSoldCost > 0 ? (totalNetProfit / totalSoldCost) : 0;

    const decay10 = Number(agingRow?.decay_10_count) || 0;
    const decay20 = Number(agingRow?.decay_20_count) || 0;
    const liquidation = Number(agingRow?.liquidation_count) || 0;
    const agingCandidatesCount = decay10 + decay20 + liquidation;

    const availableCapital = Number(invStats?.available_capital) || 0;
    const listedCapital = Number(invStats?.listed_capital) || 0;
    const listedPotentialRevenue = Number(invStats?.listed_potential_revenue) || 0;
    const unrealizedProfit = round2(Math.max(0, listedPotentialRevenue - listedCapital));

    return ok({
      inventory: {
        total_items: invStats?.total_items || 0,
        available_items: invStats?.available_items || 0,
        listed_items: invStats?.listed_items || 0,
        sold_items: invStats?.sold_items || 0,
        returned_items: invStats?.returned_items || 0,
        capital_tied_up: invStats?.capital_tied_up || 0,
        available_capital: round2(availableCapital),
        listed_capital: round2(listedCapital),
        listed_potential_revenue: round2(listedPotentialRevenue),
        unrealized_profit: unrealizedProfit,
        total_capital_invested: invStats?.total_capital_invested || 0
      },
      aging_summary: {
        fresh_count: Number(agingRow?.fresh_count) || 0,
        decay_10_count: decay10,
        decay_20_count: decay20,
        liquidation_count: liquidation,
        locked_count: Number(agingRow?.locked_count) || 0,
        aging_candidates_count: agingCandidatesCount
      },
      stagnant_listings: stagnantListingsRes?.results || [],
      unlisted_queue: unlistedQueueRes?.results || [],
      sales: {
        total_sales: salesStats?.total_sales || 0,
        total_gross_sales: salesStats?.total_gross_sales || 0,
        total_net_proceeds: salesStats?.total_net_proceeds || 0,
        total_platform_fees: salesStats?.total_platform_fees || 0,
        total_shipping_costs: salesStats?.total_shipping_costs || 0,
        total_net_profit: totalNetProfit,
        total_sold_cost: totalSoldCost,
        avg_cogs: round2(avgCogs),
        blended_roi: blendedRoi,
        avg_days_to_sell: Math.round((salesStats?.avg_days_to_sell || 0) * 10) / 10
      },
      categories: categoryRes?.results || [],
      authenticators: authenticatorRes?.results || [],
      platforms: platformSalesRes?.results || [],
      monthly_trend: monthlyTrendRes?.results || [],
      recent_sales: recentSalesRes?.results || [],
      recent_acquisitions: recentAcquisitionsRes?.results || []
    });
  });
}
