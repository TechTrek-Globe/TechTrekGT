import krakowImg from '../assets/krakow/markets/krakow-rynek-glowny.png';
import wroclawImg from '../assets/wroclaw/markets/wroclaw.png';
import poznanImg from '../assets/poznan/markets/poznan.png';
import torunImg from '../assets/torun/markets/torun.png';
import gdanskImg from '../assets/gdansk/markets/gdansk.png';

import krakowRynekGlownyImg from '../assets/krakow/markets/krakow-rynek-glowny.png';
import krakowMalyRynekImg from '../assets/krakow/markets/krakow-maly-rynek.png';
import krakowPlacWolnicaImg from '../assets/krakow/markets/krakow-plac-wolnica.png';
import krakowRynekPodgorskiImg from '../assets/krakow/markets/krakow-rynek-podgorski.png';

import krakowWawelImg from '../assets/krakow/attractions/wawel-castle.jpg';
import krakowStMarysImg from '../assets/krakow/attractions/st-marys-basilica.jpg';
import krakowClothHallImg from '../assets/krakow/attractions/cloth-hall.jpg';
import krakowKazimierzImg from '../assets/krakow/attractions/kazimierz.jpg';
import krakowPlantyImg from '../assets/krakow/attractions/planty-park-barbican.jpg';
import krakowAuschwitzImg from '../assets/krakow/attractions/auschwitz-birkenau.jpg';
import krakowWieliczkaImg from '../assets/krakow/attractions/wieliczka-salt-mine.jpg';
import krakowSchindlerImg from '../assets/krakow/attractions/schindler-factory.jpg';
import krakowThermalBathsImg from '../assets/krakow/attractions/thermal-baths.jpg';
import krakowWalkingTourImg from '../assets/krakow/attractions/walking-tour.jpg';
import krakowLgbtqKazimierzImg from '../assets/krakow/attractions/lgbtq-kazimierz.jpg';

export const cityImages = {
  krakow: krakowImg,
  wroclaw: wroclawImg,
  poznan: poznanImg,
  torun: torunImg,
  gdansk: gdanskImg,
};

export const marketImages = {
  'rynek-glowny': krakowRynekGlownyImg,
  'maly-rynek': krakowMalyRynekImg,
  'kazimierz-wolnica': krakowPlacWolnicaImg,
  'podgorze': krakowRynekPodgorskiImg,
};

export const attractionImages = {
  'wawel-castle.jpg': krakowWawelImg,
  'st-marys-basilica.jpg': krakowStMarysImg,
  'cloth-hall.jpg': krakowClothHallImg,
  'kazimierz.jpg': krakowKazimierzImg,
  'planty-park-barbican.jpg': krakowPlantyImg,
  'auschwitz-birkenau.jpg': krakowAuschwitzImg,
  'wieliczka-salt-mine.jpg': krakowWieliczkaImg,
  'schindler-factory.jpg': krakowSchindlerImg,
  'thermal-baths.jpg': krakowThermalBathsImg,
  'walking-tour.jpg': krakowWalkingTourImg,
  'lgbtq-kazimierz.jpg': krakowLgbtqKazimierzImg,
};

export function getAttractionImage(cardImage = '', cardTitle = '', cityName = 'Kraków') {
  if (cardImage) {
    const filename = cardImage.split('/').pop();
    if (attractionImages[filename]) {
      return attractionImages[filename];
    }
  }

  const name = (cardTitle || '').toLowerCase();
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

  return cityImages[cityName.toLowerCase()] || cityImages.krakow;
}
