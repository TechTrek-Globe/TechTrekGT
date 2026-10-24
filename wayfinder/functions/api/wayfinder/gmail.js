// Gmail OAuth integration - trip-date-scoped booking confirmation import
//
// Routes:
//   GET    /api/wayfinder/gmail?journey_id=   - get connection status
//   POST   /api/wayfinder/gmail/connect       - initiate OAuth flow (returns auth URL)
//   POST   /api/wayfinder/gmail/callback      - exchange auth code, store encrypted tokens
//   POST   /api/wayfinder/gmail/sync          - run trip-date-scoped sync
//   DELETE /api/wayfinder/gmail/:journeyId    - revoke and delete connection
//
// Security model:
//   - access + refresh tokens are AES-256-GCM encrypted before D1 storage
//   - sync is strictly bounded to journey start_date / end_date + 14-day pre-trip window
//   - scopes: https://www.googleapis.com/auth/gmail.readonly (read-only, no send/delete)
//   - state param in OAuth flow is HMAC-signed to prevent CSRF

import { generateId } from '../../utils/id.js';

const GMAIL_AUTH_URL    = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL   = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE    = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_SCOPE       = 'https://www.googleapis.com/auth/gmail.readonly openid email';
const OAUTH_REDIRECT    = 'https://techtrekgt.com/wayfinder/gmail-callback';

// Booking-related search keywords used in Gmail query
// Scoped to the specific journey date window by the `after:` / `before:` filters
const BOOKING_QUERY_TERMS = [
  'subject:(confirmation OR booking OR reservation OR "check-in" OR "check in" OR voucher OR ticket OR itinerary)',
  'from:(booking.com OR airbnb.com OR hotels.com OR expedia.com OR marriott.com OR hilton.com OR hyatt.com OR accor.com OR kkday.com OR getyourguide.com OR klm.com OR ryanair.com OR wizz.com OR lot.com OR delta.com OR united.com OR amtrak.com OR pkp.pl OR intercity.pl)',
].join(' ');

// ============================================================
// AES-256-GCM helpers (WebCrypto - runs natively in Workers)
// ============================================================

