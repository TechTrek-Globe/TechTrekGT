import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import { getEbayUserToken, getEbayApiBase } from './tokenHelper.js';

/**
 * GET /api/ebay/analytics?item_id={id}&range=30|60|90&force=true|false
 *
 * Fetches listing performance and traffic statistics from the eBay Sell Analytics API
 * (/sell/analytics/v1/traffic_report) with D1 persistence and 12-hour caching.
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

    // 1. Cache lookup (12-hour TTL)
    if (!forceRefresh) {
      const cached = await env.DB.prepare(`
        SELECT * FROM auction_item_analytics
        WHERE item_id = ? AND user_id = ? AND range_days = ?
        ORDER BY fetched_at DESC LIMIT 1
      `).bind(itemId, payload.userId, rangeDays).first();

      if (cached && cached.fetched_at) {
        const fetchedMs = new Date(cached.fetched_at).getTime();
        const nowMs = Date.now();
        const twelveHoursMs = 12 * 60 * 60 * 1000;

        if (nowMs - fetchedMs < twelveHoursMs) {
          const dates = JSON.parse(cached.dates_json || '[]');
          const impressions = JSON.parse(cached.impressions_json || '[]');
          const promotedImpressions = JSON.parse(cached.promoted_impressions_json || '[]');
          const pageViews = JSON.parse(cached.page_views_json || '[]');
          const ctrSeries = JSON.parse(cached.ctr_json || '[]');
          const conversionSeries = JSON.parse(cached.conversion_json || '[]');

          const organicImpressions = impressions.map((tot, idx) => {
            const prom = promotedImpressions[idx] || 0;
            return Math.max(0, tot - prom);
          });

          return ok({
            success: true,
            cached: true,
            item_id: itemId,
            ebay_listing_id: cleanListingId,
            range_days: cached.range_days,
            period_start: cached.period_start,
            period_end: cached.period_end,
            fetched_at: cached.fetched_at,
            total_impressions: cached.total_impressions,
            promoted_impressions: cached.promoted_impressions,
            organic_impressions: cached.organic_impressions,
            total_page_views: cached.total_page_views,
            click_through_rate: cached.click_through_rate,
            sales_conversion_rate: cached.sales_conversion_rate,
            dates,
            impressions,
            promoted_impressions_series: promotedImpressions,
            organic_impressions_series: organicImpressions,
            page_views: pageViews,
            ctr_series: ctrSeries,
            conversion_series: conversionSeries
          });
        }
      }
    }

    // 2. Check token & scope
    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      console.error('[analytics] eBay authentication failed:', e);
      return err('eBay authentication failed. Please reconnect your eBay account.', 401);
    }

    const tokenRow = await env.DB.prepare(
      'SELECT scopes FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(payload.userId).first();

    const scopes = tokenRow?.scopes || '';
    if (!scopes.includes('sell.analytics.readonly')) {
      return ok({
        success: false,
        needsReauth: true,
        item_id: itemId,
        ebay_listing_id: cleanListingId,
        error: 'eBay Sell Analytics scope (sell.analytics.readonly) is not granted. Please re-authorize your eBay account.'
      });
    }

    // 3. Compute date range in Pacific Time (eBay headquarters time zone)
    // Analytics traffic reports have a 1-day reporting lag; end date must not be in the future.
    function getPstDateString(daysAgo = 0) {
      const now = new Date();
      const pstDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000));
      return pstDate.replace(/-/g, '');
    }

    function formatIsoDate(pstStr) {
      if (!pstStr || pstStr.length !== 8) return pstStr;
      return `${pstStr.slice(0, 4)}-${pstStr.slice(4, 6)}-${pstStr.slice(6, 8)}`;
    }

    const periodEndStr = getPstDateString(1);
    const periodStartStr = getPstDateString(rangeDays);
    const periodEnd = formatIsoDate(periodEndStr);
    const periodStart = formatIsoDate(periodStartStr);

    // 4. Query eBay Sell Analytics API with valid metric names and filter-embedded date_range
    const apiBase = getEbayApiBase(env);
    const metricsParam = 'LISTING_IMPRESSION_TOTAL,LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE';
    const filterParam = `marketplace_ids:{EBAY_US},listing_ids:{${cleanListingId}},date_range:[${periodStartStr}..${periodEndStr}]`;
    const analyticsUrl = `${apiBase}/sell/analytics/v1/traffic_report?dimension=DAY&metric=${metricsParam}&filter=${encodeURIComponent(filterParam)}`;

    let ebayData = null;
    try {
      const res = await fetch(analyticsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`[analytics] eBay API responded with ${res.status}:`, errorText);
        if (res.status === 403 || errorText.includes('scope') || errorText.includes('Unauthorized')) {
          return ok({
            success: false,
            needsReauth: true,
            item_id: itemId,
            ebay_listing_id: cleanListingId,
            error: 'eBay Analytics scope approval required. Please re-authorize your eBay account.'
          });
        }
        return err('eBay Analytics request failed. Please try reconnecting your account.', res.status);
      }

      ebayData = await res.json();
    } catch (e) {
      console.error('[analytics] Failed to fetch traffic report from eBay:', e);
      return err('Failed to fetch traffic report from eBay. Please try again.', 500);
    }

    // 5. Parse eBay Analytics Data
    const metricKeyMap = {};
    (ebayData.header?.metrics || []).forEach((m, idx) => {
      if (m.key) metricKeyMap[m.key] = idx;
    });

    const firstRecord = ebayData.records?.[0]?.metricValues || [];
    const getMetricVal = (key) => {
      const idx = metricKeyMap[key];
      if (idx !== undefined && firstRecord[idx]) {
        return parseFloat(firstRecord[idx].value) || 0;
      }
      return 0;
    };

    const totalImpressions = Math.round(getMetricVal('LISTING_IMPRESSION_TOTAL'));
    const searchImpressions = Math.round(getMetricVal('LISTING_IMPRESSION_SEARCH_RESULTS_PAGE'));
    const totalPageViews = Math.round(getMetricVal('LISTING_VIEWS_TOTAL'));
    const rawCtr = getMetricVal('CLICK_THROUGH_RATE');
    const rawConversion = getMetricVal('SALES_CONVERSION_RATE');

    const clickThroughRate = rawCtr > 0
      ? parseFloat(rawCtr.toFixed(2))
      : (totalImpressions > 0 ? parseFloat(((totalPageViews / totalImpressions) * 100).toFixed(2)) : 0.0);

    const salesConversionRate = rawConversion > 0
      ? parseFloat(rawConversion.toFixed(2))
      : 0.0;

    const totalPromoted = Math.max(0, totalImpressions - searchImpressions);
    const totalOrganic = searchImpressions > 0 ? searchImpressions : totalImpressions;

    // Generate daily time series
    const dates = [];
    const impressions = [];
    const promotedImpressions = [];
    const organicImpressions = [];
    const pageViews = [];
    const ctrSeries = [];
    const conversionSeries = [];

    const startMs = new Date(periodStart).getTime();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      dates.push(dateStr);
      // Evenly distribute or baseline across active days
      impressions.push(Math.round(totalImpressions / rangeDays));
      promotedImpressions.push(Math.round(totalPromoted / rangeDays));
      organicImpressions.push(Math.round(totalOrganic / rangeDays));
      pageViews.push(Math.round(totalPageViews / rangeDays));
      ctrSeries.push(clickThroughRate);
      conversionSeries.push(salesConversionRate);
    }

    const nowIso = new Date().toISOString();
    const analyticsId = `ana_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // 6. Save to D1
    await env.DB.prepare(`
      DELETE FROM auction_item_analytics
      WHERE item_id = ? AND user_id = ? AND range_days = ?
    `).bind(itemId, payload.userId, rangeDays).run();

    await env.DB.prepare(`
      INSERT INTO auction_item_analytics (
        id, item_id, user_id, ebay_listing_id, period_start, period_end,
        granularity, range_days, total_impressions, promoted_impressions,
        organic_impressions, total_page_views, click_through_rate, sales_conversion_rate,
        dates_json, impressions_json, promoted_impressions_json, page_views_json,
        ctr_json, conversion_json, raw_response, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'DAY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      analyticsId,
      itemId,
      payload.userId,
      cleanListingId,
      periodStart,
      periodEnd,
      rangeDays,
      totalImpressions,
      totalPromoted,
      totalOrganic,
      totalPageViews,
      clickThroughRate,
      salesConversionRate,
      JSON.stringify(dates),
      JSON.stringify(impressions),
      JSON.stringify(promotedImpressions),
      JSON.stringify(pageViews),
      JSON.stringify(ctrSeries),
      JSON.stringify(conversionSeries),
      JSON.stringify(ebayData || {}),
      nowIso
    ).run();

    // 7. Update snapshot columns on auction_items if 30-day range
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
        nowIso,
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
      cached: false,
      item_id: itemId,
      ebay_listing_id: cleanListingId,
      range_days: rangeDays,
      period_start: periodStart,
      period_end: periodEnd,
      fetched_at: nowIso,
      total_impressions: totalImpressions,
      promoted_impressions: totalPromoted,
      organic_impressions: totalOrganic,
      total_page_views: totalPageViews,
      click_through_rate: clickThroughRate,
      sales_conversion_rate: salesConversionRate,
      dates,
      impressions,
      promoted_impressions_series: promotedImpressions,
      organic_impressions_series: organicImpressions,
      page_views: pageViews,
      ctr_series: ctrSeries,
      conversion_series: conversionSeries
    });
  });
}

/**
 * POST /api/ebay/analytics/ingest-traffic
 *
 * Fetches daily-granularity eBay Analytics data for one item and upserts
 * individual day rows into the listing_traffic table.
 *
 * Unlike the GET handler (aggregate 30-day windows in auction_item_analytics),
 * this endpoint stores one row per ebay_listing_id per calendar day (Pacific Time),
 * enabling per-day trend charts and drill-down views.
 *
 * Protocol rules enforced (from ebay-apis-reference.md Section 4):
 *   - Filter nesting: date_range inside the filter param
 *   - Pacific Time (America/Los_Angeles) boundaries
 *   - T-1 lag: end date is always yesterday PT to prevent error 50018
 *
 * Body: { item_id: string, range?: number (days, default 30, max 90) }
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

    // --- Check scope ---
    const tokenRow = await env.DB.prepare(
      'SELECT scopes FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(payload.userId).first();
    const scopes = tokenRow?.scopes || '';
    if (!scopes.includes('sell.analytics.readonly')) {
      return ok({
        success: false,
        needsReauth: true,
        error: 'sell.analytics.readonly scope not granted. Re-authorize eBay account.'
      });
    }

    let accessToken;
    try {
      accessToken = await getEbayUserToken(env, payload.userId);
    } catch (e) {
      console.error('[analytics] eBay authentication failed:', e);
      return err('eBay authentication failed. Please reconnect your eBay account.', 401);
    }

    // --- Pacific Time date boundaries with mandatory T-1 lag ---
    // Builds YYYYMMDD strings in Pacific Time to avoid eBay error 50018.
    function getPacificYMD(daysAgo = 0) {
      const target = new Date(Date.now() - daysAgo * 86400000);
      const parts  = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year:     'numeric',
        month:    '2-digit',
        day:      '2-digit'
      }).formatToParts(target);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const d = parts.find(p => p.type === 'day').value;
      return `${y}${m}${d}`;
    }

    // End = yesterday Pacific (T-1) - never today to avoid error 50018
    const endYMD   = getPacificYMD(1);
    const startYMD = getPacificYMD(rangeDays);

    // Guard: reject if endYMD >= today Pacific (defensive T-1 validation)
    const todayYMD = getPacificYMD(0);
    if (endYMD >= todayYMD) {
      return err(
        `end_date ${endYMD} must be before today Pacific ${todayYMD}. ` +
        'eBay Analytics requires a 1-day reporting lag (error 50018 prevention).', 400
      );
    }

    // --- Fetch from eBay Analytics API with DAY granularity ---
    const apiBase      = getEbayApiBase(env);
    const metricsParam = 'LISTING_IMPRESSION_TOTAL,LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE';
    const filterParam  = `marketplace_ids:{EBAY_US},listing_ids:{${cleanListingId}},date_range:[${startYMD}..${endYMD}]`;
    const analyticsUrl = `${apiBase}/sell/analytics/v1/traffic_report?dimension=DAY&metric=${metricsParam}&filter=${encodeURIComponent(filterParam)}`;

    let ebayData;
    try {
      const res = await fetch(analyticsUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept:         'application/json'
        }
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[analytics] eBay Analytics API error (${res.status}):`, errText);
        return err('eBay Analytics request failed. Please try reconnecting your account.', res.status);
      }
      ebayData = await res.json();
    } catch (e) {
      console.error('[analytics] Failed to fetch daily traffic from eBay:', e);
      return err('Failed to fetch daily traffic from eBay. Please try again.', 500);
    }

    // --- Parse metric key index map ---
    const metricKeyMap = {};
    (ebayData.header?.metrics || []).forEach((m, idx) => {
      if (m.key) metricKeyMap[m.key] = idx;
    });

    // --- Parse dimensionalDataPoints (one entry per day) ---
    // eBay returns daily data in records[0].dimensionalDataPoints when dimension=DAY
    const dataPoints = ebayData.records?.[0]?.dimensionalDataPoints || [];

    if (!dataPoints.length) {
      return ok({
        success:       true,
        rows_upserted: 0,
        message:       'No daily data points returned from eBay for this listing and date range.',
        listing_id:    cleanListingId,
        range:         `${startYMD}..${endYMD}`
      });
    }

    const nowIso = new Date().toISOString();
    const statements = [];
    let rowsUpserted = 0;

    for (const dp of dataPoints) {
      // dimension value is the date string (YYYYMMDD) when dimension=DAY
      const trafficDate = dp.dimensionValue?.value || dp.value;
      if (!trafficDate || !/^\d{8}$/.test(String(trafficDate))) continue;

      const metricValues = dp.metricValues || [];
      const getVal = (key) => {
        const idx = metricKeyMap[key];
        if (idx !== undefined && metricValues[idx]) {
          return parseFloat(metricValues[idx].value) || 0;
        }
        return 0;
      };

      const impressionsTotal  = Math.round(getVal('LISTING_IMPRESSION_TOTAL'));
      const impressionsSearch = Math.round(getVal('LISTING_IMPRESSION_SEARCH_RESULTS_PAGE'));
      const pageViewsTotal    = Math.round(getVal('LISTING_VIEWS_TOTAL'));
      const rawCtr            = getVal('CLICK_THROUGH_RATE');
      const rawConv           = getVal('SALES_CONVERSION_RATE');

      const ctr  = rawCtr  > 0 ? parseFloat(rawCtr.toFixed(4))  : 0.0;
      const conv = rawConv > 0 ? parseFloat(rawConv.toFixed(4)) : 0.0;

      const rowId = `lt-${crypto.randomUUID()}`;

      // INSERT OR REPLACE deduplicates on (ebay_listing_id, traffic_date) UNIQUE constraint
      statements.push(env.DB.prepare(`
        INSERT OR REPLACE INTO listing_traffic (
          id, item_id, user_id, ebay_listing_id, traffic_date,
          impressions_total, impressions_search, page_views_total,
          click_through_rate, sales_conversion_rate, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        rowId, itemId, payload.userId, cleanListingId, String(trafficDate),
        impressionsTotal, impressionsSearch, pageViewsTotal,
        ctr, conv, nowIso
      ));

      rowsUpserted++;
    }

    if (statements.length > 0) {
      await env.DB.batch(statements);
    }

    return ok({
      success:       true,
      rows_upserted: rowsUpserted,
      listing_id:    cleanListingId,
      range:         `${startYMD}..${endYMD}`,
      fetched_at:    nowIso
    });
  });
}
