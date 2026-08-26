// @ts-nocheck
import React from 'react';
import { useBudgetMetadata } from '../context/BudgetContext';
import { 
  Users, 
  Receipt, 
  LayoutDashboard, 
  Archive, 
  ShieldCheck, 
  Bug, 
  CheckCircle2, 
  Settings, 
  ArrowLeft 
} from 'lucide-react';
import { AccountsPeoplePanel } from './settings/AccountsPeoplePanel';
import { BillsSplitsPanel } from './settings/BillsSplitsPanel';
import { DashboardSettingsPanel } from './settings/DashboardSettingsPanel';
import { DataSyncPanel } from './settings/DataSyncPanel';
import { SecuritySettingsPanel } from './settings/SecuritySettingsPanel';
import { DebugConsolePanel } from './settings/DebugConsolePanel';

export function SettingsView({ onNavigateView }) {
  const { 
    budget, 
    settingsTab, 
    setSettingsTab, 
    isDebugMode 
  } = useBudgetMetadata();

  const SETUP_TABS = ['accounts', 'people', 'splits', 'bills'];
  const activeSection = SETUP_TABS.includes(settingsTab) 
    ? 'setup' 
    : (settingsTab === 'import' || settingsTab === 'sync' ? 'data' : settingsTab);

  const sidebarNav = [
    { 
      id: 'setup', 
      label: 'Setup', 
      icon: Users, 
      desc: 'Accounts, Earners & Bills', 
      badge: (budget.accounts?.length || 0) + (budget.people?.length || 0) + (budget.bills?.filter(b => !b.isArchived).length || 0) 
    },
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      icon: LayoutDashboard, 
      desc: 'Widgets & Theme', 
      badge: null 
    },
    { 
      id: 'data', 
      label: 'Data & Sync', 
      icon: Archive, 
      desc: 'Backup, Restore & Sync', 
      badge: null 
    },
    { 
      id: 'security', 
      label: 'Security', 
      icon: ShieldCheck, 
      desc: 'Profile & Password', 
      badge: null 
    },
    { 
      id: 'debug', 
      label: 'Debugging', 
      icon: Bug, 
      desc: 'Real-time Logs & Tracing', 
      badge: isDebugMode ? 'ACTIVE' : null 
    },
  ];

  const setupSubNavItems = [
    { id: 'accounts', label: 'Accounts & Earners', icon: Users, count: (budget.accounts?.length || 0) + (budget.people?.length || 0) },
    { id: 'bills', label: 'Bills & Splits', icon: Receipt, count: (budget.bills?.filter(b => !b.isArchived).length || 0) },
  ];

  const handleSidebarNav = (sectionId) => {
    if (sectionId === 'setup') {
      setSettingsTab(SETUP_TABS.includes(settingsTab) ? settingsTab : 'accounts');
    } else {
      setSettingsTab(sectionId);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-8 text-slate-100">
      
      {/* Sleek Compact Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-600 text-slate-950 shadow-sm">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              Settings &amp; Setup
            </h2>
            <p className="text-[11px] text-slate-400">
              Accounts, earners, bills, split rules, and preferences.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (onNavigateView) {
              onNavigateView('dashboard');
            } else {
              window.history.pushState({}, '', '/finance/dashboard');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-blue-400" />
          <span>Dashboard</span>
        </button>
      </div>

      {/* Main View Layout: Top Horizontal Nav Bar + Content Panel */}
      <div className="flex flex-col gap-3.5">

        {/* Top Section Navigation */}
        <aside className="w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-1.5 flex flex-col gap-1 shadow-md">
          <div className="flex items-center justify-between px-2 py-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Sections</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse block" />
            </p>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <span>Auto-saved</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500/70" />
            </div>
          </div>
          
          <div className="flex items-stretch gap-1 overflow-x-auto pb-0.5 scrollbar-hide px-0.5">
            {sidebarNav.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSidebarNav(section.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer font-medium whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{section.label}</span>
                  {section.badge !== null && (
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      isActive ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {section.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Setup Sub-Items */}
          {activeSection === 'setup' && (
            <div className="flex items-center gap-1.5 pt-1 px-1 border-t border-slate-800/60 overflow-x-auto">
              {setupSubNavItems.map(sub => {
                const SubIcon = sub.icon;
                const isSubActive = (sub.id === 'accounts' && (settingsTab === 'accounts' || settingsTab === 'people')) ||
                                    (sub.id === 'bills' && (settingsTab === 'bills' || settingsTab === 'splits'));
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSettingsTab(sub.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer font-medium ${
                      isSubActive
                        ? 'bg-blue-600/30 text-blue-200 border border-blue-500/40 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <SubIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>{sub.label}</span>
                    {sub.count !== null && (
                      <span className={`ml-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${isSubActive ? 'bg-blue-800/80 text-blue-100' : 'text-slate-500 bg-slate-900'}`}>
                        {sub.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Content Panel Area */}
        <div className="flex-1 min-w-0 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-5 shadow-md">
          {activeSection === 'setup' && (settingsTab === 'accounts' || settingsTab === 'people') && (
            <AccountsPeoplePanel />
          )}

          {activeSection === 'setup' && (settingsTab === 'bills' || settingsTab === 'splits') && (
            <BillsSplitsPanel />
          )}

          {activeSection === 'dashboard' && (
            <DashboardSettingsPanel />
          )}

          {(activeSection === 'data' || settingsTab === 'data' || settingsTab === 'import' || settingsTab === 'sync') && (
            <DataSyncPanel />
          )}

          {activeSection === 'security' && (
            <SecuritySettingsPanel />
          )}

          {activeSection === 'debug' && (
            <DebugConsolePanel />
          )}
        </div>

      </div>
    </div>
  );
}
