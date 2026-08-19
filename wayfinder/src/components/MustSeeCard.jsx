import React, { useState } from 'react';
import { MapPin, Navigation, Compass, Plus, Check, CalendarX, ExternalLink } from 'lucide-react';
import { cityImages, marketImages, getAttractionImage } from '../utils/cityImages';
import { useAuth } from '../context/AuthContext';
import { FormatText } from './Formatters';
import { UrgentBookingAlert } from './UrgentBookingAlert';
import { WinterExclusive } from './WinterExclusive';

/**
 * Extracts a concise vital stats list for the quick stats row.
 * Format: 📍 Location • 🎟️ Pricing • 🕒 Hours
 */
function getQuickStats({ locationData, costData, hoursData, location, pricing, openTimes, howToGetThere, vitalStats }, cityName = 'Kraków') {
  if (vitalStats && Array.isArray(vitalStats)) {
    return vitalStats;
  }

  const stats = [];

  // 1. Location / Area
  let loc = locationData || location;
  if (!loc && howToGetThere) {
    const text = howToGetThere;
    if (text.includes('Main Market Square') || text.includes('Rynek Główny')) {
      loc = 'Old Town (Rynek)';
    } else if (text.includes('Old Town')) {
      loc = 'Old Town';
    } else if (text.includes('Kazimierz') || text.includes('Plac Wolnica')) {
      loc = 'Kazimierz';
    } else if (text.includes('Wawel')) {
      loc = 'Wawel Hill';
    } else if (text.includes('Barbican') || text.includes('Planty')) {
      loc = 'Old Town (Planty)';
    } else if (text.includes('Zabłocie') || text.includes('Schindler')) {
      loc = 'Zabłocie';
    } else if (text.includes('Wieliczka')) {
      loc = 'Wieliczka';
    } else if (text.includes('Oświęcim') || text.includes('MDA')) {
      loc = 'Oświęcim';
    } else {
      loc = cityName;
    }
  }
  stats.push(`📍 ${loc || cityName}`);

  // 2. Cost / Pricing
  const priceVal = costData || pricing;
  if (priceVal) {
    const p = priceVal.toLowerCase();
    if (p.includes('free') && !p.includes('~')) {
      stats.push('🎟️ Free Entry');
    } else if (p.includes('cathedral free')) {
      stats.push('🎟️ Free / ~35 PLN');
    } else if (p.includes('cloth hall free')) {
      stats.push('🎟️ Free / ~32 PLN');
    } else if (p.includes('park free')) {
      stats.push('🎟️ Free / ~16 PLN');
    } else if (p.includes('15 pln')) {
      stats.push('🎟️ ~15 PLN');
    } else if (p.includes('32 pln')) {
      stats.push('🎟️ ~32 PLN');
    } else if (p.includes('122 pln')) {
      stats.push('🎟️ ~122 PLN');
    } else if (p.includes('100 pln')) {
      stats.push('🎟️ Free / ~100 PLN');
    } else {
      const match = priceVal.match(/~?\d+\s*PLN/i);
      stats.push(`🎟️ ${match ? match[0] : 'Paid'}`);
    }
  }

  // 3. Operating Hours
  const timeVal = hoursData || openTimes;
  if (timeVal) {
    const t = timeVal;
    if (t.includes('24/7')) {
      stats.push('🕒 Open 24/7');
    } else if (t.includes('8:00 AM - 3:00 PM')) {
      stats.push('🕒 8 AM - 3 PM');
    } else if (t.includes('8:30 AM - 5:00 PM')) {
      stats.push('🕒 8:30 AM - 5 PM');
    } else if (t.includes('9:30 AM - 5:00 PM')) {
      stats.push('🕒 9:30 AM - 5 PM');
    } else if (t.includes('10:00 AM - 8:00 PM')) {
      stats.push('🕒 10 AM - 8 PM');
    } else if (t.includes('10:00 AM - 6:00 PM')) {
      stats.push('🕒 10 AM - 6 PM');
    } else if (t.includes('11:30 AM - 6:00 PM')) {
      stats.push('🕒 11:30 AM - 6 PM');
    } else {
      const cleanTime = t.split('(')[0].trim();
      stats.push(`🕒 ${cleanTime}`);
    }
  }

  return stats;
}

