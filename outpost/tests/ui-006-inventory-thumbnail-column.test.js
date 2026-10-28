import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_COLUMNS as SETTINGS_COLUMNS } from '../src/utils/userSettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('UI-006: Inventory Thumbnail Column Configuration', async (t) => {
  const gridPath = path.resolve(__dirname, '../src/components/inventory/InventoryDataGrid.jsx');
  const rowPath = path.resolve(__dirname, '../src/components/inventory/InventoryGridRow.jsx');
  const tooltipPath = path.resolve(__dirname, '../src/components/inventory/ItemImageHoverTooltip.jsx');

  await t.test('userSettings.DEFAULT_COLUMNS has image column between actions and item_name', () => {
    const actionsIdx = SETTINGS_COLUMNS.findIndex(c => c.key === 'actions');
    const imageIdx = SETTINGS_COLUMNS.findIndex(c => c.key === 'image');
    const itemIdx = SETTINGS_COLUMNS.findIndex(c => c.key === 'item_name');

    assert.ok(actionsIdx !== -1, 'actions column must exist');
    assert.ok(imageIdx !== -1, 'image column must exist');
    assert.ok(itemIdx !== -1, 'item_name column must exist');
    assert.equal(imageIdx, actionsIdx + 1, 'image column must immediately follow actions');
    assert.equal(itemIdx, imageIdx + 1, 'item_name column must immediately follow image');

    const imageCol = SETTINGS_COLUMNS[imageIdx];
    assert.equal(imageCol.defaultVisible, true, 'image column should be visible by default');
    assert.equal(imageCol.minWidth, 44, 'image column minWidth should be 44');
    assert.equal(imageCol.defaultWidth, 44, 'image column defaultWidth should be 44');
  });

  await t.test('InventoryDataGrid.jsx defines image in DEFAULT_COLUMNS and handles sticky left offsets', () => {
    const gridContent = fs.readFileSync(gridPath, 'utf8');
    assert.ok(gridContent.includes("{ key: 'image', label: '', minWidth: 44 }"), 'Grid must include image column in DEFAULT_COLUMNS');
    assert.ok(gridContent.includes("key === 'image'"), 'Grid must check key === image in sticky logic');
    assert.ok(gridContent.includes("actionsWidth + (isImageVisible ? imageWidth : 0)"), 'Grid must calculate item_name sticky left offset including imageWidth');
  });

  await t.test('InventoryGridRow.jsx renders ItemThumbnailCell sticky between actions and item_name', () => {
    const rowContent = fs.readFileSync(rowPath, 'utf8');
    assert.ok(rowContent.includes('function ItemThumbnailCell('), 'InventoryGridRow must define ItemThumbnailCell');
    assert.ok(rowContent.includes('<ItemThumbnailCell'), 'InventoryGridRow must render ItemThumbnailCell');
    assert.ok(rowContent.includes('left: `${actionsWidth}px`'), 'image td must be sticky at actionsWidth');
    assert.ok(rowContent.includes('left: `${actionsWidth + (isImageVisible ? imageWidth : 0)}px`'), 'item_name td must be sticky at actionsWidth + imageWidth');
    assert.ok(rowContent.includes('resolveItemImage'), 'Must use resolveItemImage');
    assert.ok(rowContent.includes('PREVIEW_CACHE'), 'Must reference PREVIEW_CACHE');
  });

  await t.test('ItemImageHoverTooltip.jsx exports resolveItemImage and PREVIEW_CACHE', () => {
    const tooltipContent = fs.readFileSync(tooltipPath, 'utf8');
    assert.ok(tooltipContent.includes('export function resolveItemImage('), 'ItemImageHoverTooltip must export resolveItemImage');
    assert.ok(tooltipContent.includes('export function extractSafeAttributes('), 'ItemImageHoverTooltip must export extractSafeAttributes');
    assert.ok(tooltipContent.includes('export const PREVIEW_CACHE = new Map()'), 'ItemImageHoverTooltip must export PREVIEW_CACHE');
  });
});
