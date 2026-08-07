import React, { useState } from 'react';
import { MapPin, Utensils, Bed, ArrowLeft, Bus, Train, ShoppingBag, Sparkles, Landmark, Compass, DollarSign, Info, Map, Clock, Navigation, Gift, Lightbulb } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { cityImages, marketImages, polandMapBg } from '../utils/cityImages';

export function CityPage({ cityId, subPage = 'overview' }) {
  const [activeMarketTab, setActiveMarketTab] = useState(0);

  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
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

  // OpenStreetMap embed bbox for Kraków or generic fallback
  const mapUrl = cityId === 'krakow'
    ? "https://www.openstreetmap.org/export/embed.html?bbox=19.9200%2C50.0450%2C19.9650%2C50.0700&amp;layer=mapnik&amp;marker=50.0614%2C19.9366"
    : "https://www.openstreetmap.org/export/embed.html?bbox=16.9000%2C51.1000%2C17.1000%2C51.1300&amp;layer=mapnik";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Top Header Section with Poland Map Route Overlay (Mockup Design) */}
      <div className="relative rounded-3xl overflow-hidden glass-panel border border-amber-500/30 p-6 sm:p-8 bg-wf-navy/90 shadow-2xl space-y-6">
        {/* Poland Map Background Image Overlay */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-40 mix-blend-screen">
          <img 
            src={polandMapBg} 
            alt="Poland Route Map" 
            className="w-full h-full object-cover object-center scale-105" 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-wf-navy via-wf-navy/60 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-transparent to-wf-navy/80"></div>
        </div>

        {/* Header Content */}
        <div className="relative z-10 flex flex-col md:flex-row items-start justify-between gap-6">
          {/* Back Button */}
          <a 
            href="/wayfinder/poland-christmas-2026" 
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} 
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-slate-950 font-bold text-sm border border-amber-500/40 hover:border-amber-400 transition-all duration-300 shadow-lg shadow-amber-900/30 hover:shadow-amber-500/30 hover:scale-105 group shrink-0"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Poland Overview</span>
          </a>

          {/* Interactive Geographic Route Map Nodes */}
          <div className="w-full md:w-auto flex-1 max-w-xl h-44 sm:h-48 relative border border-amber-500/20 rounded-2xl bg-wf-navy-mid/70 backdrop-blur-md p-3 overflow-hidden shadow-inner">
            {/* Background S-Curve Rail Track SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 500 180">
              <path 
                d="M 260 30 Q 280 60 270 70 T 200 95 T 230 135 T 325 145" 
                fill="none" 
                stroke="url(#trackGradient)" 
                strokeWidth="4" 
                strokeDasharray="6 3"
              />
              <path 
                d="M 260 30 Q 280 60 270 70 T 200 95 T 230 135 T 325 145" 
                fill="none" 
                stroke="#f59e0b" 
                strokeWidth="1.5" 
                opacity="0.6"
              />
              <defs>
                <linearGradient id="trackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity="1" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
                </linearGradient>
              </defs>
            </svg>

            {/* Glowing Golden Express Train on Track */}
            <div className="absolute top-[125px] left-[270px] z-10 animate-pulse flex items-center space-x-1 bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full shadow-lg shadow-amber-500/60 border border-amber-200">
              <Train className="w-3.5 h-3.5 fill-current" />
              <span className="text-[9px] font-black tracking-widest uppercase">EXPRESS</span>
            </div>

            {/* City Pin Nodes */}
            {polandJourney.route.map((item) => {
              const isCurrent = item.id === cityId;
              const itemUrl = `/wayfinder/poland-christmas-2026/cities/${item.id}`;

              // Map position coordinates
              const positions = {
                gdansk: 'top-[12px] left-[50%]',
                torun: 'top-[52px] left-[52%]',
                poznan: 'top-[75px] left-[35%]',
                wroclaw: 'top-[115px] left-[42%]',
                krakow: 'top-[125px] left-[62%]'
              };

              return (
                <a
                  key={item.id}
                  href={itemUrl}
                  onClick={(e) => pushRoute(e, itemUrl)}
                  className={`absolute z-20 flex flex-col items-center group cursor-pointer -translate-x-1/2 -translate-y-1/2 ${positions[item.id] || 'top-1/2 left-1/2'}`}
                >
                  <div className={`rounded-full overflow-hidden border-2 transition-all duration-300 relative flex items-center justify-center bg-slate-950 ${
                    isCurrent 
                      ? 'w-10 h-10 border-amber-400 ring-4 ring-amber-500/40 scale-110 shadow-xl shadow-amber-500/60' 
                      : 'w-7 h-7 border-white/40 hover:border-amber-300 hover:scale-110'
                  }`}>
                    <img 
                      src={cityImages[item.id]} 
                      alt={item.name} 
                      className="w-full h-full object-cover" 
                    />
                    {isCurrent && (
                      <div className="absolute inset-0 bg-amber-500/20 ring-2 ring-amber-400 ring-inset"></div>
                    )}
                  </div>
                  <span className={`text-[10px] sm:text-xs font-bold mt-0.5 tracking-tight ${
                    isCurrent ? 'text-amber-300 font-black drop-shadow-md' : 'text-wf-cream group-hover:text-white'
                  }`}>
                    {item.name}
                  </span>
                </a>
              );
            })}
          </div>
        </div>

        {/* Main City Title Row */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/10">
          <h1 className="text-4xl sm:text-5xl font-black text-white flex items-center space-x-3 tracking-tight">
            <MapPin className="w-9 h-9 text-amber-400" />
            <span>{city.name}</span>
          </h1>
          <div className="flex items-center space-x-3">
            <div className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-semibold">
              🎄 Christmas Market Destination
            </div>
            <div className="px-4 py-1.5 rounded-full bg-wf-navy-mid border border-white/10 text-wf-cream text-sm font-medium">
              {city.nights > 0 ? `${city.nights} Nights` : 'Day Stop'}
            </div>
          </div>
        </div>
      </div>

      {/* HIGHLIGHTS Banner Card (Mockup Design) */}
      <div className="w-full h-72 sm:h-96 rounded-3xl overflow-hidden relative bg-wf-navy-mid border border-amber-500/30 shadow-2xl shadow-amber-900/20 group">
        <img 
          src={cityImages[city.id]} 
          alt={city.name} 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-wf-navy/95 via-wf-navy/70 to-transparent"></div>

        {/* Highlights Text Content */}
        <div className="absolute inset-y-0 left-0 w-full md:w-3/4 p-6 sm:p-10 flex flex-col justify-center space-y-3 z-10">
          <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-amber-400">
            HIGHLIGHTS
          </span>
          <p className="text-xl sm:text-3xl font-bold text-white leading-snug drop-shadow-md">
            Discover Central Europe’s largest historic start: explore <strong className="text-amber-300">Rynek Główny</strong>, Wawel Royal Castle, and a beautiful Christmas market.
          </p>
        </div>

        {/* Detailed Hover Overlay */}
        <div className="absolute inset-0 bg-wf-navy/95 p-6 sm:p-10 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-md z-20">
          <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-2">
            <MapPin className="w-4 h-4" />
            <span>{city.imageDetails?.location}</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white mb-3">
            🏛️ {city.imageDetails?.landmark}
          </div>
          <p className="text-sm sm:text-base text-amber-100/90 leading-relaxed max-w-4xl">
            {city.imageDetails?.description}
          </p>
        </div>
      </div>

      {/* Top Sub-Header Toolbar (Opens Dedicated Sub-Pages) */}
      <div className="sticky top-4 z-40">
        <div className="glass-panel p-2 rounded-2xl border border-amber-500/30 bg-wf-navy/95 backdrop-blur-xl shadow-2xl flex items-center justify-start overflow-x-auto no-scrollbar gap-1.5 sm:gap-2">
          <a
            href={baseUrl}
            onClick={(e) => pushRoute(e, baseUrl)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
              subPage === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-wf-cream hover:text-white hover:bg-white/10'
            }`}
          >
            <Landmark className="w-4 h-4" />
            <span>Overview & History</span>
          </a>

          {city.markets && city.markets.length > 0 && (
            <a
              href={`${baseUrl}/markets`}
              onClick={(e) => pushRoute(e, `${baseUrl}/markets`)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
                subPage === 'markets'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Christmas Markets</span>
            </a>
          )}

          {city.mustSee && city.mustSee.length > 0 && (
            <a
              href={`${baseUrl}/attractions`}
              onClick={(e) => pushRoute(e, `${baseUrl}/attractions`)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
                subPage === 'attractions'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Must-See Sights</span>
            </a>
          )}

          {city.restaurants && city.restaurants.length > 0 && (
            <a
              href={`${baseUrl}/restaurants`}
              onClick={(e) => pushRoute(e, `${baseUrl}/restaurants`)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
                subPage === 'restaurants'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-wf-cream hover:text-white hover:bg-white/10'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Top Restaurants</span>
            </a>
          )}

          <a
            href={`${baseUrl}/hotels`}
            onClick={(e) => pushRoute(e, `${baseUrl}/hotels`)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center space-x-1.5 ${
              subPage === 'hotels'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-wf-cream hover:text-white hover:bg-white/10'
            }`}
          >
            <Bed className="w-4 h-4" />
            <span>Base & Hotels</span>
          </a>
        </div>
      </div>

      {/* RENDER DEDICATED SUB-PAGE CONTENT */}

      {/* 1. OVERVIEW & HISTORY SUB-PAGE (Main Page) */}
      {subPage === 'overview' && (
        <div className="space-y-10 animate-fade-in">
          {city.history && (
            <section className="glass-panel p-8 sm:p-10 rounded-3xl border border-amber-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 flex items-center space-x-3">
                <Landmark className="w-7 h-7 text-amber-400" />
                <span>History of the City</span>
              </h2>
              <p className="text-wf-cream text-base sm:text-lg leading-relaxed max-w-4xl">
                {city.history}
              </p>
            </section>
          )}

          {/* Transit & Interactive City Map */}
          <section className="space-y-6">
            <h2 className="text-3xl font-black text-white flex items-center space-x-3">
              <Map className="w-7 h-7 text-wf-blue-lt" />
              <span>City Map & Transit Guide</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
            </div>
          </section>
        </div>
      )}

      {/* 2. CHRISTMAS MARKETS SUB-PAGE */}
      {subPage === 'markets' && city.markets && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-1">
                <Sparkles className="w-4 h-4" />
                <span>Dedicated Market Guide</span>
              </div>
              <h2 className="text-3xl font-black text-white">Christmas Markets in {city.name}</h2>
            </div>
          </div>

          {/* Sub-Tabs for individual markets */}
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
            {city.markets.map((market, idx) => (
              <button
                key={market.id}
                onClick={() => setActiveMarketTab(idx)}
                className={`px-5 py-3 rounded-2xl font-bold text-sm transition-all duration-300 flex items-center space-x-2 ${
                  activeMarketTab === idx
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 scale-105'
                    : 'bg-wf-navy-mid/80 text-wf-muted hover:text-white hover:bg-wf-navy-mid'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{market.name}</span>
              </button>
            ))}
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

          {/* Market Food Strategy Box */}
          <div className="glass-panel border-wf-amber/30 p-8 rounded-3xl bg-wf-amber/5">
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center space-x-3">
              <Info className="w-6 h-6 text-wf-amber" />
              <span>Market Culinary Strategy</span>
            </h3>
            <p className="text-wf-cream leading-relaxed text-sm sm:text-base mb-4">
              {city.marketStrategy}
            </p>
            <div className="p-4 rounded-2xl bg-wf-navy-mid/80 border border-amber-400/20 text-xs text-amber-200">
              💡 Pro Tip: Order <strong>Grzaniec Galicyjski</strong> (mulled wine served in festive earthenware mugs) and <strong>Oscypek</strong> with warm cranberry jam at the wooden market stalls!
            </div>
          </div>
        </div>
      )}

      {/* 3. MUST-SEE ATTRACTIONS SUB-PAGE */}
      {subPage === 'attractions' && city.mustSee && (
        <div className="space-y-6 animate-fade-in">
          <h2 className="text-3xl font-black text-white flex items-center space-x-3">
            <Sparkles className="w-7 h-7 text-amber-400" />
            <span>Must-See Attractions in {city.name}</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {city.mustSee.map((sight, idx) => (
              <div key={idx} className="glass-panel p-6 rounded-3xl border border-white/10 hover:border-amber-500/40 transition-colors flex flex-col justify-between group">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 inline-block mb-3">
                    {sight.category}
                  </span>
                  <h3 className="text-xl font-bold text-white mb-2 group-hover:text-amber-300 transition-colors">
                    {sight.name}
                  </h3>
                  <p className="text-sm text-wf-muted leading-relaxed">
                    {sight.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. TOP RESTAURANTS SUB-PAGE */}
      {subPage === 'restaurants' && city.restaurants && (
        <div className="space-y-6 animate-fade-in">
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
      {subPage === 'hotels' && (
        <div className="space-y-6 animate-fade-in">
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
    </div>
  );
}

