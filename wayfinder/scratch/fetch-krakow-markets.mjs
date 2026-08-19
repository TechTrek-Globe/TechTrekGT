import { polandJourney } from '../src/data/poland-2026.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(WAYFINDER_ROOT, 'scratch', 'krakow-markets-data.json');
const MARKET_IMG_DIR = path.join(WAYFINDER_ROOT, 'public', 'Poland-2026', 'images', 'krakow', 'markets');

// Read FOURSQUARE_API_KEY from .dev.vars
function readDevVars() {
  const content = fs.readFileSync(path.join(WAYFINDER_ROOT, '.dev.vars'), 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    vars[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
  return vars;
}

const devVars = readDevVars();
const FSQ_KEY = devVars.FOURSQUARE_API_KEY;
if (!FSQ_KEY) {
  console.error('FATAL: FOURSQUARE_API_KEY not found in .dev.vars');
  process.exit(1);
}

// Target markets from the dataset
const krakow = polandJourney.route.find(c => c.id === 'krakow');
const targetMarkets = krakow.markets.map(m => ({
  id: m.id,
  name: m.name,
  address: m.address || m.location || '',
  highlights: m.highlights || [],
  details: m.details || ''
}));

const results = [];

// Fetch helper for Foursquare Places API v3
async function searchPlace(query, ll) {
  const params = new URLSearchParams({
    query,
    ll,
    radius: '1000',
    limit: '1',
    fields: 'fsq_id,name,geocodes,location,categories'
  });
  const res = await fetch(`https://api.foursquare.com/v3/places/search?${params}`, {
    headers: { 'Authorization': FSQ_KEY, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`Foursquare search ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function getPlacePhotos(fsqId) {
  const res = await fetch(`https://api.foursquare.com/v3/places/${fsqId}/photos?limit=1&sort=PREMIUM`, {
    headers: { 'Authorization': FSQ_KEY, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`Foursquare photos ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function downloadImage(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// Known approximate center of Krakow (Rynek Glowny) for LL-constrained queries
const KRAKOW_LL = '50.0617,19.9373';

// Market IDs -> search terms
const MARKET_QUERIES = {
  'rynek-glowny': 'Krakow Christmas Market Rynek Glowny',
  'maly-rynek': 'Maly Rynek Krakow Christmas Market craft',
  'kazimierz-wolnica': 'Plac Wolnica Krakow Christmas market'
};

// Market IDs -> output filename
const MARKET_FILES = {
  'rynek-glowny': 'rynek-glowny.jpg',
  'maly-rynek': 'maly-rynek.jpg',
  'kazimierz-wolnica': 'plac-wolnica.jpg'
};

for (const market of targetMarkets) {
  const query = MARKET_QUERIES[market.id] || market.name;
  const outFile = MARKET_FILES[market.id];
  const entry = { id: market.id, name: market.name, file: outFile, coords: null, imagePath: null, errors: [] };

  try {
    // Step 1: Search Foursquare for the venue
    const places = await searchPlace(query, KRAKOW_LL);
    if (places.length === 0) {
      entry.errors.push('NO_FOURSQUARE_VENUE');
    } else {
      const place = places[0];
      const geo = place.geocodes?.main || place.geocodes?.roof;
      if (geo) {
        entry.coords = { lat: geo.latitude, lng: geo.longitude };
      }

      // Step 2: Fetch premium photo
      const photos = await getPlacePhotos(place.fsq_id);
      if (photos.length === 0) {
        entry.errors.push('NO_PHOTOS');
      } else {
        const photo = photos[0];
        const url = `${photo.prefix}${photo.width || 1440}x${photo.height || 1440}${photo.suffix}`;
        const dest = path.join(MARKET_IMG_DIR, outFile);
        const bytes = await downloadImage(url, dest);
        entry.imagePath = `/wayfinder/Poland-2026/images/krakow/markets/${outFile}`;
        entry.bytes = bytes;
      }
    }
  } catch (err) {
    entry.errors.push(`ERROR: ${err.message}`);
  }

  // Step 3: Construct description from existing fields (no hallucination - derived from data)
  if (market.details) {
    entry.description = market.details;
  } else if (market.highlights?.length) {
    entry.description = `${market.name}. Highlights: ${market.highlights.join('; ')}.`;
  } else {
    entry.description = null;
  }

  results.push(entry);
  console.log(`[${market.id}] ${market.name}`);
  console.log(`  coords: ${entry.coords ? `${entry.coords.lat},${entry.coords.lng}` : 'MISSING'}`);
  console.log(`  image: ${entry.imagePath || 'MISSING'}${entry.bytes ? ` (${entry.bytes} bytes)` : ''}`);
  if (entry.errors.length) console.log(`  errors: ${entry.errors.join(', ')}`);
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
console.log(`\nOutput written to ${OUTPUT_FILE}`);
console.log('Do NOT edit poland-2026.js directly. Await application step.');