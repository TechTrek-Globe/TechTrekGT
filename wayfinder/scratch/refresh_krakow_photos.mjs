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
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${API_KEY}`;
    
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
  console.log('🚀 Starting Google Places photo refresh for Kraków...');
  
  const dataFilePath = path.resolve('../src/data/poland-2026.js');
  const fileContent = fs.readFileSync(dataFilePath, 'utf8');
  const parsed = fileContent.replace('export const polandJourney = ', 'global.polandJourney = ');
  eval(parsed);

  const krakow = global.polandJourney.route.find(r => r.id === 'krakow');
  if (!krakow) {
    console.error('Kraków route not found in dataset!');
    return;
  }

  const items = [];

  // Must-See Attractions
  if (krakow.mustSee) {
    for (const item of krakow.mustSee) {
      if (item.imageSrc) {
        items.push({
          type: 'Must See',
          name: item.name || item.title,
          searchQuery: `${item.name || item.title} Krakow Poland`,
          imageSrc: item.imageSrc
        });
      }
    }
  }

  // Food / Dining / Drinks
  const foodVenues = [
    ...(krakow.krakowRestaurantsDetailed || []),
    ...(krakow.krakowDrinksDetailed || [])
  ];
  for (const item of foodVenues) {
    if (item.imageSrc) {
      items.push({
        type: 'Food/Drink',
        name: item.name,
        searchQuery: `${item.name} Krakow Poland`,
        imageSrc: item.imageSrc
      });
    }
  }

  // Stays / Accommodations (if present)
  if (krakow.krakowStaysDetailed || krakow.stays) {
    const stays = krakow.krakowStaysDetailed || krakow.stays || [];
    for (const item of stays) {
      if (item.imageSrc) {
        items.push({
          type: 'Stay',
          name: item.name || item.title,
          searchQuery: `${item.name || item.title} Krakow Poland`,
          imageSrc: item.imageSrc
        });
      }
    }
  }

  console.log(`Found ${items.length} venue image targets in Kraków.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const relPath = item.imageSrc.replace('/wayfinder/Poland-2026/images/', '');
    const absolutePath = path.resolve('../public/Poland-2026/images', relPath);

    // Ensure target folder exists
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    console.log(`[${i + 1}/${items.length}] Processing [${item.type}] "${item.name}"...`);

    const place = await searchPlace(item.searchQuery);
    if (!place || !place.photos || place.photos.length === 0) {
      console.log(`  ⚠️ No Google Maps photos found for "${item.name}"`);
      skippedCount++;
      await delay(250);
      continue;
    }

    // Pick top photo
    const topPhoto = place.photos[0];
    const dlResult = await downloadPhoto(topPhoto.name, absolutePath);

    if (dlResult.ok) {
      console.log(`  ✅ Updated: ${path.basename(absolutePath)} (${(dlResult.size / 1024).toFixed(1)} KB)`);
      updatedCount++;
    } else {
      console.log(`  ❌ Download error: ${dlResult.error}`);
      errorCount++;
    }

    await delay(300);
  }

  console.log('\n=======================================');
  console.log(`🎉 Kraków Photo Refresh Complete!`);
  console.log(`✅ Successfully Updated: ${updatedCount}`);
  console.log(`⚠️ Skipped (No photo / not found): ${skippedCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log('=======================================\n');
}

run().catch(console.error);
