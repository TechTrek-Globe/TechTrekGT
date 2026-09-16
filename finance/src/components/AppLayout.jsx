import React, { useState, useEffect, useMemo } from 'react';
import { useBudget } from '../context/BudgetContext';
import { useAuth } from '../context/AuthContext';
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
  Globe,
  Shield
} from 'lucide-react';

import headerLogoDark from '../assets/header-logo-dark.png';
import headerLogoLight from '../assets/header-logo-light.png';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',            icon: LayoutDashboard, color: 'text-blue-400' },
  { id: 'ledger',      label: 'Transactions',         icon: TrendingUp,      color: 'text-emerald-400' },
  { id: 'main_budget', label: 'Bills',                icon: ReceiptText,     color: 'text-violet-400' },
  { id: 'amortization',label: 'Loan Amortization',     icon: Calculator,      color: 'text-rose-400' },
  { id: 'settings',    label: 'Setup Accounts, People, Bills, Splits', icon: Settings, color: 'text-amber-400' },
];

const SIDEBAR_KEY = 'trekledger_sidebar_collapsed';

const SidebarContent = ({ collapsed, activeView = 'dashboard', cashOnHand, netIncome, netFlow, onNavigateView, setIsSettingsOpen, onClose, isLight = false, isAdmin = false }) => {
  const logoSrc = isLight ? headerLogoLight : headerLogoDark;
  const handleViewClick = (viewId) => {
    if (onNavigateView) {
      onNavigateView(viewId);
    }
  };

  const visibleNavItems = isAdmin
    ? [...NAV_ITEMS, { id: 'admin', label: 'Admin', icon: Shield, color: 'text-amber-400' }]
    : NAV_ITEMS;
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center border-b border-slate-800/60 ${collapsed ? 'justify-center p-2' : 'p-1'}`}>
        {collapsed ? (
          <div className="w-10 h-10 overflow-hidden flex items-center justify-center rounded-xl" title="TechTrek Finance">
            <img src={logoSrc} alt="TechTrek Finance" className="h-12 w-12 object-cover object-left" />
          </div>
        ) : (
          <div className="animate-fade-in flex items-center w-full overflow-hidden">
            <img src={logoSrc} alt="TechTrek Finance Logo" className="w-full h-auto object-contain filter drop-shadow-md" />
          </div>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close navigation menu" className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-200 rounded-lg">
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
      {visibleNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => handleViewClick(item.id)}
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


    {/* Launch Pad Navigation Link */}
    <div className={`mx-3 mb-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/60'}`}>
      <a
        href="https://techtrekgt.com"
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
          isLight
            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/60'
        } ${collapsed ? 'justify-center px-2' : ''}`}
        title="Return to TechTrekGT Main Launch Pad"
      >
        <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
        {!collapsed && <span className="font-semibold">Launch Pad</span>}
        {!collapsed && <span className="ml-auto text-[10px] text-slate-500">↗</span>}
      </a>
    </div>
  </div>
  );
};

export function AppLayout({ children, onNavigateHome, onNavigateView, activeView = 'dashboard' }) {
  const {
    budget,
    isDbLoaded,
    saveError,
    theme,
    setTheme,
    setIsSettingsOpen,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalActualExpenses,
    getTotalCashOnHand,
    getTotalMonthEndCashOnHand,
    getCalculatedBalanceAsOf,
  } = useBudget();

  const { user } = useAuth();
  const isAdmin = !!(user?.email && import.meta.env.VITE_ADMIN_EMAIL && user.email === import.meta.env.VITE_ADMIN_EMAIL);

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

  const today = useMemo(() => new Date(), []);
  const endOfMonthDate = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 1, 0), [today]);
  const monthKey = useMemo(() => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, [today]);

  const netIncome = useMemo(() => getTotalMonthlyNetIncome(budget?.people), [budget?.people, getTotalMonthlyNetIncome]);
  
  const expenses = useMemo(() => {
    if (typeof getTotalActualExpenses === 'function') {
      return getTotalActualExpenses(monthKey, budget?.bills);
    }
    return getTotalMonthlyExpenses(budget?.bills);
  }, [budget?.bills, monthKey, getTotalActualExpenses, getTotalMonthlyExpenses]);

  const cashOnHand = useMemo(() => {
    if (typeof getTotalMonthEndCashOnHand === 'function') {
      return getTotalMonthEndCashOnHand(budget?.accounts, today);
    }
    if (typeof getCalculatedBalanceAsOf === 'function') {
      return (budget?.accounts || []).reduce((sum, acc) => {
        const balObj = getCalculatedBalanceAsOf(acc.id, endOfMonthDate);
        return sum + (balObj?.totalEnd ?? (parseFloat(acc.startingBalance) || 0));
      }, 0);
    }
    if (typeof getTotalCashOnHand === 'function') {
      return getTotalCashOnHand(budget?.accounts, endOfMonthDate);
    }
    return 0;
  }, [budget?.accounts, today, endOfMonthDate, getTotalMonthEndCashOnHand, getCalculatedBalanceAsOf, getTotalCashOnHand]);

  const netFlow = useMemo(() => netIncome - expenses, [netIncome, expenses]);

  const isLight = theme === 'light';

  return (
    <div className={`h-screen overflow-hidden font-sans selection:bg-blue-500 selection:text-white flex transition-colors duration-200 ${
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
          isLight={isLight}
          isAdmin={isAdmin}
          onNavigateView={onNavigateView}
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
          <div
            className="absolute inset-0 bg-black/60 cursor-pointer"
            onClick={() => setMobileOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Close navigation menu"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMobileOpen(false);
              }
            }}
          />
          <aside className={`relative w-64 h-full border-r flex flex-col animate-slide-in-left ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800/60 text-slate-100'
          }`}>
            <SidebarContent
              collapsed={false}
              activeView={activeView}
              cashOnHand={cashOnHand}
              netIncome={netIncome}
              netFlow={netFlow}
              isLight={isLight}
              isAdmin={isAdmin}
              onNavigateView={onNavigateView}
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

          {/* TechTrekGT Launch Pad Home Link */}
          <a
            href="https://techtrekgt.com"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300 shadow-sm'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-800 hover:text-white shadow-sm'
            }`}
            title="Return to TechTrekGT Main Launch Pad"
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-slate-200">TechTrekGT Launch Pad</span>
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

        </header>

        {/* Page Content */}
        <main className={`flex-1 min-h-0 flex flex-col matrix-scrollbar ${activeView === 'ledger' ? 'p-2 sm:p-3 overflow-hidden' : 'overflow-auto px-3 sm:px-4 pt-0 pb-4'}`}>
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
