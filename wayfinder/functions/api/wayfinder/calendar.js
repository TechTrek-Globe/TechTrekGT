// TechTrek Wayfinder - Dynamic iCalendar (.ics) Feed Generator
// Complies with RFC 5545 specification (VCALENDAR, VTIMEZONE, VEVENT)
// Provides:
// 1. GET  /api/wayfinder/calendar/token?journey_id= - Retrieves active token & subscribe URLs
// 2. POST /api/wayfinder/calendar/token - Generates or rotates token
// 3. DELETE /api/wayfinder/calendar/token?journey_id= - Revokes token
// 4. GET  /api/wayfinder/calendar/export.ics?journey_id= - Direct download snapshot
// 5. GET  /api/wayfinder/calendar/feed/:token.ics - Live public subscription feed

import { generateId } from '../../utils/id.js';
import { polandJourney } from '../../../src/data/poland-2026.js';

// Curated accommodations fallback
const CURATED_ACCOMMODATIONS = [
  {
    id: 'wroclaw-altus-palace-2026',
    title: 'Altus Palace Wrocław',
    hotel_name: 'Altus Palace Wrocław',
    location: 'Wierzbowa 15, 50-056 Wrocław, Poland',
    guest_name: 'Jon',
    check_in_date: '2026-12-07',
    check_in_time: '15:00',
    check_out_date: '2026-12-09',
    check_out_time: '11:00',
    phone: '+48 717475000',
    email: 'info@hotelaltuspalace.pl',
    website_url: 'https://www.hotelaltuspalace.pl'
  }
];

// RFC 5545 Line Folding: Max 75 octets per line, folded with CRLF + space
function foldLine(line) {
  const MAX_LEN = 75;
  if (new TextEncoder().encode(line).length <= MAX_LEN) return line;

  const parts = [];
  let cur = '';
  for (const char of line) {
    const candidate = cur + char;
    const byteLen = new TextEncoder().encode(candidate).length;
    const limit = parts.length === 0 ? MAX_LEN : MAX_LEN - 1;

    if (byteLen > limit) {
      parts.push(cur);
      cur = ' ' + char;
    } else {
      cur = candidate;
    }
  }
  if (cur) parts.push(cur);
  return parts.join('\r\n');
}

// RFC 5545 Text Escaping: backslash, semicolon, comma, and newline
function escapeIcsText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

