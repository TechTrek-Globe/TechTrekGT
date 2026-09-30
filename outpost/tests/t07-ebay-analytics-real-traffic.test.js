import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEbayDailyTraffic,
  getPacificYMD,
  formatIsoDate,
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
  });
});
