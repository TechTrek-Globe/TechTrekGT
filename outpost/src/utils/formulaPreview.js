/**
 * Client-side formula preview utilities - mirrors functions/utils/auction.js exactly.
 * Used for live proration previews in the AddInvoiceModal without a server round-trip.
 */

// LOW-5: Shared currency rounding helper. Centralizes floating-point rounding. Candidate for future integer-cents migration.
export const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;

export function computeItemProration(item, invoice) {
  // MED-10: If base_total is 0 (all $0 acquisition items), weight safely defaults to 0.
  const base   = invoice.base_total || 0;
  const weight = base > 0 ? (item.unit_price || 0) / base : 0;
  // MED-10: Optional invoice adjustments (discount, shipping, tax) legitimately default to 0 when omitted.
  const invDiscount = invoice.discount || 0;
  const invShipping = invoice.shipping || 0;
  const invTax      = invoice.tax || 0;

  const prorated_discount = round2(weight * invDiscount);
  const prorated_shipping = round2(weight * invShipping);
  const prorated_tax      = round2(weight * invTax);
  const true_total_cost   = round2((item.unit_price || 0) - prorated_discount + prorated_shipping + prorated_tax);
  return { proration_weight: weight, prorated_discount, prorated_shipping, prorated_tax, true_total_cost };
}

export function computePricingFloors(item) {
  // MED-10: platform_fee_pct and boost_pct default to 0 if not configured.
  const divisor = 1 - (item.platform_fee_pct || 0) - (item.boost_pct || 0);
  // MED-10: est_shipping_cost and platform_flat_fee default to 0 if not applicable.
  // true_total_cost safely defaults to 0 for un-costed drafts or $0 acquisition items.
  const costBasis = (item.true_total_cost || 0) + (item.est_shipping_cost || 0) + (item.platform_flat_fee || 0);
  const min_sell_price = divisor > 0
    ? round2(costBasis / divisor)
    : 0;
  // MED-10: target_margin_pct defaults to 0 (no markup) if omitted.
  const suggested_list_price = round2(min_sell_price * (1 + (item.target_margin_pct || 0)));
  return { min_sell_price, suggested_list_price };
}

export function computeSaleMetrics(sale) {
  // MED-10: Optional fee fields legitimately default to 0 (e.g. private/cash sales without platform fees).
  const platform_fees_amt = round2(((sale.gross_sale_price || 0) * (sale.platform_fee_pct || 0))
                          + (sale.platform_flat_fee || 0));

  // MED-10: buyer_shipping_paid, actual_shipping_cost, payment_processing_amt, promoted_listing_fee
  // legitimately default to 0 for free shipping, digital delivery, or fee-free platforms.
  const net_proceeds = round2(sale.net_proceeds !== undefined && sale.net_proceeds !== null && !isNaN(Number(sale.net_proceeds))
                     ? Number(sale.net_proceeds)
                     : ((sale.gross_sale_price || 0)
                        + (sale.buyer_shipping_paid || 0)
                        - (sale.actual_shipping_cost || 0)
                        - platform_fees_amt
                        - (sale.payment_processing_amt || 0)
                        - (sale.promoted_listing_fee || 0)));

  // MED-10: true_total_cost legitimately defaults to 0 for zero-cost acquisitions (gifts, $0 ETV Vine items).
  const net_profit = round2(net_proceeds - (sale.true_total_cost || 0));
  // MED-10: Guard against division by zero when item acquisition cost basis is 0.
  const roi_pct    = (sale.true_total_cost || 0) > 0
                   ? net_profit / sale.true_total_cost
                   : 0;

  return { platform_fees_amt, net_proceeds, net_profit, roi_pct };
}

export function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const fromTime = new Date(fromDate).getTime();
  const toTime = new Date(toDate).getTime();
  if (isNaN(fromTime) || isNaN(toTime)) return null;

  const ms = toTime - fromTime;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 0) {
    console.warn(`[daysBetween] Clamped negative days (${days}) to 0 for fromDate: "${fromDate}", toDate: "${toDate}"`);
    return 0;
  }
  return days;
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
  return round2(val);
}

export function roundToDecimals(val, decimals = 2) {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '';
  const factor = Math.pow(10, decimals);
  return Math.round(Number(val) * factor) / factor;
}
