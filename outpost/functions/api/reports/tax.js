import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { round2 } from '../../utils/auction.js';

/**
 * GET /api/reports/tax - Generates IRS Schedule C & Inventory Asset Valuation report
 * Query params: ?year=YYYY (defaults to current year)
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const requestedYear = url.searchParams.get('year') || String(new Date().getFullYear());
    const isAllYears = requestedYear === 'all';

    // 1. Fetch Sales Data
    let salesQuery = `
      SELECT s.*, i.item_name, i.category, i.athlete_person, i.authenticator, i.cert_number
      FROM auction_sales s
      JOIN auction_items i ON s.item_id = i.id
      WHERE s.user_id = ?
    `;
    const salesParams = [userId];

    if (!isAllYears) {
      salesQuery += ` AND strftime('%Y', s.sale_date) = ?`;
      salesParams.push(requestedYear);
    }
    salesQuery += ` ORDER BY s.sale_date ASC`;

    const salesResult = await env.DB.prepare(salesQuery).bind(...salesParams).all();
    const sales = salesResult.results || [];

    // Aggregate Sales Metrics
    let grossItemSales = 0;
    let buyerShippingPaid = 0;
    let cogs = 0; // Cost of Goods Sold
    let platformFees = 0;
    let actualShippingPaid = 0;
    let netProceeds = 0;
    let netProfitRealized = 0;

    for (const s of sales) {
      grossItemSales += Number(s.gross_sale_price) || 0;
      buyerShippingPaid += Number(s.buyer_shipping_paid) || 0;
      cogs += Number(s.true_total_cost) || 0;
      platformFees += (Number(s.platform_fees_amt) || 0) + (Number(s.payment_processing_amt) || 0) + (Number(s.promoted_listing_fee) || 0);
      actualShippingPaid += Number(s.actual_shipping_cost) || 0;
      netProceeds += Number(s.net_proceeds) || 0;
      netProfitRealized += Number(s.net_profit) || 0;
    }

    grossItemSales = round2(grossItemSales);
    buyerShippingPaid = round2(buyerShippingPaid);
    cogs = round2(cogs);
    platformFees = round2(platformFees);
    actualShippingPaid = round2(actualShippingPaid);
    netProceeds = round2(netProceeds);
    netProfitRealized = round2(netProfitRealized);

    const totalGrossRevenue = round2(grossItemSales + buyerShippingPaid);
    const grossProfit = round2(totalGrossRevenue - cogs);

    // 2. Fetch Supplies Data
    let suppliesQuery = `SELECT * FROM auction_supplies WHERE user_id = ?`;
    const suppliesParams = [userId];

    if (!isAllYears) {
      suppliesQuery += ` AND strftime('%Y', purchase_date) = ?`;
      suppliesParams.push(requestedYear);
    }
    suppliesQuery += ` ORDER BY purchase_date ASC`;

    const suppliesResult = await env.DB.prepare(suppliesQuery).bind(...suppliesParams).all();
    const supplies = suppliesResult.results || [];

    let totalSuppliesCost = 0;
    for (const sup of supplies) {
      totalSuppliesCost += Number(sup.cost) || 0;
    }
    totalSuppliesCost = round2(totalSuppliesCost);

    // 3. Inventory Asset Valuation (Beginning vs Ending Inventory)
    // OPT-C: Executed via direct SQL aggregation on D1 instead of loading all items into JS memory
    let beginningInventoryValue = 0;
    let endingInventoryValue = 0;
    let currentActiveInventoryValue = 0;

    const curActiveRow = await env.DB.prepare(
      `SELECT COALESCE(SUM(true_total_cost), 0) AS val
       FROM auction_items
       WHERE user_id = ? AND status NOT IN ('Sold', 'Kept for Self', 'Returned')`
    ).bind(userId).first();
    currentActiveInventoryValue = round2(curActiveRow?.val || 0);

    if (!isAllYears) {
      const yearInt = parseInt(requestedYear, 10);
      const startOfYearDate = `${yearInt}-01-01`;
      const endOfYearDate = `${yearInt}-12-31`;

      const valuationRow = await env.DB.prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN COALESCE(date_acquired, '1970-01-01') < ? AND (date_sold IS NULL OR date_sold >= ?) AND status NOT IN ('Kept for Self', 'Returned') THEN true_total_cost ELSE 0 END), 0) AS beg_val,
           COALESCE(SUM(CASE WHEN COALESCE(date_acquired, '1970-01-01') <= ? AND (date_sold IS NULL OR date_sold > ?) AND status NOT IN ('Kept for Self', 'Returned') THEN true_total_cost ELSE 0 END), 0) AS end_val
         FROM auction_items
         WHERE user_id = ?`
      ).bind(startOfYearDate, startOfYearDate, endOfYearDate, endOfYearDate, userId).first();

      beginningInventoryValue = round2(valuationRow?.beg_val || 0);
      endingInventoryValue = round2(valuationRow?.end_val || 0);
    } else {
      beginningInventoryValue = 0;
      endingInventoryValue = currentActiveInventoryValue;
    }

    // Schedule C Line Calculations
    const totalOperatingExpenses = round2(platformFees + actualShippingPaid + totalSuppliesCost);
    const scheduleC_netIncome = round2(grossProfit - totalOperatingExpenses);

    // Available Tax Years list for dropdown
    const yearsResult = await env.DB.prepare(`
      SELECT DISTINCT strftime('%Y', sale_date) as yr FROM auction_sales WHERE user_id = ? AND sale_date IS NOT NULL
      UNION
      SELECT DISTINCT strftime('%Y', date_acquired) as yr FROM auction_items WHERE user_id = ? AND date_acquired IS NOT NULL
      UNION
      SELECT DISTINCT strftime('%Y', purchase_date) as yr FROM auction_supplies WHERE user_id = ? AND purchase_date IS NOT NULL
      ORDER BY yr DESC
    `).bind(userId, userId, userId).all();

    const availableYears = (yearsResult.results || []).map(r => r.yr).filter(Boolean);
    const curYearStr = String(new Date().getFullYear());
    if (!availableYears.includes(curYearStr)) {
      availableYears.unshift(curYearStr);
    }

    return ok({
      taxYear: requestedYear,
      availableYears,
      scheduleC: {
        line1_grossReceipts: totalGrossRevenue,
        line2_returnsAndAllowances: 0,
        line3_balance: totalGrossRevenue,
        line4_cogs: cogs,
        line5_grossProfit: grossProfit,
        line10_commissionsAndFees: platformFees,
        line22_supplies: totalSuppliesCost,
        line27a_shippingExpenses: actualShippingPaid,
        line28_totalExpenses: totalOperatingExpenses,
        line31_netTaxableProfit: scheduleC_netIncome
      },
      inventoryValuation: {
        beginningInventory: beginningInventoryValue,
        endingInventory: endingInventoryValue,
        currentActiveValuation: currentActiveInventoryValue
      },
      itemizedSummary: {
        salesCount: sales.length,
        suppliesCount: supplies.length,
        grossItemSales,
        buyerShippingPaid,
        platformFees,
        actualShippingPaid,
        netProceeds,
        netProfitRealized
      },
      salesLedger: sales,
      suppliesLedger: supplies
    });
  });
}
