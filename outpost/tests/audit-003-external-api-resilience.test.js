import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWithTimeout, DEFAULT_EXTERNAL_TIMEOUT_MS } from '../functions/api/ebay/tokenHelper.js';
import { recordSyncRun, ensureSyncHistoryTable } from '../functions/utils/syncLogger.js';
import { onRequestPost as webhookHandler, computeWebhookSignature, bufferToHex } from '../functions/api/ebay/webhook.js';
import { onRequestGet as getSyncSettingsHandler } from '../functions/api/sync/settings.js';
import { createToken, buildAuthCookie } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_SECRET = 'test-ebay-webhook-secret-key-32-bytes!';
const TEST_JWT_SECRET = 'test-jwt-secret-audit-003-32-bytes-long!';
const TEST_USER_ID = 'usr-audit003-test';

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(financeSchema);
  db.exec(auctionSchema);

  return {
    _raw: db,
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          const stmt = db.prepare(sql);
          return stmt.get(...boundParams) || null;
        },
        async all() {
          const stmt = db.prepare(sql);
          return { results: stmt.all(...boundParams) };
        },
        async run() {
          const stmt = db.prepare(sql);
          const info = stmt.run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    }
  };
}

describe('AUDIT-003: External API Synchronization and Webhook Resilience Audit', () => {
  let mockDb;
  let mockEnv;

  beforeEach(() => {
    mockDb = createMockD1();
    mockDb._raw.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, 'hash', 'Test User')")
      .run(TEST_USER_ID, 'audit003@techtrekgt.com');

    mockEnv = {
      DB: mockDb,
      EBAY_WEBHOOK_SECRET: TEST_SECRET,
      JWT_SECRET: TEST_JWT_SECRET
    };
  });

  describe('1. fetchWithTimeout Resilience', () => {
    test('enforces timeout and throws TimeoutError with isTimeout flag', async () => {
      // Mock global fetch to hang longer than the configured timeout
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        return new Promise((resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      };

      try {
        await assert.rejects(
          async () => {
            await fetchWithTimeout('https://api.ebay.com/slow-endpoint', {}, 50);
          },
          (err) => {
            assert.equal(err.name, 'TimeoutError');
            assert.equal(err.isTimeout, true);
            assert.equal(err.statusCode, 504);
            assert.match(err.message, /timed out after 50ms/);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test('passes through successful response within timeout limit', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

      try {
        const res = await fetchWithTimeout('https://api.ebay.com/fast-endpoint', {}, 1000);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ok, true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('2. syncLogger: Conditional Timestamp Stamping & Failure Tracking', () => {
    test('successful sync stamps last_ebay_sync_at and sets status to success', async () => {
      const { runId } = await recordSyncRun(mockEnv, TEST_USER_ID, {
        syncType: 'ebay',
        status: 'success',
        itemsTotal: 5,
        itemsSynced: 5,
        itemsFailed: 0
      });

      assert.ok(runId, 'runId should be returned');

      // Verify outpost_sync_history
      const historyRow = mockDb._raw.prepare(
        'SELECT * FROM outpost_sync_history WHERE id = ?'
      ).get(runId);
      assert.equal(historyRow.status, 'success');
      assert.equal(historyRow.items_synced, 5);
      assert.equal(historyRow.items_failed, 0);

      // Verify outpost_sync_settings
      const settingsRow = mockDb._raw.prepare(
        'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
      ).get(TEST_USER_ID);
      assert.ok(settingsRow.last_ebay_sync_at, 'last_ebay_sync_at must be populated on success');
      assert.equal(settingsRow.last_ebay_sync_status, 'success');
      assert.equal(settingsRow.last_ebay_sync_error, null);
    });

    test('failed sync documents error and DOES NOT advance last_ebay_sync_at', async () => {
      // First create a baseline setting with an old timestamp
      mockDb._raw.prepare(`
        INSERT INTO outpost_sync_settings (user_id, last_ebay_sync_at, last_ebay_sync_status)
        VALUES (?, '2026-01-01T00:00:00Z', 'success')
      `).run(TEST_USER_ID);

      const { runId } = await recordSyncRun(mockEnv, TEST_USER_ID, {
        syncType: 'ebay',
        status: 'failed',
        itemsTotal: 10,
        itemsSynced: 0,
        itemsFailed: 10,
        errorMessage: 'eBay Trading API returned 504 Gateway Timeout'
      });

      // Verify outpost_sync_history
      const historyRow = mockDb._raw.prepare(
        'SELECT * FROM outpost_sync_history WHERE id = ?'
      ).get(runId);
      assert.equal(historyRow.status, 'failed');
      assert.equal(historyRow.items_failed, 10);
      assert.match(historyRow.error_message, /504 Gateway Timeout/);

      // Verify outpost_sync_settings
      const settingsRow = mockDb._raw.prepare(
        'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
      ).get(TEST_USER_ID);
      assert.equal(settingsRow.last_ebay_sync_at, '2026-01-01T00:00:00Z', 'last_ebay_sync_at MUST NOT be overwritten on failure');
      assert.equal(settingsRow.last_ebay_sync_status, 'failed');
      assert.equal(settingsRow.last_ebay_sync_error, 'eBay Trading API returned 504 Gateway Timeout');
    });

    test('partial sync documents failure details and preserves last_ebay_sync_at', async () => {
      mockDb._raw.prepare(`
        INSERT INTO outpost_sync_settings (user_id, last_ebay_sync_at, last_ebay_sync_status)
        VALUES (?, '2026-02-01T00:00:00Z', 'success')
      `).run(TEST_USER_ID);

      const { runId } = await recordSyncRun(mockEnv, TEST_USER_ID, {
        syncType: 'ebay',
        status: 'partial',
        itemsTotal: 10,
        itemsSynced: 8,
        itemsFailed: 2,
        errorMessage: '2 item(s) failed during sync',
        details: [{ itemId: 'item_1', error: 'Network timeout' }, { itemId: 'item_2', error: 'Rate limit' }]
      });

      // Verify history
      const historyRow = mockDb._raw.prepare(
        'SELECT * FROM outpost_sync_history WHERE id = ?'
      ).get(runId);
      assert.equal(historyRow.status, 'partial');
      assert.equal(historyRow.items_synced, 8);
      assert.equal(historyRow.items_failed, 2);
      assert.match(historyRow.details, /Network timeout/);

      // Verify settings
      const settingsRow = mockDb._raw.prepare(
        'SELECT * FROM outpost_sync_settings WHERE user_id = ?'
      ).get(TEST_USER_ID);
      assert.equal(settingsRow.last_ebay_sync_at, '2026-02-01T00:00:00Z');
      assert.equal(settingsRow.last_ebay_sync_status, 'partial');
      assert.match(settingsRow.last_ebay_sync_error, /2 item\(s\) failed/);
    });
  });

  describe('3. Webhook Ingestion Hardening (Malformed & Unrecognized Payloads)', () => {
    test('rejects unrecognized payload shape with 400 Bad Request without crashing', async () => {
      const invalidPayload = JSON.stringify({ randomField: 'arbitrary_data', unknown: 123 });
      const rawBytes = new TextEncoder().encode(invalidPayload);
      const sigBuf = await computeWebhookSignature(rawBytes, TEST_SECRET);
      const signature = bufferToHex(sigBuf);

      const req = new Request('https://outpost.domain/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': signature
        },
        body: invalidPayload
      });

      const res = await webhookHandler({ request: req, env: mockEnv });
      assert.equal(res.status, 400);

      const body = await res.json();
      assert.match(body.error, /unrecognized webhook payload shape/i);
    });

    test('rejects malformed non-JSON payload with 400 Bad Request', async () => {
      const brokenPayload = '{"broken": json without closing brace';
      const rawBytes = new TextEncoder().encode(brokenPayload);
      const sigBuf = await computeWebhookSignature(rawBytes, TEST_SECRET);
      const signature = bufferToHex(sigBuf);

      const req = new Request('https://outpost.domain/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': signature
        },
        body: brokenPayload
      });

      const res = await webhookHandler({ request: req, env: mockEnv });
      assert.equal(res.status, 400);

      const body = await res.json();
      assert.match(body.error, /Invalid JSON payload/i);
    });

    test('accepts valid recognized payload shape and processes securely', async () => {
      const validPayload = JSON.stringify({
        metadata: { topic: 'MARKETPLACE_ITEM_SOLD' },
        notification: {
          data: {
            itemId: '112233445566',
            orderId: 'ORDER-12345'
          }
        }
      });
      const rawBytes = new TextEncoder().encode(validPayload);
      const sigBuf = await computeWebhookSignature(rawBytes, TEST_SECRET);
      const signature = bufferToHex(sigBuf);

      const req = new Request('https://outpost.domain/api/ebay/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EBAY-SIGNATURE': signature
        },
        body: validPayload
      });

      const res = await webhookHandler({ request: req, env: mockEnv });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.success, true);
    });
  });

  describe('4. Settings API: Exposure of Sync Resilience Status & History', () => {
    test('returns last_ebay_sync_status, last_ebay_sync_error, and sync_history list', async () => {
      // Seed sync settings and history
      await recordSyncRun(mockEnv, TEST_USER_ID, {
        syncType: 'ebay',
        status: 'failed',
        errorMessage: 'Socket timeout 504'
      });

      const authToken = await createToken({ userId: TEST_USER_ID, email: 'audit003@techtrekgt.com' }, TEST_JWT_SECRET);
      const authCookie = buildAuthCookie(authToken);

      const req = new Request('https://outpost.domain/api/sync/settings', {
        method: 'GET',
        headers: {
          Cookie: authCookie
        }
      });

      const res = await getSyncSettingsHandler({
        request: req,
        env: mockEnv
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.settings);
      assert.equal(data.settings.last_ebay_sync_status, 'failed');
      assert.equal(data.settings.last_ebay_sync_error, 'Socket timeout 504');
      assert.ok(Array.isArray(data.sync_history));
      assert.equal(data.sync_history.length, 1);
      assert.equal(data.sync_history[0].status, 'failed');
    });
  });
});
