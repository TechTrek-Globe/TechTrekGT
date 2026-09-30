import { requireAuth, withAuth, ok, err } from '../utils/guard.js';
import { cleanEbaySearchQuery } from './comps/index.js';
import {
  FALLBACK_GATEWAY_ORIGIN,
  LOCAL_DEV_ORIGIN,
  CONCURRENCY_LIMIT,
  REQUEST_STAGGER_MS
} from '../utils/constants.js';

/**
 * GET /api/market-alerts
 *
 * Returns recent unread market alerts for the user's active inventory.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const rows = await env.DB.prepare(`
      SELECT a.*, i.item_name
      FROM auction_market_alerts a
      JOIN auction_items i ON a.item_id = i.id
      WHERE a.user_id = ? AND a.is_read = 0
      ORDER BY a.created_at DESC
      LIMIT 50
    `).bind(userId).all();

    return ok({ alerts: rows.results || [] });
  });
}

/**
 * PUT /api/market-alerts/:id
 *
 * Marks a specific alert as read (or unread if is_read=0 is passed).
 */
export async function onRequestPut(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);
    
    // Extract ID from path e.g. /api/market-alerts/123
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const alertId = parts[parts.length - 1];
    
    if (!alertId || alertId === 'market-alerts') {
      return err('Alert ID is required', 400);
    }
    
    const body = await request.json().catch(() => ({}));
    const isRead = body.is_read !== undefined ? (body.is_read ? 1 : 0) : 1;
    
    await env.DB.prepare(`
      UPDATE auction_market_alerts
      SET is_read = ?
      WHERE id = ? AND user_id = ?
    `).bind(isRead, alertId, userId).run();
    
    return ok({ success: true });
  });
}

/**
 * POST /api/market-alerts/refresh-all
 *
 * Triggers a background batch re-evaluation of all Active/Listed items.
 * Fetches fresh comps for each, and if the `live_avg` differs from the stored
 * `recommended_list_price` by > 15%, records an alert.
 * Uses a concurrency limit of 3 and 300ms delays to respect rate limits.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    // Ensure they don't abuse it (in a real system we'd check a last_refresh_time, 
    // for now we trust the client's 24h lockout, but we'll do the job async).

    // We use context.waitUntil to run the batch process in the background
    // without blocking the HTTP response.
    context.waitUntil(runMarketRefresh(userId, env, request));

    return ok({ success: true, message: 'Market refresh started in background.' });
  });
}

async function runMarketRefresh(userId, env, request) {
  try {
    // 1. Fetch all active/listed items with their current comps
    const items = await env.DB.prepare(`
      SELECT 
        i.id, i.item_name, i.athlete_person, i.authenticator,
        c.recommended_list_price
      FROM auction_items i
      LEFT JOIN auction_comps c ON i.id = c.item_id
      WHERE i.user_id = ? AND i.status IN ('Available', 'Listed')
    `).bind(userId).all();

    if (!items.results || items.results.length === 0) return;

    // 2. Resolve the gateway origin to call back into ourselves.
    // T-10 item 9: no hardcoded production hostname. GATEWAY_BASE_URL wins, so a
    // staging deployment points at staging instead of silently calling prod.
    // Local dev falls back to the wrangler dev port; otherwise we reuse the
    // origin the request already arrived on.
    const origin = new URL(request.url).origin;
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
    const gatewayOrigin = env.GATEWAY_BASE_URL
      || (isLocal ? LOCAL_DEV_ORIGIN : (origin || FALLBACK_GATEWAY_ORIGIN));
    const gatewayUrl = `${gatewayOrigin}/api/ebay/comps`;

    // To authenticate against the gateway from a worker, we need the user's cookie.
    // Fortunately, since this is context.waitUntil, we still have the original request headers.
    const cookie = request.headers.get('Cookie');

    // Concurrency control: bounded by CONCURRENCY_LIMIT
    let activePromises = [];
    const DELAY_MS = REQUEST_STAGGER_MS;

    for (const item of items.results) {
      // Create a promise for fetching and processing this item
      const p = (async () => {
        try {
          const query = cleanEbaySearchQuery(item.item_name, item.athlete_person, item.authenticator);
          const res = await fetch(gatewayUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': cookie || ''
            },
            body: JSON.stringify({ query, itemId: item.id })
          });
          
          if (!res.ok) return;
          const data = await res.json();
          if (!data || !data.live_avg) return;
          
          const newAvg = data.live_avg;
          const oldAvg = item.recommended_list_price;
          
          if (oldAvg && oldAvg > 0) {
            const diff = newAvg - oldAvg;
            const pct = Math.abs(diff / oldAvg);
            
            // 15% threshold
            if (pct >= 0.15) {
              const alertType = diff > 0 ? 'SPIKE' : 'DROP';
              await env.DB.prepare(`
                INSERT INTO auction_market_alerts (id, user_id, item_id, alert_type, old_value, new_value, percentage_change)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).bind(
                crypto.randomUUID(), userId, item.id, alertType, oldAvg, newAvg, pct
              ).run();
            }
          }
        } catch (e) {
          console.error(`Refresh failed for item ${item.id}: ${e.message}`);
        }
      })();

      activePromises.push(p);

      if (activePromises.length >= CONCURRENCY_LIMIT) {
        await Promise.all(activePromises);
        activePromises = [];
        // Delay between batches
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
    
    // Drain remainder
    if (activePromises.length > 0) {
      await Promise.all(activePromises);
    }
    
  } catch (e) {
    console.error('Market Refresh Background Task Failed:', e);
  }
}
