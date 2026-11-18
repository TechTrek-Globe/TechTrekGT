import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet, onRequestPut, CLIENT_SETTABLE_ATTR_KEYS } from '../functions/api/items/[id].js';
import { onRequestGet as onEnrichedGet } from '../functions/api/items/enriched.js';
import { onRequestGet as onItemsListGet } from '../functions/api/items/index.js';
import { onRequestPost as onCreateInvoice } from '../functions/api/invoices/index.js';
import { createToken } from '../functions/utils/auth.js';
import { resolveCategoryGroup, isMemorabiliaCategory, isFramedStatus } from '../src/utils/itemCategories.js';
import { generateEbayListingHtml } from '../src/utils/ebayTemplate.js';
import { buildStructuredCompQuery } from '../src/utils/ebaySearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
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
    async batch(stmts) {
      const results = [];
      for (const s of stmts) {
        results.push(await s.all().catch(async () => s.run()));
      }
      return results;
    }
  };
}

describe('Migration 0014: Product-Specific Item Detail Fields & Category-Aware Architecture', () => {
  let mockDb;
  let authToken;
  const testUserId = 'usr-detail-tester';
  const testItemId = 'item-detail-test-1';

  beforeEach(async () => {
    mockDb = createMockD1();

    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(testUserId, 'details@techtrek.test', 'dummyhash', 'Tester', 'Active', 1);

    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES (?, ?, ?)
    `).run('inv-detail-test', testUserId, 'INV-DETAIL-001');

    mockDb._raw.prepare(`
      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, category, status, unit_price, true_total_cost,
        current_list_price, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, datetime('now'), datetime('now')
      )
    `).run(
      testItemId,
      testUserId,
      'inv-detail-test',
      'Patrick Mahomes Signed Red Jersey JSA',
      'Jersey',
      'Available',
      150.00,
      165.00,
      349.99
    );

    authToken = await createToken({ userId: testUserId, email: 'details@techtrek.test' }, TEST_JWT_SECRET);
  });

  test('resolveCategoryGroup maps memorabilia and retail categories accurately', () => {
    assert.strictEqual(resolveCategoryGroup('Jersey'), 'jersey_apparel');
    assert.strictEqual(resolveCategoryGroup('Baseball'), 'sports_gear');
    assert.strictEqual(resolveCategoryGroup('Mini Helmet'), 'sports_gear');
    assert.strictEqual(resolveCategoryGroup('Guitar'), 'music_instrument');
    assert.strictEqual(resolveCategoryGroup('Pickguard'), 'music_instrument');
    assert.strictEqual(resolveCategoryGroup('CD / Vinyl'), 'music_media');
    assert.strictEqual(resolveCategoryGroup('Album Flat'), 'music_media');
    assert.strictEqual(resolveCategoryGroup('Photo'), 'photo_print');
    assert.strictEqual(resolveCategoryGroup('Card'), 'trading_card');
    assert.strictEqual(resolveCategoryGroup('Electronics'), 'general');
    assert.strictEqual(isMemorabiliaCategory('Guitar'), true);
    assert.strictEqual(isMemorabiliaCategory('Electronics', 'Sony Headphones'), false);
    assert.strictEqual(isFramedStatus('Framed + Matted'), true);
    assert.strictEqual(isFramedStatus('Unframed'), false);
  });

  test('PUT /api/items/:id persists all 8 Migration 0014 D1 columns, syncs cert_verified columns, and stores category attributes', async () => {
    const updateBody = {
      item_subtype: 'Custom Stitched',
      item_condition: 'Mint',
      condition_notes: 'Crisp silver paint pen signature on #15; zero smudges.',
      auth_type: 'Witnessed',
      prep_status: 'Needs Framing',
      framing_status: 'Framed + Matted',
      source_vendor: 'Pristine Auction',
      storage_location: 'Rack 2B',
      cert_verified: true,
      authenticator: 'JSA',
      cert_number: 'WIT998877',
      jersey_style: 'Custom Stitched',
      color: 'Red',
      colorway: 'Home Red',
      jersey_number: '15',
      ink_color: 'Silver Paint Pen',
      frame_dimensions: '34x42 in',
      source_lot_ref: 'Lot #12862710'
    };

    const req = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify(updateBody)
    });

    const res = await onRequestPut({
      request: req,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    assert.strictEqual(res.status, 200);

    // Verify raw D1 columns (including cert_verified / cert_verified_at sync fix)
    const dbRow = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(testItemId);
    assert.strictEqual(dbRow.item_subtype, 'Custom Stitched');
    assert.strictEqual(dbRow.item_condition, 'Mint');
    assert.strictEqual(dbRow.condition_notes, 'Crisp silver paint pen signature on #15; zero smudges.');
    assert.strictEqual(dbRow.auth_type, 'Witnessed');
    assert.strictEqual(dbRow.prep_status, 'Needs Framing');
    assert.strictEqual(dbRow.framing_status, 'Framed + Matted');
    assert.strictEqual(dbRow.source_vendor, 'Pristine Auction');
    assert.strictEqual(dbRow.storage_location, 'Rack 2B');
    assert.strictEqual(dbRow.cert_verified, 1, 'cert_verified D1 column must be synced to 1');
    assert.ok(dbRow.cert_verified_at, 'cert_verified_at D1 column must be populated');

    const attrs = JSON.parse(dbRow.attributes);
    assert.strictEqual(attrs.color, 'Red');
    assert.strictEqual(attrs.jersey_style, 'Custom Stitched');
    assert.strictEqual(attrs.colorway, 'Home Red');
    assert.strictEqual(attrs.jersey_number, '15');
    assert.strictEqual(attrs.ink_color, 'Silver Paint Pen');
    assert.strictEqual(attrs.frame_dimensions, '34x42 in');
    assert.strictEqual(attrs.source_lot_ref, 'Lot #12862710');

    // Verify GET /api/items/:id unpacks columns and attributes
    const getReq = new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, {
      method: 'GET',
      headers: { Cookie: `auth_token=${authToken}` }
    });
    const getRes = await onRequestGet({
      request: getReq,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    assert.strictEqual(getRes.status, 200);
    const getJson = await getRes.json();
    assert.strictEqual(getJson.item.item_condition, 'Mint');
    assert.strictEqual(getJson.item.condition, 'Mint');
    assert.strictEqual(getJson.item.prep_status, 'Needs Framing');
    assert.strictEqual(getJson.item.color, 'Red');
    assert.strictEqual(getJson.item.cert_verified, true);
    assert.strictEqual(getJson.item.frame_dimensions, '34x42 in');

    // Verify GET /api/items/enriched supports prep_status filtering
    const enrichedReq = new Request(`https://techtrekgt.com/outpost/api/items/enriched?prep_status=Needs%20Framing`, {
      method: 'GET',
      headers: { Cookie: `auth_token=${authToken}` }
    });
    const enrichedRes = await onEnrichedGet({
      request: enrichedReq,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    assert.strictEqual(enrichedRes.status, 200);
    const enrichedJson = await enrichedRes.json();
    assert.strictEqual(enrichedJson.items.length, 1);
    assert.strictEqual(enrichedJson.items[0].storage_location, 'Rack 2B');
    assert.strictEqual(enrichedJson.items[0].auth_type, 'Witnessed');
  });

  test('POST /api/invoices accepts and persists source_vendor, item_condition, and prep_status', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify({
        invoice_ref: 'PRISTINE-8821',
        source_vendor: 'Pristine Auction',
        items: [
          {
            item_name: 'Ronald Acuna Jr Signed OMLB Baseball',
            category: 'Baseball',
            item_condition: 'Near Mint',
            prep_status: 'Needs Case/Clean',
            unit_price: 85.00
          }
        ]
      })
    });

    const res = await onCreateInvoice({
      request: req,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    assert.strictEqual(res.status, 201);
    const json = await res.json();
    const createdId = json.items[0].id;
    const row = mockDb._raw.prepare('SELECT * FROM auction_items WHERE id = ?').get(createdId);
    assert.strictEqual(row.source_vendor, 'Pristine Auction');
    assert.strictEqual(row.item_condition, 'Near Mint');
    assert.strictEqual(row.prep_status, 'Needs Case/Clean');
  });

  test('CLIENT_SETTABLE_ATTR_KEYS includes category attributes while rejecting system keys', () => {
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('ink_color'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('frame_dimensions'));
    assert.ok(CLIENT_SETTABLE_ATTR_KEYS.includes('card_grade'));
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('outpost_liquidated'), false);
    assert.strictEqual(CLIENT_SETTABLE_ATTR_KEYS.includes('source'), false);
  });

  test('ebayTemplate and ebaySearch consume new condition, framing, ink, and card fields cleanly', () => {
    const html = generateEbayListingHtml({
      item_name: 'Ken Griffey Jr Signed OMLB Baseball',
      category: 'Baseball',
      item_subtype: 'OMLB Official MLB',
      athlete_person: 'Ken Griffey Jr',
      authenticator: 'Beckett',
      auth_type: 'Witnessed',
      cert_number: 'BAS12345',
      item_condition: 'Near Mint',
      condition_notes: 'Bold blue ballpoint signature on sweet spot.',
      ink_color: 'Blue Ballpoint',
      signature_location: 'Sweet Spot',
      framing_status: 'Ball Cube'
    });
    assert.ok(html.includes('Blue Ballpoint'));
    assert.ok(html.includes('Sweet Spot'));
    assert.ok(html.includes('Ball Cube'));
    assert.ok(html.includes('Witnessed'));
    assert.ok(html.includes('Bold blue ballpoint signature on sweet spot.'));

    const cardQuery = buildStructuredCompQuery({
      item_name: 'Caleb Williams Auto',
      athlete_person: 'Caleb Williams',
      category: 'Card',
      card_year: '2024',
      card_set: 'Panini Prizm',
      card_grade: 'PSA 10',
      authenticator: 'PSA'
    });
    assert.ok(cardQuery.includes('2024'));
    assert.ok(cardQuery.includes('Panini Prizm'));
    assert.ok(cardQuery.includes('PSA 10'));
  });

  test('Cloudflare D1 100-column result set cap: enriched, list, and detail SQL queries stay strictly <= 90 columns', async () => {
    const columnCounts = [];
    const trackedDb = {
      ...mockDb,
      prepare(sql) {
        const inner = mockDb.prepare(sql);
        const origAll = inner.all.bind(inner);
        const origFirst = inner.first.bind(inner);
        inner.all = async () => {
          const res = await origAll();
          if (res?.results?.[0]) columnCounts.push({ sql: sql.slice(0, 60), cols: Object.keys(res.results[0]).length });
          return res;
        };
        inner.first = async () => {
          const row = await origFirst();
          if (row) columnCounts.push({ sql: sql.slice(0, 60), cols: Object.keys(row).length });
          return row;
        };
        return inner;
      },
      async batch(stmts) {
        const results = [];
        for (const s of stmts) {
          results.push(await s.all().catch(async () => s.run()));
        }
        return results;
      }
    };

    const headers = { Cookie: `auth_token=${authToken}` };
    const r1 = await onEnrichedGet({ request: new Request('https://techtrekgt.com/outpost/api/items/enriched', { headers }), env: { DB: trackedDb, JWT_SECRET: TEST_JWT_SECRET } });
    const r2 = await onItemsListGet({ request: new Request('https://techtrekgt.com/outpost/api/items', { headers }), env: { DB: trackedDb, JWT_SECRET: TEST_JWT_SECRET } });
    const r3 = await onRequestGet({ request: new Request(`https://techtrekgt.com/outpost/api/items/${testItemId}`, { headers }), env: { DB: trackedDb, JWT_SECRET: TEST_JWT_SECRET } });

    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r3.status, 200);
    assert.ok(columnCounts.length >= 3);
    for (const entry of columnCounts) {
      assert.ok(entry.cols <= 90, `Query "${entry.sql}..." returned ${entry.cols} columns, dangerously close to D1 100-column cap`);
    }
  });
});
