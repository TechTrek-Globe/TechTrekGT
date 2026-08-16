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
  savePendingSync(budgetData, passcode);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, status: 'queued', error: 'Network offline. Payload queued.' };
  }

  try {
    const res = await fetch(getApiUrl('/api/sync/backup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Passcode': passcode
      },
      body: JSON.stringify({ budget: budgetData })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      clearPendingSync();
      return { success: true, status: 'synced', data };
    }

    if (res.status >= 500 || res.status === 503 || res.status === 429) {
      return { success: false, status: 'queued', error: `Server response status ${res.status}. Retrying later.` };
    }

    throw new Error(data.error || `HTTP ${res.status}: Failed to backup data.`);
  } catch (err) {
    return { success: false, status: 'queued', error: err.message };
  }
}

/**
 * Retries flushing any pending payload in the queue to Cloudflare.
 * @returns {Promise<boolean>}
 */
export async function flushPendingCloudSync(passcode) {
  const pending = getPendingSync();
  if (!pending || !pending.payload || !passcode) return false;

  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  try {
    const res = await fetch(getApiUrl('/api/sync/backup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Passcode': passcode
      },
      body: JSON.stringify({ budget: pending.payload })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      clearPendingSync();
      return true;
    }
  } catch (err) {
    console.warn('Background retry for pending sync failed:', err);
  }
  return false;
}
