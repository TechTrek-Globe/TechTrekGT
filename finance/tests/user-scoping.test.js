import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { budgetRecordKey, getCurrentUserId } from '../src/utils/indexedDB.js';
import { pendingSyncKey } from '../src/utils/api.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

describe('CRIT-002: User-scoped storage keys', () => {
  test('budgetRecordKey scopes records by user id', () => {
    assert.strictEqual(budgetRecordKey('user-1'), 'current_budget:user-1');
    assert.strictEqual(budgetRecordKey('user-2'), 'current_budget:user-2');
    assert.notStrictEqual(budgetRecordKey('user-1'), budgetRecordKey('user-2'));
  });

  test('budgetRecordKey falls back to legacy key when no user id', () => {
    assert.strictEqual(budgetRecordKey(null), 'current_budget:legacy');
    assert.strictEqual(budgetRecordKey(undefined), 'current_budget:legacy');
    assert.strictEqual(budgetRecordKey(''), 'current_budget:legacy');
  });

  test('pendingSyncKey scopes the offline queue by user id', () => {
    assert.strictEqual(pendingSyncKey('user-1'), 'cf_pending_sync:user-1');
    assert.strictEqual(pendingSyncKey('user-2'), 'cf_pending_sync:user-2');
    assert.notStrictEqual(pendingSyncKey('user-1'), pendingSyncKey('user-2'));
  });

  test('pendingSyncKey falls back to legacy key when no user id', () => {
    assert.strictEqual(pendingSyncKey(null), 'cf_pending_sync:legacy');
    assert.strictEqual(pendingSyncKey(undefined), 'cf_pending_sync:legacy');
  });
});

describe('CRIT-002: getCurrentUserId reads scoped session marker', () => {
  let originalWindow;
  let originalSessionStorage;
  let originalDocument;

  beforeEach(() => {
    originalWindow = globalThis.window;
    originalSessionStorage = globalThis.sessionStorage;
    originalDocument = globalThis.document;
    const ss = new MemoryStorage();
    globalThis.window = { sessionStorage: ss };
    globalThis.sessionStorage = ss;
    globalThis.document = { cookie: '' };
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.sessionStorage = originalSessionStorage;
    globalThis.document = originalDocument;
  });

  test('returns null when no scoped marker is present', () => {
    assert.strictEqual(getCurrentUserId(), null);
  });

  test('returns the signed-in user id from sessionStorage', () => {
    globalThis.sessionStorage.setItem('tt_signed_in_user_id', 'user-42');
    assert.strictEqual(getCurrentUserId(), 'user-42');
  });

  test('falls back to tt_user_id cookie when sessionStorage is empty', () => {
    globalThis.document.cookie = 'other=1; tt_user_id=user-7';
    assert.strictEqual(getCurrentUserId(), 'user-7');
  });
});
