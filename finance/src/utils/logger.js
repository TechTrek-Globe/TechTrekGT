// @ts-nocheck
/**
 * Granular, Categorized Debug Logger for TechTrek Finance.
 * Zero-overhead when debug mode or specific categories are disabled.
 */

export const DEBUG_STORAGE_KEY = 'trekledger_debug_mode';
export const CATEGORIES_STORAGE_KEY = 'trekledger_debug_categories';

export const DEBUG_CATEGORIES = {
  SYNC: 'sync',
  TRANSACTIONS: 'transactions',
  MATRIX: 'matrix',
  ACCOUNTS_LEDGERS: 'accounts_ledgers',
  NAV_STATE: 'nav_state',
  IMPORT: 'import'
};

export const CATEGORY_METADATA = {
  sync: {
    id: 'sync',
    label: 'Sync Operations',
    description: 'Worker API requests, D1 sync pulls/pushes, serialization, and conflict resolution.',
    color: 'text-cyan-400',
    consoleColor: '#22d3ee',
    bgColor: 'bg-cyan-950/60',
    borderColor: 'border-cyan-800/60',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
  },
  transactions: {
    id: 'transactions',
    label: 'Transaction Mutations',
    description: 'Additions, deletions, amount diffs, date changes, and account reassignments.',
    color: 'text-amber-400',
    consoleColor: '#fbbf24',
    bgColor: 'bg-amber-950/60',
    borderColor: 'border-amber-800/60',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  },
  matrix: {
    id: 'matrix',
    label: 'Bill & Income Matrix',
    description: 'Schedule recalculations, due-date updates, and payday recurrence cycles.',
    color: 'text-emerald-400',
    consoleColor: '#34d399',
    bgColor: 'bg-emerald-950/60',
    borderColor: 'border-emerald-800/60',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  },
  accounts_ledgers: {
    id: 'accounts_ledgers',
    label: 'Accounts & Ledgers',
    description: 'Balance calculations, reconciliation state, and ledger adjustments.',
    color: 'text-purple-400',
    consoleColor: '#c084fc',
    bgColor: 'bg-purple-950/60',
    borderColor: 'border-purple-800/60',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40'
  },
  nav_state: {
    id: 'nav_state',
    label: 'Navigation & State',
    description: 'Custom SPA router events, Context dispatches, and local cache operations.',
    color: 'text-blue-400',
    consoleColor: '#60a5fa',
    bgColor: 'bg-blue-950/60',
    borderColor: 'border-blue-800/60',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40'
  },
  import: {
    id: 'import',
    label: 'Import & Parser',
    description: 'Spreadsheet parsing, sheet detection, column matching, and normalization.',
    color: 'text-indigo-400',
    consoleColor: '#818cf8',
    bgColor: 'bg-indigo-950/60',
    borderColor: 'border-indigo-800/60',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
  }
};

const DEFAULT_CATEGORY_STATES = {
  sync: true,
  transactions: true,
  matrix: true,
  accounts_ledgers: true,
  nav_state: true,
  import: true
};

let isDebugEnabled = false;
let categoryStates = { ...DEFAULT_CATEGORY_STATES };

try {
  if (typeof localStorage !== 'undefined') {
    isDebugEnabled = localStorage.getItem(DEBUG_STORAGE_KEY) === 'true';
    const storedCats = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (storedCats) {
      const parsed = JSON.parse(storedCats);
      categoryStates = { ...DEFAULT_CATEGORY_STATES, ...parsed };
    }
  }
} catch (e) {
  isDebugEnabled = false;
  categoryStates = { ...DEFAULT_CATEGORY_STATES };
}

const subscribers = new Set();

function notifySubscribers(event) {
  subscribers.forEach(cb => {
    try {
      cb(event);
    } catch (err) {
      console.error('Error in debug subscriber:', err);
    }
  });
}

export function getDebugEnabled() {
  return isDebugEnabled;
}

