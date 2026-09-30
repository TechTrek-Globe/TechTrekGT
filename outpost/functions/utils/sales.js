/**
 * sales.js - THE ONLY module permitted to write auction_sales rows.
 *
 * T-08 consolidated four near-identical 18-column upserts (markItemSold,
 * POST /api/sales, PUT /api/sales/:id, POST /api/ebay/match-sold-vinescout)
 * into this file. Every entry point is now:
 *
 *     const record = normalizeSaleInput(rawInput, item);
 *     const sale   = await upsertSale(env, payload.userId, record);
 *
 * Two guarantees this file is responsible for:
 *
 *  1. roi_pct / net_profit / net_proceeds / platform_fees_amt are produced
 *     ONLY by computeSaleMetrics (T-09). No caller can hand-roll a ROI, which
 *     is what allowed one endpoint to store a percentage (35.0) in a column
 *     that every other path, and every consumer, treats as a fraction.
 *
 *  2. userId is an explicit, required parameter used in every WHERE clause.
 *     It is never derived from ambient request context, so a sale can never be
 *     read or written across tenants by accident.
 */

import { computeSaleMetrics, daysBetween } from './auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE
} from './constants.js';

// ---------------------------------------------------------------------------
// CANONICAL SHAPE
// ---------------------------------------------------------------------------

/**
 * @typedef {object} SaleRecord
 * @property {string}  item_id                - owning auction_items row (required)
 * @property {string}  sale_date              - ISO date string
 * @property {string}  platform               - marketplace name
 * @property {string|null} buyer_handle       - buyer username, null when unknown
 * @property {string|null} ebay_order_id      - eBay order id, null when not an eBay sale
 * @property {number}  gross_sale_price      - item price, excluding shipping charged
 * @property {number}  buyer_shipping_paid   - shipping charged to the buyer
 * @property {number}  actual_shipping_cost  - outbound label / delivery cost
 * @property {number}  platform_fee_pct      - fraction, e.g. 0.136
 * @property {number}  platform_flat_fee     - dollars
 * @property {number}  payment_processing_amt- dollars
 * @property {number}  promoted_listing_fee  - dollars
 * @property {number}  true_total_cost       - landed acquisition cost
 * @property {number|null} days_to_sell     - null when the date ordering is invalid
 * @property {number}  platform_fees_amt     - computed (or explicit override)
 * @property {number}  net_proceeds          - computed (or explicit override)
 * @property {number}  net_profit            - computed, never accepted from input
 * @property {number}  roi_pct               - computed FRACTION, never accepted from input
 * @property {string|null} fee_reconciled_at - preserved when null is supplied
 */

