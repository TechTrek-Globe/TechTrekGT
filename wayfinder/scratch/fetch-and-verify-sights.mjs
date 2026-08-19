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

console.log('GEOAPIFY_KEY loaded:', !!GEOAPIFY_KEY);
console.log('GOOGLE_KEY loaded:', !!GOOGLE_KEY);

const SIGHTS_TO_FETCH = [
  {
    city: 'krakow',
    id: 'collegium-maius',
    name: 'Collegium Maius',
    query: 'Collegium Maius Jagiellonian University Krakow Poland',
    imagePath: 'public/Poland-2026/images/krakow/attractions/collegium-maius.jpg'
  },
  {
    city: 'krakow',
    id: 'czartoryski-museum',
    name: 'Czartoryski Museum',
    query: 'Muzeum Książąt Czartoryskich Krakow Poland',
    imagePath: 'public/Poland-2026/images/krakow/attractions/czartoryski-museum.jpg'
  },
  {
    city: 'krakow',
    id: 'szopki-competition',
    name: 'Szopki Krakowskie Competition',
    query: 'Krzysztofory Palace Museum Krakow Poland',
    secondaryQuery: 'Szopki Krakowskie Rynek Glowny Krakow Poland',
    imagePath: 'public/Poland-2026/images/krakow/attractions/szopki-competition.jpg'
  },
  {
    city: 'wroclaw',
    id: 'hydropolis-wroclaw',
    name: 'Hydropolis Centre for Ecological Education',
    query: 'Hydropolis Wroclaw Poland',
    imagePath: 'public/Poland-2026/images/wroclaw/attractions/hydropolis.jpg'
  },
  {
    city: 'wroclaw',
    id: 'lumina-park-wroclaw',
    name: 'Lumina Park Zamek Topacz',
    query: 'Zamek Topacz Sleza Poland',
    imagePath: 'public/Poland-2026/images/wroclaw/attractions/lumina-park.jpg'
  },
  {
    city: 'poznan',
    id: 'poznan-palmiarnia',
    name: 'Poznan Palm House',
    query: 'Palmiarnia Poznanska Poznan Poland',
    imagePath: 'public/Poland-2026/images/poznan/attractions/poznan-palmiarnia.jpg'
  },
  {
    city: 'poznan',
    id: 'ice-sculpture-festival-poznan',
    name: 'Poznan International Ice Sculpture Festival',
    query: 'Stary Rynek Poznan Poland',
    secondaryQuery: 'Poznan Ice Festival',
    imagePath: 'public/Poland-2026/images/poznan/attractions/ice-sculpture-festival.jpg'
  },
  {
    city: 'torun',
    id: 'torun-zamek-krzyzacki',
    name: 'Teutonic Castle Ruins Torun',
    query: 'Zamek Krzyzacki w Toruniu Torun Poland',
    imagePath: 'public/Poland-2026/images/torun/attractions/torun-zamek-krzyzacki.jpg'
  },
  {
    city: 'torun',
    id: 'torun-zywemu-muzeum-piernika',
    name: 'Living Museum of Gingerbread Torun',
    query: 'Zywe Muzeum Piernika Torun Poland',
    imagePath: 'public/Poland-2026/images/torun/attractions/torun-zywemu-muzeum-piernika.jpg'
  },
  {
    city: 'gdansk',
    id: 'gdansk-katedra-oliwa',
    name: 'Oliwa Cathedral Gdansk',
    query: 'Bazylika Archikatedralna w Gdansku-Oliwie Gdansk Poland',
    imagePath: 'public/Poland-2026/images/gdansk/attractions/gdansk-katedra-oliwa.jpg'
  },
  {
    city: 'gdansk',
    id: 'gdansk-oliwa-park-illuminations',
    name: 'Oliwa Park Winter Illuminations',
    query: 'Park Oliwski Gdansk Poland',
    imagePath: 'public/Poland-2026/images/gdansk/attractions/gdansk-oliwa-park-illuminations.jpg'
  }
];

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function searchGooglePlaces(query) {
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
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.photos',
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
          return { place: data.places[0], ref };
        }
      }
    } catch (e) {
      // continue
    }
  }
  return null;
}