export function setDebugEnabled(enabled) {
  isDebugEnabled = Boolean(enabled);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEBUG_STORAGE_KEY, String(isDebugEnabled));
    }
  } catch (e) {}

  notifySubscribers({
    type: 'STATUS_CHANGE',
    isDebugEnabled,
    categoryStates
  });
}

export function getCategoryStates() {
  return { ...categoryStates };
}

export function isCategoryEnabled(catKey) {
  if (!isDebugEnabled) return false;
  const normalized = (catKey || '').toLowerCase();
  // Map legacy category names if any
  if (normalized === 'parser' || normalized === 'match' || normalized === 'normalize') {
    return Boolean(categoryStates.import);
  }
  if (normalized === 'reconcile') {
    return Boolean(categoryStates.accounts_ledgers || categoryStates.import);
  }
  if (normalized === 'system') {
    return true;
  }
  return categoryStates[normalized] !== false;
}

export function setCategoryEnabled(catKey, enabled) {
  const normalized = (catKey || '').toLowerCase();
  categoryStates[normalized] = Boolean(enabled);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoryStates));
    }
  } catch (e) {}

  notifySubscribers({
    type: 'CATEGORIES_CHANGE',
    categoryStates,
    isDebugEnabled
  });
}

export function setAllCategories(enabled) {
  const flag = Boolean(enabled);
  Object.keys(categoryStates).forEach(k => {
    categoryStates[k] = flag;
  });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoryStates));
    }
  } catch (e) {}

  notifySubscribers({
    type: 'CATEGORIES_CHANGE',
    categoryStates,
    isDebugEnabled
  });
}

export function resetCategoryDefaults() {
  categoryStates = { ...DEFAULT_CATEGORY_STATES };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoryStates));
    }
  } catch (e) {}

  notifySubscribers({
    type: 'CATEGORIES_CHANGE',
    categoryStates,
    isDebugEnabled
  });
}

export function subscribeToDebugLogs(callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function formatTimestamp(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

export function sanitizePayload(payload, depth = 0) {
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

export function logDebug(category, message, payload = null, level = 'info', operation = '') {
  const catKey = (category || 'general').toLowerCase();
  if (!isCategoryEnabled(catKey)) return;

  const now = new Date();
  const entry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: formatTimestamp(now),
    isoTime: now.toISOString(),
    category: (category || 'GENERAL').toUpperCase(),
    catKey,
    operation: operation || '',
    level: (level || 'info').toLowerCase(),
    message: String(message),
    payload: payload !== null && payload !== undefined ? sanitizePayload(payload) : null
  };

  const meta = CATEGORY_METADATA[catKey] || { consoleColor: '#94a3b8' };
  const badgeText = operation ? `[${entry.category}:${operation}]` : `[${entry.category}]`;
  const badgeStyle = `color: ${meta.consoleColor}; font-weight: bold;`;

  if (entry.level === 'error') {
    console.error(`%c${badgeText}`, badgeStyle, message, payload !== null ? payload : '');
  } else if (entry.level === 'warn') {
    console.warn(`%c${badgeText}`, badgeStyle, message, payload !== null ? payload : '');
  } else {
    console.log(`%c${badgeText}`, badgeStyle, message, payload !== null ? payload : '');
  }

  notifySubscribers({ type: 'LOG_ENTRY', entry });
}

export function logSync(operation, message, payload = null, level = 'info') {
  logDebug('SYNC', message, payload, level, operation);
}

export function logTransaction(operation, message, payload = null, level = 'info') {
  logDebug('TRANSACTIONS', message, payload, level, operation);
}

export function logMatrix(operation, message, payload = null, level = 'info') {
  logDebug('MATRIX', message, payload, level, operation);
}

export function logLedger(operation, message, payload = null, level = 'info') {
  logDebug('ACCOUNTS_LEDGERS', message, payload, level, operation);
}

export function logState(operation, message, payload = null, level = 'info') {
  logDebug('NAV_STATE', message, payload, level, operation);
}

export function logImport(operation, message, payload = null, level = 'info') {
  logDebug('IMPORT', message, payload, level, operation);
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
