export const polandJourney = {
  id: 'poland-christmas-2026',
  title: 'Poland: A Christmas Journey',
  tagline: 'Winter Markets, Historic Cities, and Scenic Rails',
  description: 'A curated winter expedition traversing Poland from south to north. Experience the medieval grandeur of Kraków, the fairytale bridges of Wrocław, the vibrant squares of Poznań, a daytime stop in gingerbread-famed Toruń, and a coastal finale in the Hanseatic city of Gdańsk.',
  dates: 'December 2026', // Public dates only
  culinaryHighlights: [
    {
      name: 'Grzaniec Galicyjski',
      phonetic: 'GZH-ah-nyets gah-li-TSYEV-skee',
      english: 'Galician Mulled Wine',
      description: 'Rich mulled red wine spiced with cloves, cinnamon bark, orange zest, and dark honey, served steaming hot from massive oak barrels.',
      tip: 'Ask for a splash of Wiśniówka (cherry liqueur) for an extra warm kick.'
    },
    {
      name: 'Oscypek z żurawiną',
      phonetic: 'oh-STSYE-pek z zhoo-rah-VEE-noh',
      english: 'Grilled Highlander Cheese w/ Cranberry',
      description: 'Spindle-shaped smoked sheep\'s milk cheese from the Podhale mountain region, grilled over charcoal coals until soft and topped with hot sweet-tart cranberry preserves.',
      tip: 'Look for authentic PDO Highlander cheeses stamped with traditional wooden mold patterns.'
    },
    {
      name: 'Pierogi Smażone',
      phonetic: 'pyeh-ROH-gee smah-ZHOH-neh',
      english: 'Crispy Pan-Fried Dumplings',
      description: 'Hand-rolled dumplings pan-fried in butter until crispy. Fillings include classic Ruskie (potato & cheese), braised pork, or wild mushroom & sauerkraut.',
      tip: 'Order a mixed platter (porcja mieszana) to sample all savory varieties.'
    },
    {
      name: 'Kiełbasa Krakowska z Grilla',
      phonetic: 'kyeow-BAH-sah krah-KOV-skah z GREEL-lah',
      english: 'Grilled Kraków Sausage',
      description: 'Thick, garlic and black pepper seasoned pork sausage roasted over open wood flames, served with crusty sourdough bread and sharp Polish mustard (musztarda).',
      tip: 'Crispy skin paired with spicy mustard makes this the ultimate winter street food.'
    },
    {
      name: 'Barszcz z Uszkami',
      phonetic: 'barshch z oosh-KAH-mee',
      english: 'Beetroot Borscht w/ Mushroom Dumplings',
      description: 'Clear ruby-red fermented beet broth served steaming hot in sipping cups with tiny mushroom-stuffed tortellini-like dumplings.',
      tip: 'The perfect comforting handheld soup while strolling illuminated market stalls.'
    },
    {
      name: 'Miód Pitny',
      phonetic: 'myood PEET-ny',
      english: 'Hot Spiced Mead',
      description: 'Traditional Polish honey wine fermented with aromatic spices and served hot. Grades like Trójniak and Dwójniak offer rich, floral honey sweetness.',
      tip: 'Visit the Mały Rynek craft corner for small-batch artisanal mead tastings.'
    }
  ],
  
  route: [
    {
      id: 'krakow',
      name: 'Kraków',
      nights: 3,
      base: 'Old Town or Kazimierz',
      focus: 'Biggest historic start: Rynek Główny, Wawel, cafés, market atmosphere, and optional deeper history day.',
      marketStrategy: 'First Christmas market pass. Keep dinner simple with pierogi, grilled oscypek, or mulled wine snacks.',
      dates: 'Nov 28, 2026 - Jan 1, 2027',
      openingHours: 'Open 10am-8pm. Early close on Dec 24 (~2pm).',
      hours: 'Open 10am-8pm. Early close on Dec 24 (~2pm).',
      kaucja: '20-30 PLN (~$5.35–$8.00 USD)',
      foodTargets: ['Morskie Oko', 'Pod Wawelem', 'Czarna Kaczka', 'Plac Nowy Zapiekanki'],
      hotels: ['Hotel Stary', 'Hotel Copernicus', 'Sheraton Grand Kraków', 'PURO Kraków Stare Miasto'],
      quickReference: {
        dates: 'Nov 28, 2026 - Jan 1, 2027',
        daylight: 'Sunrise ~7:30 AM | Sunset ~3:30 PM (~8 hrs daylight)',
        peakHours: '5:30 PM - 8:00 PM (Dusk illuminations & caroling)',
        kaucja: '20-30 PLN (~$5.35–$8.00 USD) (Ceramic Mug Deposit, Cash Only)'
      },
      holidayClosures: {
        title: 'Critical Holiday Operating Hours (Dec 24 - 25)',
        dec24: 'Dec 24 (Wigilia): Market closes early at ~2:00 PM. Stalls shut down early so vendors can return home for traditional Wigilia family dinner. Finish all market visits before 1:30 PM!',
        dec25: 'Dec 25 (Christmas Day): Restricted hours (~1:00 PM - 8:00 PM). Select hot food stalls open; artisan and gift chalets remain closed.',
        dec26: 'Dec 26 (St. Stephen\'s Day): Normal full market operations resume (10:00 AM - 8:00 PM).'
      },
      kaucjaCallout: {
        title: 'Kaucja (Ceramic Mug Deposit)',
        deposit: '20-30 PLN (~$5.35–$8.00 USD) per mug',
        cashWarning: 'CASH MANDATORY: Card payments are accepted for food and drinks, but vendors strictly require exact CASH in PLN (~$5.35–$8.00 USD) for mug deposits.',
        details: 'Pay 20-30 PLN (~$5.35–$8.00 USD) cash per ceramic mug when ordering Grzaniec Galicyjski or hot spiced mead. Return your mug to any drink chalet for a full cash refund in PLN, or keep it as an authentic souvenir!'
      },
      culinaryHighlights: [
        {
          name: 'Grzaniec Galicyjski',
          phonetic: 'GZH-ah-nyets gah-li-TSYEV-skee',
          english: 'Galician Mulled Wine',
          description: 'Rich mulled red wine spiced with cloves, cinnamon bark, orange zest, and dark honey, served steaming hot from massive oak barrels.',
          tip: 'Ask for a splash of Wiśniówka (cherry liqueur) for an extra warm kick.'
        },
        {
          name: 'Oscypek z żurawiną',
          phonetic: 'oh-STSYE-pek z zhoo-rah-VEE-noh',
          english: 'Grilled Highlander Cheese w/ Cranberry',
          description: 'Spindle-shaped smoked sheep\'s milk cheese from the Podhale mountain region, grilled over charcoal coals until soft and topped with hot sweet-tart cranberry preserves.',
          tip: 'Look for authentic PDO Highlander cheeses stamped with traditional wooden mold patterns.'
        },
        {
          name: 'Pierogi Smażone',
          phonetic: 'pyeh-ROH-gee smah-ZHOH-neh',
          english: 'Crispy Pan-Fried Dumplings',
          description: 'Hand-rolled dumplings pan-fried in butter until crispy. Fillings include classic Ruskie (potato & cheese), braised pork, or wild mushroom & sauerkraut.',
          tip: 'Order a mixed platter (porcja mieszana) to sample all savory varieties.'
        },
        {
          name: 'Kiełbasa Krakowska z Grilla',
          phonetic: 'kyeow-BAH-sah krah-KOV-skah z GREEL-lah',
          english: 'Grilled Kraków Sausage',
          description: 'Thick, garlic and black pepper seasoned pork sausage roasted over open wood flames, served with crusty sourdough bread and sharp Polish mustard (musztarda).',
          tip: 'Crispy skin paired with spicy mustard makes this the ultimate winter street food.'
        },
        {
          name: 'Barszcz z Uszkami',
          phonetic: 'barshch z oosh-KAH-mee',
          english: 'Beetroot Borscht w/ Mushroom Dumplings',
          description: 'Clear ruby-red fermented beet broth served steaming hot in sipping cups with tiny mushroom-stuffed tortellini-like dumplings.',
          tip: 'The perfect comforting handheld soup while strolling illuminated market stalls.'
        },
        {
          name: 'Miód Pitny',
          phonetic: 'myood PEET-ny',
          english: 'Hot Spiced Mead',
          description: 'Traditional Polish honey wine fermented with aromatic spices and served hot. Grades like Trójniak and Dwójniak offer rich, floral honey sweetness.',
          tip: 'Visit the Mały Rynek craft corner for small-batch artisanal mead tastings.'
        }
      ],
      history: 'Kraków was the royal capital of Poland for over 500 years (1038–1596) and stands as the nation’s cultural soul. Miraculously preserved through the devastation of WWII, its entire Old Town (Stare Miasto) was among the first 12 sites ever inscribed on the UNESCO World Heritage List in 1978. From the mythical dragon caves of Wawel Hill to Europe’s largest medieval market square (Rynek Główny), the historic Jewish Quarter of Kazimierz, and the university where Copernicus studied, Kraków offers an unbroken living bridge across a thousand years of Central European history.',
      historyStats: [
        { label: 'Founded', value: '7th Century (Chartered 1257)', icon: 'Landmark' },
        { label: 'Royal Capital', value: '558 Years (1038–1596)', icon: 'Crown' },
        { label: 'UNESCO Heritage', value: '1978 (First 12 Worldwide)', icon: 'Award' },
        { label: 'Market Square', value: '40,000 m² (Europe’s Largest)', icon: 'MapPin' }
      ],
      historyEpochs: [
        {
          era: '7th – 10th Century',
          title: 'Mythical Origins & The Wawel Dragon',
          subtitle: 'The legend of Prince Krakus and Slavic tribal stronghold',
          description: 'According to Slavic chronicle lore, the city was founded on limestone Wawel Hill by Prince Krakus after the cunning shoemaker Skuba defeated Smok Wawelski (the fire-breathing Wawel dragon) using a sulfur-stuffed sheep. Emerging as a fortified trade settlement along the historic Amber and Silk routes, Kraków quickly became the dominant hub of Lesser Poland (Małopolska).'
        },
        {
          era: '1038 – 1596',
          title: 'The Royal Golden Age & Jagiellonian Renaissance',
          subtitle: 'Five centuries as Poland’s imperial capital and academic beacon',
          description: 'In 1038, King Casimir I made Kraków Poland’s royal capital. Following devastating 13th-century Tatar sieges, the city was rebuilt in 1257 on a grand geometric grid around Rynek Główny. King Casimir III the Great founded Jagiellonian University in 1364—the second-oldest university in Central Europe, where Nicolaus Copernicus studied. Italian Renaissance architects transformed Wawel Castle into one of Europe’s most breathtaking royal courts before King Sigismund III moved the royal court to Warsaw in 1596.'
        },
        {
          era: '1335 – 1939',
          title: 'Kazimierz & Jewish Golden Age',
          subtitle: 'Center of European Jewish scholarship and culture',
          description: 'Founded as a separate royal town in 1335, Kazimierz became a flourishing sanctuary of Jewish commerce, theology, and philosophy under royal protection. Renowned as the home of Rabbi Moses Isserles (the Remuh), Kazimierz evolved into one of the world’s preeminent centers of Ashkenazi Jewish culture, boasting seven historic synagogues, bustling market squares, and a vibrant community that thrived for over six centuries.'
        },
        {
          era: '1939 – 1945',
          title: 'WWII & The Miraculous Architectural Survival',
          subtitle: 'Occupied capital, the Podgórze Ghetto, and Oskar Schindler',
          description: 'During WWII, the Nazi regime designated Kraków as the headquarters of the General Government under Hans Frank, who occupied Wawel Castle. Because the occupiers intended Kraków to serve as an administrative showcase, the historic city was spared the wholesale physical demolition that obliterated Warsaw. Across the river in Podgórze, the Jewish community was forced into a walled ghetto, where Oskar Schindler famously saved over 1,200 Jewish workers at his enamel factory (Emalia).'
        },
        {
          era: '1978 – Present',
          title: 'UNESCO World Heritage & Papal Legacy',
          subtitle: 'First global heritage list and intellectual renaissance',
          description: 'In 1978, UNESCO inscribed Kraków’s Historic Centre on its inaugural World Heritage List—one of the first 12 cultural monuments in the world. That same year, Kraków’s Archbishop Cardinal Karol Wojtyła was elected Pope John Paul II, providing moral momentum for Poland’s Solidarity movement and the eventual peaceful collapse of the Iron Curtain. Today, Kraków stands as Central Europe’s crown jewel of preserved architecture, arts, and winter festivities.'
        }
      ],
      historyLegends: [
        {
          title: 'The Hejnał Mariacki (St. Mary’s Bugle Call)',
          icon: '🎺',
          description: 'Every single hour, day and night, a live firefighter bugler sounds a five-note melody from the highest tower of St. Mary’s Basilica in all four cardinal directions. The anthem abruptly stops mid-note to honor the legendary 13th-century trumpeter who was struck in the throat by a Mongol archer’s arrow while warning the city of an impending siege.'
        },
        {
          title: 'The Wawel Dragon (Smok Wawelski)',
          icon: '🐉',
          description: 'Deep within the limestone caves beneath Wawel Castle (Smocza Jama) once lurked the fearsome Wawel Dragon. Today, a famous bronze dragon statue stands guard at the riverbank at the foot of Wawel Hill, breathing real bursts of fire every few minutes to the delight of visitors and locals.'
        },
        {
          title: 'Szopki Krakowskie (UNESCO Nativity Masterpieces)',
          icon: '✨',
          description: 'Kraków’s 19th-century folk tradition of building intricate, jewel-toned, multi-towered miniature nativity palaces made of colored tin foil and wood. Recognized as UNESCO Intangible Cultural Heritage, these astonishing creations incorporate miniature models of St. Mary’s towers, Sukiennice, and Wawel spires and are exhibited around the Main Square each December.'
        }
      ],
      transit: {
        airport: 'Direct SKA1 train from Kraków Airport (KRK) to Kraków Główny central station runs every 30 mins (17-min journey, ~17 PLN (~$4.50 USD) ticket).',
        cityTransit: 'Trams & buses managed by ZTP Kraków. Use 24-hr (~17 PLN (~$4.50 USD)) or 72-hr (~50 PLN (~$13.35 USD)) passes. Trams 1, 3, 8, 13, and 24 connect Old Town directly with Kazimierz.',
        station: 'Kraków Główny train station is directly attached to Galeria Krakowska and is a flat 5-minute walk to the Barbican and Planty Park entry to Old Town.'
      },
      practical: {
        weather: 'December in Kraków averages -2°C to 4°C (28°F–39°F) with brisk evening winds off the Vistula. Thermal base layers, fleece-lined waterproof boots for wet cobblestones, a windproof coat, gloves, and a beanie are recommended for evening strolls.',
        currency: 'Poland uses the Polish Złoty (PLN). Contactless card payment (Apple/Google Pay) is accepted at ~90% of stalls, but keep 20–50 PLN (~$5.35–$13.35 USD) cash for mug deposits and small craft vendors. Always select "Pay in PLN" on card readers to avoid 5-10% DCC markups.',
        restrooms: 'Underground public WC is located beneath Sukiennice (Cloth Hall) on Main Square, and at Galeria Krakowska central station (2–4 PLN (~$0.50–$1.05 USD) fee, contactless card accepted).'
      },
      markets: [
        {
          id: 'rynek-glowny',
          name: 'Rynek Główny Main Market',
          location: 'Grand Main Square (Old Town)',
          hours: 'Nov 28, 2026 – Jan 1, 2027 | Open 10am-8pm. Early close on Dec 24 (~2pm).',
          address: 'Rynek Główny 1, 31-042 Kraków (Tram: Teatr Bagatela or Dworzec Główny)',
          mustTry: ['Oscypek with warm cranberry jam', 'Sizzling Pierogi', 'Grzaniec Galicyjski mulled wine', 'Krakowska Sausage'],
          souvenirs: ['Hand-blown glass ornaments (Bombki)', 'Baltic Amber jewelry', 'Carved wooden kitchenware & boxes', 'Wool slippers'],
          unescoTradition: 'UNESCO Intangible Cultural Heritage: Szopki Krakowskie (Christmas Cribs). The annual competition takes place on the first Thursday of December (Dec 3, 2026) at the Mickiewicz monument, followed by an exhibition at Krzysztofory Palace.',
          tips: 'Peak crowds are 5:30 PM - 8:00 PM. Hot drink mugs require a 30 PLN (~$8.00 USD) cash deposit (refundable upon returning the mug). Stage caroling occurs daily around 5:00 PM / 6:00 PM. Dec 24 hours: 10:00 AM - 2:00 PM.',
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
          title: 'Wawel Royal Castle & Cathedral',
          category: 'Royal Heritage',
          description: 'The ancient seat of Polish kings overlooking the Vistula River. Explore the Italian Renaissance courtyard, royal state rooms, and the dragon\'s den statue that breathes real fire.',
          imageUrl: '/images/krakow/wawel-castle.jpg',
          imageSrc: '/images/krakow/wawel-castle.jpg',
          location: 'Wawel Hill',
          locationData: 'Wawel Hill',
          howToGetThere: 'Walk south through Old Town or take Trams 1, 3, 8 to Wawel stop.',
          pricing: 'Cathedral free; State Rooms ~35 PLN (~$9.20 USD)',
          costData: 'Cathedral free; State Rooms ~35 PLN (~$9.20 USD)',
          openTimes: '9:30 AM - 5:00 PM (winter hours)',
          hoursData: '9:30 AM - 5:00 PM (winter hours)',
          daysClosed: 'Mondays (most exhibitions closed)'
        },
        {
          name: 'St. Mary\'s Basilica (Kościół Mariacki)',
          title: 'St. Mary\'s Basilica (Kościół Mariacki)',
          category: 'Architecture & Tradition',
          description: 'Iconic twin-towered gothic basilica on Rynek Główny. Step inside to marvel at the 15th-century carved wooden Veit Stoss altarpiece, and listen for the hourly trumpet call (Hejnał Mariacki).',
          imageUrl: '/images/krakow/st-marys-basilica.jpg',
          imageSrc: '/images/krakow/st-marys-basilica.jpg',
          location: 'Old Town (Rynek)',
          locationData: 'Old Town (Rynek)',
          howToGetThere: 'Located directly on the Main Market Square (Rynek Główny).',
          pricing: '15 PLN (~$4.00 USD) for tourist entry (front half of church)',
          costData: '15 PLN (~$4.00 USD) for tourist entry (front half of church)',
          openTimes: '11:30 AM - 6:00 PM (Mon-Sat), 2:00 PM - 6:00 PM (Sun)',
          hoursData: '11:30 AM - 6:00 PM (Mon-Sat), 2:00 PM - 6:00 PM (Sun)',
          daysClosed: 'During mass'
        },
        {
          name: 'Cloth Hall (Sukiennice) & Rynek Underground',
          title: 'Cloth Hall (Sukiennice) & Rynek Underground',
          category: 'Museums & Shopping',
          description: 'A 14th-century merchant hub selling amber and carved wood; underneath it lies a state-of-the-art medieval archaeological museum buried 4 meters under the square.',
          imageUrl: '/images/krakow/cloth-hall.jpg',
          imageSrc: '/images/krakow/cloth-hall.jpg',
          location: 'Old Town (Rynek)',
          locationData: 'Old Town (Rynek)',
          howToGetThere: 'Center of Main Market Square.',
          pricing: 'Cloth Hall free; Underground Museum ~32 PLN (~$8.50 USD)',
          costData: 'Cloth Hall free; Underground Museum ~32 PLN (~$8.50 USD)',
          openTimes: '10:00 AM - 8:00 PM',
          hoursData: '10:00 AM - 8:00 PM',
          daysClosed: 'Underground closed second Monday of month'
        },
        {
          name: 'Kazimierz (Historic Jewish Quarter)',
          title: 'Kazimierz (Historic Jewish Quarter)',
          category: 'Culture & Nightlife',
          description: 'Atmospheric cobblestone streets packed with historic synagogues, art galleries, cozy cellar bars, and the famous Plac Nowy Zapiekanki food plaza.',
          imageUrl: '/images/krakow/kazimierz.jpg',
          imageSrc: '/images/krakow/kazimierz.jpg',
          location: 'Kazimierz',
          locationData: 'Kazimierz',
          howToGetThere: 'Trams 1, 3, 8 to Plac Wolnica or 15-min walk south of Old Town.',
          pricing: 'Free to explore; Synagogue entries ~10–15 PLN (~$2.60–$4.00 USD)',
          costData: 'Free to explore; Synagogue entries ~10–15 PLN (~$2.60–$4.00 USD)',
          openTimes: '24/7 (Synagogues usually 10:00 AM - 4:00 PM)',
          hoursData: '24/7 (Synagogues usually 10:00 AM - 4:00 PM)',
          daysClosed: 'Synagogues closed on Saturdays (Shabbat) and Jewish holidays'
        },
        {
          name: 'Planty Park & Barbican Fortress',
          title: 'Planty Park & Barbican Fortress',
          category: 'Scenic Walk',
          description: 'A 4-kilometer ring of parkland surrounding Old Town where medieval walls once stood, leading to the formidable 15th-century round Barbican defense tower.',
          imageUrl: '/images/krakow/planty-park-barbican.jpg',
          imageSrc: '/images/krakow/planty-park-barbican.jpg',
          location: 'Old Town (Planty)',
          locationData: 'Old Town (Planty)',
          howToGetThere: 'Surrounds the entire Old Town; Barbican is at the north end.',
          pricing: 'Park free; Barbican entry ~16 PLN (~$4.20 USD)',
          costData: 'Park free; Barbican entry ~16 PLN (~$4.20 USD)',
          openTimes: 'Park 24/7; Barbican 10:00 AM - 5:00 PM (season dependent)',
          hoursData: 'Park 24/7; Barbican 10:00 AM - 5:00 PM (season dependent)',
          daysClosed: 'Barbican often closed in deep winter (Dec-Mar)'
        },
        {
          name: 'Auschwitz-Birkenau Memorial and Museum',
          title: 'Auschwitz-Birkenau Memorial and Museum',
          category: 'History & Memorial',
          description: 'The former German Nazi concentration and extermination camp. A sobering and essential historical site requiring advance booking and respectful observance.',
          imageUrl: '/images/krakow/auschwitz-birkenau.jpg',
          imageSrc: '/images/krakow/auschwitz-birkenau.jpg',
          location: 'Oświęcim',
          locationData: 'Oświęcim',
          howToGetThere: 'Bus from MDA Bus Station (approx 1.5 hrs) to Oświęcim, or guided tour.',
          pricing: 'Free without guide; ~100 PLN (~$27.00 USD) for guided tour (highly recommended)',
          costData: 'Free without guide; ~100 PLN (~$27.00 USD) for guided tour (highly recommended)',
          openTimes: '8:00 AM - 3:00 PM (winter), up to 7:00 PM (summer)',
          hoursData: '8:00 AM - 3:00 PM (winter), up to 7:00 PM (summer)',
          daysClosed: 'Dec 25, Jan 1, Easter Sunday'
        },
        {
          name: 'Wieliczka Salt Mine',
          title: 'Wieliczka Salt Mine',
          category: 'UNESCO Underground',
          description: 'A massive 13th-century subterranean salt mine featuring stunning underground lakes, chapels carved entirely of salt, and intricate statues.',
          imageUrl: '/images/krakow/wieliczka-salt-mine.jpg',
          imageSrc: '/images/krakow/wieliczka-salt-mine.jpg',
          location: 'Wieliczka',
          locationData: 'Wieliczka',
          howToGetThere: 'SKA1 Train from Kraków Główny to Wieliczka Rynek-Kopalnia (approx 20 mins).',
          pricing: '122 PLN (~$32.00 USD) for foreign language guided tour',
          costData: '122 PLN (~$32.00 USD) for foreign language guided tour',
          openTimes: '8:30 AM - 5:00 PM',
          hoursData: '8:30 AM - 5:00 PM',
          daysClosed: 'Dec 24-25, Jan 1, Easter Sunday'
        },
        {
          name: 'Oskar Schindler\'s Enamel Factory',
          title: 'Oskar Schindler\'s Enamel Factory',
          category: 'WWII History',
          description: 'An interactive and deeply moving museum housed in Schindler\'s former factory, detailing life in Kraków under Nazi occupation during WWII.',
          imageUrl: '/images/krakow/schindler-factory.jpg',
          imageSrc: '/images/krakow/schindler-factory.jpg',
          location: 'Zabłocie',
          locationData: 'Zabłocie',
          howToGetThere: 'Tram 3 or 24 to Plac Bohaterów Getta, then a 10-min walk to Zabłocie district.',
          pricing: '32 PLN (~$8.50 USD)',
          costData: '32 PLN (~$8.50 USD)',
          openTimes: '10:00 AM - 6:00 PM (Mondays 10:00 AM - 2:00 PM)',
          hoursData: '10:00 AM - 6:00 PM (Mondays 10:00 AM - 2:00 PM)',
          daysClosed: 'First Tuesday of every month'
        },
        {
          name: 'Chochołów Thermal Baths (Chochołowskie Termy)',
          title: 'Chochołów Thermal Baths (Chochołowskie Termy)',
          category: 'Wellness & Thermal Spa',
          description: 'The largest thermal bath complex in Poland located in the Podhale mountain region near Kraków. Features steaming outdoor geothermal pools, whirlpools, saunas, and hydro-massages under falling winter snow with views of the Tatras mountains.',
          imageUrl: '/images/krakow/thermal-baths.jpg',
          imageSrc: '/images/krakow/thermal-baths.jpg',
          location: 'Chochołów (Podhale)',
          locationData: 'Chochołów (Podhale)',
          howToGetThere: 'Direct shuttle bus from Kraków Główny bus station (approx 1.5 hrs) or private day tour.',
          pricing: '89–119 PLN (~$23.00–$31.00 USD) for 3-hour / all-day bath pass',
          costData: '89–119 PLN (~$23.00–$31.00 USD) for 3-hour / all-day bath pass',
          openTimes: '9:00 AM - 10:00 PM (open daily)',
          hoursData: '9:00 AM - 10:00 PM (open daily)',
          daysClosed: 'Open 365 days a year (special holiday hours apply)'
        },
        {
          name: 'Kraków Christmas Markets & Old Town Guided Walking Tour',
          title: 'Kraków Christmas Markets & Old Town Guided Walking Tour',
          category: 'Top Rated Guided Tour',
          description: 'Top-rated guided walking tour through illuminated Old Town cobblestone streets. Sample hot spiced mead (miód pitny) & grilled oscypek, explore Rynek Główny market stalls, and discover royal legends.',
          imageUrl: '/images/krakow/walking-tour.jpg',
          imageSrc: '/images/krakow/walking-tour.jpg',
          location: 'Old Town (Stare Miasto)',
          locationData: 'Old Town (Stare Miasto)',
          howToGetThere: 'Starts at St. Florian\'s Gate / Barbican (north end of Planty Park).',
          pricing: '75–95 PLN (~$19.00–$25.00 USD) per person',
          costData: '75–95 PLN (~$19.00–$25.00 USD) per person',
          openTimes: 'Departs 10:00 AM, 2:00 PM, & 5:00 PM (2 hrs)',
          hoursData: 'Departs 10:00 AM, 2:00 PM, & 5:00 PM (2 hrs)',
          daysClosed: 'Runs daily through December',
          gygUrl: 'https://www.getyourguide.com/s/?q=Krakow+Christmas+Market+walking+tour',
          viatorUrl: 'https://www.viator.com/searchResults/all?text=Krakow+Christmas+Market+walking+tour'
        },
        {
          name: 'Kazimierz Jewish Quarter & Schindler\'s Factory Walking Tour',
          title: 'Kazimierz Jewish Quarter & Schindler\'s Factory Walking Tour',
          category: 'History & Culture Tour',
          description: 'Immersive guided walking tour through historic Kazimierz, ancient Szeroka Street synagogues, Ghetto Heroes Square, and skip-the-line entry to Schindler\'s Factory Museum.',
          imageUrl: '/images/krakow/schindler-factory.jpg',
          imageSrc: '/images/krakow/schindler-factory.jpg',
          location: 'Kazimierz & Zabłocie',
          locationData: 'Kazimierz & Zabłocie',
          howToGetThere: 'Starts at Szeroka Street in Kazimierz (tram 3, 8, or 24).',
          pricing: '95–125 PLN (~$25.00–$33.00 USD) incl. Museum Ticket',
          costData: '95–125 PLN (~$25.00–$33.00 USD) incl. Museum Ticket',
          openTimes: 'Departs 10:30 AM & 2:30 PM daily (3 hrs)',
          hoursData: 'Departs 10:30 AM & 2:30 PM daily (3 hrs)',
          daysClosed: 'Mondays (reduced museum hours apply)',
          gygUrl: 'https://www.getyourguide.com/s/?q=Krakow+Kazimierz+Schindler+walking+tour',
          viatorUrl: 'https://www.viator.com/searchResults/all?text=Krakow+Kazimierz+Schindler+walking+tour'
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
      lgbtq: {
        title: "LGBTQ+ Traveler's Guide to Kraków & Kazimierz",
        subtitle: "Bohemian cellar bars, iconic gay nightlife, inclusive cafés, Equality March history, & queer traveler safety",
        overview: "Kraków is celebrated as Poland's cultural and artistic soul, with the bohemian district of Kazimierz acting as the beating heart of its progressive, inclusive, and vibrant LGBTQ+ scene. While Poland as a whole continues its journey toward full legal equality, Kraków is an open, welcoming, and safe destination for queer travelers. With long-running gay clubs (Ciemnia, Lindo), rainbow-friendly cellar bars, independent bookstores (Massolit), and a rich 20+ year history of Poland's Equality March (Marsz Równości), LGBTQ+ visitors will find a warm, creative community atmosphere.",
        primaryArea: "Kazimierz (Bohemian & Queer Quarter)",
        landmark: "Father Bernatek Footbridge & Plac Wolnica",
        landmarkDescription: "Historic pedestrian bridge linking Kazimierz to Podgórze with acrobatic sculptures and romantic rainbow nighttime illuminations over the Vistula River.",
        imageUrl: "/images/krakow/lgbtq-kazimierz.jpg",
        safetyAndLegal: {
          legalContext: "Homosexuality has been legal in Poland since 1932 (with an equal age of consent of 15, one of Europe's earliest decriminalizations). In 2021, the Małopolska Regional Assembly and Kraków officially repealed controversial symbolic anti-LGBT declarations, ensuring a welcoming environment for all visitors.",
          safetyRating: "Safe & Welcoming in Central Districts",
          pdaAdvice: "Public Displays of Affection: Kazimierz and Old Town are progressive, relaxed, and safe for queer couples. Standard mild discretion is recommended in outer residential suburbs and late-night public transit.",
          helplines: [
            { name: "Stowarzyszenie Queerowy Maj", contact: "Organizers of Kraków Pride / Marsz Równości & Queer May arts" },
            { name: "Fundacja Równość.org.pl", contact: "Regional southern Poland LGBTQ+ advocacy & support" },
            { name: "Lambda Polska Helpline", contact: "+48 22 628 52 22 (National LGBTQ+ crisis & community support)" }
          ]
        },
        neighborhoods: [
          {
            name: "Kazimierz (Historic Jewish Quarter)",
            vibe: "Kraków's premier bohemian & queer district",
            description: "Centered around Plac Nowy, Józefa Street, and Plac Wolnica, Kazimierz is packed with rainbow-friendly cellar pubs, vintage art galleries, and candle-lit cafes with zero-judgment atmospheres."
          },
          {
            name: "Father Bernatek Footbridge (Kładka Ojca Bernatka)",
            vibe: "Romantic rainbow-illuminated river crossing",
            description: "Pedestrian bridge spanning the Vistula River between Kazimierz and Podgórze, adorned with balancing acrobat sculptures and vibrant rainbow night lights reflecting on the water."
          },
          {
            name: "Old Town Cellars (Stare Miasto)",
            vibe: "Medieval vaulted cocktail bars & late-night hubs",
            description: "Historic brick-vaulted cellar venues tucked along Sławkowska, św. Krzyża, and Szewska streets hosting welcoming international crowds."
          }
        ],
        barsAndClubs: [
          {
            name: "Ciemnia Club",
            address: "ul. Koletek 6 (Between Kazimierz & Wawel)",
            type: "Dedicated Gay Dance Club & Darkroom",
            description: "Kraków's premier and longest-running gay club. Features energetic DJ dance floors, weekend drag revues, darkroom lounge areas, and a lively international crowd.",
            vibe: "High-energy dance floors, drag shows, open till 5-6 AM"
          },
          {
            name: "Lindo Bar",
            address: "ul. Sławkowska 11 (Old Town)",
            type: "Gay Cocktail Lounge & Social Bar",
            description: "Warm, stylish gay cocktail bar housed in historic Old Town cellar arches. Famous for rainbow-hued cocktails, friendly bartenders, and a convivial social vibe ideal for pre-club drinks.",
            vibe: "Cozy cellar cocktail lounge & friendly mingling"
          },
          {
            name: "Piękny Pies (Beautiful Dog)",
            address: "ul. Bożego Ciała 9 (Kazimierz)",
            type: "Bohemian Dive & Queer Artist Haunt",
            description: "Legendary nocturnal hangout beloved by Kraków's queer artists, writers, and musicians. Famous for zero-judgment atmosphere, eclectic music, and late-night drinks.",
            vibe: "Artsy bohemian dive & late-night community favorite"
          },
          {
            name: "Hevre",
            address: "ul. Meiselsa 18 (Kazimierz)",
            type: "Bohemian Cultural Bar & Drag Brunches",
            description: "A breathtaking 19th-century former prayer house turned high-ceilinged bohemian bar and cultural space. Regularly hosts queer arts events, drag brunches, and vibrant weekend DJ sets.",
            vibe: "Majestic frescos, craft cocktails & queer arts events"
          },
          {
            name: "Klub RE",
            address: "ul. św. Krzyża 4 (Old Town)",
            type: "Indie Cellar Bar & Arts Community",
            description: "Classic indie student and queer-welcoming bar with a leafy courtyard and subterranean brick cellar hosting alternative gigs, acoustic sets, and cheap beers.",
            vibe: "Relaxed alternative/indie cellar vibe"
          },
          {
            name: "Klub Pozytywka",
            address: "ul. Bożego Ciała 12 (Kazimierz)",
            type: "Artsy Cocktail Bar & Queer Social Hub",
            description: "Charming, eccentric Kazimierz venue with vintage decor, craft cocktails, board games, and an openly inclusive crowd.",
            vibe: "Intimate, eccentric & warm social setting"
          }
        ],
        cafesAndDining: [
          {
            name: "Massolit Books & Café",
            address: "ul. Felicjanek 4 (Near Old Town & Planty)",
            type: "Progressive Bookstore, Queer Literature & Café",
            description: "Famous English-language bookstore and bakery with a dedicated section for LGBTQ+ literature, gender theory, and queer Polish history. Delicious homemade vegan pies and artisan coffee.",
            signature: "LGBTQ+ book collections, vegan apple crumble & specialty drip coffee"
          },
          {
            name: "Karma Coffee Roasters",
            address: "ul. Krupnicza 12 & ul. św. Wawrzyńca 9 (Kazimierz)",
            type: "Specialty Coffee Roastery & Queer-Friendly Staff",
            description: "Kraków's premier specialty coffee house. Openly queer-friendly staff and clientele, plant-based bakery treats, and third-wave espresso in a sunlit minimalist space.",
            signature: "Pour-over single origin coffees, sourdough toasts & vegan treats"
          },
          {
            name: "Ranny Ptaszek (Early Bird)",
            address: "ul. Augustiańska 5 (Kazimierz)",
            type: "Pink-Tiled Queer-Welcoming Breakfast Bar",
            description: "Cheery, bubblegum-pink breakfast bar run by a progressive mother-daughter duo. Extremely popular with local LGBTQ+ couples and foodies for wholesome, colorful morning meals.",
            signature: "Sabich with baked eggplant, warm shakshuka & homemade pickles"
          },
          {
            name: "Hummus Amamelus",
            address: "ul. św. Sebastiana 16 (Kazimierz)",
            type: "Vegetarian/Vegan Middle Eastern Sanctuary",
            description: "Cozy, queer-inclusive dining space serving authentic velvety hummus platters, warm za'atar pita, and seasonal soups in a warm neighborhood setting.",
            signature: "Silky warm hummus bowls, roasted beets, and homemade lemonade"
          },
          {
            name: "Zazie Bistro",
            address: "ul. Józefa 15 (Kazimierz)",
            type: "Romantic Michelin Bib Gourmand French Bistro",
            description: "Romantic, candle-lit cellar bistro on bustling Józefa street, praised for welcoming queer couples with superb French-Polish gastronomy and curated natural wines.",
            signature: "Coq au vin, beef bourguignon, French onion soup & natural wines"
          }
        ],
        communityAndCulture: [
          {
            name: "Marsz Równości (Equality March Kraków)",
            type: "Living Pride Heritage & Activism",
            description: "Held annually every May since 2004, Kraków's Equality March is one of Poland's oldest and most resilient pride demonstrations, marching past Wawel Castle and through Rynek Główny.",
            highlight: "Annual Queer May Arts Festival & community pop-up exhibitions"
          },
          {
            name: "Spółdzielnia Ogniwo (Ogniwo Cooperative)",
            type: "Queer Activist Social Center & Bookshop",
            description: "Independent social cooperative and progressive bookshop in Podgórze hosting queer reading clubs, feminist discussions, film screenings, and activist solidarity gatherings.",
            highlight: "ul. Smolki 11a — community library, vegan coffee & open meetings"
          },
          {
            name: "MOCAK (Museum of Contemporary Art)",
            type: "Queer Contemporary Art Exhibitions",
            description: "World-class contemporary art museum in Zabłocie frequently featuring groundbreaking Polish LGBTQ+ artists exploring gender identity, post-communist expression, and human rights.",
            highlight: "ul. Lipowa 4 — temporary exhibitions & progressive art bookstore"
          },
          {
            name: "Sauna Kazimierz",
            type: "Gay Men's Sauna & Relaxation Club",
            description: "Long-running men's wellness and social venue located in Kazimierz on Dietla street, featuring dry Finnish sauna, steam baths, relaxation cabins, and a bar.",
            highlight: "ul. Dietla 75 (Kazimierz) — open daily from late afternoon"
          }
        ],
        winterExperiences: [
          {
            title: "Romantic Evening Walk: Father Bernatek Footbridge",
            description: "Cross the illuminated footbridge at dusk under falling snow to see the acrobat sculptures and rainbow lights glowing against the winter river."
          },
          {
            title: "Artisan Holiday Shopping on Józefa Street",
            description: "Kazimierz's Józefa street is home to independent queer-welcoming jewelry designers, vintage fashion boutiques, and handmade Polish ceramics."
          },
          {
            title: "Cozy Cellar Pub Crawl in Kazimierz",
            description: "Escape the winter freeze by ducking into candle-lit brick basements like Alchemia and Piękny Pies for warm spiced Polish honey mead (Grzany Miód)."
          }
        ]
      },
      imageDetails: {
        location: "Rynek Główny (Main Market Square)",
        landmark: "Christmas Market at Rynek Główny & Sukiennice",
        description: "Europe's largest medieval market square dressed in festive winter illuminations, wooden artisan stalls, and warm glowing festive lights in historic Kraków."
      }
    },
    {
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
      foodTargets: ['Konspira', 'Karczma Lwowska', 'Pod Fredrą'],
      hotels: ['The Bridge Wrocław MGallery', 'Hotel Monopol', 'AC Hotel by Marriott Wrocław'],
      imageDetails: {
        location: 'Rynek & Plac Solny Market Squares',
        landmark: 'Gothic Old Town Hall & Fairy-tale Windmills',
        description: "Ranked among Europe's most magical markets. Surrounded by colorful merchant houses, a 3-story wooden Christmas pyramid, fragrant spiced wine stalls, and hidden festive Wrocław Dwarfs (Krasnale)."
      },
      history: 'Known as the "Venice of Poland" and the "City of a Hundred Bridges", Wrocław is an architectural marvel spread across 12 islands connected by over 100 bridges on the Oder River. With more than a thousand years of shifting Polish, Bohemian, Austrian (Habsburg), Prussian, and German heritage, Wrocław presents a breathtaking blend of Gothic brick churches, Flemish Baroque townhouses, and vibrant modern cultural energy. Recognized as a 2016 European Capital of Culture, its historic core around Ostrów Tumski and Rynek represents one of Central Europe\'s most resilient and captivating cities.',
      historyStats: [
        { label: 'Founded', value: '10th Century (Chartered 1242)', icon: 'Landmark' },
        { label: 'Cultural Eras', value: '5 Nations (PL, CZ, AT, PR, DE)', icon: 'Award' },
        { label: 'Bridges & Islands', value: '12 Islands & 100+ Bridges', icon: 'MapPin' },
        { label: 'European Culture', value: 'Capital of Culture 2016', icon: 'Crown' }
      ],
      historyEpochs: [
        {
          era: '10th - 13th Century',
          title: 'Medieval Piast Stronghold & Cathedral Island',
          subtitle: 'Slavic foundations on Ostrów Tumski and the early bishopric',
          description: 'Established on fortified islands in the Oder River by the Polish Piast dynasty, Duke Bolesław the Brave founded the Bishopric of Wrocław in the year 1000. Ostrów Tumski (Cathedral Island) quickly became the spiritual and political center of Silesia, surviving the 1241 Mongol invasion before rebuilding on a grand Magdeburg grid.'
        },
        {
          era: '1335 - 1526',
          title: 'Bohemian Crown & Hanseatic Trade Prosperity',
          subtitle: 'Flourishing commerce under King John of Bohemia and Charles IV',
          description: 'In 1335, Silesia came under the rule of the Kingdom of Bohemia. Wrocław prospered immensely as a prominent Hanseatic League trading post connecting the Baltic to Central Europe. The magnificent Gothic Old Town Hall (Ratusz) with its astronomical clock and ornate interior halls was completed during this merchant boom.'
        },
        {
          era: '1526 - 1741',
          title: 'Habsburg Baroque & The University of Wrocław',
          subtitle: 'Austrian imperial rule, Leopoldina Hall, and Catholic counter-reformation',
          description: 'Following the death of King Louis II of Hungary and Bohemia, Wrocław fell under Austrian Habsburg rule. Counter-Reformation Jesuit architects transformed the city skyline, culminating in the founding of the University of Wrocław in 1702 and the breathtaking Baroque Aula Leopoldina with its gold-leaf ceiling frescoes.'
        },
        {
          era: '1741 - 1918',
          title: 'Prussian Industrial Expansion (Breslau)',
          subtitle: 'Silesian Wars, industrialization, and Max Berg\'s Centennial Hall',
          description: 'Conquered by King Frederick the Great of Prussia in 1741, the city (Breslau) expanded into a major German industrial powerhouse and railway junction. In 1913, architect Max Berg completed Centennial Hall (Hala Stulecia) - an engineering triumph of reinforced concrete and a UNESCO World Heritage landmark.'
        },
        {
          era: '1945',
          title: 'Siege of Festung Breslau & Polish Post-War Rebirth',
          subtitle: 'Three-month wartime siege and monumental architectural restoration',
          description: 'Designated a fanatical fortress (Festung Breslau) during WWII, the city endured a brutal three-month siege in early 1945 that destroyed 70% of its buildings. Following post-war border shifts, Polish scholars, architects, and families from Lwów and eastern Poland resettled Wrocław, meticulously rebuilding the historic Old Town brick by brick.'
        },
        {
          era: '1980s - Present',
          title: 'Orange Alternative Dwarfs & European Capital of Culture',
          subtitle: 'Peaceful anti-communist dwarf satire and modern renaissance',
          description: 'In the 1980s, Waldemar Fydrych\'s Orange Alternative movement staged whimsical, surrealist protests using painted dwarfs to mock communist absurdity. Today, hundreds of bronze Krasnale (dwarfs) inhabit the cobblestones, celebrating Wrocław as a symbol of wit, resilience, and open European culture.'
        }
      ],
      historyLegends: [
        {
          icon: '🧙‍♂️',
          title: 'The Wrocław Dwarfs (Krasnale)',
          description: 'Originating as satirical protest symbols of the Orange Alternative against communist censorship in the 1980s, over 400 charming bronze dwarf statues now populate the city streets, each with its own trade and humorous personality.'
        },
        {
          icon: '🥟',
          title: 'The Dumpling Gate (Brama Kluskowa)',
          description: 'Medieval legend tells of a heartbroken peasant who received a magical pot of endless Silesian dumplings from his late wife\'s spirit with one rule: leave the last dumpling. He greedily reached for the last piece, and it flew atop the gate turning to stone forever.'
        },
        {
          icon: '🏮',
          title: 'The Lamp Lighter of Ostrów Tumski',
          description: 'Every evening at dusk, a traditional cloaked lamp lighter walks the cobblestones of Cathedral Island to hand-light over 100 historic gas lamps, maintaining a centuries-old unbroken Silesian tradition.'
        }
      ],
      lgbtq: {
        title: "LGBTQ+ Traveler's Guide to Wrocław",
        subtitle: "District of Four Denominations, HAH Wrocław club, progressive cafés, and Lower Silesian pride",
        overview: "Wrocław is celebrated as one of Poland's most open, progressive, and cosmopolitan university cities. The heart of Wrocław's queer and alternative culture is nestled within the District of Four Denominations (Dzielnica Czterech Wyznań) and the Nadodrze arts quarter. With the high-energy multi-room HAH Wrocław dance club, welcoming bohemian courtyard bars along Ruska street, and the annual Wrocław Equality March (Marsz Równości Wrocław), LGBTQ+ travelers will find a relaxed, warm, and friendly atmosphere.",
        primaryArea: "District of Four Denominations (Dzielnica Czterech Wyznań)",
        landmark: "Neon Side Gallery & Ruska 46 Courtyard",
        landmarkDescription: "A vibrant illuminated retro neon art courtyard on Ruska street serving as Wrocław's progressive cultural and queer nightlife hub.",
        imageUrl: "/images/wroclaw.png",
        safetyAndLegal: {
          legalContext: "Decriminalized nationwide since 1932. Wrocław's City Hall has consistently championed European diversity and anti-discrimination initiatives across Lower Silesia.",
          safetyRating: "Very Safe & Progressive",
          pdaAdvice: "Public Displays of Affection: High comfort in the Market Square, District of Four Denominations, and university districts.",
          helplines: [
            { name: "Kultura Równości", contact: "Organizers of Wrocław Equality March & Queer Community Center" },
            { name: "Stowarzyszenie Różowa Szybka", contact: "Lower Silesian LGBTQ+ cultural advocacy" }
          ]
        },
        neighborhoods: [
          {
            name: "District of Four Denominations (Dzielnica Czterech Wyznań)",
            vibe: "Tolerant, historic & vibrant nightlife district",
            description: "An enclave symbolizing mutual respect with synagogue, Catholic, Orthodox, and Lutheran churches side-by-side, home to Wrocław's top indie cafés and wine bars."
          },
          {
            name: "Ruska 46 & Neon Side Gallery",
            vibe: "Retro neon courtyard & arts hub",
            description: "Lively courtyard filled with preserved vintage glowing neon signs, progressive art foundations, and queer-friendly dance clubs."
          },
          {
            name: "Nadodrze Artisan Quarter",
            vibe: "Artsy, bohemian & indie studios",
            description: "North of the Oder River, Nadodrze is filled with artist workshops, specialty bakeries, and inclusive community galleries."
          }
        ],
        barsAndClubs: [
          {
            name: "HAH Wrocław",
            address: "ul. Piotra Skargi 18a",
            type: "Premier Multi-Room LGBTQ+ Nightclub",
            description: "Wrocław's largest and most famous gay club featuring multiple dance zones (Pop, House, Retro, Darkroom), weekly drag revues, and themed events.",
            vibe: "High-energy weekend dance club & drag extravaganzas"
          },
          {
            name: "Surowiec",
            address: "ul. Ruska 46a (Neon Courtyard)",
            type: "Queer-Friendly Cultural Bar & Dance Spot",
            description: "Trendy industrial-chic bar under glowing neon signs hosting queer DJ sets, discussions, indie film screenings, and craft beer.",
            vibe: "Eclectic arts space & vibrant neon courtyard drinks"
          },
          {
            name: "Bułka z Masłem",
            address: "ul. Pawła Włodkowica 8a",
            type: "Secret Garden Cocktail Bar",
            description: "Enchanting leafy garden bar in the Four Denominations district, known for welcoming vibes, cocktails, and delicious bites.",
            vibe: "Cozy romantic garden atmosphere"
          }
        ],
        cafesAndDining: [
          {
            name: "Café Borówka",
            address: "ul. Świdnicka 38a",
            type: "Cozy Specialty Coffee & Bakery",
            description: "Welcoming indie café with specialty pour-overs, artisanal cakes, and an inclusive, warm neighborhood atmosphere.",
            signature: "Artisanal drip coffees, cheesecake & vegan brownies"
          },
          {
            name: "Pochlebna",
            address: "ul. św. Antoniego 15",
            type: "Artisan Organic Bakery & Natural Wines",
            description: "Progressive sourdough bakery and bistro in the Four Denominations district famous for organic brunches and queer-welcoming staff.",
            signature: "Sourdough tartines, organic breakfasts & biodynamic wines"
          }
        ],
        communityAndCulture: [
          {
            name: "Marsz Równości Wrocław (Wrocław Pride)",
            type: "Annual Equality March & Festival",
            description: "Held annually every October, filling Wrocław's Rynek with thousands of participants, live music, and colorful equality floats.",
            highlight: "Organized by Kultura Równości with a multi-week cultural program"
          },
          {
            name: "Równe Miejsce (Equality Community Center)",
            type: "LGBTQ+ Community Center & Library",
            description: "Safe community space run by Kultura Równości hosting support groups, language exchanges, film clubs, and queer literature circles.",
            highlight: "ul. Kniaziewicza 16 — weekly community events & library"
          }
        ],
        winterExperiences: [
          {
            title: "Winter Glow in the Neon Side Gallery",
            description: "Stroll through the glowing Ruska 46 courtyard under warm neon signs while sipping spiced mulled wine."
          },
          {
            title: "Bridge Illuminations over the Oder",
            description: "Take an evening winter walk across the Tumski and Sand bridges to enjoy the illuminated Gothic spires."
          }
        ]
      }
    },
    {
      id: 'poznan',
      name: 'Poznań',
      nights: 2,
      base: 'Old Town / Stare Miasto',
      focus: 'Efficient midpoint: compact historic core, Cathedral Island, markets, cafés, and easy rail positioning.',
      marketStrategy: 'First Poznań market evening. Seasonal displays, possible ice-sculpture or market events.',
      dates: 'Nov 21, 2026 - Jan 6, 2027 (Plac Wolności)',
      openingHours: 'Open 11am-9pm. Open on Christmas Day.',
      hours: 'Open 11am-9pm. Open on Christmas Day.',
      kaucja: '30 PLN (~$8.00 USD)',
      foodTargets: ['Brovaria', 'Bamberka', 'Wiejskie Jadło'],
      hotels: ['PURO Poznań Stare Miasto', 'City Park Hotel & Residence', 'Sheraton Poznań Hotel'],
      imageDetails: {
        location: 'Stare Miasto & Plac Wolności',
        landmark: 'Renaissance Town Hall & Betlejem Poznańskie',
        description: "Home to the famous International Ice Sculpture Festival. Features a giant illuminated ferris wheel, wooden craft stalls, and warm bakery stands serving official St. Martin's Croissants (Rogale Świętomarcińskie)."
      },
      history: 'Poznań is celebrated as the cradle of the Polish state and the birthplace of the nation. It was on Ostrów Tumski (Cathedral Island) in 966 that Duke Mieszko I was baptized, uniting Slavic tribes under Christianity and establishing Poland. Poznań grew into a major mercantile crossroads, renowned for its Italian Renaissance Town Hall with its famous head-butting mechanical goats, the victorious Greater Poland Uprising of 1918, and the cherished tradition of St. Martin\'s croissants.',
      historyStats: [
        { label: 'Nation Birthplace', value: '966 AD (Baptism of Poland)', icon: 'Landmark' },
        { label: 'Royal Tombs', value: '1st Polish Kings (Mieszko I)', icon: 'Crown' },
        { label: 'Old Market Square', value: 'Chartered 1253 (Stary Rynek)', icon: 'MapPin' },
        { label: 'Victorious Uprising', value: '1918-1919 (Greater Poland)', icon: 'Award' }
      ],
      historyEpochs: [
        {
          era: '966 - 1038',
          title: 'The Cradle of the Polish Nation',
          subtitle: 'Ostrów Tumski, Duke Mieszko I, and Poland\'s first cathedral',
          description: 'On Cathedral Island in Poznań, Duke Mieszko I built his fortified palace and accepted Christian baptism in 966, founding the Polish state. Poland\'s first cathedral (St. Peter and Paul) was erected here in 968, housing the Golden Chapel tombs of Mieszko I and Poland\'s first crowned king, Bolesław the Brave.'
        },
        {
          era: '1253 - 1550',
          title: 'Medieval Trade Hub & Renaissance Splendor',
          subtitle: 'Magdeburg Law charter and Giovanni Battista di Quadro\'s Town Hall',
          description: 'In 1253, Duke Przemysł I relocated the city center across the Warta River to the present-day Stary Rynek. Following a destructive fire in 1536, Italian master architect Giovanni Battista di Quadro rebuilt the Town Hall into one of Northern Europe\'s finest Renaissance civic masterpieces, incorporating the famous mechanical clock goats.'
        },
        {
          era: '1550 - 1793',
          title: 'The Golden Age of Merchant Guilds & Academia',
          subtitle: 'Lubrański Academy, Baroque parish churches, and European trade crossroads',
          description: 'Poznań flourished as a vital hub of international commerce along routes connecting Nuremberg, Wrocław, Toruń, and Baltic ports. Bishop Jan Lubrański established the Lubrański Academy in 1518, while Jesuit masters crafted the magnificent pink-and-gold Baroque Fara Church (St. Stanislaus Parish Basilica).'
        },
        {
          era: '1793 - 1918',
          title: 'Prussian Partition & The Citadel Fortress',
          subtitle: 'Festung Posen fortification, economic resistance, and organic work movement',
          description: 'Annexed by Prussia during the Partitions of Poland, Poznań was turned into a garrison fortress city (Festung Posen) centered on the massive Winiary Fort (Citadel). Local Polish patriots pioneered the "Organic Work" philosophy, founding the Bazar Hotel, Cegielski manufacturing plants, and agricultural cooperatives to maintain Polish economic autonomy.'
        },
        {
          era: '1918 - 1919',
          title: 'The Victorious Greater Poland Uprising',
          subtitle: 'Ignacy Jan Paderewski\'s rallying speech and triumphant reunification',
          description: 'On December 26, 1918, world-renowned pianist and statesman Ignacy Jan Paderewski arrived at Poznań Główny station, giving an electrifying speech at the Bazar Hotel. The following day, the Greater Poland Uprising erupted - one of the very few completely victorious Polish military uprisings in history, freeing the region and reuniting it with the Second Polish Republic.'
        },
        {
          era: 'Post-WWII - Present',
          title: 'Poznań June 1956 & Modern Commercial Crossroads',
          subtitle: 'Historic workers\' strike for "Bread and Freedom" and international commerce',
          description: 'On June 28, 1956, over 100,000 workers took to the streets demanding "Bread and Freedom", sparking Poland\'s first major revolt against communist dictatorship. Commemorated by the towering Monument of the Poznań Crosses, modern Poznań has evolved into Poland\'s leading international trade fair hub and a dynamic cultural capital.'
        }
      ],
      historyLegends: [
        {
          icon: '🐐',
          title: 'The Poznań Town Hall Goats (Koziołki)',
          description: 'Legend says a clumsy young chef named Pietrek accidentally burned the roast deer intended for the Voivode\'s banquet. In panic, he stole two billy goats from a meadow to cook, but they escaped up the Town Hall tower and started head-butting, delighting the guests so much they were spared forever.'
        },
        {
          icon: '🥐',
          title: 'St. Martin\'s Horseshoe Croissant (Rogale)',
          description: 'In 1891, inspired by priest Jan Lewicki\'s sermon about St. Martin\'s generosity, baker Józef Melzer baked horseshoe-shaped pastries filled with white poppy seeds, almonds, and honey to distribute free to the city\'s poor, creating Poznań\'s proudest culinary tradition.'
        },
        {
          icon: '👑',
          title: 'Lech, Czech, and Rus at Poznań',
          description: 'Slavic folklore tells that three founding brothers - Lech, Czech, and Rus - had been separated for years during their travels across Europe. When they unexpectedly met again by the Warta River, they joyfully cried out "Poznać!" ("To recognize!"), and built a stronghold on that very spot.'
        }
      ],
      lgbtq: {
        title: "LGBTQ+ Traveler's Guide to Poznań",
        subtitle: "Poland's Rainbow Capital, Grupa Stonewall, Lokomotywa Club, and bohemian Jeżyce",
        overview: "Poznań is widely recognized as Poland's most progressive, open-minded, and LGBTQ+-friendly city. Home to Grupa Stonewall—one of Central Europe's most active and impactful queer organizations—Poznań features queer-owned cafés (Kawiarnia Stonewall), LGBTQ+ health services, the legendary Lokomotywa nightclub, and Poland's most celebrated Poznań Pride Week. Queer travelers will find unmatched visibility, rainbow flags in storefronts, and a relaxed, welcoming metropolitan energy.",
        primaryArea: "Jeżyce District & Stare Miasto (Old Town)",
        landmark: "Kawiarnia Stonewall & Plac Wolności",
        landmarkDescription: "Queer-owned community café and activist hub in Jeżyce, minutes from the lively Christmas market on Plac Wolności.",
        imageUrl: "/images/poznan.png",
        safetyAndLegal: {
          legalContext: "Poznań has long been Poland's leader in municipal anti-discrimination policies, with official mayoral patronage for Pride marches since 2015.",
          safetyRating: "Highest in Poland (Very Safe & Progressive)",
          pdaAdvice: "Public Displays of Affection: Very comfortable throughout the city center, Jeżyce, and Old Town.",
          helplines: [
            { name: "Grupa Stonewall", contact: "Poland's flagship LGBTQ+ organization & community center" },
            { name: "Kawiarnia Stonewall", contact: "ul. Za Bramką 1 / ul. Garbary — queer community café" }
          ]
        },
        neighborhoods: [
          {
            name: "Jeżyce District",
            vibe: "Hipster, culinary & progressive queer hub",
            description: "Poznań's trendiest neighborhood, packed with Art Nouveau tenements, queer-welcoming vegan eateries, specialty coffee, and vintage stores."
          },
          {
            name: "Stare Miasto & Plac Wolności",
            vibe: "Historic market plaza & nightlife center",
            description: "Surrounding the Old Market Square and Plac Wolności, home to historic cellar pubs, cocktail lounges, and seasonal festivals."
          }
        ],
        barsAndClubs: [
          {
            name: "Lokomotywa Club",
            address: "ul. Dworcowa 1 (Near Main Station)",
            type: "Legendary Dedicated LGBTQ+ Nightclub",
            description: "Poznań's iconic gay dance club with two dance floors, energetic DJ sets, drag shows, and friendly weekend crowds.",
            vibe: "Classic gay dance floor, drag revues & weekend party vibes"
          },
          {
            name: "Punto Punct Club",
            address: "ul. Wielka 10",
            type: "Alternative & Queer Social Lounge",
            description: "Intimate downtown venue hosting queer dance parties, karaoke nights, and community gatherings.",
            vibe: "Welcoming lounge & community parties"
          }
        ],
        cafesAndDining: [
          {
            name: "Kawiarnia Stonewall",
            address: "ul. Garbary 67 / ul. Wroniecka",
            type: "100% Queer-Owned Community Café",
            description: "Social enterprise café run by Grupa Stonewall where 100% of profits fund local LGBTQ+ mental health and community services.",
            signature: "Specialty coffee, delicious cakes & rainbow souvenirs"
          },
          {
            name: "Kraszkebab (Jeżyce)",
            address: "ul. Kraszewskiego 9",
            type: "Beloved Vegan Culinary Hotspot",
            description: "Cult plant-based eatery in Jeżyce loved by the queer community for plant-based wraps, craft drinks, and friendly staff.",
            signature: "Vegan seitan kebabs, fries & homemade sauces"
          }
        ],
        communityAndCulture: [
          {
            name: "Poznań Pride Week & Marsz Równości",
            type: "Poland's Flagship Pride Festival",
            description: "A massive week-long festival featuring film screenings, panel debates, drag contests, and a Pride march supported by the city council.",
            highlight: "Organized by Grupa Stonewall with nationwide participation"
          }
        ],
        winterExperiences: [
          {
            title: "Coffee & Community at Kawiarnia Stonewall",
            description: "Warm up after the Christmas market on Plac Wolności with specialty brew at Kawiarnia Stonewall."
          }
        ]
      }
    },
    {
      id: 'torun',
      name: 'Toruń',
      nights: 0,
      base: 'Day Stop Only',
      focus: 'Low-hassle medieval break: lockers, gingerbread, UNESCO core, lunch, and onward train to Gdańsk.',
      marketStrategy: 'Walk the medieval core, try gingerbread, photograph the red-brick streets, and have one sit-down lunch.',
      dates: 'Nov 21, 2026 - Dec 21, 2026',
      openingHours: 'Mon-Thu 12pm-9pm, Fri 12pm-10pm, Sat 10am-10pm, Sun 10am-9pm.',
      hours: 'Mon-Thu 12pm-9pm, Fri 12pm-10pm, Sat 10am-10pm, Sun 10am-9pm.',
      kaucja: '30 PLN (~$8.00 USD)',
      foodTargets: [],
      hotels: [],
      imageDetails: {
        location: 'Rynek Staromiejski (Old Town Square)',
        landmark: 'UNESCO Medieval Gothic Town Hall & Copernicus Monument',
        description: 'Set within a preserved 13th-century red-brick medieval core. Famous for rich ginger aromas, traditional hand-painted wooden trinkets, and centuries-old Toruń gingerbread (pierniki) baked from secret spice recipes.'
      },
      history: 'Toruń is one of Poland’s oldest and most intact medieval cities, founded in 1233 by the Teutonic Knights along the Vistula River. Inscribed on the UNESCO World Heritage List in 1997, its magnificent red-brick Gothic Old Town survived World War II without a single bomb falling on its historic core. Toruń is world-renowned as the birthplace of astronomer Nicolaus Copernicus - who "stopped the Sun and moved the Earth" - and as Europe\'s ancient gingerbread capital, baking Toruńskie Pierniki for over 700 years.',
      historyStats: [
        { label: 'Founded', value: '1233 (Teutonic Order Charter)', icon: 'Landmark' },
        { label: 'UNESCO Heritage', value: '1997 (Intact Brick Gothic)', icon: 'Award' },
        { label: 'Pierniki Tradition', value: '700+ Years (Since 1380)', icon: 'Crown' },
        { label: 'Copernicus Birth', value: 'Feb 19, 1473', icon: 'MapPin' }
      ],
      historyEpochs: [
        {
          era: '1233 - 1454',
          title: 'Teutonic Knights & Hanseatic River Port',
          subtitle: 'Teutonic castle fortress and Baltic grain trade wealth',
          description: 'Founded by the Teutonic Order in 1233, Toruń quickly joined the Hanseatic League and grew into a wealthy river trading hub. Grand Gothic monuments rose across the city, including the monumental Town Hall on Rynek Staromiejski, St. John\'s Cathedral, and the fortified city walls with the iconic Leaning Tower (Krzywa Wieża).'
        },
        {
          era: '1454 - 1466',
          title: 'The Thirteen Years\' War & Return to Poland',
          subtitle: 'Burghers demolish the Teutonic castle and pledge loyalty to the Polish Crown',
          description: 'Frustrated by heavy Teutonic taxes, Toruń burghers rebelled in 1454, besieging and completely demolishing the Teutonic Castle. They pledged loyalty to Polish King Casimir IV Jagiellon, sparking the Thirteen Years\' War that ended with the 1466 Second Peace of Toruń, returning Royal Prussia to the Polish realm with extensive autonomous privileges.'
        },
        {
          era: '1473',
          title: 'The Birth of Nicolaus Copernicus',
          subtitle: 'The Renaissance astronomer who revolutionized human understanding of the universe',
          description: 'On February 19, 1473, Mikołaj Kopernik (Nicolaus Copernicus) was born in a Gothic townhouse on St. Anne Street. Educated at Kraków and in Italy, his groundbreaking treatise De revolutionibus orbium coelestium placed the Sun at the center of the solar system, launching the modern scientific revolution.'
        },
        {
          era: '16th - 18th Century',
          title: 'Golden Age of Patrician Palaces & Pierniki',
          subtitle: 'Renaissance art, gingerbread guilds, and the House Under the Star',
          description: 'Toruń patrician families built exquisite Renaissance townhouses like the House Under the Star (Kamienica Pod Gwiazdą). The Toruń gingerbread baking guild established secret spice recipes blending Asian ginger, cinnamon, nutmeg, and regional Vistula honey, earning royal acclaim across European courts.'
        },
        {
          era: '1793 - 1920',
          title: 'Prussian Rule & The Fortress of Toruń',
          subtitle: 'Ring of artillery forts and cultural preservation under partition',
          description: 'Following the Second Partition of Poland in 1793, Toruń became a key border stronghold of Prussia (Festung Thorn). A formidable ring of over 200 artillery forts and defensive works was constructed, protecting the medieval core while industrial railways linked the city to Berlin, Warsaw, and Danzig.'
        },
        {
          era: '1945 - Present',
          title: 'Miraculous Preservation & UNESCO Recognition',
          subtitle: 'Undamaged architectural treasure and academic center',
          description: 'Spared from destructive street battles during WWII, Toruń emerged as one of Poland\'s purest preserved medieval cities. In 1945, displaced Polish professors from Stefan Batory University in Wilno (Vilnius) founded Nicolaus Copernicus University (UMK), cementing Toruń as a premier academic and cultural destination.'
        }
      ],
      historyLegends: [
        {
          icon: '🎻',
          title: 'The Toruń Raftsman (Flisak) & The Frog Plague',
          description: 'When Toruń was overrun by an overwhelming plague of frogs, the mayor offered gold and his daughter\'s hand in marriage to whoever could rid the town of them. A humble raftsman named Iwo played his violin so enchantingly that all the frogs followed his melody out through Chełmno Gate into the Vistula marshlands.'
        },
        {
          icon: '🏰',
          title: 'The Leaning Tower of Toruń (Krzywa Wieża)',
          description: 'Built in the 14th century, this 15-meter tower leans 1.4 meters off-center. Medieval legend says a Teutonic knight built it as penance for falling in love with a local woman. Visitors are challenged to stand with their heels and back against the wall without falling over - proving they possess a pure and honest heart.'
        },
        {
          icon: '🍪',
          title: 'The Legend of Katarzynka Gingerbread',
          description: 'When a medieval baker fell ill before the Polish King\'s visit, his clever daughter Katarzyna baked spiced honey cookies using six overlapping circles of dough. The King was so impressed by the unique shape and delicious flavor that he declared them Poland\'s official gingerbread, named "Katarzynki" in her honor.'
        }
      ]
    },
    {
      id: 'gdansk',
      name: 'Gdańsk',
      nights: 2,
      base: 'Old Town, Waterfront, or Granary Island',
      focus: 'Coastal finale: Motława waterfront, amber, Hanseatic streets, and final Christmas market night.',
      marketStrategy: 'Final Christmas market at Targ Węglowy, then pack and stage luggage for the airport transfer.',
      dates: 'Nov 20, 2026 - Dec 23, 2026',
      openingHours: 'Open Sun-Thu 12pm-8pm, Fri-Sat 12pm-9pm. Closed Dec 24/25.',
      hours: 'Open Sun-Thu 12pm-8pm, Fri-Sat 12pm-9pm. Closed Dec 24/25.',
      kaucja: '30 PLN (~$8.00 USD)',
      foodTargets: ['Pierogarnia Mandu', 'Kubicki', 'Gdański Bowke'],
      hotels: ['Hilton Gdańsk', 'Hotel Podewils', 'Radisson Hotel & Suites Gdańsk'],
      imageDetails: {
        location: 'Targ Węglowy (Coal Market) & Motława Waterfront',
        landmark: 'Historic Motława Crane & Amber Sky',
        description: 'Award-winning coastal market with Hanseatic flair. Highlights include the Talking Moose Lucek, an authentic 19th-century Venetian Carousel, local Baltic amber artisan stalls, and hot spiced mead.'
      },
      history: 'Gdańsk is the thousand-year-old Hanseatic "Pearl of the Baltic" and Poland’s maritime gateway to the world. Renowned for its Dutch Mannerist merchant facades along the Royal Way (Droga Królewska), the colossal red-brick St. Mary\'s Basilica, and the 15th-century wooden harbor Crane (Żuraw) on the Motława River, Gdańsk has always stood as a fortress of liberty. It was here at Westerplatte that World War II began in 1939, and here in the Gdańsk Shipyard that Lech Wałęsa\'s Solidarność movement ignited the peaceful dismantling of European communism in 1980.',
      historyStats: [
        { label: 'First Mentioned', value: '997 AD (St. Adalbert)', icon: 'Landmark' },
        { label: 'Hanseatic Trade', value: '14th-17th C. (Golden Age)', icon: 'Award' },
        { label: 'Amber Capital', value: '70%+ World Amber Crafting', icon: 'MapPin' },
        { label: 'Solidarity Birth', value: 'August 1980 (Solidarność)', icon: 'Crown' }
      ],
      historyEpochs: [
        {
          era: '997 - 1308',
          title: 'Slavic Stronghold & Early Baltic Port',
          subtitle: 'Mission of St. Adalbert and Piast royal maritime outpost',
          description: 'Gdańsk was first documented in 997 AD during St. Adalbert\'s Christian mission supported by Polish Duke Bolesław the Brave. Strategically situated at the mouth of the Vistula River where Polish grain and timber met Baltic sea routes, Gdańsk grew into a thriving Slavic port town under the Dukes of Pomerelia.'
        },
        {
          era: '1308 - 1454',
          title: 'Teutonic Knights & Hanseatic Maritime Boom',
          subtitle: 'The Great Mill, St. Mary\'s Basilica, and the Motława River Crane',
          description: 'In 1308, the Teutonic Order seized Gdańsk. Despite harsh Teutonic rule, the city joined the Hanseatic League and became one of Europe\'s most powerful maritime commercial powers. Teutonic engineers constructed the Great Mill (Wielki Młyn) and the legendary wooden harbor Crane (Żuraw) to load Polish grain onto European cargo caravels.'
        },
        {
          era: '1454 - 1793',
          title: 'The Polish Golden Age & Europe\'s Granary',
          subtitle: 'The Royal Way, Neptune\'s Fountain, and Dutch Mannerist architecture',
          description: 'During the Thirteen Years\' War, Gdańsk citizens allied with Polish King Casimir IV, receiving the grand Privileges of Casimir that granted the city vast autonomy, coinage rights, and control over Polish foreign trade. Wealthy merchant patricians transformed Długi Targ into a showcase of Dutch Mannerism, building Artus Court and Neptune\'s Fountain.'
        },
        {
          era: '1920 - 1939',
          title: 'The Free City of Danzig (Wolne Miasto Gdańsk)',
          subtitle: 'League of Nations autonomous mandate and geopolitical tension',
          description: 'Under the Treaty of Versailles following WWI, Gdańsk was established as a semi-autonomous city-state (Free City of Danzig) under League of Nations supervision, with Poland retaining customs, rail, and postal rights. Rising nationalistic tensions led to historic friction over the Polish Post Office and the Westerplatte military depot.'
        },
        {
          era: '1939 - 1945',
          title: 'Westerplatte & The Outbreak of World War II',
          subtitle: 'First shots of WWII on Sept 1, 1939, and wartime devastation',
          description: 'At 4:45 AM on September 1, 1939, the German battleship Schleswig-Holstein fired the opening shots of World War II at the Polish military outpost on Westerplatte peninsula. A tiny garrison of fewer than 200 Polish soldiers heroically held out for seven days against overwhelming Nazi forces before surrender. In early 1945, heavy fighting left 90% of Gdańsk\'s historic center in ruins.'
        },
        {
          era: '1980 - Present',
          title: 'The Solidarność Revolution & Maritime Renaissance',
          subtitle: 'Lenin Shipyard strikes, Lech Wałęsa, and the fall of the Iron Curtain',
          description: 'In August 1980, electrician Lech Wałęsa led the historic strike at the Lenin Shipyard, resulting in the signing of the Gdańsk Agreement and the creation of Solidarność - the first independent trade union in the Soviet Bloc. This 10-million-strong movement ignited the peaceful collapse of communist regimes across Eastern Europe in 1989.'
        }
      ],
      historyLegends: [
        {
          icon: '🔱',
          title: 'Neptune\'s Fountain & Goldwasser Liqueur',
          description: 'According to Gdańsk lore, citizens and merchants would toss gold and silver coins into Neptune\'s fountain for luck. Annoyed by the cluttered basin, the bronze sea god struck his heavy trident against the water, shattering the coins into millions of tiny golden flakes that gave birth to Danziger Goldwasser herbal liqueur.'
        },
        {
          icon: '🪟',
          title: 'The Lady in the Window (Panienka z Okienka)',
          description: 'Based on Deotyma\'s 19th-century novel, the legend tells of beautiful young Hedwig who looked out from the top garret window of Artus Court onto Długi Targ. A mechanical figure of the "Lady in the Window" still appears daily at 1:00 PM from the top window of the New Court House.'
        },
        {
          icon: '⛪',
          title: 'The Clockmaker of St. Mary\'s Basilica',
          description: 'In 1464, master craftsman Hans Düringer built the monumental 14-meter astronomical clock inside St. Mary\'s. Legend says the city council, fearing he might build an even more magnificent clock for a rival city, blinded the master. In retribution, Düringer climbed the clock one final time and smashed its delicate gear mechanism before falling to his death.'
        }
      ],
      lgbtq: {
        title: "LGBTQ+ Traveler's Guide to Gdańsk & Tricity",
        subtitle: "Baltic City of Freedom, Tolerado Association, Bunkier Club, and Stare Przedmieście",
        overview: "As the historic birthplace of Solidarity, Gdańsk proudly embodies the spirit of freedom, tolerance, and open maritime culture. Gdańsk was the first Polish city to adopt a comprehensive Model of Equal Treatment (Model na rzecz Równego Traktowania). Driven by the influential regional advocacy group Tolerado, Gdańsk and the broader Tricity (Sopot, Gdynia) offer an open and progressive coastal haven with vibrant multi-level nightlife at Bunkier Club and welcoming amber-lit cellar taverns along Piwna and Mariacka streets.",
        primaryArea: "Główne Miasto (Main Town) & Dolne Miasto",
        landmark: "Bunkier Club & Motława Waterfront",
        landmarkDescription: "A massive 6-story converted wartime air-raid bunker turned into an eclectic arts venue and inclusive multi-floor nightclub near the Old Town.",
        imageUrl: "/images/gdansk.png",
        safetyAndLegal: {
          legalContext: "Gdańsk pioneered Poland's first municipal Equality Charter and celebrates official City Hall patronage for its Equality March (Trójmiejski Marsz Równości).",
          safetyRating: "Very Safe & Cosmopolitan",
          pdaAdvice: "Public Displays of Affection: Relaxed along the Długi Targ, Motława waterfront, and café districts.",
          helplines: [
            { name: "Tolerado Association", contact: "Flagship Tricity LGBTQ+ advocacy & community foundation" },
            { name: "Trójmiejski Marsz Równości", contact: "Annual Tricity Pride March & cultural festival" }
          ]
        },
        neighborhoods: [
          {
            name: "Główne Miasto (Main Town)",
            vibe: "Historic Hanseatic merchant streets & cellar bars",
            description: "Centered on Piwna, Długa, and Mariacka streets, offering cozy candlelit bars, amber boutiques, and welcoming cafés."
          },
          {
            name: "Stocznia & 100cznia / Ulica Elektryków",
            vibe: "Post-industrial creative shipyards",
            description: "Creative shipping-container cultural zone by the historic Gdańsk Shipyards with street art, food trucks, and queer-friendly DJ sets."
          }
        ],
        barsAndClubs: [
          {
            name: "Bunkier Club",
            address: "ul. Olejarna 3",
            type: "6-Floor Monumental Art & Dance Club",
            description: "Epic multi-level club housed in a historic WWII bunker. Features art installations, prison-cell lounge booths, drag events, and welcoming queer-inclusive dance floors.",
            vibe: "Industrial labyrinth, drag revues & eclectic dance floors"
          },
          {
            name: "Red Light Pub",
            address: "ul. Piwna 28",
            type: "Artsy Queer-Welcoming Craft Beer Pub",
            description: "Intimate, atmospheric pub on picturesque Piwna street serving curated Polish craft beers, ciders, and vinyl beats in a cozy red-lit haven.",
            vibe: "Craft beers, red neon lights & bohemian chats"
          }
        ],
        cafesAndDining: [
          {
            name: "Drukarnia Café",
            address: "ul. Mariacka 36",
            type: "Specialty Coffee on Amber Street",
            description: "Stunning specialty coffee spot on historic cobblestone Mariacka street, welcoming travelers with third-wave brews and gourmet toasts.",
            signature: "Pour-over coffees, artisan cheesecakes & warm winter tea"
          }
        ],
        communityAndCulture: [
          {
            name: "Trójmiejski Marsz Równości (Tricity Pride)",
            type: "Annual Baltic Equality March",
            description: "One of Poland's largest pride marches, traversing Gdańsk's historic center with wide municipal support and seaside solidarity.",
            highlight: "Organized annually by Stowarzyszenie Tolerado"
          }
        ],
        winterExperiences: [
          {
            title: "Evening Glow on Mariacka & Motława Waterfront",
            description: "Walk past gargoyle rainspouts and amber stalls along Mariacka street, then cross the footbridge to the illuminated granaries."
          }
        ]
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
    currency: 'Use PLN divided by 3.75 for exact USD conversion. Keep 50 to 100 PLN (~$13.35 to $26.70 USD) in small notes for market snacks, facilities, and small vendors.',
    phrases: 'Cześć (Hello), Dzień dobry (Good morning), Dziękuję (Thank you), Proszę (Please/Here you go), Ile to kosztuje? (How much is this?), Czy można kartą? (Can I pay by card?), Poproszę grzańca (Mulled wine, please), Poproszę piwo (Beer, please), Na zdrowie (Cheers).',
    packing: 'Waterproof boots, thermal layers, winter parka, hat, scarf, gloves, merino socks, compact daypack, power bank, Type C/E adapters, printed rail and flight documents.',
    emergency: 'Store passport copies, insurance, reservations, train tickets, airline check-in details, hotel addresses, and payment backup offline. Use Jakdojade for transit and Uber or Bolt for quick point-to-point rides.'
  }
};
