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
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.photos,places.types',
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

const targets = [
  // MARKETS
  {
    name: 'Plac Wolności Christmas Market',
    query: 'Betlejem Poznańskie Plac Wolności',
    target: '../public/Poland-2026/images/poznan/markets/poznan-plac-wolnosci.jpg'
  },
  {
    name: 'Stary Rynek Market',
    query: 'Stary Rynek Poznań jarmark',
    fallbackQuery: 'Stary Rynek Poznań',
    target: '../public/Poland-2026/images/poznan/markets/poznan-stary-rynek.jpg'
  },
  {
    name: 'MTP Winter Fair',
    query: 'Międzynarodowe Targi Poznańskie Jarmark Świąteczny',
    fallbackQuery: 'Międzynarodowe Targi Poznańskie',
    target: '../public/Poland-2026/images/poznan/markets/poznan-mtp.jpg'
  },

  // ATTRACTIONS
  {
    name: 'Poznań Town Hall',
    query: 'Ratusz Poznań',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-ratusz.jpg'
  },
  {
    name: 'Ostrów Tumski',
    query: 'Bazylika archikatedralna Świętych Apostołów Piotra i Pawła Poznań',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-ostrow-tumski.jpg'
  },
  {
    name: 'Zamek Cesarski',
    query: 'Zamek Cesarski w Poznaniu',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-zamek-cesarski.jpg'
  },
  {
    name: 'Rogalowe Muzeum',
    query: 'Rogalowe Muzeum Poznania',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-rogalowe-muzeum.jpg'
  },
  {
    name: 'Park Cytadela',
    query: 'Park Cytadela Poznań',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-park-cytadela.jpg'
  },
  {
    name: 'Fara Church',
    query: 'Fara Poznańska',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-fara.jpg'
  },
  {
    name: 'Poznan Walking Tour',
    query: 'Poznań Stary Rynek wycieczka',
    fallbackQuery: 'Poznań Stary Rynek',
    target: '../public/Poland-2026/images/poznan/attractions/poznan-walking-tour.jpg'
  },
  {
    name: 'LGBTQ Poznan Area',
    query: 'Jeżyce Poznań',
    fallbackQuery: 'Kawiarnia Stonewall Poznań',
    target: '../public/Poland-2026/images/poznan/attractions/lgbtq-poznan.jpg'
  },

  // RESTAURANTS
  {
    name: 'Brovaria',
    query: 'Brovaria Stary Rynek Poznań',
    target: '../public/Poland-2026/images/poznan/food/brovaria.jpg'
  },
  {
    name: 'Restauracja Bamberka',
    query: 'Restauracja Bamberka Poznań',
    target: '../public/Poland-2026/images/poznan/food/bamberka.jpg'
  },
  {
    name: 'Wiejskie Jadło',
    query: 'Wiejskie Jadło Stary Rynek Poznań',
    target: '../public/Poland-2026/images/poznan/food/wiejskie-jadlo-poznan.jpg'
  },
  {
    name: 'Pierogarnia Stary Młyn',
    query: 'Pierogarnia Stary Młyn Poznań',
    target: '../public/Poland-2026/images/poznan/food/pierogarnia-stary-mlyn-poznan.jpg'
  },
  {
    name: 'Restauracja Muga',
    query: 'Restauracja Muga Poznań',
    target: '../public/Poland-2026/images/poznan/food/muga-poznan.jpg'
  },

  // DRINKS
  {
    name: 'Pijalnia Wódki i Piwa',
    query: 'Pijalnia Wódki i Piwa Wrocławska Poznań',
    target: '../public/Poland-2026/images/poznan/food/pijalnia-wodki-poznan.jpg'
  },
  {
    name: 'Ministerstwo Browaru',
    query: 'Ministerstwo Browaru Poznań',
    target: '../public/Poland-2026/images/poznan/food/ministerstwo-browaru.jpg'
  },

  // CAFES & LGBTQ
  {
    name: 'Kawiarnia Stonewall',
    query: 'Kawiarnia Stonewall Poznań',
    target: '../public/Poland-2026/images/poznan/food/kawiarnia-stonewall.jpg'
  },
  {
    name: 'Lokomotywa Club',
    query: 'Lokomotywa Club Dworcowa Poznań',
    target: '../public/Poland-2026/images/poznan/food/lokomotywa-club.jpg'
  },
  {
    name: 'Punto Punct Club',
    query: 'Punto Punct Club Poznań',
    target: '../public/Poland-2026/images/poznan/food/punto-punct.jpg'
  },
  {
    name: 'Kraszkebab',
    query: 'Kraszkebab Kraszewskiego Poznań',
    target: '../public/Poland-2026/images/poznan/food/kraszkebab.jpg'
  }
];

async function runReview() {
  console.log(`Starting comprehensive review of ${targets.length} Poznań images...`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const targetFile = path.resolve('public', t.target.replace('../public/', ''));
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });

    console.log(`\n[${i + 1}/${targets.length}] Reviewing "${t.name}"...`);
    console.log(`  Query: "${t.query}"`);

    let place = await searchPlace(t.query);
    if ((!place || !place.photos || place.photos.length === 0) && t.fallbackQuery) {
      console.log(`  Falling back to query: "${t.fallbackQuery}"`);
      place = await searchPlace(t.fallbackQuery);
    }

    if (!place || !place.photos || place.photos.length === 0) {
      console.log(`  ❌ No Google Maps place or photos found!`);
      failed++;
      continue;
    }

    console.log(`  Matched: "${place.displayName?.text}" at "${place.formattedAddress}" (${place.photos.length} photos)`);

    const pIdx = t.photoIndex !== undefined && t.photoIndex < place.photos.length ? t.photoIndex : 0;
    const photo = place.photos[pIdx];
    const dl = await downloadPhoto(photo.name, targetFile);

    if (dl.ok) {
      console.log(`  ✅ Successfully updated ${path.basename(targetFile)} (${(dl.size / 1024).toFixed(1)} KB)`);
      updated++;
    } else {
      console.log(`  ❌ Download failed: ${dl.error}`);
      failed++;
    }

    await delay(300);
  }

  console.log(`\n================================`);
  console.log(`🎉 Poznań Full Image Review & Refresh Complete!`);
  console.log(`Updated: ${updated}/${targets.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================`);
}

runReview();
