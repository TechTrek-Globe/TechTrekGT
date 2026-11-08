/**
 * Pricing metrics calculation engine for List Price Breakdown and Floor Cost Metrics.
 * Pure functions with zero side effects.
 *
 * Formulas:
 * 1. True Net Profit: listPrice - platformFees - adFees - landedCost
 * 2. Margin %: (True Net Profit / listPrice) * 100
 * 3. ROI %: (True Net Profit / landedCost) * 100
 * 4. Break-even Floor Price (0% profit):
 *    (landedCost + estShippingCost + platformFlatFee) / (1 - platformFeePct - adFeePct)
 *    Matches canonical computePricingFloors from functions/utils/auction.js (T-10 item 1).
 *    Business rule: buyer-paid shipping does NOT offset or burden the item floor.
 * 5. Min Target Margin Floor:
 *    (landedCost + estShippingCost + platformFlatFee) / (1 - platformFeePct - adFeePct - targetMarginPct)
 */

import { round2 } from '../../functions/utils/auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  DEFAULT_TARGET_MARGIN_PCT
} from '../../functions/utils/constants.js';

export function getItemFloorMetrics(item) {
  if (!item) {
    return {
      hasPrice: false,
      listPrice: 0,
      landed: 0,
      landedCost: 0,
      acquisition: 0,
      proratedShip: 0,
      platformFeePct: DEFAULT_PLATFORM_FEE_PCT,
      platformFlatFee: DEFAULT_PLATFORM_FLAT_FEE,
      platformFees: 0,
      adFeePct: 0,
      adFees: 0,
      trueNetProfit: 0,
      marginPct: 0,
      roiPct: 0,
      breakEven: 0,
      breakEvenFloor: 0,
      targetDecimal: DEFAULT_TARGET_MARGIN_PCT,
      targetMarginPct: DEFAULT_TARGET_MARGIN_PCT,
      targetFloor: 0,
      targetMarginFloor: 0
    };
  }

  const trueCost = Number(item.true_total_cost) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const proratedShip = Number(item.prorated_shipping || 0);
  const proratedTax = Number(item.prorated_tax || 0);
  const proratedDiscount = Number(item.prorated_discount || 0);
  const hasProration = proratedShip > 0 || proratedTax > 0 || proratedDiscount > 0;
  const acquisition = round2(
    unitPrice > 0
      ? unitPrice
      : (hasProration ? Math.max(0, trueCost - proratedShip - proratedTax + proratedDiscount) : trueCost)
  );

  const landedCost = round2(trueCost > 0 ? trueCost : unitPrice);

  const rawListPrice = item.current_list_price;
  const listPrice = (rawListPrice !== null && rawListPrice !== undefined && rawListPrice !== '' && !isNaN(Number(rawListPrice)))
    ? Math.max(0, round2(rawListPrice))
    : 0;
  const hasPrice = listPrice > 0;

  // Platform Fee % (normalized decimal)
  const rawPlatformFeePct = item.platform_fee_pct != null && item.platform_fee_pct !== ''
    ? Number(item.platform_fee_pct)
    : DEFAULT_PLATFORM_FEE_PCT;
  const platformFeePct = rawPlatformFeePct > 1 ? rawPlatformFeePct / 100 : (rawPlatformFeePct || 0);

  // Platform Flat Fee
  const platformFlatFee = round2(
    item.platform_flat_fee != null && item.platform_flat_fee !== ''
      ? Number(item.platform_flat_fee)
      : DEFAULT_PLATFORM_FLAT_FEE
  );

  // Promoted Ad Fee % (normalized decimal)
  const rawBoost = item.ebay_promoted_rate ?? item.boost_pct ?? 0;
  const numBoost = Number(rawBoost);
  const adFeePct = numBoost > 1 ? numBoost / 100 : (numBoost || 0);

  // Target Margin % (normalized decimal)
  const rawTarget = item.target_margin_pct != null && item.target_margin_pct !== ''
    ? Number(item.target_margin_pct)
    : DEFAULT_TARGET_MARGIN_PCT;
  const targetMarginPct = rawTarget > 1 ? rawTarget / 100 : (rawTarget || 0);

  // Buyer shipping paid
  const buyerShipping = Math.max(
    0,
    Number(item.buyer_shipping_cost ?? item.shipping_charged ?? item.buyer_shipping_paid ?? 0) || 0
  );
  const buyerShippingBurden = round2(buyerShipping * platformFeePct);

  // 1. Platform & Ad Fees at listPrice
  // Final Value Fee applies to (listPrice + buyerShipping) plus flat fee
  const platformFees = hasPrice ? round2(((listPrice + buyerShipping) * platformFeePct) + platformFlatFee) : 0;
  const adFees = hasPrice ? round2(listPrice * adFeePct) : 0;

  // 1. True Net Profit: listPrice - platformFees - adFees - landedCost
  const trueNetProfit = hasPrice ? round2(listPrice - platformFees - adFees - landedCost) : 0;

  // 2. Margin %: (True Net Profit / listPrice) * 100
  const marginPct = (hasPrice && listPrice > 0) ? round2((trueNetProfit / listPrice) * 100) : 0;

  // 3. ROI %: (True Net Profit / landedCost) * 100
  const roiPct = (hasPrice && landedCost > 0) ? round2((trueNetProfit / landedCost) * 100) : 0;

  // 4. Break-even Floor Price (0% profit):
  //    Matches canonical computePricingFloors from functions/utils/auction.js:
  //    (landedCost + estShippingCost + platformFlatFee) / (1 - platformFeePct - adFeePct)
  //    Business rule: buyer-paid shipping does NOT offset or burden the item floor (T-10 item 1).
  const estShippingCost = Math.max(0, Number(item.est_shipping_cost) || 0);
  const costBasis = round2(landedCost + platformFlatFee + estShippingCost);
  const breakEvenDivisor = 1 - platformFeePct - adFeePct;
  const computedBreakEven = breakEvenDivisor > 0 ? round2(costBasis / breakEvenDivisor) : 0;
  const breakEvenFloor = Number(item.floor_price || item.min_sell_price) > 0
    ? round2(Number(item.floor_price || item.min_sell_price))
    : computedBreakEven;

  // 5. Min Target Margin Floor:
  //    (landedCost + estShippingCost + platformFlatFee) / (1 - platformFeePct - adFeePct - targetMarginPct)
  const targetMarginDivisor = 1 - platformFeePct - adFeePct - targetMarginPct;
  const targetMarginFloor = targetMarginDivisor > 0 ? round2(costBasis / targetMarginDivisor) : 0;

  return {
    hasPrice,
    listPrice,
    landed: landedCost,
    landedCost,
    acquisition,
    proratedShip,
    platformFeePct,
    platformFlatFee,
    platformFees,
    adFeePct,
    adFees,
    trueNetProfit,
    marginPct,
    roiPct,
    breakEven: breakEvenFloor,
    breakEvenFloor,
    targetDecimal: targetMarginPct,
    targetMarginPct,
    targetFloor: targetMarginFloor,
    targetMarginFloor
  };
}

