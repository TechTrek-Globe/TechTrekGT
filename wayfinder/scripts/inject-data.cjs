const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, '..', 'src', 'data', 'poland-2026.js');
const verified = JSON.parse(fs.readFileSync(path.join(__dirname, 'verified-data.json'), 'utf-8'));

// Read existing poland-2026.js
let polandContent = fs.readFileSync(dataFilePath, 'utf-8');

// Poznań metadata
const poznanQuickReference = {
  dates: 'Nov 21, 2026 - Jan 6, 2027',
  daylight: 'Sunrise ~7:45 AM | Sunset ~3:40 PM (~8 hrs daylight)',
  peakHours: '5:00 PM - 8:00 PM (Ferris wheel illuminations & stage shows)',
  kaucja: '30 PLN (~$8.00 USD) deposit per mug (EXACT CASH REQUIRED)'
};

const poznanHolidayClosures = {
  dec24: 'Market closes early at ~2:00 PM (Wigilia family dinner).',
  dec25: 'Christmas Day: Plac Wolności market open 1:00 PM - 9:00 PM with select food stalls.',
  dec26: 'Boxing Day: Full market operations resume (11:00 AM - 9:00 PM).',
  dec31: 'New Year’s Eve: Extended evening hours through countdown celebrations.',
  jan1: 'New Year’s Day: Open 1:00 PM - 9:00 PM.'
};

const poznanKaucjaCallout = {
  deposit: '30 PLN (~$8.00 USD)',
  notes: 'Exact cash required for ceramic boot mug deposit. Full cash refund upon returning your mug to any drink chalet.'
};

const poznanCulinaryHighlights = [
  {
    name: 'Rogal Świętomarciński',
    phonetic: 'ROH-gahl shvyeh-toh-mar-CHEEN-skee',
    english: "St. Martin's Horseshoe Croissant",
    description: "Protected EU-certified horseshoe pastry filled with rich white poppy seeds, ground almonds, vanilla, sugar, and candied orange peel, glazed with sweet icing and chopped walnuts.",
    tip: "Look for bakeries displaying the official Cech Cukierników certificate of authenticity."
  },
  {
    name: 'Gzik z Pyrami',
    phonetic: 'GZEEK z PIH-rah-mee',
    english: 'Poznań Cottage Cheese w/ Jacket Potatoes',
    description: 'Greater Poland specialty of whipped curd cheese mixed with fresh sour cream, chopped chives, radishes, and flaxseed oil, served alongside steaming jacket-boiled potatoes.',
    tip: 'The ultimate comforting vegetarian winter dish of Greater Poland.'
  },
  {
    name: 'Kaczka po Poznańsku',
    phonetic: 'KACH-kah poh poz-NAHN-skoo',
    english: 'Poznań Roasted Duck w/ Apples & Pyzy',
    description: 'Crisp roasted half duck seasoned with marjoram and tart apples, served with sweet braised red cabbage and fluffy steamed yeast dumplings (pyzy).',
    tip: 'Try at Brovaria or Restauracja Bamberka on Stary Rynek.'
  },
  {
    name: 'Czernina z Kluskami',
    phonetic: 'chehr-NEE-nah z kloos-KAH-mee',
    english: 'Traditional Duck Broth Soup w/ Dried Fruits',
    description: 'Centuries-old Polish sweet-and-sour duck broth flavored with dried prunes, pears, and vinegar, served with hand-cut egg noodles.',
    tip: 'A historic culinary delicacy of Greater Poland folklore.'
  },
  {
    name: 'Szare Kluchy z Boczkiem',
    phonetic: 'SHAH-reh KLOO-khih z BOCH-kyem',
    english: 'Grey Potato Dumplings w/ Crispy Pork Cracklings',
    description: 'Grated raw potato dumplings boiled until tender and tossed in sizzling lard, crispy smoked bacon cracklings, and warm fried sauerkraut.',
    tip: 'Pair with ice-cold Greater Poland craft pilsner.'
  },
  {
    name: 'Grzaniec z Wiśniówką',
    phonetic: 'GZH-ah-nyets z veesh-NYOOF-koh',
    english: 'Mulled Wine w/ Cherry Cordial Shot',
    description: 'Steaming mulled red wine infused with cinnamon bark and cloves, finished with a shot of rich Polish wild cherry liqueur.',
    tip: 'Order in the collectible Betlejem Poznańskie ceramic mug.'
  }
];

