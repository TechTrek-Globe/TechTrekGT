// Shared Ledger Collaboration & Tenant Isolation API
// Invariants:
// - FIN-AUDIT-001: Positional ? parameter binding across all D1 SQLite queries.
// - FIN-AUDIT-002: HttpOnly cookie session authentication, WebCrypto SHA-256 digests.
// - Rate limiting on public and invitation endpoints.

import { authenticate, json, fail, ERROR_CODES, EMAIL_REGEX, MAX_BODY_AUTH } from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';
import { sendInviteEmail } from '../../utils/inviteEmail.js';
import {
  ensureLedgerTables,
  resolveLedgerAccess,
  canManageShares,
  sha256Hex,
  ledgerPermissions
} from '../../utils/ledgerAccess.js';

const ROLES = ['viewer', 'editor', 'admin'];

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function publicOrigin(url) {
  if (/techtrekgt\.com$/.test(url.hostname) || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return url.origin;
  }
  return 'https://techtrekgt.com';
}

async function lookupInvite(env, token) {
  if (!token || typeof token !== 'string' || token.length > 256) return null;
  const hash = await sha256Hex(token.trim());
  return env.DB.prepare(
    `SELECT i.*,
            (i.expires_at <= datetime('now')) AS is_expired
     FROM ledger_invites i
     WHERE i.token_hash = ?`
  ).bind(hash).first();
}

function inviteState(invite) {
  if (!invite) return 'invalid';
  if (invite.status === 'revoked') return 'revoked';
  if (invite.status === 'accepted') return 'used';
  if (invite.is_expired) return 'expired';
  return 'valid';
}

