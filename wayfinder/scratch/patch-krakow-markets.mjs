import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_FILE = path.resolve(__dirname, '..', 'src', 'data', 'poland-2026.js');

let content = fs.readFileSync(TARGET_FILE, 'utf8');

// 1. Rynek Główny
content = content.replace(
  /id:\s*"rynek-glowny",\r?\n\s*name:\s*"Rynek Główny Main Market",\r?\n\s*shortName:\s*"Rynek Główny",\r?\n\s*location:\s*"Grand Main Square \(Old Town\)",/,
  `id: "rynek-glowny",\r\n          name: "Rynek Główny Main Market",\r\n          shortName: "Rynek Główny",\r\n          location: "Grand Main Square (Old Town)",\r\n          lat: 50.0614167,\r\n          lng: 19.9364255,\r\n          imageSrc: "/wayfinder/Poland-2026/images/krakow/markets/krakow-rynek-glowny.png",\r\n          imageUrl: "/wayfinder/Poland-2026/images/krakow/markets/krakow-rynek-glowny.png",`
);

content = content.replace(
  /details:\s*"The crown jewel of Polish Christmas markets! Over 100 wooden chalets surround the Renaissance Cloth Hall \(Sukiennice\) under the illuminated towers of St\. Mary's Basilica\. Feast on grilled Oscypek smoked cheese with cranberry jam, sizzling pierogi, and roasted kielbasa while carols echo across the square\."\r?\n\s*\},/,
  `description: "The crown jewel of Polish Christmas markets! Over 100 wooden chalets surround the Renaissance Cloth Hall (Sukiennice) under the illuminated towers of St. Mary's Basilica. Feast on grilled Oscypek smoked cheese with cranberry jam, sizzling pierogi, and roasted kielbasa while carols echo across the square.",\r\n          details: "The crown jewel of Polish Christmas markets! Over 100 wooden chalets surround the Renaissance Cloth Hall (Sukiennice) under the illuminated towers of St. Mary's Basilica. Feast on grilled Oscypek smoked cheese with cranberry jam, sizzling pierogi, and roasted kielbasa while carols echo across the square."\r\n        },`
);

// 2. Mały Rynek
content = content.replace(
  /id:\s*"maly-rynek",\r?\n\s*name:\s*"Mały Rynek Craft Corner",\r?\n\s*shortName:\s*"Mały Rynek",\r?\n\s*location:\s*"Small Square \(Behind St\. Mary's\)",/,
  `id: "maly-rynek",\r\n          name: "Mały Rynek Craft Corner",\r\n          shortName: "Mały Rynek",\r\n          location: "Small Square (Behind St. Mary's)",\r\n          lat: 50.0610715,\r\n          lng: 19.9401271,\r\n          imageSrc: "/wayfinder/Poland-2026/images/krakow/markets/krakow-maly-rynek.png",\r\n          imageUrl: "/wayfinder/Poland-2026/images/krakow/markets/krakow-maly-rynek.png",`
);

content = content.replace(
  /details:\s*"A cozy, intimate extension located just behind St\. Mary's Basilica\. Mały Rynek focuses on regional food producers, small-batch gingerbread bakers, and master craftsmen selling one-of-a-kind wooden toys and wool slippers\."\r?\n\s*\},/,
  `description: "A cozy, intimate extension located just behind St. Mary's Basilica. Mały Rynek focuses on regional food producers, small-batch gingerbread bakers, and master craftsmen selling one-of-a-kind wooden toys and wool slippers.",\r\n          details: "A cozy, intimate extension located just behind St. Mary's Basilica. Mały Rynek focuses on regional food producers, small-batch gingerbread bakers, and master craftsmen selling one-of-a-kind wooden toys and wool slippers."\r\n        },`
);

// 3. Plac Wolnica
content = content.replace(
  /id:\s*"kazimierz-wolnica",\r?\n\s*name:\s*"Plac Wolnica Market",\r?\n\s*shortName:\s*"Plac Wolnica",\r?\n\s*location:\s*"Kazimierz \(Jewish Quarter\)",/,
  `id: "kazimierz-wolnica",\r\n          name: "Plac Wolnica Market",\r\n          shortName: "Plac Wolnica",\r\n          location: "Kazimierz (Jewish Quarter)",\r\n          lat: 50.0487502,\r\n          lng: 19.9442715,\r\n          imageSrc: "/wayfinder/Poland-2026/images/krakow/markets/krakow-plac-wolnica.png",\r\n          imageUrl: "/wayfinder/Poland-2026/images/krakow/markets/krakow-plac-wolnica.png",`
);

content = content.replace(
  /details:\s*"Set in the historic heart of Kazimierz, this market offers a bohemian, relaxed holiday atmosphere\. Browse vintage vinyl, handmade ceramics, and indie art while sipping hot spiced cider or craft stouts\."\r?\n\s*\}/,
  `description: "Set in the historic heart of Kazimierz, this market offers a bohemian, relaxed holiday atmosphere. Browse vintage vinyl, handmade ceramics, and indie art while sipping hot spiced cider or craft stouts.",\r\n          details: "Set in the historic heart of Kazimierz, this market offers a bohemian, relaxed holiday atmosphere. Browse vintage vinyl, handmade ceramics, and indie art while sipping hot spiced cider or craft stouts."\r\n        }`
);

fs.writeFileSync(TARGET_FILE, content, 'utf8');
console.log('Successfully regex-patched Kraków markets in poland-2026.js');
