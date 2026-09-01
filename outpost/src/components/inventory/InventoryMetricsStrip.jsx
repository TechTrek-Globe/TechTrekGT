import React from 'react';
import { Package, DollarSign, TrendingUp, CheckCircle2, ShieldAlert } from 'lucide-react';
import { fmtCurrency, formatPercent } from '../../utils/formulaPreview';
import { computeFeeBreakdown } from '../../utils/feeEngine';

export function InventoryMetricsStrip({ items = [] }) {
  const activeItems = items.filter(it => it.status === 'Available' || it.status === 'Listed' || it.status === 'Draft');

  const totalLandedCost = activeItems.reduce((s, it) => s + (Number(it.true_total_cost) || 0), 0);
  const totalListValue = activeItems.reduce((s, it) => s + (Number(it.current_list_price) || Number(it.suggested_list_price) || 0), 0);

  // Compute total profit & margin across active items
  let totalPotentialProfit = 0;
  activeItems.forEach(it => {
    const feeData = computeFeeBreakdown(it);
    totalPotentialProfit += feeData.netProfit;
  });

  const overallMargin = totalListValue > 0 ? (totalPotentialProfit / totalListValue) : 0;

  const itemsWithComps = activeItems.filter(it =>
    it.comp_1 > 0 || it.comp_2 > 0 || it.comp_3 > 0 || it.manual_avg > 0 ||
    it.active_comp_1 > 0 || it.active_comp_2 > 0 || it.active_comp_3 > 0 || it.active_avg > 0
  ).length;

  const coveragePct = activeItems.length > 0 ? (itemsWithComps / activeItems.length) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 flex-shrink-0 animate-fade-in">
      {/* 1. Active Inventory */}
      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Active Inventory</p>
          <p className="text-sm font-black text-white">
            {activeItems.length} <span className="text-[9px] font-normal text-slate-500">items</span>
          </p>
        </div>
        <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-400">
          <Package className="w-3 h-3" />
        </div>
      </div>

      {/* 2. Total Landed COGS */}
      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Total Landed COGS</p>
          <p className="text-sm font-black text-amber-400">
            {fmtCurrency(totalLandedCost)}
          </p>
        </div>
        <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-400">
          <DollarSign className="w-3 h-3" />
        </div>
      </div>

      {/* 3. Listed Market Value */}
      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Total Portfolio Value</p>
          <p className="text-sm font-black text-blue-400">
            {fmtCurrency(totalListValue)}
          </p>
        </div>
        <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400">
          <TrendingUp className="w-3 h-3" />
        </div>
      </div>

      {/* 4. Potential Net Profit / Margin */}
      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Est Net Profit (ROI)</p>
          <p className="text-sm font-black text-emerald-400">
            {fmtCurrency(totalPotentialProfit)} <span className="text-[9px] font-semibold text-emerald-500/80">({formatPercent(overallMargin, 1)})</span>
          </p>
        </div>
        <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <TrendingUp className="w-3 h-3" />
        </div>
      </div>

      {/* 5. Comps Coverage */}
      <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between col-span-2 sm:col-span-1">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Comps Intelligence</p>
          <p className="text-sm font-black text-cyan-400">
            {itemsWithComps} <span className="text-[9px] font-normal text-slate-500">/ {activeItems.length} ({Math.round(coveragePct)}%)</span>
          </p>
        </div>
        <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center text-cyan-400">
          <CheckCircle2 className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
