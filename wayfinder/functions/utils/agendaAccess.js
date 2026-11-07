// Shared agenda (journey) access control helpers.
// Roles: owner > admin > editor > viewer. A null role means no explicit access.
// All queries use positional ? binding.

let tablesReady = false;

export async function ensureShareTables(db) {
  if (tablesReady) return;
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
}

export async function isPlatformAdmin(env, user) {
  if (user?.isAdmin === true || user?.role === 'admin') return true;
  try {
    const row = await env.DB.prepare('SELECT role, is_admin FROM users WHERE id = ?').bind(user.userId).first();
    return Boolean(row && (row.role === 'admin' || row.is_admin === 1));
  } catch (e) {
    return false;
  }
}

// Resolve a journey by id or slug and the caller's role on it.
export async function resolveAgendaAccess(env, ref, user) {
  await ensureShareTables(env.DB);
  const journey = await env.DB.prepare(
    'SELECT * FROM wayfinder_journeys WHERE id = ? OR slug = ?'
  ).bind(ref, ref).first();
  if (!journey) return { journey: null, role: null };

  if (journey.created_by === user.userId) return { journey, role: 'owner' };

  const share = await env.DB.prepare(
    'SELECT role FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?'
  ).bind(journey.id, user.userId).first();
  if (share) return { journey, role: share.role };

  // If caller invited collaborators to this agenda, recognize as owner
  const inv = await env.DB.prepare(
    'SELECT 1 AS found FROM wayfinder_agenda_invites WHERE agenda_id = ? AND invited_by = ? LIMIT 1'
  ).bind(journey.id, user.userId).first();
  if (inv) return { journey, role: 'owner' };

  if (await isPlatformAdmin(env, user)) return { journey, role: 'admin' };
  return { journey, role: null };
}

// User ids that share this agenda (owner + accepted collaborators + inviters).
export async function getCollaboratorIds(env, journey) {
  if (!journey) return [];
  const rows = await env.DB.prepare(
    'SELECT user_id FROM wayfinder_agenda_shares WHERE agenda_id = ?'
  ).bind(journey.id).all();
  const ids = new Set((rows.results || []).map(r => r.user_id));
  if (journey.created_by && journey.created_by !== 'system') ids.add(journey.created_by);
  const invRows = await env.DB.prepare(
    'SELECT DISTINCT invited_by FROM wayfinder_agenda_invites WHERE agenda_id = ?'
  ).bind(journey.id).all();
  for (const inv of (invRows.results || [])) {
    if (inv.invited_by) ids.add(inv.invited_by);
  }
  return [...ids];
}

export const canEdit = (role) => role === 'owner' || role === 'admin' || role === 'editor';
export const canManage = (role) => role === 'owner' || role === 'admin';

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

