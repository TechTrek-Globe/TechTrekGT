/**
 * TechTrekGT Wayfinder Guide - Client-Side Route & Walking Loop Optimizer
 * 
 * Ported and adapted from TREK (liketrek/TREK - RouteCalculator.ts).
 * Implements 2-Opt heuristic and Nearest-Neighbor greedy traversal to minimize
 * walking distance and eliminate criss-crossing paths on snowy European streets.
 * Runs 100% in-browser (<2ms) with zero external API dependencies or network latency.
 */

const EARTH_RADIUS_KM = 6371;
const WINTER_WALKING_SPEED_KMH = 4.5; // Average walking pace on winter/cobblestone streets (km/h)
const DISTANT_EXCURSION_THRESHOLD_KM = 12.0; // Sights further than 12km from city center are day-trip excursions

/**
 * Calculates great-circle distance between two geographic coordinates using the Haversine formula.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number} Distance in kilometers
 */
export function haversineDistanceKm(a, b) {
  if (!a || !b || typeof a.lat !== 'number' || typeof a.lng !== 'number' || typeof b.lat !== 'number' || typeof b.lng !== 'number') {
    return 0;
  }
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const hav = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
  return EARTH_RADIUS_KM * c;
}

/**
 * Squared planar Euclidean distance for rapid comparison without trigonometry.
 * Accurate for local city walks (<20 km radius).
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
export function sqDist(a, b) {
  if (!a || !b) return 0;
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
}

/**
 * Formats a distance in kilometers to user-friendly meters or kilometers.
 * @param {number} km
 * @returns {string} e.g. "450 m" or "1.4 km"
 */
export function formatDistance(km) {
  if (!km || km <= 0) return '0 m';
  if (km < 1.0) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

/**
 * Estimates winter walking duration in minutes.
 * @param {number} km
 * @param {number} speedKmh
 * @returns {number} Walking minutes (rounded)
 */
export function estimateWalkingMinutes(km, speedKmh = WINTER_WALKING_SPEED_KMH) {
  if (!km || km <= 0) return 0;
  const minutes = (km / speedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}

/**
 * Computes the total path length (in km) visiting waypoints in sequential order.
 * Optionally includes start and end anchor legs (e.g. hotel or market base).
 * @param {Array<{ lat: number, lng: number }>} order
 * @param {{ lat: number, lng: number }|null} startAnchor
 * @param {{ lat: number, lng: number }|null} endAnchor
 * @returns {number} Total distance in kilometers
 */
export function calculateTourLengthKm(order, startAnchor = null, endAnchor = null) {
  if (!order || order.length === 0) return 0;
  let totalKm = 0;

  if (startAnchor) {
    totalKm += haversineDistanceKm(startAnchor, order[0]);
  }

  for (let i = 0; i < order.length - 1; i++) {
    totalKm += haversineDistanceKm(order[i], order[i + 1]);
  }

  if (endAnchor) {
    totalKm += haversineDistanceKm(order[order.length - 1], endAnchor);
  }

  return totalKm;
}

/**
 * Greedy nearest-neighbor ordering seeded at startAnchor (or the first element).
 * Provides an initial valid tour order in O(N^2).
 * @template T
 * @param {T[]} places
 * @param {{ lat: number, lng: number }|null} startAnchor
 * @returns {T[]}
 */
export function nearestNeighborOrder(places, startAnchor = null) {
  if (!places || places.length <= 1) return [...(places || [])];

  const visited = new Set();
  const result = [];
  let current = startAnchor || places[0];

  if (!startAnchor) {
    visited.add(0);
    result.push(places[0]);
  }

  while (result.length < places.length) {
    let nearestIdx = -1;
    let minDist = Infinity;

    for (let i = 0; i < places.length; i++) {
      if (visited.has(i)) continue;
      const d = sqDist(places[i], current);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx === -1) break;
    visited.add(nearestIdx);
    current = places[nearestIdx];
    result.push(places[nearestIdx]);
  }

  return result;
}

/**
 * 2-Opt heuristic optimization.
 * Iteratively reverses tour sub-segments whenever reversing shortens the total length.
 * Eliminates self-intersections and criss-crossing walking paths.
 * @template T
 * @param {T[]} order
 * @param {{ lat: number, lng: number }|null} startAnchor
 * @param {{ lat: number, lng: number }|null} endAnchor
 * @returns {T[]}
 */
export function twoOptImprove(order, startAnchor = null, endAnchor = null) {
  if (!order || order.length < 3) return order;

  let best = [...order];
  let bestLen = calculateTourLengthKm(best, startAnchor, endAnchor);
  let improved = true;
  let iterations = 0;
  const maxIterations = 200; // Safeguard against pathological loops

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1)
        ];
        const len = calculateTourLengthKm(candidate, startAnchor, endAnchor);

        // Accept if strictly shorter by at least 1mm (1e-6 km)
        if (len < bestLen - 1e-6) {
          best = candidate;
          bestLen = len;
          improved = true;
        }
      }
    }
  }

  return best;
}

