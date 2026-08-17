const https = require('https');

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function testApiKey() {
  console.log('Testing Google Places API Key with query: "Morskie Oko Krakow"...');
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent('Morskie Oko Krakow')}&key=${API_KEY}`;
  
  const searchRes = await get(searchUrl);
  console.log('Search Status Code:', searchRes.statusCode);
  console.log('Search Response Status:', searchRes.body ? searchRes.body.status : 'No JSON body');
  
  if (searchRes.body) {
    if (searchRes.body.error_message) {
      console.log('Error Message:', searchRes.body.error_message);
    }
    if (searchRes.body.results && searchRes.body.results.length > 0) {
      const place = searchRes.body.results[0];
      console.log('Found Place:', {
        name: place.name,
        formatted_address: place.formatted_address,
        business_status: place.business_status,
        place_id: place.place_id,
        rating: place.rating,
        user_ratings_total: place.user_ratings_total,
        photos_count: place.photos ? place.photos.length : 0
      });

      if (place.photos && place.photos.length > 0) {
        const photoRef = place.photos[0].photo_reference;
        console.log('Testing photo download with photo_reference:', photoRef.slice(0, 30) + '...');
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${API_KEY}`;
        
        // Test photo endpoint redirect/fetch
        https.get(photoUrl, (photoRes) => {
          console.log('Photo request status code:', photoRes.statusCode);
          console.log('Photo location header:', photoRes.headers.location ? photoRes.headers.location.slice(0, 60) + '...' : 'None');
        });
      }
    } else {
      console.log('No results found. Full response:', JSON.stringify(searchRes.body, null, 2));
    }
  }
}

testApiKey().catch(console.error);
