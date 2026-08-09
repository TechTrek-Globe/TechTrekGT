const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'poland-2026.js');
let content = fs.readFileSync(filePath, 'utf8');

const wroclawData = `{
    id: 'wroclaw',
    name: 'Wrocław',
    nights: 2,
    base: 'Market Square or Cathedral Island',
    focus: 'Most fairytale-like stop: colorful square, bridges, dwarfs, Ostrów Tumski, and strong evening lights.',
    marketStrategy: 'First Wrocław Christmas Market evening, ideally 5 PM to 7 PM.',
    dates: 'Nov 21, 2026 - Jan 7, 2027',
    openingHours: 'Open 10am-9pm. Closed Dec 24/25. Opens 1pm on Dec 26.',
    hours: 'Open 10am-9pm. Closed Dec 24/25. Opens 1pm on Dec 26.',
    kaucja: '30 PLN (~$8.00 USD)',
    foodTargets: [
      'Konspira',
      'Karczma Lwowska',
      'Pod Fredrą',
      'Pierogarnia Stary Młyn',
      'Piwnica Świdnicka'
    ],
    hotels: [
      'The Bridge Wrocław MGallery',
      'Hotel Monopol Wrocław',
      'AC Hotel by Marriott Wrocław',
      'Radisson Blu Hotel Wrocław',
      'PURO Wrocław Stare Miasto',
      'B&B Hotel Wrocław Centrum'
    ],
    quickReference: {
      dates: 'Nov 21, 2026 - Jan 7, 2027',
      daylight: 'Sunrise ~7:40 AM | Sunset ~3:45 PM (~8 hrs daylight)',
      peakHours: '5:00 PM - 8:30 PM (Fairytale illuminations & dwarf hunt)',
      kaucja: '30 PLN (~$8.00 USD) deposit per mug (EXACT CASH REQUIRED)'
    },
    holidayClosures: {
      dec24: 'Market early closure (~2:00 PM). Shops close early.',
      dec25: 'Christmas Day: Market CLOSED. Museums closed.',
      dec26: 'Boxing Day: Market opens 1:00 PM - 9:00 PM.',
      dec31: "New Year's Eve: Market open through evening festivities.",
      jan1: "New Year's Day: Market opens 1:00 PM - 9:00 PM."
    },
    kaucjaCallout: {
      deposit: '30 PLN (~$8.00 USD)',
      notes: 'Exact cash required for mug deposit. Return mug to any official wooden stall to reclaim your cash deposit.'
    },
    culinaryHighlights: [
      {
        name: 'Grzaniec Wrocławski',
        phonetic: 'GZH-ah-nyets wroh-TSWAF-skee',
        english: 'Wrocław Spiced Mulled Wine',
        description: 'Signature heated red wine with citrus peel, cloves, and aromatic gingerbread spices served from traditional ceramic shoe-shaped mugs.',
        tip: 'Pay 30 PLN cash deposit for the keepsake shoe-shaped mug (butelka/kubek shoe).'
      },
      {
        name: 'Grzane Piwo z Przyprawami',
        phonetic: 'GZH-ah-neh PEE-voh z pshih-PRAH-vah-mee',
        english: 'Hot Spiced Wrocław Beer',
        description: 'Unfiltered dark lager warmed with honey, clove syrup, cinnamon, and orange slices. A unique Silesian winter warmer.',
        tip: 'Try it at the historic Browar Spiż or the Rynek market stalls.'
      },
      {
        name: 'Śląskie Niebo',
        phonetic: 'SHLOHNG-skyeh NYEH-boh',
        english: 'Silesian Heaven (Pork w/ Dried Fruit Gravy)',
        description: 'Traditional Silesian dish of braised pork shoulder served in a sweet-savory dried prune and apricot sauce with fluffy Silesian potato dumplings (Śląskie kluski).',
        tip: 'Order at Karczma Lwowska or Pod Fredrą.'
      },
      {
        name: 'Pierniczki Wrocławskie',
        phonetic: 'pyehr-NEECH-kee wroh-TSWAF-skyeh',
        english: 'Wrocław Spiced Gingerbread',
        description: 'Rich honey and spice gingerbread cookies stamped with iconic Wrocław dwarf motifs and dipped in dark chocolate or royal icing.',
        tip: 'Great souvenir gifts from the wooden stalls on Świdnicka street.'
      },
      {
        name: 'Oscypek z Żurawiną',
        phonetic: 'oh-STSYE-pek z zhoo-rah-VEE-noh',
        english: 'Grilled Highlander Cheese w/ Cranberry',
        description: "Smoked sheep's milk cheese grilled over charcoal and served hot with a dollop of sweet tart cranberry sauce.",
        tip: 'Best eaten piping hot right off the grill.'
      },
      {
        name: 'Kiełbasa Śląska z Grilla',
        phonetic: 'kyeow-BAH-sah SHLOHNG-skah z GREEL-lah',
        english: 'Grilled Silesian Sausage',
        description: 'Smoky pork sausage grilled over oak logs, served in a crusty roll with spicy Polish mustard.',
        tip: 'Pair with pickled cucumber (ogórek kiszony) for an authentic market snack.'
      }
    ],
    transit: {
      airport: 'Wrocław Copernicus Airport (WRO) is located 12 km west of the center. Take Express Bus 106 to Wrocław Główny central station (~35 mins, 4.60 PLN (~$1.20 USD)) or Uber/Bolt (~45-60 PLN (~$12-16 USD)).',
      cityTransit: 'Trams & buses are operated by MPK Wrocław. Single tickets cost 4.60 PLN (~$1.20 USD); 24-hr passes cost 15 PLN (~$4.00 USD). Purchase directly on board using contactless card tap on the yellow validators or via the Jakdojade app. Trams 6, 7, and 17 connect Wrocław Główny directly with Rynek and Ostrów Tumski.',
      station: 'Wrocław Główny is a stunning 1857 neo-Gothic palace station. Located 1.2 km south of Rynek (15-min walk along Świdnicka Street or a 5-min ride on Trams 6, 7, 11, or 17).'
    },
    practical: {
      weather: 'December in Wrocław averages -1°C to 5°C (30°F–41°F). The microclimate is slightly milder than eastern Poland, but river breezes off the Oder feel chilly. Layer warm clothing, windproof jacket, gloves, beanie, and sturdy waterproof footwear.',
      currency: 'Poland uses the Polish Złoty (PLN). Contactless card/mobile payments are accepted everywhere, but exact cash (30 PLN (~$8.00 USD)) is required for market mug deposits (Kaucja). Always choose "Pay in PLN" on card terminals to avoid DCC markups.',
      restrooms: 'Clean public WCs are available underneath Ratusz (Town Hall) at Rynek, at Plac Solny, and inside Wroclavia shopping mall at Central Station (2–4 PLN (~$0.50–$1.05 USD)).'
    },
    markets: [
      {
        id: 'wroclaw-rynek',
        name: 'Rynek Main Christmas Market (Jarmark Bożonarodzenowy)',
        location: 'Rynek (Main Market Square)',
        dates: 'Nov 21, 2026 - Jan 7, 2027',
        hours: '10:00 AM - 9:00 PM daily (Early close Dec 24, Closed Dec 25)',
        description: "One of Europe's most enchanting Christmas markets surrounding the massive Gothic Ratusz. Features a fairytale forest, a 3-story rotating wooden pyramid, glowing windmills, and over 150 wooden chalets.",
        highlights: ['3-Story Wooden Pyramid & Windmill', 'Fairytale Forest (Bajkowy Las)', 'Krasnal Prezentuś (Gift Dwarf)', 'Hot Spiced Mulled Wine in Shoe Mugs'],
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw.png'
      },
      {
        id: 'wroclaw-plac-solny',
        name: 'Plac Solny Christmas Market & Craft Village',
        location: 'Plac Solny (Salt Square)',
        dates: 'Nov 21, 2026 - Jan 7, 2027',
        hours: '10:00 AM - 9:00 PM daily',
        description: 'Adjacent to Rynek, Plac Solny transforms into a magical artisan craft village featuring woodcarvers, hand-blown glass ornaments, hot mead tastings, and the historic 24/7 flower market stalls.',
        highlights: ['Artisan Woodcarvings & Glass Ornaments', 'Hot Spiced Mead & Honey Wine', 'Historic 24/7 Flower Market', 'Cozy Fire Pit Lounge'],
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw-plac-solny.jpg'
      },
      {
        id: 'wroclaw-swidnicka',
        name: 'Świdnicka & Oławska Festive Pedestrian Avenues',
        location: 'ul. Świdnicka & ul. Oławska',
        dates: 'Nov 21, 2026 - Jan 7, 2027',
        hours: '10:00 AM - 9:00 PM daily',
        description: 'The pedestrian avenues radiating from Market Square are lined with festive arches, street food vendors selling grilled sausages, Silesian gingerbread, and handmade wool gifts.',
        highlights: ['Illuminated Festive Light Arches', 'Fresh Silesian Gingerbread (Pierniczki)', 'Handcrafted Woolen Mittens & Scarves', 'Street Musicians & Carolers'],
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw-swidnicka.jpg'
      }
    ],
    mustSee: [
      {
        id: 'wroclaw-ratusz',
        name: 'Wrocław Market Square & Old Town Hall (Ratusz)',
        title: 'Wrocław Market Square & Old Town Hall (Ratusz)',
        category: 'Historic Landmark',
        websiteUrl: 'https://muzeum.miejskie.wroclaw.pl/',
        description: 'One of the largest market squares in Europe, anchored by the magnificent 13th-century Gothic Ratusz with ornate astronomical clocks and colorful gingerbread-style merchant houses.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-market-square.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-market-square.jpg',
        location: 'Rynek (Old Town)',
        howToGetThere: 'In the heart of Stare Miasto, walkable from all central hotels.',
        pricing: 'Free to explore square; Ratusz Museum ~15 PLN (~$4.00 USD)',
        openTimes: 'Square open 24/7; Museum Wed-Sun 10:00 AM - 5:00 PM'
      },
      {
        id: 'ostrow-tumski',
        name: 'Ostrów Tumski (Cathedral Island) & Gas Lantern Lighter',
        title: 'Ostrów Tumski (Cathedral Island) & Gas Lantern Lighter',
        category: 'Historic Island & Tradition',
        websiteUrl: 'https://visitwroclaw.eu/en/place/ostrow-tumski-wroclaw',
        description: 'The oldest sacred quarter of Wrocław, connected by romantic bridges. Every evening at dusk, a cape-wearing lantern lighter manually ignites 103 real gas street lamps with a long pole torch.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/ostrow-tumski.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/ostrow-tumski.jpg',
        location: 'Ostrów Tumski',
        howToGetThere: '15-min walk from Rynek across Most Tumski (Tumski Bridge) or Tram 6/8/9.',
        pricing: 'Free access to island; Cathedral tower elevator ~15 PLN (~$4.00 USD)',
        openTimes: 'Island open 24/7; Gas lantern lighter walks at dusk (~4:00-4:30 PM in Dec)'
      },
      {
        id: 'wroclaw-dwarfs',
        name: 'Wrocław Dwarfs (Krasnale) Scavenger Hunt',
        title: 'Wrocław Dwarfs (Krasnale) Scavenger Hunt',
        category: 'Cultural Tradition & Fun',
        websiteUrl: 'https://krasnale.pl/en/',
        description: 'Over 600 tiny bronze dwarf statues hidden across window sills, lamp posts, and doorways, commemorating the anti-communist Orange Alternative movement of the 1980s.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-dwarfs.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-dwarfs.jpg',
        location: 'Citywide (Old Town, Rynek, Bridges)',
        howToGetThere: 'Found everywhere on foot while exploring the city center.',
        pricing: 'Free; official dwarf map apps available (Krasnale Wrocław app)',
        openTimes: '24/7 year-round'
      },
      {
        id: 'tumski-bridge',
        name: "Tumski Bridge (Lover's Bridge) & Oder Riverfront",
        title: "Tumski Bridge (Lover's Bridge) & Oder Riverfront",
        category: 'Historic Bridge & Promenade',
        websiteUrl: 'https://visitwroclaw.eu/en/place/tumski-bridge',
        description: 'A charming 19th-century green iron bridge crossing the Oder River to Cathedral Island. Offers stunning night reflections of gothic spires over illuminated waters.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/tumski-bridge.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/tumski-bridge.jpg',
        location: 'Oder River / Ostrów Tumski',
        howToGetThere: '12-min walk northeast from Rynek.',
        pricing: 'Free',
        openTimes: 'Open 24/7'
      },
      {
        id: 'centennial-hall',
        name: 'Centennial Hall (Hala Stulecia - UNESCO)',
        title: 'Centennial Hall (Hala Stulecia - UNESCO)',
        category: 'UNESCO World Heritage',
        websiteUrl: 'https://halastulecia.pl/en/',
        description: 'A landmark early 20th-century reinforced concrete dome masterpiece by Max Berg, surrounded by Szczytnicki Park and winter light displays.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/centennial-hall.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/centennial-hall.jpg',
        location: 'Szczytnicki Park',
        howToGetThere: 'Tram 2, 4, or 10 from Rynek to Hala Stulecia stop (~15 mins).',
        pricing: 'Visitor center & museum ~25 PLN (~$6.70 USD); Park grounds free',
        openTimes: 'Visitor center 10:00 AM - 5:00 PM'
      },
      {
        id: 'panorama-raclawice',
        name: 'Panorama of Racławice (Panorama Racławicka)',
        title: 'Panorama of Racławice (Panorama Racławicka)',
        category: 'Masterpiece Art Museum',
        websiteUrl: 'https://mnwr.pl/en/branches/panorama-of-raclawice/',
        description: 'A colossal 360-degree panoramic rotunda painting (15x114 meters) depicting the 1794 Battle of Racławice with special lighting and terrain effects.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/panorama-raclawice.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/panorama-raclawice.jpg',
        location: 'Juliusz Słowacki Park',
        howToGetThere: '10-min walk east from Rynek or Tram 3/5.',
        pricing: '50 PLN (~$13.35 USD) incl. audio guide (advance booking required)',
        openTimes: 'Tue-Sun 8:30 AM - 6:00 PM'
      },
      {
        id: 'wroclaw-walking-tour',
        name: 'Wrocław Christmas Market & Dwarf Hunting Guided Tour',
        title: 'Wrocław Christmas Market & Dwarf Hunting Guided Tour',
        category: 'Top Rated Guided Tour',
        description: 'Top-rated 2-hour guided walking tour through illuminated Rynek market stalls, historic passages, dwarf legends, and mulled wine tastings.',
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/walking-tour.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/walking-tour.jpg',
        location: 'Rynek (Old Town)',
        howToGetThere: 'Departs from the Aleksander Fredro Statue in Rynek.',
        pricing: '70–90 PLN (~$18.00–$24.00 USD) per person',
        openTimes: 'Departs 11:00 AM & 4:00 PM daily (2 hrs)',
        gygUrl: 'https://www.getyourguide.com/s/?q=Wroclaw+Christmas+Market+walking+tour',
        viatorUrl: 'https://www.viator.com/searchResults/all?text=Wroclaw+Christmas+Market+walking+tour'
      }
    ],
    restaurants: ['Konspira', 'Karczma Lwowska', 'Pod Fredrą', 'Pierogarnia Stary Młyn', 'Piwnica Świdnicka'],
    wroclawHotelsDetailed: [
      {
        id: 'the-bridge-wroclaw',
        name: 'The Bridge Wrocław MGallery',
        tier: 'luxury',
        tierLabel: '5-Star Modern Luxury',
        address: 'Plac Katedralny 8 (Cathedral Island)',
        neighborhood: 'Ostrów Tumski',
        stars: 5,
        websiteUrl: 'https://thebridgewroclaw.pl/en/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/the-bridge.jpg',
        basePricePln: 950,
        memberPricePln: 850,
        currency: 'PLN',
        usdEstimateBase: 240,
        usdEstimateMember: 215,
        description: 'A striking modern addition to historic Cathedral Island. Features exceptional views of the river and gothic spires, luxurious wellness facilities, and easy walking access to the Market Square.',
        signatureFeature: 'Rooftop views of Cathedral Island',
        amenities: ['Wellness Center & Spa', 'River Views', 'Gourmet Restaurant', 'Rooftop Bar'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '1.2 km', time: '15 min walk' },
          attractions: [
            { name: 'Wrocław Cathedral', distance: '100m', time: '1 min walk' },
            { name: 'Tumski Bridge', distance: '300m', time: '4 min walk' }
          ]
        }
      },
      {
        id: 'hotel-monopol-wroclaw',
        name: 'Hotel Monopol Wrocław',
        tier: 'luxury',
        tierLabel: '5-Star Historic Elegance',
        address: 'H. Modrzejewskiej 2 (Old Town)',
        neighborhood: 'Stare Miasto',
        stars: 5,
        websiteUrl: 'https://monopolwroclaw.hotel.com.pl/en/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/monopol.jpg',
        basePricePln: 850,
        memberPricePln: 760,
        currency: 'PLN',
        usdEstimateBase: 215,
        usdEstimateMember: 195,
        description: 'A legendary 19th-century Neo-Baroque hotel situated right next to the Opera House. Boasts magnificent architecture, an underground pool, and historic charm.',
        signatureFeature: 'Neo-Baroque heritage & rooftop terraces',
        amenities: ['Underground Spa Pool', 'Rooftop Terrace', 'Historic Architecture', 'Fine Dining'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '500m', time: '6 min walk' },
          attractions: [
            { name: 'Wrocław Opera', distance: '50m', time: '1 min walk' }
          ]
        }
      },
      {
        id: 'radisson-blu-wroclaw',
        name: 'Radisson Blu Hotel Wrocław',
        tier: 'luxury',
        tierLabel: '5-Star Parkside Retreat',
        address: 'ul. Purkyniego 10 (Park District)',
        neighborhood: 'Stare Miasto / Parkside',
        stars: 5,
        websiteUrl: 'https://www.radissonhotels.com/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/radisson-blu.jpg',
        basePricePln: 780,
        memberPricePln: 700,
        currency: 'PLN',
        usdEstimateBase: 195,
        usdEstimateMember: 175,
        description: 'Overlooking Juliusz Słowacki Park opposite Panorama Racławicka. Offers spacious modern suites, courtyard dining, and underground parking.',
        signatureFeature: 'Parkside tranquility near Panorama Racławicka',
        amenities: ['Fitness Center & Sauna', 'Courtyard Restaurant', 'Underground Parking', 'Pet Friendly'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '750m', time: '9 min walk' },
          attractions: [
            { name: 'Panorama Racławicka', distance: '100m', time: '1 min walk' },
            { name: 'National Museum', distance: '250m', time: '3 min walk' }
          ]
        }
      },
      {
        id: 'ac-hotel-wroclaw',
        name: 'AC Hotel by Marriott Wrocław',
        tier: 'mid',
        tierLabel: 'Premium Modern Comfort',
        address: 'Plac Wolności 10',
        neighborhood: 'Stare Miasto',
        stars: 4,
        websiteUrl: 'https://www.marriott.com/en-us/hotels/wroaw-ac-hotel-wroclaw/overview/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/ac-hotel.jpg',
        basePricePln: 550,
        memberPricePln: 490,
        currency: 'PLN',
        usdEstimateBase: 140,
        usdEstimateMember: 125,
        description: 'Housed in a beautifully restored historic building with modern interiors. Features an indoor pool, excellent breakfast, and a location steps away from the National Forum of Music.',
        signatureFeature: 'Historic facade with sleek modern interiors',
        amenities: ['Indoor Pool', 'Winery Bar', 'Fitness Center', 'European Breakfast'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '600m', time: '8 min walk' },
          attractions: [
            { name: 'National Forum of Music', distance: '100m', time: '1 min walk' }
          ]
        }
      },
      {
        id: 'art-hotel-wroclaw',
        name: 'Art Hotel Wrocław',
        tier: 'mid',
        tierLabel: 'Boutique Heritage Hotel',
        address: 'ul. Kiełbaśnicza 20',
        neighborhood: 'Stare Miasto (50m from Rynek)',
        stars: 4,
        websiteUrl: 'https://www.arthotel.wroclaw.pl/en/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/art-hotel.jpg',
        basePricePln: 480,
        memberPricePln: 420,
        currency: 'PLN',
        usdEstimateBase: 120,
        usdEstimateMember: 105,
        description: 'Charming boutique hotel located in two restored 16th-century townhouses just steps from Main Square. Renowned for its artistic decor and Silesian cuisine.',
        signatureFeature: '16th-century Renaissance townhouse charm',
        amenities: ['Artisanal Breakfast', 'Art Gallery Lounge', 'Free Wi-Fi', 'Room Service'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '100m', time: '1 min walk' }
        }
      },
      {
        id: 'puro-wroclaw',
        name: 'PURO Wrocław Stare Miasto',
        tier: 'mid',
        tierLabel: 'Scandinavian Design Hotel',
        address: 'ul. Włodkowica 6',
        neighborhood: 'Four Denominations District',
        stars: 4,
        websiteUrl: 'https://purohotel.pl/en/wroclaw/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/puro-wroclaw.jpg',
        basePricePln: 520,
        memberPricePln: 460,
        currency: 'PLN',
        usdEstimateBase: 130,
        usdEstimateMember: 115,
        description: 'Sleek design-led hotel in the vibrant Four Denominations Quarter. Features iPad room controls, free bicycles, and a garden terrace near White Stork Synagogue.',
        signatureFeature: 'Courtyard garden & smart room automation',
        amenities: ['Garden Terrace', 'Boutique Coffee Bar', 'Free Bicycles', 'Smart Room Tech'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '500m', time: '6 min walk' },
          attractions: [
            { name: 'White Stork Synagogue', distance: '80m', time: '1 min walk' }
          ]
        }
      },
      {
        id: 'bb-hotel-wroclaw',
        name: 'B&B Hotel Wrocław Centrum',
        tier: 'budget',
        tierLabel: 'Value Central Stay',
        address: 'ul. Piotra Skargi 24',
        neighborhood: 'Dominikański Quarter',
        stars: 2,
        websiteUrl: 'https://www.hotel-bb.com/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/bb-hotel.jpg',
        basePricePln: 240,
        memberPricePln: 210,
        currency: 'PLN',
        usdEstimateBase: 60,
        usdEstimateMember: 52,
        description: 'Clean, modern, and highly cost-effective hotel within walking distance of Old Town and Galeria Dominikańska.',
        signatureFeature: 'Exceptional budget-to-location value',
        amenities: ['Air Conditioning', 'Free High-Speed Wi-Fi', 'Buffet Breakfast', '24/7 Reception'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '700m', time: '9 min walk' }
        }
      },
      {
        id: 'hostel-mleczarnia',
        name: 'Hostel Mleczarnia',
        tier: 'budget',
        tierLabel: 'Vintage Literary Hostel & Rooms',
        address: 'ul. Włodkowica 8',
        neighborhood: 'Four Denominations District',
        stars: 2,
        websiteUrl: 'https://mleczarniahostel.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/hostel-mleczarnia.jpg',
        basePricePln: 180,
        memberPricePln: 160,
        currency: 'PLN',
        usdEstimateBase: 45,
        usdEstimateMember: 40,
        description: 'Atmospheric vintage hostel with pre-war lace curtains, antique furniture, and private rooms right above the popular Mleczarnia garden café.',
        signatureFeature: 'Pre-war vintage literary aesthetic',
        amenities: ['Garden Cafe', 'Free Wi-Fi', 'Shared Kitchen', 'Luggage Storage'],
        proximity: {
          rynekMarket: { name: 'Main Market Square', distance: '550m', time: '7 min walk' }
        }
      }
    ],
    wroclawUniqueStays: [
      {
        id: 'wroclaw-water-tower',
        name: 'The Water Tower Apartment (Wieża Ciśnień)',
        type: 'Architectural Heritage',
        typeLabel: '19th-Century Tower Stay',
        neighborhood: 'Borek District (South Wrocław)',
        priceRange: '420-580 PLN/night',
        priceUsd: '$105-$145',
        bookingUrl: 'https://visitwroclaw.eu/en/place/water-tower-wroclaw',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/water-tower.jpg',
        description: 'Stay inside a historic renovated 1897 neo-Gothic water tower, offering panoramic 360-degree views over Wrocław and the distant Sudeten mountains.',
        whyUnique: "One of Silesia's finest industrial brick architecture monuments converted into luxury panorama suites.",
        vibe: 'Industrial Gothic & Panoramic',
        bestFor: ['Architecture lovers', 'Couples', 'Panoramic photo enthusiasts'],
        highlights: ['360° Panoramic Tower Views', 'Neo-Gothic Red Brick Vaulting', 'Luxury Interior Design'],
        travelNote: '10 min tram ride (Tram 2 or 7) from Main Market Square'
      },
      {
        id: 'monastery-guesthouse',
        name: 'Dom Sample Monastery Guesthouse - Cathedral Island',
        type: 'Sacred Peace Stay',
        typeLabel: 'Cathedral Island Quiet Retreat',
        neighborhood: 'Ostrów Tumski',
        priceRange: '280-380 PLN/night',
        priceUsd: '$70-$95',
        bookingUrl: 'https://visitwroclaw.eu/en/place/ostrow-tumski-wroclaw',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/monastery-guesthouse.jpg',
        description: 'Peaceful guesthouse set in a tranquil historic cobblestone courtyard on Cathedral Island, steps away from the gas lantern bridge.',
        whyUnique: 'Experience the quiet evening enchantment of Cathedral Island after day visitors leave.',
        vibe: 'Serene & Historic',
        bestFor: ['Peace seekers', 'Solo travelers', 'History buffs'],
        highlights: ['Gas-lit street lamps at door', 'Spiritual tranquility', 'River garden walk'],
        travelNote: '12 min walk across Tumski Bridge to Market Square'
      },
      {
        id: 'houseboat-odra',
        name: 'Floating Odra River Houseboat Suite',
        type: 'Riverfront Stay',
        typeLabel: 'Luxury Floating Residence',
        neighborhood: 'Oder River Promenade',
        priceRange: '500-750 PLN/night',
        priceUsd: '$125-$190',
        bookingUrl: 'https://visitwroclaw.eu/en/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/houseboat-odra.jpg',
        description: 'Modern eco-friendly floating home moored on the Oder River with floor-to-ceiling glass windows facing illuminated gothic spires.',
        whyUnique: 'Fall asleep to gentle water reflections and wake up to swans on the Oder River.',
        vibe: 'Modern Water-Front Luxury',
        bestFor: ['Romantic getaways', 'Nature & urban mix lovers'],
        highlights: ['Private river deck', 'Floor-to-ceiling river views', 'Heated floors & fireplace'],
        travelNote: '5 min walk to Main Market Square'
      }
    ],
    wroclawRestaurantsDetailed: [
      {
        id: 'konspira',
        name: 'Konspira',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Iconic',
        priceTier: '$$',
        priceEstimatePln: '45 - 85 PLN per person',
        address: 'Plac Solny 6/7 (Old Town)',
        neighborhood: 'Stare Miasto (Plac Solny)',
        cuisine: 'Anti-Communist Resistance & Polish Comfort Food',
        signature: 'Solidarność Ribs, Giant Pierogi Platter, Bigos in Bread Bowl',
        description: 'Immersive restaurant themed around the 1980s Polish anti-communist Solidarity movement. Hidden passageways behind secret bookcases, vintage radio broadcasts, and hearty traditional Polish cooking.',
        websiteUrl: 'https://restauracjakonspira.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/konspira.jpg'
      },
      {
        id: 'karczma-lwowska',
        name: 'Karczma Lwowska',
        category: 'local',
        categoryLabel: 'Historic Market Square Tavern',
        priceTier: '$$',
        priceEstimatePln: '50 - 95 PLN per person',
        address: 'Rynek 4 (Main Market Square)',
        neighborhood: 'Stare Miasto (Rynek)',
        cuisine: 'Traditional Polish & Lwów Borderlands',
        signature: "Hunter's Stew (Bigos), Lwów-Style Roast Duck with Apples, Wild Mushroom Soup",
        description: 'Rustic wooden timbered tavern located directly on Market Square, serving hearty pre-war Lwów borderlands recipes since 1999.',
        websiteUrl: 'https://lwowska.com.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/karczma-lwowska.jpg'
      },
      {
        id: 'pod-fredra',
        name: 'Pod Fredrą',
        category: 'steak',
        categoryLabel: 'Hearth-Grilled Meats & Steaks',
        priceTier: '$$$',
        priceEstimatePln: '90 - 180 PLN per person',
        address: 'Rynek 37 (Town Hall South Facade)',
        neighborhood: 'Stare Miasto (Rynek)',
        cuisine: 'Oak Wood Flame Grills & Prime Polish Steaks',
        signature: 'Wood-Fired Seasoned Pork Knuckle (Golonka), Dry-Aged Ribeye Steak, House Smoked Sausages',
        description: 'Located right next to the Town Hall, featuring open hearth fires where prime Polish meats and game are roasted over seasoned beechwood and oak coals.',
        websiteUrl: 'https://podfredra.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/pod-fredra.jpg'
      },
      {
        id: 'pierogarnia-stary-mlyn',
        name: 'Pierogarnia Stary Młyn',
        category: 'cheap',
        categoryLabel: 'Hand-Crafted Pierogi House',
        priceTier: '$',
        priceEstimatePln: '25 - 45 PLN per person',
        address: 'Rynek 26 (Main Square)',
        neighborhood: 'Stare Miasto',
        cuisine: 'Baked & Boiled Traditional Pierogi',
        signature: 'Opiekane (Crispy Baked Pierogi), Ruskie with Crispy Onions, Sweet Cottage Cheese Dumplings',
        description: 'Famous pierogi bakery where dumplings are rolled by hand and either boiled or baked in clay ovens until golden and bubbling.',
        websiteUrl: 'https://www.pierogarnie.com/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/pierogarnia-stary-mlyn.jpg'
      },
      {
        id: 'piwnica-swidnicka',
        name: 'Piwnica Świdnicka',
        category: 'expensive',
        categoryLabel: "Europe's Oldest Restaurant (Est. 1273)",
        priceTier: '$$$',
        priceEstimatePln: '100 - 220 PLN per person',
        address: 'Rynek-Ratusz 1 (Town Hall Cellars)',
        neighborhood: 'Stare Miasto (Underground Ratusz)',
        cuisine: 'Medieval Royal Polish & Craft Brewery',
        signature: 'Royal Roast Wild Boar, Silesian Heaven (Śląskie Niebo), White Wine Steamed Mussels',
        description: 'Operating continuously in the brick vaults beneath Wrocław Town Hall since 1273. Fryderyk Chopin, Goethe, and Polish kings dined here over 700 years of history.',
        websiteUrl: 'https://piwnicaswidnicka.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/piwnica-swidnicka.jpg'
      }
    ],
    wroclawDrinksDetailed: [
      {
        id: 'spiz',
        name: 'Browar Spiż',
        category: 'brewery',
        categoryLabel: 'Cellar Microbrewery & Pub',
        priceTier: '$$',
        priceEstimatePln: '20 - 45 PLN per person',
        address: 'Rynek 41 (Town Hall Cellars)',
        neighborhood: 'Stare Miasto (Rynek)',
        drinkType: 'Unfiltered Craft Beer & Lardo Bread',
        signature: 'Spiż Honey Lager, Miodowe Dark Beer, Fresh Sourdough Bread with Lardo (Smalec)',
        description: 'Wrocław’s pioneer microbrewery located in the gothic cellars of Ratusz. Every craft beer comes with a complimentary thick slice of fresh sourdough bread topped with seasoned smalec.',
        websiteUrl: 'https://spiz.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/spiz.jpg'
      },
      {
        id: 'przedwojenna',
        name: 'Przedwojenna',
        category: 'vodka-house',
        categoryLabel: '24/7 Retro Vodka Bistro',
        priceTier: '$',
        priceEstimatePln: '15 - 35 PLN per person',
        address: 'św. Mikołaja 1 (Opposite Garrison Church)',
        neighborhood: 'Stare Miasto',
        drinkType: 'Chilled Polish Vodkas & Vintage Tapas',
        signature: 'Soplica Hazelnut Vodka Shots, Beef Tartare (Tatar), Herring in Oil (Śledź)',
        description: '24/7 pre-war retro bistro with nostalgic decor, serving flat-rate chilled Polish vodkas and classic drinking bites like beef tartare and Gzik cheese.',
        websiteUrl: 'https://przedwojenna.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/przedwojenna.jpg'
      },
      {
        id: 'alegrano',
        name: 'AleGrano Tap Bar',
        category: 'pub-bars',
        categoryLabel: 'Polish Craft Beer Cellar',
        priceTier: '$$',
        priceEstimatePln: '22 - 48 PLN per pint',
        address: 'ul. Kazimierza Wielkiego 39',
        neighborhood: 'Stare Miasto',
        drinkType: 'Regional Polish Craft Beers on Tap',
        signature: '16 Rotating Polish Craft Taps, Hazy IPAs, Imperial Baltic Stouts',
        description: 'Vibrant craft beer haven showcasing independent microbreweries from across Poland in an atmospheric brick cellar setting.',
        websiteUrl: 'https://alegrano.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/alegrano.jpg'
      }
    ],
    wroclawCafesDetailed: [
      {
        id: 'cafe-targowa',
        name: 'Café Targowa',
        category: 'coffee-breakfast',
        categoryLabel: 'World-Class Specialty Coffee',
        priceTier: '$',
        priceEstimatePln: '15 - 35 PLN per person',
        address: 'ul. Piaskowa 17 (Hala Targowa Stand 30)',
        neighborhood: 'Market Hall (Hala Targowa)',
        cuisine: 'Aeropress World Champion Coffee & Pastries',
        signature: 'Aeropress Single-Origin Brew, Flat White, Freshly Baked Cinnamon Buns',
        description: 'Run by World Aeropress Champion Filip Śwojak inside the historic 1908 brick Market Hall. Renowned for serving the finest specialty coffee in Silesia.',
        websiteUrl: 'https://cafetargowa.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/cafe-targowa.jpg'
      },
      {
        id: 'gniazdo',
        name: 'Gniazdo',
        category: 'coffee-breakfast',
        categoryLabel: 'Modern Artisan Breakfast & Espresso Bar',
        priceTier: '$$',
        priceEstimatePln: '25 - 50 PLN per person',
        address: 'Świdnicka 36 (Near Opera)',
        neighborhood: 'Stare Miasto',
        cuisine: 'Artisan Breakfast & Specialty Espresso',
        signature: 'Avocado & Poached Eggs on Sourdough, Espresso Tonic, Matcha Latte, Homemade Tartlets',
        description: 'Stylish, light-filled coffee house on Świdnicka street serving gourmet morning breakfasts, avocado toasts, and single-origin pour-overs.',
        websiteUrl: 'https://gniazdo.cafe/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/hotels/gniazdo.jpg'
      }
    ],
    lgbtq: {
      title: 'Wrocław Queer & Cultural Scene',
      description: "Wrocław is one of Poland's most progressive and welcoming cities, featuring vibrant rainbow-friendly cultural centers around the Four Denominations District.",
      spots: [
        {
          name: 'Surowiec',
          category: 'Cultural Club & Bar',
          address: 'ul. Ruska 46A',
          description: 'Alternative art space, cocktail bar, and queer-friendly dance floor in the Ruska 46 neon courtyard.'
        },
        {
          name: 'Bezsenność',
          category: 'Retro Cocktail Lounge',
          address: 'ul. Ruska 51',
          description: 'Vintage speakeasy lounge attracting a diverse, open-minded crowd in the heart of the nightlife quarter.'
        }
      ]
    }
  }`;

const startIdx = content.indexOf("id: 'wroclaw'");
const openBrace = content.lastIndexOf('{', startIdx);

let depth = 0;
let endBrace = -1;
for (let i = openBrace; i < content.length; i++) {
  if (content[i] === '{') depth++;
  else if (content[i] === '}') {
    depth--;
    if (depth === 0) {
      endBrace = i;
      break;
    }
  }
}

if (openBrace !== -1 && endBrace !== -1) {
  content = content.slice(0, openBrace) + wroclawData + content.slice(endBrace + 1);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated wroclaw section in poland-2026.js!');
} else {
  console.error('Failed to locate bounds of wroclaw object.');
}
