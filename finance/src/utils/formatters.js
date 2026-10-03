/**
 * Currency, Number Formatting and Deterministic Financial Math Utilities
 */

/**
 * Safely parses any value (number, formatted string with $, commas, accounting parens)
 * into a clean float explicitly rounded to 2 decimal places.
 * Returns defaultVal if input is null, undefined, empty, NaN, or non-finite.
 *
 * @param {any} val
 * @param {number} [defaultVal=0]
 * @returns {number}
 */
export function round2(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return defaultVal;
    const rounded = Math.round((val + (val >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  const str = String(val).trim();
  if (!str) return defaultVal;
  // If the string contains 2+ alphabetic letters, treat as non-numeric text
  if (/[a-zA-Z]{2,}/.test(str)) {
    return defaultVal;
  }
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
 * Alias for round2 to explicitly indicate monetary input parsing.
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
 * Format number as currency with thousand separators ($1,234.56).
 * Safely parses formatted strings (e.g. "$1,234.56" or "1,234.56") and handles non-finite values.
 */
export function fmtMoney(val) {
  const num = round2(val, NaN);
  if (!Number.isFinite(num)) return '$0.00';
  if (num < 0) {
    return `-$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format number without dollar sign but with thousand separators (1,234.56).
 */
export function fmtNum(val, decimals = 2) {
  const num = round2(val, NaN);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format percentage with thousand separators (1,250.0%).
 */
export function fmtPct(val, decimals = 1) {
  let num;
  if (typeof val === 'number') {
    num = Number.isFinite(val) ? val : NaN;
  } else if (val === undefined || val === null || val === '') {
    num = NaN;
  } else {
    const cleaned = String(val).replace(/[^0-9.-]+/g, '');
    num = parseFloat(cleaned);
  }
  if (!Number.isFinite(num)) return '0%';
  return `${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}
