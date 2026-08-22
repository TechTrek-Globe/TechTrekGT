import React from 'react';
import { Search } from 'lucide-react';

/**
 * QueryEditModal - Popup for previewing/editing the eBay search query
 * before sending it to the live comps API.
 * Extracted from PricingIntelligenceView.jsx.
 */
export function QueryEditModal({ queryEditModal, setQueryEditModal, onConfirmSearch }) {
  if (!queryEditModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={() => setQueryEditModal(null)}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-white">Edit eBay Search Query</h3>
          <p className="text-xs text-slate-400 mt-1">
            Trim or refine the query below before sending. Include the model name for better comp accuracy.
          </p>
        </div>

        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Item</div>
        <p className="text-sm text-slate-300 leading-snug -mt-2 line-clamp-2">{queryEditModal.item.item_name}</p>

        <div>
          <label className="block text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1.5">Search Query</label>
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
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 resize-none leading-relaxed"
            placeholder="e.g. Kawasaki Mule UTV Windshield"
          />
          <p className="text-[10px] text-slate-500 mt-1">Tip: Ctrl+Enter to search. Shorter focused queries work best on eBay.</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { onConfirmSearch(queryEditModal.item, queryEditModal.query); setQueryEditModal(null); }}
            disabled={!queryEditModal.query?.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50"
          >
            <Search className="w-4 h-4" /> Search eBay for Sold Comps
          </button>
          <button
            type="button"
            onClick={() => setQueryEditModal(null)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
