import React from 'react';
import { useBudget } from '../context/BudgetContext';
import { useAuth } from '../context/AuthContext';
import headerLogoDark from '../assets/header-logo-dark.png';
import headerLogoLight from '../assets/header-logo-light.png';
import { 
  LayoutDashboard, 
  ReceiptText, 
  Wallet, 
  Calculator, 
  Settings, 
  Download, 
  RotateCcw,
  TrendingUp,
  DollarSign,
  User,
  Users,
  LogOut,
  LogIn,
  ShieldCheck
} from 'lucide-react';

export function Navbar() {
  const { 
    budget, 
    activeView, 
    setActiveView, 
    setIsSettingsOpen,
    selectedPersonId,
    setSelectedPersonId,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalCashOnHand,
    resetToDefaults,
    theme
  } = useBudget();

  const { user, setIsAuthModalOpen, logout } = useAuth();

  const logoSrc = theme === 'light' ? headerLogoLight : headerLogoDark;

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
    { id: 'ledger', label: 'Transactions', icon: Wallet },
    { id: 'main_budget', label: 'Bills & Allocations', icon: ReceiptText },
    { id: 'amortization', label: 'Loan Amortization', icon: Calculator },
    { id: 'settings', label: 'Settings', icon: Settings, isSettings: true }
  ];

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-slate-800/80 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Branding */}
          <div className="flex items-center">
            <img src={logoSrc} alt="TechTrek Finance Logo" className="h-12 w-auto max-w-[220px] object-contain drop-shadow-md" />
          </div>

          {/* Person View Selector & Auth Actions */}
          <div className="flex items-center space-x-3">
            
            {/* Person View Filter */}
            {budget.people && budget.people.length > 0 && (
              <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-400 hidden sm:inline">View As:</span>
                <select
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-slate-900 text-slate-200">All Household</option>
                  {budget.people.map(p => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Metrics Bar */}
            <div className="hidden xl:flex items-center space-x-4 bg-slate-900/80 px-4 py-1.5 rounded-full border border-slate-800">
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
            </div>

            {/* User Auth Control */}
            {user ? (
              <div className="flex items-center space-x-2 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-xl text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-medium hidden sm:inline">{user.name}</span>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-1 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-900/50 rounded transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-1.5 rounded-xl shadow-md transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

          </div>
        </div>

        {/* View Navigation Tabs */}
        <div className="flex space-x-1 border-t border-slate-800/60 pt-2 pb-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.isSettings ? false : activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.isSettings) {
                    setIsSettingsOpen(true);
                  } else {
                    setActiveView(item.id);
                  }
                }}
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
