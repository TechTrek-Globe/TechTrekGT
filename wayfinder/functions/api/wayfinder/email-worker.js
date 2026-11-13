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
import { parseBookingWithGemini, extractPdfText } from './gemini-parser.js';
import { getAgendaMembers } from '../../utils/agendaAccess.js';
import {
  ensureDocumentBlobsTable,
  buildBlobStatements,
  base64ToBytes,
  bytesToBase64,
  sha256HexBytes,
  MAX_D1_BLOB_SIZE,
} from '../../utils/documentBlobs.js';

// ============================================================
// Minimal MIME text & attachment extractor (pure Workers runtime)
// ============================================================

function parseCharset(contentType = '') {
  const m = String(contentType).match(/charset="?([A-Za-z0-9_\-]+)"?/i);
  return (m ? m[1] : 'utf-8').toLowerCase();
}

function decodeBytes(bytes, charset = 'utf-8') {
  if (!bytes || bytes.byteLength === 0) return '';
  try {
    return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function decodeBase64Bytes(str) {
  try {
    return base64ToBytes(str);
  } catch {
    return new Uint8Array(0);
  }
}

function decodeQPBytes(str) {
  const unfolded = String(str || '').replace(/=\r?\n/g, '');
  const out = [];
  const utf8Enc = new TextEncoder();
  for (let i = 0; i < unfolded.length; i++) {
    const ch = unfolded[i];
    if (ch === '=' && i + 2 < unfolded.length && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      out.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    const code = unfolded.charCodeAt(i);
    if (code < 128) {
      out.push(code);
    } else {
      const encoded = utf8Enc.encode(unfolded[i]);
      for (const b of encoded) out.push(b);
    }
  }
  return new Uint8Array(out);
}

function decodeQPText(str, charset = 'utf-8') {
  return decodeBytes(decodeQPBytes(str), charset);
}

export function decodeRfc2047(value = '') {
  if (!value || typeof value !== 'string' || !value.includes('=?')) return value || '';
  const collapsed = value.replace(/\?=\s+=\?/g, '?==?');
  return collapsed.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, data) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return decodeBytes(decodeBase64Bytes(data), charset);
      }
      const qData = data.replace(/_/g, ' ');
      return decodeQPText(qData, charset);
    } catch {
      return _;
    }
  });
}

function splitHeaderAndBody(raw = '') {
  const match = String(raw).match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return { headerBlock: raw, bodyBlock: '' };
  }
  return {
    headerBlock: raw.slice(0, match.index),
    bodyBlock: raw.slice(match.index + match[0].length),
  };
}

// Recursively walk a MIME message stream to extract plain-text and decode attachments (PDF, calendar, etc.)
export function extractMimeContent(headerBlock, bodyBlock) {
  const headers = parseHeaders(headerBlock);
  const contentTypeRaw = headers['content-type'] || '';
  const contentType = contentTypeRaw.toLowerCase();
  const charset = parseCharset(contentTypeRaw);
  const disposition = (headers['content-disposition'] || '').toLowerCase();

  // Nested multipart (e.g. multipart/mixed -> multipart/alternative)
  if (contentType.includes('multipart')) {
    const boundaryMatch = contentTypeRaw.match(/boundary="?([^";\r\n]+)"?/i);
    if (boundaryMatch) {
      const boundary = '--' + boundaryMatch[1];
      const parts = bodyBlock.split(boundary);
      let combined = '';
      const attachments = [];
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed || trimmed === '--' || trimmed.startsWith('--\n') || trimmed.startsWith('--\r\n')) continue;
        const { headerBlock: pHeaders, bodyBlock: pBody } = splitHeaderAndBody(part.replace(/^\r?\n/, ''));
        const res = extractMimeContent(pHeaders, pBody);
        if (res.text) combined += ' ' + res.text;
        if (res.attachments?.length) attachments.push(...res.attachments);
      }
      return { text: combined.trim(), attachments };
    }
  }

  const enc = (headers['content-transfer-encoding'] || '').toLowerCase().trim();
  const rawFilenameMatch = headers['content-disposition']?.match(/filename\*?=(?:UTF-8''|"?)([^";\r\n]+)"?/i)
    || contentTypeRaw.match(/name="?([^";\r\n]+)"?/i);
  const decodedFilename = rawFilenameMatch ? decodeRfc2047(decodeURIComponentSafe(rawFilenameMatch[1].trim())) : null;
  const isPdfPart = contentType.includes('application/pdf') || Boolean(decodedFilename && decodedFilename.toLowerCase().endsWith('.pdf'));
  const isAttachment = disposition.includes('attachment') || isPdfPart || (Boolean(decodedFilename) && !contentType.includes('text/plain') && !contentType.includes('text/html'));

  if (isAttachment) {
    const fname = decodedFilename || (isPdfPart ? 'ticket.pdf' : 'attachment.bin');
    let bytes;
    if (enc === 'base64') {
      bytes = decodeBase64Bytes(bodyBlock.replace(/\s/g, ''));
    } else if (enc === 'quoted-printable') {
      bytes = decodeQPBytes(bodyBlock);
    } else {
      bytes = new TextEncoder().encode(bodyBlock || '');
    }

    const mimeType = (contentType.split(';')[0].trim() || (isPdfPart ? 'application/pdf' : 'application/octet-stream')).toLowerCase();
    let attachedText = '';
    if ((mimeType === 'application/pdf' || fname.toLowerCase().endsWith('.pdf')) && bytes.byteLength > 0 && bytes.byteLength <= MAX_D1_BLOB_SIZE) {
      try {
        attachedText = extractPdfText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) || '';
      } catch {
        attachedText = '';
      }
    }

    const base64Clean = bytes.byteLength > 0 && bytes.byteLength <= 4 * 1024 * 1024
      ? bytesToBase64(bytes)
      : null;

    return {
      text: attachedText,
      attachments: [{
        filename: fname,
        mimeType,
        sizeBytes: bytes.byteLength,
        bytes,
        base64: base64Clean,
      }]
    };
  }

  // Single text part
  let decoded = '';
  if (enc === 'base64') {
    decoded = decodeBytes(decodeBase64Bytes(bodyBlock.replace(/\s/g, '')), charset);
  } else if (enc === 'quoted-printable') {
    decoded = decodeQPText(bodyBlock, charset);
  } else {
    decoded = bodyBlock || '';
  }

  if (contentType.includes('text/html')) {
    decoded = stripHtmlTags(decoded);
  }

  return { text: decoded || '', attachments: [] };
}

