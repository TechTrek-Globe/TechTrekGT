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
      resolve(request.result || null);
    };

    request.onerror = (event) => {
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
      resolve();
    };

    request.onerror = (event) => {
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
      putRequest.onsuccess = () => resolve();
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

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}
