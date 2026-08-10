const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.join(__dirname, '..', 'public', 'Poland-2026', 'images', 'wroclaw', 'hotels');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// List of exact Wikimedia Commons file titles or Wikipedia pages for Wrocław hotel buildings
const hotelTargets = [
  {
    file: 'monopol.jpg',
    hotel: 'Hotel Monopol Wrocław',
    wikiPage: 'Hotel_Monopol_we_Wrocławiu',
    commonsSearch: 'Hotel Monopol Wrocław'
  },
  {
    file: 'water-tower.jpg',
    hotel: 'The Water Tower Apartment (Wieża Ciśnień)',
    wikiPage: 'Wieża_ciśnień_przy_al._Wiśniowej_we_Wrocławiu',
    commonsSearch: 'Wieża ciśnień al. Wiśniowa Wrocław'
  },
  {
    file: 'doubletree.jpg',
    hotel: 'DoubleTree by Hilton Wrocław',
    wikiPage: 'OVO_Wrocław',
    commonsSearch: 'OVO Wrocław'
  },
  {
    file: 'radisson-blu.jpg',
    hotel: 'Radisson Blu Hotel Wrocław',
    commonsSearch: 'Radisson Blu Hotel Wrocław'
  },
  {
    file: 'the-bridge.jpg',
    hotel: 'The Bridge Wrocław MGallery',
    commonsSearch: 'The Bridge Wrocław'
  },
  {
    file: 'ac-hotel.jpg',
    hotel: 'AC Hotel by Marriott Wrocław',
    commonsSearch: 'Plac Wolności 10 Wrocław'
  },
  {
    file: 'art-hotel.jpg',
    hotel: 'Art Hotel Wrocław',
    commonsSearch: 'Kiełbaśnicza 20 Wrocław'
  },
  {
    file: 'puro-wroclaw.jpg',
    hotel: 'PURO Wrocław Stare Miasto',
    commonsSearch: 'Puro Hotel Wrocław'
  },
  {
    file: 'bb-hotel.jpg',
    hotel: 'B&B Hotel Wrocław Centrum',
    commonsSearch: 'B&B Hotel Wrocław'
  },
  {
    file: 'mercure.jpg',
    hotel: 'Mercure Wrocław Centrum',
    commonsSearch: 'Hotel Mercure Wrocław'
  },
  {
    file: 'ibis-styles.jpg',
    hotel: 'ibis Styles Wrocław Centrum',
    commonsSearch: 'Silver Tower Center Wrocław'
  },
  {
    file: 'hostel-mleczarnia.jpg',
    hotel: 'Hostel Mleczarnia',
    commonsSearch: 'Włodkowica 6 Wrocław'
  },
  {
    file: 'monastery-guesthouse.jpg',
    hotel: 'Hotel im. Jana Pawła II',
    commonsSearch: 'Hotel im. Jana Pawła II Wrocław'
  },
  {
    file: 'korona-hotel.jpg',
    hotel: 'Hotel Korona Wrocław',
    commonsSearch: 'Kochanowskiego Wrocław'
  }
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TechTrekWayfinder/1.0 (contact@techtrek.org)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

function downloadImage(imageUrl, destPath) {
  return new Promise((resolve, reject) => {
    function get(url, redirects = 0) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TechTrekWayfinder/1.0 (contact@techtrek.org)'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
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
    get(imageUrl);
  });
}

async function getImageUrlForWikiPage(pageTitle) {
  const url = `https://pl.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&pithumbsize=1200&format=json`;
  const json = await fetchJson(url);
  if (json.query && json.query.pages) {
    const page = Object.values(json.query.pages)[0];
    if (page && page.thumbnail && page.thumbnail.source) {
      return page.thumbnail.source;
    }
  }
  return null;
}

async function getImageUrlFromCommonsSearch(searchTerm) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchTerm)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json`;
  const json = await fetchJson(url);
  if (json.query && json.query.pages) {
    const pages = Object.values(json.query.pages);
    for (const page of pages) {
      if (page.imageinfo && page.imageinfo[0]) {
        const info = page.imageinfo[0];
        const imgUrl = info.thumburl || info.url;
        if (imgUrl && (imgUrl.includes('.jpg') || imgUrl.includes('.jpeg') || imgUrl.includes('.png'))) {
          return imgUrl;
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log('Fetching Authentic Building Photos for Wroclaw Hotels...\n');
  
  for (const item of hotelTargets) {
    console.log(`[TARGET] ${item.hotel} -> ${item.file}`);
    let imgUrl = null;
    
    if (item.wikiPage) {
      try {
        imgUrl = await getImageUrlForWikiPage(item.wikiPage);
        if (imgUrl) {
          console.log(`  Found Wikipedia main photo: ${imgUrl}`);
        }
      } catch (e) {}
    }
    
    if (!imgUrl && item.commonsSearch) {
      try {
        imgUrl = await getImageUrlFromCommonsSearch(item.commonsSearch);
        if (imgUrl) {
          console.log(`  Found Wikimedia Commons photo: ${imgUrl}`);
        }
      } catch (e) {}
    }
    
    if (imgUrl) {
      const destPath = path.join(targetDir, item.file);
      try {
        await downloadImage(imgUrl, destPath);
        const stats = fs.statSync(destPath);
        console.log(`  [SUCCESS] Saved authentic photo (${stats.size} bytes)\n`);
      } catch (err) {
        console.error(`  [ERROR] Download failed: ${err.message}\n`);
      }
    } else {
      console.log(`  [WARN] Could not find specific photo via API\n`);
    }
  }
}

main();
