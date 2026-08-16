const fs = require('fs');
const path = require('path');
const { poznanData, torunData, gdanskData, toJsCode } = require('./inject-data.cjs');

const dataFilePath = path.join(__dirname, '..', 'src', 'data', 'poland-2026.js');
let content = fs.readFileSync(dataFilePath, 'utf-8');

// Load current data via node require (after transpile or parsing)
// Let's inspect where id: 'poznan' is located
const lines = content.split('\n');

function updateCityInLines(lines, cityId, dataToAdd) {
  // Find city start line
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`id: '${cityId}'`) || lines[i].includes(`id: "${cityId}"`)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    throw new Error(`City ${cityId} not found`);
  }

  // Find insert location right before history or imageDetails
  // Let's insert quickReference, holidayClosures, kaucjaCallout, culinaryHighlights right before history
  // And insert markets, mustSee, restaurants, restaurantsDetailed right before lgbtq or after historyLegends
  console.log(`Found ${cityId} at line ${startIdx + 1}`);
}

// Let's format the whole city replacement code cleanly:
function generateCityObjectCode(cityId, existingCity, extraData) {
  const merged = { ...existingCity, ...extraData };
  // Order keys nicely
  const keyOrder = [
    'id', 'name', 'nights', 'historyBadge', 'base', 'focus', 'marketStrategy',
    'dates', 'openingHours', 'hours', 'kaucja', 'foodTargets',
    'quickReference', 'holidayClosures', 'kaucjaCallout', 'culinaryHighlights',
    'imageDetails', 'history', 'historyStats', 'historyEpochs', 'historyLegends',
    'transit', 'practical',
    'markets', 'mustSee', 'restaurants',
    `${cityId}RestaurantsDetailed`, 'restaurantsDetailed',
    `${cityId}DrinksDetailed`, `${cityId}CafesDetailed`,
    'lgbtq'
  ];

  const orderedObj = {};
  for (const k of keyOrder) {
    if (merged[k] !== undefined) {
      orderedObj[k] = merged[k];
    }
  }
  // Any remaining keys
  for (const k of Object.keys(merged)) {
    if (orderedObj[k] === undefined) {
      orderedObj[k] = merged[k];
    }
  }

  return toJsCode(orderedObj, 4);
}

// Let's use node to load the current module, get the existing cities, merge the data, and write it out cleanly!
const currentData = require('../src/data/poland-2026.js');
const journey = currentData.polandJourney;

// Update the route array
journey.route = journey.route.map(city => {
  if (city.id === 'poznan') {
    return { ...city, ...poznanData };
  }
  if (city.id === 'torun') {
    return { ...city, ...torunData };
  }
  if (city.id === 'gdansk') {
    return { ...city, ...gdanskData };
  }
  return city;
});

// Construct the complete updated poland-2026.js file
const newFileContent = `export const polandJourney = ${toJsCode(journey, 0)};\n`;

fs.writeFileSync(dataFilePath, newFileContent, 'utf-8');
console.log('Successfully updated poland-2026.js with complete city parity data!');
