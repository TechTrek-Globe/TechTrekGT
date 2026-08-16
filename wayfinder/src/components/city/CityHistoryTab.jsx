import React from 'react';
import { BookOpen, Crown, Award, MapPin, Landmark, Sparkles } from 'lucide-react';

export function CityHistoryTab({ city, activeEpochTab, setActiveEpochTab }) {
  if (!city.history) return null;

  return (
    <div id="chronological-history-section" className="space-y-8 animate-fade-in scroll-mt-32">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-white flex items-center space-x-3">
          <BookOpen className="w-7 h-7 text-amber-400" />
          <span>Chronological History & Heritage of {city.name}</span>
        </h2>
        <span className="px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider">
          1,000+ Years Living Timeline
        </span>
      </div>

      <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-amber-500/30 bg-wf-navy-mid/90 relative overflow-hidden shadow-2xl space-y-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none"></div>

        {/* Historical Stats Grid */}
        {city.historyStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {city.historyStats.map((stat, idx) => (
              <div key={idx} className="p-3 sm:p-4 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-amber-500/40 transition-colors">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80 mb-1 flex items-center space-x-1.5">
                  {stat.icon === 'Crown' && <Crown className="w-3.5 h-3.5" />}
                  {stat.icon === 'Award' && <Award className="w-3.5 h-3.5" />}
                  {stat.icon === 'MapPin' && <MapPin className="w-3.5 h-3.5" />}
                  {stat.icon === 'Landmark' && <Landmark className="w-3.5 h-3.5" />}
                  <span>{stat.label}</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-white leading-tight">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Narrative Overview */}
        <p className="text-wf-cream text-sm sm:text-base md:text-lg leading-relaxed font-medium">
          {city.history}
        </p>
      </div>

      {/* Chronological Historical Epochs Timeline */}
      {city.historyEpochs && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
              <BookOpen className="w-5 h-5" />
              <span>Chronological Journey Through Time</span>
            </div>

            {/* Filterable Era Tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar no-overscroll-x py-1">
              <button
                onClick={() => setActiveEpochTab('all')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer ${
                  activeEpochTab === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                    : 'bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-amber-400/40'
                }`}
              >
                All Historical Eras ({city.historyEpochs.length})
              </button>
              {city.historyEpochs.map((epoch, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveEpochTab(idx)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    activeEpochTab === idx
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                      : 'bg-slate-900/90 text-slate-300 hover:text-white border border-white/10 hover:border-amber-400/40'
                  }`}
                >
                  {epoch.era}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {city.historyEpochs
              .filter((_, idx) => activeEpochTab === 'all' || activeEpochTab === idx)
              .map((epoch) => {
                const originalIdx = city.historyEpochs.indexOf(epoch);
                return (
                  <div 
                    key={originalIdx} 
                    className="glass-panel p-6 sm:p-8 rounded-3xl border border-amber-500/30 hover:border-amber-400 bg-wf-navy/90 backdrop-blur-md transition-all group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center space-x-3">
                        <span className="w-8 h-8 rounded-full bg-amber-400/20 text-amber-300 font-black text-sm flex items-center justify-center border border-amber-400/40 shrink-0">
                          {originalIdx + 1}
                        </span>
                        <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-amber-300 transition-colors">
                          {epoch.title}
                        </h3>
                      </div>
                      <span className="inline-block px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-400 text-xs font-black self-start sm:self-auto shrink-0">
                        {epoch.era}
                      </span>
                    </div>

                    {epoch.subtitle && (
                      <div className="text-xs sm:text-sm font-semibold text-amber-200/90 mb-2 pl-11">
                        {epoch.subtitle}
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed pl-11">
                      {epoch.description}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Living Folklore & Cultural Traditions */}
      {city.historyLegends && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
            <Sparkles className="w-5 h-5" />
            <span>Living Folklore & Cultural Traditions</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {city.historyLegends.map((legend, idx) => (
              <div 
                key={idx} 
                className="glass-panel p-5 sm:p-6 rounded-2xl border border-amber-500/20 hover:border-amber-400/50 bg-wf-navy/90 flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="text-2xl mb-2.5">{legend.icon}</div>
                  <h4 className="text-sm sm:text-base font-black text-white mb-2 leading-snug">
                    {legend.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    {legend.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CityHistoryTab;
