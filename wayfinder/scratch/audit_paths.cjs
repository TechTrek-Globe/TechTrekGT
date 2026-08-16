const fs = require('fs');
const content = fs.readFileSync('wayfinder/src/data/poland-2026.js', 'utf8');
const lines = content.split('\n');
const paths = [];
lines.forEach((l, idx) => {
  const m = l.match(/(imageSrc|imageUrl):\s*['"`]([^'"`]+)['"`]/);
  if (m) {
    paths.push({ line: idx + 1, key: m[1], path: m[2] });
  }
});
console.log('Total image properties:', paths.length);
const prefixGroups = {};
paths.forEach(p => {
  const prefix = p.path.startsWith('/wayfinder') ? 'with /wayfinder' : (p.path.startsWith('http') ? 'http URL' : 'without /wayfinder (/Poland-2026...)');
  prefixGroups[prefix] = (prefixGroups[prefix] || 0) + 1;
});
console.log('Prefix breakdown:', JSON.stringify(prefixGroups, null, 2));
console.log('\nPaths without /wayfinder prefix:');
paths.filter(p => !p.path.startsWith('/wayfinder')).forEach(p => console.log(`Line ${p.line} (${p.key}): ${p.path}`));
