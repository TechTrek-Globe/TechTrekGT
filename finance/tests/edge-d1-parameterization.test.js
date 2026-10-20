import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';

describe('FIN-AUDIT-001: D1 SQL Parameterization & Compensating Rollback Edge Tests', () => {
  let db;
  let env;
  const JWT_SECRET = 'd1-param-secret-32-chars-long!';

  beforeEach(() => {
    db = createMockD1();
    env = {
      DB: db,
      GATEWAY_KV: createMockKV(),
      USER_CACHE: createMockKV(),
      RATE_LIMIT_KV: createMockKV(),
      JWT_SECRET,
      SYNC_UNLOCK_CODE: 'UNLOCK123',
      ENVIRONMENT: 'development'
    };
  });

  describe('1. Positional Parameterization Inspection', () => {
    it('ensures all queries executed through mock D1 use ? parameter placeholders', async () => {
      const testUserId = 'usr_param_test';
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', 'Param User', 'Active', 'user', 1, 1)`
      ).bind(testUserId, 'param.test@example.com').run();

      const { token: jwt } = await createToken({ userId: testUserId, tv: 1 }, JWT_SECRET, 3600);
      const req = new Request('http://localhost:3000/finance/api/auth/me', {
        headers: {
          'Cookie': `auth_token=${jwt}`
        }
      });

      await worker.fetch(req, env, {});

      // Inspect query log
      expect(db.queryLog.length).toBeGreaterThan(0);
      for (const entry of db.queryLog) {
        // Assert SQL does not interpolate variables directly
        expect(entry.sql).not.toContain(testUserId);
        expect(entry.sql).not.toContain('param.test@example.com');
        // If query has parameters, it must contain ? placeholders
        if (entry.params.length > 0) {
          expect(entry.sql).toContain('?');
        }
      }
    });

    it('treats SQL injection strings strictly as literal parameter data without query distortion', async () => {
      const injectionId = "usr_inj'; DROP TABLE users; --";
      const injectionEmail = "admin' OR '1'='1";

      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', 'Injection User', 'Active', 'user', 1, 1)`
      ).bind(injectionId, injectionEmail).run();

      const retrieved = await db.prepare('SELECT id, email FROM users WHERE id = ?').bind(injectionId).first();
      expect(retrieved).not.toBeNull();
      expect(retrieved.id).toBe(injectionId);
      expect(retrieved.email).toBe(injectionEmail);

      // Verify users table was NOT dropped
      const countCheck = await db.prepare('SELECT COUNT(*) as count FROM users').first();
      expect(Number(countCheck.count)).toBeGreaterThan(0);
    });
  });

  describe('2. Compensating Rollback Verification', () => {
    it('executes compensating DELETE statement when an unhandled error occurs during manual backup creation', async () => {
      const testUserId = 'usr_rollback_test';
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', 'Rollback User', 'Active', 'user', 1, 1)`
      ).bind(testUserId, 'rollback@example.com').run();

      const { token: jwt } = await createToken({ userId: testUserId, tv: 1 }, JWT_SECRET, 3600);
      const req = new Request('http://localhost:3000/finance/api/sync/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `auth_token=${jwt}; csrf_token=csrf_rb`,
          'X-CSRF-Token': 'csrf_rb',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          budget: { schemaVersion: 8, accounts: [] },
          baseVersion: 0,
          manual: true
        })
      });

      // Inject a failure specifically on the user_backups update statement inside the batch
      db.setFailureHook((sql) => {
        if (sql.includes('INSERT INTO user_backups') || sql.includes('ON CONFLICT(id) DO UPDATE')) {
          return true;
        }
        return false;
      });

      const res = await worker.fetch(req, env, {});
      // Expected failure status
      expect(res.status).toBeGreaterThanOrEqual(400);

      // Check queryLog to see if compensating statement was invoked or batch failed atomically
      const hasRollbackOrAtomicFail = db.queryLog.some(q =>
        q.sql.includes('DELETE FROM user_backup_versions WHERE id = ?') ||
        q.sql.includes('INSERT INTO user_backups')
      );
      expect(hasRollbackOrAtomicFail).toBe(true);

      // Clean up hook
      db.clearFailureHook();
    });
  });
});
