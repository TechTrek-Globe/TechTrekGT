import { polandJourney } from '../src/data/poland-2026.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(WAYFINDER_ROOT, 'public');

// Map route array keys to canonical Workspace Rule 5 categories
const CATEGORY_MAP = {
  markets: 'markets',
  mustSee: 'attractions',
  restaurantsDetailed: 'food',
  drinksDetailed: 'food',
  cafesDetailed: 'food'
};

// Image reference keys found in POI objects (union across all city variants)
const IMAGE_KEYS = ['image', 'imageSrc', 'imageUrl', 'imagePath', 'img', 'photo', 'imageRef'];

const issues = [];
let totalPois = 0;
let totalOk = 0;

function getImageValue(poi) {
  for (const key of IMAGE_KEYS) {
    if (poi[key] && typeof poi[key] === 'string' && poi[key].trim()) {
      return poi[key];
    }
  }
  // Nested imageDetails objects
  if (poi.imageDetails && typeof poi.imageDetails === 'object') {
    for (const key of IMAGE_KEYS) {
      if (poi.imageDetails[key] && typeof poi.imageDetails[key] === 'string') {
        return poi.imageDetails[key];
      }
    }
  }
  return null;
}

function hasCoordinates(poi) {
  return (
    poi.lat !== undefined && poi.lng !== undefined &&
    typeof poi.lat === 'number' && typeof poi.lng === 'number' &&
    !isNaN(poi.lat) && !isNaN(poi.lng)
  );
}

function resolveFsPath(imageRef) {
  // Convert URL /wayfinder/Poland-2026/images/... to public/Poland-2026/images/...
  const normalized = imageRef.replace(/^\/wayfinder\//, '');
  const candidate = path.join(PUBLIC_ROOT, normalized);
  const publicRootNorm = path.resolve(PUBLIC_ROOT).toLowerCase().replace(/\\/g, '/');
  const candidateNorm = path.resolve(candidate).toLowerCase().replace(/\\/g, '/');
  if (!candidateNorm.startsWith(publicRootNorm)) {
    return { path: candidate, validHierarchy: false, exists: false, reason: 'outside public root' };
  }
  const exists = fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  return { path: candidate, validHierarchy: true, exists };
}

function strictHierarchyCheck(imageRef, cityId, category) {
  const norm = imageRef.replace(/^\/wayfinder\//, '');
  const parts = norm.split('/').filter(Boolean);
  // Expect: Poland-2026 / images / [city] / [category] / file
  if (parts.length < 5) return false;
  if (parts[0] !== 'Poland-2026' || parts[1] !== 'images') return false;
  if (parts[2] !== cityId) return false;
  if (parts[3] !== category) return false;
  return true;
}

function auditPoi(poi, cityId, cityName, category, arrayName) {
  totalPois++;
  const label = `${cityName} > ${category} > ${poi.name || poi.title || '(unnamed)'} [${arrayName}]`;

  const problems = [];

  // 1. Description
  const desc = poi.description || poi.detail || poi.summary || poi.overview;
  if (!desc || (typeof desc === 'string' && !desc.trim())) {
    problems.push('MISSING_DESCRIPTION');
  }

  // 2. Coordinates
  if (!hasCoordinates(poi)) {
    problems.push('MISSING_COORDINATES');
  }

  // 3. Image reference
  const img = getImageValue(poi);
  if (!img) {
    problems.push('MISSING_IMAGE');
  } else {
    // Strict hierarchy
    if (!strictHierarchyCheck(img, cityId, category)) {
      problems.push(`IMAGE_PATH_MISMATCH (${img})`);
    }
    const fsCheck = resolveFsPath(img);
    if (!fsCheck.exists) {
      problems.push(`IMAGE_FILE_NOT_FOUND (${img})`);
    }
  }

  if (problems.length === 0) {
    totalOk++;
  } else {
    issues.push({ label, problems, poi });
    console.log(`[FAIL] ${label}`);
    for (const p of problems) console.log(`       - ${p}`);
  }
}

function auditCity(city) {
  const cityId = city.id;
  const cityName = city.name || cityId;
  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    const arr = city[key];
    if (!Array.isArray(arr)) continue;
    for (const poi of arr) {
      if (poi && typeof poi === 'object' && !Array.isArray(poi)) {
        auditPoi(poi, cityId, cityName, category, key);
      }
    }
  }
}

console.log('======================================================');
console.log('Wayfinder Data Integrity Audit: poland-2026.js');
console.log('======================================================');
console.log(`Public root: ${PUBLIC_ROOT}\n`);

for (const city of polandJourney.route) {
  auditCity(city);
}

console.log('\n======================================================');
console.log(`SUMMARY: ${totalPois} POIs checked, ${totalOk} OK, ${issues.length} FAILED`);
console.log('======================================================');

if (issues.length > 0) {
  console.log('\nDetailed failures:');
  for (const it of issues) {
    console.log(`\n--- ${it.label} ---`);
    for (const p of it.problems) console.log(`    ${p}`);
  }
}

process.exit(issues.length > 0 ? 1 : 0);