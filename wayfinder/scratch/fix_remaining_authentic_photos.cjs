const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.join(__dirname, '..', 'public', 'Poland-2026', 'images', 'wroclaw', 'hotels');

// Direct, verified Wikimedia Commons files for the exact buildings
const specificHotels = [
  {
    file: 'doubletree.jpg',
    hotel: 'DoubleTree by Hilton Wrocław (OVO Wrocław)',
    // Exact OVO Wrocław building on Podwale
    commonsQuery: 'OVO Wrocław 2016'
  },
  {
    file: 'radisson-blu.jpg',
    hotel: 'Radisson Blu Hotel Wrocław',
    // Exact Radisson Blu building at Purkyniego 10
    commonsQuery: 'Hotel Radisson SAS we Wrocławiu'
  },
  {
    file: 'the-bridge.jpg',
    hotel: 'The Bridge Wrocław MGallery',
    // Hotel at Plac Katedralny 8
    commonsQuery: 'Plac Katedralny 8'
  },
  {
    file: 'bb-hotel.jpg',
    hotel: 'B&B Hotel Wrocław Centrum',
    // Building at Piotra Skargi 24
    commonsQuery: 'Księdza Piotra Skargi 24'
  },
  {
    file: 'hostel-mleczarnia.jpg',
    hotel: 'Hostel Mleczarnia',
    // Historic courtyard building at Włodkowica 6
    commonsQuery: 'Pawła Włodkowica 6'
  },
  {
    file: 'korona-hotel.jpg',
    hotel: 'Hotel Korona Wrocław',
    // Building at Kochanowskiego
    commonsQuery: 'Kochanowskiego 27'
  }
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TechTrekWayfinder/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    function fetchUrl(targetUrl, redirects = 0) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      https.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TechTrekWayfinder/1.0'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Status ${res.statusCode}`));
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve(true));
        });
        fileStream.on('error', reject);
      }).on('error', reject);
    }
    fetchUrl(url);
  });
}

async function searchCommons(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=1280&format=json`;
  const json = await fetchJson(url);
  if (json.query && json.query.pages) {
    const pages = Object.values(json.query.pages);
    for (const p of pages) {
      if (p.imageinfo && p.imageinfo[0]) {
        const info = p.imageinfo[0];
        const link = info.thumburl || info.url;
        if (link && (link.includes('.jpg') || link.includes('.jpeg') || link.includes('.png'))) {
          return link;
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log('Refining exact authentic building photos...\n');
  for (const item of specificHotels) {
    console.log(`Searching exact photo for: ${item.hotel}`);
    const imgUrl = await searchCommons(item.commonsQuery);
    if (imgUrl) {
      console.log(`  Found Wikimedia URL: ${imgUrl}`);
      const destPath = path.join(targetDir, item.file);
      try {
        await downloadImage(imgUrl, destPath);
        const stat = fs.statSync(destPath);
        console.log(`  [SUCCESS] Downloaded ${item.file} (${stat.size} bytes)\n`);
      } catch (err) {
        console.error(`  [ERROR] Download failed: ${err.message}\n`);
      }
    } else {
      console.log(`  [WARN] No match found for query "${item.commonsQuery}"\n`);
    }
  }
}

main();
