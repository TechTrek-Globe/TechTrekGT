/**
 * T-10 acceptance tests: one pricing formula, one fee default, one cache TTL,
 * one fee schedule, and no environment-silent hostnames.
 *
 * Each describe block names the numbered T-10 item it accepts, so the file can
 * be read as the checklist itself.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computePricingFloors,
  validatePercentage,
  validateNonNegativeMoney,
  round2
} from '../functions/utils/auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  LISTINGS_CACHE_TTL_MINUTES,
  FALLBACK_GATEWAY_ORIGIN,
  LOCAL_DEV_ORIGIN
} from '../functions/utils/constants.js';
import { DEFAULT_PLATFORMS } from '../functions/utils/platforms.js';
import {
  calculateEbayCategoryFees,
  getActiveFeeSchedule
} from '../functions/utils/ebayFeeSchedule.js';
import { calculateEbayCategoryFees as tokenHelperCategoryFees } from '../functions/api/ebay/tokenHelper.js';
import { LISTINGS_CACHE_TTL_MINUTES as cacheModuleTtl } from '../functions/api/ebay/listingsCache.js';
import { computeFeeBreakdown } from '../src/utils/feeEngine.js';
import { onRequestPost as marketAlertsPost } from '../functions/api/market-alerts.js';
import { onRequestPut as itemsUpdatePut } from '../functions/api/items/[id].js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPOST = path.join(__dirname, '..');
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

/** Reads a source file relative to the outpost root. */
function source(relPath) {
  return fs.readFileSync(path.join(OUTPOST, relPath), 'utf8');
}

