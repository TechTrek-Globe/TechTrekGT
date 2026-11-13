import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { round2, isValidMoney } from '../src/utils/formatters.js';
import { parseGenericFlat, matchCreditToEarner } from '../src/utils/importer.js';
import { enqueueDelta, clearDeltaQueue, getPendingDeltaOps } from '../src/utils/deltaQueue.js';
import {
  buildStructuredWriteStatements,
  readStructuredBudget,
  ensureStructuredFinanceTables
} from '../functions/utils/structuredBudgetStore.js';
import { calculateRunningBalanceAsOf } from '../src/utils/ledgerEngine.js';
import { onRequestPost as verifyEmailHandler } from '../functions/api/auth/verify-email.js';
import { ERROR_CODES, hmacHex } from '../functions/utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaSql = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');

function createMockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);
  return {
    _raw: db,
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

describe('Audit Remediation - Math, Formatters & Inputs', () => {
  test('round2 handles multi-dot, multi-minus, and currency strings safely', () => {
    assert.equal(round2('1.2.3'), 0);
    assert.equal(round2('100-50'), 0);
    assert.equal(round2('abc'), 0);
    assert.equal(round2('$1,234.56'), 1234.56);
    assert.equal(round2('-50.25'), -50.25);
    assert.equal(round2('12.5'), 12.5);
  });

  test('isValidMoney correctly validates clean and rejects malformed values', () => {
    assert.equal(isValidMoney('1.2.3'), false);
    assert.equal(isValidMoney('100-50'), false);
    assert.equal(isValidMoney('12-50'), false);
    assert.equal(isValidMoney('$1,234.56'), true);
    assert.equal(isValidMoney('-12.50'), true);
    assert.equal(isValidMoney('100'), true);
  });
});

describe('Audit Remediation - Importer & Parser Column Alignment', () => {
  test('parseGenericFlat aligns row cells correctly when headers have blank columns', () => {
    const csvContent = 'Date,,Amount,Description\n2026-03-01,blank_val,125.50,Test Grocery\n';
    const buffer = new TextEncoder().encode(csvContent).buffer;

    const result = parseGenericFlat(buffer, 'TestSheet');
    assert.deepEqual(result.headers, ['Date', 'Amount', 'Description']);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]['Date'], '2026-03-01');
    assert.equal(result.rows[0]['Amount'], '125.50');
    assert.equal(result.rows[0]['Description'], 'Test Grocery');
  });

  test('matchCreditToEarner standardizes on bi-weekly 26 / 12 monthly allocation math', () => {
    const people = [
      {
        id: 'p-biweekly',
        name: 'Biweekly Earner',
        payFrequency: 'bi-weekly',
        netPerPay: 1200
      }
    ];
    const accounts = [{ id: 'acc-1', name: 'Main Checking' }];
    const bills = [];

    // Net monthly = (1200 * 26) / 12 = 2600.00
    const matched = matchCreditToEarner({
      description: 'Payroll Direct Dep',
      amount: 2600.00,
      accounts,
      bills,
      people,
      targetAccountId: 'acc-1'
    });

    assert.ok(matched);
    assert.equal(matched.person.id, 'p-biweekly');
    assert.match(matched.reason, /Annualized Monthly Net/);
  });
});

describe('Audit Remediation - Delta Queue Key Deduplication', () => {
  test('keying by (ledgerId, key) allows upsert -> delete -> upsert last-write-wins', () => {
    clearDeltaQueue();

    enqueueDelta({
      op: 'upsert_matrix_cell',
      ledgerId: 'ledger-a',
      key: 'acc1_2026-03_10_other_amount',
      numValue: 50.00,
      strValue: null
    });

    enqueueDelta({
      op: 'delete_matrix_cell',
      ledgerId: 'ledger-a',
      key: 'acc1_2026-03_10_other_amount',
      numValue: null,
      strValue: null
    });

    let pending = getPendingDeltaOps();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].op, 'delete_matrix_cell');

    enqueueDelta({
      op: 'upsert_matrix_cell',
      ledgerId: 'ledger-a',
      key: 'acc1_2026-03_10_other_amount',
      numValue: 75.00,
      strValue: null
    });

    pending = getPendingDeltaOps();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].op, 'upsert_matrix_cell');
    assert.equal(pending[0].numValue, 75.00);

    clearDeltaQueue();
  });
});