function decodeURIComponentSafe(val) {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

export async function extractContentFromMime(message) {
  let rawText = '';
  try {
    if (typeof message.raw?.text === 'function') {
      rawText = await message.raw.text();
    } else if (message.raw) {
      const buf = await new Response(message.raw).arrayBuffer();
      rawText = decodeBytes(new Uint8Array(buf), 'utf-8');
    }
  } catch (streamErr) {
    console.warn('[email-worker] failed to read raw stream:', streamErr);
  }

  if (!rawText) return { text: '', attachments: [] };

  const { headerBlock, bodyBlock } = splitHeaderAndBody(rawText);
  const res = extractMimeContent(headerBlock, bodyBlock);
  if (!res.text || res.text.length < 20) {
    const qpFallback = stripHtmlTags(decodeQPText(rawText, 'utf-8')).replace(/\r?\n+/g, ' ').trim();
    if (qpFallback.length > (res.text || '').length) {
      res.text = qpFallback.slice(0, 5000);
    }
  }

  return res;
}

function parseHeaders(block) {
  const result = {};
  const unfolded = String(block || '').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      const name = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      result[name] = value;
    }
  }
  return result;
}

function stripHtmlTags(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ============================================================
// Booking field extractor (runs on plain-text body)
// ============================================================

function extractBookingCost(text) {
  const match = text.match(/(?:total(?:[\s_]+(?:cost|price|fare|amount|charges|paid))?|amount[\s_]+paid|grand[\s_]+total|fare|booking[\s_]+total|price|cena|kwota|zapłacono|razem|płatność|koszt)[\s:]*([$€£]?\s*[\d\s,.]+(?:\.\d{2}|,\d{2})?\s*(?:usd|pln|eur|gbp|zł)?)/i);
  if (!match) return null;

  const rawStr = match[1].trim();
  let currency = 'USD';
  if (rawStr.toUpperCase().includes('PLN') || rawStr.includes('zł')) {
    currency = 'PLN';
  } else if (rawStr.toUpperCase().includes('EUR') || rawStr.includes('€')) {
    currency = 'EUR';
  } else if (rawStr.toUpperCase().includes('USD') || rawStr.includes('$')) {
    currency = 'USD';
  }

  let cleanStr = rawStr;
  if (/,\d{2}(?!\d)/.test(cleanStr)) {
    cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
  } else {
    cleanStr = cleanStr.replace(/,/g, '');
  }

  const numMatch = cleanStr.match(/\d+(?:\.\d+)?/);
  const amount = numMatch ? parseFloat(numMatch[0]) : NaN;
  if (isNaN(amount) || amount <= 0) return null;

  return { amount, currency };
}

function mapDocTypeToExpenseCategory(docType) {
  const map = {
    flight: 'flight',
    hotel: 'lodging',
    rail: 'transit',
    transfer: 'transit',
    transport: 'transit',
    tour: 'activity',
    excursion: 'activity',
    restaurant: 'dining',
  };
  return map[docType?.toLowerCase()] || 'other';
}

export function parseGetYourGuideEmail(fullText, subject = '', from = '') {
  const text = fullText || '';
  const subj = subject || '';

  // 1. Activity title & participants line
  // GetYourGuide email template structure:
  // <Activity Title>
  // 2 Adults (Age 17 - 99) • English • 11 hours
  // $ 284.76
  const actMatch = text.match(/([^\r\n]+)\s*\r?\n\s*(\d+\s+Adults?[^\r\n]*•[^\r\n]*•[^\r\n]*)/i)
    || text.match(/booking\s+summary[\s\S]*?([A-Za-z0-9\s&,–\-]{5,80})\s*\r?\n\s*(\d+\s+Adults?)/i);

  let rawActivity = actMatch ? actMatch[1].trim() : '';
  let participantLine = actMatch ? actMatch[2].trim() : '';

  // Clean raw activity title
  rawActivity = rawActivity.replace(/\s*100%\s*guaranteed/i, '').replace(/\|\s*ticket.*$/i, '').trim();

  let title = 'GetYourGuide Activity';
  if (rawActivity.toLowerCase().includes('auschwitz') && (rawActivity.toLowerCase().includes('wieliczka') || rawActivity.toLowerCase().includes('salt'))) {
    title = 'GetYourGuide: Auschwitz-Birkenau & Wieliczka Salt Mine Tour';
  } else if (rawActivity.toLowerCase().includes('auschwitz')) {
    title = 'GetYourGuide: Auschwitz-Birkenau Memorial Guided Tour';
  } else if (rawActivity.toLowerCase().includes('wieliczka') || rawActivity.toLowerCase().includes('salt')) {
    title = 'GetYourGuide: Wieliczka Salt Mine UNESCO Tour';
  } else if (rawActivity.length > 5) {
    title = `GetYourGuide: ${rawActivity}`;
  } else {
    const subjMatch = subj.match(/booking\s+([A-Z0-9]+)\s+confirmed\s*\|\s*([^|\r\n]+)/i);
    if (subjMatch && !subjMatch[2].toLowerCase().includes('ticket instructions')) {
      title = `GetYourGuide: ${subjMatch[2].trim()}`;
    }
  }

  // 2. Participants, Language, Duration
  let tickets = null;
  let language = null;
  let duration = null;
  if (participantLine) {
    const parts = participantLine.split('•').map(p => p.trim());
    if (parts[0]) tickets = parts[0];
    if (parts[1]) language = parts[1];
    if (parts[2]) duration = parts[2];
  } else {
    const pMatch = text.match(/(\d+\s+Adults?(?:\s*\([^)]+\))?)/i);
    if (pMatch) tickets = pMatch[1];
    const durMatch = text.match(/(\d{1,2}\s*(?:hours|hrs|days))/i);
    if (durMatch) duration = durMatch[1];
  }

  // 3. Supplier / Operator
  const suppMatch = text.match(/Note from\s+([^\r\n•]+)/i)
    || text.match(/(?:operator|supplier|provided by)\s*[:\-]\s*([^\r\n•]+)/i);
  const supplier = suppMatch ? suppMatch[1].trim() : null;

  // 4. Cost extraction
  let cost = null;
  const costMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/i)
    || text.match(/([\d,]+(?:\.\d{2})?)\s*(?:USD|\$)/i);
  if (costMatch) {
    const amount = parseFloat(costMatch[1].replace(/,/g, ''));
    if (!isNaN(amount) && amount > 0) {
      cost = { amount, currency: 'USD' };
    }
  } else {
    cost = extractBookingCost(text);
  }

  // 5. Pickup times / Schedule window
  const pickupMatch = text.match(/pickups are between\s*(\d{1,2}(?::\d{2})?)\s*(?:and|-)\s*(\d{1,2}(?::\d{2})?)/i)
    || text.match(/pickup[:\s]+between\s*(\d{1,2}(?::\d{2})?)\s*(?:and|-)\s*(\d{1,2}(?::\d{2})?)/i)
    || text.match(/pickup[:\s]+(\d{1,2}:\d{2})/i)
    || text.match(/\bat\s+(\d{1,2}:\d{2})\b/i);

  let pickupWindow = null;
  let localTime = null;
  let endTime = null;

  if (pickupMatch) {
    const pStart = pickupMatch[1].includes(':') ? pickupMatch[1] : `${pickupMatch[1]}:00`;
    const pEnd = pickupMatch[2] ? (pickupMatch[2].includes(':') ? pickupMatch[2] : `${pickupMatch[2]}:00`) : null;
    pickupWindow = pEnd ? `${pStart.padStart(5, '0')} - ${pEnd.padStart(5, '0')}` : null;
    localTime = pStart.padStart(5, '0');
  }

  // 6. Booking reference & Confirmation
  const gygConfMatch = (subj + ' ' + text).match(/\bGYG[A-Z0-9]{7,12}\b/i)
    || text.match(/(?:confirmation|booking|reference)[:\s#]+([A-Z0-9]{6,14})\b/i);
  const confirmationNumber = gygConfMatch ? (gygConfMatch[1] || gygConfMatch[0]).toUpperCase() : null;

  const bookingRefMatch = text.match(/bookings?\/([A-Z0-9]{15,40})/i);
  const bookingRef = bookingRefMatch ? bookingRefMatch[1] : null;

  // 7. Direct Canonical URLs
  let canonicalWebUrl = null;
  const fallbackMatch = text.match(/adj_fallback=([^&\s\)]+)/i);
  if (fallbackMatch) {
    try {
      canonicalWebUrl = decodeURIComponent(fallbackMatch[1]);
    } catch {
      canonicalWebUrl = fallbackMatch[1];
    }
  }

  if (!canonicalWebUrl) {
    canonicalWebUrl = bookingRef
      ? `https://www.getyourguide.com/booking/${bookingRef}`
      : 'https://www.getyourguide.com/booking';
  }
  const mobileTicketUrl = canonicalWebUrl;
  const activityDetailsUrl = canonicalWebUrl;

  // 8. Baggage restriction
  const bagMatch = text.match(/(?:maximum size of bags[^\r\n•]+|bags[^\r\n•]+30x20x10[^\r\n•]*)/i);
  const bagRestriction = bagMatch ? bagMatch[0].trim() : null;

  // 9. Location
  const locMatch = text.match(/(?:meeting\s*point|pickup\s*location|location)[:\s]+([^\r\n]{4,120})/i);
  const location = locMatch ? locMatch[1].trim() : null;

  // 10. Date
  let localDate = null;
  const isoMatch = text.match(/\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch) localDate = isoMatch[1];

  return {
    item_type: 'excursion',
    title,
    provider: supplier ? `GetYourGuide / ${supplier}` : 'GetYourGuide',
    supplier,
    confirmation_number: confirmationNumber,
    booking_reference: bookingRef,
    local_date: localDate,
    local_time: localTime,
    end_time: endTime,
    location,
    tickets,
    language,
    duration,
    pickup_window: pickupWindow,
    bag_restriction: bagRestriction,
    mobile_ticket_url: mobileTicketUrl,
    activity_details_url: activityDetailsUrl,
    cost,
    snippet: text.slice(0, 600),
  };
}

