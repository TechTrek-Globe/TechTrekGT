// Shared agenda collaboration API.
//   POST   /api/wayfinder/agendas/:id/invites            create invite (owner/admin)
//   GET    /api/wayfinder/agendas/:id/invites            list invites + collaborators (owner/admin)
//   DELETE /api/wayfinder/agendas/:id/invites/:inviteId  revoke pending invite (owner/admin)
//   PUT    /api/wayfinder/agendas/:id/shares/:userId     change collaborator role (owner/admin)
//   DELETE /api/wayfinder/agendas/:id/shares/:userId     remove collaborator (owner/admin)
//   GET    /api/wayfinder/agendas/:id/access             caller role on agenda
//   GET    /api/wayfinder/invites/verify?token=          public token inspection
//   POST   /api/wayfinder/invites/claim                  accept invite (session required)

import { generateId } from '../../utils/id.js';
import { checkRateLimit } from '../../utils/rateLimit.js';
import { sendInviteEmail } from '../../utils/inviteEmail.js';
import { ensureShareTables, resolveAgendaAccess, canManage, sha256Hex } from '../../utils/agendaAccess.js';

const ROLES = ['viewer', 'editor', 'admin'];
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function publicOrigin(url) {
  return /techtrekgt\.com$/.test(url.hostname) || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    ? url.origin
    : 'https://techtrekgt.com';
}

