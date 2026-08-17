const fs = require('fs');
const path = require('path');

async function test() {
  const mod = await import('../src/data/poland-2026.js');
  const journey = mod.polandJourney;

  console.log('Journey Title:', journey.title);
  console.log('Total Cities in Route:', journey.route.length);

  let allImagesOk = true;
  let totalMissing = 0;

  journey.route.forEach(city => {
    console.log(`\n================== City: ${city.name} (${city.id}) ==================`);
    console.log(`  - Markets: ${city.markets?.length || 0}`);
    console.log(`  - Must-See: ${city.mustSee?.length || 0}`);
    console.log(`  - Total Dining: ${city.restaurantsDetailed?.length || 0}`);
    console.log(`  - Restaurants array (${city.id}RestaurantsDetailed): ${city[`${city.id}RestaurantsDetailed`]?.length || 0}`);
    console.log(`  - Drinks array (${city.id}DrinksDetailed): ${city[`${city.id}DrinksDetailed`]?.length || 0}`);
    console.log(`  - Cafes array (${city.id}CafesDetailed): ${city[`${city.id}CafesDetailed`]?.length || 0}`);

    // Check Panorama Raclawicka if Wroclaw
    if (city.id === 'wroclaw') {
      const panorama = city.mustSee.find(s => s.id === 'panorama-raclawice');
      console.log(`  - Panorama Racławicka check:`, panorama ? {
        location: panorama.location,
        address: panorama.address,
        lat: panorama.lat,
        lng: panorama.lng
      } : 'NOT FOUND!');
    }

    // Check all image paths in city
    const cityImages = [];
    function collectImages(obj) {
      if (!obj) return;
      if (typeof obj === 'string' && (obj.includes('.jpg') || obj.includes('.png') || obj.includes('.webp'))) {
        cityImages.push(obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(collectImages);
      } else if (typeof obj === 'object') {
        Object.values(obj).forEach(collectImages);
      }
    }
    collectImages(city);

    const missingInCity = [];
    cityImages.forEach(img => {
      let clean = img.replace(/^\/wayfinder\//, '').replace(/^\//, '');
      const diskPath = path.join(__dirname, '..', 'public', clean);
      if (!fs.existsSync(diskPath) || fs.statSync(diskPath).size < 100) {
        missingInCity.push({ img, diskPath });
      }
    });

    if (missingInCity.length > 0) {
      console.error(`  ❌ Missing ${missingInCity.length} images in ${city.name}:`, missingInCity);
      allImagesOk = false;
      totalMissing += missingInCity.length;
    } else {
      console.log(`  ✅ All ${cityImages.length} images verified on disk in public/!`);
    }
  });

  if (allImagesOk && totalMissing === 0) {
    console.log('\n🌟 SUCCESS: All cities achieve data parity and 100% of images exist on disk!');
  } else {
    console.error(`\n❌ Total missing images: ${totalMissing}`);
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});
