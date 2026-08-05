/**
 * Client-side formula preview utilities - mirrors functions/utils/auction.js exactly.
 * Used for live proration previews in the AddInvoiceModal without a server round-trip.
 */

export function computeItemProration(item, invoice) {
  const base   = invoice.base_total;
  const weight = base > 0 ? item.unit_price / base : 0;
  const prorated_discount = weight * invoice.discount;
  const prorated_shipping = weight * invoice.shipping;
  const prorated_tax      = weight * invoice.tax;
  const true_total_cost   = item.unit_price - prorated_discount + prorated_shipping + prorated_tax;
  return { proration_weight: weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost };
}

export function computePricingFloors(item) {
  const divisor = 1 - item.platform_fee_pct - item.boost_pct;
  const min_sell_price = divisor > 0
    ? (item.true_total_cost + item.est_shipping_cost + item.platform_flat_fee) / divisor
    : 0;
  const suggested_list_price = min_sell_price * (1 + item.target_margin_pct);
  return { min_sell_price, suggested_list_price };
}

export function computeSaleMetrics(sale) {
  const platform_fees_amt = (sale.gross_sale_price * sale.platform_fee_pct)
                          + sale.platform_flat_fee;

  const net_proceeds = sale.gross_sale_price
                     + sale.buyer_shipping_paid
                     - sale.actual_shipping_cost
                     - platform_fees_amt
                     - sale.payment_processing_amt
                     - sale.promoted_listing_fee;

  const net_profit = net_proceeds - sale.true_total_cost;
  const roi_pct    = sale.true_total_cost > 0
                   ? net_profit / sale.true_total_cost
                   : 0;

  return { platform_fees_amt, net_proceeds, net_profit, roi_pct };
}

export function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '--';
  return `$${fmt(n)}`;
}
