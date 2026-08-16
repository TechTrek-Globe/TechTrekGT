const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('wayfinder/src/data/poland-2026.js', 'utf8');
const lines = content.split('\n');
const missing = [];
let checked = 0;

lines.forEach((l, idx) => {
  const m = l.match(/(imageSrc|imageUrl):\s*['"`]([^'"`]+)['"`]/);
  if (m) {
    checked++;
    const urlPath = m[2];
    // strip /wayfinder
    const relPath = urlPath.replace(/^\/wayfinder\//, '');
    const diskPath = path.join('wayfinder/public', relPath);
    if (!fs.existsSync(diskPath)) {
      missing.push({ line: idx + 1, key: m[1], url: urlPath, diskPath });
    }
  }
});

console.log(`Checked ${checked} paths.`);
if (missing.length === 0) {
  console.log('✅ ALL referenced images exist on disk in public/!');
} else {
  console.error(`❌ Missing ${missing.length} images:`, missing);
}
