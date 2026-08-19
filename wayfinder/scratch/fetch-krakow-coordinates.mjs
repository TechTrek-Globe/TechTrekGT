import { polandJourney } from '../src/data/poland-2026.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(WAYFINDER_ROOT, 'src', 'data', 'poland-2026.js');
const DEV_VARS_FILE = path.join(WAYFINDER_ROOT, '.dev.vars');

// Read GEOAPIFY_API_KEY from .dev.vars
function readDevVars() {
  const content = fs.readFileSync(DEV_VARS_FILE, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();
    vars[key.trim()] = value.replace(/^"|"$/g, '');
  }
  return vars;
}

const devVars = readDevVars();
const API_KEY = devVars.GEOAPIFY_API_KEY;
if (!API_KEY) {
  console.error('FATAL: GEOAPIFY_API_KEY not found in .dev.vars');
  process.exit(1);
}

// Script B (Foursquare) handles the 3 Krakow markets (which lack images AND coords).
// Script A handles all OTHER POIs missing coordinates (48 Krakow + 1 Wroclaw = 49).
const CATEGORY_ARRAYS = ['mustSee', 'restaurantsDetailed', 'drinksDetailed', 'cafesDetailed'];

// Neighborhood-only descriptors that are too ambiguous for geocoding alone.
const AMBIGUOUS_LOCATIONS = new Set([
  'old town', 'rynek', 'stare miasto', 'wawel hill', 'wieliczka', 'oświęcim',
  'oswiecim', 'zabłocie', 'zablocie', 'kazimierz', 'planty', 'chochołów',
  'chocholow', 'podhale', 'old town (rynek)', 'old town (planty)', 'old town (stare miasto)',
  'kazimierz & zabłocie', 'kazimierz & zablocie', 'rynek (old town)', 'planty park'
]);

// For mustSee entries whose location is just a neighborhood/district, the venue NAME
// is the best search term. For restaurants/drinks/cafes with real street addresses,
// use the address.
function resolveSearchBase(poi, arrayKey) {
  const candidates = [
    poi.address,
    poi.locationData,
    poi.location,
    poi.neighborhood
  ].filter(v => v && typeof v === 'string');

  // Prefer the address field when present (contains a real street).
  if (poi.address) return cleanQuery(poi.address);

  // For mustSee/tours, if location is ambiguous, use the venue name.
  const loc = candidates[0];
  if (loc) {
    const locLower = loc.toLowerCase().trim();
    if (AMBIGUOUS_LOCATIONS.has(locLower)) {
      return cleanQuery(poi.name || loc);
    }
    return cleanQuery(loc);
  }
  return cleanQuery(poi.name || '');
}

const TARGETS = [];

for (const city of polandJourney.route) {
  for (const arrayKey of CATEGORY_ARRAYS) {
    const arr = city[arrayKey];
    if (!Array.isArray(arr)) continue;
    for (const poi of arr) {
      if (!poi || typeof poi !== 'object') continue;
      const hasLat = typeof poi.lat === 'number' && !isNaN(poi.lat);
      const hasLng = typeof poi.lng === 'number' && !isNaN(poi.lng);
      if (hasLat && hasLng) continue;
      const base = resolveSearchBase(poi, arrayKey);
      TARGETS.push({ cityId: city.id, arrayKey, name: poi.name || poi.title || '(unnamed)', id: poi.id, address: base });
    }
  }
}

console.log('======================================================');
console.log('Geoapify Coordinate Fetch - TARGET LIST');
console.log('======================================================');
console.log(`Total targets: ${TARGETS.length}\n`);
for (const t of TARGETS) {
  console.log(`  [${t.cityId}] ${t.arrayKey} > ${t.name} | query: "${t.address}"`);
}

// --- Geocode via Geoapify ---
function cleanQuery(raw) {
  // Strip parenthetical qualifiers like "(Old Town)", "(Kazimierz)", "(Near Main Square)"
  let s = raw.replace(/\s*\([^)]*\)/g, '').trim();
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Region bounding boxes to reject out-of-region geocoding results (zero hallucination guard).
// Krakow bounds cover the Malopolska region to include legitimate day-trip attractions
// (Auschwitz in Oswiecim, Wieliczka Salt Mine, Chocholow Thermal Baths) while rejecting
// clearly-wrong results (e.g. Lodz at lat 51.69, lng 20.47).
const CITY_BOUNDS = {
  krakow: { minLat: 49.2, maxLat: 50.4, minLng: 19.0, maxLng: 20.6 },
  wroclaw: { minLat: 51.0, maxLat: 51.2, minLng: 16.9, maxLng: 17.2 }
};

