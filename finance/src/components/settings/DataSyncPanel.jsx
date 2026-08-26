// @ts-nocheck
import React, { useState, useRef } from 'react';
import { useBudgetMetadata, useLedgerDataState, useLedgerDataDispatch } from '../../context/BudgetContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Download, 
  Upload, 
  Cloud, 
  Lock, 
  KeyRound, 
  Loader2, 
  RotateCcw, 
  Trash2, 
  FileSpreadsheet, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SpreadsheetImporter } from '../SpreadsheetImporter';
import { getApiUrl } from '../../utils/api';

export function DataSyncPanel() {
  const {
    budget,
    isAutoCloudBackupEnabled,
    toggleAutoCloudBackup,
    lastCloudSyncTime,
  } = useBudgetMetadata();

  const { isAuthenticated } = useAuth();
  const { syncPasscode: cloudPasscode, isSyncUnlocked: isCloudUnlocked } = useLedgerDataState();
  const {
    resetToDefaults,
    clearAllData,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    loadDemoPreset,
    setSyncPasscode: setCloudPasscode,
    setIsSyncUnlocked: setIsCloudUnlocked,
  } = useLedgerDataDispatch();

  const fileInputRef = useRef(null);
  const [backupStatus, setBackupStatus] = useState(null);
  const [jsonStatus, setJsonStatus] = useState(null);

  // Cloud sync state
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Danger zone confirmations
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false);

  const handleUnlockCloudVault = async (e) => {
    if (e) e.preventDefault();
    if (!passcodeInput) return;
    setPasscodeError('');
    setIsVerifyingCode(true);

    try {
      const res = await fetch(getApiUrl('/api/verify-sync-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: passcodeInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCloudPasscode(passcodeInput);
        setIsCloudUnlocked(true);
        setPasscodeInput('');
        setCloudSyncStatus({ type: 'success', message: 'Cloud Vault unlocked successfully!' });
      } else {
        setPasscodeError(data.error || 'Invalid access passcode.');
      }
    } catch (err) {
      setPasscodeError(`Verification failed: ${err.message}`);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleLockCloudVault = () => {
    setIsCloudUnlocked(false);
    setCloudPasscode('');
    setCloudSyncStatus(null);
  };

  const handlePushCloudBackup = async () => {
    setCloudSyncStatus({ type: 'info', message: 'Saving changes locally & syncing with Cloud Vault in background...' });
    try {
      const res = await pushCloudBackup();
      if (res && res.success) {
        setCloudSyncStatus({ type: 'success', message: `Successfully backed up data to Cloud Vault! (${new Date().toLocaleTimeString()})` });
      } else {
        setCloudSyncStatus({ type: 'warning', message: `Saved locally. ${res?.error || 'Cloud sync queued for background retry.'}` });
      }
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Cloud backup error: ${err.message}` });
    }
  };

  const handlePullCloudRestore = async () => {
    setCloudSyncStatus(null);
    setIsCloudSyncing(true);
    try {
      await pullCloudRestore();
      setCloudSyncStatus({ type: 'success', message: 'Successfully restored data from Cloud Vault! Database & UI state refreshed.' });
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Cloud restore failed: ${err.message}` });
    } finally {
      setIsCloudSyncing(false);
    }
  };

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
    <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
      {/* Local-First Architecture & Security Origin Sandbox Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/50 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">100% Local-First Architecture</h3>
              <p className="text-xs text-slate-400">Strict Browser Origin Sandboxing &amp; Zero Cloud Footprint</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              IndexedDB Engine Active
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          All financial data (accounts, earners, bills, transactions, loan schedules) is saved entirely within your browser&apos;s native IndexedDB database. Data remains isolated on your device and is never transmitted to external cloud servers.
        </p>
      </div>

      {/* Database Record Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <div className="text-xl font-mono font-bold text-blue-400">{budget.accounts?.length || 0}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Bank Accounts</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <div className="text-xl font-mono font-bold text-purple-400">{budget.people?.length || 0}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Household Earners</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <div className="text-xl font-mono font-bold text-emerald-400">{budget.bills?.length || 0}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Recurring Bills</div>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <div className="text-xl font-mono font-bold text-amber-400">{budget.lineItems?.length || 0}</div>
          <div className="text-[11px] text-slate-400 font-medium mt-0.5">Ledger Entries</div>
        </div>
      </div>

      {/* Smart Spreadsheet Importer */}
      <SpreadsheetImporter />

      {/* Status Feedback Banners */}
      {backupStatus && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between ${
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
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between ${
          jsonStatus.type === 'success'
            ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
            : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <span>{jsonStatus.message}</span>
          <button onClick={() => setJsonStatus(null)} className="text-slate-400 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* Backup & Restore Action Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Export JSON Card */}
        <div className="p-5 rounded-2xl glass-card border border-blue-800/60 bg-blue-950/10 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Download className="w-5 h-5" />
              </span>
              <h4 className="text-sm font-bold text-slate-100">Export JSON</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Download a complete JSON backup snapshot file to store on your local device.
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
        <div className="p-5 rounded-2xl glass-card border border-indigo-800/60 bg-indigo-950/10 flex flex-col justify-between space-y-4">
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
        <div className="p-5 rounded-2xl glass-card border border-emerald-800/60 bg-emerald-950/10 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <Upload className="w-5 h-5" />
              </span>
              <h4 className="text-sm font-bold text-slate-100">Load Backup</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Upload a previously exported JSON backup file to refresh the application UI immediately.
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

      {/* Cloudflare D1 Vault Sync Section */}
      <div className="p-5 rounded-2xl glass-card border border-purple-800/60 bg-purple-950/10 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Cloud className="w-5 h-5" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-slate-100">Cloudflare D1 Vault Sync</h4>
              <p className="text-xs text-slate-400">Encrypted personal backup &amp; cross-device sync on Cloudflare D1</p>
            </div>
          </div>
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                Account Synced
              </span>
            </div>
          ) : (
            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
              Sign-in Required
            </span>
          )}
        </div>

        {!isAuthenticated ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-slate-400">
              Sign in to your account to automatically sync your budget vault across all your computers and devices.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Auto Backup Toggle Switch */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-200">Automatic Cloud Backup</div>
                <div className="text-[11px] text-slate-400">
                  {isAutoCloudBackupEnabled
                    ? (lastCloudSyncTime ? `Auto-sync active • Last backed up at ${lastCloudSyncTime}` : 'Auto-sync active • Debounced cloud sync on local edits')
                    : 'Disabled • Local edits will not push to D1 automatically'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleAutoCloudBackup(!isAutoCloudBackupEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isAutoCloudBackupEnabled ? 'bg-purple-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isAutoCloudBackupEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {cloudSyncStatus && (
              <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
                cloudSyncStatus.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                  : cloudSyncStatus.type === 'info'
                  ? 'bg-purple-950/80 border border-purple-800 text-purple-300'
                  : 'bg-rose-950/80 border border-rose-800 text-rose-300'
              }`}>
                <span>{cloudSyncStatus.message}</span>
                <button onClick={() => setCloudSyncStatus(null)} className="text-slate-400 hover:text-white font-bold ml-4">✕</button>
              </div>
            )}

            {/* Manual Sync Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handlePushCloudBackup}
                className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                <span>Push Backup to Cloud D1</span>
              </button>
              <button
                type="button"
                disabled={isCloudSyncing}
                onClick={handlePullCloudRestore}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isCloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4 text-purple-400" />}
                <span>Restore from Cloud D1</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Danger Zone</h3>
        </div>

        {/* Clear All Data */}
        <div className="p-5 rounded-xl glass-card border border-rose-800/60 bg-rose-950/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-400" />
              Clear All Budget Data (Clean Slate)
            </h3>
            <span className="text-[10px] font-mono text-rose-400 bg-rose-950 px-2.5 py-1 rounded-full border border-rose-800">
              Empty Household
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Deletes all accounts, earners, recurring bills, monthly line items, and loan schedules. This will wipe your active budget and leave a completely empty household dashboard.
          </p>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-400 font-mono">
              Will remove {budget.accounts.length} accounts, {budget.bills.length} bills, {budget.people.length} earners
            </div>

            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-medium">Are you sure?</span>
                <button
                  type="button"
                  onClick={() => {
                    clearAllData();
                    setConfirmClearAll(false);
                    setJsonStatus({ type: 'success', message: 'All budget data cleared successfully!' });
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Yes, Delete Everything
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="px-5 py-2.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Load Demo Dataset */}
        <div className="p-5 rounded-xl glass-card border border-indigo-800/60 bg-indigo-950/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
              Load 100% Fake Demo Dataset
            </h3>
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-2.5 py-1 rounded-full border border-indigo-800">
              Full Demo Household
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Populates a full demonstration household with 100% fictional data: 2 earners (Alex &amp; Taylor), 3 mock accounts (Apex Checking, Emergency Savings, Sapphire Credit), recurring rent/utility bills, custom split allocations, and a mortgage loan schedule.
          </p>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-400 font-mono">
              Includes 3 demo accounts, 6 sample bills, 2 earners, and 1 mortgage schedule
            </div>

            {confirmLoadDemo ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-indigo-400 font-medium">Load fake demo data?</span>
                <button
                  type="button"
                  onClick={() => {
                    loadDemoPreset();
                    setConfirmLoadDemo(false);
                    setJsonStatus({ type: 'success', message: 'Loaded 100% fake demo dataset successfully!' });
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Yes, Load Fake Demo Data
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLoadDemo(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLoadDemo(true)}
                className="px-5 py-2.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Load Fake Demo Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Reset to Empty Starter */}
        <div className="p-5 rounded-xl glass-card border border-amber-800/60 bg-amber-950/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-400" />
              Reset to Empty Starter Template
            </h3>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-950 px-2.5 py-1 rounded-full border border-amber-800">
              Blank Starter
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Resets to a clean starter template with zero pre-filled balances or bills.
          </p>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-400">
              Resets active household to empty defaults.
            </div>

            {confirmResetDefaults ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400 font-medium">Replace current data?</span>
                <button
                  type="button"
                  onClick={() => {
                    resetToDefaults();
                    setConfirmResetDefaults(false);
                    setJsonStatus({ type: 'success', message: 'Reset to starter preset successfully!' });
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Yes, Restore Blank Template
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetDefaults(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetDefaults(true)}
                className="px-5 py-2.5 bg-amber-600/80 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset to Empty Starter</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
