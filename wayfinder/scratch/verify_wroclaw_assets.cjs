const fs = require('fs');
const path = require('path');

const polandData = require('../src/data/poland-2026.js');

// Find wroclaw object
const wroclaw = polandData.polandJourney.route.find(c => c.id === 'wroclaw');

if (!wroclaw) {
  console.error('Wroclaw object not found!');
  process.exit(1);
}

console.log('Found Wroclaw object with name:', wroclaw.name);

const imagePaths = [];

function extractImages(obj) {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.includes('/images/')) {
      imagePaths.push(obj);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach(item => extractImages(item));
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      extractImages(obj[key]);
    }
  }
}

extractImages(wroclaw);

console.log(`Found ${imagePaths.length} image paths referenced in Wroclaw data:`);
let missingCount = 0;

imagePaths.forEach(img => {
  // Convert /wayfinder/Poland-2026/images/... to local public path
  const localPath = img.replace('/wayfinder/', '');
  const fullPath = path.join(__dirname, '..', 'public', localPath.replace('Poland-2026/', 'Poland-2026/'));
  
  if (fs.existsSync(fullPath)) {
    console.log(`✅ OK: ${img}`);
  } else {
    console.log(`❌ MISSING: ${img} (Checked: ${fullPath})`);
    missingCount++;
  }
});

if (missingCount === 0) {
  console.log('🎉 ALL Wroclaw images exist locally!');
} else {
  console.log(`⚠️ ${missingCount} missing image(s) found.`);
}