function getFallbackImage(title = '', cityName = 'Kraków') {
  const name = title.toLowerCase();
  if (name.includes('mariacki') || name.includes('cloth hall') || name.includes('sukiennice') || name.includes('wawel')) {
    return marketImages['rynek-glowny'] || cityImages.krakow;
  }
  if (name.includes('kazimierz') || name.includes('schindler') || name.includes('jewish')) {
    return marketImages['kazimierz-wolnica'] || cityImages.krakow;
  }
  if (name.includes('planty') || name.includes('barbican') || name.includes('podgór')) {
    return marketImages['podgorze'] || cityImages.krakow;
  }
  if (name.includes('wieliczka') || name.includes('salt') || name.includes('maly')) {
    return marketImages['maly-rynek'] || cityImages.krakow;
  }
  return cityImages[cityName.toLowerCase()] || cityImages.krakow;
}

/**
 * Bento Box "MustSeeCard" component with Exposed Vital Stats layout.
 * Supports both individual props and a nested sight object prop.
 */
export function MustSeeCard(props) {
  const {
    sight,
    imageSrc,
    title,
    category,
    description,
    locationData,
    costData,
    hoursData,
    howToGetThere,
    daysClosed,
    cityName = 'Kraków',
    onAddToItinerary
  } = props;

  const cardUrgentAlert = sight?.urgentAlert || null;
  const cardIsWinterExclusive = sight?.isWinterExclusive || false;
  const cardWinterLabel = sight?.winterExclusiveLabel || 'Winter Exclusive';

  // Normalize data whether passed via individual props or a sight object
  const cardTitle = title || sight?.name || sight?.title || 'Attraction';
  const cardCategory = category || sight?.category || 'Must-See Sight';
  const cardDescription = description || sight?.description || '';
  const cardImage = imageSrc || sight?.imageUrl || sight?.imageSrc;
  const cardLocation = locationData || sight?.locationData || sight?.location;
  const cardCost = costData || sight?.costData || sight?.pricing;
  const cardHours = hoursData || sight?.hoursData || sight?.openTimes;
  const cardTransit = howToGetThere || sight?.howToGetThere;
  const cardClosed = daysClosed || sight?.daysClosed;
  const cardVitalStats = sight?.vitalStats;

  const { isAuthenticated } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [imgError, setImgError] = useState(false);

  const quickStats = getQuickStats(
    {
      locationData: cardLocation,
      costData: cardCost,
      hoursData: cardHours,
      howToGetThere: cardTransit,
      vitalStats: cardVitalStats
    },
    cityName
  );

  const searchQuery = encodeURIComponent(`${cardTitle}, ${cityName}, Poland`);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${searchQuery}`;
  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;

  const handleToggleItinerary = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSaved(!isSaved);
    if (onAddToItinerary) {
      onAddToItinerary(sight || props, !isSaved);
    }
  };

  const currentImgSrc = getAttractionImage(cardImage, cardTitle, cityName);

  return (
    <article className="glass-panel rounded-3xl border border-white/10 hover:border-amber-500/40 transition-all duration-300 overflow-hidden flex flex-col h-full bg-wf-navy-mid/80 shadow-xl group">
      {/* 1. Static Image (Top): Fixed 200px height with #2d3748 fallback */}
      <div className="relative w-full h-[200px] bg-[#2d3748] overflow-hidden shrink-0">
        <img
          src={currentImgSrc}
          alt={cardTitle}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        {/* Gradient Scrim for Contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid/95 via-transparent to-black/30 pointer-events-none" />

        {/* Category Pill floating on Image */}
        <div className="absolute top-3.5 left-3.5 z-10">
          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-950/80 backdrop-blur-md border border-amber-400/30 text-amber-300 shadow-md">
            {cardCategory}
          </span>
        </div>

        {/* Winter Exclusive badge floating on Image */}
        {cardIsWinterExclusive && (
          <div className="absolute top-3.5 right-3.5 z-10">
            <WinterExclusive label={cardWinterLabel} />
          </div>
        )}
      </div>

      {/* 2. Content Body (Middle): Flex-column body section with flex-grow: 1 */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2.5">
          <h3 className="text-xl font-black text-white leading-tight group-hover:text-amber-300 transition-colors">
            {cardTitle}
          </h3>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
            {cardDescription}
          </p>

          {/* Urgent booking/capacity warning banner */}
          {cardUrgentAlert && <UrgentBookingAlert message={cardUrgentAlert} />}
        </div>

        {/* 3. Quick Stats Row (Lower Middle): Exposed vital logistical data */}
        <div className="pt-3 border-t border-white/10 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs font-semibold text-amber-300/90">
            {quickStats.map((stat, idx) => (
              <React.Fragment key={idx}>
                <span className="inline-flex items-center space-x-1 whitespace-nowrap">
                  <span><FormatText text={stat} /></span>
                </span>
                {idx < quickStats.length - 1 && (
                  <span className="text-slate-600 font-bold select-none">•</span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Exposed Logistical Context Badges */}
          <div className="grid grid-cols-1 gap-1.5 pt-1">
            {cardTransit && (
              <div className="flex items-start space-x-2 text-[11px] text-slate-300 leading-snug">
                <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span className="text-slate-300/90">{cardTransit}</span>
              </div>
            )}
            {cardClosed && (
              <div className="flex items-start space-x-2 text-[11px] text-red-300 leading-snug">
                <CalendarX className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-red-300/90">Closed: {cardClosed}</span>
              </div>
            )}
          </div>

          {/* GetYourGuide & Viator Walking Tour Booking Action Bar */}
          <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
            <a
              href={sight?.gygUrl || `https://www.getyourguide.com/s/?q=Krakow+${encodeURIComponent(cardTitle)}+walking+tour`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 border border-amber-500/30 text-[10px] sm:text-[11px] font-black transition-all flex items-center justify-center space-x-1 shadow-sm"
              title={`Book ${cardTitle} tour on GetYourGuide`}
            >
              <span>🎟️</span>
              <span>GetYourGuide</span>
            </a>
            <a
              href={sight?.viatorUrl || `https://www.viator.com/searchResults/all?text=Krakow+${encodeURIComponent(cardTitle)}+walking+tour`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 text-[10px] sm:text-[11px] font-black transition-all flex items-center justify-center space-x-1 shadow-sm"
              title={`Book ${cardTitle} tour on Viator`}
            >
              <span>🗺️</span>
              <span>Viator Tour</span>
            </a>
          </div>
        </div>
      </div>

      {/* 4. Action Footer (Bottom): Darker background with flexbox evenly spaced buttons */}
      <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <a
          href={sight?.websiteUrl || sight?.url || `https://www.google.com/search?q=${searchQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
          title={`Visit ${cardTitle} website`}
        >
          <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 transition-colors shrink-0" />
          <span className="truncate">Website</span>
        </a>

        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
          title={`Get directions to ${cardTitle}`}
        >
          <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-amber-300 transition-colors" />
          <span>Directions</span>
        </a>

        <a
          href={mapSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
          title={`View ${cardTitle} on Google Maps`}
        >
          <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 transition-colors" />
          <span>View Map</span>
        </a>

        {isAuthenticated && (
          <button
            type="button"
            onClick={handleToggleItinerary}
            className={`flex-1 py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border ${
              isSaved
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
            }`}
            title={isSaved ? 'Remove from itinerary' : 'Add to itinerary'}
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Itinerary</span>
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

export default MustSeeCard;
