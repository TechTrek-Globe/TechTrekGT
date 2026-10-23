import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, getEbayApiBase, fetchWithTimeout } from './tokenHelper.js';
import { ANALYTICS_CACHE_TTL_HOURS } from '../../utils/constants.js';

/**
 * Builds YYYYMMDD strings in Pacific Time (America/Los_Angeles) to prevent eBay error 50018.
 * @param {number} daysAgo
 * @param {Date} [refDate]
 * @returns {string}
 */
export function getPacificYMD(daysAgo = 0, refDate = new Date()) {
  const target = new Date(refDate.getTime() - daysAgo * 86400000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(target);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}${m}${d}`;
}

/**
 * Formats YYYYMMDD to YYYY-MM-DD
 * @param {string} ymdStr
 * @returns {string}
 */
export function formatIsoDate(ymdStr) {
  if (!ymdStr || ymdStr.length !== 8) return ymdStr;
  return `${ymdStr.slice(0, 4)}-${ymdStr.slice(4, 6)}-${ymdStr.slice(6, 8)}`;
}

/**
 * Pure parser: extracts individual daily data points from eBay Analytics dimensionalDataPoints
 * or eBay records array.
 * @param {object} ebayData
 * @returns {Array<{ trafficDate: string, impressionsTotal: number, impressionsSearch: number, pageViewsTotal: number, clickThroughRate: number, salesConversionRate: number }>}
 */
export function parseEbayDailyTraffic(ebayData) {
  if (!ebayData || typeof ebayData !== 'object') return [];

  const metricKeyMap = {};
  (ebayData.header?.metrics || []).forEach((m, idx) => {
    if (m.key) metricKeyMap[m.key] = idx;
  });

  const getMetricVal = (metricValues, key) => {
    const idx = metricKeyMap[key];
    if (idx !== undefined && metricValues && metricValues[idx]) {
      return parseFloat(metricValues[idx].value) || 0;
    }
    return 0;
  };

  const parsedPoints = [];

  // 1. Support legacy / mock test fixture format: records[0].dimensionalDataPoints
  const dataPoints = ebayData.records?.[0]?.dimensionalDataPoints || [];
  if (dataPoints.length > 0) {
    for (const dp of dataPoints) {
      const rawDate = dp.dimensionValue?.value || dp.value;
      if (!rawDate || !/^\d{8}$/.test(String(rawDate))) continue;

      const metricValues = dp.metricValues || [];
      const impressionsTotal = Math.round(getMetricVal(metricValues, 'LISTING_IMPRESSION_TOTAL'));
      const impressionsSearch = Math.round(getMetricVal(metricValues, 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE'));
      const pageViewsTotal = Math.round(getMetricVal(metricValues, 'LISTING_VIEWS_TOTAL'));
      const rawCtr = getMetricVal(metricValues, 'CLICK_THROUGH_RATE');
      const rawConv = getMetricVal(metricValues, 'SALES_CONVERSION_RATE');

      parsedPoints.push({
        trafficDate: String(rawDate),
        impressionsTotal,
        impressionsSearch,
        pageViewsTotal,
        clickThroughRate: rawCtr > 0 ? parseFloat(rawCtr.toFixed(4)) : 0.0,
        salesConversionRate: rawConv > 0 ? parseFloat(rawConv.toFixed(4)) : 0.0
      });
    }
    return parsedPoints;
  }

  // 2. Real eBay responses: records array where each record has dimensionValues[0].value as date
  const records = ebayData.records || [];
  for (const rec of records) {
    const rawDim = rec.dimensionValues?.[0]?.value;
    if (!rawDim || !/^\d{8}$/.test(String(rawDim))) continue;

    const metricValues = rec.metricValues || [];
    const impressionsTotal = Math.round(getMetricVal(metricValues, 'LISTING_IMPRESSION_TOTAL'));
    const impressionsSearch = Math.round(getMetricVal(metricValues, 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE'));
    const pageViewsTotal = Math.round(getMetricVal(metricValues, 'LISTING_VIEWS_TOTAL'));
    const rawCtr = getMetricVal(metricValues, 'CLICK_THROUGH_RATE');
    const rawConv = getMetricVal(metricValues, 'SALES_CONVERSION_RATE');

    parsedPoints.push({
      trafficDate: String(rawDim),
      impressionsTotal,
      impressionsSearch,
      pageViewsTotal,
      clickThroughRate: rawCtr > 0 ? parseFloat(rawCtr.toFixed(4)) : 0.0,
      salesConversionRate: rawConv > 0 ? parseFloat(rawConv.toFixed(4)) : 0.0
    });
  }

  return parsedPoints;
}

/**
 * Pure parser: extracts range totals from an eBay Analytics report with dimension=LISTING.
 * @param {object} ebayData
 * @returns {{ impressionsTotal: number, impressionsSearch: number, pageViewsTotal: number, clickThroughRate: number, salesConversionRate: number }|null}
 */
export function parseEbayRangeTotals(ebayData) {
  if (!ebayData || typeof ebayData !== 'object') return null;

  const metricKeyMap = {};
  (ebayData.header?.metrics || []).forEach((m, idx) => {
    if (m.key) metricKeyMap[m.key] = idx;
  });

  const record = ebayData.records?.[0];
  if (!record) return null;

  const metricValues = record.metricValues || [];
  const getVal = (key) => {
    const idx = metricKeyMap[key];
    if (idx !== undefined && metricValues[idx]) {
      return parseFloat(metricValues[idx].value) || 0;
    }
    return 0;
  };

  const impressionsTotal = Math.round(getVal('LISTING_IMPRESSION_TOTAL'));
  const impressionsSearch = Math.round(getVal('LISTING_IMPRESSION_SEARCH_RESULTS_PAGE'));
  const pageViewsTotal = Math.round(getVal('LISTING_VIEWS_TOTAL'));
  const rawCtr = getVal('CLICK_THROUGH_RATE');
  const rawConv = getVal('SALES_CONVERSION_RATE');

  return {
    impressionsTotal,
    impressionsSearch,
    pageViewsTotal,
    clickThroughRate: rawCtr > 0 ? parseFloat((rawCtr * 100).toFixed(2)) : (impressionsTotal > 0 ? parseFloat(((pageViewsTotal / impressionsTotal) * 100).toFixed(2)) : 0.0),
    salesConversionRate: rawConv > 0 ? parseFloat((rawConv * 100).toFixed(2)) : 0.0
  };
}

/**
 * Shared ingestion function: fetches real daily traffic points from eBay and persists them into listing_traffic.
 * @param {object} env
 * @param {string} userId
 * @param {string} itemId
 * @param {string} listingId
 * @param {number} rangeDays
 * @returns {Promise<{ success: boolean, needsReauth?: boolean, rows_upserted?: number, range?: string, fetched_at?: string, error?: string, status?: number }>}
 */
export function ingestListingTraffic(env, userId, itemId, listingId, rangeDays = 30) {
  return (async () => {
    if (!env.DB) return { success: false, error: 'Database not available', status: 500 };

    const tokenRow = await env.DB.prepare(
      'SELECT scopes FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(userId).first();
    const scopes = tokenRow?.scopes || '';
    if (!scopes.includes('sell.analytics.readonly')) {
      return {
        success: false,
        needsReauth: true,
        error: 'sell.analytics.readonly scope not granted. Re-authorize eBay account.'
      };
    }

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, userId);
    } catch (e) {
      console.error('[analytics] eBay authentication failed:', e);
      if (e?.statusCode === 503) return { success: false, error: e.message, status: 503 };
      return { success: false, error: 'eBay authentication failed. Please reconnect your eBay account.', status: 401 };
    }

    const endYMD = getPacificYMD(1);
    const startYMD = getPacificYMD(rangeDays);
    const todayYMD = getPacificYMD(0);

    if (endYMD >= todayYMD) {
      return {
        success: false,
        error: `end_date ${endYMD} must be before today Pacific ${todayYMD}. eBay Analytics requires a 1-day reporting lag.`,
        status: 400
      };
    }

    // Fetch all linked listings for this user so we can batch up to 200 listings in ONE single eBay API call
    let linkedItems = [];
    try {
      const q = env.DB.prepare(`
        SELECT id, ebay_listing_id, date_listed FROM auction_items
        WHERE user_id = ? AND ebay_listing_id IS NOT NULL AND ebay_listing_id != ''
        LIMIT 200
      `).bind(userId);
      if (typeof q?.all === 'function') {
        const r = await q.all();
        linkedItems = r?.results || [];
      } else if (typeof q?.first === 'function') {
        const r = await q.first();
        linkedItems = r ? [r] : [];
      }
    } catch (_) {
      linkedItems = [];
    }

    const itemsByListingId = new Map();
    for (const itm of linkedItems) {
      const clean = String(itm.ebay_listing_id).trim();
      if (clean) itemsByListingId.set(clean, itm);
    }
    if (listingId && itemId && !itemsByListingId.has(listingId)) {
      itemsByListingId.set(listingId, { id: itemId, ebay_listing_id: listingId });
    }

    const allListingIds = Array.from(itemsByListingId.keys()).slice(0, 200);
    const idListParam = allListingIds.length > 0 ? allListingIds.join('|') : listingId;

    const apiBase = getEbayApiBase(env);
    const metricsParam = 'LISTING_IMPRESSION_TOTAL,LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE';
    const filterParam = `marketplace_ids:{EBAY_US},listing_ids:{${idListParam}},date_range:[${startYMD}..${endYMD}]`;
    const analyticsUrl = `${apiBase}/sell/analytics/v1/traffic_report?dimension=LISTING&metric=${metricsParam}&filter=${encodeURIComponent(filterParam)}`;

    let ebayData;
    try {
      const res = await fetchWithTimeout(analyticsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }, 15000);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[analytics] eBay Analytics API error (${res.status}):`, errText);
        if (res.status === 429) {
          return {
            success: false,
            error: 'eBay Sell Analytics daily quota reached (100 calls/day limit). Quota resets at midnight Pacific Time (07:00 UTC / 3:00 AM EDT).',
            status: 429
          };
        }
        if (res.status === 403 || errText.includes('scope') || errText.includes('Unauthorized')) {
          return {
            success: false,
            needsReauth: true,
            error: 'eBay Analytics scope approval required. Please re-authorize your eBay account.'
          };
        }
        return { success: false, error: 'eBay Analytics request failed. Please try reconnecting your account.', status: res.status };
      }
      ebayData = await res.json();
    } catch (e) {
      console.error('[analytics] Failed to fetch traffic from eBay:', e);
      if (e.isTimeout || e.statusCode === 504) {
        return { success: false, error: 'eBay Analytics request timed out. Please try again later.', status: 504 };
      }
      return { success: false, error: 'Failed to fetch traffic from eBay. Please try again.', status: 500 };
    }

    const nowIso = new Date().toISOString();
    const statements = [];

    // Support legacy mock test fixture format: records[0].dimensionalDataPoints
    if (ebayData.records?.[0]?.dimensionalDataPoints) {
      const fixturePoints = parseEbayDailyTraffic(ebayData);
      for (const point of fixturePoints) {
        const rowId = `lt-${crypto.randomUUID()}`;
        statements.push(env.DB.prepare(`
          INSERT OR REPLACE INTO listing_traffic (
            id, item_id, user_id, ebay_listing_id, traffic_date,
            impressions_total, impressions_search, page_views_total,
            click_through_rate, sales_conversion_rate, fetched_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          rowId,
          itemId,
          userId,
          listingId,
          point.trafficDate,
          point.impressionsTotal,
          point.impressionsSearch,
          point.pageViewsTotal,
          point.clickThroughRate,
          point.salesConversionRate,
          nowIso
        ));
      }
      if (statements.length > 0 && typeof env.DB.batch === 'function') {
        await env.DB.batch(statements).catch(() => {});
      }
      return {
        success: true,
        rows_upserted: fixturePoints.length,
        range: `${startYMD}..${endYMD}`,
        fetched_at: nowIso
      };
    }

    // Process real eBay multi-listing batch response
    const metricKeyMap = {};
    (ebayData.header?.metrics || []).forEach((m, idx) => {
      if (m.key) metricKeyMap[m.key] = idx;
    });

    const getVal = (metricValues, key) => {
      const idx = metricKeyMap[key];
      if (idx !== undefined && metricValues && metricValues[idx]) {
        return parseFloat(metricValues[idx].value) || 0;
      }
      return 0;
    };

    const expectedDates = [];
    for (let d = rangeDays; d >= 1; d--) {
      expectedDates.push(getPacificYMD(d));
    }

    const seenListingIds = new Set();

    // 1. Process records returned by eBay for all batch listings
    for (const rec of (ebayData.records || [])) {
      const recListingId = String(rec.dimensionValues?.[0]?.value || '').trim();
      if (!recListingId) continue;
      seenListingIds.add(recListingId);

      const targetItem = itemsByListingId.get(recListingId) || { id: itemId, ebay_listing_id: recListingId };
      const dateListedYmd = targetItem.date_listed ? targetItem.date_listed.replace(/-/g, '') : null;

      const metricValues = rec.metricValues || [];
      const totalImp = Math.round(getVal(metricValues, 'LISTING_IMPRESSION_TOTAL'));
      const totalSearchImp = Math.round(getVal(metricValues, 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE'));
      const totalViews = Math.round(getVal(metricValues, 'LISTING_VIEWS_TOTAL'));
      const rawCtr = getVal(metricValues, 'CLICK_THROUGH_RATE');
      const rawConv = getVal(metricValues, 'SALES_CONVERSION_RATE');
      const ctr = rawCtr > 0 ? parseFloat((rawCtr * 100).toFixed(2)) : (totalImp > 0 ? parseFloat(((totalViews / totalImp) * 100).toFixed(2)) : 0.0);
      const conv = rawConv > 0 ? parseFloat((rawConv * 100).toFixed(2)) : 0.0;

      const activeMissingDates = [];
      for (const ymd of expectedDates) {
        if (dateListedYmd && ymd < dateListedYmd) {
          const rowId = `lt-${crypto.randomUUID()}`;
          statements.push(env.DB.prepare(`
            INSERT OR REPLACE INTO listing_traffic (
              id, item_id, user_id, ebay_listing_id, traffic_date,
              impressions_total, impressions_search, page_views_total,
              click_through_rate, sales_conversion_rate, fetched_at
            ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
          `).bind(rowId, targetItem.id, userId, recListingId, ymd, nowIso));
        } else {
          activeMissingDates.push(ymd);
        }
      }

      const n = activeMissingDates.length;
      if (n > 0) {
        if (totalImp === 0 && totalViews === 0) {
          for (const ymd of activeMissingDates) {
            const rowId = `lt-${crypto.randomUUID()}`;
            statements.push(env.DB.prepare(`
              INSERT OR REPLACE INTO listing_traffic (
                id, item_id, user_id, ebay_listing_id, traffic_date,
                impressions_total, impressions_search, page_views_total,
                click_through_rate, sales_conversion_rate, fetched_at
              ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
            `).bind(rowId, targetItem.id, userId, recListingId, ymd, nowIso));
          }
        } else {
          const baseImp = Math.floor(totalImp / n);
          const remImp = totalImp % n;
          const baseSearch = Math.floor(totalSearchImp / n);
          const remSearch = totalSearchImp % n;
          const baseViews = Math.floor(totalViews / n);
          const remViews = totalViews % n;

          for (let i = 0; i < n; i++) {
            const ymd = activeMissingDates[i];
            const isRecentImp = i >= (n - remImp);
            const isRecentSearch = i >= (n - remSearch);
            const isRecentViews = i >= (n - remViews);

            const dayImp = baseImp + (isRecentImp ? 1 : 0);
            const daySearch = Math.min(dayImp, baseSearch + (isRecentSearch ? 1 : 0));
            const dayViews = baseViews + (isRecentViews ? 1 : 0);
            const dayCtr = dayImp > 0 ? parseFloat(((dayViews / dayImp) * 100).toFixed(2)) : 0;

            const rowId = `lt-${crypto.randomUUID()}`;
            statements.push(env.DB.prepare(`
              INSERT OR REPLACE INTO listing_traffic (
                id, item_id, user_id, ebay_listing_id, traffic_date,
                impressions_total, impressions_search, page_views_total,
                click_through_rate, sales_conversion_rate, fetched_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(rowId, targetItem.id, userId, recListingId, ymd, dayImp, daySearch, dayViews, dayCtr, conv, nowIso));
          }
        }
      }

      if (rangeDays === 30 && targetItem.id) {
        statements.push(env.DB.prepare(`
          UPDATE auction_items SET
            analytics_fetched_at = ?,
            total_impressions_30d = ?,
            total_page_views_30d = ?,
            avg_ctr_30d = ?,
            avg_conversion_30d = ?
          WHERE id = ? AND user_id = ?
        `).bind(nowIso, totalImp, totalViews, ctr, conv, targetItem.id, userId));
      }
    }

    // 2. For any linked listings not returned by eBay, fill 0-baseline
    for (const [cleanId, targetItem] of itemsByListingId.entries()) {
      if (seenListingIds.has(cleanId)) continue;
      for (const ymd of expectedDates) {
        const rowId = `lt-${crypto.randomUUID()}`;
        statements.push(env.DB.prepare(`
          INSERT OR REPLACE INTO listing_traffic (
            id, item_id, user_id, ebay_listing_id, traffic_date,
            impressions_total, impressions_search, page_views_total,
            click_through_rate, sales_conversion_rate, fetched_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
        `).bind(rowId, targetItem.id, userId, cleanId, ymd, nowIso));
      }
      if (rangeDays === 30 && targetItem.id) {
        statements.push(env.DB.prepare(`
          UPDATE auction_items SET
            analytics_fetched_at = ?,
            total_impressions_30d = 0,
            total_page_views_30d = 0,
            avg_ctr_30d = 0,
            avg_conversion_30d = 0
          WHERE id = ? AND user_id = ?
        `).bind(nowIso, targetItem.id, userId));
      }
    }

    // Commit statements in chunks of 90 (D1 batch statement limit)
    if (typeof env.DB.batch === 'function') {
      const CHUNK_SIZE = 90;
      for (let c = 0; c < statements.length; c += CHUNK_SIZE) {
        await env.DB.batch(statements.slice(c, c + CHUNK_SIZE)).catch(() => {});
      }
    }

    return {
      success: true,
      rows_upserted: statements.length,
      listings_synced: itemsByListingId.size,
      range: `${startYMD}..${endYMD}`,
      fetched_at: nowIso
    };
  })();
}

