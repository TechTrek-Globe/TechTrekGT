import React from 'react';
import { useBudget } from '../context/BudgetContext';
import { 
  LayoutDashboard, 
  ReceiptText, 
  Wallet, 
  Calculator, 
  Settings, 
  Download, 
  RotateCcw,
  TrendingUp,
  DollarSign
} from 'lucide-react';

export function Navbar() {
  const { 
    budget, 
    activeView, 
    setActiveView, 
    setIsSettingsOpen,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalCashOnHand,
    resetToDefaults
  } = useBudget();

  const netIncome = getTotalMonthlyNetIncome();
  const expenses = getTotalMonthlyExpenses();
  const netCashFlow = netIncome - expenses;
  const savingsRate = netIncome > 0 ? ((netCashFlow / netIncome) * 100).toFixed(1) : 0;
  const cashOnHand = getTotalCashOnHand();

  const exportConfig = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(budget, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `personal_budget_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'main_budget', label: 'Main Budget', icon: ReceiptText },
    { id: 'ledger', label: 'Cash Flow Register', icon: Wallet },
    { id: 'amortization', label: 'Loan Amortization', icon: Calculator }
  ];

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/80 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text">Budget OS</h1>
              <p className="text-xs text-slate-400">Personal Cash Flow & Split Engine</p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hidden lg:flex items-center space-x-4 bg-slate-900/80 px-4 py-1.5 rounded-full border border-slate-800">
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400">Net Income:</span>
              <span className="font-semibold text-emerald-400">${netIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400">Expenses:</span>
              <span className="font-semibold text-rose-400">${expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400">Net Flow:</span>
              <span className={`font-semibold ${netCashFlow >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                ${netCashFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center space-x-2 text-xs">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400">Savings Rate:</span>
              <span className="font-semibold text-indigo-300">{savingsRate}%</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            <button
              onClick={exportConfig}
              title="Export Budget Configuration JSON"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (window.confirm('Reset all budget data to original Excel spreadsheet values?')) {
                  resetToDefaults();
                }
              }}
              title="Reset to Excel Defaults"
              className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Dynamic Settings Button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium shadow-lg shadow-blue-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Settings className="w-4 h-4 animate-spin-slow" />
              <span>Budget Settings</span>
            </button>
          </div>
        </div>

        {/* View Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800/60 pt-2 pb-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
}
