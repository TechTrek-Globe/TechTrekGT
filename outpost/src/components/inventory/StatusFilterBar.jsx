import React from 'react';
import { STATUS_META, ALL_STATUSES } from '../../utils/constants';

export function StatusFilterBar({
  statusFilter,
  setStatusFilter,
  statusCounts = {},
  totalCount = 0
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0 pt-0.5">
      <button
        onClick={() => setStatusFilter('')}
        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all border ${
          !statusFilter
            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            : 'text-slate-500 border-slate-800/80 hover:text-slate-300'
        }`}
      >
        All ({totalCount})
      </button>

      {ALL_STATUSES.map(s => {
        const m = STATUS_META[s] || {
          color: 'text-slate-400',
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/20'
        };
        const count = statusCounts[s] || 0;
        const active = statusFilter === s;

        return (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all border flex items-center gap-1.5 ${
              active
                ? `${m.color} ${m.bg} ${m.border} shadow-sm`
                : 'text-slate-500 border-slate-800/80 hover:text-slate-300'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-current' : 'bg-slate-600'}`} />
            <span>{s}</span>
            <span className={`text-[10px] ${active ? 'opacity-90' : 'opacity-60'}`}>({count})</span>
          </button>
        );
      })}
    </div>
  );
}
