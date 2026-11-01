// TechTrek Wayfinder - Unified Chronological Timeline Builder
// Merges public schedule items, private D1 bookings, and confirmed accommodations into a strict chronological sequence.
// Suppresses generic hotel placeholder suggestions when a confirmed accommodation exists.

export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 720; // default midday 12:00
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})/);
  if (!match) return 720;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

export function isGenericHotelPlaceholder(event) {
  if (!event || event.itemType !== 'hotel') return false;
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

export function isRedundantExcursionIdea(event, excursion) {
  if (!event || !excursion) return false;
  const evTitle = (event.title || '').toLowerCase();
  const evDesc = (event.description || '').toLowerCase();
  const excTitle = (excursion.title || '').toLowerCase();
  const excNotes = (excursion.notes || '').toLowerCase();

  const isIdeaOrOptional =
    event.badge === 'Optional Excursion' ||
    event.badge === 'Suggested Sight' ||
    evTitle.includes('day trip idea') ||
    evTitle.includes('optional') ||
    evDesc.includes('optional');

  if (!isIdeaOrOptional) return false;

  const landmarks = ['auschwitz', 'birkenau', 'wieliczka', 'salt mine', 'malbork', 'zakopane', 'toruń', 'torun'];
  return landmarks.some((lm) => {
    const evHasLm = evTitle.includes(lm) || evDesc.includes(lm);
    const excHasLm = excTitle.includes(lm) || excNotes.includes(lm);
    return evHasLm && excHasLm;
  });
}

export function isConflictingScheduleItem(event, excursion) {
  if (!event || !excursion) return false;
  // Only suppress daytime sights and walking tours during excursion, keep markets, dinners, transit
  if (event.itemType === 'flight' || event.itemType === 'rail' || event.itemType === 'market' || event.itemType === 'food') {
    return false;
  }

  const startMin = parseTimeToMinutes(excursion.local_time || excursion.time || '06:30');
  let endMin = excursion.end_time ? parseTimeToMinutes(excursion.end_time) : null;

  if (!endMin) {
    const durMatch = (excursion.duration || excursion.notes || '').match(/(\d{1,2})\s*(?:hours|hrs)/i);
    const durationHours = durMatch ? parseInt(durMatch[1], 10) : 0;
    if (durationHours >= 4) {
      endMin = startMin + durationHours * 60;
    }
  }

  if (!endMin || endMin - startMin < 240) {
    return false;
  }

  const evTimeMin = parseTimeToMinutes(event.time);
  return evTimeMin >= startMin + 30 && evTimeMin < endMin - 15;
}

export function buildUnifiedDayTimeline(dayItem, dayPrivate = [], dayAccommodations = []) {
  if (!dayItem) return [];

  // 1. Detect if any confirmed accommodation or private hotel booking exists for this day
  const hasConfirmedHotel =
    dayAccommodations.length > 0 ||
    dayPrivate.some((p) => {
      const type = (p.item_type || p.docType || p.detected_doc_type || '').toLowerCase();
      return type === 'hotel' || type === 'accommodation' || type === 'lodging';
    });

  // 1b. Identify confirmed private excursions or tours for this day
  const excursions = dayPrivate.filter((p) => {
    const type = (p.item_type || p.docType || p.detected_doc_type || '').toLowerCase();
    const title = (p.title || '').toLowerCase();
    return type === 'excursion' || type === 'tour' || type === 'activity' || title.includes('tour') || title.includes('excursion');
  });

  // 2. Filter public schedule:
  // - Suppress generic hotel placeholders if confirmed hotel is active
  // - Suppress redundant day trip ideas if confirmed excursion is booked for same destination
  // - Suppress daytime city sights that collide with an all-day excursion window (e.g. 11h Auschwitz & Wieliczka)
  const filteredSchedule = (dayItem.schedule || []).filter((event) => {
    if (hasConfirmedHotel && isGenericHotelPlaceholder(event)) {
      return false;
    }
    if (excursions.some((exc) => isRedundantExcursionIdea(event, exc))) {
      return false;
    }
    if (excursions.some((exc) => isConflictingScheduleItem(event, exc))) {
      return false;
    }
    return true;
  });

  // 3. Detect if a public flight arrival event exists for this day
  const hasPublicFlightArrival = filteredSchedule.some(
    (ev) => ev.itemType === 'flight' || (ev.title || '').includes('DL9208') || (ev.title || '').includes('Confirmed Arrival')
  );

  // Filter private D1 bookings:
  // - Ignore raw PDF attachments (title ending in .pdf or .png)
  // - Suppress redundant private flight items if confirmed flight arrival milestone is already present on this day
  // - Deduplicate redundant hotel bookings in private items
  const seenHotelKeys = new Set();
  const filteredPrivate = dayPrivate.filter((priv) => {
    const title = (priv.title || '').trim().toLowerCase();
    if (title.endsWith('.pdf') || title.endsWith('.png')) {
      return false;
    }
    const type = (priv.item_type || priv.docType || priv.detected_doc_type || '').toLowerCase();
    const isHotel = type === 'hotel' || type === 'accommodation' || type === 'lodging';
    if (hasPublicFlightArrival && (type === 'flight' || title.includes('flight: atl to krk') || title.includes('dl9208'))) {
      return false;
    }
    if (isHotel) {
      const docId = priv.source_document_id || '';
      const hotelKey = docId ? `doc:${docId}` : (title.includes('altus') ? 'hotel:altus' : `hotel:${title}:${priv.local_date}`);
      if (seenHotelKeys.has(hotelKey)) {
        return false;
      }
      seenHotelKeys.add(hotelKey);
    }
    return true;
  });

  // Filter static/curated accommodations:
  // If filteredPrivate already contains a confirmed hotel booking matching the curated accommodation
  // (e.g. matching Altus Palace Wrocław, or matching hotel name), suppress the static accommodation
  // to prevent rendering duplicate hotel check-in cards on the timeline!
  const activeAccommodations = dayAccommodations.filter((acc) => {
    const accTitle = (acc.hotel_name || acc.title || '').toLowerCase();
    const alreadyCoveredByPrivate = filteredPrivate.some((priv) => {
      const privType = (priv.item_type || priv.docType || priv.detected_doc_type || '').toLowerCase();
      const isHotel = privType === 'hotel' || privType === 'accommodation' || privType === 'lodging';
      if (!isHotel) return false;
      const privTitle = (priv.title || priv.hotel_name || priv.provider || '').toLowerCase();
      return (
        (accTitle.includes('altus') && privTitle.includes('altus')) ||
        (accTitle && privTitle.includes(accTitle)) ||
        (privTitle && accTitle.includes(privTitle))
      );
    });
    return !alreadyCoveredByPrivate;
  });

  // Enrich private hotel bookings with contact metadata from accommodations if available
  const enrichedPrivate = filteredPrivate.map((priv) => {
    const privType = (priv.item_type || priv.docType || priv.detected_doc_type || '').toLowerCase();
    const isHotel = privType === 'hotel' || privType === 'accommodation' || privType === 'lodging';
    if (isHotel) {
      const privTitle = (priv.title || priv.hotel_name || priv.provider || '').toLowerCase();
      const matchingAcc = dayAccommodations.find((acc) => {
        const accTitle = (acc.hotel_name || acc.title || '').toLowerCase();
        return (
          (accTitle.includes('altus') && privTitle.includes('altus')) ||
          (accTitle && privTitle.includes(accTitle)) ||
          (privTitle && accTitle.includes(privTitle))
        );
      });
      if (matchingAcc) {
        return {
          ...matchingAcc,
          ...priv,
          phone: priv.phone || matchingAcc.phone,
          email: priv.email || matchingAcc.email,
          website_url: priv.website_url || matchingAcc.website_url,
        };
      }
    }
    return priv;
  });

  // 4. Assemble unified items with normalized times
  const items = [];

  // Confirmed Accommodations (not already covered by private bookings)
  activeAccommodations.forEach((acc, idx) => {
    const time = acc.check_in_time || '15:00';
    items.push({
      type: 'accommodation',
      key: acc.id || `acc-${dayItem.day}-${idx}`,
      time,
      timeMinutes: parseTimeToMinutes(time),
      data: acc
    });
  });

  // Private D1 Bookings
  enrichedPrivate.forEach((priv, idx) => {
    const time = priv.local_time || priv.time || priv.reservation_time || priv.departure_time || '12:00';
    items.push({
      type: 'private',
      key: priv.id || `priv-${dayItem.day}-${idx}`,
      time,
      timeMinutes: parseTimeToMinutes(time),
      data: priv
    });
  });

  // Public Schedule Events
  filteredSchedule.forEach((pub, idx) => {
    const time = pub.time || '12:00';
    items.push({
      type: 'public',
      key: `pub-${dayItem.day}-${idx}-${time}`,
      time,
      timeMinutes: parseTimeToMinutes(time),
      data: pub
    });
  });

  // 4. Sort strictly chronologically by time
  items.sort((a, b) => {
    if (a.timeMinutes !== b.timeMinutes) {
      return a.timeMinutes - b.timeMinutes;
    }
    // Secondary tie-breaker: Accommodations & Private Bookings take precedence over generic public events
    const priority = { accommodation: 1, private: 2, public: 3 };
    return (priority[a.type] || 3) - (priority[b.type] || 3);
  });

  return items;
}
