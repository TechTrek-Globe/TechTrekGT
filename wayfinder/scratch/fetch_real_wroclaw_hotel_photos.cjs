const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.join(__dirname, '..', 'public', 'Poland-2026', 'images', 'wroclaw', 'hotels');

// List of hotels and targeted search queries for Wikimedia Commons or direct Wikimedia image URLs
const hotels = [
  {
    id: 'the-bridge',
    name: 'The Bridge Wrocław MGallery',
    file: 'the-bridge.jpg',
    queries: ['The Bridge Wroclaw', 'Plac Katedralny 8 Wroclaw', 'Ostrow Tumski Wroclaw hotel'],
    // Real image of The Bridge Wroclaw hotel at Plac Katedralny
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/The_Bridge_Wroclaw_MGallery.jpg/1200px-The_Bridge_Wroclaw_MGallery.jpg'
  },
  {
    id: 'monopol',
    name: 'Hotel Monopol Wrocław',
    file: 'monopol.jpg',
    queries: ['Hotel Monopol Wroclaw', 'Hotel Monopol we Wroclawiu'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Hotel_Monopol_Wroclaw.jpg/1200px-Hotel_Monopol_Wroclaw.jpg'
  },
  {
    id: 'radisson-blu',
    name: 'Radisson Blu Hotel Wrocław',
    file: 'radisson-blu.jpg',
    queries: ['Radisson Blu Wroclaw', 'Radisson SAS Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Radisson_Blu_Hotel_in_Wroclaw.jpg/1200px-Radisson_Blu_Hotel_in_Wroclaw.jpg'
  },
  {
    id: 'ac-hotel',
    name: 'AC Hotel by Marriott Wrocław',
    file: 'ac-hotel.jpg',
    queries: ['Plac Wolnosci 10 Wroclaw', 'AC Hotel Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Plac_Wolno%C5%9Bci_10_Wroclaw.jpg/1200px-Plac_Wolno%C5%9Bci_10_Wroclaw.jpg'
  },
  {
    id: 'art-hotel',
    name: 'Art Hotel Wrocław',
    file: 'art-hotel.jpg',
    queries: ['Art Hotel Wroclaw', 'Kielbasnicza Wroclaw hotel'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Kie%C5%82ba%C5%9Bnicza_20_Wroclaw.jpg/1200px-Kie%C5%82ba%C5%9Bnicza_20_Wroclaw.jpg'
  },
  {
    id: 'puro-wroclaw',
    name: 'PURO Wrocław Stare Miasto',
    file: 'puro-wroclaw.jpg',
    queries: ['Puro Hotel Wroclaw', 'Wlodkowica Wroclaw hotel'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/PURO_Hotel_Wroclaw.jpg/1200px-PURO_Hotel_Wroclaw.jpg'
  },
  {
    id: 'bb-hotel',
    name: 'B&B Hotel Wrocław Centrum',
    file: 'bb-hotel.jpg',
    queries: ['B&B Hotel Wroclaw', 'Piotra Skargi Wroclaw hotel'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/B%26B_Hotel_Wroclaw.jpg/1200px-B%26B_Hotel_Wroclaw.jpg'
  },
  {
    id: 'mercure',
    name: 'Mercure Wrocław Centrum',
    file: 'mercure.jpg',
    queries: ['Hotel Mercure Panorama Wroclaw', 'Mercure Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Hotel_Mercure_Wroclaw.jpg/1200px-Hotel_Mercure_Wroclaw.jpg'
  },
  {
    id: 'doubletree',
    name: 'DoubleTree by Hilton Wrocław',
    file: 'doubletree.jpg',
    queries: ['OVO Wroclaw', 'DoubleTree by Hilton Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/OVO_Wroclaw.jpg/1200px-OVO_Wroclaw.jpg'
  },
  {
    id: 'ibis-styles',
    name: 'ibis Styles Wrocław Centrum',
    file: 'ibis-styles.jpg',
    queries: ['Ibis Styles Wroclaw', 'Plac Konstytucji 3 Maja Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Ibis_Styles_Wroclaw.jpg/1200px-Ibis_Styles_Wroclaw.jpg'
  },
  {
    id: 'hostel-mleczarnia',
    name: 'Hostel Mleczarnia',
    file: 'hostel-mleczarnia.jpg',
    queries: ['Mleczarnia Wroclaw', 'Wlodkowica 6 Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/W%C5%82odkowica_6_Wroclaw.jpg/1200px-W%C5%82odkowica_6_Wroclaw.jpg'
  },
  {
    id: 'water-tower',
    name: 'The Water Tower Apartment (Wieża Ciśnień)',
    file: 'water-tower.jpg',
    queries: ['Wieza cisnien Borek Wroclaw', 'Wieza cisnien Wisniowa Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Wie%C5%BCa_ci%C5%9Bnie%C5%84_przy_al._Wi%C5%9Bniowej_we_Wroc%C5%82awiu.jpg/1200px-Wie%C5%BCa_ci%C5%9Bnie%C5%84_przy_al._Wi%C5%9Bniowej_we_Wroc%C5%82awiu.jpg'
  },
  {
    id: 'monastery-guesthouse',
    name: 'Hotel im. Jana Pawła II',
    file: 'monastery-guesthouse.jpg',
    queries: ['Hotel Jana Pawla II Wroclaw', 'Plac Katedralny 4 Wroclaw'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hotel_im._Jana_Paw%C5%82a_II_we_Wroc%C5%82awiu.jpg/1200px-Hotel_im._Jana_Paw%C5%82a_II_we_Wroc%C5%82awiu.jpg'
  },
  {
    id: 'korona-hotel',
    name: 'Hotel Korona Wrocław',
    file: 'korona-hotel.jpg',
    queries: ['Hotel Korona Wroclaw', 'Szczytnicki Wroclaw hotel'],
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Hotel_Korona_Wroclaw.jpg/1200px-Hotel_Korona_Wroclaw.jpg'
  }
];

function searchWikimedia(query) {
  return new Promise((resolve) => {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size&gsrsearch=${encodeURIComponent(query)}`;
    
    https.get(url, { headers: { 'User-Agent': 'TechTrekWayfinder/1.0 (travel@example.com)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.query && json.query.pages) {
            const pages = Object.values(json.query.pages);
            for (const page of pages) {
              if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
                const imgUrl = page.imageinfo[0].url;
                if (imgUrl.endsWith('.jpg') || imgUrl.endsWith('.jpeg') || imgUrl.endsWith('.png')) {
                  return resolve(imgUrl);
                }
              }
            }
          }
        } catch (e) {}
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    function fetchUrl(targetUrl, redirects = 0) {
      if (redirects > 5) return reject(new Error('Too many redirects'));
      
      const req = https.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Status ${res.statusCode}`));
        }
        const stream = fs.createWriteStream(destPath);
        res.pipe(stream);
        stream.on('finish', () => {
          stream.close(() => resolve(true));
        });
        stream.on('error', err => reject(err));
      });
      req.on('error', err => reject(err));
    }
    fetchUrl(url);
  });
}

async function main() {
  console.log('Searching & Downloading Authentic Real Building Photos for Wroclaw Hotels...\n');
  
  for (const h of hotels) {
    console.log(`Processing: ${h.name} (${h.file})`);
    let foundUrl = null;
    
    for (const q of h.queries) {
      foundUrl = await searchWikimedia(q);
      if (foundUrl) {
        console.log(`  -> Found Wikimedia match for "${q}": ${foundUrl}`);
        break;
      }
    }
    
    if (!foundUrl) {
      console.log(`  -> Using fallback direct URL: ${h.fallbackUrl}`);
      foundUrl = h.fallbackUrl;
    }
    
    const destPath = path.join(targetDir, h.file);
    try {
      await downloadFile(foundUrl, destPath);
      const stat = fs.statSync(destPath);
      console.log(`  [SUCCESS] Saved ${h.file} (${stat.size} bytes)\n`);
    } catch (err) {
      console.log(`  [WARN] Download failed from ${foundUrl}: ${err.message}. Retrying fallback...`);
      try {
        await downloadFile(h.fallbackUrl, destPath);
        const stat = fs.statSync(destPath);
        console.log(`  [SUCCESS] Saved fallback ${h.file} (${stat.size} bytes)\n`);
      } catch (err2) {
        console.error(`  [ERROR] Fallback also failed for ${h.file}: ${err2.message}\n`);
      }
    }
  }
}

main();
