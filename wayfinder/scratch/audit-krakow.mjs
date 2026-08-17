import fs from 'fs';
import path from 'path';
import https from 'https';

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

async function fetchGoogleMaps(query) {
    return new Promise((resolve, reject) => {
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${API_KEY}`;
        https.get(url, (res) => {
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

async function pingUrl(url) {
    if (!url) return { ok: false, error: 'No URL' };
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode });
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, error: 'Timeout' });
        });
        req.end();
    });
}

function checkImage(imgSrc, localBase) {
    if (!imgSrc) return false;
    const relPath = imgSrc.replace('/wayfinder/Poland-2026/images/', '');
    const fullPath = path.join(localBase, relPath);
    return fs.existsSync(fullPath);
}

async function run() {
    const { polandJourney } = await import('file:///' + path.resolve('../src/data/poland-2026.js').replace(/\\/g, '/'));
    const krakow = polandJourney.route.find(r => r.id === 'krakow');
    const localImageBase = path.resolve('../public/Poland-2026/images');
    
    let report = [];
    
    // Check Must See
    for (const place of krakow.mustSee || []) {
        // Maps
        const mapsData = await fetchGoogleMaps(place.name + ' Krakow');
        let status = 'UNKNOWN';
        if (mapsData.results && mapsData.results.length > 0) {
            status = mapsData.results[0].business_status || 'UNKNOWN';
        }
        
        // URL
        let urlOk = true;
        if (place.websiteUrl) {
            const urlResult = await pingUrl(place.websiteUrl);
            urlOk = urlResult.ok;
            if (!urlOk) report.push(`[MustSee URL Broken] ${place.name}: ${place.websiteUrl} (${urlResult.status || urlResult.error})`);
        }
        
        // Image
        if (!checkImage(place.imageSrc, localImageBase)) {
            report.push(`[Image Missing] ${place.name}: ${place.imageSrc}`);
        }
        
        if (status !== 'OPERATIONAL' && status !== 'UNKNOWN') {
            report.push(`[Status] ${place.name} is ${status}`);
        }
    }
    
    // Check Restaurants (Detailed)
    for (const place of krakow.krakowRestaurantsDetailed || []) {
        const mapsData = await fetchGoogleMaps(place.name + ' Krakow');
        let status = 'UNKNOWN';
        if (mapsData.results && mapsData.results.length > 0) {
            status = mapsData.results[0].business_status || 'UNKNOWN';
        }
        
        // URL
        let urlOk = true;
        if (place.websiteUrl) {
            const urlResult = await pingUrl(place.websiteUrl);
            urlOk = urlResult.ok;
            if (!urlOk) report.push(`[Restaurant URL Broken] ${place.name}: ${place.websiteUrl} (${urlResult.status || urlResult.error})`);
        }
        
        // Image
        if (!checkImage(place.imageSrc, localImageBase)) {
            report.push(`[Image Missing] ${place.name}: ${place.imageSrc}`);
        }
        
        if (status !== 'OPERATIONAL') {
            report.push(`[Status] ${place.name} is ${status}`);
        }
    }

    console.log(JSON.stringify(report, null, 2));
    
    // output remediation file (just a stub to create the file as requested)
    fs.writeFileSync('krakow-remediation-data.json', JSON.stringify({ message: "Will be populated with corrected data" }));
}

run().catch(console.error);
