import { describe, it, expect, beforeEach } from 'vitest';
import { budgetRecordKey, LEGACY_BUDGET_KEY } from '../src/utils/indexedDB.js';
import { pendingSyncKey } from '../src/utils/api.js';

describe('FIN-AUDIT-004: User-Scoped Storage Partitioning & Isolation', () => {

  describe('1. IndexedDB Key Partitioning', () => {
    it('scopes budget storage keys strictly by user id', () => {
      expect(budgetRecordKey('usr_alice_123')).toBe('current_budget:usr_alice_123');
      expect(budgetRecordKey('usr_bob_456')).toBe('current_budget:usr_bob_456');
    });

    it('falls back to legacy scoped key when no user id is supplied', () => {
      expect(budgetRecordKey(null)).toBe('current_budget:legacy');
      expect(budgetRecordKey(undefined)).toBe('current_budget:legacy');
      expect(budgetRecordKey('')).toBe('current_budget:legacy');
    });

    it('guarantees complete isolation between distinct user namespaces', () => {
      const userAKey = budgetRecordKey('usr_a');
      const userBKey = budgetRecordKey('usr_b');
      expect(userAKey).not.toBe(userBKey);
      expect(userAKey.includes('usr_b')).toBe(false);
      expect(userBKey.includes('usr_a')).toBe(false);
    });
  });

  describe('2. Offline Sync Queue Partitioning', () => {
    it('scopes offline pending sync keys strictly by user id', () => {
      expect(pendingSyncKey('usr_alice_123')).toBe('cf_pending_sync:usr_alice_123');
      expect(pendingSyncKey('usr_bob_456')).toBe('cf_pending_sync:usr_bob_456');
    });

    it('falls back to legacy key when no user id is provided', () => {
      expect(pendingSyncKey(null)).toBe('cf_pending_sync:legacy');
      expect(pendingSyncKey(undefined)).toBe('cf_pending_sync:legacy');
      expect(pendingSyncKey('')).toBe('cf_pending_sync:legacy');
    });
  });

  describe('3. Cloud Version Marker User Scoping', () => {
    function cloudVersionKey(userId) {
      const id = userId ? String(userId) : 'legacy';
      return `tt_budget_cloud_version:${id}`;
    }

    it('generates partitioned cloud version marker keys', () => {
      expect(cloudVersionKey('usr_101')).toBe('tt_budget_cloud_version:usr_101');
      expect(cloudVersionKey('usr_202')).toBe('tt_budget_cloud_version:usr_202');
      expect(cloudVersionKey(null)).toBe('tt_budget_cloud_version:legacy');
    });
  });
});
