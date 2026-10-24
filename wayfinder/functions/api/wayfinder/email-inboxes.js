// GET  /api/wayfinder/email-inboxes?journey_id=
// POST /api/wayfinder/email-inboxes - provision unique inbox for user+journey
// DELETE /api/wayfinder/email-inboxes/:id - deactivate inbox

import { generateId } from '../../utils/id.js';

const DOMAIN = 'techtrekgt.com';

// Generates a short numeric token, e.g. "412312"
function generateInboxToken() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 900000 + 100000); // 6-digit range 100000-999999
}

// Builds the full email address from token + journey slug
// Result: TT412312.poland2026@techtrekgt.com
function buildEmailAddress(token, journeySlug) {
  const safeslug = journeySlug.replace(/[^a-z0-9\-]/gi, '').toLowerCase();
  return `TT${token}.${safeslug}@${DOMAIN}`;
}

export async function handleEmailInboxes(context, url, method) {
  const { env, user, request } = context;
  const parts  = url.pathname.split('/').filter(Boolean);
  const idx    = parts.indexOf('email-inboxes');
  const inboxId = idx !== -1 ? (parts[idx + 1] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    // --- GET: return the inbox for this user+journey ---
    if (method === 'GET') {
      const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      const journey = await env.DB.prepare(
        `SELECT id, slug FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND created_by = ?`
      ).bind(journeyId, journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      const inbox = await env.DB.prepare(
        'SELECT * FROM wayfinder_email_inboxes WHERE user_id = ? AND journey_id = ?'
      ).bind(user.userId, journey.id).first();

      return json({ inbox: inbox ? safeInbox(inbox) : null });
    }

    // --- POST: provision a new inbox (idempotent - returns existing if already provisioned) ---
    if (method === 'POST') {
      const body      = await request.json().catch(() => ({}));
      const journeyId = body.journey_id || body.journeyId;
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      const journey = await env.DB.prepare(
        `SELECT id, slug FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND created_by = ?`
      ).bind(journeyId, journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      // Idempotent: return existing active inbox if one already exists
      const existing = await env.DB.prepare(
        'SELECT * FROM wayfinder_email_inboxes WHERE user_id = ? AND journey_id = ?'
      ).bind(user.userId, journey.id).first();
      if (existing) return json({ inbox: safeInbox(existing), created: false });

      // Provision new unique inbox
      const token    = generateInboxToken();
      const address  = buildEmailAddress(token, journey.slug);
      const id       = generateId();
      const auditId  = generateId();

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO wayfinder_email_inboxes
           (id, user_id, journey_id, inbox_token, email_address)
           VALUES (?,?,?,?,?)`
        ).bind(id, user.userId, journey.id, token, address),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, journey.id, 'email_inbox', id, 'provision')
      ]);

      const inbox = await env.DB.prepare(
        'SELECT * FROM wayfinder_email_inboxes WHERE id = ?'
      ).bind(id).first();

      return json({ inbox: safeInbox(inbox), created: true }, 201);
    }

    // --- DELETE: deactivate inbox ---
    if (method === 'DELETE' && inboxId) {
      const inbox = await env.DB.prepare(
        'SELECT * FROM wayfinder_email_inboxes WHERE id = ? AND user_id = ?'
      ).bind(inboxId, user.userId).first();
      if (!inbox) return json({ error: 'Inbox not found' }, 404);

      const auditId = generateId();
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE wayfinder_email_inboxes SET is_active = 0 WHERE id = ?'
        ).bind(inboxId),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, inbox.journey_id, 'email_inbox', inboxId, 'deactivate')
      ]);

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[email-inboxes] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function safeInbox(inbox) {
  return {
    id:              inbox.id,
    journey_id:      inbox.journey_id,
    email_address:   inbox.email_address,
    is_active:       inbox.is_active === 1,
    emails_received: inbox.emails_received,
    last_received_at:inbox.last_received_at,
    created_at:      inbox.created_at,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