const poznanTransit = {
  airport: 'Poznań-Ławica Airport (POZ) is 7 km west of the center. Take Express Bus 159 directly to Poznań Główny central station (~20 mins, 4.00 PLN (~$1.05 USD)) or taxi/Bolt (~30-40 PLN (~$8-11 USD)).',
  cityTransit: 'Operated by ZTM Poznań. Single 15-min tickets cost 4.00 PLN (~$1.05 USD); 24-hr passes cost 15.00 PLN (~$4.00 USD). Purchase via contactless card on board or through the Jakdojade app. Trams 2, 5, 9, 13, and 16 connect Central Station directly with Plac Wolności and Stary Rynek.',
  station: 'Poznań Główny is integrated with the Avenida shopping mall. Walk 15 mins northeast to Stary Rynek, or catch Tram 5 or 9 for a quick 5-min transit.'
};

const poznanPractical = {
  weather: 'December in Poznań averages 0°C to 4°C (32°F–39°F) with brisk westerly winds. Pack thermal underlayers, a windproof winter coat, warm gloves, a fleece beanie, and comfortable waterproof walking shoes for historic cobblestones.',
  currency: 'Poland uses the Polish Złoty (PLN). Contactless card/mobile payments are accepted at ~95% of market stalls, but keep 30–50 PLN (~$8.00–$13.35 USD) cash for ceramic mug deposits and small souvenir chalets.',
  restrooms: 'Public WCs are located beneath Stary Rynek near the Town Hall, at Plac Wolności underground lot, and inside the Stary Browar and Avenida shopping centers (2–4 PLN (~$0.50–$1.05 USD)).'
};

// Toruń metadata
const torunQuickReference = {
  dates: 'Nov 21, 2026 - Dec 21, 2026',
  daylight: 'Sunrise ~7:45 AM | Sunset ~3:35 PM (~7.8 hrs daylight)',
  peakHours: '4:30 PM - 7:30 PM (Gothic Town Hall illumination & gingerbread aromas)',
  kaucja: '30 PLN (~$8.00 USD) deposit per mug (EXACT CASH REQUIRED)'
};

const torunHolidayClosures = {
  dec24: 'Market closed. Day stop itinerary recommends visiting earlier in December prior to holiday shutdown.',
  dec25: 'Christmas Day: All museums, tourist facilities, and gingerbread workshops CLOSED.',
  dec26: 'Boxing Day: Limited afternoon café operations.'
};

const torunKaucjaCallout = {
  deposit: '30 PLN (~$8.00 USD)',
  notes: 'Exact cash required for commemorative Toruń ceramic mug deposit. Full cash refund upon returning your mug to any market drink chalet.'
};

