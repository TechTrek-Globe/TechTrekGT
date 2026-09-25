import { logSync } from './logger';
import { ERROR_CODES } from './errorCodes.js';

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
      if (data?.code && (data.code === ERROR_CODES.SESSION_EXPIRED || data.code === ERROR_CODES.UNAUTHORIZED)) {
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
export async function pushCloudBackupOptimistic(passcode, budgetData, options = {}) {
  savePendingSync(budgetData, passcode || '');

  const baseVersion = options?.baseVersion;
  const force = Boolean(options?.force);

  const requestBody = { budget: budgetData };
  if (typeof baseVersion === 'number' && !isNaN(baseVersion)) {
    requestBody.baseVersion = baseVersion;
  }
  if (force) {
    requestBody.force = true;
  }

  const serializedBody = JSON.stringify(requestBody);
  logSync('PUSH_REQUEST', 'Initiating optimistic cloud backup to Worker API', {
    endpoint: getApiUrl('/api/sync/backup'),
    byteLength: serializedBody.length,
    accountsCount: budgetData?.accounts?.length || 0,
    billsCount: budgetData?.bills?.length || 0,
    matrixEntriesCount: Object.keys(budgetData?.dailyMatrix || {}).length,
    hasPasscode: Boolean(passcode),
    baseVersion,
    force
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
        timestamp: data.timestamp,
        version: data.version
      });
      return { success: true, status: 'synced', data, version: data.version };
    }

    if (res.status === 409) {
      if (data?.conflict || data?.code === ERROR_CODES.SYNC_CONFLICT) {
        logSync('PUSH_CONFLICT', 'Cloud sync conflict detected', { serverVersion: data.serverVersion }, 'warn');
        return {
          success: false,
          status: 'conflict',
          conflict: true,
          code: ERROR_CODES.SYNC_CONFLICT,
          serverData: data.serverData,
          serverVersion: data.serverVersion,
          error: data.error || 'Conflict detected: cloud data changed elsewhere.'
        };
      }
      if (data?.suspicious || data?.code === ERROR_CODES.SYNC_SUSPICIOUS) {
        logSync('PUSH_SUSPICIOUS', 'Backup payload suspiciously smaller than stored version', null, 'warn');
        return {
          success: false,
          status: 'suspicious',
          suspicious: true,
          code: ERROR_CODES.SYNC_SUSPICIOUS,
          error: data.error || 'Incoming backup is suspiciously smaller than stored backup.'
        };
      }
    }

    if (res.status >= 500 || res.status === 503 || res.status === 429) {
      logSync('PUSH_RETRY_QUEUED', `Server returned status ${res.status}; payload queued for auto-retry`, {
        status: res.status,
        response: data
      }, 'warn');
      return { success: false, status: 'queued', error: `Server response status ${res.status}. Retrying later.` };
    }

    logSync('PUSH_FAILED', `Cloud backup rejected: ${data.error || res.statusText}`, { status: res.status, data }, 'error');
    return { success: false, status: 'failed', error: data.error || `HTTP ${res.status}: Failed to backup data.` };
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

    const savedVerStr = typeof localStorage !== 'undefined' ? localStorage.getItem('tt_budget_cloud_version') : null;
    const bodyObj = { budget: pending.payload };
    if (savedVerStr) {
      bodyObj.baseVersion = parseInt(savedVerStr, 10);
    } else {
      bodyObj.force = true;
    }

    const res = await apiFetch('/api/sync/backup', {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj)
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      clearPendingSync();
      if (typeof localStorage !== 'undefined' && data.version) {
        localStorage.setItem('tt_budget_cloud_version', String(data.version));
      }
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

export async function fetchBackupVersions() {
  const res = await apiFetch('/api/sync/versions', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success) {
    return data.versions || [];
  }
  throw new Error(data.error || 'Failed to fetch backup versions');
}

export async function restoreBackupVersion(versionId) {
  const res = await apiFetch('/api/sync/restore-version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.success) {
    return data;
  }
  throw new Error(data.error || 'Failed to restore backup version');
}
