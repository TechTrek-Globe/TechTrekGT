import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ArrowLeft, Train, Landmark, BookOpen, ShoppingBag, Sparkles, Utensils, Bed, Heart, MapPin } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { cityImages, getAttractionImage } from '../utils/cityImages';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { useAuth } from '../context/AuthContext';
import { CityHeroImageCard } from './city/CityHeroImageCard';
import { CityOverviewTab } from './city/CityOverviewTab';
import { CityHistoryTab } from './city/CityHistoryTab';
import { CityMarketsTab } from './city/CityMarketsTab';
import { CityAttractionsTab } from './city/CityAttractionsTab';
import { CityFoodTab } from './city/CityFoodTab';
import { CityHotelsTab } from './city/CityHotelsTab';
import { CityLgbtqTab } from './city/CityLgbtqTab';

export function CityPage({ cityId, subPage = 'overview' }) {
  const [activeMarketTab, setActiveMarketTab] = useState(0);
  const [activeEpochTab, setActiveEpochTab] = useState('all');
  const [restaurantCategoryFilter, setRestaurantCategoryFilter] = useState('all');
  const [lgbtqCategoryFilter, setLgbtqCategoryFilter] = useState('all');
  const [savedItems, setSavedItems] = useState(() => {
    try {
      const saved = localStorage.getItem('wayfinder_saved_items');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleItinerary = (id) => {
    setSavedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem('wayfinder_saved_items', JSON.stringify([...next]));
      } catch (err) {
        console.error('Failed to save itinerary item:', err);
      }
      return next;
    });
  };

  const { isAuthenticated } = useAuth();
  const exchangeRates = useExchangeRate();
  const subPageSectionRef = useRef(null);
  const cityHeaderRef = useRef(null);

  const pushRoute = (e, path) => {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const scrollToSubPageArea = () => {
    if (subPageSectionRef.current) {
      const yOffset = -115; // Accounts for sticky navbar (56px) + sticky sub-toolbar (~48px) + breathing room
      const y = subPageSectionRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  const scrollToCityHeader = () => {
    if (cityHeaderRef.current) {
      const yOffset = -60; // Offset for sticky navbar
      const y = cityHeaderRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  const handleSubPageTabClick = (e, path) => {
    if (e) e.preventDefault();
    const isOverview = path === baseUrl || path === `${baseUrl}/` || path.endsWith(`/${cityId}`);
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (isOverview) {
      setTimeout(scrollToCityHeader, 30);
    } else {
      setTimeout(scrollToSubPageArea, 30);
    }
  };

  const city = polandJourney.route.find(c => c.id === cityId);

  if (!city) {
    return (
      <div className="flex-1 flex items-center justify-center text-wf-muted p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">City Not Found</h2>
          <p>We couldn't find the city you're looking for in this journey.</p>
        </div>
      </div>
    );
  }

  const baseUrl = `/wayfinder/poland-christmas-2026/cities/${cityId}`;

  const activeSubPage = ['history', 'timeline', 'history-timeline', 'chronological'].includes(subPage)
    ? 'history'
    : (['attractions', 'sights', 'must-see', 'must-see-sights'].includes(subPage)
      ? 'attractions'
      : (['restaurants', 'food', 'dining', 'top-restaurants', 'food-drink', 'drinks', 'bars', 'pubs', 'breweries'].includes(subPage)
        ? 'restaurants'
        : (['markets', 'market', 'christmas-markets'].includes(subPage)
          ? 'markets'
          : (['hotels', 'hotel', 'stays', 'lodging', 'accommodations'].includes(subPage)
            ? 'hotels'
            : (['lgbtq', 'gay', 'queer', 'lgbt', 'lgbtq-guide'].includes(subPage)
              ? 'lgbtq'
              : 'overview')))));

  useLayoutEffect(() => {
    if (activeSubPage !== 'overview') {
      setTimeout(scrollToSubPageArea, 50);
    } else if (cityHeaderRef.current) {
      const yOffset = -60;
      const y = cityHeaderRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
    }
  }, [cityId, activeSubPage]);

  // Dynamic Page Title, Meta Description, Canonical URL, Open Graph & JSON-LD Structured Data
  useEffect(() => {
    if (!city) return;

    const pageTitle = activeSubPage !== 'overview'
      ? `${city.name} ${activeSubPage.charAt(0).toUpperCase() + activeSubPage.slice(1)} | Poland Christmas 2026`
      : `${city.name} Travel Guide & Christmas Market 2026 | TechTrek Wayfinder`;

    document.title = pageTitle;

    const canonicalUrl = `https://techtrekgt.com/wayfinder/poland-christmas-2026/cities/${city.id}${activeSubPage !== 'overview' ? '/' + activeSubPage : ''}`;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = `Explore ${city.name} during Christmas 2026. ${city.focus || city.description || ''} Complete guide with hotels, food, markets, and attractions.`;

    // Canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonicalUrl;

    // Open Graph Title
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.content = pageTitle;

    // Open Graph Description
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.content = metaDesc.content;

    // Open Graph URL
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.content = canonicalUrl;

    // JSON-LD Structured Data
    const parseDateRange = (dateRange) => {
      if (!dateRange) return { start: '2026-11-21', end: '2027-01-07' };
      const parts = dateRange.split('-').map(s => s.trim());
      if (parts.length < 2) return { start: '2026-11-21', end: '2027-01-07' };
      const toIso = (raw) => {
        const m = String(raw).match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
        if (!m) return null;
        const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
        const mm = months[m[1]];
        if (!mm) return null;
        return `${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}`;
      };
      const start = toIso(parts[0]);
      const end = toIso(parts[1]);
      return { start: start || '2026-11-21', end: end || '2027-01-07' };
    };
    const { start: jsonLdStart, end: jsonLdEnd } = parseDateRange(city.dates);

    let jsonLdScript = document.getElementById('city-json-ld');
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.id = 'city-json-ld';
      jsonLdScript.type = 'application/ld+json';
      document.head.appendChild(jsonLdScript);
    }
    jsonLdScript.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TouristDestination',
      'name': `${city.name} Christmas Market 2026`,
      'description': city.focus,
      'url': canonicalUrl,
      'event': {
        '@type': 'Event',
        'name': `${city.name} Christmas Market 2026`,
        'startDate': jsonLdStart,
        'endDate': jsonLdEnd,
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'eventStatus': 'https://schema.org/EventScheduled',
        'location': {
          '@type': 'Place',
          'name': `${city.name} Main Market Square`,
          'address': {
            '@type': 'PostalAddress',
            'addressLocality': city.name,
            'addressCountry': 'PL'
          }
        }
      }
    });

  }, [city, activeSubPage]);

  // OpenStreetMap embed bbox for Kraków, Wrocław, or generic fallback
  const mapUrl = cityId === 'krakow'
    ? "https://www.openstreetmap.org/export/embed.html?bbox=19.9200%2C50.0450%2C19.9650%2C50.0700&amp;layer=mapnik&amp;marker=50.0614%2C19.9366"
    : cityId === 'wroclaw'
      ? "https://www.openstreetmap.org/export/embed.html?bbox=17.0150%2C51.1000%2C17.0500%2C51.1200&amp;layer=mapnik&amp;marker=51.1095%2C17.0318"
      : "https://www.openstreetmap.org/export/embed.html?bbox=16.9000%2C51.1000%2C17.1000%2C51.1300&amp;layer=mapnik";

  return (
    <div ref={cityHeaderRef} className="w-full max-w-6xl min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Navigation Header with Horizontal Trail Track Chart */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Back Button */}
          <a 
            href="/wayfinder/poland-christmas-2026?scroll=journey-sequence" 
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026?scroll=journey-sequence')} 
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-sm border border-amber-500/40 hover:border-amber-400 transition-all duration-300 shadow-lg shadow-amber-900/30 hover:shadow-amber-500/30 hover:scale-105 shrink-0 group self-start lg:self-auto"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Poland Journey Overview</span>
          </a>

          {/* Prominent Wide Horizontal Trail Track Chart */}
          <div className="flex-1 glass-panel px-5 py-4 rounded-2xl border-2 border-amber-500/40 bg-wf-navy-mid/95 backdrop-blur-xl shadow-2xl flex items-center justify-between min-w-0 overflow-x-auto no-scrollbar no-overscroll-x">
            <div className="flex items-center justify-between w-full min-w-[580px] relative px-4 py-3">
              {/* Thick Visible Railroad Track Line */}
              <div className="absolute top-[32px] left-8 right-8 h-2.5 bg-slate-950 border-y-2 border-amber-400 rounded-full z-0 flex items-center justify-around overflow-hidden shadow-inner">
                {/* Railroad ties pattern */}
                <div className="w-full h-full bg-[linear-gradient(90deg,transparent_50%,rgba(245,158,11,0.6)_50%)] bg-[length:12px_100%] opacity-90"></div>
              </div>

              {polandJourney.route.map((item, idx) => {
                const isCurrent = item.id === cityId;
                const itemUrl = `/wayfinder/poland-christmas-2026/cities/${item.id}`;
                const isLast = idx === polandJourney.route.length - 1;

                return (
                  <React.Fragment key={item.id}>
                    {/* City Avatar Node */}
                    <a
                      href={itemUrl}
                      onClick={(e) => pushRoute(e, itemUrl)}
                      className={`relative z-10 flex flex-col items-center group cursor-pointer shrink-0 transition-transform ${
                        isCurrent ? 'z-20' : 'opacity-70 hover:opacity-100'
                      }`}
                      title={`${item.name} (${item.nights > 0 ? `${item.nights} Nights` : 'Day Stop'})`}
                    >
                      {/* Active City "YOU ARE HERE" Badge */}
                      {isCurrent && (
                        <span className="absolute -top-7 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black uppercase tracking-widest border border-amber-200 shadow-lg shadow-amber-500/60 whitespace-nowrap z-30 flex items-center space-x-1 animate-pulse">
                          <span>📍</span>
                          <span>YOU ARE HERE</span>
                        </span>
                      )}

                      <div className={`rounded-full overflow-hidden border-2 transition-all duration-300 relative flex items-center justify-center bg-slate-900 ${
                        isCurrent 
                          ? 'w-14 h-14 sm:w-16 sm:h-16 border-amber-400 ring-4 ring-amber-400/70 shadow-[0_0_30px_rgba(245,158,11,0.85)] scale-110' 
                          : 'w-9 h-9 sm:w-10 sm:h-10 border-white/30 hover:border-amber-300 hover:scale-110 grayscale-[30%] hover:grayscale-0'
                      }`}>
                        <img 
                          src={cityImages[item.id]} 
                          alt={`${item.name} timeline node - ${item.id === 'krakow' ? "Rynek Główny Christmas Market" : "Christmas Market"}`} 
                          className="w-full h-full object-cover" 
                          loading="lazy"
                          decoding="async"
                        />
                        {isCurrent && (
                          <div className="absolute inset-0 bg-amber-400/20 ring-2 ring-amber-300 ring-inset"></div>
                        )}
                      </div>

                      <span className={`mt-1.5 tracking-tight ${
                        isCurrent 
                          ? 'text-amber-300 text-sm font-black drop-shadow-[0_2px_8px_rgba(245,158,11,0.7)] underline decoration-amber-400 decoration-2 underline-offset-4' 
                          : 'text-slate-400 text-xs font-bold group-hover:text-white'
                      }`}>
                        {item.name}
                      </span>
                    </a>

                    {/* Crisp Vector Train Badge Riding ON the Track */}
                    {!isLast && (
                      <div className="relative z-10 flex items-center justify-center shrink-0">
                        <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-amber-300 shadow-md shadow-amber-500/30 flex items-center space-x-1 font-black transform hover:scale-105 transition-all">
                          <Train className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
                          <span className="text-[9px] sm:text-[10px] font-black tracking-wider uppercase text-slate-950">TRAIN</span>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Sub-Header Toolbar (Opens Dedicated Sub-Pages & Stays Sticky at Top) */}
      <div className="sticky top-14 z-30 py-2.5 bg-slate-950/95 backdrop-blur-xl border-y border-amber-500/30 w-full shadow-xl">
        <div className="p-1.5 rounded-xl border border-amber-500/20 !bg-slate-900/90 shadow-md flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar no-overscroll-x">
          <a
            href={baseUrl}
            onClick={(e) => handleSubPageTabClick(e, baseUrl)}
            className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
              activeSubPage === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-wf-cream hover:text-white hover:bg-white/10'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Overview</span>
          </a>

          {city.historyEpochs && city.historyEpochs.length > 0 && (
            <a
              href={`${baseUrl}/history`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/history`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'history'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>History & Timeline</span>
            </a>
          )}

          {city.markets && city.markets.length > 0 && (
            <a
              href={`${baseUrl}/markets`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/markets`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'markets'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Christmas Markets</span>
            </a>
          )}

          {city.mustSee && city.mustSee.length > 0 && (
            <a
              href={`${baseUrl}/attractions`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/attractions`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'attractions'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Must-See Sights</span>
            </a>
          )}

          {city.restaurants && city.restaurants.length > 0 && (
            <a
              href={`${baseUrl}/restaurants`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/restaurants`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'restaurants'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Food & Drink</span>
            </a>
          )}

          {city.nights > 0 && (
            <a
              href={`${baseUrl}/hotels`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/hotels`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'hotels'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Bed className="w-3.5 h-3.5" />
              <span>Lodging & Stays</span>
            </a>
          )}

          {city.lgbtq && (
            <a
              href={`${baseUrl}/lgbtq`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/lgbtq`)}
              className={`px-3 py-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 shrink-0 min-h-[44px] sm:min-h-0 ${
                activeSubPage === 'lgbtq'
                  ? 'bg-purple-600 text-white shadow-sm font-bold ring-2 ring-purple-400/50'
                  : 'text-purple-300 hover:text-purple-100 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/30" />
              <span>LGBTQ+ Guide</span>
            </a>
          )}
        </div>
      </div>

      {/* 2-Column Split Hero Section: Left (High-level details & text), Right (Main Picture) */}
      {activeSubPage === 'lgbtq' && city.lgbtq ? (
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-purple-500/30 bg-wf-navy-mid/95 shadow-2xl flex flex-col lg:flex-row items-stretch gap-6">
          {/* Left Column: LGBTQ+ Specific Focus & Text */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
                  <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/40" />
                  <span>LGBTQ+ Traveler's Guide</span>
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-white/10 text-wf-cream text-xs font-medium">
                  {city.lgbtq.primaryArea?.split('(')[0]?.trim() || city.name}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white flex items-center space-x-3 tracking-tight">
                <Heart className="w-8 h-8 sm:w-10 sm:h-10 text-pink-400 fill-pink-400/30 shrink-0" />
                <span>LGBTQ+ {city.name}</span>
              </h1>

              <div className="space-y-1.5 pt-1">
                <div className="text-purple-300 text-xs font-bold uppercase tracking-widest">Queer Atmosphere & Culture</div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                  {city.lgbtq.subtitle}
                </p>
              </div>

              <div className="text-xs text-pink-400/90 font-semibold flex items-center space-x-1.5 pt-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{city.lgbtq.primaryArea || city.name}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center space-x-2">
              <span className="font-bold text-purple-300">Key Hub:</span>
              <span className="truncate">{city.lgbtq.landmark || city.name}</span>
            </div>
          </div>

          {/* Right Column: LGBTQ+ Photo */}
          <CityHeroImageCard
            imageSrc={city.lgbtq.imageUrl ? getAttractionImage(city.lgbtq.imageUrl, '', city.id) : cityImages[city.id]}
            alt={`LGBTQ+ ${city.name} - ${city.lgbtq.landmark || city.name}`}
            location={city.lgbtq.primaryArea || city.name}
            landmark={city.lgbtq.landmark || city.name}
            description={city.lgbtq.landmarkDescription || city.lgbtq.overview}
            isLgbtq={true}
            heightClass="h-64 sm:h-80"
          />
        </div>
      ) : (
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 shadow-2xl flex flex-col lg:flex-row items-stretch gap-6">
          {/* Left Column: High-Level Details & Text */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
                  <span>🎄</span>
                  <span>Christmas Market Destination</span>
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-white/10 text-wf-cream text-xs font-medium">
                  {city.nights > 0 ? `${city.nights} Nights` : 'Day Stop'}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white flex items-center space-x-3 tracking-tight">
                <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-amber-400 shrink-0" />
                <span>{city.name}</span>
              </h1>

              <div className="space-y-1.5 pt-1">
                <div className="text-amber-300 text-xs font-bold uppercase tracking-widest">Trip Focus</div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                  {city.focus}
                </p>
              </div>

              {city.imageDetails?.location && (
                <div className="text-xs text-amber-400/90 font-semibold flex items-center space-x-1.5 pt-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{city.imageDetails.location}</span>
                </div>
              )}
            </div>

            {city.imageDetails?.landmark && (
              <div className="pt-3 border-t border-white/10 text-xs text-slate-300 flex items-center space-x-2">
                <span className="font-bold text-amber-300">Key Landmark:</span>
                <span className="truncate">{city.imageDetails.landmark}</span>
              </div>
            )}
          </div>

          {/* Right Column: Main Picture */}
          <CityHeroImageCard
            imageSrc={cityImages[city.id]}
            alt={`${city.name} - ${city.id === 'krakow' ? "Rynek Główny Christmas Market" : city.name}`}
            location={city.imageDetails?.location}
            landmark={city.imageDetails?.landmark}
            description={city.imageDetails?.description}
            isLgbtq={false}
            heightClass="h-72 sm:h-96"
          />
        </div>
      )}

      {/* RENDER DEDICATED SUB-PAGE CONTENT */}
      <div ref={subPageSectionRef} className="space-y-8">
        {activeSubPage === 'overview' && (
          <CityOverviewTab
            city={city}
            baseUrl={baseUrl}
            handleSubPageTabClick={handleSubPageTabClick}
            mapUrl={mapUrl}
            exchangeRates={exchangeRates}
          />
        )}

        {activeSubPage === 'history' && (
          <CityHistoryTab
            city={city}
            activeEpochTab={activeEpochTab}
            setActiveEpochTab={setActiveEpochTab}
          />
        )}

        {activeSubPage === 'markets' && (
          <CityMarketsTab
            city={city}
            activeMarketTab={activeMarketTab}
            setActiveMarketTab={setActiveMarketTab}
            savedItems={savedItems}
            toggleItinerary={toggleItinerary}
            isAuthenticated={isAuthenticated}
          />
        )}

        {activeSubPage === 'attractions' && (
          <CityAttractionsTab city={city} />
        )}

        {activeSubPage === 'restaurants' && (
          <CityFoodTab
            city={city}
            restaurantCategoryFilter={restaurantCategoryFilter}
            setRestaurantCategoryFilter={setRestaurantCategoryFilter}
            savedItems={savedItems}
            toggleItinerary={toggleItinerary}
            isAuthenticated={isAuthenticated}
          />
        )}

        {activeSubPage === 'hotels' && (
          <CityHotelsTab
            city={city}
            savedItems={savedItems}
            toggleItinerary={toggleItinerary}
            isAuthenticated={isAuthenticated}
          />
        )}

        {activeSubPage === 'lgbtq' && (
          <CityLgbtqTab
            city={city}
            lgbtqCategoryFilter={lgbtqCategoryFilter}
            setLgbtqCategoryFilter={setLgbtqCategoryFilter}
            savedItems={savedItems}
            toggleItinerary={toggleItinerary}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
    </div>
  );
}

export default CityPage;
