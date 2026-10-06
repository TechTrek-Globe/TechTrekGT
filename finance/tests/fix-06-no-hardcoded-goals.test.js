// tests/fix-06-no-hardcoded-goals.test.js
// FIX-06: restoreStandardFundingGoals must not exist anywhere in the codebase.
// No code may reference person names, fixed goal amounts, or replace existing goals.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '../src');

function readSrc(relPath) {
  return fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
}

const LEDGER_SRC  = readSrc('context/LedgerDataContext.jsx');
const PANEL_SRC   = readSrc('components/settings/datasync/StorageResetSubPanel.jsx');

// ---------------------------------------------------------------------------
describe('FIX-06: restoreStandardFundingGoals is fully deleted', () => {
  it('function declaration is absent from LedgerDataContext', () => {
    assert.ok(
      !LEDGER_SRC.includes('restoreStandardFundingGoals'),
      'restoreStandardFundingGoals must not exist in LedgerDataContext'
    );
  });

  it('function is absent from the dispatch context value object', () => {
    assert.ok(
      !LEDGER_SRC.includes('restoreStandardFundingGoals'),
      'restoreStandardFundingGoals must not be exported on the context value'
    );
  });

  it('function is absent from the dispatch dep array', () => {
    // Already covered by the above check - this is a belt-and-suspenders read
    const dispatchDepsIdx = LEDGER_SRC.lastIndexOf('importSpreadsheetSelective,');
    const depBlock = LEDGER_SRC.slice(LEDGER_SRC.lastIndexOf('}), ['), dispatchDepsIdx + 50);
    assert.ok(
      !depBlock.includes('restoreStandardFundingGoals'),
      'restoreStandardFundingGoals must not be in the dep array'
    );
  });

  it('StorageResetSubPanel does not destructure restoreStandardFundingGoals', () => {
    assert.ok(
      !PANEL_SRC.includes('restoreStandardFundingGoals'),
      'restoreStandardFundingGoals must not be destructured in StorageResetSubPanel'
    );
  });

  it('Restore Standard Funding Goals UI card is absent from StorageResetSubPanel', () => {
    assert.ok(
      !PANEL_SRC.includes('Restore Standard Funding Goals'),
      '"Restore Standard Funding Goals" heading must not appear in StorageResetSubPanel'
    );
  });

  it('isRestoringGoals state is absent from StorageResetSubPanel', () => {
    assert.ok(
      !PANEL_SRC.includes('isRestoringGoals'),
      'isRestoringGoals state must be removed'
    );
  });

  it('restoreGoalsStatus state is absent from StorageResetSubPanel', () => {
    assert.ok(
      !PANEL_SRC.includes('restoreGoalsStatus'),
      'restoreGoalsStatus state must be removed'
    );
  });
});

describe('FIX-06: No hardcoded person names in LedgerDataContext', () => {
  it('does not reference "ronnie" (case-insensitive) in LedgerDataContext', () => {
    assert.ok(
      !LEDGER_SRC.toLowerCase().includes('ronnie'),
      'Person name "ronnie" must not appear in LedgerDataContext'
    );
  });

  it('does not reference "jon" as a person matcher in LedgerDataContext (pName check)', () => {
    // The function used pName.includes('jon') - confirm that pattern is gone
    assert.ok(
      !LEDGER_SRC.includes("pName.includes('jon')"),
      'pName.includes(\'jon\') must not appear in LedgerDataContext'
    );
  });

  it('does not reference "pName.includes" at all in LedgerDataContext', () => {
    assert.ok(
      !LEDGER_SRC.includes('pName.includes'),
      'pName.includes() person-name matching must not appear in LedgerDataContext'
    );
  });
});

describe('FIX-06: No hardcoded goal amounts in LedgerDataContext', () => {
  it('does not contain the hardcoded mortgage amount 1378', () => {
    assert.ok(
      !LEDGER_SRC.includes('1378'),
      'Hardcoded amount 1378 must not appear in LedgerDataContext'
    );
  });

  it('does not contain the hardcoded mortgage amount 689', () => {
    assert.ok(
      !LEDGER_SRC.includes('689'),
      'Hardcoded amount 689 must not appear in LedgerDataContext'
    );
  });

  it('does not contain the hardcoded bills amount 78.08', () => {
    assert.ok(
      !LEDGER_SRC.includes('78.08'),
      'Hardcoded amount 78.08 must not appear in LedgerDataContext'
    );
  });

  it('does not contain hardcoded goal names "Mortgage Contribution" in LedgerDataContext', () => {
    assert.ok(
      !LEDGER_SRC.includes('Mortgage Contribution'),
      '"Mortgage Contribution" goal name must not appear in LedgerDataContext'
    );
  });

  it('does not contain hardcoded goal names "Bills Checking" in LedgerDataContext', () => {
    assert.ok(
      !LEDGER_SRC.includes('Bills Checking Base') && !LEDGER_SRC.includes('Bills Checking Buffer'),
      'Bills Checking goal names must not appear in LedgerDataContext'
    );
  });
});

describe('FIX-06: No action replaces existing goals without explicit user action', () => {
  // Verify setFundingGoals is only called from user-triggered paths (not from auto-effects)
  // The function that called it (restoreStandardFundingGoals) is gone, so this is a net win.
  // Also confirm the function did not get renamed and hidden.
  it('no function ending in "FundingGoals" exists in LedgerDataContext except setFundingGoals/addFundingGoal/updateFundingGoal/deleteFundingGoal', () => {
    const fnMatches = LEDGER_SRC.match(/\b\w+FundingGoals?\b/g) || [];
    const allowed = new Set(['setFundingGoals', 'addFundingGoal', 'updateFundingGoal', 'deleteFundingGoal', 'fundingGoals', 'getFundingGoals']);
    const unexpected = fnMatches.filter(m => !allowed.has(m));
    assert.deepEqual(unexpected, [], `Unexpected FundingGoal references: ${unexpected.join(', ')}`);
  });

  it('standardGoals array construction is absent from LedgerDataContext', () => {
    assert.ok(
      !LEDGER_SRC.includes('standardGoals'),
      'standardGoals array must not exist in LedgerDataContext'
    );
  });
});
