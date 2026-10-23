import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPut as itemsUpdatePut } from '../functions/api/items/[id].js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';
const USER_ID = 'usr-test-guard';
const ITEM_1_ID = 'item-test-guard-1';
const ITEM_2_ID = 'item-test-guard-2';
const INVOICE_ID = 'inv-test-guard';

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
        first() {
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return {
            success: true,
            meta: { changes: info.changes, last_row_id: info.lastInsertRowid }
          };
        }
      };
    }
  };
}

describe('eBay Listing ID & SKU Uniqueness Guards (PUT /api/items/:id)', () => {
  let mockEnv;
  let authToken;

  beforeEach(async () => {
    const mockDb = createMockD1();
    mockEnv = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    authToken = await createToken({ userId: USER_ID }, TEST_JWT_SECRET, 3600);

    mockDb._raw.exec(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified)
      VALUES ('${USER_ID}', 'guard@example.com', 'hash', 'Guard User', 'Active', 1);

      INSERT INTO auction_invoices (id, user_id, invoice_ref, description)
      VALUES ('${INVOICE_ID}', '${USER_ID}', 'INV-TEST', 'Test invoice');

      INSERT INTO auction_items (
        id, user_id, invoice_id, item_name, sku, ebay_listing_id, status, unit_price, true_total_cost
      ) VALUES
      ('${ITEM_1_ID}', '${USER_ID}', '${INVOICE_ID}', 'First Item', 'OP-TEST-0001', '336766695532', 'Sold', 100, 100),
      ('${ITEM_2_ID}', '${USER_ID}', '${INVOICE_ID}', 'Second Item', 'OP-TEST-0002', NULL, 'Available', 100, 100);
    `);
  });

  test('PUT /api/items/:id returns 400 when ebay_listing_id is already linked to another item', async () => {
    const request = new Request(`https://techtrekgt.com/outpost/api/items/${ITEM_2_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify({
        ebay_listing_id: '336766695532'
      })
    });

    const response = await itemsUpdatePut({ request, env: mockEnv });
    assert.strictEqual(response.status, 400);

    const body = await response.json();
    assert.match(body.error, /eBay listing #336766695532 is already linked to item/i);
  });

  test('PUT /api/items/:id returns 400 when sku is already assigned to another item', async () => {
    const request = new Request(`https://techtrekgt.com/outpost/api/items/${ITEM_2_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify({
        sku: 'OP-TEST-0001'
      })
    });

    const response = await itemsUpdatePut({ request, env: mockEnv });
    assert.strictEqual(response.status, 400);

    const body = await response.json();
    assert.match(body.error, /SKU "OP-TEST-0001" is already assigned to item/i);
  });

  test('PUT /api/items/:id succeeds when assigning an unlinked unique ebay_listing_id', async () => {
    const request = new Request(`https://techtrekgt.com/outpost/api/items/${ITEM_2_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${authToken}`
      },
      body: JSON.stringify({
        ebay_listing_id: '999888777666'
      })
    });

    const response = await itemsUpdatePut({ request, env: mockEnv });
    assert.strictEqual(response.status, 200);

    const body = await response.json();
    assert.strictEqual(body.item.ebay_listing_id, '999888777666');
  });
});
