/**
 * Native IndexedDB persistence engine for TechTrek Finance.
 * 100% Local-First, origin-sandboxed browser storage.
 */

const DB_NAME = 'TechTrekFinanceDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const BUDGET_KEY = 'current_budget';

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
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

import { logState } from './logger';

/**
 * Loads the application budget state from IndexedDB.
 * @returns {Promise<object|null>}
 */
export async function getBudgetData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(BUDGET_KEY);

    request.onsuccess = () => {
      const res = request.result || null;
      logState('INDEXEDDB_READ', 'Loaded budget state from IndexedDB', {
        hasData: Boolean(res),
        accountsCount: res?.accounts?.length || 0,
        billsCount: res?.bills?.length || 0,
        matrixEntriesCount: Object.keys(res?.dailyMatrix || {}).length
      });
      resolve(res);
    };

    request.onerror = (event) => {
      logState('INDEXEDDB_READ_ERROR', 'Failed to read budget state from IndexedDB', { error: event.target.error }, 'error');
      reject(event.target.error);
    };
  });
}

/**
 * Silently saves the current application budget state to IndexedDB.
 * @param {object} budgetData
 * @returns {Promise<void>}
 */
export async function saveBudgetData(budgetData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(budgetData, BUDGET_KEY);

    request.onsuccess = () => {
      logState('INDEXEDDB_WRITE', 'Successfully committed budget snapshot to IndexedDB', {
        accountsCount: budgetData?.accounts?.length || 0,
        billsCount: budgetData?.bills?.length || 0,
        matrixEntriesCount: Object.keys(budgetData?.dailyMatrix || {}).length
      });
      resolve();
    };

    request.onerror = (event) => {
      logState('INDEXEDDB_WRITE_ERROR', 'Failed to write budget state to IndexedDB', { error: event.target.error }, 'error');
      reject(event.target.error);
    };
  });
}

/**
 * Clears current database state and saves new imported budget data.
 * @param {object} newBudgetData
 * @returns {Promise<void>}
 */
export async function clearAndRestoreBudgetData(newBudgetData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      const putRequest = store.put(newBudgetData, BUDGET_KEY);
      putRequest.onsuccess = () => {
        logState('INDEXEDDB_RESTORE', 'Restored budget state into IndexedDB', {
          accountsCount: newBudgetData?.accounts?.length || 0,
          billsCount: newBudgetData?.bills?.length || 0
        });
        resolve();
      };
      putRequest.onerror = (event) => reject(event.target.error);
    };

    clearRequest.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Purges all budget data from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearBudgetData() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      logState('INDEXEDDB_CLEAR', 'Purged all records from IndexedDB app_state store');
      resolve();
    };
    request.onerror = (event) => reject(event.target.error);
  });
}
