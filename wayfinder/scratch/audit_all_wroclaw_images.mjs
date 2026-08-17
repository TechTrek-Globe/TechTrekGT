import fs from 'fs';
import path from 'path';

const dataFilePath = path.resolve('./src/data/poland-2026.js');
const fileContent = fs.readFileSync(dataFilePath, 'utf8');
const parsed = fileContent.replace('export const polandJourney = ', 'global.polandJourney = ');
eval(parsed);

const wroclaw = global.polandJourney.route.find(r => r.id === 'wroclaw');

if (!wroclaw) {
  console.error('Wrocław route not found!');
  process.exit(1);
}

const allItems = [];

// Markets
if (wroclaw.markets) {
  for (const m of wroclaw.markets) {
    allItems.push({
      section: 'Markets',
      id: m.id,
      name: m.name,
      imageSrc: m.imageSrc
    });
  }
}

// Must See
if (wroclaw.mustSee) {
  for (const m of wroclaw.mustSee) {
    allItems.push({
      section: 'Must See',
      id: m.id,
      name: m.name || m.title,
      imageSrc: m.imageSrc || m.imageUrl
    });
  }
}

// Restaurants
if (wroclaw.wroclawRestaurantsDetailed) {
  for (const r of wroclaw.wroclawRestaurantsDetailed) {
    allItems.push({
      section: 'Restaurants',
      id: r.id,
      name: r.name,
      imageSrc: r.imageSrc
    });
  }
}

// Drinks
if (wroclaw.wroclawDrinksDetailed) {
  for (const d of wroclaw.wroclawDrinksDetailed) {
    allItems.push({
      section: 'Drinks',
      id: d.id,
      name: d.name,
      imageSrc: d.imageSrc
    });
  }
}

// Cafes
if (wroclaw.wroclawCafesDetailed) {
  for (const c of wroclaw.wroclawCafesDetailed) {
    allItems.push({
      section: 'Cafes',
      id: c.id,
      name: c.name,
      imageSrc: c.imageSrc
    });
  }
}

// Stays
if (wroclaw.wroclawStaysDetailed || wroclaw.stays) {
  const stays = wroclaw.wroclawStaysDetailed || wroclaw.stays || [];
  for (const s of stays) {
    allItems.push({
      section: 'Stays',
      id: s.id,
      name: s.name || s.title,
      imageSrc: s.imageSrc || s.imageUrl
    });
  }
}

console.log(`Total items in Wrocław: ${allItems.length}`);

for (const item of allItems) {
  if (!item.imageSrc) {
    console.log(`❌ [${item.section}] ${item.name} (${item.id}) - NO imageSrc specified!`);
    continue;
  }
  const relPath = item.imageSrc.replace('/wayfinder/', '').replace('public/', '');
  const localFile = path.resolve('./public', relPath.replace(/^Poland-2026\//, 'Poland-2026/'));
  const altFile = path.resolve('./public', item.imageSrc.replace(/^\/wayfinder\//, ''));
  
  let actualPath = fs.existsSync(localFile) ? localFile : (fs.existsSync(altFile) ? altFile : null);

  if (actualPath) {
    const size = fs.statSync(actualPath).size;
    console.log(`✅ [${item.section}] ${item.name}: ${item.imageSrc} (${(size / 1024).toFixed(1)} KB)`);
  } else {
    console.log(`❌ [${item.section}] ${item.name} (${item.id}): MISSING FILE on disk: ${item.imageSrc}`);
  }
}
