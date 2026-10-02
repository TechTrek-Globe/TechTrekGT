// @ts-nocheck
/**
 * Dedicated Browser Web Worker for offloading CPU-intensive spreadsheet parsing (HIGH-001).
 * Executes XLSX/CSV parsing, table header matching, proration, and pricing calculations in a
 * background thread to eliminate main-thread UI blocking during large file imports.
 */
import { parseAuctionWorkbook } from '../utils/spreadsheetParser.js';

globalThis.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    let result;
    switch (type) {
      case 'PARSE_AUCTION_WORKBOOK': {
        const { buffer } = payload || {};
        result = await parseAuctionWorkbook(buffer, (prog) => {
          globalThis.postMessage({
            id,
            type: 'PROGRESS',
            progress: typeof prog === 'string' ? { message: prog } : prog
          });
        });
        break;
      }
      default:
        throw new Error(`Unknown worker operation: ${type}`);
    }
    globalThis.postMessage({ id, success: true, result });
  } catch (error) {
    globalThis.postMessage({ id, success: false, error: error?.message || String(error) });
  }
};
