import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedEbayListings,
  setCachedEbayListings,
  invalidateEbayListingsCache
} from '../functions/api/ebay/listingsCache.js';

test('[DB-003] Relational Normalization & Fast-Path Column Engine', async (t) => {
  // Setup in-memory mock D1 database supporting both ebay_active_listings and ebay_listings_cache
  const activeListingsStore = new Map();
  const cacheBlobStore = new Map();

  const mockDb = {
    prepare(query) {
      const q = query.trim();
      return {
        bind(...args) {
          return {
            async first() {
              if (q.includes('FROM ebay_listings_cache')) {
                const userId = args[0];
                return cacheBlobStore.get(userId) || null;
              }
              return null;
            },
            async all() {
              if (q.includes('FROM ebay_active_listings')) {
                const userId = args[0];
                const rows = Array.from(activeListingsStore.values()).filter(r => r.user_id === userId);
                return { results: rows };
              }
              return { results: [] };
            },
            async run() {
              if (q.includes('DELETE FROM ebay_active_listings') && q.includes('NOT IN')) {
                const [userId, ...keepIds] = args;
                for (const [k, v] of activeListingsStore.entries()) {
                  if (v.user_id === userId && !keepIds.includes(k)) activeListingsStore.delete(k);
                }
                return { success: true };
              }
              if (q.includes('DELETE FROM ebay_active_listings')) {
                const userId = args[0];
                for (const [k, v] of activeListingsStore.entries()) {
                  if (v.user_id === userId) activeListingsStore.delete(k);
                }
                return { success: true };
              }
              if (q.includes('DELETE FROM ebay_listings_cache')) {
                const userId = args[0];
                cacheBlobStore.delete(userId);
                return { success: true };
              }
              if (q.includes('INSERT INTO ebay_listings_cache')) {
                const [userId, json, fetchedAt] = args;
                cacheBlobStore.set(userId, { user_id: userId, listings_json: json, fetched_at: fetchedAt });
                return { success: true };
              }
              if (q.includes('INSERT INTO ebay_active_listings')) {
                const [
                  ebay_listing_id, user_id, sku, title, price, quantity,
                  quantity_sold, buyer_shipping_cost, is_free_shipping,
                  condition, status, image_url, listing_url, synced_at
                ] = args;
                activeListingsStore.set(ebay_listing_id, {
                  ebay_listing_id, user_id, sku, title, price, quantity,
                  quantity_sold, buyer_shipping_cost, is_free_shipping,
                  condition, status, image_url, listing_url, synced_at
                });
                return { success: true };
              }
              return { success: true };
            }
          };
        }
      };
    },
    async batch(stmts) {
      for (const s of stmts) {
        await s.run();
      }
    }
  };

  const testUserId = 'usr-test-relational-999';
  const sampleListings = [
    {
      listing_id: '112233445566',
      sku: 'OP-TEST-SKU1',
      title: 'Signed Hockey Puck Beckett COA',
      price: 49.99,
      quantity: 1,
      image_url: 'https://i.ebayimg.com/test-puck.jpg'
    },
    {
      listing_id: '778899001122',
      sku: 'OP-TEST-SKU2',
      title: 'Signed Football Helmet Fanatics',
      price: 199.99,
      quantity: 2,
      image_url: 'https://i.ebayimg.com/test-helmet.jpg'
    }
  ];

  await t.test('setCachedEbayListings writes discrete records to ebay_active_listings and dual-writes cache blob', async () => {
    await setCachedEbayListings(mockDb, testUserId, sampleListings);

    assert.equal(activeListingsStore.size, 2, 'Should write exactly 2 discrete rows to ebay_active_listings');
    assert.ok(activeListingsStore.has('112233445566'), 'Must contain first listing ID');
    assert.ok(activeListingsStore.has('778899001122'), 'Must contain second listing ID');

    const first = activeListingsStore.get('112233445566');
    assert.equal(first.sku, 'OP-TEST-SKU1');
    assert.equal(first.price, 49.99);

    assert.ok(cacheBlobStore.has(testUserId), 'Must also maintain legacy blob for dual-write compatibility');
  });

  await t.test('getCachedEbayListings returns normalized listing objects from ebay_active_listings when fresh', async () => {
    const cached = await getCachedEbayListings(mockDb, testUserId, 15);
    assert.ok(cached, 'Cache should be hit');
    assert.equal(cached.listings.length, 2);
    assert.equal(cached.listings[0].listing_id, '112233445566');
    assert.equal(cached.listings[0].sku, 'OP-TEST-SKU1');
    assert.equal(cached.listings[1].listing_id, '778899001122');
  });

  await t.test('invalidateEbayListingsCache purges records across both relational and blob tables', async () => {
    await invalidateEbayListingsCache(mockDb, testUserId);
    assert.equal(activeListingsStore.size, 0, 'Active listings store should be cleared');
    assert.equal(cacheBlobStore.size, 0, 'Legacy cache blob should be cleared');

    const cachedAfter = await getCachedEbayListings(mockDb, testUserId, 15);
    assert.equal(cachedAfter, null, 'Must return null after invalidation');
  });
});
