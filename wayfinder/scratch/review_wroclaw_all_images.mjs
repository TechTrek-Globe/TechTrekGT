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

// Highly specific, disambiguated searches for each Wrocław asset
const targets = [
  // MARKETS
  {
    name: 'Rynek Main Christmas Market',
    query: 'Jarmark Bożonarodzeniowy Wrocław Rynek',
    target: '../public/Poland-2026/images/wroclaw/markets/wroclaw.png'
  },
  {
    name: 'Plac Solny Christmas Market',
    query: 'Jarmark Bożonarodzeniowy Plac Solny Wrocław',
    target: '../public/Poland-2026/images/wroclaw/markets/wroclaw-plac-solny.jpg',
    photoIndex: 0
  },
  {
    name: 'Świdnicka & Oławska Festive Pedestrian Avenues',
    query: 'Ulica Świdnicka Wrocław iluminacje świąteczne',
    fallbackQuery: 'Ulica Świdnicka Wrocław',
    target: '../public/Poland-2026/images/wroclaw/markets/wroclaw-swidnicka.jpg'
  },

  // MUST SEE ATTRACTIONS
  {
    name: 'Wrocław Market Square & Old Town Hall (Ratusz)',
    query: 'Stary Ratusz Wrocław Rynek',
    target: '../public/Poland-2026/images/wroclaw/attractions/wroclaw-market-square.jpg'
  },
  {
    name: 'Ostrów Tumski (Cathedral Island)',
    query: 'Archikatedra św. Jana Chrzciciela Ostrów Tumski Wrocław',
    target: '../public/Poland-2026/images/wroclaw/attractions/ostrow-tumski.jpg'
  },
  {
    name: 'Wrocław Dwarfs (Krasnale)',
    query: 'Krasnale Wrocławskie Rynek',
    target: '../public/Poland-2026/images/wroclaw/attractions/wroclaw-dwarfs.jpg'
  },
  {
    name: 'Tumski Bridge (Most Tumski)',
    query: 'Most Tumski Wrocław',
    target: '../public/Poland-2026/images/wroclaw/attractions/tumski-bridge.jpg'
  },
  {
    name: 'Centennial Hall (Hala Stulecia)',
    query: 'Hala Stulecia Wrocław',
    target: '../public/Poland-2026/images/wroclaw/attractions/centennial-hall.jpg'
  },
  {
    name: 'Panorama of Racławice',
    query: 'Muzeum Panorama Racławicka Wrocław',
    target: '../public/Poland-2026/images/wroclaw/attractions/panorama-raclawice.jpg'
  },
  {
    name: 'Wrocław Guided Walking Tour',
    query: 'Rynek Wrocław spacer z przewodnikiem',
    fallbackQuery: 'Wroclaw Old Town walking tour',
    target: '../public/Poland-2026/images/wroclaw/attractions/wroclaw-walking-tour.jpg'
  },

  // RESTAURANTS
  {
    name: 'Restauracja Konspira',
    query: 'Restauracja Konspira Plac Solny Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/konspira.jpg'
  },
  {
    name: 'Młoda Polska Bistro & Pianino',
    query: 'Młoda Polska Bistro Pianino Plac Solny Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/mloda-polska.jpg'
  },
  {
    name: 'Karczma Lwowska',
    query: 'Karczma Lwowska Rynek 4 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/karczma-lwowska.jpg'
  },
  {
    name: 'Kurna Chata',
    query: 'Kurna Chata Odrzańska Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/kurna-chata.jpg'
  },
  {
    name: 'Restauracja Pod Fredrą',
    query: 'Restauracja Pod Fredrą Rynek Ratusz Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/pod-fredra.jpg'
  },
  {
    name: 'Campo Modern Grill',
    query: 'Campo Modern Grill Podwale OVO Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/campo-steakhouse.jpg'
  },
  {
    name: 'Whiskey in the Jar Wrocław',
    query: 'Whiskey in the Jar Rynek 23 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/whiskey-in-the-jar.jpg'
  },
  {
    name: 'Pierogarnia Stary Młyn',
    query: 'Pierogarnia Stary Młyn Rynek 29 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/pierogarnia-stary-mlyn.jpg'
  },
  {
    name: 'Bar Mleczny Miś',
    query: 'Bar Mleczny Miś Kuźnicza Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/bar-mleczny-mis.jpg'
  },
  {
    name: 'Piwnica Świdnicka',
    query: 'Restauracja Piwnica Świdnicka Ratusz Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/piwnica-swidnicka.jpg'
  },
  {
    name: 'Restauracja Tarasowa',
    query: 'Restauracja Tarasowa Wystawowa Hala Stulecia Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/restauracja-tarasowa.jpg'
  },

  // DRINKS & BREWERIES
  {
    name: 'Browar Spiż',
    query: 'Browar Spiż Rynek Ratusz 2 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/spiz.jpg'
  },
  {
    name: 'Browar Stu Mostów',
    query: 'Browar Stu Mostów Jana Długosza Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/browar-stu-mostow.jpg'
  },
  {
    name: 'Browar Złoty Pies',
    query: 'Browar Złoty Pies Rynek 41 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/browar-zloty-pies.jpg'
  },
  {
    name: 'Przedwojenna Bistro & Bar',
    query: 'Bistro Przedwojenna Świętego Mikołaja Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/przedwojenna.jpg'
  },
  {
    name: 'Setka Bar',
    query: 'Setka Bar Kazimierza Wielkiego 50 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/setka-bar.jpg'
  },
  {
    name: 'AleBrowar Wrocław (AleGrano Tap Bar)',
    query: 'AleBrowar Wrocław Pawła Włodkowica 27',
    target: '../public/Poland-2026/images/wroclaw/food/alegrano.jpg'
  },
  {
    name: 'Szajba Craft Bar (Ruska 46 Neon Courtyard)',
    query: 'Galeria Neon Side Ruska 46 Wrocław',
    fallbackQuery: 'Szajba Klub Ruska 46 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/szajba.jpg'
  },

  // CAFES & BREAKFAST
  {
    name: 'Café Targowa',
    query: 'Cafe Targowa Hala Targowa Piaskowa 17 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/cafe-targowa.jpg'
  },
  {
    name: 'Gniazdo Cafe',
    query: 'Gniazdo Kawiarnia Świdnicka 36 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/gniazdo.jpg'
  },
  {
    name: 'Giselle French Bakery & Cafe',
    query: 'Giselle French Bakery Cafe Szewska 27 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/giselle-cafe.jpg'
  },
  {
    name: 'Central Cafe',
    query: 'Central Cafe Świętego Antoniego 10 Wrocław',
    target: '../public/Poland-2026/images/wroclaw/food/central-cafe.jpg'
  }
];

async function runReview() {
  console.log(`Starting comprehensive review of ${targets.length} Wrocław images...`);

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
  console.log(`🎉 Wrocław Full Image Review & Refresh Complete!`);
  console.log(`Updated: ${updated}/${targets.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================`);
}

runReview();
