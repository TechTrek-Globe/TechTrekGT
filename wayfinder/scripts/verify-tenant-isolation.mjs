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
import { handleBookmarks } from '../functions/api/wayfinder/bookmarks.js';
import { handleWeather } from '../functions/api/wayfinder/weather.js';
import { handleItinerary } from '../functions/api/wayfinder/itinerary.js';

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
        async run() {
          return { success: true, changes: 0 };
        },
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

console.log('\n--- 3. Endpoint RBAC & Validation Tests (Bookmarks, Itinerary PUT, Weather) ---');

function createEndpointMockDb({ journeys = [], shares = [], users = [], itineraryItems = [], bookmarks = [] } = {}) {
  return {
    async batch(stmts) {
      const results = [];
      for (const stmt of stmts) {
        results.push(stmt.run ? await stmt.run() : { success: true });
      }
      return results;
    },
    prepare(sql) {
      return {
        async run() {
          return { success: true, changes: 0 };
        },
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM wayfinder_journeys WHERE id = ? OR slug = ?')) {
                return journeys.find(j => j.id === args[0] || j.slug === args[1]) || null;
              }
              if (sql.includes('FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?')) {
                return shares.find(s => s.agenda_id === args[0] && s.user_id === args[1]) || null;
              }
              if (sql.includes('FROM users WHERE id = ?')) {
                return users.find(u => u.id === args[0]) || null;
              }
              if (sql.includes('FROM wayfinder_itinerary_items WHERE id = ?')) {
                return itineraryItems.find(it => it.id === args[0]) || null;
              }
              if (sql.includes('FROM wayfinder_bookmarks') && sql.includes('WHERE user_id = ? AND journey_id = ? AND item_id = ?')) {
                return bookmarks.find(b => b.user_id === args[0] && b.journey_id === args[1] && b.item_id === args[2]) || null;
              }
              return null;
            },
            async all() {
              if (sql.includes('FROM wayfinder_bookmarks')) {
                const [uid, jid] = args;
                return { results: bookmarks.filter(b => b.user_id === uid && b.journey_id === jid) };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes('INSERT INTO wayfinder_bookmarks')) {
                const [id, userId, journeyId, itemId, itemType, city, title] = args;
                const existing = bookmarks.find(b => b.user_id === userId && b.journey_id === journeyId && b.item_id === itemId);
                if (existing) {
                  existing.item_type = itemType;
                  existing.city = city;
                  existing.title = title;
                } else {
                  bookmarks.push({ id, user_id: userId, journey_id: journeyId, item_id: itemId, item_type: itemType, city, title });
                }
              } else if (sql.includes('DELETE FROM wayfinder_bookmarks') && sql.includes('AND (journey_id = ? OR journey_id = ?)')) {
                const [uid, itemId, jid1, jid2] = args;
                for (let i = bookmarks.length - 1; i >= 0; i--) {
                  if (
                    bookmarks[i].user_id === uid &&
                    bookmarks[i].item_id === itemId &&
                    (bookmarks[i].journey_id === jid1 || bookmarks[i].journey_id === jid2)
                  ) {
                    bookmarks.splice(i, 1);
                  }
                }
              } else if (sql.includes('UPDATE wayfinder_itinerary_items SET')) {
                const id = args[args.length - 1];
                const item = itineraryItems.find(it => it.id === id);
                if (item && sql.includes('title = ?')) {
                  item.title = args[0];
                }
              }
              return { success: true, changes: 1 };
            }
          };
        }
      };
    }
  };
}

