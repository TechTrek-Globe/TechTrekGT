import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

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
      grossItemSales += s.gross_sale_price || 0;
      buyerShippingPaid += s.buyer_shipping_paid || 0;
      cogs += s.true_total_cost || 0;
      platformFees += (s.platform_fees_amt || 0) + (s.payment_processing_amt || 0) + (s.promoted_listing_fee || 0);
      actualShippingPaid += s.actual_shipping_cost || 0;
      netProceeds += s.net_proceeds || 0;
      netProfitRealized += s.net_profit || 0;
    }

    const totalGrossRevenue = grossItemSales + buyerShippingPaid;
    const grossProfit = totalGrossRevenue - cogs;

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
      totalSuppliesCost += sup.cost || 0;
    }

    // 3. Inventory Asset Valuation (Beginning vs Ending Inventory)
    // Beginning Inventory (Jan 1 of requested year)
    let beginningInventoryValue = 0;
    let endingInventoryValue = 0;
    let currentActiveInventoryValue = 0;

    const allItemsResult = await env.DB.prepare(
      `SELECT id, item_name, true_total_cost, status, date_acquired, date_sold
       FROM auction_items
       WHERE user_id = ?`
    ).bind(userId).all();
    const allItems = allItemsResult.results || [];

    const yearInt = parseInt(requestedYear, 10);
    const startOfYearDate = `${yearInt}-01-01`;
    const endOfYearDate = `${yearInt}-12-31`;

    for (const it of allItems) {
      const acquiredDate = it.date_acquired || '1970-01-01';
      const cost = it.true_total_cost || 0;
      const soldDate = it.date_sold;

      // Currently active unsold
      if (it.status !== 'Sold') {
        currentActiveInventoryValue += cost;
      }

      if (!isAllYears) {
        // Was it in inventory before Jan 1 of this year?
        if (acquiredDate < startOfYearDate) {
          if (!soldDate || soldDate >= startOfYearDate) {
            beginningInventoryValue += cost;
          }
        }

        // Was it in inventory as of Dec 31 of this year?
        if (acquiredDate <= endOfYearDate) {
          if (!soldDate || soldDate > endOfYearDate) {
            endingInventoryValue += cost;
          }
        }
      } else {
        beginningInventoryValue = 0;
        endingInventoryValue = currentActiveInventoryValue;
      }
    }

    // Schedule C Line Calculations
    const totalOperatingExpenses = platformFees + actualShippingPaid + totalSuppliesCost;
    const scheduleC_netIncome = grossProfit - totalOperatingExpenses;

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
