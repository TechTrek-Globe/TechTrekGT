/**
 * Native IndexedDB file storage for Wayfinder documents.
 * Persists uploaded PDFs and images locally in the browser across sessions.
 */

const DB_NAME = 'WayfinderDocumentDB';
const DB_VERSION = 3;
const STORE_NAME = 'document_files';
const STORE_MUTATIONS = 'mutation_queue';
const STORE_CACHE = 'offline_cache';

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
      if (!db.objectStoreNames.contains(STORE_MUTATIONS)) {
        const mutStore = db.createObjectStore(STORE_MUTATIONS, { keyPath: 'id' });
        mutStore.createIndex('status', 'status', { unique: false });
        mutStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const cacheStore = db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
        cacheStore.createIndex('userId', 'userId', { unique: false });
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
  if (!key || !file) return false;
  try {
    const db = await openDocumentDB();
    let recordToSave = file;

    // Convert File or Blob to structured ArrayBuffer payload for iOS Safari / WebKit compatibility
    if (file instanceof Blob || (typeof file === 'object' && typeof file.arrayBuffer === 'function')) {
      try {
        const buffer = await file.arrayBuffer();
        recordToSave = {
          buffer,
          type: file.type || 'application/pdf',
          name: file.name || key,
          size: file.size ?? buffer.byteLength,
          lastModified: file.lastModified || Date.now(),
        };
      } catch (bufErr) {
        console.warn('[DocumentStorage] arrayBuffer conversion failed, falling back to raw file:', bufErr);
      }
    } else if (file instanceof ArrayBuffer) {
      recordToSave = {
        buffer: file,
        type: 'application/pdf',
        name: key,
        size: file.byteLength,
        lastModified: Date.now(),
      };
    } else if (typeof file === 'string' && file.startsWith('data:')) {
      try {
        const mime = file.split(';')[0].split(':')[1] || 'application/pdf';
        const base64Data = file.split(',')[1];
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        recordToSave = {
          buffer: bytes.buffer,
          type: mime,
          name: key,
          size: bytes.buffer.byteLength,
          lastModified: Date.now(),
        };
      } catch (strErr) {
        console.warn('[DocumentStorage] Base64 parse failed:', strErr);
      }
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(recordToSave, key.toLowerCase());
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to save document to IndexedDB:', err);
    return false;
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
      req.onsuccess = () => {
        const result = req.result;
        if (!result) {
          resolve(null);
          return;
        }

        // If stored as structured ArrayBuffer record (iOS WebKit compatible)
        if (result && result.buffer) {
          try {
            const arrayBuf = result.buffer instanceof ArrayBuffer
              ? result.buffer
              : (result.buffer.buffer instanceof ArrayBuffer ? result.buffer.buffer : null);
            if (arrayBuf) {
              const blob = new Blob([arrayBuf], { type: result.type || 'application/pdf' });
              blob.name = result.name || key;
              blob.lastModified = result.lastModified || Date.now();
              resolve(blob);
              return;
            }
          } catch (blobErr) {
            console.warn('[DocumentStorage] Failed to create Blob from buffer:', blobErr);
          }
        }

        // Legacy raw File or Blob directly stored
        resolve(result);
      };
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

/**
 * Saves or updates a queued mutation in IndexedDB.
 * @param {Object} mutation
 */
export async function saveLocalMutation(mutation) {
  if (!mutation || !mutation.id) return false;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
      const store = tx.objectStore(STORE_MUTATIONS);
      const req = store.put(mutation);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to save mutation to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieves all pending mutations from IndexedDB.
 * @returns {Promise<Array>}
 */
export async function getLocalMutations() {
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MUTATIONS, 'readonly');
      const store = tx.objectStore(STORE_MUTATIONS);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        // Sort chronologically (FIFO)
        results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to get mutations from IndexedDB:', err);
    return [];
  }
}

/**
 * Deletes a completed mutation from IndexedDB by ID.
 * @param {string} id
 */
export async function deleteLocalMutation(id) {
  if (!id) return false;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
      const store = tx.objectStore(STORE_MUTATIONS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to delete mutation from IndexedDB:', err);
    return false;
  }
}

/**
 * Clears all mutations from IndexedDB.
 */
export async function clearLocalMutations() {
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MUTATIONS, 'readwrite');
      const store = tx.objectStore(STORE_MUTATIONS);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to clear mutations from IndexedDB:', err);
    return false;
  }
}

export async function saveUserCache(userId, cacheKey, value) {
  if (!userId || !cacheKey) return false;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.put({
        key: `${userId}:${cacheKey}`,
        userId,
        value,
        updatedAt: Date.now(),
      });
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to write offline cache:', err);
    return false;
  }
}

export async function getUserCache(userId, cacheKey) {
  if (!userId || !cacheKey) return null;
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHE, 'readonly');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.get(`${userId}:${cacheKey}`);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[DocumentStorage] Failed to read offline cache:', err);
    return null;
  }
}

async function clearStore(storeName) {
  try {
    const db = await openDocumentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`[DocumentStorage] Failed to clear ${storeName}:`, err);
    return false;
  }
}

export async function clearOfflineReadCaches() {
  if (typeof localStorage !== 'undefined') {
    for (const k of ['wayfinder_offline_packing_v1', 'wayfinder_custom_timeline_order', 'wayfinder_saved_items']) {
      try { localStorage.removeItem(k); } catch (_) {}
    }
  }
  await Promise.all([clearStore(STORE_NAME), clearStore(STORE_CACHE)]);
}

export async function clearLocalDataOnLogout() {
  await clearOfflineReadCaches();
  await clearLocalMutations();
}
