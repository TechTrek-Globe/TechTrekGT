import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORTED_PLATFORMS,
  HARD_EMOJI_BLOCKLIST,
  computeUtf16Length,
  buildPlatformPayload,
  validatePlatformPayload,
  buildPlatformSystemPrompt
} from '../src/utils/platformListingRules.js';
import {
  generateEbayCopy,
  generateFacebookCopy,
  generateWhatnotCopy,
  generateMercariCopy,
  generateReverbCopy,
  generatePlatformListing
} from '../src/utils/listingCopyGenerator.js';
import { getCertVerificationUrl } from '../src/utils/certLookup.js';
import { generateAiPlatformListing, onRequestPost } from '../functions/api/ai/generate-ebay-details.js';
import { createToken } from '../functions/utils/auth.js';

const BASE_CUSTOM_JERSEY = {
  item_name: 'Brock Bowers Signed Black Georgia Bulldogs Custom Stitched Jersey',
  category: 'Sports Memorabilia',
  athlete_person: 'Brock Bowers',
  team_or_band: 'Georgia Bulldogs',
  sport_genre: 'Football',
  authenticator: 'JSA',
  cert_number: 'WA123456',
  inscription: 'Go Dawgs',
  brand: 'Nike',
  size: 'XL',
  is_wearable: true,
  is_custom_jersey: true,
  targetNet: 200,
  notes: 'Lot #44 - ASIN B08N5WRWNW - Mint condition custom stitched jersey'
};

const BASE_PICKGUARD_GUITAR = {
  item_name: 'Taylor Swift Signed Pickguard Display Acoustic Guitar',
  category: 'Music Memorabilia',
  productType: 'Signed Pickguard Display Guitar',
  athlete_person: 'Taylor Swift',
  sport_genre: 'Country Rock',
  authenticator: 'JSA',
  cert_number: 'JJ98765',
  brand: 'Fender',
  size: 'XL',
  is_pickguard_guitar: true,
  targetNet: 500,
  notes: 'Brand new 38-inch acoustic display guitar with hand-signed custom pickguard'
};

const BASE_LOW_RISK_LOCAL = {
  item_name: 'Vintage Wooden Jewelry Valet Box',
  category: 'Home Decor',
  condition: 'Like New',
  targetNet: 40,
  notes: 'Clean solid wood organizer tray'
};

test('All 5 platforms generate titles <= 80 UTF-16 code units with single allowed trailing emoji', () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const { payload, validation } = generatePlatformListing(platform, BASE_CUSTOM_JERSEY);
    const len = computeUtf16Length(payload.title);
    assert.ok(len > 0 && len <= 80, `${platform} title "${payload.title}" length ${len} exceeds 80 UTF-16 units`);
    assert.equal(validation.passed, true, `${platform} validation failed: ${validation.errors.join('; ')}`);

    // Zero blocklisted emojis anywhere
    for (const badEmoji of HARD_EMOJI_BLOCKLIST) {
      assert.equal(payload.title.includes(badEmoji), false, `${platform} title contains banned emoji ${badEmoji}`);
    }

    // Wearable Size XL present as standalone token (no "Size:" prefix)
    assert.match(payload.title, /\bXL\b/);
    assert.equal(/\bSize\s*:/i.test(payload.title), false);
    assert.equal(/\u2014|\u2013/.test(payload.title), false, `${platform} title contains em/en dash`);
  }
});

test('Non-wearable guitar omits apparel Size token even if size is passed, and includes pickguard disclosure', () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const { payload, validation } = generatePlatformListing(platform, BASE_PICKGUARD_GUITAR);
    const resolvedSize = platform === 'ebay' ? payload.item_specifics?.Size : payload.size;
    assert.equal(resolvedSize, null, `${platform} should resolve size=null for display guitar`);
    assert.equal(/\bXL\b/.test(payload.title), false, `${platform} guitar title should not inject XL`);
    assert.equal(validation.passed, true, `${platform} guitar validation errors: ${validation.errors.join('; ')}`);
  }

  const reverb = generateReverbCopy(BASE_PICKGUARD_GUITAR);
  assert.match(reverb.title, /Pickguard/i);
  assert.match(reverb.htmlBody, /pickguard/i);
  assert.equal(reverb.payload.brand, 'Unbranded');
  assert.equal(reverb.payload.model, 'Custom Display Acoustic Guitar');
  assert.equal(reverb.payload.shipping_profile.handling_days, 3);
  assert.match(reverb.payload.shipping_profile.box_dimensions_note, /48 inches/);
});

