const fs = require('fs');
const path = require('path');

// Ensure script runs relative to the wayfinder directory root
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
process.chdir(WAYFINDER_ROOT);

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', 'dist', '.wrangler', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allPublic = getFiles('public');
const allSrcAssets = getFiles('src/assets');
const allRoot = fs.readdirSync('.').filter(f => !fs.statSync(f).isDirectory());
const allScripts = getFiles('scripts');
const allScratch = getFiles('scratch');

console.log('=== DETAILED ORPHAN AUDIT ===');
console.log('1. Root legacy files:');
const legacyRoot = [
  'Poland Christmas Markets Winter 2026 - Enhanced Icons (1).docx',
  'doc_extract.txt',
  'doc_extract_part1.txt',
  'download_images.cjs',
  'torun-remediation-data.json'
];
legacyRoot.forEach(f => console.log(`  - ${f} (Exists: ${fs.existsSync(f)})`));

console.log('\n2. src/assets duplicates & unreferenced:');
allSrcAssets.forEach(f => {
  const norm = f.replace(/\\/g, '/');
  console.log(`  - ${norm}`);
});

console.log('\n3. scripts/ one-off migration scripts:');
allScripts.forEach(f => {
  const norm = f.replace(/\\/g, '/');
  console.log(`  - ${norm}`);
});
