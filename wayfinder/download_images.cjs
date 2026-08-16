const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

/**
 * Workspace Rule 5 Enforcer: Strict Image Hierarchy
 * Standard Path: public/Poland-2026/images/[city]/[category]/[filename]
 * Valid Categories: 'hotels' | 'food' | 'markets' | 'attractions'
 */
const VALID_CATEGORIES = ['hotels', 'food', 'markets', 'attractions'];
const BASE_IMG_DIR = path.join(__dirname, 'public', 'Poland-2026', 'images');
const DATA_FILE = path.join(__dirname, 'src', 'data', 'poland-2026.js');

function getCategoryDir(city, category) {
  const normCategory = category.toLowerCase().trim();
  if (!VALID_CATEGORIES.includes(normCategory)) {
    throw new Error(`Invalid category "${category}". Allowed categories: ${VALID_CATEGORIES.join(', ')}`);
  }
  const dir = path.join(BASE_IMG_DIR, city.toLowerCase().trim(), normCategory);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
      console.log(`Already exists: ${dest}`);
      return resolve();
    }
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;

    client.get(url, response => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          file.close();
          fs.unlink(dest, () => reject(new Error('Redirect location header missing')));
          return;
        }
        const redirectClient = redirectUrl.startsWith('https') ? https : http;
        redirectClient.get(redirectUrl, redirectResp => {
          if (redirectResp.statusCode === 200) {
            redirectResp.pipe(file);
            file.on('finish', () => {
              file.close(resolve);
            });
          } else {
            file.close();
            fs.unlink(dest, () => reject(new Error(`Redirect responded with ${redirectResp.statusCode}`)));
          }
        }).on('error', err => {
          file.close();
          fs.unlink(dest, () => reject(err));
        });
      } else {
        file.close();
        fs.unlink(dest, () => reject(new Error(`Server responded with ${response.statusCode}: ${response.statusMessage}`)));
      }
    }).on('error', err => {
      file.close();
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function processData() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Data file not found: ${DATA_FILE}`);
    return;
  }

  const content = fs.readFileSync(DATA_FILE, 'utf-8');
  const lines = content.split('\n');
  
  let currentCity = 'krakow';
  let currentCategory = 'hotels';
  let currentId = null;
  const downloadPromises = [];
  
  const newLines = lines.map(line => {
    // Track current city section if discernible
    if (line.includes("id: 'krakow'") || line.includes('id: "krakow"')) currentCity = 'krakow';
    if (line.includes("id: 'wroclaw'") || line.includes('id: "wroclaw"')) currentCity = 'wroclaw';
    if (line.includes("id: 'poznan'") || line.includes('id: "poznan"')) currentCity = 'poznan';
    if (line.includes("id: 'torun'") || line.includes('id: "torun"')) currentCity = 'torun';
    if (line.includes("id: 'gdansk'") || line.includes('id: "gdansk"')) currentCity = 'gdansk';

    // Track category context
    if (line.includes('RestaurantsDetailed') || line.includes('DrinksDetailed') || line.includes('CafesDetailed') || line.includes('cafesAndDining') || line.includes('barsAndClubs')) {
      currentCategory = 'food';
    } else if (line.includes('mustSee') || line.includes('attractions')) {
      currentCategory = 'attractions';
    } else if (line.includes('markets:')) {
      currentCategory = 'markets';
    } else if (line.includes('hotels:')) {
      currentCategory = 'hotels';
    }

    const idMatch = line.match(/id:\s*['"]([^'"]+)['"]/);
    if (idMatch) {
      currentId = idMatch[1];
    }
    
    const imgMatch = line.match(/imageSrc:\s*['"](http[^'"]+)['"]/);
    if (imgMatch && currentId) {
      const url = imgMatch[1];
      const filename = `${currentId}.jpg`;
      const targetDir = getCategoryDir(currentCity, currentCategory);
      const destPath = path.join(targetDir, filename);
      const publicPath = `/wayfinder/Poland-2026/images/${currentCity}/${currentCategory}/${filename}`;
      
      console.log(`Queuing image download for [${currentCity}/${currentCategory}]: ${currentId} -> ${publicPath}`);
      downloadPromises.push(downloadImage(url, destPath));
      
      return line.replace(url, publicPath);
    }
    return line;
  });
  
  if (downloadPromises.length > 0) {
    console.log(`Downloading ${downloadPromises.length} images...`);
    await Promise.all(downloadPromises);
    console.log('All images downloaded successfully.');
    fs.writeFileSync(DATA_FILE, newLines.join('\n'), 'utf-8');
    console.log('Data file updated with standardized paths.');
  } else {
    console.log('No external http image URLs found to download. Workspace Rule 5 is fully compliant.');
  }
}

module.exports = {
  VALID_CATEGORIES,
  BASE_IMG_DIR,
  getCategoryDir,
  downloadImage,
  processData
};

if (require.main === module) {
  processData().catch(console.error);
}
