// @ts-nocheck
import React, { useState, useRef } from 'react';
import { useBudgetMetadata, useLedgerDataDispatch } from '../../../context/BudgetContext';
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  FileCode,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SpreadsheetImporter } from '../../SpreadsheetImporter';

export function ImportExportSubPanel() {
  const { budget } = useBudgetMetadata();
  const {
    exportBackupJson,
    restoreFromBackup,
  } = useLedgerDataDispatch();

  const fileInputRef = useRef(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [jsonStatus, setJsonStatus] = useState(null);

  const handleExportDataClick = () => {
    setBackupStatus(null);
    const ok = exportBackupJson();
    if (ok) {
      setBackupStatus({ type: 'success', message: 'Exported JSON backup file successfully!' });
    } else {
      setBackupStatus({ type: 'error', message: 'Failed to generate JSON export backup file.' });
    }
  };

  const handleLoadBackupFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await restoreFromBackup(parsed);
      setBackupStatus({ type: 'success', message: `Successfully restored backup from ${file.name}! UI state updated.` });
    } catch (err) {
      setBackupStatus({ type: 'error', message: `Restore failed: ${err.message}` });
    } finally {
      e.target.value = '';
    }
  };

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Accounts
      const accountsData = (budget.accounts || []).map(a => ({
        AccountName: a.name,
        Type: a.type,
        StartingBalance: a.startingBalance || 0,
        SaveExtraMonthly: a.saveExtraMonthly || 0,
        Color: a.color || 'blue'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountsData), 'Accounts');

      // Sheet 2: People
      const peopleData = (budget.people || []).map(p => ({
        Name: p.name,
        Role: p.role,
        PayFrequency: p.payFrequency,
        GrossPerPay: p.grossPerPay,
        NetPerPay: p.netPerPay
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peopleData), 'Earners');

      // Sheet 3: Bills
      const billsData = (budget.bills || []).map(b => ({
        Name: b.name,
        Amount: b.amount,
        Period: b.period || 'Monthly',
        DueDay: b.dueDay,
        PaymentSource: b.paymentSource
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(billsData), 'Bills');

      XLSX.writeFile(wb, `Personal_Budget_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      setJsonStatus({ type: 'success', message: 'Exported Excel workbook successfully!' });
    } catch (err) {
      setJsonStatus({ type: 'error', message: `Excel export failed: ${err.message}` });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Section Header */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Local Snapshots and File Backups</h4>
            <p className="text-xs text-slate-400">Export offline JSON snapshots or generate Microsoft Excel workbooks.</p>
          </div>
        </div>
      </div>

      {/* Status Feedback Banners */}
      {backupStatus && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between animate-fade-in ${
          backupStatus.type === 'success'
            ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
            : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center gap-2.5">
            {backupStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{backupStatus.message}</span>
          </div>
          <button
            onClick={() => setBackupStatus(null)}
            className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer ml-4 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {jsonStatus && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between animate-fade-in ${
          jsonStatus.type === 'success'
            ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
            : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <span>{jsonStatus.message}</span>
          <button onClick={() => setJsonStatus(null)} className="text-slate-400 hover:text-white font-bold ml-4 text-xs cursor-pointer">✕</button>
        </div>
      )}

      {/* File Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Export JSON Card */}
        <div className="p-5 rounded-2xl glass-card border border-blue-800/60 bg-blue-950/10 flex flex-col justify-between space-y-4 hover:border-blue-700/80 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Download className="w-5 h-5" />
              </span>
              <h4 className="text-sm font-bold text-slate-100">Export JSON</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Download a complete JSON backup snapshot file to store securely on your local device.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportDataClick}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Download className="w-4 h-4" />
            <span>Export Data (.json)</span>
          </button>
        </div>

        {/* Export Excel Card */}
        <div className="p-5 rounded-2xl glass-card border border-indigo-800/60 bg-indigo-950/10 flex flex-col justify-between space-y-4 hover:border-indigo-700/80 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <h4 className="text-sm font-bold text-slate-100">Export Excel</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Generate a multi-sheet Microsoft Excel workbook containing all accounts, earners, and bills.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>

        {/* Load Backup Card */}
        <div className="p-5 rounded-2xl glass-card border border-emerald-800/60 bg-emerald-950/10 flex flex-col justify-between space-y-4 hover:border-emerald-700/80 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <Upload className="w-5 h-5" />
              </span>
              <h4 className="text-sm font-bold text-slate-100">Load Backup</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Upload a previously exported JSON backup snapshot to refresh the application UI immediately.
            </p>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleLoadBackupFile}
            accept=".json"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Upload className="w-4 h-4" />
            <span>Load Backup (.json)</span>
          </button>
        </div>
      </div>

      {/* Smart Statement Importer Section */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">Bank and Credit Card Statement Importer</h3>
              <p className="text-xs text-slate-400">Reconcile external statement CSV, Excel, or PDF reports directly into ledgers.</p>
            </div>
          </div>
        </div>

        {/* Embedded Full-Width Importer */}
        <SpreadsheetImporter />
      </div>
    </div>
  );
}
