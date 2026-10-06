import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import {
  MAX_SPREADSHEET_FILE_SIZE,
  MAX_SPREADSHEET_ROW_COUNT,
  inspectWorkbookSheets,
  parseGenericFlat
} from '../src/utils/importer.js';
import {
  parseSpreadsheet,
  parseSingleSheet
} from '../src/utils/spreadsheetParser.js';
import {
  inspectWorkbookAsync,
  parseGenericFlatAsync,
  parseSpreadsheetAsync,
  parseSingleSheetAsync
} from '../src/utils/spreadsheetWorkerClient.js';

describe('FIX-11: Upgrade the spreadsheet parser and enforce size/row limits', () => {

  it('SheetJS is loaded with version >= 0.20.0 from official distribution', () => {
    assert.ok(XLSX, 'XLSX module should be loaded');
    assert.ok(XLSX.version, 'XLSX should expose a version string');
    const [major, minor] = XLSX.version.split('.').map(Number);
    assert.ok(major > 0 || (major === 0 && minor >= 20), `Expected XLSX version >= 0.20, got ${XLSX.version}`);
  });

  it('rejects inspectWorkbookSheets when file size exceeds MAX_SPREADSHEET_FILE_SIZE (15MB)', () => {
    const oversizedBuffer = new ArrayBuffer(MAX_SPREADSHEET_FILE_SIZE + 1024);
    assert.throws(
      () => inspectWorkbookSheets(oversizedBuffer, 'huge.xlsx'),
      /exceeds maximum limit/i
    );
  });

  it('rejects parseGenericFlat when file size exceeds MAX_SPREADSHEET_FILE_SIZE (15MB)', () => {
    const oversizedBuffer = new ArrayBuffer(MAX_SPREADSHEET_FILE_SIZE + 1024);
    assert.throws(
      () => parseGenericFlat(oversizedBuffer),
      /exceeds maximum limit/i
    );
  });

  it('rejects parseSpreadsheet when file size exceeds MAX_SPREADSHEET_FILE_SIZE (15MB)', () => {
    const oversizedBuffer = new ArrayBuffer(MAX_SPREADSHEET_FILE_SIZE + 1024);
    const res = parseSpreadsheet(oversizedBuffer, 'huge.xlsx');
    assert.strictEqual(res.success, false);
    assert.match(res.error, /exceeds maximum limit/i);
  });

  it('rejects parseSingleSheet when row count exceeds MAX_SPREADSHEET_ROW_COUNT (50,000)', () => {
    // Generate dummy rows exceeding limit
    const dummyRows = new Array(MAX_SPREADSHEET_ROW_COUNT + 10).fill(['2026-01-01', 'Test', '10.00']);
    assert.throws(
      () => parseSingleSheet({ rawRows: dummyRows, sheetName: 'Sheet1' }),
      /exceeding maximum limit/i
    );
  });

  it('rejects via spreadsheetWorkerClient when file size or row count exceeds limits', async () => {
    const oversizedBuffer = new ArrayBuffer(MAX_SPREADSHEET_FILE_SIZE + 1024);
    await assert.rejects(
      () => inspectWorkbookAsync(oversizedBuffer, 'oversized.xlsx'),
      /exceeds maximum limit/i
    );
    await assert.rejects(
      () => parseGenericFlatAsync(oversizedBuffer, 'oversized.csv'),
      /exceeds maximum limit/i
    );
    await assert.rejects(
      () => parseSpreadsheetAsync(oversizedBuffer, 'oversized.xlsx'),
      /exceeds maximum limit/i
    );
    const oversizedRows = new Array(MAX_SPREADSHEET_ROW_COUNT + 1).fill(['2026-01-01', 'Txn', '1.00']);
    await assert.rejects(
      () => parseSingleSheetAsync({ rawRows: oversizedRows }),
      /exceeding maximum limit/i
    );
  });

  it('parses valid spreadsheet within size and row count limits cleanly', async () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Date', 'Description', 'Amount', 'Balance'],
      ['2026-05-01', 'Direct Deposit', '3500.00', '3500.00'],
      ['2026-05-02', 'Mortgage Payment', '-1800.00', '1700.00']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Checking');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const inspected = await inspectWorkbookAsync(u8, 'valid.xlsx');
    assert.strictEqual(inspected.sheetNames.length, 1);
    assert.strictEqual(inspected.sheetsInfo[0].rowCount, 3);

    const flat = await parseGenericFlatAsync(u8, 'valid.xlsx');
    assert.strictEqual(flat.rows.length, 2);
    assert.strictEqual(flat.rows[0].Description, 'Direct Deposit');
  });

});