async function deriveKey(rawKey) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(rawKey), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('wf-gmail-v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptToken(plaintext, encKey) {
  const key = await deriveKey(encKey);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  // Encode as base64: iv (12 bytes) | ciphertext
  const combined = new Uint8Array(12 + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decryptToken(ciphertext, encKey) {
  const key = await deriveKey(encKey);
  const bytes = new Uint8Array(atob(ciphertext).split('').map(c => c.charCodeAt(0)));
  const iv  = bytes.slice(0, 12);
  const ct  = bytes.slice(12);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

// ============================================================
// OAuth state signing (HMAC-SHA256 to prevent CSRF)
// ============================================================

async function signState(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return btoa(JSON.stringify({ payload, sig: sigB64 }));
}

async function verifyState(stateParam, secret) {
  try {
    const { payload, sig } = JSON.parse(atob(stateParam));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = new Uint8Array(atob(sig).split('').map(c => c.charCodeAt(0)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));
    if (!valid) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ============================================================
// Token refresh helper
// ============================================================

async function refreshAccessToken(refreshToken, env) {
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json();
}

// ============================================================
// Booking parser - extract itinerary fields from email snippet
// ============================================================

function parseBookingFromEmail(message) {
  const snippet  = message.snippet || '';
  const headers  = (message.payload?.headers || []).reduce((acc, h) => {
    acc[h.name.toLowerCase()] = h.value;
    return acc;
  }, {});

  const subject  = headers['subject'] || '';
  const from     = headers['from']    || '';
  const dateStr  = headers['date']    || '';

  // Attempt to detect document/item type from subject keywords
  let item_type = 'other';
  const subjectLow = subject.toLowerCase();
  if (/hotel|inn|hostel|accommodation|check.in|stay/.test(subjectLow))   item_type = 'hotel';
  if (/flight|airline|boarding|depart/.test(subjectLow))                   item_type = 'flight';
  if (/train|rail|intercity|pkp|pkp.ic/.test(subjectLow))                  item_type = 'train';
  if (/tour|activity|excursion|ticket|experience/.test(subjectLow))         item_type = 'activity';
  if (/transfer|taxi|shuttle|car rental/.test(subjectLow))                  item_type = 'transport';
  if (/restaurant|dining|reservation|table/.test(subjectLow))               item_type = 'dining';

  // Extract confirmation number - covers most common formats (uppercase alphanum, 6-12 chars)
  const confirmMatch = (snippet + ' ' + subject).match(
    /(?:confirmation|booking|reservation|reference|conf|ref)[^\w]*([A-Z0-9]{5,14})/i
  );
  const confirmationNumber = confirmMatch ? confirmMatch[1] : null;

  // Extract check-in date if present
  const checkinMatch = (snippet + ' ' + subject).match(
    /(?:check.in|arrival|arrives?|from)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );

  return {
    gmail_message_id: message.id,
    item_type,
    title:   subject || 'Imported booking',
    provider:from.replace(/<[^>]+>/, '').trim() || null,
    notes:   confirmationNumber
               ? `Confirmation: ${confirmationNumber}\n\n${snippet.slice(0, 500)}`
               : snippet.slice(0, 500),
    raw_date: checkinMatch ? checkinMatch[1] : null,
    email_date: dateStr,
  };
}

// ============================================================
// Sync: fetch Gmail messages within journey date window
// ============================================================

async function syncGmailMessages(conn, journey, env) {
  const encKey = env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) throw new Error('TOKEN_ENCRYPTION_KEY not configured');

  // Refresh access token if expired or within 5 minutes of expiry
  let accessToken = await decryptToken(conn.encrypted_access_token, encKey);
  const expiryMs  = new Date(conn.token_expiry_at).getTime();
  if (Date.now() >= expiryMs - 5 * 60 * 1000) {
    const refreshToken = await decryptToken(conn.encrypted_refresh_token, encKey);
    const refreshed    = await refreshAccessToken(refreshToken, env);
    accessToken        = refreshed.access_token;
    const newExpiry    = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    const newEncrypted = await encryptToken(accessToken, encKey);

    await env.DB.prepare(
      'UPDATE wayfinder_gmail_connections SET encrypted_access_token = ?, token_expiry_at = ?, updated_at = ? WHERE id = ?'
    ).bind(newEncrypted, newExpiry, new Date().toISOString(), conn.id).run();
  }

  // Build date-scoped Gmail query
  // Pre-trip window: 14 days before journey start to catch early confirmations
  const startDate = new Date(journey.start_date);
  startDate.setDate(startDate.getDate() - 14);
  const endDate = new Date(journey.end_date);
  endDate.setDate(endDate.getDate() + 1); // inclusive

  const afterYMD  = startDate.toISOString().slice(0, 10).replace(/-/g, '/');
  const beforeYMD = endDate.toISOString().slice(0, 10).replace(/-/g, '/');
  const query     = `${BOOKING_QUERY_TERMS} after:${afterYMD} before:${beforeYMD}`;

  // Build list URL - use pageToken cursor for incremental sync if available
  const listParams = new URLSearchParams({ q: query, maxResults: '50' });
  if (conn.sync_cursor) listParams.set('pageToken', conn.sync_cursor);

  const listRes = await fetch(`${GMAIL_API_BASE}/messages?${listParams}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail list failed: ${listRes.status} ${errText}`);
  }
  const listData  = await listRes.json();
  const messages  = listData.messages || [];
  const nextCursor = listData.nextPageToken || null;

  let imported = 0;

  for (const msgRef of messages) {
    // Check for duplicate import by gmail_message_id in notes prefix
    const dupCheck = await env.DB.prepare(
      `SELECT id FROM wayfinder_itinerary_items
       WHERE journey_id = ? AND user_id = ? AND notes LIKE ?`
    ).bind(journey.id, conn.user_id, `%gmail:${msgRef.id}%`).first();
    if (dupCheck) continue;

    // Fetch full message metadata (no body download - headers + snippet only)
    const msgRes = await fetch(
      `${GMAIL_API_BASE}/messages/${msgRef.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const message = await msgRes.json();

    const parsed  = parseBookingFromEmail(message);
    const itemId  = generateId();
    const auditId = generateId();

    const notesWithId = `gmail:${msgRef.id}\n${parsed.notes}`;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wayfinder_itinerary_items
         (id, journey_id, user_id, item_type, title, provider,
          notes, status, verification_status, visibility)
         VALUES (?,?,?,?,?,?,?,'imported','unverified','private')`
      ).bind(
        itemId, journey.id, conn.user_id,
        parsed.item_type, parsed.title, parsed.provider || null,
        notesWithId
      ),
      env.DB.prepare(
        'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, details) VALUES (?,?,?,?,?,?,?)'
      ).bind(auditId, conn.user_id, journey.id, 'itinerary_item', itemId, 'gmail_import',
             JSON.stringify({ gmail_message_id: msgRef.id, item_type: parsed.item_type }))
    ]);

    imported++;
  }

  // Update connection: last sync, count, and cursor for next incremental run
  await env.DB.prepare(
    `UPDATE wayfinder_gmail_connections
     SET last_sync_at = ?, last_sync_count = last_sync_count + ?, sync_cursor = ?, updated_at = ?
     WHERE id = ?`
  ).bind(new Date().toISOString(), imported, nextCursor, new Date().toISOString(), conn.id).run();

  return { imported, has_more: !!nextCursor };
}

// ============================================================
// Main handler
// ============================================================

export async function handleGmail(context, url, method) {
  const { env, user, request } = context;
  const parts  = url.pathname.split('/').filter(Boolean);
  const gIdx   = parts.indexOf('gmail');
  const subpath = gIdx !== -1 ? (parts[gIdx + 1] || null) : null;

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);

    const isConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY);

    // GET - connection status for a journey
    if (method === 'GET') {
      const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      const journey = await env.DB.prepare(
        `SELECT id FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND (created_by = ? OR visibility = 'public')`
      ).bind(journeyId, journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      if (!isConfigured) {
        return json({
          configured: false,
          connected: false,
          connection: null,
          message: 'Google OAuth credentials pending configuration in Cloudflare secrets'
        });
      }

      const conn = await env.DB.prepare(
        'SELECT id, gmail_address, scopes, last_sync_at, last_sync_count, is_active, created_at FROM wayfinder_gmail_connections WHERE user_id = ? AND journey_id = ?'
      ).bind(user.userId, journey.id).first();

      return json({
        configured: true,
        connected: Boolean(conn && conn.is_active),
        connection: conn ? safeConn(conn) : null
      });
    }

    if (!isConfigured) {
      return json({
        error: 'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured in Cloudflare Worker secrets.'
      }, 503);
    }

    // POST /connect - generate OAuth authorization URL
    if (method === 'POST' && subpath === 'connect') {
      const body      = await request.json().catch(() => ({}));
      const journeyId = body.journey_id || body.journeyId;
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      const journey = await env.DB.prepare(
        `SELECT id, slug, start_date, end_date FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND (created_by = ? OR visibility = 'public')`
      ).bind(journeyId, journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);
      journey.start_date = journey.start_date || (journey.slug === 'poland-christmas-2026' ? '2026-12-03' : null);
      journey.end_date   = journey.end_date   || (journey.slug === 'poland-christmas-2026' ? '2026-12-14' : null);
      if (!journey.start_date || !journey.end_date) {
        return json({ error: 'Journey must have start_date and end_date before connecting Gmail' }, 422);
      }

      const statePayload = JSON.stringify({
        userId:    user.userId,
        journeyId: journey.id,
        nonce:     crypto.randomUUID(),
      });
      const signedState = await signState(statePayload, env.JWT_SECRET);

      const authParams = new URLSearchParams({
        client_id:     env.GOOGLE_CLIENT_ID,
        redirect_uri:  OAUTH_REDIRECT,
        response_type: 'code',
        scope:         GMAIL_SCOPE,
        access_type:   'offline',
        prompt:        'consent',  // always request refresh_token
        state:         signedState,
      });

      return json({ auth_url: `${GMAIL_AUTH_URL}?${authParams}` });
    }

    // POST /callback - exchange auth code for tokens and store encrypted
    if (method === 'POST' && subpath === 'callback') {
      const body = await request.json().catch(() => ({}));
      const { code, state } = body;
      if (!code || !state) return json({ error: 'code and state required' }, 400);

      const stateData = await verifyState(state, env.JWT_SECRET);
      if (!stateData) return json({ error: 'Invalid or tampered OAuth state' }, 400);
      if (stateData.userId !== user.userId) return json({ error: 'State user mismatch' }, 403);

      const journey = await env.DB.prepare(
        `SELECT id, slug, start_date, end_date FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND (created_by = ? OR visibility = 'public')`
      ).bind(stateData.journeyId, stateData.journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      // Exchange code for tokens
      const tokenRes = await fetch(GMAIL_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri:  OAUTH_REDIRECT,
          grant_type:    'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[gmail/callback] token exchange failed:', err);
        return json({ error: 'Token exchange failed' }, 502);
      }
      const tokens = await tokenRes.json();
      if (!tokens.refresh_token) {
        return json({ error: 'No refresh token returned - re-authorize with prompt=consent' }, 422);
      }

      // Fetch Gmail account address to confirm which account was linked
      const profileRes = await fetch(`${GMAIL_API_BASE}/profile`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = profileRes.ok ? await profileRes.json() : {};
      const gmailAddress = profile.emailAddress || 'unknown';

      const encKey    = env.TOKEN_ENCRYPTION_KEY;
      const encAccess = await encryptToken(tokens.access_token,  encKey);
      const encRefresh= await encryptToken(tokens.refresh_token, encKey);
      const expiry    = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      const scopes    = tokens.scope || GMAIL_SCOPE;

      const id       = generateId();
      const auditId  = generateId();

      // Upsert connection (replace if a prior revoked connection exists)
      const existing = await env.DB.prepare(
        'SELECT id FROM wayfinder_gmail_connections WHERE user_id = ? AND journey_id = ?'
      ).bind(user.userId, journey.id).first();

      if (existing) {
        await env.DB.prepare(
          `UPDATE wayfinder_gmail_connections
           SET gmail_address = ?, encrypted_access_token = ?, encrypted_refresh_token = ?,
               token_expiry_at = ?, scopes = ?, is_active = 1, revoked_at = NULL,
               sync_cursor = NULL, updated_at = ?
           WHERE id = ?`
        ).bind(gmailAddress, encAccess, encRefresh, expiry, scopes,
               new Date().toISOString(), existing.id).run();
      } else {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO wayfinder_gmail_connections
             (id, user_id, journey_id, gmail_address, encrypted_access_token,
              encrypted_refresh_token, token_expiry_at, scopes)
             VALUES (?,?,?,?,?,?,?,?)`
          ).bind(id, user.userId, journey.id, gmailAddress, encAccess, encRefresh, expiry, scopes),
          env.DB.prepare(
            'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
          ).bind(auditId, user.userId, journey.id, 'gmail_connection', id, 'connect')
        ]);
      }

      return json({ success: true, gmail_address: gmailAddress });
    }

    // POST /sync - run incremental trip-date-scoped sync
    if (method === 'POST' && subpath === 'sync') {
      const body      = await request.json().catch(() => ({}));
      const journeyId = body.journey_id || body.journeyId;
      if (!journeyId) return json({ error: 'journey_id required' }, 400);

      const journey = await env.DB.prepare(
        `SELECT id, slug, start_date, end_date FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND (created_by = ? OR visibility = 'public')`
      ).bind(journeyId, journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);
      journey.start_date = journey.start_date || (journey.slug === 'poland-christmas-2026' ? '2026-12-03' : null);
      journey.end_date   = journey.end_date   || (journey.slug === 'poland-christmas-2026' ? '2026-12-14' : null);
      if (!journey.start_date || !journey.end_date) {
        return json({ error: 'Journey must have start_date and end_date set before syncing' }, 422);
      }

      const conn = await env.DB.prepare(
        'SELECT * FROM wayfinder_gmail_connections WHERE user_id = ? AND journey_id = ? AND is_active = 1'
      ).bind(user.userId, journey.id).first();
      if (!conn) return json({ error: 'No active Gmail connection for this journey' }, 404);

      const result = await syncGmailMessages(conn, journey, env);
      return json({ success: true, ...result });
    }

    // DELETE /:journeyId - revoke and remove connection
    if (method === 'DELETE' && subpath) {
      const journeyId = subpath;
      const journey = await env.DB.prepare(
        `SELECT id FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND (created_by = ? OR visibility = 'public')`
      ).bind(journeyId, journeyId, user.userId).first();
      if (!journey) return json({ error: 'Journey not found' }, 404);

      const conn = await env.DB.prepare(
        'SELECT * FROM wayfinder_gmail_connections WHERE user_id = ? AND journey_id = ?'
      ).bind(user.userId, journey.id).first();
      if (!conn) return json({ error: 'Connection not found' }, 404);

      // Attempt to revoke token at Google (best-effort)
      try {
        const encKey      = env.TOKEN_ENCRYPTION_KEY;
        const refreshToken = await decryptToken(conn.encrypted_refresh_token, encKey);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
        });
      } catch (e) {
        console.warn('[gmail/revoke] best-effort revoke failed:', e.message);
      }

      const auditId = generateId();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE wayfinder_gmail_connections
           SET is_active = 0, revoked_at = ?, encrypted_access_token = '', encrypted_refresh_token = '', updated_at = ?
           WHERE id = ?`
        ).bind(new Date().toISOString(), new Date().toISOString(), conn.id),
        env.DB.prepare(
          'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action) VALUES (?,?,?,?,?,?)'
        ).bind(auditId, user.userId, journey.id, 'gmail_connection', conn.id, 'revoke')
      ]);

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[gmail] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function safeConn(conn) {
  return {
    id:              conn.id,
    gmail_address:   conn.gmail_address,
    scopes:          conn.scopes,
    is_active:       conn.is_active === 1,
    last_sync_at:    conn.last_sync_at,
    last_sync_count: conn.last_sync_count,
    created_at:      conn.created_at,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
