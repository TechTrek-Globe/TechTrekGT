import fs from 'fs';
import path from 'path';
import https from 'https';

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function searchPlace(query) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      textQuery: query
    });

    const options = {
      hostname: 'places.googleapis.com',
      path: '/v1/places:searchText',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.photos',
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
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(postData);
    req.end();
  });
}

function downloadPhoto(photoName, targetFilePath) {
  return new Promise((resolve) => {
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&key=${API_KEY}`;
    
    const req = https.get(url, {
      headers: {
        'Referer': 'https://techtrekgt.com/'
      }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 307) {
        const redirectUrl = res.headers.location;
        const fileStream = fs.createWriteStream(targetFilePath);
        https.get(redirectUrl, (imgRes) => {
          if (imgRes.statusCode === 200) {
            imgRes.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              const stats = fs.statSync(targetFilePath);
              resolve({ ok: true, size: stats.size });
            });
          } else {
            resolve({ ok: false, error: `Image status ${imgRes.statusCode}` });
          }
        }).on('error', (err) => resolve({ ok: false, error: err.message }));
      } else {
        resolve({ ok: false, error: `Redirect status ${res.statusCode}` });
      }
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
  });
}

const lgbtqTargets = [
  {
    city: 'wroclaw',
    name: 'Wrocław LGBTQ Section (Ruska 46 Neon Courtyard / Surowiec)',
    query: 'Galeria Neon Side Ruska 46C Wrocław',
    target: 'public/Poland-2026/images/wroclaw/attractions/lgbtq-wroclaw.jpg',
    photoIndex: 1
  },
  {
    city: 'krakow',
    name: 'Kraków LGBTQ Section (Father Bernatek Footbridge)',
    query: 'Kładka Ojca Bernatka Kraków',
    target: 'public/Poland-2026/images/krakow/attractions/lgbtq-kazimierz.jpg',
    photoIndex: 0
  },
  {
    city: 'poznan',
    name: 'Poznań LGBTQ Section (Kawiarnia Stonewall / Plac Wolności)',
    query: 'Kawiarnia Stonewall Poznań',
    fallbackQuery: 'Plac Wolności Poznań',
    target: 'public/Poland-2026/images/poznan/attractions/lgbtq-poznan.jpg',
    photoIndex: 0
  },
  {
    city: 'gdansk',
    name: 'Gdańsk LGBTQ Section (Bunkier Club / 100cznia)',
    query: 'Klub Bunkier Gdańsk',
    fallbackQuery: '100cznia Gdańsk',
    target: 'public/Poland-2026/images/gdansk/attractions/lgbtq-gdansk.jpg',
    photoIndex: 0
  }
];

async function main() {
  for (const t of lgbtqTargets) {
    console.log(`\nFetching for ${t.city} LGBTQ guide: "${t.query}"...`);
    const targetPath = path.resolve(t.target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    let place = await searchPlace(t.query);
    if (!place && t.fallbackQuery) {
      console.log(`  Falling back to "${t.fallbackQuery}"...`);
      place = await searchPlace(t.fallbackQuery);
    }

    if (place && place.photos && place.photos.length > 0) {
      const idx = t.photoIndex < place.photos.length ? t.photoIndex : 0;
      const photo = place.photos[idx];
      console.log(`  Found: ${place.displayName?.text} at ${place.formattedAddress} (${place.photos.length} photos)`);
      const dl = await downloadPhoto(photo.name, targetPath);
      console.log(`  Downloaded photo to ${t.target}:`, dl);
    } else {
      console.log(`  ❌ Not found!`);
    }
    await delay(300);
  }
}

main();
