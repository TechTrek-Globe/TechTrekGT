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
    name: 'Targ Węglowy',
    query: 'Jarmark Bożonarodzeniowy Targ Węglowy Gdańsk',
    fallbackQuery: 'Targ Węglowy Gdańsk',
    target: '../public/Poland-2026/images/gdansk/markets/gdansk-targ-weglowy.jpg'
  },
  {
    name: 'Ulica Tkacka',
    query: 'Wielka Zbrojownia Tkacka Gdańsk',
    target: '../public/Poland-2026/images/gdansk/markets/gdansk-tkacka.jpg'
  },
  {
    name: 'Wyspa Spichrzów',
    query: 'Wyspa Spichrzów Gdańsk',
    target: '../public/Poland-2026/images/gdansk/markets/gdansk-wyspa-spichrzow.jpg'
  },

  // ATTRACTIONS
  {
    name: 'Długi Targ',
    query: 'Długi Targ Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-dlugi-targ.jpg'
  },
  {
    name: 'Fontanna Neptuna',
    query: 'Fontanna Neptuna Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-fontanna-neptuna.jpg'
  },
  {
    name: 'Bazylika Mariacka',
    query: 'Bazylika Mariacka Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-bazylika-mariacka.jpg'
  },
  {
    name: 'Żuraw',
    query: 'Żuraw nad Motławą Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-zuraw.jpg'
  },
  {
    name: 'Muzeum II Wojny Światowej',
    query: 'Muzeum II Wojny Światowej Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-muzeum-ii-wojny.jpg'
  },
  {
    name: 'Europejskie Centrum Solidarności',
    query: 'Europejskie Centrum Solidarności Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-ecs-solidarnosc.jpg'
  },
  {
    name: 'Muzeum Bursztynu',
    query: 'Muzeum Bursztynu Wielki Młyn Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-amber-museum.jpg'
  },
  {
    name: 'Gdansk Walking Tour',
    query: 'Gdańsk Długi Targ wycieczka',
    fallbackQuery: 'Gdańsk Długi Targ',
    target: '../public/Poland-2026/images/gdansk/attractions/gdansk-walking-tour.jpg'
  },
  {
    name: 'LGBTQ Gdansk Area',
    query: 'Bunkier Club Gdańsk',
    fallbackQuery: 'Ulica Piwna Gdańsk',
    target: '../public/Poland-2026/images/gdansk/attractions/lgbtq-gdansk.jpg'
  },

  // RESTAURANTS
  {
    name: 'Pierogarnia Mandu',
    query: 'Pierogarnia Mandu Elżbietańska Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/pierogarnia-mandu.jpg'
  },
  {
    name: 'Restauracja Kubicki',
    query: 'Restauracja Kubicki Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/kubicki.jpg'
  },
  {
    name: 'Gdański Bowke',
    query: 'Gdański Bowke Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/gdanski-bowke.jpg'
  },
  {
    name: 'Bar Mleczny Neptun',
    query: 'Bar Mleczny Neptun Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/bar-mleczny-neptun.jpg'
  },
  {
    name: 'Restauracja Fino',
    query: 'Restauracja Fino Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/fino-gdansk.jpg'
  },

  // DRINKS
  {
    name: 'Brovarnia Gdańsk',
    query: 'Brovarnia Gdańsk Szafarnia',
    target: '../public/Poland-2026/images/gdansk/food/brovarnia-gdansk.jpg'
  },
  {
    name: 'Wiśniewski',
    query: 'Wiśniewski Piwna Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/wisniewski-gdansk.jpg'
  },
  {
    name: 'Pub Pułapka',
    query: 'Pub Pułapka Straganiarska Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/duda-pub-gdansk.jpg'
  },

  // CAFES & LGBTQ
  {
    name: 'Drukarnia Café',
    query: 'Drukarnia Cafe Mariacka Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/drukarnia-cafe-gdansk.jpg'
  },
  {
    name: 'Bunkier Club',
    query: 'Bunkier Club Olejarna Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/bunkier-club-gdansk.jpg'
  },
  {
    name: 'Red Light Pub',
    query: 'Red Light Pub Piwna Gdańsk',
    target: '../public/Poland-2026/images/gdansk/food/red-light-pub-gdansk.jpg'
  }
];

async function runReview() {
  console.log(`Starting comprehensive review of ${targets.length} Gdańsk images...`);

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
  console.log(`🎉 Gdańsk Full Image Review & Refresh Complete!`);
  console.log(`Updated: ${updated}/${targets.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================`);
}

runReview();
