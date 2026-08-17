const fs = require('fs');
const path = require('path');

const vars = fs.readFileSync(path.join(__dirname, '..', '.dev.vars'), 'utf8');
const fsqKey = vars.match(/FOURSQUARE_API_KEY=([^\r\n]+)/)?.[1]?.trim();
const geoKey = vars.match(/GEOAPIFY_API_KEY=([^\r\n]+)/)?.[1]?.trim();

console.log('Geoapify Key:', geoKey ? 'Present' : 'Missing');
console.log('Foursquare Key:', fsqKey ? 'Present' : 'Missing');

async function testGeoapify() {
  console.log('\n--- Testing Geoapify ---');
  const url = `https://api.geoapify.com/v2/places?categories=tourism.sights&filter=circle:16.9328,52.4064,5000&limit=5&apiKey=${geoKey}`;
  const res = await fetch(url);
  console.log('Geoapify status:', res.status);
  const data = await res.json();
  console.log('Features count:', data.features?.length);
  if (data.features?.length) {
    data.features.forEach((f, i) => {
      console.log(`${i+1}. ${f.properties.name} | ${f.properties.formatted} | (${f.properties.lat}, ${f.properties.lon})`);
    });
  }
}

async function testFoursquare() {
  console.log('\n--- Testing Foursquare ---');
  // Try Places API
  const endpoints = [
    'https://places-api.foursquare.com/places/search?query=Brovaria&near=Poznan%2C%20Poland&limit=1',
    'https://places-api.foursquare.com/places/search?query=Poznan&limit=1',
    'https://api.foursquare.com/v3/places/search?query=Brovaria&near=Poznan%2C%20Poland&limit=1'
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Trying ${ep}...`);
      const res = await fetch(ep, {
        headers: {
          'Authorization': fsqKey,
          'X-Places-Api-Version': '2025-06-17',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(6000)
      });
      console.log(`Status: ${res.status}`);
      const text = await res.text();
      console.log(`Response: ${text.substring(0, 300)}`);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

async function run() {
  await testGeoapify();
  await testFoursquare();
}

run();
