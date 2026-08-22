import React, { useState } from 'react';
import { Loader2, ChevronDown, Check } from 'lucide-react';
import { updateItem } from '../../utils/auctionApi';
import { StatusBadge } from './StatusBadge';
import { ALL_STATUSES } from '../../utils/constants';

export function InlineStatusSelect({ itemId, current, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const choose = async (status) => {
    if (status === current) { setOpen(false); return; }
    setSaving(true);
    try {
      const res = await updateItem(itemId, { status });
      const patch = { status };
      if (res?.min_sell_price !== undefined) patch.min_sell_price = res.min_sell_price;
      if (res?.suggested_list_price !== undefined) patch.suggested_list_price = res.suggested_list_price;
      if (res?.days_on_market !== undefined) patch.days_on_market = res.days_on_market;
      onUpdated(itemId, patch);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 group">
        <StatusBadge status={current} />
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
          : <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 glass-card rounded-xl border border-slate-700 shadow-xl min-w-[140px] overflow-hidden">
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => choose(s)} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800/60 transition-colors flex items-center gap-2 ${s === current ? 'text-amber-400' : 'text-slate-300'}`}>
              {s === current && <Check className="w-3 h-3 flex-shrink-0" />}
              <span className={s !== current ? 'ml-5' : ''}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
