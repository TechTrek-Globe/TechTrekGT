const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const publicImages = getFiles('wayfinder/public/Poland-2026/images').map(p => p.replace(/\\/g, '/'));
const srcAssets = getFiles('wayfinder/src/assets').map(p => p.replace(/\\/g, '/'));

console.log('--- Public Poland-2026/images (' + publicImages.length + ' files) ---');
publicImages.forEach(p => console.log(p.replace('wayfinder/public/Poland-2026/images/', '')));

console.log('\n--- Src Assets (' + srcAssets.length + ' files) ---');
srcAssets.forEach(p => console.log(p.replace('wayfinder/src/assets/', '')));
