import React from 'react';
import { Compass, Map, ArrowRight } from 'lucide-react';
import polandMarketImg from '../assets/poland-market.png';

export function WayfinderLanding() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-start py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center space-y-2.5 animate-slide-up">
        
        <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-wf-blue/10 border border-wf-blue/30 text-wf-blue-lt text-[11px] sm:text-xs font-medium">
          <Compass className="w-3 h-3" />
          <span>Curated Travel Experiences</span>
        </div>

        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
          Smart routes. <span className="gradient-amber">Memorable places.</span>
        </h1>

        <p className="text-xs sm:text-sm text-wf-muted max-w-md mx-auto leading-normal">
          Every detail within reach. Explore curated public destination guides, or sign in to access your private itinerary and document hub.
        </p>

        <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {/* Poland 2026 Card */}
          <a
            href="/wayfinder/poland-christmas-2026"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
            className="group block text-left relative overflow-hidden rounded-3xl glass-panel p-1 hover-lift"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-wf-blue/20 via-amber-900/20 to-wf-navy opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative h-48 rounded-2xl overflow-hidden mb-4 bg-wf-navy-mid border border-amber-500/20 group-hover:border-amber-500/50 transition-colors duration-500">
              {/* Festive Poland Christmas Market Background */}
              <img 
                src={polandMarketImg} 
                alt="Poland Christmas Market" 
                className="absolute inset-0 w-full h-full object-cover opacity-75 group-hover:scale-105 transition-all duration-700" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-wf-navy-mid/60 to-transparent"></div>
              
              {/* Detailed Hover Overlay */}
              <div className="absolute inset-0 bg-wf-navy/95 p-4 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm z-20">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                  📍 Rynek Główny (Grand Main Square), Kraków
                </div>
                <div className="text-sm font-bold text-white mb-2">
                  🏛️ St. Mary's Basilica & Renaissance Cloth Hall (Sukiennice)
                </div>
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  Europe's premier medieval Christmas Market featuring 100+ wooden stalls, hand-carved trinkets, Baltic amber jewelry, traditional oscypek smoked cheese, and piping hot grzaniec galicyjski.
                </p>
              </div>

              <div className="absolute bottom-4 left-4 right-4 z-10 group-hover:opacity-0 transition-opacity duration-300">
                <div className="flex items-center space-x-2 text-amber-200/80 text-xs font-semibold uppercase tracking-wider mb-1">
                  <Map className="w-3 h-3" />
                  <span>Europe</span>
                </div>
                <h3 className="text-2xl font-black gradient-amber drop-shadow-md">Poland: A Christmas Journey</h3>
              </div>
            </div>
            <div className="px-4 pb-4">
              <p className="text-sm text-wf-muted mb-4 line-clamp-2">
                A winter exploration through Krakow, Wroclaw, Poznan, Torun, and Gdansk. Discover historic market squares and authentic Polish culture.
              </p>
              <div className="flex items-center text-sm font-medium text-wf-blue-lt group-hover:text-white transition-colors">
                <span>View Route Guide</span>
                <ArrowRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </a>

          {/* Placeholder for future journeys */}
          <div className="group block text-left relative overflow-hidden rounded-3xl glass-panel p-1 border-dashed border-white/20 opacity-60">
            <div className="relative h-48 rounded-2xl overflow-hidden mb-4 bg-wf-navy-lt/20 flex items-center justify-center">
              <Compass className="w-12 h-12 text-white/10" />
            </div>
            <div className="px-4 pb-4">
              <h3 className="text-lg font-bold text-white mb-2">More Journeys Coming Soon</h3>
              <p className="text-sm text-wf-muted">
                Future travel operations and public guides will appear here.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
