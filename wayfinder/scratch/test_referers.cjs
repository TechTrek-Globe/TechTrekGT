const https = require('https');

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';
const referers = [
  'https://techtrekgt.com/',
  'https://techtrekgt.com/wayfinder',
  'http://localhost:5173/',
  'http://localhost:3000/',
  'http://localhost/',
  'http://127.0.0.1:5173/'
];

function testWithReferer(ref) {
  return new Promise((resolve) => {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('Morskie Oko Krakow')}&key=${API_KEY}`;
    const req = https.get(url, { headers: { 'Referer': ref, 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ ref, status: body.status, error: body.error_message, resultsCount: body.results?.length });
        } catch (e) {
          resolve({ ref, status: 'PARSE_ERROR', error: e.message });
        }
      });
    });
    req.on('error', (e) => resolve({ ref, error: e.message }));
  });
}

async function run() {
  for (const ref of referers) {
    const res = await testWithReferer(ref);
    console.log(`Referer: ${ref} => Status: ${res.status}, Error: ${res.error || 'None'}, Count: ${res.resultsCount || 0}`);
  }
}

run();
