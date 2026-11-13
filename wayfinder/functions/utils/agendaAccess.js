// Shared agenda (journey) access control helpers.
// Roles: owner > admin > editor > viewer > none. A null role means the journey was not found.
// All queries use positional ? binding.

let tablesReady = false;
let shareTablesPromise = null;

export async function ensureShareTables(db) {
  if (!db || tablesReady) return;
  if (shareTablesPromise) return shareTablesPromise;
  shareTablesPromise = (async () => {
    try {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS wayfinder_agenda_invites (
          id            TEXT PRIMARY KEY,
          agenda_id     TEXT NOT NULL,
          invited_email TEXT NOT NULL COLLATE NOCASE,
          role          TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
          token_hash    TEXT NOT NULL UNIQUE,
          status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
          invited_by    TEXT NOT NULL,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at    TEXT NOT NULL,
          accepted_at   TEXT,
          accepted_by   TEXT
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_wf_invites_agenda ON wayfinder_agenda_invites(agenda_id)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_wf_invites_email ON wayfinder_agenda_invites(invited_email)'),
        db.prepare(`CREATE TABLE IF NOT EXISTS wayfinder_agenda_shares (
          id         TEXT PRIMARY KEY,
          agenda_id  TEXT NOT NULL,
          user_id    TEXT NOT NULL,
          role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
          invite_id  TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(agenda_id, user_id)
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_wf_shares_user ON wayfinder_agenda_shares(user_id)'),
        db.prepare('CREATE INDEX IF NOT EXISTS idx_wf_shares_agenda ON wayfinder_agenda_shares(agenda_id)'),
      ]);
      tablesReady = true;
    } finally {
      shareTablesPromise = null;
    }
  })();
  return shareTablesPromise;
}

export async function isPlatformAdmin(env, user) {
  if (!user || !user.userId || !env?.DB) return false;
  try {
    const row = await env.DB.prepare('SELECT role, is_admin, status FROM users WHERE id = ?').bind(user.userId).first();
    if (!row) return false;
    const status = row.status || 'Active';
    if (status === 'Suspended' || (status !== 'Active' && status !== 'active')) return false;
    return Boolean(row.role === 'admin' || row.is_admin === 1);
  } catch (e) {
    return false;
  }
}

// Resolve a journey by id or slug and the caller's role on it.
export async function resolveAgendaAccess(env, ref, user) {
  const journey = await env.DB.prepare(
    'SELECT * FROM wayfinder_journeys WHERE id = ? OR slug = ?'
  ).bind(ref, ref).first();
  if (!journey) return { journey: null, role: null };

  if (journey.created_by === user.userId) return { journey, role: 'owner' };

  let share = null;
  try {
    share = await env.DB.prepare(
      'SELECT role FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?'
    ).bind(journey.id, user.userId).first();
  } catch (err) {
    if (String(err?.message || '').includes('no such table')) {
      await ensureShareTables(env.DB);
    } else {
      throw err;
    }
  }
  if (share) return { journey, role: share.role };

  if (await isPlatformAdmin(env, user)) return { journey, role: 'admin' };
  return { journey, role: 'none' };
}

// User ids that share this agenda (owner + accepted collaborators + inviters).
export async function getCollaboratorIds(env, journey) {
  if (!journey) return [];
  let rows = { results: [] };
  try {
    rows = await env.DB.prepare(
      'SELECT user_id FROM wayfinder_agenda_shares WHERE agenda_id = ?'
    ).bind(journey.id).all();
  } catch (err) {
    if (String(err?.message || '').includes('no such table')) {
      await ensureShareTables(env.DB);
    }
  }
  const ids = new Set((rows.results || []).map(r => r.user_id));
  if (journey.created_by && journey.created_by !== 'system') ids.add(journey.created_by);
  return [...ids];
}

// Ordered list of active agenda members ([{ id, name, email, role }]).
export async function getAgendaMembers(env, journey) {
  if (!journey) return [];
  const roleByUserId = new Map();
  if (journey.created_by && journey.created_by !== 'system') {
    roleByUserId.set(journey.created_by, 'owner');
  }
  try {
    const rows = await env.DB.prepare(
      'SELECT user_id, role FROM wayfinder_agenda_shares WHERE agenda_id = ?'
    ).bind(journey.id).all();
    for (const row of rows.results || []) {
      if (!row?.user_id) continue;
      if (row.user_id === journey.created_by) {
        roleByUserId.set(row.user_id, 'owner');
      } else if (!roleByUserId.has(row.user_id)) {
        roleByUserId.set(row.user_id, row.role || 'viewer');
      }
    }
  } catch (err) {
    if (!String(err?.message || '').includes('no such table')) {
      console.error('getAgendaMembers shares query error:', err);
    }
  }

  const userIds = [...roleByUserId.keys()];
  if (userIds.length === 0) return [];

  const usersById = new Map();
  for (let i = 0; i < userIds.length; i += 80) {
    const chunk = userIds.slice(i, i + 80);
    const placeholders = chunk.map(() => '?').join(',');
    try {
      const userRows = await env.DB.prepare(
        `SELECT id, name, email FROM users WHERE id IN (${placeholders})`
      ).bind(...chunk).all();
      for (const u of userRows.results || []) {
        if (u?.id) usersById.set(u.id, u);
      }
    } catch (err) {
      if (!String(err?.message || '').includes('no such table')) {
        console.error('getAgendaMembers users query error:', err);
      }
    }
  }

  const roleRank = { owner: 0, admin: 1, editor: 2, viewer: 3 };
  const members = userIds.map((id) => {
    const u = usersById.get(id);
    const role = roleByUserId.get(id) || 'viewer';
    const fallbackName = role === 'owner' ? 'Agenda Owner' : 'Collaborator';
    return {
      id,
      name: (u?.name || u?.email || fallbackName).trim(),
      email: u?.email || null,
      role,
    };
  });

  members.sort((a, b) => {
    const rankDiff = (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
  return members;
}

export const canEdit = (role) => role === 'owner' || role === 'admin' || role === 'editor';
export const canManage = (role) => role === 'owner' || role === 'admin';
export const isMember = (role) => role === 'owner' || role === 'admin' || role === 'editor' || role === 'viewer';
// Documents, expenses, budget and import jobs: owner, share admin, platform admin only.
export const canViewSensitive = (role) => role === 'owner' || role === 'admin';

export function agendaPermissions(role) {
  return {
    itinerary: isMember(role),
    packing: isMember(role),
    documents: canViewSensitive(role),
    expenses: canViewSensitive(role),
    share: canManage(role),
    edit: canEdit(role)
  };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

