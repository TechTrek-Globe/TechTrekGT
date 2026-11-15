import { round2 } from './auction.js';

export const NON_VINE_ITEM_SQL = `(
  COALESCE(i.is_vinescout, 0) = 0
  AND (
    i.attributes IS NULL
    OR json_valid(i.attributes) = 0
    OR (
      COALESCE(json_extract(i.attributes, '$.source'), '') != 'amazon_vinescout'
      AND COALESCE(json_extract(i.attributes, '$.is_vinescout'), 0) NOT IN (1, 'true')
      AND COALESCE(json_extract(i.attributes, '$.vine_program'), 0) NOT IN (1, 'true')
    )
  )
)`;

export const VINE_ITEM_SQL = `(NOT ${NON_VINE_ITEM_SQL})`;

/**
 * Resolves a range preset ('all' | 'ytd' | '90d' | '30d') into a YYYY-MM-DD start date or null.
 *
 * @param {string|null|undefined} rangeParam
 * @param {Date} [now]
 * @returns {{ range: 'all'|'ytd'|'90d'|'30d', startDate: string|null }}
 */
export function resolvePnlDateRange(rangeParam, now = new Date()) {
  const norm = String(rangeParam || 'all').trim().toLowerCase();
  if (norm === 'ytd') {
    return { range: 'ytd', startDate: `${now.getUTCFullYear()}-01-01` };
  }
  if (norm === '90d') {
    const d = new Date(now.getTime() - 90 * 86400000);
    return { range: '90d', startDate: d.toISOString().slice(0, 10) };
  }
  if (norm === '30d') {
    const d = new Date(now.getTime() - 30 * 86400000);
    return { range: '30d', startDate: d.toISOString().slice(0, 10) };
  }
  return { range: 'all', startDate: null };
}

const ITEM_DATE_FILTER_SQL =
  " AND COALESCE(NULLIF(i.date_acquired, ''), NULLIF(inv.date_acquired, ''), substr(i.created_at, 1, 10)) >= ?";
const SALE_DATE_FILTER_SQL =
  " AND COALESCE(NULLIF(s.sale_date, ''), substr(s.created_at, 1, 10)) >= ?";

function getSpendSql(hasStartDate) {
  return (
    "SELECT " +
    "COUNT(CASE WHEN i.status != 'Returned' THEN 1 END) AS non_vine_item_count, " +
    "COUNT(DISTINCT CASE WHEN i.status != 'Returned' THEN i.invoice_id END) AS non_vine_invoice_count, " +
    "COALESCE(SUM(CASE WHEN i.status != 'Returned' THEN COALESCE(i.true_total_cost, 0) ELSE 0 END), 0) AS total_non_vine_spend, " +
    "COALESCE(SUM(CASE WHEN i.status = 'Sold' THEN COALESCE(i.true_total_cost, 0) ELSE 0 END), 0) AS sold_non_vine_cogs, " +
    "COALESCE(SUM(CASE WHEN i.status IN ('Available', 'Listed', 'Draft', 'Unsold') THEN COALESCE(i.true_total_cost, 0) ELSE 0 END), 0) AS active_non_vine_capital, " +
    "COALESCE(SUM(CASE WHEN i.status = 'Kept for Self' THEN COALESCE(i.true_total_cost, 0) ELSE 0 END), 0) AS kept_non_vine_cost, " +
    "COALESCE(SUM(CASE WHEN i.status = 'Returned' THEN COALESCE(i.true_total_cost, 0) ELSE 0 END), 0) AS returned_non_vine_cost, " +
    "COUNT(CASE WHEN i.status IN ('Available', 'Listed', 'Draft', 'Unsold') THEN 1 END) AS active_non_vine_items " +
    "FROM auction_items i " +
    "LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id " +
    "WHERE i.user_id = ? AND " + NON_VINE_ITEM_SQL +
    (hasStartDate ? ITEM_DATE_FILTER_SQL : '')
  );
}

function getSalesSql(hasStartDate) {
  return (
    "SELECT " +
    "COUNT(s.id) AS sold_count, " +
    "COALESCE(SUM(COALESCE(s.gross_sale_price, 0)), 0) AS gross_sales, " +
    "COALESCE(SUM(COALESCE(s.buyer_shipping_paid, 0)), 0) AS buyer_shipping_paid, " +
    "COALESCE(SUM(" +
    "COALESCE(s.platform_fees_amt, 0) + " +
    "COALESCE(s.payment_processing_amt, 0) + " +
    "COALESCE(s.promoted_listing_fee, 0) + " +
    "COALESCE(s.actual_shipping_cost, 0)" +
    "), 0) AS total_fees_and_shipping, " +
    "COALESCE(SUM(COALESCE(s.net_proceeds, 0)), 0) AS net_payouts, " +
    "COALESCE(SUM(COALESCE(s.net_profit, 0)), 0) AS realized_sold_profit " +
    "FROM auction_sales s " +
    "JOIN auction_items i ON i.id = s.item_id " +
    "WHERE s.user_id = ? AND " + NON_VINE_ITEM_SQL +
    (hasStartDate ? SALE_DATE_FILTER_SQL : '')
  );
}

