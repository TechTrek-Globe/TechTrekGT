// @ts-nocheck
/**
 * Client-side interface to the Spreadsheet Web Worker (MED-001).
 * Spawns the dedicated Web Worker in browser environments to process heavy XLSX/CSV data
 * off the main UI thread. Seamlessly falls back to synchronous in-thread processing in
 * Node.js / test environments where Web Workers are unavailable.
 */
import { inspectWorkbookSheets, parseGenericFlat, MAX_SPREADSHEET_FILE_SIZE, MAX_SPREADSHEET_ROW_COUNT } from './importer.js';
import { parseSpreadsheet, parseSingleSheet } from './spreadsheetParser.js';

let workerInstance = null;
let reqId = 0;
const pendingRequests = new Map();

function isWorkerSupported() {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function getWorker() {
  if (!isWorkerSupported()) return null;
  if (!workerInstance) {
    try {
      workerInstance = new Worker(
        new URL('../workers/spreadsheet.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerInstance.onmessage = (e) => {
        const { id, success, result, error } = e.data || {};
        const pending = pendingRequests.get(id);
        if (!pending) return;
        pendingRequests.delete(id);
        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'Worker execution failed'));
        }
      };
      workerInstance.onerror = (err) => {
        console.error('[SpreadsheetWorker] error:', err);
        pendingRequests.forEach(({ reject }) => {
          reject(new Error(err?.message || 'Worker error'));
        });
        pendingRequests.clear();
        workerInstance = null;
      };
    } catch (err) {
      console.warn('[SpreadsheetWorker] Failed to initialize worker, falling back to main thread:', err);
      workerInstance = null;
    }
  }
  return workerInstance;
}

function callWorker(type, payload) {
  // Pre-validate file size and row count before processing or dispatching to worker (FIX-11)
  if (payload?.arrayBuffer) {
    const len = payload.arrayBuffer.byteLength || 0;
    if (len > MAX_SPREADSHEET_FILE_SIZE) {
      return Promise.reject(new Error(`File size (${Math.round(len / (1024 * 1024))}MB) exceeds maximum limit of 15MB.`));
    }
  }
  if (payload?.fileData) {
    const len = typeof payload.fileData === 'string' ? payload.fileData.length : (payload.fileData?.byteLength || 0);
    if (len > MAX_SPREADSHEET_FILE_SIZE) {
      return Promise.reject(new Error(`File size (${Math.round(len / (1024 * 1024))}MB) exceeds maximum limit of 15MB.`));
    }
  }
  if (payload?.rawRows && payload.rawRows.length > MAX_SPREADSHEET_ROW_COUNT) {
    return Promise.reject(new Error(`Sheet contains ${payload.rawRows.length} rows, exceeding maximum limit of ${MAX_SPREADSHEET_ROW_COUNT}.`));
  }

  const worker = getWorker();
  if (!worker) {
    return Promise.resolve().then(() => {
      switch (type) {
        case 'INSPECT_WORKBOOK':
          return inspectWorkbookSheets(payload.arrayBuffer, payload.fileName, payload.existingAccounts);
        case 'PARSE_SINGLE_SHEET':
          return parseSingleSheet(payload);
        case 'PARSE_SPREADSHEET':
          return parseSpreadsheet(payload.fileData, payload.fileName, payload.existingBills);
        case 'PARSE_GENERIC_FLAT':
          return parseGenericFlat(payload.arrayBuffer, payload.fileName, payload.options);
        default:
          throw new Error(`Unknown worker operation: ${type}`);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

/**
 * Inspects all sheets in a workbook array buffer asynchronously via Web Worker.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} fileName
 * @param {any[]} existingAccounts
 * @returns {Promise<{ isWorkbook: boolean, sheetNames: string[], sheetsInfo: any[] }>}
 */
export function inspectWorkbookAsync(arrayBuffer, fileName = '', existingAccounts = []) {
  return callWorker('INSPECT_WORKBOOK', { arrayBuffer, fileName, existingAccounts });
}

/**
 * Parses a single worksheet asynchronously via Web Worker.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export function parseSingleSheetAsync(options) {
  return callWorker('PARSE_SINGLE_SHEET', options);
}

/**
 * Parses an entire spreadsheet file asynchronously via Web Worker.
 * @param {ArrayBuffer|string} fileData
 * @param {string} fileName
 * @param {any[]} existingBills
 * @returns {Promise<Object>}
 */
export function parseSpreadsheetAsync(fileData, fileName = '', existingBills = []) {
  return callWorker('PARSE_SPREADSHEET', { fileData, fileName, existingBills });
}

/**
 * Parses a flat CSV/XLSX file asynchronously via Web Worker.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} fileName
 * @param {Object} options
 * @returns {Promise<{ headers: string[], rows: any[] }>}
 */
export function parseGenericFlatAsync(arrayBuffer, fileName = '', options = {}) {
  return callWorker('PARSE_GENERIC_FLAT', { arrayBuffer, fileName, options });
}

/**
 * Terminates any active Web Worker instance.
 */
export function terminateSpreadsheetWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pendingRequests.clear();
}
