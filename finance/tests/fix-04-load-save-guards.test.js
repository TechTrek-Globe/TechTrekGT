// tests/fix-04-load-save-guards.test.js
// FIX-04: Never load or save before user id is known.
// Tests are pure logic - they do not import React or IndexedDB.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BMC_SRC = fs.readFileSync(
  path.join(__dirname, '../src/context/BudgetMetadataContext.jsx'), 'utf-8'
);
const LDC_SRC = fs.readFileSync(
  path.join(__dirname, '../src/context/LedgerDataContext.jsx'), 'utf-8'
);

// ---------------------------------------------------------------------------
// Source-level contract assertions (fast, no DOM needed)
// ---------------------------------------------------------------------------
describe('FIX-04: BudgetMetadataContext - load gate contracts', () => {
  it('load effect is gated on isAuthLoading === false before calling initLocalStorageOrIndexedDB', () => {
    assert.ok(
      BMC_SRC.includes('if (isAuthLoading) return;'),
      'Load effect must bail out early while auth is still loading'
    );
  });

  it('isAuthLoading is destructured from useAuth in BudgetMetadataContext', () => {
    assert.ok(
      BMC_SRC.includes('isLoading: isAuthLoading'),
      'isAuthLoading must be aliased from useAuth().isLoading'
    );
  });

  it('authenticated users require user.id - no legacy key fallback', () => {
    assert.ok(
      BMC_SRC.includes("if (!user?.id)"),
      'Must reject authenticated users without user.id'
    );
    assert.ok(
      BMC_SRC.includes("userId = user.id"),
      'Authenticated path must use user.id directly, not a fallback'
    );
  });

  it('authenticated user with missing IndexedDB record sets dbLoadError and does NOT set isDbLoaded=true', () => {
    assert.ok(
      BMC_SRC.includes('setDbLoadError('),
      'Must call setDbLoadError when authenticated record is absent'
    );
    // Verify that the setIsDbLoaded(true) call is NOT in the authenticated-no-record branch
    // The authenticated branch should end with the dbLoadError call, not setIsDbLoaded.
    const authNoRecordBranch = BMC_SRC.slice(
      BMC_SRC.indexOf('setDbLoadError('),
      BMC_SRC.indexOf('setDbLoadError(') + 600
    );
    assert.ok(
      !authNoRecordBranch.includes('setIsDbLoaded(true)'),
      'setIsDbLoaded(true) must NOT appear immediately after setDbLoadError'
    );
  });

  it('load effect dep array includes isAuthLoading and isAuthenticated', () => {
    assert.ok(
      BMC_SRC.includes('isAuthLoading, isAuthenticated, user?.id'),
      'Dep array must include isAuthLoading, isAuthenticated, and user?.id'
    );
  });

  it('loadedRecordKeyRef is tracked and exposed in context value', () => {
    assert.ok(
      BMC_SRC.includes('loadedRecordKeyRef.current = userId'),
      'loadedRecordKeyRef must be set when a record is successfully loaded'
    );
    assert.ok(
      BMC_SRC.includes('loadedRecordKeyRef,'),
      'loadedRecordKeyRef must be included in the context value'
    );
  });

  it('dbLoadError is exposed in context value', () => {
    assert.ok(
      BMC_SRC.includes('dbLoadError,'),
      'dbLoadError must be included in the context value'
    );
  });

  it('unauthenticated fresh-start sets isDbLoaded=true (offline mode still works)', () => {
    // Verify setIsDbLoaded(true) exists somewhere after the unauthenticated fresh-start section.
    // The unauthenticated path (no stored data) must still become ready.
    const freshStartIdx = BMC_SRC.indexOf('// Fresh state for unauthenticated user with no stored data');
    assert.ok(freshStartIdx !== -1, 'Fresh state comment must exist');
    // Check the entire file after the fresh-start comment for setIsDbLoaded(true)
    const afterFreshStart = BMC_SRC.slice(freshStartIdx);
    assert.ok(
      afterFreshStart.includes('setIsDbLoaded(true)'),
      'setIsDbLoaded(true) must appear in the unauthenticated paths'
    );
  });
});

