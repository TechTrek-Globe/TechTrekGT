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
  const divisor = 1 - (item.platform_fee_pct || 0) - (item.boost_pct || 0);
  const min_sell_price = divisor > 0
    ? Math.round(((item.true_total_cost + (item.est_shipping_cost || 0) + (item.platform_flat_fee || 0)) / divisor) * 100) / 100
    : 0;
  const suggested_list_price = Math.round((min_sell_price * (1 + (item.target_margin_pct || 0))) * 100) / 100;
  return { min_sell_price, suggested_list_price };
}

export function computeSaleMetrics(sale) {
  const platform_fees_amt = ((sale.gross_sale_price || 0) * (sale.platform_fee_pct || 0))
                          + (sale.platform_flat_fee || 0);

  const net_proceeds = sale.net_proceeds !== undefined && sale.net_proceeds !== null && !isNaN(Number(sale.net_proceeds))
                     ? Number(sale.net_proceeds)
                     : ((sale.gross_sale_price || 0)
                        + (sale.buyer_shipping_paid || 0)
                        - (sale.actual_shipping_cost || 0)
                        - platform_fees_amt
                        - (sale.payment_processing_amt || 0)
                        - (sale.promoted_listing_fee || 0));

  const net_profit = net_proceeds - (sale.true_total_cost || 0);
  const roi_pct    = (sale.true_total_cost || 0) > 0
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
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n, decimals = 1) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  const val = Number(n) * 100;
  const fixed = val.toFixed(decimals);
  return `${parseFloat(fixed)}%`;
}

export function formatPercent(n, maxDecimals = 2) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  const val = Number(n) * 100;
  const fixed = val.toFixed(maxDecimals);
  return `${parseFloat(fixed)}%`;
}

export function fmtCurrency(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  return `$${fmt(n, 2)}`;
}

export function formatCurrency(n) {
  return fmtCurrency(n);
}

export function roundPrice(val) {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '';
  return Math.round(Number(val) * 100) / 100;
}

export function roundToDecimals(val, decimals = 2) {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '';
  const factor = Math.pow(10, decimals);
  return Math.round(Number(val) * factor) / factor;
}
