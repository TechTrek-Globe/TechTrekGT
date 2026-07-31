import React, { useState, useEffect } from 'react';
import { useBudget } from '../context/BudgetContext';
import {
  LayoutDashboard,
  ReceiptText,
  TrendingUp,
  Calculator,
  Settings,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Menu,
  X
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',            icon: LayoutDashboard, color: 'text-blue-400' },
  { id: 'ledger',      label: 'Ledger & Cash Flow',    icon: TrendingUp,      color: 'text-emerald-400' },
  { id: 'main_budget', label: 'Bills & Allocations',   icon: ReceiptText,     color: 'text-violet-400' },
  { id: 'amortization',label: 'Loan Amortization',     icon: Calculator,      color: 'text-rose-400' },
  { id: 'settings',    label: 'Settings',              icon: Settings,        color: 'text-amber-400', isSettings: true },
];

const SIDEBAR_KEY = 'trekledger_sidebar_collapsed';

export function AppLayout({ children }) {
  const {
    budget,
    activeView,
    setActiveView,
    setIsSettingsOpen,
    resetToDefaults,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalCashOnHand,
  } = useBudget();

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true'; }
    catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(collapsed)); }
    catch { /* ignore */ }
  }, [collapsed]);

  // Close mobile drawer on view change
  useEffect(() => { setMobileOpen(false); }, [activeView]);

  const netIncome  = getTotalMonthlyNetIncome();
  const expenses   = getTotalMonthlyExpenses();
  const cashOnHand = getTotalCashOnHand();
  const netFlow    = netIncome - expenses;

  const exportConfig = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(budget, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `trekledger_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const currentNav = NAV_ITEMS.find(n => n.id === activeView);

  const SidebarContent = ({ onClose }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-slate-800/60 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 p-0.5 shadow-lg shadow-blue-500/25 flex-shrink-0">
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="text-base font-black gradient-text leading-none">TrekLedger</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Personal Finance OS</p>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="ml-auto p-1 text-slate-400 hover:text-slate-200 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto sidebar-scroll">
        {!collapsed && (
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-2 mb-2">
            Views
          </p>
        )}
        {NAV_ITEMS.map((item) => {
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
              title={collapsed ? item.label : undefined}
              className={`sidebar-nav-item w-full text-left ${isActive ? 'active' : 'text-slate-400'} ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? item.color : 'text-slate-500'}`} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick KPIs at bottom */}
      {!collapsed && (
        <div className="mx-3 mb-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800/60 space-y-2 animate-fade-in">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Quick Stats</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">Cash On Hand</span>
              <span className="text-[11px] font-bold text-slate-200 font-mono">
                ${cashOnHand.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">Net Income/Mo</span>
              <span className="text-[11px] font-bold text-emerald-400 font-mono">
                ${netIncome.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">Monthly Flow</span>
              <span className={`text-[11px] font-bold font-mono ${netFlow >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                {netFlow >= 0 ? '+' : ''}{netFlow.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white flex">

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-full z-40 bg-slate-950/95 border-r border-slate-800/60 transition-all duration-300 ease-in-out ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent />

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors z-50 shadow-lg"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Overlay Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-slate-950 border-r border-slate-800/60 flex flex-col animate-slide-in-left">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>

        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-14 flex items-center gap-4 px-4 sm:px-6 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-md">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 text-xs font-medium">TrekLedger</span>
            <span className="text-slate-700">/</span>
            <span className="text-slate-200 font-semibold flex items-center gap-1.5">
              {currentNav && <currentNav.icon className={`w-3.5 h-3.5 ${currentNav.color}`} />}
              {currentNav?.label ?? 'Dashboard'}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Top-right: KPI pill + Settings */}
          <div className="hidden md:flex items-center gap-3 bg-slate-900/80 px-4 py-1.5 rounded-full border border-slate-800 text-xs">
            <span className="text-slate-400">Net Income:</span>
            <span className="font-semibold text-emerald-400 font-mono">
              ${netIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className="h-3 w-px bg-slate-700" />
            <span className="text-slate-400">Expenses:</span>
            <span className="font-semibold text-rose-400 font-mono">
              ${expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className="h-3 w-px bg-slate-700" />
            <span className="text-slate-400">Net Flow:</span>
            <span className={`font-semibold font-mono ${netFlow >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
              {netFlow >= 0 ? '+' : ''}{netFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <Settings className="w-3.5 h-3.5 animate-spin-slow" />
            <span>Settings</span>
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export { NAV_ITEMS };
