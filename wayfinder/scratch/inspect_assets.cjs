const fs = require('fs');
const path = require('path');

function getFiles(dir, ext = ['.js', '.jsx', '.html', '.css', '.json']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', 'dist', '.wrangler', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, ext));
    } else {
      if (ext.some(e => file.endsWith(e))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const allSrc = getFiles('src');
console.log('--- Static Asset Imports in src/ ---');
for (const file of allSrc) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('assets/') || line.includes('.png') || line.includes('.jpg') || line.includes('.svg') || line.includes('.webp')) {
      if (!line.includes('Poland-2026/images')) {
        console.log(`${file}:${idx + 1}: ${line.trim()}`);
      }
    }
  });
}
