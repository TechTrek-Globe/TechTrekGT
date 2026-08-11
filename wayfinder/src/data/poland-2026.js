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
          shortName: 'Rynek Główny',
          location: 'Grand Main Square (Old Town)',
          hours: 'Nov 28, 2026 – Jan 1, 2027 | Open 10am-8pm. Early close on Dec 24 (~2pm).',
          address: 'Rynek Główny 1, 31-042 Kraków (Tram: Teatr Bagatela or Dworzec Główny)',
          vibe: 'Bustling, Grand & Iconic',
          bestTime: '5:00 PM – 7:30 PM (Dusk illuminations & stage caroling)',
          highlights: [
            'Over 100 illuminated wooden chalets surrounding the Renaissance Cloth Hall',
            'SZOPKI Krakowskie Christmas Crib Competition (First Thursday of Dec)',
            'Stage caroling and live highlander folk performances daily',
            'Hot drink mugs require a 30 PLN (~$8.00 USD) cash deposit'
          ],
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
          shortName: 'Mały Rynek',
          location: 'Small Square (Behind St. Mary\'s)',
          hours: 'Late Nov – Dec 26 | Daily 11:00 AM – 9:00 PM',
          address: 'Mały Rynek, 31-041 Kraków (2-min walk from Main Square)',
          vibe: 'Cozy, Artisanal & Intimate',
          bestTime: '4:00 PM – 6:30 PM (Sip hot mead away from Main Square crowds)',
          highlights: [
            'Specialist regional honey producers & spiced mead (Miód Pitny)',
            'Master woodcarvers and handmade wooden toys',
            'Boutique hand-loomed wool scarves & slippers',
            'Substantially shorter lines for hot food and drinks'
          ],
          mustTry: ['Miód Pitny (Hot Spiced Mead)', 'Artisanal Ginger Cookies', 'Regional Honey Tides', 'Highlander Mountain Cheeses'],
          souvenirs: ['Small-batch honeys & beeswax candles', 'Hand-loomed wool scarves', 'Wooden toys', 'Artisan pottery'],
          tips: 'Much quieter and less crowded than the Main Square. Ideal spot to sip hot spiced mead without long lines and sample local organic honey jams.',
          specialty: 'Artisanal honeys, hot spiced mead (Miód Pitny), organic gingerbread, and boutique hand-loomed woolens.',
          details: 'A cozy, intimate extension located just behind St. Mary\'s Basilica. Mały Rynek focuses on regional food producers, small-batch gingerbread bakers, and master craftsmen selling one-of-a-kind wooden toys and wool slippers.'
        },
        {
          id: 'kazimierz-wolnica',
          name: 'Plac Wolnica Market',
          shortName: 'Plac Wolnica',
          location: 'Kazimierz (Jewish Quarter)',
          vibe: 'Bohemian, Vintage & Eclectic',
          bestTime: '6:00 PM – 9:00 PM (Combine with Kazimierz nightlife & Zapiekanki)',
          highlights: [
            'Bohemian, vintage vinyl & antique collector chalets',
            'Local craft mulled cider and winter craft beers on tap',
            'Indie artisan ceramics & handmade jewelry',
            'Proximity to Plac Nowy late-night Zapiekanki food plaza'
          ],
          hours: 'Dec 1 – Dec 24 | Daily 12:00 PM – 9:00 PM',
          address: 'Plac Wolnica, 31-060 Kraków (Tram: Plac Wolnica - Trams 1, 6, 8, 10, 13)',
          mustTry: ['Plac Nowy Zapiekanki', 'Craft Mulled Cider', 'Gourmet Pierogi flavors', 'Local Winter Stouts'],
          souvenirs: ['Retro vintage vinyl & antiques', 'Handmade ceramic mugs', 'Eco-friendly beeswax wraps', 'Indie jewelry'],
          tips: 'Located in the historic Jewish Quarter. Combine a market visit with dinner at nearby historic Jewish quarter restaurants, craft stouts, and late-night Zapiekanki at Plac Nowy.',
          specialty: 'Vintage antiques, indie artisan crafts, craft beer stalls, and gourmet local street food.',
          details: 'Set in the historic heart of Kazimierz, this market offers a bohemian, relaxed holiday atmosphere. Browse vintage vinyl, handmade ceramics, and indie art while sipping hot spiced cider or craft stouts.'
        },
        {
          id: 'podgorze',
          name: 'Rynek Podgórski Fair',
          shortName: 'Rynek Podgórski',
          location: 'Podgórze District (Across Vistula)',
          vibe: 'Fairytale, Family-Friendly & Charming',
          bestTime: '4:30 PM – 7:00 PM (Sunset backdrop against St. Joseph Church)',
          highlights: [
            'Breathtaking fairytale backdrop of neo-gothic St. Joseph\'s Church',
            'Vintage 19th-century Victorian carousel for children',
            'Neighborhood cookie & ornament crafting workshops',
            'Authentic community choir performances'
          ],
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
          websiteUrl: 'https://wawel.krakow.pl/en',
          description: 'The ancient seat of Polish kings overlooking the Vistula River. Explore the Italian Renaissance courtyard, royal state rooms, and the dragon\'s den statue that breathes real fire.',
          imageUrl: '/Poland-2026/images/krakow/attractions/wawel-castle.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/wawel-castle.jpg',
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
          websiteUrl: 'https://mariacki.com/en/',
          description: 'Iconic twin-towered gothic basilica on Rynek Główny. Step inside to marvel at the 15th-century carved wooden Veit Stoss altarpiece, and listen for the hourly trumpet call (Hejnał Mariacki).',
          imageUrl: '/Poland-2026/images/krakow/attractions/st-marys-basilica.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/st-marys-basilica.jpg',
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
          websiteUrl: 'https://muzeumkrakowa.pl/en/branches/rynek-underground',
          description: 'A 14th-century merchant hub selling amber and carved wood; underneath it lies a state-of-the-art medieval archaeological museum buried 4 meters under the square.',
          imageUrl: '/Poland-2026/images/krakow/attractions/cloth-hall.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/cloth-hall.jpg',
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
          websiteUrl: 'https://krakow.travel/en/132-krakow-kazimierz',
          description: 'Atmospheric cobblestone streets packed with historic synagogues, art galleries, cozy cellar bars, and the famous Plac Nowy Zapiekanki food plaza.',
          imageUrl: '/Poland-2026/images/krakow/attractions/kazimierz.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/kazimierz.jpg',
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
          websiteUrl: 'https://muzeumkrakowa.pl/en/branches/barbican',
          description: 'A 4-kilometer ring of parkland surrounding Old Town where medieval walls once stood, leading to the formidable 15th-century round Barbican defense tower.',
          imageUrl: '/Poland-2026/images/krakow/attractions/planty-park-barbican.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/planty-park-barbican.jpg',
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
          websiteUrl: 'https://www.auschwitz.org/en/',
          description: 'The former German Nazi concentration and extermination camp. A sobering and essential historical site requiring advance booking and respectful observance.',
          imageUrl: '/Poland-2026/images/krakow/attractions/auschwitz-birkenau.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/auschwitz-birkenau.jpg',
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
          websiteUrl: 'https://www.wieliczka-saltmine.com/',
          description: 'A massive 13th-century subterranean salt mine featuring stunning underground lakes, chapels carved entirely of salt, and intricate statues.',
          imageUrl: '/Poland-2026/images/krakow/attractions/wieliczka-salt-mine.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/wieliczka-salt-mine.jpg',
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
          websiteUrl: 'https://muzeumkrakowa.pl/en/branches/oskar-schindlers-enamel-factory',
          description: 'An interactive and deeply moving museum housed in Schindler\'s former factory, detailing life in Kraków under Nazi occupation during WWII.',
          imageUrl: '/Poland-2026/images/krakow/attractions/schindler-factory.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/schindler-factory.jpg',
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
          websiteUrl: 'https://www.chocholowskietermy.pl/en/',
          description: 'The largest thermal bath complex in Poland located in the Podhale mountain region near Kraków. Features steaming outdoor geothermal pools, whirlpools, saunas, and hydro-massages under falling winter snow with views of the Tatras mountains.',
          imageUrl: '/Poland-2026/images/krakow/attractions/thermal-baths.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/thermal-baths.jpg',
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
          imageUrl: '/Poland-2026/images/krakow/attractions/walking-tour.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/walking-tour.jpg',
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
          imageUrl: '/Poland-2026/images/krakow/attractions/schindler-factory.jpg',
          imageSrc: '/Poland-2026/images/krakow/attractions/schindler-factory.jpg',
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
      krakowRestaurantsDetailed: [
        {
          id: 'morskie-oko',
          name: 'Morskie Oko',
          category: 'must-haves',
          categoryLabel: 'Must-Have & Iconic',
          priceTier: '$$',
          priceEstimatePln: '60 - 110 PLN per person',
          address: 'ul. Szczepańska 3 (Old Town)',
          neighborhood: 'Stare Miasto (100m from Rynek)',
          cuisine: 'Highlander Polish (Podhale Mountain Region)',
          signature: 'Góralski Pierogi, Roasted Duck with Apples & Cranberries, Grilled Oscypek Cheese',
          description: 'Rustic wooden log cabin interior with live highlander folk musicians, crackling stone fireplaces, and rich mountain hospitality.',
          websiteUrl: 'https://www.morskieoko.krakow.pl',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/morskie-oko.jpg'
        },
        {
          id: 'czarna-kaczka',
          name: 'Czarna Kaczka (The Black Duck)',
          category: 'must-haves',
          categoryLabel: 'Must-Have & Iconic',
          priceTier: '$$ - $$$',
          priceEstimatePln: '70 - 130 PLN per person',
          address: 'ul. Poselska 22 (Old Town)',
          neighborhood: 'Stare Miasto (Near Wawel)',
          cuisine: 'Classic Royal Polish Fowl & Game',
          signature: 'Roasted Half Duck with Red Cabbage & Plum Sauce, Wild Mushroom Soup in Bread Bowl',
          description: 'Romantic, candle-lit Old Town dining room praised for authentic centuries-old Royal Polish duck and game bird preparations.',
          websiteUrl: 'https://czarnakaczka.pl',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/czarna-kaczka.jpg'
        },
        {
          id: 'stary-port',
          name: 'Stary Port Cellar Tavern',
          category: 'must-haves',
          categoryLabel: 'Must-Have & Iconic',
          priceTier: '$$',
          priceEstimatePln: '50 - 90 PLN per person',
          address: 'ul. Straszewskiego 27 (Planty Park)',
          neighborhood: 'Planty Ring & Wawel Border',
          cuisine: 'Polish Maritime & Subterranean Comfort',
          signature: 'Hot Spiced Honey Mead, Creamy Garlic Soup in Loaf, Smoked Trout, Pierogi Platters',
          description: 'Uniquely themed subterranean sailor tavern carved inside a 19th-century cellar near Wawel with warm wooden booths and historic relics.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/stary-port.jpg'
        },
        {
          id: 'pierogarnia-glowna',
          name: 'Pierogarnia Główna',
          category: 'local',
          categoryLabel: 'Local Fares & Hand-Rolled Pierogi',
          priceTier: '$',
          priceEstimatePln: '25 - 42 PLN per person',
          address: 'ul. Sławkowska 23 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          cuisine: 'Handmade Traditional Polish Pierogi',
          signature: 'Ruskie Pierogi (Potato & Cottage Cheese), Wild Mushroom & Cabbage, Sweet Cherry Pierogi',
          description: 'Acclaimed, dedicated handmade pierogi spot where dumplings are rolled, stuffed, and boiled fresh right before your eyes.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/pierogarnia-glowna.jpg'
        },
        {
          id: 'restauracja-starka',
          name: 'Restauracja Starka',
          category: 'local',
          categoryLabel: 'Local Fares & Infused Vodkas',
          priceTier: '$$',
          priceEstimatePln: '65 - 120 PLN per person',
          address: 'ul. Józefa 14 (Kazimierz)',
          neighborhood: 'Kazimierz Jewish Quarter',
          cuisine: 'Bohemian Polish & Homemade Infused Vodkas',
          signature: 'Chili-Honey & Cranberry Infused Vodkas, Pork Tenderloin in Creamy Chanterelle Sauce',
          description: 'Warm, vibrant Kazimierz institution famous for artisanal house-infused vodkas and hearty Polish comfort classics.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/restauracja-starka.jpg'
        },
        {
          id: 'pod-wawelem',
          name: 'Pod Wawelem Kompania Kuflowa',
          category: 'local',
          categoryLabel: 'Local Fares & Beer Hall',
          priceTier: '$ - $$',
          priceEstimatePln: '45 - 90 PLN per person',
          address: 'ul. św. Idziego 1 (Foot of Wawel)',
          neighborhood: 'Wawel Hill & Planty Park',
          cuisine: 'Traditional Polish Feast & Beer Hall',
          signature: 'Giant Schnitzels, Grilled Meat Skewers (Szaszłyk), Crispy Pork Knuckle (Golonka), Draft Beers',
          description: 'Lively, festive beer hall at the foot of Wawel Castle with massive portions, brass band energy, and family-style wooden tables.',
          websiteUrl: 'https://www.podwawelem.eu',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/pod-wawelem.jpg'
        },
        {
          id: 'bottiglieria-1881',
          name: 'Bottiglieria 1881 (2 Michelin Stars)',
          category: 'expensive',
          categoryLabel: 'Fine Dining & 2 Michelin Stars',
          priceTier: '$$$$',
          priceEstimatePln: '450 - 650 PLN per person',
          address: 'ul. Bocheńska 5 (Kazimierz)',
          neighborhood: 'Kazimierz (Riverfront Slope)',
          cuisine: 'Modern Polish Fine Dining',
          signature: 'Seasonal Małopolska Foraged Tasting Menu, Smoked Sturgeon, Artisanal Butter & Natural Wines',
          description: 'Poland\'s premier 2-Michelin-starred culinary temple in Kazimierz, transforming local Małopolska farm ingredients into modern art.',
          websiteUrl: 'https://1881.com.pl',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/bottiglieria-1881.jpg'
        },
        {
          id: 'fiorentina-ristorante',
          name: 'Fiorentina Ristorante (Michelin Bib Gourmand)',
          category: 'expensive',
          categoryLabel: 'Fine Dining & Michelin Bib Gourmand',
          priceTier: '$$$ - $$$$',
          priceEstimatePln: '180 - 320 PLN per person',
          address: 'ul. Grodzka 63 (Old Town Royal Route)',
          neighborhood: 'Stare Miasto (Royal Route)',
          cuisine: 'Modern Florentine & Fine Polish Fusion',
          signature: 'Bistecca alla Fiorentina (Dry-Aged Chianina Beef), Truffle Tagliatelle, Wild Boar Carpaccio',
          description: 'Award-winning fine dining housed in a restored Gothic palace on the Royal Route with an romantic glass courtyard atrium.',
          websiteUrl: 'https://fiorentina.com.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/fiorentina-ristorante.jpg'
        },
        {
          id: 'trzy-rybki',
          name: 'Trzy Rybki (Hotel Stary)',
          category: 'expensive',
          categoryLabel: 'Fine Dining & Luxury Vaults',
          priceTier: '$$$$',
          priceEstimatePln: '220 - 380 PLN per person',
          address: 'ul. Szczepańska 5 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          cuisine: 'Refined Polish Modern Gastronomy',
          signature: 'Venison Loin with Juniper, Roasted Goose Breast, Crayfish Soup, Fine Wine Pairing',
          description: 'Elegantly soaring Renaissance vaulted hall inside 5-star Hotel Stary, offering inventive modern Polish gastronomy.',
          websiteUrl: 'https://stary.hotel.com.pl/en/trzy-rybki/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/trzy-rybki.jpg'
        },
        {
          id: 'ed-red-steakhouse',
          name: 'Ed Red Steakhouse',
          category: 'steak',
          categoryLabel: 'Steakhouse & Dry-Aged Beef',
          priceTier: '$$$ - $$$$',
          priceEstimatePln: '120 - 280 PLN per person',
          address: 'ul. Sławkowska 3 (Old Town)',
          neighborhood: 'Stare Miasto (Near Main Square)',
          cuisine: 'Dry-Aged Beef & Polish Red Cattle',
          signature: '30-90 Day Dry-Aged Polish Red Cattle Ribeye, Bone Marrow Toast, Beef Tartare',
          description: 'Pioneering Polish steakhouse dedicated to dry-aging heritage Polish Red cattle breeds over aromatic wood embers.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/ed-red-steakhouse.jpg'
        },
        {
          id: 'pampas-steakhouse',
          name: 'PAMPAS Steakhouse & Asador',
          category: 'steak',
          categoryLabel: 'Steakhouse & Argentine Charcoal Grill',
          priceTier: '$$$ - $$$$',
          priceEstimatePln: '130 - 300 PLN per person',
          address: 'ul. św. Marka 21 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          cuisine: 'South American & Argentine Charcoal Grill',
          signature: 'Argentine Black Angus Bife de Lomo, Chimichurri Ribeye, Charcoal-Grilled Lamb Chops',
          description: 'Intimate, rustic stone cellar steakhouse specializing in prime South American charcoal-grilled cuts and Malbec pairings.',
          websiteUrl: 'https://pampas.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/pampas-steakhouse.jpg'
        },
        {
          id: 'muu-muu-steakhouse',
          name: 'Muu Muu Steakhouse',
          category: 'steak',
          categoryLabel: 'Steakhouse & Hot Stone Grill',
          priceTier: '$$$ - $$$$',
          priceEstimatePln: '110 - 250 PLN per person',
          address: 'ul. św. Krzyża 9 (Old Town)',
          neighborhood: 'Stare Miasto (Near Planty)',
          cuisine: 'International Premium Steakhouses & Grill',
          signature: 'T-Bone Steak, Wagyu Skirt Steak, Charcoal Grilled Burgers, Potato Wedges with Truffle Dip',
          description: 'Cozy brick-walled steakhouse near Planty Park serving sizzling hot-stone steaks and craft draft beers.',
          websiteUrl: 'https://muumuu.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/muu-muu-steakhouse.jpg'
        },
        {
          id: 'bar-mleczny-pod-temida',
          name: 'Bar Mleczny Pod Temidą',
          category: 'cheap',
          categoryLabel: 'Cheap Eats & Historic Milk Bar',
          priceTier: '$',
          priceEstimatePln: '15 - 28 PLN per person',
          address: 'ul. Grodzka 27 (Old Town Royal Route)',
          neighborhood: 'Stare Miasto (Royal Route)',
          cuisine: 'Authentic Post-Communist Polish Milk Bar',
          signature: 'Żurek Sour Rye Soup, Placki Ziemniaczane (Potato Pancakes), Pierogi Ruskie',
          description: 'Legendary subsidized Polish Milk Bar on Grodzka street serving dirt-cheap, piping-hot traditional home cooking.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/bar-mleczny-pod-temida.jpg'
        },
        {
          id: 'plac-nowy-zapiekanki',
          name: 'Plac Nowy Zapiekanki (Kazimierz)',
          category: 'cheap',
          categoryLabel: 'Cheap Eats & Street Food',
          priceTier: '$',
          priceEstimatePln: '14 - 22 PLN per item',
          address: 'Plac Nowy (Center Rotunda, Kazimierz)',
          neighborhood: 'Kazimierz (Plac Nowy)',
          cuisine: 'Iconic Polish Open-Face Baguette Street Food',
          signature: 'Toasted Zapiekanki with sautéed mushrooms, melted cheese, chives, fried onions & garlic sauce',
          description: 'Kraków\'s most famous late-night budget street food experience served steaming hot from the Kazimierz rotunda.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/plac-nowy-zapiekanki.jpg'
        },
        {
          id: 'pierogarnia-u-vincenta',
          name: 'Pierogarnia u Vincenta',
          category: 'cheap',
          categoryLabel: 'Cheap Eats & Pierogi Parlor',
          priceTier: '$',
          priceEstimatePln: '20 - 35 PLN per person',
          address: 'ul. Józefa 25 (Kazimierz)',
          neighborhood: 'Kazimierz (Józefa Street)',
          cuisine: 'Vincent van Gogh Themed Pierogi Parlor',
          signature: 'Spinach & Feta Pierogi, Sweet Cottage Cheese Dumplings, Beetroot Barszcz',
          description: 'Whimsical, colorful budget pierogi spot in Kazimierz with Van Gogh-inspired wall murals and delicious low prices.',
          websiteUrl: 'https://uvincenta.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/pierogarnia-u-vincenta.jpg'
        }
      ],
      krakowDrinksDetailed: [
        {
          id: 'wodka-cafe-bar',
          name: 'Wódka Cafe Bar',
          category: 'vodka-house',
          categoryLabel: 'Must-See Historic Vodka Flight House',
          priceTier: '$$',
          priceEstimatePln: '25 - 55 PLN per tasting flight',
          address: 'ul. Mikołajska 5 (Old Town)',
          neighborhood: 'Stare Miasto (Near Main Square)',
          drinkType: 'Artisanal Polish Vodka Flights & House Infusions',
          signature: '6-Shot Tasting Flights (Hazelnut, Salted Caramel, Horseradish, Quince, Plum, Chili)',
          description: 'Intimate candlelit Old Town tasting room famous for artisanal Polish vodka flights served on custom wooden paddles.',
          websiteUrl: 'https://wodkabar.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/wodka-cafe-bar.jpg'
        },
        {
          id: 'pijalnia-wodki',
          name: 'Pijalnia Wódki i Piwa',
          category: 'vodka-house',
          categoryLabel: 'Classic 24/7 Polish Shot Bar',
          priceTier: '$',
          priceEstimatePln: '8 - 18 PLN per shot/snack',
          address: 'ul. św. Jana 5 & ul. Floriańska 19',
          neighborhood: 'Stare Miasto (Old Town)',
          drinkType: 'Retro Socialist Vodka Bar & Tavern Snacks',
          signature: 'Lufa i Zakąska (Shot of Cytrynówka Lemon Vodka with Tart Herring or Pickles)',
          description: 'Retro post-communist watering hole with vintage newsprint wallpaper, 8 PLN vodka shots, draft Tyskie, and classic tavern snacks.',
          websiteUrl: 'https://pijalnia.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/pijalnia-wodki.jpg'
        },
        {
          id: 'singer-bar',
          name: 'Singer Bar (Kazimierz)',
          category: 'historic-bar',
          categoryLabel: 'Must-See Bohemian Antique Bar',
          priceTier: '$$',
          priceEstimatePln: '18 - 38 PLN per drink',
          address: 'ul. Estery 20 (Plac Nowy, Kazimierz)',
          neighborhood: 'Kazimierz (Plac Nowy)',
          drinkType: 'Mulled Beer, Spiced Wine & Classic Cocktails',
          signature: 'Grzane Piwo (Warm Spiced Beer with Honey & Cloves), Espresso Cocktails',
          description: 'Legendary Kazimierz watering hole where vintage 19th-century Singer sewing machines serve as tables amidst flickering candlelight and tango music.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/singer-bar.jpg'
        },
        {
          id: 'ck-browar',
          name: 'CK Browar (Kraków Microbrewery)',
          category: 'brewery',
          categoryLabel: 'Subterranean Microbrewery & Pub',
          priceTier: '$$',
          priceEstimatePln: '18 - 35 PLN per pint',
          address: 'ul. Podwale 6 (Old Town Ring)',
          neighborhood: 'Stare Miasto (Near Planty Park)',
          drinkType: 'Unfiltered House Brews & Table Beer Towers',
          signature: 'Unfiltered CK Lager, CK Dunkel, CK Weizen served in 3.5L & 5L Table Towers',
          description: 'Underground brick-vaulted microbrewery brewing unpasteurized Austrian & German style beers right on site since 1996.',
          websiteUrl: 'https://ckbrowar.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/ck-browar.jpg'
        },
        {
          id: 'multi-qlti-tap-bar',
          name: 'Multi Qlti Tap Bar',
          category: 'brewery',
          categoryLabel: 'Craft Beer Taproom (20+ Taps)',
          priceTier: '$$',
          priceEstimatePln: '20 - 38 PLN per craft pint',
          address: 'ul. Szewska 21 (Old Town)',
          neighborhood: 'Stare Miasto (Szewska Street)',
          drinkType: 'Polish Indie Craft Draft Taps',
          signature: '20 Rotating Polish & European Craft Taps (Pinta, AleBrowar, Stu Mostów, IPA & Porters)',
          description: 'Lively second-floor craft beer sanctuary overlooking Szewska street with 20 rotating draft taps, tasting flights, and balcony views.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/multi-qlti-tap-bar.jpg'
        },
        {
          id: 'house-of-beer',
          name: 'House of Beer Pub',
          category: 'pub',
          categoryLabel: 'Top Pub & Belgian Ale House',
          priceTier: '$$',
          priceEstimatePln: '18 - 38 PLN per beer',
          address: 'ul. św. Tomasza 35 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          drinkType: 'Polish Microbrews & Import Specialty Ales',
          signature: 'Smoked Grodziskie Wheat Ale, Polish Baltic Porters, Trappist Abbey Ales',
          description: 'Cozy brick pub with over 200 bottled beers and 15 craft taps from top Polish indie microbreweries.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/house-of-beer.jpg'
        },
        {
          id: 'alchemia',
          name: 'Alchemia (Kazimierz)',
          category: 'pub',
          categoryLabel: 'Iconic Subterranean Alchemist Bar',
          priceTier: '$$',
          priceEstimatePln: '18 - 35 PLN per drink',
          address: 'ul. Estery 5 (Plac Nowy, Kazimierz)',
          neighborhood: 'Kazimierz (Plac Nowy)',
          drinkType: 'Craft Amber Lagers, Absinthe & Dark Spirits',
          signature: 'Absinthe Drips, Dark Beer Cocktails, Polish Craft Lagers',
          description: 'The undisputed beating heart of Kazimierz nightlife. Dark, candlelit rooms filled with antique taxidermy, potion bottles, and basement jazz concerts.',
          websiteUrl: 'https://alchemia.com.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/alchemia.jpg'
        },
        {
          id: 'nowa-prowincja',
          name: 'Nowa Prowincja',
          category: 'watering-hole',
          categoryLabel: 'Literary Cellar & Mulled Wine Vault',
          priceTier: '$',
          priceEstimatePln: '15 - 30 PLN per mug',
          address: 'ul. Bracka 3 (Old Town)',
          neighborhood: 'Stare Miasto (Bracka Street)',
          drinkType: 'Hot Spiced Wine & Rum Chocolate Mugs',
          signature: 'Grzaniec Galicyjski (Hot Spiced Mulled Wine), Thick Hot Chocolate with Dark Rum',
          description: 'Iconic Kraków bohemian cellar frequented by Polish poets and artists; famous for steaming mugs of thick hot chocolate and spiced wine.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/nowa-prowincja.jpg'
        },
        {
          id: 'piwnica-pod-baranami',
          name: 'Piwnica Pod Baranami',
          category: 'watering-hole',
          categoryLabel: 'Historic Cabaret Cellar Bar',
          priceTier: '$$',
          priceEstimatePln: '18 - 35 PLN',
          address: 'Rynek Główny 27 (Main Square Cellar)',
          neighborhood: 'Rynek Główny (Main Market Square)',
          drinkType: 'Regional Ciders, Honey Beers & Classic Cocktails',
          signature: 'Polish Regional Ciders, Honey Beers, Classic Old Fashioned',
          description: 'Famed historic cellar beneath Main Market Square, birth site of Poland\'s most famous literary cabaret with stone arches and outdoor summer terrace.',
          websiteUrl: 'https://piwnicapodbaranami.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/piwnica-pod-baranami.jpg'
        },
        {
          id: 'bierhalle-krakow',
          name: 'Bierhalle Kraków (Mały Rynek)',
          category: 'beer-hall',
          categoryLabel: 'Bavarian-Style Polish Beer Hall',
          priceTier: '$$',
          priceEstimatePln: '18 - 35 PLN per pint',
          address: 'ul. Mały Rynek 7 (Mały Rynek / Main Square)',
          neighborhood: 'Stare Miasto (Mały Rynek)',
          drinkType: 'Unfiltered House Lagers, Märzen & Weizen',
          signature: 'Freshly Brewed Weizen & Dunkel on Tap, Bavarian Pretzels, Giant Pork Knuckle',
          description: 'Vibrant traditional beer hall right on Mały Rynek with giant copper brewing kettles, long wooden feast tables, and dirndl-clad servers.',
          websiteUrl: 'https://bierhalle.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/bierhalle-krakow.jpg'
        },
        {
          id: 'stara-zajezdnia',
          name: 'Stara Zajezdnia Kraków (Kazimierz Brewery)',
          category: 'beer-hall',
          categoryLabel: 'Historic Tram Depot Brewery Hall',
          priceTier: '$$',
          priceEstimatePln: '18 - 38 PLN per liter stein',
          address: 'ul. św. Wawrzyńca 12 (Kazimierz)',
          neighborhood: 'Kazimierz (Wawrzyńca Street)',
          drinkType: 'Unfiltered Craft Lagers & Honey Beers',
          signature: 'Stara Zajezdnia Unfiltered Lager, Honey Beer, 1-Liter Stein Mugs, Charcoal Sausages',
          description: 'Enormous, breathtaking 1913 brick tram depot hall converted into Poland\'s largest microbrewery beer hall with a 1500m² hall floor and massive timber beams.',
          websiteUrl: 'https://starazajezdniakrakow.pl/',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/stara-zajezdnia.jpg'
        },
        {
          id: 'cechowa-guild-cellar',
          name: 'Cechowa (Historic Guild Cellar Beer Hall)',
          category: 'beer-hall',
          categoryLabel: 'Historic Guild Cellar Beer Hall',
          priceTier: '$$',
          priceEstimatePln: '16 - 32 PLN per drink',
          address: 'ul. Jagiellońska 11 (Old Town)',
          neighborhood: 'Stare Miasto (Jagiellońska Street)',
          drinkType: 'Polish Regional Beers & Spiced Honey Meads',
          signature: 'Fresh Unpasteurized Draft Lager, Polish Mead (Miód Pitny), Smoked Sheep Cheese',
          description: 'Centuries-old stone cellar tavern beneath Jagiellońska street featuring heraldic shields, arched gothic brick vaults, and heavy oak benches.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/cechowa-guild-cellar.jpg'
        },
        {
          id: 'u-szwejka',
          name: 'U Szwejka (Floriańska Street)',
          category: 'beer-hall',
          categoryLabel: 'Classic Central European Beer Hall',
          priceTier: '$$',
          priceEstimatePln: '18 - 35 PLN per liter stein',
          address: 'ul. Floriańska 26 (Old Town)',
          neighborhood: 'Stare Miasto (Floriańska Gate Route)',
          drinkType: 'Draft Pilsner Urquell, Budvar & Polish Lagers',
          signature: '1-Liter Pilsner Steins, Crispy Duck, Goulash in Bread Bowl, Brass Tap Towers',
          description: 'Festive Central European beer hall named after the famous fictional soldier Švejk, serving ice-cold liter steins and hearty tavern feasts.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/u-szwejka.jpg'
        },
        {
          id: 'bropub-brokreacja',
          name: 'BroPub by BroKreacja (Craft Beer Cellar)',
          category: 'pub',
          categoryLabel: 'Underground Craft Beer Cellar',
          priceTier: '$$',
          priceEstimatePln: '20 - 38 PLN per craft pint',
          address: 'ul. Stradomska 11 (Old Town / Kazimierz Border)',
          neighborhood: 'Stradom (Old Town & Kazimierz Link)',
          drinkType: 'Award-Winning Polish Craft IPA, Stouts & Sours',
          signature: '18 Tap Lines of BroKreacja Craft Brews, Wood-Fired Pizza, Nitro Baltic Porters',
          description: 'Underground Gothic stone cellar taproom operated by award-winning Polish craft brewery BroKreacja, serving bold IPAs and Nitro stouts.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/bropub-brokreacja.jpg'
        },
        {
          id: 'taverna-krowa',
          name: 'Taverna Krowa (The Cow Cellar Pub)',
          category: 'pub',
          categoryLabel: 'Rustic Underground Cellar Pub',
          priceTier: '$',
          priceEstimatePln: '14 - 28 PLN per drink',
          address: 'ul. Sławkowska 12 (Old Town)',
          neighborhood: 'Stare Miasto (Sławkowska Street)',
          drinkType: 'Draft Craft Lager, Cider & Honey Beers',
          signature: 'Draft Amber Lager, Spiced Mulled Cider, Craft Cider Pint Towers',
          description: 'Lively underground cellar bar hidden off Sławkowska street with rustic wooden tables, draft ciders, and unbeatable wallet-friendly prices.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/taverna-krowa.jpg'
        }
      ],
      krakowCafesDetailed: [
        {
          id: 'camelot-cafe',
          name: 'Camelot Cafe',
          category: 'coffee-breakfast',
          categoryLabel: 'Historic Bohemian Breakfast & Café',
          priceTier: '$$',
          priceEstimatePln: '30 - 55 PLN per person',
          address: 'ul. św. Tomasza 17 (Old Town)',
          neighborhood: 'Stare Miasto (Near Main Square)',
          cuisine: 'Fairytale Polish Breakfast & Espresso',
          signature: 'French Toast with Baked Winter Berries, Polish Farmer Breakfast, Shakshuka, Hand-Crafted Cappuccinos',
          description: 'Whimsical, candlelit fairytale café nestled on a cobblestone corner near Main Square, famous for lavish Polish breakfasts, vintage puppets, and cozy velvet armchairs.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/camelot-cafe.jpg'
        },
        {
          id: 'wesola-cafe',
          name: 'Wesoła Cafe',
          category: 'coffee-breakfast',
          categoryLabel: 'Specialty Coffee & All-Day Brunch Shrine',
          priceTier: '$$',
          priceEstimatePln: '32 - 58 PLN per person',
          address: 'ul. Rakowicka 17 (Near Main Station)',
          neighborhood: 'Rakowicka (Main Train Station District)',
          cuisine: 'Third Wave Specialty Coffee & Artisan Brunch',
          signature: 'Single-Origin Chemex Pour-Overs, Avocado Toast with Poached Eggs, Brioche French Toast',
          description: 'Famous specialty coffee shrine with the iconic neon sign "Kawa dobro powraca" (Coffee, goodness returns), serving Third Wave pour-overs and hearty artisanal brunch.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/wesola-cafe.jpg'
        },
        {
          id: 'massolit-books-cafe',
          name: 'Massolit Books & Cafe',
          category: 'coffee-breakfast',
          categoryLabel: 'Independent English Bookstore & Café',
          priceTier: '$',
          priceEstimatePln: '20 - 45 PLN per person',
          address: 'ul. Felicjanek 4 (Old Town)',
          neighborhood: 'Stare Miasto (Near Wawel)',
          cuisine: 'Artisan Bakery & Specialty Filter Coffee',
          signature: 'Freshly Baked New York Style Bagels, Homemade Pecan Pie, Chemex Single-Origin Brews',
          description: 'Charming English-language bookstore and quiet café filled with floor-to-ceiling wooden bookshelves, vintage lamps, authentic NYC bagels, and slice-of-heaven pie.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/massolit-books-cafe.jpg'
        },
        {
          id: 'poranki-kazimierz',
          name: 'Poranki (Kazimierz)',
          category: 'coffee-breakfast',
          categoryLabel: 'Artisanal All-Day Breakfast & Bakery',
          priceTier: '$$',
          priceEstimatePln: '30 - 55 PLN per person',
          address: 'Plac Wolnica 9 (Kazimierz)',
          neighborhood: 'Kazimierz (Plac Wolnica)',
          cuisine: 'Scandinavian-Style Breakfast & Sourdough Bakery',
          signature: 'Sourdough Breakfast Platters, Cardamom Buns, Dutch Baby Pancakes, Oat Flat Whites',
          description: 'Sunlit Scandinavian-style Kazimierz breakfast sanctuary on Plac Wolnica, dedicated entirely to warm morning sourdough, specialty espresso, and cardamom pastries.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/poranki-kazimierz.jpg'
        },
        {
          id: 'cafe-charlotte',
          name: 'Cafe Charlotte Chleb i Wino',
          category: 'coffee-breakfast',
          categoryLabel: 'French Bistro Bakery & Jam Bar',
          priceTier: '$$',
          priceEstimatePln: '28 - 50 PLN per person',
          address: 'Plac Szczepański 2 (Old Town)',
          neighborhood: 'Stare Miasto (Plac Szczepański)',
          cuisine: 'French Bakery & Artisanal Preserves',
          signature: 'French Breakfast Basket (Fresh Croissants & Baguettes served with Jars of House Salted Caramel & White Chocolate)',
          description: 'Bustling Parisian-style bakery overlooking Plac Szczepański with giant communal wooden tables, freshly baked sourdough loaves, and unlimited artisanal jam jars.',
          imageSrc: '/wayfinder/Poland-2026/images/krakow/hotels/cafe-charlotte.jpg'
        }
      ],
      lgbtq: {
        title: "LGBTQ+ Traveler's Guide to Kraków & Kazimierz",
        subtitle: "Bohemian cellar bars, iconic gay nightlife, inclusive cafés, Equality March history, & queer traveler safety",
        overview: "Kraków is celebrated as Poland's cultural and artistic soul, with the bohemian district of Kazimierz acting as the beating heart of its progressive, inclusive, and vibrant LGBTQ+ scene. While Poland as a whole continues its journey toward full legal equality, Kraków is an open, welcoming, and safe destination for queer travelers. With long-running gay clubs (Ciemnia, Lindo), rainbow-friendly cellar bars, independent bookstores (Massolit), and a rich 20+ year history of Poland's Equality March (Marsz Równości), LGBTQ+ visitors will find a warm, creative community atmosphere.",
        primaryArea: "Kazimierz (Bohemian & Queer Quarter)",
        landmark: "Father Bernatek Footbridge & Plac Wolnica",
        landmarkDescription: "Historic pedestrian bridge linking Kazimierz to Podgórze with acrobatic sculptures and romantic rainbow nighttime illuminations over the Vistula River.",
        imageUrl: "/Poland-2026/images/krakow/attractions/lgbtq-kazimierz.jpg",
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
    historyBadge: 'City of Dwarfs & European Capital of Culture',
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
    imageDetails: {
      location: "Rynek (Main Market Square)",
      landmark: "Wrocław Market Square during Christmas",
      description: "A magical fairytale setting featuring the illuminated Gothic Old Town Hall, over 150 wooden artisan chalets, and the whimsical three-story wooden windmill."
    },
    history: "Wrocław is one of the oldest and most storied cities in Poland, with roots stretching back over 1,000 years. Founded at a strategic crossing on the Oder River, it has been known successively as Vratislavia, Breslau, and Wrocław. The city's identity was forged by the Piast dynasty, flourished under Bohemian and Habsburg rule, and became a brilliant center of German-Jewish culture before enduring the devastating Siege of Breslau in 1945. After WWII, the city was repopulated by Polish settlers expelled from Lwów and the eastern kresy, transforming Wrocław into a vibrant melting pot that today thrives as one of Poland's most dynamic cultural capitals and a 2016 European Capital of Culture.",
      historyStats: [
        { label: 'Founded', value: '10th Century (Trade Settlement)', icon: 'Landmark' },
        { label: 'Bridges', value: 'Over 100 (Paris of the East)', icon: 'MapPin' },
        { label: 'UNESCO Heritage', value: '2006 (Centennial Hall)', icon: 'Award' },
        { label: 'Dwarfs', value: '600+ Bronze Krasnale', icon: 'Crown' }
      ],
      historyEpochs: [
        {
          era: '10th – 13th Century',
          title: 'Piast Foundation on the Oder',
          subtitle: 'From Slavic trading outpost to Silesian capital',
          description: "First chronicled in 985 by Ibrahim ibn Yaqub as a prosperous trade settlement, Wrocław grew around Ostrów Tumski (Cathedral Island). In 1000, Emperor Otto III established a bishopric here, cementing its religious importance. After Mongol raids devastated the city in 1241, it was rebuilt on a grand grid plan around today's Rynek, one of the largest medieval market squares in Europe."
        },
        {
          era: '1335 – 1526',
          title: 'The Kingdom of Bohemia & Merchant Golden Age',
          subtitle: 'A crossroads of Central European commerce and Gothic splendor',
          description: 'Wrocław passed to the Kingdom of Bohemia in 1335, becoming a major Hanseatic and overland trade hub. The magnificent Gothic Ratusz (Old Town Hall) - one of the finest secular medieval buildings in Central Europe - was completed in this era, alongside the city\'s soaring churches. Merchants from Flanders, Italy, and the Baltic met in the vast Rynek to trade cloth, grain, and silver.'
        },
        {
          era: '1526 – 1741',
          title: 'Habsburg Rule & Religious Pluralism',
          subtitle: 'A multiconfessional city of Catholics, Lutherans, and Jews',
          description: 'After 1526, Wrocław fell under Habsburg sovereignty. The city became a remarkable religious melting pot: Catholic, Lutheran, and Jewish communities coexisted with relative tolerance. The White Stork Synagogue (1792), still standing in the Four Denominations District, testifies to this rich pluralism. Baroque churches and palaces reshaped the skyline alongside the Gothic core.'
        },
        {
          era: '1741 – 1918',
          title: 'Prussian Era & the Golden Age of Breslau',
          subtitle: 'Industrial powerhouse and center of German-Jewish culture',
          description: 'Following the Silesian Wars, Wrocław (then Breslau) became a vibrant Prussian city. The 19th century brought explosive industrial growth, an outstanding university and opera, and a flourishing German-Jewish community that produced philosophers, philanthropists, and architects. The century culminated in 1913 with the revolutionary Centennial Hall (Hala Stulecia), Max Berg\'s pioneering reinforced-concrete dome, now a UNESCO World Heritage site.'
        },
        {
          era: '1939 – 1989',
          title: 'Twilight, Destruction & Rebirth',
          subtitle: 'Festung Breslau, expulsion, and postwar Polish resurrection',
          description: 'Declared a fortress city (Festung Breslau) by the Nazis, the city endured a brutal three-month siege at the end of WWII that devastated up to 70% of its buildings. Post-1945, the German population was expelled and replaced by Polish settlers from the East. The Communist era saw slow reconstruction, while student protests and the Orange Alternative movement - known for its absurdist dwarf graffiti protests - kept Wrocław\'s rebellious spirit alive.'
        },
        {
          era: '1989 – Present',
          title: 'The Dwarf City & European Cultural Capital',
          subtitle: 'From Solidarity transition to a beloved modern European metropolis',
          description: 'After 1989, Wrocław underwent astonishing transformation and rebirth. The first bronze dwarf (Krasnal) appeared on Świdnicka in 2001, spawning a beloved citywide scavenger hunt now spanning 600+ statues. In 2006, Centennial Hall was inscribed on UNESCO\'s World Heritage List, and in 2016 Wrocław served as a European Capital of Culture, welcoming millions to festivals, light shows, and its reimagined Oder waterfront.'
        }
      ],
      historyLegends: [
        {
          title: 'The Wrocław Dwarfs (Krasnale)',
          icon: '🧌',
          description: 'Born from the absurdist Orange Alternative protests of the 1980s, when activists painted graffiti dwarfs over slogans police had painted over. Today over 600 tiny bronze dwarfs hide across the city - a playful tribute to civil disobedience that has become Wrocław\'s most beloved scavenger hunt.'
        },
        {
          title: 'The Gas Lantern Lighter (Lampnik)',
          icon: '🏮',
          description: 'Every evening at dusk, a costumed lantern keeper with a long pole torch walks Ostrów Tumski lighting 103 real gas street lamps by hand - a surviving tradition practiced since the 19th century despite the city\'s fully modernized grid.'
        },
        {
          title: 'The Love Bridge & Cathedral Island',
          icon: '🔒',
          description: 'Tumski Bridge connecting the mainland to Cathedral Island is covered with thousands of padlocks placed by lovers. Legend holds that couples who lock a padlock and throw the key into the Oder will stay together forever. At night, gaslight reflects off the river for one of Poland\'s most romantic winter scenes.'
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
        location: 'Rynek, 50-106 Wrocław, Poland',
        lat: 51.110049,
        lng: 17.0306757,
        dates: 'Nov 21, 2026 - Jan 7, 2027',
        hours: '10:00 AM - 9:00 PM daily (Early close Dec 24, Closed Dec 25)',
        bestTime: '5:00 PM - 7:00 PM for peak illuminations',
        specialty: 'Silesian crafts & three-story wooden windmill bar',
        details: 'The heart of Wrocław\'s winter magic. Over 150 stalls radiate from the historic Ratusz, featuring whimsical animatronic displays for children and traditional Polish culinary delights.',
        description: "One of Europe's most enchanting Christmas markets surrounding the massive Gothic Ratusz. Features a fairytale forest, a 3-story rotating wooden pyramid, glowing windmills, and over 150 wooden chalets.",
        highlights: ['3-Story Wooden Pyramid & Windmill', 'Fairytale Forest (Bajkowy Las)', 'Krasnal Prezentuś (Gift Dwarf)', 'Hot Spiced Mulled Wine in Shoe Mugs'],
        mustTry: ['Grzaniec Wrocławski (Mulled Wine)', 'Oscypek (Grilled Cheese)', 'Bigos (Hunter\'s Stew)'],
        souvenirs: ['Hand-painted Baubles', 'Wooden Toys', 'Silesian Ceramics'],
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw.png'
      },
      {
        id: 'wroclaw-plac-solny',
        name: 'Plac Solny Christmas Market & Craft Village',
        location: 'Plac Solny, 50-062 Wrocław, Poland',
        lat: 51.1091841,
        lng: 17.0290201,
        dates: 'Nov 21, 2026 - Jan 7, 2027',
        hours: '10:00 AM - 9:00 PM daily',
        bestTime: '8:00 PM for quieter browsing',
        specialty: 'Artisan woodcarvings, amber, and late-night flowers',
        details: 'Tucked right next to the main square, this auxiliary market focuses on high-quality handmade gifts, regional Polish honeys, and intricate Baltic amber jewelry.',
        description: 'Adjacent to Rynek, Plac Solny transforms into a magical artisan craft village featuring woodcarvers, hand-blown glass ornaments, hot mead tastings, and the historic 24/7 flower market stalls.',
        highlights: ['Artisan Woodcarvings & Glass Ornaments', 'Hot Spiced Mead & Honey Wine', 'Historic 24/7 Flower Market', 'Cozy Fire Pit Lounge'],
        mustTry: ['Grzany Miód (Hot Mead)', 'Roasted Chestnuts', 'Silesian Pretzels'],
        souvenirs: ['Baltic Amber Jewelry', 'Beeswax Candles', 'Hand-blown Glass'],
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw-plac-solny.jpg'
      },
      {
        id: 'wroclaw-swidnicka',
        name: 'Świdnicka & Oławska Festive Pedestrian Avenues',
        location: 'Świdnicka, 50-064 Wrocław, Poland',
        lat: 51.1083639,
        lng: 17.0326906,
        dates: 'Nov 21, 2026 - Jan 7, 2027',
        hours: '10:00 AM - 9:00 PM daily',
        bestTime: 'Mid-afternoon for street performers',
        specialty: 'Street food, gingerbread, and winter accessories',
        details: 'These decorated pedestrian arteries leading to the Rynek are lined with festive light arches, offering a constant stream of hot street food, roasted nuts, and warm winter clothing stalls.',
        description: 'The pedestrian avenues radiating from Market Square are lined with festive arches, street food vendors selling grilled sausages, Silesian gingerbread, and handmade wool gifts.',
        highlights: ['Illuminated Festive Light Arches', 'Fresh Silesian Gingerbread (Pierniczki)', 'Handcrafted Woolen Mittens & Scarves', 'Street Musicians & Carolers'],
        mustTry: ['Pierniczki (Gingerbread)', 'Kiełbasa z Grilla', 'Roasted Almonds'],
        souvenirs: ['Woolen Mittens', 'Sheepskin Slippers', 'Festive Scarves'],
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
        location: 'City Hall, 50-107 Wrocław, Poland',
        lat: 51.109643,
        lng: 17.031738,
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
        location: 'Stare Miasto, Cathedral Island, Wrocław, DS, Poland',
        lat: 51.1150081,
        lng: 17.0464937,
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
        location: 'Krasnale Wrocławskie, Życzliwa, 53-029 Wrocław, Poland',
        lat: 51.067527,
        lng: 16.987944,
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
        location: 'Most Tumski, 50-327 Wrocław, Poland',
        lat: 51.1147101,
        lng: 17.0422614,
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
        location: 'Hala Stulecia, Zygmunta Wróblewskiego, 51-618 Wrocław, Poland',
        lat: 51.1070176,
        lng: 17.0728241,
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
        location: 'Panorama, MC, Greece',
        lat: 40.58963,
        lng: 23.038622,
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
        imageUrl: '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-walking-tour.jpg',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-walking-tour.jpg',
        location: 'Rynek (Old Town)',
        howToGetThere: 'Departs from the Aleksander Fredro Statue in Rynek.',
        pricing: '70–90 PLN (~$18.00–$24.00 USD) per person',
        openTimes: 'Departs 11:00 AM & 4:00 PM daily (2 hrs)',
        gygUrl: 'https://www.getyourguide.com/s/?q=Wroclaw+Christmas+Market+walking+tour',
        viatorUrl: 'https://www.viator.com/searchResults/all?text=Wroclaw+Christmas+Market+walking+tour'
      }
    ],
    restaurants: ['Konspira', 'Karczma Lwowska', 'Pod Fredrą', 'Pierogarnia Stary Młyn', 'Piwnica Świdnicka'],
    wroclawRestaurantsDetailed: [
      {
        id: 'konspira',
        name: 'Restauracja Konspira',
        category: 'must-haves',
        categoryLabel: 'Must-Have & Iconic',
        rating: 4.5,
        ratingCount: '4,800+ reviews',
        priceTier: '$$',
        priceEstimatePln: '40 - 80 PLN per person',
        address: 'Plac Solny 11, 50-061 Wrocław, Poland',
        lat: 51.1092597,
        lng: 17.0283023,
        neighborhood: 'Stare Miasto (Plac Solny)',
        cuisine: 'Anti-Communist Resistance & Polish Comfort Food',
        signature: 'Solidarność Ribs, Giant Pierogi Platter, Bigos in Bread Bowl',
        description: 'Immersive restaurant themed around the 1980s Polish anti-communist Solidarity movement. Hidden passageways behind secret bookcases, vintage radio broadcasts, and hearty traditional Polish cooking.',
        hours: 'Mon-Thu 1:00 PM–11:00 PM, Fri-Sat 12:00 PM–11:45 PM, Sun 12:00 PM–11:00 PM',
        websiteUrl: 'https://restauracjakonspira.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/konspira.jpg'
      },
      {
        id: 'mloda-polska',
        name: 'Młoda Polska Bistro & Pianino',
        category: 'must-haves',
        categoryLabel: 'Michelin-Selected Modern Polish',
        rating: 4.5,
        ratingCount: '1,900+ reviews',
        priceTier: '$$',
        priceEstimatePln: '60 - 180 PLN per person',
        address: 'Plac Solny 4, 50-060 Wrocław, Poland',
        lat: 51.109150,
        lng: 17.028900,
        neighborhood: 'Stare Miasto (Plac Solny)',
        cuisine: 'Michelin-Selected Modern Polish & Live Piano',
        signature: 'Beef Tartare with Smoked Egg Yolk, Pork Schnitzel (Schabowy) with Anchovies, Craft Spirits',
        description: 'Founded by celebrity chef Beata Śniechowska. Featured in the Michelin Guide for its modern take on Polish comfort food, vibrant cocktail program, and live piano music.',
        hours: 'Mon-Thu 4 PM–9 PM, Fri 4 PM–11 PM, Sat 12 PM–11 PM, Sun 12 PM–8 PM',
        websiteUrl: 'https://mlodapolskabistro.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/mloda-polska.jpg'
      },
      {
        id: 'karczma-lwowska',
        name: 'Karczma Lwowska',
        category: 'local',
        categoryLabel: 'Historic Market Square Tavern',
        rating: 4.0,
        ratingCount: '2,100+ reviews',
        priceTier: '$$',
        priceEstimatePln: '60 - 95 PLN per person',
        address: 'Rynek 4, 50-106 Wrocław, Poland',
        lat: 51.1106064,
        lng: 17.0304181,
        neighborhood: 'Stare Miasto (Rynek)',
        cuisine: 'Traditional Polish & Lwów Borderlands',
        signature: "Hunter's Stew (Bigos), Lwów-Style Roast Duck with Apples, Wild Mushroom Soup",
        description: 'Rustic wooden timbered tavern located directly on Market Square in the historic Pod Złotym Orłem building, serving hearty pre-war Lwów borderlands recipes since 1999.',
        hours: 'Open daily 12:00 PM - 11:00 PM',
        websiteUrl: 'https://www.lwowska.com.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/karczma-lwowska.jpg'
      },
      {
        id: 'kurna-chata',
        name: 'Kurna Chata',
        category: 'local',
        categoryLabel: 'Authentic Polish Wooden Cottage',
        rating: 4.9,
        ratingCount: '6,400+ reviews',
        priceTier: '$$',
        priceEstimatePln: '45 - 85 PLN per person',
        address: 'Odrzańska 24-29, 50-114 Wrocław, Poland',
        lat: 51.113210,
        lng: 17.031540,
        neighborhood: 'Stare Miasto (Near Oder River)',
        cuisine: 'Homestyle Polish Comfort & Folk Recipes',
        signature: 'Potato Pancakes with Goulash (Placki Po Zbójnicku), Dumplings in Clay Bowls, Żurek Soup',
        description: 'Charming folk-inspired restaurant with wooden log walls and rustic hearth decor, serving generous portions of authentic Polish homestyle cooking near the Oder riverbank.',
        hours: 'Open daily 12:00 PM - 10:00 PM',
        websiteUrl: 'https://kurnachata.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/kurna-chata.jpg'
      },
      {
        id: 'pod-fredra',
        name: 'Restauracja Pod Fredrą',
        category: 'steak',
        categoryLabel: 'Hearth-Grilled Meats & Steaks',
        rating: 4.2,
        ratingCount: '3,400+ reviews',
        priceTier: '$$$',
        priceEstimatePln: '60 - 180 PLN per person',
        address: 'Rynek - Ratusz 1, 50-116 Wrocław, Poland',
        lat: 51.1098401,
        lng: 17.0316018,
        neighborhood: 'Stare Miasto (Rynek)',
        cuisine: 'Oak Wood Flame Grills & Prime Polish Steaks',
        signature: 'Wood-Fired Seasoned Pork Knuckle (Golonka), Dry-Aged Ribeye Steak, House Smoked Sausages',
        description: 'Located right next to the Town Hall, featuring open hearth fires where prime Polish meats and game are roasted over seasoned beechwood and oak coals.',
        hours: 'Open daily 12:00 PM - 11:00 PM',
        websiteUrl: 'https://www.podfredra.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/pod-fredra.jpg'
      },
      {
        id: 'campo-steakhouse',
        name: 'Campo Modern Grill',
        category: 'steak',
        categoryLabel: 'Award-Winning South American Steakhouse',
        rating: 4.9,
        ratingCount: '2,800+ reviews',
        priceTier: '$$$',
        priceEstimatePln: '180 - 350 PLN per person',
        address: 'Podwale 83, 50-414 Wrocław, Poland',
        lat: 51.106120,
        lng: 17.042310,
        neighborhood: 'OVO Building / Stare Miasto',
        cuisine: 'Argentine Ribeye & Prime South American Steaks',
        signature: 'Black Angus Argentine Ribeye, Tenderloin Skewers, Chimichurri & Charred Vegetables',
        description: 'Premier steakhouse housed in the sleek OVO building. Winner of global restaurant design awards, specializing in prime Argentine cuts cooked over charcoal flames.',
        hours: 'Mon-Thu 2 PM–10 PM, Fri-Sat 12 PM–11 PM, Sun 12 PM–9 PM',
        websiteUrl: 'https://campomoderngrill.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/campo-steakhouse.jpg'
      },
      {
        id: 'whiskey-in-the-jar',
        name: 'Whiskey in the Jar Wrocław',
        category: 'steak',
        categoryLabel: 'Rock & Roll Steakhouse',
        rating: 4.6,
        ratingCount: '7,100+ reviews',
        priceTier: '$$$',
        priceEstimatePln: '80 - 200 PLN per person',
        address: 'Rynek 48, 50-116 Wrocław, Poland',
        lat: 51.110210,
        lng: 17.032110,
        neighborhood: 'Stare Miasto (Rynek)',
        cuisine: 'Prime Beef Steaks & Jar Cocktails',
        signature: 'Tomahawk Ribeye Steak, BBQ Pork Ribs, Signature Bourbon Jar Cocktails',
        description: 'High-energy rock & roll steakhouse located directly on Market Square. Known for sizzling lava stone steaks, live music vibes, and oversized bourbon cocktails in glass jars.',
        hours: 'Open daily 12:00 PM - 1:00 AM',
        websiteUrl: 'https://whiskeyinthejar.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/whiskey-in-the-jar.jpg'
      },
      {
        id: 'pierogarnia-stary-mlyn',
        name: 'Pierogarnia Stary Młyn',
        category: 'cheap',
        categoryLabel: 'Hand-Crafted Pierogi House',
        rating: 4.3,
        ratingCount: '5,200+ reviews',
        priceTier: '$',
        priceEstimatePln: '25 - 45 PLN per person',
        address: 'Rynek 29, 50-127 Wrocław, Poland',
        lat: 51.1091783,
        lng: 17.0330937,
        neighborhood: 'Stare Miasto (Rynek)',
        cuisine: 'Baked & Boiled Traditional Pierogi',
        signature: 'Opiekane (Crispy Baked Pierogi in Clay Ovens), Ruskie with Crispy Onions, Sweet Cottage Cheese Dumplings',
        description: 'Famous pierogi bakery where dumplings are rolled by hand and either boiled or baked in clay ovens until golden and bubbling.',
        hours: 'Mon 8:00 AM–10:00 PM, Tue-Sun 8:00 AM–11:00 PM',
        websiteUrl: 'https://www.pierogarnie.com/restauracje/stary-mlyn-wroclaw/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/pierogarnia-stary-mlyn.jpg'
      },
      {
        id: 'bar-mleczny-mis',
        name: 'Bar Mleczny Miś',
        category: 'cheap',
        categoryLabel: 'Legendary Historic Milk Bar (Est. 1960s)',
        rating: 4.4,
        ratingCount: '4,600+ reviews',
        priceTier: '$',
        priceEstimatePln: '12 - 25 PLN per person',
        address: 'ul. Kuźnicza 48, 50-138 Wrocław, Poland',
        lat: 51.112920,
        lng: 17.033850,
        neighborhood: 'Stare Miasto (Near Wrocław University)',
        cuisine: 'Traditional Polish Milk Bar Comfort Food',
        signature: 'Żurek with Egg (3 PLN), Kotlet Schabowy, Leniwe (Sweet Cottage Cheese Dumplings)',
        description: 'Iconic 1960s Polish milk bar serving wholesome, retro cafeteria-style meals at incredibly low prices. A beloved local cultural institution popular with students and travelers alike.',
        hours: 'Mon-Fri 7:00 AM - 6:00 PM, Sat 8:00 AM - 5:00 PM (Closed Sun)',
        websiteUrl: 'https://www.wroclaw.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/bar-mleczny-mis.jpg'
      },
      {
        id: 'piwnica-swidnicka',
        name: 'Piwnica Świdnicka',
        category: 'expensive',
        categoryLabel: "Europe's Oldest Restaurant (Est. 1273)",
        rating: 4.1,
        ratingCount: '3,800+ reviews',
        priceTier: '$$$',
        priceEstimatePln: '80 - 220 PLN per person',
        address: 'Rynek Ratusz 1A, 50-106 Wrocław, Poland',
        lat: 51.1094574,
        lng: 17.0319896,
        neighborhood: 'Stare Miasto (Underground Ratusz)',
        cuisine: 'Medieval Royal Polish & Craft Brewery',
        signature: 'Royal Roast Wild Boar, Silesian Heaven (Śląskie Niebo), White Wine Steamed Mussels',
        description: 'Operating continuously in the brick vaults beneath Wrocław Town Hall since 1273. Fryderyk Chopin, Goethe, and Polish kings dined here over 700 years of history.',
        hours: 'Open daily 12:00 PM - 12:00 AM',
        websiteUrl: 'https://piwnicaswidnicka.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/piwnica-swidnicka.jpg'
      },
      {
        id: 'restauracja-tarasowa',
        name: 'Restauracja Tarasowa',
        category: 'expensive',
        categoryLabel: 'Michelin Bib Gourmand Fine Dining',
        rating: 4.7,
        ratingCount: '950+ reviews',
        priceTier: '$$$',
        priceEstimatePln: '120 - 360 PLN per person',
        address: 'ul. Wystawowa 1, 51-618 Wrocław, Poland',
        lat: 51.106820,
        lng: 17.073510,
        neighborhood: 'Centennial Hall (Hala Stulecia)',
        cuisine: 'Michelin Bib Gourmand Contemporary Polish',
        signature: 'Seasonal Tasting Menu, Confit Silesian Duck, Pergola Terrace Cocktail Pairings',
        description: 'Awarded Michelin Bib Gourmand status. Set inside the UNESCO Centennial Hall complex overlooking the Pergola fountain, serving exquisite modern Silesian gastronomy.',
        hours: 'Tue-Fri 4 PM–10 PM, Sat-Sun 12 PM–10 PM (Closed Mon)',
        websiteUrl: 'https://restauracjatarasowa.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/restauracja-tarasowa.jpg'
      }
    ],
    wroclawDrinksDetailed: [
      {
        id: 'spiz',
        name: 'Browar Spiż',
        category: 'brewery',
        categoryLabel: 'Cellar Microbrewery & Pub',
        rating: 4.4,
        ratingCount: '4,100+ reviews',
        priceTier: '$$',
        priceEstimatePln: '40 - 100 PLN per person',
        address: 'Rynek Ratusz 2, 50-106 Wrocław, Poland',
        lat: 51.109400,
        lng: 17.031800,
        neighborhood: 'Stare Miasto (Rynek Ratusz)',
        drinkType: 'Unfiltered Craft Beer & Lardo Sourdough Bread',
        signature: 'Spiż Honey Lager, Miodowe Dark Beer, Fresh Sourdough Bread with Lardo (Smalec)',
        description: 'Wrocław’s pioneer microbrewery located in the gothic cellars of Ratusz. Every craft beer comes with a complimentary thick slice of fresh sourdough bread topped with seasoned smalec.',
        hours: 'Open daily 10:00 AM - 2:00 AM',
        websiteUrl: 'https://www.browar.wroc.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/spiz.jpg'
      },
      {
        id: 'browar-stu-mostow',
        name: 'Browar Stu Mostów',
        category: 'brewery',
        categoryLabel: 'Premier Polish Craft Taproom',
        rating: 4.7,
        ratingCount: '3,200+ reviews',
        priceTier: '$$',
        priceEstimatePln: '25 - 60 PLN per pint',
        address: 'ul. Jana Długosza 2, 51-162 Wrocław, Poland',
        lat: 51.127410,
        lng: 17.054320,
        neighborhood: 'Ołbin / Długosza',
        drinkType: 'Artisanal Craft Beers & Food Pairing',
        signature: 'WRCLW Imperial Stout, Salamander IPA, Spent Grain Pretzel Burgers',
        description: 'Poland’s premier craft brewery combining a glass-walled production brewhouse with an industrial-chic taproom, famous for creative barrel-aged beers and food pairings.',
        hours: 'Mon-Wed 12 PM–12 AM, Thu-Fri 12 PM–1 AM, Sat 2 PM–1 AM, Sun 2 PM–12 AM',
        websiteUrl: 'https://100mostow.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/browar-stu-mostow.jpg'
      },
      {
        id: 'browar-zloty-pies',
        name: 'Browar Złoty Pies',
        category: 'brewery',
        categoryLabel: 'Market Square Craft Brewery',
        rating: 4.5,
        ratingCount: '2,600+ reviews',
        priceTier: '$$',
        priceEstimatePln: '35 - 80 PLN per person',
        address: 'Rynek 41, 50-116 Wrocław, Poland',
        lat: 51.110540,
        lng: 17.032610,
        neighborhood: 'Stare Miasto (Rynek)',
        drinkType: 'House-Brewed Ales & Silesian Pub Fare',
        signature: 'Bok Złoty Amber Lager, Pitbull IPA, Roasted Pork Ribs in Beer Glaze',
        description: 'Vibrant microbrewery located right on the Market Square. Brews copper-vat ales on site paired with hearty Silesian roasts and pub snacks.',
        hours: 'Open daily 12:00 PM - 12:00 AM',
        websiteUrl: 'https://zlotypies.com.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/browar-zloty-pies.jpg'
      },
      {
        id: 'przedwojenna',
        name: 'Przedwojenna Bistro & Bar',
        category: 'vodka-house',
        categoryLabel: '24/7 Retro Vodka Bistro',
        rating: 4.3,
        ratingCount: '2,900+ reviews',
        priceTier: '$',
        priceEstimatePln: '15 - 35 PLN per person',
        address: 'ul. Świętego Mikołaja 81, 50-126 Wrocław, Poland',
        lat: 51.1110735,
        lng: 17.0302814,
        neighborhood: 'Stare Miasto',
        drinkType: 'Chilled Polish Vodkas & Vintage Tapas',
        signature: 'Soplica Hazelnut Vodka Shots, Beef Tartare (Tatar), Herring in Oil (Śledź), Gzik Cheese',
        description: '24/7 pre-war retro bistro with nostalgic Art Deco decor, serving flat-rate chilled Polish vodkas and classic drinking bites like beef tartare and Gzik cheese.',
        hours: 'Mon-Thu 3 PM–2 AM, Fri 3 PM–5 AM, Sat 1 PM–6 AM, Sun 1 PM–1 AM',
        websiteUrl: 'https://przedwojenna.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/przedwojenna.jpg'
      },
      {
        id: 'setka-bar',
        name: 'Setka Bar',
        category: 'vodka-house',
        categoryLabel: '24/7 PRL Retro Polish Vodka',
        rating: 4.9,
        ratingCount: '13,000+ reviews',
        priceTier: '$',
        priceEstimatePln: '15 - 40 PLN per person',
        address: 'ul. Kazimierza Wielkiego 50, 50-077 Wrocław, Poland',
        lat: 51.108420,
        lng: 17.027810,
        neighborhood: 'Stare Miasto (Near Solny)',
        drinkType: 'Flavored Polish Vodkas & PRL Snacks',
        signature: 'Wyborowa Vodka Flights, Pickled Herring (Śledzik), Bigos, Homemade Lardo Bread',
        description: 'High-energy 24/7 retro communist-era vodka bar adorned with vintage posters. Famous for ultra-affordable vodka flights and classic Polish bar snacks.',
        hours: 'Open 24/7 daily',
        websiteUrl: 'https://www.facebook.com/setkawroclaw/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/setka-bar.jpg'
      },
      {
        id: 'alegrano',
        name: 'AleBrowar Wrocław (AleGrano Tap Bar)',
        category: 'pub-bars',
        categoryLabel: 'Polish Craft Beer Cellar',
        rating: 4.7,
        ratingCount: '3,000+ reviews',
        priceTier: '$$',
        priceEstimatePln: '22 - 48 PLN per pint',
        address: 'Paweł Włodkowica 27, 50-072 Wrocław, Poland',
        lat: 51.107531,
        lng: 17.025342,
        neighborhood: 'Czterech Wyznań (Four Denominations District)',
        drinkType: 'Regional Polish Craft Beers on Tap',
        signature: '16 Rotating Polish Craft Taps, Hazy IPAs, Imperial Baltic Stouts, Artisanal Pizza',
        description: 'Vibrant craft beer haven showcasing independent microbreweries from across Poland in an atmospheric brick cellar setting in the Four Denominations District.',
        hours: 'Open daily 3:00 PM - 12:00 AM',
        websiteUrl: 'https://alebrowar.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/alegrano.jpg'
      },
      {
        id: 'szajba',
        name: 'Szajba Craft Bar',
        category: 'pub-bars',
        categoryLabel: 'Neon Courtyard Pub',
        rating: 4.6,
        ratingCount: '1,800+ reviews',
        priceTier: '$$',
        priceEstimatePln: '25 - 55 PLN per person',
        address: 'ul. św. Antoniego 2/4, 50-073 Wrocław, Poland',
        lat: 51.109810,
        lng: 17.025110,
        neighborhood: 'Ruska 46 Neon Courtyard',
        drinkType: 'Craft Cocktails & Local Draft Beers',
        signature: 'Smoked Bourbon Sour, Polish Craft IPAs, Ruska Neon Courtyard Terrace Seats',
        description: 'Bohemian craft cocktail bar set inside the iconic Ruska 46 neon courtyard. Atmospheric industrial space with alternative music and illuminated neon signage.',
        hours: 'Mon-Thu 4 PM–1 AM, Fri-Sat 4 PM–4 AM, Sun 4 PM–12 AM',
        websiteUrl: 'https://www.facebook.com/SzajbaBar/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/szajba.jpg'
      }
    ],
    wroclawCafesDetailed: [
      {
        id: 'cafe-targowa',
        name: 'Café Targowa',
        category: 'coffee-breakfast',
        categoryLabel: 'World-Class Specialty Coffee',
        rating: 4.8,
        ratingCount: '1,500+ reviews',
        priceTier: '$',
        priceEstimatePln: '10 - 25 PLN per person',
        address: 'Piaskowa 17, 50-158 Wrocław, Poland',
        lat: 51.1125044,
        lng: 17.040749,
        neighborhood: 'Market Hall (Hala Targowa)',
        cuisine: 'Aeropress World Champion Coffee & Pastries',
        signature: 'Aeropress Single-Origin Brew, Flat White, Freshly Baked Cinnamon Buns',
        description: 'Run by World Aeropress Champion Filip Kucharczyk inside the historic 1908 brick Market Hall (Stoisko 11). Renowned for serving the finest specialty coffee in Silesia.',
        hours: 'Mon-Sat 8:00 AM - 6:30 PM (Closed Sun)',
        websiteUrl: 'http://cafetargowa.pl',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/cafe-targowa.jpg'
      },
      {
        id: 'gniazdo',
        name: 'Gniazdo',
        category: 'coffee-breakfast',
        categoryLabel: 'Modern Artisan Breakfast & Espresso Bar',
        rating: 4.6,
        ratingCount: '2,400+ reviews',
        priceTier: '$$',
        priceEstimatePln: '35 - 60 PLN per person',
        address: 'Świdnicka 36, 50-068 Wrocław, Poland',
        lat: 51.1054094,
        lng: 17.0314968,
        neighborhood: 'Stare Miasto',
        cuisine: 'Artisan Breakfast & Specialty Espresso',
        signature: 'Shakshuka, Syrniki, Avocado & Poached Eggs on Sourdough, Espresso Tonic, Vegan Tartlets',
        description: 'Stylish, light-filled coffee house on Świdnicka street serving gourmet morning breakfasts, avocado toasts, single-origin pour-overs, and laptop-friendly workspace.',
        hours: 'Open daily 8:00 AM - 8:00 PM',
        websiteUrl: 'https://gniazdo.cafe/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/gniazdo.jpg'
      },
      {
        id: 'giselle-cafe',
        name: 'Giselle French Bakery & Cafe',
        category: 'coffee-breakfast',
        categoryLabel: 'Parisian French Bakery & All-Day Breakfast',
        rating: 4.5,
        ratingCount: '3,100+ reviews',
        priceTier: '$$',
        priceEstimatePln: '40 - 60 PLN per person',
        address: 'ul. Szewska 27, 50-139 Wrocław, Poland',
        lat: 51.111810,
        lng: 17.034520,
        neighborhood: 'Stare Miasto (Near Rynek)',
        cuisine: 'French Patisserie & All-Day Parisian Breakfast',
        signature: 'Butter Croissants, Eggs Benedict on Brioche, French Tartines & Cafe au Lait',
        description: 'Chic French-inspired bakery and cafe steps from Market Square. Serves freshly baked butter croissants, quiches, and all-day Parisian breakfasts in a romantic interior.',
        hours: 'Mon-Sat 7:30 AM - 7:00 PM, Sun 9:00 AM - 7:00 PM',
        websiteUrl: 'https://bistrogiselle.pl/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/giselle-cafe.jpg'
      },
      {
        id: 'central-cafe',
        name: 'Central Cafe',
        category: 'coffee-breakfast',
        categoryLabel: 'Artisan Bagels & Espresso House',
        rating: 4.6,
        ratingCount: '2,100+ reviews',
        priceTier: '$$',
        priceEstimatePln: '22 - 46 PLN per person',
        address: 'ul. św. Antoniego 10, 50-073 Wrocław, Poland',
        lat: 51.109210,
        lng: 17.025810,
        neighborhood: 'Four Denominations District',
        cuisine: 'Hand-Crafted Bagels & Specialty Coffee',
        signature: 'Smoked Salmon & Cream Cheese Bagel, Fluffy Pancakes, Iced Maple Latte',
        description: 'Cozy breakfast spot in the Four Denominations District famous for freshly boiled New York-style bagels, fluffy pancake stacks, and specialty roasted coffees.',
        hours: 'Mon-Fri 7:00 AM - 4:00 PM, Sat-Sun 8:00 AM - 6:00 PM',
        websiteUrl: 'https://www.facebook.com/CentralCafeWroclaw/',
        imageSrc: '/wayfinder/Poland-2026/images/wroclaw/food/central-cafe.jpg'
      }
    ],
    lgbtq: {
      title: "LGBTQ+ Traveler's Guide to Wrocław",
      subtitle: "The Four Denominations District, Ruska 46 neon courtyards, Rainbow Coalition heritage, and open Silesian nightlife",
      overview: "Wrocław is one of Poland's most progressive, open, and welcoming cities. Boasting the famous Four Denominations District (Czterech Wyznań) where Catholic, Orthodox, Lutheran, and Jewish communities converge, Wrocław offers travelers an extraordinary interfaith atmosphere and an active, visible queer scene. The iconic Ruska 46 neon courtyard hosts alternative cultural spaces, while Poland's largest LGBTQ+ rights organizations - the Campaign Against Homophobia (KPH) - are headquartered here. Queer travelers will find rainbow-welcoming bars, vibrant nightlife, and progressive festivals like Wrocław Pride.",
      primaryArea: "Four Denominations District & Ruska Street",
      landmark: "Ruska 46 Courtyard & Surowiec Club",
      landmarkDescription: "The alternative neon courtyard on Ruska Street surrounded by queer-friendly art spaces, club Surowiec, and retro cocktail lounges.",
      imageUrl: "/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw.png",
      safetyAndLegal: {
        legalContext: "Wrocław has long housed the headquarters of Poland's Campaign Against Homophobia (KPH). The city council officially supports Wrocław Pride and has welcomed the city's queer community with official mayoral patronage.",
        safetyRating: "Safe & Welcoming in Central Districts",
        pdaAdvice: "Public Displays of Affection: Comfortable across Rynek, the Four Denominations District, and Ruska Street. Mild discretion is advised in outer suburbs and late-night public transit.",
        helplines: [
          { name: "Campaign Against Homophobia (KPH) Wrocław", contact: "Poland's largest LGBTQ+ advocacy organization" },
          { name: "Wrocław Pride (Parada Równości)", contact: "Annual Pride March & cultural festival" },
          { name: "Lambda Polska Helpline", contact: "+48 22 628 52 22 (National LGBTQ+ crisis & community support)" }
        ]
      },
      neighborhoods: [
        {
          name: "Four Denominations District (Czterech Wyznań)",
          vibe: "Interfaith harmony & rainbow oasis",
          description: "A unique square where the Evangelical-Augsburg Church of Divine Providence, Orthodox Church of St. Cyril and Methodius, White Stork Synagogue, and St. Anthony Catholic church all converge. Hugely popular with progressive crowds and home to Wrocław's queer social spaces."
        },
        {
          name: "Ruska Street & Neon Courtyards",
          vibe: "Alternative art, neon & nightlife",
          description: "The Ruska 46 neon courtyard anchors Wrocław's alternative scene with art galleries, vinyl bars, nightclubs, and inclusive social venues."
        }
      ],
      barsAndClubs: [
        {
          name: "Surowiec",
          address: "Surowiec, Ruska 46a, 50-079 Wrocław, Poland",
          lat: 51.1102855,
          lng: 17.0245017,
          type: "Cultural Club & Queer Dance Venue",
          description: "Alternative art space, cocktail bar, and queer-friendly dance floor set within the dramatic industrial-chic Ruska 46 neon courtyard.",
          vibe: "Post-industrial neon courtyard dancing till dawn",
          imageSrc: "/wayfinder/Poland-2026/images/wroclaw/api-fetched/surowiec.jpg"
        },
        {
          name: "Bezsenność",
          address: "ul. Ruska 51",
          lat: 51.1089776,
          lng: 17.0326689,
          type: "Retro Speakeasy Lounge",
          description: "Vintage speakeasy lounge attracting a diverse, open-minded crowd in the heart of the nightlife quarter.",
          vibe: "Retro cocktails, vinyl jazz & open-minded mingling",
          imageSrc: "https://images.unsplash.com/photo-1470337458703-415120a4c4b2?q=80&w=2670&auto=format&fit=crop"
        },
        {
          name: "Przedwojenna Bistro & Bar",
          address: "Przedwojenna, Świętego Mikołaja 81, 50-126 Wrocław, Poland",
          lat: 51.1110735,
          lng: 17.0302814,
          type: "24/7 Pre-War Vodka Bistro",
          description: "24/7 retro bistro beloved by Wrocław's late-night queer crowd, famous for chilled Polish vodkas, beef tartare, and nostalgic Art Deco decor.",
          vibe: "Prewar glamour, vodka flights & all-night vibes",
          imageSrc: "/wayfinder/Poland-2026/images/wroclaw/food/przedwojenna.jpg"
        }
      ],
      cafesAndDining: [
        {
          name: "Café Targowa",
          address: "Cafe Targowa, Piaskowa 17, 50-158 Wrocław, Poland",
          lat: 51.1125044,
          lng: 17.040749,
          type: "World-Champion Specialty Coffee",
          description: "Run by World Aeropress Champion Filip Śwojak inside the historic 1908 Market Hall. A welcoming, professional space popular with all communities.",
          signature: "Aeropress single-origin brews, flat whites & cinnamon buns",
          imageSrc: "/wayfinder/Poland-2026/images/wroclaw/food/cafe-targowa.jpg"
        },
        {
          name: "Konspira",
          address: "Konspira, Plac Solny 11, 50-061 Wrocław, Poland",
          lat: 51.1092597,
          lng: 17.0283023,
          type: "Anti-Communist Themed Restaurant",
          description: "Immersive 1980s Solidarity-themed restaurant beloved by progressive crowds for its playful subversive history and hearty Polish fare.",
          signature: "Solidarność ribs, giant pierogi platters & bigos",
          imageSrc: "/wayfinder/Poland-2026/images/wroclaw/food/konspira.jpg"
        }
      ],
      communityAndCulture: [
        {
          name: "Wrocław Pride (Parada Równości)",
          type: "Annual Equality March",
          description: "Wrocław's annual pride march, one of Poland's largest, celebrates queer visibility with municipal support and draws tens of thousands of participants.",
          highlight: "Held each June, routes from Rynek to the National Forum of Music"
        },
        {
          name: "Campaign Against Homophobia (KPH) HQ",
          type: "Poland's Leading LGBTQ+ Organization",
          description: "Oldest and largest Polish LGBTQ+ rights advocacy organization, headquartered in Wrocław, offering legal aid, community events, and national campaigns.",
          highlight: "Organizers of Poland's National Equality March"
        }
      ],
      winterExperiences: [
        {
          title: "Christmas Market & Neon Courtyard Stroll",
          description: "After the Rynek Christmas market, wander to the Ruska 46 neon courtyard for hot spiced mead (grzany miód) and inclusive DJ sets."
        },
        {
          title: "Gas Lantern Lighter Walk on Ostrów Tumski",
          description: "Join the romantic dusk lantern-lighting ceremony across Cathedral Island, one of Poland's most atmospheric winter rituals."
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
        imageUrl: "/Poland-2026/images/poznan/markets/poznan.png",
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
        imageUrl: "/Poland-2026/images/gdansk/markets/gdansk.png",
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
