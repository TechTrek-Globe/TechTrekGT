import React, { useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { updateItem } from '../../utils/auctionApi';

export function InlineSelectCell({
  value,
  itemId,
  field,
  options = [],
  allowEmpty = true,
  emptyLabel = '-- None --',
  placeholder = '--',
  className = '',
  onUpdated
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const choose = async (val) => {
    const finalVal = val === '' ? null : val;
    if (finalVal === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await updateItem(itemId, { [field]: finalVal });
      const patch = { [field]: finalVal };
      if (res?.min_sell_price !== undefined) patch.min_sell_price = res.min_sell_price;
      if (res?.suggested_list_price !== undefined) patch.suggested_list_price = res.suggested_list_price;
      if (res?.days_on_market !== undefined) patch.days_on_market = res.days_on_market;
      if (onUpdated) onUpdated(itemId, patch);
    } catch (e) {
      console.error('Error updating select field:', e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    const safeOptions = Array.isArray(options) ? options : [];
    return (
      <div className="flex items-center gap-1 w-full min-w-[80px]">
        <select
          autoFocus
          className="w-full bg-slate-900 border border-amber-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
          value={value || ''}
          onChange={e => choose(e.target.value)}
          onBlur={() => setEditing(false)}
        >
          {allowEmpty && <option value="">{emptyLabel}</option>}
          {safeOptions.map(opt => {
            const optVal = typeof opt === 'object' && opt !== null ? opt.value : opt;
            const optLbl = typeof opt === 'object' && opt !== null ? opt.label : opt;
            return <option key={optVal} value={optVal}>{optLbl}</option>;
          })}
        </select>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />}
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`group cursor-pointer flex items-center justify-between gap-1 hover:bg-slate-800/80 rounded px-1 -mx-1 py-0.5 transition-colors ${className}`}
      title="Click to edit"
    >
      <span className={`truncate text-xs ${value ? 'text-slate-200' : 'text-slate-500'}`}>
        {value || placeholder}
      </span>
      <Pencil className="w-2.5 h-2.5 text-slate-600 group-hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
    </div>
  );
}
