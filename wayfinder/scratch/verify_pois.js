import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .dev.vars
const devVarsPath = path.resolve(__dirname, '../.dev.vars');
const devVars = fs.readFileSync(devVarsPath, 'utf8');
const env = {};
devVars.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const GOOGLE_KEY = env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY;
const GEOAPIFY_KEY = env.GEOAPIFY_API_KEY;

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const venues = [
  // Krakow
  {
    city: 'krakow',
    category: 'food',
    name: 'Ed Red Steakhouse Kraków',
    googleQuery: 'Ed Red Pałac Krzysztofory Rynek Główny 35 Kraków',
    geoQuery: 'Rynek Główny 35, 31-011 Kraków',
    imageFile: 'ed-red-steakhouse.jpg'
  },
  {
    city: 'krakow',
    category: 'attractions',
    name: 'Auschwitz-Birkenau Memorial and Museum',
    googleQuery: 'Auschwitz-Birkenau Memorial and Museum Więźniów Oświęcimia 55 Oświęcim',
    geoQuery: 'Więźniów Oświęcimia 55, 32-600 Oświęcim',
    imageFile: 'auschwitz-birkenau.jpg'
  },
  {
    city: 'krakow',
    category: 'attractions',
    name: 'Collegium Maius Jagiellonian University',
    googleQuery: 'Collegium Maius Jagiellońska 15 Kraków',
    geoQuery: 'Jagiellońska 15, 31-010 Kraków',
    imageFile: 'collegium-maius.jpg'
  },
  {
    city: 'krakow',
    category: 'attractions',
    name: 'Czartoryski Museum Kraków',
    googleQuery: 'Muzeum Książąt Czartoryskich Pijarska 15 Kraków',
    geoQuery: 'Pijarska 15, 31-015 Kraków',
    imageFile: 'czartoryski-museum.jpg'
  },
  {
    city: 'krakow',
    category: 'attractions',
    name: 'Szopki Krakowskie (Pałac Krzysztofory)',
    googleQuery: 'Pałac Krzysztofory Rynek Główny 35 Kraków',
    geoQuery: 'Rynek Główny 35, 31-011 Kraków',
    imageFile: 'szopki-competition.jpg'
  },

  // Wroclaw
  {
    city: 'wroclaw',
    category: 'attractions',
    name: 'Panorama of Racławice',
    googleQuery: 'Panorama Racławicka Purkyniego 11 Wrocław',
    geoQuery: 'Jana Ewangelisty Purkyniego 11, 50-155 Wrocław',
    imageFile: 'panorama-raclawice.jpg'
  },
  {
    city: 'wroclaw',
    category: 'attractions',
    name: 'Hydropolis Wrocław',
    googleQuery: 'Hydropolis Na Grobli 17 Wrocław',
    geoQuery: 'Na Grobli 17, 50-421 Wrocław',
    imageFile: 'hydropolis.jpg'
  },
  {
    city: 'wroclaw',
    category: 'attractions',
    name: 'National Museum in Wrocław (Muzeum Narodowe we Wrocławiu)',
    googleQuery: 'Muzeum Narodowe we Wrocławiu Powstańców Warszawy 5 Wrocław',
    geoQuery: 'plac Powstańców Warszawy 5, 50-153 Wrocław',
    imageFile: 'wroclaw-national-museum.jpg'
  },
  {
    city: 'wroclaw',
    category: 'attractions',
    name: 'Lumina Park Zamek Topacz',
    googleQuery: 'Zamek Topacz Główna 12 Ślęza',
    geoQuery: 'Główna 12, 55-040 Ślęza',
    imageFile: 'lumina-park.jpg'
  },

  // Poznan
  {
    city: 'poznan',
    category: 'attractions',
    name: 'Old Market Square Poznań (Stary Rynek)',
    googleQuery: 'Stary Rynek Poznań',
    geoQuery: 'Stary Rynek, 61-772 Poznań',
    imageFile: 'poznan-ratusz.jpg'
  },
  {
    city: 'poznan',
    category: 'attractions',
    name: 'Poznań Palm House (Palmiarnia Poznańska)',
    googleQuery: 'Palmiarnia Poznańska Matejki 18 Poznań',
    geoQuery: 'Matejki 18, 60-767 Poznań',
    imageFile: 'poznan-palmiarnia.jpg'
  },
  {
    city: 'poznan',
    category: 'attractions',
    name: 'Applied Arts Museum Tower (Muzeum Sztuk Użytkowych w Poznaniu)',
    googleQuery: 'Muzeum Sztuk Użytkowych Góra Przemysła 1 Poznań',
    geoQuery: 'Góra Przemysła 1, 61-768 Poznań',
    imageFile: 'poznan-applied-arts-museum.jpg'
  },
  {
    city: 'poznan',
    category: 'attractions',
    name: 'International Ice Sculpture Festival (Stary Rynek Poznań)',
    googleQuery: 'Stary Rynek Poznań',
    geoQuery: 'Stary Rynek, 61-772 Poznań',
    imageFile: 'ice-sculpture-festival.jpg'
  },

  // Torun
  {
    city: 'torun',
    category: 'attractions',
    name: 'Teutonic Castle Ruins (Zamek Krzyżacki w Toruniu)',
    googleQuery: 'Zamek Krzyżacki Przedzamcze 3 Toruń',
    geoQuery: 'Przedzamcze 3, 87-100 Toruń',
    imageFile: 'torun-zamek-krzyzacki.jpg'
  },
  {
    city: 'torun',
    category: 'attractions',
    name: 'Living Museum of Gingerbread (Żywe Muzeum Piernika)',
    googleQuery: 'Żywe Muzeum Piernika Rabiańska 9 Toruń',
    geoQuery: 'Rabiańska 9, 87-100 Toruń',
    imageFile: 'torun-zywemu-muzeum-piernika.jpg'
  },

  // Gdansk
  {
    city: 'gdansk',
    category: 'attractions',
    name: 'Medieval Port Crane (Żuraw Gdański)',
    googleQuery: 'Brama Żuraw Szeroka 67/68 Gdańsk',
    geoQuery: 'Szeroka 67/68, 80-835 Gdańsk',
    imageFile: 'gdansk-zuraw.jpg'
  },
  {
    city: 'gdansk',
    category: 'attractions',
    name: 'Oliwa Cathedral (Bazylika archikatedralna w Gdańsku-Oliwie)',
    googleQuery: 'Bazylika Archikatedralna w Oliwie Biskupa Edmunda Nowickiego 5 Gdańsk',
    geoQuery: 'Biskupa Edmunda Nowickiego 5, 80-330 Gdańsk',
    imageFile: 'gdansk-katedra-oliwa.jpg'
  },
  {
    city: 'gdansk',
    category: 'attractions',
    name: 'Sopot Pier (Molo w Sopocie)',
    googleQuery: 'Molo w Sopocie Plac Zdrojowy 2 Sopot',
    geoQuery: 'Plac Zdrojowy 2, 81-723 Sopot',
    imageFile: 'sopot-pier.jpg'
  },
  {
    city: 'gdansk',
    category: 'attractions',
    name: 'Oliwa Park Illuminations (Park Oliwski)',
    googleQuery: 'Park Oliwski Opata Jacka Rybińskiego Gdańsk',
    geoQuery: 'Opata Jacka Rybińskiego, 80-317 Gdańsk',
    imageFile: 'gdansk-oliwa-park-illuminations.jpg'
  }
];