const torunCulinaryHighlights = [
  {
    name: 'Toruńskie Pierniki',
    phonetic: 'toh-ROON-skyeh pyehr-NEE-kee',
    english: 'Traditional Toruń Gingerbread',
    description: 'Centuries-old recipe of dark spiced honey dough baked in hand-carved wooden molds, filled with wild plum or rose petal jam and glazed with dark chocolate or sugar icing.',
    tip: 'Buy fresh Katarzynki from the official Kopernik factory shop or Żywe Muzeum Piernika.'
  },
  {
    name: 'Grzany Miód Toruński',
    phonetic: 'GZH-ah-ny MYOOD toh-ROON-skee',
    english: 'Hot Spiced Toruń Honey Mead',
    description: 'Regional fermented honey wine spiced with cloves, nutmeg, star anise, and lemon peel, served steaming hot in stone mugs.',
    tip: 'Sample Trójniak or Dwójniak grades for rich floral honey sweetness.'
  },
  {
    name: 'Gęsina po Toruńsku',
    phonetic: 'gen-SHEE-nah poh toh-ROON-skoo',
    english: 'Kuyavian Roast Goose with Apples & Marjoram',
    description: 'Succulent slow-roasted local Kuyavian goose seasoned with wild marjoram, served with tart baked apples, red cabbage, and roasted potatoes.',
    tip: 'St. Martin’s Day and winter tradition across Kuyavia (Kujawy-Pomorze).'
  },
  {
    name: 'Piernikowe Piwo Ciemne',
    phonetic: 'pyehr-nee-KOH-veh PEE-voh CHEHM-neh',
    english: 'Dark Spiced Gingerbread Craft Beer',
    description: 'Rich dark lager brewed with roasted malts, regional honey, ginger, and aromatic Christmas spices.',
    tip: 'Enjoy on tap at Jan Olbracht Browar Staromiejski.'
  },
  {
    name: 'Piecuchy Toruńskie',
    phonetic: 'pyeh-TSOO-khee toh-ROON-skyeh',
    english: 'Oven-Baked Crusty Meat & Herb Dumplings',
    description: 'Large, golden wood-oven baked yeast dough dumplings stuffed with slow-cooked seasoned beef, mushrooms, or smoked cheese, served with garlic-herb dip.',
    tip: 'Specialty of Pierogarnia Stary Toruń on Mostowa street.'
  },
  {
    name: 'Zupa Grzybowa w Chlebku',
    phonetic: 'ZOO-pah gzhy-BOH-vah v KHLEP-koo',
    english: 'Wild Forest Mushroom Soup in Bread Bowl',
    description: 'Creamy soup made with dried Boletus mushrooms foraged from northern Polish pine forests, served in a crusty sourdough bread cauldron.',
    tip: 'Perfect warming lunch at Karczma Spichrz.'
  }
];

const torunTransit = {
  airport: 'Nearest international airports are Bydgoszcz (BZG, 50 km) or Gdańsk (GDN, 170 km). Direct PKP InterCity trains connect Toruń Główny directly with Poznań (1h 20m) and Gdańsk (1h 35m).',
  cityTransit: 'Operated by MZK Toruń. Single tickets cost 3.80 PLN (~$1.00 USD). Purchase on board using contactless card tap or via the Jakdojade app. Bus lines 22 and 27 connect Toruń Główny railway station directly to the Old Town (Plac Rapackiego / Aleja Solidarności) in 7 minutes.',
  station: 'Toruń Główny station is located south of the Vistula River. Use the luggage storage lockers at the station or take Bus 22 across the bridge to Plac Rapackiego (5-min ride) to enter the medieval pedestrian core.'
};

const torunPractical = {
  weather: 'December in Toruń averages -1°C to 4°C (30°F–39°F) with brisk river winds off the Vistula. Warm layers, wind-resistant outer shell, gloves, a hat, and rugged waterproof walking footwear are essential for red-brick cobblestones.',
  currency: 'Poland uses the Polish Złoty (PLN). Cards and contactless mobile pay are widely accepted, but retain 30–50 PLN (~$8.00–$13.35 USD) in cash for ceramic mug deposits and small craft bakery stalls.',
  restrooms: 'Public WCs are available in the Town Hall (Ratusz Staromiejski) basement, at Bulwar Filadelfijski riverfront, and inside the Toruń Plaza and Copernicus shopping arcades (2–4 PLN (~$0.50–$1.05 USD)).'
};

// Gdańsk metadata
const gdanskQuickReference = {
  dates: 'Nov 20, 2026 - Dec 23, 2026',
  daylight: 'Sunrise ~7:55 AM | Sunset ~3:25 PM (~7.5 hrs daylight)',
  peakHours: '4:30 PM - 7:30 PM (Lucek the Moose speeches & illuminated carousel)',
  kaucja: '30 PLN (~$8.00 USD) deposit per mug (EXACT CASH REQUIRED)'
};

