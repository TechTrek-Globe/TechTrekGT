import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSaleMetrics } from '../functions/utils/auction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MED-001 / INT-001: Inline Grid Editing for Sales Ledger & Data Tables', () => {
  const cellComponentPath = path.resolve(__dirname, '../src/components/ui/InlineEditableCell.jsx');
  const salesLogViewPath = path.resolve(__dirname, '../src/components/SalesLogView.jsx');
  const userSettingsPath = path.resolve(__dirname, '../src/utils/userSettings.js');

  test('InlineEditableCell component file exists and exports InlineEditableCell', () => {
    assert.ok(fs.existsSync(cellComponentPath), 'src/components/ui/InlineEditableCell.jsx must exist');
    const content = fs.readFileSync(cellComponentPath, 'utf8');
    assert.ok(content.includes('export function InlineEditableCell('), 'Must export InlineEditableCell');
  });

  test('InlineEditableCell supports double-click, Enter activation, Tab commit, and Escape cancellation', () => {
    const content = fs.readFileSync(cellComponentPath, 'utf8');
    assert.ok(content.includes('onDoubleClick={handleStartEditing}'), 'Must activate on double-click');
    assert.ok(content.includes('e.key === \'Enter\''), 'Must handle Enter key');
    assert.ok(content.includes('e.key === \'Escape\''), 'Must handle Escape key to cancel');
    assert.ok(content.includes('e.key === \'Tab\''), 'Must handle Tab key to save and advance');
  });

  test('InlineEditableCell enforces accessible gridcell roles and aria-labels derived from column headers', () => {
    const content = fs.readFileSync(cellComponentPath, 'utf8');
    assert.ok(content.includes('role="gridcell"'), 'Must specify role="gridcell"');
    assert.ok(content.includes('tabIndex={disabled || isEditing ? -1 : 0}'), 'Must support keyboard focus via tabIndex');
    assert.ok(content.includes('aria-label={computedAriaLabel}'), 'Cell must specify aria-label');
    assert.ok(content.includes('aria-label={ariaLabel || `Edit ${colHeader}`}'), 'Input must specify aria-label derived from column header');
  });

  test('InlineEditableCell displays subtle loading indicator while save request is inflight', () => {
    const content = fs.readFileSync(cellComponentPath, 'utf8');
    assert.ok(content.includes('Loader2'), 'Must render Loader2 spinner icon');
    assert.ok(content.includes('animate-spin'), 'Spinner must animate during inflight requests');
    assert.ok(content.includes('isSaving'), 'Must support isSaving prop');
  });

  test('InlineEditableCell applies standard non-negative numeric validation before committing save', () => {
    const content = fs.readFileSync(cellComponentPath, 'utf8');
    assert.ok(content.includes('min != null && numVal < min'), 'Must reject values below minimum');
    assert.ok(content.includes('isNaN(numVal) || !isFinite(numVal)'), 'Must reject NaN and non-finite values');
    assert.ok(content.includes('min = 0'), 'Default minimum must be non-negative (0)');
  });

  test('InlineEditableCell disables inline editing on mobile viewports (<640px) and falls back to modal', () => {
    const content = fs.readFileSync(cellComponentPath, 'utf8');
    assert.ok(content.includes('window.innerWidth < 640'), 'Must check mobile viewport width threshold (640px)');
    assert.ok(content.includes('onMobileFallback'), 'Must support onMobileFallback callback');
  });

  test('DEFAULT_SALES_COLUMNS in userSettings.js includes actual_shipping_cost column', () => {
    const content = fs.readFileSync(userSettingsPath, 'utf8');
    assert.ok(content.includes('key: \'gross_sale_price\''), 'Must include gross_sale_price column');
    assert.ok(content.includes('key: \'actual_shipping_cost\''), 'Must include actual_shipping_cost column');
  });

  test('SalesLogView integrates InlineEditableCell for gross_sale_price and actual_shipping_cost', () => {
    const content = fs.readFileSync(salesLogViewPath, 'utf8');
    assert.ok(content.includes('import { InlineEditableCell } from \'./ui/InlineEditableCell\';'), 'Must import InlineEditableCell');
    assert.ok(content.includes('handleInlineSaleUpdate(sale.id, \'gross_sale_price\', newVal)'), 'Must bind gross_sale_price update');
    assert.ok(content.includes('handleInlineSaleUpdate(sale.id, \'actual_shipping_cost\', newVal)'), 'Must bind actual_shipping_cost update');
    assert.ok(content.includes('savingCellMap'), 'Must track in-flight saving state for cells');
  });

  test('SalesLogView optimistic UI updates calculate metrics and summary profit automatically', () => {
    const content = fs.readFileSync(salesLogViewPath, 'utf8');
    assert.ok(content.includes('computeSaleMetrics'), 'Must import and use computeSaleMetrics for optimistic recalculation');
    assert.ok(content.includes('prevSales'), 'Must preserve previous sales snapshot for rollback');
    assert.ok(content.includes('prevSummary'), 'Must preserve previous summary snapshot for rollback');

    // Verify regression check: computeSaleMetrics updates profit when gross price or shipping changes
    const baseSale = {
      gross_sale_price: 100,
      buyer_shipping_paid: 0,
      actual_shipping_cost: 10,
      platform_fee_pct: 0.10,
      platform_flat_fee: 0.30,
      payment_processing_amt: 0,
      promoted_listing_fee: 0,
      true_total_cost: 40
    };

    const initialMetrics = computeSaleMetrics(baseSale);
    assert.equal(initialMetrics.net_proceeds, 79.70); // 100 - 10 (ship) - 10.30 (fees) = 79.70
    assert.equal(initialMetrics.net_profit, 39.70); // 79.70 - 40 = 39.70

    // When gross sale price increases to 120
    const priceUpdated = { ...baseSale, gross_sale_price: 120 };
    const priceUpdatedMetrics = computeSaleMetrics(priceUpdated);
    assert.equal(priceUpdatedMetrics.net_proceeds, 97.70); // 120 - 10 - 12.30 = 97.70
    assert.equal(priceUpdatedMetrics.net_profit, 57.70); // 97.70 - 40 = 57.70
    assert.ok(priceUpdatedMetrics.net_profit > initialMetrics.net_profit, 'Profit must increase when gross price increases');

    // When shipping cost increases to 15
    const shippingUpdated = { ...baseSale, actual_shipping_cost: 15 };
    const shippingUpdatedMetrics = computeSaleMetrics(shippingUpdated);
    assert.equal(shippingUpdatedMetrics.net_proceeds, 74.70); // 100 - 15 - 10.30 = 74.70
    assert.equal(shippingUpdatedMetrics.net_profit, 34.70); // 74.70 - 40 = 34.70
    assert.ok(shippingUpdatedMetrics.net_profit < initialMetrics.net_profit, 'Profit must decrease when shipping cost increases');
  });
});
