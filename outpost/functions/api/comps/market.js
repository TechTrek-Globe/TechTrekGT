import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { validateNonNegativeMoney } from '../../utils/auction.js';

// eBay condition IDs that are always excluded from median benchmark calculations.
// condition_id '7000' = For Parts / Not Working
const EXCLUDED_CONDITION_IDS = new Set(['7000']);

/**
 * Compute the median of an array of numbers.
 * Returns null if the array is empty.
 */
function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Determine is_valid for a new comp row.
 * A row is invalid (0) when:
 *   - condition_id is in EXCLUDED_CONDITION_IDS (e.g. '7000' = For Parts)
 *   - list_price <= 0
 * Outlier detection (vs existing comps) runs as a post-insert pass via GET.
 */
function resolveIsValid(conditionId, listPrice) {
  if (conditionId && EXCLUDED_CONDITION_IDS.has(String(conditionId))) return 0;
  if (listPrice !== null && listPrice !== undefined && Number(listPrice) <= 0) return 0;
  return 1;
}

/**
 * GET /api/comps/market?item_id=X
 *
 * Returns all market_comps rows for the given item plus computed median benchmarks.
 * Response shape:
 * {
 *   comps:          MarketComp[],
 *   sold_median:    number | null,   -- median landed_cost of valid ebay_sold comps
 *   active_median:  number | null,   -- median landed_cost of valid ebay_browse comps
 *   benchmark_price: number | null   -- sold_median ?? active_median
 * }
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url    = new URL(request.url);
    const itemId = url.searchParams.get('item_id');

    if (!itemId) return err('item_id query parameter is required', 400);

    // Verify item ownership
    const item = await env.DB.prepare(
      'SELECT id FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, userId).first();
    if (!item) return err('Item not found', 404);

    const rows = await env.DB.prepare(`
      SELECT
        id, item_id, user_id, source,
        comp_title, list_price, shipping_fee, landed_cost,
        condition_id, condition_label,
        ebay_item_id, comp_url, observed_at,
        is_valid, notes, created_at
      FROM market_comps
      WHERE item_id = ? AND user_id = ?
      ORDER BY observed_at DESC
    `).bind(itemId, userId).all();

    const comps = rows.results || [];

    // Compute median benchmarks from valid comps only
    const validComps  = comps.filter(r => r.is_valid === 1 && Number(r.landed_cost) > 0);
    const soldComps   = validComps.filter(r => r.source === 'ebay_sold');
    const activeComps = validComps.filter(r => r.source === 'ebay_browse');

    const soldMedian   = median(soldComps.map(r   => Number(r.landed_cost)));
    const activeMedian = median(activeComps.map(r => Number(r.landed_cost)));
    const benchmarkPrice = soldMedian ?? activeMedian ?? null;

    return ok({
      comps,
      sold_median:     soldMedian,
      active_median:   activeMedian,
      benchmark_price: benchmarkPrice,
      valid_count:     validComps.length,
      total_count:     comps.length
    });
  });
}

/**
 * POST /api/comps/market
 *
 * Insert one comp row into market_comps.
 * Accepts a single comp object. landed_cost is computed server-side.
 * is_valid is auto-determined based on condition_id and list_price.
 *
 * Body:
 * {
 *   item_id:        string  (required)
 *   source:         string  'ebay_browse' | 'ebay_sold' | 'manual'
 *   comp_title?:    string
 *   list_price?:    number
 *   shipping_fee?:  number  (default 0)
 *   condition_id?:  string  (eBay condition ID - '7000' auto-marks invalid)
 *   condition_label?: string
 *   ebay_item_id?:  string
 *   comp_url?:      string
 *   observed_at?:   string  (ISO date string - defaults to now)
 *   is_valid?:      0 | 1   (caller can force-invalidate; auto-calc if omitted)
 *   notes?:         string
 * }
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const {
      item_id,
      source      = 'manual',
      comp_title,
      list_price,
      shipping_fee = 0,
      condition_id,
      condition_label,
      ebay_item_id,
      comp_url,
      observed_at,
      is_valid: isValidOverride,
      notes
    } = body;

    if (!item_id) return err('item_id is required', 400);

    // Verify item ownership
    const item = await env.DB.prepare(
      'SELECT id FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(item_id, userId).first();
    if (!item) return err('Item not found', 404);

    const validSources = ['ebay_browse', 'ebay_sold', 'manual'];
    if (!validSources.includes(source)) {
      return err(`source must be one of: ${validSources.join(', ')}`, 400);
    }

    let parsedListPrice = null;
    let parsedShippingFee = 0;

    try {
      if (list_price !== undefined && list_price !== null && list_price !== '') {
        parsedListPrice = validateNonNegativeMoney(list_price, 'list_price');
      }
      if (shipping_fee !== undefined) {
        parsedShippingFee = validateNonNegativeMoney(shipping_fee, 'shipping_fee') ?? 0;
      }
    } catch (e) {
      return err(e.message, 400);
    }

    const landedCost = parsedListPrice !== null
      ? Math.round((parsedListPrice + parsedShippingFee) * 100) / 100
      : null;

    // Auto-determine validity unless caller explicitly sets it
    const isValid = isValidOverride !== undefined
      ? (isValidOverride ? 1 : 0)
      : resolveIsValid(condition_id, parsedListPrice);

    const compId       = `mc-${crypto.randomUUID()}`;
    const observedDate = observed_at || new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO market_comps (
        id, item_id, user_id, source,
        comp_title, list_price, shipping_fee, landed_cost,
        condition_id, condition_label,
        ebay_item_id, comp_url, observed_at, is_valid, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      compId, item_id, userId, source,
      comp_title   || null,
      parsedListPrice,
      parsedShippingFee,
      landedCost,
      condition_id   || null,
      condition_label || null,
      ebay_item_id || null,
      comp_url     || null,
      observedDate,
      isValid,
      notes || null
    ).run();

    const inserted = await env.DB.prepare(
      'SELECT * FROM market_comps WHERE id = ?'
    ).bind(compId).first();

    return ok({ comp: inserted, message: 'Market comp saved successfully' }, 201);
  });
}

/**
 * PUT /api/comps/market/:id
 *
 * Update is_valid and/or notes on an existing comp row.
 * Routed via worker.js with params.id injected into context.
 *
 * Body: { is_valid?: 0|1, notes?: string }
 */