const gdanskHolidayClosures = {
  dec24: 'Christmas Eve (Wigilia): Christmas market completely CLOSED. Public transit operates on reduced holiday schedule after 4:00 PM.',
  dec25: 'Christmas Day: Christmas market CLOSED. Museums, Amber Museum, and historic monuments closed.',
  dec26: 'Boxing Day: Limited select restaurants and cafés open along Długi Targ and Granary Island.'
};

const gdanskKaucjaCallout = {
  deposit: '30 PLN (~$8.00 USD)',
  notes: 'Exact cash required for ceramic boot mug deposit. Full cash refund upon returning your mug to any market drink chalet.'
};

const gdanskCulinaryHighlights = [
  {
    name: 'Danziger Goldwasser',
    phonetic: 'DAHN-tsih-ger GOLD-vah-ser',
    english: 'Gdańsk Goldwasser Herbal Liqueur',
    description: 'Historic 16th-century herbal liqueur infused with over twenty aromatic roots and spices, containing floating flakes of genuine 22-karat gold leaf.',
    tip: 'Sip neat as a digestive or warm in a festive winter hot cocktail at Gdański Bowke.'
  },
  {
    name: 'Dorsz po Kaszubsku',
    phonetic: 'DORSH poh kah-SHOOP-skoo',
    english: 'Baltic Cod in Kashubian Tomato-Vegetable Sauce',
    description: 'Tender fresh Baltic cod fillet braised with sweet caramelized onions, root vegetables, tomato purée, allspice, and bay leaves.',
    tip: 'Authentic maritime specialty at Restauracja Kubicki.'
  },
  {
    name: 'Grzaniec Gdański z Imbirem',
    phonetic: 'GZH-ah-nyets GDAHN-skee z EEM-bee-rem',
    english: 'Gdańsk Spiced Mulled Wine w/ Ginger & Orange',
    description: 'Hot spiced red wine infused with fresh ginger root, cloves, orange peel, and Baltic sea buckthorn honey.',
    tip: 'Served in the collectible annual Gdańsk Christmas Market boot mug.'
  },
  {
    name: 'Śledź w Śmietanie po Kaszubsku',
    phonetic: 'SHLEDZH v shmyeh-TAH-nyeh poh kah-SHOOP-skoo',
    english: 'Kashubian Pickled Baltic Herring in Sour Cream',
    description: 'Plump Baltic herring fillets marinated with tart green apples, mild onions, pickled gherkins, and thick farmer’s sour cream, served with crusty sourdough bread.',
    tip: 'Classic cold starter paired with ice-cold Polish vodka.'
  },
  {
    name: 'Pierogi z Kaczką i Żurawiną',
    phonetic: 'pyeh-ROH-gee z KACH-koh ee zhoo-rah-VEE-noh',
    english: 'Pan-Fried Duck & Cranberry Dumplings',
    description: 'Delicate hand-crimped dumplings stuffed with slow-braised duck meat, pan-fried in butter and topped with warm tart cranberry jam.',
    tip: 'Must-order signature dish at Pierogarnia Mandu.'
  },
  {
    name: 'Wiśniówka na Gorąco',
    phonetic: 'veesh-NYOOF-kah nah goh-RON-tsoh',
    english: 'Hot Spiced Wild Cherry Liqueur',
    description: 'Rich artisanal Polish wild cherry liqueur served steaming hot in crystal stemware with whole macerated sour cherries.',
    tip: 'Order at Wiśniewski on historic Piwna street.'
  }
];

const gdanskTransit = {
  airport: 'Gdańsk Lech Wałęsa Airport (GDN) is 12 km west of the center. Take the direct PKM train to Gdańsk Wrzeszcz / Gdańsk Główny (~25 mins, 5.40 PLN (~$1.45 USD)) or Bus 210 directly to Gdańsk Główny station (~40 mins, 4.80 PLN (~$1.28 USD)). Taxi/Bolt is ~45–65 PLN (~$12–17 USD).',
  cityTransit: 'Operated by ZTM Gdańsk. Single tickets cost 4.80 PLN (~$1.28 USD); 24-hr passes cost 18.00 PLN (~$4.80 USD). Purchase via contactless card on board or through the Jakdojade app. Trams 2, 3, 6, and 8 connect Gdańsk Główny directly with Główne Miasto (Brama Wyżynna) and the Motława waterfront.',
  station: 'Gdańsk Główny is the newly renovated 1900 brick Dutch Renaissance central station. It is a level 8-minute walk to Targ Węglowy (Christmas Market) and the Golden Gate entry to the Royal Way (Ulica Długa).'
};

