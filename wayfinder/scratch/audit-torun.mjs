import fs from 'fs';

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

const places = [
  { id: 'torun-rynek-staromiejski', name: 'Rynek Staromiejski Toruń' },
  { id: 'torun-rynek-nowomiejski', name: 'Rynek Nowomiejski Toruń' },
  { id: 'torun-ratusz-staromiejski', name: 'Ratusz Staromiejski Toruń' },
  { id: 'torun-muzeum-piernika', name: 'Żywe Muzeum Piernika Toruń' },
  { id: 'torun-dom-kopernika', name: 'Dom Mikołaja Kopernika Toruń' },
  { id: 'torun-krzywa-wieza', name: 'Krzywa Wieża Toruń' },
  { id: 'torun-zamek-krzyzacki', name: 'Zamek Krzyżacki Toruń' },
  { id: 'torun-katedra-sw-jana', name: 'Katedra św. Jana Chrzciciela Toruń' },
  { id: 'karczma-spichrz', name: 'Karczma Spichrz Toruń' },
  { id: 'manekin-torun', name: 'Manekin Rynek Staromiejski Toruń' },
  { id: 'restauracja-pod-aniolem', name: 'Restauracja Pod Aniołem Toruń' },
  { id: 'pierogarnia-stary-torun', name: 'Pierogarnia Stary Toruń Mostowa' },
  { id: 'szeroka-no-9', name: 'Restauracja Szeroka No 9 Toruń' },
  { id: 'jan-olbracht-browar-staromiejski', name: 'Jan Olbracht Browar Staromiejski Toruń' },
  { id: 'kawiarnia-lenkiewicz', name: 'Kawiarnia Lenkiewicz Rynek Staromiejski Toruń' }
];

const urls = [
  'https://muzeum.torun.pl/ratusz-staromiejski/',
  'https://muzeumpiernika.pl/en/',
  'https://muzeum.torun.pl/dom-mikolaja-kopernika/',
  'https://krzywawieza.torun.pl/',
  'https://zamek.torun.pl/',
  'https://katedratorun.pl/',
  'https://spichrz.pl',
  'https://manekin.pl',
  'https://podaniolem.torun.pl',
  'https://pierogarniastarytorun.pl',
  'https://szerokano9.pl',
  'https://browar-olbracht.pl',
  'https://lenkiewicz.net'
];

async function checkUrls() {
  const results = {};
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } });
      results[url] = response.status;
    } catch (e) {
      results[url] = e.message;
    }
  }
  return results;
}

async function verifyPlaces() {
  const results = {};
  for (const place of places) {
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(place.name)}&inputtype=textquery&fields=place_id,name,formatted_address,business_status,geometry&key=${API_KEY}`;
    try {
      const res = await fetch(searchUrl);
      const data = await res.json();
      if (data.candidates && data.candidates.length > 0) {
        results[place.id] = data.candidates[0];
      } else {
        results[place.id] = { error: 'Not found' };
      }
    } catch (e) {
      results[place.id] = { error: e.message };
    }
  }
  return results;
}

async function getDistance(origin, destination, mode) {
  const searchUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&mode=${mode}&key=${API_KEY}`;
  try {
    const res = await fetch(searchUrl);
    const data = await res.json();
    return data.rows[0].elements[0];
  } catch (e) {
    return { error: e.message };
  }
}

async function run() {
  console.log("Checking URLs...");
  const urlResults = await checkUrls();
  
  console.log("Verifying Places...");
  const placeResults = await verifyPlaces();
  
  console.log("Getting Distance from Toruń Główny to Old Town Hall (Ratusz Staromiejski)...");
  const distanceTransit = await getDistance("Toruń Główny, Toruń, Poland", "Rynek Staromiejski 1, 87-100 Toruń, Poland", "transit");
  const distanceWalking = await getDistance("Toruń Główny, Toruń, Poland", "Rynek Staromiejski 1, 87-100 Toruń, Poland", "walking");
  
  const report = {
    urls: urlResults,
    places: placeResults,
    distance: { transit: distanceTransit, walking: distanceWalking }
  };
  
  fs.writeFileSync('e:/TechTrekGT/wayfinder/scratch/torun-audit-results.json', JSON.stringify(report, null, 2));
  console.log("Audit complete. Results written to torun-audit-results.json");
}

run();
