// Dual-Verification POI Script: Geoapify + Google Places API (< 250m threshold)
// Audits coordinates and local image paths for all POIs in src/data/poland-2026.js.
// Usage:
//   node scripts/verify-pois-dual-geo.mjs [--write] [--prune-legacy-restaurants]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { polandJourney } from '../src/data/poland-2026.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CITY_CENTERS = {
  krakow: { name: 'Kraków', lat: 50.0614, lng: 19.9366 },
  wroclaw: { name: 'Wrocław', lat: 51.1097, lng: 17.0319 },
  poznan: { name: 'Poznań', lat: 52.4082, lng: 16.9335 },
  torun: { name: 'Toruń', lat: 53.0102, lng: 18.6048 },
  gdansk: { name: 'Gdańsk', lat: 54.3487, lng: 18.6531 },
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadDevVars() {
  const vars = {};
  try {
    const raw = await fs.readFile(path.join(ROOT, '.dev.vars'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // Fallback to process.env only
  }
  return vars;
}

function cleanQueryPart(str = '') {
  return String(str)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function queryGooglePlaces(query, biasLat, biasLng, apiKey) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: biasLat, longitude: biasLng },
          radius: 15000,
        },
      },
      maxResultCount: 3,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Google Places HTTP ${res.status}${errText ? `: ${errText.slice(0, 180)}` : ''}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const candidates = (data.places || [])
    .filter((p) => p.location && typeof p.location.latitude === 'number')
    .map((p) => ({
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      lat: p.location.latitude,
      lng: p.location.longitude,
    }));
  return candidates;
}

async function queryGeoapify(poiName, addressText, cityName, biasLat, biasLng, apiKey) {
  const candidates = [];

  // 1. Geoapify Places v2 by cleaned name near POI / city center
  const shortName = cleanQueryPart(poiName).split(/[:/–-]/)[0].trim();
  if (shortName.length >= 3) {
    const placesUrl = new URL('https://api.geoapify.com/v2/places');
    placesUrl.searchParams.set('name', shortName);
    placesUrl.searchParams.set('filter', `circle:${biasLng},${biasLat},15000`);
    placesUrl.searchParams.set('limit', '3');
    placesUrl.searchParams.set('apiKey', apiKey);
    const pRes = await fetch(placesUrl.toString(), { signal: AbortSignal.timeout(8000) });
    if (pRes.ok) {
      const pData = await pRes.json();
      for (const f of pData.features || []) {
        const coords = f.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          candidates.push({
            source: 'geoapify_places',
            name: f.properties?.name || '',
            address: f.properties?.formatted || '',
            lat: coords[1],
            lng: coords[0],
          });
        }
      }
    }
  }

  // 2. Geoapify Geocoding v1 with venue + address + city
  const textQueries = [];
  if (addressText) {
    textQueries.push(`${cleanQueryPart(addressText)}, ${cityName}, Poland`);
  }
  textQueries.push(`${cleanQueryPart(poiName)}, ${cityName}, Poland`);

  for (const text of textQueries) {
    const geoUrl = new URL('https://api.geoapify.com/v1/geocode/search');
    geoUrl.searchParams.set('text', text);
    geoUrl.searchParams.set('filter', `circle:${biasLng},${biasLat},25000`);
    geoUrl.searchParams.set('bias', `proximity:${biasLng},${biasLat}`);
    geoUrl.searchParams.set('limit', '3');
    geoUrl.searchParams.set('apiKey', apiKey);
    const gRes = await fetch(geoUrl.toString(), { signal: AbortSignal.timeout(8000) });
    if (gRes.ok) {
      const gData = await gRes.json();
      for (const f of gData.features || []) {
        const coords = f.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          candidates.push({
            source: 'geoapify_geocode',
            name: f.properties?.name || f.properties?.street || '',
            address: f.properties?.formatted || '',
            lat: coords[1],
            lng: coords[0],
          });
        }
      }
    }
  }

  return candidates;
}

