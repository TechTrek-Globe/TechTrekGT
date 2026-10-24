// Cloudflare Email Worker handler
// Receives inbound forwarded emails at TT<token>.<journey_slug>@techtrekgt.com
// Parses the MIME payload and inserts a wayfinder_itinerary_item into D1.
//
// The email address IS the access control mechanism:
// - The token is unique, unguessable, and bound to a single user+journey row.
// - No sender address verification needed - only the inbox holder knows the address.
//
// Called from worker.js:  export default { fetch(...) {}, email(...) {} }

import { generateId } from '../../utils/id.js';

// ============================================================
// Minimal MIME text extractor (no npm deps - pure Workers runtime)
// ============================================================

function decodeBase64Url(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

function decodeQP(str) {
  // Decode quoted-printable soft line breaks and encoded chars
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Recursively walk a MIME message stream to extract plain-text and HTML parts
async function extractTextFromMime(message) {
  const rawBytes = [];
  const reader   = message.raw.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawBytes.push(...value);
  }
  const rawText = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(rawBytes));

  // Split headers from body on first blank line
  const headerBodySplit = rawText.indexOf('\r\n\r\n');
  const headerBlock = headerBodySplit !== -1 ? rawText.slice(0, headerBodySplit) : rawText;
  const bodyBlock   = headerBodySplit !== -1 ? rawText.slice(headerBodySplit + 4) : '';

  const headers = parseHeaders(headerBlock);
  const contentType = (headers['content-type'] || '').toLowerCase();

  // Multipart: find boundary and recurse into first text/* part
  if (contentType.includes('multipart')) {
    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (boundaryMatch) {
      const boundary = '--' + boundaryMatch[1];
      const parts    = bodyBlock.split(boundary);
      let plainText  = '';
      let htmlText   = '';
      for (const part of parts) {
        if (!part.trim() || part.trim() === '--') continue;
        const partSplit   = part.indexOf('\r\n\r\n');
        const partHeaders = parseHeaders(partSplit !== -1 ? part.slice(0, partSplit) : '');
        const partBody    = partSplit !== -1 ? part.slice(partSplit + 4) : '';
        const partCT      = (partHeaders['content-type'] || '').toLowerCase();
        const partEnc     = (partHeaders['content-transfer-encoding'] || '').toLowerCase();
        const decoded     = partEnc === 'base64'
          ? decodeBase64Url(partBody.replace(/\s/g, ''))
          : partEnc === 'quoted-printable' ? decodeQP(partBody) : partBody;
        if (partCT.includes('text/plain') && !plainText) plainText = decoded;
        if (partCT.includes('text/html')  && !htmlText)  htmlText  = decoded;
      }
      return plainText || stripHtmlTags(htmlText) || '';
    }
  }

  // Simple text body
  const enc = (headers['content-transfer-encoding'] || '').toLowerCase();
  if (enc === 'base64')           return decodeBase64Url(bodyBlock.replace(/\s/g, ''));
  if (enc === 'quoted-printable') return decodeQP(bodyBlock);
  return bodyBlock;
}

function parseHeaders(block) {
  const result = {};
  // Unfold multi-line headers
  const unfolded = block.replace(/\r\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      const name  = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      result[name] = value;
    }
  }
  return result;
}

function stripHtmlTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ============================================================
// Booking field extractor (runs on plain-text body)
// ============================================================

