const fs = require('fs');
const path = require('path');

// Ensure script runs relative to the wayfinder directory root
const WAYFINDER_ROOT = path.resolve(__dirname, '..');
process.chdir(WAYFINDER_ROOT);

/**
 * Recursively scans directory and returns all matching file paths.
 * @param {string} dir - Directory path to scan.
 * @param {(filePath: string) => boolean} [filterFn] - Predicate filter function.
 * @returns {string[]} Matching file paths.
 */
function getFiles(dir, filterFn = () => true) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', 'dist', '.wrangler', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, filterFn));
    } else if (filterFn(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('=== WAYFINDER COMPREHENSIVE AUDIT ===\n');

// 1. Scan all JS/JSX files in src and functions
const srcFiles = getFiles('src', f => f.endsWith('.js') || f.endsWith('.jsx'));
const funcFiles = getFiles('functions', f => f.endsWith('.js'));
const allCodeFiles = [...srcFiles, ...funcFiles, 'index.html'];

console.log(`Found ${srcFiles.length} src files and ${funcFiles.length} function files.`);

// Map imports/exports and string references
const fileContents = {};
for (const file of allCodeFiles) {
  fileContents[file] = fs.readFileSync(file, 'utf8');
}

// Check entry points
console.log('\n--- Entry Points & Root Files ---');
console.log('index.html -> loads /src/main.jsx');
console.log('wrangler.jsonc -> main: "src/worker.js", assets: "./dist/client"');

// Check every src file incoming references
console.log('\n--- Component & Module Dependency Analysis ---');
for (const file of srcFiles) {
  const normFile = file.replace(/\\/g, '/');
  const baseName = path.basename(file, path.extname(file));
  
  // Is this file imported by any other file?
  let referencingFiles = [];
  for (const [otherFile, content] of Object.entries(fileContents)) {
    if (otherFile === file) continue;
    // Check various import formats
    if (
      content.includes(baseName) ||
      content.includes(normFile) ||
      content.includes(path.basename(file))
    ) {
      referencingFiles.push(otherFile.replace(/\\/g, '/'));
    }
  }
  
  const isRoot = normFile === 'src/main.jsx' || normFile === 'src/worker.js' || normFile === 'src/index.css';
  console.log(`[${normFile}] -> Referenced by ${referencingFiles.length} files:`, referencingFiles.length > 0 ? referencingFiles.slice(0, 3).join(', ') : (isRoot ? '(Root Entry Point)' : '*** ZERO REFERENCES / POTENTIAL ORPHAN ***'));
}

// 2. Scan public/ and src/assets/ files
console.log('\n--- Asset Hierarchy & Reference Audit ---');
const publicAssets = getFiles('public');
const srcAssets = getFiles('src/assets');

console.log(`Total public assets: ${publicAssets.length}`);
console.log(`Total src/assets: ${srcAssets.length}`);

// Check which public assets are referenced in src/ (code + data)
const unreferencedPublic = [];
const referencedPublic = [];

const allCodeText = Object.values(fileContents).join('\n');

for (const asset of publicAssets) {
  const normAsset = asset.replace(/\\/g, '/');
  const webPath = normAsset.replace(/^public/, '/wayfinder');
  const directPath = normAsset.replace(/^public/, '');
  const fileName = path.basename(asset);
  
  const isReferenced = allCodeText.includes(normAsset) ||
                       allCodeText.includes(webPath) ||
                       allCodeText.includes(directPath) ||
                       allCodeText.includes(fileName);
                       
  if (isReferenced) {
    referencedPublic.push(normAsset);
  } else {
    unreferencedPublic.push(normAsset);
  }
}

console.log(`Public assets referenced: ${referencedPublic.length}`);
console.log(`Public assets unreferenced directly in code/data: ${unreferencedPublic.length}`);

// Check src/assets references
console.log('\n--- src/assets References ---');
for (const asset of srcAssets) {
  const normAsset = asset.replace(/\\/g, '/');
  const fileName = path.basename(asset);
  const isReferenced = allCodeText.includes(normAsset) || allCodeText.includes(fileName);
  console.log(`[${normAsset}] -> Referenced: ${isReferenced}`);
}

// 3. Scan root, scripts/, scratch/ files
console.log('\n--- Non-Code / Workspace Files Audit ---');
const rootFiles = fs.readdirSync('.').filter(f => !fs.statSync(f).isDirectory());
console.log('Root files:', rootFiles);

const scriptFiles = getFiles('scripts');
console.log(`Scripts count: ${scriptFiles.length}`);

const scratchFiles = getFiles('scratch');
console.log(`Scratch files count: ${scratchFiles.length}`);
