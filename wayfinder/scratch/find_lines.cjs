const fs = require('fs');
const content = fs.readFileSync('./src/data/poland-2026.js', 'utf8');
const lines = content.split('\n');

lines.forEach((l, i) => {
  if (l.match(/^\s*id:\s*['"](krakow|wroclaw|poznan|torun|gdansk)['"]/)) {
    console.log('City at line ' + (i+1) + ': ' + l.trim());
  }
  if (l.match(/^\s*(markets|mustSee|restaurants|poznanRestaurantsDetailed|torunRestaurantsDetailed|gdanskRestaurantsDetailed|restaurantsDetailed):\s*\[/)) {
    console.log('  Array at line ' + (i+1) + ': ' + l.trim());
  }
});
