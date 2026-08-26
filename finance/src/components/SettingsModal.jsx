// @ts-nocheck
import React, { useRef } from 'react';
import { useBudgetMetadata } from '../context/BudgetContext';
import { 
  X, 
  Users, 
  Receipt, 
  LayoutDashboard, 
  Archive, 
  ShieldCheck, 
  Bug, 
  CheckCircle2, 
  Settings 
} from 'lucide-react';
import { AccountsPeoplePanel } from './settings/AccountsPeoplePanel';
import { BillsSplitsPanel } from './settings/BillsSplitsPanel';
import { DashboardSettingsPanel } from './settings/DashboardSettingsPanel';
import { DataSyncPanel } from './settings/DataSyncPanel';
import { SecuritySettingsPanel } from './settings/SecuritySettingsPanel';
import { DebugConsolePanel } from './settings/DebugConsolePanel';

export function SettingsModal() {
  const { 
    budget, 
    isSettingsOpen, 
    setIsSettingsOpen, 
    settingsTab, 
    setSettingsTab, 
    isDebugMode 
  } = useBudgetMetadata();

  const settingsModalRef = useRef(null);

  if (!isSettingsOpen) return null;

  const SETUP_TABS = ['accounts', 'people', 'splits', 'bills'];
  const activeSection = SETUP_TABS.includes(settingsTab) ? 'setup' : settingsTab;

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
      label: 'Data', 
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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsSettingsOpen(false);
      }}
    >
      <div 
        ref={settingsModalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col h-[90vh] max-h-[850px] overflow-hidden"
      >
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                Settings &amp; Setup
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {sidebarNav.find(s => s.id === activeSection)?.label || 'Setup'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Accounts, earners, bills, split rules, preferences, and data sync.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              aria-label="Close settings modal"
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Sidebar Nav + Dynamic Content Area */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          
          {/* Left Navigation Sidebar */}
          <aside className="w-full md:w-60 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/50 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0 scrollbar-hide">
            <div className="hidden md:flex items-center justify-between px-3 py-1 mb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Sections</span>
              <div className="flex items-center gap-1 text-emerald-500 font-normal">
                <span>Auto-saved</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </div>
            </div>

            {sidebarNav.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSidebarNav(section.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                    <div className="truncate">
                      <span className="text-xs block leading-tight">{section.label}</span>
                      <span className="text-[10px] text-slate-500 hidden md:block">{section.desc}</span>
                    </div>
                  </div>
                  {section.badge !== null && (
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ml-1.5 ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {section.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Setup Sub-Items Navigation */}
            {activeSection === 'setup' && (
              <div className="hidden md:flex flex-col gap-1 mt-2 pt-2 border-t border-slate-800/80">
                <div className="px-3 py-0.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  Setup Tabs
                </div>
                {setupSubNavItems.map(sub => {
                  const SubIcon = sub.icon;
                  const isSubActive = (sub.id === 'accounts' && (settingsTab === 'accounts' || settingsTab === 'people')) ||
                                      (sub.id === 'bills' && (settingsTab === 'bills' || settingsTab === 'splits'));
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSettingsTab(sub.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all cursor-pointer font-medium ${
                        isSubActive
                          ? 'bg-slate-800 text-white font-bold border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <SubIcon className="w-3.5 h-3.5 text-blue-400" />
                        <span>{sub.label}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{sub.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right Main Content Scrollable Area */}
          <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-y-auto matrix-scrollbar bg-slate-900/60">
            {/* Setup Sub-Tabs Mobile Header */}
            {activeSection === 'setup' && (
              <div className="flex md:hidden items-center gap-1.5 mb-4 pb-2 border-b border-slate-800 overflow-x-auto">
                {setupSubNavItems.map(sub => {
                  const SubIcon = sub.icon;
                  const isSubActive = (sub.id === 'accounts' && (settingsTab === 'accounts' || settingsTab === 'people')) ||
                                      (sub.id === 'bills' && (settingsTab === 'bills' || settingsTab === 'splits'));
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSettingsTab(sub.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer font-semibold shrink-0 ${
                        isSubActive
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <SubIcon className="w-3.5 h-3.5" />
                      <span>{sub.label}</span>
                      <span className="text-[10px] font-mono opacity-80">({sub.count})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Dynamic Active Panel Rendering */}
            {activeSection === 'setup' && (settingsTab === 'accounts' || settingsTab === 'people') && (
              <AccountsPeoplePanel />
            )}

            {activeSection === 'setup' && (settingsTab === 'bills' || settingsTab === 'splits') && (
              <BillsSplitsPanel />
            )}

            {activeSection === 'dashboard' && (
              <DashboardSettingsPanel />
            )}

            {(activeSection === 'data' || settingsTab === 'data') && (
              <DataSyncPanel />
            )}

            {activeSection === 'security' && (
              <SecuritySettingsPanel />
            )}

            {activeSection === 'debug' && (
              <DebugConsolePanel />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