function cleanTitleAndProvider(rawSubject, body, from) {
  let cleanedSubject = (rawSubject || '')
    .replace(/^(?:fwd?|re|fw):\s*/gi, '')
    .replace(/^\[[^\]]+\]\s*/g, '')
    .trim();

  const combined = (cleanedSubject + ' ' + body).toLowerCase();

  let provider = from;
  let title = cleanedSubject || 'Imported Booking';
  let item_type = 'other';
  let suggestedDate = null;
  let suggestedTime = null;
  let suggestedLocation = null;

  // 1. Delta Air Lines
  if (combined.includes('delta air') || combined.includes('skymiles') || from.includes('delta')) {
    provider = 'Delta Air Lines';
    item_type = 'flight';
    const matchReceipt = cleanedSubject.match(/your flight receipt\s*-\s*([A-Za-z\s]+)\s*(\d{2}[A-Za-z]{3}\d{2})/i);
    if (matchReceipt) {
      title = `Delta Flight: ${matchReceipt[1].trim()} (${matchReceipt[2]})`;
    } else {
      title = `Delta Flight: ${cleanedSubject}`;
    }
  }
  // 2. PKP Intercity
  else if (combined.includes('pkp') || combined.includes('intercity') || from.includes('intercity.pl')) {
    provider = 'PKP Intercity';
    item_type = 'rail';
    title = `PKP Train: ${cleanedSubject.replace(/^potwierdzenie.*?:/i, '').trim()}`;
  }
  // 3. Hotels
  else if (combined.includes('brovaria')) {
    provider = 'Hotel Brovaria';
    item_type = 'hotel';
    title = `Hotel Brovaria: ${cleanedSubject.replace(/confirmation.*$/i, '').trim() || 'Reservation'}`;
  } else if (combined.includes('experior') || combined.includes('destigo')) {
    provider = 'Hotel Experior Boutique';
    item_type = 'hotel';
    title = `Hotel Experior Boutique: ${cleanedSubject.replace(/confirmation.*$/i, '').trim() || 'Reservation'}`;
  } else if (combined.includes('hotel') || combined.includes('booking.com') || combined.includes('accor') || combined.includes('altus') || combined.includes('stary') || combined.includes('profitroom')) {
    item_type = 'hotel';
    if (combined.includes('booking.com')) provider = 'Booking.com';
    else if (combined.includes('accor') || combined.includes('bridge')) provider = 'Accor / The Bridge Wrocław';
    else if (combined.includes('altus') || combined.includes('profitroom')) provider = 'Hotel Altus Palace';
    else if (combined.includes('stary')) provider = 'Hotel Stary';
    else provider = 'Hotel Accommodation';
    title = `Hotel: ${cleanedSubject.replace(/confirmation.*$/i, '').trim() || provider}`;
  }
  // 4. Viator / Tripadvisor
  else if (combined.includes('viator') || combined.includes('tripadvisor') || from.includes('viator') || from.includes('tripadvisor')) {
    provider = combined.includes('viator') ? 'Viator' : 'Tripadvisor';
    item_type = 'excursion';
    title = `${provider}: ${cleanedSubject.replace(/confirmed.*$/i, '').trim()}`;
  } else {
    if (/hotel|inn|hostel|accommodation|stay/.test(combined)) item_type = 'hotel';
    else if (/flight|airline|boarding|air/.test(combined)) item_type = 'flight';
    else if (/train|rail|intercity/.test(combined)) item_type = 'rail';
    else if (/tour|activity|ticket|excursion/.test(combined)) item_type = 'excursion';
    else if (/restaurant|dining|reservation/.test(combined)) item_type = 'restaurant';
  }

  return { title, provider, item_type, suggestedDate, suggestedTime, suggestedLocation };
}

