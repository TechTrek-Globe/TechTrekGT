import React from 'react';
import { Compass, Map, ArrowRight } from 'lucide-react';

export function WayfinderLanding() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center space-y-8 animate-slide-up">
        
        <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full bg-wf-blue/10 border border-wf-blue/30 text-wf-blue-lt text-sm font-medium">
          <Compass className="w-4 h-4" />
          <span>Curated Travel Experiences</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-white leading-tight">
          Smart routes. <br className="hidden sm:block" />
          <span className="gradient-amber">Memorable places.</span>
        </h1>

        <p className="text-lg sm:text-xl text-wf-muted max-w-2xl mx-auto leading-relaxed">
          Every detail within reach. Explore curated public destination guides, or sign in to access your private itinerary and document hub.
        </p>

        <div className="pt-12 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Poland 2026 Card */}
          <a
            href="/wayfinder/poland-christmas-2026"
            onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')}
            className="group block text-left relative overflow-hidden rounded-3xl glass-panel p-1 hover-lift"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-wf-blue/20 via-amber-900/20 to-wf-navy opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative h-48 rounded-2xl overflow-hidden mb-4 bg-wf-navy-mid border border-amber-500/20 group-hover:border-amber-500/50 transition-colors duration-500">
              {/* Festive Poland Christmas Market Background */}
              <div className="absolute inset-0 bg-[url('/wayfinder/poland-market.png')] bg-cover bg-center opacity-70 group-hover:scale-105 group-hover:opacity-90 transition-all duration-700"></div>
              <div className="absolute inset-0 bg-gradient-to-t from-wf-navy-mid via-wf-navy-mid/60 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
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
