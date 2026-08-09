const fs = require('fs');
const https = require('https');
const path = require('path');

const dataFile = path.join(__dirname, 'src', 'data', 'poland-2026.js');
const imgDir = path.join(__dirname, 'public', 'images', 'hotels');

if (!fs.existsSync(imgDir)) {
  fs.mkdirSync(imgDir, { recursive: true });
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
        console.log(`Already exists: ${dest}`);
        return resolve(); // Skip if already exists
    }
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects if needed, but for unsplash we might not need to.
        // Actually, unsplash might redirect. Let's be safe.
        https.get(response.headers.location, redirectResp => {
            redirectResp.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', err => {
            fs.unlink(dest, () => reject(err));
        });
      } else {
        file.close();
        fs.unlink(dest, () => reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', err => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function processData() {
  const content = fs.readFileSync(dataFile, 'utf-8');
  const lines = content.split('\n');
  
  let currentId = null;
  const downloadPromises = [];
  
  const newLines = lines.map(line => {
    const idMatch = line.match(/id:\s*['"]([^'"]+)['"]/);
    if (idMatch) {
      currentId = idMatch[1];
    }
    
    const imgMatch = line.match(/imageSrc:\s*['"](http[^'"]+)['"]/);
    if (imgMatch && currentId) {
      const url = imgMatch[1];
      const filename = `${currentId}.jpg`;
      const destPath = path.join(imgDir, filename);
      
      console.log(`Found image for ${currentId}: ${url}`);
      downloadPromises.push(downloadImage(url, destPath));
      
      return line.replace(url, `/images/hotels/${filename}`);
    }
    return line;
  });
  
  console.log(`Downloading ${downloadPromises.length} images...`);
  await Promise.all(downloadPromises);
  console.log('All images downloaded successfully.');
  
  fs.writeFileSync(dataFile, newLines.join('\n'), 'utf-8');
  console.log('Data file updated.');
}

processData().catch(console.error);
