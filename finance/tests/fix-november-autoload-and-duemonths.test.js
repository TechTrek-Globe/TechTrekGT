import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildStructuredWriteStatements,
  readStructuredBudget,
  ensureStructuredFinanceTables
} from '../functions/utils/structuredBudgetStore.js';
import { calculateRunningBalanceAsOf } from '../src/utils/ledgerEngine.js';
import { processSpreadsheetImport } from '../src/utils/spreadsheet.js';
import { isBillDueInMonth } from '../src/utils/paydayUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  return {
    prepare(sql) {
      let boundParams = [];
      return {
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          const row = db.prepare(sql).get(...boundParams);
          return row || null;
        },
        async all() {
          const results = db.prepare(sql).all(...boundParams);
          return { results };
        },
        async run() {
          const info = db.prepare(sql).run(...boundParams);
          return { success: true, meta: { changes: info.changes } };
        }
      };
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }
  };
}

describe('November Auto-Load & D1 Bill dueMonths Preservation', () => {
  test('D1 structured round-trip preserves bill.dueMonths for non-monthly bills', async () => {
    const mockDb = createMockD1();
    await ensureStructuredFinanceTables(mockDb);

    const payload = {
      accounts: [{ id: 'acc-mortgage', name: 'Mortgage checking', startingBalance: 5000 }],
      people: [],
      bills: [
        {
          id: 'bill-semi',
          accountId: 'acc-mortgage',
          name: 'Property Escrow Semi-Annual',
          amount: 1200,
          period: 'Semi-Annual',
          dueDay: 10,
          dueMonths: [5, 11],
          isArchived: false
        },
        {
          id: 'bill-custom',
          accountId: 'acc-mortgage',
          name: 'Year-End Insurance',
          amount: 450,
          period: 'Custom',
          dueDay: 15,
          dueMonths: [11, 12],
          isArchived: false
        }
      ]
    };

    const stmts = buildStructuredWriteStatements(mockDb, 'ledger-1', payload, 500, Date.now());
    await mockDb.batch(stmts);

    const restored = await readStructuredBudget(mockDb, 'ledger-1');
    assert.equal(restored.ok, true);
    assert.equal(restored.budget.bills.length, 2);

    const semi = restored.budget.bills.find(b => b.id === 'bill-semi');
    const custom = restored.budget.bills.find(b => b.id === 'bill-custom');
    assert.deepEqual(semi.dueMonths, [5, 11]);
    assert.deepEqual(custom.dueMonths, [11, 12]);
    assert.equal(isBillDueInMonth(semi, 10, true), true); // November (0-indexed 10)
    assert.equal(isBillDueInMonth(semi, 11, true), false); // December (0-indexed 11)
    assert.equal(isBillDueInMonth(custom, 10, true), true);
    assert.equal(isBillDueInMonth(custom, 11, true), true);
  });

  test('Clearing a November cell to 0 suppresses only November while December projects normally', () => {
    const metadataState = {
      accounts: [
        {
          id: 'acc-mortgage',
          name: 'Mortgage checking',
          startingBalance: 5000,
          extraStartingBalance: 0,
          startDate: '2026-10-01',
          balanceAsOfDate: '2026-10-01',
          enableExtraSavings: false,
          ledgerMode: 'projected'
        }
      ],
      people: [
        {
          id: 'p-1',
          name: 'Earner',
          payFrequency: 'monthly',
          payDay1: 15,
          netPerPay: 3000,
          accountAllocations: { 'acc-mortgage': 3000 }
        }
      ],
      bills: [
        {
          id: 'b-mort',
          accountId: 'acc-mortgage',
          name: 'Mortgage',
          amount: 2000,
          period: 'Monthly',
          dueDay: 1,
          isArchived: false
        }
      ],
      fundingGoals: [
        {
          id: 'g-1',
          contributorId: 'p-1',
          accountId: 'acc-mortgage',
          amountPerPay: 3000
        }
      ]
    };

    // Simulate user deleting/clearing November bill and credit cells (stored as 0)
    const dailyMatrix = {
      'acc-mortgage_2026-11_1_bill_b-mort': 0,
      'acc-mortgage_2026-11_15_credit_p-1': 0
    };

    // End of Oct: 5000 + 3000 (Oct 15) - 2000 (Oct 1) = 6000
    const octEnd = calculateRunningBalanceAsOf({
      targetAccountId: 'acc-mortgage',
      targetDate: '2026-10-31',
      metadataState,
      dailyMatrix,
      todayStr: '2026-11-19'
    });
    assert.equal(octEnd, 6000);

    // End of Nov: November bill & credit were cleared to 0, so balance remains 6000
    const novEnd = calculateRunningBalanceAsOf({
      targetAccountId: 'acc-mortgage',
      targetDate: '2026-11-30',
      metadataState,
      dailyMatrix,
      todayStr: '2026-11-19'
    });
    assert.equal(novEnd, 6000);

    // End of Dec: December is unaffected -> 6000 - 2000 (Dec 1) + 3000 (Dec 15) = 7000
    const decEnd = calculateRunningBalanceAsOf({
      targetAccountId: 'acc-mortgage',
      targetDate: '2026-12-31',
      metadataState,
      dailyMatrix,
      todayStr: '2026-11-19'
    });
    assert.equal(decEnd, 7000);
  });

  test('null dailyMatrix cell does not suppress bill projection in calculateRunningBalanceAsOf', () => {
    const metadataState = {
      accounts: [
        {
          id: 'acc-mortgage',
          name: 'Mortgage checking',
          startingBalance: 5000,
          extraStartingBalance: 0,
          startDate: '2026-11-01',
          balanceAsOfDate: '2026-11-01',
          enableExtraSavings: false,
          ledgerMode: 'projected'
        }
      ],
      people: [],
      bills: [
        {
          id: 'b-mort',
          accountId: 'acc-mortgage',
          name: 'Mortgage',
          amount: 2000,
          period: 'Monthly',
          dueDay: 1,
          isArchived: false
        }
      ]
    };

    const novEnd = calculateRunningBalanceAsOf({
      targetAccountId: 'acc-mortgage',
      targetDate: '2026-11-30',
      metadataState,
      dailyMatrix: { 'acc-mortgage_2026-11_1_bill_b-mort': null },
      todayStr: '2026-11-19'
    });
    assert.equal(novEnd, 3000);
  });

  test('Merge import prunes stale future importedLedgerRows so future months stay unlocked', () => {
    const metadataState = {
      accounts: [
        {
          id: 'acc-mortgage',
          name: 'Mortgage checking',
          startingBalance: 5000,
          extraStartingBalance: 0,
          startDate: '2026-10-01',
          ledgerMode: 'import',
          importedLedgerRows: {
            '2026-10-15': { regEnding: 5000, extraEnding: 0, totalEnding: 5000 },
            '2099-06-06': { regEnding: 9999, extraEnding: 0, totalEnding: 9999 }
          }
        }
      ],
      people: [],
      bills: []
    };

    const res = processSpreadsheetImport({
      namespaces: { transactions: true },
      strategies: { transactions: 'merge' },
      data: {
        targetAccountId: 'acc-mortgage',
        transactions: [
          { id: 't-oct', accountId: 'acc-mortgage', date: '2026-10-20', description: 'Utility', amount: -100 }
        ]
      },
      metadataState,
      dailyMatrix: {},
      transactions: []
    });

    assert.equal(res.success, true);
    const updatedAcc = res.metadataState.accounts.find(a => a.id === 'acc-mortgage');
    assert.ok(updatedAcc.importedLedgerRows['2026-10-15']);
    assert.equal(updatedAcc.importedLedgerRows['2099-06-06'], undefined);
  });
});