function collectCityPois(city) {
  const center = CITY_CENTERS[city.id] || { name: city.name, lat: 52.0, lng: 19.0 };
  const collections = [
    { key: 'mustSee', category: 'attractions', items: city.mustSee || [] },
    { key: 'markets', category: 'markets', items: city.markets || [] },
    {
      key: city.restaurantsDetailed ? 'restaurantsDetailed' : `${city.id}RestaurantsDetailed`,
      category: 'food',
      items: city.restaurantsDetailed || city[`${city.id}RestaurantsDetailed`] || [],
    },
    {
      key: city.drinksDetailed ? 'drinksDetailed' : `${city.id}DrinksDetailed`,
      category: 'food',
      items: city.drinksDetailed || city[`${city.id}DrinksDetailed`] || [],
    },
    {
      key: city.cafesDetailed ? 'cafesDetailed' : `${city.id}CafesDetailed`,
      category: 'food',
      items: city.cafesDetailed || city[`${city.id}CafesDetailed`] || [],
    },
  ];
  return { center, collections };
}

async function checkImagePath(poi) {
  const paths = [poi.imageUrl, poi.imageSrc].filter(Boolean);
  const issues = [];
  for (const imgPath of paths) {
    if (/^https?:\/\//i.test(imgPath)) {
      issues.push(`external_image:${imgPath}`);
      continue;
    }
    const rel = imgPath.replace(/^\/wayfinder/, '');
    const match = rel.match(/^\/Poland-2026\/images\/(krakow|wroclaw|poznan|torun|gdansk)\/(attractions|food|markets)\/[^/]+$/);
    if (!match) {
      issues.push(`nonstandard_path:${imgPath}`);
      continue;
    }
    try {
      await fs.access(path.join(ROOT, 'public', rel));
    } catch {
      issues.push(`missing_file:${imgPath}`);
    }
  }
  return issues;
}

async function verifySinglePoi(city, center, collectionKey, poi, keys, options = {}) {
  const poiName = poi.name || poi.title || poi.id;
  const addressHint = poi.address || poi.location || poi.locationData || '';
  const biasLat = typeof poi.lat === 'number' ? poi.lat : center.lat;
  const biasLng = typeof poi.lng === 'number' ? poi.lng : center.lng;

  const googleQuery = addressHint
    ? `${cleanQueryPart(poiName)}, ${cleanQueryPart(addressHint)}, ${center.name}, Poland`
    : `${cleanQueryPart(poiName)}, ${center.name}, Poland`;

  let googleCandidates = [];
  let googleError = null;
  const [geoapifyCandidates, imageIssues] = await Promise.all([
    queryGeoapify(poiName, addressHint, center.name, biasLat, biasLng, keys.geoapify).catch((e) => []),
    checkImagePath(poi),
  ]);

  if (!options.skipGoogle && keys.google) {
    try {
      googleCandidates = await queryGooglePlaces(googleQuery, biasLat, biasLng, keys.google);
    } catch (err) {
      googleError = err;
    }
  }

  let bestPair = null;
  for (const g of googleCandidates) {
    for (const a of geoapifyCandidates) {
      const providerDeltaM = haversineMeters(g.lat, g.lng, a.lat, a.lng);
      if (!bestPair || providerDeltaM < bestPair.providerDeltaM) {
        bestPair = { google: g, geoapify: a, providerDeltaM };
      }
    }
  }

  let bestGeoapifyDeltaM = null;
  if (typeof poi.lat === 'number' && typeof poi.lng === 'number' && geoapifyCandidates.length > 0) {
    for (const a of geoapifyCandidates) {
      const d = Math.round(haversineMeters(poi.lat, poi.lng, a.lat, a.lng));
      if (bestGeoapifyDeltaM === null || d < bestGeoapifyDeltaM) {
        bestGeoapifyDeltaM = d;
      }
    }
  }

  let currentVsPairM = null;
  if (bestPair && typeof poi.lat === 'number' && typeof poi.lng === 'number') {
    currentVsPairM = Math.round(haversineMeters(poi.lat, poi.lng, bestPair.google.lat, bestPair.google.lng));
  }

  return {
    cityId: city.id,
    collectionKey,
    poi,
    poiName,
    addressHint,
    imageIssues,
    googleCount: googleCandidates.length,
    googleError,
    geoapifyCount: geoapifyCandidates.length,
    bestGeoapifyDeltaM,
    bestPair,
    providerDeltaM: bestPair ? Math.round(bestPair.providerDeltaM) : null,
    currentVsPairM,
  };
}

