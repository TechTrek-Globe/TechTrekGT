// tests/fix-03-no-force-push.test.js
// FIX-03: force:true must appear only in user-confirmed paths.
// All automatic cloud push calls must use standard CAS (no force flag).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC = path.join(__dirname, '../src');

function readSource(relPath) {
  return fs.readFileSync(path.join(SRC, relPath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Extract the function body from a named const arrow function in source.
// Scans for the first closing }, [deps]) pattern.
// ---------------------------------------------------------------------------
function extractFnBody(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  if (start === -1) return null;
  // Walk forward to find the matching close of useCallback(async () => { ... }, [...])
  // Simplified: grab up to 1500 chars which covers all functions here.
  return source.slice(start, start + 1500);
}

// ---------------------------------------------------------------------------
describe('FIX-03: force:true appears only in user-confirmed paths', () => {
  const source = readSource('context/LedgerDataContext.jsx');

  it('resolveConflictKeepLocal retains force:true (user-confirmed path)', () => {
    const body = extractFnBody(source, 'resolveConflictKeepLocal');
    assert.ok(body, 'resolveConflictKeepLocal must exist');
    assert.ok(
      body.includes('force: true'),
      'resolveConflictKeepLocal must still carry force:true - it is user-confirmed'
    );
  });

  it('pruneGhostMatrixDayKeys does not use force:true', () => {
    const body = extractFnBody(source, 'pruneGhostMatrixDayKeys');
    assert.ok(body, 'pruneGhostMatrixDayKeys must exist');
    assert.ok(!body.includes('force: true'), 'pruneGhostMatrixDayKeys must not use force:true');
  });

  it('restoreStandardFundingGoals does not use force:true', () => {
    const body = extractFnBody(source, 'restoreStandardFundingGoals');
    assert.ok(body, 'restoreStandardFundingGoals must exist');
    assert.ok(!body.includes('force: true'), 'restoreStandardFundingGoals must not use force:true');
  });

  it('clearFutureMatrixCredits does not use force:true', () => {
    const body = extractFnBody(source, 'clearFutureMatrixCredits');
    assert.ok(body, 'clearFutureMatrixCredits must exist');
    assert.ok(!body.includes('force: true'), 'clearFutureMatrixCredits must not use force:true');
  });

  it('restoreFromBackup does not use force:true', () => {
    const body = extractFnBody(source, 'restoreFromBackup');
    assert.ok(body, 'restoreFromBackup must exist');
    assert.ok(!body.includes('force: true'), 'restoreFromBackup must not use force:true');
  });

  it('no useEffect block uses force:true', () => {
    const effectPattern = /useEffect\s*\(\s*\(\)\s*=>/g;
    let match;
    while ((match = effectPattern.exec(source)) !== null) {
      const body = source.slice(match.index, match.index + 600);
      assert.ok(
        !body.includes('force: true'),
        `A useEffect at offset ${match.index} contains force:true`
      );
    }
  });

  it('total force:true occurrences in LedgerDataContext is exactly 1', () => {
    const occurrences = (source.match(/force: true/g) || []).length;
    assert.equal(
      occurrences, 1,
      `Expected exactly 1 force:true in LedgerDataContext.jsx, found ${occurrences}`
    );
  });
});

describe('FIX-03: api.js force handling is purely pass-through', () => {
  it('api.js only forwards the force flag from caller options - never injects it', () => {
    const apiSrc = readSource('utils/api.js');
    // The only acceptable force-related line is: requestBody.force = true;
    // which is gated inside `if (force)` where `const force = Boolean(options?.force)`.
    // Verify that pattern exists and is correctly guarded.
    assert.ok(
      apiSrc.includes('const force = Boolean(options?.force)'),
      'api.js must derive force from caller options via Boolean(options?.force)'
    );
    // Verify requestBody.force = true is ONLY inside an `if (force)` block
    const forceAssignIdx = apiSrc.indexOf('requestBody.force = true');
    assert.ok(forceAssignIdx !== -1, 'requestBody.force = true must exist as the pass-through');
    // Walk back up to 200 chars to find the if (force) guard
    const preceding = apiSrc.slice(Math.max(0, forceAssignIdx - 200), forceAssignIdx);
    assert.ok(
      preceding.includes('if (force)'),
      'requestBody.force = true must be inside an if (force) block'
    );
  });
});
