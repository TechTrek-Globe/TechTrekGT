import { test, describe } from 'node:test';
import assert from 'node:assert';

import { DEFAULT_PLATFORMS } from '../functions/utils/platforms.js';
import { DEFAULT_PLATFORMS as DEFAULT_PLATFORMS_REEXPORT } from '../functions/api/platforms/index.js';
import {
  cleanEbaySearchQuery,
  buildEbaySearchUrl,
  parseImageFromNotes,
  parseUserNote
} from '../functions/utils/ebayUtils.js';
import { computeManualAvg, computeRecommendedListPrice } from '../functions/utils/auction.js';

describe('[MED-13] Bundled Logic De-duplication and Shared Module Parity', () => {
  describe('DEFAULT_PLATFORMS shared module', () => {
    test('exports expected platforms array with identical re-export in platforms/index.js', () => {
      assert.strictEqual(DEFAULT_PLATFORMS, DEFAULT_PLATFORMS_REEXPORT);
      assert.ok(Array.isArray(DEFAULT_PLATFORMS));
      assert.strictEqual(DEFAULT_PLATFORMS.length, 12);

      const ebay = DEFAULT_PLATFORMS.find(p => p.name === 'eBay');
      assert.ok(ebay);
      assert.strictEqual(ebay.fee_pct, 0.136);
      assert.strictEqual(ebay.flat_fee, 0.40);
      assert.strictEqual(ebay.is_default, 1);
    });
  });

  describe('ebayUtils query cleaning and search URL generation', () => {
    test('cleanEbaySearchQuery normalizes quotes, dashes, noise phrases, and year ranges', () => {
      const rawTitle = 'Lot #12345: 2021/22 Panini Prizm Patrick Mahomes WOW RARE MUST SEE! Look!!';
      const cleaned = cleanEbaySearchQuery(rawTitle, 'Patrick Mahomes', 'PSA');

      assert.ok(cleaned.includes('2021-22'));
      assert.ok(cleaned.includes('Patrick Mahomes'));
      assert.ok(cleaned.includes('PSA'));
      assert.ok(!cleaned.toLowerCase().includes('wow'));
      assert.ok(!cleaned.toLowerCase().includes('must see'));
      assert.ok(!cleaned.toLowerCase().includes('look'));
      assert.ok(!cleaned.toLowerCase().includes('lot #12345'));
    });

    test('buildEbaySearchUrl constructs valid sold/completed eBay search link', () => {
      const url = buildEbaySearchUrl('Shohei Ohtani Rookie Card', 'Shohei Ohtani', 'BGS 9.5');
      assert.ok(url.startsWith('https://www.ebay.com/sch/i.html?_nkw='));
      assert.ok(url.includes('LH_Sold=1'));
      assert.ok(url.includes('LH_Complete=1'));
    });

    test('parseImageFromNotes extracts and normalizes image URL', () => {
      const notes = 'Order ID: 111-2222222-3333333 | ASIN: B0TEST1234 | Image: http://images.amazon.com/item.jpg | Imported from Amazon';
      const img = parseImageFromNotes(notes);
      assert.strictEqual(img, 'https://images.amazon.com/item.jpg');

      assert.strictEqual(parseImageFromNotes(null), null);
      assert.strictEqual(parseImageFromNotes(''), null);
      assert.strictEqual(parseImageFromNotes('No image in note'), null);
    });

    test('parseUserNote strips auto-injected Amazon meta tokens and preserves custom notes', () => {
      const notes = 'Order ID: 111-2222222-3333333 | ASIN: B0TEST1234 | Image: https://images.amazon.com/item.jpg | Stored in Box #4 | Imported from Amazon';
      const userNote = parseUserNote(notes);
      assert.strictEqual(userNote, 'Stored in Box #4');

      assert.strictEqual(parseUserNote(null), null);
      assert.strictEqual(parseUserNote('   '), null);
    });
  });

  describe('computeManualAvg shared calculation in auction.js', () => {
    test('computes rounded 2-decimal average of positive comps', () => {
      assert.strictEqual(computeManualAvg(10.00, 20.00, 30.00), 20.00);
      assert.strictEqual(computeManualAvg('15.50', '25.50', null), 20.50);
      assert.strictEqual(computeManualAvg(12.345, 12.345, 12.345), 12.35);
    });

    test('returns null when all comps are null, zero, negative, or invalid', () => {
      assert.strictEqual(computeManualAvg(null, undefined, ''), null);
      assert.strictEqual(computeManualAvg(0, -5, NaN), null);
      assert.strictEqual(computeManualAvg(null, null, null), null);
    });

    test('computeRecommendedListPrice falls back safely to min_sell_price when comps are null', () => {
      assert.strictEqual(computeRecommendedListPrice(50.00, null, null), 50.00);
      assert.strictEqual(computeRecommendedListPrice(50.00, 75.00, null), 75.00);
      assert.strictEqual(computeRecommendedListPrice(50.00, 75.00, 90.00), 90.00);
    });
  });
});
