import React from 'react';
import { PricingCard } from './PricingCard';

export function PricingCardList({ items, pagination, onPageChange, onOpenCopyModal, onOpenQueryEdit, onItemUpdated }) {
  const activeItems = (items || []).filter(it => it.status !== 'Sold');
  const soldItems = (items || []).filter(it => it.status === 'Sold');

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-500">
            No items found matching your filters.
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {/* Active Items */}
            {activeItems.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeItems.map(item => (
                  <PricingCard
                    key={item.id}
                    item={item}
                    onOpenCopyModal={onOpenCopyModal}
                    onOpenQueryEdit={onOpenQueryEdit}
                    onItemUpdated={onItemUpdated}
                  />
                ))}
              </div>
            )}

            {/* Sold Items Section (Bottom) */}
            {soldItems.length > 0 && (
              <div className="space-y-3 pt-2">
                {activeItems.length > 0 && (
                  <div className="flex items-center justify-between border-t border-slate-800 pt-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Sold Items</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-emerald-400 font-semibold border border-emerald-500/20">
                        {soldItems.length}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">Completed Transactions</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-80">
                  {soldItems.map(item => (
                    <PricingCard
                      key={item.id}
                      item={item}
                      onOpenCopyModal={onOpenCopyModal}
                      onOpenQueryEdit={onOpenQueryEdit}
                      onItemUpdated={onItemUpdated}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/40 bg-slate-950/20 mt-2">
          <span className="text-xs text-slate-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} items)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
