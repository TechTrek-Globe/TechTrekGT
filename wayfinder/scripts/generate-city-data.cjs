const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Read API keys from .dev.vars
const devVarsPath = path.join(__dirname, '..', '.dev.vars');
let GEOAPIFY_KEY = '';
if (fs.existsSync(devVarsPath)) {
  const varsContent = fs.readFileSync(devVarsPath, 'utf-8');
  const match = varsContent.match(/GEOAPIFY_API_KEY=([^\r\n]+)/);
  if (match) GEOAPIFY_KEY = match[1].trim();
}

console.log('Using Geoapify Key:', GEOAPIFY_KEY ? 'Present' : 'Missing');

const BASE_IMG_DIR = path.join(__dirname, '..', 'public', 'Poland-2026', 'images');

const HTTP_HEADERS = {
  'User-Agent': 'TechTrekWayfinderApp/1.0 (https://techtrekgt.com; contact@techtrekgt.com) node-fetch/1.0',
  'Accept': 'image/jpeg,image/png,image/*;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9'
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const headers = { ...HTTP_HEADERS, ...customHeaders };
    const req = client.get(url, { headers, timeout: 10000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location, customHeaders).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`[Cache Hit] Already exists: ${dest}`);
      return resolve(dest);
    }
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { headers: HTTP_HEADERS, timeout: 15000 }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(dest, () => {
          downloadImage(response.headers.location, dest).then(resolve).catch(reject);
        });
        return;
      }
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
              resolve(dest);
            } else {
              fs.unlink(dest, () => reject(new Error('File size too small')));
            }
          });
        });
      } else {
        file.close();
        fs.unlink(dest, () => reject(new Error(`Status ${response.statusCode}`)));
      }
    });
    req.on('error', err => {
      file.close();
      fs.unlink(dest, () => reject(err));
    });
    req.on('timeout', () => {
      req.destroy();
      file.close();
      fs.unlink(dest, () => reject(new Error('Download timeout')));
    });
  });
}

async function geocodePlace(name, city) {
  if (!GEOAPIFY_KEY) return null;
  const q = encodeURIComponent(`${name}, ${city}, Poland`);
  try {
    const data = await fetchJson(`https://api.geoapify.com/v1/geocode/search?text=${q}&limit=1&apiKey=${GEOAPIFY_KEY}`);
    if (data && data.features && data.features.length > 0) {
      const feat = data.features[0];
      return {
        address: feat.properties.formatted || `${name}, ${city}, Poland`,
        lat: feat.properties.lat,
        lng: feat.properties.lon
      };
    }
  } catch (e) {
    console.error(`Geocode error for ${name}, ${city}:`, e.message);
  }
  return null;
}

async function searchWikimediaImage(query) {
  try {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&gsrsearch=' + encodeURIComponent(query);
    const json = await fetchJson(url);
    if (json && json.query && json.query.pages) {
      const firstPage = Object.values(json.query.pages)[0];
      if (firstPage && firstPage.imageinfo && firstPage.imageinfo[0]) {
        return firstPage.imageinfo[0].thumburl || firstPage.imageinfo[0].url;
      }
    }
  } catch (e) {
    console.error(`Wikimedia search error for ${query}:`, e.message);
  }
  return null;
}

async function searchWikipediaImage(query) {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=1200&titles=' + encodeURIComponent(query);
    const json = await fetchJson(url);
    if (json && json.query && json.query.pages) {
      const page = Object.values(json.query.pages)[0];
      if (page && page.thumbnail && page.thumbnail.source) {
        return page.thumbnail.source;
      }
    }
  } catch (e) {
    console.error(`Wikipedia image error for ${query}:`, e.message);
  }
  return null;
}

module.exports = {
  ensureDir,
  delay,
  downloadImage,
  geocodePlace,
  searchWikimediaImage,
  searchWikipediaImage,
  BASE_IMG_DIR
};
