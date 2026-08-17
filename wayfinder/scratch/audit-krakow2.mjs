import fs from 'fs';
import path from 'path';
import https from 'https';

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

function fetchGoogleMaps(query) {
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

function pingUrl(url) {
    if (!url) return Promise.resolve({ ok: false, error: 'No URL' });
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
    const relPath = imgSrc.replace('/wayfinder/Poland-2026/images/krakow/', '');
    const fullPath = path.join(localBase, relPath);
    return fs.existsSync(fullPath);
}

async function run() {
    console.log("Starting audit script...");
    const content = fs.readFileSync(path.resolve('../src/data/poland-2026.js'), 'utf8');
    // Extract polandJourney object
    let parsedContent = content.replace('export const polandJourney = ', 'global.polandJourney = ');
    // We only need global.polandJourney to be set
    try {
        eval(parsedContent);
    } catch (e) {
        console.error("Error evaluating poland-2026.js:", e.message);
        return;
    }
    
    const polandJourney = global.polandJourney;
    const krakow = polandJourney.route.find(r => r.id === 'krakow');
    const localImageBase = path.resolve('../public/Poland-2026/images/krakow');
    
    let report = [];
    
    const places = [
        ...(krakow.mustSee || []).map(p => ({...p, cat: 'mustSee'})),
        ...(krakow.krakowRestaurantsDetailed || []).map(p => ({...p, cat: 'food'})),
        ...(krakow.krakowDrinksDetailed || []).map(p => ({...p, cat: 'food'}))
    ];

    console.log(`Checking ${places.length} places...`);
    
    for (const place of places) {
        const mapsData = await fetchGoogleMaps(place.name + ' Krakow');
        let status = 'UNKNOWN';
        if (mapsData.results && mapsData.results.length > 0) {
            status = mapsData.results[0].business_status || 'UNKNOWN';
        }
        
        let urlOk = true;
        if (place.websiteUrl) {
            const urlResult = await pingUrl(place.websiteUrl);
            urlOk = urlResult.ok;
            if (!urlOk) report.push(`[URL Broken] ${place.name}: ${place.websiteUrl} (${urlResult.status || urlResult.error})`);
        }
        
        if (!checkImage(place.imageSrc, localImageBase)) {
            report.push(`[Image Missing] ${place.name}: ${place.imageSrc}`);
        }
        
        if (status !== 'OPERATIONAL' && status !== 'UNKNOWN') {
            report.push(`[Status] ${place.name} is ${status}`);
        }
    }

    console.log(JSON.stringify(report, null, 2));
    
    fs.writeFileSync('krakow-remediation-data.json', JSON.stringify({ status: "done", report }, null, 2));
    console.log("krakow-remediation-data.json created.");
}

run().catch(console.error);
