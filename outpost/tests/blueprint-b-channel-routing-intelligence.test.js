import test from 'node:test';
import assert from 'node:assert/strict';
import { compareChannelEconomics } from '../functions/utils/auction.js';
import { generateFacebookCopy } from '../src/utils/listingCopyGenerator.js';

test('Blueprint B: compareChannelEconomics calculations', async (t) => {
  const item = {
    current_list_price: 100.00,
    true_total_cost: 30.00,
    est_shipping_cost: 8.50,
    buyer_shipping_cost: 0.00, // Free shipping to buyer
    platform_fee_pct: 0.1325,
    platform_flat_fee: 0.30,
    ebay_promoted_rate: 0.05
  };

  await t.test('calculates eBay shipped fees and net profit correctly', () => {
    const res = compareChannelEconomics(item);
    // eBay: gross = 100
    // FVF: 100 * 0.1325 = 13.25
    // Ad fee: 100 * 0.05 = 5.00
    // Flat: 0.30 -> Total fees: 18.55
    // Outbound label: 8.50
    // Net proceeds: 100 - 18.55 - 8.50 = 72.95
    // Net profit: 72.95 - 30.00 = 42.95
    assert.equal(res.ebay.gross_revenue, 100.00);
    assert.equal(res.ebay.platform_fees, 18.55);
    assert.equal(res.ebay.shipping_cost, 8.50);
    assert.equal(res.ebay.net_proceeds, 72.95);
    assert.equal(res.ebay.net_profit, 42.95);
    assert.equal(res.ebay.margin_pct, 0.4295);
  });

  await t.test('calculates Facebook Marketplace zero-fee economics correctly', () => {
    const res = compareChannelEconomics(item);
    // Local: gross = 100
    // Fees: 0
    // Shipping: 0
    // Net profit: 100 - 30 = 70.00
    assert.equal(res.local.gross_revenue, 100.00);
    assert.equal(res.local.platform_fees, 0);
    assert.equal(res.local.shipping_cost, 0);
    assert.equal(res.local.net_proceeds, 100.00);
    assert.equal(res.local.net_profit, 70.00);
    assert.equal(res.local.margin_pct, 0.70);
    assert.equal(res.local.break_even_floor, 30.00);
  });

  await t.test('recommends Facebook Marketplace when local net profit is higher', () => {
    const res = compareChannelEconomics(item);
    // Advantage = 70.00 - 42.95 = +27.05
    assert.equal(res.net_advantage, 27.05);
    assert.equal(res.recommended_channel, 'Facebook Marketplace / Local Pickup');
    assert.match(res.reason, /Local pickup yields \+\$27\.05 higher net profit/);
  });

  await t.test('supports optional local buyer cash discount', () => {
    // If user offers 10% discount on Facebook (selling for $90 cash)
    const res = compareChannelEconomics(item, { localDiscountPct: 0.10 });
    assert.equal(res.local.gross_revenue, 90.00);
    assert.equal(res.local.net_profit, 60.00); // 90 - 30
    assert.equal(res.net_advantage, 17.05); // 60.00 - 42.95
    assert.equal(res.recommended_channel, 'Facebook Marketplace / Local Pickup');
  });
});

test('Blueprint B: generateFacebookCopy local template generation', async (t) => {
  const item = {
    item_name: 'Autographed Signed Football',
    athlete_person: 'Patrick Mahomes',
    authenticator: 'Beckett',
    cert_number: 'BAS12345',
    current_list_price: 250.00,
    condition: 'Brand New / Excellent',
    notes: 'Stored in smoke-free climate controlled vault. Internal Lot #987234'
  };

  const options = {
    brand: 'Wilson',
    features: ['Official NFL Duke football', 'Bold silver paint pen signature', 'Beckett QR tamper-proof hologram'],
    pickupLocation: 'Safe public meetup at Police Station parking lot',
    paymentTerms: 'Cash or Zelle only on pickup'
  };

  const copy = generateFacebookCopy(item, options);

  await t.test('generates clean title with brand and condition under 100 chars', () => {
    assert.ok(copy.title.length <= 100, `Title must be <= 100 chars, got ${copy.title.length}`);
    assert.match(copy.title, /Wilson - Autographed Signed Football/);
    assert.match(copy.title, /\(New\)/);
  });

  await t.test('formats cash asking price', () => {
    assert.equal(copy.price, '$250.00');
  });

  await t.test('strips internal tracking and lot notes from description', () => {
    assert.ok(!copy.textBody.includes('Lot #987234'), 'Internal lot notes must be stripped');
    assert.ok(copy.textBody.includes('Stored in smoke-free climate controlled vault.'));
  });

  await t.test('includes athlete and Beckett authentication details', () => {
    assert.ok(copy.textBody.includes('Patrick Mahomes'));
    assert.ok(copy.textBody.includes('Beckett (Cert #BAS12345)'));
    assert.ok(copy.textBody.includes('100% Guaranteed authentic.'));
  });

  await t.test('includes bulleted highlights and local pickup terms', () => {
    assert.ok(copy.textBody.includes('• Official NFL Duke football'));
    assert.ok(copy.textBody.includes('• Safe public meetup at Police Station parking lot'));
    assert.ok(copy.textBody.includes('• Cash or Zelle only on pickup'));
    assert.ok(copy.textBody.includes('First come, first served. Serious inquiries only. No trades.'));
  });
});
