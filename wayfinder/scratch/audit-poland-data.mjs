import { polandJourney } from '../src/data/poland-2026.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(WAYFINDER_ROOT, 'public');

// Category mapping to Workspace Rule 5 directories: 'markets', 'attractions', 'food', 'hotels'
const CATEGORY_MAP = [
  { key: 'markets', category: 'markets', arrayField: 'markets', label: 'Christmas Markets' },
  { key: 'attractions', category: 'attractions', arrayField: 'mustSee', label: 'Must-See Attractions' },
  { key: 'food', category: 'food', arrayField: 'restaurantsDetailed', label: 'Restaurants' },
  { key: 'food', category: 'food', arrayField: 'drinksDetailed', label: 'Bars & Nightlife' },
  { key: 'food', category: 'food', arrayField: 'cafesDetailed', label: 'Cafés & Dessert' },
  { key: 'hotels', category: 'hotels', arrayField: 'hotels', label: 'Hotels (Deprecated/Base)' }
];

function getImageValue(poi) {
  const keys = ['imageSrc', 'imageUrl', 'image', 'photo', 'img'];
  for (const k of keys) {
    if (poi[k] && typeof poi[k] === 'string' && poi[k].trim()) {
      return { key: k, value: poi[k].trim() };
    }
  }
  return null;
}

function hasValidCoordinates(poi) {
  return (
    poi.lat !== undefined && poi.lng !== undefined &&
    typeof poi.lat === 'number' && typeof poi.lng === 'number' &&
    !isNaN(poi.lat) && !isNaN(poi.lng)
  );
}

