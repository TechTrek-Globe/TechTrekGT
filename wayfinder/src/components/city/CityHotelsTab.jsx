import React from 'react';
import { Bed, MapPin, Train, Sparkles, Navigation, Compass, CheckCircle2, Plus, Info } from 'lucide-react';
import { FormatText } from '../Formatters';

export function CityHotelsTab({ 
  city, 
  savedItems, 
  toggleItinerary, 
  isAuthenticated 
}) {
  const hotelsList = city.hotels && city.hotels.length > 0 
    ? city.hotels 
    : [
        `Recommended Base: ${city.base || `${city.name} Historic Center`}`,
        `Proximity: Walking distance to ${city.markets?.[0]?.name || `${city.name} Christmas Market`}`,
        `Transit Connection: Easy access to ${city.transit?.station || `${city.name} Central Station`}`
      ];

  const mapSearchQuery = encodeURIComponent(`Hotels near ${city.base || city.name}, ${city.name}, Poland`);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapSearchQuery}`;
  const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;
  const stayId = `hotel-base-${city.id}`;
  const isSaved = savedItems.has(stayId);

  return (
    <div id="hotels-section" className="space-y-6 animate-fade-in scroll-mt-32">
      {/* Header Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 relative overflow-hidden shadow-2xl space-y-4">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/15 via-emerald-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider shadow-sm">
              <Bed className="w-3.5 h-3.5 text-amber-400" />
              <span>Lodging & Neighborhood Base</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Where to Stay in {city.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
              Optimal lodging zones chosen for walking access to Christmas market chalets, illuminated evening squares, and high-speed rail connections.
            </p>
          </div>

          <div className="shrink-0 flex items-center space-x-2">
            <span className="px-4 py-2 rounded-2xl bg-slate-900/90 border border-amber-500/30 text-amber-300 text-xs font-black shadow-md">
              {city.nights > 0 ? `🛌 ${city.nights} Nights Base` : '⚡ Day Stop (No Overnight Required)'}
            </span>
          </div>
        </div>
      </div>

      {/* Base Recommendation & Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recommended Base Zone */}
        <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-amber-500/30 bg-wf-navy/90 flex flex-col justify-between shadow-xl space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <MapPin className="w-4 h-4" />
              <span>Recommended Neighborhood Zone</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {city.base}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Staying in or immediately bordering <strong className="text-amber-300">{city.base}</strong> ensures you can return on foot late at night after market festivities without needing taxi transfers or cold late-night tram waits.
            </p>

            <div className="pt-2 space-y-2">
              {hotelsList.map((hotel, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-950/70 border border-white/5 flex items-start space-x-2.5 text-xs text-slate-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{hotel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => toggleItinerary(stayId)}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1.5 border cursor-pointer ${
                  isSaved
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
                }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Saved Base</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Save to Itinerary</span>
                  </>
                )}
              </button>
            )}

            <a
              href={mapSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all flex items-center space-x-1.5"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Search Hotels on Maps</span>
            </a>
          </div>
        </div>

        {/* Transit & Station Connectivity */}
        <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-sky-500/30 bg-wf-navy/90 flex flex-col justify-between shadow-xl space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
              <Train className="w-4 h-4" />
              <span>Transit & Luggage Accessibility</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Station & Airport Proximity
            </h3>

            {city.transit ? (
              <div className="space-y-2.5 text-xs text-slate-200">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                  <div className="font-bold text-sky-300 flex items-center space-x-1.5">
                    <Train className="w-3.5 h-3.5 text-sky-400" />
                    <span>Train Hub:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{city.transit.station}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-white/5 space-y-1">
                  <div className="font-bold text-amber-300 flex items-center space-x-1.5">
                    <Navigation className="w-3.5 h-3.5 text-amber-400" />
                    <span>Airport Transfer:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed"><FormatText text={city.transit.airport} /></p>
                </div>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-slate-300">
                Direct walkable center with compact tram network accessible via the Jakdojade mobile app.
              </p>
            )}
          </div>

          {/* Winter Booking Tip */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start space-x-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-snug">
              <strong>Winter Peak Tip:</strong> December weekend rates near main squares surge rapidly. Book lodging with flexible cancellation 3-5 months ahead.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CityHotelsTab;
