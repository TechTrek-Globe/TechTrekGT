// Verification test suite for Wayfinder Tenant Isolation and Authorization Gating
// Tests resolveAgendaAccess, agendaPermissions, and endpoint-level authorization logic

import assert from 'node:assert/strict';
import {
  resolveAgendaAccess,
  canEdit,
  canManage,
  isMember,
  canViewSensitive,
  agendaPermissions
} from '../functions/utils/agendaAccess.js';

let passedCount = 0;
let queue = Promise.resolve();

function test(name, fn) {
  queue = queue.then(async () => {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      process.exitCode = 1;
    }
  });
}

// Mock D1 Database implementation for isolated unit testing
function createMockDb({ journeys = [], shares = [], invites = [], users = [] } = {}) {
  return {
    async batch(stmts) {
      const results = [];
      for (const stmt of stmts) {
        results.push(await stmt.run ? await stmt.run() : { success: true });
      }
      return results;
    },
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              // Journey lookup by id or slug
              if (sql.includes('FROM wayfinder_journeys WHERE id = ? OR slug = ?')) {
                const [ref1, ref2] = args;
                return journeys.find(j => j.id === ref1 || j.slug === ref2) || null;
              }
              // Share lookup
              if (sql.includes('FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?')) {
                const [agendaId, userId] = args;
                return shares.find(s => s.agenda_id === agendaId && s.user_id === userId) || null;
              }
              // User lookup
              if (sql.includes('FROM users WHERE id = ?')) {
                const [userId] = args;
                return users.find(u => u.id === userId) || null;
              }
              return null;
            },
            async all() {
              if (sql.includes('SELECT user_id FROM wayfinder_agenda_shares WHERE agenda_id = ?')) {
                const [agendaId] = args;
                const rows = shares.filter(s => s.agenda_id === agendaId);
                return { results: rows.map(r => ({ user_id: r.user_id })) };
              }
              return { results: [] };
            },
            async run() {
              return { success: true, changes: 1 };
            }
          };
        }
      };
    }
  };
}

console.log('--- 1. Role Permission Matrix Tests ---');

test('Permissions for Owner', () => {
  const role = 'owner';
  assert.equal(canEdit(role), true, 'Owner must be able to edit');
  assert.equal(canManage(role), true, 'Owner must be able to manage');
  assert.equal(isMember(role), true, 'Owner must be recognized as member');
  assert.equal(canViewSensitive(role), true, 'Owner must be able to view sensitive data');

  const perms = agendaPermissions(role);
  assert.deepEqual(perms, {
    itinerary: true,
    packing: true,
    documents: true,
    expenses: true,
    share: true,
    edit: true
  });
});

test('Permissions for Share Admin', () => {
  const role = 'admin';
  assert.equal(canEdit(role), true, 'Admin must be able to edit');
  assert.equal(canManage(role), true, 'Admin must be able to manage');
  assert.equal(isMember(role), true, 'Admin must be recognized as member');
  assert.equal(canViewSensitive(role), true, 'Admin must be able to view sensitive data');

  const perms = agendaPermissions(role);
  assert.deepEqual(perms, {
    itinerary: true,
    packing: true,
    documents: true,
    expenses: true,
    share: true,
    edit: true
  });
});

test('Permissions for Editor (Strictly blocked from Sensitive Docs & Expenses)', () => {
  const role = 'editor';
  assert.equal(canEdit(role), true, 'Editor must be able to edit schedule');
  assert.equal(canManage(role), false, 'Editor must NOT manage shares');
  assert.equal(isMember(role), true, 'Editor is a member');
  assert.equal(canViewSensitive(role), false, 'Editor must NOT view sensitive documents/expenses');

  const perms = agendaPermissions(role);
  assert.deepEqual(perms, {
    itinerary: true,
    packing: true,
    documents: false,
    expenses: false,
    share: false,
    edit: true
  });
});

