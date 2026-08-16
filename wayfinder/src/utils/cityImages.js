export const cityImages = {
  krakow: '/wayfinder/Poland-2026/images/krakow/markets/krakow-rynek-glowny.png',
  wroclaw: '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw.png',
  poznan: '/wayfinder/Poland-2026/images/poznan/markets/poznan.png',
  torun: '/wayfinder/Poland-2026/images/torun/markets/torun.png',
  gdansk: '/wayfinder/Poland-2026/images/gdansk/markets/gdansk.png',
};

export const marketImages = {
  'rynek-glowny': '/wayfinder/Poland-2026/images/krakow/markets/krakow-rynek-glowny.png',
  'maly-rynek': '/wayfinder/Poland-2026/images/krakow/markets/krakow-maly-rynek.png',
  'kazimierz-wolnica': '/wayfinder/Poland-2026/images/krakow/markets/krakow-plac-wolnica.png',
  'podgorze': '/wayfinder/Poland-2026/images/krakow/markets/krakow-rynek-podgorski.png',
  'wroclaw-rynek': '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw.png',
  'wroclaw-plac-solny': '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw-plac-solny.jpg',
  'wroclaw-swidnicka': '/wayfinder/Poland-2026/images/wroclaw/markets/wroclaw-swidnicka.jpg',
};

export const attractionImages = {
  'wawel-castle.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/wawel-castle.jpg',
  'st-marys-basilica.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/st-marys-basilica.jpg',
  'cloth-hall.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/cloth-hall.jpg',
  'kazimierz.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/kazimierz.jpg',
  'planty-park-barbican.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/planty-park-barbican.jpg',
  'auschwitz-birkenau.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/auschwitz-birkenau.jpg',
  'wieliczka-salt-mine.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/wieliczka-salt-mine.jpg',
  'schindler-factory.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/schindler-factory.jpg',
  'thermal-baths.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/thermal-baths.jpg',
  'walking-tour.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/walking-tour.jpg',
  'lgbtq-kazimierz.jpg': '/wayfinder/Poland-2026/images/krakow/attractions/lgbtq-kazimierz.jpg',
  'wroclaw-market-square.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-market-square.jpg',
  'ostrow-tumski.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/ostrow-tumski.jpg',
  'wroclaw-dwarfs.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-dwarfs.jpg',
  'tumski-bridge.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/tumski-bridge.jpg',
  'centennial-hall.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/centennial-hall.jpg',
  'panorama-raclawice.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/panorama-raclawice.jpg',
  'wroclaw-walking-tour.jpg': '/wayfinder/Poland-2026/images/wroclaw/attractions/wroclaw-walking-tour.jpg'
};

export function getAttractionImage(cardImage = '', cardTitle = '', cityName = 'Kraków') {
  if (cardImage) {
    if (cardImage.startsWith('/wayfinder/')) {
      return cardImage;
    }
    if (cardImage.startsWith('/Poland-2026/')) {
      return `/wayfinder${cardImage}`;
    }
    const filename = cardImage.split('/').pop();
    if (attractionImages[filename]) {
      return attractionImages[filename];
    }
  }

  const name = (cardTitle || '').toLowerCase();
  const cName = (cityName || '').toLowerCase();

  if (cName.includes('wrocław') || cName.includes('wroclaw')) {
    if (name.includes('dwarf') || name.includes('krasnal')) return attractionImages['wroclaw-dwarfs.jpg'];
    if (name.includes('tumski') && name.includes('bridge')) return attractionImages['tumski-bridge.jpg'];
    if (name.includes('tumski') || name.includes('cathedral')) return attractionImages['ostrow-tumski.jpg'];
    if (name.includes('centennial') || name.includes('stulecia')) return attractionImages['centennial-hall.jpg'];
    if (name.includes('panorama') || name.includes('racławic')) return attractionImages['panorama-raclawice.jpg'];
    if (name.includes('walk') || name.includes('tour')) return attractionImages['wroclaw-walking-tour.jpg'];
    if (name.includes('ratusz') || name.includes('square')) return attractionImages['wroclaw-market-square.jpg'];
    return cityImages.wroclaw;
  }

  if (name.includes('walk') || name.includes('tour') || name.includes('guided')) return attractionImages['walking-tour.jpg'];
  if (name.includes('thermal') || name.includes('termy') || name.includes('bath') || name.includes('chochoł')) return attractionImages['thermal-baths.jpg'];
  if (name.includes('wawel')) return attractionImages['wawel-castle.jpg'];
  if (name.includes('mariacki') || name.includes('mary')) return attractionImages['st-marys-basilica.jpg'];
  if (name.includes('cloth hall') || name.includes('sukiennice')) return attractionImages['cloth-hall.jpg'];
  if (name.includes('kazimierz')) return attractionImages['kazimierz.jpg'];
  if (name.includes('planty') || name.includes('barbican')) return attractionImages['planty-park-barbican.jpg'];
  if (name.includes('auschwitz') || name.includes('birkenau')) return attractionImages['auschwitz-birkenau.jpg'];
  if (name.includes('wieliczka') || name.includes('salt mine')) return attractionImages['wieliczka-salt-mine.jpg'];
  if (name.includes('schindler')) return attractionImages['schindler-factory.jpg'];

  return cityImages[cName] || cityImages.krakow;
}

