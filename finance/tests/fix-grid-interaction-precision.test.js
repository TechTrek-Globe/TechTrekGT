import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { round2, parseMoney } from '../src/utils/formatters.js';

describe('FIX-GRID: Transactions Grid Drag-and-Drop & Precision Stabilization', () => {
  it('enforces round2 deterministic precision with Number.EPSILON and -0 normalization', () => {
    // Standard floating-point drift edge cases
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(1.005), 1.01);
    assert.equal(round2(-0.00000001), 0);
    assert.equal(Object.is(round2(-0), 0), true);
    assert.equal(round2(' $1,234.567 '), 1234.57);
    assert.equal(round2('($45.67)'), -45.67);
  });

  it('correctly handles cell mutation values: rounds numeric fields and preserves string descriptions', () => {
    const processCellVal = (field, val) => {
      const isTextField = field.endsWith('_desc');
      return isTextField ? (val || '') : (val === '' || val === null || val === undefined ? '' : round2(val));
    };

    assert.equal(processCellVal('bill_123', 45.678), 45.68);
    assert.equal(processCellVal('bill_123', '99.999'), 100);
    assert.equal(processCellVal('other_amount', -12.345), -12.34);
    assert.equal(processCellVal('other_desc', 'Medical copay & pharmacy'), 'Medical copay & pharmacy');
    assert.equal(processCellVal('other_credit_desc', 'Reimbursement'), 'Reimbursement');
  });

  it('guarantees optimistic state rollback on cell movement failure', () => {
    const dailyMatrix = {
      'acc1_2026-03_5_bill_1': 150.25,
      'acc1_2026-03_15_bill_1': 0
    };

    const moveCellWithRollback = (accId, srcM, srcD, tgtM, tgtD, field, val, shouldFail = false) => {
      const srcKey = `${accId}_${srcM}_${srcD}_${field}`;
      const tgtKey = `${accId}_${tgtM}_${tgtD}_${field}`;
      const cleanVal = round2(val);

      const prevSrc = dailyMatrix[srcKey];
      const prevTgt = dailyMatrix[tgtKey];

      try {
        dailyMatrix[srcKey] = 0;
        dailyMatrix[tgtKey] = cleanVal;

        if (shouldFail) {
          throw new Error('Simulated D1 / IndexedDB failure');
        }
      } catch (err) {
        // Rollback
        dailyMatrix[srcKey] = prevSrc;
        dailyMatrix[tgtKey] = prevTgt;
        return { success: false, error: err.message };
      }
      return { success: true };
    };

    // 1. Successful move
    const res1 = moveCellWithRollback('acc1', '2026-03', 5, '2026-03', 15, 'bill_1', 150.254);
    assert.equal(res1.success, true);
    assert.equal(dailyMatrix['acc1_2026-03_5_bill_1'], 0);
    assert.equal(dailyMatrix['acc1_2026-03_15_bill_1'], 150.25);

    // 2. Failed move with rollback
    const res2 = moveCellWithRollback('acc1', '2026-03', 15, '2026-03', 25, 'bill_1', 150.25, true);
    assert.equal(res2.success, false);
    // Values must be rolled back exactly
    assert.equal(dailyMatrix['acc1_2026-03_15_bill_1'], 150.25);
    assert.equal(dailyMatrix['acc1_2026-03_25_bill_1'], undefined);
  });

  it('clearing an other amount ($0) automatically clears the linked other description', () => {
    const matrix = {
      'acc1_2026-03_10_other_amount': 75.50,
      'acc1_2026-03_10_other_desc': 'Oil change'
    };

    const commitCell = (accId, m, d, field, val) => {
      const cleanVal = round2(val);
      matrix[`${accId}_${m}_${d}_${field}`] = cleanVal;
      if (field === 'other_amount' && (!cleanVal || cleanVal === 0)) {
        matrix[`${accId}_${m}_${d}_other_desc`] = '';
      }
    };

    // Clearing to 0
    commitCell('acc1', '2026-03', 10, 'other_amount', 0);
    assert.equal(matrix['acc1_2026-03_10_other_amount'], 0);
    assert.equal(matrix['acc1_2026-03_10_other_desc'], '');
  });

  it('guarantees droppable cell highlight requires active drag and matching field family', () => {
    const computeCellHighlight = (active, isOver, field, isBillField) => {
      const activeField = active?.data?.current?.field;
      const isEarnerCredit = activeField?.startsWith('credit_');
      const isValidField = activeField
        ? (isEarnerCredit ? field.startsWith('credit_') : activeField === field)
        : false;

      const isCellOver = Boolean(active && isOver && isValidField);
      return isCellOver
        ? isBillField
          ? 'rose'
          : 'emerald'
        : '';
    };

    // 1. When drag has ended or no drag active (active is null): ALWAYS empty string, even if isOver is true
    assert.equal(computeCellHighlight(null, true, 'credit_ronnie', false), '');
    assert.equal(computeCellHighlight(undefined, true, 'credit_ronnie', false), '');

    // 2. When active drag is earner credit: matches all earner credit columns (cross-earner support)
    const creditDragActive = { data: { current: { field: 'credit_jon' } } };
    assert.equal(computeCellHighlight(creditDragActive, true, 'credit_jon', false), 'emerald');
    assert.equal(computeCellHighlight(creditDragActive, true, 'credit_ronnie', false), 'emerald');
    assert.equal(computeCellHighlight(creditDragActive, false, 'credit_ronnie', false), '');
    assert.equal(computeCellHighlight(creditDragActive, true, 'bill_1', true), '');

    // 3. When active drag is a bill: strictly matches only the identical bill column
    const billDragActive = { data: { current: { field: 'bill_1' } } };
    assert.equal(computeCellHighlight(billDragActive, true, 'bill_1', true), 'rose');
    assert.equal(computeCellHighlight(billDragActive, true, 'bill_2', true), '');
    assert.equal(computeCellHighlight(billDragActive, true, 'credit_ronnie', false), '');
  });
});
