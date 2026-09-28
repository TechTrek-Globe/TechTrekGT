import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as adminStatsGet } from '../functions/api/admin/stats.js';
import { createToken } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_JWT_SECRET = 'test-jwt-secret-key-32-bytes-minimum-length-for-hmac';

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
    }
  };
}

describe('LOW-4: /api/admin/stats Pagination & Full Dataset Aggregates', () => {
  let mockDb;
  let adminToken;
  let regularToken;
  const adminId = 'usr-admin-low4';
  const regularId = 'usr-regular-low4';

  beforeEach(async () => {
    mockDb = createMockD1();

    // Insert admin user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, is_admin, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, '2026-01-01 00:00:00')
    `).run(adminId, 'admin@techtrek.test', 'hash', 'Admin', 'Active');

    // Insert regular non-admin user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, is_admin, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 1, '2026-01-02 00:00:00')
    `).run(regularId, 'regular@techtrek.test', 'hash', 'Regular', 'Active');

    // Insert 3 additional users (total 5 users: 3 active, 2 locked)
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, is_admin, email_verified, created_at)
      VALUES ('usr-3', 'u3@techtrek.test', 'hash', 'User 3', 'Active', 0, 1, '2026-01-03 00:00:00'),
             ('usr-4', 'u4@techtrek.test', 'hash', 'User 4', 'Locked', 0, 1, '2026-01-04 00:00:00'),
             ('usr-5', 'u5@techtrek.test', 'hash', 'User 5', 'Locked', 0, 1, '2026-01-05 00:00:00')
    `).run();

    // Insert items associated with users
    // user 1 (admin): 2 items, user 2: 1 item, user 3: 3 items (total 6 items)
    mockDb._raw.prepare(`
      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES ('inv-test-1', ?, 'INV-001')
    `).run(adminId);

    mockDb._raw.prepare(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, unit_price, true_total_cost)
      VALUES ('item-1', ?, 'inv-test-1', 'Item 1', 10, 10),
             ('item-2', ?, 'inv-test-1', 'Item 2', 20, 20),
             ('item-3', ?, 'inv-test-1', 'Item 3', 30, 30),
             ('item-4', 'usr-3', 'inv-test-1', 'Item 4', 40, 40),
             ('item-5', 'usr-3', 'inv-test-1', 'Item 5', 50, 50),
             ('item-6', 'usr-3', 'inv-test-1', 'Item 6', 60, 60)
    `).run(adminId, adminId, regularId);

    adminToken = await createToken({ userId: adminId, email: 'admin@techtrek.test', name: 'Admin' }, TEST_JWT_SECRET);
    regularToken = await createToken({ userId: regularId, email: 'regular@techtrek.test', name: 'Regular' }, TEST_JWT_SECRET);
  });

  const createReq = (url, token) => {
    return new Request(url, {
      method: 'GET',
      headers: {
        'Cookie': `auth_token=${token}`,
        'Content-Type': 'application/json'
      }
    });
  };

  test('Gating: non-admin user is rejected with 403 Forbidden', async () => {
    const res = await adminStatsGet({
      request: createReq('https://techtrekgt.com/outpost/api/admin/stats', regularToken),
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    assert.strictEqual(res.status, 403);
    const json = await res.json();
    assert.strictEqual(json.error, 'Forbidden: Admin access only');
  });

  test('Pagination: Page 1 with limit 2 returns 2 users but full dataset aggregates', async () => {
    const res = await adminStatsGet({
      request: createReq('https://techtrekgt.com/outpost/api/admin/stats?page=1&limit=2', adminToken),
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();

    // Verify aggregate totals reflect full dataset
    assert.strictEqual(json.total_users, 5);
    assert.strictEqual(json.active_users, 3);
    assert.strictEqual(json.locked_users, 2);
    assert.strictEqual(json.total_items, 6);

    // Verify pagination metadata
    assert.deepStrictEqual(json.pagination, {
      total: 5,
      page: 1,
      limit: 2,
      pages: 3
    });

    // Verify paginated user rows (first 2 ordered by created_at)
    assert.strictEqual(json.users.length, 2);
    assert.strictEqual(json.users[0].id, adminId);
    assert.strictEqual(json.users[1].id, regularId);
  });

  test('Pagination: Page 2 and Page 3 return subsequent slices', async () => {
    const resPage2 = await adminStatsGet({
      request: createReq('https://techtrekgt.com/outpost/api/admin/stats?page=2&limit=2', adminToken),
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    const jsonPage2 = await resPage2.json();
    assert.strictEqual(jsonPage2.users.length, 2);
    assert.strictEqual(jsonPage2.users[0].id, 'usr-3');
    assert.strictEqual(jsonPage2.users[1].id, 'usr-4');
    assert.strictEqual(jsonPage2.pagination.page, 2);

    const resPage3 = await adminStatsGet({
      request: createReq('https://techtrekgt.com/outpost/api/admin/stats?page=3&limit=2', adminToken),
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    const jsonPage3 = await resPage3.json();
    assert.strictEqual(jsonPage3.users.length, 1);
    assert.strictEqual(jsonPage3.users[0].id, 'usr-5');
    assert.strictEqual(jsonPage3.pagination.page, 3);
  });

  test('Defaults & Clamping: handles invalid or out-of-range pagination parameters', async () => {
    // Request with limit exceeding 200
    const resOverMax = await adminStatsGet({
      request: createReq('https://techtrekgt.com/outpost/api/admin/stats?limit=500', adminToken),
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    const jsonOverMax = await resOverMax.json();
    assert.strictEqual(jsonOverMax.pagination.limit, 200);

    // Request with invalid non-numeric strings
    const resInvalid = await adminStatsGet({
      request: createReq('https://techtrekgt.com/outpost/api/admin/stats?page=invalid&limit=bad', adminToken),
      env: { DB: mockDb, JWT_SECRET: TEST_JWT_SECRET }
    });
    const jsonInvalid = await resInvalid.json();
    assert.strictEqual(jsonInvalid.pagination.page, 1);
    assert.strictEqual(jsonInvalid.pagination.limit, 50);
  });
});
