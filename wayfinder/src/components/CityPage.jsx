import React from 'react';
import { MapPin, Utensils, Bed, ArrowLeft } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

export function CityPage({ cityId }) {
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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <a href="/wayfinder/poland-christmas-2026" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} className="inline-flex items-center text-sm font-medium text-wf-muted hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Overview
        </a>
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black text-white flex items-center space-x-3">
            <MapPin className="w-8 h-8 text-wf-blue-lt" />
            <span>{city.name}</span>
          </h1>
          <div className="px-4 py-1.5 rounded-full bg-wf-navy-mid border border-white/10 text-wf-cream text-sm font-medium">
            {city.nights > 0 ? `${city.nights} Nights` : 'Day Stop'}
          </div>
        </div>
      </div>

      {/* Hero Image */}
      <div className="w-full h-64 md:h-80 rounded-3xl overflow-hidden relative mb-12 bg-wf-navy-mid border border-amber-500/20 shadow-lg shadow-amber-900/20">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 hover:scale-105 opacity-90"
          style={{ backgroundImage: `url('/${city.id}.png')` }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-t from-wf-navy via-wf-navy/40 to-transparent"></div>
        <div className="absolute bottom-6 left-6 right-6">
          <div className="text-xl sm:text-2xl font-bold text-white max-w-2xl">
            {city.focus}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-panel p-8 rounded-3xl">
            <h2 className="text-2xl font-bold text-white mb-4 text-wf-amber">Market Strategy</h2>
            <p className="text-wf-cream leading-relaxed">{city.marketStrategy}</p>
          </div>

          <div className="glass-panel p-8 rounded-3xl">
            <h2 className="text-2xl font-bold text-white mb-4">Exploration Focus</h2>
            <p className="text-wf-muted leading-relaxed">
              {city.focus}
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-panel border-wf-evergreen/30 p-6 rounded-3xl bg-wf-evergreen/5">
            <h3 className="text-white font-bold mb-4 flex items-center space-x-2">
              <Bed className="w-5 h-5 text-wf-evergreen" />
              <span>Recommended Base</span>
            </h3>
            <p className="text-wf-cream font-medium mb-4">{city.base}</p>
            {city.hotels.length > 0 && (
              <ul className="space-y-2">
                {city.hotels.map((hotel, idx) => (
                  <li key={idx} className="text-sm text-wf-muted flex items-start space-x-2">
                    <span className="text-wf-evergreen mt-0.5">•</span>
                    <span>{hotel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-panel border-wf-amber/30 p-6 rounded-3xl bg-wf-amber/5">
            <h3 className="text-white font-bold mb-4 flex items-center space-x-2">
              <Utensils className="w-5 h-5 text-wf-amber" />
              <span>Food Targets</span>
            </h3>
            {city.foodTargets.length > 0 ? (
              <ul className="space-y-2">
                {city.foodTargets.map((food, idx) => (
                  <li key={idx} className="text-sm text-wf-muted flex items-start space-x-2">
                    <span className="text-wf-amber mt-0.5">•</span>
                    <span>{food}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-wf-muted">Grab a quick lunch or market snack; no major sit-down planned.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
