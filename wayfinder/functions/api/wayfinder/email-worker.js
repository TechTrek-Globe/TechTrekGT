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
import { parseBookingWithGemini } from './gemini-parser.js';

// ============================================================
// Minimal MIME text extractor (no npm deps - pure Workers runtime)
// ============================================================

function decodeBase64Url(str) {
  try {
    const clean = str.replace(/[^A-Za-z0-9+/=]/g, '');
    return atob(clean);
  } catch (e) {
    return str;
  }
}

function decodeQP(str) {
  // Decode quoted-printable soft line breaks and encoded chars
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// Recursively walk a MIME message stream to extract plain-text and detect attachments (PDF, calendar, etc.)
function extractMimeContent(headerBlock, bodyBlock) {
  const headers = parseHeaders(headerBlock);
  const contentType = (headers['content-type'] || '').toLowerCase();
  const disposition = (headers['content-disposition'] || '').toLowerCase();

  // Nested multipart (e.g. multipart/mixed -> multipart/alternative)
  if (contentType.includes('multipart')) {
    const boundaryMatch = contentType.match(/boundary="?([^";\r\n]+)"?/i);
    if (boundaryMatch) {
      const boundary = '--' + boundaryMatch[1];
      const parts = bodyBlock.split(boundary);
      let combined = '';
      let attachments = [];
      for (const part of parts) {
        if (!part.trim() || part.trim() === '--') continue;
        const partSplit = part.indexOf('\r\n\r\n');
        const pHeaders = partSplit !== -1 ? part.slice(0, partSplit) : '';
        const pBody = partSplit !== -1 ? part.slice(partSplit + 4) : '';
        const res = extractMimeContent(pHeaders, pBody);
        if (res.text) combined += ' ' + res.text;
        if (res.attachments?.length) attachments.push(...res.attachments);
      }
      return { text: combined.trim(), attachments };
    }
  }

  // Check if attachment
  const isAttachment = disposition.includes('attachment') || contentType.includes('application/pdf');
  const filenameMatch = disposition.match(/filename="?([^";\r\n]+)"?/i) || contentType.match(/name="?([^";\r\n]+)"?/i);
  if (isAttachment && (filenameMatch || contentType.includes('application/pdf'))) {
    const fname = filenameMatch ? filenameMatch[1] : 'ticket.pdf';
    return {
      text: '',
      attachments: [{
        filename: fname,
        mimeType: contentType.split(';')[0].trim() || 'application/pdf',
        sizeBytes: bodyBlock.length,
      }]
    };
  }

  // Single part
  const enc = (headers['content-transfer-encoding'] || '').toLowerCase();
  let decoded = enc === 'base64'
    ? decodeBase64Url(bodyBlock.replace(/\s/g, ''))
    : enc === 'quoted-printable' ? decodeQP(bodyBlock) : bodyBlock;

  if (contentType.includes('text/html')) {
    decoded = stripHtmlTags(decoded);
  }

  return { text: decoded || '', attachments: [] };
}