export function extractBookingFields(subject, body, from) {
  const fullText = subject + ' ' + body;
  const lower = fullText.toLowerCase();

  // If GetYourGuide email detected, use specialized high-precision connector
  if (lower.includes('getyourguide') || lower.includes('gyg') || from.includes('getyourguide') || lower.includes('mr.shuttle')) {
    return parseGetYourGuideEmail(body, subject, from);
  }

  const {
    title,
    provider,
    item_type,
    suggestedDate,
    suggestedTime,
    suggestedLocation
  } = cleanTitleAndProvider(subject, body, from);

  // Confirmation number extraction
  const confMatch = fullText.match(
    /(?:confirmation|booking|reservation|reference|conf\.?|ref\.?)\s*(?:number|no\.?|#|code)?\s*[:\-]?\s*([A-Z0-9]{5,14})/i
  );
  const confirmationNumber = confMatch ? confMatch[1] : null;

  // Check-in / arrival date
  const checkinMatch = fullText.match(
    /(?:check.in|arrival|from|departs?|date)[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}[A-Za-z]{3}\d{2,4})/i
  );

  // Date extraction (ISO -> DD.MM.YYYY -> DDMMMYY -> Month DD)
  let localDate = null;
  const isoMatch = lower.match(/\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch) {
    localDate = isoMatch[1];
  } else {
    const euroMatch = lower.match(/\b(0?[1-9]|[12]\d|3[01])[./](0?[1-9]|1[0-2])[./](20\d{2})\b/);
    if (euroMatch) {
      localDate = `${euroMatch[3]}-${String(euroMatch[2]).padStart(2, '0')}-${String(euroMatch[1]).padStart(2, '0')}`;
    } else {
      const monthNames = {
        january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
        april: '04', apr: '04', may: '05', june: '06', jun: '06', july: '07', jul: '07',
        august: '08', aug: '08', september: '09', sep: '09', october: '10', oct: '10',
        november: '11', nov: '11', december: '12', dec: '12'
      };
      const compactMatch = lower.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(20\d{2}|\d{2})?/i);
      const writtenMatchA = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+([12]\d|3[01]|0?[1-9])(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i);
      const writtenMatchB = lower.match(/\b([12]\d|3[01]|0?[1-9])(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b(?:,?\s*(20\d{2}))?/i);
      if (writtenMatchA) {
        const m = monthNames[writtenMatchA[1].toLowerCase()];
        const yr = writtenMatchA[3] || String(new Date().getFullYear());
        localDate = `${yr}-${m}-${String(writtenMatchA[2]).padStart(2, '0')}`;
      } else if (writtenMatchB) {
        const m = monthNames[writtenMatchB[2].toLowerCase()];
        const yr = writtenMatchB[3] || String(new Date().getFullYear());
        localDate = `${yr}-${m}-${String(writtenMatchB[1]).padStart(2, '0')}`;
      } else if (compactMatch) {
        const dayNum = parseInt(compactMatch[1], 10);
        const m = monthNames[compactMatch[2].toLowerCase()];
        const rawYr = compactMatch[3];
        const yr = rawYr ? (rawYr.length === 2 ? `20${rawYr}` : rawYr) : String(new Date().getFullYear());
        localDate = `${yr}-${m}-${String(dayNum).padStart(2, '0')}`;
      }
    }
  }

  // Cost extraction
  const cost = extractBookingCost(fullText);

  return {
    item_type,
    title,
    provider,
    confirmation_number: confirmationNumber,
    raw_checkin: checkinMatch ? checkinMatch[1] : null,
    local_date: localDate || suggestedDate || null,
    local_time: suggestedTime || null,
    end_time: null,
    location: suggestedLocation || null,
    snippet: body.replace(/\s+/g, ' ').slice(0, 600),
    cost,
  };
}

