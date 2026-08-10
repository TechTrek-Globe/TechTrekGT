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
  const divisor = 1 - (item.platform_fee_pct || 0) - (item.boost_pct || 0);
  const min_sell_price = divisor > 0
    ? Math.round(((item.true_total_cost + (item.est_shipping_cost || 0) + (item.platform_flat_fee || 0)) / divisor) * 100) / 100
    : 0;

  const suggested_list_price = Math.round((min_sell_price * (1 + (item.target_margin_pct || 0))) * 100) / 100;

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

export function cleanItemName(title) {
  if (!title || typeof title !== 'string') return '';
  let cleaned = title.trim();

  // 1. Strip trailing dollar prices, fee numbers, e.g. "$52.61 $8.94", "$10.50 $1.79", "$18.00 $3.06", "$52.61"
  cleaned = cleaned.replace(/(?:\s*\$?\d+(?:,\d{3})*(?:\.\d{2})?){1,4}\s*$/gi, '');

  // 2. Strip trailing orphaned prepositions/connectors left behind e.g. "Box of", "Jersey for", "-"
  cleaned = cleaned.replace(/\s+(?:of|for|at|with|and|[-–—:])\s*$/gi, '');

  // 3. Strip leading Item # or Lot # prefixes e.g. "Item #3931984", "Lot #1234", "3931984 - ", "#3931984"
  cleaned = cleaned.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  cleaned = cleaned.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  cleaned = cleaned.replace(/^\d{5,12}\s+(?=[A-Za-z])/g, '');

  // 4. Strip standalone non-year 5-12 digit numbers trailing at the end (unless 4-digit year like 1996, 2024)
  cleaned = cleaned.replace(/\s+\b(?!(?:19|20)\d{2})\d{5,12}\b\s*$/g, '');

  return cleaned.replace(/\s+/g, ' ').trim() || title.trim();
}

export function cleanAthleteName(athlete) {
  if (!athlete || typeof athlete !== 'string') return '';
  let cleaned = athlete.trim();

  // Strip leading Item #, Lot #, or standalone 4-12 digit numbers (e.g. "3931984 Raul Rosas Jr." -> "Raul Rosas Jr.")
  cleaned = cleaned.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  cleaned = cleaned.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  cleaned = cleaned.replace(/^\d{5,12}\s+/g, '');

  return cleaned.trim() || athlete.trim();
}

export function cleanItemDescription(itemName, athletePerson, authenticator) {
  if (!itemName || typeof itemName !== 'string') return '';
  let desc = cleanItemName(itemName);

  if (athletePerson && athletePerson.trim()) {
    const cleanAthlete = cleanAthleteName(athletePerson);
    if (cleanAthlete) {
      const athleteRegex = new RegExp(cleanAthlete.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\.?\\s*', 'gi');
      desc = desc.replace(athleteRegex, '');
    }
  }

  if (authenticator && authenticator.trim()) {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    if (cleanAuth) {
      const authRegex = new RegExp('(?:\\(?\\b' + cleanAuth.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b\\)?|\\bCOA\\b)', 'gi');
      desc = desc.replace(authRegex, '');
    }
  }

  desc = desc.replace(/\b\((?:JSA|Beckett|BAS|BGS|PSA|ACOA|SGC|CGC|Fanatics|Upper Deck|UDA|Tristar|Steiner|Schwartz)\)/gi, '');
  desc = desc.replace(/\b(?:COA|LOA)\b/gi, '');

  desc = desc.replace(/^[\s\-–—:]+/g, '');
  desc = desc.replace(/[\s\-–—:]+$/g, '');

  return desc.replace(/\s+/g, ' ').trim() || cleanItemName(itemName);
}
