import React, { useState, useMemo } from 'react';
import { useBudget } from '../context/BudgetContext';
import { InlineEdit } from './InlineEdit';
import { AccountTransferSummary } from './AccountTransferSummary';
import {
  DollarSign,
  TrendingUp,
  Clock,
  PieChart as PieIcon,
  ShieldCheck,
  Zap,
  GripVertical,
  EyeOff,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  X
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
    hideDashboardHeader,
    toggleHideDashboardHeader,
    dashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    setDashboardWidgetCustomSize,
    reorderDashboardWidgets,
    setIsSettingsOpen,
    setSettingsTab,
    getMonthlyNetIncome,
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
    getAccountActualEndBalance,
    updateAccount,
  } = useBudget();

  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [resizingSizes, setResizingSizes] = useState({});

  const isLight = budget?.theme === 'light';

  const dismissHeader = () => {
    toggleHideDashboardHeader(true);
  };

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
    (budget?.accounts || []).forEach(acc => {
      const expenses = getAccountMonthlyExpenses(acc.id);
      if ((acc.startingBalance || 0) - expenses < 0) score -= 10;
    });
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [budget, netIncome, totalExpenses, savingsRate]);

  // Chart data
  const accountChartData = (budget?.accounts || []).map((acc, i) => ({
    name: (acc.name || '').split('-')[0].trim(),
    value: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
    color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]
  })).filter(d => d.value > 0);

  const projActualData = (budget?.accounts || []).map((acc, i) => ({
    name: (acc.name || '').split('-')[0].trim(),
    projected: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
    actual: parseFloat(getAccountActualExpenses(acc.id, monthKey).toFixed(2)),
  })).filter(d => d.projected > 0);

  const getWidthClass = (w) => {
    switch (w) {
      case 'full':
        return 'col-span-1 md:col-span-2 lg:col-span-3';
      case 'half':
        return 'col-span-1 md:col-span-2 lg:col-span-2';
      case 'third':
      default:
        return 'col-span-1';
    }
  };

  // Interactive Corner Drag Resizer Logic
  const startCornerResize = (e, widgetId, initialWidth, initialHeight) => {
    e.preventDefault();
    e.stopPropagation();

    const cardElement = e.currentTarget.parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = cardElement.getBoundingClientRect();
    const startW = initialWidth || rect.width;
    const startH = initialHeight || rect.height;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(260, Math.round(startW + (moveEvent.clientX - startX)));
      const newHeight = Math.max(140, Math.round(startH + (moveEvent.clientY - startY)));
      setResizingSizes(prev => ({
        ...prev,
        [widgetId]: { customWidth: newWidth, customHeight: newHeight }
      }));
    };

    const onMouseUp = (upEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalWidth = Math.max(260, Math.round(startW + (upEvent.clientX - startX)));
      const finalHeight = Math.max(140, Math.round(startH + (upEvent.clientY - startY)));
      setDashboardWidgetCustomSize(widgetId, { customWidth: finalWidth, customHeight: finalHeight });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handlePresetWidth = (widgetId, widthType) => {
    setResizingSizes(prev => {
      const next = { ...prev };
      delete next[widgetId];
      return next;
    });
    setDashboardWidgetWidth(widgetId, widthType);
  };

  // Render widget body content based on widget ID
  const renderWidgetContent = (id, width, customWidth) => {
    const effectiveWidth = customWidth || (width === 'full' ? 900 : width === 'half' ? 600 : 320);
    const isCompact = effectiveWidth < 520;

    switch (id) {
      case 'kpi_hero':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Box 1: Total Cash on Hand */}
            <div className="p-3.5 rounded-2xl glass-panel border border-blue-900/40 bg-blue-950/20 flex items-center justify-between gap-2 overflow-hidden min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-slate-400 block truncate">Total Cash on Hand</span>
                <div className="text-lg font-black text-slate-100 font-mono mt-0.5 truncate">{fmtMoney(cashOnHand)}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] truncate">
                  <span className="text-slate-500">Net Flow:</span>
                  <span className={`font-mono font-bold ${netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {netCashFlow >= 0 ? '+' : ''}{fmtMoney(netCashFlow)}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            {/* Box 2: Monthly Income vs Expenses */}
            <div className="p-3.5 rounded-2xl glass-panel border border-emerald-900/40 bg-emerald-950/20 flex items-center justify-between gap-2 overflow-hidden min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-slate-400 block truncate">Monthly Income vs Expenses</span>
                <div className="text-lg font-black text-emerald-400 font-mono mt-0.5 truncate">{fmtMoney(netIncome)}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] truncate">
                  <span className="text-slate-400 font-mono">Exp: <span className="font-bold text-rose-400">{fmtMoney(totalExpenses)}</span></span>
                  <span className="text-slate-500 font-sans">&bull; {(budget?.people || []).length} earners</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
            </div>

            {/* Box 3: Savings Rate */}
            <div className="p-3.5 rounded-2xl glass-panel border border-purple-900/40 bg-purple-950/20 flex items-center justify-between gap-2 overflow-hidden min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-slate-400 block truncate">Savings Rate</span>
                <div className="text-lg font-black text-purple-400 font-mono mt-0.5 truncate">{fmtPct(savingsRate)}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] truncate">
                  <span className="text-slate-500">Target 20%:</span>
                  <span className={`font-semibold ${savingsRate >= 20 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {savingsRate >= 20 ? 'On Target' : 'Below Target'}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
                <PieIcon className="w-4 h-4 text-purple-400" />
              </div>
            </div>
          </div>
        );

      case 'transfer_summary':
        return <AccountTransferSummary />;

      case 'account_cards':
        return (
          <div className={`grid gap-3 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {(budget?.accounts || []).map((acc, i) => {
              const monthlyCost = getAccountMonthlyExpenses(acc.id);
              const actualCost  = getAccountActualExpenses(acc.id, monthKey);
              const actualEnd   = getAccountActualEndBalance(acc.id, monthKey);
              const projEnd     = (acc.startingBalance || 0) - monthlyCost;
              const accentColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
              const hasActualOverride = Math.abs(monthlyCost - actualCost) > 0.001;

              return (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 hover:border-slate-700 transition-all"
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
                        className="text-xs font-black text-slate-100 font-mono justify-end"
                      />
                      <span className="text-[9px] text-slate-500 block mt-0.5">Current Balance</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-sans">Monthly Exp:</span>
                    <div className="text-right">
                      <span className="text-rose-400 font-bold">{fmtMoney(actualCost)}</span>
                      {hasActualOverride && (
                        <span className="text-[9px] text-slate-500 block font-sans">Proj: {fmtMoney(monthlyCost)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-sans">End Balance (Actual):</span>
                    <span className={`font-bold ${actualEnd < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {fmtMoney(actualEnd)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'upcoming_bills':
        return (
          <div className="space-y-2">
            {(upcomingBills || []).map(bill => (
              <div key={bill.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-200 truncate text-[11px]">{bill.name}</h4>
                  <p className="text-[10px] text-slate-400">{bill.dueDateFormatted}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="font-bold text-rose-400 font-mono text-[11px] block">{fmtMoney(bill.monthlyCost)}</span>
                  <span className={`inline-block text-[8px] px-1.5 py-0.2 rounded font-bold mt-0.5 ${
                    bill.daysUntilDue <= 3
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {bill.daysUntilDue === 0 ? 'Due Today' : `${bill.daysUntilDue}d left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'expenses_pie':
        return (
          <div className="space-y-3">
            <div className="h-48">
              {accountChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={accountChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                      {accountChartData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-500 text-center py-10">No expense data</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800 text-[11px]">
              {accountChartData.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded-lg">
                  <div className="flex items-center gap-1.5 truncate">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
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
          <div className="h-52">
            {projActualData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projActualData} barGap={4} barCategoryGap="20%">
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={45} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                  <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }} />
                  <Bar dataKey="projected" fill="#334155" radius={[3, 3, 0, 0]} name="Projected" />
                  <Bar dataKey="actual" fill="#10b981" radius={[3, 3, 0, 0]} name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500 text-center py-10">No data available</p>
            )}
          </div>
        );

      case 'budget_health':
        return (
          <div className={`flex items-center gap-4 ${isCompact ? 'flex-col text-center' : 'flex-row'}`}>
            <HealthGauge score={healthScore} />
            <div className="flex-1 space-y-2 text-xs w-full">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Savings Target (20%):</span>
                <span className={savingsRate >= 20 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {savingsRate >= 20 ? 'Met' : 'Below Target'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Expense Limit vs Income:</span>
                <span className={totalExpenses <= netIncome ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {totalExpenses <= netIncome ? 'Within Limits' : 'Exceeds'}
                </span>
              </div>
            </div>
          </div>
        );

      case 'earner_splits':
        return (
          <div className={`grid gap-3 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {(budget?.people || []).map(p => {
              const monthlyInc = getMonthlyNetIncome(p);
              const billPortionSum = getPersonMonthlyTotal(p.id);
              const perPaycheckBill = getPersonPerPaycheckTotal(p.id);
              const pctOfNet = monthlyInc > 0 ? (billPortionSum / monthlyInc) * 100 : 0;

              return (
                <div key={p.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-200">{p.name}</h4>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-semibold capitalize">
                      {p.payFrequency}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                    <div>
                      <span className="text-slate-500 block font-sans">Net / Pay:</span>
                      <span className="text-slate-200 font-bold">{fmtMoney(p.netPerPay || 0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-sans">Monthly Net:</span>
                      <span className="text-emerald-400 font-bold">{fmtMoney(monthlyInc)}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-mono text-[11px]">
                    <span className="text-slate-400 font-sans">Monthly Bill Share:</span>
                    <span className="text-purple-300 font-bold">{fmtMoney(billPortionSum)} ({fmtPct(pctOfNet)})</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-slate-400 font-sans">Per Paycheck Target:</span>
                    <span className="text-blue-300 font-bold">{fmtMoney(perPaycheckBill)}</span>
                  </div>

                  {p.accountAllocations && typeof p.accountAllocations === 'object' && Object.values(p.accountAllocations).some(v => parseFloat(v) > 0) && (
                    <div className="pt-2 border-t border-slate-800 space-y-1">
                      <span className="text-[10px] text-purple-300 font-semibold block font-sans">Direct Deposit Allocations (Per Paycheck):</span>
                      <div className="space-y-0.5 font-mono text-[10px]">
                        {Object.entries(p.accountAllocations).map(([accId, amt]) => {
                          const val = parseFloat(amt) || 0;
                          if (val <= 0) return null;
                          const acc = (budget?.accounts || []).find(a => a.id === accId);
                          return (
                            <div key={accId} className="flex items-center justify-between text-slate-300">
                              <span className="font-sans text-slate-400 truncate max-w-[140px]">{acc?.name || 'Account'}:</span>
                              <span className="font-bold text-emerald-400">{fmtMoney(val)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'recent_activity':
        return (
          <div className="space-y-2 text-xs font-mono">
            <p className="text-[10px] text-slate-400 font-sans">Upcoming Earner Paydays &amp; Scheduled Deductions</p>
            {(budget?.people || []).map(p => (
              <div key={p.id} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-300 font-sans font-medium text-[11px]">{p.name} ({p.payFrequency})</span>
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
      {!hideDashboardHeader && (
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl border shadow-xl relative transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50' : 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-slate-950/50'
        }`}>
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <span>Financial Dashboard</span>
            </h2>
            <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {MONTHS[today.getMonth()]} {today.getFullYear()} &bull; Drag bottom-right corner to resize, drag headers to reorder
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
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              Manage Bills
            </button>
            <button
              type="button"
              onClick={dismissHeader}
              className={`p-2 rounded-xl border transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-slate-300' : 'bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border-slate-700'
              }`}
              title="Close / Hide Financial Dashboard header banner (Click X to dismiss)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Responsive Masonry Columns for Dashboard Boxes */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDraggedIdx(null);
          setDragOverIdx(null);
        }}
        className="columns-1 md:columns-2 lg:columns-3 gap-6"
      >
        {dashboardWidgets.map((widget, idx) => {
          if (!widget.visible) return null;
          const currentWidth = widget.width || 'third';
          const customSize = resizingSizes[widget.id] || { customWidth: widget.customWidth, customHeight: widget.customHeight };

          const isFullWidth = currentWidth === 'full' || (customSize.customWidth && customSize.customWidth > 780);
          const columnSpanClass = isFullWidth ? '[column-span:all] w-full mb-6' : 'break-inside-avoid inline-block w-full mb-6';

          const isBeingDragged = draggedIdx === idx;
          const isDragOverTarget = dragOverIdx === idx && draggedIdx !== idx;

          const widgetTitle = widget.id === 'kpi_hero' || widget.title === 'Executive KPI Summary'
            ? 'Key Financial Summary'
            : widget.title;

          const cardStyle = {
            width: customSize.customWidth ? `${customSize.customWidth}px` : undefined,
            minHeight: customSize.customHeight ? `${customSize.customHeight}px` : undefined,
            height: customSize.customHeight ? `${customSize.customHeight}px` : undefined,
            maxWidth: '100%'
          };

          return (
            <div
              key={widget.id}
              draggable
              onDragStart={(e) => {
                setDraggedIdx(idx);
                e.dataTransfer.setData('text/plain', idx.toString());
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverIdx !== idx) {
                  setDragOverIdx(idx);
                }
              }}
              onDragLeave={() => {
                if (dragOverIdx === idx) {
                  setDragOverIdx(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const fromIdx = draggedIdx ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (!isNaN(fromIdx) && fromIdx !== idx) {
                  reorderDashboardWidgets(fromIdx, idx);
                }
                setDraggedIdx(null);
                setDragOverIdx(null);
              }}
              style={cardStyle}
              className={`relative ${columnSpanClass} rounded-2xl border ${
                isLight
                  ? isDragOverTarget
                    ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/80 shadow-2xl scale-[1.01]'
                    : 'bg-white border-slate-200 shadow-md hover:border-slate-300 text-slate-900'
                  : isDragOverTarget
                    ? 'border-blue-500 ring-2 ring-blue-500/80 shadow-2xl scale-[1.01] bg-slate-800/95 text-slate-100'
                    : 'bg-slate-900/90 border-slate-800/90 shadow-xl hover:border-slate-700 text-slate-100'
              } overflow-hidden transition-all duration-200 group/card`}
            >
              {/* Header Drag, Reorder & Size Bar */}
              <div className={`flex items-center justify-between px-4 py-2 border-b text-xs ${
                isLight ? 'bg-slate-100/90 border-slate-200 text-slate-700' : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}>
                <div className={`flex items-center gap-2 font-bold cursor-grab active:cursor-grabbing select-none truncate ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  <GripVertical className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    isLight ? 'text-slate-400 hover:text-blue-600' : 'text-slate-500 hover:text-blue-400'
                  }`} />
                  <span className="truncate">{widgetTitle}</span>
                </div>

                {/* Size Selector, Move Up/Down & Hide Controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                  {/* Quick Box Sizing Pill */}
                  <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-lg border ${
                    isLight ? 'bg-slate-200/80 border-slate-300' : 'bg-slate-900 border-slate-800'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handlePresetWidth(widget.id, 'third')}
                      className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        currentWidth === 'third' && !customSize.customWidth
                          ? 'bg-blue-600 text-white'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Make Box Small (1/3 Width Side Card)"
                    >
                      1/3
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetWidth(widget.id, 'half')}
                      className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        currentWidth === 'half' && !customSize.customWidth
                          ? 'bg-blue-600 text-white'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Make Box Medium (1/2 Width)"
                    >
                      1/2
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetWidth(widget.id, 'full')}
                      className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        currentWidth === 'full' && !customSize.customWidth
                          ? 'bg-blue-600 text-white'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Make Box Full Width"
                    >
                      Full
                    </button>
                  </div>

                  {/* Move Up/Down */}
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => reorderDashboardWidgets(idx, idx - 1)}
                    className={`px-1.5 py-0.5 rounded disabled:opacity-30 transition-colors text-[10px] font-mono ${
                      isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title="Move Up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={idx === dashboardWidgets.length - 1}
                    onClick={() => reorderDashboardWidgets(idx, idx + 1)}
                    className={`px-1.5 py-0.5 rounded disabled:opacity-30 transition-colors text-[10px] font-mono ${
                      isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                    title="Move Down"
                  >
                    ▼
                  </button>

                  {/* Hide / X button */}
                  <button
                    type="button"
                    onClick={() => toggleDashboardWidgetVisibility(widget.id)}
                    className={`p-1 rounded transition-colors ${
                      isLight
                        ? 'bg-slate-200 hover:bg-rose-100 text-slate-600 hover:text-rose-600'
                        : 'bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300'
                    }`}
                    title="Close / Hide this box from Dashboard (Click X to close)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Widget Body */}
              <div
                className="p-4 overflow-y-auto"
                style={{ maxHeight: customSize.customHeight ? `${customSize.customHeight - 42}px` : undefined }}
              >
                {renderWidgetContent(widget.id, currentWidth, customSize.customWidth)}
              </div>

              {/* Interactive Bottom-Right Corner Drag-to-Resize Handle */}
              <div
                onMouseDown={(e) => startCornerResize(e, widget.id, customSize.customWidth, customSize.customHeight)}
                className="absolute bottom-1 right-1 w-5 h-5 cursor-se-resize flex items-center justify-center text-slate-500 hover:text-blue-400 opacity-40 group-hover/card:opacity-100 transition-all select-none z-20"
                title="Click and drag corner to resize this box to any custom width or height"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 2L2 10M10 6L6 10M10 10L10 10" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          );
        })}

        {/* Drop Zone Placeholder when dragging a box */}
        {draggedIdx !== null && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              reorderDashboardWidgets(draggedIdx, dashboardWidgets.length - 1);
              setDraggedIdx(null);
              setDragOverIdx(null);
            }}
            className="col-span-1 md:col-span-2 lg:col-span-3 border-2 border-dashed border-blue-500/60 bg-blue-950/20 rounded-2xl p-6 flex items-center justify-center text-blue-400 font-bold text-xs shadow-inner animate-pulse cursor-pointer"
          >
            Drop box here to move it to the bottom
          </div>
        )}
      </div>

    </div>
  );
}
