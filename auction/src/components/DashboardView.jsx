import React from 'react';
import { Gavel, Package, TrendingUp, DollarSign, BarChart2, Clock } from 'lucide-react';

/**
 * Phase 1 placeholder dashboard - wired in Phase 4.
 * Shows static card skeletons so layout is immediately visible post-login.
 */
export function DashboardView() {
  const kpis = [
    { label: 'Total Items',       value: '--',   sub: 'in inventory',        icon: Package,    color: 'text-amber-400',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
    { label: 'Capital Tied Up',   value: '$--',  sub: 'at true cost',        icon: DollarSign, color: 'text-blue-400',    bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
    { label: 'Realized Profit',   value: '$--',  sub: 'from sold items',     icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'Blended ROI',       value: '--%',  sub: 'across all sales',    icon: BarChart2,  color: 'text-violet-400',  bg: 'bg-violet-500/10', border: 'border-violet-500/20'  },
    { label: 'Items Listed',      value: '--',   sub: 'currently active',    icon: Gavel,      color: 'text-amber-400',   bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
    { label: 'Avg Days on Market',value: '--',   sub: 'days to sell',        icon: Clock,      color: 'text-slate-400',   bg: 'bg-slate-500/10',  border: 'border-slate-500/20'  },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Prestine Auction — Collection Overview</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg, border }) => (
          <div key={label} className={`glass-card rounded-2xl p-5 border ${border}`}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
              <div className={`w-8 h-8 rounded-lg ${bg} border ${border} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Coming soon notice */}
      <div className="glass-card rounded-2xl p-6 border border-amber-500/10 text-center">
        <Gavel className="w-8 h-8 text-amber-400/40 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-300">Full dashboard coming in Phase 4</p>
        <p className="text-xs text-slate-500 mt-1">Inventory, Sales Log, and Pricing Intelligence are being built in Phases 2-3. Data will populate here once items and sales are logged.</p>
      </div>
    </div>
  );
}