test('Exact fee-adjusted pricing math across all 5 platforms', () => {
  const reverb = buildPlatformPayload('reverb', { ...BASE_PICKGUARD_GUITAR, targetNet: 500 }).payload.pricing_guidance;
  assert.equal(reverb.minimum_acceptable_offer, Math.ceil((500 + 0.49) / 0.9181));
  assert.equal(reverb.suggested_list_price, Math.ceil(((500 + 0.49) / 0.9181) * 1.12));

  const whatnot = buildPlatformPayload('whatnot', { ...BASE_CUSTOM_JERSEY, targetNet: 200 }).payload.pricing_guidance;
  assert.equal(whatnot.minimum_offer_auto_accept, Math.ceil((200 + 0.30) / 0.891));
  assert.equal(whatnot.buy_it_now_price, Math.ceil(((200 + 0.30) / 0.891) * 1.12));

  const mercari = buildPlatformPayload('mercari', { ...BASE_CUSTOM_JERSEY, targetNet: 200 }).payload.pricing_guidance;
  assert.equal(mercari.suggested_list_price, Math.ceil(200 * 1.18));
  assert.equal(mercari.minimum_acceptable_price, 200);

  const facebook = buildPlatformPayload('facebook', { ...BASE_CUSTOM_JERSEY, targetNet: 200 }).payload.pricing_guidance;
  assert.equal(facebook.suggested_list_price, Math.ceil(200 * 1.15));
  assert.equal(facebook.minimum_acceptable_price, 200);

  const ebay = buildPlatformPayload('ebay', { ...BASE_CUSTOM_JERSEY, targetNet: 200 }).payload.pricing_guidance;
  assert.equal(ebay.minimum_acceptable_price, Math.ceil((200 + 0.40) / 0.864));
  assert.equal(ebay.suggested_list_price, Math.ceil(((200 + 0.40) / 0.864) * 1.12));
});

test('Facebook Marketplace enforces brand: null on custom jerseys and unbranded guitars, Tier 1 vs Tier 2 meetups, Cash/Apple Pay only, and relist_title', () => {
  const fbJersey = generateFacebookCopy(BASE_CUSTOM_JERSEY, { enforcePlatformRules: true });
  assert.equal(fbJersey.payload.brand, null);
  assert.equal(/\bNike\b/i.test(fbJersey.title), false);
  assert.equal(/\bNike\b/i.test(fbJersey.textBody), false);
  assert.equal(fbJersey.payload.logistics.risk_tier, 'High-Value Autographed');
  assert.match(fbJersey.payload.logistics.meetup_location, /Police Precinct|QuikTrip/i);
  assert.deepEqual(fbJersey.payload.logistics.accepted_local_payments, ['Cash', 'Apple Pay']);
  assert.equal(fbJersey.payload.logistics.shipping_enabled, true);
  assert.ok(fbJersey.payload.relist_title && fbJersey.payload.relist_title !== fbJersey.title);
  assert.ok(computeUtf16Length(fbJersey.payload.relist_title) <= 80);
  assert.ok(fbJersey.payload.product_tags.length >= 12 && fbJersey.payload.product_tags.length <= 20);

  const fbGuitar = generateFacebookCopy(BASE_PICKGUARD_GUITAR, { enforcePlatformRules: true });
  assert.equal(fbGuitar.payload.brand, null);
  assert.equal(/\bFender\b/i.test(fbGuitar.title), false);
  assert.equal(/\bFender\b/i.test(fbGuitar.textBody), false);

  const fbLowRisk = generateFacebookCopy(BASE_LOW_RISK_LOCAL, { enforcePlatformRules: true });
  assert.equal(fbLowRisk.payload.logistics.risk_tier, 'Standard Lower-Risk');
  assert.equal(fbLowRisk.payload.logistics.meetup_location, 'Mason Mill Park');
});

test('Mercari enforces plain text <= 1000 chars, zero URLs, No Brand on custom jerseys, and 8-12 hashtags', () => {
  const mercari = generateMercariCopy(BASE_CUSTOM_JERSEY, { enforcePlatformRules: true });
  assert.equal(mercari.payload.brand, 'No Brand');
  assert.ok(mercari.description.length <= 1000, `Mercari length ${mercari.description.length} exceeds 1000`);
  assert.equal(/https?:\/\/|www\.|\.(com|net|org)\b/i.test(mercari.description), false);
  assert.equal(/<[a-z][\s\S]*>/i.test(mercari.description), false);
  assert.ok(mercari.payload.hashtags.length >= 8 && mercari.payload.hashtags.length <= 12);
  assert.equal(/\u2014|\u2013/.test(mercari.description), false);
});

