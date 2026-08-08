import krakowImg from '../assets/krakow-rynek-glowny.png';
import wroclawImg from '../assets/wroclaw.png';
import poznanImg from '../assets/poznan.png';
import torunImg from '../assets/torun.png';
import gdanskImg from '../assets/gdansk.png';

import krakowRynekGlownyImg from '../assets/krakow-rynek-glowny.png';
import krakowMalyRynekImg from '../assets/krakow-maly-rynek.png';
import krakowPlacWolnicaImg from '../assets/krakow-plac-wolnica.png';
import krakowRynekPodgorskiImg from '../assets/krakow-rynek-podgorski.png';

import krakowWawelImg from '../assets/attractions/krakow/wawel-castle.jpg';
import krakowStMarysImg from '../assets/attractions/krakow/st-marys-basilica.jpg';
import krakowClothHallImg from '../assets/attractions/krakow/cloth-hall.jpg';
import krakowKazimierzImg from '../assets/attractions/krakow/kazimierz.jpg';
import krakowPlantyImg from '../assets/attractions/krakow/planty-park-barbican.jpg';
import krakowAuschwitzImg from '../assets/attractions/krakow/auschwitz-birkenau.jpg';
import krakowWieliczkaImg from '../assets/attractions/krakow/wieliczka-salt-mine.jpg';
import krakowSchindlerImg from '../assets/attractions/krakow/schindler-factory.jpg';

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
};

export function getAttractionImage(cardImage = '', cardTitle = '', cityName = 'Kraków') {
  if (cardImage) {
    const filename = cardImage.split('/').pop();
    if (attractionImages[filename]) {
      return attractionImages[filename];
    }
  }

  const name = (cardTitle || '').toLowerCase();
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