// Self-healing database table initialization
async function ensureCalendarTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS wayfinder_calendar_tokens (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        journey_id      TEXT NOT NULL,
        token           TEXT NOT NULL UNIQUE,
        feed_name       TEXT NOT NULL DEFAULT 'Poland 2026 Schedule',
        is_active       INTEGER NOT NULL DEFAULT 1,
        last_polled_at  TEXT,
        poll_count      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (journey_id) REFERENCES wayfinder_journeys(id) ON DELETE CASCADE,
        UNIQUE(user_id, journey_id)
      )
    `).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_wf_cal_token ON wayfinder_calendar_tokens(token)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_wf_cal_user ON wayfinder_calendar_tokens(user_id)').run();
  } catch (err) {
    console.error('[calendar] ensureTable failed:', err);
  }
}

// Generate 32-character crypto random hex token
function generateSecureToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Add minutes to HH:MM time
function addMinutes(timeStr, minsToAdd) {
  const [h, m] = (timeStr || '12:00').split(':').map(Number);
  const total = h * 60 + m + minsToAdd;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// Add minutes to HH:MM time with date rollover support
export function addMinutesWithDate(dateStr, timeStr, minsToAdd) {
  const [h, m] = (timeStr || '12:00').split(':').map(Number);
  const total = h * 60 + m + minsToAdd;
  const daysToAdd = Math.floor(total / 1440);
  const remainingMinutes = ((total % 1440) + 1440) % 1440;
  const endH = Math.floor(remainingMinutes / 60);
  const endM = remainingMinutes % 60;
  const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const endDate = daysToAdd > 0 ? addDays(dateStr, daysToAdd) : dateStr;
  return { endDate, endTime };
}

// Add days to YYYY-MM-DD
function addDays(dateStr, daysToAdd = 1) {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Format date and time for ICS (TZID=Europe/Warsaw)
function toIcsDateTime(dateStr, timeStr) {
  const cleanDate = dateStr.replace(/[^0-9]/g, '');
  const cleanTime = (timeStr || '12:00').replace(/[^0-9]/g, '').padEnd(4, '0') + '00';
  return `${cleanDate}T${cleanTime}`;
}

function toIcsDateOnly(dateStr) {
  return dateStr.replace(/[^0-9]/g, '');
}

// Compile all events into RFC 5545 format
function buildCalendarFeed(events, calendarName = 'Poland Christmas 2026 Itinerary') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const rawLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TechTrekGT//Wayfinder Guide Poland 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Warsaw',
    'X-WR-CALDESC:Poland Christmas 2026 winter expedition schedule, flights, rail, and hotels',
    // VTIMEZONE definition for Central European Time (CET/CEST)
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Warsaw',
    'X-LIC-LOCATION:Europe/Warsaw',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE'
  ];

  for (const ev of events) {
    rawLines.push('BEGIN:VEVENT');
    rawLines.push(`UID:${ev.uid}`);
    rawLines.push(`DTSTAMP:${stamp}`);

    if (ev.allDay) {
      rawLines.push(`DTSTART;VALUE=DATE:${toIcsDateOnly(ev.startDate)}`);
      rawLines.push(`DTEND;VALUE=DATE:${toIcsDateOnly(ev.endDate)}`);
    } else {
      rawLines.push(`DTSTART;TZID=Europe/Warsaw:${toIcsDateTime(ev.startDate, ev.startTime)}`);
      rawLines.push(`DTEND;TZID=Europe/Warsaw:${toIcsDateTime(ev.endDate || ev.startDate, ev.endTime)}`);
    }

    rawLines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);
    if (ev.description) rawLines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    if (ev.location) rawLines.push(`LOCATION:${escapeIcsText(ev.location)}`);
    if (ev.categories) rawLines.push(`CATEGORIES:${escapeIcsText(ev.categories)}`);
    rawLines.push('STATUS:CONFIRMED');
    rawLines.push('END:VEVENT');
  }

  rawLines.push('END:VCALENDAR');

  // Apply RFC 5545 line folding
  return rawLines.map(foldLine).join('\r\n') + '\r\n';
}

// Check if an event is a generic hotel placeholder recommendation
function isGenericHotelPlaceholder(event) {
  if (!event || (event.itemType || '').toLowerCase() !== 'hotel') return false;
  const title = (event.title || '').toLowerCase();
  const badge = event.badge || '';

  return (
    title.includes('check-in (from') ||
    title.includes('settle into chosen base') ||
    title.includes('check-in to chosen base') ||
    title.includes('check in to chosen base') ||
    title.includes('check in to gdańsk base') ||
    title.includes('check in to gdansk base') ||
    badge === 'Recommended Base Zone'
  );
}

// Assemble all events for a journey and optional user
async function gatherEvents({ db, journeyId = 'poland-christmas-2026', userId = null }) {
  const events = [];
  const publicDays = polandJourney.itinerary || [];

  // Determine dates with confirmed accommodations to suppress placeholder duplicates
  const confirmedHotelDates = new Set();
  for (const acc of CURATED_ACCOMMODATIONS) {
    if (acc.check_in_date) confirmedHotelDates.add(acc.check_in_date);
  }

  // 1. Public Itinerary Days (Day Summary & Schedule Milestones)
  for (const day of publicDays) {
    // All-day milestone banner for each day
    events.push({
      uid: `wf-poland2026-day${day.day}-overview@techtrekgt.com`,
      allDay: true,
      startDate: day.date,
      endDate: addDays(day.date, 1),
      summary: `Poland 2026 Day ${day.day}: ${day.cityName} - ${day.theme}`,
      description: `Daily Theme: ${day.theme}\nBase: ${day.base || 'City Center'}\nHighlights: ${(day.highlights || []).join(', ')}`,
      location: `${day.cityName}, Poland`,
      categories: 'ITINERARY,TRIP_DAY'
    });

    // Scheduled activities for the day
    if (Array.isArray(day.schedule)) {
      day.schedule.forEach((item, idx) => {
        // Suppress generic hotel placeholder if confirmed accommodation exists on this date
        if (confirmedHotelDates.has(day.date) && isGenericHotelPlaceholder(item)) {
          return;
        }

        const itemType = (item.itemType || 'activity').toLowerCase();
        let durationMins = 90;
        let categoryTag = 'ACTIVITY';

        if (itemType === 'flight') {
          durationMins = 60;
          categoryTag = 'FLIGHT';
        } else if (itemType === 'rail') {
          durationMins = 120;
          categoryTag = 'TRAIN';
        } else if (itemType === 'hotel') {
          durationMins = 60;
          categoryTag = 'HOTEL';
        } else if (itemType === 'market') {
          durationMins = 150;
          categoryTag = 'MARKET';
        } else if (itemType === 'food' || itemType === 'cafe') {
          durationMins = 90;
          categoryTag = 'DINING';
        } else if (itemType === 'sight') {
          durationMins = 90;
          categoryTag = 'SIGHTSEEING';
        }

        const startTime = item.time || '12:00';
        const { endDate, endTime } = addMinutesWithDate(day.date, startTime, durationMins);

        events.push({
          uid: `wf-poland2026-day${day.day}-item${idx}@techtrekgt.com`,
          allDay: false,
          startDate: day.date,
          startTime: startTime,
          endDate: endDate,
          endTime: endTime,
          summary: item.title,
          description: `${item.description || ''}${item.badge ? `\n[${item.badge}]` : ''}`,
          location: item.location || `${day.cityName}, Poland`,
          categories: categoryTag
        });
      });
    }
  }

  // 2. Flight DL9208 Inbound Touchdown Event
  if (polandJourney.flightArrival) {
    const f = polandJourney.flightArrival;
    const fArrivalDate = f.arrivalDate || '2026-12-04';
    const fArrivalTime = f.arrivalTime || '13:30';
    const { endDate: fEndDate, endTime: fEndTime } = addMinutesWithDate(fArrivalDate, fArrivalTime, 60);
    events.push({
      uid: 'wf-poland2026-flight-dl9208@techtrekgt.com',
      allDay: false,
      startDate: fArrivalDate,
      startTime: fArrivalTime,
      endDate: fEndDate,
      endTime: fEndTime,
      summary: `Flight Arrival: ${f.flightNumber} (${f.carrier})`,
      description: `Flight: ${f.flightNumber}\nRoute: ${f.inboundLeg2}\nConfirmation: ${f.confirmationNumber}\nPassengers: ${f.passengers}\nLayover: ${f.layover}\n${f.checkInSync}`,
      location: `${f.airport} (${f.airportCode})`,
      categories: 'FLIGHT,ARRIVAL'
    });
  }

  // 3. Authenticated User's Private D1 Itinerary Items
  let privateD1Items = [];
  if (db && userId) {
    try {
      const d1Items = await db.prepare(`
        SELECT * FROM wayfinder_itinerary_items
        WHERE (journey_id = ? OR journey_id = 'poland-christmas-2026')
          AND user_id = ?
          AND (notes IS NULL OR notes NOT LIKE '%gmail:%')
        ORDER BY local_date ASC, local_time ASC
      `).bind(journeyId, userId).all();
      privateD1Items = d1Items.results || [];
    } catch (e) {
      console.warn('[calendar] failed to fetch private D1 itinerary items:', e.message);
    }
  }

  // 4. Accommodations (Altus Palace Wrocław & Curated Hotels)
  // Deduplicate against user's private hotel bookings to prevent duplicate calendar check-in events
  for (const acc of CURATED_ACCOMMODATIONS) {
    const accTitle = (acc.hotel_name || acc.title || '').toLowerCase();
    const alreadyCoveredByD1 = privateD1Items.some((item) => {
      const type = (item.item_type || '').toLowerCase();
      if (type !== 'hotel') return false;
      const title = (item.title || item.location || '').toLowerCase();
      return (
        (accTitle.includes('altus') && title.includes('altus')) ||
        (accTitle && title.includes(accTitle)) ||
        (title && accTitle.includes(title))
      );
    });

    if (alreadyCoveredByD1) continue;

    // Check-in event
    const checkInTime = acc.check_in_time || '15:00';
    const { endDate: ciEndDate, endTime: ciEndTime } = addMinutesWithDate(acc.check_in_date, checkInTime, 60);
    events.push({
      uid: `wf-hotel-checkin-${acc.id}@techtrekgt.com`,
      allDay: false,
      startDate: acc.check_in_date,
      startTime: checkInTime,
      endDate: ciEndDate,
      endTime: ciEndTime,
      summary: `Hotel Check-in: ${acc.title}`,
      description: `Accommodation: ${acc.hotel_name}\nGuest: ${acc.guest_name}\nPhone: ${acc.phone}\nEmail: ${acc.email}\nWeb: ${acc.website_url}`,
      location: acc.location,
      categories: 'HOTEL,LODGING'
    });

    // Check-out event
    const checkOutTime = acc.check_out_time || '11:00';
    const { endDate: coEndDate, endTime: coEndTime } = addMinutesWithDate(acc.check_out_date, checkOutTime, 30);
    events.push({
      uid: `wf-hotel-checkout-${acc.id}@techtrekgt.com`,
      allDay: false,
      startDate: acc.check_out_date,
      startTime: checkOutTime,
      endDate: coEndDate,
      endTime: coEndTime,
      summary: `Hotel Check-out: ${acc.title}`,
      description: `Departing ${acc.hotel_name}.\nCheck-out deadline: ${checkOutTime}`,
      location: acc.location,
      categories: 'HOTEL,LODGING'
    });
  }

  // 5. Append Private D1 Itinerary Events
  for (const item of privateD1Items) {
    if (!item.local_date) continue;

    const startTime = item.local_time || '10:00';
    let endDate = item.end_date || item.local_date;
    let endTime = item.end_time;

    if (!endTime) {
      const timing = addMinutesWithDate(item.local_date, startTime, 90);
      endDate = item.end_date || timing.endDate;
      endTime = timing.endTime;
    } else if (!item.end_date && endTime < startTime) {
      endDate = addDays(item.local_date, 1);
    }

    events.push({
      uid: `wf-d1-item-${item.id}@techtrekgt.com`,
      allDay: !item.local_time,
      startDate: item.local_date,
      startTime: startTime,
      endDate: endDate,
      endTime: endTime,
      summary: item.title,
      description: `${item.notes || ''}${item.provider ? `\nProvider: ${item.provider}` : ''}`,
      location: item.location_address || item.location || '',
      categories: (item.item_type || 'BOOKING').toUpperCase()
    });
  }

  return events;
}

// Generate complete URLs dictionary for a given token
function getSubscribeUrls(requestUrl, token) {
  const url = new URL(requestUrl);
  const host = url.host;
  const protocol = url.protocol; // http: or https:
  const basePath = url.pathname.replace(/\/token\/?$/, '');
  const feedPath = `${basePath}/feed/${token}.ics`;

  // HTTPS direct feed endpoint
  const feedUrl = `${protocol}//${host}${feedPath}`;

  // webcal:// URL scheme for native Apple Calendar / Outlook protocol handler
  const webcalUrl = `webcal://${host}${feedPath}`;

  // Google Calendar 1-click web subscription link
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;

  // Outlook 1-click web subscription link
  const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('Poland Christmas 2026')}`;

  return {
    feed_url: feedUrl,
    webcal_url: webcalUrl,
    google_url: googleUrl,
    outlook_url: outlookUrl,
    apple_url: webcalUrl
  };
}

// ---------------------------------------------------------------------
// 1. PUBLIC LIVE CALENDAR FEED HANDLER: GET /api/wayfinder/calendar/feed/:token.ics
// ---------------------------------------------------------------------
export async function handleCalendarFeed(context, url, method) {
  const { env, request } = context;

  if (method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Extract token from /api/wayfinder/calendar/feed/{token}.ics or {token}
  const parts = url.pathname.split('/').filter(Boolean);
  const feedIdx = parts.indexOf('feed');
  if (feedIdx === -1 || !parts[feedIdx + 1]) {
    return new Response('Calendar feed token is required', { status: 400 });
  }

  const rawToken = parts[feedIdx + 1];
  const token = rawToken.replace(/\.ics$/i, '');

  try {
    if (!env.DB) return new Response('Database Unavailable', { status: 503 });
    await ensureCalendarTable(env.DB);

    // Look up token in DB
    const tokenRow = await env.DB.prepare(`
      SELECT * FROM wayfinder_calendar_tokens
      WHERE token = ? AND is_active = 1
    `).bind(token).first();

    if (!tokenRow) {
      return new Response('404 Not Found: Invalid, expired, or revoked calendar feed token', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Update poll telemetry (poll count + last polled timestamp)
    context.ctx?.waitUntil?.(
      env.DB.prepare(`
        UPDATE wayfinder_calendar_tokens
        SET poll_count = poll_count + 1, last_polled_at = datetime('now')
        WHERE id = ?
      `).bind(tokenRow.id).run()
    );

    // Assemble personalized feed
    const events = await gatherEvents({
      db: env.DB,
      journeyId: tokenRow.journey_id,
      userId: tokenRow.user_id
    });

    const icsContent = buildCalendarFeed(events, tokenRow.feed_name || 'Poland Christmas 2026 Schedule');

    return new Response(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="poland-2026-feed.ics"',
        'Cache-Control': 'public, max-age=1800, s-maxage=3600',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('[calendar] feed error:', err);
    return new Response('Internal Server Error generating calendar feed', { status: 500 });
  }
}

// ---------------------------------------------------------------------
// 2. DIRECT SNAPSHOT EXPORT HANDLER: GET /api/wayfinder/calendar/export.ics
// ---------------------------------------------------------------------
export async function handleCalendarExport(context, url, method) {
  const { env, user, request } = context;

  if (method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const journeyId = url.searchParams.get('journey_id') || 'poland-christmas-2026';

  try {
    const events = await gatherEvents({
      db: env.DB,
      journeyId,
      userId: user?.userId || null
    });

    const icsContent = buildCalendarFeed(events, 'Poland Christmas 2026 Itinerary');

    return new Response(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="poland-christmas-2026.ics"',
        'Cache-Control': 'private, no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('[calendar] export error:', err);
    return new Response('Internal Server Error exporting calendar file', { status: 500 });
  }
}

// ---------------------------------------------------------------------
// 3. AUTHENTICATED TOKEN MANAGEMENT: /api/wayfinder/calendar/token
// ---------------------------------------------------------------------
export async function handleCalendarToken(context, url, method) {
  const { env, user, request } = context;

  if (!user?.userId) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);
    await ensureCalendarTable(env.DB);

    const journeyId = url.searchParams.get('journey_id') || 'poland-christmas-2026';

    // GET /api/wayfinder/calendar/token - Fetch active token and subscribe URLs
    if (method === 'GET') {
      const existing = await env.DB.prepare(`
        SELECT * FROM wayfinder_calendar_tokens
        WHERE user_id = ? AND journey_id = ?
      `).bind(user.userId, journeyId).first();

      if (!existing || existing.is_active !== 1) {
        return json({
          has_token: false,
          token: null,
          feed_name: 'Poland 2026 Schedule',
          urls: null
        });
      }

      const urls = getSubscribeUrls(request.url, existing.token);
      return json({
        has_token: true,
        token: existing.token,
        feed_name: existing.feed_name,
        is_active: existing.is_active === 1,
        poll_count: existing.poll_count,
        last_polled_at: existing.last_polled_at,
        created_at: existing.created_at,
        urls
      });
    }

    // POST /api/wayfinder/calendar/token - Generate or rotate token
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const rotate = Boolean(body.rotate);
      const feedName = (body.feed_name || 'Poland 2026 Schedule').trim();

      const existing = await env.DB.prepare(`
        SELECT * FROM wayfinder_calendar_tokens
        WHERE user_id = ? AND journey_id = ?
      `).bind(user.userId, journeyId).first();

      if (existing && !rotate) {
        // Return existing active token
        const urls = getSubscribeUrls(request.url, existing.token);
        return json({
          success: true,
          token: existing.token,
          feed_name: existing.feed_name,
          poll_count: existing.poll_count,
          last_polled_at: existing.last_polled_at,
          urls,
          rotated: false
        });
      }

      const newToken = generateSecureToken();

      if (existing) {
        // Rotate token
        await env.DB.prepare(`
          UPDATE wayfinder_calendar_tokens
          SET token = ?, feed_name = ?, is_active = 1, poll_count = 0, last_polled_at = NULL, created_at = datetime('now')
          WHERE id = ?
        `).bind(newToken, feedName, existing.id).run();
      } else {
        // Create new token
        const id = generateId();
        await env.DB.prepare(`
          INSERT INTO wayfinder_calendar_tokens
          (id, user_id, journey_id, token, feed_name, is_active, poll_count)
          VALUES (?, ?, ?, ?, ?, 1, 0)
        `).bind(id, user.userId, journeyId, newToken, feedName).run();
      }

      const urls = getSubscribeUrls(request.url, newToken);
      return json({
        success: true,
        token: newToken,
        feed_name: feedName,
        poll_count: 0,
        last_polled_at: null,
        urls,
        rotated: Boolean(existing)
      }, 201);
    }

    // DELETE /api/wayfinder/calendar/token - Revoke active token
    if (method === 'DELETE') {
      await env.DB.prepare(`
        UPDATE wayfinder_calendar_tokens
        SET is_active = 0
        WHERE user_id = ? AND journey_id = ?
      `).bind(user.userId, journeyId).run();

      return json({ success: true, revoked: true });
    }

    return json({ error: `Method ${method} not allowed` }, 405);
  } catch (err) {
    console.error('[calendar] token error:', err);
    return json({ error: 'Internal server error', details: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-cache'
    }
  });
}
