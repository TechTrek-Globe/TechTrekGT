import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { isNetworkError } from '../src/utils/networkError.js';

describe('CRIT-001: Shared network-error classifier', () => {
  test('TypeError from fetch is a network error', () => {
    assert.strictEqual(isNetworkError(new TypeError('Failed to fetch')), true);
  });

  test('NetworkError message is a network error', () => {
    assert.strictEqual(isNetworkError(new Error('NetworkError: fetch failed')), true);
  });

  test('Server 401 error is NOT a network error', () => {
    assert.strictEqual(isNetworkError(new Error('Login failed (HTTP 401)')), false);
  });

  test('Server 403 error is NOT a network error', () => {
    assert.strictEqual(isNetworkError(new Error('Registration failed (HTTP 403)')), false);
  });

  test('Non-network Error is NOT a network error', () => {
    assert.strictEqual(isNetworkError(new Error('Invalid password')), false);
  });

  test('null/undefined are NOT network errors', () => {
    assert.strictEqual(isNetworkError(null), false);
    assert.strictEqual(isNetworkError(undefined), false);
  });

  test('empty Error message is classified as network error (fail-closed)', () => {
    assert.strictEqual(isNetworkError(new Error('')), true);
  });
});
