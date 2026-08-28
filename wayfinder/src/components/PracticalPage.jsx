import React from 'react';
import { ArrowLeft, Wallet, MessageSquare, Backpack, AlertTriangle, RefreshCw } from 'lucide-react';
import { polandJourney } from '../data/poland-2026';
import { useExchangeRate } from '../hooks/useExchangeRate';

export function PracticalPage() {
  const exchangeRates = useExchangeRate();

  const pushRoute = (e, path) => {
    e.preventDefault();
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const { practicalTools } = polandJourney;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="mb-8">
        <a href="/wayfinder/poland-christmas-2026" onClick={(e) => pushRoute(e, '/wayfinder/poland-christmas-2026')} className="inline-flex items-center text-sm font-medium text-wf-muted hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Overview
        </a>
        <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
          <span>Practical Resources & Logistics</span>
        </h1>
      </div>

      <div className="space-y-6">
        <div className="glass-panel p-6 rounded-3xl border-wf-amber/30 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <Wallet className="w-5 h-5 text-wf-amber" />
              <span>Currency & Payments</span>
            </h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Live Market Rates</span>
            </span>
          </div>
          
          <p className="text-wf-cream leading-relaxed">{practicalTools.currency}</p>

          <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="p-2 rounded-xl bg-white/5">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">USD to PLN</span>
              <span className="text-lg font-black text-amber-300">1 USD = {exchangeRates.usdToPln} PLN</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">EUR to PLN</span>
              <span className="text-lg font-black text-amber-300">1 EUR = {exchangeRates.eurToPln} PLN</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">GBP to PLN</span>
              <span className="text-lg font-black text-amber-300">1 GBP = {exchangeRates.gbpToPln} PLN</span>
            </div>
          </div>
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
