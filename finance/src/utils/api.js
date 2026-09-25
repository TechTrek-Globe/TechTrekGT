import { logSync } from './logger';

/**
 * Resolves an API endpoint path relative to the current subpath context.
 * If running on /finance or /finance/*, routes to /finance/api/...
 * Otherwise routes to /api/...
 * 
 * @param {string} endpoint - e.g. '/api/auth/login' or '/api/budget'
 * @returns {string}
 */
export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === '/finance' || pathname.startsWith('/finance/')) {
      if (!cleanEndpoint.startsWith('/finance')) {
        return `/finance${cleanEndpoint}`;
      }
    }
  }
  return cleanEndpoint;
}

let currentCsrfToken = null;

export function setCsrfToken(token) {
  currentCsrfToken = token;
}

export function getCsrfToken() {
  if (currentCsrfToken) return currentCsrfToken;
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match && match[1]) {
      currentCsrfToken = decodeURIComponent(match[1]);
      return currentCsrfToken;
    }
  }
  return null;
}

export function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  return headers;
}

/**
 * Centralized API client wrapper that handles:
 * - URL path resolution via getApiUrl
 * - Automatic X-CSRF-Token attachment for state-changing requests
 * - Uniform credentials: 'include'
 * - Session expiry broadcast (401 with "Session expired")
 */
export async function apiFetch(endpoint, options = {}) {
  const url = getApiUrl(endpoint);
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = getCsrfToken();
    if (csrf && !headers['X-CSRF-Token']) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const opts = {
    ...options,
    method,
    headers,
    credentials: options.credentials || 'include'
  };

  const res = await fetch(url, opts);

  if (res.status === 401 && typeof window !== 'undefined') {
    const clone = res.clone();
    clone.json().then(data => {
      if (data?.error && (data.error.includes('Session expired') || data.error.includes('Unauthorized'))) {
        window.dispatchEvent(new CustomEvent('techtrek:session-expired', { detail: data }));
      }
    }).catch(() => {});
  }

  return res;
}

const PENDING_SYNC_KEY = 'cf_pending_sync';

/**
 * Persists pending backup payload into localStorage fallback queue.
 * @param {Object} payload 
 * @param {string} passcode 
 */
export function savePendingSync(payload, passcode) {
  try {
    const data = {
      payload,
      timestamp: Date.now()
    };
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(data));
    logSync('QUEUE_ENQUEUE', 'Enqueued sync payload to localStorage offline queue', {
      accountsCount: payload?.accounts?.length,
      billsCount: payload?.bills?.length,
      matrixEntries: Object.keys(payload?.dailyMatrix || {}).length,
      timestamp: data.timestamp
    });
  } catch (err) {
    console.error('Failed to save pending sync payload to localStorage:', err);
  }
}

/**
 * Retrieves pending sync payload from localStorage.
 * @returns {Object|null}
 */
export function getPendingSync() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clears pending sync payload from localStorage.
 */
export function clearPendingSync() {
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
    logSync('QUEUE_CLEAR', 'Cleared pending sync payload from localStorage queue');
  } catch {}
}

/**
 * Performs background fetch to Cloudflare API with graceful degradation.
 * Saves payload to pending queue on network error or 5xx failures.
 * 
 * @param {string} passcode 
 * @param {Object} budgetData 
 * @returns {Promise<{success: boolean, status: string, error?: string, data?: Object}>}
 */
export async function pushCloudBackupOptimistic(passcode, budgetData) {
  savePendingSync(budgetData, passcode || '');

  const serializedBody = JSON.stringify({ budget: budgetData });
  logSync('PUSH_REQUEST', 'Initiating optimistic cloud backup to Worker API', {
    endpoint: getApiUrl('/api/sync/backup'),
    byteLength: serializedBody.length,
    accountsCount: budgetData?.accounts?.length || 0,
    billsCount: budgetData?.bills?.length || 0,
    matrixEntriesCount: Object.keys(budgetData?.dailyMatrix || {}).length,
    hasPasscode: Boolean(passcode)
  });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logSync('OFFLINE_QUEUE', 'Network is offline; payload safely preserved in fallback queue', null, 'warn');
    return { success: false, status: 'queued', error: 'Network offline. Payload queued.' };
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (passcode) {
      headers['X-Sync-Passcode'] = passcode;
    }

    const res = await apiFetch('/api/sync/backup', {
      method: 'POST',
      headers,
      body: serializedBody
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      clearPendingSync();
      logSync('PUSH_SUCCESS', 'Cloud backup successfully stored in Cloudflare D1 database', {
        status: res.status,
        timestamp: data.timestamp
      });
      return { success: true, status: 'synced', data };
    }

    if (res.status >= 500 || res.status === 503 || res.status === 429) {
      logSync('PUSH_RETRY_QUEUED', `Server returned status ${res.status}; payload queued for auto-retry`, {
        status: res.status,
        response: data
      }, 'warn');
      return { success: false, status: 'queued', error: `Server response status ${res.status}. Retrying later.` };
    }

    logSync('PUSH_FAILED', `Cloud backup rejected: ${data.error || res.statusText}`, { status: res.status, data }, 'error');
    throw new Error(data.error || `HTTP ${res.status}: Failed to backup data.`);
  } catch (err) {
    logSync('PUSH_ERROR', `Cloud backup push error: ${err.message}`, { error: err.message }, 'error');
    return { success: false, status: 'queued', error: err.message };
  }
}

/**
 * Retries flushing any pending payload in the queue to Cloudflare.
 * @returns {Promise<boolean>}
 */
export async function flushPendingCloudSync(passcode) {
  const pending = getPendingSync();
  if (!pending || !pending.payload) return false;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    logSync('FLUSH_SKIPPED', 'Device offline; skipping queue flush attempt');
    return false;
  }

  logSync('FLUSH_ATTEMPT', 'Draining pending sync queue to Cloudflare API', {
    enqueuedAt: pending.timestamp,
    accountsCount: pending.payload?.accounts?.length
  });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (passcode) {
      headers['X-Sync-Passcode'] = passcode;
    }

    const res = await apiFetch('/api/sync/backup', {
      method: 'POST',
      headers,
      body: JSON.stringify({ budget: pending.payload })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      clearPendingSync();
      logSync('FLUSH_SUCCESS', 'Offline sync queue successfully flushed to cloud', { timestamp: data.timestamp });
      return true;
    }
    logSync('FLUSH_FAILED', `Queue flush rejected: ${data.error || res.statusText}`, { status: res.status }, 'warn');
  } catch (err) {
    logSync('FLUSH_ERROR', `Background retry for pending sync failed: ${err.message}`, { error: err.message }, 'warn');
    console.warn('Background retry for pending sync failed:', err);
  }
  return false;
}
