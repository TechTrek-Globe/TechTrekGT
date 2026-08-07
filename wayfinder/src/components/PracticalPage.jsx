import React from 'react';
import { ArrowLeft, Wallet, MessageSquare, Backpack, AlertTriangle } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';

export function PracticalPage() {
  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const { practicalTools } = polandJourney;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <a href="/wayfinder/poland-christmas-2026" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} className="inline-flex items-center text-sm font-medium text-wf-muted hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Overview
        </a>
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <span>Practical Resources & Logistics</span>
        </h1>
      </div>

      <div className="space-y-6">
        <div className="glass-panel p-6 rounded-3xl border-wf-amber/30">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
            <Wallet className="w-5 h-5 text-wf-amber" />
            <span>Currency & Payments</span>
          </h2>
          <p className="text-wf-cream">{practicalTools.currency}</p>
        </div>

        <div className="glass-panel p-6 rounded-3xl border-wf-blue/30">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
            <MessageSquare className="w-5 h-5 text-wf-blue-lt" />
            <span>Market Phrases</span>
          </h2>
          <p className="text-wf-cream leading-relaxed">{practicalTools.phrases}</p>
        </div>

        <div className="glass-panel p-6 rounded-3xl border-wf-evergreen/30">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
            <Backpack className="w-5 h-5 text-wf-evergreen" />
            <span>Winter Expedition Packing</span>
          </h2>
          <p className="text-wf-cream leading-relaxed">{practicalTools.packing}</p>
        </div>

        <div className="glass-panel p-6 rounded-3xl border-wf-cranberry/30 bg-wf-cranberry/5">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-wf-cranberry" />
            <span>Emergency & Offline Tools</span>
          </h2>
          <p className="text-wf-cream leading-relaxed">{practicalTools.emergency}</p>
        </div>
      </div>
    </div>
  );
}
