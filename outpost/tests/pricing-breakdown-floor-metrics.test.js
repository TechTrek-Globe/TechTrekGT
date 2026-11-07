import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getItemFloorMetrics } from '../src/utils/pricingMetrics.js';

describe('List Price Breakdown and Floor Cost Metrics calculations', () => {
  test('calculates True Net Profit, Margin %, and ROI % with standard inputs', () => {
    const item = {
      current_list_price: 100.00,
      true_total_cost: 50.00,
      platform_fee_pct: 0.136,
      platform_flat_fee: 0.40,
      ebay_promoted_rate: 0.05,
      target_margin_pct: 0.20,
      buyer_shipping_cost: 0
    };

    const metrics = getItemFloorMetrics(item);

    // List Price: $100.00
    // Platform Fees: (100 * 0.136) + 0.40 = 13.60 + 0.40 = 14.00
    // Ad Fees: 100 * 0.05 = 5.00
    // Landed Cost: 50.00
    // True Net Profit: 100 - 14.00 - 5.00 - 50.00 = 31.00
    assert.equal(metrics.platformFees, 14.00);
    assert.equal(metrics.adFees, 5.00);
    assert.equal(metrics.trueNetProfit, 31.00);

    // Margin %: (31.00 / 100.00) * 100 = 31.0%
    assert.equal(metrics.marginPct, 31.0);

    // ROI %: (31.00 / 50.00) * 100 = 62.0%
    assert.equal(metrics.roiPct, 62.0);
  });

  test('calculates Break-even Floor Price and Min Target Margin Floor (zero buyer shipping)', () => {
    const item = {
      true_total_cost: 50.00,
      platform_fee_pct: 0.136,
      platform_flat_fee: 0.40,
      ebay_promoted_rate: 0.05,
      target_margin_pct: 0.20,
      buyer_shipping_cost: 0
    };

    const metrics = getItemFloorMetrics(item);

    // Break-even Floor: (50 + 0.40) / (1 - 0.136 - 0.05) = 50.40 / 0.814 = 61.91646 -> 61.92
    assert.equal(metrics.breakEvenFloor, 61.92);

    // Min Target Margin Floor: (50 + 0.40) / (1 - 0.136 - 0.05 - 0.20) = 50.40 / 0.614 = 82.08469 -> 82.08
    assert.equal(metrics.targetMarginFloor, 82.08);

    // Verify 0% profit at Break-even Floor
    const testBreakEven = getItemFloorMetrics({ ...item, current_list_price: metrics.breakEvenFloor });
    assert.equal(testBreakEven.trueNetProfit, 0.00);

    // Verify 20% margin at Min Target Margin Floor
    const testMargin = getItemFloorMetrics({ ...item, current_list_price: metrics.targetMarginFloor });
    // Profit = 82.08 - ((82.08 * 0.136) + 0.40 = 11.56) - (82.08 * 0.05 = 4.10) - 50.00 = 16.42
    // Margin % = (16.42 / 82.08) * 100 = 20.0048% -> rounds to 20.0%
    assert.equal(Math.round(testMargin.marginPct), 20);
  });

  test('incorporates buyer-paid shipping platform fee burden in floor formulas', () => {
    const item = {
      true_total_cost: 50.00,
      platform_fee_pct: 0.136,
      platform_flat_fee: 0.40,
      ebay_promoted_rate: 0.05,
      target_margin_pct: 0.20,
      buyer_shipping_cost: 10.00
    };

    const metrics = getItemFloorMetrics(item);

    // Buyer shipping burden: 10.00 * 0.136 = 1.36
    // Numerator: 50.00 + 0.40 + 1.36 = 51.76
    // Break-even Floor: 51.76 / (1 - 0.136 - 0.05) = 51.76 / 0.814 = 63.5872 -> 63.59
    assert.equal(metrics.breakEvenFloor, 63.59);

    // Min Target Margin Floor: 51.76 / 0.614 = 84.30
    assert.equal(metrics.targetMarginFloor, 84.30);

    // Verify 0% profit at Break-even Floor with buyer shipping
    const testBreakEven = getItemFloorMetrics({ ...item, current_list_price: metrics.breakEvenFloor });
    // Platform fee: (63.59 + 10.00) * 0.136 + 0.40 = 73.59 * 0.136 + 0.40 = 10.01 + 0.40 = 10.41
    // Ad fee: 63.59 * 0.05 = 3.18
    // Landed cost: 50.00
    // True Net Profit: 63.59 - 10.41 - 3.18 - 50.00 = 0.00
    assert.equal(testBreakEven.trueNetProfit, 0.00);
  });

  test('handles percentage values supplied as whole numbers (e.g. 13.6 instead of 0.136)', () => {
    const item = {
      current_list_price: 100.00,
      true_total_cost: 50.00,
      platform_fee_pct: 13.6,
      platform_flat_fee: 0.40,
      ebay_promoted_rate: 5,
      target_margin_pct: 20,
      buyer_shipping_cost: 0
    };

    const metrics = getItemFloorMetrics(item);
    assert.equal(metrics.platformFees, 14.00);
    assert.equal(metrics.adFees, 5.00);
    assert.equal(metrics.trueNetProfit, 31.00);
    assert.equal(metrics.marginPct, 31.0);
    assert.equal(metrics.roiPct, 62.0);
    assert.equal(metrics.breakEvenFloor, 61.92);
    assert.equal(metrics.targetMarginFloor, 82.08);
  });

  test('gracefully handles missing or zero list price', () => {
    const item = {
      current_list_price: null,
      true_total_cost: 40.00,
      unit_price: 35.00,
      platform_fee_pct: 0.136,
      platform_flat_fee: 0.40
    };

    const metrics = getItemFloorMetrics(item);
    assert.equal(metrics.hasPrice, false);
    assert.equal(metrics.listPrice, 0);
    assert.equal(metrics.trueNetProfit, 0);
    assert.equal(metrics.marginPct, 0);
    assert.equal(metrics.roiPct, 0);
    assert.ok(metrics.breakEvenFloor > 0);
  });
});
