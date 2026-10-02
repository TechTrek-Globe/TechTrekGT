// @ts-nocheck
/**
 * Dedicated Browser Web Worker for offloading CPU-intensive spreadsheet parsing (MED-001).
 * Executes XLSX/CSV parsing, workbook inspection, and sheet row normalization in a
 * background thread to eliminate main-thread blocking during large file imports.
 */
import { inspectWorkbookSheets, parseGenericFlat } from '../utils/importer.js';
import { parseSpreadsheet, parseSingleSheet } from '../utils/spreadsheetParser.js';

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    let result;
    switch (type) {
      case 'INSPECT_WORKBOOK': {
        const { arrayBuffer, fileName, existingAccounts } = payload;
        result = inspectWorkbookSheets(arrayBuffer, fileName, existingAccounts);
        break;
      }
      case 'PARSE_SINGLE_SHEET': {
        result = parseSingleSheet(payload);
        break;
      }
      case 'PARSE_SPREADSHEET': {
        const { fileData, fileName, existingBills } = payload;
        result = parseSpreadsheet(fileData, fileName, existingBills);
        break;
      }
      case 'PARSE_GENERIC_FLAT': {
        const { arrayBuffer, fileName, options } = payload;
        result = parseGenericFlat(arrayBuffer, fileName, options);
        break;
      }
      default:
        throw new Error(`Unknown worker operation: ${type}`);
    }
    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({ id, success: false, error: error?.message || String(error) });
  }
};
