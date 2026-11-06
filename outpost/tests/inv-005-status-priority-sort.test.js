import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS_PRIORITY_RANK, getStatusRank } from '../src/utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('INV-005: Inventory Status Priority Sorting Logic', async (t) => {
  const contextPath = path.resolve(__dirname, '../src/context/InventoryContext.jsx');
  const enrichedApiPath = path.resolve(__dirname, '../functions/api/items/enriched.js');

  await t.test('getStatusRank returns correct canonical ranks', () => {
    // Rank 1: Listed
    assert.equal(getStatusRank('Listed'), 1);
    assert.equal(getStatusRank('listed'), 1);
    assert.equal(getStatusRank('  LISTED  '), 1);

    // Rank 2: Available
    assert.equal(getStatusRank('Available'), 2);
    assert.equal(getStatusRank('available'), 2);

    // Rank 3: Kept for Self
    assert.equal(getStatusRank('Kept for Self'), 3);
    assert.equal(getStatusRank('kept for self'), 3);
    assert.equal(getStatusRank('Kept For Self'), 3);

    // Remaining deterministic ranks
    assert.equal(getStatusRank('Draft'), 4);
    assert.equal(getStatusRank('Unsold'), 5);
    assert.equal(getStatusRank('Returned'), 6);

    // Fallback rank for unknown / null / empty
    assert.equal(getStatusRank('Unknown Status'), 99);
    assert.equal(getStatusRank(''), 99);
    assert.equal(getStatusRank(null), 99);
    assert.equal(getStatusRank(undefined), 99);
  });

  await t.test('Client-side sorting groups by Status hierarchy in default All view', () => {
    const rawItems = [
      { id: '1', sku: 'SKU-001', status: 'Draft', created_at: '2026-10-01' },
      { id: '2', sku: 'SKU-002', status: 'Kept for Self', created_at: '2026-10-02' },
      { id: '3', sku: 'SKU-003', status: 'Available', created_at: '2026-10-03' },
      { id: '4', sku: 'SKU-004', status: 'Listed', created_at: '2026-10-04' },
      { id: '5', sku: 'SKU-005', status: 'Available', created_at: '2026-10-05' },
      { id: '6', sku: 'SKU-006', status: 'Listed', created_at: '2026-10-06' },
      { id: '7', sku: 'SKU-007', status: 'Unsold', created_at: '2026-10-01' }
    ];

    // Simulate InventoryContext sort function in default All view
    const isAllStatusView = true;
    const isDefaultSort = true;
    const sortConfig = { key: 'created_at', direction: 'desc' };

    const sorted = [...rawItems].sort((a, b) => {
      if (isAllStatusView && isDefaultSort) {
        const rankA = getStatusRank(a.status);
        const rankB = getStatusRank(b.status);
        if (rankA !== rankB) {
          return rankA - rankB;
        }
      }

      const strA = String(a[sortConfig.key] || '');
      const strB = String(b[sortConfig.key] || '');
      if (strA < strB) return 1;
      if (strA > strB) return -1;

      return String(a.sku || '').localeCompare(String(b.sku || ''));
    });

    const orderedStatuses = sorted.map(it => it.status);
    // Listed (2) -> Available (2) -> Kept for Self (1) -> Draft (1) -> Unsold (1)
    assert.deepEqual(orderedStatuses, [
      'Listed',
      'Listed',
      'Available',
      'Available',
      'Kept for Self',
      'Draft',
      'Unsold'
    ]);

    // Within Listed: newest first
    assert.equal(sorted[0].id, '6'); // 2026-10-06
    assert.equal(sorted[1].id, '4'); // 2026-10-04

    // Within Available: newest first
    assert.equal(sorted[2].id, '5'); // 2026-10-05
    assert.equal(sorted[3].id, '3'); // 2026-10-03
  });

  await t.test('Client-side sorting respects custom column sort over status hierarchy', () => {
    const rawItems = [
      { id: '1', sku: 'SKU-001', status: 'Draft', current_list_price: 150 },
      { id: '2', sku: 'SKU-002', status: 'Kept for Self', current_list_price: 20 },
      { id: '3', sku: 'SKU-003', status: 'Available', current_list_price: 300 },
      { id: '4', sku: 'SKU-004', status: 'Listed', current_list_price: 50 }
    ];

    const isAllStatusView = true;
    const isDefaultSort = false; // user clicked list price column
    const sortConfig = { key: 'current_list_price', direction: 'desc' };

    const sorted = [...rawItems].sort((a, b) => {
      if (isAllStatusView && isDefaultSort) {
        const rankA = getStatusRank(a.status);
        const rankB = getStatusRank(b.status);
        if (rankA !== rankB) return rankA - rankB;
      }

      const valA = a[sortConfig.key] || 0;
      const valB = b[sortConfig.key] || 0;
      return valB - valA;
    });

    assert.deepEqual(sorted.map(it => it.id), ['3', '1', '4', '2']);
    assert.deepEqual(sorted.map(it => it.current_list_price), [300, 150, 50, 20]);
  });

  await t.test('InventoryContext.jsx and enriched.js implement status priority mapping', () => {
    const contextContent = fs.readFileSync(contextPath, 'utf8');
    assert.ok(contextContent.includes('getStatusRank'), 'InventoryContext must import and use getStatusRank');
    assert.ok(contextContent.includes('isAllStatusView'), 'InventoryContext must check isAllStatusView');
    assert.ok(contextContent.includes('isDefaultSort'), 'InventoryContext must check isDefaultSort');

    const apiContent = fs.readFileSync(enrichedApiPath, 'utf8');
    assert.ok(apiContent.includes('STATUS_CASE_SQL'), 'enriched.js must define STATUS_CASE_SQL');
    assert.ok(apiContent.includes("WHEN 'listed' THEN 1"), 'enriched.js must map listed to 1');
    assert.ok(apiContent.includes("WHEN 'available' THEN 2"), 'enriched.js must map available to 2');
    assert.ok(apiContent.includes("WHEN 'kept for self' THEN 3"), 'enriched.js must map kept for self to 3');
  });
});

