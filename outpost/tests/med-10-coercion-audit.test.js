import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  round2,
  validateNonNegativeMoney,
  computeItemProration,
  computeSaleMetrics,
  computePricingFloors
} from '../functions/utils/auction.js';
import {
  computeItemProration as clientComputeItemProration,
  computeSaleMetrics as clientComputeSaleMetrics,
  computePricingFloors as clientComputePricingFloors
} from '../src/utils/formulaPreview.js';
import { onRequestPost as amazonImportPost } from '../functions/api/import/amazon.js';
import { onRequestPost as amazonUrlImportPost } from '../functions/api/import/amazon-url.js';
import { hashSecret } from '../functions/utils/apiIntegrations.js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec("ALTER TABLE users ADD COLUMN amazon_api_token TEXT;");
  db.exec(auctionSchema);

  return {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

test('MED-10: Pervasive Number(x)||0 Coercion & Financial Calculation Audit', async (t) => {

  await t.test('round2 behavior & null safety', () => {
    // Standard positive numbers
    assert.equal(round2(10.555), 10.56);
    assert.equal(round2(0), 0);
    assert.equal(round2(0.001), 0);

    // Negative numbers (preserved as negative, not coerced to 0)
    assert.equal(round2(-15.25), -15.25);

    // Nullish, empty, or undefined safely default to 0
    assert.equal(round2(null), 0);
    assert.equal(round2(undefined), 0);
    assert.equal(round2(''), 0);
    assert.equal(round2('   '), 0);
  });

  await t.test('computeItemProration: handles optional fields & zero base_total without NaN', () => {
    // Normal invoice with all adjustments
    const normal = computeItemProration(
      { unit_price: 100 },
      { base_total: 200, discount: 20, shipping: 10, tax: 16 }
    );
    assert.equal(normal.proration_weight, 0.5);
    assert.equal(normal.prorated_discount, 10);
    assert.equal(normal.prorated_shipping, 5);
    assert.equal(normal.prorated_tax, 8);
    assert.equal(normal.true_total_cost, 103); // 100 - 10 + 5 + 8

    // Invoice with optional adjustments omitted (undefined/null/0)
    const omittedAdjustments = computeItemProration(
      { unit_price: 50 },
      { base_total: 100 }
    );
    assert.equal(omittedAdjustments.proration_weight, 0.5);
    assert.equal(omittedAdjustments.prorated_discount, 0);
    assert.equal(omittedAdjustments.prorated_shipping, 0);
    assert.equal(omittedAdjustments.prorated_tax, 0);
    assert.equal(omittedAdjustments.true_total_cost, 50);
    assert.equal(isNaN(omittedAdjustments.true_total_cost), false);

    // Zero base_total guard (e.g. invoice where all items were $0 acquisition items)
    const zeroBase = computeItemProration(
      { unit_price: 0 },
      { base_total: 0, discount: 0, shipping: 0, tax: 0 }
    );
    assert.equal(zeroBase.proration_weight, 0);
    assert.equal(zeroBase.true_total_cost, 0);
    assert.equal(isNaN(zeroBase.true_total_cost), false);

    // Client mirror (formulaPreview.js) produces identical results
    const clientResult = clientComputeItemProration(
      { unit_price: 50 },
      { base_total: 100 }
    );
    assert.deepEqual(clientResult, omittedAdjustments);
  });

  await t.test('computeSaleMetrics: handles optional fees and zero COGS without division-by-zero', () => {
    // Standard sale
    const standard = computeSaleMetrics({
      gross_sale_price: 100,
      buyer_shipping_paid: 10,
      actual_shipping_cost: 8,
      platform_fee_pct: 0.13,
      platform_flat_fee: 0.30,
      payment_processing_amt: 0,
      promoted_listing_fee: 2,
      true_total_cost: 40
    });
    // platform_fees_amt = round2(100 * 0.13 + 0.30) = 13.30
    assert.equal(standard.platform_fees_amt, 13.30);
    // net_proceeds = 100 + 10 - 8 - 13.30 - 0 - 2 = 86.70
    assert.equal(standard.net_proceeds, 86.70);
    // net_profit = 86.70 - 40 = 46.70
    assert.equal(standard.net_profit, 46.70);
    // roi_pct = 46.70 / 40 = 1.1675
    assert.equal(Math.round(standard.roi_pct * 10000) / 10000, 1.1675);

    // Zero acquisition cost (e.g. $0 ETV Vine item or free haul)
    const zeroCost = computeSaleMetrics({
      gross_sale_price: 50,
      true_total_cost: 0
    });
    assert.equal(zeroCost.platform_fees_amt, 0);
    assert.equal(zeroCost.net_proceeds, 50);
    assert.equal(zeroCost.net_profit, 50);
    // Div-by-zero protection: roi_pct must be 0, not Infinity or NaN
    assert.equal(zeroCost.roi_pct, 0);
    assert.equal(isFinite(zeroCost.roi_pct), true);

    // All optional fee fields omitted: must safely default to 0 without NaN
    const omittedFees = computeSaleMetrics({
      gross_sale_price: 75,
      true_total_cost: 25
    });
    assert.equal(omittedFees.platform_fees_amt, 0);
    assert.equal(omittedFees.net_proceeds, 75);
    assert.equal(omittedFees.net_profit, 50);
    assert.equal(omittedFees.roi_pct, 2.0); // 50 / 25

    // Client mirror (formulaPreview.js) produces identical results
    const clientResult = clientComputeSaleMetrics({
      gross_sale_price: 75,
      true_total_cost: 25
    });
    assert.deepEqual(clientResult, omittedFees);
  });

  await t.test('computePricingFloors: handles missing/unassigned fields safely without NaN', () => {
    // Normal pricing floor
    const normal = computePricingFloors({
      true_total_cost: 20,
      est_shipping_cost: 5,
      platform_flat_fee: 0.40,
      platform_fee_pct: 0.13,
      boost_pct: 0.02,
      target_margin_pct: 0.20
    });
    // divisor = 1 - 0.13 - 0.02 = 0.85
    // min_sell = round2((20 + 5 + 0.40) / 0.85) = round2(25.40 / 0.85) = 29.88
    assert.equal(normal.min_sell_price, 29.88);
    // suggested_list = round2(29.88 * 1.20) = 35.86
    assert.equal(normal.suggested_list_price, 35.86);

    // Item with missing true_total_cost and fees (e.g. initial draft item)
    const draft = computePricingFloors({});
    assert.equal(draft.min_sell_price, 0);
    assert.equal(draft.suggested_list_price, 0);
    assert.equal(isNaN(draft.min_sell_price), false);
    assert.equal(isNaN(draft.suggested_list_price), false);

    // Client mirror produces identical results
    const clientResult = clientComputePricingFloors({});
    assert.deepEqual(clientResult, draft);
  });

  await t.test('Ingestion protection: import/amazon-url rejects negative financial inputs with 400', async () => {
    const mockDb = createMockD1();
    const token = await createToken({ userId: 'user-1', email: 'test@example.com' }, TEST_JWT_SECRET);
    const env = { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET };
    const context = {
      request: new Request('http://localhost/api/import/amazon-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${token}`
        },
        body: JSON.stringify({
          url: 'https://www.amazon.com/dp/B000TEST01',
          vine_value: -25.00
        })
      }),
      env
    };

    const res = await amazonUrlImportPost(context);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /vine_value must be a non-negative number/i);
  });

  await t.test('Ingestion protection: import/amazon rejects negative etv/tax_cost with 400', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('user-1', 'Test User', 'test@example.com', 'hash')").run();
    const tokenHash = await hashSecret('op_token_123');
    mockDb._raw.prepare("INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at) VALUES ('int-1', 'user-1', ?, 'Test Device', datetime('now'))").run(tokenHash);

    const env = { DB: mockDb };
    const context = {
      request: new Request('http://localhost/api/import/amazon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer op_token_123'
        },
        body: JSON.stringify({
          asin: 'B000TEST02',
          title: 'Test Amazon Vine Item',
          etv: -10.00
        })
      }),
      env
    };

    const res = await amazonImportPost(context);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /etv must be a non-negative number/i);
  });

  await t.test('Ingestion protection: import/amazon allows valid 0.00 etv (zero-ETV item)', async () => {
    const mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, name, email, password_hash) VALUES ('user-1', 'Test User', 'test@example.com', 'hash')").run();
    const tokenHash = await hashSecret('op_token_123');
    mockDb._raw.prepare("INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at) VALUES ('int-1', 'user-1', ?, 'Test Device', datetime('now'))").run(tokenHash);
    mockDb._raw.prepare("INSERT INTO auction_platforms (id, user_id, name, fee_pct, flat_fee) VALUES ('plat-1', 'user-1', 'eBay', 0.1325, 0.40)").run();

    const env = { DB: mockDb };
    const context = {
      request: new Request('http://localhost/api/import/amazon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer op_token_123'
        },
        body: JSON.stringify({
          asin: 'B000TEST03',
          title: 'Zero ETV Food Item',
          etv: 0,
          taxCost: 0
        })
      }),
      env
    };

    const res = await amazonImportPost(context);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.item_id);
    const storedItem = await mockDb.prepare('SELECT unit_price, true_total_cost FROM auction_items WHERE id = ?').bind(body.item_id).first();
    assert.equal(storedItem.unit_price, 0);
    assert.equal(storedItem.true_total_cost, 0);
  });
});
