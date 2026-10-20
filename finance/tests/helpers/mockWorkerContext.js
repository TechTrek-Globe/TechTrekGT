import { createMockD1 } from './mockD1.js';
import { createMockKV } from './mockKV.js';

/**
 * Creates a mock execution context for testing Cloudflare Workers endpoints.
 *
 * @param {Object} [overrides]
 * @returns {Object} context { request, env, waitUntil, next }
 */
export function createMockWorkerContext(overrides = {}) {
  const db = overrides.db || createMockD1();
  const gatewayKv = overrides.gatewayKv || createMockKV();
  const userCache = overrides.userCache || createMockKV();
  const rateLimitKv = overrides.rateLimitKv || createMockKV();

  const env = {
    DB: db,
    GATEWAY_KV: gatewayKv,
    USER_CACHE: userCache,
    RATE_LIMIT_KV: rateLimitKv,
    JWT_SECRET: overrides.jwtSecret || 'test-jwt-secret-minimum-32-chars-long!',
    CODE_HMAC_SECRET: overrides.codeHmacSecret || 'test-code-hmac-secret-32-chars-long!',
    SYNC_UNLOCK_CODE: overrides.syncUnlockCode || 'UNLOCK123',
    ENVIRONMENT: overrides.environment || 'development',
    ...overrides.env
  };

  const waitUntilTasks = [];
  const context = {
    request: overrides.request || new Request('http://localhost:3000/api/health'),
    env,
    waitUntil(promise) {
      waitUntilTasks.push(promise);
    },
    async drainWaitUntil() {
      await Promise.all(waitUntilTasks);
    }
  };

  return context;
}