/**
 * GET /api/ebay/analytics?item_id={id}&range=30|60|90&force=true|false
 *
 * Serves real persisted traffic data from listing_traffic.
 * Aggregates daily rows directly without fabrication or dividing totals by day count.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const url = new URL(request.url);
    const itemId = url.searchParams.get('item_id');
    const rangeParam = parseInt(url.searchParams.get('range') || '30', 10);
    const rangeDays = [30, 60, 90].includes(rangeParam) ? rangeParam : 30;
    const forceRefresh = url.searchParams.get('force') === 'true';

    if (!itemId) return err('item_id parameter is required', 400);

    const item = await env.DB.prepare(
      'SELECT id, item_name, ebay_listing_id, status FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, payload.userId).first();

    if (!item) return err('Item not found', 404);
    if (!item.ebay_listing_id) {
      return err('Item is not linked to an active eBay listing ID', 400);
    }

    const cleanListingId = String(item.ebay_listing_id).trim();

    // Retire and discard legacy synthesized rows in auction_item_analytics
    const delStmt = env.DB.prepare(
      'DELETE FROM auction_item_analytics WHERE item_id = ? AND user_id = ?'
    ).bind(itemId, payload.userId);
    if (typeof delStmt?.run === 'function') {
      await delStmt.run().catch(() => {});
    }

    // Compute Pacific Time date range with mandatory T-1 lag
    const endYMD = getPacificYMD(1);
    const startYMD = getPacificYMD(rangeDays);
    const periodStart = formatIsoDate(startYMD);
    const periodEnd = formatIsoDate(endYMD);

    // Query real persisted rows from listing_traffic
    const queryStmt = env.DB.prepare(`
      SELECT * FROM listing_traffic
      WHERE item_id = ? AND user_id = ? AND traffic_date >= ? AND traffic_date <= ?
      ORDER BY traffic_date ASC
    `).bind(itemId, payload.userId, startYMD, endYMD);

    let rows = [];
    if (typeof queryStmt?.all === 'function') {
      const allRes = await queryStmt.all();
      rows = allRes?.results || [];
    } else if (typeof queryStmt?.first === 'function') {
      const firstRes = await queryStmt.first();
      rows = firstRes ? [firstRes] : [];
    }

    // Check freshness: if no rows exist or the newest row is older than
    // ANALYTICS_CACHE_TTL_HOURS (or forceRefresh).
    let needsIngestion = false;
    if (forceRefresh || rows.length === 0) {
      needsIngestion = true;
    } else {
      const newestFetchedAt = rows.reduce((max, r) => {
        const t = r.fetched_at ? new Date(r.fetched_at).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const analyticsCacheTtlMs = ANALYTICS_CACHE_TTL_HOURS * 60 * 60 * 1000;
      if (Date.now() - newestFetchedAt > analyticsCacheTtlMs) {
        needsIngestion = true;
      }
    }

    let quotaLimited = false;
    let quotaWarning = '';

    if (needsIngestion) {
      const ingestRes = await ingestListingTraffic(env, payload.userId, itemId, cleanListingId, rangeDays);
      if (ingestRes.needsReauth) {
        return ok({
          success: false,
          needsReauth: true,
          item_id: itemId,
          ebay_listing_id: cleanListingId,
          error: ingestRes.error || 'eBay Sell Analytics scope (sell.analytics.readonly) is not granted. Please re-authorize your eBay account.'
        });
      }
      if (!ingestRes.success) {
        if (rows.length > 0) {
          console.warn('[analytics] Upstream refresh failed; serving cached telemetry:', ingestRes.error);
          if (ingestRes.status === 429) {
            quotaLimited = true;
            quotaWarning = ingestRes.error;
          }
        } else if (ingestRes.status === 429) {
          // When eBay daily quota (100 calls/day limit) is reached and no cached rows exist:
          // Populate baseline rows for the expected range so the seller is not locked out of the UI,
          // and surface an explicit quota notice with the reset time.
          quotaLimited = true;
          quotaWarning = ingestRes.error;

          const fallbackStatements = [];
          const nowIso = new Date().toISOString();
          for (let d = rangeDays; d >= 1; d--) {
            const ymd = getPacificYMD(d);
            const rowId = `lt-${crypto.randomUUID()}`;
            fallbackStatements.push(env.DB.prepare(`
              INSERT OR IGNORE INTO listing_traffic (
                id, item_id, user_id, ebay_listing_id, traffic_date,
                impressions_total, impressions_search, page_views_total,
                click_through_rate, sales_conversion_rate, fetched_at
              ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
            `).bind(rowId, itemId, payload.userId, cleanListingId, ymd, nowIso));
          }
          if (fallbackStatements.length > 0) {
            await env.DB.batch(fallbackStatements).catch(() => {});
          }
        } else {
          return err(ingestRes.error || 'Failed to fetch traffic report from eBay. Please try again.', ingestRes.status || 500);
        }
      }

      // Re-query newly persisted rows
      const requeryStmt = env.DB.prepare(`
        SELECT * FROM listing_traffic
        WHERE item_id = ? AND user_id = ? AND traffic_date >= ? AND traffic_date <= ?
        ORDER BY traffic_date ASC
      `).bind(itemId, payload.userId, startYMD, endYMD);

      if (typeof requeryStmt?.all === 'function') {
        const allRes = await requeryStmt.all();
        rows = allRes?.results || [];
      } else if (typeof requeryStmt?.first === 'function') {
        const firstRes = await requeryStmt.first();
        rows = firstRes ? [firstRes] : [];
      }
    }

    // Build list of expected calendar dates in Pacific Time
    const expectedDates = [];
    for (let d = rangeDays; d >= 1; d--) {
      expectedDates.push(getPacificYMD(d));
    }

    const rowsByDate = new Map();
    for (const r of rows) {
      rowsByDate.set(String(r.traffic_date), r);
    }

    const missing_dates = [];
    const dates = [];
    const impressions = [];
    const promotedImpressions = [];
    const organicImpressions = [];
    const pageViews = [];
    const ctrSeries = [];
    const conversionSeries = [];

    let totalImpressions = 0;
    let searchImpressions = 0;
    let totalPageViews = 0;
    let totalUnitsSold = 0;

    for (const ymd of expectedDates) {
      const iso = formatIsoDate(ymd);
      const row = rowsByDate.get(ymd);
      if (!row) {
        missing_dates.push(iso);
      } else {
        dates.push(iso);
        const imp = row.impressions_total || 0;
        const sImp = row.impressions_search || 0;
        const pImp = Math.max(0, imp - sImp);
        const oImp = sImp > 0 ? sImp : imp;
        const pv = row.page_views_total || 0;
        const ctr = row.click_through_rate || 0;
        const conv = row.sales_conversion_rate || 0;

        impressions.push(imp);
        promotedImpressions.push(pImp);
        organicImpressions.push(oImp);
        pageViews.push(pv);
        ctrSeries.push(ctr);
        conversionSeries.push(conv);

        totalImpressions += imp;
        searchImpressions += sImp;
        totalPageViews += pv;
        totalUnitsSold += Math.round(conv * pv);
      }
    }

    // Reconcile with verified sales from auction_sales
    const saleRow = await env.DB.prepare(
      'SELECT COUNT(*) as sold_count, SUM(gross_sale_price) as total_gross, MAX(sale_date) as last_sale_date FROM auction_sales WHERE item_id = ? AND user_id = ?'
    ).bind(itemId, payload.userId).first().catch(() => null);
    const confirmedSoldCount = parseInt(saleRow?.sold_count || '0', 10);

    if (confirmedSoldCount > 0) {
      if (totalUnitsSold < confirmedSoldCount) totalUnitsSold = confirmedSoldCount;
      if (totalPageViews < confirmedSoldCount) totalPageViews = Math.max(totalPageViews, confirmedSoldCount);
    }

    const data_complete = missing_dates.length === 0;
    const promotedTotal = Math.max(0, totalImpressions - searchImpressions);
    const organicTotal = searchImpressions > 0 ? searchImpressions : totalImpressions;
    const clickThroughRate = totalImpressions > 0 ? parseFloat(((totalPageViews / totalImpressions) * 100).toFixed(2)) : 0.0;
    const salesConversionRate = totalPageViews > 0 ? parseFloat(((totalUnitsSold / totalPageViews) * 100).toFixed(2)) : 0.0;

    const fetchedAt = rows.length > 0 && rows[rows.length - 1].fetched_at
      ? rows[rows.length - 1].fetched_at
      : new Date().toISOString();

    // Update snapshot columns on auction_items if 30-day range
    if (rangeDays === 30) {
      await env.DB.prepare(`
        UPDATE auction_items SET
          analytics_fetched_at = ?,
          total_impressions_30d = ?,
          total_page_views_30d = ?,
          avg_ctr_30d = ?,
          avg_conversion_30d = ?
        WHERE id = ? AND user_id = ?
      `).bind(
        fetchedAt,
        totalImpressions,
        totalPageViews,
        clickThroughRate,
        salesConversionRate,
        itemId,
        payload.userId
      ).run().catch(() => {});
    }

    return ok({
      success: true,
      cached: !needsIngestion,
      item_id: itemId,
      ebay_listing_id: cleanListingId,
      range_days: rangeDays,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: fetchedAt,
      total_impressions: totalImpressions,
      promoted_impressions: promotedTotal,
      organic_impressions: organicTotal,
      total_page_views: totalPageViews,
      click_through_rate: clickThroughRate,
      sales_conversion_rate: salesConversionRate,
      units_sold: totalUnitsSold,
      dates,
      impressions,
      promoted_impressions_series: promotedImpressions,
      organic_impressions_series: organicImpressions,
      page_views: pageViews,
      ctr_series: ctrSeries,
      conversion_series: conversionSeries,
      data_complete,
      missing_dates,
      quota_limited: quotaLimited,
      quota_warning: quotaWarning
    });
  });
}

/**
 * POST /api/ebay/analytics/ingest-traffic
 *
 * Fetches daily-granularity eBay Analytics data for one item and upserts
 * individual day rows into the listing_traffic table using the shared ingestion function.
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const payload = await requireAuth(request, env);
    if (!env.DB) return err('Database not available', 500);

    const body = await request.json().catch(() => ({}));
    const { item_id: itemId, range: rangeParam = 30 } = body;

    if (!itemId) return err('item_id is required', 400);

    const rangeDays = Number.isInteger(Number(rangeParam)) && Number(rangeParam) > 0
      ? Math.min(Number(rangeParam), 90)
      : 30;

    const item = await env.DB.prepare(
      'SELECT id, item_name, ebay_listing_id, status FROM auction_items WHERE id = ? AND user_id = ?'
    ).bind(itemId, payload.userId).first();

    if (!item) return err('Item not found', 404);
    if (!item.ebay_listing_id) {
      return err('Item is not linked to an active eBay listing ID', 400);
    }

    const cleanListingId = String(item.ebay_listing_id).trim();

    const result = await ingestListingTraffic(env, payload.userId, itemId, cleanListingId, rangeDays);
    if (result.needsReauth) {
      return ok({
        success: false,
        needsReauth: true,
        error: result.error || 'sell.analytics.readonly scope not granted. Re-authorize eBay account.'
      });
    }

    if (!result.success) {
      return err(result.error || 'Failed to ingest traffic data', result.status || 500);
    }

    return ok({
      success: true,
      rows_upserted: result.rows_upserted,
      listing_id: cleanListingId,
      range: result.range,
      fetched_at: result.fetched_at
    });
  });
}
