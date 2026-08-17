const fs = require('fs');
const path = require('path');

const devVarsPath = path.join(__dirname, '..', '.dev.vars');
const varsContent = fs.readFileSync(devVarsPath, 'utf-8');
const geoMatch = varsContent.match(/GEOAPIFY_API_KEY=([^\r\n]+)/);
const GEOAPIFY_KEY = geoMatch ? geoMatch[1].trim() : '';

async function geocode(text) {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&limit=1&apiKey=${GEOAPIFY_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    const p = data.features[0].properties;
    return {
      formatted: p.formatted,
      lat: p.lat,
      lng: p.lon,
      street: p.street,
      housenumber: p.housenumber,
      postcode: p.postcode,
      city: p.city
    };
  }
  return null;
}

const POIS_TO_CHECK = [
  // Wroclaw
  { city: 'Wrocław', name: 'Panorama of Racławice', query: 'ul. Jana Ewangelisty Purkyniego 11, 50-155 Wrocław' },
  
  // Poznan Markets
  { city: 'Poznań', name: 'Plac Wolności Christmas Market', query: 'Plac Wolności, 61-738 Poznań, Poland' },
  { city: 'Poznań', name: 'Stary Rynek Christmas Market', query: 'Stary Rynek, 61-772 Poznań, Poland' },
  { city: 'Poznań', name: 'MTP Winter Fair', query: 'Międzynarodowe Targi Poznańskie, Głogowska 14, 60-734 Poznań, Poland' },

  // Poznan Attractions
  { city: 'Poznań', name: 'Poznań Town Hall & Goats', query: 'Stary Rynek 1, 61-772 Poznań, Poland' },
  { city: 'Poznań', name: 'Ostrów Tumski & Cathedral', query: 'Ostrów Tumski 17, 61-109 Poznań, Poland' },
  { city: 'Poznań', name: 'Imperial Castle (Zamek Cesarski)', query: 'Święty Marcin 80/82, 61-809 Poznań, Poland' },
  { city: 'Poznań', name: 'Croissant Museum', query: 'Klasztorna 23, 61-772 Poznań, Poland' },
  { city: 'Poznań', name: 'Park Cytadela', query: 'aleja Armii Poznań, 61-001 Poznań, Poland' },
  { city: 'Poznań', name: 'Fara Poznańska', query: 'Gołębia 1, 61-834 Poznań, Poland' },

  // Poznan Food
  { city: 'Poznań', name: 'Brovaria', query: 'Stary Rynek 73/74, 61-768 Poznań, Poland' },
  { city: 'Poznań', name: 'Bamberka', query: 'Stary Rynek 2, 61-772 Poznań, Poland' },
  { city: 'Poznań', name: 'Wiejskie Jadło', query: 'Stary Rynek 77, 61-772 Poznań, Poland' },
  { city: 'Poznań', name: 'Pierogarnia Stary Młyn Poznań', query: 'Zamkowa 7, 61-768 Poznań, Poland' },
  { city: 'Poznań', name: 'Restauracja Muga', query: 'Bolesława Krysiewicza 5, 61-825 Poznań, Poland' },
  { city: 'Poznań', name: 'Pijalnia Wódki i Piwa Poznań', query: 'Wrocławska 8, 61-838 Poznań, Poland' },
  { city: 'Poznań', name: 'Ministerstwo Browaru', query: 'Franciszka Ratajczaka 34, 61-816 Poznań, Poland' },
  { city: 'Poznań', name: 'Kawiarnia Stonewall', query: 'Garbary 67, 61-758 Poznań, Poland' },

  // Torun Markets
  { city: 'Toruń', name: 'Rynek Staromiejski Market', query: 'Rynek Staromiejski, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Rynek Nowomiejski Fair', query: 'Rynek Nowomiejski, 87-100 Toruń, Poland' },

  // Torun Attractions
  { city: 'Toruń', name: 'Old Town Hall & Copernicus', query: 'Rynek Staromiejski 1, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Living Museum of Gingerbread', query: 'Rabiańska 9, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Copernicus House', query: 'Mikołaja Kopernika 15, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Leaning Tower of Toruń', query: 'Pod Krzywą Wieżą 1, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Teutonic Castle Ruins', query: 'Przedzamcze 3, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Cathedral of SS. Johns', query: 'Żeglarska 16, 87-100 Toruń, Poland' },

  // Torun Food
  { city: 'Toruń', name: 'Karczma Spichrz', query: 'Mostowa 1, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Restauracja Manekin Toruń', query: 'Rynek Staromiejski 16, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Restauracja Pod Aniołem', query: 'Rynek Staromiejski 1, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Pierogarnia Stary Toruń', query: 'Mostowa 8, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Restauracja Szeroka No 9', query: 'Szeroka 9, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Jan Olbracht Browar Staromiejski', query: 'Szczytna 15, 87-100 Toruń, Poland' },
  { city: 'Toruń', name: 'Kawiarnia Lenkiewicz', query: 'Rynek Staromiejski 33, 87-100 Toruń, Poland' },

  // Gdansk Markets
  { city: 'Gdańsk', name: 'Targ Węglowy Christmas Market', query: 'Targ Węglowy, 80-836 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Ulica Tkacka Fair', query: 'Tkacka, 80-836 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Wyspa Spichrzów', query: 'Chmielna, 80-748 Gdańsk, Poland' },

  // Gdansk Attractions
  { city: 'Gdańsk', name: 'Long Market & Main Town Hall', query: 'Długi Targ 46/47, 80-830 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Neptune Fountain', query: 'Długi Targ, 80-830 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'St. Mary Basilica', query: 'Podkramarska 5, 80-834 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Zuraw Port Crane', query: 'Szeroka 67/68, 80-835 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Museum of WWII', query: 'Plac Władysława Bartoszewskiego 1, 80-862 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'European Solidarity Centre', query: 'Plac Solidarności 1, 80-863 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Amber Museum Great Mill', query: 'Wielkie Młyny 16, 80-849 Gdańsk, Poland' },

  // Gdansk Food
  { city: 'Gdańsk', name: 'Pierogarnia Mandu Centrum', query: 'Elżbietańska 9/10, 80-894 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Restauracja Kubicki', query: 'Wartka 5, 80-841 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Gdański Bowke', query: 'Długie Pobrzeże 11, 80-888 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Brovarnia Gdańsk', query: 'Szafarnia 9, 80-755 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Bar Mleczny Neptun', query: 'Długa 33/34, 80-827 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Restauracja Fino Gdańsk', query: 'Grząska 1, 80-833 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Wiśniewski Cherry Liqueur', query: 'Piwna 22, 80-831 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Pub Pułapka', query: 'Straganiarska 20, 80-837 Gdańsk, Poland' },
  { city: 'Gdańsk', name: 'Drukarnia Café', query: 'Mariacka 36, 80-833 Gdańsk, Poland' }
];

async function run() {
  console.log(`Geocoding ${POIS_TO_CHECK.length} POIs with Geoapify...\n`);
  for (const poi of POIS_TO_CHECK) {
    const geo = await geocode(poi.query);
    if (geo) {
      console.log(`[${poi.city}] ${poi.name}:`);
      console.log(`   Address: ${geo.formatted}`);
      console.log(`   Coords: lat: ${geo.lat}, lng: ${geo.lng}\n`);
    } else {
      console.error(`[FAIL] Could not geocode: ${poi.name} (${poi.query})`);
    }
  }
}

run().catch(console.error);