const REFERERS = ['https://techtrekgt.com', 'http://localhost:5174', 'http://localhost:3000', 'https://techtrekgt.com/wayfinder'];

async function verifyGoogleV1(query) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  for (const ref of REFERERS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.photos',
        'Referer': ref
      },
      body: JSON.stringify({ textQuery: query })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.places && data.places.length > 0) {
        const p = data.places[0];
        return {
          name: p.displayName?.text,
          formatted_address: p.formattedAddress,
          lat: p.location?.latitude,
          lng: p.location?.longitude,
          rating: p.rating,
          user_ratings_total: p.userRatingCount,
          place_id: p.id,
          photos: p.photos,
          successfulReferer: ref
        };
      }
    }
  }
  return null;
}

async function verifyGeoapify(query) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Geoapify Error (${res.status}):`, txt);
    return null;
  }
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const f = data.features[0];
    return {
      formatted: f.properties.formatted,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      city: f.properties.city,
      street: f.properties.street
    };
  }
  return null;
}

async function run() {
  const results = [];
  let allPassed = true;

  for (const v of venues) {
    console.log(`\n========================================`);
    console.log(`Verifying: ${v.name} (${v.city} / ${v.category})`);
    
    let gResult = null;
    let geoResult = null;
    try {
      gResult = await verifyGoogleV1(v.googleQuery);
    } catch (e) {
      console.error(`Google API error for ${v.name}:`, e.message);
    }

    try {
      geoResult = await verifyGeoapify(v.geoQuery);
    } catch (e) {
      console.error(`Geoapify API error for ${v.name}:`, e.message);
    }

    let deltaMeters = null;
    let deltaPassed = false;
    if (gResult && geoResult) {
      deltaMeters = getDistanceFromLatLonInMeters(gResult.lat, gResult.lng, geoResult.lat, geoResult.lng);
      deltaPassed = deltaMeters < 250;
      if (!deltaPassed) allPassed = false;
      console.log(`✓ Dual verification ${deltaPassed ? 'PASSED (<250m)' : 'FAILED (>250m)'}:`);
      console.log(`  Google:   [${gResult.lat}, ${gResult.lng}] - ${gResult.formatted_address} (Rating: ${gResult.rating}★, Reviews: ${gResult.user_ratings_total})`);
      console.log(`  Geoapify: [${geoResult.lat}, ${geoResult.lng}] - ${geoResult.formatted}`);
      console.log(`  Delta:    ${deltaMeters.toFixed(1)} meters`);
    } else {
      allPassed = false;
      console.log(`⚠️ Incomplete verification: Google=${!!gResult}, Geoapify=${!!geoResult}`);
      if (gResult) console.log(`  Google: [${gResult.lat}, ${gResult.lng}] - ${gResult.formatted_address}`);
      if (geoResult) console.log(`  Geoapify: [${geoResult.lat}, ${geoResult.lng}] - ${geoResult.formatted}`);
    }

    const destDir = path.resolve(__dirname, `../public/Poland-2026/images/${v.city}/${v.category}`);
    const destPath = path.join(destDir, v.imageFile);
    const imageExists = fs.existsSync(destPath);
    console.log(`  Image asset path: public/Poland-2026/images/${v.city}/${v.category}/${v.imageFile} (Exists: ${imageExists})`);

    results.push({
      venue: v.name,
      city: v.city,
      category: v.category,
      google: gResult ? {
        name: gResult.name,
        address: gResult.formatted_address,
        lat: gResult.lat,
        lng: gResult.lng,
        rating: gResult.rating,
        userRatingsTotal: gResult.user_ratings_total
      } : null,
      geoapify: geoResult ? {
        formatted: geoResult.formatted,
        lat: geoResult.lat,
        lng: geoResult.lng
      } : null,
      deltaMeters: deltaMeters !== null ? Number(deltaMeters.toFixed(1)) : null,
      deltaPassed,
      imagePath: `/Poland-2026/images/${v.city}/${v.category}/${v.imageFile}`,
      imageExists
    });
  }

  const outSummary = path.resolve(__dirname, 'dual_verification_final.json');
  fs.writeFileSync(outSummary, JSON.stringify(results, null, 2));
  console.log(`\n\n========================================`);
  console.log(`All Dual Verification Passed (< 250m): ${allPassed}`);
  console.log(`Summary written to ${outSummary}`);
}

run();
