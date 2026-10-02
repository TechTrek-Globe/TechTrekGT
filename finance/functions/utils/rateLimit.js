// Cloudflare rate limiting: Durable Object (atomic) with KV fallback.
//
// The KV fallback fails CLOSED on error rather than waving requests through.
// A missing binding is logged loudly. (fix H9)
//
// Do not change the catch branch to fail-open - it exists because of a
// specific finding documented in SECURITY-FIXES.md (H9).

export async function checkRateLimit(env, key, maxRequests, windowSeconds, isProduction = false) {
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
    const isProd = Boolean(isProduction || env?.ENVIRONMENT === 'production');
    if (isProd) {
      console.error('[rateLimit] NO LIMITER BOUND in production - failing closed');
      return { allowed: false, retryAfter, unconfigured: true };
    }
    console.warn('[rateLimit] DEV MODE: no limiter bound, allowing request');
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

// Standardized client IP extraction for Cloudflare proxy context.
// Prioritizes CF-Connecting-IP from Cloudflare edge proxy.
// In local development (non-production), falls back to standard request IP headers
// (X-Forwarded-For, X-Real-IP, X-Client-IP) or connection addresses, defaulting to 'dev-unknown'.
// In production, never trusts client-spoofable reverse proxy headers.
export function getClientIp(request, env = null) {
  const req = request?.request || request;
  if (!req?.headers) return null;

  // 1. Primary: CF-Connecting-IP (Cloudflare edge proxy header)
  const cfIp = req.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;

  // Check if running in a Cloudflare production environment
  const environment = env || request?.env;
  const isProduction = Boolean(req.headers.get('cf-ray')) || environment?.ENVIRONMENT === 'production';

  // In production, do not fall back to spoofable headers
  if (isProduction) {
    return null;
  }

  // 2. Dev environment fallback: standard request IP headers and connection info
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = req.headers.get('x-real-ip')?.trim();
  if (xRealIp) return xRealIp;

  const xClientIp = req.headers.get('x-client-ip')?.trim();
  if (xClientIp) return xClientIp;

  if (req.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }
  if (req.connection?.remoteAddress) {
    return req.connection.remoteAddress;
  }

  return 'dev-unknown';
}

// Convenience wrapper used by all handlers.
// Extracts client IP via getClientIp (prioritizing CF-Connecting-IP) and calls checkRateLimit. (Stage 8.2)
export async function enforceRateLimit(context, prefix, max, windowSeconds, customKey = null) {
  let pfx = prefix;
  let key = customKey;
  if (!key && typeof prefix === 'string' && prefix.includes(':')) {
    const splitIdx = prefix.indexOf(':');
    pfx = prefix.slice(0, splitIdx);
    key = prefix.slice(splitIdx + 1);
  }
  const isProduction = Boolean(context.request?.headers?.get('cf-ray')) || context.env?.ENVIRONMENT === 'production';
  const ip = getClientIp(context.request, context.env);
  if (!key && !ip && isProduction) {
    console.error('[rateLimit] CF-Connecting-IP absent in production', context.requestId ? { requestId: context.requestId } : '');
    return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable.', context.requestId);
  }
  const effectiveKey = key || ip || 'dev-unknown';
  const hasLimiter = Boolean(context.env?.RATE_LIMITER || context.env?.RATE_LIMIT_KV);
  const { allowed, retryAfter, unconfigured } = await checkRateLimit(
    context.env,
    `${pfx}:${effectiveKey}`,
    max,
    windowSeconds,
    isProduction
  );
  if (allowed) return null;

  if (unconfigured || (!hasLimiter && isProduction)) {
    console.error('[rateLimit] NO LIMITER BOUND in production', context.requestId ? { requestId: context.requestId } : '');
    const res = fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable.', context.requestId);
    if (retryAfter) res.headers.set('Retry-After', String(retryAfter));
    return res;
  }

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
