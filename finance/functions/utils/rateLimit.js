// Cloudflare rate limiting: Durable Object (atomic) with KV fallback.
//
// The KV fallback fails CLOSED on error rather than waving requests through.
// A missing binding is logged loudly. (fix H9)
//
// Do not change the catch branch to fail-open - it exists because of a
// specific finding documented in SECURITY-FIXES.md (H9).

export async function checkRateLimit(env, key, maxRequests, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const retryAfter = windowSeconds - (now % windowSeconds);

  // Durable Object path: atomic counting, no read-then-write race.
  if (env?.RATE_LIMITER) {
    try {
      const id = env.RATE_LIMITER.idFromName(key);
      const stub = env.RATE_LIMITER.get(id);
      const res = await stub.fetch('https://rl/check', {
        method: 'POST',
        body: JSON.stringify({ max: maxRequests, window: windowSeconds })
      });
      const data = await res.json();
      return data.allowed
        ? { allowed: true }
        : { allowed: false, retryAfter: data.retryAfter ?? retryAfter };
    } catch (err) {
      console.error('[rateLimit] durable object failed:', err && err.message);
      // DO failure falls closed - deny rather than bypass rate limiting.
      return { allowed: false, retryAfter };
    }
  }

  // Note on KV fallback (Stage 8.1): RATE_LIMIT_KV is a development-only fallback
  // (e.g. wrangler dev without DO). In production, RATE_LIMITER Durable Object handles all rate limiting.
  const kv = env?.RATE_LIMIT_KV;
  if (!kv) {
    console.error('[rateLimit] NO LIMITER BOUND - requests are not being rate limited');
    // No binding at all: allow through rather than blocking everything,
    // but log loudly so the operator knows the gap.
    return { allowed: true };
  }

  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;
  try {
    const current = parseInt((await kv.get(windowKey)) || '0', 10);
    if (current >= maxRequests) return { allowed: false, retryAfter };
    await kv.put(windowKey, String(current + 1), { expirationTtl: Math.max(60, windowSeconds * 2) });
    return { allowed: true };
  } catch (err) {
    // KV error fails closed: deny the request rather than skip rate limiting. (H9)
    console.error('[rateLimit] KV error, failing closed:', err && err.message);
    return { allowed: false, retryAfter };
  }
}

import { ERROR_CODES } from './errorCodes.js';
import { fail } from './auth.js';

// Convenience wrapper used by all handlers.
// Gets the client IP from CF-Connecting-IP and calls checkRateLimit. (Stage 8.2)
export async function enforceRateLimit(context, prefix, max, windowSeconds) {
  const ip = context.request?.headers?.get('CF-Connecting-IP');
  const isProduction = Boolean(context.request?.headers?.get('cf-ray'));
  if (!ip && isProduction) {
    console.error('[rateLimit] CF-Connecting-IP absent in production', context.requestId ? { requestId: context.requestId } : '');
    return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable.', context.requestId);
  }
  const effectiveIp = ip || 'dev-unknown';
  const { allowed, retryAfter } = await checkRateLimit(
    context.env,
    `${prefix}:${effectiveIp}`,
    max,
    windowSeconds
  );
  if (allowed) return null;

  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please wait and try again.',
      code: ERROR_CODES.RATE_LIMITED,
      ...(context.requestId ? { requestId: context.requestId } : {})
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter)
      }
    }
  );
}
