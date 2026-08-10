const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.join(__dirname, '..', 'public', 'Poland-2026', 'images', 'wroclaw', 'hotels');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const images = [
  {
    name: 'the-bridge.jpg',
    url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    hotel: 'The Bridge Wrocław MGallery'
  },
  {
    name: 'monopol.jpg',
    url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Hotel Monopol Wrocław'
  },
  {
    name: 'radisson-blu.jpg',
    url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Radisson Blu Hotel Wrocław'
  },
  {
    name: 'ac-hotel.jpg',
    url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
    hotel: 'AC Hotel by Marriott Wrocław'
  },
  {
    name: 'art-hotel.jpg',
    url: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Art Hotel Wrocław'
  },
  {
    name: 'puro-wroclaw.jpg',
    url: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=80',
    hotel: 'PURO Wrocław Stare Miasto'
  },
  {
    name: 'bb-hotel.jpg',
    url: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80',
    hotel: 'B&B Hotel Wrocław Centrum'
  },
  {
    name: 'mercure.jpg',
    url: 'https://images.unsplash.com/photo-1568495248636-6432b97bd949?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Mercure Wrocław Centrum'
  },
  {
    name: 'doubletree.jpg',
    url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
    hotel: 'DoubleTree by Hilton Wrocław'
  },
  {
    name: 'ibis-styles.jpg',
    url: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=1200&q=80',
    hotel: 'ibis Styles Wrocław Centrum'
  },
  {
    name: 'hostel-mleczarnia.jpg',
    url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Hostel Mleczarnia'
  },
  {
    name: 'water-tower.jpg',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    hotel: 'The Water Tower Apartment (Wieża Ciśnień)'
  },
  {
    name: 'monastery-guesthouse.jpg',
    url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Hotel im. Jana Pawła II'
  },
  {
    name: 'korona-hotel.jpg',
    url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80',
    hotel: 'Hotel Korona Wrocław'
  }
];

function downloadImage(imgObj) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(targetDir, imgObj.name);
    
    function fetchUrl(url, redirects = 0) {
      if (redirects > 5) {
        return reject(new Error(`Too many redirects for ${imgObj.name}`));
      }
      
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return fetchUrl(response.headers.location, redirects + 1);
        }
        
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download ${imgObj.name}: Status code ${response.statusCode}`));
        }
        
        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close(() => {
            const stats = fs.statSync(filePath);
            console.log(`[SUCCESS] Downloaded ${imgObj.name} (${stats.size} bytes) for ${imgObj.hotel}`);
            resolve({ name: imgObj.name, size: stats.size, hotel: imgObj.hotel });
          });
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    }
    
    fetchUrl(imgObj.url);
  });
}

async function main() {
  console.log(`Downloading ${images.length} Wroclaw hotel images into: ${targetDir}`);
  const results = [];
  for (const img of images) {
    try {
      const res = await downloadImage(img);
      results.push(res);
    } catch (err) {
      console.error(`[ERROR] ${img.name}:`, err.message);
    }
  }
  console.log(`Completed downloading ${results.length}/${images.length} images.`);
}

main();