function num(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function firstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
/**
 * normalizeSaleInput - maps every accepted client alias onto the canonical
 * SaleRecord, then derives all computed fields through computeSaleMetrics.
 *
 * ALIASES (T-08 item 3: none may be silently dropped - each is emitted by some
 * client or internal caller):
 *
 *   sale date ............ sale_date, saleDate, date_sold (item)
 *   platform ............. platform
 *   buyer handle ......... buyer_handle, buyerHandle, buyer
 *   ebay order id ........ ebay_order_id, ebayOrderId, order_id, orderId
 *   gross price .......... gross_sale_price, grossSalePrice, sale_price,
 *                          salePrice, actual_sell_price, actualSellPrice
 *                          (fallback item.actual_sell_price, then current_list_price)
 *   buyer shipping ....... buyer_shipping_paid, buyerShippingPaid, deliveryCost
 *                          (fallback item.buyer_shipping_cost)
 *   actual shipping ...... actual_shipping_cost, actualShippingCost,
 *                          shippingLabelCost, est_shipping_cost
 *                          (fallback item.est_shipping_cost)
 *   fee percent .......... platform_fee_pct
 *   flat fee ............. platform_flat_fee
 *   payment processing ... payment_processing_amt, paymentProcessingFee
 *   promoted listing ..... promoted_listing_fee, promotedListingFee
 *   landed cost .......... true_total_cost, trueTotalCost (fallback
 *                          item.true_total_cost, then item.unit_price)
 *   days to sell ......... days_to_sell, days_on_market (else derived from dates)
 *   fee reconciliation ... fee_reconciled_at, fee_reconciled (boolean)
 *   net proceeds ......... net_proceeds, netProceeds, net_earnings, netEarnings
 *   platform fees amt .... platform_fees_amt, platformFeesAmt
 *
 * NOT ACCEPTED (deliberately): net_profit and roi_pct. Supplying them is how
 * the percentage/fraction divergence got in. Callers pass the raw money in and
 * the single computeSaleMetrics call below decides the answers.
 *
 * @param {object} raw  - caller-supplied fields (request body, order payload)
 * @param {object} item - the auction_items row being sold
 * @returns {SaleRecord}
 */
export function normalizeSaleInput(raw = {}, item = {}) {
  const saleDate = firstDefined(
    raw.sale_date, raw.saleDate, raw.date_sold
  ) || item.date_sold || new Date().toISOString().split('T')[0];

  const grossSalePrice = num(firstDefined(
    raw.gross_sale_price, raw.grossSalePrice,
    raw.sale_price, raw.salePrice,
    raw.actual_sell_price, raw.actualSellPrice
  ) ?? item.actual_sell_price ?? item.current_list_price, 0);

  const buyerShippingPaid = num(firstDefined(
    raw.buyer_shipping_paid, raw.buyerShippingPaid, raw.deliveryCost
  ) ?? item.buyer_shipping_cost, 0);

  const actualShippingCost = num(firstDefined(
    raw.actual_shipping_cost, raw.actualShippingCost,
    raw.shippingLabelCost, raw.est_shipping_cost
  ) ?? item.est_shipping_cost, 0);

  const platformFeePct = num(
    firstDefined(raw.platform_fee_pct) ?? item.platform_fee_pct,
    DEFAULT_PLATFORM_FEE_PCT
  );
  const platformFlatFee = num(
    firstDefined(raw.platform_flat_fee) ?? item.platform_flat_fee,
    DEFAULT_PLATFORM_FLAT_FEE
  );
  const paymentProcessingAmt = num(firstDefined(
    raw.payment_processing_amt, raw.paymentProcessingFee
  ), 0);
  const promotedListingFee = num(firstDefined(
    raw.promoted_listing_fee, raw.promotedListingFee
  ), 0);

  const trueTotalCost = num(firstDefined(
    raw.true_total_cost, raw.trueTotalCost
  ) ?? item.true_total_cost ?? item.unit_price, 0);

  // T-11 item 8: daysBetween returns null for an invalid ordering. We persist
  // that null rather than clamping to 0, so a sale dated before its listing is
  // EXCLUDED from avg_days_to_sell instead of dragging the average down.
  const explicitDays = firstDefined(raw.days_to_sell, raw.days_on_market);
  const daysToSell = explicitDays !== undefined
    ? num(explicitDays, null)
    : daysBetween(item.date_listed || item.date_acquired, saleDate);

  const feeReconciledAt = raw.fee_reconciled_at !== undefined && raw.fee_reconciled_at !== null
    ? raw.fee_reconciled_at
    : (raw.fee_reconciled ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null);

  // net_proceeds may be supplied explicitly: POST /api/sales accepts a manual
  // net-earnings figure, and the eBay reconcile path computes net proceeds from
  // ACTUAL fee data rather than the estimate. platform_fees_amt may also be
  // supplied for the same reason. Everything downstream of those two inputs -
  // net_profit and roi_pct - is derived here and nowhere else.
  const explicitNetProceeds = firstDefined(
    raw.net_proceeds, raw.netProceeds, raw.net_earnings, raw.netEarnings
  );
  const explicitPlatformFees = firstDefined(raw.platform_fees_amt, raw.platformFeesAmt);

  const metrics = computeSaleMetrics({
    gross_sale_price: grossSalePrice,
    buyer_shipping_paid: buyerShippingPaid,
    actual_shipping_cost: actualShippingCost,
    platform_fee_pct: platformFeePct,
    platform_flat_fee: platformFlatFee,
    payment_processing_amt: paymentProcessingAmt,
    promoted_listing_fee: promotedListingFee,
    net_proceeds: explicitNetProceeds,
    true_total_cost: trueTotalCost
  });
return {
    item_id: raw.item_id || item.id || item.item_id,
    sale_date: saleDate,
    platform: firstDefined(raw.platform) || item.platform || 'eBay',
    buyer_handle: firstDefined(raw.buyer_handle, raw.buyerHandle, raw.buyer) ?? null,
    ebay_order_id: firstDefined(raw.ebay_order_id, raw.ebayOrderId, raw.order_id, raw.orderId) ?? null,
    gross_sale_price: grossSalePrice,
    buyer_shipping_paid: buyerShippingPaid,
    actual_shipping_cost: actualShippingCost,
    platform_fee_pct: platformFeePct,
    platform_flat_fee: platformFlatFee,
    platform_fees_amt: explicitPlatformFees !== undefined ? num(explicitPlatformFees) : metrics.platform_fees_amt,
    payment_processing_amt: paymentProcessingAmt,
    promoted_listing_fee: promotedListingFee,
    net_proceeds: metrics.net_proceeds,
    true_total_cost: trueTotalCost,
    net_profit: metrics.net_profit,
    // roi_pct is a FRACTION. fmtPct() multiplies by 100 for display.
    roi_pct: metrics.roi_pct,
    days_to_sell: daysToSell,
    fee_reconciled_at: feeReconciledAt
  };
}

// ---------------------------------------------------------------------------
// THE ONLY auction_sales WRITE PATH
// ---------------------------------------------------------------------------

// Plain (overwrite) assignments. Identical for the INSERT, the ON CONFLICT
// DO UPDATE, and the catch-branch UPDATE fallback, so the three paths can never
// drift apart.
const PLAIN_ASSIGNMENTS = `
  sale_date              = excluded.sale_date,
  platform               = excluded.platform,
  gross_sale_price       = excluded.gross_sale_price,
  buyer_shipping_paid    = excluded.buyer_shipping_paid,
  actual_shipping_cost   = excluded.actual_shipping_cost,
  platform_fee_pct       = excluded.platform_fee_pct,
  platform_flat_fee      = excluded.platform_flat_fee,
  platform_fees_amt      = excluded.platform_fees_amt,
  payment_processing_amt = excluded.payment_processing_amt,
  promoted_listing_fee   = excluded.promoted_listing_fee,
  net_proceeds           = excluded.net_proceeds,
  true_total_cost        = excluded.true_total_cost,
  net_profit             = excluded.net_profit,
  roi_pct                = excluded.roi_pct,
  days_to_sell           = excluded.days_to_sell`;

// COALESCE semantics preserved from the original markItemSold copy: supplying
// null for these three retains whatever the row already held.
const COALESCE_ASSIGNMENTS = `
  buyer_handle      = COALESCE(excluded.buyer_handle, auction_sales.buyer_handle),
  ebay_order_id     = COALESCE(excluded.ebay_order_id, auction_sales.ebay_order_id),
  fee_reconciled_at = COALESCE(excluded.fee_reconciled_at, auction_sales.fee_reconciled_at)`;

// Bind order shared by all three statements.
const INSERT_BINDINGS = [
  'saleDate', 'platform', 'grossSalePrice', 'buyerShippingPaid',
  'actualShippingCost', 'platformFeePct', 'platformFlatFee', 'platformFeesAmt',
  'paymentProcessingAmt', 'promotedListingFee', 'netProceeds', 'trueTotalCost',
  'netProfit', 'roiPct', 'daysToSell', 'buyerHandle', 'ebayOrderId', 'feeReconciledAt'
];

function bindArgs(r) {
  return {
    saleDate: r.sale_date,
    platform: r.platform,
    grossSalePrice: r.gross_sale_price,
    buyerShippingPaid: r.buyer_shipping_paid,
    actualShippingCost: r.actual_shipping_cost,
    platformFeePct: r.platform_fee_pct,
    platformFlatFee: r.platform_flat_fee,
    platformFeesAmt: r.platform_fees_amt,
    paymentProcessingAmt: r.payment_processing_amt,
    promotedListingFee: r.promoted_listing_fee,
    netProceeds: r.net_proceeds,
    trueTotalCost: r.true_total_cost,
    netProfit: r.net_profit,
    roiPct: r.roi_pct,
    daysToSell: r.days_to_sell ?? null,
    buyerHandle: r.buyer_handle ?? null,
    ebayOrderId: r.ebay_order_id ?? null,
    feeReconciledAt: r.fee_reconciled_at ?? null
  };
}

/**
 * upsertSale - inserts or updates the single auction_sales row for an item.
 *
 * Requires an explicit `userId`. Every WHERE clause is scoped by it; the
 * function never consults request context, ambient state, or the sale id alone.
 *
 * ON CONFLICT(item_id) is the fast path, NOT the guarantee. The schema declares
 * `item_id TEXT NOT NULL UNIQUE` plus two unique indexes, but the live D1
 * database inspected for this batch carries only a NON-unique index on
 * item_id - there, and in any environment where the unique index is missing,
 * the ON CONFLICT target fails to resolve at prepare time. The pre-read plus
 * the catch-branch UPDATE fallback cover both cases; the fallback is what keeps
 * the "one sale row per item" invariant when the unique index is absent.
 *
 * The post-insert re-read resolves the persisted sale id after a conflict,
 * because the row we tried to insert lost to an existing row for that item.
 *
 * @param {object} env - Worker env (uses env.DB)
 * @param {string} userId - REQUIRED owner; used in every WHERE clause
 * @param {SaleRecord} saleRecord - output of normalizeSaleInput
 * @returns {Promise<object>} the persisted auction_sales row
 */
export async function upsertSale(env, userId, saleRecord) {
  if (!userId) {
    throw new Error('upsertSale requires an explicit userId parameter');
  }
  if (!env?.DB) {
    throw new Error('upsertSale requires env.DB');
  }
  if (!saleRecord?.item_id) {
    throw new Error('upsertSale requires saleRecord.item_id');
  }

  const r = { ...saleRecord };
  const args = bindArgs(r);
  const binds = INSERT_BINDINGS.map(k => args[k]);

  const existingSale = await env.DB.prepare(
    'SELECT * FROM auction_sales WHERE item_id = ? AND user_id = ?'
  ).bind(r.item_id, userId).first();

  const saleId = existingSale?.id || `sale-${crypto.randomUUID()}`;

  try {
    if (existingSale) {
      await env.DB.prepare(`
        UPDATE auction_sales SET
          sale_date = ?, platform = ?,
          gross_sale_price = ?, buyer_shipping_paid = ?, actual_shipping_cost = ?,
          platform_fee_pct = ?, platform_flat_fee = ?, platform_fees_amt = ?,
          payment_processing_amt = ?, promoted_listing_fee = ?,
          net_proceeds = ?, true_total_cost = ?, net_profit = ?, roi_pct = ?,
          days_to_sell = ?,
          buyer_handle      = COALESCE(?, buyer_handle),
          ebay_order_id     = COALESCE(?, ebay_order_id),
          fee_reconciled_at = COALESCE(?, fee_reconciled_at)
        WHERE id = ? AND user_id = ?
      `).bind(
        args.saleDate, args.platform,
        args.grossSalePrice, args.buyerShippingPaid, args.actualShippingCost,
        args.platformFeePct, args.platformFlatFee, args.platformFeesAmt,
        args.paymentProcessingAmt, args.promotedListingFee,
        args.netProceeds, args.trueTotalCost, args.netProfit, args.roiPct,
        args.daysToSell, args.buyerHandle, args.ebayOrderId, args.feeReconciledAt,
        existingSale.id, userId
      ).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO auction_sales (
          id, user_id, item_id,
          sale_date, platform, gross_sale_price,
          buyer_shipping_paid, actual_shipping_cost,
          platform_fee_pct, platform_flat_fee, platform_fees_amt,
          payment_processing_amt, promoted_listing_fee,
          net_proceeds, true_total_cost, net_profit, roi_pct,
          days_to_sell, buyer_handle, ebay_order_id, fee_reconciled_at
        ) VALUES (
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        ON CONFLICT(item_id) DO UPDATE SET
          ${PLAIN_ASSIGNMENTS},
          ${COALESCE_ASSIGNMENTS}
        -- The unique index is on item_id ALONE, not (user_id, item_id). Without
        -- this guard, a write for one tenant would UPDATE another tenant's row
        -- whose item_id collided. upsertSale is called with an explicit userId
        -- precisely so this stays scoped.
        WHERE auction_sales.user_id = excluded.user_id
      `).bind(saleId, userId, r.item_id, ...binds).run();
    }
  } catch (saleErr) {
    // Load-bearing fallback: fires when the UNIQUE index on item_id is absent
    // (ON CONFLICT target unresolvable) or when a concurrent writer wins the
    // insert between our pre-read and our INSERT.
    console.warn('[sales] upsert conflict, falling back to UPDATE by item_id:', saleErr?.message || saleErr);
    await env.DB.prepare(`
      UPDATE auction_sales SET
        sale_date = ?, platform = ?,
        gross_sale_price = ?, buyer_shipping_paid = ?, actual_shipping_cost = ?,
        platform_fee_pct = ?, platform_flat_fee = ?, platform_fees_amt = ?,
        payment_processing_amt = ?, promoted_listing_fee = ?,
        net_proceeds = ?, true_total_cost = ?, net_profit = ?, roi_pct = ?,
        days_to_sell = ?,
        buyer_handle      = COALESCE(?, buyer_handle),
        ebay_order_id     = COALESCE(?, ebay_order_id),
        fee_reconciled_at = COALESCE(?, fee_reconciled_at)
      WHERE item_id = ? AND user_id = ?
    `).bind(
      args.saleDate, args.platform,
      args.grossSalePrice, args.buyerShippingPaid, args.actualShippingCost,
      args.platformFeePct, args.platformFlatFee, args.platformFeesAmt,
      args.paymentProcessingAmt, args.promotedListingFee,
      args.netProceeds, args.trueTotalCost, args.netProfit, args.roiPct,
      args.daysToSell, args.buyerHandle, args.ebayOrderId, args.feeReconciledAt,
      r.item_id, userId
    ).run();
  }

  // Post-insert re-read: resolves the persisted id when our INSERT lost to a
  // pre-existing row for this item.
  let resolvedId = saleId;
  if (!existingSale) {
    const persisted = await env.DB.prepare(
      'SELECT id FROM auction_sales WHERE item_id = ? AND user_id = ?'
    ).bind(r.item_id, userId).first();
    if (persisted?.id) resolvedId = persisted.id;
  }

  const savedSale = await env.DB.prepare(
    'SELECT * FROM auction_sales WHERE id = ? AND user_id = ?'
  ).bind(resolvedId, userId).first();

  return savedSale || { id: resolvedId, ...r };
}
