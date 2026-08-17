import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLACES_API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

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
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.businessStatus,places.websiteUri,places.location',
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

function checkUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({ ok: false, error: 'No URL' });
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    req.end();
  });
}

async function auditVenue(venue, category) {
  console.log(`\nAuditing [${category}] ${venue.name}...`);
  const gPlace = await searchGooglePlace(`${venue.name} Wroclaw Poland`);
  if (!gPlace) {
    console.log(`  ❌ NOT FOUND ON GOOGLE MAPS`);
    return;
  }
  
  console.log(`  ✅ Found on Maps: ${gPlace.displayName.text}`);
  console.log(`  Status: ${gPlace.businessStatus}`);
  
  if (venue.address && venue.address !== gPlace.formattedAddress) {
    console.log(`  ⚠️ Address Differs:`);
    console.log(`    Data: ${venue.address}`);
    console.log(`    Maps: ${gPlace.formattedAddress}`);
  }
  
  if (gPlace.websiteUri && venue.websiteUrl && gPlace.websiteUri !== venue.websiteUrl) {
    console.log(`  ⚠️ URL Differs:`);
    console.log(`    Data: ${venue.websiteUrl}`);
    console.log(`    Maps: ${gPlace.websiteUri}`);
  }

  if (venue.websiteUrl) {
    const urlCheck = await checkUrl(venue.websiteUrl);
    if (!urlCheck.ok) {
      console.log(`  ❌ URL DEAD or BLOCKED: ${urlCheck.statusCode || urlCheck.error}`);
    } else {
      console.log(`  ✅ URL Alive`);
    }
  }
}

async function main() {
  const wroclaw = JSON.parse(fs.readFileSync('wroclaw-current.json', 'utf8'));
  
  console.log('=== RESTAURANTS ===');
  for (const r of wroclaw.wroclawRestaurantsDetailed || []) await auditVenue(r, 'Restaurant');
  
  console.log('\n=== DRINKS ===');
  for (const d of wroclaw.wroclawDrinksDetailed || []) await auditVenue(d, 'Drinks');
  
  console.log('\n=== CAFES ===');
  for (const c of wroclaw.wroclawCafesDetailed || []) await auditVenue(c, 'Cafe');
  
  console.log('\n=== MUST SEE ===');
  for (const m of wroclaw.mustSee || []) await auditVenue(m, 'MustSee');
  
  console.log('\n=== MARKETS ===');
  for (const m of wroclaw.markets || []) await auditVenue(m, 'Market');
}

main().catch(console.error);
