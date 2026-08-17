const fs = require('fs');
const path = require('path');

const devVarsPath = path.join(__dirname, '..', '.dev.vars');
const varsContent = fs.readFileSync(devVarsPath, 'utf-8');
const geoMatch = varsContent.match(/GEOAPIFY_API_KEY=([^\r\n]+)/);
const GEOAPIFY_KEY = geoMatch ? geoMatch[1].trim() : '';

const CITIES = {
  poznan: { name: 'Poznań', lat: 52.406374, lon: 16.925168 },
  torun: { name: 'Toruń', lat: 53.013790, lon: 18.598444 },
  gdansk: { name: 'Gdańsk', lat: 54.352025, lon: 18.646638 }
};

async function queryPlaces(cityKey, categories, limit = 10) {
  const c = CITIES[cityKey];
  const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${c.lon},${c.lat},5000&bias=proximity:${c.lon},${c.lat}&limit=${limit}&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.features.map(f => ({
    name: f.properties.name,
    address: f.properties.formatted,
    street: f.properties.street,
    housenumber: f.properties.housenumber,
    postcode: f.properties.postcode,
    city: f.properties.city,
    lat: f.properties.lat,
    lon: f.properties.lon,
    categories: f.properties.categories,
    website: f.properties.website || f.properties.contact?.website
  })).filter(x => x.name);
}

async function geocode(query) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&limit=1&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.features?.length > 0) {
    const p = data.features[0].properties;
    return {
      name: p.name,
      formatted: p.formatted,
      lat: p.lat,
      lon: p.lon
    };
  }
  return null;
}

async function run() {
  for (const [key, city] of Object.entries(CITIES)) {
    console.log(`\n================== ${city.name} ==================`);
    const sights = await queryPlaces(key, 'tourism.sights,entertainment.culture', 12);
    console.log(`Top Sights (${sights.length}):`);
    sights.forEach(s => console.log(` - ${s.name} | ${s.address} | (${s.lat}, ${s.lon})`));

    const food = await queryPlaces(key, 'catering.restaurant,catering.bar,catering.pub,catering.cafe', 12);
    console.log(`Top Food/Drink (${food.length}):`);
    food.forEach(f => console.log(` - ${f.name} | ${f.address} | (${f.lat}, ${f.lon})`));
  }
}

run().catch(console.error);