// Authoritative venue coordinates for known POIs where the geocoder falls back to
// Krakow city-center instead of the true location. These are verified real-world coords.
const VENUE_OVERRIDES = {
  "Auschwitz-Birkenau Memorial and Museum": { lat: 50.0357, lng: 19.1783 },
  "Chochołów Thermal Baths (Chochołowskie Termy)": { lat: 49.3668, lng: 19.8136 }
};

function inBounds(cityId, lat, lng) {
  const b = CITY_BOUNDS[cityId];
  if (!b) return true;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

async function geocode(target) {
  // Zero-hallucination override: use authoritative known coords before any API call.
  const override = VENUE_OVERRIDES[target.name];
  if (override) {
    console.log(`    OVERRIDE "${target.name}" -> lat=${override.lat}, lng=${override.lng} (authoritative)`);
    return { lat: override.lat, lng: override.lng, formatted: 'authoritative override' };
  }

  const cityName = target.cityId === 'krakow' ? 'Krakow' : 'Wroclaw';
  // For multi-address strings (e.g. "ul. sw. Jana 5 & ul. Florianska 19"), use the first address only.
  const rawBase = target.address ? cleanQuery(target.address) : cleanQuery(target.name);
  const base = rawBase.split('&')[0].trim();
  const searchQuery = `${base}, ${cityName}, Poland`;

  // Use Geoapify Geocoding API (free tier: 3 req/s)
  const params = new URLSearchParams({
    text: searchQuery,
    apiKey: API_KEY,
    limit: '1',
    lang: 'en'
  });

  const url = `https://api.geoapify.com/v1/geocode/search?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`    GEOAPIFY HTTP ${res.status} for "${target.name}"`);
      return null;
    }
    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      console.error(`    NO RESULT for "${target.name}"`);
      return null;
    }
    const f = data.features[0];
    const props = f.properties || {};
    const lat = props.lat;
    const lon = props.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      console.error(`    BAD COORDS for "${target.name}": lat=${lat}, lon=${lon}`);
      return null;
    }
    // Zero-hallucination guard: reject results outside the expected region.
    if (!inBounds(target.cityId, lat, lon)) {
      console.error(`    OUT OF BOUNDS for "${target.name}": lat=${lat}, lng=${lon} (${props.formatted || ''})`);
      return null;
    }
    console.log(`    OK "${target.name}" -> lat=${lat}, lng=${lon} (${props.formatted || 'formatted'})`);
    return { lat, lng: lon, formatted: props.formatted || '' };
  } catch (err) {
    console.error(`    FETCH ERROR for "${target.name}": ${err.message}`);
    return null;
  }
}

// --- Inject coordinates into the file ---
// Uses a brace-matching scanner to locate the exact object block containing each target name,
// then inserts `lat:`/`lng:` as the first properties (matching existing POI formatting where
// lat/lng appear early in the object, e.g. Wroclaw/Poznan/Gdansk entries).

function findObjectBlock(arrSlice, nameLineRelIndex) {
  // Scan backwards from the name line to find the opening `{` of the enclosing object.
  let depth = 0;
  let open = -1;
  for (let i = nameLineRelIndex; i >= 0; i--) {
    const ch = arrSlice[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) {
        open = i;
        break;
      }
      depth--;
    }
  }
  if (open === -1) return null;

  // Scan forward from the opening brace to find the matching close.
  depth = 0;
  let close = -1;
  for (let i = open; i < arrSlice.length; i++) {
    const ch = arrSlice[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      // Find the newline AFTER this closing brace so we replace the whole object line-by-line.
      if (depth === 0) {
        close = arrSlice.indexOf('\n', i);
        if (close === -1) close = arrSlice.length;
        break;
      }
    }
  }
  if (close === -1) return null;
  return { open, close };
}

// Escapes regex-special chars in a string for use inside a RegExp literal.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function main() {
  // Requires --apply to write the file. Without it, runs as a read-only preview.
  const apply = process.argv.includes('--apply');
  let source = fs.readFileSync(DATA_FILE, 'utf8');
  const results = [];
  const failures = [];

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  for (const target of TARGETS) {
    // Build query (throttle to ~3 req/s for Geoapify free tier)
    const coords = await geocode(target);
    await delay(350);
    if (!coords) {
      failures.push(target.name);
      continue;
    }

    // Locate the city block via `id: "<cityId>"` (appears once per city).
    const cityMarker = `id: "${target.cityId}"`;
    const cityIdx = source.indexOf(cityMarker);
    if (cityIdx === -1) {
      failures.push(`${target.name} (city marker not found)`);
      continue;
    }
    const citySlice = source.slice(cityIdx);

    // Locate this array key within the city slice.
    const arrMarker = `${target.arrayKey}: [`;
    const arrIdx = citySlice.indexOf(arrMarker);
    if (arrIdx === -1) {
      failures.push(`${target.name} (array marker not found)`);
      continue;
    }
    const arrSlice = citySlice.slice(arrIdx);

    // Locate the name line within this array and isolate the preceding property indent.
    const nameRelIndex = arrSlice.indexOf(`name: "${target.name}"`);
    if (nameRelIndex === -1) {
      failures.push(`${target.name} (name line not found)`);
      continue;
    }

    // Snapshot of what precedes the name is the leading whitespace of the name line.
    const lineStart = arrSlice.lastIndexOf('\n', nameRelIndex) + 1;
    const nameLineText = arrSlice.slice(lineStart, nameRelIndex);
    const indentMatch = nameLineText.match(/^(\s*)/);
    const propIndent = indentMatch ? indentMatch[1] : '          ';

    // Guard: never insert into an object that already has coordinates.
    const objStart = arrSlice.lastIndexOf('{', nameRelIndex);
    const objEndClose = arrSlice.indexOf('\n', arrSlice.indexOf('}', nameRelIndex));
    const objSlice = arrSlice.slice(objStart, objEndClose);
    const hasCoords = /lat\s*:/.test(objSlice) || /lng\s*:/.test(objSlice);
    if (hasCoords) {
      results.push({ name: target.name, status: 'SKIP (already has coords)' });
      continue;
    }

    // Insert lat/lng on the line IMMEDIATELY BEFORE the name line,
    // matching the existing POI convention (coords first, same indent).
    const insertion = `${propIndent}lat: ${coords.lat},\n${propIndent}lng: ${coords.lng},\n`;
    const fullInsertionAt = citySlice.indexOf(`name: "${target.name}"`);
    if (fullInsertionAt === -1) {
      failures.push(`${target.name} (name re-locate failed)`);
      continue;
    }
    const fullLineStart = citySlice.lastIndexOf('\n', fullInsertionAt) + 1;
    const updatedCitySlice = citySlice.slice(0, fullLineStart) + insertion + citySlice.slice(fullLineStart);

    // Replace in source.
    source = source.slice(0, cityIdx) + updatedCitySlice + source.slice(cityIdx + citySlice.length);

    results.push({ name: target.name, status: `OK (lat=${coords.lat}, lng=${coords.lng})` });
  }

  if (!apply) {
    console.log('\n======================================================');
    console.log('PREVIEW MODE - NO FILE WRITTEN (pass --apply to write)');
    console.log('======================================================');
    console.log(`Would update: ${results.filter(r => r.status.startsWith('OK')).length}`);
    console.log(`Would skip (already had coords): ${results.filter(r => r.status.startsWith('SKIP')).length}`);
    console.log(`Failed: ${failures.length}`);
    if (failures.length) {
      console.log('\nFailures:');
      for (const f of failures) console.log(`  - ${f}`);
    }
    return;
  }

  // Write modified file
  fs.writeFileSync(DATA_FILE, source, 'utf8');
  console.log('\n======================================================');
  console.log('WRITE COMPLETE');
  console.log('======================================================');
  console.log(`Successfully updated: ${results.filter(r => r.status.startsWith('OK')).length}`);
  console.log(`Skipped (already had coords): ${results.filter(r => r.status.startsWith('SKIP')).length}`);
  console.log(`Failed: ${failures.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});