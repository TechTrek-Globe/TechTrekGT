import React from 'react';
import { Utensils, Volume2 } from 'lucide-react';

export function CulinaryHighlightsSection({ highlights }) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="space-y-6 mb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center space-x-1">
            <Utensils className="w-4 h-4" />
            <span>Authentic Market Flavors</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Culinary Highlights & Pronunciation Guide</h2>
        </div>
        <span className="text-xs text-slate-400 font-medium">Phonetics included for easy ordering</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {highlights.map((item, idx) => (
          <div key={idx} className="glass-panel p-6 rounded-3xl border border-amber-500/20 hover:border-amber-500/50 bg-wf-navy-mid/90 transition-all flex flex-col justify-between group shadow-lg">
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-lg font-black text-white group-hover:text-amber-300 transition-colors leading-snug">
                  {item.name}
                </h3>
                <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold shrink-0 flex items-center space-x-1 max-w-full">
                  <Volume2 className="w-3 h-3 text-amber-400" />
                  <span>Pronunciation</span>
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-xs text-amber-300 tracking-wide flex items-center space-x-2">
                <span className="text-slate-500 select-none">🗣️</span>
                <span className="font-semibold">{item.phonetic}</span>
              </div>

              <div className="text-xs font-bold text-amber-400/90 uppercase tracking-wider">
                {item.english}
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                {item.description}
              </p>
            </div>

            {item.tip && (
              <div className="mt-4 pt-3 border-t border-white/10 text-xs text-emerald-300 flex items-start space-x-2">
                <span className="shrink-0 mt-0.5">💡</span>
                <span className="leading-snug">{item.tip}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default CulinaryHighlightsSection;
