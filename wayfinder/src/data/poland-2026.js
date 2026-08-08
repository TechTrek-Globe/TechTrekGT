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
          pricing: 'Cathedral free; State Rooms ~35 PLN (~$9)',
          costData: 'Cathedral free; State Rooms ~35 PLN (~$9)',
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
          pricing: '15 PLN (~$4) for tourist entry (front half of church)',
          costData: '15 PLN (~$4) for tourist entry (front half of church)',
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
          pricing: 'Cloth Hall free; Underground Museum ~32 PLN (~$8.50)',
          costData: 'Cloth Hall free; Underground Museum ~32 PLN (~$8.50)',
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
          pricing: 'Free to explore; Synagogue entries ~10-15 PLN',
          costData: 'Free to explore; Synagogue entries ~10-15 PLN',
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
          pricing: 'Park free; Barbican entry ~16 PLN',
          costData: 'Park free; Barbican entry ~16 PLN',
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
          pricing: 'Free without guide; ~100 PLN (~$27) for guided tour (highly recommended)',
          costData: 'Free without guide; ~100 PLN (~$27) for guided tour (highly recommended)',
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
          pricing: '122 PLN (~$32) for foreign language guided tour',
          costData: '122 PLN (~$32) for foreign language guided tour',
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
          pricing: '32 PLN (~$8.50)',
          costData: '32 PLN (~$8.50)',
          openTimes: '10:00 AM - 6:00 PM (Mondays 10:00 AM - 2:00 PM)',
          hoursData: '10:00 AM - 6:00 PM (Mondays 10:00 AM - 2:00 PM)',
          daysClosed: 'First Tuesday of every month'
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
        location: "Rynek Główny (Main Market Square)",
        landmark: "St. Mary's Basilica (Kościół Mariacki)",
        description: "The iconic twin Gothic towers of St. Mary's Basilica rising above Krakow's historic main square, crowned with its famous golden spire."
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
      }
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