async function runPool(tasks, concurrency, worker) {
  const results = new Array(tasks.length);
  let nextIdx = 0;
  async function runner() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await worker(tasks[idx]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => runner()));
  return results;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldWrite = args.has('--write');
  const pruneLegacy = args.has('--prune-legacy-restaurants');

  const vars = await loadDevVars();
  const geoKey = vars.GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY;
  const googleKey =
    process.env.GOOGLE_PLACES_SERVER_KEY ||
    vars.GOOGLE_PLACES_SERVER_KEY ||
    vars.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  if (!geoKey) {
    console.error('Missing GEOAPIFY_API_KEY in .dev.vars or environment.');
    process.exit(1);
  }

  const tasks = [];
  for (const city of polandJourney.route || []) {
    const { center, collections } = collectCityPois(city);
    for (const col of collections) {
      for (const poi of col.items) {
        tasks.push({ city, center, collectionKey: col.key, poi });
      }
    }
  }

  // Probe Google Places once before fan-out so HTTP 403 referrer-restricted keys fail fast cleanly
  let googleBlockedReason = null;
  if (!googleKey) {
    googleBlockedReason = 'Missing GOOGLE_PLACES_SERVER_KEY / GOOGLE_MAPS_API_KEY';
  } else {
    try {
      await queryGooglePlaces('Wawel Royal Castle, Krakow, Poland', 50.0614, 19.9366, googleKey);
    } catch (probeErr) {
      if (probeErr.status === 403 || probeErr.status === 401) {
        googleBlockedReason = `Google Places API denied request (HTTP ${probeErr.status}; key may have HTTP referer restrictions blocking server/CLI requests). Provide an unrestricted/IP-scoped GOOGLE_PLACES_SERVER_KEY for CLI dual verification.`;
      } else {
        googleBlockedReason = probeErr.message;
      }
    }
  }

  if (googleBlockedReason) {
    console.warn(`[WARN] Dual Google Places step blocked: ${googleBlockedReason}`);
    if (shouldWrite) {
      console.error('Refusing to stamp dual-verification metadata without an unrestricted Google Places API check.');
      process.exitCode = 2;
    }
  }

  console.log(`Verifying ${tasks.length} POIs (${googleBlockedReason ? 'Geoapify + image audit only' : 'Geoapify + Google Places <250m'})...`);
  const results = await runPool(tasks, 4, (t) =>
    verifySinglePoi(
      t.city,
      t.center,
      t.collectionKey,
      t.poi,
      { geoapify: geoKey, google: googleKey },
      { skipGoogle: Boolean(googleBlockedReason) }
    )
  );

  let verifiedUnder250 = 0;
  let geoapifyOnlyUnder250 = 0;
  let over250 = [];
  let missingPair = [];
  let imageProblems = [];
  let coordDrift = [];

  for (const r of results) {
    if (r.imageIssues.length > 0) {
      imageProblems.push(`${r.cityId}/${r.collectionKey}/${r.poi.id || r.poiName}: ${r.imageIssues.join(', ')}`);
    }
    if (googleBlockedReason) {
      if (r.bestGeoapifyDeltaM !== null && r.bestGeoapifyDeltaM < 250) {
        geoapifyOnlyUnder250++;
      } else {
        missingPair.push(r);
      }
      continue;
    }
    if (r.providerDeltaM === null) {
      missingPair.push(r);
      continue;
    }
    if (r.providerDeltaM < 250) {
      verifiedUnder250++;
      if (r.currentVsPairM !== null && r.currentVsPairM >= 250) {
        coordDrift.push(r);
      }
      if (shouldWrite && !googleBlockedReason) {
        if (r.currentVsPairM === null || r.currentVsPairM >= 250) {
          r.poi.lat = Number(r.bestPair.google.lat.toFixed(7));
          r.poi.lng = Number(r.bestPair.google.lng.toFixed(7));
        }
        r.poi.verifiedSources = ['geoapify', 'google_places'];
        r.poi.verificationDeltaM = r.providerDeltaM;
      }
    } else {
      over250.push(r);
    }
  }

  if (shouldWrite && !googleBlockedReason) {
    if (pruneLegacy) {
      for (const city of polandJourney.route || []) {
        delete city.restaurants;
      }
    }
    const header = `export const polandJourney = ${JSON.stringify(polandJourney, null, 2)};\n`;
    await fs.writeFile(path.join(ROOT, 'src', 'data', 'poland-2026.js'), header, 'utf8');
    console.log(`Updated src/data/poland-2026.js (wrote dual-verification metadata${pruneLegacy ? ' and pruned legacy city.restaurants' : ''}).`);
  }

  console.log(`\n=== DUAL VERIFICATION SUMMARY ===`);
  console.log(`Total POIs checked:        ${results.length}`);
  if (googleBlockedReason) {
    console.log(`Geoapify matched (<250m):  ${geoapifyOnlyUnder250}`);
    console.log(`Geoapify unverified/>=250: ${missingPair.length}`);
    console.log(`Google Places status:      BLOCKED (${googleBlockedReason})`);
  } else {
    console.log(`Dual-verified (<250m):     ${verifiedUnder250}`);
    console.log(`Provider delta >= 250m:    ${over250.length}`);
    console.log(`Missing dual provider hit: ${missingPair.length}`);
    console.log(`Current coord drift>=250m: ${coordDrift.length}`);
  }
  console.log(`Image path issues:         ${imageProblems.length}`);

  if (coordDrift.length > 0) {
    console.log('\n--- Local Coordinate Drift (>=250m from dual-verified match) ---');
    for (const r of coordDrift) {
      console.log(`  [${r.cityId}/${r.collectionKey}] ${r.poiName}: local->google=${r.currentVsPairM}m, providerDelta=${r.providerDeltaM}m (${r.bestPair.google.lat}, ${r.bestPair.google.lng})`);
    }
  }
  if (over250.length > 0) {
    console.log('\n--- Provider Delta >= 250m ---');
    for (const r of over250) {
      console.log(`  [${r.cityId}/${r.collectionKey}] ${r.poiName} (${r.addressHint}): delta=${r.providerDeltaM}m | G=(${r.bestPair.google.name}) vs A=(${r.bestPair.geoapify.name} / ${r.bestPair.geoapify.address})`);
    }
  }
  if (missingPair.length > 0) {
    console.log('\n--- Unmatched / >= 250m from Geoapify ---');
    for (const r of missingPair) {
      console.log(`  [${r.cityId}/${r.collectionKey}] ${r.poiName}: google=${r.googleCount}, geoapify=${r.geoapifyCount}, bestGeoapifyDeltaM=${r.bestGeoapifyDeltaM}`);
    }
  }
  if (imageProblems.length > 0) {
    console.log('\n--- Image Issues ---');
    for (const line of imageProblems) console.log(`  ${line}`);
  }
}

main().catch((err) => {
  console.error('Dual verification error:', err.message);
  process.exit(1);
});