// ============================================================
// Main email handler (export from worker.js default object)
// ============================================================

export async function handleInboundEmail(message, env) {
  let inbox = null;
  let subject = 'Email booking';
  let from = '';
  let messageId = '';

  try {
    if (!env.DB) {
      console.error('[email-worker] DB binding not available');
      await message.setReject('Database unavailable');
      return;
    }

    // Clean recipient string
    let cleanTo = (message.to || '').toLowerCase().trim();
    const bracketMatch = cleanTo.match(/<([^>]+)>/);
    if (bracketMatch) cleanTo = bracketMatch[1].trim();

    const headersTo = (message.headers?.get('to') || '').toLowerCase().trim();
    const deliveredTo = (message.headers?.get('delivered-to') || '').toLowerCase().trim();

    // Check for 6-digit token in recipient, header To, or delivered-to (e.g. TT351825 -> 351825)
    const tokenMatch = cleanTo.match(/tt(\d{6})/i) || headersTo.match(/tt(\d{6})/i) || deliveredTo.match(/tt(\d{6})/i);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token) {
      inbox = await env.DB.prepare(
        'SELECT * FROM wayfinder_email_inboxes WHERE inbox_token = ? AND is_active = 1'
      ).bind(token).first();
    }

    if (!inbox) {
      inbox = await env.DB.prepare(
        'SELECT * FROM wayfinder_email_inboxes WHERE email_address = ? COLLATE NOCASE AND is_active = 1'
      ).bind(cleanTo).first();
    }

    if (!inbox) {
      console.warn('[email-worker] unrecognized inbox address:', cleanTo, 'token:', token, 'headersTo:', headersTo);
      return;
    }

    // Verify journey still exists and load owner for dynamic member splits
    const journey = await env.DB.prepare(
      'SELECT id, created_by, start_date, end_date FROM wayfinder_journeys WHERE id = ?'
    ).bind(inbox.journey_id).first();

    if (!journey) {
      console.warn('[email-worker] journey not found for inbox:', inbox.id);
      return;
    }

    // Parse RFC 2047 subject, from, and Message-ID from the message envelope
    subject = decodeRfc2047(message.headers?.get('subject') || 'Email booking');
    from = message.from || message.headers?.get('from') || '';
    messageId = (message.headers?.get('message-id') || '').trim().slice(0, 200);

    // Extract plain-text body and attachments (including PDF text) from MIME stream
    let bodyText = '';
    let attachments = [];
    try {
      const mimeContent = await extractContentFromMime(message);
      bodyText = mimeContent.text || '';
      attachments = mimeContent.attachments || [];
    } catch (parseErr) {
      console.warn('[email-worker] MIME parse fallback - snippet only:', parseErr?.message);
    }

    let fields = extractBookingFields(subject, bodyText, from);

    // Stage 2: Intelligent Gemini structured fallback (including first PDF attachment when present)
    const primaryBinaryAttachment = attachments.find(a => a.base64 && (a.mimeType === 'application/pdf' || a.mimeType?.startsWith('image/')));
    const isLowConfidence = !fields.confirmation_number || fields.item_type === 'other' || !fields.local_date;
    if (isLowConfidence && (bodyText.trim().length > 20 || primaryBinaryAttachment)) {
      try {
        const geminiExtraction = await parseBookingWithGemini(
          env,
          bodyText,
          subject,
          from,
          { userId: inbox.user_id },
          primaryBinaryAttachment || null
        );
        if (geminiExtraction) {
          if (geminiExtraction.item_type && geminiExtraction.item_type !== 'other') {
            fields.item_type = geminiExtraction.item_type;
          }
          if (geminiExtraction.title && geminiExtraction.title !== 'Travel Booking') {
            fields.title = geminiExtraction.title;
          }
          if (geminiExtraction.provider && geminiExtraction.provider !== 'Unknown Provider') {
            fields.provider = geminiExtraction.provider;
          }
          if (geminiExtraction.confirmation_number) {
            fields.confirmation_number = geminiExtraction.confirmation_number;
          }
          if (geminiExtraction.start_date) {
            fields.local_date = geminiExtraction.start_date;
          }
          if (geminiExtraction.end_date) {
            fields.end_date = geminiExtraction.end_date;
          }
          if (geminiExtraction.start_time) {
            fields.local_time = geminiExtraction.start_time;
          }
          if (geminiExtraction.end_time) {
            fields.end_time = geminiExtraction.end_time;
          }
          if (geminiExtraction.location) {
            fields.location = geminiExtraction.location;
          }
          if (geminiExtraction.price && !fields.cost) {
            fields.cost = { amount: geminiExtraction.price, currency: geminiExtraction.currency || 'PLN' };
          }
          if (geminiExtraction.seat && !fields.tickets) {
            fields.tickets = geminiExtraction.seat;
          }
        }
      } catch (geminiErr) {
        console.warn('[email-worker] Gemini Stage 2 fallback error:', geminiErr?.message);
      }
    }

    const notes = [
      fields.confirmation_number ? `Confirmation: ${fields.confirmation_number}` : null,
      fields.booking_reference ? `Booking Reference: ${fields.booking_reference}` : null,
      fields.supplier ? `Supplier: ${fields.supplier}` : null,
      fields.tickets ? `Tickets: ${fields.tickets}` : null,
      fields.language ? `Language: ${fields.language}` : null,
      fields.duration ? `Duration: ${fields.duration}` : null,
      fields.cost ? `Cost: ${fields.cost.amount} ${fields.cost.currency}` : null,
      fields.pickup_window ? `Pickup Window: ${fields.pickup_window}` : null,
      fields.bag_restriction ? `Bag Restrictions: ${fields.bag_restriction}` : null,
      fields.mobile_ticket_url ? `Mobile Tickets: ${fields.mobile_ticket_url}` : null,
      fields.activity_details_url ? `Activity Details: ${fields.activity_details_url}` : null,
      fields.raw_checkin ? `Check-in: ${fields.raw_checkin}` : null,
      messageId ? `Message-ID: ${messageId}` : null,
      'Source: email-forward',
      `From: ${from}`,
      '',
      fields.snippet,
    ].filter(Boolean).join('\n');

    const resolvedDate = fields.local_date || journey.start_date || new Date().toISOString().slice(0, 10);

    // Idempotency guard 1: exact email Message-ID deduplication (handles Cloudflare retries & forwards)
    if (messageId) {
      const existingByMsgId = await env.DB.prepare(
        `SELECT id FROM wayfinder_itinerary_items
         WHERE journey_id = ? AND user_id = ? AND notes LIKE ?`
      ).bind(inbox.journey_id, inbox.user_id, `%Message-ID: ${messageId}%`).first();
      if (existingByMsgId) {
        console.log(`[email-worker] duplicate Message-ID ${messageId} ignored (${existingByMsgId.id})`);
        return;
      }
    }

    // Idempotency guard 2: leg-aware dedupe (allows multi-leg flights sharing one PNR on different legs/dates/titles)
    if (fields.confirmation_number) {
      const existingByLeg = await env.DB.prepare(
        `SELECT id FROM wayfinder_itinerary_items
         WHERE journey_id = ? AND user_id = ? AND confirmation_number = ? AND local_date = ? AND LOWER(title) = LOWER(?)`
      ).bind(inbox.journey_id, inbox.user_id, fields.confirmation_number, resolvedDate, fields.title).first();
      if (existingByLeg) {
        console.log(`[email-worker] duplicate confirmation leg ${fields.confirmation_number} ignored (${existingByLeg.id})`);
        return;
      }
    } else {
      const existingByTitle = await env.DB.prepare(
        `SELECT id FROM wayfinder_itinerary_items
         WHERE journey_id = ? AND user_id = ? AND title = ? AND local_date = ? AND (import_source = 'email-forward' OR notes LIKE '%Source: email-forward%')`
      ).bind(inbox.journey_id, inbox.user_id, fields.title, resolvedDate).first();
      if (existingByTitle) {
        console.log(`[email-worker] duplicate email booking '${fields.title}' on ${resolvedDate} ignored (${existingByTitle.id})`);
        return;
      }
    }

    const itemId = generateId();
    const auditId = generateId();
    const docIds = [];
    const docBatchStmts = [];
    const postDocStmts = [];
    const nowIso = new Date().toISOString();

    let purchaseSite = fields.purchase_site || null;
    if (!purchaseSite) {
      const lowerAll = (subject + ' ' + bodyText + ' ' + from).toLowerCase();
      if (lowerAll.includes('getyourguide')) purchaseSite = 'GetYourGuide';
      else if (lowerAll.includes('booking.com')) purchaseSite = 'Booking.com';
      else if (lowerAll.includes('hotels.com')) purchaseSite = 'Hotels.com';
      else if (lowerAll.includes('delta')) purchaseSite = 'Delta.com';
      else if (lowerAll.includes('pkp') || lowerAll.includes('intercity')) purchaseSite = 'PKP Intercity';
      else if (fields.provider) purchaseSite = fields.provider;
    }

    let paymentMethod = fields.payment_method || null;
    if (!paymentMethod) {
      const lowerAll = (subject + ' ' + bodyText).toLowerCase();
      if (lowerAll.includes('amex') || lowerAll.includes('american express')) paymentMethod = 'American Express';
      else if (lowerAll.includes('visa')) paymentMethod = 'Visa';
      else if (lowerAll.includes('mastercard') || lowerAll.includes('master card')) paymentMethod = 'Mastercard';
      else if (lowerAll.includes('apple pay')) paymentMethod = 'Apple Pay';
      else if (lowerAll.includes('paypal')) paymentMethod = 'PayPal';
    }

    // Persist ALL valid attachments (documents + D1 blob chunks + extraction jobs)
    for (let attIdx = 0; attIdx < attachments.length; attIdx++) {
      const att = attachments[attIdx];
      const attDocId = generateId();
      docIds.push(attDocId);
      const jobId = generateId();
      const attBytes = att.bytes instanceof Uint8Array ? att.bytes : null;
      const canStoreBlob = Boolean(attBytes && attBytes.byteLength > 0 && attBytes.byteLength <= MAX_D1_BLOB_SIZE);
      const fileHash = canStoreBlob ? await sha256HexBytes(attBytes) : null;
      const storageStatus = canStoreBlob
        ? 'd1_blob'
        : (attBytes && attBytes.byteLength > MAX_D1_BLOB_SIZE ? 'oversized' : 'metadata_only');

      docBatchStmts.push(
        env.DB.prepare(
          `INSERT INTO wayfinder_documents
           (id, user_id, journey_id, original_filename, safe_display_name, mime_type, file_size_bytes, file_hash, storage_key, storage_status, processing_status, detected_provider, detected_doc_type, security_scan_status, retention_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', ?, ?, 'pending', 'active')`
        ).bind(
          attDocId,
          inbox.user_id,
          inbox.journey_id,
          att.filename || `attachment-${attIdx + 1}.pdf`,
          att.filename ? `${fields.title} (${att.filename})` : `${fields.title} (Ticket Attachment)`,
          att.mimeType || 'application/pdf',
          att.sizeBytes || 0,
          fileHash,
          `attachments/${inbox.journey_id}/${attDocId}/${att.filename || `attachment-${attIdx + 1}.pdf`}`,
          storageStatus,
          fields.provider || 'Travel Booking',
          fields.item_type || 'hotel'
        ),
        env.DB.prepare(
          `INSERT INTO wayfinder_extraction_jobs
           (id, document_id, user_id, status, completed_at, reviewed_at, reviewed_by, review_decision, created_at)
           VALUES (?, ?, ?, 'approved', ?, ?, ?, 'approved', ?)`
        ).bind(jobId, attDocId, inbox.user_id, nowIso, nowIso, inbox.user_id, nowIso)
      );

      if (canStoreBlob) {
        await ensureDocumentBlobsTable(env.DB);
        const blobStmts = buildBlobStatements(env.DB, {
          documentId: attDocId,
          userId: inbox.user_id,
          bytes: attBytes,
          mimeType: att.mimeType || 'application/pdf',
          sha256Hash: fileHash,
        });
        docBatchStmts.push(...blobStmts);
      }

      if (attIdx === 0) {
        const extractedEntries = [
          { name: fields.item_type === 'hotel' ? 'hotel_name' : fields.item_type === 'flight' ? 'airline' : 'activity_title', val: fields.title },
          fields.confirmation_number ? { name: 'confirmation_number', val: fields.confirmation_number } : null,
          fields.local_date ? { name: fields.item_type === 'hotel' ? 'check_in_date' : 'start_date', val: fields.local_date } : null,
          fields.local_time ? { name: fields.item_type === 'hotel' ? 'check_in_time' : 'start_time', val: fields.local_time } : null,
          fields.location ? { name: 'location', val: fields.location } : null,
          fields.cost ? { name: 'total_cost', val: `${fields.cost.amount} ${fields.cost.currency}` } : null,
          purchaseSite ? { name: 'purchase_site', val: purchaseSite } : null,
          paymentMethod ? { name: 'payment_method', val: paymentMethod } : null
        ].filter(Boolean);

        for (const entry of extractedEntries) {
          docBatchStmts.push(
            env.DB.prepare(
              `INSERT INTO wayfinder_extracted_fields
               (id, extraction_job_id, document_id, field_name, extracted_value, display_value, confidence, verification_status, user_value)
               VALUES (?, ?, ?, ?, ?, ?, 'high', 'user_verified', ?)`
            ).bind(generateId(), jobId, attDocId, entry.name, entry.val, entry.val, entry.val)
          );
        }
      }
    }

    const primaryDocId = docIds[0] || null;

    postDocStmts.push(
      env.DB.prepare(
        `INSERT INTO wayfinder_itinerary_items
         (id, journey_id, user_id, item_type, title, provider, supplier,
          confirmation_number, booking_reference,
          local_date, local_time, end_date, end_time, location,
          tickets, language, duration, pickup_window, bag_restriction,
          mobile_ticket_url, activity_details_url, import_source,
          source_document_id, purchase_site, payment_method,
          notes, status, verification_status, visibility)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'email-forward',?,?,?,?,'imported','user_verified','private')`
      ).bind(
        itemId, inbox.journey_id, inbox.user_id,
        fields.item_type, fields.title, fields.provider || null, fields.supplier || null,
        fields.confirmation_number || null, fields.booking_reference || null,
        resolvedDate,
        fields.local_time || null,
        fields.end_date || null,
        fields.end_time || null,
        fields.location || null,
        fields.tickets || null,
        fields.language || null,
        fields.duration || null,
        fields.pickup_window || null,
        fields.bag_restriction || null,
        fields.mobile_ticket_url || null,
        fields.activity_details_url || null,
        primaryDocId,
        purchaseSite,
        paymentMethod,
        notes
      ),
      env.DB.prepare(
        `UPDATE wayfinder_email_inboxes
         SET emails_received = emails_received + 1, last_received_at = ?
         WHERE id = ?`
      ).bind(nowIso, inbox.id),
      env.DB.prepare(
        'INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, target_email, metadata_summary, details) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(auditId, inbox.user_id, inbox.journey_id, 'itinerary_item', itemId, 'email_import',
             from || null, `subject=${subject.slice(0, 120)}; item_type=${fields.item_type}; attachments=${attachments.length}`,
             JSON.stringify({ from, subject: subject.slice(0, 200), item_type: fields.item_type, message_id: messageId || null, attachments: attachments.length }))
    );

    if (fields.cost && fields.cost.amount > 0) {
      const expenseId = generateId();
      const rawAmt = fields.cost.amount;
      const cur = fields.cost.currency || 'USD';
      let amountUsd = rawAmt;
      if (cur === 'PLN') amountUsd = Math.round((rawAmt / 4.0) * 100) / 100;
      else if (cur === 'EUR') amountUsd = Math.round((rawAmt * 1.08) * 100) / 100;
      const expenseCat = mapDocTypeToExpenseCategory(fields.item_type);

      const payerRow = await env.DB.prepare(
        'SELECT id, name, email FROM users WHERE id = ?'
      ).bind(inbox.user_id).first().catch(() => null);
      const payerName = payerRow?.name || payerRow?.email || 'Traveler';

      const rawMembers = await getAgendaMembers(env, journey);
      const members = rawMembers.length > 0
        ? rawMembers
        : [{ id: inbox.user_id, name: payerName }];
      const totalCents = Math.round(rawAmt * 100);
      const count = members.length;
      const baseCents = Math.floor(totalCents / count);
      const remCents = totalCents - baseCents * count;
      const basePct = Math.round((10000 / count)) / 100;

      postDocStmts.push(
        env.DB.prepare(
          `INSERT INTO wayfinder_expenses
           (id, journey_id, itinerary_item_id, document_id, user_id, paid_by_name, paid_by_user_id,
            category, description, amount_original, currency_original, amount_usd,
            purchase_site, payment_method,
            paid_status, verification_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'verified', ?)`
        ).bind(
          expenseId,
          inbox.journey_id,
          itemId,
          primaryDocId,
          inbox.user_id,
          payerName,
          inbox.user_id,
          expenseCat,
          fields.title,
          rawAmt,
          cur,
          amountUsd,
          purchaseSite,
          paymentMethod,
          nowIso
        )
      );

      for (let idx = 0; idx < count; idx++) {
        const m = members[idx];
        const owed = (baseCents + (idx < remCents ? 1 : 0)) / 100;
        const pct = idx === count - 1 ? Math.round((100 - basePct * (count - 1)) * 100) / 100 : basePct;
        postDocStmts.push(
          env.DB.prepare(
            `INSERT INTO wayfinder_expense_splits
             (id, expense_id, user_id, user_name, amount_owed, percentage, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(generateId(), expenseId, m.id, m.name || m.email || 'Collaborator', owed, pct, nowIso)
        );
      }
    }

    // Commit document rows & blobs first (respecting D1 batch parameter/statement budgets), then item & expense rows
    const allStmts = [...docBatchStmts, ...postDocStmts];
    for (let i = 0; i < allStmts.length; i += 80) {
      await env.DB.batch(allStmts.slice(i, i + 80));
    }

    console.log(`[email-worker] imported ${fields.item_type} item ${itemId} (docs=${docIds.length}) for journey ${inbox.journey_id}`);

  } catch (err) {
    console.error('[email-worker] fatal error:', err);
    if (env?.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO wayfinder_audit_events
           (id, user_id, journey_id, entity_type, entity_id, action, target_email, metadata_summary, details)
           VALUES (?, ?, ?, 'email_inbound', ?, 'email_import_failed', ?, ?, ?)`
        ).bind(
          generateId(),
          inbox?.user_id || null,
          inbox?.journey_id || null,
          messageId || generateId(),
          from || null,
          `subject=${String(subject || '').slice(0, 120)}; error=${String(err?.message || 'Unknown').slice(0, 140)}`,
          JSON.stringify({
            from: from || null,
            subject: String(subject || '').slice(0, 200),
            message_id: messageId || null,
            error: String(err?.message || 'Processing failed').slice(0, 300),
          })
        ).run();
      } catch (auditErr) {
        console.error('[email-worker] failed to persist audit failure event:', auditErr);
      }
    }
    // Do not re-throw - silently absorb after audit logging to prevent delivery bounce loops
  }
}
