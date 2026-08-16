import React from 'react';
import { Sparkles, Video, ExternalLink, ShoppingBag, MapPin, Clock, Plus, CheckCircle2, Navigation, Compass, Utensils, Gift, Award, Lightbulb } from 'lucide-react';
import { QuickReferenceBar } from './QuickReferenceBar';
import { marketImages } from '../../utils/cityImages';

export function CityMarketsTab({ 
  city, 
  activeMarketTab, 
  setActiveMarketTab, 
  savedItems, 
  toggleItinerary, 
  isAuthenticated 
}) {
  if (!city.markets || city.markets.length === 0) return null;

  return (
    <div id="markets-section" className="space-y-6 animate-fade-in scroll-mt-32">
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

        {/* Compact Embedded 4K Walking Tour Mini-Player */}
        {(() => {
          const videoId = city.id === 'krakow' ? 'DUFYxovB_80' : (city.id === 'wroclaw' ? 'lZfJ3H5kL50' : null);
          if (!videoId) return null;
          return (
            <div className="w-44 sm:w-48 md:w-52 shrink-0 rounded-xl overflow-hidden border border-amber-500/30 bg-slate-950 shadow-lg shadow-amber-950/30 group">
              <div className="relative w-full aspect-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title={`4K ${city.name} Christmas Market Walking Tour`}
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
                  href={`https://www.youtube.com/watch?v=${videoId}`}
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
          );
        })()}
      </div>

      {/* Sticky Sub-Tabs for individual markets */}
      <div className="sticky top-[118px] z-30 py-2 px-3 sm:px-4 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-emerald-500/30 shadow-2xl transition-all w-full">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Distinct Section Label */}
          <div className="flex items-center space-x-1.5 shrink-0 text-amber-400 font-black text-[11px] sm:text-xs uppercase tracking-wider px-1">
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Explore Markets:</span>
          </div>

          {/* Compact Responsive Pill Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveMarketTab('all')}
              className={`px-2.5 py-1 rounded-xl font-black text-[11px] sm:text-xs transition-all duration-200 flex items-center space-x-1 whitespace-nowrap shrink-0 border cursor-pointer ${
                activeMarketTab === 'all'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30'
                  : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
              }`}
            >
              <span>✨</span>
              <span>All ({city.markets.length})</span>
            </button>

            {city.markets.map((market, idx) => {
              const isActive = activeMarketTab === idx;
              const label = market.shortName || market.name.replace(' Main Market', '').replace(' Craft Corner', '').replace(' Fair', '').replace(' Market', '');
              return (
                <button
                  key={market.id}
                  type="button"
                  onClick={() => setActiveMarketTab(idx)}
                  className={`px-2.5 py-1 rounded-xl font-bold text-[11px] sm:text-xs transition-all duration-200 flex items-center space-x-1 whitespace-nowrap shrink-0 border cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30 font-black'
                      : 'bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-100 border-emerald-500/40 hover:border-amber-400/60 shadow-sm'
                  }`}
                >
                  <span>{isActive ? '🎄' : '⛺'}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 1. All Markets Grid View (When 'all' is selected) */}
      {activeMarketTab === 'all' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {city.markets.map((market) => {
            const marketImg = marketImages[market.id];
            const mapSearchQuery = encodeURIComponent(`${market.name}, ${market.address || market.location}, ${city.name}, Poland`);
            const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
            const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
            const isSaved = savedItems.has(market.id);

            return (
              <article
                key={market.id}
                className="glass-panel rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 overflow-hidden shadow-xl flex flex-col justify-between group hover:border-amber-400/60 transition-all duration-300"
              >
                <div>
                  {/* Image Header */}
                  <div className="relative w-full h-64 sm:h-72 bg-slate-950 overflow-hidden shrink-0">
                    {marketImg ? (
                      <img
                        src={marketImg}
                        alt={market.name}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-amber-950/40 flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-amber-400/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-transparent to-black/40 pointer-events-none" />

                    {/* Location & Vibe Badges */}
                    <div className="absolute top-3.5 left-3.5 right-3.5 z-10 flex flex-wrap items-center justify-between gap-1.5">
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-950/80 backdrop-blur-md border border-amber-400/30 text-amber-300 shadow-md truncate">
                        📍 {market.location}
                      </span>
                      {market.vibe && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 backdrop-blur-md border border-emerald-400/40 text-emerald-300 shadow-md">
                          ✨ {market.vibe}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-white group-hover:text-amber-300 transition-colors leading-tight">
                        {market.name}
                      </h3>
                      {market.address && (
                        <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{market.address}</span>
                        </div>
                      )}
                    </div>

                    {/* Operating Hours Bar */}
                    {market.hours && (
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 flex items-center space-x-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-300 font-medium truncate">{market.hours}</span>
                      </div>
                    )}

                    {/* Best Time to Visit callout */}
                    {market.bestTime && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center space-x-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        <span className="text-amber-200 font-semibold leading-snug">Best Time: {market.bestTime}</span>
                      </div>
                    )}

                    {/* Key Highlights List */}
                    {market.highlights && market.highlights.length > 0 && (
                      <div className="p-3 rounded-2xl bg-wf-navy-mid/90 border border-white/10 space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                          ✦ Key Highlights & Features:
                        </span>
                        <ul className="space-y-1 text-xs text-slate-300">
                          {market.highlights.slice(0, 3).map((item, idx) => (
                            <li key={idx} className="flex items-start space-x-1.5">
                              <span className="text-amber-400 font-bold">•</span>
                              <span className="leading-snug">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Must-Try Quick Tags */}
                    {market.mustTry && (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                          🍢 Must-Try Fares:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {market.mustTry.map((food, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-200 text-[11px] font-semibold">
                              {food}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 flex items-center justify-between gap-2 shrink-0">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItinerary(market.id);
                      }}
                      className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                      }`}
                      title={isSaved ? 'Saved in Itinerary' : 'Add to Itinerary'}
                    >
                      {isSaved ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">Saved</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">Itinerary</span>
                        </>
                      )}
                    </button>
                  )}

                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                    title={`Get Directions to ${market.name}`}
                  >
                    <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                    <span className="truncate">Directions</span>
                  </a>

                  <a
                    href={mapSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                    title={`View ${market.name} on Map`}
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                    <span className="truncate">View Map</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 2. Active Market Deep-Dive Details Card (When individual index is selected) */}
      {activeMarketTab !== 'all' && city.markets[activeMarketTab] && (() => {
        const currentMarket = city.markets[activeMarketTab];
        const marketImg = marketImages[currentMarket.id];
        const mapSearchQuery = encodeURIComponent(`${currentMarket.name}, ${currentMarket.address || currentMarket.location}, ${city.name}, Poland`);
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
        const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
        const isSaved = savedItems.has(currentMarket.id);

        return (
          <div className="glass-panel rounded-3xl border border-amber-500/30 overflow-hidden shadow-2xl bg-amber-500/5 space-y-6 animate-fade-in">
            {/* Market Specific Picture Header */}
            {marketImg && (
              <div className="w-full h-72 sm:h-96 relative overflow-hidden group bg-slate-950">
                <img 
                  src={marketImg} 
                  alt={currentMarket.name} 
                  className="w-full h-full object-cover object-center transition-transform duration-1000 group-hover:scale-105" 
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/40 to-transparent"></div>
                <div className="absolute bottom-6 left-6 right-6 flex flex-col items-start gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                      📍 {currentMarket.location}
                    </span>
                    {currentMarket.vibe && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                        ✨ {currentMarket.vibe}
                      </span>
                    )}
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-black text-white drop-shadow-md">
                    {currentMarket.name}
                  </h3>
                </div>
              </div>
            )}

            <div className="p-6 sm:p-8 space-y-6">
              {/* Hours & Address quick bar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                {currentMarket.bestTime && (
                  <div className="p-4 rounded-2xl bg-wf-navy-mid/90 border border-emerald-500/20 flex items-start space-x-3">
                    <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider block mb-0.5">Best Time to Visit</span>
                      <span className="text-sm font-semibold text-white">{currentMarket.bestTime}</span>
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

              {/* Comprehensive Highlights Breakdown */}
              {currentMarket.highlights && currentMarket.highlights.length > 0 && (
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
                  <span className="text-amber-300 text-xs font-extrabold uppercase tracking-wider block flex items-center space-x-2">
                    <Compass className="w-4 h-4 text-amber-400" />
                    <span>Key Market Highlights & Unique Experiences</span>
                  </span>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs sm:text-sm text-slate-200">
                    {currentMarket.highlights.map((h, i) => (
                      <li key={i} className="flex items-start space-x-2 bg-slate-950/60 p-3 rounded-xl border border-white/5">
                        <span className="text-amber-400 font-bold">✦</span>
                        <span className="font-medium leading-snug">{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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

            {/* Market Card Action Bar (Directions, Add to Itinerary, View Map) */}
            <div className="bg-slate-950/90 border-t border-white/10 p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3">
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => toggleItinerary(currentMarket.id)}
                  className={`flex-1 min-w-[150px] py-3 px-4 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 border cursor-pointer ${
                    isSaved
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-lg shadow-emerald-950/30'
                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50 shadow-lg'
                  }`}
                  title={isSaved ? 'Saved in Itinerary' : 'Add to Itinerary'}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Saved in Itinerary</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Add to Itinerary</span>
                    </>
                  )}
                </button>
              )}

              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[150px] py-3 px-4 rounded-2xl bg-white/5 hover:bg-sky-500/20 text-slate-200 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 group/btn shadow-lg"
                title={`Get Google Maps Directions to ${currentMarket.name}`}
              >
                <Navigation className="w-4 h-4 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                <span>Directions</span>
              </a>

              <a
                href={mapSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[150px] py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-xs sm:text-sm font-black transition-all flex items-center justify-center space-x-2 group/btn shadow-lg"
                title={`View ${currentMarket.name} on Map`}
              >
                <Compass className="w-4 h-4 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                <span>View Map</span>
              </a>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default CityMarketsTab;