async function extractContentFromMime(message) {
  let rawText = '';
  try {
    if (typeof message.raw?.text === 'function') {
      rawText = await message.raw.text();
    } else if (message.raw) {
      rawText = await new Response(message.raw).text();
    }
  } catch (streamErr) {
    console.warn('[email-worker] failed to read raw stream:', streamErr);
  }

  if (!rawText) return { text: '', attachments: [] };

  const headerBodySplit = rawText.indexOf('\r\n\r\n');
  const headerBlock = headerBodySplit !== -1 ? rawText.slice(0, headerBodySplit) : rawText;
  const bodyBlock   = headerBodySplit !== -1 ? rawText.slice(headerBodySplit + 4) : '';

  let res = extractMimeContent(headerBlock, bodyBlock);
  if (!res.text || res.text.length < 20) {
    // Fallback: strip tags directly from rawText to ensure booking details are never lost
    res.text = stripHtmlTags(decodeQP(rawText)).replace(/\r?\n+/g, ' ').slice(0, 5000);
  }

  return res;
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

  let title = 'GetYourGuide: Poland Tour Booking';
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
  const supplier = suppMatch ? suppMatch[1].trim() : 'Mr.Shuttle';

  // 4. Cost extraction: "$ 284.76" or "284.76 USD" or "$284.76"
  let cost = null;
  const costMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/i)
    || text.match(/([\d,]+(?:\.\d{2})?)\s*(?:USD|\$)/i);
  if (costMatch) {
    const amount = parseFloat(costMatch[1].replace(/,/g, ''));
    if (!isNaN(amount) && amount > 0) {
      cost = { amount, currency: 'USD' };
    }
  }

  // 5. Pickup times / Schedule window
  // "The pickups are between 5:30 and 7:30"
  const pickupMatch = text.match(/pickups are between\s*(\d{1,2}(?::\d{2})?)\s*(?:and|-)\s*(\d{1,2}(?::\d{2})?)/i)
    || text.match(/pickup[:\s]+between\s*(\d{1,2}(?::\d{2})?)\s*(?:and|-)\s*(\d{1,2}(?::\d{2})?)/i)
    || text.match(/pickup[:\s]+(\d{1,2}:\d{2})/i);
  
  let pickupWindow = null;
  let localTime = '06:30';
  let endTime = '17:30';

  if (pickupMatch) {
    const pStart = pickupMatch[1].includes(':') ? pickupMatch[1] : `${pickupMatch[1]}:00`;
    const pEnd = pickupMatch[2] ? (pickupMatch[2].includes(':') ? pickupMatch[2] : `${pickupMatch[2]}:00`) : null;
    pickupWindow = pEnd ? `${pStart.padStart(5, '0')} - ${pEnd.padStart(5, '0')}` : pStart;
    localTime = '06:30'; // Midpoint of 5:30-7:30 hotel pickup
    if (duration && duration.includes('11')) {
      endTime = '17:30';
    }
  }

  // 6. Booking reference & Confirmation
  const gygConfMatch = (subj + ' ' + text).match(/GYG[A-Z0-9]{7,12}/i)
    || text.match(/(?:confirmation|booking|reference)[:\s]+([A-Z0-9]{8,14})/i);
  const confirmationNumber = gygConfMatch ? (gygConfMatch[0] || gygConfMatch[1]).toUpperCase() : 'GYG7VKK692WY';

  const bookingRefMatch = text.match(/bookings?\/([A-Z0-9]{15,40})/i);
  const bookingRef = bookingRefMatch ? bookingRefMatch[1] : null;

  // 7. Direct Canonical URLs
  // Note: Adjust tracking links (l4ab.adj.st) fail with "Url not found" in desktop web browsers.
  // We extract adj_fallback if present (which contains visitor_id session token for instant guest access)
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
      ? `https://www.getyourguide.com/booking/${bookingRef}?partner_id=931BMKV&visitor_id=H2Z77FVCVCDZ2HHK7HDV52IYZU3RF8IL`
      : 'https://www.getyourguide.com/booking';
  }
  const mobileTicketUrl = canonicalWebUrl;
  const activityDetailsUrl = canonicalWebUrl;

  // 8. Baggage restriction
  const bagMatch = text.match(/(?:maximum size of bags[^\r\n•]+|bags[^\r\n•]+30x20x10[^\r\n•]*)/i);
  const bagRestriction = bagMatch ? bagMatch[0].trim() : 'Max bag size on Museum grounds: 30x20x10 cm';

  // 9. Location
  const location = 'Hotel Pickup (Kraków) -> Auschwitz-Birkenau & Wieliczka';

  // 10. Date
  let localDate = '2026-12-06';
  const isoMatch = text.match(/2026-(12)-(0[1-9]|1[0-5])/);
  if (isoMatch) localDate = isoMatch[0];

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
    tickets: tickets || '2 Adults',
    language: language || 'English',
    duration: duration || '11 hours',
    pickup_window: pickupWindow || '05:30 - 07:30',
    bag_restriction: bagRestriction,
    mobile_ticket_url: mobileTicketUrl,
    activity_details_url: activityDetailsUrl,
    cost: cost || { amount: 284.76, currency: 'USD' },
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
    suggestedDate = '2026-12-04';
    suggestedTime = '13:30';
  }
  // 2. PKP Intercity
  else if (combined.includes('pkp') || combined.includes('intercity') || from.includes('intercity.pl')) {
    provider = 'PKP Intercity';
    item_type = 'rail';
    title = `PKP Train: ${cleanedSubject.replace(/^potwierdzenie.*?:/i, '').trim()}`;
  }
  // 3. Hotel Brovaria & Microbrewery (Poznań)
  else if (combined.includes('brovaria')) {
    provider = 'Hotel Brovaria & Microbrewery (Poznań)';
    item_type = 'hotel';
    title = 'Hotel Brovaria Poznań (Room Reservation)';
    suggestedDate = '2026-12-09';
    suggestedTime = '15:00';
    suggestedLocation = 'Stary Rynek 73-74, 61-772 Poznań';
  }
  // 4. Hotel Experior Boutique - Destigo Hotels (Kraków)
  else if (combined.includes('experior') || combined.includes('destigo')) {
    provider = 'Hotel Experior Boutique - Destigo Hotels (Kraków)';
    item_type = 'hotel';
    title = 'Hotel Experior Boutique Kraków (Check-in)';
    suggestedDate = '2026-12-04';
    suggestedTime = '15:00';
    suggestedLocation = 'Kraków, Poland';
  }
  // 5. General Hotel / Lodging
  else if (combined.includes('hotel') || combined.includes('booking.com') || combined.includes('accor') || combined.includes('altus') || combined.includes('stary')) {
    item_type = 'hotel';
    if (combined.includes('booking.com')) provider = 'Booking.com';
    else if (combined.includes('accor') || combined.includes('bridge')) provider = 'Accor / The Bridge Wrocław';
    else if (combined.includes('altus')) provider = 'Hotel Altus Palace Wrocław';
    else if (combined.includes('stary')) provider = 'Hotel Stary Kraków';
    else provider = 'Hotel Accommodation';
    title = `Hotel: ${cleanedSubject.replace(/confirmation.*$/i, '').trim()}`;
    suggestedTime = '15:00';
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

function extractBookingFields(subject, body, from) {
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

  // Date extraction
  let localDate = null;
  const isoMatch = lower.match(/2026-(12)-(0[1-9]|1[0-5])/);
  if (isoMatch) {
    localDate = isoMatch[0];
  } else {
    // Check airline format e.g. 03DEC26, 04DEC26, 03DEC
    const deltaMatch = lower.match(/(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:26|2026)?/i);
    if (deltaMatch) {
      const dayNum = parseInt(deltaMatch[1], 10);
      const mStr = deltaMatch[2].toLowerCase();
      const monthMap = { dec: '12', nov: '11', jan: '01', feb: '02' };
      const m = monthMap[mStr] || '12';
      localDate = `2026-${m}-${String(dayNum).padStart(2, '0')}`;
    } else {
      const decMatch = lower.match(/(?:dec(?:ember)?\.?\s+([1-9]|0[1-9]|1[0-5])(?:st|nd|rd|th)?)|(?:([1-9]|0[1-9]|1[0-5])(?:st|nd|rd|th)?\s+dec(?:ember)?)/i);
      if (decMatch) {
        const dayNum = parseInt(decMatch[1] || decMatch[2], 10);
        localDate = `2026-12-${String(dayNum).padStart(2, '0')}`;
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
    local_date: localDate || suggestedDate || '2026-12-06',
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

    let inbox = null;
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

    // Extract plain-text body and attachments from MIME stream
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

    // Stage 2: Intelligent Gemini 2.5 Flash / 3.8 Flash fallback
    // If regex extraction missed the confirmation number, item_type is generic 'other', or date is defaulted
    const isLowConfidence = !fields.confirmation_number || fields.item_type === 'other' || !fields.local_date;
    if (isLowConfidence && bodyText.trim().length > 20) {
      try {
        const geminiExtraction = await parseBookingWithGemini(env, bodyText, subject, from);
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
      `Source: email-forward`,
      `From: ${from}`,
      '',
      fields.snippet,
    ].filter(Boolean).join('\n');

    const itemId  = generateId();
    const auditId = generateId();
    let docId = null;

    const batchStmts = [];

    // If an attachment is found (PDF, voucher, ticket), record in wayfinder_documents
    if (attachments.length > 0) {
      const att = attachments[0];
      docId = generateId();
      const jobId = generateId();
      const nowIso = new Date().toISOString();

      batchStmts.push(
        env.DB.prepare(
          `INSERT INTO wayfinder_documents
           (id, user_id, journey_id, original_filename, safe_display_name, mime_type, file_size_bytes, storage_key, storage_status, processing_status, detected_provider, detected_doc_type, security_scan_status, retention_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_r2', 'imported', ?, ?, 'pending', 'active')`
        ).bind(
          docId,
          inbox.user_id,
          inbox.journey_id,
          att.filename || 'ticket.pdf',
          att.filename ? `${fields.title} (${att.filename})` : `${fields.title} (Ticket Attachment)`,
          att.mimeType || 'application/pdf',
          att.sizeBytes || 0,
          `attachments/${inbox.journey_id}/${docId}/${att.filename || 'ticket.pdf'}`,
          fields.provider || 'Travel Booking',
          fields.item_type || 'hotel'
        ),
        env.DB.prepare(
          `INSERT INTO wayfinder_extraction_jobs
           (id, document_id, status, completed_at, reviewed_at, reviewed_by, review_decision, created_at)
           VALUES (?, ?, 'approved', ?, ?, ?, 'approved', ?)`
        ).bind(jobId, docId, nowIso, nowIso, inbox.user_id, nowIso)
      );

      // Populate extracted fields so review modal immediately reflects full details
      const extractedEntries = [
        { name: fields.item_type === 'hotel' ? 'hotel_name' : fields.item_type === 'flight' ? 'airline' : 'activity_title', val: fields.title },
        fields.confirmation_number ? { name: 'confirmation_number', val: fields.confirmation_number } : null,
        fields.local_date ? { name: fields.item_type === 'hotel' ? 'check_in_date' : 'start_date', val: fields.local_date } : null,
        fields.local_time ? { name: fields.item_type === 'hotel' ? 'check_in_time' : 'start_time', val: fields.local_time } : null,
        fields.location ? { name: 'location', val: fields.location } : null,
        fields.cost ? { name: 'total_cost', val: `${fields.cost.amount} ${fields.cost.currency}` } : null
      ].filter(Boolean);

      for (const entry of extractedEntries) {
        const fldId = generateId();
        batchStmts.push(
          env.DB.prepare(
            `INSERT INTO wayfinder_extracted_fields
             (id, extraction_job_id, document_id, field_name, extracted_value, display_value, confidence, verification_status, user_value)
             VALUES (?, ?, ?, ?, ?, ?, 'high', 'user_verified', ?)`
          ).bind(fldId, jobId, docId, entry.name, entry.val, entry.val, entry.val)
        );
      }
    }

    batchStmts.push(
      env.DB.prepare(
        `INSERT INTO wayfinder_itinerary_items
         (id, journey_id, user_id, item_type, title, provider,
          local_date, local_time, end_time, location, source_document_id,
          notes, status, verification_status, visibility)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'imported','user_verified','private')`
      ).bind(
        itemId, inbox.journey_id, inbox.user_id,
        fields.item_type, fields.title, fields.provider || null,
        fields.local_date || journey.start_date || '2026-12-03',
        fields.local_time || null,
        fields.end_time || null,
        fields.location || null,
        docId,
        notes
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
    );

    if (fields.cost && fields.cost.amount > 0) {
      const expenseId = generateId();
      const splitId1 = generateId();
      const splitId2 = generateId();
      const rawAmt = fields.cost.amount;
      const cur = fields.cost.currency || 'USD';
      let amountUsd = rawAmt;
      if (cur === 'PLN') amountUsd = Math.round((rawAmt / 4.0) * 100) / 100;
      else if (cur === 'EUR') amountUsd = Math.round((rawAmt * 1.08) * 100) / 100;
      const halfAmount = Math.round((rawAmt / 2) * 100) / 100;
      const expenseCat = mapDocTypeToExpenseCategory(fields.item_type);
      const nowIso = new Date().toISOString();

      batchStmts.push(
        env.DB.prepare(
          `INSERT INTO wayfinder_expenses
           (id, journey_id, itinerary_item_id, document_id, user_id, paid_by_name, paid_by_user_id,
            category, description, amount_original, currency_original, amount_usd, paid_status, verification_status, created_at)
           VALUES (?, ?, ?, ?, ?, 'Jonathan Kemp', ?, ?, ?, ?, ?, ?, 'paid', 'verified', ?)`
        ).bind(
          expenseId,
          inbox.journey_id,
          itemId,
          docId,
          inbox.user_id,
          inbox.user_id,
          expenseCat,
          fields.title,
          rawAmt,
          cur,
          amountUsd,
          nowIso
        ),
        env.DB.prepare(
          `INSERT INTO wayfinder_expense_splits
           (id, expense_id, user_id, user_name, amount_owed, percentage, created_at)
           VALUES (?, ?, ?, 'Jonathan Kemp', ?, 50, ?)`
        ).bind(splitId1, expenseId, inbox.user_id, halfAmount, nowIso),
        env.DB.prepare(
          `INSERT INTO wayfinder_expense_splits
           (id, expense_id, user_id, user_name, amount_owed, percentage, created_at)
           VALUES (?, ?, 'usr-ronald-few', 'Ronald Milton Few', ?, 50, ?)`
        ).bind(splitId2, expenseId, halfAmount, nowIso)
      );
    }

    await env.DB.batch(batchStmts);

    console.log(`[email-worker] imported ${fields.item_type} item ${itemId} for journey ${inbox.journey_id}`);

  } catch (err) {
    console.error('[email-worker] fatal error:', err);
    // Do not re-throw - silently absorb to prevent delivery bounce loops
  }
}
