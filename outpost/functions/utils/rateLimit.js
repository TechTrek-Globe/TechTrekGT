/**
 * rateLimit.js - Distributed rate limiting with atomic Durable Object counter.
 *
 * Primary path:  RATE_LIMIT_DO (Durable Object) - atomic sliding-window increment.
 *                Prevents parallel-request bypass. Key naming and Retry-After
 *                values are preserved from the previous KV implementation.
 *
 * Fallback path: RATE_LIMIT_KV (KV namespace) - non-atomic fixed window.
 *                Retained for backward compatibility; prefer DO binding.
 *
 * failClosed:    When true, any failure of BOTH bindings returns 429.
 *                When false (default), failures allow the request through.
 *
 * Register the DO in wrangler.jsonc:
 *   "durable_objects": { "bindings": [{ "name": "RATE_LIMIT_DO", "class_name": "RateLimitCounter" }] }
 */

/**
 * Atomic Durable Object-backed rate limit check (sliding window).
 *
 * @param {DurableObjectNamespace} doNamespace - env.RATE_LIMIT_DO
 * @param {string} key - rate limit key (e.g. "login:1.2.3.4")
 * @param {number} maxRequests
 * @param {number} windowSeconds
 * @returns {Promise<{allowed: boolean, retryAfter?: number}>}
 */
async function checkRateLimitDO(doNamespace, key, maxRequests, windowSeconds) {
  // Each unique key maps to its own DO instance, providing per-key isolation.
  const id = doNamespace.idFromName(key);
  const stub = doNamespace.get(id);

  const res = await stub.fetch('https://ratelimit/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ windowSeconds, maxRequests })
  });

  const data = await res.json();
  return data;
}

/**
 * Non-atomic KV-backed rate limit check (fixed window, legacy fallback).
 */
async function checkRateLimitKV(kv, key, maxRequests, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;

  const current = parseInt(await kv.get(windowKey) || '0', 10);
  if (current >= maxRequests) {
    return { allowed: false, retryAfter: windowSeconds - (now % windowSeconds) };
  }

  await kv.put(windowKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return { allowed: true };
}

/**
 * Main rate limit check. Prefers the atomic Durable Object path.
 * Falls back to KV if DO is unavailable. Respects failClosed on any error.
 *
 * @param {KVNamespace|null} kv - env.RATE_LIMIT_KV (legacy fallback)
 * @param {string} key - rate limit key
 * @param {number} maxRequests
 * @param {number} windowSeconds
 * @param {boolean|{failClosed:boolean}} [failClosed=false]
 * @param {DurableObjectNamespace|null} [doNamespace=null] - env.RATE_LIMIT_DO
 */
export async function checkRateLimit(kv, key, maxRequests, windowSeconds, failClosed = false, doNamespace = null) {
  const isFailClosed = typeof failClosed === 'object' && failClosed !== null
    ? Boolean(failClosed.failClosed)
    : Boolean(failClosed);

  const failResponse = { allowed: false, retryAfter: 60 };

  // --- Primary: Durable Object atomic path ---
  if (doNamespace) {
    try {
      return await checkRateLimitDO(doNamespace, key, maxRequests, windowSeconds);
    } catch (err) {
      console.error('[rateLimit] DO check failed, falling back to KV:', err);
      // Fall through to KV
    }
  }

  // --- Fallback: KV non-atomic path ---
  if (!kv) {
    console.warn('[rateLimit] RATE_LIMIT_KV not bound and RATE_LIMIT_DO unavailable - rate limiting disabled. Check wrangler config.');
    return isFailClosed ? failResponse : { allowed: true };
  }

  try {
    return await checkRateLimitKV(kv, key, maxRequests, windowSeconds);
  } catch (err) {
    console.error('[rateLimit] failed to check KV:', err);
    return isFailClosed ? failResponse : { allowed: true };
  }
}
