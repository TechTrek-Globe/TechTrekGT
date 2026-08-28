/**
 * Native IndexedDB file storage for Wayfinder documents.
 * Persists uploaded PDFs and images locally in the browser across sessions.
 */

const DB_NAME = 'WayfinderDocumentDB';
const DB_VERSION = 1;
const STORE_NAME = 'document_files';

export function openDocumentDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
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
 * Saves a document file or blob in IndexedDB keyed by ID and/or filename.
 * @param {string} key
 * @param {Blob|File} file
 */
export async function saveLocalDocumentFile(key, file) {
  if (!key || !file) return;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(file, key.toLowerCase());
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to save document to IndexedDB:', err);
  }
}

/**
 * Retrieves a document file or blob from IndexedDB by key.
 * @param {string} key
 * @returns {Promise<Blob|File|null>}
 */
export async function getLocalDocumentFile(key) {
  if (!key) return null;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key.toLowerCase());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to get document from IndexedDB:', err);
    return null;
  }
}

/**
 * Deletes a document file from IndexedDB by key.
 * @param {string} key
 */
export async function deleteLocalDocumentFile(key) {
  if (!key) return;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key.toLowerCase());
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to delete document from IndexedDB:', err);
  }
}
