/**
 * Hostile, edge-case, and malformed payload fixtures for taint analysis and input sanitization.
 */

export const HOSTILE_CURRENCY_INPUTS = [
  // SQL Injection vectors
  "100.00'; DROP TABLE users; --",
  "' OR '1'='1",
  "100.00 UNION SELECT password_hash FROM users",

  // XSS and HTML vectors
  "<script>alert('xss')</script>",
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",

  // IEEE 754 edge numbers & Non-finite
  NaN,
  Infinity,
  -Infinity,
  -0,

  // Malformed formatting
  "--100.00",
  "$$$100.00",
  "1,00,00.00.00",
  "((100.00))",
  "1.2.3.4",
  ".",
  "-",
  "---",
  "   ",
  null,
  undefined,

  // Multi-byte Unicode and homoglyphs
  "１００．００", // Full-width digits
  "100\u202F00",  // Narrow no-break space
  "€ 1.234,56",
  "100 ☕ USD"
];

export const HOSTILE_BUDGET_PAYLOADS = {
  // Prototype pollution attempt
  prototypePollution: {
    __proto__: { isAdmin: true },
    constructor: { prototype: { isAdmin: true } },
    schemaVersion: 8,
    accounts: []
  },

  // Unknown root properties (Schema whitelist violation)
  unauthorizedKeys: {
    schemaVersion: 8,
    accounts: [],
    injectedAdminGrant: true,
    maliciousScript: "<script>eval(atob('...'))</script>"
  },

  // Oversized transactions array (exceeds 25,000 cap)
  oversizedTransactions: {
    schemaVersion: 8,
    accounts: [],
    transactions: Array.from({ length: 26000 }, (_, i) => ({
      id: `tx_${i}`,
      accountId: 'acc_main',
      date: '2026-01-01',
      amount: 10.00,
      description: `Transaction ${i}`
    }))
  },

  // Huge string overflow (exceeds size limit)
  oversizedDescription: {
    schemaVersion: 8,
    accounts: [
      {
        id: 'acc_huge_str',
        name: 'Checking',
        notes: 'A'.repeat(50000)
      }
    ]
  }
};
