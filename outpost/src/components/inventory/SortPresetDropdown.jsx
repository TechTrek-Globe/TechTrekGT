import React from 'react';
import { ArrowUpDown } from 'lucide-react';

export function SortPresetDropdown({ sortPreset, onSelectPreset }) {
  return (
    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
      <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
      <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">Sort:</span>
      <select
        value={sortPreset}
        onChange={e => onSelectPreset(e.target.value)}
        className="bg-transparent text-slate-200 outline-none cursor-pointer text-xs font-semibold"
      >
        <option value="default" className="bg-slate-900 text-slate-200">Recent Added</option>
        <option value="margin-desc" className="bg-slate-900 text-slate-200">Highest Margin (%)</option>
        <option value="margin-asc" className="bg-slate-900 text-slate-200">Lowest Margin (%)</option>
        <option value="price-desc" className="bg-slate-900 text-slate-200">Price: High to Low</option>
        <option value="price-asc" className="bg-slate-900 text-slate-200">Price: Low to High</option>
        <option value="date-newest" className="bg-slate-900 text-slate-200">Newest Acquired</option>
        <option value="date-oldest" className="bg-slate-900 text-slate-200">Oldest Acquired</option>
        {sortPreset === 'custom' && <option value="custom" className="bg-slate-900 text-amber-400">Custom Column Sort</option>}
      </select>
    </div>
  );
}
