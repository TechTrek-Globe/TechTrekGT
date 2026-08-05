/**
 * Core computation utilities for Prestine Auction Tracker.
 * All formulas are direct translations of the Excel spreadsheet logic.
 */

/**
 * Computes all proration fields for a single item given its invoice totals.
 * - Spreadsheet: Proration Weight = Item Base Total / Invoice Base Total
 *
 * @param {{ unit_price: number, item_base_total: number }} item
 * @param {{ base_total: number, discount: number, shipping: number, tax: number }} invoice
 * @returns {{ proration_weight: number, prorated_discount: number, prorated_shipping: number, prorated_tax: number, true_total_cost: number }}
 */
export function computeItemProration(item, invoice) {
  const base = invoice.base_total;
  const weight = base > 0 ? item.unit_price / base : 0;

  const prorated_discount = weight * invoice.discount;
  const prorated_shipping = weight * invoice.shipping;
  const prorated_tax      = weight * invoice.tax;

  // True Total Cost = Unit Price - Prorated Discount + Prorated Shipping + Prorated Tax
  const true_total_cost = item.unit_price
                        - prorated_discount
                        + prorated_shipping
                        + prorated_tax;

  return {
    proration_weight:  weight,
    prorated_discount,
    prorated_shipping,
    prorated_tax,
    true_total_cost
  };
}

/**
 * Recomputes all item proration fields when an invoice is updated.
 * Returns array of updated item records ready for D1 batch upsert.
 *
 * @param {Array<{ id: string, unit_price: number }>} items
 * @param {{ base_total: number, discount: number, shipping: number, tax: number }} invoice
 * @returns {Array<Object>}
 */
export function reprorateBatch(items, invoice) {
  return items.map(item => ({
    ...item,
    ...computeItemProration(item, invoice)
  }));
}

/**
 * Computes sale metrics from raw sale input.
 * - Spreadsheet: Platform Fees = (Gross Sale Price * Fee %) + Flat Fee
 * - Spreadsheet: Net Proceeds = Gross + Buyer Shipping - Actual Shipping - Fees - Payment Processing - Promoted Fee
 * - Spreadsheet: Net Profit = Net Proceeds - True Total Cost
 * - Spreadsheet: ROI % = Net Profit / True Total Cost
 *
 * @param {{
 *   gross_sale_price: number,
 *   buyer_shipping_paid: number,
 *   actual_shipping_cost: number,
 *   platform_fee_pct: number,
 *   platform_flat_fee: number,
 *   payment_processing_amt: number,
 *   promoted_listing_fee: number,
 *   true_total_cost: number
 * }} sale
 * @returns {{ platform_fees_amt: number, net_proceeds: number, net_profit: number, roi_pct: number }}
 */
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

/**
 * Computes minimum sell price and suggested list price.
 * - Min Sell = (True Cost + Est Shipping + Flat Fee) / (1 - Fee % - Boost %)
 * - Suggested List = Min Sell * (1 + Target Margin %)
 *
 * @param {{ true_total_cost: number, est_shipping_cost: number, platform_flat_fee: number, platform_fee_pct: number, boost_pct: number, target_margin_pct: number }} item
 * @returns {{ min_sell_price: number, suggested_list_price: number }}
 */
export function computePricingFloors(item) {
  const divisor = 1 - item.platform_fee_pct - item.boost_pct;
  const min_sell_price = divisor > 0
    ? (item.true_total_cost + item.est_shipping_cost + item.platform_flat_fee) / divisor
    : 0;

  const suggested_list_price = min_sell_price * (1 + item.target_margin_pct);

  return { min_sell_price, suggested_list_price };
}

/**
 * Computes manual avg comp from up to 3 comp values.
 * @param {number|null} c1
 * @param {number|null} c2
 * @param {number|null} c3
 * @returns {number}
 */
export function computeManualAvg(c1, c2, c3) {
  const vals = [c1, c2, c3].filter(v => v != null && v > 0);
  if (vals.length === 0) return 0;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

/**
 * Computes recommended list price from comps and minimum sell price.
 * Uses live avg if available, else manual avg. Falls back to min sell.
 *
 * @param {number} min_sell_price
 * @param {number} manual_avg
 * @param {number|null} live_avg
 * @returns {number}
 */
export function computeRecommendedListPrice(min_sell_price, manual_avg, live_avg) {
  const avg = (live_avg && live_avg > 0) ? live_avg : manual_avg;
  return avg > min_sell_price ? avg : min_sell_price;
}

/**
 * Returns days between two ISO date strings (or null if either is missing).
 * @param {string|null} fromDate
 * @param {string|null} toDate
 * @returns {number|null}
 */
export function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