function getVineContextSql(hasStartDate) {
  return (
    "SELECT " +
    "(SELECT COUNT(*) FROM auction_items i LEFT JOIN auction_invoices inv ON inv.id = i.invoice_id " +
    "WHERE i.user_id = ? AND " + VINE_ITEM_SQL + (hasStartDate ? ITEM_DATE_FILTER_SQL : '') +
    ") AS excluded_vine_items, " +
    "(SELECT COALESCE(SUM(COALESCE(s.net_proceeds, 0)), 0) FROM auction_sales s JOIN auction_items i ON i.id = s.item_id " +
    "WHERE s.user_id = ? AND " + VINE_ITEM_SQL + (hasStartDate ? SALE_DATE_FILTER_SQL : '') +
    ") AS excluded_vine_sold_net_payouts"
  );
}

/**
 * Builds the 3 parameterized D1 statements needed to compute Non-Vine Invoice Spend vs. Sold Net Standing.
 *
 * @param {D1Database} db
 * @param {string} userId
 * @param {string|null} startDate
 */
export function buildNonVinePnlStatements(db, userId, startDate = null) {
  const hasStartDate = Boolean(startDate);
  const itemBindings = hasStartDate ? [userId, startDate] : [userId];
  const saleBindings = hasStartDate ? [userId, startDate] : [userId];

  const spendSql = getSpendSql(hasStartDate);
  const salesSql = getSalesSql(hasStartDate);
  const vineSql = getVineContextSql(hasStartDate);

  const nonVineSpendStmt = db.prepare(spendSql).bind(...itemBindings);
  const nonVineSalesStmt = db.prepare(salesSql).bind(...saleBindings);
  const vineContextStmt = db.prepare(vineSql).bind(...itemBindings, ...saleBindings);

  return [nonVineSpendStmt, nonVineSalesStmt, vineContextStmt];
}

/**
 * Formats batched D1 query rows into the canonical Non-Vine P&L summary payload.
 *
 * @param {object|null} spendRow
 * @param {object|null} salesRow
 * @param {object|null} vineRow
 * @param {'all'|'ytd'|'90d'|'30d'} range
 * @param {string|null} startDate
 */
export function formatNonVinePnlSummary(spendRow, salesRow, vineRow, range = 'all', startDate = null) {
  const totalNonVineSpend = round2(Number(spendRow?.total_non_vine_spend) || 0);
  const soldNonVineCogs = round2(Number(spendRow?.sold_non_vine_cogs) || 0);
  const activeNonVineCapital = round2(Number(spendRow?.active_non_vine_capital) || 0);
  const keptNonVineCost = round2(Number(spendRow?.kept_non_vine_cost) || 0);
  const returnedNonVineCost = round2(Number(spendRow?.returned_non_vine_cost) || 0);

  const grossSales = round2(Number(salesRow?.gross_sales) || 0);
  const buyerShippingPaid = round2(Number(salesRow?.buyer_shipping_paid) || 0);
  const grossCollected = round2(grossSales + buyerShippingPaid);
  const totalFeesAndShipping = round2(Number(salesRow?.total_fees_and_shipping) || 0);
  const netPayouts = round2(Number(salesRow?.net_payouts) || 0);
  const realizedSoldProfit = round2(Number(salesRow?.realized_sold_profit) || 0);

  const netCashStanding = round2(netPayouts - totalNonVineSpend);
  const grossStanding = round2(grossSales - totalNonVineSpend);
  const costRecoveryPct = totalNonVineSpend > 0
    ? round2((netPayouts / totalNonVineSpend) * 100)
    : (netPayouts > 0 ? 100 : 0);

  return {
    range,
    start_date: startDate,
    non_vine_item_count: Number(spendRow?.non_vine_item_count) || 0,
    non_vine_invoice_count: Number(spendRow?.non_vine_invoice_count) || 0,
    active_non_vine_items: Number(spendRow?.active_non_vine_items) || 0,
    total_non_vine_spend: totalNonVineSpend,
    sold_non_vine_cogs: soldNonVineCogs,
    active_non_vine_capital: activeNonVineCapital,
    kept_non_vine_cost: keptNonVineCost,
    returned_non_vine_cost: returnedNonVineCost,
    sold_count: Number(salesRow?.sold_count) || 0,
    gross_sales: grossSales,
    buyer_shipping_paid: buyerShippingPaid,
    gross_collected: grossCollected,
    total_fees_and_shipping: totalFeesAndShipping,
    net_payouts: netPayouts,
    realized_sold_profit: realizedSoldProfit,
    net_cash_standing: netCashStanding,
    gross_standing: grossStanding,
    cost_recovery_pct: costRecoveryPct,
    excluded_vine_items: Number(vineRow?.excluded_vine_items) || 0,
    excluded_vine_sold_net_payouts: round2(Number(vineRow?.excluded_vine_sold_net_payouts) || 0)
  };
}
