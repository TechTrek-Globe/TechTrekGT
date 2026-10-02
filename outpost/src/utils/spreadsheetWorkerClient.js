// @ts-nocheck
/**
 * Client-side interface to the Spreadsheet Web Worker (HIGH-001).
 * Spawns the dedicated Web Worker in browser environments to process heavy XLSX/CSV data
 * off the main UI thread. Seamlessly falls back to in-thread processing in
 * Node.js / test environments where Web Workers are unavailable.
 */
import { parseAuctionWorkbook } from './spreadsheetParser.js';

let workerInstance = null;
let reqId = 0;
const pendingRequests = new Map();

function isWorkerSupported() {
  return typeof window !== 'undefined' && typeof globalThis.Worker !== 'undefined';
}

function getWorker() {
  if (!isWorkerSupported()) return null;
  if (!workerInstance) {
    try {
      const WorkerConstructor = globalThis.Worker;
      workerInstance = new WorkerConstructor(
        new URL('../workers/spreadsheet.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerInstance.onmessage = (e) => {
        const { id, success, result, error, type, progress } = e.data || {};
        const pending = pendingRequests.get(id);
        if (!pending) return;

        if (type === 'PROGRESS') {
          pending.onProgress?.(progress);
          return;
        }

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

function callWorker(type, payload, onProgress) {
  const worker = getWorker();
  if (!worker) {
    return Promise.resolve().then(() => {
      switch (type) {
        case 'PARSE_AUCTION_WORKBOOK':
          return parseAuctionWorkbook(payload.buffer, onProgress);
        default:
          throw new Error(`Unknown worker operation: ${type}`);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pendingRequests.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, payload });
  });
}

/**
 * Parses an Excel or CSV file buffer asynchronously via Web Worker.
 * @param {ArrayBuffer} buffer
 * @param {(progress: any) => void} [onProgress]
 * @returns {Promise<{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }>}
 */
export function parseAuctionWorkbookAsync(buffer, onProgress) {
  return callWorker('PARSE_AUCTION_WORKBOOK', { buffer }, onProgress);
}

/**
 * Parses a spreadsheet file buffer asynchronously via Web Worker (generic alias).
 * @param {ArrayBuffer} buffer
 * @param {(progress: any) => void} [onProgress]
 * @returns {Promise<{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }>}
 */
export const parseSpreadsheetAsync = parseAuctionWorkbookAsync;

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
