import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ChevronDown, Check } from 'lucide-react';
import { updateItem, syncEbayItem } from '../../utils/auctionApi';
import { StatusBadge } from './StatusBadge';
import { ALL_STATUSES } from '../../utils/constants';

export function InlineStatusSelect({ itemId, current, item, onUpdated, onMarkSold }) {
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
    if (status === current) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      if (status === 'Sold' && (item?.ebay_listing_id || item?.platform === 'eBay')) {
        try {
          const syncRes = await syncEbayItem(itemId, item?.ebay_listing_id);
          if (syncRes?.is_sold || syncRes?.sale) {
            if (onUpdated) {
              onUpdated(itemId, { status: 'Sold', ...(syncRes.item || {}) }, { fromEbaySync: true, sale: syncRes.sale });
            }
            return;
          }
        } catch (syncErr) {
          console.warn('[InlineStatusSelect] eBay sync check exception:', syncErr);
        }
      }

      const payload = { status };
      if (status === 'Sold') {
        payload.date_sold = new Date().toISOString().split('T')[0];
      }
      const res = await updateItem(itemId, payload);
      const patch = { ...payload };
      if (res?.min_sell_price !== undefined) patch.min_sell_price = res.min_sell_price;
      if (res?.suggested_list_price !== undefined) patch.suggested_list_price = res.suggested_list_price;
      if (res?.days_on_market !== undefined) patch.days_on_market = res.days_on_market;

      if (onUpdated) {
        onUpdated(itemId, patch);
      }

      if (status === 'Sold' && onMarkSold) {
        onMarkSold(item ? { ...item, ...patch } : { id: itemId, ...patch });
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
        <div className="absolute left-0 top-full mt-1 z-50 rounded-xl border border-slate-700 shadow-2xl min-w-[140px] overflow-hidden bg-slate-900/95 backdrop-blur-md">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors flex items-center gap-2 cursor-pointer ${s === current ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}
            >
              {s === current ? <Check className="w-3 h-3 flex-shrink-0" /> : <span className="w-3" />}
              <span>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
