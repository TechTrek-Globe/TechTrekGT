import React from 'react';
import { Compass, Map, Calendar, Train, Utensils, Bed, ArrowRight, CheckCircle2, MapPin, Plane } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { cityImages } from '../utils/cityImages';
import polandMapRouteClean from '../assets/poland-map-route-clean.png';

export function PolandLanding() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="w-full pb-20 space-y-8">
      {/* Sleek Compact Hero & 3D Poland Route Map Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/95 shadow-2xl flex flex-col lg:flex-row items-stretch gap-6">
          {/* Left Text & Actions Column */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider">
                <Compass className="w-3.5 h-3.5" />
                <span>{polandJourney.dates}</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-snug">
                {polandJourney.title}
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {polandJourney.description}
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <a
                href="/wayfinder/poland-christmas-2026/route"
                onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/route')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md shadow-amber-500/20"
              >
                <Map className="w-4 h-4" />
                <span>View Full Route</span>
              </a>
              <a
                href="/wayfinder/poland-christmas-2026/private"
                onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026/private')}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center space-x-1.5 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span>Private Itinerary</span>
              </a>
            </div>
          </div>

          {/* Right Compact 3D Route Map Panel (100% Precise City, Track & Flight Paths) */}
          <div className="w-full lg:w-7/12 h-64 sm:h-80 rounded-2xl overflow-hidden relative bg-slate-950 border border-amber-500/30 shadow-inner group shrink-0">
            {/* Pristine 3D Map Background */}
            <img 
              src={polandMapRouteClean} 
              alt="3D Poland Route Map" 
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-1000 group-hover:scale-105" 
            />

            {/* Glowing Golden Rail Track & Flight Path Vectors */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Train Rail Track: Kraków -> Wrocław -> Poznań -> Toruń -> Gdańsk */}
              <path 
                d="M 58 78 Q 45 70 36 60 T 30 44 T 48 34 T 45 18" 
                fill="none" 
                stroke="#f59e0b" 
                strokeWidth="2.5" 
                strokeDasharray="2 1"
                className="opacity-90 drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]"
              />
              <path 
                d="M 58 78 Q 45 70 36 60 T 30 44 T 48 34 T 45 18" 
                fill="none" 
                stroke="#fef3c7" 
                strokeWidth="1" 
                className="opacity-60"
              />

              {/* Incoming Flight Path: Air Arrival into Kraków */}
              <path 
                d="M 82 92 Q 70 86 58 78" 
                fill="none" 
                stroke="#38bdf8" 
                strokeWidth="1.8" 
                strokeDasharray="1.5 1.5"
                className="opacity-85 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
              />

              {/* Outgoing Flight Path: Air Departure out of Gdańsk */}
              <path 
                d="M 45 18 Q 32 12 20 6" 
                fill="none" 
                stroke="#38bdf8" 
                strokeWidth="1.8" 
                strokeDasharray="1.5 1.5"
                className="opacity-85 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]"
              />
            </svg>

            {/* Incoming Flight Badge to Kraków (KRK) */}
            <div className="absolute top-[88%] left-[80%] z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-sky-400 text-sky-300 text-[9px] font-black tracking-wider uppercase flex items-center space-x-1 shadow-lg shadow-sky-950/80 backdrop-blur-md animate-pulse">
                <Plane className="w-3 h-3 text-sky-300 rotate-45" />
                <span>FLY IN: KRK</span>
              </div>
            </div>

            {/* Outgoing Flight Badge from Gdańsk (GDN) */}
            <div className="absolute top-[8%] left-[20%] z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-sky-400 text-sky-300 text-[9px] font-black tracking-wider uppercase flex items-center space-x-1 shadow-lg shadow-sky-950/80 backdrop-blur-md animate-pulse">
                <Plane className="w-3 h-3 text-sky-300 -rotate-45" />
                <span>FLY OUT: GDN</span>
              </div>
            </div>

            {/* Interactive City Micro Nodes */}
            <div className="absolute inset-0 z-20 pointer-events-auto">
              {polandJourney.route.map((item) => {
                const itemUrl = `/wayfinder/poland-christmas-2026/cities/${item.id}`;

                // Coordinates matching glowing SVG rail track points exactly
                const positions = {
                  krakow: 'top-[78%] left-[58%]',
                  wroclaw: 'top-[60%] left-[36%]',
                  poznan: 'top-[44%] left-[30%]',
                  torun: 'top-[34%] left-[48%]',
                  gdansk: 'top-[18%] left-[45%]'
                };

                return (
                  <a
                    key={item.id}
                    href={itemUrl}
                    onClick={(e) => pushRoute(e, itemUrl)}
                    className={`absolute flex flex-col items-center group/node cursor-pointer -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 ${positions[item.id] || 'top-1/2 left-1/2'}`}
                    title={`View ${item.name}`}
                  >
                    {/* Micro-Avatar Circle */}
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 border-amber-400 bg-slate-950 shadow-xl shadow-amber-500/60 relative flex items-center justify-center transition-all group-hover/node:border-amber-300 group-hover/node:ring-4 group-hover/node:ring-amber-500/40">
                      <img 
                        src={cityImages[item.id]} 
                        alt={item.name} 
                        className="w-full h-full object-cover" 
                      />
                    </div>

                    {/* City Label Badge */}
                    <div className="mt-0.5 px-2 py-0.5 rounded-full bg-slate-950/95 border border-amber-400/80 text-white font-black text-[9px] sm:text-[10px] tracking-tight shadow-lg backdrop-blur-md group-hover/node:bg-amber-500 group-hover/node:text-slate-950 transition-colors">
                      {item.name}
                    </div>
                  </a>
                );
              })}
            </div>
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
              <div key={city.id} className="glass-panel rounded-2xl relative hover-lift cursor-pointer overflow-hidden border border-white/5 hover:border-amber-500/40 transition-colors group" onClick={(e) => pushRoute(e, `/wayfinder/poland-christmas-2026/cities/${city.id}`)}>
                {idx < polandJourney.route.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 w-4 h-px bg-white/20 z-10" />
                )}
                <div className="h-36 w-full relative overflow-hidden">
                  <img 
                    src={cityImages[city.id]} 
                    alt={city.name} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/50 to-transparent"></div>
                  
                  {/* Detailed Hover Overlay */}
                  <div className="absolute inset-0 bg-wf-navy/95 p-3 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm z-20">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5">
                      📍 {city.imageDetails?.location}
                    </div>
                    <div className="text-xs font-bold text-white mb-1 line-clamp-1">
                      🏛️ {city.imageDetails?.landmark}
                    </div>
                    <p className="text-[11px] text-amber-100/90 leading-tight line-clamp-4">
                      {city.imageDetails?.description}
                    </p>
                  </div>
                </div>

                <div className="p-4 relative z-10">
                  <div className="text-amber-300 text-[10px] font-black uppercase tracking-widest mb-1 drop-shadow-md">
                    Stop 0{idx + 1}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1 drop-shadow-md">{city.name}</h3>
                  <p className="text-xs text-amber-100/80 mb-2 font-medium">
                    {city.nights > 0 ? `${city.nights} nights` : 'Day Stop'}
                  </p>
                  <div className="text-xs text-wf-cream/80 line-clamp-2 leading-relaxed">
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
