const https = require('https');

const API_KEY = 'AIzaSyBy3BaDrkgHg2Cvst3XcUmQ96YBHCjFA38';

function testPlacesNew() {
  const postData = JSON.stringify({
    textQuery: "Morskie Oko Krakow"
  });

  const options = {
    hostname: 'places.googleapis.com',
    path: '/v1/places:searchText',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.photos',
      'Referer': 'https://techtrekgt.com/'
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Places API (New) Response:');
      console.log('Status:', res.statusCode);
      console.log('Body:', data);
    });
  });

  req.on('error', (e) => console.error(e));
  req.write(postData);
  req.end();
}

testPlacesNew();
