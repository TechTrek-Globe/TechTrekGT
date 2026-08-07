import React from 'react';
import { Compass, Map, Calendar, Train, Utensils, Bed, ArrowRight, CheckCircle2 } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

export function PolandLanding() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="w-full pb-20">
      {/* Hero Section */}
      <div className="relative pt-24 pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-wf-navy via-wf-navy to-wf-navy-mid/80"></div>
          <div className="absolute top-1/4 right-0 w-96 h-96 bg-wf-amber/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-wf-blue-lt/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-wf-amber/10 border border-wf-amber/30 text-wf-amber text-xs font-medium uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5" />
            <span>{polandJourney.dates}</span>
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
            {polandJourney.title.split(':')[0]}: <br />
            <span className="gradient-amber">{polandJourney.title.split(':')[1]}</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-wf-muted max-w-3xl leading-relaxed">
            {polandJourney.description}
          </p>

          <div className="flex flex-wrap gap-4 pt-4">
            <a
              href="/wayfinder/poland-christmas-2026/route"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/route')}
              className="px-6 py-3 rounded-xl bg-wf-blue hover:bg-wf-blue-lt text-white font-medium flex items-center space-x-2 transition-colors hover-lift"
            >
              <Map className="w-5 h-5" />
              <span>View Route Map</span>
            </a>
            <a
              href="/wayfinder/poland-christmas-2026/private"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
              className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium flex items-center space-x-2 transition-colors"
            >
              <Calendar className="w-5 h-5" />
              <span>Access Private Itinerary</span>
            </a>
          </div>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-16">
        
        {/* Route Snapshot */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
              <Map className="w-6 h-6 text-wf-blue-lt" />
              <span>Journey Sequence</span>
            </h2>
            <a 
              href="/wayfinder/poland-christmas-2026/route"
              onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/route')}
              className="text-sm font-medium text-wf-blue-lt hover:text-white flex items-center transition-colors"
            >
              See details <ArrowRight className="w-4 h-4 ml-1" />
            </a>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {polandJourney.route.map((city, idx) => (
              <div key={city.id} className="glass-panel rounded-2xl relative hover-lift cursor-pointer overflow-hidden border border-white/5 hover:border-amber-500/40 transition-colors" onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${city.id}`)}>
                {idx < polandJourney.route.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-4 h-px bg-white/20 z-10" />
                )}
                <div className="h-32 w-full bg-cover bg-center relative group" style={{ backgroundImage: `url('/${city.id}.png')` }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/60 to-transparent transition-opacity duration-300"></div>
                </div>
                <div className="p-5 -mt-10 relative z-10">
                  <div className="text-amber-300 text-[10px] font-black uppercase tracking-widest mb-1 drop-shadow-md">
                    Stop 0{idx + 1}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1 drop-shadow-md">{city.name}</h3>
                  <p className="text-xs text-amber-100/80 mb-3 font-medium">
                    {city.nights > 0 ? `${city.nights} nights` : 'Day Stop'}
                  </p>
                  <div className="text-xs text-wf-cream/80 line-clamp-3 leading-relaxed">
                    {city.focus}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The Strategy */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <h2 className="text-2xl font-bold text-white mb-4">The Strategy</h2>
            <p className="text-wf-muted mb-6">
              A balanced approach to winter travel in Poland, optimizing daylight sightseeing and evening market atmosphere.
            </p>
            <div className="space-y-4">
              <a href="/wayfinder/poland-christmas-2026/markets" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/markets')} className="flex items-center space-x-3 p-4 rounded-xl bg-wf-navy-mid border border-white/5 hover:border-wf-blue/50 transition-colors group">
                <div className="p-2 rounded-lg bg-wf-blue/20 text-wf-blue-lt"><Calendar className="w-5 h-5" /></div>
                <div className="flex-1 font-medium text-white group-hover:text-wf-blue-lt transition-colors">Market Timing</div>
                <ArrowRight className="w-4 h-4 text-wf-muted group-hover:text-wf-blue-lt transition-colors" />
              </a>
              <a href="/wayfinder/poland-christmas-2026/rail" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/rail')} className="flex items-center space-x-3 p-4 rounded-xl bg-wf-navy-mid border border-white/5 hover:border-wf-blue/50 transition-colors group">
                <div className="p-2 rounded-lg bg-wf-amber/20 text-wf-amber"><Train className="w-5 h-5" /></div>
                <div className="flex-1 font-medium text-white group-hover:text-wf-amber transition-colors">Rail Connections</div>
                <ArrowRight className="w-4 h-4 text-wf-muted group-hover:text-wf-amber transition-colors" />
              </a>
              <a href="/wayfinder/poland-christmas-2026/stays-and-food" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/stays-and-food')} className="flex items-center space-x-3 p-4 rounded-xl bg-wf-navy-mid border border-white/5 hover:border-wf-evergreen/50 transition-colors group">
                <div className="p-2 rounded-lg bg-wf-evergreen/20 text-wf-evergreen"><Bed className="w-5 h-5" /></div>
                <div className="flex-1 font-medium text-white group-hover:text-wf-evergreen transition-colors">Neighborhoods & Food</div>
                <ArrowRight className="w-4 h-4 text-wf-muted group-hover:text-wf-evergreen transition-colors" />
              </a>
            </div>
          </div>
          
          <div className="lg:col-span-2 glass-card p-8 rounded-3xl">
            <h3 className="text-lg font-semibold text-white mb-4">Key Principles</h3>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-wf-amber shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">Markets as Evening Anchors</h4>
                  <p className="text-sm text-wf-muted mt-1">{polandJourney.marketStrategy}</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-wf-amber shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">1st-Class Rail Focus</h4>
                  <p className="text-sm text-wf-muted mt-1">Intercity moves are treated as rest periods. Booking 1st Class ensures space for luggage and a quieter environment between cities.</p>
                </div>
              </div>
              <div className="flex items-start space-x-4">
                <CheckCircle2 className="w-6 h-6 text-wf-amber shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">Strategic Bases</h4>
                  <p className="text-sm text-wf-muted mt-1">All recommended hotel neighborhoods are within walking distance of the central squares, allowing easy retreat when the winter cold sets in.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
