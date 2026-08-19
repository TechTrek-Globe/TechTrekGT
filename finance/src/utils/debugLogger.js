// @ts-nocheck
/**
 * Lightweight, zero-overhead debug logger utility for TechTrek Finance.
 * When debug mode is disabled, logging functions return immediately (no-op).
 */

const STORAGE_KEY = 'trekledger_debug_mode';

let isDebugEnabled = false;

try {
  isDebugEnabled = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
} catch (e) {
  isDebugEnabled = false;
}

const subscribers = new Set();

/**
 * Check if debug logging is currently enabled.
 * @returns {boolean}
 */
export function getDebugEnabled() {
  return isDebugEnabled;
}

/**
 * Enable or disable debug logging globally and notify subscribers.
 * @param {boolean} enabled
 */
export function setDebugEnabled(enabled) {
  isDebugEnabled = Boolean(enabled);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(isDebugEnabled));
    }
  } catch (e) {}

  subscribers.forEach(cb => {
    try {
      cb({ type: 'STATUS_CHANGE', isDebugEnabled });
    } catch (err) {
      console.error('Error in debug subscriber:', err);
    }
  });
}

/**
 * Subscribe to real-time debug log events.
 * @param {Function} callback - Function receiving new log entries or status updates.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeToDebugLogs(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Format timestamp as HH:mm:ss.SSS
 */
function formatTimestamp(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Emit a debug log entry if debug mode is enabled.
 * @param {string} category - e.g. 'IMPORT', 'PARSER', 'MATCH', 'RECONCILE', 'SYSTEM'
 * @param {string} message - Human-readable explanation of the step or event
 * @param {any} [payload] - Data payload, error object, or snapshot
 * @param {'info' | 'warn' | 'error' | 'debug'} [level='info']
 */
export function logDebug(category, message, payload = null, level = 'info') {
  if (!isDebugEnabled) return;

  const now = new Date();
  const entry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: formatTimestamp(now),
    isoTime: now.toISOString(),
    category: (category || 'GENERAL').toUpperCase(),
    level: level.toLowerCase(),
    message: String(message),
    payload: payload !== null && payload !== undefined ? sanitizePayload(payload) : null
  };

  // Also log to browser console for developer convenience
  const prefix = `[Debug:${entry.category}]`;
  if (level === 'error') {
    console.error(prefix, message, payload || '');
  } else if (level === 'warn') {
    console.warn(prefix, message, payload || '');
  } else {
    console.log(prefix, message, payload || '');
  }

  subscribers.forEach(cb => {
    try {
      cb({ type: 'LOG_ENTRY', entry });
    } catch (err) {
      console.error('Error in debug subscriber:', err);
    }
  });
}

export function logInfo(category, message, payload = null) {
  logDebug(category, message, payload, 'info');
}

export function logWarn(category, message, payload = null) {
  logDebug(category, message, payload, 'warn');
}

export function logError(category, message, payload = null) {
  logDebug(category, message, payload, 'error');
}

export function logStep(category, stepNumber, title, payload = null) {
  logDebug(category, `[Step ${stepNumber}] ${title}`, payload, 'info');
}

/**
 * Recursively clone and sanitize payload to prevent circular references and huge DOM objects.
 */
function sanitizePayload(payload, depth = 0) {
  if (depth > 5) return '[Truncated: Max Depth]';
  if (payload === null || payload === undefined) return null;
  if (typeof payload === 'number' || typeof payload === 'boolean' || typeof payload === 'string') {
    return payload;
  }
  if (payload instanceof Error) {
    return { name: payload.name, message: payload.message, stack: payload.stack };
  }
  if (payload instanceof ArrayBuffer) {
    return `[ArrayBuffer: ${payload.byteLength} bytes]`;
  }
  if (Array.isArray(payload)) {
    if (payload.length > 100) {
      return [
        ...payload.slice(0, 100).map(item => sanitizePayload(item, depth + 1)),
        `... and ${payload.length - 100} more items`
      ];
    }
    return payload.map(item => sanitizePayload(item, depth + 1));
  }
  if (typeof payload === 'object') {
    const clean = {};
    const keys = Object.keys(payload);
    for (let i = 0; i < Math.min(keys.length, 50); i++) {
      const k = keys[i];
      clean[k] = sanitizePayload(payload[k], depth + 1);
    }
    if (keys.length > 50) {
      clean._truncated = `... and ${keys.length - 50} more properties`;
    }
    return clean;
  }
  return String(payload);
}
