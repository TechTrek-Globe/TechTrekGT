import https from 'https';

const GEOAPIFY_KEY = '3db8a81e79b44dd9b5c823a0641c7865';
const PLACES_API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';
const WROCLAW_LAT = 51.1079;
const WROCLAW_LON = 17.0385;
const RADIUS = 3000;

function fetchGeoapify(category, limit = 10) {
  return new Promise((resolve) => {
    const url = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${WROCLAW_LON},${WROCLAW_LAT},${RADIUS}&bias=proximity:${WROCLAW_LON},${WROCLAW_LAT}&limit=${limit}&apiKey=${GEOAPIFY_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).features || []);
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

function searchGooglePlace(query) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ textQuery: query });
    const options = {
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.photos,places.priceLevel,places.rating',
        'Referer': 'https://techtrekgt.com/'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve(body.places && body.places.length > 0 ? body.places[0] : null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(postData);
    req.end();
  });
}

async function researchWroclaw() {
  console.log('Querying Geoapify for Wrocław data...');
  const hotels = await fetchGeoapify('accommodation.hotel', 5);
  const sights = await fetchGeoapify('tourism.sights', 10);
  const restaurants = await fetchGeoapify('catering.restaurant', 10);

  const wroclawData = { hotels: [], sights: [], restaurants: [] };

  console.log('\n--- SIGHTS ---');
  for (const h of sights) {
    const name = h.properties.name || h.properties.address_line1;
    if (!name) continue;
    const gPlace = await searchGooglePlace(`${name} Wroclaw Poland`);
    if (gPlace) {
      console.log(`- ${name} -> ${gPlace.displayName?.text} | Rating: ${gPlace.rating} | Addr: ${gPlace.formattedAddress}`);
      wroclawData.sights.push({ name: gPlace.displayName?.text, address: gPlace.formattedAddress });
    }
  }

  console.log('\n--- HOTELS ---');
  for (const h of hotels) {
    const name = h.properties.name || h.properties.address_line1;
    if (!name) continue;
    const gPlace = await searchGooglePlace(`${name} Wroclaw Poland`);
    if (gPlace) {
      console.log(`- ${name} -> ${gPlace.displayName?.text} | Rating: ${gPlace.rating} | Addr: ${gPlace.formattedAddress}`);
      wroclawData.hotels.push({ name: gPlace.displayName?.text, address: gPlace.formattedAddress });
    }
  }

  console.log('\n--- RESTAURANTS ---');
  for (const h of restaurants) {
    const name = h.properties.name || h.properties.address_line1;
    if (!name) continue;
    const gPlace = await searchGooglePlace(`${name} Wroclaw Poland`);
    if (gPlace) {
      console.log(`- ${name} -> ${gPlace.displayName?.text} | Rating: ${gPlace.rating} | Addr: ${gPlace.formattedAddress}`);
      wroclawData.restaurants.push({ name: gPlace.displayName?.text, address: gPlace.formattedAddress });
    }
  }
}

researchWroclaw();
