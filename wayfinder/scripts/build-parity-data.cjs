const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  delay,
  downloadImage,
  geocodePlace,
  searchWikimediaImage,
  searchWikipediaImage,
  BASE_IMG_DIR
} = require('./generate-city-data.cjs');

// Complete POI definitions to geocode and fetch
const POI_DEFINITIONS = {
  poznan: {
    markets: [
      {
        id: 'poznan-plac-wolnosci',
        name: 'Plac Wolności Christmas Market (Betlejem Poznańskie)',
        shortName: 'Plac Wolności',
        searchQuery: 'Plac Wolności, Poznań',
        wikiImgQuery: 'Plac Wolności w Poznaniu',
        dates: 'Nov 21, 2026 - Jan 6, 2027',
        hours: '11:00 AM - 9:00 PM daily (Open Christmas Day)',
        bestTime: '5:00 PM - 7:30 PM (Ferris wheel illuminations & stage performances)',
        specialty: "St. Martin's Croissants, artisan ceramics, and giant illuminated ferris wheel",
        details: 'The centerpiece of Betlejem Poznańskie featuring over 60 wooden stalls, an open-air ice rink, an illuminated ferris wheel, and holiday stages.',
        description: "Set on Poznań's grand public square, Betlejem Poznańskie on Plac Wolności features an illuminated 33-meter ferris wheel, authentic wooden stalls, hot mulled wine in commemorative boot mugs, and fresh Rogale Świętomarcińskie.",
        highlights: [
          '33-meter Panoramic Ferris Wheel',
          "Official St. Martin's Croissant Bakeries",
          'Open-Air Ice Skating Rink',
          'Winter Fire Pit & Wooden Chalets'
        ],
        mustTry: [
          'Rogal Świętomarciński (White Poppy Seed Croissant)',
          'Grzaniec z Wiśniówką (Mulled Wine w/ Cherry)',
          'Smażone Pierogi z Kapustą i Grzybami'
        ],
        souvenirs: [
          'Bolesławiec Style Christmas Ceramics',
          'Handmade Wooden Nutcrackers',
          'Artisan Gingerbread Hearts'
        ]
      },
      {
        id: 'poznan-stary-rynek',
        name: 'Stary Rynek Old Market Square Fair',
        shortName: 'Stary Rynek',
        searchQuery: 'Stary Rynek, Poznań',
        wikiImgQuery: 'Stary Rynek w Poznaniu',
        dates: 'Nov 21, 2026 - Dec 23, 2026',
        hours: '11:00 AM - 9:00 PM daily',
        bestTime: '11:45 AM (Daily Town Hall Goat Clashing) & 6:00 PM (Dusk glow)',
        specialty: 'Historic Renaissance backdrop & international ice sculpture displays',
        details: 'Surrounding the iconic 16th-century Renaissance Town Hall, this historic fair hosts the annual International Ice Sculpture Festival and regional Wielkopolska crafts.',
        description: 'Framed by colorful merchant houses and the Renaissance Town Hall, Stary Rynek is the cultural heart of Poznań festivities with live woodcarvers, ice sculptors, and regional folk choirs.',
        highlights: [
          'International Ice Sculpture Festival Competitions',
          'Renaissance Town Hall & Goat Clock Tower Backdrop',
          'Regional Greater Poland Smoked Meats & Cheeses',
          'Artisan Leather & Hand-Loomed Wool Chalets'
        ],
        mustTry: [
          'Gzik Wielkopolski z Pyrami (Cottage Cheese & Baked Potatoes)',
          'Kiełbasa z Kotła (Hot Cauldron Sausage)',
          'Gorący Miód Pitny (Hot Spiced Mead)'
        ],
        souvenirs: [
          'Carved Wooden Poznań Goats',
          'Hand-blown Glass Baubles (Bombki)',
          'Natural Beeswax Candles'
        ]
      },
      {
        id: 'poznan-mtp',
        name: 'Międzynarodowe Targi Poznańskie (MTP) Winter Fair',
        shortName: 'Targi MTP',
        searchQuery: 'Głogowska 14, Poznań',
        wikiImgQuery: 'Międzynarodowe Targi Poznańskie',
        dates: 'Dec 1, 2026 - Dec 22, 2026',
        hours: '12:00 PM - 8:00 PM daily',
        bestTime: '4:30 PM - 7:00 PM (Family light labyrinth & workshops)',
        specialty: 'Indoor-outdoor winter wonderland with massive light installations',
        details: 'A contemporary winter fair hosted at Poland’s premier exhibition grounds featuring illuminated light labyrinths, indoor artisan gift halls, and gourmet culinary pavilions.',
        description: 'MTP Winter Fair transforms the historic trade fair grounds with thousands of twinkling LEDs, covered winter artisan pavilions, food trucks, and interactive family activities.',
        highlights: [
          'Massive Walk-Through LED Light Labyrinth',
          'Indoor Heated Artisan Market Pavilions',
          'Gourmet Craft Food Truck Village',
          'Kids Holiday Baking & Crafts Workshops'
        ],
        mustTry: [
          'Hot Spiced Apple Cider',
          'Gourmet Belgian Waffles with Plum Jam',
          'Roasted Chestnuts'
        ],
        souvenirs: [
          'Designer Polish Crafts & Jewelry',
          'Regional Honeys & Fruit Cordials',
          'Artisan Winter Textiles'
        ]
      }
    ],
    mustSee: [
      {
        id: 'poznan-ratusz',
        name: 'Poznań Town Hall (Ratusz) & Mechanical Goats',
        title: 'Poznań Town Hall (Ratusz) & Mechanical Goats',
        category: 'Renaissance Masterpiece',
        searchQuery: 'Stary Rynek 1, Poznań',
        wikiImgQuery: 'Ratusz w Poznaniu',
        websiteUrl: 'https://mnp.art.pl/oddzialy/muzeum-historii-miasta-poznania/',
        description: "One of Northern Europe's most magnificent Renaissance civic buildings designed by Giovanni Battista di Quadro. Every day at 12:00 noon (and 3:00 PM), two mechanical metal billy goats emerge above the clock tower to butt heads 12 times.",
        howToGetThere: 'Located in the center of Stary Rynek (Old Market Square).',
        pricing: 'Square free; Town Hall Museum ~15 PLN (~$4.00 USD)',
        openTimes: 'Square 24/7; Museum Tue-Sun 10:00 AM - 5:00 PM'
      },
      {
        id: 'poznan-ostrow-tumski',
        name: 'Ostrów Tumski & Poznań Cathedral of SS. Peter and Paul',
        title: 'Ostrów Tumski & Poznań Cathedral of SS. Peter and Paul',
        category: 'Birthplace of Poland',
        searchQuery: 'Ostrów Tumski 17, Poznań',
        wikiImgQuery: 'Archikatedra w Poznaniu',
        websiteUrl: 'https://katedra.archpoznan.pl/',
        description: 'The ancient island cradle where Poland began in 966 AD. Inside Poland’s oldest cathedral, the Golden Chapel holds the royal sarcophagi of Poland’s first rulers: Duke Mieszko I and King Bolesław the Brave.',
        howToGetThere: '15-min walk east from Old Town or Tram 3, 4, 8 to Katedra stop.',
        pricing: 'Cathedral free; Crypt & Royal Tombs ~10 PLN (~$2.65 USD)',
        openTimes: 'Daily 9:00 AM - 5:00 PM (except during religious services)'
      },
      {
        id: 'poznan-zamek-cesarski',
        name: 'Imperial Castle (Zamek Cesarski)',
        title: 'Imperial Castle (Zamek Cesarski)',
        category: 'Imperial History & Culture',
        searchQuery: 'Święty Marcin 80/82, Poznań',
        wikiImgQuery: 'Zamek Cesarski w Poznaniu',
        websiteUrl: 'https://ckzamek.pl/',
        description: "The last imperial palace built in Europe (1910) for German Emperor Wilhelm II, later redesigned during WWII and now thriving as Poznań's vibrant cultural center with galleries, cinema, and winter courtyards.",
        howToGetThere: '10-min walk west of Plac Wolności or Tram 2, 5, 13 to Zamek stop.',
        pricing: 'Castle courtyards free; Exhibitions ~15–20 PLN (~$4.00–$5.35 USD)',
        openTimes: 'Daily 10:00 AM - 9:00 PM'
      },
      {
        id: 'poznan-rogalowe-muzeum',
        name: 'Rogalowe Muzeum Poznania (Croissant Museum)',
        title: 'Rogalowe Muzeum Poznania (Croissant Museum)',
        category: 'Living Culinary Experience',
        searchQuery: 'Stary Rynek 41, Poznań',
        wikiImgQuery: 'Rogal Świętomarciński',
        websiteUrl: 'https://rogalowemuzeum.pl/en/',
        description: 'An interactive comedy and culinary show housed in a Renaissance townhouse overlooking the Town Hall. Learn the secret recipe and legend of St. Martin’s croissants and earn an apprentice baker certificate.',
        howToGetThere: 'Located on Stary Rynek directly opposite the Town Hall.',
        pricing: '32–38 PLN (~$8.50–$10.00 USD) incl. fresh croissant tasting',
        openTimes: 'Shows run daily (English sessions available at 2:00 PM; reserve online)'
      },
      {
        id: 'poznan-park-cytadela',
        name: 'Citadel Park (Park Cytadela) & Fort Winiary',
        title: 'Citadel Park (Park Cytadela) & Fort Winiary',
        category: 'Fortress & Sculpture Park',
        searchQuery: 'Armii Poznań, Poznań',
        wikiImgQuery: 'Park Cytadela w Poznaniu',
        websiteUrl: 'https://poznan.travel/en/r/warto-zobaczyc/park-cytadela',
        description: "A 100-hectare park built upon the ruins of Prussia's massive 19th-century Fort Winiary. Features Magdalena Abakanowicz's monumental iron sculpture installation 'The Unrecognized' (Nierozpoznani) and military history museums.",
        howToGetThere: 'Tram 3, 4, 10 to Garbary or Armii Poznań stop (~10 mins from Old Town).',
        pricing: 'Park grounds free; Military museums ~12 PLN (~$3.20 USD)',
        openTimes: 'Park open 24/7; Museums Tue-Sun 10:00 AM - 4:00 PM'
      },
      {
        id: 'poznan-fara',
        name: 'Poznań Fara Church (St. Stanislaus Basilica)',
        title: 'Poznań Fara Church (St. Stanislaus Basilica)',
        category: 'Baroque Masterpiece',
        searchQuery: 'Gołębia 1, Poznań',
        wikiImgQuery: 'Kolegiata Matki Boskiej Nieustającej Pomocy i św. Marii Magdaleny w Poznaniu',
        websiteUrl: 'https://fara.archpoznan.pl/',
        description: 'One of Central Europe’s most breathtaking High Baroque basilicas, boasting towering pink marbleized columns, gilded altars, and a legendary 19th-century organ built by Friedrich Ladegast.',
        howToGetThere: '2-min walk south from Stary Rynek along Świętosławska street.',
        pricing: 'Free entry (donations appreciated); Organ concerts free/donation',
        openTimes: 'Mon-Sat 6:30 AM - 7:30 PM, Sun 7:00 AM - 8:30 PM'
      },
      {
        id: 'poznan-walking-tour',
        name: 'Poznań Old Town & Croissant Tasting Guided Walking Tour',
        title: 'Poznań Old Town & Croissant Tasting Guided Walking Tour',
        category: 'Top Rated Guided Tour',
        searchQuery: 'Stary Rynek, Poznań',
        wikiImgQuery: 'Stary Rynek Poznań',
        description: 'Immersive 2.5-hour walking tour covering the Renaissance Stary Rynek, goat legends, Baroque Fara, Ostrów Tumski birthplace of Poland, and a warm St. Martin croissant and coffee tasting.',
        howToGetThere: 'Departs from the Bamberka Fountain on Stary Rynek.',
        pricing: '70–90 PLN (~$18.50–$24.00 USD) per person',
        openTimes: 'Departs 10:30 AM & 2:00 PM daily'
      }
    ],
    restaurants: [
      'Brovaria (Brewery & Polish Dining)',
      'Restauracja Bamberka (Regional Polish)',
      'Wiejskie Jadło (Rustic Polish Comfort)',
      'Pierogarnia Stary Młyn (Handcrafted Pierogi)',
      'Restauracja Muga (Michelin Starred Fine Dining)'
    ],
    restaurantsDetailed: [
      {
        id: 'brovaria',
        name: 'Brovaria Hotel & Microbrewery',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Microbrewery',
        priceTier: '$$',
        priceEstimatePln: '55 - 110 PLN per person',
        searchQuery: 'Stary Rynek 73, Poznań',
        wikiImgQuery: 'Brovaria Poznań',
        neighborhood: 'Stare Miasto (Stary Rynek)',
        cuisine: 'Craft Microbrewery & Modern Polish Feast',
        signature: 'House Pilsner & Honey Beer, Braised Pork Knuckle, Roasted Duck with Dumplings (Pyzy)',
        description: 'Award-winning microbrewery on the Market Square where copper brewing vats gleam behind dining tables, serving fresh unfiltered beer and hearty Wielkopolska classics.',
        websiteUrl: 'https://brovaria.pl'
      },
      {
        id: 'bamberka',
        name: 'Restauracja Bamberka',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Heritage',
        priceTier: '$$',
        priceEstimatePln: '50 - 95 PLN per person',
        searchQuery: 'Stary Rynek 2, Poznań',
        wikiImgQuery: 'Studzienka Bamberki w Poznaniu',
        neighborhood: 'Stare Miasto (Old Market Square)',
        cuisine: 'Traditional Bambrzy & Greater Poland Heritage',
        signature: 'Poznań Duck with Red Cabbage & Steamed Pyzy, Czernina Soup, Baked Zander',
        description: 'Tribute restaurant honoring the 18th-century German Bambrzy settlers who shaped Poznań folklore, offering warm authentic dining beside the famous Bamberka fountain.',
        websiteUrl: 'https://bamberka.com.pl'
      },
      {
        id: 'wiejskie-jadlo-poznan',
        name: 'Wiejskie Jadło Poznań',
        category: 'local',
        categoryLabel: 'Local Fares & Rustic Hearth',
        priceTier: '$$',
        priceEstimatePln: '45 - 85 PLN per person',
        searchQuery: 'Stary Rynek 77, Poznań',
        wikiImgQuery: 'Stary Rynek Poznań',
        neighborhood: 'Stare Miasto (Stary Rynek)',
        cuisine: 'Rustic Polish Village Cuisine',
        signature: 'Żurek in Sourdough Bread Loaf, Bigos Myśliwski, Pan-Fried Ruskie Pierogi',
        description: 'Cozy folk-art interior with painted timbers and clay pottery, specializing in comforting traditional home-cooked Polish recipes and warm mulled ciders.',
        websiteUrl: 'https://wiejskiejadlo.pl'
      },
      {
        id: 'pierogarnia-stary-mlyn-poznan',
        name: 'Pierogarnia Stary Młyn Poznań',
        category: 'local',
        categoryLabel: 'Local Fares & Hand-Rolled Pierogi',
        priceTier: '$',
        priceEstimatePln: '28 - 48 PLN per person',
        searchQuery: 'Zamkowa 7, Poznań',
        wikiImgQuery: 'Pierogi ruskie',
        neighborhood: 'Stare Miasto (Near Royal Castle)',
        cuisine: 'Traditional & Oven-Baked Pierogi (Piecuchy)',
        signature: 'Oven-Baked Piecuchy with Smoked Bacon, Boiled Wild Forest Mushroom Pierogi',
        description: 'Acclaimed dumpling specialist renowned for traditional boiled pierogi and giant crispy oven-baked crusty piecuchy stuffed with savory meats and cheeses.',
        websiteUrl: 'https://www.pierogarnie.com'
      },
      {
        id: 'muga-poznan',
        name: 'Restauracja Muga (1 Michelin Star)',
        category: 'expensive',
        categoryLabel: 'Fine Dining & 1 Michelin Star',
        priceTier: '$$$$',
        priceEstimatePln: '380 - 550 PLN per person',
        searchQuery: 'Krysiewicza 5, Poznań',
        wikiImgQuery: 'Kamienica Żelazko Poznań',
        neighborhood: 'Centrum (Near Stary Browar)',
        cuisine: 'Contemporary Polish Haute Cuisine',
        signature: 'Seasonal Tasting Menu with Regional Foraged Ingredients, Sommelier Wine Pairings',
        description: "Poznań's first Michelin-starred culinary gem offering an unforgettable sensory journey of refined modern European gastronomy curated by Chef Artur Skotarczyk.",
        websiteUrl: 'https://restauracjamuga.pl'
      },
      {
        id: 'pijalnia-wodki-poznan',
        name: 'Pijalnia Wódki i Piwa Poznań',
        category: 'vodka-house',
        categoryLabel: 'Historic Vodka House & Bites',
        priceTier: '$',
        priceEstimatePln: '15 - 35 PLN per person',
        searchQuery: 'Wrocławska 8, Poznań',
        wikiImgQuery: 'Ulica Wrocławska w Poznaniu',
        neighborhood: 'Stare Miasto (Wrocławska Nightlife Street)',
        cuisine: 'Retro Polish PRL Tapas & Infused Vodka Shots',
        signature: 'Chili-Lemon & Salted Caramel Vodka Shots, Pickled Herring (Śledź), Steak Tartare',
        description: 'Vibrant retro 1960s Polish PRL bar serving budget-friendly ice-cold vodka shots and classic drinking appetizers on bustling Wrocławska street.'
      },
      {
        id: 'ministerstwo-browaru',
        name: 'Ministerstwo Browaru Taproom',
        category: 'brewery',
        categoryLabel: 'Craft Brewery & Tap Bar',
        priceTier: '$$',
        priceEstimatePln: '30 - 65 PLN per person',
        searchQuery: 'Ratajczaka 34, Poznań',
        wikiImgQuery: 'Ulica Ratajczaka w Poznaniu',
        neighborhood: 'Centrum / Stare Miasto Border',
        cuisine: 'Polish Craft Beer on Tap & Bar Snacks',
        signature: 'Rotating 16 Polish Craft Draft Taps (IPAs, Baltic Porters, Sours), Warm Pretzels',
        description: 'A temple for Polish craft beer enthusiasts with sixteen continuously rotating artisanal taps from top Polish microbreweries and a lively cellar atmosphere.',
        websiteUrl: 'https://ministerstwobrowaru.pl'
      },
      {
        id: 'kawiarnia-stonewall',
        name: 'Kawiarnia Stonewall',
        category: 'coffee-breakfast',
        categoryLabel: 'Specialty Coffee & Community',
        priceTier: '$',
        priceEstimatePln: '18 - 36 PLN per person',
        searchQuery: 'Garbary 67, Poznań',
        wikiImgQuery: 'Garbary w Poznaniu',
        neighborhood: 'Stare Miasto / Garbary',
        cuisine: 'Third-Wave Coffee, Specialty Teas & Cakes',
        signature: 'Single-Origin Aeropress Brews, Vegan Cheesecake, Hot Spiced Winter Latte',
        description: "A welcoming, inclusive community café run by Grupa Stonewall where 100% of proceeds support local equality initiatives, serving top-tier specialty coffee and artisan cakes.",
        websiteUrl: 'https://grupastonewall.pl'
      }
    ]
  },

  torun: {
    markets: [
      {
        id: 'torun-rynek-staromiejski',
        name: 'Rynek Staromiejski Medieval Christmas Market',
        shortName: 'Rynek Staromiejski',
        searchQuery: 'Rynek Staromiejski, Toruń',
        wikiImgQuery: 'Rynek Staromiejski w Toruniu',
        dates: 'Nov 21, 2026 - Dec 21, 2026',
        hours: 'Mon-Thu 12:00 PM - 9:00 PM, Fri 12:00 PM - 10:00 PM, Sat 10:00 AM - 10:00 PM, Sun 10:00 AM - 9:00 PM',
        bestTime: '4:30 PM - 7:00 PM (Gothic Town Hall illumination & gingerbread aromas)',
        specialty: 'Authentic 700-year-old Toruń gingerbread, spiced honey wines, and Gothic square ambiance',
        details: 'Nestled beneath the towering red-brick 13th-century Town Hall and Copernicus Monument, Toruń’s Christmas Market is famous for world-renowned spiced gingerbread and warm medieval charm.',
        description: "Enclosed by intact 13th-century brick Gothic townhouses, Toruń's market fills the medieval square with festive wooden chalets, glowing arches, master gingerbread bakers, and live highlander carolers.",
        highlights: [
          'Authentic Toruń Pierniki (Katarzynki & Heart Molds)',
          'Copernicus Monument & Gothic Ratusz Illumination',
          'Hot Spiced Toruń Honey Mead (Miód Toruński)',
          'Woodfired Grilled Kielbasa & Smoked Meats'
        ],
        mustTry: [
          'Toruńskie Pierniki z Powidłami (Plum Jam Spiced Gingerbread)',
          'Grzany Miód Toruński (Hot Toruń Spiced Mead)',
          'Barszcz Czerwony z Uszkami (Beetroot Borscht)'
        ],
        souvenirs: [
          'Decorated Wooden Pierniki Molds',
          'Hand-Painted Copernicus Glass Ornaments',
          'Kashubian & Kuyavian Handcrafted Ceramics'
        ]
      },
      {
        id: 'torun-rynek-nowomiejski',
        name: 'Rynek Nowomiejski Craft & Artisan Fair',
        shortName: 'Rynek Nowomiejski',
        searchQuery: 'Rynek Nowomiejski, Toruń',
        wikiImgQuery: 'Rynek Nowomiejski w Toruniu',
        dates: 'Nov 27, 2026 - Dec 20, 2026',
        hours: '11:00 AM - 8:00 PM daily',
        bestTime: '3:00 PM - 6:00 PM (Quiet artisan shopping & local bakery stalls)',
        specialty: 'Handcrafted toys, beeswax goods, and local Kuyavian craft foods',
        details: 'A quieter, charming sister market set in the New Town Market Square centered around master woodturners, organic beekeepers, and regional Kuyavian bakers.',
        description: 'Set on the octagonal New Town Square, this market offers an intimate, relaxed stroll focused on small-batch beekeepers, hand-loomed winter scarves, and local organic delicacies.',
        highlights: [
          'Small-Batch Beekeepers & Propolis Honey',
          'Handmade Wooden Christmas Toys',
          'Cozy Family Gingerbread Decorating Stalls',
          'Hot Spiced Apple Cider Chalets'
        ],
        mustTry: [
          'Katarzynka Gingerbread with Dark Chocolate',
          'Hot Mulled Cider with Cloves and Cinnamon',
          'Warm Toruń Pretzels'
        ],
        souvenirs: [
          'Natural Beeswax Candles',
          'Hand-Knit Kuyavian Wool Mittens',
          'Artisan Wooden Kitchen Utensils'
        ]
      }
    ],
    mustSee: [
      {
        id: 'torun-ratusz-staromiejski',
        name: 'Old Town Hall & Copernicus Monument (Ratusz Staromiejski)',
        title: 'Old Town Hall & Copernicus Monument (Ratusz Staromiejski)',
        category: 'UNESCO Brick Gothic',
        searchQuery: 'Rynek Staromiejski 1, Toruń',
        wikiImgQuery: 'Ratusz Staromiejski w Toruniu',
        websiteUrl: 'https://muzeum.torun.pl/ratusz-staromiejski/',
        description: 'One of the largest and most intact Gothic brick town halls in Europe, built between 1391 and 1399. Climb the 40-meter tower for a panoramic view over the red-tiled medieval roofs and Vistula River.',
        howToGetThere: 'Center of Rynek Staromiejski (Old Market Square).',
        pricing: 'Museum entry ~18 PLN (~$4.80 USD); Tower climb ~15 PLN (~$4.00 USD)',
        openTimes: 'Tue-Sun 10:00 AM - 4:00 PM (Winter hours)'
      },
      {
        id: 'torun-muzeum-piernika',
        name: 'Living Museum of Gingerbread (Żywe Muzeum Piernika)',
        title: 'Living Museum of Gingerbread (Żywe Muzeum Piernika)',
        category: 'Living History & Bakery',
        searchQuery: 'Rabiańska 9, Toruń',
        wikiImgQuery: 'Żywe Muzeum Piernika w Toruniu',
        websiteUrl: 'https://muzeumpiernika.pl/en/',
        description: "An extraordinary 16th-century living bakery museum where Master Bakers guide visitors through crushing spices, kneading honey dough into wooden molds, and baking authentic Toruń gingerbread to take home.",
        howToGetThere: '3-min walk south of Rynek Staromiejski on Rabiańska street.',
        pricing: '34–39 PLN (~$9.00–$10.50 USD) incl. hands-on baking workshop',
        openTimes: 'Daily 10:00 AM - 6:00 PM (English shows run at 1:00 PM & 4:00 PM; advance booking advised)'
      },
      {
        id: 'torun-dom-kopernika',
        name: 'Nicolaus Copernicus House (Dom Mikołaja Kopernika)',
        title: 'Nicolaus Copernicus House (Dom Mikołaja Kopernika)',
        category: 'Scientific Heritage & Museum',
        searchQuery: 'Kopernika 15/17, Toruń',
        wikiImgQuery: 'Dom Mikołaja Kopernika w Toruniu',
        websiteUrl: 'https://muzeum.torun.pl/dom-mikolaja-kopernika/',
        description: 'The reconstructed 15th-century Gothic patrician townhouse where Nicolaus Copernicus was born in 1473. Interactive multimedia exhibits explore his astronomical breakthroughs, medieval trade, and Renaissance instruments.',
        howToGetThere: '3-min walk southwest from Rynek Staromiejski along Kopernika street.',
        pricing: '20 PLN (~$5.35 USD)',
        openTimes: 'Tue-Sun 10:00 AM - 4:00 PM'
      },
      {
        id: 'torun-krzywa-wieza',
        name: 'The Leaning Tower of Toruń (Krzywa Wieża)',
        title: 'The Leaning Tower of Toruń (Krzywa Wieża)',
        category: 'Medieval Fortification',
        searchQuery: 'Pod Krzywą Wieżą 1, Toruń',
        wikiImgQuery: 'Krzywa Wieża w Toruniu',
        websiteUrl: 'https://krzywawieza.torun.pl/',
        description: 'A 14th-century Gothic defensive tower tilting 1.46 meters off vertical. According to medieval legend, visitors test their honesty by standing with their heels and back against the wall without toppling forward.',
        howToGetThere: '5-min walk west of Rynek Staromiejski along the defensive city walls.',
        pricing: 'Exterior free; Interior exhibition ~10 PLN (~$2.65 USD)',
        openTimes: 'Exterior open 24/7'
      },
      {
        id: 'torun-zamek-krzyzacki',
        name: 'Teutonic Castle Ruins (Zamek Krzyżacki)',
        title: 'Teutonic Castle Ruins (Zamek Krzyżacki)',
        category: 'Medieval Fortress',
        searchQuery: 'Przedzamcze 3, Toruń',
        wikiImgQuery: 'Ruiny zamku krzyżackiego w Toruniu',
        websiteUrl: 'https://zamek.torun.pl/',
        description: "The horseshoe-shaped brick ruins of the 13th-century Teutonic Knights' fortress, demolished by rebellious Toruń townspeople in 1454 during the Thirteen Years' War to assert civic freedom.",
        howToGetThere: '5-min walk east from Rynek Staromiejski along Szeroka and Przedzamcze.',
        pricing: '15 PLN (~$4.00 USD) for castle grounds and subterranean vaults',
        openTimes: 'Daily 10:00 AM - 4:00 PM (Winter hours)'
      },
      {
        id: 'torun-katedra-sw-jana',
        name: 'Cathedral of SS. John the Baptist and John the Evangelist',
        title: 'Cathedral of SS. John the Baptist and John the Evangelist',
        category: 'Brick Gothic Cathedral',
        searchQuery: 'Żeglarska 16, Toruń',
        wikiImgQuery: 'Katedra św. Jana Chrzciciela i św. Jana Ewangelisty w Toruniu',
        websiteUrl: 'https://katedratorun.pl/',
        description: "Monumental 13th-century Gothic cathedral housing the original 13th-century font where Copernicus was baptized, as well as the famous 7-ton 'Tuba Dei' (God's Trumpet) bell cast in 1500.",
        howToGetThere: '2-min walk south from Rynek Staromiejski on Żeglarska street.',
        pricing: 'Free entry to cathedral; Bell tower climb ~12 PLN (~$3.20 USD)',
        openTimes: 'Mon-Sat 9:00 AM - 5:00 PM, Sun 12:30 PM - 5:30 PM'
      },
      {
        id: 'torun-walking-tour',
        name: 'Toruń UNESCO Medieval Gothic & Pierniki Guided Walking Tour',
        title: 'Toruń UNESCO Medieval Gothic & Pierniki Guided Walking Tour',
        category: 'Top Rated Guided Tour',
        searchQuery: 'Rynek Staromiejski, Toruń',
        wikiImgQuery: 'Toruń Stare Miasto',
        description: 'Delightful 2-hour guided walking tour exploring the undamaged UNESCO medieval center, Copernicus birthplace, the Leaning Tower, and historic gingerbread bakeries.',
        howToGetThere: 'Departs from the Nicolaus Copernicus Monument in Rynek Staromiejski.',
        pricing: '60–80 PLN (~$16.00–$21.50 USD) per person',
        openTimes: 'Departs 11:00 AM & 1:30 PM daily'
      }
    ],
    restaurants: [
      'Karczma Spichrz (18th Century Historic Granary Dining)',
      'Restauracja Manekin (Iconic Toruń Creperie)',
      'Restauracja Pod Aniołem (Gothic Cellar Polish)',
      'Pierogarnia Stary Toruń (Oven-Baked Pierogi)',
      'Jan Olbracht Browar Staromiejski (Royal Craft Brewery)'
    ],
    restaurantsDetailed: [
      {
        id: 'karczma-spichrz',
        name: 'Karczma Spichrz',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Historic Granary',
        priceTier: '$$',
        priceEstimatePln: '50 - 100 PLN per person',
        searchQuery: 'Mostowa 1, Toruń',
        wikiImgQuery: 'Spichrz Mostowa 1 Toruń',
        neighborhood: 'Stare Miasto (Vistula Gate)',
        cuisine: 'Authentic Kuyavian & Old Polish Hearth Cooking',
        signature: 'Roasted Pork Ribs in Gingerbread Glaze, Duck with Apples, Hunter’s Bigos in Loaf',
        description: 'Set inside a monumental 18th-century timber-framed granary by the river gate, serving hearty Polish delicacies cooked over open charcoal hearths.',
        websiteUrl: 'https://spichrz.pl'
      },
      {
        id: 'manekin-torun',
        name: 'Restauracja Manekin Toruń',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Cult Classic',
        priceTier: '$',
        priceEstimatePln: '22 - 45 PLN per person',
        searchQuery: 'Rynek Staromiejski 16, Toruń',
        wikiImgQuery: 'Rynek Staromiejski Toruń',
        neighborhood: 'Stare Miasto (Rynek Staromiejski)',
        cuisine: 'Savory & Sweet Gourmet Polish Crepes (Naleśniki)',
        signature: 'Baked Crepes with Chanterelles and Chicken, Sweet Cottage Cheese & Pierniki Crepe',
        description: "The original flagship birthplace of Poland's beloved Manekin creperie chain, serving over 50 varieties of oversized savory and dessert crepes at incredible value.",
        websiteUrl: 'https://manekin.pl'
      },
      {
        id: 'restauracja-pod-aniolem',
        name: 'Restauracja Pod Aniołem',
        category: 'local',
        categoryLabel: 'Local Fares & Gothic Vault',
        priceTier: '$$',
        priceEstimatePln: '55 - 110 PLN per person',
        searchQuery: 'Rynek Staromiejski 1, Toruń',
        wikiImgQuery: 'Ratusz Staromiejski w Toruniu',
        neighborhood: 'Stare Miasto (Town Hall Cellar)',
        cuisine: 'Royal Polish & Toruń Gingerbread Infused Specialties',
        signature: 'Venison Stew in Bread Bowl, Roast Duck in Honey-Spice Sauce, Homemade Pierogi',
        description: 'Atmospheric restaurant nestled in the 14th-century brick cellar vaults beneath Toruń Town Hall, renowned for traditional game recipes and candlelit romance.',
        websiteUrl: 'https://podaniolem.torun.pl'
      },
      {
        id: 'pierogarnia-stary-torun',
        name: 'Pierogarnia Stary Toruń',
        category: 'local',
        categoryLabel: 'Local Fares & Handcrafted Pierogi',
        priceTier: '$',
        priceEstimatePln: '25 - 45 PLN per person',
        searchQuery: 'Mostowa 8, Toruń',
        wikiImgQuery: 'Mostowa Toruń',
        neighborhood: 'Stare Miasto (Mostowa Street)',
        cuisine: 'Traditional Boiled & Wood-Oven Baked Pierogi',
        signature: 'Oven-Baked Piecuchy with Smoked Meat, Boiled Ruskie Pierogi with Fried Onions',
        description: 'Charming medieval-themed dumpling tavern famous for giant oven-baked crusty pierogi with rich garlic dipping sauce and hearty winter soups.',
        websiteUrl: 'https://pierogarniastarytorun.pl'
      },
      {
        id: 'szeroka-no-9',
        name: 'Restauracja Szeroka No 9',
        category: 'expensive',
        categoryLabel: 'Fine Dining & Modern Polish',
        priceTier: '$$$',
        priceEstimatePln: '120 - 220 PLN per person',
        searchQuery: 'Szeroka 9, Toruń',
        wikiImgQuery: 'Szeroka Toruń',
        neighborhood: 'Stare Miasto (Main Promenade)',
        cuisine: 'Modern Polish & European Fine Dining',
        signature: 'Sous-vide Deer Loin, Wild Sea Trout with Herbal Risotto, Artisanal Dessert Selection',
        description: "Elegant fine dining on Toruń's central pedestrian boulevard, marrying regional Vistula ingredients with contemporary culinary flair and an extensive wine cellar.",
        websiteUrl: 'https://szerokano9.pl'
      },
      {
        id: 'jan-olbracht-browar-staromiejski',
        name: 'Jan Olbracht Browar Staromiejski',
        category: 'brewery',
        categoryLabel: 'Royal Microbrewery & Tavern',
        priceTier: '$$',
        priceEstimatePln: '40 - 80 PLN per person',
        searchQuery: 'Szczytna 15, Toruń',
        wikiImgQuery: 'Szczytna Toruń',
        neighborhood: 'Stare Miasto (Near Rynek)',
        cuisine: 'Artisan Craft Beer & Polish Tavern Fare',
        signature: 'Piernikowe Dark Gingerbread Beer, Olbracht Pilsner, Crispy Golonka Pork Knuckle',
        description: "Toruń's premier craft brewery named after King Jan Olbracht, brewing unique seasonal beers including the city's signature dark spiced Piernikowe gingerbread beer.",
        websiteUrl: 'https://browar-olbracht.pl'
      },
      {
        id: 'kawiarnia-lenkiewicz',
        name: 'Kawiarnia Lenkiewicz',
        category: 'coffee-breakfast',
        categoryLabel: 'Legendary Toruń Bakery & Coffee',
        priceTier: '$',
        priceEstimatePln: '15 - 32 PLN per person',
        searchQuery: 'Rynek Staromiejski 33/34, Toruń',
        wikiImgQuery: 'Rynek Staromiejski Toruń',
        neighborhood: 'Stare Miasto (Rynek Staromiejski)',
        cuisine: 'Artisan Ice Cream, Pastries & Specialty Coffee',
        signature: 'Signature Piernik Cake, Artisan Hot Chocolate with Cinnamon, Handcrafted Ice Cream',
        description: 'Beloved Toruń confectionery institution founded in 1945, world-famous for irresistible cakes, hot chocolates, and freshly baked pastries right on the Market Square.',
        websiteUrl: 'https://lenkiewicz.net'
      }
    ]
  },

  gdansk: {
    markets: [
      {
        id: 'gdansk-targ-weglowy',
        name: 'Targ Węglowy Main Christmas Market (Jarmark Bożonarodzeniowy)',
        shortName: 'Targ Węglowy',
        searchQuery: 'Targ Węglowy, Gdańsk',
        wikiImgQuery: 'Targ Węglowy w Gdańsku',
        dates: 'Nov 20, 2026 - Dec 23, 2026',
        hours: 'Sun-Thu 12:00 PM - 8:00 PM, Fri-Sat 12:00 PM - 9:00 PM (Closed Dec 24/25)',
        bestTime: '5:00 PM - 7:30 PM (Lucek the Moose speeches & carousel lights)',
        specialty: 'Talking Moose Lucek, 3-story Advent Pyramid, and Baltic Amber gifts',
        details: "Voted among the best European Christmas Markets, Gdańsk's fair features romantic Venetian carousels, an illuminated talking moose animatronic, and hundreds of Hanseatic chalets.",
        description: "Set against the historic Prison Tower and Great Armoury, Gdańsk's Christmas Market charms visitors with the animatronic Lucek the Moose, glowing Venetian carousel, steaming Grzaniec Gdański in boot mugs, and artisan Baltic amber craftsmen.",
        highlights: [
          'Animatronic Talking Moose (Łoś Lucek)',
          '19th-Century Double-Decker Venetian Carousel',
          '3-Tier Illuminated Advent Pyramid with Windmill',
          'Artisan Baltic Amber Craftsmen Chalets'
        ],
        mustTry: [
          'Grzaniec Gdański z Imbirem (Spiced Ginger Mulled Wine)',
          'Smażone Ryby Bałtyckie (Fried Baltic Fish Bites)',
          'Pieczone Kasztany i Oscypek (Roasted Chestnuts & Grilled Cheese)'
        ],
        souvenirs: [
          'Handcrafted Baltic Amber Jewelry',
          'Kashubian Embroidered Linens & Mittens',
          'Ceramic Gdańsk Merchant House Miniatures'
        ]
      },
      {
        id: 'gdansk-tkacka',
        name: 'Ulica Tkacka & Zbrojownia Artisans Fair',
        shortName: 'Ulica Tkacka',
        searchQuery: 'Tkacka, Gdańsk',
        wikiImgQuery: 'Wielka Zbrojownia w Gdańsku',
        dates: 'Nov 20, 2026 - Dec 23, 2026',
        hours: '12:00 PM - 8:00 PM daily',
        bestTime: '4:00 PM - 6:30 PM (Fine jewelry browsing & hot mead tastings)',
        specialty: 'High-end Polish design, fine Baltic amber art, and artisanal honey wine',
        details: 'An artisan extension extending past the Great Armoury along Tkacka street, featuring curated Polish fashion designers, jewelers, and craft spirits.',
        description: 'Radiating from the Renaissance Great Armoury, this boutique pedestrian lane offers refined shopping for Baltic amber artists, hand-loomed woolens, and warm spice liqueurs.',
        highlights: [
          'Curated Independent Polish Designers',
          'Master Baltic Amber Goldsmiths & Artisans',
          'Small-Batch Spiced Goldwasser & Mead Tastings',
          'Heated Indoor Armoury Artisan Exhibition'
        ],
        mustTry: [
          'Danziger Goldwasser Warm Cocktail',
          'Kashubian Sękacz (Tree Cake)',
          'Hot Artisan Spiced Mead'
        ],
        souvenirs: [
          'Raw Untreated Baltic Amber Pieces',
          'Designer Silver & Amber Pendants',
          'Hand-Poured Soy Beeswax Candles'
        ]
      },
      {
        id: 'gdansk-wyspa-spichrzow',
        name: 'Granary Island (Wyspa Spichrzów) Winter Promenade',
        shortName: 'Wyspa Spichrzów',
        searchQuery: 'Chmielna, Gdańsk',
        wikiImgQuery: 'Wyspa Spichrzów w Gdańsku',
        dates: 'Nov 20, 2026 - Jan 2, 2027',
        hours: 'Open daily 12:00 PM - 10:00 PM',
        bestTime: '6:00 PM - 9:00 PM (Riverfront light reflections & cocktail lounges)',
        specialty: 'Modern waterfront winter dining, illuminated footbridges, and AmberSky wheel',
        details: 'Gdańsk’s buzzing waterfront entertainment district glowing with winter light displays, outdoor fire lounges, and waterside views of the historic Old Crane.',
        description: 'Connecting to Old Town via illuminated footbridges across the Motława River, Granary Island offers vibrant outdoor heaters, riverside craft bars, and festive winter energy.',
        highlights: [
          'AmberSky Giant Ferris Wheel Reflections',
          'Illuminated Motława River Footbridges',
          'Heated Outdoor Fire Pits & Winter Lounges',
          'Waterside Views of the Medieval Crane (Żuraw)'
        ],
        mustTry: [
          'Baltic Spiced Gin & Warm Tonic',
          'Smoked Salmon Canapes',
          'Warm Belgian Hot Chocolate with Rum'
        ],
        souvenirs: [
          'Maritime Souvenirs & Wooden Ships',
          'Bottled Regional Craft Spirits & Goldwasser',
          'Baltic Sea Salt Confections'
        ]
      }
    ],
    mustSee: [
      {
        id: 'gdansk-dlugi-targ',
        name: 'Long Market & Main Town Hall (Długi Targ & Ratusz)',
        title: 'Long Market & Main Town Hall (Długi Targ & Ratusz)',
        category: 'Hanseatic Grandeur',
        searchQuery: 'Długi Targ 46, Gdańsk',
        wikiImgQuery: 'Długi Targ w Gdańsku',
        websiteUrl: 'https://muzeumgdansk.pl/oddzialy-muzeum/ratusz-glownego-miasta/',
        description: "The breathtaking heart of the Royal Way (Droga Królewska) lined with Dutch Mannerist merchant townhouses, Artus Court, and the 83-meter Gothic tower of the Main Town Hall.",
        howToGetThere: 'Central pedestrian axis of Główne Miasto (Main Town).',
        pricing: 'Square free; Town Hall Museum ~16 PLN (~$4.25 USD)',
        openTimes: 'Square 24/7; Museum Tue-Sun 10:00 AM - 4:00 PM'
      },
      {
        id: 'gdansk-fontanna-neptuna',
        name: "Neptune's Fountain (Fontanna Neptuna)",
        title: "Neptune's Fountain (Fontanna Neptuna)",
        category: 'Historic Landmark & Legend',
        searchQuery: 'Długi Targ, Gdańsk',
        wikiImgQuery: 'Fontanna Neptuna w Gdańsku',
        websiteUrl: 'https://gdansk.travel/en/warto-zobaczyc/fontanna-neptuna,a,2882',
        description: "The 17th-century bronze fountain of the Roman sea god holding his trident in front of Artus Court. Legend says Neptune struck his trident to shatter golden coins into the golden flakes of Danziger Goldwasser liqueur.",
        howToGetThere: 'Located in Długi Targ right in front of Artus Court.',
        pricing: 'Free',
        openTimes: 'Open 24/7'
      },
      {
        id: 'gdansk-bazylika-mariacka',
        name: "St. Mary's Basilica (Bazylika Mariacka)",
        title: "St. Mary's Basilica (Bazylika Mariacka)",
        category: 'Colossal Brick Gothic',
        searchQuery: 'Podkramarska 5, Gdańsk',
        wikiImgQuery: 'Bazylika Mariacka w Gdańsku',
        websiteUrl: 'https://bazylikamariacka.gdansk.pl/',
        description: 'The largest brick church in the world, capable of holding 25,000 worshippers. Features a monumental 15th-century astronomical clock by Hans Düringer and a 400-step tower with staggering Baltic views.',
        howToGetThere: '3-min walk north from Długi Targ along Piwna or Kramarska street.',
        pricing: 'Church free; Tower climb ~14 PLN (~$3.75 USD)',
        openTimes: 'Mon-Sat 8:30 AM - 5:30 PM, Sun 11:00 AM - 5:30 PM'
      },
      {
        id: 'gdansk-zuraw',
        name: 'Motława Waterfront & Medieval Port Crane (Żuraw Gdański)',
        title: 'Motława Waterfront & Medieval Port Crane (Żuraw Gdański)',
        category: 'Maritime Heritage Landmark',
        searchQuery: 'Szeroka 67/68, Gdańsk',
        wikiImgQuery: 'Żuraw w Gdańsku',
        websiteUrl: 'https://nmm.pl/zuraw/',
        description: "The 15th-century double-towered wooden harbor crane on the Motława River, once the largest in medieval Europe. Used to load grain and step ship masts using massive human-powered treadwheels.",
        howToGetThere: 'Walk along the river promenade (Długie Pobrzeże) from Green Gate.',
        pricing: 'Promenade free; National Maritime Museum interior ~18 PLN (~$4.80 USD)',
        openTimes: 'Promenade 24/7; Museum Tue-Sun 10:00 AM - 4:00 PM'
      },
      {
        id: 'gdansk-muzeum-ii-wojny',
        name: 'Museum of the Second World War (Muzeum II Wojny Światowej)',
        title: 'Museum of the Second World War (Muzeum II Wojny Światowej)',
        category: 'World-Class WWII Museum',
        searchQuery: 'Plac Władysława Bartoszewskiego 1, Gdańsk',
        wikiImgQuery: 'Muzeum II Wojny Światowej w Gdańsku',
        websiteUrl: 'https://muzeum1939.pl/en',
        description: "A world-renowned museum housed inside a dramatic tilted architectural landmark. The underground exhibition presents an unforgettable, comprehensive chronicle of the civilian and military experience of WWII.",
        howToGetThere: '12-min walk north along Motława River or Bus 100/130 to Muzeum stop.',
        pricing: '29 PLN (~$7.75 USD) (Advance ticket booking strongly recommended)',
        openTimes: 'Tue-Sun 10:00 AM - 6:00 PM (Mondays closed)'
      },
      {
        id: 'gdansk-ecs-solidarnosc',
        name: 'European Solidarity Centre (Europejskie Centrum Solidarności)',
        title: 'European Solidarity Centre (Europejskie Centrum Solidarności)',
        category: 'Freedom & Modern History',
        searchQuery: 'Plac Solidarności 1, Gdańsk',
        wikiImgQuery: 'Europejskie Centrum Solidarności',
        websiteUrl: 'https://ecs.gda.pl/en/',
        description: "Clad in rusted shipyard steel by the historic Gate No. 2 of the Gdańsk Shipyard, this award-winning museum tells the inspiring story of Lech Wałęsa, Solidarność, and the peaceful collapse of European communism.",
        howToGetThere: '10-min walk from Gdańsk Główny station or Tram 8, 10 to Plac Solidarności.',
        pricing: '30 PLN (~$8.00 USD) incl. excellent audio guide',
        openTimes: 'Mon, Wed-Fri 10:00 AM - 5:00 PM; Sat-Sun 10:00 AM - 6:00 PM (Tue closed)'
      },
      {
        id: 'gdansk-amber-museum',
        name: 'Amber Museum at Great Mill (Muzeum Bursztynu - Wielki Młyn)',
        title: 'Amber Museum at Great Mill (Muzeum Bursztynu - Wielki Młyn)',
        category: 'Baltic Gold Museum',
        searchQuery: 'Wielkie Młyny 16, Gdańsk',
        wikiImgQuery: 'Wielki Młyn w Gdańsku',
        websiteUrl: 'https://muzeumgdansk.pl/oddzialy-muzeum/muzeum-bursztynu/',
        description: "Housed inside Europe’s largest medieval watermill (Wielki Młyn), showcasing prehistoric plant and animal inclusions in amber, royal guild jewelry, and contemporary Baltic amber artwork.",
        howToGetThere: '5-min walk south of Gdańsk Główny station near St. Catherine Church.',
        pricing: '20 PLN (~$5.35 USD)',
        openTimes: 'Wed-Mon 10:00 AM - 6:00 PM (Tuesdays closed)'
      },
      {
        id: 'gdansk-walking-tour',
        name: 'Gdańsk Old Town, Hanseatic Amber & Solidarity Guided Walking Tour',
        title: 'Gdańsk Old Town, Hanseatic Amber & Solidarity Guided Walking Tour',
        category: 'Top Rated Guided Tour',
        searchQuery: 'Długi Targ, Gdańsk',
        wikiImgQuery: 'Długi Targ Gdańsk',
        description: 'Top-rated 2.5-hour tour covering the Royal Way, Neptune’s Fountain, St. Mary’s Basilica, amber workshops on picturesque Mariacka Street, and the Motława waterfront crane.',
        howToGetThere: 'Departs from Neptune’s Fountain on Długi Targ.',
        pricing: '75–95 PLN (~$20.00–$25.50 USD) per person',
        openTimes: 'Departs 10:30 AM & 2:30 PM daily'
      }
    ],
    restaurants: [
      'Pierogarnia Mandu (Legendary Handcrafted Pierogi)',
      'Restauracja Kubicki (Oldest Surviving Gdańsk Dining since 1918)',
      'Gdański Bowke (Maritime Port Fare & Polish Craft Beer)',
      'Brovarnia Gdańsk (Award-Winning Waterfront Microbrewery)',
      'Bar Mleczny Neptun (Authentic Historic Milk Bar on Długa)'
    ],
    restaurantsDetailed: [
      {
        id: 'pierogarnia-mandu',
        name: 'Pierogarnia Mandu Centrum',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Iconic Pierogi',
        priceTier: '$$',
        priceEstimatePln: '35 - 65 PLN per person',
        searchQuery: 'Elżbietańska 9/10, Gdańsk',
        wikiImgQuery: 'Gdańsk Elżbietańska',
        neighborhood: 'Stare Miasto (Near Main Station)',
        cuisine: 'Handmade Traditional & Contemporary Polish Pierogi',
        signature: 'Pan-Fried Duck & Cranberry Pierogi, Traditional Ruskie, Sweet Blueberry Dumplings',
        description: "Gdańsk's premier pierogi destination where master cooks hand-roll, stuff, and boil fresh dumplings behind an open glass kitchen. Incredibly popular, warm, and delicious.",
        websiteUrl: 'https://pierogarniamandu.pl'
      },
      {
        id: 'kubicki',
        name: 'Restauracja Kubicki',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Historic 1918 Legend',
        priceTier: '$$ - $$$',
        priceEstimatePln: '75 - 140 PLN per person',
        searchQuery: 'Wartka 5, Gdańsk',
        wikiImgQuery: 'Targ Rybny w Gdańsku',
        neighborhood: 'Główne Miasto (Motława Waterfront)',
        cuisine: 'Historic Polish & Baltic Maritime Cuisine',
        signature: 'Crispy Pork Knuckle in Beer Glaze, Pan-Seared Baltic Salmon, Hunter’s Wild Boar Stew',
        description: "Gdańsk's oldest operating restaurant (since 1918) overlooking the Motława River, maintaining pre-war elegance, live piano melodies, and exquisite traditional Polish game and seafood.",
        websiteUrl: 'https://restauracjakubicki.pl'
      },
      {
        id: 'gdanski-bowke',
        name: 'Gdański Bowke',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Port Tavern',
        priceTier: '$$',
        priceEstimatePln: '60 - 120 PLN per person',
        searchQuery: 'Długie Pobrzeże 11, Gdańsk',
        wikiImgQuery: 'Długie Pobrzeże w Gdańsku',
        neighborhood: 'Główne Miasto (Motława Riverfront)',
        cuisine: 'Kashubian & Traditional Polish Port Tavern',
        signature: 'Danziger Goldwasser, Herring in Mustard-Cream Sauce, Roast Goose Leg with Red Cabbage',
        description: 'Vibrant maritime tavern on the Motława promenade themed around 19th-century port life, serving authentic Kashubian recipes, freshly baked sourdough, and house liqueurs.',
        websiteUrl: 'https://gdanskibowke.com'
      },
      {
        id: 'brovarnia-gdansk',
        name: 'Brovarnia Gdańsk',
        category: 'brewery',
        categoryLabel: 'Craft Microbrewery & Hotel Gdańsk',
        priceTier: '$$',
        priceEstimatePln: '55 - 110 PLN per person',
        searchQuery: 'Szafarnia 9, Gdańsk',
        wikiImgQuery: 'Szafarnia Gdańsk',
        neighborhood: 'Granary Island / Marina District',
        cuisine: 'Artisan Microbrewery & Contemporary Polish Fare',
        signature: 'Award-Winning Złoto Brovarni Pilsner, Dark Smoked Bock, Braised Beef Cheeks',
        description: 'Celebrated microbrewery inside a restored 17th-century granary overlooking Gdańsk Marina, renowned for world-class craft beers and refined Polish cuisine.',
        websiteUrl: 'https://brovarnia.pl'
      },
      {
        id: 'bar-mleczny-neptun',
        name: 'Bar Mleczny Neptun',
        category: 'cheap',
        categoryLabel: 'Cheap Eats & Classic Milk Bar',
        priceTier: '$',
        priceEstimatePln: '15 - 28 PLN per person',
        searchQuery: 'Długa 33/34, Gdańsk',
        wikiImgQuery: 'Ulica Długa w Gdańsku',
        neighborhood: 'Główne Miasto (Długa Promenade)',
        cuisine: 'Authentic Traditional Polish Milk Bar Fare',
        signature: 'Kompocik, Kotlet Schabowy with Potatoes, Pomidorowa Tomato Soup with Noodles',
        description: 'A genuine, beloved Polish milk bar operating on picturesque Długa street since 1958, serving fast, honest, comforting home-cooked meals at unbeatable budget prices.'
      },
      {
        id: 'fino-gdansk',
        name: 'Restauracja Fino Gdańsk',
        category: 'expensive',
        categoryLabel: 'Fine Dining & Modern Baltic',
        priceTier: '$$$$',
        priceEstimatePln: '240 - 390 PLN per person',
        searchQuery: 'Grząska 1, Gdańsk',
        wikiImgQuery: 'Gdańsk Główne Miasto',
        neighborhood: 'Główne Miasto (Near St. Mary’s)',
        cuisine: 'Modern Polish & Baltic Fine Dining',
        signature: 'Seasonal Degustation Tasting Menu, Halibut with Sea Buckthorn, Wild Venison Tartare',
        description: 'Intimate, critically acclaimed culinary sanctuary in the heart of Old Town celebrating seasonal Baltic ingredients with innovative textures and delicate plating.',
        websiteUrl: 'https://restauracjafino.pl'
      },
      {
        id: 'wisniewski-gdansk',
        name: 'Wiśniewski Cherry Liqueur House',
        category: 'vodka-house',
        categoryLabel: 'Artisan Cherry Liqueur House',
        priceTier: '$',
        priceEstimatePln: '18 - 40 PLN per person',
        searchQuery: 'Piwna 22, Gdańsk',
        wikiImgQuery: 'Ulica Piwna w Gdańsku',
        neighborhood: 'Główne Miasto (Piwna Street)',
        cuisine: 'Small-Batch Polish Cherry Spirits & Pralines',
        signature: 'Hot Spiced Wiśniówka Liqueur in Stemware, Chilled Cherry Cordials, Dark Chocolates',
        description: 'Cult boutique bar dedicated to Poland’s finest artisanal cherry liqueur (Wiśniówka), served steaming hot in crystal glasses on atmospheric Piwna street.',
        websiteUrl: 'https://wisniewski.pl'
      },
      {
        id: 'duda-pub-gdansk',
        name: 'Pub Pułapka Craft Beer',
        category: 'pub-bars',
        categoryLabel: 'Polish Craft Beer Pub',
        priceTier: '$$',
        priceEstimatePln: '25 - 55 PLN per person',
        searchQuery: 'Straganiarska 20, Gdańsk',
        wikiImgQuery: 'Ulica Straganiarska w Gdańsku',
        neighborhood: 'Główne Miasto (Straganiarska Street)',
        cuisine: 'Polish Independent Craft Beer on Tap',
        signature: '12 Rotating Polish Craft Taps (Baltic Porters, NEIPAs), Artisanal Cider, Jerky',
        description: 'Legendary indie craft beer bar favored by locals and travelers alike, featuring an ever-changing chalkboard of Poland’s top microbreweries and relaxed industrial vibes.',
        websiteUrl: 'https://pubpulapka.pl'
      },
      {
        id: 'drukarnia-cafe-gdansk',
        name: 'Drukarnia Café',
        category: 'coffee-breakfast',
        categoryLabel: 'Specialty Coffee on Amber Street',
        priceTier: '$',
        priceEstimatePln: '18 - 38 PLN per person',
        searchQuery: 'Mariacka 36, Gdańsk',
        wikiImgQuery: 'Ulica Mariacka w Gdańsku',
        neighborhood: 'Główne Miasto (Mariacka Street)',
        cuisine: 'Third-Wave Specialty Coffee, Breakfast & Pastries',
        signature: 'Pour-Over V60 Brews, Avocado Sourdough Toast, Homemade Warm Cinnamon Buns',
        description: "Iconic specialty coffee sanctuary located on cobblestone Mariacka street lined with gargoyle rainspouts, serving exceptional filter coffees and delicious morning toasts.",
        websiteUrl: 'https://drukarniacafe.pl'
      }
    ]
  }
};

