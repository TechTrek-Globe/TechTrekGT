import React from 'react';
import { ArrowLeft, Bed, Utensils } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

export function StaysAndFoodPage() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <a href="/wayfinder/poland-christmas-2026" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} className="inline-flex items-center text-sm font-medium text-wf-muted hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Overview
        </a>
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <Bed className="w-8 h-8 text-wf-evergreen" />
          <span>Neighborhoods & Food Targets</span>
        </h1>
      </div>

      <div className="space-y-12">
        {polandJourney.route.filter(c => c.nights > 0).map((city) => (
          <div key={city.id} className="relative rounded-3xl overflow-hidden border border-white/5">
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url('/wayfinder/${city.id}.png')` }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-r from-wf-navy via-wf-navy/90 to-wf-navy/80"></div>
            
            <div className="relative p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel p-6 rounded-3xl border-wf-evergreen/30 bg-wf-evergreen/5 backdrop-blur-xl">
                <h3 className="text-xl font-bold text-white mb-2 flex items-center space-x-2">
                  <span>{city.name} Base</span>
                </h3>
                <p className="text-wf-cream font-medium mb-4">{city.base}</p>
                
                <div className="space-y-2">
                  {city.hotels.map((hotel, idx) => (
                    <div key={idx} className="text-sm text-wf-muted flex items-start space-x-2">
                      <span className="text-wf-evergreen mt-0.5">•</span>
                      <span>{hotel}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-6 rounded-3xl border-wf-amber/30 bg-wf-amber/5 backdrop-blur-xl">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                  <Utensils className="w-5 h-5 text-wf-amber" />
                  <span>Food Targets</span>
                </h3>
                
                <div className="space-y-2">
                  {city.foodTargets.map((food, idx) => (
                    <div key={idx} className="text-sm text-wf-muted flex items-start space-x-2">
                      <span className="text-wf-amber mt-0.5">•</span>
                      <span>{food}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
