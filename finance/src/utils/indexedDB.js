/**
 * Native IndexedDB persistence engine for TechTrek Finance.
 * 100% Local-First, origin-sandboxed browser storage.
 * CRIT-002: All budget records and tt_/cf_ localStorage keys are scoped to the
 * signed-in user id (e.g. current_budget:<userId>). Legacy unkeyed records are
 * migrated to the first user who signs in only after explicit confirmation.
 */

const DB_NAME = 'TechTrekFinanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const LEGACY_BUDGET_KEY = 'current_budget';

/**
 * Builds a user-scoped record key for budget persistence.
 * @param {string} userId
 * @returns {string}
 */
export function budgetRecordKey(userId) {
  const id = userId ? String(userId) : 'legacy';
  return `current_budget:${id}`;
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
 * Opens and initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
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
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

import { logState } from './logger.js';

/**
 * Loads the application budget state from IndexedDB.
 * CRIT-002: Reads the user-scoped record `current_budget:<userId>`. If no user is
 * signed in, falls back to the legacy unkeyed `current_budget` record so existing
 * data remains visible until migration is confirmed.
 * @param {string|null} [userId]
 * @returns {Promise<object|null>}
 */
export async function getBudgetData(userId = null) {
  const db = await openDB();
  const key = userId ? budgetRecordKey(userId) : LEGACY_BUDGET_KEY;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const res = request.result || null;
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
 * Silently saves the current application budget state to IndexedDB.
 * CRIT-002: Persists under the user-scoped record `current_budget:<userId>`.
 * @param {Object} budgetData
 * @param {string|null} [userId]
 * @returns {Promise<void>}
 */
export async function saveBudgetData(budgetData, userId = null) {
  const db = await openDB();
  const key = userId ? budgetRecordKey(userId) : LEGACY_BUDGET_KEY;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(budgetData, key);

    request.onsuccess = () => {
      logState('INDEXEDDB_WRITE', 'Successfully committed budget snapshot to IndexedDB', {
        recordKey: key,
        accountsCount: budgetData?.accounts?.length || 0,
        billsCount: budgetData?.bills?.length || 0,
        matrixEntriesCount: Object.keys(budgetData?.dailyMatrix || {}).length
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
 * Clears current database state and saves new imported budget data.
 * CRIT-002: Clears the user-scoped record (or the legacy record when no user is
 * provided) and writes the new budget under the same scope.
 * @param {Object} newBudgetData
 * @param {string|null} [userId]
 * @returns {Promise<void>}
 */
export async function clearAndRestoreBudgetData(newBudgetData, userId = null) {
  const db = await openDB();
  const key = userId ? budgetRecordKey(userId) : LEGACY_BUDGET_KEY;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      const putRequest = store.put(newBudgetData, key);
      putRequest.onsuccess = () => {
        logState('INDEXEDDB_RESTORE', 'Restored budget state into IndexedDB', {
          recordKey: key,
          accountsCount: newBudgetData?.accounts?.length || 0,
          billsCount: newBudgetData?.bills?.length || 0
        });
        resolve();
      };
      putRequest.onerror = () => reject(putRequest.error);
    };

    clearRequest.onerror = () => reject(clearRequest.error);
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
        .filter((k) => typeof k === 'string' && k.startsWith('current_budget'))
        .map((/** @type {string} */ k) => k);
      resolve(keys);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Purges the budget record for the signed-in user (or the legacy record when no
 * user id is supplied). CRIT-002: scoped deletion so a second signed-in user
 * cannot erase another user's local data.
 * @param {string|null} [userId]
 * @returns {Promise<void>}
 */
export async function clearBudgetData(userId = null) {
  const db = await openDB();
  const key = userId ? budgetRecordKey(userId) : LEGACY_BUDGET_KEY;
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
