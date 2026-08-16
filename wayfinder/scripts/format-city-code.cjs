const fs = require('fs');
const path = require('path');

const verified = JSON.parse(fs.readFileSync(path.join(__dirname, 'verified-data.json'), 'utf-8'));

function formatObj(obj, indent = '      ') {
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : indent + line))
    .join('\n');
}

// Generate code for Poznań
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

console.log('Poznan code templates prepared.');
