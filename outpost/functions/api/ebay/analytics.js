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
      return err(`eBay authentication failed: ${e.message}`, 401);
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

    // 3. Compute date range
    const endDateObj = new Date();
    const startDateObj = new Date();
    startDateObj.setDate(endDateObj.getDate() - rangeDays);

    const fmtDate = (d) => d.toISOString().split('T')[0];
    const periodEnd = fmtDate(endDateObj);
    const periodStart = fmtDate(startDateObj);

    // 4. Query eBay Sell Analytics API
    const apiBase = getEbayApiBase(env);
    const metricsParam = 'IMPRESSION_TOTAL,IMPRESSION_PROMOTED,PAGE_VIEW_ITEM_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE';
    const analyticsUrl = `${apiBase}/sell/analytics/v1/traffic_report?dimension=DAY&metric=${metricsParam}&filter=listing_ids:{${cleanListingId}}&date_range:[${periodStart}..${periodEnd}]`;

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
        console.warn(`[analytics] eBay API responded with ${res.status}:`, errorText);
        if (res.status === 403 || errorText.includes('scope') || errorText.includes('Unauthorized')) {
          return ok({
            success: false,
            needsReauth: true,
            item_id: itemId,
            ebay_listing_id: cleanListingId,
            error: 'eBay Analytics scope approval required. Please re-authorize your eBay account.'
          });
        }
        return err(`eBay Analytics API error (${res.status}): ${errorText.slice(0, 200)}`, res.status);
      }

      ebayData = await res.json();
    } catch (e) {
      return err(`Failed to fetch traffic report from eBay: ${e.message}`, 500);
    }

    // 5. Parse eBay Analytics Data
    const dateMap = new Map();

    // Pre-populate consecutive daily calendar dates for clean continuous charting
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(endDateObj.getDate() - i);
      const dateStr = fmtDate(d);
      dateMap.set(dateStr, {
        date: dateStr,
        impressions_total: 0,
        impressions_promoted: 0,
        page_views: 0,
        ctr: 0.0,
        conversion: 0.0
      });
    }

    // Extract records from dimensionNodes (eBay format)
    const nodes = ebayData?.dimensionNodes || [];
    for (const node of nodes) {
      const dateKey = node.dimensionKey || node.name;
      if (!dateKey) continue;
      const cleanDate = dateKey.slice(0, 10);

      const entry = dateMap.get(cleanDate) || {
        date: cleanDate,
        impressions_total: 0,
        impressions_promoted: 0,
        page_views: 0,
        ctr: 0.0,
        conversion: 0.0
      };

      const metrics = node.metrics || [];
      for (const m of metrics) {
        const k = m.key || m.metricKey;
        const v = parseFloat(m.value) || 0;
        if (k === 'IMPRESSION_TOTAL') entry.impressions_total = Math.round(v);
        else if (k === 'IMPRESSION_PROMOTED') entry.impressions_promoted = Math.round(v);
        else if (k === 'PAGE_VIEW_ITEM_TOTAL') entry.page_views = Math.round(v);
        else if (k === 'CLICK_THROUGH_RATE') entry.ctr = parseFloat(v.toFixed(4));
        else if (k === 'SALES_CONVERSION_RATE') entry.conversion = parseFloat(v.toFixed(4));
      }

      dateMap.set(cleanDate, entry);
    }

    // Also support fallback parsing if metricData array format is used
    if (nodes.length === 0 && Array.isArray(ebayData?.metricData)) {
      const headerDates = (ebayData.dimensionMetadata?.[0]?.dimensionValues || []).map(dv => dv.value?.slice(0, 10));
      if (headerDates.length > 0) {
        for (const md of ebayData.metricData) {
          const key = md.metricKey;
          (md.data || []).forEach((itemVal, idx) => {
            const dateStr = headerDates[idx];
            if (dateStr && dateMap.has(dateStr)) {
              const entry = dateMap.get(dateStr);
              const v = parseFloat(itemVal.value) || 0;
              if (key === 'IMPRESSION_TOTAL') entry.impressions_total = Math.round(v);
              else if (key === 'IMPRESSION_PROMOTED') entry.impressions_promoted = Math.round(v);
              else if (key === 'PAGE_VIEW_ITEM_TOTAL') entry.page_views = Math.round(v);
              else if (key === 'CLICK_THROUGH_RATE') entry.ctr = parseFloat(v.toFixed(4));
              else if (key === 'SALES_CONVERSION_RATE') entry.conversion = parseFloat(v.toFixed(4));
            }
          });
        }
      }
    }

    const sortedEntries = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const dates = sortedEntries.map(e => e.date);
    const impressions = sortedEntries.map(e => e.impressions_total);
    const promotedImpressions = sortedEntries.map(e => e.impressions_promoted);
    const organicImpressions = sortedEntries.map(e => Math.max(0, e.impressions_total - e.impressions_promoted));
    const pageViews = sortedEntries.map(e => e.page_views);
    const ctrSeries = sortedEntries.map(e => e.ctr);
    const conversionSeries = sortedEntries.map(e => e.conversion);

    const totalImpressions = impressions.reduce((a, b) => a + b, 0);
    const totalPromoted = promotedImpressions.reduce((a, b) => a + b, 0);
    const totalOrganic = Math.max(0, totalImpressions - totalPromoted);
    const totalPageViews = pageViews.reduce((a, b) => a + b, 0);

    const clickThroughRate = totalImpressions > 0
      ? parseFloat(((totalPageViews / totalImpressions) * 100).toFixed(2))
      : 0.0;

    const validConversions = conversionSeries.filter(c => c > 0);
    const salesConversionRate = validConversions.length > 0
      ? parseFloat((validConversions.reduce((a, b) => a + b, 0) / validConversions.length * 100).toFixed(2))
      : 0.0;

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
