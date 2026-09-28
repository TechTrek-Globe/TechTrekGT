import { test } from 'node:test';
import assert from 'node:assert/strict';
import { round2, computePricingFloors } from '../functions/utils/auction.js';
import {
    round2 as formulaRound2,
    computeItemProration,
    computePricingFloors as formulaPricingFloors,
    computeSaleMetrics,
    roundPrice
} from '../src/utils/formulaPreview.js';
import { round as feeRound } from '../src/utils/feeEngine.js';

test('LOW-5: Backend round2 handles currency rounding and edge cases consistently', () => {
    assert.strictEqual(round2(10.556), 10.56);
    assert.strictEqual(round2(10.554), 10.55);
    assert.strictEqual(round2('10.556'), 10.56);
    assert.strictEqual(round2(0), 0);
    assert.strictEqual(round2(null), 0);
    assert.strictEqual(round2(undefined), 0);
    assert.strictEqual(round2(''), 0);
    assert.strictEqual(round2(NaN), 0);
});

test('LOW-5: Frontend round2 matches backend round2 behavior', () => {
    assert.strictEqual(formulaRound2(12.345), 12.35);
    assert.strictEqual(formulaRound2('99.999'), 100);
    assert.strictEqual(formulaRound2(0), 0);
    assert.strictEqual(formulaRound2(null), 0);
    assert.strictEqual(formulaRound2(undefined), 0);
});

test('LOW-5: feeEngine.round delegates 2-decimal rounding to round2', () => {
    assert.strictEqual(feeRound(14.856), 14.86);
    assert.strictEqual(feeRound(14.854), 14.85);
    assert.strictEqual(feeRound(14.856, 2), 14.86);
    // Custom decimals still work
    assert.strictEqual(feeRound(14.8564, 3), 14.856);
});

test('LOW-5: computePricingFloors in auction.js centralizes currency calculations through round2', () => {
    const floors = computePricingFloors({
        true_total_cost: 25.123,
        est_shipping_cost: 4.888,
        platform_flat_fee: 1.001,
        platform_fee_pct: 0.1325,
        boost_pct: 0.02,
        target_margin_pct: 0.20
    });

    // Floor price and suggested list price should be rounded to 2 decimal places exactly
    assert.strictEqual(floors.min_sell_price, round2(floors.min_sell_price));
    assert.strictEqual(floors.suggested_list_price, round2(floors.suggested_list_price));
    assert.strictEqual(floors.min_sell_price, 36.59);
    assert.strictEqual(floors.suggested_list_price, 43.91);
});

test('LOW-5: computeItemProration in formulaPreview.js rounds prorated costs through round2', () => {
    const item = { unit_price: 25.555 };
    const invoice = { base_total: 100, discount: 5, shipping: 10, tax: 7.5 };
    const proration = computeItemProration(item, invoice);

    assert.strictEqual(proration.prorated_discount, round2(proration.prorated_discount));
    assert.strictEqual(proration.prorated_shipping, round2(proration.prorated_shipping));
    assert.strictEqual(proration.prorated_tax, round2(proration.prorated_tax));
    assert.strictEqual(proration.true_total_cost, round2(proration.true_total_cost));
});

test('LOW-5: computeSaleMetrics in formulaPreview.js rounds profit and net proceeds through round2', () => {
    const metrics = computeSaleMetrics({
        gross_sale_price: 49.99,
        true_total_cost: 20.15,
        platform_fee_pct: 0.13,
        platform_flat_fee: 0.30,
        actual_shipping_cost: 5.20,
        buyer_shipping_paid: 6.00
    });

    assert.strictEqual(metrics.net_proceeds, round2(metrics.net_proceeds));
    assert.strictEqual(metrics.net_profit, round2(metrics.net_profit));
    assert.strictEqual(metrics.platform_fees_amt, round2(metrics.platform_fees_amt));
});
