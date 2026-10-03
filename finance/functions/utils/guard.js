import { requireAuth, withAuth, authenticate, verifyToken, getTokenFromRequest, getAllTokensFromRequest } from './auth.js';

export { requireAuth, withAuth, authenticate, verifyToken, getTokenFromRequest, getAllTokensFromRequest };

/** Standard JSON success response. */
export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** Standard JSON error response. */
export function err(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Deterministic 2-decimal rounding helper for financial values.
 * Returns defaultVal on null, undefined, empty string, NaN, or non-finite inputs.
 */
export function round2(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return defaultVal;
    const rounded = Math.round((val + (val >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  const str = String(val).trim();
  if (!str || /[a-zA-Z]{2,}/.test(str)) return defaultVal;
  const isParenNeg = /^\s*\(.*\)\s*$/.test(str);
  const cleaned = str.replace(/[^0-9.-]+/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return defaultVal;
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return defaultVal;
  const signed = (isParenNeg && num > 0) ? -num : (str.startsWith('-') && num > 0 ? -num : num);
  const rounded = Math.round((signed + (signed >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Parses any currency string or number to a clean 2dp float.
 */
export function parseMoney(val, defaultVal = 0) {
  return round2(val, defaultVal);
}

/**
 * Validates whether a value is a finite number or parseable non-NaN currency.
 */
export function isValidMoney(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') return Number.isFinite(val);
  const str = String(val).trim();
  if (!str || /[a-zA-Z]{2,}/.test(str)) return false;
  const cleaned = str.replace(/[^0-9.-]+/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return false;
  return Number.isFinite(parseFloat(cleaned));
}

/**
 * Deterministic safe addition of two monetary values with 2dp rounding.
 */
export function safeAdd(a, b) {
  return round2(round2(a, 0) + round2(b, 0));
}

/**
 * Deterministic safe subtraction of two monetary values with 2dp rounding.
 */
export function safeSub(a, b) {
  return round2(round2(a, 0) - round2(b, 0));
}

/**
 * Deterministic safe multiplication of monetary value by a factor with 2dp rounding.
 */
export function safeMul(amount, factor) {
  const f = typeof factor === 'number' && Number.isFinite(factor) ? factor : round2(factor, 0);
  return round2(round2(amount, 0) * f);
}

/**
 * Deterministic safe division of monetary value with 2dp rounding and zero-division protection.
 */
export function safeDiv(amount, divisor, defaultVal = 0) {
  const d = typeof divisor === 'number' && Number.isFinite(divisor) ? divisor : round2(divisor, 0);
  if (d === 0) return defaultVal;
  return round2(round2(amount, 0) / d);
}

/**
 * Validates that a monetary field is non-negative and finite.
 */
export function validateNonNegativeMoney(val, fieldName = 'Value') {
  if (typeof val === 'boolean' || val === null || val === undefined) {
    return { valid: false, error: `${fieldName} must be a valid number` };
  }
  const num = typeof val === 'number' ? val : parseMoney(val, NaN);
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, error: `${fieldName} must be a non-negative number` };
  }
  return { valid: true, value: round2(num) };
}
