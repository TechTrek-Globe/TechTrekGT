import React from 'react';
import { Gavel, LayoutDashboard, Package, ShoppingCart, BarChart2, Settings, LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

  return (
    <div className="min-h-screen bg-slate-950 flex font-sans">

      {/* --- Sidebar --- */}
      <aside className="hidden lg:flex flex-col w-60 bg-slate-900/60 border-r border-slate-800/60 backdrop-blur-md flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/20 flex-shrink-0">
            <Gavel className="w-4.5 h-4.5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-amber-500/70 tracking-widest uppercase">TechTrek</p>
            <p className="text-sm font-bold text-slate-100 -mt-0.5 truncate">Outpost</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Gavel className="w-4 h-4 text-slate-950" />
            </div>
            <span className="font-black text-white text-sm">TechTrek Outpost</span>
          </div>
          <button id="mobile-logout-btn" onClick={logout} className="text-slate-500 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
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
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-grid-pattern">
          {children}
        </main>
      </div>
    </div>
  );
}
