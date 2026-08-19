const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
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

const publicFiles = getFiles('public');
const codeFiles = [...getFiles('src'), ...getFiles('functions'), 'index.html'];

let allCode = '';
for (const f of codeFiles) {
  if (f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.json') || f.endsWith('.html') || f.endsWith('.css')) {
    allCode += fs.readFileSync(f, 'utf8') + '\n';
  }
}

console.log(`Auditing ${publicFiles.length} files in public/...`);

const unreferenced = [];
const referenced = [];

for (const p of publicFiles) {
  const norm = p.replace(/\\/g, '/');
  const baseName = path.basename(p);
  const withoutPublic = norm.replace(/^public\//, '');
  const withWayfinder = '/wayfinder/' + withoutPublic;
  const directSlash = '/' + withoutPublic;

  const isRef = allCode.includes(norm) ||
                allCode.includes(withWayfinder) ||
                allCode.includes(directSlash) ||
                allCode.includes(withoutPublic) ||
                allCode.includes(baseName);

  if (isRef) {
    referenced.push(norm);
  } else {
    unreferenced.push(norm);
  }
}

console.log(`Referenced: ${referenced.length}`);
console.log(`Unreferenced: ${unreferenced.length}`);

console.log('\n--- Unreferenced Public Assets ---');
unreferenced.forEach(f => console.log(f));
