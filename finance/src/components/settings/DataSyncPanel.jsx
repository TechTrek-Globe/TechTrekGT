// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useBudgetMetadata } from '../../context/BudgetContext';
import { 
  Cloud, 
  FileSpreadsheet, 
  HardDrive, 
  Activity, 
  Download, 
  ShieldCheck, 
  RefreshCw 
} from 'lucide-react';
import { CloudSyncSubPanel } from './datasync/CloudSyncSubPanel';
import { ImportExportSubPanel } from './datasync/ImportExportSubPanel';
import { StorageResetSubPanel } from './datasync/StorageResetSubPanel';
import { SyncQueueSubPanel } from './datasync/SyncQueueSubPanel';
import { getPendingSync } from '../../utils/api';

export function DataSyncPanel() {
  const { settingsTab, budget } = useBudgetMetadata();

  const [activeTab, setActiveTab] = useState(() => {
    if (settingsTab === 'import') return 'import-export';
    if (settingsTab === 'sync') return 'cloud';
    return 'cloud';
  });

  const [hasPendingQueue, setHasPendingQueue] = useState(false);

  // Sync sub-tab selection with settingsTab if triggered externally
  useEffect(() => {
    if (settingsTab === 'import') setActiveTab('import-export');
    else if (settingsTab === 'sync') setActiveTab('cloud');
  }, [settingsTab]);

  // Check pending queue badge
  useEffect(() => {
    const checkQueue = () => {
      const pending = getPendingSync();
      setHasPendingQueue(Boolean(pending));
    };
    checkQueue();
    const interval = setInterval(checkQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  const SUB_TABS = [
    {
      id: 'cloud',
      label: 'Cloud Sync',
      icon: Cloud,
      description: 'Cloudflare D1 Vault, 2-way sync & auto-backup',
      badge: null
    },
    {
      id: 'import-export',
      label: 'Import & Export',
      icon: Download,
      description: 'JSON snapshots, Excel export & statement importer',
      badge: null
    },
    {
      id: 'storage',
      label: 'Storage & Reset',
      icon: HardDrive,
      description: 'IndexedDB quota, record counts & Danger Zone',
      badge: (budget.accounts?.length || 0) + (budget.bills?.length || 0)
    },
    {
      id: 'queue',
      label: 'Queue & Diagnostics',
      icon: Activity,
      description: 'Offline sync queue, network status & telemetry',
      badge: hasPendingQueue ? 'PENDING' : null,
      badgeColor: hasPendingQueue ? 'amber' : 'slate'
    }
  ];

  return (
    <div className="space-y-5 max-w-4xl mx-auto animate-fade-in">
      {/* Sub-Tab Navigation Header */}
      <div className="p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-md">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer text-center group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-400 group-hover:text-blue-300'}`} />
                  <span className="text-xs font-bold whitespace-nowrap">{tab.label}</span>
                  {tab.badge !== null && (
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                      isActive 
                        ? 'bg-blue-800 text-blue-100' 
                        : (tab.badgeColor === 'amber' 
                            ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse' 
                            : 'bg-slate-800 text-slate-400')
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] hidden md:block truncate max-w-full ${isActive ? 'text-blue-100/90' : 'text-slate-500'}`}>
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Sub-Panel Rendering */}
      <div className="min-w-0">
        {activeTab === 'cloud' && <CloudSyncSubPanel />}
        {activeTab === 'import-export' && <ImportExportSubPanel />}
        {activeTab === 'storage' && <StorageResetSubPanel />}
        {activeTab === 'queue' && <SyncQueueSubPanel />}
      </div>
    </div>
  );
}
