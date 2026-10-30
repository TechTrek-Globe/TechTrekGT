// @ts-nocheck
import React from 'react';
import { Cloud, ArrowLeft } from 'lucide-react';
import { DataSyncPanel } from './settings/DataSyncPanel';

export function BackupSyncView({ onNavigateView }) {
  return (
    <div className="space-y-4 animate-fade-in text-slate-100 pt-3 max-w-5xl mx-auto pb-16">
      {/* Sleek Compact Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 shadow-sm">
            <Cloud className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              Backup &amp; Sync
            </h2>
            <p className="text-[11px] text-slate-400">
              Cloudflare D1 Vault, 2-way sync, Excel/JSON snapshots, storage management &amp; telemetry.
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
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-blue-400" />
          <span>Dashboard</span>
        </button>
      </div>

      {/* Main Content */}
      <DataSyncPanel />
    </div>
  );
}