test('Bookmarks tenant isolation: blocks non-members on private journeys and isolates deletes per user', async () => {
  const privateJourney = { id: 'priv-trip', slug: 'priv-trip', created_by: 'usr-owner-123', visibility: 'private' };
  const storeBookmarks = [];
  const db = createEndpointMockDb({
    journeys: [privateJourney],
    shares: [...mockShares, { agenda_id: 'priv-trip', user_id: 'usr-share-viewer', role: 'viewer' }],
    users: mockUsers,
    bookmarks: storeBookmarks
  });

  // Outsider trying to read/create bookmark on private journey gets 404
  const getOutsider = await handleBookmarks(
    { env: { DB: db }, user: { userId: 'usr-unaffiliated' }, request: new Request('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks?journey_id=priv-trip') },
    new URL('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks?journey_id=priv-trip'),
    'GET'
  );
  assert.equal(getOutsider.status, 404);

  const postOutsider = await handleBookmarks(
    {
      env: { DB: db },
      user: { userId: 'usr-unaffiliated' },
      request: new Request('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ journey_id: 'priv-trip', item_id: 'wawel', item_type: 'attraction', city: 'krakow', title: 'Wawel' })
      })
    },
    new URL('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks'),
    'POST'
  );
  assert.equal(postOutsider.status, 404);

  // Owner creates bookmark -> 201
  const postOwner = await handleBookmarks(
    {
      env: { DB: db },
      user: { userId: 'usr-owner-123' },
      request: new Request('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ journey_id: 'priv-trip', item_id: 'wawel', item_type: 'attraction', city: 'krakow', title: 'Wawel' })
      })
    },
    new URL('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks'),
    'POST'
  );
  assert.equal(postOwner.status, 201);
  assert.equal(storeBookmarks.length, 1);

  // Different user trying to delete owner's bookmark cannot remove owner's row
  const delOther = await handleBookmarks(
    {
      env: { DB: db },
      user: { userId: 'usr-share-viewer' },
      request: new Request('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks/wawel?journey_id=priv-trip', { method: 'DELETE' })
    },
    new URL('https://techtrekgt.com/wayfinder/api/wayfinder/bookmarks/wawel?journey_id=priv-trip'),
    'DELETE'
  );
  assert.equal(delOther.status, 200);
  assert.equal(storeBookmarks.length, 1, 'Owner bookmark must remain untouched when another user deletes');
});

test('Itinerary PUT enforces RBAC and validates title/JSON', async () => {
  const items = [{ id: 'it-1', journey_id: 'priv-1', title: 'Old Title', item_type: 'sight', visibility: 'private' }];
  const privJourney = { id: 'priv-1', slug: 'priv-1', created_by: 'usr-owner-123', visibility: 'private' };
  const privShares = [
    { agenda_id: 'priv-1', user_id: 'usr-share-editor', role: 'editor' },
    { agenda_id: 'priv-1', user_id: 'usr-share-viewer', role: 'viewer' }
  ];
  const db = createEndpointMockDb({ journeys: [privJourney], shares: privShares, users: mockUsers, itineraryItems: items });

  const url = new URL('https://techtrekgt.com/wayfinder/api/wayfinder/itinerary/it-1');

  const resViewer = await handleItinerary(
    {
      env: { DB: db },
      user: { userId: 'usr-share-viewer' },
      request: new Request(url, { method: 'PUT', body: JSON.stringify({ title: 'Hack' }) })
    },
    url,
    'PUT'
  );
  assert.equal(resViewer.status, 403);

  const resOutsider = await handleItinerary(
    {
      env: { DB: db },
      user: { userId: 'usr-unaffiliated' },
      request: new Request(url, { method: 'PUT', body: JSON.stringify({ title: 'Hack' }) })
    },
    url,
    'PUT'
  );
  assert.equal(resOutsider.status, 404);

  const resEmptyTitle = await handleItinerary(
    {
      env: { DB: db },
      user: { userId: 'usr-share-editor' },
      request: new Request(url, { method: 'PUT', body: JSON.stringify({ title: '   ' }) })
    },
    url,
    'PUT'
  );
  assert.equal(resEmptyTitle.status, 400);

  const resEditorOk = await handleItinerary(
    {
      env: { DB: db },
      user: { userId: 'usr-share-editor' },
      request: new Request(url, { method: 'PUT', body: JSON.stringify({ title: 'Updated Sightseeing' }) })
    },
    url,
    'PUT'
  );
  assert.equal(resEditorOk.status, 200);
  const body = await resEditorOk.json();
  assert.equal(body.item.title, 'Updated Sightseeing');
});

test('Weather endpoint rejects malformed or impossible ISO dates with 400', async () => {
  const resInvalid = await handleWeather(
    {},
    new URL('https://techtrekgt.com/wayfinder/api/wayfinder/weather?city=krakow&date=invalid'),
    'GET'
  );
  assert.equal(resInvalid.status, 400);

  const resFeb30 = await handleWeather(
    {},
    new URL('https://techtrekgt.com/wayfinder/api/wayfinder/weather?city=krakow&date=2026-02-30'),
    'GET'
  );
  assert.equal(resFeb30.status, 400);
});

queue.then(() => {
  console.log(`\nAll ${passedCount} tests passed successfully!`);
});