async function processAll() {
  console.log('Starting Phase 3 Data Verification & Asset Generation with delays...');
  
  const verifiedOutput = {};

  for (const [cityKey, cityData] of Object.entries(POI_DEFINITIONS)) {
    console.log(`\n================ Processing City: ${cityKey.toUpperCase()} ================`);
    verifiedOutput[cityKey] = {
      markets: [],
      mustSee: [],
      restaurants: cityData.restaurants || [],
      restaurantsDetailed: []
    };

    // 1. Process Markets
    for (const market of cityData.markets) {
      console.log(`[Market] ${market.name}`);
      const category = 'markets';
      const targetDir = path.join(BASE_IMG_DIR, cityKey, category);
      ensureDir(targetDir);

      const filename = `${market.id}.jpg`;
      const localFile = path.join(targetDir, filename);
      const publicPath = `/wayfinder/Poland-2026/images/${cityKey}/${category}/${filename}`;

      // Geocode
      const geo = await geocodePlace(market.searchQuery || market.name, cityKey);
      await delay(300);
      const finalAddress = geo ? geo.address : `${market.name}, ${cityKey}, Poland`;
      const finalLat = geo ? geo.lat : (cityKey === 'poznan' ? 52.4082 : cityKey === 'torun' ? 53.0138 : 54.3520);
      const finalLng = geo ? geo.lng : (cityKey === 'poznan' ? 16.9335 : cityKey === 'torun' ? 18.5984 : 18.6466);

      // Fetch image
      let imgUrl = await searchWikipediaImage(market.wikiImgQuery || market.name);
      await delay(300);
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(market.wikiImgQuery || market.name);
        await delay(300);
      }
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(`${cityKey} ${market.name}`);
        await delay(300);
      }

      if (imgUrl) {
        try {
          await downloadImage(imgUrl, localFile);
          console.log(`  -> Downloaded photo: ${localFile} (${fs.statSync(localFile).size} bytes)`);
        } catch (e) {
          console.error(`  -> Failed image download:`, e.message);
        }
      }

      verifiedOutput[cityKey].markets.push({
        id: market.id,
        name: market.name,
        shortName: market.shortName || market.name,
        location: finalAddress,
        lat: finalLat,
        lng: finalLng,
        dates: market.dates,
        hours: market.hours,
        bestTime: market.bestTime,
        specialty: market.specialty,
        details: market.details,
        description: market.description,
        highlights: market.highlights,
        mustTry: market.mustTry,
        souvenirs: market.souvenirs,
        imageSrc: publicPath,
        imageUrl: publicPath
      });
    }

    // 2. Process Must-See Attractions
    for (const sight of cityData.mustSee) {
      console.log(`[Attraction] ${sight.name}`);
      const category = 'attractions';
      const targetDir = path.join(BASE_IMG_DIR, cityKey, category);
      ensureDir(targetDir);

      const filename = `${sight.id}.jpg`;
      const localFile = path.join(targetDir, filename);
      const publicPath = `/wayfinder/Poland-2026/images/${cityKey}/${category}/${filename}`;

      // Geocode
      const geo = await geocodePlace(sight.searchQuery || sight.name, cityKey);
      await delay(300);
      const finalAddress = geo ? geo.address : `${sight.name}, ${cityKey}, Poland`;
      const finalLat = geo ? geo.lat : (cityKey === 'poznan' ? 52.4082 : cityKey === 'torun' ? 53.0138 : 54.3520);
      const finalLng = geo ? geo.lng : (cityKey === 'poznan' ? 16.9335 : cityKey === 'torun' ? 18.5984 : 18.6466);

      // Fetch image
      let imgUrl = await searchWikipediaImage(sight.wikiImgQuery || sight.name);
      await delay(300);
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(sight.wikiImgQuery || sight.name);
        await delay(300);
      }
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(`${cityKey} ${sight.name}`);
        await delay(300);
      }

      if (imgUrl) {
        try {
          await downloadImage(imgUrl, localFile);
          console.log(`  -> Downloaded photo: ${localFile} (${fs.statSync(localFile).size} bytes)`);
        } catch (e) {
          console.error(`  -> Failed image download:`, e.message);
        }
      }

      const entry = {
        id: sight.id,
        name: sight.name,
        title: sight.title || sight.name,
        category: sight.category,
        location: finalAddress,
        lat: finalLat,
        lng: finalLng,
        description: sight.description,
        howToGetThere: sight.howToGetThere,
        pricing: sight.pricing,
        openTimes: sight.openTimes,
        imageUrl: publicPath,
        imageSrc: publicPath
      };
      if (sight.websiteUrl) entry.websiteUrl = sight.websiteUrl;
      verifiedOutput[cityKey].mustSee.push(entry);
    }

    // 3. Process Restaurants Detailed
    for (const rest of cityData.restaurantsDetailed) {
      console.log(`[Dining] ${rest.name}`);
      const category = 'food';
      const targetDir = path.join(BASE_IMG_DIR, cityKey, category);
      ensureDir(targetDir);

      const filename = `${rest.id}.jpg`;
      const localFile = path.join(targetDir, filename);
      const publicPath = `/wayfinder/Poland-2026/images/${cityKey}/${category}/${filename}`;

      // Geocode
      const geo = await geocodePlace(rest.searchQuery || rest.name, cityKey);
      await delay(300);
      const finalAddress = geo ? geo.address : `${rest.name}, ${cityKey}, Poland`;
      const finalLat = geo ? geo.lat : (cityKey === 'poznan' ? 52.4082 : cityKey === 'torun' ? 53.0138 : 54.3520);
      const finalLng = geo ? geo.lng : (cityKey === 'poznan' ? 16.9335 : cityKey === 'torun' ? 18.5984 : 18.6466);

      // Fetch image
      let imgUrl = await searchWikipediaImage(rest.wikiImgQuery || rest.name);
      await delay(300);
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(rest.wikiImgQuery || rest.name);
        await delay(300);
      }
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(`${cityKey} ${rest.name}`);
        await delay(300);
      }
      if (!imgUrl) {
        imgUrl = await searchWikimediaImage(`${cityKey} restaurant food`);
        await delay(300);
      }

      if (imgUrl) {
        try {
          await downloadImage(imgUrl, localFile);
          console.log(`  -> Downloaded photo: ${localFile} (${fs.statSync(localFile).size} bytes)`);
        } catch (e) {
          console.error(`  -> Failed image download:`, e.message);
        }
      }

      const entry = {
        id: rest.id,
        name: rest.name,
        category: rest.category,
        categoryLabel: rest.categoryLabel,
        priceTier: rest.priceTier,
        priceEstimatePln: rest.priceEstimatePln,
        address: finalAddress,
        lat: finalLat,
        lng: finalLng,
        neighborhood: rest.neighborhood,
        cuisine: rest.cuisine,
        signature: rest.signature,
        description: rest.description,
        imageSrc: publicPath,
        imageUrl: publicPath
      };
      if (rest.websiteUrl) entry.websiteUrl = rest.websiteUrl;
      verifiedOutput[cityKey].restaurantsDetailed.push(entry);
    }
  }

  // Save generated verified JSON payload for injection
  const outPath = path.join(__dirname, 'verified-data.json');
  fs.writeFileSync(outPath, JSON.stringify(verifiedOutput, null, 2), 'utf-8');
  console.log(`\nSuccessfully wrote verified data to: ${outPath}`);
}

processAll().catch(console.error);
