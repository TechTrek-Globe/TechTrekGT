import React from 'react';
import { ArrowLeft, Calendar, Compass } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

export function MarketsPage() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <a href="/wayfinder/poland-christmas-2026" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} className="inline-flex items-center text-sm font-medium text-wf-muted hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Overview
        </a>
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <Calendar className="w-8 h-8 text-wf-blue-lt" />
          <span>Christmas Market Strategy</span>
        </h1>
      </div>

      <div className="glass-panel p-8 rounded-3xl mb-8">
        <h2 className="text-xl font-bold text-white mb-4">The Evening Anchor Approach</h2>
        <p className="text-wf-cream leading-relaxed">{polandJourney.marketStrategy}</p>
      </div>

      <div className="space-y-4">
        {polandJourney.route.filter(c => c.nights > 0).map((city, idx) => (
          <div key={city.id} className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 relative overflow-hidden group hover:border-amber-500/30 transition-colors border border-white/5">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-amber-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <div 
              className="w-full sm:w-24 sm:h-24 h-32 rounded-xl bg-cover bg-center shrink-0 shadow-md border border-white/10"
              style={{ backgroundImage: `url('/${city.id}.png')` }}
            ></div>
            <div className="flex-1 relative z-10">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-amber-400 font-black text-xs uppercase tracking-wider">Stop 0{idx + 1}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{city.name} Market Rhythm</h3>
              <p className="text-wf-muted leading-relaxed">{city.marketStrategy}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