/** Strips // and block comments so documentation URLs are not mistaken for code. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
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
          return db.prepare(sql).get(...boundParams) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...boundParams) };
        },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
}

describe('T-10 item 1/5: the client preview and the server floor share one formula', () => {
  const INPUTS = { cogs: 60, est_shipping_cost: 5, platform_fee_pct: 0.136, platform_flat_fee: 0.40 };

  test('feeEngine.breakEvenFloor equals computePricingFloors().min_sell_price', () => {
    const preview = computeFeeBreakdown(INPUTS);
    const server = computePricingFloors({
      true_total_cost: INPUTS.cogs,
      est_shipping_cost: INPUTS.est_shipping_cost,
      platform_flat_fee: INPUTS.platform_flat_fee,
      platform_fee_pct: INPUTS.platform_fee_pct,
      boost_pct: 0,
      target_margin_pct: 0
    });
    assert.strictEqual(preview.breakEvenFloor, server.min_sell_price);
    // $65.40 cost basis / 0.864 divisor = 75.6944...
    assert.strictEqual(server.min_sell_price, 75.69);
  });

  test('buyer-paid shipping does not offset the floor in either implementation', () => {
    const withShippingCharged = computeFeeBreakdown({ ...INPUTS, buyer_shipping_cost: 6 });
    const without = computeFeeBreakdown(INPUTS);
    assert.strictEqual(withShippingCharged.breakEvenFloor, without.breakEvenFloor);
  });

  test('a promoted-listing boost raises the floor, in the shared formula', () => {
    const base = computeFeeBreakdown({ ...INPUTS, ebay_promoted_rate: 0 });
    const promoted = computeFeeBreakdown({ ...INPUTS, ebay_promoted_rate: 0.02 });
    assert.ok(
      promoted.breakEvenFloor > base.breakEvenFloor,
      `${promoted.breakEvenFloor} should exceed ${base.breakEvenFloor}`
    );
  });

  test('the removed client-only floor is no longer read as code', () => {
    // T-10 item 5: `_computedFloor` came from a second, divergent break-even
    // formula in feeEngine, so the grid could display a floor the server never
    // persisted. The identifier may still appear in the comments that explain its
    // removal; it must not be assigned or read.
    for (const rel of [
      'src/context/InventoryContext.jsx',
      'src/components/inventory/InventoryGridRow.jsx',
      'src/components/inventory/InventoryDataGrid.jsx'
    ]) {
      const code = stripComments(source(rel));
      assert.doesNotMatch(code, /_computedFloor/, `${rel} still uses _computedFloor`);
    }
  });
});

describe('T-10 item 2: one listings-cache TTL definition', () => {
  test('listingsCache re-exports the constant from constants.js', () => {
    // Same binding, not a copied number: if the literal is edited in one place
    // the other cannot drift.
    assert.strictEqual(cacheModuleTtl, LISTINGS_CACHE_TTL_MINUTES);
    assert.strictEqual(LISTINGS_CACHE_TTL_MINUTES, 15);
  });

  test('the TTL literal is defined exactly once across the worker', () => {
    const files = ['functions/utils/constants.js', 'functions/api/ebay/listingsCache.js'];
    for (const rel of files) {
      const code = stripComments(source(rel));
      const matches = code.match(/=\s*15\b/g) || [];
      if (rel.endsWith('constants.js')) {
        assert.ok(matches.length >= 1);
      } else {
        assert.strictEqual(matches.length, 0, `${rel} redefines the TTL literal`);
      }
    }
  });
});

describe('T-10 item 3: one fee default, owner of the number', () => {
  test('the eBay seed row references the constants, not a copied literal', () => {
    const ebay = DEFAULT_PLATFORMS.find(p => p.name === 'eBay');
    assert.ok(ebay, 'the eBay seed row must exist');
    assert.strictEqual(ebay.fee_pct, DEFAULT_PLATFORM_FEE_PCT);
    assert.strictEqual(ebay.flat_fee, DEFAULT_PLATFORM_FLAT_FEE);
    assert.strictEqual(DEFAULT_PLATFORM_FEE_PCT, 0.136);
    assert.strictEqual(DEFAULT_PLATFORM_FLAT_FEE, 0.40);
  });

  test('every seeded fee_pct is a fraction, never a percentage', () => {
    for (const platform of DEFAULT_PLATFORMS) {
      assert.ok(
        platform.fee_pct >= 0 && platform.fee_pct < 1,
        `${platform.name} fee_pct ${platform.fee_pct} is not a fraction`
      );
    }
  });

  test('feeEngine falls back to the same default when the rate is absent', () => {
    const implicit = computeFeeBreakdown({ cogs: 10, sellPrice: 50 });
    const explicit = computeFeeBreakdown({
      cogs: 10, sellPrice: 50, platform_fee_pct: DEFAULT_PLATFORM_FEE_PCT
    });
    assert.strictEqual(implicit.platformFeePct, DEFAULT_PLATFORM_FEE_PCT);
    assert.strictEqual(implicit.totalFees, explicit.totalFees);

    // The pre-T-10 inline 13.25% is gone from the engine's default.
    const stale = computeFeeBreakdown({ cogs: 10, sellPrice: 50, platform_fee_pct: 0.1325 });
    assert.notStrictEqual(implicit.platformFeePct, stale.platformFeePct);
  });

  test('no worker seed or engine file hardcodes the old 13.25 rate', () => {
    for (const rel of [
      'functions/utils/platforms.js',
      'src/utils/feeEngine.js',
      'functions/utils/constants.js'
    ]) {
      const code = stripComments(source(rel));
      assert.doesNotMatch(code, /13\.25|0\.1325(?!\d)/, `${rel} hardcodes the 13.25 default`);
    }
  });
});

describe('T-10 item 6: an impossible fee structure has no floor', () => {
  test('a divisor of zero or less yields null plus a reason, never 0', () => {
    const cases = [
      { platform_fee_pct: 1.0 },
      { platform_fee_pct: 0.9, boost_pct: 0.2 }
    ];
    for (const params of cases) {
      const result = computePricingFloors(params);
      assert.strictEqual(result.min_sell_price, null, JSON.stringify(params));
      assert.strictEqual(result.suggested_list_price, null, JSON.stringify(params));
      assert.ok(result.fee_divisor <= 0, JSON.stringify(params));
      assert.match(result.pricing_error, /100% or more of the sale price/);
      assert.match(result.pricing_error, /no break-even price exists/);
    }
  });

  test('just inside the boundary still yields a finite floor', () => {
    // 0.85 + 0.15 lands on 1.0 only in decimal; in binary it is 0.05000000000000004,
    // so the true divisor-zero boundary is not reachable through these two inputs.
    // The guard is <= 0, which is what matters; this pins the just-inside case.
    const result = computePricingFloors({
      true_total_cost: 10, platform_fee_pct: 0.84, boost_pct: 0.15
    });
    assert.strictEqual(result.pricing_error, null);
    assert.ok(result.fee_divisor > 0 && result.fee_divisor < 0.02);
    // A 0.01 divisor is punishing but arithmetically valid: $10 / 0.01 = $1000.
    assert.strictEqual(result.min_sell_price, 1000);
  });

  test('PUT /api/items/:id returns 400 with the reason instead of persisting 0', async () => {
    const mockDb = createMockD1();
    const userId = 'usr-t10-item6';
    const itemId = 'item-t10-item6';
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 't10@techtrek.test', 'h', 'T', 'Active', 1);
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run('inv-t10', userId, 'INV-T10');
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status, unit_price, min_sell_price)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, userId, 'inv-t10', 'Fee-heavy item', 'Available', 20, 42);

    const token = await createToken({ userId, email: 't10@techtrek.test' }, TEST_JWT_SECRET);
    const request = new Request(`https://techtrekgt.com/outpost/api/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${token}` },
      body: JSON.stringify({ platform_fee_pct: 0.9, ebay_promoted_rate: 20 })
    });

    const res = await itemsUpdatePut({ request, env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET } });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /no break-even price exists/);

    // The previously computed floor survives untouched. Persisting 0 here would
    // read as "give it away free" on the inventory grid.
    const stored = mockDb._raw.prepare('SELECT min_sell_price FROM auction_items WHERE id = ?')
      .get(itemId);
    assert.strictEqual(stored.min_sell_price, 42);
  });
});

describe('T-10 item 7: percentages are fractions in [0, 1)', () => {
  test('validatePercentage accepts the range and rejects 100% and above', () => {
    assert.strictEqual(validatePercentage(0, 'fee_pct'), 0);
    assert.strictEqual(validatePercentage(0.136, 'fee_pct'), 0.136);
    assert.strictEqual(validatePercentage('0.15', 'fee_pct'), 0.15);
    assert.strictEqual(validatePercentage(null, 'fee_pct'), null);
    assert.strictEqual(validatePercentage(undefined, 'fee_pct'), null);

    assert.throws(() => validatePercentage(1.5, 'fee_pct'), /fee_pct must be a non-negative number and at most 0\.999999/);
    assert.throws(() => validatePercentage(1, 'fee_pct'), /at most 0\.999999/);
    assert.throws(() => validatePercentage(-0.01, 'fee_pct'), /fee_pct must be a non-negative number/);
    assert.throws(() => validatePercentage(true, 'fee_pct'), /fee_pct must be a non-negative number/);
  });

  test('validateNonNegativeMoney honours its optional upper bound', () => {
    assert.strictEqual(validateNonNegativeMoney(1000, 'flat_fee', 1000), 1000);
    assert.throws(
      () => validateNonNegativeMoney(1000.01, 'flat_fee', 1000),
      /flat_fee must be a non-negative number and at most 1000/
    );
  });
});

describe('T-10 item 8: the fee schedule is versioned and auditable', () => {
  test('a resolved fee names the schedule that produced it', () => {
    const fees = calculateEbayCategoryFees('213', 'Trading Cards', 45);
    assert.strictEqual(fees.fee_pct, 0.1325);
    assert.strictEqual(fees.category_tier_id, 'trading_cards');
    assert.strictEqual(fees.schedule_version, '2024-06');
    assert.match(fees.schedule_effective_date, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('tiers match on category id and on keyword', () => {
    const byId = calculateEbayCategoryFees('267', null, 25);
    assert.strictEqual(byId.fee_pct, 0.1495);
    assert.strictEqual(byId.category_tier_id, 'media_books');

    const byKeyword = calculateEbayCategoryFees(null, 'Pokemon Booster Box', 25);
    assert.strictEqual(byKeyword.category_tier_id, 'trading_cards');
  });

  test('the reduced flat fee applies only at or below $10', () => {
    const cheap = calculateEbayCategoryFees('213', 'Trading Cards', 8);
    assert.strictEqual(cheap.flat_fee, 0.30);

    const dear = calculateEbayCategoryFees('213', 'Trading Cards', 45);
    assert.strictEqual(dear.flat_fee, DEFAULT_PLATFORM_FLAT_FEE);
  });

  test('the standard tier falls back to the shared platform default', () => {
    const standard = calculateEbayCategoryFees('999999', 'Unmapped Category', 25);
    assert.strictEqual(standard.category_tier_id, 'standard');
    // The schedule stores fee_pct: null for the standard tier, so the resolver
    // must own the fallback. A null escaping here would be read as a 0% fee.
    assert.strictEqual(standard.fee_pct, DEFAULT_PLATFORM_FEE_PCT);
    assert.strictEqual(
      tokenHelperCategoryFees('999999', 'Unmapped Category', 25).fee_pct,
      DEFAULT_PLATFORM_FEE_PCT
    );
  });

  test('tokenHelper delegates to the shared schedule rather than holding rates', () => {
    for (const [id, name, price] of [['213', null, 45], [null, 'Pokemon', 12], ['267', null, 30]]) {
      const shared = calculateEbayCategoryFees(id, name, price);
      const viaHelper = tokenHelperCategoryFees(id, name, price);
      assert.strictEqual(viaHelper.fee_pct, shared.fee_pct);
      assert.strictEqual(viaHelper.schedule_version, shared.schedule_version);
    }
  });

  test('a date before any schedule is a deployment error, not a silent zero fee', () => {
    assert.throws(
      () => getActiveFeeSchedule('2020-01-01'),
      /No eBay fee schedule is effective on 2020-01-01/
    );
  });
});

describe('T-10 item 9: no environment-silent production hostname', () => {
  function alertsFixture() {
    const mockDb = createMockD1();
    const userId = 'usr-t10-item9';
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 't10-9@techtrek.test', 'h', 'T', 'Active', 1);
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref) VALUES (?, ?, ?)
    `).run('inv-t10-9', userId, 'INV-T10-9');
    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, status)
      VALUES (?, ?, ?, ?, ?)
    `).run('item-t10-9', userId, 'inv-t10-9', 'Signed Baseball', 'Available');
    // recommended_list_price lives on the comps row, which the refresh joins onto
    // the item to decide whether the live average moved by >= 15%.
    mockDb._raw.prepare(`
      INSERT INTO auction_comps (id, item_id, user_id, recommended_list_price)
      VALUES (?, ?, ?, ?)
    `).run('comp-t10-9', 'item-t10-9', userId, 100);
    return { mockDb, userId };
  }

  /** Runs the background refresh and reports the callback URL it used. */
  async function capturedCallbackUrl(env, requestUrl) {
    const { mockDb, userId } = alertsFixture();
    const token = await createToken({ userId, email: 't10-9@techtrek.test' }, TEST_JWT_SECRET);
    const request = new Request(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `auth_token=${token}` },
      body: JSON.stringify({})
    });

    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ live_avg: 160 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    try {
      let background;
      const res = await marketAlertsPost({
        request,
        env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET, ...env },
        waitUntil: (p) => { background = p; }
      });
      assert.strictEqual(res.status, 200);
      await background;
      return {
        url: calls[0]?.url,
        calls,
        alerts: mockDb._raw.prepare('SELECT * FROM auction_market_alerts').all()
      };
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  test('GATEWAY_BASE_URL wins, so a staging worker does not call production', async () => {
    const { url, calls, alerts } = await capturedCallbackUrl(
      { GATEWAY_BASE_URL: 'https://staging.example.test' },
      'https://techtrekgt.com/outpost/api/market-alerts'
    );
    assert.strictEqual(url, 'https://staging.example.test/api/ebay/comps');
    assert.strictEqual(calls.length, 1);
    // The alert is only written when the callback actually round-tripped, so this
    // also proves the rewrite did not point the worker at a dead host.
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].alert_type, 'SPIKE');
  });

  test('without an override the request origin is reused, not a constant host', async () => {
    const { url } = await capturedCallbackUrl(
      {},
      'https://techtrek-outpost.pages.dev/outpost/api/market-alerts'
    );
    assert.strictEqual(url, 'https://techtrek-outpost.pages.dev/api/ebay/comps');
  });

  test('localhost falls back to the wrangler dev origin', async () => {
    const { url } = await capturedCallbackUrl({}, `${LOCAL_DEV_ORIGIN}/outpost/api/market-alerts`);
    assert.strictEqual(url, `${LOCAL_DEV_ORIGIN}/api/ebay/comps`);
  });

  test('the two fetch-target resolvers hold no production literal in code', () => {
    // market-alerts.js resolves the worker callback origin; auctionApi.getGatewayBase
    // resolves the browser-side gateway. Neither may contain a hardcoded production
    // host outside a comment; constants.js owns the fallback value.
    for (const rel of ['functions/api/market-alerts.js', 'src/utils/auctionApi.js']) {
      const code = stripComments(source(rel));
      assert.doesNotMatch(code, /https?:\/\/techtrekgt\.com/, `${rel} hardcodes the prod origin`);
      assert.doesNotMatch(code, /\.pages\.dev/, `${rel} hardcodes a pages.dev origin`);
    }
    assert.match(stripComments(source('functions/api/market-alerts.js')), /env\.GATEWAY_BASE_URL/);
    assert.match(stripComments(source('src/utils/auctionApi.js')), /VITE_GATEWAY_BASE_URL/);
    assert.match(FALLBACK_GATEWAY_ORIGIN, /^https:\/\//);
    assert.match(LOCAL_DEV_ORIGIN, /^http:\/\/localhost:/);
  });
});
