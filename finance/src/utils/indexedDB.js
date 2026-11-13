/**
 * Native IndexedDB persistence engine for TechTrek Finance.
 * 100% Local-First, origin-sandboxed browser storage.
 * CRIT-002: All budget records and tt_/cf_ localStorage keys are scoped to the
 * signed-in user id (e.g. current_budget:<userId>). Legacy unkeyed records are
 * migrated to the first user who signs in only after explicit confirmation.
 */

import { logState } from './logger.js';

const DB_NAME = 'TechTrekFinanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
export const LEGACY_BUDGET_KEY = 'current_budget';

let cachedDb = null;

/**
 * Explicitly closes any open IndexedDB database connection.
 * Prevents blocking window.indexedDB.deleteDatabase calls.
 */
export function closeDB() {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {}
    cachedDb = null;
  }
}

/**
 * Builds a user-scoped record key for budget persistence.
 * @param {string} userId
 * @param {string|null} [ledgerId]
 * @returns {string}
 */
export function budgetRecordKey(userId, ledgerId = null) {
  const id = userId ? String(userId) : 'legacy';
  if (ledgerId && String(ledgerId) !== id) {
    return `budget:${id}:${String(ledgerId)}`;
  }
  return `budget:${id}`;
}

/**
 * Returns the current signed-in user id from AuthContext state if available.
 * Falls back to null when no user is signed in.
 * @returns {string|null}
 */
export function getCurrentUserId() {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem('tt_signed_in_user_id');
    if (raw) return raw;
    const match = document.cookie.match(/(?:^|;\s*)tt_user_id=([^;]+)/);
    if (match && match[1]) return decodeURIComponent(match[1]);
  } catch {}
  return null;
}

/**
 * Opens and initializes the IndexedDB database, caching the connection
 * and binding onversionchange so deleteDatabase is never blocked.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported by this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      // @ts-ignore - IDBVersionChangeEvent.target.result
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      cachedDb = db;
      db.onversionchange = () => {
        try {
          db.close();
        } catch {}
        if (cachedDb === db) cachedDb = null;
      };
      db.onclose = () => {
        if (cachedDb === db) cachedDb = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Loads the application budget state from IndexedDB.
 * CRIT-002: Reads the user-scoped record `budget:<userId>:<ledgerId>` or `current_budget:<userId>`.
 * @param {string|null} [userId]
 * @param {string|null} [ledgerId]
 * @returns {Promise<object|null>}
 */
export async function getBudgetData(userId = null, ledgerId = null) {
  const db = await openDB();
  const key = budgetRecordKey(userId, ledgerId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const res = request.result || null;
      if (!res && ledgerId && userId) {
        // Fallback to legacy key if unmigrated
        const fallbackReq = store.get(`current_budget:${userId}`);
        fallbackReq.onsuccess = () => {
          resolve(fallbackReq.result || null);
        };
        fallbackReq.onerror = () => resolve(null);
        return;
      }
      logState('INDEXEDDB_READ', 'Loaded budget state from IndexedDB', {
        recordKey: key,
        hasData: Boolean(res),
        accountsCount: res?.accounts?.length || 0,
        billsCount: res?.bills?.length || 0,
        matrixEntriesCount: Object.keys(res?.dailyMatrix || {}).length
      });
      resolve(res);
    };

    request.onerror = () => {
      logState('INDEXEDDB_READ_ERROR', 'Failed to read budget state from IndexedDB', { error: request.error, recordKey: key }, 'error');
      reject(request.error);
    };
  });
}

/**
 * Silently saves the current application budget state to IndexedDB without mutating caller object.
 * @param {Object} budgetData
 * @param {string|null} [userId]
 * @param {string|null} [ledgerId]
 * @returns {Promise<void>}
 */