async function lookupInvite(env, token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const hash = await sha256Hex(token);
  return env.DB.prepare(
    `SELECT i.*, j.title AS agenda_title, j.slug AS agenda_slug, j.created_by AS owner_id,
            (i.expires_at <= datetime('now')) AS is_expired
     FROM wayfinder_agenda_invites i
     JOIN wayfinder_journeys j ON j.id = i.agenda_id
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

export async function handleAgendaShares(context, url, method) {
  const { env, user, request } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const wfIdx = parts.lastIndexOf('wayfinder');
  const seg = parts.slice(wfIdx + 1); // e.g. ['agendas', id, 'invites', inviteId]

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);
    await ensureShareTables(env.DB);

    // ---- Public: verify token ----
    if (seg[0] === 'invites' && seg[1] === 'verify' && method === 'GET') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rl = await checkRateLimit(env.RATE_LIMIT_KV, `invite-verify:${ip}`, 30, 60);
      if (!rl.allowed) return json({ error: 'Too many requests' }, 429);

      const invite = await lookupInvite(env, url.searchParams.get('token'));
      const state = inviteState(invite);
      if (state !== 'valid') return json({ valid: false, reason: state }, state === 'invalid' ? 404 : 410);

      const [existingUser, inviter] = await Promise.all([
        env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(invite.invited_email).first(),
        env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(invite.invited_by).first(),
      ]);
      return json({
        valid: true,
        agendaTitle: invite.agenda_title,
        agendaSlug: invite.agenda_slug,
        role: invite.role,
        invitedEmail: invite.invited_email,
        inviterName: inviter?.name || inviter?.email || 'A traveler',
        expiresAt: invite.expires_at,
        accountExists: Boolean(existingUser),
      });
    }

    if (!user?.userId) return json({ error: 'Unauthorized' }, 401);

    // ---- Claim ----
    if (seg[0] === 'invites' && seg[1] === 'claim' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const invite = await lookupInvite(env, body.token);
      const state = inviteState(invite);
      if (state !== 'valid') return json({ error: `Invitation is ${state}`, reason: state }, state === 'invalid' ? 404 : 410);

      if (String(user.email || '').toLowerCase() !== String(invite.invited_email).toLowerCase()) {
        return json({ error: 'This invitation was sent to a different email address.', reason: 'email_mismatch', invitedEmail: invite.invited_email }, 403);
      }
      if (invite.owner_id === user.userId) {
        return json({ error: 'You already own this agenda.', reason: 'owner' }, 400);
      }

      const shareId = generateId();
      const results = await env.DB.batch([
        env.DB.prepare(
          `UPDATE wayfinder_agenda_invites
           SET status = 'accepted', accepted_at = datetime('now'), accepted_by = ?
           WHERE id = ? AND status = 'pending' AND expires_at > datetime('now')`
        ).bind(user.userId, invite.id),
        env.DB.prepare(
          `INSERT INTO wayfinder_agenda_shares (id, agenda_id, user_id, role, invite_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(agenda_id, user_id) DO UPDATE SET
             role = CASE
               WHEN (CASE excluded.role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END)
                  > (CASE wayfinder_agenda_shares.role WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END)
               THEN excluded.role ELSE wayfinder_agenda_shares.role END`
        ).bind(shareId, invite.agenda_id, user.userId, invite.role, invite.id),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(generateId(), user.userId, invite.agenda_id, 'agenda_invite', invite.id, 'accept'),
      ]);
      if (!results[0]?.meta?.changes) {
        return json({ error: 'Invitation could not be claimed (already used or expired).', reason: 'used' }, 409);
      }
      return json({ success: true, agendaId: invite.agenda_id, slug: invite.agenda_slug, role: invite.role });
    }

    // ---- Agenda scoped routes ----
    if (seg[0] === 'agendas' && seg[1]) {
      const { journey, role } = await resolveAgendaAccess(env, decodeURIComponent(seg[1]), user);
      if (!journey) return json({ error: 'Agenda not found' }, 404);

      if (seg[2] === 'access' && method === 'GET') {
        return json({ agendaId: journey.id, slug: journey.slug, role });
      }

      if (!canManage(role)) return json({ error: 'Forbidden' }, 403);

      if (seg[2] === 'invites') {
        if (method === 'GET' && !seg[3]) {
          const invites = await env.DB.prepare(
            `SELECT id, invited_email, role, status, created_at, expires_at, accepted_at,
                    (expires_at <= datetime('now')) AS is_expired
             FROM wayfinder_agenda_invites WHERE agenda_id = ? ORDER BY created_at DESC`
          ).bind(journey.id).all();
          const shares = await env.DB.prepare(
            `SELECT s.user_id, s.role, s.created_at, u.email, u.name
             FROM wayfinder_agenda_shares s LEFT JOIN users u ON u.id = s.user_id
             WHERE s.agenda_id = ? ORDER BY s.created_at`
          ).bind(journey.id).all();
          return json({ invites: invites.results || [], shares: shares.results || [], myRole: role });
        }

        if (method === 'POST' && !seg[3]) {
          const rl = await checkRateLimit(env.RATE_LIMIT_KV, `invite-create:${user.userId}`, 20, 3600);
          if (!rl.allowed) return json({ error: 'Too many invitations. Try again later.' }, 429);

          const body = await request.json().catch(() => ({}));
          const email = String(body.email || '').trim().toLowerCase();
          const inviteRole = String(body.role || 'viewer');
          if (!EMAIL_REGEX.test(email) || email.length > 254) return json({ error: 'Valid email required' }, 400);
          if (!ROLES.includes(inviteRole)) return json({ error: 'Invalid role' }, 400);
          if (inviteRole === 'admin' && role !== 'owner') return json({ error: 'Only the owner can grant admin access' }, 403);

          const already = await env.DB.prepare(
            `SELECT 1 AS x FROM wayfinder_agenda_shares s JOIN users u ON u.id = s.user_id
             WHERE s.agenda_id = ? AND u.email = ?`
          ).bind(journey.id, email).first();
          if (already) return json({ error: 'That person already has access.' }, 409);

          const token = newToken();
          const tokenHash = await sha256Hex(token);
          const inviteId = generateId();
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE wayfinder_agenda_invites SET status = 'revoked'
               WHERE agenda_id = ? AND invited_email = ? AND status = 'pending'`
            ).bind(journey.id, email),
            env.DB.prepare(
              `INSERT INTO wayfinder_agenda_invites
               (id, agenda_id, invited_email, role, token_hash, status, invited_by, expires_at)
               VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now', '+7 days'))`
            ).bind(inviteId, journey.id, email, inviteRole, tokenHash, user.userId),
            env.DB.prepare(
              'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
            ).bind(generateId(), user.userId, journey.id, 'agenda_invite', inviteId, 'create'),
          ]);

          const row = await env.DB.prepare('SELECT expires_at FROM wayfinder_agenda_invites WHERE id = ?').bind(inviteId).first();
          const link = `${publicOrigin(url)}/wayfinder/invite?token=${token}`;
          const mail = await sendInviteEmail(env, {
            to: email,
            inviterName: user.name || user.email || 'A traveler',
            agendaTitle: journey.title,
            role: inviteRole,
            link,
            expiresAt: row?.expires_at || '',
          });
          return json({
            success: true,
            inviteId,
            email,
            role: inviteRole,
            token,
            inviteLink: link,
            expiresAt: row?.expires_at,
            emailSent: mail.sent,
            emailError: mail.sent ? undefined : mail.error,
          }, 201);
        }

        if (method === 'DELETE' && seg[3]) {
          const res = await env.DB.prepare(
            `UPDATE wayfinder_agenda_invites SET status = 'revoked'
             WHERE id = ? AND agenda_id = ? AND status = 'pending'`
          ).bind(seg[3], journey.id).run();
          if (!res.meta?.changes) return json({ error: 'Pending invite not found' }, 404);
          return json({ success: true });
        }
      }

      if (seg[2] === 'shares' && seg[3]) {
        const targetId = decodeURIComponent(seg[3]);
        const target = await env.DB.prepare(
          'SELECT role FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?'
        ).bind(journey.id, targetId).first();
        if (!target) return json({ error: 'Collaborator not found' }, 404);
        if (target.role === 'admin' && role !== 'owner') return json({ error: 'Only the owner can modify an admin' }, 403);

        if (method === 'PUT') {
          const body = await request.json().catch(() => ({}));
          const newRole = String(body.role || '');
          if (!ROLES.includes(newRole)) return json({ error: 'Invalid role' }, 400);
          if (newRole === 'admin' && role !== 'owner') return json({ error: 'Only the owner can grant admin access' }, 403);
          await env.DB.prepare(
            'UPDATE wayfinder_agenda_shares SET role = ? WHERE agenda_id = ? AND user_id = ?'
          ).bind(newRole, journey.id, targetId).run();
          return json({ success: true });
        }
        if (method === 'DELETE') {
          await env.DB.prepare(
            'DELETE FROM wayfinder_agenda_shares WHERE agenda_id = ? AND user_id = ?'
          ).bind(journey.id, targetId).run();
          return json({ success: true });
        }
      }
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('[agenda-shares] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}