/**
 * Full walking loop optimization workflow.
 * Filters walkable vs distant day-trip sights, applies Nearest-Neighbor + 2-Opt,
 * orients round-trip loops to start at the sight closest to the hotel/base, and computes
 * step-by-step leg metrics and walking time savings.
 * 
 * @param {Array<any>} places Array of sights/attractions with lat & lng
 * @param {Object} options
 * @param {{ lat: number, lng: number, name?: string }|null} [options.startAnchor] Base anchor (hotel or market square)
 * @param {{ lat: number, lng: number, name?: string }|null} [options.endAnchor] Ending anchor
 * @param {boolean} [options.isRoundTrip=true] Whether the route starts and finishes at startAnchor
 * @param {boolean} [options.includeExcursions=false] Whether to include distant sights (>12km away)
 * @param {number} [options.walkingSpeedKmh=4.5] Walking speed in km/h
 * @returns {Object} Optimized route summary with ordered places, legs, and savings
 */
export function optimizeWalkingLoop(places = [], options = {}) {
  const {
    startAnchor = null,
    endAnchor = options.isRoundTrip !== false && startAnchor ? startAnchor : null,
    isRoundTrip = true,
    includeExcursions = false,
    walkingSpeedKmh = WINTER_WALKING_SPEED_KMH
  } = options;

  if (!places || places.length === 0) {
    return {
      orderedPlaces: [],
      originalPlaces: [],
      distantExcursions: [],
      originalLengthKm: 0,
      optimizedLengthKm: 0,
      savedKm: 0,
      originalMinutes: 0,
      optimizedMinutes: 0,
      savedMinutes: 0,
      legs: [],
      hasSavings: false
    };
  }

  // Identify valid items with geographic coordinates
  const validPlaces = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');

  // Partition into walkable city sights vs distant regional day-trips
  const referenceAnchor = startAnchor || (validPlaces[0] ? { lat: validPlaces[0].lat, lng: validPlaces[0].lng } : null);
  const walkablePlaces = [];
  const distantExcursions = [];

  for (const place of validPlaces) {
    const distFromAnchor = referenceAnchor ? haversineDistanceKm(referenceAnchor, place) : 0;
    if (!includeExcursions && distFromAnchor > DISTANT_EXCURSION_THRESHOLD_KM) {
      distantExcursions.push({
        ...place,
        distFromCenterKm: distFromAnchor,
        formattedDistFromCenter: formatDistance(distFromAnchor)
      });
    } else {
      walkablePlaces.push(place);
    }
  }

  // Calculate original tour length before reordering
  const effectiveEndAnchor = isRoundTrip ? startAnchor : endAnchor;
  const originalLengthKm = calculateTourLengthKm(walkablePlaces, startAnchor, effectiveEndAnchor);
  const originalMinutes = estimateWalkingMinutes(originalLengthKm, walkingSpeedKmh);

  if (walkablePlaces.length <= 1) {
    return {
      orderedPlaces: walkablePlaces,
      originalPlaces: walkablePlaces,
      distantExcursions,
      originalLengthKm,
      optimizedLengthKm: originalLengthKm,
      savedKm: 0,
      originalMinutes,
      optimizedMinutes: originalMinutes,
      savedMinutes: 0,
      legs: [],
      hasSavings: false
    };
  }

  // 1. Initial Greedy Nearest Neighbor Pass
  const initialOrder = nearestNeighborOrder(walkablePlaces, startAnchor);

  // 2. 2-Opt Iterative Untangling Pass
  let optimizedOrder = twoOptImprove(initialOrder, startAnchor, effectiveEndAnchor);

  // 3. Round-trip loop orientation:
  // If start === end, orient the tour so that the traveler starts at the sight closest to base
  if (startAnchor && effectiveEndAnchor && startAnchor.lat === effectiveEndAnchor.lat && startAnchor.lng === effectiveEndAnchor.lng && optimizedOrder.length > 1) {
    const distFirst = sqDist(optimizedOrder[0], startAnchor);
    const distLast = sqDist(optimizedOrder[optimizedOrder.length - 1], startAnchor);
    if (distLast < distFirst) {
      optimizedOrder = [...optimizedOrder].reverse();
    }
  }

  // Calculate optimized tour length
  const optimizedLengthKm = calculateTourLengthKm(optimizedOrder, startAnchor, effectiveEndAnchor);
  const optimizedMinutes = estimateWalkingMinutes(optimizedLengthKm, walkingSpeedKmh);

  const rawSavedKm = originalLengthKm - optimizedLengthKm;
  const savedKm = rawSavedKm > 0.05 ? Number(rawSavedKm.toFixed(2)) : 0;
  const savedMinutes = Math.max(0, originalMinutes - optimizedMinutes);
  const hasSavings = savedKm > 0.1 || savedMinutes >= 2;

  // Build step-by-step leg segments
  const legs = [];
  let prevPoint = startAnchor;
  let prevName = startAnchor?.name || 'Starting Point';

  for (let i = 0; i < optimizedOrder.length; i++) {
    const currentPlace = optimizedOrder[i];
    const currentName = currentPlace.title || currentPlace.name || `Stop ${i + 1}`;
    const legDistKm = prevPoint ? haversineDistanceKm(prevPoint, currentPlace) : 0;
    const legMinutes = estimateWalkingMinutes(legDistKm, walkingSpeedKmh);

    legs.push({
      step: i + 1,
      fromName: prevName,
      toName: currentName,
      distanceKm: Number(legDistKm.toFixed(2)),
      formattedDist: formatDistance(legDistKm),
      walkingMinutes: legMinutes
    });

    prevPoint = currentPlace;
    prevName = currentName;
  }

  // Closing leg back to base if round-trip
  if (isRoundTrip && startAnchor && optimizedOrder.length > 0) {
    const lastPlace = optimizedOrder[optimizedOrder.length - 1];
    const returnDistKm = haversineDistanceKm(lastPlace, startAnchor);
    const returnMinutes = estimateWalkingMinutes(returnDistKm, walkingSpeedKmh);

    legs.push({
      step: optimizedOrder.length + 1,
      isReturnToBase: true,
      fromName: prevName,
      toName: startAnchor.name || 'Return to Base',
      distanceKm: Number(returnDistKm.toFixed(2)),
      formattedDist: formatDistance(returnDistKm),
      walkingMinutes: returnMinutes
    });
  }

  return {
    orderedPlaces: optimizedOrder,
    originalPlaces: walkablePlaces,
    distantExcursions,
    originalLengthKm: Number(originalLengthKm.toFixed(2)),
    optimizedLengthKm: Number(optimizedLengthKm.toFixed(2)),
    savedKm,
    originalMinutes,
    optimizedMinutes,
    savedMinutes,
    legs,
    hasSavings
  };
}