export async function handleLedgerShares(context, url, method) {
  const { env, request, requestId } = context;
  if (!env?.DB) {
    return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Database unavailable.', requestId);
  }

  await ensureLedgerTables(env.DB);

  // Normalize path parts
  // Examples:
  // /finance/api/finance/ledgers/:id/invites -> /api/ledgers/:id/invites
  // /finance/api/ledgers/:id/invites         -> /api/ledgers/:id/invites
  // /api/finance/ledgers/:id/invites         -> /api/ledgers/:id/invites
  // /api/ledgers/:id/invites                 -> /api/ledgers/:id/invites
  let pathname = url.pathname;
  if (pathname.startsWith('/finance')) {
    pathname = pathname.slice('/finance'.length);
  }
  if (pathname.startsWith('/api/finance/')) {
    pathname = pathname.replace('/api/finance', '/api');
  } else if (pathname === '/api/finance') {
    pathname = '/api';
  }

  const parts = pathname.split('/').filter(Boolean); // e.g. ['api', 'ledgers', 'usr-1', 'invites']
  const apiIdx = parts.indexOf('api');
  let seg = apiIdx !== -1 ? parts.slice(apiIdx + 1) : parts;
  if (seg[0] === 'finance') {
    seg = seg.slice(1);
  }

  // ----------------------------------------------------------------
  // 1. Public: GET /api/invites/verify?token=<TOKEN>
  // ----------------------------------------------------------------
  if (seg[0] === 'invites' && seg[1] === 'verify' && method === 'GET') {
    const limited = await enforceRateLimit(context, 'invite-verify', 30, 60);
    if (limited) return limited;

    const token = url.searchParams.get('token');
    const invite = await lookupInvite(env, token);
    const state = inviteState(invite);
    if (state !== 'valid') {
      return json({ valid: false, reason: state }, state === 'invalid' ? 404 : 410);
    }

    const [existingUser, inviter, ledgerMeta] = await Promise.all([
      env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(invite.invited_email.toLowerCase()).first(),
      env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(invite.invited_by).first(),
      env.DB.prepare('SELECT name FROM finance_ledgers WHERE id = ?').bind(invite.ledger_id).first()
    ]);

    const ledgerTitle = ledgerMeta?.name || (inviter?.name ? `${inviter.name}'s Budget` : 'Shared Budget');

    return json({
      valid: true,
      ledgerId: invite.ledger_id,
      ledgerTitle,
      role: invite.role,
      invitedEmail: invite.invited_email,
      inviterName: inviter?.name || inviter?.email || 'A budget owner',
      expiresAt: invite.expires_at,
      accountExists: Boolean(existingUser)
    });
  }

  // ----------------------------------------------------------------
  // Authenticated Session Verification
  // ----------------------------------------------------------------
  const auth = await authenticate(context, { requireCsrf: method !== 'GET' });
  if (auth.error) return auth.error;
  const user = auth.user;

  // ----------------------------------------------------------------
  // 2. Claim Invite: POST /api/invites/claim
  // ----------------------------------------------------------------
  if (seg[0] === 'invites' && seg[1] === 'claim' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid JSON body.', requestId);
    }

    const invite = await lookupInvite(env, body?.token);
    const state = inviteState(invite);
    if (state !== 'valid') {
      return json({ error: `Invitation is ${state}.`, reason: state }, state === 'invalid' ? 404 : 410);
    }

    const userEmail = String(user.email || '').trim().toLowerCase();
    const inviteEmail = String(invite.invited_email || '').trim().toLowerCase();
    if (userEmail !== inviteEmail) {
      return json({
        error: 'This invitation was sent to a different email address.',
        reason: 'email_mismatch',
        invitedEmail: invite.invited_email
      }, 403);
    }

    if (invite.ledger_id === user.id) {
      return json({ error: 'You are already the owner of this ledger.', reason: 'owner' }, 400);
    }

    const shareId = `shr-${crypto.randomUUID()}`;
    try {
      const batchResults = await env.DB.batch([
        env.DB.prepare(
          `UPDATE ledger_invites
           SET status = 'accepted', accepted_at = datetime('now'), accepted_by = ?
           WHERE id = ? AND status = 'pending' AND expires_at > datetime('now')`
        ).bind(user.id, invite.id),
        env.DB.prepare(
          `INSERT INTO ledger_shares (id, ledger_id, user_id, role, invite_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(ledger_id, user_id) DO UPDATE SET
             role = CASE
               WHEN excluded.role = 'admin' THEN 'admin'
               WHEN excluded.role = 'editor' AND ledger_shares.role != 'admin' THEN 'editor'
               ELSE ledger_shares.role
             END`
        ).bind(shareId, invite.ledger_id, user.id, invite.role, invite.id)
      ]);

      const updateResult = batchResults && batchResults[0];
      const changes = updateResult?.meta?.changes ?? updateResult?.changes ?? 0;
      if (changes === 0) {
        return json({ error: 'Invitation could not be claimed (already used or expired).', reason: 'used' }, 409);
      }

      return json({ success: true, ledgerId: invite.ledger_id, role: invite.role });
    } catch (claimErr) {
      console.error('[ledger-shares] claim batch error:', claimErr && claimErr.message);
      return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to claim invitation.', requestId);
    }
  }

  // ----------------------------------------------------------------
  // 3. User Ledgers List: GET /api/ledgers
  // ----------------------------------------------------------------
  if (seg[0] === 'ledgers' && (!seg[1] || seg[1] === '') && method === 'GET') {
    try {
      let personalLedger = await env.DB.prepare(
        'SELECT id, name FROM finance_ledgers WHERE id = ?'
      ).bind(user.id).first();

      if (!personalLedger) {
        const defaultName = user.name ? `${user.name}'s Budget` : 'Personal Budget';
        await env.DB.prepare(
          'INSERT OR IGNORE INTO finance_ledgers (id, owner_id, name) VALUES (?, ?, ?)'
        ).bind(user.id, user.id, defaultName).run().catch(() => {});
        personalLedger = await env.DB.prepare(
          'SELECT id, name FROM finance_ledgers WHERE id = ?'
        ).bind(user.id).first();
      }

      const sharedRows = await env.DB.prepare(
        `SELECT s.ledger_id, s.role, s.created_at,
                l.name AS ledger_name,
                u.name AS owner_name,
                u.email AS owner_email
         FROM ledger_shares s
         LEFT JOIN finance_ledgers l ON l.id = s.ledger_id
         LEFT JOIN users u ON u.id = COALESCE(l.owner_id, s.ledger_id)
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC`
      ).bind(user.id).all();

      const ledgers = [
        {
          id: user.id,
          name: personalLedger?.name || (user.name ? `${user.name}'s Budget` : 'Personal Budget'),
          role: 'owner',
          isOwner: true
        },
        ...(sharedRows?.results || []).map(r => ({
          id: r.ledger_id,
          name: r.ledger_name || (r.owner_name ? `${r.owner_name}'s Budget` : `${r.owner_email}'s Budget`),
          role: r.role,
          ownerName: r.owner_name || r.owner_email,
          isOwner: false,
          joinedAt: r.created_at
        }))
      ];

      return json({ success: true, ledgers });
    } catch (err) {
      console.error('[ledger-shares] list ledgers error:', err && err.message);
      return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to list ledgers.', requestId);
    }
  }

  // ----------------------------------------------------------------
  // 4. Ledger-Scoped Endpoints: /api/ledgers/:id/...
  // ----------------------------------------------------------------
  if (seg[0] === 'ledgers' && seg[1]) {
    const ledgerId = decodeURIComponent(seg[1]);
    const { ledger, role } = await resolveLedgerAccess(env, ledgerId, user);

    if (!ledger) {
      return fail(ERROR_CODES.NOT_FOUND, 404, 'Ledger not found.', requestId);
    }

    // GET /api/ledgers/:id/access
    if (seg[2] === 'access' && method === 'GET') {
      return json({
        ledgerId: ledger.id,
        name: ledger.name,
        role,
        permissions: ledgerPermissions(role)
      });
    }

    // All subsequent management routes require canManageShares (owner | admin)
    if (!canManageShares(role)) {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden: Share management requires owner or admin role.', requestId);
    }

    // ---- Sub-resource: Invites (/api/ledgers/:id/invites) ----
    if (seg[2] === 'invites') {
      // GET: List pending/historical invites and active collaborators
      if (method === 'GET' && !seg[3]) {
        const [invites, shares] = await Promise.all([
          env.DB.prepare(
            `SELECT id, invited_email, role, status, created_at, expires_at, accepted_at,
                    (expires_at <= datetime('now')) AS is_expired
             FROM ledger_invites
             WHERE ledger_id = ?
             ORDER BY created_at DESC`
          ).bind(ledger.id).all(),
          env.DB.prepare(
            `SELECT s.user_id, s.role, s.created_at, u.email, u.name
             FROM ledger_shares s
             LEFT JOIN users u ON u.id = s.user_id
             WHERE s.ledger_id = ?
             ORDER BY s.created_at ASC`
          ).bind(ledger.id).all()
        ]);

        return json({
          invites: invites?.results || [],
          shares: shares?.results || [],
          myRole: role
        });
      }

      // POST: Create and dispatch new invite
      if (method === 'POST' && !seg[3]) {
        const limited = await enforceRateLimit(context, 'invite-create', 20, 3600, user.id);
        if (limited) return limited;

        let body = {};
        try {
          body = await request.json();
        } catch {
          return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid JSON body.', requestId);
        }

        const email = String(body.email || '').trim().toLowerCase();
        const inviteRole = String(body.role || 'viewer').trim().toLowerCase();

        if (!EMAIL_REGEX.test(email) || email.length > 254) {
          return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Valid email required.', requestId);
        }
        if (!ROLES.includes(inviteRole)) {
          return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid role. Must be viewer, editor, or admin.', requestId);
        }
        if (inviteRole === 'admin' && role !== 'owner') {
          return fail(ERROR_CODES.FORBIDDEN, 403, 'Only the ledger owner can grant admin access.', requestId);
        }

        // Verify if user already has access
        const alreadyShared = await env.DB.prepare(
          `SELECT 1 FROM ledger_shares s
           JOIN users u ON u.id = s.user_id
           WHERE s.ledger_id = ? AND u.email = ?`
        ).bind(ledger.id, email).first();

        if (alreadyShared) {
          return json({ error: 'That user already has active access to this ledger.' }, 409);
        }

        const token = newToken();
        const tokenHash = await sha256Hex(token);
        const inviteId = `inv-${crypto.randomUUID()}`;

        await env.DB.batch([
          env.DB.prepare(
            `UPDATE ledger_invites SET status = 'revoked'
             WHERE ledger_id = ? AND invited_email = ? AND status = 'pending'`
          ).bind(ledger.id, email),
          env.DB.prepare(
            `INSERT INTO ledger_invites
             (id, ledger_id, invited_email, role, token_hash, status, invited_by, expires_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now', '+7 days'))`
          ).bind(inviteId, ledger.id, email, inviteRole, tokenHash, user.id)
        ]);

        const inviteRow = await env.DB.prepare(
          'SELECT expires_at FROM ledger_invites WHERE id = ?'
        ).bind(inviteId).first();

        const link = `${publicOrigin(url)}/finance/invite?token=${token}`;
        const mailResult = await sendInviteEmail(env, {
          to: email,
          inviterName: user.name || user.email || 'A budget collaborator',
          ledgerTitle: ledger.name,
          role: inviteRole,
          link,
          expiresAt: inviteRow?.expires_at || ''
        });

        return json({
          success: true,
          inviteId,
          email,
          role: inviteRole,
          token,
          inviteLink: link,
          expiresAt: inviteRow?.expires_at,
          emailSent: mailResult.sent,
          emailError: mailResult.sent ? undefined : mailResult.error
        }, 201);
      }

      // DELETE /api/ledgers/:id/invites/:inviteId: Revoke pending invite
      if (method === 'DELETE' && seg[3]) {
        const inviteId = decodeURIComponent(seg[3]);
        const res = await env.DB.prepare(
          `UPDATE ledger_invites SET status = 'revoked'
           WHERE id = ? AND ledger_id = ? AND status = 'pending'`
        ).bind(inviteId, ledger.id).run();

        const changes = res?.meta?.changes ?? res?.changes ?? 0;
        if (changes === 0) {
          return fail(ERROR_CODES.NOT_FOUND, 404, 'Pending invite not found.', requestId);
        }
        return json({ success: true, revokedInviteId: inviteId });
      }
    }

    // ---- Sub-resource: Collaborator Shares (/api/ledgers/:id/shares/:userId) ----
    if (seg[2] === 'shares' && seg[3]) {
      const targetUserId = decodeURIComponent(seg[3]);
      const targetShare = await env.DB.prepare(
        'SELECT role FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
      ).bind(ledger.id, targetUserId).first();

      if (!targetShare) {
        return fail(ERROR_CODES.NOT_FOUND, 404, 'Collaborator not found.', requestId);
      }
      if (targetShare.role === 'admin' && role !== 'owner') {
        return fail(ERROR_CODES.FORBIDDEN, 403, 'Only the ledger owner can modify an admin collaborator.', requestId);
      }

      // PUT: Update collaborator role
      if (method === 'PUT') {
        let body = {};
        try {
          body = await request.json();
        } catch {
          return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid JSON body.', requestId);
        }

        const newRole = String(body.role || '').trim().toLowerCase();
        if (!ROLES.includes(newRole)) {
          return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid role.', requestId);
        }
        if (newRole === 'admin' && role !== 'owner') {
          return fail(ERROR_CODES.FORBIDDEN, 403, 'Only the ledger owner can grant admin access.', requestId);
        }

        await env.DB.prepare(
          'UPDATE ledger_shares SET role = ? WHERE ledger_id = ? AND user_id = ?'
        ).bind(newRole, ledger.id, targetUserId).run();

        return json({ success: true, updatedUserId: targetUserId, role: newRole });
      }

      // DELETE: Remove collaborator
      if (method === 'DELETE') {
        await env.DB.prepare(
          'DELETE FROM ledger_shares WHERE ledger_id = ? AND user_id = ?'
        ).bind(ledger.id, targetUserId).run();

        return json({ success: true, removedUserId: targetUserId });
      }
    }
  }

  return fail(ERROR_CODES.NOT_FOUND, 404, 'Endpoint not found.', requestId);
}

