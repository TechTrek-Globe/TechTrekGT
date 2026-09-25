// Durable Object for atomic rate limiting.
// Bind as RATE_LIMITER in wrangler.jsonc to use the atomic path
// rather than the racy KV counter fallback.
//
// wrangler.jsonc additions needed:
//   durable_objects = { bindings = [{ name = "RATE_LIMITER", class_name = "RateLimiter" }] }
//   migrations = [{ tag = "v1", new_classes = ["RateLimiter"] }]

export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { max, window } = await request.json();
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / window);
    const retryAfter = window - (now % window);

    return this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get('bucket')) || { bucket: -1, count: 0 };
      if (stored.bucket !== bucket) {
        stored.bucket = bucket;
        stored.count = 0;
      }
      if (stored.count >= max) {
        return new Response(JSON.stringify({ allowed: false, retryAfter }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      stored.count += 1;
      await this.state.storage.put('bucket', stored);
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    });
  }
}
