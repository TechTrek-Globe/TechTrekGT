import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import { parseAuctionWorkbookWorker, parseSpreadsheetWorker } from '../src/worker.js';
import {
  parseAuctionWorkbookAsync,
  parseSpreadsheetAsync,
  terminateSpreadsheetWorker
} from '../src/utils/spreadsheetWorkerClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('HIGH-001 / FUNC-001: Spreadsheet Web Worker & Offloaded Parsing Tests', () => {

  // Helper to create a sample auction tracker workbook in memory
  function createSampleWorkbookBuffer() {
    const wb = XLSX.utils.book_new();

    // Inventory sheet
    const invRows = [
      ['Item Title', 'Hammer Price', 'Invoice #', 'Category', 'Sport / Genre', 'Date Acquired'],
      ['Michael Jordan Signed 1996 Jersey PSA/DNA', '450.00', 'INV-2026-001', 'Jersey', 'Basketball', '2026-01-15'],
      ['Ken Griffey Jr. Signed Official Baseball (JSA)', '125.00', 'INV-2026-001', 'Baseball', 'Baseball', '2026-01-15'],
      ['Patrick Mahomes 2017 Panini Prizm Rookie Card BGS 9.5', '850.00', 'INV-2026-002', 'Card', 'Football', '2026-02-01']
    ];
    const wsInv = XLSX.utils.aoa_to_sheet(invRows);
    XLSX.utils.book_append_sheet(wb, wsInv, 'Inventory');

    // Sales sheet
    const salesRows = [
      ['Item Name', 'Gross Sale Price', 'Sale Date', 'Platform Sold', 'Buyer Handle'],
      ['Ken Griffey Jr. Signed Official Baseball (JSA)', '220.00', '2026-02-20', 'eBay', 'collector99']
    ];
    const wsSales = XLSX.utils.aoa_to_sheet(salesRows);
    XLSX.utils.book_append_sheet(wb, wsSales, 'Sales');

    // Pricing / Comps sheet
    const compsRows = [
      ['Item Name', 'Manual Comp 1', 'Manual Comp 2', 'Recommended List Price'],
      ['Michael Jordan Signed 1996 Jersey PSA/DNA', '750.00', '800.00', '795.00']
    ];
    const wsComps = XLSX.utils.aoa_to_sheet(compsRows);
    XLSX.utils.book_append_sheet(wb, wsComps, 'Pricing Comps');

    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return u8;
  }

  // Helper to create a raw CSV buffer
  function createSampleCsvBuffer() {
    const csv = [
      'Title,Price,Invoice #,Category,Sport',
      'Wayne Gretzky Signed Puck PSA,150.00,INV-CSV-01,Puck,Hockey',
      'Tom Brady Autographed Mini Helmet Beckett,350.00,INV-CSV-01,Helmet,Football'
    ].join('\n');
    return new TextEncoder().encode(csv).buffer;
  }

  test('parseAuctionWorkbookWorker: serverless entrypoint parses multi-sheet workbook', async () => {
    const buffer = createSampleWorkbookBuffer();
    const result = await parseAuctionWorkbookWorker(buffer);

    assert.ok(result, 'Result should exist');
    assert.strictEqual(result.items.length, 3, 'Should parse 3 inventory items');
    assert.strictEqual(result.invoices.length, 2, 'Should aggregate 2 invoices');
    assert.strictEqual(result.sales.length, 1, 'Should parse 1 sale record');
    assert.strictEqual(result.comps.length, 1, 'Should parse 1 comp record');
    assert.strictEqual(result.summary.itemCount, 3);
    assert.strictEqual(result.summary.invoiceCount, 2);
    assert.strictEqual(result.summary.salesCount, 1);
    assert.strictEqual(result.summary.compsCount, 1);
  });

  test('parseSpreadsheetWorker: serverless alias parses CSV data accurately', async () => {
    const buffer = createSampleCsvBuffer();
    const result = await parseSpreadsheetWorker(buffer);

    assert.ok(result, 'Result should exist');
    assert.strictEqual(result.items.length, 2, 'Should parse 2 CSV items');
    assert.strictEqual(result.invoices.length, 1, 'Should aggregate 1 invoice');
    assert.strictEqual(result.items[0].unit_price, 150.00);
    assert.strictEqual(result.items[1].unit_price, 350.00);
    assert.strictEqual(result.summary.totalCapital, 500.00);
  });

  test('parseAuctionWorkbookAsync: client helper parses workbook buffer asynchronously', async () => {
    const buffer = createSampleWorkbookBuffer();
    let progressFired = false;
    const result = await parseAuctionWorkbookAsync(buffer, (prog) => {
      progressFired = true;
    });

    assert.ok(result, 'Result should be returned');
    assert.strictEqual(progressFired, true, 'Progress callback should be fired in fallback mode');
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].category, 'Jersey');
    assert.strictEqual(result.items[0].sport_genre, 'Basketball');
    assert.strictEqual(result.items[0].unit_price, 450);
    assert.strictEqual(result.items[1].category, 'Baseball');
    assert.strictEqual(result.items[2].category, 'Card');
  });

  test('parseSpreadsheetAsync: client alias correctly parses CSV data asynchronously', async () => {
    const buffer = createSampleCsvBuffer();
    const result = await parseSpreadsheetAsync(buffer);

    assert.ok(result, 'Result should be returned');
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.items[0].sport_genre, 'Hockey');
    assert.strictEqual(result.items[1].sport_genre, 'Football');
  });

  test('terminateSpreadsheetWorker: terminates worker cleanly without throwing', () => {
    assert.doesNotThrow(() => {
      terminateSpreadsheetWorker();
    });
  });

  test('Component integrity: ImportView and SpreadsheetImporterModal source files correctly offload parsing', () => {
    const modalPath = path.resolve(__dirname, '../src/components/SpreadsheetImporterModal.jsx');
    const importViewPath = path.resolve(__dirname, '../src/components/ImportView.jsx');

    assert.ok(fs.existsSync(modalPath), 'SpreadsheetImporterModal.jsx must exist');
    assert.ok(fs.existsSync(importViewPath), 'ImportView.jsx must exist');

    const modalContent = fs.readFileSync(modalPath, 'utf8');
    assert.ok(
      modalContent.includes('parseAuctionWorkbookAsync'),
      'SpreadsheetImporterModal must import and call parseAuctionWorkbookAsync'
    );
    assert.ok(
      modalContent.includes('spreadsheetWorkerClient'),
      'SpreadsheetImporterModal must reference spreadsheetWorkerClient'
    );
    assert.ok(
      modalContent.includes('parseProgress'),
      'SpreadsheetImporterModal must track parseProgress for responsive UI'
    );

    const importViewContent = fs.readFileSync(importViewPath, 'utf8');
    assert.ok(
      importViewContent.includes('SpreadsheetImporterModal'),
      'ImportView must wrap or delegate to SpreadsheetImporterModal'
    );
  });

  describe('Simulated Browser Web Worker Environment', () => {
    let originalWindow;
    let originalWorker;

    before(() => {
      originalWindow = globalThis.window;
      originalWorker = globalThis.Worker;

      // Mock window and Worker constructor to verify real message passing protocol
      globalThis.window = {};
      globalThis.Worker = class MockWorker {
        constructor(scriptUrl, options) {
          this.scriptUrl = scriptUrl;
          this.options = options;
          this.onmessage = null;
          this.onerror = null;
          this.terminated = false;
        }

        postMessage(message) {
          const { id, type, payload } = message || {};
          // Simulate background parsing asynchronously
          setTimeout(async () => {
            if (this.terminated) return;
            try {
              if (type === 'PARSE_AUCTION_WORKBOOK') {
                // Post simulated progress first
                if (this.onmessage) {
                  this.onmessage({
                    data: { id, type: 'PROGRESS', progress: { message: 'Parsing in background...' } }
                  });
                }
                const result = await parseAuctionWorkbookWorker(payload.buffer);
                if (this.onmessage) {
                  this.onmessage({ data: { id, success: true, result } });
                }
              } else {
                if (this.onmessage) {
                  this.onmessage({ data: { id, success: false, error: `Unknown operation ${type}` } });
                }
              }
            } catch (err) {
              if (this.onmessage) {
                this.onmessage({ data: { id, success: false, error: err.message } });
              }
            }
          }, 10);
        }

        terminate() {
          this.terminated = true;
        }
      };
    });

    after(() => {
      terminateSpreadsheetWorker();
      globalThis.window = originalWindow;
      globalThis.Worker = originalWorker;
    });

    test('parseAuctionWorkbookAsync executes via Web Worker postMessage when Worker is present', async () => {
      // Force worker re-instantiation under the mock
      terminateSpreadsheetWorker();

      const buffer = createSampleWorkbookBuffer();
      const progressUpdates = [];

      const result = await parseAuctionWorkbookAsync(buffer, (prog) => {
        progressUpdates.push(prog);
      });

      assert.ok(result, 'Result should be received via mock worker postMessage');
      assert.strictEqual(result.items.length, 3);
      assert.ok(progressUpdates.length >= 1, 'Progress callback should be dispatched');
      assert.strictEqual(progressUpdates[0].message, 'Parsing in background...');

      terminateSpreadsheetWorker();
    });
  });
});
