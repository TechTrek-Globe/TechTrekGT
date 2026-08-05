// Uses Cloudflare KV for distributed rate limiting
export async function checkRateLimit(kv, key, maxRequests, windowSeconds) {
  if (!kv) return { allowed: true }; // graceful degradation if KV not bound

  const now = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;

  try {
    const current = parseInt(await kv.get(windowKey) || '0', 10);
    if (current >= maxRequests) {
      return { allowed: false, retryAfter: windowSeconds - (now % windowSeconds) };
    }

    await kv.put(windowKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
    return { allowed: true };
  } catch (err) {
    console.error('[rateLimit] failed to check KV:', err);
    return { allowed: true };
  }
}
