/**
 * Core computation utilities for Prestine Auction Tracker.
 * All formulas are direct translations of the Excel spreadsheet logic.
 */

// T-08: sales.js holds ALL auction_sales write SQL plus the SaleRecord alias
// map. It imports computeSaleMetrics/daysBetween back from this module. The
// cycle is safe because both sides export hoisted function declarations that
// are only invoked at call time, never during module evaluation.
import { normalizeSaleInput, upsertSale } from './sales.js';

// LOW-5: Shared currency rounding helper. Centralizes floating-point rounding. Candidate for future integer-cents migration.
//
// WARNING (T-11 item 3): round2 COERCES null/undefined/'' to 0, because
// Number(null) === 0. Use it for display formatting only. For any value
// persisted into a database column, use round2Nullable instead, so that a
// genuine NULL is not silently rewritten as 0.
export const round2 = (val) => Math.round((Number(val) || 0) * 100) / 100;

/**
 * round2Nullable - rounding helper SAFE FOR PERSISTENCE.
 *
 * Returns null for null/undefined/'' and rounds anything else to 2 decimals.
 * Use this for every monetary value written to a column that is allowed to
 * hold NULL (floor_price, buy_it_now_price, buyer_shipping_cost, ...).
 * A price of 0 means "free"; NULL means "not set". Collapsing the two loses
 * the distinction permanently, because a null-to-zero write cannot be
 * distinguished from a deliberate zero afterwards.
 *
 * @param {any} val
 * @returns {number|null}
 */
export const round2Nullable = (val) =>
  (val != null && val !== '' && !isNaN(Number(val))) ? round2(val) : null;

/**
 * Validates that a numeric monetary or fee input is a non-negative number.
 * Throws an Error if val is provided and is NaN, negative, infinite, or above
 * `max` (default MAX_SAFE_INTEGER).
 * Returns null if val is undefined, null, or empty string.
 *
 * T-10 item 7: the upper bound is what makes fee_pct: 1.5 rejectable. Without
 * it, a 150% platform fee produced a negative pricing divisor and a floor of
 * 0, which reads as "free" rather than "impossible".
 *
 * @param {any} val
 * @param {string} fieldName
 * @param {number} [max=Number.MAX_SAFE_INTEGER]
 * @returns {number|null}
 */
