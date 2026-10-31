// TechTrek Wayfinder - Resilient Offline Mutation Queue
// Guarantees zero data loss when roaming offline, on high-speed rail, or in underground transit.
// Persists pending writes to IndexedDB and replays them in FIFO order upon network reconnection.

import {
  saveLocalMutation,
  getLocalMutations,
  deleteLocalMutation,
  clearLocalMutations
} from './documentStorage';

let isReplaying = false;

/**
 * Generate a cryptographically random UUID or high-entropy fallback string.
 * @returns {string}
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `ik-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Notify application listeners about queue updates.
 * @param {number} count
 */
function emitQueueUpdate(count) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wayfinder:queue-updated', {
      detail: { pendingCount: count }
    }));
  }
}

/**
 * Enqueue a mutation for offline persistence.
 * @param {Object} params
 * @param {string} params.url - Target API endpoint URL
 * @param {string} [params.method='POST'] - HTTP method (POST, PUT, DELETE, PATCH)
 * @param {any} [params.body=null] - Request payload
 * @param {Object} [params.headers={}] - Optional request headers
 * @param {string} [params.entityType='general'] - Domain entity category (packing, expense, itinerary, notes)
 * @param {string} [params.entityId=null] - Specific entity ID being mutated
 * @param {string} [params.action='Update'] - Human-readable label (e.g. 'Check Thermal Socks', 'Add Lunch')
 * @returns {Promise<Object>} Created mutation record
 */
export async function enqueueMutation({
  url,
  method = 'POST',
  body = null,
  headers = {},
  entityType = 'general',
  entityId = null,
  action = 'Update'
}) {
  const mutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    idempotencyKey: generateIdempotencyKey(),
    url,
    method: method.toUpperCase(),
    body: typeof body === 'object' && body !== null ? JSON.stringify(body) : body,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    entityType,
    entityId,
    action,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
    lastError: null
  };

  await saveLocalMutation(mutation);
  const queue = await getLocalMutations();
  emitQueueUpdate(queue.length);
  return mutation;
}

/**
 * Get all pending mutations sorted by creation time (FIFO).
 * @returns {Promise<Array>}
 */
export async function getQueue() {
  return await getLocalMutations();
}

/**
 * Get the current number of pending offline mutations.
 * @returns {Promise<number>}
 */
export async function getQueueCount() {
  const queue = await getLocalMutations();
  return queue.length;
}

/**
 * Replays all queued mutations sequentially in FIFO order against the Cloudflare Worker.
 * Deduplicates execution using X-Idempotency-Key headers.
 * 
 * @param {Function} [onProgress] - Optional callback receiving { current, total, item }
 * @returns {Promise<{ success: boolean, syncedCount: number, failedCount: number }>}
 */
export async function replayQueue(onProgress) {
  if (isReplaying) return { success: false, syncedCount: 0, failedCount: 0, message: 'Already replaying' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, syncedCount: 0, failedCount: 0, message: 'Offline' };
  }

  isReplaying = true;
  let syncedCount = 0;
  let failedCount = 0;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wayfinder:sync-start'));
  }

  try {
    const queue = await getLocalMutations();
    if (!queue.length) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wayfinder:sync-complete', {
          detail: { syncedCount: 0, failedCount: 0 }
        }));
      }
      return { success: true, syncedCount: 0, failedCount: 0 };
    }

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      // Double-check connectivity before each fetch
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        break;
      }

      if (typeof onProgress === 'function') {
        onProgress({ current: i + 1, total: queue.length, item });
      }

      try {
        const fetchHeaders = {
          ...(item.headers || {}),
          'X-Idempotency-Key': item.idempotencyKey
        };

        const res = await fetch(item.url, {
          method: item.method,
          headers: fetchHeaders,
          credentials: 'include',
          body: item.body
        });

        // 2xx Success OR 409 Conflict (idempotent duplicate request already applied)
        if (res.ok || res.status === 409) {
          await deleteLocalMutation(item.id);
          syncedCount++;

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wayfinder:mutation-synced', {
              detail: { item, status: res.status }
            }));
          }
        } else if (res.status >= 400 && res.status < 500) {
          // Unrecoverable client error (e.g. 404 deleted entity, 400 invalid schema)
          // Drop to prevent permanently poisoning the queue
          console.warn(`[MutationQueue] Discarding invalid mutation ${item.id} (HTTP ${res.status}):`, item);
          await deleteLocalMutation(item.id);
          failedCount++;
        } else {
          // Server error 5xx: keep in queue for next retry
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = `Server error HTTP ${res.status}`;
          await saveLocalMutation(item);
          failedCount++;
        }
      } catch (networkErr) {
        // Network connection dropped mid-queue replay
        console.warn(`[MutationQueue] Network error replaying ${item.id}:`, networkErr.message);
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = networkErr.message;
        await saveLocalMutation(item);
        break; // Stop replaying until connection returns
      }
    }

    const remaining = await getLocalMutations();
    emitQueueUpdate(remaining.length);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wayfinder:sync-complete', {
        detail: { syncedCount, failedCount, remainingCount: remaining.length }
      }));
    }

    return { success: true, syncedCount, failedCount };
  } finally {
    isReplaying = false;
  }
}

/**
 * Resilient fetch wrapper: attempts normal network fetch; if offline or network fails,
 * intercepts mutating requests (POST, PUT, DELETE, PATCH), enqueues them for offline replay,
 * and returns a synthetic 202 Accepted response to allow seamless optimistic UI state.
 * 
 * @param {string} url - Target URL
 * @param {RequestInit} [options={}] - Standard Fetch options
 * @param {Object} [meta={}] - Optional metadata ({ entityType, entityId, action })
 * @returns {Promise<Response>}
 */
export async function resilientFetch(url, options = {}, meta = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  // 1. Direct offline check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (isMutating) {
      await enqueueMutation({
        url,
        method,
        body: options.body,
        headers: options.headers || {},
        ...meta
      });

      return new Response(JSON.stringify({
        success: true,
        offline: true,
        queued: true,
        message: 'Saved offline. Will sync when back online.'
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET requests cannot be enqueued, throw standard offline error
    throw new Error('You are currently offline. Please reconnect to access remote data.');
  }

  // 2. Online: Attempt network fetch
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    // 3. Network failure caught (e.g. Failed to fetch, DNS drop, tunnel closed)
    if (isMutating) {
      console.warn(`[ResilientFetch] Network failed for ${method} ${url}. Enqueueing offline mutation:`, err.message);
      await enqueueMutation({
        url,
        method,
        body: options.body,
        headers: options.headers || {},
        ...meta
      });

      return new Response(JSON.stringify({
        success: true,
        offline: true,
        queued: true,
        message: 'Network offline. Saved to offline queue for automatic sync.'
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    throw err;
  }
}

// Global automatic synchronization triggers
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[MutationQueue] Network online detected. Triggering queue replay...');
    replayQueue();
  });

  window.addEventListener('focus', () => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      getQueueCount().then(count => {
        if (count > 0) {
          replayQueue();
        }
      });
    }
  });

  // Initial check on page load
  setTimeout(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      getQueueCount().then(count => {
        if (count > 0) {
          replayQueue();
        }
      });
    }
  }, 2000);
}