function checkHierarchy(imgUrl, cityId, category) {
  // Expected structure: /wayfinder/Poland-2026/images/[city_name]/[category]/...
  // or Poland-2026/images/[city_name]/[category]/...
  const clean = imgUrl.replace(/^\/wayfinder\//, '').replace(/^\//, '');
  const parts = clean.split('/');
  if (parts.length < 4) return { valid: false, reason: 'Too few path segments' };
  if (parts[0] !== 'Poland-2026' || parts[1] !== 'images') {
    return { valid: false, reason: `Does not start with Poland-2026/images (found ${parts.slice(0, 2).join('/')})` };
  }
  if (parts[2] !== cityId) {
    return { valid: false, reason: `City folder mismatch: expected '${cityId}', found '${parts[2]}'` };
  }
  if (parts[3] !== category) {
    return { valid: false, reason: `Category folder mismatch: expected '${category}', found '${parts[3]}'` };
  }
  return { valid: true };
}

function checkFileExists(imgUrl) {
  const clean = imgUrl.replace(/^\/wayfinder\//, '').replace(/^\//, '');
  const absPath = path.join(PUBLIC_ROOT, clean);
  const exists = fs.existsSync(absPath) && fs.statSync(absPath).isFile();
  return { exists, absPath, relPath: clean };
}

const auditResults = {
  cities: {},
  summary: {
    totalPoisChecked: 0,
    fullyCompliant: 0,
    missingDescription: 0,
    missingCoordinates: 0,
    missingImageRef: 0,
    invalidImageHierarchy: 0,
    imageFileNotFound: 0
  },
  detailedIssues: []
};

for (const city of polandJourney.route) {
  const cityId = city.id;
  const cityName = city.name;
  
  auditResults.cities[cityId] = {
    name: cityName,
    categories: {},
    totalPois: 0,
    compliantPois: 0,
    issues: []
  };

  for (const catDef of CATEGORY_MAP) {
    const rawArray = city[catDef.arrayField];
    if (!rawArray || !Array.isArray(rawArray) || rawArray.length === 0) {
      // If hotels array is absent, note it
      if (catDef.key === 'hotels') {
        auditResults.cities[cityId].categories[catDef.label] = { count: 0, status: 'No commercial hotel POIs (Conforms with Rule 5 deprecation)' };
      }
      continue;
    }

    auditResults.cities[cityId].categories[catDef.label] = { count: rawArray.length, pois: [] };

    rawArray.forEach((poi, index) => {
      // If poi is a string (e.g. In hotels string list)
      if (typeof poi === 'string') {
        auditResults.cities[cityId].categories[catDef.label].pois.push({
          type: 'string',
          value: poi,
          compliant: true
        });
        return;
      }

      auditResults.summary.totalPoisChecked++;
      auditResults.cities[cityId].totalPois++;

      const poiName = poi.name || poi.title || `POI #${index + 1}`;
      const poiId = poi.id || `index-${index}`;
      const problems = [];

      // 1. Description validation
      const desc = poi.description;
      const hasProperDesc = typeof desc === 'string' && desc.trim().length > 0;
      const hasAlternateDesc = typeof (poi.details || poi.detail || poi.summary || poi.overview || poi.notes) === 'string';
      
      if (!hasProperDesc) {
        if (hasAlternateDesc) {
          problems.push({
            type: 'DESCRIPTION_KEY_MISMATCH',
            message: `Missing 'description' field (has '${poi.details ? 'details' : (poi.notes ? 'notes' : 'other')}' instead)`
          });
        } else {
          problems.push({
            type: 'MISSING_DESCRIPTION',
            message: 'Missing or empty description'
          });
        }
        auditResults.summary.missingDescription++;
      }

      // 2. Coordinate validation
      const hasCoords = hasValidCoordinates(poi);
      if (!hasCoords) {
        problems.push({
          type: 'MISSING_COORDINATES',
          message: `Missing or invalid coordinates (lat: ${poi.lat}, lng: ${poi.lng})`
        });
        auditResults.summary.missingCoordinates++;
      }

      // 3. Image reference & filesystem validation
      const imgRef = getImageValue(poi);
      if (!imgRef) {
        problems.push({
          type: 'MISSING_IMAGE_REF',
          message: 'Missing image reference (no imageSrc / imageUrl / image / photo)'
        });
        auditResults.summary.missingImageRef++;
      } else {
        const hierarchy = checkHierarchy(imgRef.value, cityId, catDef.category);
        if (!hierarchy.valid) {
          problems.push({
            type: 'INVALID_IMAGE_HIERARCHY',
            message: `Image path hierarchy violation: ${hierarchy.reason} (${imgRef.value})`
          });
          auditResults.summary.invalidImageHierarchy++;
        }

        const fileCheck = checkFileExists(imgRef.value);
        if (!fileCheck.exists) {
          problems.push({
            type: 'IMAGE_FILE_NOT_FOUND',
            message: `Image file does not exist on disk: ${fileCheck.relPath}`
          });
          auditResults.summary.imageFileNotFound++;
        }
      }

      const isCompliant = problems.length === 0;
      if (isCompliant) {
        auditResults.summary.fullyCompliant++;
        auditResults.cities[cityId].compliantPois++;
      } else {
        const issueRecord = {
          cityId,
          cityName,
          categoryKey: catDef.key,
          categoryLabel: catDef.label,
          arrayField: catDef.arrayField,
          poiId,
          poiName,
          address: poi.address || poi.location || poi.locationData || '',
          problems,
          rawPoi: poi
        };
        auditResults.cities[cityId].issues.push(issueRecord);
        auditResults.detailedIssues.push(issueRecord);
      }
    });
  }
}

// Write JSON artifact of audit results
fs.writeFileSync(
  path.join(WAYFINDER_ROOT, 'scratch', 'audit-poland-data.json'),
  JSON.stringify(auditResults, null, 2),
  'utf8'
);

console.log('\n===============================================================');
console.log('       WAYFINDER POLAND-2026 DATA INTEGRITY AUDIT RESULTS      ');
console.log('===============================================================');
console.log(`Total POIs Audited:         ${auditResults.summary.totalPoisChecked}`);
console.log(`Fully Compliant POIs:       ${auditResults.summary.fullyCompliant} (${Math.round((auditResults.summary.fullyCompliant / auditResults.summary.totalPoisChecked) * 100)}%)`);
console.log(`POIs With Issues:           ${auditResults.detailedIssues.length} (${Math.round((auditResults.detailedIssues.length / auditResults.summary.totalPoisChecked) * 100)}%)`);
console.log('---------------------------------------------------------------');
console.log(`Missing/Invalid Description:${auditResults.summary.missingDescription}`);
console.log(`Missing Coordinates (lat/lng):${auditResults.summary.missingCoordinates}`);
console.log(`Missing Image Reference:    ${auditResults.summary.missingImageRef}`);
console.log(`Invalid Image Hierarchy:    ${auditResults.summary.invalidImageHierarchy}`);
console.log(`Image File Not Found on Disk:${auditResults.summary.imageFileNotFound}`);
console.log('===============================================================\n');

for (const [cityId, cityData] of Object.entries(auditResults.cities)) {
  console.log(`>>> City: ${cityData.name} (${cityId}) - ${cityData.compliantPois}/${cityData.totalPois} compliant`);
  if (cityData.issues.length > 0) {
    for (const issue of cityData.issues) {
      console.log(`  [FAIL] [${issue.categoryLabel}] ${issue.poiName} (${issue.poiId})`);
      for (const p of issue.problems) {
        console.log(`         • ${p.type}: ${p.message}`);
      }
    }
  } else {
    console.log('  [PASS] All POIs 100% compliant!');
  }
  console.log('');
}