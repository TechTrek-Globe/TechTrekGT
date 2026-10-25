import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEbayDailyTraffic,
  parseEbayRangeTotals,
  extractTotalViews,
  extractTotalImpressions,
  getPacificYMD,
  formatIsoDate,
  getPacificDayStartIso,
  getNextPacificResetIso,
  getEbayAnalyticsQuota,
  onRequestGet as onAnalyticsGet,
  onRequestPost as onIngestPost
} from '../functions/api/ebay/analytics.js';
import { createToken } from '../functions/utils/auth.js';

describe('T-07: Real Persisted Traffic Analytics vs Synthesized Series (CRIT-004, IA-006)', () => {
  const JWT_SECRET = 'test-jwt-secret-t07-secure-bytes';
  const testUserId = 'user-t07-analytics-test';
  let authToken;

  before(async () => {
    authToken = await createToken({ userId: testUserId }, JWT_SECRET);
  });

  describe('Unit: parseEbayDailyTraffic with 30-point and gapped fixtures', () => {
    it('parses a full 30-point fixture correctly', () => {
      const headerMetrics = [
        { key: 'LISTING_IMPRESSION_TOTAL' },
        { key: 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE' },
        { key: 'LISTING_VIEWS_TOTAL' },
        { key: 'CLICK_THROUGH_RATE' },
        { key: 'SALES_CONVERSION_RATE' }
      ];

      const dimensionalDataPoints = [];
      for (let i = 1; i <= 30; i++) {
        const dayStr = i < 10 ? `0${i}` : `${i}`;
        dimensionalDataPoints.push({
          dimensionValue: { value: `202609${dayStr}` },
          metricValues: [
            { value: String(100 + i * 5) },  // impressions
            { value: String(60 + i * 2) },   // search impressions
            { value: String(10 + i) },        // page views
            { value: String(((10 + i) / (100 + i * 5)).toFixed(4)) }, // CTR
            { value: String((0.05).toFixed(4)) }                      // conversion
          ]
        });
      }

      const fixture = {
        header: { metrics: headerMetrics },
        records: [{ dimensionalDataPoints }]
      };

      const result = parseEbayDailyTraffic(fixture);
      assert.strictEqual(result.length, 30);
      assert.strictEqual(result[0].trafficDate, '20260901');
      assert.strictEqual(result[0].impressionsTotal, 105);
      assert.strictEqual(result[0].impressionsSearch, 62);
      assert.strictEqual(result[0].pageViewsTotal, 11);
      assert.strictEqual(result[29].trafficDate, '20260930');
      assert.strictEqual(result[29].impressionsTotal, 250);
      assert.strictEqual(result[29].pageViewsTotal, 40);
    });

    it('parses a gapped fixture without interpolating or filling synthetic zero points', () => {
      const headerMetrics = [
        { key: 'LISTING_IMPRESSION_TOTAL' },
        { key: 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE' },
        { key: 'LISTING_VIEWS_TOTAL' },
        { key: 'CLICK_THROUGH_RATE' },
        { key: 'SALES_CONVERSION_RATE' }
      ];

      // Only days 01, 05, and 12 exist in eBay's returned report
      const dimensionalDataPoints = [
        {
          dimensionValue: { value: '20260901' },
          metricValues: [
            { value: '42' },
            { value: '25' },
            { value: '3' },
            { value: '0.0714' },
            { value: '0.0000' }
          ]
        },
        {
          dimensionValue: { value: '20260905' },
          metricValues: [
            { value: '88' },
            { value: '50' },
            { value: '8' },
            { value: '0.0909' },
            { value: '0.1250' }
          ]
        },
        {
          dimensionValue: { value: '20260912' },
          metricValues: [
            { value: '15' },
            { value: '10' },
            { value: '1' },
            { value: '0.0667' },
            { value: '0.0000' }
          ]
        }
      ];

      const fixture = {
        header: { metrics: headerMetrics },
        records: [{ dimensionalDataPoints }]
      };

      const result = parseEbayDailyTraffic(fixture);
      // Gapped report must ONLY return the 3 actual data points
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result.map(r => r.trafficDate), ['20260901', '20260905', '20260912']);
      assert.strictEqual(result[0].impressionsTotal, 42);
      assert.strictEqual(result[1].impressionsTotal, 88);
      assert.strictEqual(result[2].impressionsTotal, 15);
    });

    it('parses alternative view metric keys and granular source view sums correctly', () => {
      const headerMetrics = [
        { key: 'TOTAL_IMPRESSION_TOTAL' },
        { key: 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE' },
        { key: 'TOTAL_LISTING_VIEWS' },
        { key: 'CLICK_THROUGH_RATE' },
        { key: 'SALES_CONVERSION_RATE' }
      ];

      const records = [
        {
          dimensionValues: [{ value: '20261001' }],
          metricValues: [
            { value: '150' },
            { value: '100' },
            { value: '15' },
            { value: '0.10' },
            { value: '0.05' }
          ]
        }
      ];

      const fixture = { header: { metrics: headerMetrics }, records };
      const result = parseEbayDailyTraffic(fixture);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].impressionsTotal, 150);
      assert.strictEqual(result[0].pageViewsTotal, 15);
      assert.strictEqual(result[0].clickThroughRate, 0.10);

      const rangeTotals = parseEbayRangeTotals(fixture);
      assert.strictEqual(rangeTotals.impressionsTotal, 150);
      assert.strictEqual(rangeTotals.pageViewsTotal, 15);
      assert.strictEqual(rangeTotals.clickThroughRate, 10.0);
    });

    it('sums granular source views when aggregate view key is absent', () => {
      const headerMetrics = [
        { key: 'LISTING_IMPRESSION_TOTAL' },
        { key: 'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE' },
        { key: 'LISTING_VIEWS_SOURCE_DIRECT' },
        { key: 'LISTING_VIEWS_SOURCE_STORE' }
      ];

      const records = [
        {
          dimensionValues: [{ value: '20261002' }],
          metricValues: [
            200, // primitive number support
            5,
            3,
            2
          ]
        }
      ];

      const fixture = { header: { metrics: headerMetrics }, records };
      const result = parseEbayDailyTraffic(fixture);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].impressionsTotal, 200);
      assert.strictEqual(result[0].pageViewsTotal, 10); // 5 + 3 + 2 = 10
      assert.strictEqual(result[0].clickThroughRate, 0.05); // (10 / 200) = 0.05
    });
  });

  describe('Integration: GET /api/ebay/analytics serves real persisted traffic', () => {
    const items = new Map([
      ['itm-perf-1', {
        id: 'itm-perf-1',
        user_id: testUserId,
        ebay_listing_id: '166889922001',
        status: 'Active'
      }]
    ]);

    const trafficRows = new Map();
    const tokens = new Map([
      [testUserId, { scopes: 'sell.analytics.readonly sell.inventory' }]
    ]);

    const mockDb = {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async first() {
                if (sql.includes('SELECT id, item_name, ebay_listing_id')) {
                  const itm = items.get(params[0]);
                  return itm && itm.user_id === params[1] ? itm : null;
                }
                if (sql.includes('SELECT scopes FROM ebay_oauth_tokens')) {
                  return tokens.get(params[0]) || null;
                }
                return null;
              },
              async all() {
                if (sql.includes('FROM listing_traffic')) {
                  const [itemId, userId, startYMD, endYMD] = params;
                  const res = [...trafficRows.values()].filter(
                    r => r.item_id === itemId &&
                         r.user_id === userId &&
                         r.traffic_date >= startYMD &&
                         r.traffic_date <= endYMD
                  ).sort((a, b) => a.traffic_date.localeCompare(b.traffic_date));
                  return { results: res };
                }
                return { results: [] };
              },
              async run() {
                if (sql.includes('DELETE FROM auction_item_analytics')) {
                  return { success: true };
                }
                if (sql.includes('INSERT OR REPLACE INTO listing_traffic')) {
                  // Params: rowId, itemId, userId, listingId, trafficDate, impTot, impSearch, pvTot, ctr, conv, nowIso
                  trafficRows.set(`${params[3]}_${params[4]}`, {
                    id: params[0],
                    item_id: params[1],
                    user_id: params[2],
                    ebay_listing_id: params[3],
                    traffic_date: params[4],
                    impressions_total: params[5],
                    impressions_search: params[6],
                    page_views_total: params[7],
                    click_through_rate: params[8],
                    sales_conversion_rate: params[9],
                    fetched_at: params[10]
                  });
                  return { success: true };
                }
                return { success: true };
              }
            };
          }
        };
      },
      async batch(statements) {
        for (const stmt of statements) {
          await stmt.run();
        }
        return [];
      }
    };

    const env = {
      JWT_SECRET,
      DB: mockDb,
      TOKEN_ENCRYPTION_KEY: 'test-encryption-key-t07-32-bytes-long!'
    };

    it('reports data_complete: false and lists missing_dates when gaps exist', async () => {
      // Seed trafficRows with only 2 days of data for the 30-day window
      const date1 = getPacificYMD(5);
      const date2 = getPacificYMD(2);
      const nowIso = new Date().toISOString();

      trafficRows.set(`166889922001_${date1}`, {
        id: 'lt-1',
        item_id: 'itm-perf-1',
        user_id: testUserId,
        ebay_listing_id: '166889922001',
        traffic_date: date1,
        impressions_total: 120,
        impressions_search: 80,
        page_views_total: 12,
        click_through_rate: 0.10,
        sales_conversion_rate: 0.0833,
        fetched_at: nowIso
      });

      trafficRows.set(`166889922001_${date2}`, {
        id: 'lt-2',
        item_id: 'itm-perf-1',
        user_id: testUserId,
        ebay_listing_id: '166889922001',
        traffic_date: date2,
        impressions_total: 80,
        impressions_search: 50,
        page_views_total: 8,
        click_through_rate: 0.10,
        sales_conversion_rate: 0.0,
        fetched_at: nowIso
      });

      const req = new Request('https://techtrekgt.com/api/ebay/analytics?item_id=itm-perf-1&range=30', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await onAnalyticsGet({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.success);

      // Verify data_complete is false
      assert.strictEqual(data.data_complete, false);
      assert.strictEqual(data.dates.length, 2);
      assert.strictEqual(data.missing_dates.length, 28); // 30 - 2 = 28 missing dates

      // Assert period totals match EXACT sum of returned daily values
      assert.strictEqual(data.total_impressions, 200); // 120 + 80
      assert.strictEqual(data.promoted_impressions, 70); // (120-80) + (80-50) = 40 + 30
      assert.strictEqual(data.organic_impressions, 130); // 80 + 50
      assert.strictEqual(data.total_page_views, 20); // 12 + 8

      // Assert NO value is produced by dividing total by 30
      // 200 / 30 = 6.666... neither 6 nor 7 must appear in data.impressions
      assert.deepStrictEqual(data.impressions, [120, 80]);
      assert.deepStrictEqual(data.page_views, [12, 8]);
    });

    it('returns needsReauth when sell.analytics.readonly scope is not granted', async () => {
      tokens.set(testUserId, { scopes: 'sell.inventory' }); // missing sell.analytics.readonly

      // Clear cached rows so ingestion triggers
      trafficRows.clear();

      const req = new Request('https://techtrekgt.com/api/ebay/analytics?item_id=itm-perf-1&range=30&force=true', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await onAnalyticsGet({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.needsReauth, true);
    });

    it('triggers ingestion when cached rows only cover 30 days and 90 days are queried', async () => {
      // Seed trafficRows with only recent rows (T-10 and T-5)
      const date1 = getPacificYMD(10);
      const date2 = getPacificYMD(5);
      const nowIso = new Date().toISOString();

      trafficRows.set(`166889922001_${date1}`, {
        id: 'lt-10',
        item_id: 'itm-perf-1',
        user_id: testUserId,
        ebay_listing_id: '166889922001',
        traffic_date: date1,
        impressions_total: 50,
        impressions_search: 50,
        page_views_total: 5,
        click_through_rate: 0.10,
        sales_conversion_rate: 0.0,
        fetched_at: nowIso
      });

      trafficRows.set(`166889922001_${date2}`, {
        id: 'lt-5',
        item_id: 'itm-perf-1',
        user_id: testUserId,
        ebay_listing_id: '166889922001',
        traffic_date: date2,
        impressions_total: 30,
        impressions_search: 30,
        page_views_total: 3,
        click_through_rate: 0.10,
        sales_conversion_rate: 0.0,
        fetched_at: nowIso
      });

      // Token has sell.analytics.readonly missing so triggering ingestion returns needsReauth
      tokens.set(testUserId, { scopes: 'sell.inventory' });

      const req = new Request('https://techtrekgt.com/api/ebay/analytics?item_id=itm-perf-1&range=90', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await onAnalyticsGet({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      // Because cache only covered T-10 (not T-90), needsIngestion triggered and reached scope check
      assert.strictEqual(data.needsReauth, true);
    });

    it('triggers ingestion when item has date_listed but cached rows count is less than requested range (RANGE-001)', async () => {
      // Create an item with recent date_listed (T-15)
      const recentDate = getPacificYMD(15);
      items.set('itm-recent-1', {
        id: 'itm-recent-1',
        user_id: testUserId,
        ebay_listing_id: '166889922002',
        status: 'Active',
        date_listed: `${recentDate.slice(0, 4)}-${recentDate.slice(4, 6)}-${recentDate.slice(6, 8)}`
      });

      // Seed exactly 30 rows in DB for this item
      const nowIso = new Date().toISOString();
      for (let i = 1; i <= 30; i++) {
        const d = getPacificYMD(i);
        trafficRows.set(`166889922002_${d}`, {
          id: `lt-recent-${i}`,
          item_id: 'itm-recent-1',
          user_id: testUserId,
          ebay_listing_id: '166889922002',
          traffic_date: d,
          impressions_total: 10,
          impressions_search: 10,
          page_views_total: 1,
          click_through_rate: 0.10,
          sales_conversion_rate: 0.0,
          fetched_at: nowIso
        });
      }

      // sell.analytics.readonly missing so triggering ingestion returns needsReauth
      tokens.set(testUserId, { scopes: 'sell.inventory' });

      // Requesting 60 days must trigger ingestion because rows.length (30) < 60
      const req60 = new Request('https://techtrekgt.com/api/ebay/analytics?item_id=itm-recent-1&range=60', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const res60 = await onAnalyticsGet({ request: req60, env });
      const data60 = await res60.json();
      assert.strictEqual(data60.needsReauth, true, '60 days must trigger ingestion when only 30 rows cached');

      // Requesting 90 days must trigger ingestion because rows.length (30) < 90
      const req90 = new Request('https://techtrekgt.com/api/ebay/analytics?item_id=itm-recent-1&range=90', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const res90 = await onAnalyticsGet({ request: req90, env });
      const data90 = await res90.json();
      assert.strictEqual(data90.needsReauth, true, '90 days must trigger ingestion when only 30 rows cached');
    });

    it('calculates Pacific day start and next reset time exactly 24 hours apart', () => {
      const startIso = getPacificDayStartIso();
      const nextResetIso = getNextPacificResetIso();

      assert.ok(startIso.endsWith('Z') || startIso.includes('T'));
      assert.ok(nextResetIso.endsWith('Z') || nextResetIso.includes('T'));

      const startTime = new Date(startIso).getTime();
      const nextTime = new Date(nextResetIso).getTime();
      const diffMs = nextTime - startTime;

      // Exactly 24 hours
      assert.strictEqual(diffMs, 24 * 60 * 60 * 1000);
    });

    it('returns quota object via GET /api/ebay/analytics?quota_only=1 without requiring item_id', async () => {
      const req = new Request('https://techtrekgt.com/api/ebay/analytics?quota_only=1', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await onAnalyticsGet({ request: req, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.success, true);
      assert.ok(data.quota, 'quota object should be returned');
      assert.strictEqual(data.quota.daily_limit, 100);
      assert.strictEqual(typeof data.quota.used, 'number');
      assert.strictEqual(typeof data.quota.remaining, 'number');
      assert.strictEqual(data.quota.used + data.quota.remaining, 100);
      assert.ok(data.quota.resets_at, 'resets_at timestamp should exist');
      assert.ok(data.quota.resets_in_hours >= 0, 'resets_in_hours should be non-negative');
    });
  });
});
