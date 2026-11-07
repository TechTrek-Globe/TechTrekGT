// Shared Ledger & Tenant Isolation Access Control Helpers
// Roles: owner > admin > editor > viewer > none.
// Invariants:
// - FIN-AUDIT-001: Strict positional ? parameter binding across all D1 SQLite queries.
// - FIN-AUDIT-002: WebCrypto SHA-256 digests for token hashing.

let tablesReady = false;

export async function ensureLedgerTables(db) {
  if (tablesReady || !db) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS finance_ledgers (
        id          TEXT PRIMARY KEY,
        owner_id    TEXT NOT NULL,
        name        TEXT NOT NULL DEFAULT 'Household Budget',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_finance_ledgers_owner ON finance_ledgers(owner_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS ledger_invites (
        id            TEXT PRIMARY KEY,
        ledger_id     TEXT NOT NULL,
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
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ledger_invites_ledger ON ledger_invites(ledger_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ledger_invites_email  ON ledger_invites(invited_email)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS ledger_shares (
        id         TEXT PRIMARY KEY,
        ledger_id  TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        role       TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
        invite_id  TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(ledger_id, user_id)
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ledger_shares_user   ON ledger_shares(user_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ledger_shares_ledger ON ledger_shares(ledger_id)')
    ]);
    tablesReady = true;
  } catch (err) {
    // If table already exists or batch fails, log warning but do not crash
    console.warn('[ledgerAccess] ensureLedgerTables warning:', err && err.message);
  }
}

export async function isPlatformAdmin(env, user) {
  if (!user) return false;
  if (user.isAdmin === true || user.role === 'admin' || user.is_admin === 1) return true;
  if (!env?.DB) return false;
  const uid = user.id || user.userId;
  if (!uid) return false;
  try {
    const row = await env.DB.prepare('SELECT role, is_admin FROM users WHERE id = ?').bind(uid).first();
    return Boolean(row && (row.role === 'admin' || row.is_admin === 1));
  } catch {
    return false;
  }
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolves a ledger and the caller's authorized role on it.
 *
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {string} ledgerId - The ledger ID to resolve
 * @param {object} user - The authenticated user object (from session / authenticate())
 * @returns {Promise<{ ledger: object|null, role: 'owner'|'admin'|'editor'|'viewer'|'none' }>}
 */
export async function resolveLedgerAccess(env, ledgerId, user) {
  if (!env?.DB || !ledgerId) {
    return { ledger: null, role: 'none' };
  }

  await ensureLedgerTables(env.DB);
  const uid = user?.id || user?.userId;

  // 1. Direct ownership of user's personal ledger (ledgerId === uid)
  if (uid && ledgerId === uid) {
    const existingLedger = await env.DB.prepare(
      'SELECT id, owner_id, name, created_at, updated_at FROM finance_ledgers WHERE id = ?'
    ).bind(ledgerId).first();

    const ledger = existingLedger || {
      id: ledgerId,
      owner_id: uid,
      name: user.name ? `${user.name}'s Budget` : 'Personal Budget'
    };
    return { ledger, role: 'owner' };
  }

  // 2. Query finance_ledgers row
  let ledger = await env.DB.prepare(
    'SELECT id, owner_id, name, created_at, updated_at FROM finance_ledgers WHERE id = ?'
  ).bind(ledgerId).first();

  // 3. Fallback: check if ledgerId is another user's ID
  if (!ledger) {
    const ownerUser = await env.DB.prepare(
      'SELECT id, name, email FROM users WHERE id = ?'
    ).bind(ledgerId).first();

    if (ownerUser) {
      ledger = {
        id: ownerUser.id,
        owner_id: ownerUser.id,
        name: ownerUser.name ? `${ownerUser.name}'s Budget` : `${ownerUser.email}'s Budget`
      };
    }
  }

  if (!ledger) {
    return { ledger: null, role: 'none' };
  }

  // 4. If caller is the ledger's designated owner
  if (uid && ledger.owner_id === uid) {
    return { ledger, role: 'owner' };
  }

  // 5. Check active share membership
  if (uid) {
    const share = await env.DB.prepare(
      'SELECT role FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
    ).bind(ledger.id, uid).first();

    if (share && share.role) {
      return { ledger, role: share.role };
    }

    // 6. Check platform admin privileges
    if (await isPlatformAdmin(env, user)) {
      return { ledger, role: 'admin' };
    }
  }

  // 7. Unaffiliated caller: fail closed with 'none'
  return { ledger, role: 'none' };
}

export const canEdit = (role) => role === 'owner' || role === 'admin' || role === 'editor';
export const canManageShares = (role) => role === 'owner' || role === 'admin';
export const canRead = (role) => role === 'owner' || role === 'admin' || role === 'editor' || role === 'viewer';
export const isOwner = (role) => role === 'owner';

export function ledgerPermissions(role) {
  return {
    read: canRead(role),
    edit: canEdit(role),
    manageShares: canManageShares(role),
    isOwner: isOwner(role),
    role
  };
}

