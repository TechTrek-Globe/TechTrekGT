import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Utensils, Bed, ArrowLeft, ArrowRight, Bus, Train, ShoppingBag, Sparkles, Landmark, Compass, DollarSign, Info, Map, Clock, Navigation, Gift, Lightbulb, Video, ExternalLink, Thermometer, CreditCard, Award, RefreshCw, AlertTriangle, CalendarX, Coins, Coffee, Sun, Volume2, Crown, BookOpen, Scroll, Flame, ShieldCheck, Heart } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { cityImages, marketImages } from '../utils/cityImages';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { MustSeeCard } from './MustSeeCard';

function QuickReferenceBar({ city }) {
  const quick = city.quickReference || {
    dates: city.dates,
    daylight: 'Sunrise ~7:30 AM | Sunset ~3:30 PM (~8 hrs daylight)',
    peakHours: '5:30 PM - 8:00 PM (Dusk illuminations & caroling)',
    kaucja: `${city.kaucja} deposit per mug`
  };

  const kaucjaDeposit = typeof city.kaucjaCallout === 'object' ? city.kaucjaCallout.deposit : (city.kaucja || '20-30 PLN');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Market Dates</span>
        </div>
        <p className="text-xs sm:text-sm text-white font-bold leading-snug">
          {quick.dates}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
          <Sun className="w-4 h-4 shrink-0" />
          <span>Daylight & Sunset</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-snug font-medium">
          {quick.daylight}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Peak Atmosphere</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-snug font-medium">
          {quick.peakHours}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-400/50 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
          <Coffee className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Mug Deposit (Kaucja)</span>
        </div>
        <p className="text-xs sm:text-sm text-amber-100/90 leading-snug font-medium">
          {kaucjaDeposit} deposit per mug. <strong className="text-amber-300">EXACT CASH REQUIRED</strong> for deposit.
        </p>
      </div>
    </div>
  );
}

