import React, { useState, useRef } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { updateItem } from '../../utils/auctionApi';

export function InlineEditCell({ value, itemId, field, type = 'text', prefix, suffix, className = '', onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const startEdit = () => {
    setDraft(value != null ? (type === 'number' && !isNaN(Number(value)) ? Number(value).toFixed(2) : String(value)) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    const parsed = type === 'number' ? (parseFloat(draft) || 0) : draft.trim();
    if (parsed === value) { cancel(); return; }
    setSaving(true);
    try {
      const res = await updateItem(itemId, { [field]: parsed });
      const patch = { [field]: parsed };
      if (res?.min_sell_price !== undefined) patch.min_sell_price = res.min_sell_price;
      if (res?.suggested_list_price !== undefined) patch.suggested_list_price = res.suggested_list_price;
      if (res?.days_on_market !== undefined) patch.days_on_market = res.days_on_market;
      if (onUpdated) onUpdated(itemId, patch);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 w-full">
        {prefix && <span className="text-slate-500 text-xs">{prefix}</span>}
        <input
          ref={inputRef}
          type={type}
          step={type === 'number' ? '0.01' : undefined}
          className="w-full min-w-[70px] bg-slate-800 border border-amber-500/60 rounded px-2 py-0.5 text-xs text-slate-100 outline-none focus:border-amber-500"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          autoFocus
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />}
      </div>
    );
  }

  const display = value != null && value !== '' ? `${prefix || ''}${type === 'number' ? Number(value).toFixed(2) : value}${suffix || ''}` : '--';

  return (
    <div
      onClick={startEdit}
      className={`group cursor-pointer flex items-center justify-between gap-1 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors ${className}`}
      title="Click to edit cell"
    >
      <span className={value != null && value !== '' ? 'text-slate-200' : 'text-slate-600'}>{display}</span>
      <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
    </div>
  );
}
