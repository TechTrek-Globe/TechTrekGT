import { describe, it, expect, beforeEach } from 'vitest';
import {
  authenticate,
  requireAuth,
  createToken,
  clearedCookies,
  getCachedUser,
  setCachedUser,
  invalidateCachedUser,
  ERROR_CODES
} from '../functions/utils/auth.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';

describe('FIN-AUDIT-002: Authentication Lifecycle, Session Revocation & KV Cache Edge Tests', () => {
  let db;
  let gatewayKv;
  let env;
  const JWT_SECRET = 'auth-edge-secret-minimum-32-chars-long!';

  beforeEach(() => {
    db = createMockD1();
    gatewayKv = createMockKV();
    env = {
      DB: db,
      GATEWAY_KV: gatewayKv,
      USER_CACHE: null,
      RATE_LIMIT_KV: null,
      JWT_SECRET
    };
  });

  describe('1. Immediate Credential Purging on 401 / 403', () => {
    it('emits Set-Cookie headers with Max-Age=0 across scoped paths on failed authentication', async () => {
      const req = new Request('http://localhost:3000/finance/api/auth/me', {
        headers: {
          'Cookie': 'auth_token=invalid.garbage.token'
        }
      });

      const auth = await authenticate({ request: req, env });
      expect(auth.error).toBeDefined();
      expect(auth.error.status).toBe(401);

      const setCookies = auth.error.headers.getSetCookie ? auth.error.headers.getSetCookie() : [auth.error.headers.get('set-cookie')];
      const joinedCookies = setCookies.join('; ');

      expect(joinedCookies).toContain('auth_token=');
      expect(joinedCookies).toContain('Max-Age=0');
    });

    it('purges credentials and returns 403 ACCOUNT_SUSPENDED when user is suspended', async () => {
      const userId = 'usr_suspended_1';
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', 'Suspended User', 'Suspended', 'user', 1, 1)`
      ).bind(userId, 'suspended@example.com').run();

      const { token: jwt } = await createToken({ userId, tv: 1 }, JWT_SECRET, 3600);
      const req = new Request('http://localhost:3000/finance/api/auth/me', {
        headers: {
          'Cookie': `auth_token=${jwt}`
        }
      });

      const auth = await authenticate({ request: req, env });
      expect(auth.error).toBeDefined();
      expect(auth.error.status).toBe(403);

      const body = await auth.error.json();
      expect(body.code).toBe(ERROR_CODES.ACCOUNT_SUSPENDED);
    });
  });

  describe('2. Token Version Revocation Protocol', () => {
    it('revokes session immediately when token_version is incremented in D1', async () => {
      const userId = 'usr_tv_bump';
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
         VALUES (?, ?, 'hash', 'Active User', 'Active', 'user', 1, 1)`
      ).bind(userId, 'tv@example.com').run();

      // Issue token with tv: 1
      const { token: tokenV1 } = await createToken({ userId, tv: 1 }, JWT_SECRET, 3600);
      const reqV1 = new Request('http://localhost:3000/finance/api/auth/me', {
        headers: { 'Cookie': `auth_token=${tokenV1}` }
      });

      // Verify token V1 initially authenticates
      const validAuth = await authenticate({ request: reqV1, env });
      expect(validAuth.user).toBeDefined();
      expect(validAuth.user.id).toBe(userId);

      // Invalidate by bumping token_version to 2 in DB and clearing cache
      await db.prepare('UPDATE users SET token_version = 2 WHERE id = ?').bind(userId).run();
      await invalidateCachedUser(userId, env);

      // Subsequent presentation of token V1 must be rejected with 401 SESSION_EXPIRED
      const staleAuth = await authenticate({ request: reqV1, env });
      expect(staleAuth.error).toBeDefined();
      expect(staleAuth.error.status).toBe(401);

      const body = await staleAuth.error.json();
      expect(body.code).toBe(ERROR_CODES.SESSION_EXPIRED);
    });
  });

  describe('3. BUG-008: Shared GATEWAY_KV Caching Verification', () => {
    it('reads and writes user session cache from env.GATEWAY_KV namespace', async () => {
      const userId = 'usr_gw_cache';
      const mockUserData = {
        id: userId,
        email: 'gw@example.com',
        name: 'Gateway User',
        role: 'user',
        token_version: 1,
        status: 'Active'
      };

      // 1. Set cached user into GATEWAY_KV
      await setCachedUser(userId, mockUserData, env);

      // Verify item exists in GATEWAY_KV
      const kvValue = await gatewayKv.get(`user-session:${userId}`, 'json');
      expect(kvValue).not.toBeNull();
      expect(kvValue.id).toBe(userId);
      expect(kvValue.email).toBe('gw@example.com');

      // 2. Get cached user resolves from GATEWAY_KV
      const resolved = await getCachedUser(userId, env);
      expect(resolved).not.toBeNull();
      expect(resolved.id).toBe(userId);
      expect(resolved.name).toBe('Gateway User');

      // 3. Invalidate removes key from GATEWAY_KV
      await invalidateCachedUser(userId, env);
      const postInvalidate = await gatewayKv.get(`user-session:${userId}`, 'json');
      expect(postInvalidate).toBeNull();
    });
  });
});
