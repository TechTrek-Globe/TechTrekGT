/**
 * Core computation utilities for Prestine Auction Tracker.
 * All formulas are direct translations of the Excel spreadsheet logic.
 */

// MED-10: (Number(val) || 0) is intentional for formatting/rounding to 2 decimals.
// Direct monetary write inputs are guarded upstream by validateNonNegativeMoney (MED-7).
// Here, undefined/null/empty/0 safely coalesce to 0.00 without throwing or returning NaN.
export const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;

/**
 * Validates that a numeric monetary or fee input is a non-negative number.
 * Throws an Error if val is provided and is either NaN or negative.
 * Returns null if val is undefined, null, or empty string.
 *
 * @param {any} val
 * @param {string} fieldName
 * @returns {number|null}
 */
export function validateNonNegativeMoney(val, fieldName = 'Amount') {
  if (val === undefined || val === null || val === '') {
    return null;
  }
  if (typeof val === 'boolean') {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  const n = Number(val);
  if (isNaN(n) || n < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return n;
}

/**
 * Computes all proration fields for a single item given its invoice totals.
 * - Spreadsheet: Proration Weight = Item Base Total / Invoice Base Total
 *
 * @param {{ unit_price: number, item_base_total: number }} item
 * @param {{ base_total: number, discount: number, shipping: number, tax: number }} invoice
 * @returns {{ proration_weight: number, prorated_discount: number, prorated_shipping: number, prorated_tax: number, true_total_cost: number }}
 */
export function computeItemProration(item, invoice) {
  // MED-10: invoice.base_total and item.unit_price are validated non-negative upstream (MED-7).
  // If base_total is 0 (e.g. invoice with all $0 acquisition items), weight safely defaults to 0.
  const base = invoice.base_total || 0;
  const weight = base > 0 ? (item.unit_price || 0) / base : 0;

  // MED-10: Optional invoice adjustments (discount, shipping, tax) legitimately default to 0
  // when omitted or zero on the invoice; non-zero values are validated non-negative upstream.
  const invDiscount = invoice.discount || 0;
  const invShipping = invoice.shipping || 0;
  const invTax      = invoice.tax || 0;

  const prorated_discount = round2(weight * invDiscount);
  const prorated_shipping = round2(weight * invShipping);
  const prorated_tax      = round2(weight * invTax);

  // True Total Cost = Unit Price - Prorated Discount + Prorated Shipping + Prorated Tax
  const true_total_cost = round2((item.unit_price || 0)
                        - prorated_discount
                        + prorated_shipping
                        + prorated_tax);

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
  // MED-10: Optional fee fields legitimately default to 0 (e.g. private/cash sales without platform fees).
  // Non-zero values are validated non-negative upstream by validateNonNegativeMoney (MED-7).
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

/**
 * Computes minimum sell price and suggested list price.
 * - Min Sell = (True Cost + Est Shipping + Flat Fee) / (1 - Fee % - Boost %)
 * - Suggested List = Min Sell * (1 + Target Margin %)
 *
 * @param {{ true_total_cost: number, est_shipping_cost: number, platform_flat_fee: number, platform_fee_pct: number, boost_pct: number, target_margin_pct: number }} item
 * @returns {{ min_sell_price: number, suggested_list_price: number }}
 */
export function computePricingFloors(item) {
  // MED-10: platform_fee_pct and boost_pct default to 0 if not configured.
  const divisor = 1 - (item.platform_fee_pct || 0) - (item.boost_pct || 0);
  // MED-10: est_shipping_cost and platform_flat_fee default to 0 if not applicable.
  // true_total_cost safely defaults to 0 for un-costed drafts or $0 acquisition items.
  const costBasis = (item.true_total_cost || 0) + (item.est_shipping_cost || 0) + (item.platform_flat_fee || 0);
  const min_sell_price = divisor > 0
    ? Math.round((costBasis / divisor) * 100) / 100
    : 0;

  // MED-10: target_margin_pct defaults to 0 (no markup) if omitted.
  const suggested_list_price = Math.round((min_sell_price * (1 + (item.target_margin_pct || 0))) * 100) / 100;

  return { min_sell_price, suggested_list_price };
}

/**
 * Computes manual avg comp from up to 3 comp values.
 * @param {number|string|null} c1
 * @param {number|string|null} c2
 * @param {number|string|null} c3
 * @returns {number|null}
 */
export function computeManualAvg(c1, c2, c3) {
  const vals = [c1, c2, c3]
    .filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && Number(v) > 0)
    .map(Number);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return round2(sum / vals.length);
}

/**
 * Computes recommended list price from comps and minimum sell price.
 * Uses live avg if available, else manual avg. Falls back to min sell.
 *
 * @param {number} min_sell_price
 * @param {number|null} manual_avg
 * @param {number|null} live_avg
 * @returns {number}
 */
export function computeRecommendedListPrice(min_sell_price, manual_avg, live_avg) {
  const avg = (live_avg && live_avg > 0) ? live_avg : (manual_avg && manual_avg > 0 ? manual_avg : 0);
  return round2(avg > min_sell_price ? avg : min_sell_price);
}

/**
 * Returns days between two ISO date strings (or null if either is missing or invalid).
 * Clamps negative results to 0 when toDate precedes fromDate (MED-11).
 *
 * @param {string|null} fromDate
 * @param {string|null} toDate
 * @returns {number|null}
 */
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
