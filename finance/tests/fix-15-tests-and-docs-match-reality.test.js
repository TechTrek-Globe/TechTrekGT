import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('FIX-15: Tests and docs match reality', () => {
  const PKG_PATH = path.resolve('package.json');
  const DOCS_DIR = path.resolve('docs');
  const TESTS_DIR = path.resolve('tests');

  it('verifies all FIX-01 through FIX-14 test files exist on disk', () => {
    const requiredFixTests = [
      'fix-01-logout-data-safety.test.js',
      'fix-02-no-auto-delete-credits.test.js',
      'fix-03-no-force-push.test.js',
      'fix-04-load-save-guards.test.js',
      'fix-05-desc-preservation.test.js',
      'fix-06-no-hardcoded-goals.test.js',
      'fix-07-stored-credits-display.test.js',
      'fix-08-ending-balance-formula.test.js',
      'fix-09-consistent-credit-rule.test.js',
      'fix-10-no-reg-ending-import.test.js',
      'fix-11-spreadsheet-parser-upgrade.test.js',
      'fix-12-security-headers-fail-closed.test.js',
      'fix-13-no-household-data.test.js',
      'fix-14-no-magic-number-bill-rewrites.test.js'
    ];

    for (const testFile of requiredFixTests) {
      const fullPath = path.join(TESTS_DIR, testFile);
      assert.equal(
        fs.existsSync(fullPath),
        true,
        `Expected test file ${testFile} to exist in tests directory`
      );
    }
  });

  it('verifies package.json test script runs all fix tests', () => {
    const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
    assert.equal(
      pkg.scripts.test.includes('tests/fix-*.test.js'),
      true,
      'package.json test script must run tests/fix-*.test.js'
    );
  });

  it('verifies 02_arch.md matches reality regarding xlsx version and security origins', () => {
    const arch = fs.readFileSync(path.join(DOCS_DIR, '02_arch.md'), 'utf-8');
    assert.equal(arch.includes('0.20.3'), true, '02_arch.md must state xlsx version 0.20.3');
    assert.equal(arch.includes('^0.18.5'), false, '02_arch.md must not reference legacy xlsx ^0.18.5');
    assert.equal(arch.includes('http://techtrekgt.com'), false, '02_arch.md must not include unencrypted http origin');
    assert.equal(arch.includes('Fail-Closed Security Headers'), true, '02_arch.md must document fail-closed security headers');
  });

  it('verifies 03_features.md and 04_state.md document FIX-11 through FIX-14', () => {
    const feat = fs.readFileSync(path.join(DOCS_DIR, '03_features.md'), 'utf-8');
    const state = fs.readFileSync(path.join(DOCS_DIR, '04_state.md'), 'utf-8');

    assert.equal(feat.includes('FIX-11'), true, '03_features.md must document FIX-11');
    assert.equal(feat.includes('FIX-12'), true, '03_features.md must document FIX-12');
    assert.equal(feat.includes('FIX-13'), true, '03_features.md must document FIX-13');
    assert.equal(feat.includes('FIX-14'), true, '03_features.md must document FIX-14');

    assert.equal(state.includes('FIX-11'), true, '04_state.md must document FIX-11');
    assert.equal(state.includes('FIX-12'), true, '04_state.md must document FIX-12');
    assert.equal(state.includes('FIX-13'), true, '04_state.md must document FIX-13');
    assert.equal(state.includes('FIX-14'), true, '04_state.md must document FIX-14');
  });
});
