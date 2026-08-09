import React from 'react';
import { Map, MapPin, Train, ArrowRight, ArrowLeft } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

export function RouteVisualization() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <a href="/wayfinder/poland-christmas-2026" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} className="inline-flex items-center text-sm font-medium text-wf-muted hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Overview
          </a>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Map className="w-8 h-8 text-wf-blue-lt" />
            <span>Route Map & Connections</span>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column: Abstract Map */}
        <div className="lg:col-span-5 relative">
          <div className="sticky top-24 glass-card rounded-3xl p-8 h-[600px] flex items-center justify-center">
            {/* Very simple abstract vertical line map representing South to North progression */}
            <div className="relative h-full w-full max-w-[200px] mx-auto flex flex-col justify-between py-12">
              <div className="absolute top-12 bottom-12 left-1/2 -ml-1 w-2 bg-wf-navy-lt rounded-full" />
              <div className="absolute top-12 bottom-12 left-1/2 -ml-1 w-2 bg-gradient-to-t from-wf-blue via-wf-blue-lt to-wf-evergreen rounded-full opacity-50" />
              
              {polandJourney.route.map((city, idx) => {
                const isGdansk = city.id === 'gdansk';
                const isKrakow = city.id === 'krakow';
                return (
                  <div key={city.id} className="relative z-10 flex items-center">
                    <div className="w-1/2 flex justify-end pr-6 text-right">
                      <div className="text-white font-bold">{city.name}</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-4 border-wf-navy-mid ${isGdansk ? 'bg-wf-evergreen' : isKrakow ? 'bg-wf-blue' : 'bg-wf-amber'}`} />
                    <div className="w-1/2 pl-6">
                      <div className="text-xs text-wf-muted">{city.nights > 0 ? `${city.nights} nights` : 'Day Stop'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-wf-muted">
              South to North Progression
            </div>
          </div>
        </div>

        {/* Right Column: Connection Details */}
        <div className="lg:col-span-7 space-y-8">
          <div className="glass-panel rounded-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
              <Train className="w-5 h-5 text-wf-amber" />
              <span>Intercity Rail Strategy</span>
            </h2>
            
            <div className="space-y-8">
              {polandJourney.railConnections.map((conn, idx) => (
                <div key={idx} className="relative">
                  {idx < polandJourney.railConnections.length - 1 && (
                    <div className="absolute top-14 bottom-[-32px] left-[15px] w-px bg-white/10" />
                  )}
                  
                  <div className="flex items-start space-x-6">
                    <div className="w-8 h-8 rounded-full bg-wf-navy-mid border border-wf-amber/30 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_15px_rgba(212,130,26,0.15)] text-wf-amber text-xs font-bold">
                      {idx + 1}
                    </div>
                    
                    <div className="flex-1 bg-white/5 border border-white/5 rounded-xl p-5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-white text-lg">{conn.from} <ArrowRight className="inline w-4 h-4 text-wf-muted mx-1" /> {conn.to}</div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                        <div>
                          <div className="text-xs text-wf-muted uppercase tracking-wider mb-1">Target Timing</div>
                          <div className="text-wf-cream font-medium">{conn.timing}</div>
                        </div>
                        <div>
                          <div className="text-xs text-wf-muted uppercase tracking-wider mb-1">Seat Strategy</div>
                          <div className="text-wf-blue-lt font-medium">{conn.class}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="glass-panel border-wf-blue/30 rounded-2xl p-6 bg-wf-blue/5">
            <h3 className="text-white font-bold mb-2">Why 1st Class?</h3>
            <p className="text-sm text-wf-muted leading-relaxed">
              For Polish PKP Intercity (IC/EIP) trains, the price difference between 2nd and 1st class is often negligible when booked in advance. 1st class provides significantly more luggage space, wider seats, and a quieter environment, allowing these transit legs to serve as true rest periods between intensive walking days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
