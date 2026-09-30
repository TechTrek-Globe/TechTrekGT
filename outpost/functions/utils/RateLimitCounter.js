/**
 * RateLimitCounter.js - Durable Object providing atomic increment for rate limiting.
 *
 * Replaces the non-atomic KV read-then-write pattern. Each DO instance is scoped
 * to a single rate-limit window key, providing serialized (atomic) request counts.
 *
 * Uses a sliding window by tracking individual request timestamps and counting
 * those within [now - windowMs, now], removing boundary-doubling artifacts of
 * fixed windows.
 *
 * Key naming and window sizes are preserved from the KV-based implementation.
 */

export class RateLimitCounter {
  constructor(state, env) {
    this.state = state;
    // Persistent in-memory cache across requests within the same isolate
    this.timestamps = null;
  }

  /**
   * Handles POST requests from checkRateLimit:
   *   Body: { windowSeconds, maxRequests }
   *   Returns: { allowed: boolean, count: number, retryAfter?: number }
   */
  async fetch(request) {
    const now = Date.now();

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ allowed: false, retryAfter: 60 }), { status: 400 });
    }

    const { windowSeconds, maxRequests } = body;
    const windowMs = (windowSeconds || 60) * 1000;
    const cutoff = now - windowMs;

    // Load timestamps from storage if not cached
    if (this.timestamps === null) {
      this.timestamps = (await this.state.storage.get('ts')) || [];
    }

    // Sliding window: drop timestamps older than the window
    this.timestamps = this.timestamps.filter(t => t > cutoff);

    const count = this.timestamps.length;

    if (count >= maxRequests) {
      // Oldest request in window determines when a slot opens
      const oldestInWindow = this.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      return new Response(JSON.stringify({
        allowed: false,
        count,
        retryAfter: Math.max(1, retryAfter)
      }), { status: 200 });
    }

    // Allow: record this request
    this.timestamps.push(now);
    await this.state.storage.put('ts', this.timestamps);

    // Schedule eviction of the oldest entry after the window expires so the DO
    // eventually becomes idle and Cloudflare can reclaim it.
    const nextEvictMs = this.timestamps[0] + windowMs - now;
    this.state.storage.setAlarm(now + Math.max(nextEvictMs, 1000));

    return new Response(JSON.stringify({ allowed: true, count: this.timestamps.length }), { status: 200 });
  }

  /**
   * Alarm fires when the oldest tracked timestamp has aged out of the window.
   * Drops expired timestamps and reschedules if any remain.
   */
  async alarm() {
    const now = Date.now();
    if (!this.timestamps) {
      this.timestamps = (await this.state.storage.get('ts')) || [];
    }
    // Re-read from storage for accuracy across isolate restarts
    const stored = (await this.state.storage.get('ts')) || [];
    const windowMs = 900 * 1000; // use max possible window (15 min) as safe upper bound
    this.timestamps = stored.filter(t => t > now - windowMs);

    if (this.timestamps.length === 0) {
      await this.state.storage.delete('ts');
    } else {
      await this.state.storage.put('ts', this.timestamps);
      const nextEvictMs = this.timestamps[0] + windowMs - now;
      this.state.storage.setAlarm(now + Math.max(nextEvictMs, 1000));
    }
  }
}