export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url    = new URL(request.url);
    const parts  = url.pathname.split('/');
    const compId = parts[parts.length - 1];

    if (!compId) return err('comp id is required', 400);

    // Verify ownership
    const existing = await env.DB.prepare(
      'SELECT id, item_id FROM market_comps WHERE id = ? AND user_id = ?'
    ).bind(compId, userId).first();
    if (!existing) return err('Comp not found', 404);

    const body = await request.json().catch(() => ({}));
    const { is_valid, notes } = body;

    const updates = [];
    const bindings = [];

    if (is_valid !== undefined) {
      updates.push('is_valid = ?');
      bindings.push(is_valid ? 1 : 0);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      bindings.push(notes || null);
    }

    if (!updates.length) return err('No updatable fields provided (is_valid, notes)', 400);

    bindings.push(compId, userId);
    await env.DB.prepare(`
      UPDATE market_comps SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
    `).bind(...bindings).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM market_comps WHERE id = ?'
    ).bind(compId).first();

    return ok({ comp: updated, message: 'Comp updated' });
  });
}

/**
 * DELETE /api/comps/market/:id
 *
 * Delete a single market_comps row by ID.
 */
export async function onRequestDelete(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url    = new URL(request.url);
    const parts  = url.pathname.split('/');
    const compId = parts[parts.length - 1];

    if (!compId) return err('comp id is required', 400);

    const existing = await env.DB.prepare(
      'SELECT id FROM market_comps WHERE id = ? AND user_id = ?'
    ).bind(compId, userId).first();
    if (!existing) return err('Comp not found', 404);

    await env.DB.prepare(
      'DELETE FROM market_comps WHERE id = ? AND user_id = ?'
    ).bind(compId, userId).run();

    return ok({ message: 'Comp deleted' });
  });
}
