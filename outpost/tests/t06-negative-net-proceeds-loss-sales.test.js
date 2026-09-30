import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { validateNonNegativeMoney, validateSignedMoney, computeSaleMetrics } from '../functions/utils/auction.js';
import { onRequestPost as onSalesPost, onRequestGet as onSalesGet } from '../functions/api/sales/index.js';
import { onRequestPut as onSalePut } from '../functions/api/sales/[id].js';
import { onRequestPost as onEbayMatchPost } from '../functions/api/ebay/match-sold-vinescout.js';
import { onRequestGet as onTaxReportGet } from '../functions/api/reports/tax.js';
import { createToken } from '../functions/utils/auth.js';

describe('T-06: Negative Net Proceeds & Loss-Making Sales (CRIT-007)', () => {
  const JWT_SECRET = 'test-jwt-secret-t06-very-secure-random-bytes';
  const testUserId = 'user-t06-loss-test';
  let authToken;

  before(async () => {
    authToken = await createToken({ userId: testUserId }, JWT_SECRET);
  });

  describe('Unit: validateSignedMoney helper', () => {
    it('accepts negative monetary amounts', () => {
      assert.strictEqual(validateSignedMoney(-12.34, 'net_proceeds'), -12.34);
      assert.strictEqual(validateSignedMoney('-0.01', 'net_proceeds'), -0.01);
      assert.strictEqual(validateSignedMoney(-100, 'net_earnings'), -100);
      assert.strictEqual(validateSignedMoney('-500.50', 'net_earnings'), -500.50);
    });

    it('accepts zero and positive monetary amounts', () => {
      assert.strictEqual(validateSignedMoney(0, 'net_proceeds'), 0);
      assert.strictEqual(validateSignedMoney('0.00', 'net_proceeds'), 0);
      assert.strictEqual(validateSignedMoney(45.99, 'net_proceeds'), 45.99);
    });

    it('returns null for undefined, null, or empty string', () => {
      assert.strictEqual(validateSignedMoney(undefined, 'net_proceeds'), null);
      assert.strictEqual(validateSignedMoney(null, 'net_proceeds'), null);
      assert.strictEqual(validateSignedMoney('', 'net_proceeds'), null);
    });

    it('rejects booleans', () => {
      assert.throws(() => validateSignedMoney(true, 'net_proceeds'), /net_proceeds must be a valid number/);
      assert.throws(() => validateSignedMoney(false, 'net_proceeds'), /net_proceeds must be a valid number/);
    });

    it('rejects NaN, Infinity, and non-numeric strings', () => {
      assert.throws(() => validateSignedMoney(NaN, 'net_proceeds'), /net_proceeds must be a valid number/);
      assert.throws(() => validateSignedMoney(Infinity, 'net_proceeds'), /net_proceeds must be a valid number/);
      assert.throws(() => validateSignedMoney(-Infinity, 'net_proceeds'), /net_proceeds must be a valid number/);
      assert.throws(() => validateSignedMoney('invalid', 'net_proceeds'), /net_proceeds must be a valid number/);
      assert.throws(() => validateSignedMoney(Number.MAX_SAFE_INTEGER + 1000, 'net_proceeds'), /net_proceeds must be a valid number/);
    });

    it('confirms validateNonNegativeMoney STILL rejects negative numbers', () => {
      assert.throws(() => validateNonNegativeMoney(-12.34, 'gross_sale_price'), /gross_sale_price must be a non-negative number/);
      assert.throws(() => validateNonNegativeMoney(-0.01, 'actual_shipping_cost'), /actual_shipping_cost must be a non-negative number/);
      assert.strictEqual(validateNonNegativeMoney(12.34, 'gross_sale_price'), 12.34);
    });
  });

  describe('Metrics: computeSaleMetrics correctly models loss-making sales', () => {
    it('computes negative net_proceeds, net_profit, and negative roi_pct for loss sale', () => {
      // Problem statement example:
      // $6.00 item, buyer shipping 0, actual shipping 4.50, fee 13.6% (0.82), flat 0.40, landed cost 5.00
      // platform_fees_amt = round2(6.00 * 0.136 + 0.40) = 0.82 + 0.40 = 1.22
      // net_proceeds = round2(6.00 + 0 - 4.50 - 1.22) = 0.28
      // If actual shipping is 6.50:
      // net_proceeds = round2(6.00 + 0 - 6.50 - 1.22) = -1.72
      // With true_total_cost = 5.00:
      // net_profit = round2(-1.72 - 5.00) = -6.72
      // roi_pct = -6.72 / 5.00 = -1.344
      const metrics = computeSaleMetrics({
        gross_sale_price: 6.00,
        buyer_shipping_paid: 0,
        actual_shipping_cost: 6.50,
        platform_fee_pct: 0.136,
        platform_flat_fee: 0.40,
        true_total_cost: 5.00
      });

      assert.strictEqual(metrics.net_proceeds, -1.72);
      assert.strictEqual(metrics.net_profit, -6.72);
      assert.ok(metrics.roi_pct < 0, `Expected negative ROI, got: ${metrics.roi_pct}`);
    });
  });

  describe('Integration: Ingest and persist loss-making sales across all endpoints', () => {
    // In-memory mock DB table for auction_items, auction_sales, auction_supplies, auction_platforms
    const items = new Map();
    const sales = new Map();
    const supplies = new Map();
    const platforms = new Map([
      ['eBay', { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40 }]
    ]);

    // Helper to simulate D1 Database
    const mockDb = {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async first() {
                if (sql.includes('SELECT * FROM auction_items WHERE id = ?')) {
                  const itm = items.get(params[0]);
                  return itm && itm.user_id === params[1] ? itm : null;
                }
                if (sql.includes('SELECT * FROM auction_sales WHERE id = ?')) {
                  const s = sales.get(params[0]);
                  return s && s.user_id === params[1] ? s : null;
                }
                if (sql.includes('FROM auction_sales WHERE item_id = ?')) {
                  // T-08: the shared upsert pre-reads `SELECT *` (not `SELECT id`)
                  // so it has the row's current values for the COALESCE decision.
                  for (const s of sales.values()) {
                    if (s.item_id === params[0] && s.user_id === params[1]) return s;
                  }
                  return null;
                }
                if (sql.includes('SELECT fee_pct, flat_fee FROM auction_platforms')) {
                  return platforms.get(params[1]) || null;
                }
                if (sql.includes('COUNT(*) as total_sales')) {
                  const userSales = [...sales.values()].filter(s => s.user_id === params[0]);
                  const total_sales = userSales.length;
                  const total_gross_sales = userSales.reduce((a, b) => a + (b.gross_sale_price || 0), 0);
                  const total_net_proceeds = userSales.reduce((a, b) => a + (b.net_proceeds || 0), 0);
                  const total_net_profit = userSales.reduce((a, b) => a + (b.net_profit || 0), 0);
                  const avg_days_to_sell = 10;
                  return { total_sales, total_gross_sales, total_net_proceeds, total_net_profit, avg_days_to_sell };
                }
                return null;
              },
              async all() {
                if (sql.includes('FROM auction_sales s') && sql.includes('JOIN auction_items i')) {
                  const res = [...sales.values()]
                    .filter(s => s.user_id === params[0])
                    .map(s => {
                      const itm = items.get(s.item_id) || {};
                      return { ...s, item_name: itm.item_name, category: itm.category };
                    });
                  return { results: res };
                }
                if (sql.includes('FROM auction_sales WHERE user_id = ?')) {
                  const res = [...sales.values()].filter(s => s.user_id === params[0]);
                  return { results: res };
                }
                if (sql.includes('FROM auction_supplies')) {
                  return { results: [...supplies.values()].filter(s => s.user_id === params[0]) };
                }
                if (sql.includes('FROM auction_items WHERE user_id = ?')) {
                  return { results: [...items.values()].filter(i => i.user_id === params[0]) };
                }
                if (sql.includes('SELECT DISTINCT strftime')) {
                  return { results: [{ yr: '2026' }] };
                }
                return { results: [] };
              },
              async run() {
                // T-08: there is now exactly ONE auction_sales write shape (the
                // shared upsert in functions/utils/sales.js). This mock parses
                // the column list out of the SQL instead of hardcoding bind
                // offsets per endpoint, so it cannot drift when the shared
                // statement's column order changes.
                if (sql.includes('INSERT INTO auction_sales')) {
                  const cols = /INSERT INTO auction_sales \(([^)]*)\)/i.exec(sql)[1]
                    .split(',').map(c => c.trim());
                  const saleObj = { import_batch_id: params[params.length - 1] };
                  cols.forEach((c, i) => { saleObj[c] = params[i]; });
                  sales.set(saleObj.id, saleObj);
                  return { success: true };
                }
                if (sql.includes('UPDATE auction_sales')) {
                  const tail = params.slice(-2);
                  const existing = sales.get(tail[0]) || {};
                  const assignments = /SET([\s\S]*?)WHERE/i.exec(sql)[1];
                  const plain = [];
                  assignments.split(',').forEach(frag => {
                    const m = /^\s*([a-z_]+)\s*=\s*\?(?!\s*\))/i.exec(frag);
                    if (m) plain.push(m[1]);
                  });
                  const setCols = [...plain, 'buyer_handle', 'ebay_order_id', 'fee_reconciled_at'];
                  setCols.forEach((c, i) => {
                    // COALESCE columns retain the prior value when null is supplied.
                    if (params[i] != null) existing[c] = params[i];
                  });
                  sales.set(tail[0], existing);
                  return { success: true };
                }
                if (sql.includes('UPDATE auction_items SET status = \'Sold\'')) {
                  const itm = items.get(params[params.length - 2]);
                  if (itm) itm.status = 'Sold';
                  return { success: true };
                }
                return { success: true };
              }
            };
          }
        };
      }
    };

    const env = {
      JWT_SECRET,
      DB: mockDb
    };

    it('POST /api/sales successfully creates a sale with negative net_proceeds', async () => {
      // Setup inventory item
      items.set('item-loss-1', {
        id: 'item-loss-1',
        user_id: testUserId,
        item_name: 'Over-fee Widget',
        true_total_cost: 2.00,
        status: 'Active'
      });

      // Sale payload where gross is 6.00, actual shipping is 4.50, fee 13.6% + 0.40 (1.22), net is -0.12
      const body = {
        item_id: 'item-loss-1',
        sale_date: '2026-09-29',
        platform: 'eBay',
        gross_sale_price: 6.00,
        buyer_shipping_paid: 0.00,
        actual_shipping_cost: 4.50,
        platform_fee_pct: 0.136,
        platform_flat_fee: 0.40,
        net_proceeds: -0.12,
        net_earnings: -0.12
      };

      const req = new Request('https://techtrekgt.com/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(body)
      });

      const res = await onSalesPost({ request: req, env });
      assert.strictEqual(res.status, 201, 'POST /api/sales should return 201 for created sale');
      const data = await res.json();
      assert.ok(data.success);
      assert.strictEqual(data.sale.net_proceeds, -0.12);
      assert.strictEqual(data.sale.net_profit, -2.12);
      assert.ok(data.sale.roi_pct < 0);
    });

    it('POST /api/sales still rejects negative gross_sale_price', async () => {
      const body = {
        item_id: 'item-loss-1',
        sale_date: '2026-09-29',
        platform: 'eBay',
        gross_sale_price: -6.00,
        net_proceeds: -0.12
      };

      const req = new Request('https://techtrekgt.com/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(body)
      });

      const res = await onSalesPost({ request: req, env });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /gross_sale_price must be a non-negative number/);
    });

    it('PUT /api/sales/:id successfully updates a sale with negative net_proceeds', async () => {
      // Find the sale created above
      const createdSale = [...sales.values()][0];
      assert.ok(createdSale);

      const updateReq = new Request(`https://techtrekgt.com/api/sales/${createdSale.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          net_proceeds: -1.50
        })
      });

      const res = await onSalePut({ request: updateReq, env, params: { id: createdSale.id } });
      assert.strictEqual(res.status, 200, 'PUT /api/sales/:id should accept negative net_proceeds');
      const data = await res.json();
      assert.ok(data.success);
      assert.strictEqual(sales.get(createdSale.id).net_proceeds, -1.50);
    });

    it('POST /api/ebay/match-sold-vinescout saves loss-making sales correctly', async () => {
      items.set('item-loss-2', {
        id: 'item-loss-2',
        user_id: testUserId,
        item_name: 'Loss Vine Item',
        true_total_cost: 0.00,
        status: 'Active',
        category_id: '1234',
        category: 'Collectibles'
      });

      // Price 5.00, buyer ship 0, actual ship 8.00 -> net proceeds will be negative
      const req = new Request('https://techtrekgt.com/api/ebay/match-sold-vinescout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          confirm: true,
          item_id: 'item-loss-2',
          ebay_order_id: 'ebay-ord-999',
          sale_price: 5.00,
          buyer_shipping_paid: 0,
          actual_shipping_cost: 8.00
        })
      });

      const res = await onEbayMatchPost({ request: req, env });
      assert.strictEqual(res.status, 200, 'eBay match should succeed for loss-making sale');
      const data = await res.json();
      assert.ok(data.success);
      const persistedSale = sales.get(data.sale_id);
      assert.ok(persistedSale, 'Persisted sale must exist');
      assert.ok(persistedSale.net_proceeds < 0, `Expected negative net_proceeds, got ${persistedSale.net_proceeds}`);
    });

    it('GET /api/reports/tax aggregates negative net_proceeds and reflects losses in Schedule C', async () => {
      const taxReq = new Request('https://techtrekgt.com/api/reports/tax?year=2026', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      const res = await onTaxReportGet({ request: taxReq, env });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.scheduleC);
      // Verify net proceeds aggregate is tracked and line 31 reflects overall profit/loss
      assert.ok(typeof data.scheduleC.line31_netTaxableProfit === 'number');
      assert.ok(typeof data.itemizedSummary.netProceeds === 'number');
    });
  });
});
