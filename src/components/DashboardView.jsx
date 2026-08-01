import React, { useState, useEffect, useMemo } from 'react';
import { useBudget } from '../context/BudgetContext';
import { InlineEdit } from './InlineEdit';
import { AccountTransferSummary } from './AccountTransferSummary';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  Users,
  ArrowUpRight,
  Clock,
  PieChart as PieIcon,
  ShieldCheck,
  Zap,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  Filter,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { fmtMoney, fmtPct } from '../utils/formatters';

// Mini horizontal progress bar
function ProgressBar({ pct, colorClass = 'bg-blue-500', trackClass = 'bg-slate-800' }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className={`h-1.5 w-full rounded-full ${trackClass} overflow-hidden`}>
      <div
        className={`h-full rounded-full progress-fill ${colorClass}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// Radial health gauge (SVG-based)
function HealthGauge({ score }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#f43f5e';
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Fair' : 'At Risk';

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
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
      <div className="text-center -mt-16">
        <span className="text-2xl font-black font-mono" style={{ color }}>{score}</span>
        <p className="text-[10px] font-semibold mt-0.5" style={{ color }}>{label}</p>
      </div>
    </div>
  );
}

const ACCOUNT_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function DashboardView() {
  const {
    budget,
    setIsSettingsOpen,
    setSettingsTab,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalCashOnHand,
    getAccountMonthlyExpenses,
    getUpcomingBills,
    getPersonMonthlyTotal,
    getPersonPerPaycheckTotal,
    getBillMonthlyCost,
    getTotalActualExpenses,
    getAccountActualExpenses,
    updateAccount,
    updatePerson,
  } = useBudget();

  const today    = new Date();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const netIncome    = getTotalMonthlyNetIncome();
  const totalExpenses = getTotalMonthlyExpenses();
  const netCashFlow  = netIncome - totalExpenses;
  const savingsRate  = netIncome > 0 ? ((netCashFlow / netIncome) * 100) : 0;
  const cashOnHand   = getTotalCashOnHand();
  const upcomingBills = getUpcomingBills(5);
  const totalActual  = getTotalActualExpenses(monthKey);

  // Budget health score (0-100)
  const healthScore = useMemo(() => {
    let score = 100;
    // Penalize if expenses > 90% of income
    if (netIncome > 0) {
      const expenseRatio = totalExpenses / netIncome;
      if (expenseRatio > 1.0)  score -= 40;
      else if (expenseRatio > 0.9) score -= 20;
      else if (expenseRatio > 0.75) score -= 10;
    } else { score -= 30; }
    // Penalize for low savings rate
    if (savingsRate < 10) score -= 15;
    else if (savingsRate < 20) score -= 5;
    // Penalize for any account with negative projected balance
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

  // Projected vs actual bar data (current month)
  const projActualData = budget.accounts.map((acc, i) => ({
    name: acc.name.split('-')[0].trim(),
    projected: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
    actual: parseFloat(getAccountActualExpenses(acc.id, monthKey).toFixed(2)),
  })).filter(d => d.projected > 0);

  const fmtCurrency = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtShort    = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPct      = (n, decimals = 1) => {
    const val = parseFloat(n);
    if (isNaN(val)) return '0%';
    return `${val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-100">Financial Dashboard</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {MONTHS[today.getMonth()]} {today.getFullYear()} &mdash; Live projections &amp; account snapshot
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setSettingsTab('bills'); setIsSettingsOpen(true); }}
            className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 rounded-xl text-xs font-medium border border-slate-700/80 transition-colors"
          >
            Manage Bills
          </button>
          <button
            onClick={() => { setSettingsTab('splits'); setIsSettingsOpen(true); }}
            className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-500/80 text-white rounded-xl text-xs font-medium transition-colors"
          >
            Bill Splits
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">

        {/* Cash on Hand */}
        <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl glass-panel space-y-3 hover:border-blue-500/40 transition-all group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Cash on Hand</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5 text-blue-400" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono animate-count-up">
            ${fmtCurrency(cashOnHand)}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{budget.accounts.length} accounts</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-progress-pulse inline-block" />
                Live
              </span>
            </div>
            <ProgressBar pct={Math.min(100, (cashOnHand / (cashOnHand + totalExpenses)) * 100)} colorClass="bg-blue-500" />
          </div>
        </div>

        {/* Net Monthly Income */}
        <div className="p-4 rounded-2xl glass-panel space-y-3 hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Net Income / Mo</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">${fmtCurrency(netIncome)}</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{budget.people.length} earner{budget.people.length !== 1 ? 's' : ''}</span>
            </div>
            <ProgressBar pct={100} colorClass="bg-emerald-500" />
          </div>
        </div>

        {/* Total Expenses */}
        <div className="p-4 rounded-2xl glass-panel space-y-3 hover:border-rose-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Monthly Expenses</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">${fmtCurrency(totalExpenses)}</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{budget.bills.length} bills</span>
              <span className="text-rose-400">{netIncome > 0 ? fmtPct((totalExpenses / netIncome) * 100) : '0%'} of income</span>
            </div>
            <ProgressBar pct={netIncome > 0 ? (totalExpenses / netIncome) * 100 : 0} colorClass={totalExpenses > netIncome ? 'bg-rose-500' : 'bg-rose-400'} />
          </div>
        </div>

        {/* Net Cash Flow */}
        <div className="p-4 rounded-2xl glass-panel space-y-3 hover:border-indigo-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Net Cash Flow</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
            </div>
          </div>
          <div className={`text-2xl font-black font-mono ${netCashFlow >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
            {netCashFlow >= 0 ? '+' : ''}{fmtCurrency(netCashFlow)}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Savings rate</span>
              <span className={savingsRate >= 20 ? 'text-emerald-400' : savingsRate >= 10 ? 'text-amber-400' : 'text-rose-400'}>
                {fmtPct(savingsRate)}
              </span>
            </div>
            <ProgressBar pct={Math.max(0, savingsRate)} colorClass={savingsRate >= 20 ? 'bg-emerald-500' : savingsRate >= 10 ? 'bg-amber-500' : 'bg-rose-500'} />
          </div>
        </div>

        {/* Savings Rate */}
        <div className="p-4 rounded-2xl glass-panel space-y-3 hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Savings Rate</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <PieIcon className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-400 font-mono">{fmtPct(savingsRate)}</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Target: 20%</span>
              <span className={savingsRate >= 20 ? 'text-emerald-400' : 'text-amber-400'}>
                {savingsRate >= 20 ? 'On track' : 'Below target'}
              </span>
            </div>
            <ProgressBar pct={(savingsRate / 20) * 100} colorClass={savingsRate >= 20 ? 'bg-purple-400' : 'bg-amber-500'} />
          </div>
        </div>
      </div>

      {/* Account Funding & Transfer Summary Table */}
      <AccountTransferSummary />

      {/* Main Grid Row 1: Accounts + Upcoming + Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">

        {/* Account Cards Grid */}
        <div className="lg:col-span-2 p-5 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-400" />
              Account Balances
            </h3>
            <button
              onClick={() => { setSettingsTab('accounts'); setIsSettingsOpen(true); }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              + Add
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {budget.accounts.map((acc, i) => {
              const monthlyCost = getAccountMonthlyExpenses(acc.id);
              const actualCost  = getAccountActualExpenses(acc.id, monthKey);
              const pct         = monthlyCost > 0 ? (actualCost / monthlyCost) * 100 : 0;
              const projEnd     = (acc.startingBalance || 0) - monthlyCost;
              const accentColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];

              return (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/60 space-y-2.5 hover:border-slate-700 transition-colors"
                  style={{ borderLeftColor: accentColor, borderLeftWidth: '3px' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 leading-tight">{acc.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500 capitalize">{acc.type}</span>
                        {acc.enableExtraSavings !== false && (acc.saveExtraMonthly > 0) && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/80 font-mono font-semibold">
                            +${acc.saveExtraMonthly}/mo extra
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <InlineEdit
                        value={acc.startingBalance || 0}
                        type="currency"
                        onCommit={v => updateAccount(acc.id, { startingBalance: v })}
                        className="text-sm font-black text-slate-100 font-mono justify-end"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-500">Monthly expenses</span>
                      <span className="font-mono text-rose-400">{fmtMoney(monthlyCost)}</span>
                    </div>
                    <ProgressBar pct={pct} colorClass="bg-emerald-500" trackClass="bg-slate-800" />
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-500">Proj. end balance</span>
                      <span className={`font-mono font-semibold ${projEnd < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {fmtMoney(projEnd)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming Bills */}
        <div className="p-5 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Next 5 Bills
            </h3>
            <span className="text-[10px] text-slate-500 font-mono bg-slate-800/60 px-2 py-0.5 rounded-full">Auto Forecast</span>
          </div>

          <div className="space-y-2">
            {upcomingBills.map(bill => (
              <div key={bill.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-slate-200 truncate">{bill.name}</h4>
                  <p className="text-[10px] text-slate-500">{bill.dueDateFormatted}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-bold text-rose-400 font-mono block">{fmtMoney(bill.monthlyCost)}</span>
                  <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-semibold mt-0.5 ${
                    bill.daysUntilDue <= 3
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                  }`}>
                    {bill.daysUntilDue === 0 ? 'Today' : `${bill.daysUntilDue}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Budget Health Score */}
        <div className="p-5 rounded-2xl glass-panel flex flex-col items-center justify-center space-y-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 self-start">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Budget Health
          </h3>
          <HealthGauge score={healthScore} />
          <div className="w-full space-y-1.5 pt-2 border-t border-slate-800/60">
            <div className="flex items-center gap-2 text-[10px]">
              {savingsRate >= 20
                ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                : <AlertCircle   className="w-3 h-3 text-amber-400 flex-shrink-0" />}
              <span className="text-slate-400">Savings rate {savingsRate >= 20 ? 'on target' : 'below 20%'}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {totalExpenses <= netIncome
                ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                : <AlertCircle   className="w-3 h-3 text-rose-400 flex-shrink-0" />}
              <span className="text-slate-400">Expenses {totalExpenses <= netIncome ? 'within income' : 'exceed income'}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {budget.accounts.every(a => (a.startingBalance || 0) - getAccountMonthlyExpenses(a.id) >= 0)
                ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                : <AlertCircle   className="w-3 h-3 text-rose-400 flex-shrink-0" />}
              <span className="text-slate-400">Account balances positive</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Projected vs Actual bars + Pie Chart + Monthly Split */}
      <div className={`grid grid-cols-1 ${budget.people.length > 1 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4`}>

        {/* Projected vs Actual Bar Chart */}
        <div className="lg:col-span-1 p-5 rounded-2xl glass-panel space-y-4">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Projected vs Actual
            <span className="text-[10px] font-normal text-slate-500 ml-1">{MONTHS[today.getMonth()]}</span>
          </h3>
          {projActualData.length > 0 ? (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projActualData} barGap={4} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} width={45}
                    tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                  <Tooltip
                    formatter={(v) => [`$${v.toFixed(2)}`, '']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }}
                  />
                  <Bar dataKey="projected" fill="#334155" radius={[3, 3, 0, 0]} name="Projected" />
                  <Bar dataKey="actual"    fill="#3b82f6" radius={[3, 3, 0, 0]} name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-8">No expense data</p>
          )}
          {/* Variance summary per account */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            {projActualData.map((d, i) => {
              const variance = d.actual - d.projected;
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden flex-1">
                    <div
                      className="h-full rounded-full progress-fill"
                      style={{
                        width: `${Math.min(100, d.projected > 0 ? (d.actual / d.projected) * 100 : 0)}%`,
                        backgroundColor: d.actual > d.projected ? '#f43f5e' : '#10b981'
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 w-16 text-right flex-shrink-0">{d.name.slice(0, 8)}</span>
                  <span className={`text-[10px] font-bold font-mono w-16 text-right flex-shrink-0 ${variance > 0 ? 'text-rose-400' : variance < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {variance === 0 ? '--' : `${variance > 0 ? '+' : ''}$${Math.abs(variance).toFixed(0)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pie Chart */}
        <div className="p-5 rounded-2xl glass-panel space-y-4">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-purple-400" />
            Expenses by Account
          </h3>
          <div className="h-44">
            {accountChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={accountChartData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {accountChartData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [`$${v.toFixed(2)}`, '']}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">No data</p>
            )}
          </div>
          {/* Legend */}
          <div className="space-y-1 pt-2 border-t border-slate-800/60">
            {accountChartData.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-400 truncate max-w-[120px]">{d.name}</span>
                </div>
                <span className="font-mono text-slate-300">${d.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Split by Person (Shown ONLY if multiple people exist) */}
        {budget.people.length > 1 && (
          <div className="p-5 rounded-2xl glass-panel space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Monthly Split
              </h3>
              <button
                onClick={() => { setSettingsTab('splits'); setIsSettingsOpen(true); }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                Configure
              </button>
            </div>

            <div className="space-y-3">
              {budget.people.map(person => {
                const monthlyNet = (person.netPerPay * (person.payFrequency === 'bi-weekly' ? 26 : 12)) / 12;
                const splitPct   = netIncome > 0 ? (monthlyNet / netIncome) * 100 : 0;

                return (
                  <div key={person.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{person.name}</h4>
                        <span className="text-[10px] text-slate-500 capitalize">{person.payFrequency}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block">Monthly Net Income</span>
                        <div className="text-sm font-black text-indigo-400 font-mono">
                          {fmtMoney(monthlyNet)}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <ProgressBar pct={splitPct} colorClass="bg-indigo-500" />
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Household contribution</span>
                        <span className="font-semibold text-indigo-400">{fmtPct(splitPct)} share</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