function extractBookingFields(subject, body, from) {
  const text     = (subject + ' ' + body).toLowerCase();
  const fullText = subject + ' ' + body;

  let item_type = 'other';
  if (/hotel|inn|hostel|accommodation|check.in|stay/.test(text))   item_type = 'hotel';
  if (/flight|airline|boarding|departs?/.test(text))                item_type = 'flight';
  if (/train|rail|intercity|pkp/.test(text))                        item_type = 'train';
  if (/tour|activity|excursion|ticket|experience/.test(text))        item_type = 'activity';
  if (/transfer|taxi|shuttle|car.rent/.test(text))                   item_type = 'transport';
  if (/restaurant|dining|reservation|table/.test(text))              item_type = 'dining';

  // Confirmation number extraction
  const confMatch = fullText.match(
    /(?:confirmation|booking|reservation|reference|conf\.?|ref\.?)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9]{5,14})/i
  );
  const confirmationNumber = confMatch ? confMatch[1] : null;

  // Check-in / arrival date
  const checkinMatch = fullText.match(
    /(?:check.in|arrival|from|departs?)[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );

  // Provider from From header
  const providerMatch = from.match(/^([^<]+?)\s*(?:<|$)/);
  const provider = providerMatch ? providerMatch[1].trim() : from;

  return {
    item_type,
    title:               subject.slice(0, 255) || 'Email import',
    provider:            provider || null,
    confirmation_number: confirmationNumber,
    raw_checkin:         checkinMatch ? checkinMatch[1] : null,
    snippet:             body.replace(/\s+/g, ' ').slice(0, 600),
  };
}

// ============================================================
// Main email handler (export from worker.js default object)
// ============================================================

export async function handleInboundEmail(message, env) {
  try {
    if (!env.DB) {
      console.error('[email-worker] DB binding not available');
      await message.setReject('Database unavailable');
      return;
    }

    // Recipient is the unique inbox address e.g. TT412312.poland2026@techtrekgt.com
    const to = (message.to || '').toLowerCase().trim();

    // Lookup inbox by email address - this IS the auth check
    const inbox = await env.DB.prepare(
      'SELECT * FROM wayfinder_email_inboxes WHERE email_address = ? AND is_active = 1'
    ).bind(to).first();

    if (!inbox) {
      // Unknown or deactivated inbox - silently drop (do not bounce to avoid address enumeration)
      console.warn('[email-worker] unrecognized inbox address:', to);
      return;
    }

    // Verify journey still exists and has an active owner
    const journey = await env.DB.prepare(
      'SELECT id, start_date, end_date FROM wayfinder_journeys WHERE id = ?'
    ).bind(inbox.journey_id).first();

    if (!journey) {
      console.warn('[email-worker] journey not found for inbox:', inbox.id);
      return;
    }

    // Parse subject and from from the message envelope
    const subject = message.headers?.get('subject') || 'Email booking';
    const from    = message.from || message.headers?.get('from') || '';

    // Extract plain-text body from MIME stream
    let bodyText = '';
    try {
      bodyText = await extractTextFromMime(message);
    } catch (parseErr) {
      console.warn('[email-worker] MIME parse fallback - snippet only:', parseErr.message);
    }

    const fields = extractBookingFields(subject, bodyText, from);

    const notes = [
      fields.confirmation_number ? `Confirmation: ${fields.confirmation_number}` : null,
      fields.raw_checkin ? `Check-in: ${fields.raw_checkin}` : null,
      `Source: email-forward`,
      `From: ${from}`,
      '',
      fields.snippet,
    ].filter(Boolean).join('\n');

    const itemId  = generateId();
    const auditId = generateId();
    const cntId   = generateId(); // for counter update audit

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO wayfinder_itinerary_items
         (id, journey_id, user_id, item_type, title, provider, notes,
          status, verification_status, visibility)
         VALUES (?,?,?,?,?,?,?,'imported','unverified','private')`
      ).bind(
        itemId, inbox.journey_id, inbox.user_id,
        fields.item_type, fields.title, fields.provider || null, notes
      ),
      env.DB.prepare(
        `UPDATE wayfinder_email_inboxes
         SET emails_received = emails_received + 1, last_received_at = ?
         WHERE id = ?`
      ).bind(new Date().toISOString(), inbox.id),
      env.DB.prepare(
        'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, details) VALUES (?,?,?,?,?,?,?)'
      ).bind(auditId, inbox.user_id, inbox.journey_id, 'itinerary_item', itemId, 'email_import',
             JSON.stringify({ from, subject: subject.slice(0, 200), item_type: fields.item_type }))
    ]);

    console.log(`[email-worker] imported ${fields.item_type} item ${itemId} for journey ${inbox.journey_id}`);

  } catch (err) {
    console.error('[email-worker] fatal error:', err);
    // Do not re-throw - silently absorb to prevent delivery bounce loops
  }
}