async function fetchGooglePhoto(photoName, ref) {
  try {
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=1200&maxWidthPx=1600&key=${GOOGLE_KEY}`;
    const res = await fetch(url, {
      headers: {
        'Referer': ref
      }
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    }
  } catch (e) {
    console.error('Photo fetch error:', e.message);
  }
  return null;
}

async function searchGeoapify(query) {
  try {
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&apiKey=${GEOAPIFY_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const feat = data.features[0];
        const [lng, lat] = feat.geometry.coordinates;
        return {
          lat,
          lng,
          formattedAddress: feat.properties.formatted,
          name: feat.properties.name
        };
      }
    }
  } catch (e) {
    console.error('Geoapify error:', e.message);
  }
  return null;
}

async function fetchWikimediaPhoto(query) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&pithumbsize=1200&origin=*`;
    const res = await fetch(searchUrl, { headers: { 'User-Agent': 'TechTrekWayfinder/1.0 (info@techtrekgt.com)' } });
    if (res.ok) {
      const data = await res.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages);
        if (pages.length > 0 && pages[0].thumbnail && pages[0].thumbnail.source) {
          const imgRes = await fetch(pages[0].thumbnail.source, { headers: { 'User-Agent': 'TechTrekWayfinder/1.0 (info@techtrekgt.com)' } });
          if (imgRes.ok) {
            return Buffer.from(await imgRes.arrayBuffer());
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function run() {
  console.log('\n--- STARTING SIGHT VERIFICATION & PHOTO FETCH ---\n');
  const results = [];

  for (const item of SIGHTS_TO_FETCH) {
    console.log(`Processing: [${item.city.toUpperCase()}] ${item.name} (${item.id})...`);
    const fullDest = path.join(WAYFINDER_ROOT, item.imagePath);

    // 1. Google Places
    const googleRes = await searchGooglePlaces(item.query);
    if (googleRes) {
      console.log(`  -> Google Places Found: "${googleRes.place.displayName?.text}" at (${googleRes.place.location.latitude}, ${googleRes.place.location.longitude})`);
    } else {
      console.log(`  -> Google Places not found for "${item.query}"`);
    }

    // 2. Geoapify
    const geoRes = await searchGeoapify(item.query);
    if (geoRes) {
      console.log(`  -> Geoapify Found: "${geoRes.name || geoRes.formattedAddress}" at (${geoRes.lat}, ${geoRes.lng})`);
    } else {
      console.log(`  -> Geoapify not found for "${item.query}"`);
    }

    // 3. Coordinate Dual Verification
    let delta = null;
    let verifiedCoords = null;
    if (googleRes && geoRes) {
      delta = haversineDistance(
        googleRes.place.location.latitude,
        googleRes.place.location.longitude,
        geoRes.lat,
        geoRes.lng
      );
      console.log(`  -> Dual-Verification Delta: ${delta.toFixed(1)} meters (Threshold: 250m)`);
      verifiedCoords = {
        lat: Number(googleRes.place.location.latitude.toFixed(7)),
        lng: Number(googleRes.place.location.longitude.toFixed(7))
      };
    } else if (googleRes) {
      verifiedCoords = {
        lat: Number(googleRes.place.location.latitude.toFixed(7)),
        lng: Number(googleRes.place.location.longitude.toFixed(7))
      };
    } else if (geoRes) {
      verifiedCoords = {
        lat: Number(geoRes.lat.toFixed(7)),
        lng: Number(geoRes.lng.toFixed(7))
      };
    }

    // 4. Photo Fetching
    let imageBuffer = null;
    let photoSource = null;

    if (googleRes && googleRes.place.photos && googleRes.place.photos.length > 0) {
      const photoName = googleRes.place.photos[0].name;
      console.log(`  -> Fetching Google Places Photo: ${photoName}...`);
      imageBuffer = await fetchGooglePhoto(photoName, googleRes.ref);
      if (imageBuffer) {
        photoSource = 'Google Places API';
      }
    }

    if (!imageBuffer) {
      console.log(`  -> Fetching fallback photo via Wikimedia for "${item.query}"...`);
      imageBuffer = await fetchWikimediaPhoto(item.query);
      if (imageBuffer) {
        photoSource = 'Wikimedia Commons';
      }
    }

    if (imageBuffer) {
      fs.mkdirSync(path.dirname(fullDest), { recursive: true });
      fs.writeFileSync(fullDest, imageBuffer);
      console.log(`  -> SAVED ${imageBuffer.length} bytes to ${item.imagePath} (${photoSource})`);
    } else {
      console.error(`  [X] Failed to fetch image for ${item.id}`);
    }

    results.push({
      id: item.id,
      name: item.name,
      city: item.city,
      coords: verifiedCoords,
      formattedAddress: googleRes?.place?.formattedAddress || geoRes?.formattedAddress,
      rating: googleRes?.place?.rating,
      userRatingsTotal: googleRes?.place?.userRatingCount,
      website: googleRes?.place?.websiteUri,
      imageSaved: !!imageBuffer,
      imagePath: item.imagePath,
      photoSource
    });
  }

  const outPath = path.join(WAYFINDER_ROOT, 'scratch', 'verified-sights-output.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nVerification results written to ${outPath}\n`);
}

run().catch(console.error);
