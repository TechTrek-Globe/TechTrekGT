import React from 'react';
import { useBudget } from '../context/BudgetContext';
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
  ShieldCheck
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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
    getPersonPerPaycheckTotal
  } = useBudget();

  const netIncome = getTotalMonthlyNetIncome();
  const totalExpenses = getTotalMonthlyExpenses();
  const netCashFlow = netIncome - totalExpenses;
  const savingsRate = netIncome > 0 ? ((netCashFlow / netIncome) * 100).toFixed(1) : 0;
  const cashOnHand = getTotalCashOnHand();
  const upcomingBills = getUpcomingBills(5);

  // Prepare chart data: expense breakdown by account
  const accountChartData = budget.accounts.map(acc => {
    const cost = getAccountMonthlyExpenses(acc.id);
    return {
      name: acc.name,
      value: parseFloat(cost.toFixed(2))
    };
  }).filter(item => item.value > 0);

  const COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ec4899'];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-slate-800 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            Budget Overview & Key Insights
            <span className="text-xs px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
              Live Projections
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time cash flow, account balances, and automated split breakdowns
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSettingsTab('bills');
              setIsSettingsOpen(true);
            }}
            className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors"
          >
            Manage Bills
          </button>
          <button
            onClick={() => {
              setSettingsTab('splits');
              setIsSettingsOpen(true);
            }}
            className="px-4 py-2 bg-purple-600/80 hover:bg-purple-500/80 text-white rounded-xl text-xs font-medium transition-colors"
          >
            Adjust Bill Splits
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Total Cash on Hand */}
        <div className="p-5 rounded-2xl glass-panel space-y-2 relative overflow-hidden group hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Cash on Hand</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-100 font-mono">
            ${cashOnHand.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Across {budget.accounts.length} linked accounts
          </div>
        </div>

        {/* Monthly Net Income */}
        <div className="p-5 rounded-2xl glass-panel space-y-2 hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Net Income / Mo</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">
            ${netIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400">
            {budget.people.length} earners total
          </div>
        </div>

        {/* Total Monthly Expenses */}
        <div className="p-5 rounded-2xl glass-panel space-y-2 hover:border-rose-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Monthly Expenses</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono">
            ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400">
            {budget.bills.length} recurring items
          </div>
        </div>

        {/* Monthly Net Cash Flow */}
        <div className="p-5 rounded-2xl glass-panel space-y-2 hover:border-indigo-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Net Monthly Cash Flow</span>
            <ArrowUpRight className="w-4 h-4 text-indigo-400" />
          </div>
          <div className={`text-2xl font-extrabold font-mono ${netCashFlow >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
            ${netCashFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400">
            Income minus expenses
          </div>
        </div>

        {/* Savings Rate */}
        <div className="p-5 rounded-2xl glass-panel space-y-2 hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Monthly Savings Rate</span>
            <PieIcon className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-purple-400 font-mono">
            {savingsRate}%
          </div>
          <div className="text-[11px] text-slate-400">
            Target savings benchmark
          </div>
        </div>

      </div>

      {/* Main Grid: Accounts + Next 5 Upcoming Payments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Account Balances Summary Card */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-400" />
              Account Balances & Subtotals
            </h3>
            <button
              onClick={() => {
                setSettingsTab('accounts');
                setIsSettingsOpen(true);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              + Add Account
            </button>
          </div>

          <div className="divide-y divide-slate-800/80">
            {budget.accounts.map(acc => {
              const monthlyCost = getAccountMonthlyExpenses(acc.id);
              return (
                <div key={acc.id} className="py-3 flex items-center justify-between hover:bg-slate-900/40 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">{acc.name}</h4>
                      <p className="text-xs text-slate-400">
                        Type: <span className="capitalize">{acc.type}</span> • Monthly Expenses: <span className="text-rose-400 font-mono">${monthlyCost.toFixed(2)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Balance Today</span>
                    <span className="text-base font-bold text-slate-100 font-mono">
                      ${acc.startingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next 5 Upcoming Payments Widget */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Next 5 Upcoming Bills
            </h3>
            <span className="text-xs text-slate-400 font-mono">Auto Forecast</span>
          </div>

          <div className="space-y-3">
            {upcomingBills.map(bill => (
              <div key={bill.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">{bill.name}</h4>
                  <p className="text-[11px] text-slate-400">
                    Due {bill.dueDateFormatted} • <span className="text-slate-300">{bill.accountName.split('-')[0]}</span>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-rose-400 font-mono block">
                    ${bill.monthlyCost.toFixed(2)}
                  </span>
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 ${
                    bill.daysUntilDue <= 3 
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {bill.daysUntilDue === 0 ? 'Due Today' : `In ${bill.daysUntilDue} days`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Second Row: Expense Chart + Per Paycheck Split Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Expenses Distribution Chart */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <PieIcon className="w-5 h-5 text-purple-400" />
            Expenses Distribution by Account
          </h3>
          <div className="h-64 w-full flex items-center justify-center">
            {accountChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={accountChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {accountChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => `$${value.toFixed(2)}`}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400">No expense data available</p>
            )}
          </div>
        </div>

        {/* Per Paycheck Allocation Summary (Household Split) */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Per Paycheck Allocation by Person
            </h3>
            <button
              onClick={() => {
                setSettingsTab('splits');
                setIsSettingsOpen(true);
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Configure Split Ratios
            </button>
          </div>

          <div className="space-y-4">
            {budget.people.map(person => {
              const monthlyTotal = getPersonMonthlyTotal(person.id);
              const perPaycheck = getPersonPerPaycheckTotal(person.id);
              const netIncomeMo = (person.netPerPay * (person.payFrequency === 'bi-weekly' ? 26 : 12)) / 12;
              const percentOfNet = netIncomeMo > 0 ? ((monthlyTotal / netIncomeMo) * 100).toFixed(1) : 0;

              return (
                <div key={person.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{person.name}</h4>
                      <span className="text-xs text-slate-400 capitalize">{person.payFrequency} Schedule</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Required Per Paycheck</span>
                      <span className="text-base font-bold text-indigo-400 font-mono">
                        ${perPaycheck.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                    <span className="text-slate-400">Monthly Expense Share:</span>
                    <span className="font-semibold text-slate-200 font-mono">${monthlyTotal.toFixed(2)} ({percentOfNet}% of Net)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
