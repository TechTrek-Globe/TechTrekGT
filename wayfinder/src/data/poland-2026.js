export const polandJourney = {
  id: 'poland-christmas-2026',
  title: 'Poland: A Christmas Journey',
  tagline: 'Winter Markets, Historic Cities, and Scenic Rails',
  description: 'A curated winter expedition traversing Poland from south to north. Experience the medieval grandeur of Kraków, the fairytale bridges of Wrocław, the vibrant squares of Poznań, a daytime stop in gingerbread-famed Toruń, and a coastal finale in the Hanseatic city of Gdańsk.',
  dates: 'December 2026', // Public dates only
  
  route: [
    {
      id: 'krakow',
      name: 'Kraków',
      nights: 3,
      base: 'Old Town or Kazimierz',
      focus: 'Biggest historic start: Rynek Główny, Wawel, cafés, market atmosphere, and optional deeper history day.',
      marketStrategy: 'First Christmas market pass. Keep dinner simple with pierogi, grilled oscypek, or mulled wine snacks.',
      foodTargets: ['Morskie Oko', 'Pod Wawelem', 'Czarna Kaczka', 'Plac Nowy Zapiekanki'],
      hotels: ['Hotel Stary', 'Hotel Copernicus', 'Sheraton Grand Kraków', 'PURO Kraków Stare Miasto'],
      history: 'Kraków was the royal capital of Poland for over 500 years until 1596. Miraculously preserved during WWII, its entire Old Town (Stare Miasto) is a UNESCO World Heritage site boasting Europe\'s largest medieval market square (Rynek Główny), the legendary Wawel Royal Castle, and the historic Jewish Quarter of Kazimierz. Its Christmas Market tradition dates back centuries as a vibrant gathering place for craftsmen across Central Europe.',
      transit: {
        airport: 'Direct SKA1 train from Kraków Airport (KRK) to Kraków Główny central station runs every 30 mins (17-min journey, ~17 PLN ticket).',
        cityTransit: 'Trams & buses managed by ZTP Kraków. Use 24-hr (~17 PLN) or 72-hr (~50 PLN) passes. Trams 1, 3, 8, 13, and 24 connect Old Town directly with Kazimierz.',
        station: 'Kraków Główny train station is directly attached to Galeria Krakowska and is a flat 5-minute walk to the Barbican and Planty Park entry to Old Town.'
      },
      practical: {
        weather: 'December in Kraków averages -2°C to 4°C (28°F–39°F) with brisk evening winds off the Vistula. Thermal base layers, fleece-lined waterproof boots for wet cobblestones, a windproof coat, gloves, and a beanie are recommended for evening strolls.',
        currency: 'Poland uses the Polish Złoty (PLN). Contactless card payment (Apple/Google Pay) is accepted at ~90% of stalls, but keep 20–50 PLN cash for mug deposits and small craft vendors. Always select "Pay in PLN" on card readers to avoid 5-10% DCC markups.',
        restrooms: 'Underground public WC is located beneath Sukiennice (Cloth Hall) on Main Square, and at Galeria Krakowska central station (2–4 PLN fee, contactless card accepted).'
      },
      markets: [
        {
          id: 'rynek-glowny',
          name: 'Rynek Główny Main Market',
          location: 'Grand Main Square (Old Town)',
          hours: 'Late Nov – Dec 26 | Daily 10:00 AM – 10:00 PM',
          address: 'Rynek Główny 1, 31-042 Kraków (Tram: Teatr Bagatela or Dworzec Główny)',
          mustTry: ['Oscypek with warm cranberry jam', 'Sizzling Pierogi', 'Grzaniec Galicyjski mulled wine', 'Krakowska Sausage'],
          souvenirs: ['Hand-blown glass ornaments (Bombki)', 'Baltic Amber jewelry', 'Carved wooden kitchenware & boxes', 'Wool slippers'],
          unescoTradition: 'UNESCO Intangible Cultural Heritage: Szopki Krakowskie (Christmas Cribs). The annual competition takes place on the first Thursday of December (Dec 3, 2026) at the Mickiewicz monument, followed by an exhibition at Krzysztofory Palace.',
          tips: 'Peak crowds are 5:30 PM - 8:00 PM. Hot drink mugs require a 20 PLN cash deposit (refundable upon returning the mug). Stage caroling occurs daily around 5:00 PM / 6:00 PM. Dec 24 hours: 10:00 AM - 3:00 PM; Dec 25-26: 12:00 PM - 9:00 PM.',
          specialty: 'Hand-carved wooden trinkets, Baltic amber, hand-blown glass ornaments (Bombki), and piping hot Grzaniec Galicyjski.',
          details: 'The crown jewel of Polish Christmas markets! Over 100 wooden chalets surround the Renaissance Cloth Hall (Sukiennice) under the illuminated towers of St. Mary\'s Basilica. Feast on grilled Oscypek smoked cheese with cranberry jam, sizzling pierogi, and roasted kielbasa while carols echo across the square.'
        },
        {
          id: 'maly-rynek',
          name: 'Mały Rynek Craft Corner',
          location: 'Small Square (Behind St. Mary\'s)',
          hours: 'Late Nov – Dec 26 | Daily 11:00 AM – 9:00 PM',
          address: 'Mały Rynek, 31-041 Kraków (2-min walk from Main Square)',
          mustTry: ['Miód Pitny (Hot Spiced Mead)', 'Artisanal Ginger Cookies', 'Regional Honey Tides', 'Highlander Mountain Cheeses'],
          souvenirs: ['Small-batch honeys & beeswax candles', 'Hand-loomed wool scarves', 'Wooden toys', 'Artisan pottery'],
          tips: 'Much quieter and less crowded than the Main Square. Ideal spot to sip hot spiced mead without long lines and sample local organic honey jams.',
          specialty: 'Artisanal honeys, hot spiced mead (Miód Pitny), organic gingerbread, and boutique hand-loomed woolens.',
          details: 'A cozy, intimate extension located just behind St. Mary\'s Basilica. Mały Rynek focuses on regional food producers, small-batch gingerbread bakers, and master craftsmen selling one-of-a-kind wooden toys and wool slippers.'
        },
        {
          id: 'kazimierz-wolnica',
          name: 'Plac Wolnica Market',
          location: 'Kazimierz (Jewish Quarter)',
          specialty: 'Vintage antiques, indie artisan crafts, craft beer stalls, and gourmet local street food.',
          hours: 'Dec 1 – Dec 24 | Daily 12:00 PM – 9:00 PM',
          address: 'Plac Wolnica, 31-060 Kraków (Tram: Plac Wolnica - Trams 1, 6, 8, 10, 13)',
          mustTry: ['Plac Nowy Zapiekanki', 'Craft Mulled Cider', 'Gourmet Pierogi flavors', 'Local Winter Stouts'],
          souvenirs: ['Retro vintage vinyl & antiques', 'Handmade ceramic mugs', 'Eco-friendly beeswax wraps', 'Indie jewelry'],
          tips: 'Located in the historic Jewish Quarter. Combine a market visit with dinner at nearby historic Jewish quarter restaurants, craft stouts, and late-night Zapiekanki at Plac Nowy.',
          details: 'Set in the historic heart of Kazimierz, this market offers a bohemian, relaxed holiday atmosphere. Browse vintage vinyl, handmade ceramics, and indie art while sipping hot spiced cider or craft stouts.'
        },
        {
          id: 'podgorze',
          name: 'Rynek Podgórski Fair',
          location: 'Podgórze District (Across Vistula)',
          specialty: 'Family-friendly workshops, local bakery treats, caroling performances, and handcrafted wooden ornaments.',
          hours: 'Dec 5 – Dec 22 | Fri - Sun 11:00 AM – 8:00 PM',
          address: 'Rynek Podgórski, 30-518 Kraków (Tram: Korona or Rynek Podgórski)',
          mustTry: ['Traditional Makowiec (Poppy seed cake)', 'Hot Spiced Apple Cider', 'Warm Pretzels', 'Grilled Highlander Skewers'],
          souvenirs: ['Handcrafted wooden Christmas tree stars', 'Hand-painted glass trinkets', 'Knitted winter mittens'],
          tips: 'Framed by the breathtaking neo-gothic spire of St. Joseph\'s Church. Features a retro 19th-century Victorian carousel for kids, neighborhood baking workshops, and live local choir caroling.',
          details: 'Located in front of the fairytale-like St. Joseph\'s Church, this neighborhood fair highlights local Krakow artisans, community choirs, and festive baking workshops.'
        }
      ],
      mustSee: [
        {
          name: 'Wawel Royal Castle & Cathedral',
          category: 'Royal Heritage',
          description: 'The ancient seat of Polish kings overlooking the Vistula River. Explore the Italian Renaissance courtyard, royal state rooms, and the dragon\'s den statue that breathes real fire.'
        },
        {
          name: 'St. Mary\'s Basilica (Kościół Mariacki)',
          category: 'Architecture & Tradition',
          description: 'Iconic twin-towered gothic basilica on Rynek Główny. Step inside to marvel at the 15th-century carved wooden Veit Stoss altarpiece, and listen for the hourly trumpet call (Hejnał Mariacki).'
        },
        {
          name: 'Cloth Hall (Sukiennice) & Rynek Underground',
          category: 'Museums & Shopping',
          description: 'A 14th-century merchant hub selling amber and carved wood; underneath it lies a state-of-the-art medieval archaeological museum buried 4 meters under the square.'
        },
        {
          name: 'Kazimierz (Historic Jewish Quarter)',
          category: 'Culture & Nightlife',
          description: 'Atmospheric cobblestone streets packed with historic synagogues, art galleries, cozy cellar bars, and the famous Plac Nowy Zapiekanki food plaza.'
        },
        {
          name: 'Planty Park & Barbican Fortress',
          category: 'Scenic Walk',
          description: 'A 4-kilometer ring of parkland surrounding Old Town where medieval walls once stood, leading to the formidable 15th-century round Barbican defense tower.'
        }
      ],
      restaurants: [
        {
          name: 'Morskie Oko',
          price: '$$',
          cuisine: 'Highlander Polish (Podhale Region)',
          signature: 'Góralski Pierogi, Roasted Duck with Apples, Grilled Oscypek with Cranberries, Lamb Shank.',
          notes: 'Atmospheric wooden log cabin interior with live highlander folk musicians and crackling stone fireplaces.'
        },
        {
          name: 'Czarna Kaczka (The Black Duck)',
          price: '$$ - $$$',
          cuisine: 'Classic Royal Polish',
          signature: 'Roasted Half Duck with Red Cabbage & Plum Sauce, Wild Mushroom Soup in Bread Bowl.',
          notes: 'Elegant, romantic Old Town dining specializing in traditional Polish game and fowl recipes.'
        },
        {
          name: 'Pod Wawelem',
          price: '$ - $$',
          cuisine: 'Traditional Polish Tavern',
          signature: 'Giant Schnitzels, Grilled Meat Skewers (Szaszłyk), Crispy Pork Knuckle (Golonka), Draft Beers.',
          notes: 'Lively, festive hall situated right at the foot of Wawel Castle. Generous portions and family friendly.'
        },
        {
          name: 'Plac Nowy Zapiekanki (Kazimierz)',
          price: '$',
          cuisine: 'Polish Street Food Classic',
          signature: 'Toasted Zapiekanki baguettes with sautéed mushrooms, melted cheese, chives, and garlic sauce.',
          notes: 'Essential Krakow late-night snack served from the central rotunda in Kazimierz.'
        }
      ],
      imageDetails: {
        location: 'Wawel Hill & Vistula River',
        landmark: 'Wawel Royal Castle & Wawel Cathedral',
        description: 'The ancient seat of Polish kings perched above the snow-dusted Vistula River. Illuminates with warm golden floodlights at dusk, showcasing 1,000 years of royal Polish heritage, gothic cathedral spires, and winter magic.'
      }
    },
    {
      id: 'wroclaw',
      name: 'Wrocław',
      nights: 2,
      base: 'Market Square or Cathedral Island',
      focus: 'Most fairytale-like stop: colorful square, bridges, dwarfs, Ostrów Tumski, and strong evening lights.',
      marketStrategy: 'First Wrocław Christmas Market evening, ideally 5 PM to 7 PM.',
      foodTargets: ['Konspira', 'Karczma Lwowska', 'Pod Fredrą'],
      hotels: ['The Bridge Wrocław MGallery', 'Hotel Monopol', 'AC Hotel by Marriott Wrocław'],
      imageDetails: {
        location: 'Rynek & Plac Solny Market Squares',
        landmark: 'Gothic Old Town Hall & Fairy-tale Windmills',
        description: "Ranked among Europe's most magical markets. Surrounded by colorful merchant houses, a 3-story wooden Christmas pyramid, fragrant spiced wine stalls, and hidden festive Wrocław Dwarfs (Krasnale)."
      }
    },
    {
      id: 'poznan',
      name: 'Poznań',
      nights: 2,
      base: 'Old Town / Stare Miasto',
      focus: 'Efficient midpoint: compact historic core, Cathedral Island, markets, cafés, and easy rail positioning.',
      marketStrategy: 'First Poznań market evening. Seasonal displays, possible ice-sculpture or market events.',
      foodTargets: ['Brovaria', 'Bamberka', 'Wiejskie Jadło'],
      hotels: ['PURO Poznań Stare Miasto', 'City Park Hotel & Residence', 'Sheraton Poznań Hotel'],
      imageDetails: {
        location: 'Stare Miasto & Plac Wolności',
        landmark: 'Renaissance Town Hall & Betlejem Poznańskie',
        description: "Home to the famous International Ice Sculpture Festival. Features a giant illuminated ferris wheel, wooden craft stalls, and warm bakery stands serving official St. Martin's Croissants (Rogale Świętomarcińskie)."
      }
    },
    {
      id: 'torun',
      name: 'Toruń',
      nights: 0,
      base: 'Day Stop Only',
      focus: 'Low-hassle medieval break: lockers, gingerbread, UNESCO core, lunch, and onward train to Gdańsk.',
      marketStrategy: 'Walk the medieval core, try gingerbread, photograph the red-brick streets, and have one sit-down lunch.',
      foodTargets: [],
      hotels: [],
      imageDetails: {
        location: 'Rynek Staromiejski (Old Town Square)',
        landmark: 'UNESCO Medieval Gothic Town Hall & Copernicus Monument',
        description: 'Set within a preserved 13th-century red-brick medieval core. Famous for rich ginger aromas, traditional hand-painted wooden trinkets, and centuries-old Toruń gingerbread (pierniki) baked from secret spice recipes.'
      }
    },
    {
      id: 'gdansk',
      name: 'Gdańsk',
      nights: 2,
      base: 'Old Town, Waterfront, or Granary Island',
      focus: 'Coastal finale: Motława waterfront, amber, Hanseatic streets, and final Christmas market night.',
      marketStrategy: 'Final Christmas market at Targ Węglowy, then pack and stage luggage for the airport transfer.',
      foodTargets: ['Pierogarnia Mandu', 'Kubicki', 'Gdański Bowke'],
      hotels: ['Hilton Gdańsk', 'Hotel Podewils', 'Radisson Hotel & Suites Gdańsk'],
      imageDetails: {
        location: 'Targ Węglowy (Coal Market) & Motława Waterfront',
        landmark: 'Historic Motława Crane & Amber Sky',
        description: 'Award-winning coastal market with Hanseatic flair. Highlights include the Talking Moose Lucek, an authentic 19th-century Venetian Carousel, local Baltic amber artisan stalls, and hot spiced mead.'
      }
    }
  ],

  railConnections: [
    { from: 'Kraków Główny', to: 'Wrocław Główny', timing: 'Depart 11:00 AM to 1:00 PM', class: 'Direct IC, 1st Class preferred' },
    { from: 'Wrocław Główny', to: 'Poznań Główny', timing: 'Depart 10:00 AM to noon', class: 'Direct IC, 1st Class preferred' },
    { from: 'Poznań Główny', to: 'Toruń Główny', timing: 'Depart 8:30 AM to 10:00 AM', class: 'Direct preferred, 2nd Class OK' },
    { from: 'Toruń Główny', to: 'Gdańsk Główny', timing: 'Arrive Gdańsk 5:30 PM to 7:30 PM', class: 'Direct preferred, 2nd Class OK' }
  ],

  marketStrategy: 'Treat the Christmas markets as evening anchors rather than all-day activities. The best rhythm is sightseeing in daylight, a warm break in the late afternoon, then markets from roughly 5 PM to 7 PM when the lights are on and dinner snacks are easy.',

  practicalTools: {
    currency: 'Use PLN divided by 4 as a fast USD estimate. Keep 50 to 100 PLN in small notes for market snacks, facilities, and small vendors.',
    phrases: 'Cześć (Hello), Dzień dobry (Good morning), Dziękuję (Thank you), Proszę (Please/Here you go), Ile to kosztuje? (How much is this?), Czy można kartą? (Can I pay by card?), Poproszę grzańca (Mulled wine, please), Poproszę piwo (Beer, please), Na zdrowie (Cheers).',
    packing: 'Waterproof boots, thermal layers, winter parka, hat, scarf, gloves, merino socks, compact daypack, power bank, Type C/E adapters, printed rail and flight documents.',
    emergency: 'Store passport copies, insurance, reservations, train tickets, airline check-in details, hotel addresses, and payment backup offline. Use Jakdojade for transit and Uber or Bolt for quick point-to-point rides.'
  }
};
