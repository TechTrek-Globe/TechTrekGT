// src/utils/deltaQueue.js
// Accumulates granular mutations and flushes them to POST /api/sync/delta (FIX-31)
// - Deduplicates: a second edit to the same cell overwrites the first pending op
// - Debounced: flushes after 400ms of inactivity (matches IndexedDB auto-save cadence)
// - Max-wait cap: forces flush after 2s even if edits continue (prevents indefinite deferral)
// - Batched: sends up to 50 ops per request
// - Falls back gracefully on network failure (preserves ops for retry)
// - Flushes on page visibility change / unload via keepalive fetch

import { apiFetch } from './api.js';

const pendingOps = new Map(); // dedupKey -> op object
let flushTimer = null;
let firstEnqueueTime = null;
const DEBOUNCE_MS = 400;
const MAX_FLUSH_DELAY = 2000; // 2s ceiling so rapid edits don't indefinitely defer
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isFlushing = false;
let activeLedgerResolver = null;

// Track online / offline connectivity state
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    if (pendingOps.size > 0) {
      flushDeltaQueue();
    }
  });
  window.addEventListener('offline', () => {
    isOnline = false;
  });
}

function getDedupKey(op) {
  if (op.op === 'upsert_matrix_cell' || op.op === 'delete_matrix_cell') {
    return `${op.ledgerId || ''}:${op.op}:${op.key}`;
  }
  return `${op.ledgerId || ''}:${op.op}:${op.key || op.id || JSON.stringify(op)}`;
}

export function enqueueDelta(op) {
  if (!op || typeof op !== 'object') return;

  const dedupKey = getDedupKey(op);
  if (pendingOps.size === 0) {
    firstEnqueueTime = Date.now();
  }
  pendingOps.set(dedupKey, op);

  clearTimeout(flushTimer);
  const elapsed = Date.now() - (firstEnqueueTime || Date.now());
  const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_FLUSH_DELAY - elapsed));
  flushTimer = setTimeout(() => {
    flushDeltaQueue();
  }, delay);
}

export async function flushDeltaQueue(options = {}) {
  if (pendingOps.size === 0 || isFlushing) return;
  if (!isOnline && !options.force) return;

  clearTimeout(flushTimer);
  flushTimer = null;
  firstEnqueueTime = null;

  // Take up to 50 pending ops
  const batch = [...pendingOps.values()].slice(0, 50);
  if (batch.length === 0) return;

  // Group by ledgerId (in practice, almost all ops share the current ledger)
  const targetLedgerId = batch[0].ledgerId || (activeLedgerResolver ? activeLedgerResolver() : null);
  const ledgerBatch = batch.filter(op => (op.ledgerId || targetLedgerId) === targetLedgerId);

  // Optimistic clear of items in this batch
  const snapshot = new Map();
  ledgerBatch.forEach(op => {
    const k = getDedupKey(op);
    snapshot.set(k, op);
    pendingOps.delete(k);
  });

  isFlushing = true;
  try {
    const res = await apiFetch('/api/sync/delta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ledgerId: targetLedgerId, mutations: ledgerBatch }),
      ...(options.keepalive ? { keepalive: true } : {})
    });

    if (!res.ok) {
      // Restore on HTTP error if not superseded by a newer mutation
      for (const [k, v] of snapshot) {
        if (!pendingOps.has(k)) {
          pendingOps.set(k, v);
        }
      }
    }
  } catch (err) {
    // Network failure - restore snapshot
    for (const [k, v] of snapshot) {
      if (!pendingOps.has(k)) {
        pendingOps.set(k, v);
      }
    }
  } finally {
    isFlushing = false;
    // If there are still remaining items (e.g. queue exceeded 50), schedule another flush
    if (pendingOps.size > 0 && isOnline) {
      flushTimer = setTimeout(() => flushDeltaQueue(), DEBOUNCE_MS);
    }
  }
}

/**
 * Initializes browser lifecycle hooks to flush pending delta mutations
 * upon tab hidden or page unload using keepalive fetch.
 * @param {Function} getLedgerId - Callback returning active ledger ID
 */
export function initDeltaQueueLifecycle(getLedgerId) {
  if (typeof document === 'undefined') return;
  activeLedgerResolver = getLedgerId;

  const onUnloadFlush = () => {
    if (pendingOps.size === 0) return;
    flushDeltaQueue({ keepalive: true, force: true }).catch(() => {});
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      onUnloadFlush();
    }
  });

  window.addEventListener('beforeunload', () => {
    onUnloadFlush();
  });
}

/**
 * Clears the in-memory queue (useful on logout / ledger switch).
 */
export function clearDeltaQueue() {
  clearTimeout(flushTimer);
  flushTimer = null;
  firstEnqueueTime = null;
  pendingOps.clear();
}

