/**
 * Currency and Number Formatting Utilities
 */

/**
 * Format number as currency with thousand separators ($1,234.56)
 */
export function fmtMoney(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '$0.00';
  if (num < 0) {
    return `-$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format number without dollar sign but with thousand separators (1,234.56)
 */
export function fmtNum(val, decimals = 2) {
  const num = parseFloat(val);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format percentage with thousand separators (1,250.0%)
 */
export function fmtPct(val, decimals = 1) {
  const num = parseFloat(val);
  if (isNaN(num)) return '0%';
  return `${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}
