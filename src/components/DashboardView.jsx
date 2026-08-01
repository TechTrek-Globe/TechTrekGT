import React, { useState, useMemo } from 'react';
import { useBudget } from '../context/BudgetContext';
import { InlineEdit } from './InlineEdit';
import { AccountTransferSummary } from './AccountTransferSummary';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  PieChart as PieIcon,
  ShieldCheck,
  Zap,
  CreditCard,
  GripVertical,
  EyeOff,
  LayoutDashboard,
  Users,
  Calendar,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { fmtMoney, fmtPct } from '../utils/formatters';

const ACCOUNT_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Radial health gauge (SVG-based)
function HealthGauge({ score }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#f43f5e';
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Fair' : 'At Risk';

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <svg width="90" height="90" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="text-center -mt-14">
        <span className="text-xl font-black font-mono" style={{ color }}>{score}</span>
        <p className="text-[9px] font-semibold" style={{ color }}>{label}</p>
      </div>
    </div>
  );
}

export function DashboardView() {
  const {
    budget,
    dashboardWidgets,
    toggleDashboardWidgetVisibility,
    reorderDashboardWidgets,
    setIsSettingsOpen,
    setSettingsTab,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalCashOnHand,
    getAccountMonthlyExpenses,
    getUpcomingBills,
    getBillPersonMonthlyPortion,
    getPersonMonthlyTotal,
    getPersonPerPaycheckTotal,
    getTotalActualExpenses,
    getAccountActualExpenses,
    updateAccount,
  } = useBudget();

  const [draggedIdx, setDraggedIdx] = useState(null);

  const today    = new Date();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const netIncome     = getTotalMonthlyNetIncome();
  const totalExpenses  = getTotalMonthlyExpenses();
  const netCashFlow   = netIncome - totalExpenses;
  const savingsRate   = netIncome > 0 ? ((netCashFlow / netIncome) * 100) : 0;
  const cashOnHand    = getTotalCashOnHand();
  const upcomingBills = getUpcomingBills(5);

  // Budget health score (0-100)
  const healthScore = useMemo(() => {
    let score = 100;
    if (netIncome > 0) {
      const expenseRatio = totalExpenses / netIncome;
      if (expenseRatio > 1.0)  score -= 40;
      else if (expenseRatio > 0.9) score -= 20;
      else if (expenseRatio > 0.75) score -= 10;
    } else { score -= 30; }
    if (savingsRate < 10) score -= 15;
    else if (savingsRate < 20) score -= 5;
    budget.accounts.forEach(acc => {
      const expenses = getAccountMonthlyExpenses(acc.id);
      if ((acc.startingBalance || 0) - expenses < 0) score -= 10;
    });
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [budget, netIncome, totalExpenses, savingsRate]);

  // Chart data
  const accountChartData = budget.accounts.map((acc, i) => ({
    name: acc.name.split('-')[0].trim(),
    value: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
    color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]
  })).filter(d => d.value > 0);

  const projActualData = budget.accounts.map((acc, i) => ({
    name: acc.name.split('-')[0].trim(),
    projected: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
    actual: parseFloat(getAccountActualExpenses(acc.id, monthKey).toFixed(2)),
  })).filter(d => d.projected > 0);

  const visibleWidgets = dashboardWidgets.filter(w => w.visible);

  // Render widget body content based on widget ID
  const renderWidgetContent = (id) => {
    switch (id) {
      case 'kpi_hero':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl glass-panel border border-blue-900/30 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-400 block">Total Cash on Hand</span>
                <div className="text-2xl font-black text-slate-100 font-mono mt-1">{fmtMoney(cashOnHand)}</div>
                <div className="flex items-center gap-2 mt-2 text-[11px]">
                  <span className="text-slate-500">Net Flow:</span>
                  <span className={`font-mono font-bold ${netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {netCashFlow >= 0 ? '+' : ''}{fmtMoney(netCashFlow)}
                  </span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
                <DollarSign className="w-5.5 h-5.5 text-blue-400" />
              </div>
            </div>

            <div className="p-5 rounded-2xl glass-panel border border-emerald-900/30 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-400 block">Monthly Income vs Expenses</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-emerald-400 font-mono">{fmtMoney(netIncome)}</span>
                  <span className="text-xs text-slate-500 font-mono">/ {fmtMoney(totalExpenses)} exp</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px]">
                  <span className="text-slate-500">Earners:</span>
                  <span className="font-semibold text-slate-300">{budget.people.length} members</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <TrendingUp className="w-5.5 h-5.5 text-emerald-400" />
              </div>
            </div>

            <div className="p-5 rounded-2xl glass-panel border border-purple-900/30 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-400 block">Savings Rate</span>
                <div className="text-2xl font-black text-purple-400 font-mono mt-1">{fmtPct(savingsRate)}</div>
                <div className="flex items-center gap-2 mt-2 text-[11px]">
                  <span className="text-slate-500 font-medium">Target 20%:</span>
                  <span className={savingsRate >= 20 ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {savingsRate >= 20 ? 'On Target' : 'Below Target'}
                  </span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                <PieIcon className="w-5.5 h-5.5 text-purple-400" />
              </div>
            </div>
          </div>
        );

      case 'transfer_summary':
        return <AccountTransferSummary />;

      case 'account_cards':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {budget.accounts.map((acc, i) => {
              const monthlyCost = getAccountMonthlyExpenses(acc.id);
              const projEnd     = (acc.startingBalance || 0) - monthlyCost;
              const accentColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];

              return (
                <div
                  key={acc.id}
                  className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all"
                  style={{ borderLeftColor: accentColor, borderLeftWidth: '4px' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{acc.name}</h4>
                      <span className="text-[10px] text-slate-500 capitalize">{acc.type}</span>
                    </div>
                    <div className="text-right">
                      <InlineEdit
                        value={acc.startingBalance || 0}
                        type="currency"
                        onCommit={v => updateAccount(acc.id, { startingBalance: v })}
                        className="text-sm font-black text-slate-100 font-mono justify-end"
                      />
                      <span className="text-[9px] text-slate-500 block mt-0.5">Current Balance</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 font-sans text-[11px]">Monthly Obligations:</span>
                    <span className="text-rose-400 font-bold">{fmtMoney(monthlyCost)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 font-sans text-[11px]">Projected End Bal:</span>
                    <span className={`font-bold ${projEnd < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {fmtMoney(projEnd)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'upcoming_bills':
        return (
          <div className="space-y-2.5">
            {upcomingBills.map(bill => (
              <div key={bill.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-200 truncate">{bill.name}</h4>
                  <p className="text-[10px] text-slate-400">{bill.dueDateFormatted}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-bold text-rose-400 font-mono block">{fmtMoney(bill.monthlyCost)}</span>
                  <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold mt-0.5 ${
                    bill.daysUntilDue <= 3
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {bill.daysUntilDue === 0 ? 'Due Today' : `${bill.daysUntilDue} days left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'expenses_pie':
        return (
          <div className="space-y-4">
            <div className="h-56">
              {accountChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={accountChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                      {accountChartData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-500 text-center py-12">No expense data available</p>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              {accountChartData.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-300 font-medium truncate">{d.name}</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">{fmtMoney(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'proj_vs_actual':
        return (
          <div className="h-64">
            {projActualData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projActualData} barGap={6} barCategoryGap="25%">
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                  <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }} />
                  <Bar dataKey="projected" fill="#334155" radius={[4, 4, 0, 0]} name="Projected" />
                  <Bar dataKey="actual" fill="#10b981" radius={[4, 4, 0, 0]} name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">No data available</p>
            )}
          </div>
        );

      case 'budget_health':
        return (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <HealthGauge score={healthScore} />
            <div className="flex-1 space-y-2 text-xs w-full">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Savings Rate Target (20%):</span>
                <span className={savingsRate >= 20 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {savingsRate >= 20 ? 'Met' : 'Below Target'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Expense Limit vs Income:</span>
                <span className={totalExpenses <= netIncome ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {totalExpenses <= netIncome ? 'Within Limits' : 'Exceeds Net Income'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Account Balances Health:</span>
                <span className="text-emerald-400 font-bold">All Solvent</span>
              </div>
            </div>
          </div>
        );

      case 'earner_splits':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {budget.people.map(p => {
              const monthlyInc = getPersonMonthlyTotal(p.id);
              const perPayInc = getPersonPerPaycheckTotal(p.id);
              // Calculate earner total bill obligations
              const billPortionSum = budget.bills.reduce((sum, b) => sum + getBillPersonMonthlyPortion(b, p.id), 0);
              const pctOfNet = monthlyInc > 0 ? (billPortionSum / monthlyInc) * 100 : 0;

              return (
                <div key={p.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-200">{p.name}</h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-semibold capitalize">
                      {p.payFrequency}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1">
                    <div>
                      <span className="text-slate-500 block text-[9px] font-sans">Net / Paycheck:</span>
                      <span className="text-slate-200 font-bold">{fmtMoney(p.netPerPay || 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] font-sans">Monthly Net Income:</span>
                      <span className="text-emerald-400 font-bold">{fmtMoney(monthlyInc)}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 font-sans text-[11px]">Monthly Bill Share:</span>
                    <span className="text-purple-300 font-bold">{fmtMoney(billPortionSum)} ({fmtPct(pctOfNet)})</span>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'recent_activity':
        return (
          <div className="space-y-2 text-xs font-mono">
            <p className="text-[11px] text-slate-400 font-sans">Upcoming Earner Paydays &amp; Automated Bill Deductions</p>
            {budget.people.map(p => (
              <div key={p.id} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-300 font-sans font-medium">{p.name} Payday ({p.payFrequency})</span>
                <span className="text-emerald-400 font-bold">{fmtMoney(getPersonPerPaycheckTotal(p.id))}</span>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            <span>Financial Dashboard</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {MONTHS[today.getMonth()]} {today.getFullYear()} &bull; Drag or customize placement of any box on your screen
          </p>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSettingsTab('dashboard'); setIsSettingsOpen(true); }}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-900/30 transition-colors flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Customize Layout
          </button>
          <button
            onClick={() => { setSettingsTab('bills'); setIsSettingsOpen(true); }}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
          >
            Manage Bills
          </button>
        </div>
      </div>

      {/* Dynamic Widget List with Placement Drag & Drop */}
      <div className="space-y-6">
        {dashboardWidgets.map((widget, idx) => {
          if (!widget.visible) return null;

          return (
            <div
              key={widget.id}
              draggable
              onDragStart={(e) => {
                setDraggedIdx(idx);
                e.dataTransfer.setData('text/plain', idx.toString());
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const fromIdx = draggedIdx ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(fromIdx) && fromIdx !== idx) {
                  reorderDashboardWidgets(fromIdx, idx);
                }
                setDraggedIdx(null);
              }}
              className="bg-slate-900/90 rounded-2xl border border-slate-800/90 shadow-xl overflow-hidden transition-all duration-300 hover:border-slate-700"
            >
              {/* Header Drag & Reorder Bar */}
              <div className="flex items-center justify-between bg-slate-950/80 px-4 py-2.5 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2.5 text-slate-300 font-bold cursor-grab active:cursor-grabbing select-none">
                  <GripVertical className="w-4 h-4 text-slate-500 hover:text-blue-400 transition-colors" />
                  <span>{widget.title}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-500 font-normal border border-slate-800 hidden sm:inline-block">
                    {widget.category}
                  </span>
                </div>

                {/* Move Up / Down & Hide Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => reorderDashboardWidgets(idx, idx - 1)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors text-[10px] font-mono"
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === dashboardWidgets.length - 1}
                    onClick={() => reorderDashboardWidgets(idx, idx + 1)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors text-[10px] font-mono"
                    title="Move Down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDashboardWidgetVisibility(widget.id)}
                    className="p-1 rounded bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 transition-colors ml-1"
                    title="Hide this box from Dashboard"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Widget Body */}
              <div className="p-5">
                {renderWidgetContent(widget.id)}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
