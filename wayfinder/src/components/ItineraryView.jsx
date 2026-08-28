import React, { useState } from 'react';
import { useWayfinder } from '../context/WayfinderContext';
import { polandJourney } from '../data/poland-2026';
import { 
  ArrowLeft, Calendar, Clock, MapPin, Train, Plane, Building, 
  Sparkles, Utensils, Landmark, Compass, Coffee, FileText, ChevronRight, Filter
} from 'lucide-react';

export function ItineraryView() {
  const { itinerary: privateItems = [], isLoading } = useWayfinder();
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedDay, setSelectedDay] = useState('all');

  const pushRoute = (e, path) => {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const publicDays = polandJourney.itinerary || [];

  const filteredDays = publicDays.filter((dayItem) => {
    const matchesCity = selectedCity === 'all' || dayItem.cityId === selectedCity || (selectedCity === 'torun' && (dayItem.cityId === 'torun' || dayItem.cityName.includes('Toruń')));
    const matchesDay = selectedDay === 'all' || dayItem.day.toString() === selectedDay.toString();
    return matchesCity && matchesDay;
  });

  const getIconForType = (type) => {
    switch (type) {
      case 'flight': return <Plane className="w-4 h-4" />;
      case 'rail': return <Train className="w-4 h-4" />;
      case 'hotel': return <Building className="w-4 h-4" />;
      case 'market': return <Sparkles className="w-4 h-4" />;
      case 'sight': return <Landmark className="w-4 h-4" />;
      case 'food': return <Utensils className="w-4 h-4" />;
      case 'cafe': return <Coffee className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStyleForType = (type) => {
    switch (type) {
      case 'flight': return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      case 'rail': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'hotel': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'market': return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'sight': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'food': return 'bg-amber-400/15 text-amber-200 border-amber-400/30';
      default: return 'bg-white/10 text-white border-white/15';
    }
  };

  const getBadgeForType = (type) => {
    switch (type) {
      case 'flight': return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
      case 'rail': return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
      case 'hotel': return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
      case 'market': return 'bg-purple-500/20 text-purple-300 border-purple-400/40';
      case 'sight': return 'bg-blue-500/20 text-blue-300 border-blue-400/40';
      case 'food': return 'bg-amber-400/20 text-amber-200 border-amber-400/40';
      default: return 'bg-white/10 text-white border-white/20';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 w-full space-y-8 animate-fade-in">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <a
            href="/wayfinder/poland-christmas-2026"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
            className="inline-flex items-center text-xs sm:text-sm font-semibold text-wf-muted hover:text-white transition-colors mb-3 group"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5 transform group-hover:-translate-x-1 transition-transform" />
            <span>Back to Poland Journey</span>
          </a>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{polandJourney.dates}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-black uppercase tracking-wider">
              {polandJourney.totalDays || 10} Days • {polandJourney.totalNights || 9} Nights
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Trip Itinerary & Timeline
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl font-medium">
            Sequential day-by-day expedition route with exact stay dates, rail transit schedules, market rhythms, and sightseeing highlights.
          </p>
        </div>

        {/* Quick Route Links */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href="/wayfinder/poland-christmas-2026/route"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/route')}
            className="px-3.5 py-2 rounded-xl bg-wf-navy-mid border border-white/10 hover:border-amber-400/50 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Train className="w-3.5 h-3.5 text-amber-400" />
            <span>Rail Map</span>
          </a>
          <a
            href="/wayfinder/poland-christmas-2026/markets"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/markets')}
            className="px-3.5 py-2 rounded-xl bg-wf-navy-mid border border-white/10 hover:border-amber-400/50 text-white text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Market Guide</span>
          </a>
        </div>
      </div>

      {/* Planning Status & Flexible Rhythm Banner */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-wf-navy-mid flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 mt-0.5">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
              <span>Flexible Planning Framework & Suggested Rhythm</span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              This 10-day timeline provides a balanced, realistic schedule framework. Base lodging zones and daily activities are curated suggestions: use the city guides below to explore attractions, food targets, and hotel areas to customize your days.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href="/wayfinder/poland-christmas-2026/stays-and-food"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/stays-and-food')}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 hover:border-amber-400/40 text-slate-200 text-xs font-bold transition-colors flex items-center space-x-1"
          >
            <Building className="w-3.5 h-3.5 text-emerald-400" />
            <span>Lodging Base Zones</span>
          </a>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-amber-500/20 bg-wf-navy-mid/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter by City Stop</span>
          </div>

          {(selectedCity !== 'all' || selectedDay !== 'all') && (
            <button
              onClick={() => { setSelectedCity('all'); setSelectedDay('all'); }}
              className="text-xs text-wf-muted hover:text-white underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* City Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCity('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedCity === 'all' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'bg-slate-900/80 text-slate-300 border border-white/10 hover:border-white/20'}`}
          >
            All Cities (10 Days)
          </button>
          {polandJourney.route.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCity(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 ${selectedCity === c.id ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'bg-slate-900/80 text-slate-300 border border-white/10 hover:border-white/20'}`}
            >
              <span>{c.name}</span>
              <span className="text-[10px] opacity-75 font-mono">({c.itineraryDates ? c.itineraryDates.split(',')[0] : c.travelDays})</span>
            </button>
          ))}
        </div>

        {/* Day Number Quick-Scroller */}
        <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mr-1 shrink-0">Day:</span>
          <button
            onClick={() => setSelectedDay('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors ${selectedDay === 'all' ? 'bg-wf-blue text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            All
          </button>
          {publicDays.map((d) => (
            <button
              key={d.day}
              onClick={() => setSelectedDay(d.day.toString())}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors ${selectedDay === d.day.toString() ? 'bg-wf-blue text-white shadow-sm' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              title={`${d.displayDate} - ${d.cityName}`}
            >
              D{d.day} <span className="text-[10px] opacity-70 font-normal">({d.cityName.slice(0, 4)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Private Synced Items Overlay (If Authenticated User has Uploaded Bookings) */}
      {privateItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex items-center space-x-3 text-emerald-300 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{privateItems.length} Private booking items synced from your Document Center</span>
          </div>
          <a
            href="/wayfinder/poland-christmas-2026/private/documents"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private/documents')}
            className="text-xs text-emerald-300 hover:text-white underline font-semibold"
          >
            Manage Documents
          </a>
        </div>
      )}

      {/* Timeline Day List */}
      <div className="space-y-12">
        {filteredDays.length === 0 ? (
          <div className="text-center py-12 text-wf-muted bg-white/5 rounded-2xl border border-white/5">
            <p>No itinerary items match the selected filter criteria.</p>
            <button
              onClick={() => { setSelectedCity('all'); setSelectedDay('all'); }}
              className="mt-3 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
            >
              View Full 10-Day Timeline
            </button>
          </div>
        ) : (
          filteredDays.map((dayItem) => (
            <div key={dayItem.day} className="relative">
              {/* Sticky Day Header */}
              <div className="sticky top-14 sm:top-14 z-20 bg-slate-950/95 backdrop-blur-md py-3 border-b border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg mb-6 rounded-t-2xl px-2">
                <div className="flex items-center space-x-3">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-xs sm:text-sm tracking-tight shadow-md">
                    Day 0{dayItem.day}
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black text-white leading-snug">
                      {dayItem.displayDate}
                    </h2>
                    <p className="text-xs text-amber-300 font-bold flex items-center space-x-1.5">
                      <span>{dayItem.cityName}</span>
                      <span>•</span>
                      <span className="text-slate-300 font-normal">{dayItem.theme}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {dayItem.base && (
                    <span className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-300 flex items-center space-x-1 min-h-[36px] sm:min-h-[38px]">
                      <Building className="w-3 h-3 text-emerald-400" />
                      <span className="truncate max-w-[220px]">{dayItem.base}</span>
                    </span>
                  )}
                  <a
                    href={`/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/attractions`}
                    onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/attractions`)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-medium transition-colors min-h-[36px] sm:min-h-[38px] flex items-center"
                  >
                    Sights
                  </a>
                  <a
                    href={`/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/restaurants`}
                    onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}/restaurants`)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-medium transition-colors min-h-[36px] sm:min-h-[38px] flex items-center"
                  >
                    Dining
                  </a>
                  <a
                    href={`/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}`}
                    onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${dayItem.cityId}`)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold transition-colors shrink-0 min-h-[36px] sm:min-h-[38px] flex items-center"
                  >
                    City Guide
                  </a>
                </div>
              </div>

              {/* Day Schedule Event Cards */}
              <div className="space-y-4 pl-4 sm:pl-6 border-l-2 border-amber-500/30 ml-3 sm:ml-4">
                {dayItem.schedule.map((event, idx) => (
                  <div key={idx} className="relative group">
                    {/* Node on Vertical Track */}
                    <div className="absolute -left-[23px] sm:-left-[31px] top-4 w-4 h-4 sm:w-4 sm:h-4 rounded-full border-2 border-slate-950 bg-amber-400 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(245,158,11,0.8)]" />

                    <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-white/10 group-hover:border-amber-500/40 transition-all shadow-md bg-slate-900/90 space-y-3">
                      {/* Top Bar: Time, Category Icon, Title, and Badge */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <div className={`p-2 rounded-xl border ${getStyleForType(event.itemType)} shrink-0`}>
                            {getIconForType(event.itemType)}
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-base sm:text-lg leading-tight group-hover:text-amber-200 transition-colors">
                              {event.title}
                            </h3>
                            {event.location && (
                              <div className="text-xs text-slate-400 flex items-center space-x-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>{event.location}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 self-start sm:self-center">
                          {event.badge && (
                            <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${getBadgeForType(event.itemType)}`}>
                              {event.badge}
                            </span>
                          )}
                          <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-white/10 font-mono font-bold text-xs text-sky-300">
                            {event.time}
                          </span>
                        </div>
                      </div>

                      {/* Event Description */}
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                        {event.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Navigation CTA */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-wf-navy-mid via-slate-900 to-slate-950 flex flex-col sm:flex-row items-center justify-between gap-4 mt-12">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-lg sm:text-xl font-bold text-white">
            Ready to explore specific city guides?
          </h3>
          <p className="text-xs sm:text-sm text-slate-300">
            Dive into attractions, market operating hours, food targets, and interactive maps for all 5 stops.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          <a
            href="/wayfinder/poland-christmas-2026/cities/krakow"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/cities/krakow')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md"
          >
            Start with Kraków Guide
          </a>
          <a
            href="/wayfinder/poland-christmas-2026/route"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/route')}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition-colors"
          >
            View Rail Route Map
          </a>
        </div>
      </div>
    </div>
  );
}

export default ItineraryView;