describe('Audit Remediation - Loan Extra Keys Relational Persistence', () => {
  test('buildStructuredWriteStatements and readStructuredBudget preserve interestCompounding, paymentFrequency, and paymentType', async () => {
    const mockDb = createMockD1();
    await ensureStructuredFinanceTables(mockDb);

    const budgetPayload = {
      accounts: [{ id: 'acc-1', name: 'Main Account', startingBalance: 1000 }],
      people: [],
      bills: [],
      loans: [
        {
          id: 'loan-1',
          name: 'Auto Loan',
          principal: 15000,
          annualInterestRate: 4.5,
          termMonths: 48,
          monthlyPayment: 342.06,
          extraPayment: 50,
          startDate: '2026-01-01',
          interestCompounding: 'daily',
          paymentFrequency: 'bi-weekly',
          paymentType: 'amortizing'
        }
      ]
    };

    const stmts = buildStructuredWriteStatements(mockDb, 'test-ledger', budgetPayload, 1000, Date.now());
    await mockDb.batch(stmts);

    const result = await readStructuredBudget(mockDb, 'test-ledger');
    assert.ok(result.ok);
    assert.equal(result.budget.loans.length, 1);
    const loan = result.budget.loans[0];
    assert.equal(loan.name, 'Auto Loan');
    assert.equal(loan.interestCompounding, 'daily');
    assert.equal(loan.paymentFrequency, 'bi-weekly');
    assert.equal(loan.paymentType, 'amortizing');
  });
});

describe('Audit Remediation - Canonical Running Balance Calculator', () => {
  test('calculateRunningBalanceAsOf simulates running balance accurately and respects bounds', () => {
    const metadataState = {
      accounts: [
        {
          id: 'acc-op',
          name: 'Operating Account',
          startingBalance: 1000,
          extraStartingBalance: 200,
          startDate: '2026-01-01',
          balanceAsOfDate: '2026-01-01'
        }
      ],
      people: [],
      bills: [
        {
          id: 'bill-rent',
          name: 'Rent',
          amount: 500,
          accountId: 'acc-op',
          dueDay: 5,
          isArchived: false
        },
        {
          id: 'bill-archived',
          name: 'Old Bill',
          amount: 200,
          accountId: 'acc-op',
          dueDay: 5,
          isArchived: true
        }
      ],
      lineItems: []
    };

    const resultDetailed = calculateRunningBalanceAsOf({
      targetAccountId: 'acc-op',
      targetDate: '2026-01-10',
      metadataState,
      dailyMatrix: {},
      transactions: [],
      detailed: true
    });

    // 1000 start - 500 rent (archived bill ignored) = 500 reg ending + 200 extra = 700 totalEnd
    assert.equal(resultDetailed.regEnding, 500);
    assert.equal(resultDetailed.extraEnding, 200);
    assert.equal(resultDetailed.totalEnd, 700);

    const resultScalar = calculateRunningBalanceAsOf({
      targetAccountId: 'acc-op',
      targetDate: '2026-01-10',
      metadataState,
      dailyMatrix: {},
      transactions: [],
      detailed: false
    });
    assert.equal(resultScalar, 700);
  });
});

describe('Audit Remediation - verify-email.js Security Hardening', () => {
  const TEST_JWT = 'test-secret-at-least-32-bytes-long-super-secret';
  const TEST_HMAC = 'hmac-code-secret-at-least-32-bytes-long';

  test('rejects non-8-digit verification code with 400', async () => {
    const mockDb = createMockD1();
    const req = new Request('http://localhost/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '1234' })
    });

    const res = await verifyEmailHandler({
      request: req,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT, CODE_HMAC_SECRET: TEST_HMAC },
      requestId: 'req-test-1'
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, ERROR_CODES.VALIDATION_ERROR);
  });

  test('returns 403 ACCOUNT_SUSPENDED when target user is suspended', async () => {
    const mockDb = createMockD1();
    const code = '12345678';
    const codeHash = await hmacHex(code, TEST_HMAC);
    const exp = Date.now() + 60000;

    await mockDb._raw.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, email_verified, created_at)
       VALUES (?, ?, ?, ?, 'suspended', 0, datetime('now'))`
    ).run('usr-suspended', 'suspended@example.com', 'phash', 'Suspended User');

    const req = new Request('http://localhost/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, email: 'suspended@example.com' })
    });

    const res = await verifyEmailHandler({
      request: req,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT, CODE_HMAC_SECRET: TEST_HMAC },
      requestId: 'req-test-2'
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.code, ERROR_CODES.ACCOUNT_SUSPENDED);
  });

  test('does not enumerate non-existent user and returns generic error', async () => {
    const mockDb = createMockD1();
    const req = new Request('http://localhost/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '87654321', email: 'nonexistent@example.com' })
    });

    const res = await verifyEmailHandler({
      request: req,
      env: { DB: mockDb, JWT_SECRET: TEST_JWT, CODE_HMAC_SECRET: TEST_HMAC },
      requestId: 'req-test-3'
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'Invalid verification code or email address.');
  });
});
