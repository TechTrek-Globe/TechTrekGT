// Placeholder rate limiter - no KV binding in VScout v1.
// Extend with RATE_LIMIT_KV binding per the bigworm/outpost pattern when needed.
export async function rateLimit(_request, _env) {
  return null; // null = not rate limited
}
