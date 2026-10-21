import { describe, it, expect, beforeEach } from 'vitest';
import { onRequestGet as adminStatsGet } from '../functions/api/admin/stats.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';

describe('BUG-011: Admin Telemetry & Backup Snapshot Stats Edge Tests', () => {
  let db;
  let env;
  const JWT_SECRET = 'admin-stats-secret-32-chars-long!';

  beforeEach(() => {
    db = createMockD1();
    env = {
      DB: db,
      GATEWAY_KV: createMockKV(),
      USER_CACHE: createMockKV(),
      RATE_LIMIT_KV: createMockKV(),
      JWT_SECRET
    };
  });

  it('rejects regular non-admin user with HTTP 403 FORBIDDEN', async () => {
    const regularUserId = 'usr_regular_user';
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
       VALUES (?, ?, 'hash', 'Regular User', 'Active', 'user', 1, 1)`
    ).bind(regularUserId, 'user@example.com').run();

    const { token: jwt } = await createToken({ userId: regularUserId, tv: 1 }, JWT_SECRET, 3600);
    const req = new Request('http://localhost:3000/api/admin/stats', {
      headers: { 'Cookie': `auth_token=${jwt}` }
    });

    const res = await adminStatsGet({ request: req, env });
    expect(res.status).toBe(403);
  });

  it('reports accurate multi-snapshot backup counts per user for admin caller', async () => {
    const adminUserId = 'usr_admin_1';
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
       VALUES (?, ?, 'hash', 'Admin User', 'Active', 'admin', 1, 1)`
    ).bind(adminUserId, 'admin@example.com').run();

    const targetUserId = 'usr_target_1';
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
       VALUES (?, ?, 'hash', 'Target User', 'Active', 'user', 1, 1)`
    ).bind(targetUserId, 'target@example.com').run();

    // Insert 5 version snapshots for target user in user_backup_versions
    for (let i = 1; i <= 5; i++) {
      await db.prepare(
        `INSERT INTO user_backup_versions (id, user_id, data, saved_at)
         VALUES (?, ?, '{"schemaVersion":8}', ?)`
      ).bind(`ver_${i}`, targetUserId, Date.now() + i * 1000).run();
    }

    const targetUserId2 = 'usr_target_2';
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
       VALUES (?, ?, 'hash', 'Target User 2', 'Active', 'user', 1, 1)`
    ).bind(targetUserId2, 'target2@example.com').run();

    // Insert active ongoing backup for target user 2 in user_backups
    await db.prepare(
      `INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms)
       VALUES (?, '{"schemaVersion":8}', 100, datetime('now'), ?)`
    ).bind(targetUserId2, Date.now()).run();

    // Insert 3 version snapshots for target user 2 in user_backup_versions
    for (let i = 1; i <= 3; i++) {
      await db.prepare(
        `INSERT INTO user_backup_versions (id, user_id, data, saved_at)
         VALUES (?, ?, '{"schemaVersion":8}', ?)`
      ).bind(`ver2_${i}`, targetUserId2, Date.now() + i * 1000).run();
    }

    const { token: jwt } = await createToken({ userId: adminUserId, tv: 1 }, JWT_SECRET, 3600);
    const req = new Request('http://localhost:3000/api/admin/stats', {
      headers: { 'Cookie': `auth_token=${jwt}` }
    });

    const res = await adminStatsGet({ request: req, env });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalUsers).toBeGreaterThan(0);
    expect(Array.isArray(body.users)).toBe(true);

    const targetStats = body.users.find(u => u.id === targetUserId);
    expect(targetStats).toBeDefined();
    expect(targetStats.backupCount).toBe(5);

    const targetStats2 = body.users.find(u => u.id === targetUserId2);
    expect(targetStats2).toBeDefined();
    expect(targetStats2.backupCount).toBe(4);
  });
});
