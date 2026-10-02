import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart,
  Settings, LogOut, ChevronRight, ArrowRightLeft,
  FileSpreadsheet, PanelLeftClose, PanelLeftOpen, Globe, ShieldCheck,
  Search, Command
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { CommandPalette } from './ui/CommandPalette';
import { FinanceSyncModal } from './FinanceSyncModal';
import { TaxReportModal } from './TaxReportModal';

import outpostLogo from '../assets/outpost-logo.webp';

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',             icon: LayoutDashboard },
  { id: 'inventory',   label: 'Inventory & Pricing',   icon: Package },
  { id: 'sales',       label: 'Sales Log',             icon: ShoppingCart },
  { id: 'settings',    label: 'Settings',              icon: Settings },
];

/**
 * @param {{ activeView: string, onNavigate: (view: string) => void, children: React.ReactNode }} props
 */
export function AppLayout({ activeView, onNavigate, children }) {
  const { user, logout } = useAuth();
  const [financeSyncOpen, setFinanceSyncOpen] = useState(false);
  
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'jgk1865@gmail.com';
  const visibleNavItems = [...NAV_ITEMS];
  if (user?.email?.toLowerCase() === adminEmail.toLowerCase()) {
    visibleNavItems.push({ id: 'admin', label: 'Admin', icon: ShieldCheck });
  }
  const [taxReportOpen, setTaxReportOpen] = useState(false);
  const {
    isOpen: commandPaletteOpen,
    openPalette,
    closePalette,
    togglePalette
  } = useCommandPalette();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePalette]);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('outpost_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('outpost_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  return (
    <div className="h-screen max-h-screen bg-slate-950 flex font-sans overflow-hidden">

      {/* --- Desktop Sidebar (Collapsible) --- */}
      <aside className={`hidden lg:flex flex-col ${isCollapsed ? 'w-16' : 'w-60'} bg-slate-900/60 border-r border-slate-800/60 backdrop-blur-md flex-shrink-0 min-h-0 overflow-y-auto transition-all duration-300 ease-in-out`}>
        {/* Top Header / Toggle */}
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-3 py-3 border-b border-slate-800/60 flex-shrink-0 bg-slate-950/40">
            <img
              src={outpostLogo}
              alt="TechTrek Outpost Logo"
              className="w-[85%] max-w-[180px] h-auto object-contain filter drop-shadow-md rounded-lg"
            />
            <button
              onClick={toggleSidebar}
              title="Collapse sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition-colors flex-shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center p-2.5 border-b border-slate-800/60 flex-shrink-0 bg-slate-950/40">
            <button
              onClick={toggleSidebar}
              title="Expand sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition-colors"
            >
              <PanelLeftOpen className="w-5 h-5 text-amber-400" />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className={`px-2 py-3 space-y-1 flex-1 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
          {/* Quick Command Palette Button */}
          {isCollapsed ? (
            <button
              type="button"
              id="sidebar-command-palette-btn"
              onClick={openPalette}
              title="Command Palette (Cmd+K / Ctrl+K)"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 border border-slate-800/80 transition-all mb-2 group"
            >
              <Search className="w-5 h-5 text-slate-400 group-hover:text-amber-400" />
            </button>
          ) : (
            <button
              type="button"
              id="sidebar-command-palette-btn"
              onClick={openPalette}
              title="Command Palette (Cmd+K / Ctrl+K)"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 bg-slate-950/50 hover:bg-slate-800/60 hover:text-slate-200 border border-slate-800/80 transition-all group mb-2"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 group-hover:text-amber-400" />
                <span>Search / Commands</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-400 bg-slate-800/90 border border-slate-700/60 rounded">
                ⌘K
              </kbd>
            </button>
          )}

          {visibleNavItems.map(({ id, label, icon: Icon }) => {
            const isActive = activeView === id;
            if (isCollapsed) {
              return (
                <button
                  key={id}
                  id={`nav-${id}`}
                  onClick={() => onNavigate(id)}
                  title={label}
                  className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                </button>
              );
            }

            return (
              <button
                key={id}
                id={`nav-${id}`}
                onClick={() => onNavigate(id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group ${
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
          {!isCollapsed ? (
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Live Tools</p>
              <div className="space-y-1">
                <button
                  type="button"
                  id="sidebar-finance-sync-btn"
                  onClick={() => setFinanceSyncOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all text-left group"
                >
                  <ArrowRightLeft className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Finance Sync</span>
                </button>

                <button
                  type="button"
                  id="sidebar-tax-report-btn"
                  onClick={() => setTaxReportOpen(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all text-left group"
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Tax / Schedule C</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2 pb-1 border-t border-slate-800/60 my-2 space-y-1 flex flex-col items-center">
              <button
                type="button"
                id="sidebar-finance-sync-btn"
                onClick={() => setFinanceSyncOpen(true)}
                title="Finance Sync"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"
              >
                <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
              </button>

              <button
                type="button"
                id="sidebar-tax-report-btn"
                onClick={() => setTaxReportOpen(true)}
                title="Tax / Schedule C Report"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              </button>
            </div>
          )}
        </nav>

        {/* Back to TechTrekGT Launch Pad Link */}
        {!isCollapsed ? (
          <div className="px-3 py-2 border-t border-slate-800/40">
            <a
              href="https://techtrekgt.com"
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-amber-400 hover:bg-slate-800/60 transition-colors group border border-slate-800/40"
              title="Return to TechTrekGT Main Launch Pad"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold">Launch Pad</span>
              </div>
              <span className="text-[10px] text-slate-500 group-hover:text-amber-400">↗</span>
            </a>
          </div>
        ) : (
          <div className="p-2 border-t border-slate-800/40 flex justify-center">
            <a
              href="https://techtrekgt.com"
              title="Return to TechTrekGT Main Launch Pad"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition-colors"
            >
              <Globe className="w-4 h-4 text-amber-400" />
            </a>
          </div>
        )}

        {/* User strip */}
        {!isCollapsed ? (
          <div className="p-2.5 border-t border-slate-800/60">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-800/60 transition-colors group">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-black text-amber-400">
                  {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || 'Account'}</p>
                <p className="text-[10px] text-slate-500 truncate leading-none">{user?.email || ''}</p>
              </div>
              <button
                id="logout-btn"
                onClick={logout}
                title="Sign out"
                className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all duration-200"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 border-t border-slate-800/60 flex flex-col items-center gap-1.5">
            <div
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/20 border border-amber-500/20 flex items-center justify-center flex-shrink-0 cursor-default"
              title={`${user?.name || 'Account'} (${user?.email || ''})`}
            >
              <span className="text-xs font-black text-amber-400">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              title="Sign out"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </aside>

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <img src={outpostLogo} alt="TechTrek Outpost" className="h-8 w-auto max-w-[220px] object-contain filter drop-shadow-md" />
          </div>

          <div className="flex items-center gap-1.5">
            <a
              href="https://techtrekgt.com"
              title="Return to TechTrekGT Main Launch Pad"
              className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-amber-400 border border-slate-700/60 text-xs font-semibold flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Launch Pad</span>
            </a>

            <button
              type="button"
              id="mobile-command-palette-btn"
              onClick={openPalette}
              title="Command Palette (Cmd+K)"
              className="p-1.5 rounded-lg bg-slate-800/80 text-amber-400 border border-slate-700/60 text-xs font-bold flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono">⌘K</span>
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
          {visibleNavItems.map(({ id, label, icon: Icon }) => (
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
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden p-2 lg:p-3 bg-grid-pattern">
          {children}
        </main>
      </div>

      {/* Global Modals */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={closePalette}
        onNavigate={onNavigate}
        onOpenFinanceSync={() => setFinanceSyncOpen(true)}
        onOpenTaxReport={() => setTaxReportOpen(true)}
      />
      <FinanceSyncModal
        isOpen={financeSyncOpen}
        onClose={() => setFinanceSyncOpen(false)}
      />
      <TaxReportModal
        isOpen={taxReportOpen}
        onClose={() => setTaxReportOpen(false)}
      />
    </div>
  );
}
