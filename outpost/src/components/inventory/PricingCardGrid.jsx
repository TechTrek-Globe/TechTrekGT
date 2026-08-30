import React from 'react';
import { PricingCard } from './PricingCard';

export function PricingCardGrid({
  items = [],
  pagination,
  onPageChange,
  onOpenCopyModal,
  onOpenQueryEdit,
  onItemUpdated,
  onOpenQuickEdit,
  onOpenListingIdModal
}) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 glass-card rounded-2xl border border-slate-800 text-slate-500">
        <p className="text-sm font-semibold">No items match your filter criteria.</p>
        <p className="text-xs text-slate-600 mt-1">Try broadening your search or resetting filters.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-3">
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {items.map(item => (
            <PricingCard
              key={item.id}
              item={item}
              onOpenCopyModal={onOpenCopyModal}
              onOpenQueryEdit={onOpenQueryEdit}
              onItemUpdated={onItemUpdated}
              onOpenQuickEdit={onOpenQuickEdit}
              onOpenListingIdModal={onOpenListingIdModal}
            />
          ))}
        </div>
      </div>

      {/* Pagination Footer */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800/80 glass-card rounded-xl">
          <span className="text-xs text-slate-400">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total items)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 rounded-lg text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-all"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="px-3 py-1 rounded-lg text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