const gdanskPractical = {
  weather: 'December in Gdańsk averages 0°C to 5°C (32°F–41°F) with strong damp maritime breezes off the Baltic Sea and Gulf of Gdańsk. Windchill can make temperatures feel below freezing. Waterproof insulated winter boots, windproof coat, fleece layers, thermal gloves, and a beanie are strongly advised.',
  currency: 'Poland uses the Polish Złoty (PLN). Contactless card/mobile payments are universally accepted at ~95% of stalls, but exact cash (30 PLN (~$8.00 USD)) is required for market mug deposits (Kaucja). Always choose \"Pay in PLN\" on card terminals to avoid dynamic currency conversion fees.',
  restrooms: 'Public WCs are located at Targ Węglowy (near Prison Tower), underneath Długi Targ near Green Gate, at the Great Mill (Amber Museum), and inside Forum Gdańsk shopping center (2–4 PLN (~$0.50–$1.05 USD)).'
};

// Build the updated JS object strings
function toJsCode(val, indent = 6) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const items = val.map(item => toJsCode(item, indent + 2)).join(',\n');
    return `[\n${items}\n${pad}]`;
  }
  if (typeof val === 'object' && val !== null) {
    const keys = Object.keys(val);
    if (keys.length === 0) return '{}';
    const entries = keys.map(k => {
      const v = val[k];
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return `${' '.repeat(indent + 2)}${safeKey}: ${toJsCode(v, indent + 2)}`;
    }).join(',\n');
    return `{\n${entries}\n${pad}}`;
  }
  if (typeof val === 'string') {
    return JSON.stringify(val);
  }
  return String(val);
}

// Format each city's data additions
const poznanData = {
  quickReference: poznanQuickReference,
  holidayClosures: poznanHolidayClosures,
  kaucjaCallout: poznanKaucjaCallout,
  culinaryHighlights: poznanCulinaryHighlights,
  transit: poznanTransit,
  practical: poznanPractical,
  markets: verified.poznan.markets,
  mustSee: verified.poznan.mustSee,
  restaurants: verified.poznan.restaurants,
  poznanRestaurantsDetailed: verified.poznan.restaurantsDetailed,
  restaurantsDetailed: verified.poznan.restaurantsDetailed
};

const torunData = {
  foodTargets: ['Karczma Spichrz', 'Restauracja Manekin', 'Restauracja Pod Aniołem', 'Pierogarnia Stary Toruń', 'Jan Olbracht Browar'],
  quickReference: torunQuickReference,
  holidayClosures: torunHolidayClosures,
  kaucjaCallout: torunKaucjaCallout,
  culinaryHighlights: torunCulinaryHighlights,
  transit: torunTransit,
  practical: torunPractical,
  markets: verified.torun.markets,
  mustSee: verified.torun.mustSee,
  restaurants: verified.torun.restaurants,
  torunRestaurantsDetailed: verified.torun.restaurantsDetailed,
  restaurantsDetailed: verified.torun.restaurantsDetailed
};

const gdanskData = {
  quickReference: gdanskQuickReference,
  holidayClosures: gdanskHolidayClosures,
  kaucjaCallout: gdanskKaucjaCallout,
  culinaryHighlights: gdanskCulinaryHighlights,
  transit: gdanskTransit,
  practical: gdanskPractical,
  markets: verified.gdansk.markets,
  mustSee: verified.gdansk.mustSee,
  restaurants: verified.gdansk.restaurants,
  gdanskRestaurantsDetailed: verified.gdansk.restaurantsDetailed,
  restaurantsDetailed: verified.gdansk.restaurantsDetailed
};

console.log('Generated objects successfully.');
module.exports = {
  poznanData,
  torunData,
  gdanskData,
  toJsCode
};
