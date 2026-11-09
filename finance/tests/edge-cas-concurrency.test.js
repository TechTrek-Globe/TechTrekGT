import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { createMockD1 } from './helpers/mockD1.js';
import { createMockKV } from './helpers/mockKV.js';
import { createToken } from '../functions/utils/auth.js';

describe('Cloud Vault CAS Concurrency & Integrity Edge Tests', () => {
  let db;
  let env;
  let testUserId;
  let validAuthCookie;
  let validCsrfToken;

  const JWT_SECRET = 'cas-test-jwt-secret-minimum-32-chars-long!';

  beforeEach(async () => {
    db = createMockD1();
    env = {
      DB: db,
      GATEWAY_KV: createMockKV(),
      USER_CACHE: createMockKV(),
      RATE_LIMIT_KV: createMockKV(),
      JWT_SECRET,
      SYNC_UNLOCK_CODE: 'UNLOCK123',
      ENVIRONMENT: 'development'
    };

    testUserId = 'usr_cas_tester_1';
    // Seed user in DB
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, status, role, token_version, email_verified)
       VALUES (?, ?, 'hash', 'Test User', 'Active', 'user', 1, 1)`
    ).bind(testUserId, 'cas.tester@example.com').run();

    validCsrfToken = 'csrf-token-1234567890';
    const { token: jwt } = await createToken({ userId: testUserId, tv: 1 }, JWT_SECRET, 3600);
    validAuthCookie = `auth_token=${jwt}; csrf_token=${validCsrfToken}`;
  });

  function makeBackupRequest(body) {
    return new Request('http://localhost:3000/finance/api/sync/backup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': validAuthCookie,
        'X-CSRF-Token': validCsrfToken,
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify(body)
    });
  }

  it('successfully persists backup payload when no prior backup exists', async () => {
    const payload = {
      schemaVersion: 8,
      accounts: [
        { id: 'acc_1', name: 'Checking', type: 'checking', startingBalance: 500 }
      ],
      bills: [],
      dailyMatrix: {}
    };

    const req = makeBackupRequest({ budget: payload, baseVersion: 0 });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify row in user_backups
    const stored = await db.prepare('SELECT * FROM user_backups WHERE id = ?').bind(testUserId).first();
    expect(stored).not.toBeNull();
    expect(Number(stored.data_byte_length)).toBeGreaterThan(0);
  });

  it('rejects stale backup with HTTP 409 SYNC_CONFLICT when baseVersion is older than storedVersion', async () => {
    // 1. Initial backup at version 1000
    const initialPayload = { schemaVersion: 8, accounts: [], bills: [] };
    const initialReq = makeBackupRequest({ budget: initialPayload, baseVersion: 1000, manual: true });
    const initRes = await worker.fetch(initialReq, env, {});
    expect(initRes.status).toBe(200);

    // Update updated_at_ms to 2000
    await db.prepare('UPDATE user_backups SET updated_at_ms = 2000 WHERE id = ?').bind(testUserId).run();

    // 2. Concurrent client tries to save with stale baseVersion: 1500
    const stalePayload = { schemaVersion: 8, accounts: [{ id: 'acc_stale', name: 'Stale' }], bills: [] };
    const staleReq = makeBackupRequest({ budget: stalePayload, baseVersion: 1500, manual: true });
    const staleRes = await worker.fetch(staleReq, env, {});

    expect(staleRes.status).toBe(409);
    const staleBody = await staleRes.json();
    expect(staleBody.conflict).toBe(true);
    expect(staleBody.code).toBe('SYNC_CONFLICT');
    expect(staleBody.serverVersion).toBe(2000);
  });

  it('allows overwrite when force: true is provided despite older baseVersion', async () => {
    await db.prepare('UPDATE user_backups SET updated_at_ms = 5000 WHERE id = ?').bind(testUserId).run();

    const forcePayload = { schemaVersion: 8, accounts: [{ id: 'acc_forced', name: 'Forced' }] };
    const forceReq = makeBackupRequest({ budget: forcePayload, baseVersion: 1000, force: true });
    const forceRes = await worker.fetch(forceReq, env, {});

    expect(forceRes.status).toBe(200);
    const body = await forceRes.json();
    expect(body.success).toBe(true);
  });

  it('rejects suspicious shrink (<10% of stored payload size) with HTTP 409 SYNC_SUSPICIOUS', async () => {
    // Seed a 5KB stored backup
    const largeAccounts = Array.from({ length: 50 }, (_, i) => ({
      id: `acc_${i}`,
      name: `Account Name Number ${i}`,
      type: 'checking',
      startingBalance: 1000 + i
    }));
    const largePayload = { schemaVersion: 8, accounts: largeAccounts };
    const largeReq = makeBackupRequest({ budget: largePayload, force: true });
    await worker.fetch(largeReq, env, {});

    const storedRow = await db.prepare('SELECT data_byte_length FROM user_backups WHERE id = ?').bind(testUserId).first();
    const storedBytes = Number(storedRow.data_byte_length);
    expect(storedBytes).toBeGreaterThan(2000);

    // Incoming tiny payload (less than 10% of 2000 bytes)
    const tinyPayload = { schemaVersion: 8, accounts: [] };
    const tinyReq = makeBackupRequest({ budget: tinyPayload, baseVersion: 10000000000000, force: false });
    const tinyRes = await worker.fetch(tinyReq, env, {});
    const tinyBody = await tinyRes.json();
    expect(tinyRes.status).toBe(409);
    expect(tinyBody.suspicious).toBe(true);
    expect(tinyBody.code).toBe('SYNC_SUSPICIOUS');
  });

  it('accurately tracks UTF-8 multi-byte characters via TextEncoder length', async () => {
    const unicodePayload = {
      schemaVersion: 8,
      accounts: [
        { id: 'acc_uni', name: 'José Ñuñez 💰 Café ☕' }
      ]
    };

    const req = makeBackupRequest({ budget: unicodePayload, force: true });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);

    const stored = await db.prepare('SELECT data, data_byte_length FROM user_backups WHERE id = ?').bind(testUserId).first();
    const expectedByteLength = new TextEncoder().encode(JSON.stringify(unicodePayload)).length;
    expect(Number(stored.data_byte_length)).toBe(expectedByteLength);
  });

  it('persists budget entities into structured relational tables and reconstructs identically on restore', async () => {
    const structuredPayload = {
      schemaVersion: 8,
      theme: 'dark',
      hideDashboardHeader: true,
      accounts: [
        { id: 'acc_chk', name: 'Primary Checking', type: 'checking', saveExtraMonthly: 150, enableExtraSavings: true, color: 'blue', notes: 'Main' }
      ],
      people: [
        { id: 'p_1', name: 'Alice', role: 'Primary', payFrequency: 'bi-weekly', payDay1: '15', payDay2: 'last', grossPerPay: 3000, netPerPay: 2200, color: 'purple', accountAllocations: { acc_chk: 100 } }
      ],
      bills: [
        { id: 'b_1', accountId: 'acc_chk', name: 'Electric', amount: 145.5, period: 'Monthly', dueDay: 12, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', splits: { p_1: 100 }, isArchived: false }
      ],
      transactions: [
        { id: 'tx_1', accountId: 'acc_chk', date: '2026-11-01', description: 'Power Co', amount: 145.5, type: 'expense', category: 'Utilities', status: 'cleared' }
      ],
      lineItems: [
        { billId: 'b_1', monthKey: '2026-11', actualAmount: 145.5, updatedAt: 1700000000000 }
      ],
      fundingGoals: [
        { id: 'fg_1', accountId: 'acc_chk', name: 'Emergency Fund', amount: 10000, amountPerPay: 250, frequency: 'bi-weekly' }
      ],
      loans: [
        { id: 'ln_1', name: 'Auto Loan', description: 'Car', principal: 20000, annualInterestRate: 4.5, termMonths: 60, monthlyPayment: 372.86, extraPayment: 50, startDate: '2025-01-01', isArchived: false }
      ],
      dailyMatrix: {
        'acc_chk-2026-11-12-debit': 145.5,
        'acc_chk-2026-11-12-debit_desc': 'Electric bill'
      }
    };

    const req = makeBackupRequest({ budget: structuredPayload, baseVersion: 0, force: true });
    const res = await worker.fetch(req, env, {});
    expect(res.status).toBe(200);

    // Verify discrete relational rows exist in D1 tables
    const accRow = await db.prepare('SELECT * FROM finance_accounts WHERE ledger_id = ? AND id = ?').bind(testUserId, 'acc_chk').first();
    expect(accRow).not.toBeNull();
    expect(accRow.name).toBe('Primary Checking');

    const billRow = await db.prepare('SELECT * FROM finance_bills WHERE ledger_id = ? AND id = ?').bind(testUserId, 'b_1').first();
    expect(billRow).not.toBeNull();
    expect(Number(billRow.amount)).toBe(145.5);

    const txRow = await db.prepare('SELECT * FROM finance_transactions WHERE ledger_id = ? AND id = ?').bind(testUserId, 'tx_1').first();
    expect(txRow).not.toBeNull();
    expect(txRow.description).toBe('Power Co');

    const matrixRows = await db.prepare('SELECT * FROM finance_daily_matrix WHERE ledger_id = ?').bind(testUserId).all();
    expect(matrixRows.results.length).toBe(2);

    // Verify GET /finance/api/sync/restore reconstructs the exact payload from structured tables
    const restoreReq = new Request('http://localhost:3000/finance/api/sync/restore', {
      method: 'GET',
      headers: {
        'Cookie': validAuthCookie,
        'Origin': 'http://localhost:3000'
      }
    });
    const restoreRes = await worker.fetch(restoreReq, env, {});
    expect(restoreRes.status).toBe(200);
    const restoreBody = await restoreRes.json();
    expect(restoreBody.budget).toEqual(structuredPayload);
  });
});
