const fs = require('fs');
const path = require('path');

const polandDataPath = path.join(__dirname, '..', 'src', 'data', 'poland-2026.js');
const content = fs.readFileSync(polandDataPath, 'utf8');

const targetDir = path.join(__dirname, '..', 'public', 'Poland-2026', 'images', 'wroclaw', 'hotels');

const hotelFilenames = [
  'the-bridge.jpg',
  'monopol.jpg',
  'radisson-blu.jpg',
  'ac-hotel.jpg',
  'art-hotel.jpg',
  'puro-wroclaw.jpg',
  'bb-hotel.jpg',
  'mercure.jpg',
  'doubletree.jpg',
  'ibis-styles.jpg',
  'hostel-mleczarnia.jpg',
  'water-tower.jpg',
  'monastery-guesthouse.jpg',
  'korona-hotel.jpg'
];

console.log('=== VERIFYING WROCLAW HOTEL IMAGES ON DISK & DATA REFERENCES ===\n');

let allDiskExist = true;
let allDataRefMatch = true;

for (const file of hotelFilenames) {
  const filePath = path.join(targetDir, file);
  const diskExists = fs.existsSync(filePath);
  const size = diskExists ? fs.statSync(filePath).size : 0;
  
  const expectedPath = `/wayfinder/Poland-2026/images/wroclaw/hotels/${file}`;
  const dataRefExists = content.includes(expectedPath);
  
  if (!diskExists || size === 0) {
    allDiskExist = false;
    console.error(`[FAIL] File missing/empty on disk: ${file}`);
  } else {
    console.log(`[OK Disk] ${file} (${size} bytes)`);
  }

  if (!dataRefExists) {
    allDataRefMatch = false;
    console.error(`[FAIL] Data reference missing in poland-2026.js: ${expectedPath}`);
  } else {
    console.log(`[OK Data] Reference present for ${expectedPath}`);
  }
}

if (allDiskExist && allDataRefMatch) {
  console.log('\nSUCCESS: All 14 Wroclaw hotel images exist locally on disk and are correctly referenced in poland-2026.js!');
} else {
  console.error('\nFAILURE: Some files or data references need attention.');
}
