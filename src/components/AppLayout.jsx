import React, { useState, useEffect, useMemo } from 'react';
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
  X,
  Sun,
  Moon,
  Globe
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',            icon: LayoutDashboard, color: 'text-blue-400' },
  { id: 'ledger',      label: 'Transactions',         icon: TrendingUp,      color: 'text-emerald-400' },
  { id: 'main_budget', label: 'Bills & Allocations',   icon: ReceiptText,     color: 'text-violet-400' },
  { id: 'amortization',label: 'Loan Amortization',     icon: Calculator,      color: 'text-rose-400' },
  { id: 'settings',    label: 'Setup Accounts, People, Bills, Splits', icon: Settings, color: 'text-amber-400' },
];

const SIDEBAR_KEY = 'trekledger_sidebar_collapsed';

const SidebarContent = ({ collapsed, activeView, cashOnHand, netIncome, netFlow, setActiveView, setIsSettingsOpen, onClose }) => (
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
          <h1 className="text-base font-black gradient-text leading-none">TechTrek Finance</h1>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Personal Finance OS</p>
        </div>
      )}
      {onClose && (
        <button onClick={onClose} aria-label="Close navigation menu" className="ml-auto p-1 text-slate-400 hover:text-slate-200 rounded-lg">
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
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              setActiveView(item.id);
            }}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
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

export function AppLayout({ children, onNavigateHome }) {
  const {
    budget,
    isDbLoaded,
    saveError,
    theme,
    setTheme,
    activeView,
    setActiveView,
    setIsSettingsOpen,
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

  const netIncome  = useMemo(() => getTotalMonthlyNetIncome(), [budget?.people]);
  const expenses   = useMemo(() => getTotalMonthlyExpenses(), [budget?.bills]);
  const cashOnHand = useMemo(() => getTotalCashOnHand(), [budget?.accounts]);
  const netFlow    = useMemo(() => netIncome - expenses, [netIncome, expenses]);

  const isLight = theme === 'light';

  return (
    <div className={`min-h-screen font-sans selection:bg-blue-500 selection:text-white flex transition-colors duration-200 ${
      isLight ? 'bg-slate-100 text-slate-900 light' : 'bg-slate-950 text-slate-100 dark'
    }`}>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-full z-40 border-r transition-all duration-300 ease-in-out ${
          isLight ? 'bg-white/95 border-slate-200 text-slate-900 shadow-sm' : 'bg-slate-950/95 border-slate-800/60 text-slate-100'
        } ${collapsed ? 'w-16' : 'w-64'}`}
      >
        <SidebarContent
          collapsed={collapsed}
          activeView={activeView}
          cashOnHand={cashOnHand}
          netIncome={netIncome}
          netFlow={netFlow}
          setActiveView={setActiveView}
          setIsSettingsOpen={setIsSettingsOpen}
        />

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`absolute -right-3 top-20 w-6 h-6 rounded-full border flex items-center justify-center transition-colors z-50 shadow-lg ${
            isLight ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Overlay Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className={`relative w-64 h-full border-r flex flex-col animate-slide-in-left ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800/60 text-slate-100'
          }`}>
            <SidebarContent
              collapsed={false}
              activeView={activeView}
              cashOnHand={cashOnHand}
              netIncome={netIncome}
              netFlow={netFlow}
              setActiveView={setActiveView}
              setIsSettingsOpen={setIsSettingsOpen}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>

        {/* Top Bar */}
        <header className={`sticky top-0 z-30 h-14 flex items-center gap-4 px-4 sm:px-6 border-b backdrop-blur-md ${
          isLight ? 'bg-white/90 border-slate-200 text-slate-900' : 'bg-slate-950/90 border-slate-800/60 text-slate-100'
        }`}>
          {/* Mobile hamburger */}
          <button
            aria-label="Open navigation menu"
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Platform Portal Home Link */}
          <a
            href="/"
            onClick={(e) => {
              if (onNavigateHome) {
                e.preventDefault();
                onNavigateHome();
              }
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800 hover:text-white'
            }`}
            title="Return to TechTrekGT Portal"
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-slate-200">TechTrekGT</span>
            <span className="text-slate-500">/</span>
            <span className="text-blue-400 font-semibold">Finance</span>
          </a>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Top-right: KPI pill + Settings */}
          <div className={`hidden md:flex items-center gap-3 px-4 py-1.5 rounded-full border text-xs ${
            isLight ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-900/80 border-slate-800 text-slate-100'
          }`}>
            <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Net Income:</span>
            <span className={`font-semibold font-mono ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
              ${netIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className={`h-3 w-px ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`} />
            <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Expenses:</span>
            <span className={`font-semibold font-mono ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
              ${expenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className={`h-3 w-px ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`} />
            <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Net Flow:</span>
            <span className={`font-semibold font-mono ${netFlow >= 0 ? (isLight ? 'text-blue-600' : 'text-blue-400') : (isLight ? 'text-rose-600' : 'text-rose-400')}`}>
              {netFlow >= 0 ? '+' : ''}{netFlow.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
            className={`p-2 rounded-xl border transition-colors flex items-center justify-center ${
              isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300' : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border-slate-700'
            }`}
            title={theme === 'light' ? 'Switch to Dark Theme (Black Background)' : 'Switch to Light Theme (White Background)'}
          >
            {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-400" />}
          </button>

          <button
            onClick={() => setActiveView('settings')}
            aria-label="Open settings view"
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-semibold shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 ${
              activeView === 'settings'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400/50 shadow-blue-600/30'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/20'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings &amp; Setup</span>
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {!isDbLoaded ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold">Loading budget database...</span>
            </div>
          ) : (
            children
          )}
        </main>

        {/* Save error toast alert */}
        {saveError && (
          <div role="alert" className="fixed bottom-4 right-4 z-50 p-3 rounded-xl bg-rose-950 border border-rose-700 text-rose-200 text-xs font-semibold shadow-2xl flex items-center gap-2">
            <span>⚠️</span>
            <span>{saveError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export { NAV_ITEMS };
