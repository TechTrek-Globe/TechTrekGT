import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveIntegrationUserId, hashSecret } from '../functions/utils/apiIntegrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeSchema = fs.readFileSync(path.join(__dirname, '../../finance/schema.sql'), 'utf8');
const auctionSchema = fs.readFileSync(path.join(__dirname, '../auction-schema.sql'), 'utf8');

const TEST_OUTPOST_SECRET_KEY = 'master-legacy-outpost-secret-key';
const DEPRECATION_DATE = '2026-11-30';

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
    }
  };
}

describe('LOW-1: OUTPOST_SECRET_KEY Deprecation and Migration Roadmap', () => {
  let mockDb;
  const userAId = 'usr-oldest-primary';
  const userBId = 'usr-newer-device';
  const modernKey = 'op_sec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(async () => {
    mockDb = createMockD1();

    // Seed oldest user (user A, created first)
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin, created_at)
      VALUES (?, 'oldest@techtrekgt.test', 'dummyhash', 'Oldest User', 'Active', 1, 0, '2025-01-01 00:00:00')
    `).run(userAId);

    // Seed newer user (user B, created later)
    mockDb._raw.prepare(`
      INSERT INTO users (id, email, password_hash, name, status, email_verified, is_admin, created_at)
      VALUES (?, 'newer@techtrekgt.test', 'dummyhash', 'Newer User', 'Active', 1, 0, '2025-06-01 00:00:00')
    `).run(userBId);

    // Seed modern per-installation key for User B in api_integrations
    const modernHash = await hashSecret(modernKey);
    mockDb._raw.prepare(`
      INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at)
      VALUES ('int-modern-device', ?, ?, 'Modern VineScout Device', datetime('now'))
    `).run(userBId, modernHash);
  });

  test('Legacy OUTPOST_SECRET_KEY emits loud deprecation warning with scheduled removal date', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      const env = {
        DB: mockDb,
        OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY
      };

      const resolvedUserId = await resolveIntegrationUserId(TEST_OUTPOST_SECRET_KEY, env);
      assert.strictEqual(resolvedUserId, userAId, 'Resolves to oldest created user during deprecation period');

      // Verify deprecation warning was logged
      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes('[DEPRECATION WARNING]'));
      assert.ok(warnings[0].includes('OUTPOST_SECRET_KEY'));
      assert.ok(warnings[0].includes(DEPRECATION_DATE));
      assert.ok(warnings[0].includes('POST /api/integrations'));
    } finally {
      console.warn = originalWarn;
    }
  });

  test('Modern per-installation key resolves cleanly with zero deprecation warnings', async () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      const env = {
        DB: mockDb,
        OUTPOST_SECRET_KEY: TEST_OUTPOST_SECRET_KEY
      };

      const resolvedUserId = await resolveIntegrationUserId(modernKey, env);
      assert.strictEqual(resolvedUserId, userBId, 'Modern key resolves accurately to its owner');

      // Verify no deprecation warnings were emitted
      assert.strictEqual(warnings.length, 0);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('Simulated post-deprecation removal: unconfigured OUTPOST_SECRET_KEY rejects legacy secret with null (401)', async () => {
    // When OUTPOST_SECRET_KEY binding is removed on or after deprecation date:
    const envPostDeprecation = {
      DB: mockDb
      // OUTPOST_SECRET_KEY intentionally omitted / deleted from env
    };

    // Attempting to authenticate with the old shared key fails
    const resolvedLegacy = await resolveIntegrationUserId(TEST_OUTPOST_SECRET_KEY, envPostDeprecation);
    assert.strictEqual(resolvedLegacy, null, 'Legacy shared secret must return null (401 Unauthorized)');

    // Modern per-installation key continues to resolve normally
    const resolvedModern = await resolveIntegrationUserId(modernKey, envPostDeprecation);
    assert.strictEqual(resolvedModern, userBId, 'Modern per-installation key continues working unaffected');
  });
});