export function validateNonNegativeMoney(val, fieldName = 'Amount', max = Number.MAX_SAFE_INTEGER) {
  if (val === undefined || val === null || val === '') {
    return null;
  }
  if (typeof val === 'boolean') {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  const n = Number(val);
  if (isNaN(n) || !isFinite(n) || n < 0 || Math.abs(n) > Number.MAX_SAFE_INTEGER || n > max) {
    const bound = max === Number.MAX_SAFE_INTEGER ? '' : ` and at most ${max}`;
    throw new Error(`${fieldName} must be a non-negative number${bound}`);
  }
  return n;
}

/**
 * Validates a percentage expressed as a FRACTION in the range [0, 1).
 *
 * T-10 item 7: fee percentages, boost percentages and margins are all stored
 * as fractions. A value of 1.5 means 150%, which is not a real fee; accepting
 * it is what allowed the pricing formula to divide by a negative number.
 * 1 is excluded because a 100% take rate leaves no revenue to recover cost
 * from - the pricing floor is undefined, not zero.
 *
 * @param {any} val
 * @param {string} fieldName
 * @returns {number|null}
 */
export function validatePercentage(val, fieldName = 'Percentage') {
  const n = validateNonNegativeMoney(val, fieldName, 0.999999);
  if (n === null) return null;
  if (n >= 1) {
    throw new Error(`${fieldName} must be a fraction between 0 and 1 (e.g. 0.15 for 15%), not ${n}`);
  }
  return n;
}

/**
 * Validates that a numeric monetary or profit/loss input is a valid signed number.
 * Allows negative numbers (for loss-making sales, negative margins, net proceeds).
 * Throws an Error if val is provided and is either NaN, boolean, infinite, or exceeds MAX_SAFE_INTEGER.
 * Returns null if val is undefined, null, or empty string.
 *
 * @param {any} val
 * @param {string} fieldName
 * @returns {number|null}
 */
export function validateSignedMoney(val, fieldName = 'Amount') {
  if (val === undefined || val === null || val === '') {
    return null;
  }
  if (typeof val === 'boolean') {
    throw new Error(`${fieldName} must be a valid number`);
  }
  const n = Number(val);
  if (isNaN(n) || !isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return n;
}

/**
 * Computes all proration fields for a single item given its invoice totals.
 * - Spreadsheet: Proration Weight = Item Base Total / Invoice Base Total
 *
 * ZERO-BASE-TOTAL RULE (T-11 item 7): when base_total is 0 the invoice cannot
 * be apportioned by value, so the discount, shipping and tax are distributed
 * EVENLY at 1/N across the invoice's items. This is the real Amazon Vine case:
 * ETV is $0, so base_total is 0, but the seller still paid shipping and tax.
 * The previous `weight = 0` silently discarded all three, understating landed
 * cost for every item on the invoice.
 *
 * `itemCount` is the number of items on the invoice. Callers that know it MUST
 * pass it. When it is unknown the legacy weight-0 behaviour is retained rather
 * than guessing a divisor.
 *
 * @param {{ unit_price: number, item_base_total?: number }} item
 * @param {{ base_total: number, discount: number, shipping: number, tax: number }} invoice
 * @param {number} [itemCount] - number of items sharing this invoice
 * @returns {{ proration_weight: number, prorated_discount: number, prorated_shipping: number, prorated_tax: number, true_total_cost: number }}
 */
export function computeItemProration(item, invoice, itemCount = 0) {
  // MED-10: invoice.base_total and item.unit_price are validated non-negative upstream (MED-7).
  const base = invoice.base_total || 0;
  let weight;
  if (base > 0) {
    weight = (item.unit_price || 0) / base;
  } else if (itemCount > 0) {
    // Even split; see ZERO-BASE-TOTAL RULE above.
    weight = 1 / itemCount;
  } else {
    weight = 0;
  }

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
  // Pass the roster size so a zero-base invoice still splits evenly.
  return items.map(item => ({
    ...item,
    ...computeItemProration(item, invoice, items.length)
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
 * THE pricing formula. Server and client both call this exact implementation.
 *
 *   min_sell_price      = (true_total_cost + est_shipping_cost + platform_flat_fee)
 *                         / (1 - platform_fee_pct - boost_pct)
 *   suggested_list_price = min_sell_price * (1 + target_margin_pct)
 *
 * BUSINESS RULE - buyer-paid shipping does NOT offset the floor (T-10 item 1).
 * Decided once, here, and implemented once. Rationale: the floor answers "at
 * what price does this sale stop losing money". If the buyer pays $8 shipping,
 * the seller still has to buy a $6 label; netting one against the other hides
 * the cash the seller must front before the order arrives, and it makes the
 * floor depend on a value (buyer shipping) that is frequently unknown at
 * pricing time. The previous feeEngine variant subtracted
 * shippingCharged * (1 - fee - processing) from the numerator and added a
 * payment-processing rate to the divisor, so the two implementations disagreed
 * for every item with buyer shipping and the grid showed a floor the server
 * never computed. This is now the only formula.
 *
 * INVALID INPUT (T-10 item 6): when the divisor is non-positive (fees
 * consuming 100% or more of revenue) there is no price that breaks even.
 * Returning 0 read as "free"; this returns null plus a pricing_error the
 * caller can surface, and callers must not persist a floor in that case.
 *
 * @param {{ true_total_cost?: number, est_shipping_cost?: number,
 *           platform_flat_fee?: number, platform_fee_pct?: number,
 *           boost_pct?: number, target_margin_pct?: number }} item
 * @returns {{ min_sell_price: number|null, suggested_list_price: number|null,
 *             pricing_error: string|null, fee_divisor: number }}
 */
export function computePricingFloors(item) {
  // MED-10: platform_fee_pct and boost_pct default to 0 if not configured.
  const divisor = 1 - (item.platform_fee_pct || 0) - (item.boost_pct || 0);

  if (divisor <= 0) {
    return {
      min_sell_price: null,
      suggested_list_price: null,
      pricing_error:
        `Platform fee plus promoted-listing boost (${round2((item.platform_fee_pct || 0) * 100)}% + ${round2((item.boost_pct || 0) * 100)}%) ` +
        'consumes 100% or more of the sale price, so no break-even price exists. ' +
        'Reduce the platform fee or the ad boost.',
      fee_divisor: divisor
    };
  }

  // MED-10: est_shipping_cost and platform_flat_fee default to 0 if not applicable.
  // true_total_cost safely defaults to 0 for un-costed drafts or $0 acquisition items.
  const costBasis = (item.true_total_cost || 0) + (item.est_shipping_cost || 0) + (item.platform_flat_fee || 0);
  const min_sell_price = round2(costBasis / divisor);

  // MED-10: target_margin_pct defaults to 0 (no markup) if omitted.
  const suggested_list_price = round2(min_sell_price * (1 + (item.target_margin_pct || 0)));

  return { min_sell_price, suggested_list_price, pricing_error: null, fee_divisor: divisor };
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
 * Returns days between two ISO date strings.
 *
 * T-11 item 8: returns null when either date is missing/unparseable OR when the
 * ordering is invalid (toDate precedes fromDate). It no longer clamps a negative
 * span to 0. A clamp turns a data-entry error into a real measurement: the sale
 * would land in AVG(days_to_sell) as a genuine "sold same day", quietly pulling
 * the portfolio average down and hiding the bad date from the user. Callers
 * persist the null, which AVG ignores, and the warning tells the operator.
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
    console.warn(
      `[daysBetween] Invalid ordering: toDate "${toDate}" precedes fromDate "${fromDate}" ` +
      `(would be ${days} days). Returning null so the sale is excluded from avg_days_to_sell.`
    );
    return null;
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

/**
 * Shared helper for upserting an auction_sales record when an item is marked Sold.
 *
 * T-08: this is now a thin delegate. All alias mapping and ALL auction_sales
 * write SQL live in utils/sales.js (normalizeSaleInput + upsertSale), which is
 * the only module allowed to write that table. Kept as a named export because
 * four call sites (items PUT, tokenHelper reconcile, vinescout-catalog,
 * sales POST) read better with this signature than with normalize+upsert.
 *
 * @param {object} env - Cloudflare Worker environment with DB binding
 * @param {string} userId - User ID (REQUIRED; never derived from ambient context)
 * @param {object} item - auction_items row
 * @param {object} saleFields - Raw sale input; aliases documented in normalizeSaleInput
 * @returns {Promise<object>} The persisted auction_sales row
 */
export async function markItemSold(env, userId, item, saleFields = {}) {
  const record = normalizeSaleInput({ ...saleFields, item_id: item.id || item.item_id }, item);
  return upsertSale(env, userId, record);
}
