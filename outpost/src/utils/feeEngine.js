/**
 * Fee & Margin Calculation Engine for Outpost Resale Tracker
 * Pure functions with zero side effects - instant client-side calculation of eBay fees,
 * buyer-paid shipping, outbound shipping costs, promoted listing ad rates, net proceeds,
 * net profit, ROI, and margin health tiers.
 */

export function round(val, decimals = 2) {
  if (val == null || isNaN(Number(val))) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(Number(val) * factor) / factor;
}

/**
 * Normalizes promoted rate into a decimal.
 * If passed 5 (meaning 5%), converts to 0.05. If passed 0.05, keeps 0.05.
 */
export function normalizeRateDecimal(rate) {
  if (rate == null || isNaN(Number(rate))) return 0;
  const num = Number(rate);
  return num > 1 ? num / 100 : num;
}

/**
 * Returns margin health tier based on margin percentage (decimal 0.00 to 1.00).
 */
export function computeMarginHealth(marginPct) {
  if (marginPct == null || isNaN(Number(marginPct))) return 'unknown';
  const m = Number(marginPct);
  if (m >= 0.30) return 'excellent'; // >= 30% margin
  if (m >= 0.15) return 'good';      // 15% - 29.9% margin
  if (m >= 0.05) return 'warning';   // 5% - 14.9% margin
  if (m >= 0)    return 'danger';    // 0% - 4.9% break-even
  return 'loss';                     // Negative margin / loss
}

export const MARGIN_HEALTH_CONFIG = {
  excellent: {
    label: 'High Margin',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400'
  },
  good: {
    label: 'Good Margin',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400'
  },
  warning: {
    label: 'Thin Margin',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400'
  },
  danger: {
    label: 'Break-Even',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    dot: 'bg-orange-400'
  },
  loss: {
    label: 'Loss',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    dot: 'bg-red-400'
  },
  unknown: {
    label: 'No Price',
    color: 'text-slate-500',
    bg: 'bg-slate-800/40',
    border: 'border-slate-700/40',
    dot: 'bg-slate-500'
  }
};

/**
 * Computes complete fee & margin breakdown for an item at a specific price point,
 * accurately incorporating shipping charged to buyer vs actual outbound shipping cost.
 */
export function computeFeeBreakdown(params = {}) {
  const sellPrice = Math.max(0, Number(params.sellPrice ?? params.current_list_price ?? params.suggested_list_price ?? params.unit_price ?? 0) || 0);
  const cogs = Math.max(0, Number(params.cogs ?? params.true_total_cost ?? params.unit_price ?? 0) || 0);

  // Platform fees
  const platformFeePct = params.platform_fee_pct != null
    ? normalizeRateDecimal(params.platform_fee_pct)
    : 0.1325; // Default eBay ~13.25%
  const platformFlatFee = Number(params.platform_flat_fee ?? 0.40) || 0;

  // Promoted listing rate
  const rawPromoted = params.ebay_promoted_rate ?? params.boost_pct ?? 0;
  const promotedDecimal = normalizeRateDecimal(rawPromoted);

  // Shipping details:
  // shippingCharged: amount paid by the buyer (e.g. $0 for free shipping, or $5.50 if charged)
  // shippingCost: actual label cost incurred by the seller (e.g. $4.50)
  const shippingCharged = Math.max(0, Number(params.buyer_shipping_cost ?? params.shipping_charged ?? params.buyer_shipping_paid ?? params.shippingCharged ?? 0) || 0);
  const shippingCost = Math.max(0, Number(params.est_shipping_cost ?? params.shippingCost ?? 0) || 0);
  const isFreeShipping = params.is_free_shipping ?? (shippingCharged === 0);

  const paymentProcessingPct = normalizeRateDecimal(params.paymentProcessingPct ?? 0);

  // Gross collection from buyer
  const grossRevenue = round(sellPrice + shippingCharged);

  // eBay Final Value Fee applies to the TOTAL amount collected from buyer (item price + shipping charged)
  const finalValueFee = round(grossRevenue * platformFeePct);

  // Promoted Listings Ad Fee applies to the Item Sale Price
  const promotedFee = round(sellPrice * promotedDecimal);

  // Optional payment processing fee (if on non-standard processing)
  const paymentFee = round(grossRevenue * paymentProcessingPct);

  const totalFees = round(finalValueFee + promotedFee + paymentFee + platformFlatFee);

  // Net Proceeds = Total Collected - Marketplace Fees - Seller Outbound Shipping Cost
  const netProceeds = round(grossRevenue - totalFees - shippingCost);
  const netProfit = round(netProceeds - cogs);
  const roiPct = cogs > 0 ? round(netProfit / cogs, 4) : 0;
  const marginPct = grossRevenue > 0 ? round(netProfit / grossRevenue, 4) : (sellPrice > 0 ? round(netProfit / sellPrice, 4) : 0);
  const marginHealth = (grossRevenue > 0 || sellPrice > 0) ? computeMarginHealth(marginPct) : 'unknown';

  // Shipping net margin (profit/loss on shipping charge vs label cost)
  const shippingNet = round(shippingCharged - shippingCost);

  // Break-even floor price calculation
  const totalFeeRate = platformFeePct + promotedDecimal + paymentProcessingPct;
  const divisor = 1 - totalFeeRate;
  const netShippingBurden = Math.max(0, shippingCost - shippingCharged);
  const breakEvenFloor = divisor > 0
    ? round((cogs + netShippingBurden + platformFlatFee) / divisor)
    : 0;

  return {
    sellPrice,
    shippingCharged,
    shippingCost,
    grossRevenue,
    isFreeShipping,
    shippingNet,
    cogs,
    platformFeePct,
    platformFlatFee,
    promotedRate: rawPromoted,
    promotedDecimal,
    finalValueFee,
    promotedFee,
    paymentFee,
    totalFees,
    netProceeds,
    netProfit,
    roiPct,
    marginPct,
    marginHealth,
    breakEvenFloor
  };
}

/**
 * Calculates suggested listing price from COGS, target margin, and fee assumptions.
 */
export function computeTargetPriceFromMargin(
  cogs,
  targetMarginPct = 0.30,
  platformFeePct = 0.1325,
  promotedRate = 0,
  shippingCost = 0,
  flatFee = 0.40,
  shippingCharged = 0
) {
  const promDec = normalizeRateDecimal(promotedRate);
  const feePct = normalizeRateDecimal(platformFeePct);
  const targetMargin = normalizeRateDecimal(targetMarginPct);

  const divisor = 1 - feePct - promDec - targetMargin;
  if (divisor <= 0) return 0;

  const netShippingBurden = Math.max(0, Number(shippingCost || 0) - Number(shippingCharged || 0));
  const costBase = Number(cogs || 0) + netShippingBurden + Number(flatFee || 0);
  return round(costBase / divisor);
}
