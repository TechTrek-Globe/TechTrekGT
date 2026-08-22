import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ChevronDown, Check } from 'lucide-react';
import { updateItem } from '../../utils/auctionApi';
import { StatusBadge } from './StatusBadge';
import { ALL_STATUSES } from '../../utils/constants';

export function InlineStatusSelect({ itemId, current, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const choose = async (status) => {
    if (status === current) { setOpen(false); return; }
    setSaving(true);
    try {
      if (onUpdated) {
        await onUpdated(itemId, { status });
      } else {
        await updateItem(itemId, { status });
      }
    } catch (e) {
      console.error('Status update error:', e);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 group cursor-pointer"
      >
        <StatusBadge status={current} />
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
          : <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 glass-card rounded-xl border border-slate-700 shadow-2xl min-w-[140px] overflow-hidden bg-slate-900/95 backdrop-blur-md">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer ${s === current ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}
            >
              {s === current && <Check className="w-3 h-3 flex-shrink-0" />}
              <span className={s !== current ? 'ml-5' : ''}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
