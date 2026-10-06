// tests/fix-10-no-reg-ending-import.test.js
// FIX-10: Bank import must not write ending balances
// - In spreadsheet.js processSpreadsheetImport, stop writing reg_ending cells. Store bank running balances only in importedLedgerRows (comparison data). Do not remove existing reg_ending cells; FIX-08 already ignores them for calculation.
// Accept: importing the fixture creates no new reg_ending keys; existing keys are untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { processSpreadsheetImport } from '../src/utils/spreadsheet.js';

// Load fixture
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/incident-household.json'), 'utf-8')
);

describe('FIX-10: Bank import must not write ending balances', () => {
  it('importing the fixture creates no new reg_ending keys; existing keys are untouched', () => {
    const initialMatrix = { ...fixture.dailyMatrix };
    const initialRegEndingKeys = Object.keys(initialMatrix).filter(k => k.endsWith('_reg_ending'));

    // Verify fixture has expected existing reg_ending keys
    assert.ok(initialRegEndingKeys.length > 0, 'Fixture has existing reg_ending keys');
    assert.equal(initialMatrix['acc-mortgage-test_2026-09_29_reg_ending'], 308.65);
    assert.equal(initialMatrix['acc-mortgage-test_2026-09_30_reg_ending'], 393.65);

    const mortgageAcc = fixture.accounts.find(a => a.id === 'acc-mortgage-test');

    const result = processSpreadsheetImport({
      namespaces: {
        accounts: true,
        people: true,
        bills: true,
        transactions: true
      },
      strategies: {
        accounts: 'merge',
        people: 'merge',
        bills: 'merge',
        transactions: 'merge'
      },
      data: {
        accounts: fixture.accounts,
        people: fixture.people,
        bills: fixture.bills,
        transactions: fixture.transactions,
        targetAccountId: mortgageAcc.id,
        importedLedgerRows: mortgageAcc.importedLedgerRows
      },
      metadataState: {
        accounts: fixture.accounts,
        people: fixture.people,
        bills: fixture.bills,
        fundingGoals: fixture.fundingGoals
      },
      lineItems: fixture.lineItems || [],
      dailyMatrix: initialMatrix,
      transactions: [],
      dryRun: false
    });

    assert.ok(result.success, `Import must succeed: ${result.error || ''}`);

    const resultingMatrix = result.dailyMatrix || {};
    const resultingRegEndingKeys = Object.keys(resultingMatrix).filter(k => k.endsWith('_reg_ending'));

    // 1. Existing reg_ending keys are untouched
    assert.equal(
      resultingMatrix['acc-mortgage-test_2026-09_29_reg_ending'],
      308.65,
      'Existing 9/29 reg_ending key must remain untouched'
    );
    assert.equal(
      resultingMatrix['acc-mortgage-test_2026-09_30_reg_ending'],
      393.65,
      'Existing 9/30 reg_ending key must remain untouched'
    );

    // 2. No NEW reg_ending keys are created
    // Dates in importedLedgerRows that had no reg_ending in fixture: 2026-09-01, 2026-09-15, 2027-01-15, 2027-06-06
    assert.equal(
      resultingMatrix['acc-mortgage-test_2026-09_1_reg_ending'],
      undefined,
      'Must NOT create reg_ending for 2026-09-01'
    );
    assert.equal(
      resultingMatrix['acc-mortgage-test_2026-09_15_reg_ending'],
      undefined,
      'Must NOT create reg_ending for 2026-09-15'
    );
    assert.equal(
      resultingMatrix['acc-mortgage-test_2027-01_15_reg_ending'],
      undefined,
      'Must NOT create reg_ending for 2027-01-15'
    );
    assert.equal(
      resultingMatrix['acc-mortgage-test_2027-06_6_reg_ending'],
      undefined,
      'Must NOT create reg_ending for 2027-06-06'
    );

    // The set of reg_ending keys must be strictly identical to initial
    assert.deepEqual(
      resultingRegEndingKeys.sort(),
      initialRegEndingKeys.sort(),
      'No new reg_ending keys created; existing keys preserved exactly'
    );

    // 3. Stored bank running balances are stored in importedLedgerRows for comparison
    const updatedMortgageAcc = result.metadataState.accounts.find(a => a.id === mortgageAcc.id);
    assert.ok(updatedMortgageAcc.importedLedgerRows, 'importedLedgerRows exists on account');
    assert.equal(updatedMortgageAcc.importedLedgerRows['2026-09-01'].regEnding, 205.00);
    assert.equal(updatedMortgageAcc.importedLedgerRows['2026-09-15'].regEnding, 893.00);
    assert.equal(updatedMortgageAcc.importedLedgerRows['2026-09-29'].regEnding, 308.65);
    assert.equal(updatedMortgageAcc.importedLedgerRows['2026-09-30'].regEnding, 393.65);
    assert.equal(updatedMortgageAcc.importedLedgerRows['2027-01-15'].regEnding, 1200.00);
    assert.equal(updatedMortgageAcc.importedLedgerRows['2027-06-06'].regEnding, 500.00);
  });

  it('importing transactions with running balances stores them in importedLedgerRows without writing reg_ending', () => {
    const testAcc = {
      id: 'acc-tx-test',
      name: 'TX Test Account',
      startingBalance: 500,
      balanceAsOfDate: '2026-10-01',
      startDate: '2026-10-01',
      enableExtraSavings: false,
      ledgerMode: 'project'
    };

    const txnsWithBalances = [
      {
        id: 'tx-1',
        date: '2026-10-02',
        amount: -50.00,
        balance: 450.00,
        accountId: 'acc-tx-test',
        description: 'Store Purchase'
      },
      {
        id: 'tx-2',
        date: '2026-10-03',
        amount: -100.00,
        balance: 350.00,
        accountId: 'acc-tx-test',
        description: 'Utility Bill'
      }
    ];

    const result = processSpreadsheetImport({
      namespaces: { transactions: true },
      strategies: { transactions: 'merge' },
      data: {
        transactions: txnsWithBalances,
        targetAccountId: 'acc-tx-test'
      },
      metadataState: {
        accounts: [testAcc],
        people: [],
        bills: []
      },
      lineItems: [],
      dailyMatrix: {},
      transactions: [],
      dryRun: false
    });

    assert.ok(result.success);

    // No reg_ending written in dailyMatrix
    assert.equal(result.dailyMatrix['acc-tx-test_2026-10_2_reg_ending'], undefined);
    assert.equal(result.dailyMatrix['acc-tx-test_2026-10_3_reg_ending'], undefined);

    const matrixKeys = Object.keys(result.dailyMatrix || {});
    assert.equal(
      matrixKeys.filter(k => k.includes('reg_ending')).length,
      0,
      'No reg_ending keys created from transaction balances'
    );

    // Stored in importedLedgerRows
    const updatedAcc = result.metadataState.accounts.find(a => a.id === 'acc-tx-test');
    assert.ok(updatedAcc.importedLedgerRows['2026-10-02']);
    assert.equal(updatedAcc.importedLedgerRows['2026-10-02'].regEnding, 450.00);
    assert.ok(updatedAcc.importedLedgerRows['2026-10-03']);
    assert.equal(updatedAcc.importedLedgerRows['2026-10-03'].regEnding, 350.00);
    assert.equal(updatedAcc.ledgerMode, 'import');
  });
});
