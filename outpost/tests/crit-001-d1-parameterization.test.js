import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as getItems } from '../functions/api/items/index.js';
import { onRequestPut as putMarketComp } from '../functions/api/comps/market.js';
import { onRequestGet as getAdminStats } from '../functions/api/admin/stats.js';
import { onRequestGet as getSales } from '../functions/api/sales/index.js';
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

describe('CRIT-001 / SEC-001: Secure D1 Database Parameterization Protocol', () => {
  let mockDb;
  let env;
  const testUserId = 'usr-test-crit001';
  const otherUserId = 'usr-other-crit001';
  const testInvoiceId = 'inv-test-crit001';
  let userJwt;

  beforeEach(async () => {
    mockDb = createMockD1();
    env = {
      DB: mockDb,
      JWT_SECRET: TEST_JWT_SECRET
    };

    mockDb._raw.exec(`
      INSERT INTO users (id, email, name, password_hash, is_admin, status, created_at)
      VALUES 
        ('${testUserId}', 'crit001@example.com', 'Tester', 'hash', 1, 'Active', datetime('now')),
        ('${otherUserId}', 'other@example.com', 'Other', 'hash', 0, 'Active', datetime('now'));

      INSERT INTO auction_invoices (id, user_id, invoice_ref)
      VALUES 
        ('${testInvoiceId}', '${testUserId}', 'INV-CRIT001'),
        ('inv-other-001', '${otherUserId}', 'INV-OTHER');
    `);

    userJwt = await createToken({ userId: testUserId }, TEST_JWT_SECRET);
  });

  test('Static Audit: Zero template literal variable interpolations exist inside db.prepare()', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const ignoreDirs = new Set(['node_modules', '.wrangler', 'dist', '.git', 'coverage', 'build']);

    function scanDir(dir) {
      let findings = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name) && !entry.name.includes('test')) {
            findings = findings.concat(scanDir(path.join(dir, entry.name)));
          }
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const fullPath = path.join(dir, entry.name);
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('.prepare(')) {
              const chunk = lines.slice(i, i + 35).join('\n');
              const match = chunk.match(/\.prepare\s*\(\s*`([^`]*)`/);
              if (match && match[1].includes('${')) {
                findings.push({
                  file: fullPath,
                  line: i + 1,
                  snippet: match[1].trim().slice(0, 100)
                });
              }
            }
          }
        }
      }
      return findings;
    }

    const templateLiteralCalls = scanDir(rootDir);
    assert.deepStrictEqual(
      templateLiteralCalls,
      [],
      `Found ${templateLiteralCalls.length} template literal interpolation(s) in db.prepare(): ` +
      JSON.stringify(templateLiteralCalls, null, 2)
    );
  });

  test('SQL Injection Defense: Items search safely handles SQL injection payloads via parameters', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, created_at)
      VALUES 
        ('item-1', '${testUserId}', '${testInvoiceId}', 'Real Vintage Watch', 'Watches', 'Available', datetime('now')),
        ('item-2', '${otherUserId}', 'inv-other-001', 'Other User Secret Item', 'Watches', 'Available', datetime('now'));
    `);

    // Attempt injection in search query q
    const injectionPayload = "' OR 1=1 --";
    const req = new Request(`https://techtrekgt.com/outpost/api/items?q=${encodeURIComponent(injectionPayload)}`, {
      headers: { Cookie: `auth_token=${userJwt}` }
    });

    const res = await getItems({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    // The injection string should NOT return all items; it should only match if the literal substring is found
    assert.strictEqual(body.items.length, 0);
  });

  test('SQL Injection Defense: Market comp update safely handles SQL injection in notes and parameters', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, created_at)
      VALUES ('item-comp-1', '${testUserId}', '${testInvoiceId}', 'Card', 'Cards', 'Available', datetime('now'));

      INSERT INTO market_comps (id, user_id, item_id, source, comp_title, list_price, created_at)
      VALUES ('comp-target-1', '${testUserId}', 'item-comp-1', 'ebay_sold', 'Comp Title', 45.0, datetime('now'));
    `);

    const maliciousNotes = "Normal note', is_valid = 1 WHERE '1' = '1";
    const req = new Request('https://techtrekgt.com/outpost/api/comps/market/comp-target-1', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${userJwt}`
      },
      body: JSON.stringify({
        notes: maliciousNotes,
        is_valid: 0
      })
    });

    const res = await putMarketComp({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.comp.notes, maliciousNotes);
    assert.strictEqual(body.comp.is_valid, 0);
  });

  test('SQL Injection Defense: Sales listing query safely parameterizes platform and search filters', async () => {
    mockDb._raw.exec(`
      INSERT INTO auction_items (id, user_id, invoice_id, item_name, category, status, created_at)
      VALUES 
        ('item-sale-1', '${testUserId}', '${testInvoiceId}', 'Signed Baseball', 'Sports', 'Sold', datetime('now')),
        ('item-sale-2', '${otherUserId}', 'inv-other-001', 'Private Sale Item', 'Sports', 'Sold', datetime('now'));

      INSERT INTO auction_sales (id, user_id, item_id, sale_date, platform, gross_sale_price)
      VALUES 
        ('sale-1', '${testUserId}', 'item-sale-1', '2026-10-01', 'eBay', 100.0),
        ('sale-2', '${otherUserId}', 'item-sale-2', '2026-10-01', 'eBay', 200.0);
    `);

    const injectionPlatform = "eBay' OR '1'='1";
    const req = new Request(`https://techtrekgt.com/outpost/api/sales?platform=${encodeURIComponent(injectionPlatform)}`, {
      headers: { Cookie: `auth_token=${userJwt}` }
    });

    const res = await getSales({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.sales.length, 0);
    assert.strictEqual(body.summary.total_count, 0);
  });

  test('Admin Stats: Verifies safe parameterization of admin pagination inputs', async () => {
    const req = new Request('https://techtrekgt.com/outpost/api/admin/stats?page=1&limit=25', {
      headers: { Cookie: `auth_token=${userJwt}` }
    });

    const res = await getAdminStats({ request: req, env });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(typeof body.total_users, 'number');
    assert.strictEqual(body.pagination.limit, 25);
    assert.strictEqual(body.pagination.page, 1);
  });
});
