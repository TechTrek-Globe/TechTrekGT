import React, { useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, BarChart2,
  Settings, LogOut, ChevronRight, Calculator, ArrowRightLeft,
  Boxes, FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FinanceSyncModal } from './FinanceSyncModal';
import { CardShowCalculatorModal } from './CardShowCalculatorModal';
import { SuppliesTrackerModal } from './SuppliesTrackerModal';
import { TaxReportModal } from './TaxReportModal';

import outpostLogo from '../assets/outpost-logo.webp';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',            icon: LayoutDashboard },
  { id: 'inventory',   label: 'Inventory',             icon: Package },
  { id: 'sales',       label: 'Sales Log',             icon: ShoppingCart },
  { id: 'pricing',     label: 'Pricing Intelligence',  icon: BarChart2 },
  { id: 'settings',    label: 'Settings',              icon: Settings },
];

/**
 * @param {{ activeView: string, onNavigate: (view: string) => void, children: React.ReactNode }} props
 */
export function AppLayout({ activeView, onNavigate, children }) {
  const { user, logout } = useAuth();
  const [calcOpen, setCalcOpen] = useState(false);
  const [financeSyncOpen, setFinanceSyncOpen] = useState(false);
  const [suppliesOpen, setSuppliesOpen] = useState(false);
  const [taxReportOpen, setTaxReportOpen] = useState(false);

  return (
    <div className="h-screen max-h-screen bg-slate-950 flex font-sans overflow-hidden">

      {/* --- Sidebar --- */}
      <aside className="hidden lg:flex flex-col w-60 bg-slate-900/60 border-r border-slate-800/60 backdrop-blur-md flex-shrink-0 min-h-0 overflow-y-auto">
        {/* Top Logo Header - 95% Width */}
        <div className="flex items-center justify-center px-2 py-3.5 border-b border-slate-800/60 flex-shrink-0 bg-slate-950/40">
          <img
            src={outpostLogo}
            alt="TechTrek Outpost Logo"
            className="w-[95%] max-w-[220px] h-auto object-contain filter drop-shadow-md"
          />
        </div>

        {/* Nav */}
        <nav className="px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeView === id;
            return (
              <button
                key={id}
                id={`nav-${id}`}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span className="truncate">{label}</span>
                </div>
                {isActive && <ChevronRight className="w-3 h-3 text-amber-500/60 flex-shrink-0" />}
              </button>
            );
          })}

          {/* Quick Action Tools */}
          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Live Tools</p>
            <div className="space-y-1">
              <button
                type="button"
                id="sidebar-card-show-btn"
                onClick={() => setCalcOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all text-left group"
              >
                <Calculator className="w-4 h-4 text-amber-400" />
                <span>Card Show Calc</span>
              </button>

              <button
                type="button"
                id="sidebar-finance-sync-btn"
                onClick={() => setFinanceSyncOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all text-left group"
              >
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                <span>Finance Sync</span>
              </button>

              <button
                type="button"
                id="sidebar-supplies-btn"
                onClick={() => setSuppliesOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all text-left group"
              >
                <Boxes className="w-4 h-4 text-blue-400" />
                <span>Supplies Tracker</span>
              </button>

              <button
                type="button"
                id="sidebar-tax-report-btn"
                onClick={() => setTaxReportOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all text-left group"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Tax / Schedule C</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Back to Finance Portal Link */}
        <div className="px-3 py-2 border-t border-slate-800/40">
          <a
            href="https://techtrekgt.com"
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-amber-400 hover:bg-slate-800/40 transition-colors group"
          >
            <span>TechTrek Finance</span>
            <span className="text-[10px] text-slate-600 group-hover:text-amber-400">↗</span>
          </a>
        </div>

        {/* User strip */}
        <div className="p-3 border-t border-slate-800/60">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-800/60 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-black text-amber-400">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || 'Account'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email || ''}</p>
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              title="Sign out"
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all duration-200"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <img src={outpostLogo} alt="TechTrek Outpost" className="h-8 w-auto max-w-[220px] object-contain filter drop-shadow-md" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalcOpen(true)}
              className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Show Calc</span>
            </button>

            <button
              onClick={() => setFinanceSyncOpen(true)}
              className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>

            <button id="mobile-logout-btn" onClick={logout} className="text-slate-500 hover:text-red-400 transition-colors p-1">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="lg:hidden flex gap-1 px-3 pt-3 pb-1 overflow-x-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`mobile-nav-${id}`}
              onClick={() => onNavigate(id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeView === id
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  : 'text-slate-500 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>

        {/* Page content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-3 lg:p-4 bg-grid-pattern">
          {children}
        </main>
      </div>

      {/* Global Modals */}
      <FinanceSyncModal
        isOpen={financeSyncOpen}
        onClose={() => setFinanceSyncOpen(false)}
      />
      <CardShowCalculatorModal
        isOpen={calcOpen}
        onClose={() => setCalcOpen(false)}
      />
      <SuppliesTrackerModal
        isOpen={suppliesOpen}
        onClose={() => setSuppliesOpen(false)}
      />
      <TaxReportModal
        isOpen={taxReportOpen}
        onClose={() => setTaxReportOpen(false)}
      />
    </div>
  );
}

