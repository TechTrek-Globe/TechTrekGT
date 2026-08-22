import React from 'react';
import { TrendingUp, CheckCircle2, ExternalLink } from 'lucide-react';
import { fmtCurrency } from '../../utils/formulaPreview';

/**
 * InventoryMetrics - Ultra-compact metrics banner for the consolidated Inventory & Pricing view.
 */
export function InventoryMetrics({ items }) {
  const activeItems = items.filter(it => it.status === 'Available' || it.status === 'Listed');
  const totalLandedCost = activeItems.reduce((s, it) => s + (it.true_total_cost || 0), 0);
  const itemsWithComps = activeItems.filter(it => it.comp_1 > 0 || it.comp_2 > 0 || it.comp_3 > 0 || it.manual_avg > 0).length;
  const coveragePct = activeItems.length > 0 ? (itemsWithComps / activeItems.length) * 100 : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-shrink-0">
      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Active Inventory</p>
          <p className="text-sm font-black text-white">{activeItems.length} <span className="text-[10px] font-normal text-slate-500">items</span></p>
        </div>
        <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-400">
          <TrendingUp className="w-3 h-3" />
        </div>
      </div>

      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Total Landed Cost</p>
          <p className="text-sm font-black text-amber-400">{fmtCurrency(totalLandedCost)}</p>
        </div>
        <div className="w-5 h-5 rounded-md bg-cyan-500/10 flex items-center justify-center text-cyan-400">
          <TrendingUp className="w-3 h-3" />
        </div>
      </div>

      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Comps Coverage</p>
          <p className="text-sm font-black text-emerald-400">{itemsWithComps} <span className="text-[10px] font-normal text-slate-500">/ {activeItems.length} ({Math.round(coveragePct)}%)</span></p>
        </div>
        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
        </div>
      </div>

      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div className="truncate pr-1">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Comp Strategy</p>
          <p className="text-xs font-semibold text-slate-200 truncate">3-Comp Median &amp; Sold</p>
        </div>
        <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