test('Permissions for Viewer (Read-only on general trip, blocked from sensitive)', () => {
  const role = 'viewer';
  assert.equal(canEdit(role), false, 'Viewer must NOT edit');
  assert.equal(canManage(role), false, 'Viewer must NOT manage shares');
  assert.equal(isMember(role), true, 'Viewer is a member');
  assert.equal(canViewSensitive(role), false, 'Viewer must NOT view sensitive documents/expenses');

  const perms = agendaPermissions(role);
  assert.deepEqual(perms, {
    itinerary: true,
    packing: true,
    documents: false,
    expenses: false,
    share: false,
    edit: false
  });
});

test('Permissions for Unaffiliated Authenticated User ("none" role)', () => {
  const role = 'none';
  assert.equal(canEdit(role), false, 'None must NOT edit');
  assert.equal(canManage(role), false, 'None must NOT manage');
  assert.equal(isMember(role), false, 'None is NOT a member');
  assert.equal(canViewSensitive(role), false, 'None must NOT view sensitive data');

  const perms = agendaPermissions(role);
  assert.deepEqual(perms, {
    itinerary: false,
    packing: false,
    documents: false,
    expenses: false,
    share: false,
    edit: false
  });
});

console.log('\n--- 2. Resolve Agenda Access Resolution Tests ---');

const mockJourneys = [
  { id: 'poland-christmas-2026', slug: 'poland-christmas-2026', created_by: 'usr-owner-123', visibility: 'public' }
];

const mockShares = [
  { agenda_id: 'poland-christmas-2026', user_id: 'usr-share-admin', role: 'admin' },
  { agenda_id: 'poland-christmas-2026', user_id: 'usr-share-editor', role: 'editor' },
  { agenda_id: 'poland-christmas-2026', user_id: 'usr-share-viewer', role: 'viewer' }
];

const mockUsers = [
  { id: 'usr-owner-123', email: 'owner@techtrekgt.com', role: 'user', is_admin: 0 },
  { id: 'usr-share-admin', email: 'admin@techtrekgt.com', role: 'user', is_admin: 0 },
  { id: 'usr-share-editor', email: 'editor@techtrekgt.com', role: 'user', is_admin: 0 },
  { id: 'usr-share-viewer', email: 'viewer@techtrekgt.com', role: 'user', is_admin: 0 },
  { id: 'usr-platform-admin', email: 'platform@techtrekgt.com', role: 'admin', is_admin: 1 },
  { id: 'usr-unaffiliated', email: 'random@domain.com', role: 'user', is_admin: 0 }
];

test('Owner resolves to "owner"', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-owner-123', email: 'owner@techtrekgt.com' };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'poland-christmas-2026', user);
  assert.equal(journey.id, 'poland-christmas-2026');
  assert.equal(role, 'owner');
});

test('Collaborator with share "admin" resolves to "admin"', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-share-admin', email: 'admin@techtrekgt.com' };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'poland-christmas-2026', user);
  assert.equal(role, 'admin');
});

test('Collaborator with share "editor" resolves to "editor"', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-share-editor', email: 'editor@techtrekgt.com' };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'poland-christmas-2026', user);
  assert.equal(role, 'editor');
});

test('Collaborator with share "viewer" resolves to "viewer"', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-share-viewer', email: 'viewer@techtrekgt.com' };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'poland-christmas-2026', user);
  assert.equal(role, 'viewer');
});

test('Platform Admin without explicit share resolves to "admin"', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-platform-admin', email: 'platform@techtrekgt.com', isAdmin: true };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'poland-christmas-2026', user);
  assert.equal(role, 'admin');
});

test('Random Authenticated User with NO share resolves to "none"', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-unaffiliated', email: 'random@domain.com', isAdmin: false, role: 'user' };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'poland-christmas-2026', user);
  assert.equal(journey.id, 'poland-christmas-2026');
  assert.equal(role, 'none', 'Unaffiliated user must resolve to "none", never null or owner');
});

test('Invalid Journey Reference returns role null', async () => {
  const db = createMockDb({ journeys: mockJourneys, shares: mockShares, users: mockUsers });
  const user = { userId: 'usr-owner-123', email: 'owner@techtrekgt.com' };
  const { journey, role } = await resolveAgendaAccess({ DB: db }, 'non-existent-journey', user);
  assert.equal(journey, null);
  assert.equal(role, null);
});

queue.then(() => {
  console.log(`\nAll ${passedCount} tests passed successfully!`);
});

