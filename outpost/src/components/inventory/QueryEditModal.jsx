import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * QueryEditModal - Dialog for previewing/editing the eBay search query
 * before dispatching to the live comps API.
 */
export function QueryEditModal({ queryEditModal, setQueryEditModal, onConfirmSearch }) {
  if (!queryEditModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={() => setQueryEditModal(null)}
    >
      <div
        className="w-full max-w-lg glass-card bg-slate-900/95 border border-amber-500/30 rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Search className="w-4 h-4 text-amber-400" />
              Edit eBay Search Query
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Refine the query keywords before scanning eBay marketplace comps.
            </p>
          </div>
          <button
            onClick={() => setQueryEditModal(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">Target Item</span>
          <p className="text-xs text-slate-200 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 line-clamp-2 leading-relaxed">
            {queryEditModal.item.item_name}
          </p>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1">
            Search Query Keywords
          </label>
          <textarea
            autoFocus
            rows={3}
            value={queryEditModal.query}
            onChange={e => setQueryEditModal(prev => ({ ...prev, query: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                onConfirmSearch(queryEditModal.item, queryEditModal.query);
                setQueryEditModal(null);
              }
              if (e.key === 'Escape') setQueryEditModal(null);
            }}
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none font-mono"
            placeholder="e.g. Patrick Mahomes Signed Jersey Beckett COA"
          />
          <p className="text-[10px] text-slate-500 mt-1">Press Ctrl+Enter to search. Concise titles yield highest match rates.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onConfirmSearch(queryEditModal.item, queryEditModal.query);
              setQueryEditModal(null);
            }}
            disabled={!queryEditModal.query?.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50 shadow-md"
          >
            <Search className="w-3.5 h-3.5" /> Scan eBay Sold Comps
          </button>
          <button
            type="button"
            onClick={() => setQueryEditModal(null)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
