import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setCachedEbayListings,
  getCachedEbayListings,
  invalidateEbayListingsCache,
  ensureEbayListingsCacheTable
} from '../functions/api/ebay/listingsCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

function createInstrumentedMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec(auctionSchema);

  const executedStatements = [];

  return {
    _raw: db,
    executedStatements,
    prepare(sql) {
      executedStatements.push(sql.trim());
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

describe('LOW-2: Cache Table Existence Check Removal From Hot Path', () => {
  let mockDb;
  const userId = 'usr-cache-test-100';

  beforeEach(() => {
    mockDb = createInstrumentedMockD1();

    // Seed test user
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin)
      VALUES (?, 'cacheuser@techtrekgt.test', 'dummyhash', 'Cache User', 'Active', 1, 0)
    `).run(userId);
  });

  test('setCachedEbayListings does NOT issue CREATE TABLE statement on write hot path', async () => {
    const sampleListings = [
      { itemId: '111222333444', title: 'Vintage 1982 Card', price: 49.99, sku: 'OP-260901-0001' },
      { itemId: '555666777888', title: 'Autographed Baseball', price: 129.50, sku: 'OP-260901-0002' }
    ];

    mockDb.executedStatements.length = 0; // Clear statement log

    // Perform cache write
    await setCachedEbayListings(mockDb, userId, sampleListings);

    // Verify CREATE TABLE was NEVER executed
    const createTableStatements = mockDb.executedStatements.filter(s =>
      s.toUpperCase().includes('CREATE TABLE')
    );
    assert.strictEqual(
      createTableStatements.length,
      0,
      'setCachedEbayListings must NOT execute CREATE TABLE on write hot path'
    );

    // Verify the write was performed via INSERT ON CONFLICT
    const insertStatements = mockDb.executedStatements.filter(s =>
      s.toUpperCase().includes('INSERT INTO EBAY_LISTINGS_CACHE')
    );
    assert.strictEqual(insertStatements.length, 1, 'Exactly one INSERT statement should be executed');
  });

  test('Cached listings are successfully written and read back via getCachedEbayListings', async () => {
    const sampleListings = [
      { itemId: '123456789012', title: 'Signed Jersey', price: 299.99, quantity: 1 }
    ];

    // Write to cache
    await setCachedEbayListings(mockDb, userId, sampleListings);

    // Read from cache
    const cached = await getCachedEbayListings(mockDb, userId, 15);
    assert.ok(cached, 'Cache read should return cached object');
    assert.strictEqual(cached.listings.length, 1);
    assert.strictEqual(cached.listings[0].itemId, '123456789012');
    assert.strictEqual(cached.listings[0].title, 'Signed Jersey');
    assert.strictEqual(cached.listings[0].price, 299.99);
    assert.ok(cached.fetched_at, 'Cached object should include fetched_at timestamp');
  });

  test('Repeated writes update the cache and never issue CREATE TABLE across multiple sync cycles', async () => {
    mockDb.executedStatements.length = 0;

    // Simulate 3 consecutive sync-all / sync-item cache writes
    for (let cycle = 1; cycle <= 3; cycle++) {
      await setCachedEbayListings(mockDb, userId, [{ itemId: `item-${cycle}`, title: `Item ${cycle}` }]);
    }

    // Verify ZERO CREATE TABLE statements across all 3 cycles
    const createTableStatements = mockDb.executedStatements.filter(s =>
      s.toUpperCase().includes('CREATE TABLE')
    );
    assert.strictEqual(createTableStatements.length, 0);

    // Verify 3 INSERT statements
    const insertStatements = mockDb.executedStatements.filter(s =>
      s.toUpperCase().includes('INSERT INTO EBAY_LISTINGS_CACHE')
    );
    assert.strictEqual(insertStatements.length, 3);

    // Confirm newest value is retained in DB
    const cached = await getCachedEbayListings(mockDb, userId);
    assert.strictEqual(cached.listings[0].itemId, 'item-3');
  });

  test('invalidateEbayListingsCache purges cached records', async () => {
    await setCachedEbayListings(mockDb, userId, [{ itemId: 'item-to-purge', title: 'Test' }]);
    const beforeInvalidate = await getCachedEbayListings(mockDb, userId);
    assert.ok(beforeInvalidate);

    await invalidateEbayListingsCache(mockDb, userId);
    const afterInvalidate = await getCachedEbayListings(mockDb, userId);
    assert.strictEqual(afterInvalidate, null);
  });

  test('ensureEbayListingsCacheTable still functions as a standalone utility when called manually', async () => {
    mockDb.executedStatements.length = 0;

    await ensureEbayListingsCacheTable(mockDb);

    const createTableStatements = mockDb.executedStatements.filter(s =>
      s.toUpperCase().includes('CREATE TABLE')
    );
    assert.strictEqual(createTableStatements.length, 1, 'Manual invocation should run CREATE TABLE statement');
  });
});
