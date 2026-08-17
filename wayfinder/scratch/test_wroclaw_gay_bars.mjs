import https from 'https';
import fs from 'fs';
import path from 'path';

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function searchPlace(query) {
  return new Promise(resolve => {
    const postData = JSON.stringify({ textQuery: query });
    const req = https.request({
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.photos,places.websiteUri,places.rating,places.businessStatus',
        'Referer': 'https://techtrekgt.com/'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const b = JSON.parse(data);
          resolve(b.places && b.places.length > 0 ? b.places[0] : null);
        } catch(e) { resolve(null); }
      });
    });
    req.write(postData);
    req.end();
  });
}

function downloadPhoto(photoName, targetFilePath) {
  return new Promise((resolve) => {
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&key=${API_KEY}`;
    https.get(url, { headers: { 'Referer': 'https://techtrekgt.com/' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 307) {
        const redirectUrl = res.headers.location;
        const fileStream = fs.createWriteStream(targetFilePath);
        https.get(redirectUrl, (imgRes) => {
          if (imgRes.statusCode === 200) {
            imgRes.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve({ ok: true, size: fs.statSync(targetFilePath).size });
            });
          } else resolve({ ok: false, error: imgRes.statusCode });
        });
      } else resolve({ ok: false, error: res.statusCode });
    });
  });
}

async function main() {
  const venues = [
    {
      name: 'Beyond Music & Club (formerly HAH Wrocław)',
      query: 'Beyond Music Club Piotra Skargi Wrocław',
      fallbackQuery: 'Klub HAH Piotra Skargi Wrocław',
      file: 'public/Poland-2026/images/wroclaw/food/beyond-club.jpg'
    },
    {
      name: 'Surowiec',
      query: 'Surowiec Ruska 46a Wrocław',
      file: 'public/Poland-2026/images/wroclaw/food/surowiec.jpg'
    },
    {
      name: 'Klubokawiarnia Mleczarnia',
      query: 'Klubokawiarnia Mleczarnia Pawła Włodkowica 5 Wrocław',
      file: 'public/Poland-2026/images/wroclaw/food/mleczarnia.jpg'
    },
    {
      name: 'Transformator Club',
      query: 'Transformator Tęczowa 57G Wrocław',
      file: 'public/Poland-2026/images/wroclaw/food/transformator.jpg'
    },
    {
      name: 'Równe Miejsce (Kultura Równości)',
      query: 'Kultura Równości Kniaziewicza 28 Wrocław',
      file: 'public/Poland-2026/images/wroclaw/food/rowne-miejsce.jpg'
    }
  ];

  for (const v of venues) {
    console.log(`\nSearching for "${v.name}"...`);
    let p = await searchPlace(v.query);
    if (!p && v.fallbackQuery) {
      console.log(`  Falling back to "${v.fallbackQuery}"...`);
      p = await searchPlace(v.fallbackQuery);
    }
    if (p) {
      console.log(`  ✅ Matched: ${p.displayName?.text}`);
      console.log(`     Address: ${p.formattedAddress}`);
      console.log(`     Status: ${p.businessStatus}`);
      console.log(`     Coords: lat ${p.location?.latitude}, lng ${p.location?.longitude}`);
      console.log(`     Website: ${p.websiteUri}`);
      console.log(`     Photos: ${p.photos?.length || 0}`);

      if (p.photos && p.photos.length > 0) {
        const targetPath = path.resolve(v.file);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const dl = await downloadPhoto(p.photos[0].name, targetPath);
        console.log(`     Downloaded photo:`, dl);
      }
    } else {
      console.log(`  ❌ Not found on Google Maps!`);
    }
    await delay(300);
  }
}

main();
