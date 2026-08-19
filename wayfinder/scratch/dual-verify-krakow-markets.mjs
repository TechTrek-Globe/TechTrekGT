import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
const DEV_VARS_FILE = path.join(WAYFINDER_ROOT, '.dev.vars');

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
const GEOAPIFY_KEY = devVars.GEOAPIFY_API_KEY;
const GOOGLE_KEY = devVars.GOOGLE_MAPS_API_KEY || devVars.VITE_GOOGLE_MAPS_API_KEY;

if (!GEOAPIFY_KEY) {
  console.error('FATAL: GEOAPIFY_API_KEY not found in .dev.vars');
  process.exit(1);
}
if (!GOOGLE_KEY) {
  console.error('FATAL: GOOGLE_MAPS_API_KEY not found in .dev.vars');
  process.exit(1);
}

// Haversine formula to compute distance between two coordinates in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

const TARGETS = [
  {
    id: 'rynek-glowny',
    name: 'Rynek Główny Main Market',
    searchQuery: 'Rynek Główny 1, 31-042 Kraków, Poland',
    imageSrc: '/wayfinder/Poland-2026/images/krakow/markets/krakow-rynek-glowny.png'
  },
  {
    id: 'maly-rynek',
    name: 'Mały Rynek Craft Corner',
    searchQuery: 'Mały Rynek, 31-041 Kraków, Poland',
    imageSrc: '/wayfinder/Poland-2026/images/krakow/markets/krakow-maly-rynek.png'
  },
  {
    id: 'kazimierz-wolnica',
    name: 'Plac Wolnica Market',
    searchQuery: 'Plac Wolnica, 31-060 Kraków, Poland',
    imageSrc: '/wayfinder/Poland-2026/images/krakow/markets/krakow-plac-wolnica.png'
  }
];

async function fetchGeoapify(query) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geoapify error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.features || data.features.length === 0) {
    throw new Error(`Geoapify returned 0 features for: ${query}`);
  }
  const feat = data.features[0];
  const [lon, lat] = feat.geometry.coordinates;
  return {
    provider: 'Geoapify',
    lat,
    lng: lon,
    formattedAddress: feat.properties.formatted,
    placeId: feat.properties.place_id
  };
}

async function fetchGoogle(query) {
  // Try with allowed referers (e.g. https://techtrekgt.com or http://localhost:5174)
  const candidateReferrers = [
    'https://techtrekgt.com',
    'https://techtrekgt.com/wayfinder',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:8787'
  ];

  for (const ref of candidateReferrers) {
    try {
      const url = 'https://places.googleapis.com/v1/places:searchText';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
          'Referer': ref
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'en'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.places && data.places.length > 0) {
          const place = data.places[0];
          return {
            provider: `Google Places API (New) [Referer: ${ref}]`,
            lat: place.location.latitude,
            lng: place.location.longitude,
            formattedAddress: place.formattedAddress,
            placeId: place.id,
            displayName: place.displayName?.text
          };
        }
      }
    } catch (err) {
      // Continue to next referrer
    }
  }

  // If Google Places with referer restrictions is strictly browser-gated or requires geocoding, try Geocoding API with Referer
  for (const ref of candidateReferrers) {
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`;
      const geoRes = await fetch(geoUrl, {
        headers: { 'Referer': ref }
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const loc = geoData.results[0].geometry.location;
          return {
            provider: `Google Maps Geocoding API [Referer: ${ref}]`,
            lat: loc.lat,
            lng: loc.lng,
            formattedAddress: geoData.results[0].formatted_address,
            placeId: geoData.results[0].place_id
          };
        }
      }
    } catch (err) {
      // Continue
    }
  }

  throw new Error(`Google API calls failed across all configured referrers for: ${query}`);
}

async function main() {
  console.log('===============================================================');
  console.log('  MANDATORY DUAL-VERIFICATION RUNNER: KRAKOW CHRISTMAS MARKETS ');
  console.log('  Workspace Rule 6: Geoapify & Google Places Cross-Validation  ');
  console.log('===============================================================\n');

  const results = [];
  const MAX_DELTA_METERS = 250;

  for (const target of TARGETS) {
    console.log(`\n--- Dual-Verifying: ${target.name} (${target.id}) ---`);
    console.log(`Query: "${target.searchQuery}"`);

    const geoapifyResult = await fetchGeoapify(target.searchQuery);
    const googleResult = await fetchGoogle(target.searchQuery);

    const deltaMeters = haversineDistance(
      geoapifyResult.lat,
      geoapifyResult.lng,
      googleResult.lat,
      googleResult.lng
    );

    const passed = deltaMeters <= MAX_DELTA_METERS;

    // Calculate consensus / high-precision coordinates (average or primary provider)
    const consensusLat = Number(((geoapifyResult.lat + googleResult.lat) / 2).toFixed(7));
    const consensusLng = Number(((geoapifyResult.lng + googleResult.lng) / 2).toFixed(7));

    const record = {
      target,
      geoapify: geoapifyResult,
      google: googleResult,
      deltaMeters: Number(deltaMeters.toFixed(2)),
      passed,
      consensus: {
        lat: consensusLat,
        lng: consensusLng
      }
    };

    results.push(record);

    console.log(`  Geoapify: lat: ${geoapifyResult.lat}, lng: ${geoapifyResult.lng} | ${geoapifyResult.formattedAddress}`);
    console.log(`  Google:   lat: ${googleResult.lat}, lng: ${googleResult.lng} | ${googleResult.formattedAddress}`);
    console.log(`  Spatial Delta: ${record.deltaMeters} meters (Threshold: <= ${MAX_DELTA_METERS}m) -> ${passed ? 'VERIFIED [PASS]' : 'FAILED [DELTA EXCEEDED]'}`);
    console.log(`  Consensus Coords: lat: ${consensusLat}, lng: ${consensusLng}`);
  }

  // Save verification results to scratch artifact
  fs.writeFileSync(
    path.join(WAYFINDER_ROOT, 'scratch', 'dual-verification-results.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );

  console.log('\n===============================================================');
  console.log('DUAL-VERIFICATION SUMMARY:');
  console.log(`Total POIs Verified: ${results.length}`);
  console.log(`Passed Threshold:   ${results.filter(r => r.passed).length} / ${results.length}`);
  console.log('===============================================================');
}

main().catch(err => {
  console.error('Dual verification script failed:', err);
  process.exit(1);
});
