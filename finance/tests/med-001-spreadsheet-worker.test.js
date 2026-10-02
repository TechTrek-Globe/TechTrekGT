import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { parseSpreadsheetWorker } from '../src/worker.js';
import {
  inspectWorkbookAsync,
  parseSingleSheetAsync,
  parseGenericFlatAsync,
  parseSpreadsheetAsync
} from '../src/utils/spreadsheetWorkerClient.js';

describe('MED-001: Spreadsheet Worker & Offloaded Parsing Tests', () => {

  // Helper to create a minimal in-memory Excel workbook buffer
  function createSampleWorkbookBuffer() {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Date', 'Description', 'Amount', 'Balance'],
      ['2026-03-01', 'Deposit Payroll', '2500.00', '2500.00'],
      ['2026-03-02', 'Electric Utility', '-120.50', '2379.50'],
      ['2026-03-03', 'Grocery Store', '-85.25', '2294.25']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Checking');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return u8;
  }

  test('parseSpreadsheetWorker: serverless entrypoint parses CSV data dynamically', async () => {
    const csvContent = 'Date,Description,Amount\n2026-04-01,Test Paycheck,1500.00\n2026-04-02,Coffee,-4.50';
    const result = await parseSpreadsheetWorker(csvContent, 'test.csv', []);
    assert.ok(result, 'Result should exist');
    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.budget.transactions));
  });

  test('inspectWorkbookAsync: asynchronously inspects workbook sheets and metadata', async () => {
    const buffer = createSampleWorkbookBuffer();
    const inspection = await inspectWorkbookAsync(buffer, 'bank_statement.xlsx', [
      { id: 'acc-1', name: 'Checking' }
    ]);

    assert.ok(inspection, 'Inspection object returned');
    assert.strictEqual(inspection.isWorkbook, false); // 1 sheet
    assert.deepStrictEqual(inspection.sheetNames, ['Checking']);
    assert.strictEqual(inspection.sheetsInfo.length, 1);
    assert.strictEqual(inspection.sheetsInfo[0].name, 'Checking');
    assert.strictEqual(inspection.sheetsInfo[0].suggestedAccountId, 'acc-1');
    assert.strictEqual(inspection.sheetsInfo[0].previewRows.length, 4);
  });

  test('parseSingleSheetAsync: asynchronously parses individual sheet rows into structured transactions', async () => {
    const rawRows = [
      ['Date', 'Description', 'Amount', 'Category'],
      ['2026-03-01', 'Deposit Payroll', '2500.00', 'Income'],
      ['2026-03-02', 'Electric Utility', '-120.50', 'Utilities']
    ];

    const parsed = await parseSingleSheetAsync({
      rawRows,
      sheetName: 'Checking',
      headerRowIdx: 0,
      targetAccountId: 'acc-checking',
      targetAccountName: 'Checking',
      existingBills: [],
      existingPeople: [],
      existingAccounts: [{ id: 'acc-checking', name: 'Checking' }]
    });

    assert.ok(parsed, 'Parsed sheet object returned');
    assert.strictEqual(parsed.transactions.length, 2);
    assert.strictEqual(parsed.transactions[0].date, '2026-03-01');
    assert.strictEqual(parsed.transactions[0].amount, 2500);
    assert.strictEqual(parsed.transactions[1].amount, -120.5);
  });

  test('parseGenericFlatAsync: parses flat tabular spreadsheet data', async () => {
    const buffer = createSampleWorkbookBuffer();
    const flat = await parseGenericFlatAsync(buffer, 'flat.xlsx');
    assert.ok(flat, 'Flat object returned');
    assert.deepStrictEqual(flat.headers, ['Date', 'Description', 'Amount', 'Balance']);
    assert.strictEqual(flat.rows.length, 3);
  });

  test('parseSpreadsheetAsync: processes workbook with graceful fallback in Node', async () => {
    const buffer = createSampleWorkbookBuffer();
    const res = await parseSpreadsheetAsync(buffer, 'test.xlsx', []);
    assert.ok(res);
    assert.strictEqual(res.success, true);
  });
});
