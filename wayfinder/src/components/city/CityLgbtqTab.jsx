import React from 'react';
import { Heart, MapPin, ShieldCheck, Phone, Compass, Sparkles, Utensils, Landmark, CheckCircle2, Plus, ExternalLink, Navigation } from 'lucide-react';
import { getAttractionImage } from '../../utils/cityImages';

export function CityLgbtqTab({ 
  city, 
  lgbtqCategoryFilter, 
  setLgbtqCategoryFilter, 
  savedItems, 
  toggleItinerary, 
  isAuthenticated 
}) {
  if (!city.lgbtq) return null;

  return (
    <div id="lgbtq-section" className="space-y-10 animate-fade-in scroll-mt-32">
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
            <div className="w-full md:w-80 h-48 rounded-2xl overflow-hidden border border-purple-500/30 shadow-xl shrink-0 relative group">
              <img
                src={getAttractionImage(city.lgbtq.imageUrl)}
                alt={`LGBTQ+ ${city.name} - ${city.lgbtq.landmark || city.name}`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent"></div>
              <div className="absolute bottom-2.5 left-3 text-[11px] font-bold text-white flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-pink-400" />
                <span>{city.lgbtq.landmark || city.name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Overview Narrative */}
        <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-2 relative z-10">
          <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center space-x-1.5">
            <Heart className="w-4 h-4 text-pink-400 fill-pink-400/40" />
            <span>Culture, Atmosphere & Community</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
            {city.lgbtq.overview}
          </p>
        </div>

        {/* Safety & Legal Context Card */}
        {city.lgbtq.safetyAndLegal && (
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-slate-950/90 to-purple-950/40 border border-purple-500/30 space-y-4 relative z-10 shadow-lg">
            <div className="flex items-center space-x-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Safety, Laws & Traveler Practicalities</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1.5">
                <div className="font-bold text-emerald-300 flex items-center space-x-1.5">
                  <span>⚖️ Legal Equality & History</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {city.lgbtq.safetyAndLegal.legalContext}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1.5">
                <div className="font-bold text-sky-300 flex items-center space-x-1.5">
                  <span>🤝 Public Displays of Affection (PDA) & Safety</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {city.lgbtq.safetyAndLegal.pdaAdvice}
                </p>
              </div>
            </div>

            {city.lgbtq.safetyAndLegal.helplines && (
              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center space-x-1">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Community Resources:</span>
                </span>
                {city.lgbtq.safetyAndLegal.helplines.map((hl, hIdx) => (
                  <div key={hIdx} className="px-3 py-1 rounded-lg bg-purple-900/40 border border-purple-500/30 text-[11px] text-slate-200">
                    <span className="font-bold text-pink-300">{hl.name}:</span> <span className="text-slate-300">{hl.contact}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Category Filter Toolbar */}
      <div className="sticky top-[118px] z-30 py-3 px-4 sm:px-6 rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-purple-500/30 shadow-2xl transition-all">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar no-overscroll-x">
          <button
            type="button"
            onClick={() => setLgbtqCategoryFilter('all')}
            className={`px-4 py-3 sm:py-2 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer min-h-[44px] sm:min-h-0 ${
              lgbtqCategoryFilter === 'all'
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            All Sections
          </button>
          {city.lgbtq.neighborhoods && city.lgbtq.neighborhoods.length > 0 && (
            <button
              type="button"
              onClick={() => setLgbtqCategoryFilter('neighborhoods')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                lgbtqCategoryFilter === 'neighborhoods'
                  ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                  : 'bg-pink-500/10 hover:bg-pink-500/20 text-pink-300 border border-pink-500/30'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Neighborhoods</span>
            </button>
          )}
          {city.lgbtq.barsAndClubs && city.lgbtq.barsAndClubs.length > 0 && (
            <button
              type="button"
              onClick={() => setLgbtqCategoryFilter('nightlife')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                lgbtqCategoryFilter === 'nightlife'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border border-purple-600/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Nightlife & Bars</span>
            </button>
          )}
          {city.lgbtq.cafesAndDining && city.lgbtq.cafesAndDining.length > 0 && (
            <button
              type="button"
              onClick={() => setLgbtqCategoryFilter('dining')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                lgbtqCategoryFilter === 'dining'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Cafés & Dining</span>
            </button>
          )}
          {city.lgbtq.communityAndCulture && city.lgbtq.communityAndCulture.length > 0 && (
            <button
              type="button"
              onClick={() => setLgbtqCategoryFilter('community')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                lgbtqCategoryFilter === 'community'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>Culture & Community</span>
            </button>
          )}
          {city.lgbtq.winterExperiences && city.lgbtq.winterExperiences.length > 0 && (
            <button
              type="button"
              onClick={() => setLgbtqCategoryFilter('winter')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                lgbtqCategoryFilter === 'winter'
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Winter Experiences</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Key Districts & Queer Geography */}
      {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'neighborhoods') && city.lgbtq.neighborhoods && city.lgbtq.neighborhoods.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-pink-400 font-black text-xs uppercase tracking-wider">
            <Compass className="w-4 h-4" />
            <span>Queer Districts & Enclaves</span>
          </div>
          <h3 className="text-2xl font-black text-white">Neighborhoods & Iconic Hubs</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {city.lgbtq.neighborhoods.map((area, idx) => {
              const mapSearchQuery = encodeURIComponent(`${area.name}, ${city.name}, Poland`);
              const areaId = area.id || `lgbtq-neighborhood-${idx}`;
              const isSaved = savedItems.has(areaId);

              return (
              <div key={idx} className="glass-panel rounded-3xl border border-pink-500/30 bg-wf-navy-mid/90 hover:border-pink-400/60 transition-all flex flex-col justify-between shadow-xl overflow-hidden">
                <div className="p-6 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-lg font-black text-white">{area.name}</h4>
                  </div>
                  <div className="text-xs font-semibold text-pink-300">✨ {area.vibe}</div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    {area.description}
                  </p>
                </div>
                {/* Action Footer */}
                <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItinerary(areaId);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer min-h-[38px] ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                      }`}
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
                    href={area.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn min-h-[38px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                    <span className="truncate">Visit Website</span>
                  </a>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. Gay Clubs & Bars */}
      {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'nightlife') && city.lgbtq.barsAndClubs && city.lgbtq.barsAndClubs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-purple-400 font-black text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Nightlife & Social Venues</span>
          </div>
          <h3 className="text-2xl font-black text-white">Gay Clubs & Queer-Friendly Bars</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {city.lgbtq.barsAndClubs.map((venue, idx) => {
              const mapSearchQuery = encodeURIComponent(`${venue.name}, ${venue.address || ''}, ${city.name}, Poland`);
              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
              const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
              const venueId = venue.id || `lgbtq-venue-${idx}`;
              const isSaved = savedItems.has(venueId);

              return (
              <div key={idx} className="glass-panel rounded-3xl border border-purple-500/30 bg-wf-navy-mid/90 hover:border-purple-400/60 transition-all flex flex-col justify-between shadow-xl overflow-hidden">
                <div className="p-6 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-lg font-black text-white leading-snug">{venue.name}</h4>
                    {venue.type && (
                      <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-bold max-w-full break-words">
                        {venue.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {venue.description}
                  </p>
                  <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-500/20 text-[11px] font-semibold text-purple-200">
                    🔥 {venue.vibe}
                  </div>
                  <div className="pt-3 mt-4 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{venue.address}</span>
                  </div>
                </div>
                {/* Action Footer */}
                <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItinerary(venueId);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                      }`}
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
                    href={venue.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                    <span className="truncate">Visit Website</span>
                  </a>

                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                  >
                    <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                    <span className="truncate">Directions</span>
                  </a>

                  <a
                    href={mapSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                    <span className="truncate">View Map</span>
                  </a>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Inclusive Dining & Cafés */}
      {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'dining') && city.lgbtq.cafesAndDining && city.lgbtq.cafesAndDining.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-amber-400 font-black text-xs uppercase tracking-wider">
            <Utensils className="w-4 h-4" />
            <span>Culinary & Café Culture</span>
          </div>
          <h3 className="text-2xl font-black text-white">LGBTQ+-Friendly Cafés, Bakeries & Dining</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {city.lgbtq.cafesAndDining.map((rest, idx) => {
              const mapSearchQuery = encodeURIComponent(`${rest.name}, ${rest.address || ''}, ${city.name}, Poland`);
              const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
              const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
              const restId = rest.id || `lgbtq-dining-${idx}`;
              const isSaved = savedItems.has(restId);

              return (
              <div key={idx} className="glass-panel rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 hover:border-amber-400/60 transition-all flex flex-col justify-between shadow-xl overflow-hidden">
                <div className="p-6 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-lg font-black text-white leading-snug">{rest.name}</h4>
                    {rest.type && (
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-bold max-w-full break-words">
                        {rest.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {rest.description}
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 text-xs text-amber-200">
                    🍽️ <span className="font-bold text-amber-300">Signature:</span> {rest.signature}
                  </div>
                  <div className="pt-3 mt-4 border-t border-white/10 text-xs font-medium text-slate-400 flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{rest.address}</span>
                  </div>
                </div>
                {/* Action Footer */}
                <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItinerary(restId);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer min-h-[38px] ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                      }`}
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
                    href={rest.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn min-h-[38px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                    <span className="truncate">Visit Website</span>
                  </a>

                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/40 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn min-h-[38px]"
                  >
                    <Navigation className="w-3.5 h-3.5 text-sky-400 group-hover/btn:text-sky-300 shrink-0" />
                    <span className="truncate">Directions</span>
                  </a>

                  <a
                    href={mapSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn min-h-[38px]"
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-amber-300 shrink-0" />
                    <span className="truncate">View Map</span>
                  </a>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Living Culture, Activism & Wellness */}
      {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'community') && city.lgbtq.communityAndCulture && city.lgbtq.communityAndCulture.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-sky-400 font-black text-xs uppercase tracking-wider">
            <Landmark className="w-4 h-4" />
            <span>Queer Culture, Activism & Community</span>
          </div>
          <h3 className="text-2xl font-black text-white">Community Spaces & Cultural Heritage</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {city.lgbtq.communityAndCulture.map((spot, idx) => {
              const mapSearchQuery = encodeURIComponent(`${spot.name}, ${city.name}, Poland`);
              const spotId = spot.id || `lgbtq-culture-${idx}`;
              const isSaved = savedItems.has(spotId);

              return (
              <div key={idx} className="glass-panel rounded-3xl border border-sky-500/30 bg-wf-navy-mid/90 shadow-xl flex flex-col justify-between overflow-hidden">
                <div className="p-6 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-lg font-black text-white flex items-center space-x-2 leading-snug">
                      <span className="text-pink-400">♥</span>
                      <span>{spot.name}</span>
                    </h4>
                    {spot.type && (
                      <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 text-[10px] font-bold max-w-full break-words">
                        {spot.type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    {spot.description}
                  </p>
                  <div className="p-2.5 rounded-xl bg-sky-950/60 border border-sky-500/20 text-xs font-semibold text-sky-200">
                    💡 <span className="text-sky-300 font-bold">Highlight:</span> {spot.highlight}
                  </div>
                </div>
                {/* Action Footer */}
                <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItinerary(spotId);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                      }`}
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
                    href={spot.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                    <span className="truncate">Visit Website</span>
                  </a>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Queer Winter & Holiday Experiences */}
      {(lgbtqCategoryFilter === 'all' || lgbtqCategoryFilter === 'winter') && city.lgbtq.winterExperiences && city.lgbtq.winterExperiences.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-2 text-amber-300 font-black text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Winter & Holiday Strolls</span>
          </div>
          <h3 className="text-2xl font-black text-white">Queer-Welcoming Winter Experiences</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {city.lgbtq.winterExperiences.map((item, idx) => {
              const mapSearchQuery = encodeURIComponent(`${item.title}, ${city.name}, Poland`);
              const itemId = item.id || `lgbtq-winter-${idx}`;
              const isSaved = savedItems.has(itemId);

              return (
              <div key={idx} className="glass-panel rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 shadow-xl flex flex-col justify-between overflow-hidden">
                <div className="p-6 space-y-3">
                  <h4 className="text-base font-black text-white flex items-center space-x-2">
                    <span className="text-amber-400">❄️</span>
                    <span>{item.title}</span>
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {item.description}
                  </p>
                </div>
                {/* Action Footer */}
                <div className="bg-slate-950/80 border-t border-white/10 p-3.5 sm:p-4 grid grid-cols-2 gap-2 shrink-0">
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleItinerary(itemId);
                      }}
                      className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer min-h-[38px] ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                      }`}
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
                    href={item.websiteUrl || `https://www.google.com/search?q=${mapSearchQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center space-x-1.5 group/btn min-h-[38px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 group-hover/btn:text-emerald-300 shrink-0" />
                    <span className="truncate">Visit Website</span>
                  </a>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default CityLgbtqTab;
