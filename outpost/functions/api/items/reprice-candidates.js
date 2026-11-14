import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { computeAgingDecaySuggestion } from '../../utils/auction.js';

/**
 * GET /api/items/reprice-candidates
 *
 * Scans active inventory (Listed and Available items) for the authenticated user,
 * categorizes them into aging decay tiers (0-30d, 31-60d, 61-90d, 90d+),
 * and computes floor-clamped markdown suggestions that guarantee 0% net loss protection.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const filterTier = url.searchParams.get('tier') || '';
    const onlyEligible = url.searchParams.get('eligible') === 'true';

    // 1. Fetch user's active inventory items
    const rows = await env.DB.prepare(`
      SELECT
        i.id, i.sku, i.item_name, i.category, i.status, i.platform,
        i.current_list_price, i.original_list_price, i.suggested_list_price, i.unit_price,
        i.true_total_cost, i.est_shipping_cost, i.buyer_shipping_cost,
        i.platform_fee_pct, i.platform_flat_fee, i.boost_pct, i.ebay_promoted_rate,
        i.floor_price, i.min_sell_price,
        i.date_acquired, i.date_listed, i.purchase_date, i.created_at,
        i.last_repriced_at, i.reprice_locked, i.reprice_tier,
        i.ebay_listing_id, i.image_url,
        inv.invoice_ref
      FROM auction_items i
      LEFT JOIN auction_invoices inv ON i.invoice_id = inv.id
      WHERE i.user_id = ? AND i.status IN ('Listed', 'Available')
      ORDER BY i.date_listed ASC, i.created_at ASC
    `).bind(payload.userId).all();

    const items = rows.results || [];

    // 2. Fetch default platform fee schedule if user has configured one
    const defaultPlatform = await env.DB.prepare(`
      SELECT fee_pct, flat_fee FROM auction_platforms
      WHERE user_id = ? AND is_default = 1
      LIMIT 1
    `).bind(payload.userId).first();

    const platformSchedule = defaultPlatform ? {
      fee_pct: defaultPlatform.fee_pct,
      flat_fee: defaultPlatform.flat_fee
    } : {};

    // 3. Process aging decay suggestions
    const tierCounts = {
      '0-30d': 0,
      '31-60d': 0,
      '61-90d': 0,
      '90d+': 0
    };
    let totalEligibleCount = 0;
    let totalPotentialPriceDrop = 0;
    let lockedCount = 0;
    let atFloorCount = 0;

    const allCandidates = items.map(item => {
      const suggestion = computeAgingDecaySuggestion(item, platformSchedule);
      if (tierCounts[suggestion.tier] !== undefined) {
        tierCounts[suggestion.tier]++;
      }
      if (suggestion.eligible) {
        totalEligibleCount++;
        totalPotentialPriceDrop += suggestion.dollar_drop;
      }
      if (suggestion.reprice_locked) {
        lockedCount++;
      }
      if (suggestion.at_floor_blocked) {
        atFloorCount++;
      }

      return {
        ...suggestion,
        category: item.category || 'General',
        status: item.status,
        platform: item.platform || 'eBay',
        ebay_listing_id: item.ebay_listing_id || null,
        image_url: item.image_url || null,
        invoice_ref: item.invoice_ref || null,
        last_repriced_at: item.last_repriced_at || null,
        created_at: item.created_at
      };
    });

    // 4. Apply optional query filters
    let filtered = allCandidates;
    if (filterTier) {
      filtered = filtered.filter(c => c.tier === filterTier);
    }
    if (onlyEligible) {
      filtered = filtered.filter(c => c.eligible);
    }

    // Sort: eligible items first, then by days_listed descending
    filtered.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.days_listed - a.days_listed;
    });

    return ok({
      success: true,
      candidates: filtered,
      summary: {
        total_inventory_scanned: items.length,
        total_candidates: totalEligibleCount,
        potential_price_drop: Math.round(totalPotentialPriceDrop * 100) / 100,
        tier_counts: tierCounts,
        locked_count: lockedCount,
        at_floor_count: atFloorCount
      }
    });
  });
}
