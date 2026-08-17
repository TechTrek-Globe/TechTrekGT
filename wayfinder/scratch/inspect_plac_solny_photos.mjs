import fs from 'fs';
import path from 'path';
import https from 'https';

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

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
          resolve(body.places || []);
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
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

async function run() {
  const queries = [
    'Plac Solny Wrocław',
    'Jarmark Bożonarodzeniowy Plac Solny Wrocław',
    'Plac Solny Wrocław widok z góry'
  ];

  fs.mkdirSync('./plac_solny_photos', { recursive: true });

  for (const q of queries) {
    console.log(`\nSearching for: "${q}"...`);
    const places = await searchPlace(q);
    for (const p of places) {
      console.log(`Place: ${p.displayName?.text} | Photos: ${p.photos?.length || 0}`);
      if (p.photos) {
        for (let i = 0; i < Math.min(p.photos.length, 5); i++) {
          const photo = p.photos[i];
          const outName = `./plac_solny_photos/${p.displayName?.text.replace(/[^a-z0-9]/gi, '_')}_${i}.jpg`;
          console.log(`  Downloading photo ${i}: ${photo.name} (${photo.widthPx}x${photo.heightPx}) to ${outName}`);
          const res = await downloadPhoto(photo.name, outName);
          console.log(`  Result:`, res);
        }
      }
    }
  }
}

run();
