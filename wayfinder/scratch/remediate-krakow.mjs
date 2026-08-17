import fs from 'fs';
import path from 'path';

function run() {
    console.log("Starting remediation script...");
    const content = fs.readFileSync(path.resolve('../src/data/poland-2026.js'), 'utf8');
    let parsedContent = content.replace('export const polandJourney = ', 'global.polandJourney = ');
    
    try {
        eval(parsedContent);
    } catch (e) {
        console.error("Error evaluating poland-2026.js:", e.message);
        return;
    }
    
    const krakow = global.polandJourney.route.find(r => r.id === 'krakow');

    // Fix 1: St Mary's Basilica URL
    const stMarys = krakow.mustSee.find(p => p.name.includes("St. Mary's"));
    if (stMarys) stMarys.websiteUrl = "https://bazylika-mariacka.pl/en/";

    // Fix 2: Kazimierz URL
    const kazimierz = krakow.mustSee.find(p => p.name.includes("Kazimierz (Historic Jewish Quarter)"));
    if (kazimierz) delete kazimierz.websiteUrl;

    // Fix 3: Remove PAMPAS Steakhouse (Hallucination)
    if (krakow.krakowRestaurantsDetailed) {
        krakow.krakowRestaurantsDetailed = krakow.krakowRestaurantsDetailed.filter(r => !r.name.includes("PAMPAS"));
    }
    if (krakow.restaurants) {
        krakow.restaurants = krakow.restaurants.filter(r => !r.name.includes("PAMPAS"));
    }

    // Fix 4: Muu Muu Steakhouse -> Moo Moo Steak & Wine (Hallucinated name/URL)
    const mooMoo = krakow.krakowRestaurantsDetailed.find(r => r.name.includes("Muu Muu"));
    if (mooMoo) {
        mooMoo.name = "Moo Moo Steak & Wine";
        mooMoo.websiteUrl = "https://moomoo.com.pl/";
        // Optionally update address if needed, but we'll leave it as is or fix to one of their real locations: Sienna 9
        mooMoo.address = "ul. Sienna 9 (Old Town)";
    }

    // Fix 5: Pierogarnia u Vincenta
    const vincent = krakow.krakowRestaurantsDetailed.find(r => r.name.includes("Pierogarnia u Vincenta"));
    if (vincent) {
        vincent.address = "ul. Bożego Ciała 12 (Kazimierz)";
        delete vincent.websiteUrl; 
    }

    fs.writeFileSync('krakow-remediation-data.json', JSON.stringify(krakow, null, 2));
    console.log("krakow-remediation-data.json created successfully.");
}

run();
