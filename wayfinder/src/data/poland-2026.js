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
      krakowHotelsDetailed: [
        {
          id: 'hotel-stary',
          name: 'Hotel Stary',
          tier: 'luxury',
          tierLabel: '5-Star Luxury Palace',
          address: 'ul. Szczepańska 5 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 5,
          websiteUrl: 'https://stary.hotel.com.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
          basePricePln: 1150,
          memberPricePln: 1020,
          currency: 'PLN',
          usdEstimateBase: 295,
          usdEstimateMember: 260,
          description: 'Award-winning 14th-century merchant palace turned 5-star hotel. Features a breathtaking glass-roofed summer rooftop terrace overlooking Rynek Główny and an underground medieval brick-vaulted spa & pool.',
          signatureFeature: 'Rooftop terrace overlooking Rynek Główny & Gothic cellar pool',
          amenities: ['Cellar Swimming Pool', 'Rooftop Lounge', 'Michelin-Guide Dining', 'Spa & Sauna', 'Valet Parking'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '100m', time: '1 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '350m', time: '4 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '1.4 km', time: '18 min walk / 6 min tram' },
            attractions: [
              { name: 'Cloth Hall (Sukiennice)', distance: '120m', time: '1 min walk' },
              { name: 'St. Mary\'s Basilica', distance: '250m', time: '3 min walk' },
              { name: 'Wawel Royal Castle', distance: '950m', time: '12 min walk' },
              { name: 'Schindler\'s Factory', distance: '2.8 km', time: '10 min taxi' }
            ]
          }
        },
        {
          id: 'hotel-copernicus',
          name: 'Hotel Copernicus',
          tier: 'luxury',
          tierLabel: '5-Star Renaissance Heritage',
          address: 'ul. Kanonicza 16 (Old Town)',
          neighborhood: 'Stare Miasto (Kanonicza Street)',
          stars: 5,
          websiteUrl: 'https://copernicus.hotel.com.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80',
          basePricePln: 1250,
          memberPricePln: 1100,
          currency: 'PLN',
          usdEstimateBase: 320,
          usdEstimateMember: 282,
          description: 'Historic Relais & Châteaux residence on Kraków\'s oldest street. Named after Nicolaus Copernicus who stayed here; features preserved 14th-century wooden beams, Renaissance frescoes, and a fireside library lounge.',
          signatureFeature: 'Preserved 14th-century frescoes & fireside Renaissance courtyard',
          amenities: ['Underground Vaulted Pool', 'Fine Dining Restaurant', 'Rooftop Panorama Bar', 'Concierge Service'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '450m', time: '5 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '500m', time: '6 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '900m', time: '11 min walk' },
            attractions: [
              { name: 'Wawel Royal Castle', distance: '200m', time: '2 min walk' },
              { name: 'St. Mary\'s Basilica', distance: '500m', time: '6 min walk' },
              { name: 'Cloth Hall (Sukiennice)', distance: '450m', time: '5 min walk' },
              { name: 'Planty Park', distance: '100m', time: '1 min walk' }
            ]
          }
        },
        {
          id: 'sheraton-grand-krakow',
          name: 'Sheraton Grand Kraków',
          tier: 'luxury',
          tierLabel: '5-Star Riverside Grand Hotel',
          address: 'ul. Powadle 7 (Vistula Riverfront)',
          neighborhood: 'Wawel Slope & Vistula River',
          stars: 5,
          websiteUrl: 'https://www.marriott.com/en-us/hotels/krksi-sheraton-grand-krakow/overview/',
          imageSrc: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80',
          basePricePln: 920,
          memberPricePln: 810,
          currency: 'PLN',
          usdEstimateBase: 235,
          usdEstimateMember: 207,
          description: 'Refined 5-star luxury positioned right at the foot of Wawel Castle on the Vistula River bank. Boasts a massive glass-domed atrium lobby, Roof Top Terrace bar, and indoor heated pool.',
          signatureFeature: 'Direct river views & Wawel Castle panorama lounge',
          amenities: ['Glass-Domed Atrium', 'Indoor Swimming Pool', 'Fitness Center', 'Roof Top Bar', 'Riverfront Dining'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '800m', time: '10 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '900m', time: '11 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '1.0 km', time: '13 min walk' },
            attractions: [
              { name: 'Wawel Royal Castle', distance: '150m', time: '2 min walk' },
              { name: 'Vistula River Boulevards', distance: '30m', time: '1 min walk' },
              { name: 'Cloth Hall (Sukiennice)', distance: '800m', time: '10 min walk' },
              { name: 'Schindler\'s Factory', distance: '2.2 km', time: '7 min taxi' }
            ]
          }
        },
        {
          id: 'puro-krakow-stare-miasto',
          name: 'PURO Kraków Stare Miasto',
          tier: 'mid',
          tierLabel: 'Modern Boutique Design',
          address: 'ul. Ogrodowa 10 (Near Barbican)',
          neighborhood: 'Stare Miasto North / Main Station',
          stars: 4,
          websiteUrl: 'https://purohotel.pl/en/krakow-stare-miasto',
          imageSrc: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80',
          basePricePln: 480,
          memberPricePln: 425,
          currency: 'PLN',
          usdEstimateBase: 123,
          usdEstimateMember: 109,
          description: 'Ultra-contemporary Scandinavian design hotel right across from the historic Barbican. Features tablet-controlled smart rooms, complimentary specialty drip coffee lounge, and free city bikes.',
          signatureFeature: 'Contemporary art collection & complimentary artisan coffee',
          amenities: ['Free Specialty Coffee', 'Smart Room Control', 'Free Bike Rentals', 'Design Lounge & Bar', 'Pet Friendly'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '650m', time: '8 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '700m', time: '9 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '2.1 km', time: '10 min tram' },
            attractions: [
              { name: 'Barbican & St. Florian\'s Gate', distance: '250m', time: '3 min walk' },
              { name: 'St. Mary\'s Basilica', distance: '700m', time: '9 min walk' },
              { name: 'Main Railway Station (Kraków Główny)', distance: '300m', time: '4 min walk' },
              { name: 'Wawel Royal Castle', distance: '1.6 km', time: '20 min walk' }
            ]
          }
        },
        {
          id: 'hotel-indigo-krakow',
          name: 'Hotel Indigo Kraków Old Town',
          tier: 'mid',
          tierLabel: 'Artisanal Heritage Boutique',
          address: 'ul. św. Filipa 18 (Kleparz)',
          neighborhood: 'Stary Kleparz & Old Town Gate',
          stars: 4,
          websiteUrl: 'https://www.ihg.com/hotelindigo/hotels/us/en/krakow/krkin/hoteldetail',
          imageSrc: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=800&q=80',
          basePricePln: 550,
          memberPricePln: 485,
          currency: 'PLN',
          usdEstimateBase: 141,
          usdEstimateMember: 124,
          description: 'Sophisticated IHG boutique hotel set inside a restored 18th-century residential palace. Individually styled rooms inspired by Polish art icons Wyspiański, Matejko, and Nowakowski.',
          signatureFeature: 'Polish art history interiors & Filipa 18 gourmet restaurant',
          amenities: ['Boutique Bar', 'Fitness Center & Sauna', 'Art Gallery Corridors', 'Gourmet Breakfast'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '750m', time: '9 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '800m', time: '10 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '2.2 km', time: '12 min tram' },
            attractions: [
              { name: 'Stary Kleparz Artisanal Food Market', distance: '50m', time: '1 min walk' },
              { name: 'Barbican', distance: '350m', time: '4 min walk' },
              { name: 'Cloth Hall (Sukiennice)', distance: '800m', time: '10 min walk' },
              { name: 'Wawel Royal Castle', distance: '1.7 km', time: '21 min walk' }
            ]
          }
        },
        {
          id: 'metropolitan-boutique-hotel',
          name: 'Metropolitan Boutique Hotel',
          tier: 'mid',
          tierLabel: 'Old Town / Kazimierz Gateway',
          address: 'ul. Berka Joselewicza 19 (Kazimierz Border)',
          neighborhood: 'Old Town & Kazimierz Junction',
          stars: 4,
          websiteUrl: 'https://hotelmetropolitan.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
          basePricePln: 510,
          memberPricePln: 450,
          currency: 'PLN',
          usdEstimateBase: 130,
          usdEstimateMember: 115,
          description: 'Elegantly restored 19th-century residence perfectly situated right between the medieval Old Town and the trendy bohemian quarter of Kazimierz.',
          signatureFeature: 'Quiet internal courtyard garden & Fabryka Thonett bistro',
          amenities: ['Quiet Courtyard', 'Bistro & Cocktail Lounge', 'Fitness Room', 'Airport Shuttle', 'Concierge'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '900m', time: '11 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '850m', time: '10 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Nowy)', distance: '400m', time: '5 min walk' },
            attractions: [
              { name: 'Wawel Royal Castle', distance: '850m', time: '10 min walk' },
              { name: 'Old Synagogue Kazimierz', distance: '350m', time: '4 min walk' },
              { name: 'Cloth Hall (Sukiennice)', distance: '950m', time: '12 min walk' },
              { name: 'Father Bernatek Footbridge', distance: '900m', time: '11 min walk' }
            ]
          }
        },
        {
          id: 'ibis-krakow-stare-miasto',
          name: 'Ibis Kraków Stare Miasto',
          tier: 'budget',
          tierLabel: 'Cost-Effective Modern Comfort',
          address: 'ul. Pawia 15 (Main Station)',
          neighborhood: 'Stare Miasto North',
          stars: 3,
          websiteUrl: 'https://all.accor.com/hotel/7161/index.en.shtml',
          imageSrc: 'https://images.unsplash.com/photo-1568495248636-6432b97bd949?auto=format&fit=crop&w=800&q=80',
          basePricePln: 260,
          memberPricePln: 230,
          currency: 'PLN',
          usdEstimateBase: 66,
          usdEstimateMember: 58,
          description: 'Dependable, ultra-clean budget hotel located right next to Kraków Główny train station and Galeria Krakowska, with comfortable Sweet Bed mattresses and hot breakfast buffet.',
          signatureFeature: 'Direct express airport train access & Sweet Bed comfort',
          amenities: ['24/7 Reception', 'Express Check-In', 'Hot Breakfast Buffet', 'High-Speed WiFi', 'On-Site Bar'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '900m', time: '11 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '850m', time: '10 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '2.3 km', time: '10 min tram' },
            attractions: [
              { name: 'Barbican & Florian\'s Gate', distance: '450m', time: '5 min walk' },
              { name: 'St. Mary\'s Basilica', distance: '900m', time: '11 min walk' },
              { name: 'Main Train Station (Airport Direct)', distance: '150m', time: '2 min walk' },
              { name: 'Wawel Royal Castle', distance: '1.8 km', time: '22 min walk' }
            ]
          }
        },
        {
          id: 'boutique-aparthotel-kazimierz',
          name: 'Boutique Aparthotel Kazimierz',
          tier: 'budget',
          tierLabel: 'Cost-Effective Kazimierz Studio',
          address: 'ul. Miodowa 16 (Kazimierz)',
          neighborhood: 'Kazimierz Jewish Quarter',
          stars: 3,
          websiteUrl: 'https://www.aparthoteldelta.pl/',
          imageSrc: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
          basePricePln: 280,
          memberPricePln: 245,
          currency: 'PLN',
          usdEstimateBase: 71,
          usdEstimateMember: 62,
          description: 'Charming self-catering studio apartments set in an authentic 19th-century Kazimierz townhouse. Steps away from bohemian vintage shops, pierogarnias, and queer-friendly bakery spots.',
          signatureFeature: 'Kitchenette in room & authentic bohemian neighborhood location',
          amenities: ['In-Room Kitchenette', 'Self Check-In Keypad', 'Fast WiFi', 'Coffee Maker', 'Luggage Storage'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '1.2 km', time: '15 min walk / 6 min tram' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '1.1 km', time: '14 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Nowy)', distance: '200m', time: '2 min walk' },
            attractions: [
              { name: 'Remuh Synagogue & Old Jewish Cemetery', distance: '150m', time: '2 min walk' },
              { name: 'Wawel Royal Castle', distance: '900m', time: '11 min walk' },
              { name: 'Schindler\'s Factory', distance: '1.4 km', time: '17 min walk' },
              { name: 'Massolit Books & Café', distance: '1.2 km', time: '15 min walk' }
            ]
          }
        },
        {
          id: 'greg-tom-beer-house',
          name: 'Greg & Tom Beer House Hostel / Privates',
          tier: 'budget',
          tierLabel: 'Historic Old Town Budget & Pods',
          address: 'ul. Floriańska 43 (Old Town)',
          neighborhood: 'Stare Miasto (Royal Route)',
          stars: 2,
          websiteUrl: 'https://gregtomhostel.com',
          imageSrc: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          basePricePln: 190,
          memberPricePln: 165,
          currency: 'PLN',
          usdEstimateBase: 48,
          usdEstimateMember: 42,
          description: 'Top-rated, legendary historic townhouse offering cozy en-suite private rooms and privacy-curtained luxury dorm pods right on famous Floriańska street. Includes free cooked hot breakfast.',
          signatureFeature: 'Free cooked hot breakfast & prime Royal Route location',
          amenities: ['Free Hot Breakfast', 'Private En-Suite Rooms', '24/7 Security', 'Social Lounge', 'Luggage Locker'],
          proximity: {
            rynekMarket: { name: 'Main Market Square (Rynek Główny)', distance: '300m', time: '4 min walk' },
            malyRynekMarket: { name: 'Mały Rynek Christmas Market', distance: '300m', time: '4 min walk' },
            kazimierzMarket: { name: 'Kazimierz (Plac Wolnica / Nowy)', distance: '1.6 km', time: '20 min walk' },
            attractions: [
              { name: 'St. Florian\'s Gate', distance: '100m', time: '1 min walk' },
              { name: 'St. Mary\'s Basilica', distance: '300m', time: '4 min walk' },
              { name: 'Cloth Hall (Sukiennice)', distance: '350m', time: '4 min walk' },
              { name: 'Wawel Royal Castle', distance: '1.2 km', time: '15 min walk' }
            ]
          }
        },
        {
          id: 'grand-hotel-krakow',
          name: 'Grand Hotel Kraków',
          tier: 'luxury',
          tierLabel: 'Classic Aristocratic Luxury',
          address: 'ul. Sławkowska 5/7 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 5,
          websiteUrl: 'https://grand.pl/',
          imageSrc: 'https://images.unsplash.com/photo-1542314831-c6a4d14b8fc4?auto=format&fit=crop&w=800&q=80',
          basePricePln: 1100,
          memberPricePln: 950,
          currency: 'PLN',
          usdEstimateBase: 280,
          usdEstimateMember: 242,
          description: 'Kraków\'s first 5-star hotel operating since 1887. Housed in a former aristocratic palace, it features legendary old-world elegance just steps from the Main Market Square.',
          signatureFeature: 'Historic 19th-century palace interiors',
          amenities: ['Fine Dining Restaurant', 'Classic Café', 'Concierge Service', 'Luxury Suites'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '100m', time: '1 min walk' },
            attractions: [ { name: 'Cloth Hall', distance: '150m', time: '2 min walk' } ]
          }
        },
        {
          id: 'h15-palace',
          name: 'H15 Palace',
          tier: 'luxury',
          tierLabel: 'Boutique Spa Retreat',
          address: 'ul. św. Jana 15 (Old Town)',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 5,
          websiteUrl: 'https://www.marriott.com/en-us/hotels/krklc-h15-palace-a-luxury-collection-hotel-krakow/overview/',
          imageSrc: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
          basePricePln: 1300,
          memberPricePln: 1150,
          currency: 'PLN',
          usdEstimateBase: 330,
          usdEstimateMember: 295,
          description: 'Sophisticated luxury collection hotel featuring a stunning indoor pool housed under ancient vaults, exceptional concierge services, and serene spa facilities.',
          signatureFeature: 'Underground spa & indoor pool in historic vaults',
          amenities: ['Full-Service Spa', 'Indoor Pool', 'Fitness Center', 'Gourmet Dining'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '200m', time: '2 min walk' },
            attractions: [ { name: 'St. Mary\'s Basilica', distance: '250m', time: '3 min walk' } ]
          }
        },
        {
          id: 'hotel-pod-roza',
          name: 'Hotel Pod Różą',
          tier: 'luxury',
          tierLabel: 'Oldest Hotel in Kraków',
          address: 'ul. Floriańska 14 (Old Town)',
          neighborhood: 'Stare Miasto (Royal Route)',
          stars: 5,
          websiteUrl: 'https://podroza.hotel.com.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=800&q=80',
          basePricePln: 1050,
          memberPricePln: 900,
          currency: 'PLN',
          usdEstimateBase: 268,
          usdEstimateMember: 230,
          description: 'Dating back to the 14th century, Kraków\'s oldest hotel beautifully blends Renaissance architecture with modern 5-star comforts right on the prestigious Floriańska street.',
          signatureFeature: 'Renaissance courtyard & glass-roofed restaurant',
          amenities: ['Glass-Roofed Restaurant', 'Wine Cellar', 'Spa Center', 'Historic Suites'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '150m', time: '2 min walk' },
            attractions: [ { name: 'St. Florian\'s Gate', distance: '200m', time: '3 min walk' } ]
          }
        },
        {
          id: 'bachleda-luxury-hotel',
          name: 'Bachleda Luxury Hotel',
          tier: 'luxury',
          tierLabel: 'Art Deco Elegance',
          address: 'Plac Kossaka 6',
          neighborhood: 'Planty Park / Wawel',
          stars: 5,
          websiteUrl: 'https://bachledaluxuryhotel.pl/',
          imageSrc: 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=800&q=80',
          basePricePln: 950,
          memberPricePln: 820,
          currency: 'PLN',
          usdEstimateBase: 242,
          usdEstimateMember: 210,
          description: 'Offering a blend of Art Deco elegance and contemporary design, complete with a tranquil underground wellness area and the acclaimed GAVI restaurant.',
          signatureFeature: 'Art Deco interiors & GAVI restaurant',
          amenities: ['Underground Pool', 'Sauna & Spa', 'Acclaimed Restaurant', 'Lounge Bar'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '700m', time: '9 min walk' },
            attractions: [ { name: 'Wawel Royal Castle', distance: '400m', time: '5 min walk' } ]
          }
        },
        {
          id: 'balthazar-design-hotel',
          name: 'Balthazar Design Hotel',
          tier: 'luxury',
          tierLabel: 'Romantic Boutique Design',
          address: 'ul. Grodzka 43 (Old Town)',
          neighborhood: 'Stare Miasto (Grodzka Street)',
          stars: 5,
          websiteUrl: 'https://balthazarhotel.com/',
          imageSrc: 'https://images.unsplash.com/photo-1551882547-ff40c0d13c11?auto=format&fit=crop&w=800&q=80',
          basePricePln: 1150,
          memberPricePln: 980,
          currency: 'PLN',
          usdEstimateBase: 295,
          usdEstimateMember: 250,
          description: 'A boutique 5-star choice housed in a restored 19th-century building on the royal route. Home to Fiorentina, one of the city\'s most romantic dining spots.',
          signatureFeature: 'Bespoke design interiors & Fiorentina restaurant',
          amenities: ['Designer Rooms', 'Award-Winning Dining', 'Concierge', 'In-Room Massage'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '400m', time: '5 min walk' },
            attractions: [ { name: 'Wawel Royal Castle', distance: '300m', time: '4 min walk' } ]
          }
        },
        {
          id: 'hotel-unicus',
          name: 'Hotel Unicus Krakow Old Town',
          tier: 'mid',
          tierLabel: 'Modern Boutique',
          address: 'ul. św. Marka 20',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 4,
          websiteUrl: 'https://www.hotelunicus.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1551882547-ff40c0d13c11?auto=format&fit=crop&w=800&q=80',
          basePricePln: 520,
          memberPricePln: 450,
          currency: 'PLN',
          usdEstimateBase: 133,
          usdEstimateMember: 115,
          description: 'Highly-rated, modern boutique hotel located just steps from the Main Market Square. Praised for its cleanliness, helpful staff, and prime location.',
          signatureFeature: 'Steps from Rynek Główny',
          amenities: ['Restaurant', 'Fitness Center', 'Sauna', 'Room Service'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '200m', time: '3 min walk' },
            attractions: [ { name: 'St. Mary\'s Basilica', distance: '250m', time: '3 min walk' } ]
          }
        },
        {
          id: 'hotel-senacki',
          name: 'Hotel Senacki',
          tier: 'mid',
          tierLabel: 'Classic Comfort',
          address: 'ul. Grodzka 51',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 4,
          websiteUrl: 'https://www.senacki.com/en/',
          imageSrc: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
          basePricePln: 480,
          memberPricePln: 420,
          currency: 'PLN',
          usdEstimateBase: 123,
          usdEstimateMember: 107,
          description: 'Situated right in the heart of the Old Town on the Royal Route, offering a charming atmosphere and excellent service at reasonable prices.',
          signatureFeature: 'Royal Route location with views of St. Peter & Paul Church',
          amenities: ['Restaurant', 'Café', '24-hour Front Desk', 'Airport Shuttle'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '450m', time: '5 min walk' },
            attractions: [ { name: 'Wawel Royal Castle', distance: '300m', time: '4 min walk' } ]
          }
        },
        {
          id: 'aparthotel-stare-miasto',
          name: 'Aparthotel Stare Miasto',
          tier: 'mid',
          tierLabel: 'Boutique Studios',
          address: 'ul. Gołębia 2',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 4,
          websiteUrl: 'https://aparthotelstaremiasto.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
          basePricePln: 460,
          memberPricePln: 390,
          currency: 'PLN',
          usdEstimateBase: 118,
          usdEstimateMember: 100,
          description: 'An excellent mid-range option offering a boutique feel with studio accommodations right off the Main Market Square.',
          signatureFeature: 'Spacious self-catering boutique studios',
          amenities: ['Kitchenettes', 'Boutique Design', '24/7 Reception', 'Breakfast Available'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '50m', time: '1 min walk' },
            attractions: [ { name: 'Jagiellonian University', distance: '200m', time: '3 min walk' } ]
          }
        },
        {
          id: 'hotel-wawel-queen',
          name: 'Hotel Wawel Queen',
          tier: 'mid',
          tierLabel: 'Stylish & Comfortable',
          address: 'ul. Straszewskiego 17',
          neighborhood: 'Planty Park / Wawel',
          stars: 4,
          websiteUrl: 'https://wawelqueen.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1590490359854-dfba196ceaca?auto=format&fit=crop&w=800&q=80',
          basePricePln: 490,
          memberPricePln: 430,
          currency: 'PLN',
          usdEstimateBase: 125,
          usdEstimateMember: 110,
          description: 'Located near Wawel Castle and Planty Park, noted for its stylish modern rooms, comfortable memory-foam bedding, and proximity to major sights.',
          signatureFeature: 'Modern design near Wawel Castle',
          amenities: ['Restaurant', 'Bar', 'Memory-Foam Beds', 'Terrace'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '700m', time: '9 min walk' },
            attractions: [ { name: 'Wawel Royal Castle', distance: '250m', time: '3 min walk' } ]
          }
        },
        {
          id: 'hotel-francuski',
          name: 'Hotel Francuski',
          tier: 'mid',
          tierLabel: 'Historic Parisian Elegance',
          address: 'ul. Pijarska 13',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 4,
          websiteUrl: 'https://hotelfrancuski.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=800&q=80',
          basePricePln: 450,
          memberPricePln: 390,
          currency: 'PLN',
          usdEstimateBase: 115,
          usdEstimateMember: 100,
          description: 'A historic hotel opened in 1912 offering Parisian-style elegance right next to the ancient city walls and St. Florian\'s Gate.',
          signatureFeature: 'Classic Art Nouveau interiors',
          amenities: ['Restaurant', 'Bar/Lounge', 'Historic Ambience', 'Breakfast Buffet'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '300m', time: '4 min walk' },
            attractions: [ { name: 'Barbican', distance: '100m', time: '1 min walk' } ]
          }
        },
        {
          id: 'hotel-pollera',
          name: 'Hotel Pollera',
          tier: 'budget',
          tierLabel: 'Historic Value',
          address: 'ul. Szpitalna 30',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 3,
          websiteUrl: 'https://pollera.com.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1568495248636-6432b97bd949?auto=format&fit=crop&w=800&q=80',
          basePricePln: 290,
          memberPricePln: 250,
          currency: 'PLN',
          usdEstimateBase: 74,
          usdEstimateMember: 64,
          description: 'A well-known, historic 3-star hotel located just a few minutes\' walk from the Main Market Square. Famous for its Art Nouveau stained glass and great value.',
          signatureFeature: 'Art Nouveau heritage at a budget price',
          amenities: ['Breakfast Buffet', '24-hour Front Desk', 'Classic Interiors', 'Free WiFi'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '300m', time: '4 min walk' },
            attractions: [ { name: 'Słowacki Theatre', distance: '150m', time: '2 min walk' } ]
          }
        },
        {
          id: 'hotel-elektor-premium',
          name: 'Hotel Elektor Premium',
          tier: 'budget',
          tierLabel: 'Spacious & Central',
          address: 'ul. Szpitalna 28',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 3,
          websiteUrl: 'https://hotelelektor.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=800&q=80',
          basePricePln: 310,
          memberPricePln: 270,
          currency: 'PLN',
          usdEstimateBase: 79,
          usdEstimateMember: 69,
          description: 'Positioned in the heart of the Old Town, this hotel is praised for its spacious, well-equipped rooms and excellent proximity to the markets.',
          signatureFeature: 'Large rooms for the price',
          amenities: ['Restaurant', 'Room Service', 'Airport Shuttle', 'Free WiFi'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '250m', time: '3 min walk' },
            attractions: [ { name: 'St. Mary\'s Basilica', distance: '200m', time: '3 min walk' } ]
          }
        },
        {
          id: 'draggo-house',
          name: 'Draggo House',
          tier: 'budget',
          tierLabel: 'Premium Modern Hostel',
          address: 'ul. Gołębia 6',
          neighborhood: 'Stare Miasto (Old Town)',
          stars: 2,
          websiteUrl: 'https://draggo.house/',
          imageSrc: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
          basePricePln: 120,
          memberPricePln: 100,
          currency: 'PLN',
          usdEstimateBase: 31,
          usdEstimateMember: 26,
          description: 'Located just 50 meters from the Main Market Square, this modern hostel offers air conditioning, fast Wi-Fi, and private bathrooms in multi-bed rooms.',
          signatureFeature: 'Ultra-central location & private bathrooms',
          amenities: ['Shared Kitchen', 'Lounge Area', 'Air Conditioning', 'Private Bathrooms in Dorms'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '50m', time: '1 min walk' },
            attractions: [ { name: 'Cloth Hall', distance: '100m', time: '1 min walk' } ]
          }
        },
        {
          id: 'hostel-rynek-7',
          name: 'Hostel Rynek 7',
          tier: 'budget',
          tierLabel: 'Direct Square Views',
          address: 'Rynek Główny 7',
          neighborhood: 'Stare Miasto (Main Square)',
          stars: 2,
          websiteUrl: 'http://www.rynek7.pl/en/',
          imageSrc: 'https://images.unsplash.com/photo-1588015340656-787be088d850?auto=format&fit=crop&w=800&q=80',
          basePricePln: 110,
          memberPricePln: 95,
          currency: 'PLN',
          usdEstimateBase: 28,
          usdEstimateMember: 24,
          description: 'Situated right on the Main Market Square, ideal for those who want to be in the middle of all the action with views of the Christmas Market from their window.',
          signatureFeature: 'Located directly on Rynek Główny',
          amenities: ['Dorms & Privates', 'Communal Kitchen', 'City Views', 'Free WiFi'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '0m', time: '0 min walk' },
            attractions: [ { name: 'St. Mary\'s Basilica', distance: '100m', time: '1 min walk' } ]
          }
        },
        {
          id: 'bubble-hostel',
          name: 'Bubble Hostel',
          tier: 'budget',
          tierLabel: 'Chilled Modern Hostel',
          address: 'ul. Basztowa 15',
          neighborhood: 'Stare Miasto (Planty North)',
          stars: 2,
          websiteUrl: 'https://bubblehostel.pl/',
          imageSrc: 'https://images.unsplash.com/photo-1623625434462-e5e42318ae49?auto=format&fit=crop&w=800&q=80',
          basePricePln: 100,
          memberPricePln: 85,
          currency: 'PLN',
          usdEstimateBase: 26,
          usdEstimateMember: 22,
          description: 'A clean, modern environment with both dorms and private rooms. A great chilled-out alternative near the Barbican and train station.',
          signatureFeature: 'Modern clean design & relaxed atmosphere',
          amenities: ['Lockers', 'Shared Kitchen', 'Lounge Area', 'Reading Lights'],
          proximity: {
            rynekMarket: { name: 'Main Market Square', distance: '600m', time: '7 min walk' },
            attractions: [ { name: 'Barbican', distance: '150m', time: '2 min walk' } ]
          }
        }

      ],
      krakowUniqueStays: [
        {
          id: 'unique-wieliczka-salt',
          name: 'Salt Mine Wellness Retreat - Wieliczka',
          type: 'Underground Experience',
          typeLabel: 'UNESCO Heritage Stay',
          neighborhood: 'Wieliczka (30 min from Krakow)',
          priceRange: '450-650 PLN/night',
          priceUsd: '$115-$165',
          bookingUrl: 'https://www.wieliczka-saltmine.com/',
          imageSrc: 'https://images.unsplash.com/photo-1519074002996-a69e7ac46a42?auto=format&fit=crop&w=800&q=80',
          description: 'Sleep beneath 13 floors of crystalline salt chambers in Wieliczka, a UNESCO World Heritage site dating to the 13th century. The subterranean sanatorium offers overnight stays with proven therapeutic benefits for respiratory ailments.',
          whyUnique: 'One of the world\'s only underground wellness hotels - salt air therapy used for over 200 years',
          vibe: 'Mystical & Therapeutic',
          bestFor: ['History lovers', 'Wellness seekers', 'Unique experience hunters'],
          highlights: ['Salt crystal chambers', 'Underground chapel', 'Natural microclimate therapy', 'UNESCO World Heritage site'],
          travelNote: '30 min by minibus from Krakow\'s Galeria Krakowska or Old Town'
        },
        {
          id: 'unique-jewish-quarter-loft',
          name: 'Kazimierz Heritage Loft',
          type: 'Boutique Apartment',
          typeLabel: 'Jewish Quarter Immersion',
          neighborhood: 'Kazimierz Jewish Quarter',
          priceRange: '380-520 PLN/night',
          priceUsd: '$97-$133',
          bookingUrl: 'https://www.airbnb.com/s/Kazimierz--Krakow',
          imageSrc: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
          description: 'Restored 19th-century Jewish tenement lofts in the heart of Kazimierz - the city\'s most atmospheric and bohemian district. Featured in Schindler\'s List filming locations, now buzzing with galleries, klezmer bars, and legendary brunch spots.',
          whyUnique: 'Wake up in a living piece of Polish-Jewish heritage - steps from synagogues, flea markets and the city\'s best nightlife',
          vibe: 'Bohemian & Historic',
          bestFor: ['Cultural travelers', 'Foodies', 'Night owls'],
          highlights: ['Original exposed brick', 'Plac Nowy 2 min walk', 'Schindler\'s Factory 15 min walk', 'Kazimierz flea market access'],
          travelNote: '15-minute walk or 6-minute tram to Main Market Square'
        },
        {
          id: 'unique-communist-era-hotel',
          name: 'Forum Hotel Krakow',
          type: 'Retro Design Hotel',
          typeLabel: 'Communist-Era Icon Revival',
          neighborhood: 'Vistula Riverfront (Podgorze)',
          priceRange: '320-490 PLN/night',
          priceUsd: '$82-$125',
          bookingUrl: 'https://forumkrakow.eu/',
          imageSrc: 'https://images.unsplash.com/photo-1543968996-ee822b8176ba?auto=format&fit=crop&w=800&q=80',
          description: 'An audacious brutalist relic from the 1980s, dramatically revived as a cultural hub. Dramatic river views, rooftop cinema, cult cocktail bar, and one of Krakow\'s most unexpected skyline panoramas directly opposite Wawel Castle.',
          whyUnique: 'Nowhere else in Europe can you sleep in a communist-era brutalist landmark with a Wawel Castle panorama from the rooftop bar',
          vibe: 'Edgy & Cultural',
          bestFor: ['Architecture enthusiasts', 'Design lovers', 'Instagram travelers'],
          highlights: ['Wawel Castle views', 'Rooftop cinema', 'Cult brutalist architecture', 'Live music events'],
          travelNote: '10-minute walk along the Vistula Boulevards to Old Town'
        },
        {
          id: 'unique-monastery-guesthouse',
          name: 'Camaldolese Monastery Guesthouse',
          type: 'Monastic Guesthouse',
          typeLabel: 'Silent Retreat (Men Only)',
          neighborhood: 'Bielany Hill (7 km from Old Town)',
          priceRange: '180-280 PLN/night',
          priceUsd: '$46-$72',
          bookingUrl: 'https://www.bielany.net/en/',
          imageSrc: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
          description: 'A 17th-century hermitage perched on a forested hill above Krakow, offering guesthouse accommodation for male travelers seeking profound quiet, Gregorian chant at sunrise, and a total digital detox. One of the most unique experiences in Central Europe.',
          whyUnique: 'The only accommodation in Krakow where you are literally woken by 500-year-old Gregorian chanting and can hear nothing but forest silence',
          vibe: 'Spiritual & Serene',
          bestFor: ['Solo travelers', 'Spiritual seekers', 'Writers & creatives (digital detox)'],
          highlights: ['Gregorian chant at dawn', 'Ancient forest setting', 'Complete digital detox', 'Men only - rare monastic experience'],
          travelNote: 'Note: Guesthouse is for male travelers only. 25-min bus from city center'
        },
        {
          id: 'unique-tatra-villa',
          name: 'Highland Villa - Zakopane Day Trip Base',
          type: 'Mountain Chalet',
          typeLabel: 'Highlander Alpine Experience',
          neighborhood: 'Zakopane (1.5 hrs from Krakow)',
          priceRange: '350-600 PLN/night',
          priceUsd: '$90-$153',
          bookingUrl: 'https://www.airbnb.com/s/Zakopane--Poland',
          imageSrc: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
          description: 'Base yourself in a traditional Gorals wooden highland villa in Zakopane for a night or two - perfect for a mountain detour from Krakow. Thermal baths, Tatra peaks, cable car rides, and authentic oscypek cheese direct from shepherds.',
          whyUnique: 'Swap Krakow\'s cobblestones for Tatra peaks - traditional Goral wooden chalet architecture found nowhere else in Poland',
          vibe: 'Alpine & Adventurous',
          bestFor: ['Hikers', 'Skiers (winter)', 'Nature lovers'],
          highlights: ['Tatra National Park access', 'Traditional highland architecture', 'Thermal spa pools', 'Zakopane folk market'],
          travelNote: '1.5 hr bus from Krakow MDA bus station - book via FlixBus or PKS Krakow'
        }
      ],
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
          imageSrc: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1578474846511-04ba529f0b88?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1575444758702-4a6b9222336e?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1584225065152-4a1454aa3d4e?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1575444758702-4a6b9222336e?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1584225065152-4a1454aa3d4e?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80'
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
          imageSrc: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=800&q=80'
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
        imageUrl: "/Poland-2026/images/wroclaw/markets/wroclaw.png",
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
