import React from 'react';
import { STATUS_META } from '../../utils/constants';

export function StatusBadge({ status, onClick, className = '' }) {
  const normalized = status || 'Available';
  const meta = STATUS_META[normalized] || {
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20'
  };

  return (
    <span
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${meta.color} ${meta.bg} ${meta.border} ${onClick ? 'cursor-pointer hover:brightness-125' : ''} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {normalized}
    </span>
  );
}