export async function saveBudgetData(budgetData, userId = null, ledgerId = null) {
  const toSave = (budgetData && typeof budgetData === 'object')
    ? { ...budgetData, owner_id: userId || budgetData.owner_id }
    : budgetData;
  const db = await openDB();
  const key = budgetRecordKey(userId, ledgerId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(toSave, key);

    request.onsuccess = () => {
      logState('INDEXEDDB_WRITE', 'Successfully committed budget snapshot to IndexedDB', {
        recordKey: key,
        accountsCount: toSave?.accounts?.length || 0,
        billsCount: toSave?.bills?.length || 0,
        matrixEntriesCount: Object.keys(toSave?.dailyMatrix || {}).length
      });
      resolve();
    };

    request.onerror = () => {
      logState('INDEXEDDB_WRITE_ERROR', 'Failed to write budget state to IndexedDB', { error: request.error, recordKey: key }, 'error');
      reject(request.error);
    };
  });
}

/**
 * Clears current database record for single key and saves new imported budget data.
 * @param {Object} newBudgetData
 * @param {string|null} [userId]
 * @param {string|null} [ledgerId]
 * @returns {Promise<void>}
 */
export async function clearAndRestoreBudgetData(newBudgetData, userId = null, ledgerId = null) {
  const toSave = (newBudgetData && typeof newBudgetData === 'object')
    ? { ...newBudgetData, owner_id: userId || newBudgetData.owner_id }
    : newBudgetData;
  const db = await openDB();
  const key = budgetRecordKey(userId, ledgerId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const deleteRequest = store.delete(key);

    deleteRequest.onsuccess = () => {
      const putRequest = store.put(toSave, key);
      putRequest.onsuccess = () => {
        logState('INDEXEDDB_RESTORE', 'Restored budget state into IndexedDB', {
          recordKey: key,
          accountsCount: toSave?.accounts?.length || 0,
          billsCount: toSave?.bills?.length || 0
        });
        resolve();
      };
      putRequest.onerror = () => reject(putRequest.error);
    };

    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
}

/**
 * Returns the legacy unkeyed `current_budget` record, if one exists.
 * Used only during migration to the user-scoped model.
 * @returns {Promise<object|null>}
 */
export async function getLegacyBudgetData() {
  return getBudgetData(null);
}

/**
 * Migrates the legacy unkeyed `current_budget` record to the user-scoped record
 * `current_budget:<userId>`. The migration is only performed when a legacy record
 * exists AND the target user-scoped record does not already exist, preventing
 * silent data overwrite. Returns true when migration occurred.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function migrateLegacyBudgetToUser(userId) {
  if (!userId) return false;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const getRequest = store.get(LEGACY_BUDGET_KEY);
    getRequest.onsuccess = () => {
      const legacy = getRequest.result;
      if (!legacy || typeof legacy !== 'object') {
        resolve(false);
        return;
      }

      const userGetRequest = store.get(budgetRecordKey(userId));
      userGetRequest.onsuccess = () => {
        if (userGetRequest.result && typeof userGetRequest.result === 'object') {
          // Target record already exists; do not overwrite.
          resolve(false);
          return;
        }

        const putRequest = store.put(legacy, budgetRecordKey(userId));
        putRequest.onsuccess = () => {
          logState('INDEXEDDB_MIGRATE', 'Migrated legacy budget record to user-scoped record', {
            userId,
            recordKey: budgetRecordKey(userId),
            accountsCount: legacy?.accounts?.length || 0
          });
          resolve(true);
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      userGetRequest.onerror = () => reject(userGetRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Lists every budget record key currently stored in the app_state store.
 * @returns {Promise<string[]>}
 */
export async function listBudgetRecordKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => {
      /** @type {string[]} */
      const keys = (request.result || [])
        .filter((k) => typeof k === 'string' && (k.startsWith('current_budget') || k.startsWith('budget:')))
        .map((/** @type {string} */ k) => k);
      resolve(keys);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Purges the budget record for the signed-in user and ledger.
 * @param {string|null} [userId]
 * @param {string|null} [ledgerId]
 * @returns {Promise<void>}
 */
export async function clearBudgetData(userId = null, ledgerId = null) {
  const db = await openDB();
  const key = budgetRecordKey(userId, ledgerId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => {
      logState('INDEXEDDB_CLEAR', 'Purged budget record from IndexedDB app_state store', { recordKey: key });
      resolve();
    };
    request.onerror = () => {
      logState('INDEXEDDB_CLEAR_ERROR', 'Failed to purge budget record from IndexedDB', { error: request.error, recordKey: key }, 'error');
      reject(request.error);
    };
  });
}
