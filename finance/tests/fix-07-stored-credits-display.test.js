// tests/fix-07-stored-credits-display.test.js
// FIX-07: Stored past deposits must display.
// Every non-zero stored credit in the fixture displays its value; stored zeros display "$ -".

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { allocateEarnerCredit } from '../src/utils/ledgerEngine.js';
import { fmtMoney } from '../src/utils/formatters.js';

// Replicate fmtGrid from LedgerView.jsx
function fmtGrid(val) {
  if (val === undefined || val === null || isNaN(val) || val === 0) return '$ -';
  return fmtMoney(val);
}

// Fixture
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/incident-household.json'), 'utf-8')
);

describe('FIX-07: Stored past deposits must display in single account view', () => {
  it('2026-09-25 credit 1222.61 for Bob displays its exact stored value, not "$ -"', () => {
    const bob = fixture.people.find(p => p.id === 'person-bob');
    const alloc = allocateEarnerCredit(
      bob,
      'acc-mortgage-test',
      2026,
      8, // September (0-indexed)
      25,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: true }
    );

    assert.equal(alloc.earnerDeposit, 1222.61);
    assert.equal(alloc.earnerReg, 1222.61);
    assert.equal(alloc.earnerExtra, 0);
    assert.equal(alloc.source, 'manual');

    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$1,222.61');
    assert.notEqual(formatted, '$ -');
  });

  it('stored zero on 2026-09-15 for Alice displays "$ -"', () => {
    const alice = fixture.people.find(p => p.id === 'person-alice');
    const alloc = allocateEarnerCredit(
      alice,
      'acc-mortgage-test',
      2026,
      8,
      15,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: true }
    );

    assert.equal(alloc.earnerDeposit, 0);
    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$ -');
  });

  it('stored off-payday credit on 2026-09-29 for Alice (689.42) displays its value', () => {
    const alice = fixture.people.find(p => p.id === 'person-alice');
    const alloc = allocateEarnerCredit(
      alice,
      'acc-mortgage-test',
      2026,
      8,
      29,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: true }
    );

    assert.equal(alloc.earnerDeposit, 689.42);
    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$689.42');
  });

  it('stored credit on 2026-10-18 for Bob (1222.61) displays its value', () => {
    const bob = fixture.people.find(p => p.id === 'person-bob');
    const alloc = allocateEarnerCredit(
      bob,
      'acc-mortgage-test',
      2026,
      9, // October
      18,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: false }
    );

    assert.equal(alloc.earnerDeposit, 1222.61);
    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$1,222.61');
  });

  it('every non-zero credit in fixture dailyMatrix displays non-zero; every stored zero displays "$ -"', () => {
    const creditKeys = Object.keys(fixture.dailyMatrix).filter(k => k.includes('_credit_'));
    assert.ok(creditKeys.length > 0, 'Fixture must contain credit keys');

    creditKeys.forEach(k => {
      const match = k.match(/^(.+)_(\d{4}-\d{2})_(\d+)_credit_(.+)$/);
      if (!match) return;
      const [, accId, mKey, dayStr, personId] = match;
      const [yearStr, monthStr] = mKey.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1;
      const day = parseInt(dayStr, 10);
      const person = fixture.people.find(p => p.id === personId);
      const storedVal = fixture.dailyMatrix[k];

      const alloc = allocateEarnerCredit(person, accId, year, month, day, fixture, fixture.dailyMatrix);
      const formatted = fmtGrid(alloc.earnerDeposit);

      if (storedVal > 0) {
        assert.equal(alloc.earnerDeposit, storedVal, `Deposit for ${k} must match stored ${storedVal}`);
        assert.notEqual(formatted, '$ -', `Non-zero credit ${k} must not display as "$ -"`);
      } else {
        assert.equal(alloc.earnerDeposit, 0, `Zero credit for ${k} must return 0`);
        assert.equal(formatted, '$ -', `Zero credit ${k} must display as "$ -"`);
      }
    });
  });
});

describe('FIX-07: Stored credits display in "all" accounts view', () => {
  it('Bob 2026-09-25 credit (1222.61) displays 1222.61 in "all" view, not projected 1378', () => {
    const bob = fixture.people.find(p => p.id === 'person-bob');
    const alloc = allocateEarnerCredit(
      bob,
      'all',
      2026,
      8,
      25,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: false }
    );

    assert.equal(alloc.earnerDeposit, 1222.61);
    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$1,222.61');
  });

  it('Alice 2026-09-29 off-payday credit (689.42) displays in "all" view, not "$ -"', () => {
    const alice = fixture.people.find(p => p.id === 'person-alice');
    const alloc = allocateEarnerCredit(
      alice,
      'all',
      2026,
      8,
      29,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: false }
    );

    assert.equal(alloc.earnerDeposit, 689.42);
    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$689.42');
  });

  it('Bob 2026-10-18 off-payday credit (1222.61) displays in "all" view, not "$ -"', () => {
    const bob = fixture.people.find(p => p.id === 'person-bob');
    const alloc = allocateEarnerCredit(
      bob,
      'all',
      2026,
      9,
      18,
      fixture,
      fixture.dailyMatrix,
      { isLockedDay: false }
    );

    assert.equal(alloc.earnerDeposit, 1222.61);
    const formatted = fmtGrid(alloc.earnerDeposit);
    assert.equal(formatted, '$1,222.61');
  });
});