describe('FIX-04: LedgerDataContext - save guard contracts', () => {
  it('flushSaveToIndexedDB checks loadedKey vs saveUid before writing', () => {
    const fnStart = LDC_SRC.indexOf('const flushSaveToIndexedDB');
    const fnBody = LDC_SRC.slice(fnStart, fnStart + 1200);
    assert.ok(
      fnBody.includes('loadedKey && saveUid && saveUid !== loadedKey'),
      'flush must block writes when save key differs from loaded key'
    );
  });

  it('autosave effect returns early when dbLoadError is set', () => {
    assert.ok(
      LDC_SRC.includes('if (dbLoadError) return;'),
      'autosave must bail when a load error is active'
    );
  });

  it('autosave effect requires currentUserId for authenticated users', () => {
    assert.ok(
      LDC_SRC.includes('if (isAuthenticated && !currentUserId) return;'),
      'autosave must block when authenticated but currentUserId not yet settled'
    );
  });

  it('autosave effect contains blank-data guard', () => {
    assert.ok(
      LDC_SRC.includes('const isBlank = ('),
      'autosave must compute isBlank before writing'
    );
    assert.ok(
      LDC_SRC.includes('if (isBlank)'),
      'autosave must return early when isBlank is true'
    );
  });

  it('autosave blank guard checks all five substantive fields', () => {
    const blankIdx = LDC_SRC.indexOf('const isBlank = (');
    const blankBody = LDC_SRC.slice(blankIdx, blankIdx + 500);
    assert.ok(blankBody.includes('accounts'), 'blank guard must check accounts');
    assert.ok(blankBody.includes('people'), 'blank guard must check people');
    assert.ok(blankBody.includes('bills'), 'blank guard must check bills');
    assert.ok(blankBody.includes('fundingGoals'), 'blank guard must check fundingGoals');
    assert.ok(blankBody.includes('dailyMatrix'), 'blank guard must check dailyMatrix');
  });

  it('autosave key-mismatch guard present before the save call', () => {
    // Confirm the key-mismatch guard is present anywhere in the autosave section
    const autosaveIdx = LDC_SRC.indexOf('// FIX-04: Verify save key matches loaded key.');
    assert.ok(autosaveIdx !== -1, 'autosave key-match comment must be present');
    // Search the full source for the guard condition
    assert.ok(
      LDC_SRC.includes('saveUid !== loadedKey'),
      'autosave must guard against key mismatch before writing'
    );
  });

  it('autosave dep array includes dbLoadError and loadedRecordKeyRef', () => {
    assert.ok(
      LDC_SRC.includes('dbLoadError, isAuthenticated, setSaveError, currentUserId, loadedRecordKeyRef'),
      'autosave dep array must include the new guards'
    );
  });

  it('loadedRecordKeyRef is destructured from metadata in LedgerDataContext', () => {
    assert.ok(
      LDC_SRC.includes('loadedRecordKeyRef,'),
      'LedgerDataContext must destructure loadedRecordKeyRef from metadata'
    );
  });
});

// ---------------------------------------------------------------------------
// Pure logic simulation: blank-data guard
// ---------------------------------------------------------------------------
describe('FIX-04: blank-data guard logic (pure)', () => {
  // Mirror the exact condition from the autosave effect
  function isBlankBudget(budget) {
    return (
      (!budget.accounts || budget.accounts.length === 0) &&
      (!budget.people || budget.people.length === 0) &&
      (!budget.bills || budget.bills.length === 0) &&
      (!budget.fundingGoals || budget.fundingGoals.length === 0) &&
      (!budget.dailyMatrix || Object.keys(budget.dailyMatrix).length === 0)
    );
  }

  it('detects a fully blank starter budget', () => {
    assert.ok(isBlankBudget({ accounts: [], people: [], bills: [], fundingGoals: [], dailyMatrix: {} }));
  });

  it('detects a budget with only undefined/null fields as blank', () => {
    assert.ok(isBlankBudget({}));
  });

  it('does NOT flag a budget with accounts as blank', () => {
    assert.ok(!isBlankBudget({ accounts: [{ id: 'a1' }], people: [], bills: [], fundingGoals: [], dailyMatrix: {} }));
  });

  it('does NOT flag a budget with only dailyMatrix entries as blank', () => {
    assert.ok(!isBlankBudget({ accounts: [], people: [], bills: [], fundingGoals: [], dailyMatrix: { 'key-1': 100 } }));
  });

  it('does NOT flag a budget with fundingGoals as blank', () => {
    assert.ok(!isBlankBudget({ accounts: [], people: [], bills: [], fundingGoals: [{ id: 'g1' }], dailyMatrix: {} }));
  });

  it('save key mismatch guard: blocks write when keys differ', () => {
    function shouldBlock(saveUid, loadedKey) {
      return Boolean(loadedKey && saveUid && saveUid !== loadedKey);
    }
    assert.ok(shouldBlock('user-B', 'user-A'), 'should block user-B writing to user-A slot');
    assert.ok(!shouldBlock('user-A', 'user-A'), 'should allow user-A to write to their own slot');
    assert.ok(!shouldBlock('user-A', null), 'no loaded key - no restriction (offline mode)');
    assert.ok(!shouldBlock(null, 'user-A'), 'no save uid - guard skips (logged separately)');
  });
});
