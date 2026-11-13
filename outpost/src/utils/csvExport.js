/**
 * src/utils/csvExport.js - Utility for safe CSV exports mitigating formula injection.
 *
 * Prevents CSV / Formula injection (OWASP CSV Injection) by neutralizing leading
 * formula trigger characters (=, +, -, @, \t, \r) on string values and escaping quotes.
 */

/**
 * Escapes a single cell value for CSV export.
 * @param {any} val - The raw cell value
 * @returns {string} - Escaped cell value wrapped in quotes if string, or raw number
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) {
    return '""';
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : '0';
  }
  let str = String(val);
  // Neutralize formula triggers: =, +, -, @, tab, carriage return
  if (/^[\s]*[=+\-@\t\r]/.test(str)) {
    // If it's not a pure number (e.g. "-12.34" or "+5"), prepend single quote
    if (!/^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(str)) {
      str = `'${str}`;
    }
  }
  return `"${str.replace(/"/g, '""')}"`;
}