function CulinaryHighlightsSection({ highlights }) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-1">
            <Utensils className="w-4 h-4" />
            <span>Authentic Market Flavors</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Culinary Highlights & Pronunciation Guide</h2>
        </div>
        <span className="text-xs text-slate-400 font-medium">Phonetics included for easy ordering</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {highlights.map((item, idx) => (
          <div key={idx} className="glass-panel p-6 rounded-3xl border border-amber-500/20 hover:border-amber-500/50 bg-wf-navy-mid/90 transition-all flex flex-col justify-between group shadow-lg">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition-colors leading-snug">
                  {item.name}
                </h3>
                <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold shrink-0 flex items-center space-x-1">
                  <Volume2 className="w-3 h-3 text-amber-400" />
                  <span>Pronunciation</span>
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-xs text-amber-300 tracking-wide flex items-center space-x-2">
                <span className="text-slate-500 select-none">🗣️</span>
                <span className="font-semibold">{item.phonetic}</span>
              </div>

              <div className="text-xs font-bold text-amber-400/90 uppercase tracking-wider">
                {item.english}
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                {item.description}
              </p>
            </div>

            {item.tip && (
              <div className="mt-4 pt-3 border-t border-white/10 text-xs text-emerald-300 flex items-start space-x-2">
                <span className="shrink-0 mt-0.5">💡</span>
                <span className="leading-snug">{item.tip}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CityPage({ cityId, subPage = 'overview' }) {
  const [activeMarketTab, setActiveMarketTab] = useState(0);
  const [activeEpochTab, setActiveEpochTab] = useState('all');
  const exchangeRates = useExchangeRate();
  const subPageSectionRef = useRef(null);

  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const scrollToSubPageArea = () => {
    if (subPageSectionRef.current) {
      const yOffset = -120; // Accounts for sticky layout top bar (56px) + sticky sub-toolbar (~50px) + breathing space
      const element = subPageSectionRef.current;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  const handleSubPageTabClick = (e, path) => {
    e.preventDefault();
    pushRoute(e, path);
    setTimeout(scrollToSubPageArea, 30);
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
      : (['restaurants', 'food', 'dining', 'top-restaurants'].includes(subPage)
        ? 'restaurants'
        : (['markets', 'market', 'christmas-markets'].includes(subPage)
          ? 'markets'
          : (['hotels', 'stays', 'base'].includes(subPage)
            ? 'hotels'
            : 'overview'))));

  useEffect(() => {
    if (activeSubPage && activeSubPage !== 'overview') {
      const scrollTimer = setTimeout(scrollToSubPageArea, 60);
      return () => clearTimeout(scrollTimer);
    }
  }, [activeSubPage, cityId]);

  // OpenStreetMap embed bbox for Kraków or generic fallback
  const mapUrl = cityId === 'krakow'
    ? "https://www.openstreetmap.org/export/embed.html?bbox=19.9200%2C50.0450%2C19.9650%2C50.0700&amp;layer=mapnik&amp;marker=50.0614%2C19.9366"
    : "https://www.openstreetmap.org/export/embed.html?bbox=16.9000%2C51.1000%2C17.1000%2C51.1300&amp;layer=mapnik";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Navigation Header with Horizontal Trail Track Chart (07:48 Version) */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Back Button */}
          <a 
            href="/wayfinder/poland-christmas-2026" 
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} 
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-sm border border-amber-500/40 hover:border-amber-400 transition-all duration-300 shadow-lg shadow-amber-900/30 hover:shadow-amber-500/30 hover:scale-105 shrink-0 group self-start lg:self-auto"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Poland Journey Overview</span>
          </a>

          {/* Prominent Wide Horizontal Trail Track Chart */}
          <div className="flex-1 glass-panel px-5 py-4 rounded-2xl border-2 border-amber-500/40 bg-wf-navy-mid/95 backdrop-blur-xl shadow-2xl flex items-center justify-between min-w-0 overflow-x-auto no-scrollbar">
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

      {/* 2-Column Split Hero Section: Left (High-level details & text), Right (Main Picture) */}
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

        {/* Right Column: Main Picture with Hover Overlay */}
        <div className="w-full lg:w-7/12 h-64 sm:h-80 rounded-2xl overflow-hidden relative bg-slate-950 border border-amber-500/30 shadow-inner group shrink-0">
          <img 
            src={cityImages[city.id]} 
            alt={`${city.name} - ${city.id === 'krakow' ? "Rynek Główny Christmas Market" : city.name}`} 
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/30 to-transparent"></div>

          {/* Detailed Hover Overlay */}
          <div className="absolute inset-0 bg-wf-navy/95 p-6 sm:p-8 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-md z-20">
            <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-2">
              <MapPin className="w-4 h-4" />
              <span>{city.imageDetails?.location}</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white mb-2">
              🏛️ {city.imageDetails?.landmark}
            </div>
            <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
              {city.imageDetails?.description}
            </p>
          </div>

          <div className="absolute bottom-4 left-4 right-4 group-hover:opacity-0 transition-opacity duration-300">
            <div className="bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 shadow-lg flex items-center justify-between">
              <span className="text-xs text-amber-300 font-bold flex items-center space-x-1.5 truncate">
                <span>🏛️</span>
                <span className="truncate">{city.imageDetails?.landmark}</span>
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold shrink-0 ml-2">Hover for details</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Sub-Header Toolbar (Opens Dedicated Sub-Pages) */}
      <div className="sticky top-14 z-40 py-2 bg-slate-950/95 backdrop-blur-xl border-b border-amber-500/20 w-full">
        <div className="p-1.5 rounded-xl border border-amber-500/20 !bg-slate-900/90 shadow-md flex flex-wrap items-center gap-1.5 sm:gap-2">
          <a
            href={baseUrl}
            onClick={(e) => pushRoute(e, baseUrl)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
                activeSubPage === 'restaurants'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Top Restaurants</span>
            </a>
          )}

          <a
            href={`${baseUrl}/hotels`}
            onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/hotels`)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
              activeSubPage === 'hotels'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-wf-cream hover:text-white hover:bg-white/10'
            }`}
          >
            <Bed className="w-3.5 h-3.5" />
            <span>Base & Hotels</span>
          </a>

          {city.lgbtq && (
            <a
              href={`${baseUrl}/lgbtq`}
              onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/lgbtq`)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
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

      {/* RENDER DEDICATED SUB-PAGE CONTENT */}

      {/* 1. OVERVIEW SUB-PAGE (Main Page) */}
      {activeSubPage === 'overview' && (
        <div className="space-y-10 animate-fade-in">
          {city.history && (
            <section className="glass-panel p-6 sm:p-10 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 relative overflow-hidden shadow-2xl space-y-6">
              <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center space-x-3 tracking-tight">
                  <Landmark className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400" />
                  <span>Overview & Heritage of {city.name}</span>
                </h2>
                <span className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Royal Capital & UNESCO Inscription</span>
                </span>
              </div>

              {/* Historical Stats Grid */}
              {city.historyStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {city.historyStats.map((stat, idx) => (
                    <div key={idx} className="p-3 sm:p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-amber-500/40 transition-colors">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80 mb-1 flex items-center space-x-1.5">
                        {stat.icon === 'Crown' && <Crown className="w-3.5 h-3.5" />}
                        {stat.icon === 'Award' && <Award className="w-3.5 h-3.5" />}
                        {stat.icon === 'MapPin' && <MapPin className="w-3.5 h-3.5" />}
                        {stat.icon === 'Landmark' && <Landmark className="w-3.5 h-3.5" />}
                        <span>{stat.label}</span>
                      </div>
                      <div className="text-xs sm:text-sm font-black text-white leading-tight">
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Primary Overview Narrative */}
              <p className="text-wf-cream text-sm sm:text-base md:text-lg leading-relaxed font-medium">
                {city.history}
              </p>
            </section>
          )}

          {/* Quick-Jump Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {city.historyEpochs && city.historyEpochs.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <BookOpen className="w-4 h-4" />
                    <span>{city.historyEpochs.length} Historical Epochs</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                    Chronological Journey Through Time
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    Explore {city.name}'s thousand-year timeline from ancient foundations to royal golden eras, wartime resilience, and UNESCO heritage.
                  </p>
                </div>
                <a
                  href={`${baseUrl}/history`}
                  onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/history`)}
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>View Timeline Tab</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            )}

            {city.mustSee && city.mustSee.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    <span>{city.mustSee.length} Iconic Landmarks</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                    Must-See Attractions
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    Curated iconic sights and architectural landmarks in {city.name} selected for winter exploration.
                  </p>
                </div>
                <a
                  href={`${baseUrl}/attractions`}
                  onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/attractions`)}
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>View All Sights</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            )}

            {city.restaurants && city.restaurants.length > 0 && (
              <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-wf-navy-mid to-slate-950 shadow-xl flex flex-col justify-between group hover:border-amber-400/50 transition-all">
                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <Utensils className="w-4 h-4" />
                    <span>{city.restaurants.length} Culinary Destinations</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                    Top Restaurants & Dining
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    Authentic Polish dining, regional delicacies, pierogarnias, and comforting winter culinary destinations in {city.name}.
                  </p>
                </div>
                <a
                  href={`${baseUrl}/restaurants`}
                  onClick={(e) => handleSubPageTabClick(e, `${baseUrl}/restaurants`)}
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all transform hover:scale-[1.02] shadow-lg shadow-amber-500/20 cursor-pointer self-start"
                >
                  <Utensils className="w-4 h-4" />
                  <span>View Restaurants</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            )}
          </div>

          {/* Transit & Interactive City Map */}
          <section className="space-y-6">
            <h2 className="text-3xl font-black text-white flex items-center space-x-3">
              <Map className="w-7 h-7 text-wf-blue-lt" />
              <span>City Map & Transit Guide</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Transit Breakdown Cards */}
              <div className="lg:col-span-1 space-y-4 flex flex-col justify-between">
                {city.transit ? (
                  <>
                    <div className="glass-panel p-5 rounded-2xl border border-wf-blue-lt/30 bg-wf-blue-lt/5">
                      <div className="flex items-center space-x-2 text-wf-blue-lt font-bold text-sm mb-2">
                        <Train className="w-5 h-5" />
                        <span>Airport Transfer</span>
                      </div>
                      <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.transit.airport}</p>
                    </div>

                    <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5">
                      <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm mb-2">
                        <Bus className="w-5 h-5" />
                        <span>Trams & Public Transit</span>
                      </div>
                      <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.transit.cityTransit}</p>
                    </div>

                    <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
                      <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm mb-2">
                        <Landmark className="w-5 h-5" />
                        <span>Central Train Station</span>
                      </div>
                      <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.transit.station}</p>
                    </div>
                  </>
                ) : (
                  <div className="glass-panel p-6 rounded-2xl border border-white/10">
                    <p className="text-sm text-wf-muted">Walkable historic center. Transit passes available via Jakdojade app.</p>
                  </div>
                )}
              </div>

              {/* Interactive Map */}
              <div className="lg:col-span-2 glass-panel p-4 rounded-3xl overflow-hidden border border-white/10 min-h-[340px] flex flex-col">
                <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-xs font-semibold text-wf-muted flex items-center space-x-1">
                    <Compass className="w-4 h-4 text-wf-blue-lt" />
                    <span>Interactive Navigation Map ({city.name})</span>
                  </span>
                  <span className="text-xs text-amber-400 font-medium">Use scroll to zoom</span>
                </div>
                <iframe 
                  title={`${city.name} Map`}
                  className="w-full h-80 sm:h-96 rounded-2xl border-0"
                  src={mapUrl}
                  loading="lazy"
                ></iframe>
              </div>
            </div>
          </section>

          {/* Practical Visitor Guide (Weather, Currency, Restrooms) */}
          {city.practical && (
            <section className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="text-2xl font-bold text-white flex items-center space-x-3">
                <Info className="w-6 h-6 text-amber-400" />
                <span>Practical Visitor Guide ({city.name})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-5 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-2">
                  <div className="flex items-center space-x-2 text-sky-400 font-bold text-sm">
                    <Thermometer className="w-5 h-5" />
                    <span>December Weather & Gear</span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.practical.weather}</p>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                      <CreditCard className="w-5 h-5" />
                      <span>Currency & Payment Rules</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Live Exchange Rates</span>
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.practical.currency}</p>
                  
                  {/* Live Exchange Rate Callout Box */}
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/20 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-amber-300 font-bold border-b border-white/10 pb-1.5">
                      <span>1 USD ≈ {exchangeRates.usdToPln} PLN</span>
                      <span>1 EUR ≈ {exchangeRates.eurToPln} PLN</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-300 font-medium">
                      <div className="flex justify-between">
                        <span className="text-slate-400">🚄 Airport SKA1 Train:</span>
                        <span className="font-bold text-amber-200">17 PLN (~${(17 / exchangeRates.usdToPln).toFixed(2)} USD)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">🚃 24-hr Tram Pass:</span>
                        <span className="font-bold text-amber-200">17 PLN (~${(17 / exchangeRates.usdToPln).toFixed(2)} USD)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">🎫 72-hr Tram Pass:</span>
                        <span className="font-bold text-amber-200">50 PLN (~${(50 / exchangeRates.usdToPln).toFixed(2)} USD)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">☕ Mug Deposit (Kaucja):</span>
                        <span className="font-bold text-amber-200">20-30 PLN (~${(20 / exchangeRates.usdToPln).toFixed(2)}–${(30 / exchangeRates.usdToPln).toFixed(2)} USD)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                    <Navigation className="w-5 h-5" />
                    <span>Public Restrooms (WC)</span>
                  </div>
                  <p className="text-xs sm:text-sm text-wf-cream leading-relaxed">{city.practical.restrooms}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* 2. CHRONOLOGICAL HISTORY SUB-PAGE */}
      {activeSubPage === 'history' && city.history && (
        <div ref={subPageSectionRef} id="chronological-history-section" className="space-y-8 animate-fade-in scroll-mt-32">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-black text-white flex items-center space-x-3">
              <BookOpen className="w-7 h-7 text-amber-400" />
              <span>Chronological History & Heritage of {city.name}</span>
            </h2>
            <span className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider">
              1,000+ Years Living Timeline
            </span>
          </div>

          <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 relative overflow-hidden shadow-2xl space-y-6">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            {/* Historical Stats Grid */}
            {city.historyStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {city.historyStats.map((stat, idx) => (
                  <div key={idx} className="p-3 sm:p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-amber-500/40 transition-colors">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80 mb-1 flex items-center space-x-1.5">
                      {stat.icon === 'Crown' && <Crown className="w-3.5 h-3.5" />}
                      {stat.icon === 'Award' && <Award className="w-3.5 h-3.5" />}
                      {stat.icon === 'MapPin' && <MapPin className="w-3.5 h-3.5" />}
                      {stat.icon === 'Landmark' && <Landmark className="w-3.5 h-3.5" />}
                      <span>{stat.label}</span>
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white leading-tight">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Narrative Overview */}
            <p className="text-wf-cream text-sm sm:text-base md:text-lg leading-relaxed font-medium">
              {city.history}
            </p>
          </div>

          {/* Chronological Historical Epochs Timeline */}
          {city.historyEpochs && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                  <BookOpen className="w-5 h-5" />
                  <span>Chronological Journey Through Time</span>
                </div>

                {/* Filterable Era Tabs */}
                <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-1">
                  <button
                    onClick={() => setActiveEpochTab('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                      activeEpochTab === 'all'
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                        : 'bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-amber-400/40'
                    }`}
                  >
                    All Historical Eras ({city.historyEpochs.length})
                  </button>
                  {city.historyEpochs.map((epoch, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveEpochTab(idx)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        activeEpochTab === idx
                          ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                          : 'bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-amber-400/40'
                      }`}
                    >
                      {epoch.era}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {city.historyEpochs
                  .filter((_, idx) => activeEpochTab === 'all' || activeEpochTab === idx)
                  .map((epoch) => {
                    const originalIdx = city.historyEpochs.indexOf(epoch);
                    return (
                      <div 
                        key={originalIdx} 
                        className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 hover:border-amber-400 bg-wf-navy/90 backdrop-blur-md transition-all group"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center space-x-3">
                            <span className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-300 font-black text-sm flex items-center justify-center border border-amber-400/40 shrink-0">
                              {originalIdx + 1}
                            </span>
                            <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-amber-300 transition-colors">
                              {epoch.title}
                            </h3>
                          </div>
                          <span className="inline-block px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-400 text-xs font-black self-start sm:self-auto shrink-0">
                            {epoch.era}
                          </span>
                        </div>

                        {epoch.subtitle && (
                          <div className="text-xs sm:text-sm font-semibold text-amber-200/90 mb-2 pl-11">
                            {epoch.subtitle}
                          </div>
                        )}

                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed pl-11">
                          {epoch.description}
                        </p>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Living Folklore & Cultural Traditions */}
          {city.historyLegends && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                <Sparkles className="w-5 h-5" />
                <span>Living Folklore & Cultural Traditions</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {city.historyLegends.map((legend, idx) => (
                  <div 
                    key={idx} 
                    className="glass-panel p-5 sm:p-6 rounded-2xl border border-amber-500/20 hover:border-amber-400/50 bg-wf-navy/90 flex flex-col justify-between transition-all"
                  >
                    <div>
                      <div className="text-2xl mb-2.5">{legend.icon}</div>
                      <h4 className="text-sm sm:text-base font-black text-white mb-2 leading-snug">
                        {legend.title}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                        {legend.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. CHRISTMAS MARKETS SUB-PAGE */}
      {activeSubPage === 'markets' && city.markets && (
        <div ref={subPageSectionRef} id="markets-section" className="space-y-6 animate-fade-in scroll-mt-32">
          {/* Quick Reference Stats Bar */}
          <QuickReferenceBar city={city} />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-1">
                <Sparkles className="w-4 h-4" />
                <span>Dedicated Market Guide</span>
              </div>
              <h2 className="text-3xl font-black text-white">Christmas Markets in {city.name}</h2>
            </div>

            {/* Compact Embedded 4K Walking Tour Mini-Player (Krakow) */}
            {city.id === 'krakow' && (
              <div className="w-44 sm:w-48 md:w-52 shrink-0 rounded-xl overflow-hidden border border-amber-500/30 bg-slate-950 shadow-lg shadow-amber-950/30 group">
                <div className="relative w-full aspect-video">
                  <iframe
                    src="https://www.youtube-nocookie.com/embed/DUFYxovB_80"
                    title="4K Krakow Christmas Market Walking Tour"
                    className="absolute inset-0 w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  ></iframe>
                </div>
                <div className="px-2.5 py-1 bg-wf-navy-mid/95 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <Video className="w-3 h-3 text-red-400" />
                    <span>4K Walking Tour</span>
                  </span>
                  <a
                    href="https://www.youtube.com/watch?v=DUFYxovB_80"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-400 hover:text-white flex items-center space-x-1 transition-colors"
                    title="Open on YouTube"
                  >
                    <span>YouTube</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Sub-Tabs for individual markets */}
          <div className="sticky top-[112px] z-30 py-2 bg-slate-950/95 backdrop-blur-xl -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b-2 border-emerald-500/30 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              {/* Distinct Section Label */}
              <div className="flex items-center space-x-2 shrink-0 text-amber-400 font-black text-xs uppercase tracking-wider px-1">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <span>Explore Markets:</span>
              </div>

              {/* Separate, Prominent Pill Buttons */}
              <div className="flex items-center justify-start overflow-x-auto no-scrollbar gap-2.5 sm:gap-3 py-1 flex-1 min-w-0">
                {city.markets.map((market, idx) => {
                  const isActive = activeMarketTab === idx;
                  return (
                    <button
                      key={market.id}
                      onClick={() => setActiveMarketTab(idx)}
                      className={`px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition-all duration-300 flex items-center space-x-2 whitespace-nowrap shrink-0 border ${
                        isActive
                          ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/30 scale-102 ring-2 ring-amber-400/40'
                          : 'bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-100 border-emerald-500/50 hover:border-amber-400/60 shadow-md'
                      }`}
                    >
                      <span className="text-base">{isActive ? '🎄' : '⛺'}</span>
                      <span>{market.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Market Details Card */}
          {city.markets[activeMarketTab] && (() => {
            const currentMarket = city.markets[activeMarketTab];
            const marketImg = marketImages[currentMarket.id];

            return (
              <div className="glass-panel rounded-3xl border border-amber-500/30 overflow-hidden shadow-2xl bg-amber-500/5 space-y-6">
                {/* Market Specific Picture Header */}
                {marketImg && (
                  <div className="w-full h-64 sm:h-80 relative overflow-hidden group">
                    <img 
                      src={marketImg} 
                      alt={currentMarket.name} 
                      className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/40 to-transparent"></div>
                    <div className="absolute bottom-6 left-6 right-6">
                      <span className="px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                        📍 {currentMarket.location}
                      </span>
                      <h3 className="text-3xl sm:text-4xl font-black text-white mt-2 drop-shadow-md">
                        {currentMarket.name}
                      </h3>
                    </div>
                  </div>
                )}

                <div className="p-6 sm:p-8 space-y-6">
                  {/* Hours & Address quick bar */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentMarket.hours && (
                      <div className="p-4 rounded-2xl bg-wf-navy-mid/90 border border-amber-500/20 flex items-start space-x-3">
                        <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block mb-0.5">Operating Hours</span>
                          <span className="text-sm font-semibold text-white">{currentMarket.hours}</span>
                        </div>
                      </div>
                    )}

                    {currentMarket.address && (
                      <div className="p-4 rounded-2xl bg-wf-navy-mid/90 border border-amber-500/20 flex items-start space-x-3">
                        <Navigation className="w-5 h-5 text-wf-blue-lt shrink-0 mt-0.5" />
                        <div>
                          <span className="text-wf-blue-lt text-xs font-bold uppercase tracking-wider block mb-0.5">Location & Transit</span>
                          <span className="text-sm font-medium text-wf-cream">{currentMarket.address}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Primary Specialty & Atmosphere */}
                  <div className="p-5 rounded-2xl bg-wf-navy-mid/80 border border-white/5 space-y-3">
                    <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block">⭐ Specialties & Atmosphere</span>
                    <p className="text-white font-bold text-base sm:text-lg leading-snug">
                      {currentMarket.specialty}
                    </p>
                    <p className="text-wf-cream text-sm sm:text-base leading-relaxed">
                      {currentMarket.details}
                    </p>
                  </div>

                  {/* Must-Try & Souvenirs Grids */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {currentMarket.mustTry && (
                      <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <h4 className="text-amber-300 font-bold text-sm uppercase tracking-wider mb-3 flex items-center space-x-2">
                          <Utensils className="w-4 h-4 text-amber-400" />
                          <span>Must-Try Food & Drinks</span>
                        </h4>
                        <ul className="space-y-2">
                          {currentMarket.mustTry.map((item, i) => (
                            <li key={i} className="text-sm text-wf-cream flex items-center space-x-2">
                              <span className="text-amber-400 text-xs">🍢</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {currentMarket.souvenirs && (
                      <div className="p-5 rounded-2xl bg-wf-blue-lt/10 border border-wf-blue-lt/20">
                        <h4 className="text-wf-blue-lt font-bold text-sm uppercase tracking-wider mb-3 flex items-center space-x-2">
                          <Gift className="w-4 h-4 text-wf-blue-lt" />
                          <span>Top Souvenirs & Crafts</span>
                        </h4>
                        <ul className="space-y-2">
                          {currentMarket.souvenirs.map((item, i) => (
                            <li key={i} className="text-sm text-wf-cream flex items-center space-x-2">
                              <span className="text-wf-blue-lt text-xs">🎁</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* UNESCO Cultural Tradition Callout */}
                  {currentMarket.unescoTradition && (
                    <div className="p-4.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-start space-x-3 shadow-lg shadow-amber-950/20">
                      <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block mb-0.5">🏆 UNESCO Heritage Tradition</span>
                        <p className="text-xs sm:text-sm text-amber-100 font-medium leading-relaxed">{currentMarket.unescoTradition}</p>
                      </div>
                    </div>
                  )}

                  {/* Insider Tips Callout */}
                  {currentMarket.tips && (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-3">
                      <Lightbulb className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider block mb-0.5">💡 Helpful Insider Tip</span>
                        <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed">{currentMarket.tips}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}


        </div>
      )}

      {/* 3. MUST-SEE ATTRACTIONS SUB-PAGE */}
      {activeSubPage === 'attractions' && city.mustSee && (
        <div ref={subPageSectionRef} id="attractions-section" className="space-y-6 animate-fade-in scroll-mt-32">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-black text-white flex items-center space-x-3">
              <Sparkles className="w-7 h-7 text-amber-400" />
              <span>Must-See Attractions in {city.name}</span>
            </h2>
            <span className="text-xs text-wf-muted font-medium">Curated Golden Component template</span>
          </div>

          <div 
            className="grid gap-6 items-stretch"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
          >
            {city.mustSee.map((sight, idx) => (
              <MustSeeCard
                key={idx}
                imageSrc={sight.imageSrc || sight.imageUrl}
                title={sight.title || sight.name}
                category={sight.category}
                description={sight.description}
                locationData={sight.locationData || sight.location}
                costData={sight.costData || sight.pricing}
                hoursData={sight.hoursData || sight.openTimes}
                howToGetThere={sight.howToGetThere}
                daysClosed={sight.daysClosed}
                cityName={city.name}
                sight={sight}
              />
            ))}
          </div>
        </div>
      )}

      {/* 4. TOP RESTAURANTS SUB-PAGE */}
      {activeSubPage === 'restaurants' && city.restaurants && (
        <div ref={subPageSectionRef} id="restaurants-section" className="space-y-6 animate-fade-in scroll-mt-32">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-black text-white flex items-center space-x-3">
              <Utensils className="w-7 h-7 text-amber-400" />
              <span>Top Restaurants & Dining</span>
            </h2>
            <span className="text-xs text-wf-muted font-medium">Curated local recommendations</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {city.restaurants.map((rest, idx) => (
              <div key={idx} className="glass-panel p-7 rounded-3xl border border-white/10 hover:border-amber-500/30 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white">{rest.name}</h3>
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs">
                      {rest.price}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-amber-400 mb-3">{rest.cuisine}</div>

                  <div className="p-3.5 rounded-2xl bg-wf-navy-mid/90 border border-white/5 mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-wf-muted block mb-1">🍽️ Signature Dishes</span>
                    <p className="text-sm font-medium text-wf-cream">{rest.signature}</p>
                  </div>

                  <p className="text-xs text-wf-muted leading-relaxed">
                    💡 <span className="font-medium text-wf-cream">Vibe & Notes:</span> {rest.notes}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. BASE & HOTELS SUB-PAGE */}
      {activeSubPage === 'hotels' && (
        <div ref={subPageSectionRef} id="hotels-section" className="space-y-6 animate-fade-in scroll-mt-32">
          <div className="glass-panel border-wf-evergreen/30 p-8 rounded-3xl bg-wf-evergreen/5">
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center space-x-3">
              <Bed className="w-6 h-6 text-wf-evergreen" />
              <span>Recommended Base & Hotels in {city.name}</span>
            </h3>
            <p className="text-wf-cream font-semibold text-lg mb-4">{city.base}</p>
            {city.hotels.length > 0 && (
              <ul className="space-y-3">
                {city.hotels.map((hotel, idx) => (
                  <li key={idx} className="text-sm text-wf-cream flex items-start space-x-2">
                    <span className="text-wf-evergreen font-bold">•</span>
                    <span>{hotel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 6. LGBTQ+ GUIDE SUB-PAGE */}
      {activeSubPage === 'lgbtq' && city.lgbtq && (
        <div ref={subPageSectionRef} id="lgbtq-section" className="space-y-10 animate-fade-in scroll-mt-32">
          {/* Header Banner */}
          <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-purple-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-2xl space-y-6">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-purple-500/20 via-pink-500/10 to-transparent rounded-full blur-3xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 text-xs font-black uppercase tracking-wider shadow-sm">
                  <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/40" />
                  <span>LGBTQ+ Traveler's Guide</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {city.lgbtq.title}
                </h2>
                <p className="text-sm sm:text-base text-purple-200/90 font-medium leading-relaxed">
                  {city.lgbtq.subtitle}
                </p>
              </div>

              {city.lgbtq.imageUrl && (
                <div className="w-full md:w-80 h-48 rounded-2xl overflow-hidden border border-white/10 shadow-xl shrink-0 relative group">
                  <img
                    src={city.lgbtq.imageUrl}
                    alt="LGBTQ+ Kraków Kazimierz"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-2.5 left-3 text-[11px] font-bold text-white flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-pink-400" />
                    <span>Father Bernatek Footbridge & Kazimierz</span>
                  </div>
                </div>
              )}
            </div>

            {/* Overview Box */}
            <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-2 relative z-10">
              <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Atmosphere, Safety & Legal Context</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                {city.lgbtq.overview}
              </p>
            </div>
          </div>

          {/* 1. Queer-Welcoming Christmas Markets */}
          {city.lgbtq.christmasMarkets && city.lgbtq.christmasMarkets.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-pink-400 font-black text-xs uppercase tracking-wider">
                <ShoppingBag className="w-4 h-4" />
                <span>Inclusive Christmas Markets & Craft Fairs</span>
              </div>
              <h3 className="text-2xl font-black text-white">Queer-Welcoming Holiday Markets</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {city.lgbtq.christmasMarkets.map((market, idx) => (
                  <div key={idx} className="glass-panel p-6 rounded-3xl border border-pink-500/30 bg-wf-navy-mid/90 hover:border-pink-400/60 transition-all flex flex-col justify-between shadow-xl">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xl font-black text-white">{market.name}</h4>
                        <span className="px-2.5 py-1 rounded-full bg-pink-500/20 border border-pink-400/30 text-pink-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                          {market.type}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-purple-300">✨ {market.vibe}</div>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                        {market.description}
                      </p>
                    </div>
                    <div className="pt-3 mt-4 border-t border-white/10 text-xs font-semibold text-amber-300 flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{market.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2. Gay Clubs & Bars */}
          {city.lgbtq.barsAndClubs && city.lgbtq.barsAndClubs.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-purple-400 font-black text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Nightlife & Social Venues</span>
              </div>
              <h3 className="text-2xl font-black text-white">Gay Clubs & Queer-Friendly Bars</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {city.lgbtq.barsAndClubs.map((venue, idx) => (
                  <div key={idx} className="glass-panel p-6 rounded-3xl border border-purple-500/30 bg-wf-navy-mid/90 hover:border-purple-400/60 transition-all flex flex-col justify-between shadow-xl">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-lg font-black text-white">{venue.name}</h4>
                        <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-bold shrink-0">
                          {venue.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {venue.description}
                      </p>
                      <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-500/20 text-[11px] font-semibold text-purple-200">
                        🔥 {venue.vibe}
                      </div>
                    </div>
                    <div className="pt-3 mt-4 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>{venue.address}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. Inclusive Dining */}
          {city.lgbtq.restaurants && city.lgbtq.restaurants.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-amber-400 font-black text-xs uppercase tracking-wider">
                <Utensils className="w-4 h-4" />
                <span>Culinary & Café Culture</span>
              </div>
              <h3 className="text-2xl font-black text-white">LGBTQ+-Friendly Restaurants & Cafés</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {city.lgbtq.restaurants.map((rest, idx) => (
                  <div key={idx} className="glass-panel p-6 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 hover:border-amber-400/60 transition-all flex flex-col justify-between shadow-xl">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-lg font-black text-white">{rest.name}</h4>
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-bold shrink-0">
                          {rest.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">
                        {rest.description}
                      </p>
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 text-xs text-amber-200">
                        🍽️ <span className="font-bold text-amber-300">Highlights:</span> {rest.signature}
                      </div>
                    </div>
                    <div className="pt-3 mt-4 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{rest.address}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4. Must-See & Cultural Highlights */}
          {city.lgbtq.mustSee && city.lgbtq.mustSee.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2 text-sky-400 font-black text-xs uppercase tracking-wider">
                <Landmark className="w-4 h-4" />
                <span>Queer Culture & Landmarks</span>
              </div>
              <h3 className="text-2xl font-black text-white">Must-See LGBTQ+ Highlights</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {city.lgbtq.mustSee.map((spot, idx) => (
                  <div key={idx} className="glass-panel p-6 rounded-3xl border border-sky-500/30 bg-wf-navy-mid/90 space-y-3 shadow-xl">
                    <h4 className="text-base font-black text-white flex items-center space-x-2">
                      <span className="text-pink-400">♥</span>
                      <span>{spot.name}</span>
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {spot.description}
                    </p>
                    <div className="p-2 rounded-xl bg-sky-950/60 border border-sky-500/20 text-[11px] font-semibold text-sky-200">
                      💡 <span className="text-sky-300 font-bold">Local Tip:</span> {spot.tip}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

