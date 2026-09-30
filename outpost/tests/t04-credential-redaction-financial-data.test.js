import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createToken, verifyToken, hashTokenForLog } from '../functions/utils/auth.js';
import { buildFinancesSummary } from '../functions/api/ebay/tokenHelper.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestGet as vinescoutSalesHandler } from '../functions/api/export/vinescout-sales.js';
import worker from '../src/worker.js';

const TEST_SECRET = 'd41d8cd98f00b204e9800998ecf8427e';

describe('T-04: Credential Minimization, Redaction & Correlation Tracking', () => {

  // --- PRIV-003: JWT Payload Minimization & Regression Safety ---
  describe('PRIV-003: JWT Payload Minimization', () => {
    test('createToken emits minimal claims (userId, exp, tv) and strips email and name', async () => {
      const token = await createToken({
        userId: 'user_12345',
        email: 'private_user@techtrekgt.test',
        name: 'Jane Doe',
        extraClaim: 'should_not_leak'
      }, TEST_SECRET, 3600);

      assert.ok(token);
      const parts = token.split('.');
      assert.strictEqual(parts.length, 3);

      // Inspect raw decoded payload
      const rawPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      assert.strictEqual(rawPayload.userId, 'user_12345');
      assert.strictEqual(rawPayload.tv, 1);
      assert.ok(typeof rawPayload.exp === 'number');
      assert.strictEqual(rawPayload.email, undefined);
      assert.strictEqual(rawPayload.name, undefined);
      assert.strictEqual(rawPayload.extraClaim, undefined);

      // Verify token verifies properly
      const verified = await verifyToken(token, TEST_SECRET);
      assert.ok(verified);
      assert.strictEqual(verified.userId, 'user_12345');
      assert.strictEqual(verified.email, undefined);
      assert.strictEqual(verified.name, undefined);
    });

    test('existing tokens with legacy payload (email/name) still verify without signature error', async () => {
      // Craft a legacy JWT containing email and name directly
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        userId: 'legacy_user_789',
        email: 'legacy@techtrekgt.test',
        name: 'Legacy User',
        exp: Math.floor(Date.now() / 1000) + 3600
      })).toString('base64url');

      const dataToSign = `${header}.${payload}`;
      const enc = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw', enc.encode(TEST_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(dataToSign));
      const sig = Buffer.from(sigBuf).toString('base64url');
      const legacyToken = `${dataToSign}.${sig}`;

      // verifyToken must succeed
      const decoded = await verifyToken(legacyToken, TEST_SECRET);
      assert.ok(decoded);
      assert.strictEqual(decoded.userId, 'legacy_user_789');
      assert.strictEqual(decoded.email, 'legacy@techtrekgt.test');
      assert.strictEqual(decoded.name, 'Legacy User');
    });

    test('/api/auth/me reads email and name from database even when JWT has minimal payload', async () => {
      const minimalToken = await createToken({ userId: 'u_profile_99' }, TEST_SECRET, 3600);

      const mockDb = {
        prepare(sql) {
          return {
            bind(id) {
              return {
                async first() {
                  if (id === 'u_profile_99') {
                    return {
                      id: 'u_profile_99',
                      email: 'db_resolved@techtrekgt.test',
                      name: 'Database User',
                      security_question: 'Favorite city?',
                      security_answer_hash: 'abc',
                      email_verified: 1,
                      email_verified_at: '2026-09-01T00:00:00Z'
                    };
                  }
                  return null;
                }
              };
            }
          };
        }
      };

      const req = new Request('https://techtrekgt.com/outpost/api/auth/me', {
        headers: { Cookie: `auth_token=${minimalToken}` }
      });

      const res = await meHandler({ request: req, env: { JWT_SECRET: TEST_SECRET, DB: mockDb } });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.user.id, 'u_profile_99');
      assert.strictEqual(json.user.email, 'db_resolved@techtrekgt.test');
      assert.strictEqual(json.user.name, 'Database User');
      assert.strictEqual(json.user.emailVerified, true);
    });
  });

  // --- PRIV-001: Redaction of Credential Material from Logs ---
  describe('PRIV-001: Redaction of Credential Material from Logs', () => {
    test('hashTokenForLog returns truncated 12-char SHA-256 hash without credential leak', async () => {
      const sensitiveSecret = 'op_sec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const hash = await hashTokenForLog(sensitiveSecret);

      assert.strictEqual(typeof hash, 'string');
      assert.strictEqual(hash.length, 12);
      // Ensure no raw secret substrings appear in the hash
      assert.ok(!sensitiveSecret.startsWith(hash));
      assert.ok(!hash.includes('op_sec_'));
    });

    test('vinescout-sales auth failure logs truncated hash without prefix or credential length', async () => {
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));

      const presentedSecret = 'op_sec_f987654321fedcba0123456789abcdef0123456789abcdef0123456789abcdef';
      const expectedHash = await hashTokenForLog(presentedSecret);

      try {
        const req = new Request('https://techtrekgt.com/outpost/api/export/vinescout-sales', {
          headers: { 'X-VineScout-Auth': presentedSecret }
        });
        const env = {
          RATE_LIMIT_KV: null,
          DB: {
            prepare() {
              return {
                bind() {
                  return {
                    first: async () => null,
                    all: async () => ({ results: [] })
                  };
                }
              };
            }
          }
        };

        const res = await vinescoutSalesHandler({ request: req, env });
        assert.strictEqual(res.status, 401);

        const logLine = warnings.find(w => w.includes('[VINESCOUT_SALES_EXPORT]'));
        assert.ok(logLine, 'Expected a [VINESCOUT_SALES_EXPORT] log line');

        // Must contain truncated hash
        assert.ok(logLine.includes(expectedHash));
        // MUST NOT contain the 12-char prefix "op_sec_f9876"
        assert.ok(!logLine.includes('op_sec_f9876'));
        // MUST NOT contain length disclosure (presentedSecret is 71 chars)
        assert.ok(!logLine.includes('71'));
        assert.ok(!logLine.toLowerCase().includes('length:'));
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  // --- PRIV-002 & FUNC-020: Valid Structured Financial Summary & Data Minimization ---
  describe('PRIV-002 / FUNC-020: Valid Structured Financial Summary', () => {
    test('buildFinancesSummary produces valid, parseable JSON with bounded fields and retention', () => {
      const rawTransactions = [
        {
          transactionId: 'TX-99881',
          transactionType: 'SALE',
          transactionDate: '2026-09-29T18:00:00Z',
          amount: { value: '149.99', currency: 'USD' },
          totalFeeBasisAmount: { value: '149.99', currency: 'USD' },
          orderLineItems: [
            {
              promotedListingRate: '5.0',
              marketplaceFees: [
                { feeType: 'FINAL_VALUE_FEE', amount: { value: '19.80', currency: 'USD' } },
                { feeType: 'AD_FEE_STANDARD', amount: { value: '7.50', currency: 'USD' } }
              ]
            }
          ]
        },
        {
          transactionId: 'TX-99882',
          transactionType: 'SHIPPING_LABEL',
          transactionDate: '2026-09-29T18:05:00Z',
          amount: { value: '6.45', currency: 'USD' }
        }
      ];

      const jsonStr = buildFinancesSummary(rawTransactions, 90);

      // Must be 100% valid parseable JSON (never truncated mid-string)
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(jsonStr);
      });

      assert.strictEqual(parsed.version, '1.0');
      assert.strictEqual(parsed.retention_days, 90);
      assert.ok(parsed.reconciled_at);
      assert.ok(parsed.retention_until);
      assert.strictEqual(parsed.transaction_count, 2);
      assert.strictEqual(parsed.transactions.length, 2);

      // Check first transaction
      const t1 = parsed.transactions[0];
      assert.strictEqual(t1.transactionId, 'TX-99881');
      assert.strictEqual(t1.transactionType, 'SALE');
      assert.strictEqual(t1.amount, 149.99);
      assert.strictEqual(t1.feeBasisAmount, 149.99);
      assert.strictEqual(t1.fees.length, 2);
      assert.strictEqual(t1.fees[0].feeType, 'FINAL_VALUE_FEE');
      assert.strictEqual(t1.fees[0].amount, 19.8);

      // Check second transaction
      const t2 = parsed.transactions[1];
      assert.strictEqual(t2.transactionId, 'TX-99882');
      assert.strictEqual(t2.amount, 6.45);
    });

    test('buildFinancesSummary handles empty or non-array input gracefully without error', () => {
      const summaryEmpty = buildFinancesSummary(null);
      const parsed = JSON.parse(summaryEmpty);
      assert.strictEqual(parsed.transaction_count, 0);
      assert.deepStrictEqual(parsed.transactions, []);
    });
  });

  // --- Correlation ID Threading & 5xx Response Injection ---
  describe('Request Correlation ID (Worker Gateway)', () => {
    test('Worker fetch handler propagates correlationId to 5xx error response and logs', async () => {
      const errors = [];
      const originalError = console.error;
      console.error = (...args) => errors.push(args.join(' '));

      const customCorrelationId = 'corr-audit-test-9999';

      try {
        const req = new Request('https://techtrekgt.com/outpost/api/items', {
          headers: {
            'x-correlation-id': customCorrelationId
          }
        });

        // Trigger a 500 error by running without required DB/JWT bindings
        const env = {
          JWT_SECRET: null
        };

        const res = await worker.fetch(req, env, {});
        assert.strictEqual(res.status, 500);

        // Header must contain correlation ID
        assert.strictEqual(res.headers.get('X-Correlation-Id'), customCorrelationId);

        // Body must contain correlation ID
        const body = await res.json();
        assert.strictEqual(body.correlationId, customCorrelationId);

        // Must have logged the error with [worker][correlationId]
        const hasCorrelationInLogs = errors.some(l => l.includes(`[${customCorrelationId}]`));
        assert.ok(hasCorrelationInLogs, `Logs should contain [${customCorrelationId}]`);
      } finally {
        console.error = originalError;
      }
    });

    test('Worker auto-generates a UUID correlationId if header is omitted', async () => {
      const req = new Request('https://techtrekgt.com/outpost/api/items');
      const env = { JWT_SECRET: null };

      const res = await worker.fetch(req, env, {});
      assert.strictEqual(res.status, 500);

      const correlationHeader = res.headers.get('X-Correlation-Id');
      assert.ok(correlationHeader, 'X-Correlation-Id header must be present');
      assert.ok(correlationHeader.length >= 16);

      const body = await res.json();
      assert.strictEqual(body.correlationId, correlationHeader);
    });
  });
});
