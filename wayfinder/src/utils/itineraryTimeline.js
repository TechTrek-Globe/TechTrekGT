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

export function isGenericRailPlaceholder(event) {
  if (!event || event.itemType !== 'rail') return false;
  const title = (event.title || '').toLowerCase();
  // Keep airport commuter train (SKA1 on Day 1), suppress generic intercity rail placeholders when a confirmed train exists
  if (title.includes('ska1') || title.includes('airport train')) return false;
  return true;
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

/**
 * Detects whether a confirmed hotel booking or accommodation covers a specific itinerary day.
 * Matches by explicit date range (check_in_date to check_out_date), single-day check-in,
 * or city-level confirmed stay window.
 */
export function hasConfirmedHotelForDay(dayItem, accommodations = [], privateItems = [], cities = []) {
  if (!dayItem) return false;
  const dayDate = dayItem.date;
  const cityId = (dayItem.cityId || '').toLowerCase();

  const norm = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // 1. Direct date check in accommodations list
  for (const acc of accommodations) {
    if (!acc) continue;
    const checkIn = acc.check_in_date || acc.start_date || acc.local_date || '';
    const checkOut = acc.check_out_date || acc.end_date || '';
    if (checkIn && checkOut) {
      if (dayDate >= checkIn && dayDate < checkOut) return true;
    } else if (checkIn && checkIn === dayDate) {
      return true;
    }
    const accLoc = norm(acc.location || acc.hotel_address || acc.title || acc.hotel_name || '');
    if (cityId && accLoc.includes(cityId)) {
      if (checkIn && checkOut && dayDate >= checkIn && dayDate < checkOut) return true;
      if (checkIn && checkIn === dayDate) return true;
    }
  }

  // 2. Direct check in private itinerary items (hotel bookings)
  for (const item of privateItems) {
    if (!item) continue;
    const type = (item.item_type || item.docType || item.detected_doc_type || '').toLowerCase();
    if (type === 'hotel' || type === 'accommodation' || type === 'lodging') {
      const checkIn = item.check_in_date || item.start_date || item.local_date || '';
      const checkOut = item.check_out_date || item.end_date || '';
      if (checkIn && checkOut) {
        if (dayDate >= checkIn && dayDate < checkOut) return true;
      } else if (checkIn && checkIn === dayDate) {
        return true;
      }
      const itemLoc = norm(item.location || item.title || item.hotel_name || '');
      if (cityId && itemLoc.includes(cityId)) {
        if (checkIn && checkOut && dayDate >= checkIn && dayDate < checkOut) return true;
        if (checkIn && checkIn === dayDate) return true;
      }
    }
  }

  // 3. Fallback city-level matching if cities array is provided
  if (cities && cities.length > 0) {
    const city = cities.find((c) => c && c.id === dayItem.cityId);
    if (city && city.startDate && city.endDate && dayDate >= city.startDate && dayDate < city.endDate) {
      const hasCityHotel = [...accommodations, ...privateItems].some((candidate) => {
        if (!candidate) return false;
        const type = (candidate.item_type || candidate.docType || candidate.detected_doc_type || '').toLowerCase();
        const isHotelType = type === 'hotel' || type === 'accommodation' || type === 'lodging' || Boolean(candidate.check_in_date);
        if (!isHotelType) return false;
        const text = norm(`${candidate.title || ''} ${candidate.hotel_name || ''} ${candidate.location || ''} ${candidate.hotel_address || ''}`);
        const cTarget = norm(city.id);
        const cName = norm(city.name);
        return (
          text.includes(cTarget) ||
          text.includes(cName) ||
          (cTarget.includes('krakow') && (text.includes('experior') || text.includes('destigo') || text.includes('szewska'))) ||
          (cTarget.includes('wroclaw') && text.includes('altus')) ||
          (cTarget.includes('poznan') && text.includes('brovaria')) ||
          (cTarget.includes('gdansk') && (text.includes('radisson') || text.includes('chmielna')))
        );
      });
      if (hasCityHotel) return true;
    }
  }

  return false;
}

export function buildUnifiedDayTimeline(dayItem, dayPrivate = [], dayAccommodations = [], isAuthenticated = false, customOrderKeys = null) {
  if (!dayItem) return [];

  // When unauthenticated, private items and accommodations MUST NOT be displayed
  const effectiveAccommodations = isAuthenticated ? dayAccommodations : [];
  const effectivePrivate = isAuthenticated ? dayPrivate : [];

  // 1. Detect if any confirmed accommodation or private hotel booking exists for this day
  const hasConfirmedHotel =
    effectiveAccommodations.length > 0 ||
    effectivePrivate.some((p) => {
      const type = (p.item_type || p.docType || p.detected_doc_type || '').toLowerCase();
      return type === 'hotel' || type === 'accommodation' || type === 'lodging';
    });

  // 1b. Identify confirmed private excursions or tours for this day
  const excursions = effectivePrivate.filter((p) => {
    const type = (p.item_type || p.docType || p.detected_doc_type || '').toLowerCase();
    const title = (p.title || '').toLowerCase();
    return type === 'excursion' || type === 'tour' || type === 'activity' || title.includes('tour') || title.includes('excursion');
  });

  // 1c. Detect if any confirmed private rail booking exists for this day
  const hasConfirmedRail = effectivePrivate.some((p) => {
    const type = (p.item_type || p.docType || p.detected_doc_type || '').toLowerCase();
    const title = (p.title || '').toLowerCase();
    if (title.endsWith('.pdf') || title.endsWith('.png')) return false;
    return type === 'rail' || type === 'train';
  });

  // 1d. Detect if any confirmed private flight booking exists for this day
  const hasConfirmedFlight = effectivePrivate.some((p) => {
    const type = (p.item_type || p.docType || p.detected_doc_type || '').toLowerCase();
    return type === 'flight';
  });

  // 2. Filter and adapt public schedule:
  // - If unauthenticated, ensure no private confirmed details, passenger names, or confirmation codes are shown
  // - Suppress generic hotel placeholders if confirmed hotel is active
  // - Suppress generic flight placeholders if confirmed flight booking is active on this day
  // - Suppress redundant day trip ideas if confirmed excursion is booked for same destination
  // - Suppress daytime city sights that collide with an all-day excursion window
  const baseSchedule = (dayItem.schedule || []).map((event) => {
    if (isAuthenticated) {
      return event;
    }

    // Unauthenticated sanitization guard: ensure no confirmed titles, passenger names, or confirmation codes leak
    if (event.itemType === 'flight' || (event.title || '').includes('Confirmed Arrival')) {
      return {
        ...event,
        title: 'Target Arrival: Kraków Airport (KRK)',
        description: 'Afternoon flight arrival into Kraków John Paul II International Airport (KRK). Clear customs and baggage claim, then proceed to the connected train station for direct SKA1 commuter rail into Kraków Główny.',
        badge: 'Airport Arrival'
      };
    }
    return event;
  });

  const filteredSchedule = baseSchedule.filter((event) => {
    if (hasConfirmedHotel && isGenericHotelPlaceholder(event)) {
      return false;
    }
    if (hasConfirmedRail && isGenericRailPlaceholder(event)) {
      return false;
    }
    if (hasConfirmedFlight && event.itemType === 'flight') {
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

  // Filter private D1 bookings:
  // - Ignore raw PDF attachments (title ending in .pdf or .png)
  // - Deduplicate redundant flight, hotel, and rail bookings in private items
  const seenHotelKeys = new Set();
  const seenRailKeys = new Set();
  const seenFlightKeys = new Set();
  const filteredPrivate = effectivePrivate.filter((priv) => {
    const title = (priv.title || '').trim().toLowerCase();
    if (title.endsWith('.pdf') || title.endsWith('.png')) {
      return false;
    }
    const type = (priv.item_type || priv.docType || priv.detected_doc_type || '').toLowerCase();
    const isHotel = type === 'hotel' || type === 'accommodation' || type === 'lodging';
    const isRail = type === 'rail' || type === 'train';
    const isFlight = type === 'flight';
    if (isFlight) {
      const conf = (priv.confirmation_number || '').trim().toLowerCase();
      const docId = priv.source_document_id || '';
      const flightKey = docId ? `flight:doc:${docId}` : (conf ? `flight:conf:${conf}:${priv.local_date}` : `flight:${title}:${priv.local_date}`);
      if (seenFlightKeys.has(flightKey)) {
        return false;
      }
      seenFlightKeys.add(flightKey);
    }
    if (isHotel) {
      const docId = priv.source_document_id || '';
      const hotelKey = docId ? `doc:${docId}` : (title.includes('altus') ? 'hotel:altus' : `hotel:${title}:${priv.local_date}`);
      if (seenHotelKeys.has(hotelKey)) {
        return false;
      }
      seenHotelKeys.add(hotelKey);
    }
    if (isRail) {
      const conf = (priv.confirmation_number || '').trim().toLowerCase();
      const docId = priv.source_document_id || '';
      const railKey = conf ? `rail:conf:${conf}` : (docId ? `rail:doc:${docId}` : `rail:${title}:${priv.local_date}`);
      if (seenRailKeys.has(railKey)) {
        return false;
      }
      seenRailKeys.add(railKey);
    }
    return true;
  });

  // Filter static/curated accommodations:
  // If filteredPrivate already contains a confirmed hotel booking matching the curated accommodation
  // (e.g. matching Altus Palace Wrocław, or matching hotel name), suppress the static accommodation
  // to prevent rendering duplicate hotel check-in cards on the timeline!
  const activeAccommodations = effectiveAccommodations.filter((acc) => {
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
    const slug = (pub.title || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 30);
    items.push({
      type: 'public',
      key: pub.id || `pub-${dayItem.day}-${slug}-${time}`,
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

  // 5. Apply custom traveler order if present
  if (customOrderKeys && Array.isArray(customOrderKeys) && customOrderKeys.length > 0) {
    return applyCustomTimelineOrder(items, customOrderKeys);
  }

  return items;
}

// Storage key for custom drag-and-drop order
export const TIMELINE_CUSTOM_ORDER_KEY = 'wayfinder_timeline_order_v1';

export function getCustomTimelineOrder() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TIMELINE_CUSTOM_ORDER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveCustomTimelineOrder(orderMap) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TIMELINE_CUSTOM_ORDER_KEY, JSON.stringify(orderMap));
    window.dispatchEvent(new CustomEvent('wayfinder:timeline-order-changed', { detail: orderMap }));
  } catch (e) {
    console.error('Failed to save timeline order:', e);
  }
}

export function clearCustomTimelineOrder(day) {
  if (typeof window === 'undefined') return;
  try {
    const current = getCustomTimelineOrder();
    if (day !== undefined && day !== null) {
      delete current[day];
      localStorage.setItem(TIMELINE_CUSTOM_ORDER_KEY, JSON.stringify(current));
    } else {
      localStorage.removeItem(TIMELINE_CUSTOM_ORDER_KEY);
    }
    window.dispatchEvent(new CustomEvent('wayfinder:timeline-order-changed', { detail: current }));
  } catch (e) {
    console.error('Failed to clear timeline order:', e);
  }
}

export function applyCustomTimelineOrder(items, orderKeys) {
  if (!orderKeys || !Array.isArray(orderKeys) || orderKeys.length === 0) {
    return items;
  }
  const keyIndex = new Map();
  orderKeys.forEach((k, idx) => keyIndex.set(k, idx));

  return [...items].sort((a, b) => {
    const hasA = keyIndex.has(a.key);
    const hasB = keyIndex.has(b.key);
    if (hasA && hasB) {
      return keyIndex.get(a.key) - keyIndex.get(b.key);
    }
    if (hasA) return -1;
    if (hasB) return 1;
    return a.timeMinutes - b.timeMinutes;
  });
}

// Travel ticket & DOM-anchor classification helpers for public schedule cards
const CITY_DISPLAY_NAMES = {
  krakow: 'Kraków',
  wroclaw: 'Wrocław',
  poznan: 'Poznań',
  torun: 'Toruń',
  gdansk: 'Gdańsk',
  warsaw: 'Warsaw'
};

export function isConfirmedIntercityRail(itemData) {
  if (!itemData) return false;
  const itemType = (itemData.itemType || itemData.item_type || itemData.docType || '').toLowerCase();
  if (itemType !== 'rail' && itemType !== 'train') return false;
  const title = (itemData.title || '').toLowerCase();
  const location = (itemData.location || '').toLowerCase();
  const badge = (itemData.badge || '').toLowerCase();
  // Exclude urban/commuter rail (SKA1 Airport Train), optional suburban ideas (Sopot SKM), and layovers
  if (
    title.includes('ska1') ||
    title.includes('airport train') ||
    title.includes('sopot') ||
    title.includes('layover') ||
    title.includes('ams transit') ||
    title.includes('optional') ||
    location.includes('schiphol') ||
    badge.includes('optional') ||
    badge.includes('layover')
  ) {
    return false;
  }
  return true;
}

export function isFlightScheduleItem(itemData) {
  if (!itemData) return false;
  const itemType = (itemData.itemType || itemData.item_type || itemData.docType || '').toLowerCase();
  const title = itemData.title || '';
  return (
    itemType === 'flight' ||
    title.includes('Return Flight') ||
    title.includes('Homeward Flight') ||
    title.toLowerCase().includes('flight')
  );
}

export function getTravelDomIdForScheduleItem(itemData, dayNumber) {
  if (!itemData) return null;
  const titleLower = (itemData.title || '').toLowerCase();
  const timeStr = itemData.time || itemData.local_time || '';

  if (isFlightScheduleItem(itemData)) {
    if (dayNumber === 1) return 'travel-flight-krk';
    if (dayNumber === 10) {
      if (
        titleLower.includes('atlanta') ||
        titleLower.includes('homeward') ||
        titleLower.includes('ams') ||
        timeStr.startsWith('10')
      ) {
        return 'travel-flight-atl';
      }
      return 'travel-flight-gdn';
    }
    return null;
  }

  if (isConfirmedIntercityRail(itemData)) {
    if (dayNumber === 4) return 'travel-train-krakow-wroclaw';
    if (dayNumber === 6) return 'travel-train-wroclaw-poznan';
    if (dayNumber === 7) {
      if (
        timeStr.startsWith('08') ||
        titleLower.includes('poznań') ||
        titleLower.includes('poznan')
      ) {
        return 'travel-train-poznan-torun';
      }
      if (
        timeStr.startsWith('15') ||
        titleLower.includes('gdańsk') ||
        titleLower.includes('gdansk') ||
        titleLower.includes('coastal')
      ) {
        return 'travel-train-torun-gdansk';
      }
    }
  }

  return null;
}

function formatMatchedDocument(doc, data) {
  if (!doc) return null;
  return {
    ...doc,
    filename: doc.filename || doc.safe_display_name || doc.original_filename || 'Document',
    details: {
      ...(doc.details || {}),
      ...(data?.confirmation_number ? { confirmation: data.confirmation_number } : {}),
      ...(data?.provider ? { provider: data.provider } : {})
    }
  };
}

export function getTravelDocForScheduleItem(data, dayItem, documents = []) {
  if (!data || !dayItem || !Array.isArray(documents) || documents.length === 0) return null;

  if (data.source_document_id) {
    const direct = documents.find((d) => d && d.id === data.source_document_id);
    if (direct) return formatMatchedDocument(direct, data);
  }

  const conf = (data.confirmation_number || '').trim().toUpperCase();
  if (conf) {
    const byConf = documents.find((d) => {
      const hay = `${d?.safe_display_name || ''} ${d?.original_filename || ''}`.toUpperCase();
      return hay.includes(conf);
    });
    if (byConf) return formatMatchedDocument(byConf, data);
  }

  if (isConfirmedIntercityRail(data)) {
    const dayHints = {
      4: ['krakow', 'kraków', 'wroclaw', 'wrocław', 'galicja'],
      6: ['wroclaw', 'wrocław', 'poznan', 'poznań'],
      7: (data.title || '').toLowerCase().includes('gdansk') || (data.title || '').toLowerCase().includes('gdańsk')
        ? ['torun', 'toruń', 'gdansk', 'gdańsk']
        : ['poznan', 'poznań', 'torun', 'toruń']
    }[dayItem.day] || [];

    const railDocs = documents.filter((d) => (d?.detected_doc_type || '').toLowerCase() === 'rail');
    const matchedRail = railDocs.find((d) => {
      const hay = `${d?.safe_display_name || ''} ${d?.original_filename || ''}`.toLowerCase();
      return dayHints.some((hint) => hay.includes(hint));
    }) || (railDocs.length === 1 ? railDocs[0] : null);
    return matchedRail ? formatMatchedDocument(matchedRail, data) : null;
  }

  if (isFlightScheduleItem(data)) {
    const flightDoc = documents.find((d) => (d?.detected_doc_type || '').toLowerCase() === 'flight');
    return flightDoc ? formatMatchedDocument(flightDoc, data) : null;
  }

  return null;
}

// Maps timeline event items to deep links in city guides and specific Must-Have dining tiles
export function getItemDestination(itemData, dayCityId) {
  if (!itemData) return null;
  const type = itemData.itemType || '';
  const title = (itemData.title || '').toLowerCase();
  const location = (itemData.location || '').toLowerCase();

  let city = dayCityId || 'krakow';
  if (
    title.includes('gdansk') ||
    title.includes('gdańsk') ||
    title.includes('targ weglowy') ||
    title.includes('targ węglowy') ||
    title.includes('motlawa') ||
    title.includes('motława') ||
    title.includes('sopot') ||
    location.includes('gdansk') ||
    location.includes('gdańsk') ||
    location.includes('sopot')
  ) {
    city = 'gdansk';
  }
  const cityName = CITY_DISPLAY_NAMES[city] || 'Poland';

  if (type === 'rail' && (title.includes('sopot') || title.includes('baltic coast') || location.includes('sopot'))) {
    return {
      type: 'sight',
      cityName: 'Gdańsk',
      venueName: 'Sopot Pier & Baltic Coast',
      url: '/wayfinder/poland-christmas-2026/cities/gdansk/attractions#sopot-pier',
      buttonText: 'View Sopot Pier & Baltic Coast Tile'
    };
  }

  if (type === 'food' || type === 'restaurant' || title.includes('dinner') || title.includes('lunch')) {
    let venueHash = '';
    let venueName = 'Must-Have Dining';
    if (title.includes('morskie oko')) {
      venueHash = '#morskie-oko';
      venueName = 'Morskie Oko';
    } else if (title.includes('czarna kaczka')) {
      venueHash = '#czarna-kaczka';
      venueName = 'Czarna Kaczka';
    } else if (title.includes('pod wawelem')) {
      venueHash = '#pod-wawelem';
      venueName = 'Pod Wawelem';
    } else if (title.includes('zapiekank') || title.includes('plac nowy')) {
      venueHash = '#plac-nowy-zapiekanki';
      venueName = 'Plac Nowy Zapiekanki';
    } else if (title.includes('konspira')) {
      venueHash = '#konspira';
      venueName = 'Konspira';
    } else if (title.includes('piwnica')) {
      venueHash = '#piwnica-swidnicka';
      venueName = 'Piwnica Świdnicka';
    } else if (title.includes('karczma lwowska')) {
      venueHash = '#karczma-lwowska';
      venueName = 'Karczma Lwowska';
    } else if (title.includes('brovaria')) {
      venueHash = '#brovaria';
      venueName = 'Brovaria Microbrewery';
    } else if (title.includes('kubicki')) {
      venueHash = '#kubicki';
      venueName = 'Kubicki Waterfront';
    } else if (title.includes('gdanski bowke') || title.includes('gdański bowke')) {
      venueHash = '#gdanski-bowke';
      venueName = 'Gdański Bowke';
    } else if (title.includes('spichrz')) {
      venueHash = '#karczma-spichrz';
      venueName = 'Karczma Spichrz';
    }

    return {
      type: 'food',
      cityName,
      venueName,
      url: `/wayfinder/poland-christmas-2026/cities/${city}/restaurants${venueHash}`,
      buttonText: venueName !== 'Must-Have Dining' ? `View ${venueName} Tile` : 'View Must-Have Dining Guide'
    };
  }

  if (type === 'market') {
    let venueHash = '';
    let venueName = 'Christmas Market';

    if (city === 'krakow') {
      if (title.includes('maly rynek') || title.includes('mały rynek')) {
        venueHash = '#maly-rynek';
        venueName = 'Mały Rynek Craft Corner';
      } else if (title.includes('wolnica') || title.includes('bohemian')) {
        venueHash = '#kazimierz-wolnica';
        venueName = 'Plac Wolnica Market';
      } else {
        venueHash = '#rynek-glowny';
        venueName = 'Rynek Główny Main Market';
      }
    } else if (city === 'wroclaw') {
      if (title.includes('solny')) {
        venueHash = '#wroclaw-plac-solny';
        venueName = 'Plac Solny Christmas Market';
      } else if (title.includes('swidnicka') || title.includes('świdnicka') || title.includes('olawska') || title.includes('oławska')) {
        venueHash = '#wroclaw-swidnicka';
        venueName = 'Świdnicka & Oławska Avenues';
      } else {
        venueHash = '#wroclaw-rynek';
        venueName = 'Wrocław Christmas Market';
      }
    } else if (city === 'poznan') {
      if (title.includes('stary rynek')) {
        venueHash = '#poznan-stary-rynek';
        venueName = 'Stary Rynek Old Market Fair';
      } else if (title.includes('mtp') || title.includes('miedzynarodowe') || title.includes('winter fair')) {
        venueHash = '#poznan-mtp';
        venueName = 'MTP Winter Fair';
      } else {
        venueHash = '#poznan-plac-wolnosci';
        venueName = 'Plac Wolności Market';
      }
    } else if (city === 'torun') {
      venueHash = '#torun-rynek-staromiejski';
      venueName = 'Rynek Staromiejski Market';
    } else if (city === 'gdansk') {
      if (title.includes('tkacka') || title.includes('zbrojownia')) {
        venueHash = '#gdansk-tkacka';
        venueName = 'Ulica Tkacka Artisans Fair';
      } else if (title.includes('spichrz') || title.includes('granary island') || title.includes('promenade')) {
        venueHash = '#gdansk-wyspa-spichrzow';
        venueName = 'Granary Island Winter Promenade';
      } else {
        venueHash = '#gdansk-targ-weglowy';
        venueName = 'Targ Węglowy Christmas Market';
      }
    }

    return {
      type: 'market',
      cityName,
      venueName,
      url: `/wayfinder/poland-christmas-2026/cities/${city}/markets${venueHash}`,
      buttonText: venueName !== 'Christmas Market' ? `View ${venueName} Tile` : 'View Christmas Market Guide'
    };
  }

  if (type === 'sight') {
    let venueHash = '';
    let venueName = 'Must-See Sight';

    if (city === 'krakow') {
      if (title.includes('wawel')) {
        venueHash = '#wawel-castle';
        venueName = 'Wawel Royal Castle';
      } else if (title.includes('mary') || title.includes('mariack') || title.includes('hejnał') || title.includes('hejnal')) {
        venueHash = '#st-marys-basilica';
        venueName = "St. Mary's Basilica";
      } else if (title.includes('cloth hall') || title.includes('sukiennice') || title.includes('underground')) {
        venueHash = '#cloth-hall';
        venueName = 'Cloth Hall & Underground';
      } else if (title.includes('kazimierz') || title.includes('jewish')) {
        venueHash = '#kazimierz-district';
        venueName = 'Kazimierz Jewish Quarter';
      } else if (title.includes('wieliczka') || title.includes('salt mine')) {
        venueHash = '#wieliczka-salt-mine';
        venueName = 'Wieliczka Salt Mine';
      } else if (title.includes('auschwitz') || title.includes('birkenau')) {
        venueHash = '#auschwitz-birkenau';
        venueName = 'Auschwitz-Birkenau Memorial';
      } else if (title.includes('schindler')) {
        venueHash = '#schindler-factory';
        venueName = "Schindler's Enamel Factory";
      } else if (title.includes('planty') || title.includes('barbican')) {
        venueHash = '#planty-park';
        venueName = 'Planty Park & Barbican';
      } else if (title.includes('chocholow') || title.includes('thermal')) {
        venueHash = '#chocholow-thermal-baths';
        venueName = 'Chochołów Thermal Baths';
      } else if (title.includes('collegium')) {
        venueHash = '#collegium-maius';
        venueName = 'Collegium Maius';
      } else if (title.includes('czartoryski')) {
        venueHash = '#czartoryski-museum';
        venueName = 'Czartoryski Museum';
      } else if (title.includes('szopki')) {
        venueHash = '#szopki-competition';
        venueName = 'Szopki Krakowskie Competition';
      }
    } else if (city === 'wroclaw') {
      if (title.includes('ostrow') || title.includes('ostrów') || title.includes('cathedral island') || title.includes('lantern') || title.includes('st. john')) {
        venueHash = '#ostrow-tumski';
        venueName = 'Ostrów Tumski';
      } else if (title.includes('dwarf') || title.includes('krasnal')) {
        venueHash = '#wroclaw-dwarfs';
        venueName = 'Wrocław Dwarfs Scavenger Hunt';
      } else if (title.includes('panorama') || title.includes('raclawic')) {
        venueHash = '#panorama-raclawice';
        venueName = 'Panorama of Racławice';
      } else if (title.includes('centennial') || title.includes('stulecia')) {
        venueHash = '#centennial-hall';
        venueName = 'Centennial Hall (UNESCO)';
      } else if (title.includes('tumski bridge') || title.includes('lover')) {
        venueHash = '#tumski-bridge';
        venueName = 'Tumski Bridge & Oderfront';
      } else if (title.includes('ratusz') || title.includes('town hall') || title.includes('market square')) {
        venueHash = '#wroclaw-ratusz';
        venueName = 'Wrocław Town Hall & Rynek';
      } else if (title.includes('hydropolis')) {
        venueHash = '#hydropolis-wroclaw';
        venueName = 'Hydropolis';
      } else if (title.includes('national museum') || title.includes('muzeum narodowe')) {
        venueHash = '#wroclaw-national-museum';
        venueName = 'National Museum in Wrocław';
      } else if (title.includes('lumina') || title.includes('topacz')) {
        venueHash = '#lumina-park-wroclaw';
        venueName = 'Lumina Park Winter Lights';
      }
    } else if (city === 'poznan') {
      if (title.includes('rogal') || title.includes('croissant')) {
        venueHash = '#poznan-rogalowe-muzeum';
        venueName = 'Rogalowe Muzeum Poznania';
      } else if (title.includes('ratusz') || title.includes('town hall') || title.includes('stary rynek')) {
        venueHash = '#poznan-ratusz';
        venueName = 'Poznań Town Hall & Stary Rynek';
      } else if (title.includes('ostrow') || title.includes('ostrów') || title.includes('cathedral')) {
        venueHash = '#poznan-ostrow-tumski';
        venueName = 'Ostrów Tumski & Cathedral';
      } else if (title.includes('cesarski') || title.includes('imperial castle')) {
        venueHash = '#poznan-zamek-cesarski';
        venueName = 'Imperial Castle (Zamek Cesarski)';
      } else if (title.includes('cytadela') || title.includes('citadel')) {
        venueHash = '#poznan-park-cytadela';
        venueName = 'Citadel Park & Fort Winiary';
      } else if (title.includes('fara')) {
        venueHash = '#poznan-fara';
        venueName = 'Poznań Fara Basilica';
      } else if (title.includes('palmiarnia') || title.includes('palm house')) {
        venueHash = '#poznan-palmiarnia';
        venueName = 'Poznań Palm House';
      } else if (title.includes('applied arts') || title.includes('royal castle')) {
        venueHash = '#poznan-applied-arts-museum';
        venueName = 'Applied Arts Museum';
      } else if (title.includes('ice sculpture')) {
        venueHash = '#ice-sculpture-festival-poznan';
        venueName = 'Ice Sculpture Festival';
      }
    } else if (city === 'torun') {
      if (title.includes('gingerbread') || title.includes('piernik') || title.includes('żywe') || title.includes('zywe')) {
        venueHash = '#torun-zywemu-muzeum-piernika';
        venueName = 'Living Museum of Gingerbread';
      } else if (title.includes('kopernik') || title.includes('copernicus')) {
        venueHash = '#torun-dom-kopernika';
        venueName = 'Nicolaus Copernicus House';
      } else if (title.includes('krzywa') || title.includes('leaning tower')) {
        venueHash = '#torun-krzywa-wieza';
        venueName = 'Leaning Tower of Toruń';
      } else if (title.includes('krzyzacki') || title.includes('teutonic')) {
        venueHash = '#torun-zamek-krzyzacki';
        venueName = 'Teutonic Castle Ruins';
      } else {
        venueHash = '#torun-ratusz-staromiejski';
        venueName = 'Old Town Hall & Copernicus';
      }
    } else if (city === 'gdansk') {
      if (title.includes('dlugi targ') || title.includes('długi targ') || title.includes('royal way') || title.includes('long market')) {
        venueHash = '#gdansk-dlugi-targ';
        venueName = 'Long Market & Main Town Hall';
      } else if (title.includes('crane') || title.includes('zuraw') || title.includes('żuraw') || title.includes('motlawa') || title.includes('motława')) {
        venueHash = '#gdansk-zuraw';
        venueName = 'Medieval Port Crane & Motława';
      } else if (title.includes('mariack') || title.includes('st. mary')) {
        venueHash = '#gdansk-bazylika-mariacka';
        venueName = "St. Mary's Basilica";
      } else if (title.includes('neptun')) {
        venueHash = '#gdansk-fontanna-neptuna';
        venueName = "Neptune's Fountain";
      } else if (title.includes('ii wojny') || title.includes('second world war') || title.includes('world war')) {
        venueHash = '#gdansk-muzeum-ii-wojny';
        venueName = 'Museum of the Second World War';
      } else if (title.includes('solidar') || title.includes('ecs')) {
        venueHash = '#gdansk-ecs-solidarnosc';
        venueName = 'European Solidarity Centre';
      } else if (title.includes('amber') || title.includes('bursztyn')) {
        venueHash = '#gdansk-amber-museum';
        venueName = 'Amber Museum at Great Mill';
      } else if (title.includes('oliwa') || title.includes('organ')) {
        venueHash = '#gdansk-katedra-oliwa';
        venueName = 'Oliwa Cathedral & Organ';
      } else if (title.includes('sopot') || title.includes('molo') || title.includes('pier')) {
        venueHash = '#sopot-pier';
        venueName = 'Sopot Pier & Baltic Coast';
      }
    }

    return {
      type: 'sight',
      cityName,
      venueName,
      url: `/wayfinder/poland-christmas-2026/cities/${city}/attractions${venueHash}`,
      buttonText: venueName !== 'Must-See Sight' ? `View ${venueName} Tile` : 'View Attractions Guide'
    };
  }

  return null;
}