/**
 * Builds a multi-stop Google Maps walking directions deep-link URL.
 * Allows travelers to launch the entire untangled sequence directly on iOS/Android Google Maps.
 * 
 * @param {Array<any>} orderedPlaces
 * @param {Object} options
 * @param {{ lat: number, lng: number, name?: string }|null} [options.startAnchor]
 * @param {boolean} [options.isRoundTrip=true]
 * @returns {string} Google Maps URL
 */
export function generateGoogleMapsWalkingUrl(orderedPlaces = [], options = {}) {
  if (!orderedPlaces || orderedPlaces.length === 0) return '';
  const { startAnchor = null, isRoundTrip = true } = options;

  const originPoint = startAnchor 
    ? `${startAnchor.lat},${startAnchor.lng}`
    : `${orderedPlaces[0].lat},${orderedPlaces[0].lng}`;

  let destinationPoint;
  let waypoints = [];

  if (startAnchor && isRoundTrip) {
    destinationPoint = `${startAnchor.lat},${startAnchor.lng}`;
    waypoints = orderedPlaces.map((p) => `${p.lat},${p.lng}`);
  } else if (startAnchor && !isRoundTrip) {
    const last = orderedPlaces[orderedPlaces.length - 1];
    destinationPoint = `${last.lat},${last.lng}`;
    waypoints = orderedPlaces.slice(0, -1).map((p) => `${p.lat},${p.lng}`);
  } else {
    // No startAnchor: first place is origin, last place is destination
    destinationPoint = `${orderedPlaces[orderedPlaces.length - 1].lat},${orderedPlaces[orderedPlaces.length - 1].lng}`;
    waypoints = orderedPlaces.slice(1, -1).map((p) => `${p.lat},${p.lng}`);
  }

  // Google Maps URL directions API limits waypoints to ~9 in a single URL
  const clampedWaypoints = waypoints.slice(0, 8);
  const waypointsParam = clampedWaypoints.length > 0 
    ? `&waypoints=${clampedWaypoints.map(encodeURIComponent).join('|')}` 
    : '';

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originPoint)}&destination=${encodeURIComponent(destinationPoint)}${waypointsParam}&travelmode=walking`;
}
