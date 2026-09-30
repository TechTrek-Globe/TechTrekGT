/**
 * Client-side formula preview utilities.
 *
 * T-10: these are now RE-EXPORTS of the server implementations in
 * functions/utils/auction.js, not hand-maintained mirrors. Vite resolves
 * functions/utils/** into the client bundle, so worker and browser execute the
 * SAME function object - there is no second copy to drift. Only presentation
 * helpers (fmt*, roundPrice) remain defined here.
 */

export {
  round2,
  round2Nullable,
  computeItemProration,
  computePricingFloors,
  computeSaleMetrics,
  daysBetween
} from '../../functions/utils/auction.js';

import { round2 } from '../../functions/utils/auction.js';

export function fmt(n, decimals = 2) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPct(n, decimals = 1) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  const val = Number(n) * 100;
  const fixed = val.toFixed(decimals);
  return `${parseFloat(fixed)}%`;
}

export function formatPercent(n, maxDecimals = 2) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  const val = Number(n) * 100;
  const fixed = val.toFixed(maxDecimals);
  return `${parseFloat(fixed)}%`;
}

export function fmtCurrency(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '--';
  return `$${fmt(n, 2)}`;
}

export function formatCurrency(n) {
  return fmtCurrency(n);
}

export function roundPrice(val) {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '';
  return round2(val);
}

export function roundToDecimals(val, decimals = 2) {
  if (val === null || val === undefined || val === '' || isNaN(Number(val))) return '';
  const factor = Math.pow(10, decimals);
  return Math.round(Number(val) * factor) / factor;
}