test('Whatnot assigns item weight tier and live-show scannable bullet notes without banned brands', () => {
  const wnGuitar = generateWhatnotCopy(BASE_PICKGUARD_GUITAR, { enforcePlatformRules: true });
  assert.equal(wnGuitar.payload.shipping_profile.estimated_packed_weight, '8-12 lbs');
  assert.equal(wnGuitar.payload.listing_format_recommendation, 'Buy It Now (Accepting Offers)');
  assert.equal(/https?:\/\//i.test(wnGuitar.notes), false);
  assert.equal(/<[a-z][\s\S]*>/i.test(wnGuitar.notes), false);

  const wnPhoto = generateWhatnotCopy({
    item_name: 'Kirby Smart Signed 8x10 Photo',
    athlete_person: 'Kirby Smart',
    authenticator: 'Beckett',
    cert_number: 'B99001',
    targetNet: 75
  }, { enforcePlatformRules: true });
  assert.equal(wnPhoto.payload.shipping_profile.estimated_packed_weight, '8-12 oz');
  assert.equal(wnPhoto.payload.listing_format_recommendation, 'Live Auction (Pre-Bids Enabled)');
});

test('eBay enforces SEO HTML, category lock, item specifics, and rejects banned COA issuers', () => {
  const ebayOk = generateEbayCopy(BASE_CUSTOM_JERSEY, { enforcePlatformRules: true });
  assert.equal(ebayOk.validation.passed, true);
  assert.equal(ebayOk.payload.item_specifics.Brand, 'Unbranded');
  assert.equal(ebayOk.payload.category_path, 'Sports Mem, Cards & Fan Shop > Autographs-Original');
  assert.equal(/Lot #44|B08N5WRWNW/i.test(ebayOk.htmlBody), false, 'Internal lot/ASIN leaked into eBay HTML');

  const badCoa = validatePlatformPayload('ebay', {
    title: 'Fake COA Signed Ball ⚾',
    description_html: '<p>Item with Coach\'s Corner COA</p>'
  }, {
    item_name: 'Signed Ball',
    authenticator: "Coach's Corner"
  });
  assert.equal(badCoa.passed, false);
  assert.ok(badCoa.errors.some(e => /banned|authenticator/i.test(e)));
});

test('Zero em dashes or en dashes exist across all generated system prompts', () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const prompt = buildPlatformSystemPrompt(platform);
    assert.equal(/\u2014|\u2013/.test(prompt), false, `${platform} system prompt contains em/en dash`);
  }
});

test('generateAiPlatformListing & onRequestPost support mode: platform_listing and enforce invariants over Gemini output', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              title: 'Brock Bowers Autographed Georgia Bulldogs Black Custom Jersey XL JSA \u2014 🏈',
              relist_title: 'Brock Bowers Signed Black Georgia Bulldogs Custom Jersey XL JSA 🏈',
              brand: 'Nike',
              description_plain_text: 'Hand-signed custom jersey \u2014 verified by JSA.',
              pricing_guidance: { suggested_list_price: 9999, minimum_acceptable_price: 9999 }
            })
          }]
        }
      }]
    })
  });

  try {
    const result = await generateAiPlatformListing({ GEMINI_API_KEY: 'test-key' }, {
      platform: 'facebook',
      ...BASE_CUSTOM_JERSEY
    });
    assert.equal(result.success, true);
    assert.equal(result.platform, 'facebook');
    // Server must enforce brand: null on custom Facebook jerseys even if Gemini echoed Nike
    assert.equal(result.payload.brand, null);
    // Server must enforce deterministic pricing guidance math (+15% of 200 = 230)
    assert.equal(result.payload.pricing_guidance.suggested_list_price, 230);
    // Server must sanitize em dashes out of AI output
    assert.equal(/\u2014|\u2013/.test(result.payload.title), false);
    assert.equal(/\u2014|\u2013/.test(result.payload.description_plain_text), false);

    // Also test HTTP handler onRequestPost routing with mode: 'platform_listing'
    const token = await createToken({ userId: 'usr-admin-1', tv: 1 }, 'dev-secret');
    const req = new Request('https://outpost.local/api/ai/generate-ebay-details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${token}`
      },
      body: JSON.stringify({
        mode: 'platform_listing',
        platform: 'reverb',
        ...BASE_PICKGUARD_GUITAR
      })
    });
    const res = await onRequestPost({
      request: req,
      env: { GEMINI_API_KEY: 'test-key', JWT_SECRET: 'dev-secret' }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.platform, 'reverb');
    assert.ok(body.payload.pricing_guidance.suggested_list_price > 500);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Beckett verification URL resolves to /get-data/{certNumber}', () => {
  const url1 = getCertVerificationUrl('Beckett', '4W782426');
  assert.equal(url1, 'https://www.beckett-authentication.com/get-data/4W782426');

  const url2 = getCertVerificationUrl('Beckett/BAS', '#4W782426');
  assert.equal(url2, 'https://www.beckett-authentication.com/get-data/4W782426');

  const url3 = getCertVerificationUrl('BGS', '0012345');
  assert.equal(url3, 'https://www.beckett-authentication.com/get-data/0012345');
});

