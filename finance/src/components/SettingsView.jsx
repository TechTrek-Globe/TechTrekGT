// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { useBudget } from '../context/BudgetContext';
import { 
  Plus, 
  Trash2, 
  CreditCard, 
  Users, 
  Receipt, 
  PieChart, 
  Save, 
  RotateCcw,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ShieldCheck,
  Cloud,
  CloudUpload,
  CloudDownload,
  Lock,
  KeyRound,
  Loader2,
  Settings,
  ArrowLeft,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../utils/spreadsheetParser';
import { detectFileType, parseGenericFlat, autoMatchColumns, applyTransactionMapping } from '../utils/importer';
import { MONTH_SHORT_NAMES, getAccountSaveExtraPersonPortion } from '../utils/paydayUtils';
import { NoYearCalendarPicker } from './NoYearCalendarPicker';
import { useAuth } from '../context/AuthContext';
import { PRESET_SECURITY_QUESTIONS } from './AuthModal';
import { getApiUrl } from '../utils/api';
import { SpreadsheetImporter } from './SpreadsheetImporter';

export function SettingsView() {
  const { 
    budget, 
    theme,
    setTheme,
    dashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    reorderDashboardWidgets,
    resetDashboardWidgets,
    settingsTab,
    setSettingsTab,
    setActiveView,
    addAccount,
    updateAccount,
    deleteAccount,
    addPerson,
    updatePerson,
    deletePerson,
    addBill,
    updateBill,
    deleteBill,
    archiveBill,
    unarchiveBill,
    updateBillSplits,
    resetToDefaults,
    clearAllData,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    importSpreadsheetSelective,
    isAutoCloudBackupEnabled,
    toggleAutoCloudBackup,
    lastCloudSyncTime,
    loadDemoPreset
  } = useBudget();

  // Local form state for new item creation
  const fileInputRef = useRef(null);
  const [backupStatus, setBackupStatus] = useState(null);

  // Cloud Vault Sync state
  const [isCloudUnlocked, setIsCloudUnlocked] = useState(() => {
    try { return localStorage.getItem('cf_sync_unlocked') === 'true'; }
    catch { return false; }
  });
  const [cloudPasscode, setCloudPasscode] = useState(() => {
    try { return localStorage.getItem('cf_sync_passcode') || ''; }
    catch { return ''; }
  });
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  const handleUnlockCloudVault = async (e) => {
    if (e) e.preventDefault();
    if (!passcodeInput) return;
    setPasscodeError('');
    setIsVerifyingCode(true);

    try {
      const res = await fetch(getApiUrl('/api/verify-sync-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: passcodeInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        try {
          localStorage.setItem('cf_sync_unlocked', 'true');
          localStorage.setItem('cf_sync_passcode', passcodeInput);
        } catch {}
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
    try {
      localStorage.removeItem('cf_sync_unlocked');
      localStorage.removeItem('cf_sync_passcode');
    } catch {}
    setIsCloudUnlocked(false);
    setCloudPasscode('');
    setCloudSyncStatus(null);
  };

  const handlePushCloudBackup = async () => {
    setCloudSyncStatus({ type: 'info', message: 'Saving changes locally & syncing with Cloud Vault in background...' });
    try {
      const res = await pushCloudBackup(cloudPasscode);
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
      await pullCloudRestore(cloudPasscode);
      setCloudSyncStatus({ type: 'success', message: `Successfully restored data from Cloud Vault! Database & UI state refreshed.` });
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Cloud restore failed: ${err.message}` });
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [isAddBillModalOpen, setIsAddBillModalOpen] = useState(false);
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'checking', saveExtraMonthly: 0, enableExtraSavings: true, color: 'blue', notes: '' });
  const [newPersonForm, setNewPersonForm] = useState({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
  const [newBillForm, setNewBillForm] = useState({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', notes: '' });

  // Account creation spreadsheet import state
  const [accImportPayload, setAccImportPayload] = useState(null);
  const [accImportStatus, setAccImportStatus] = useState(null);
  const [accImportError, setAccImportError] = useState('');
  const [isAccImporting, setIsAccImporting] = useState(false);
  const accFileInputRef = useRef(null);

  const handleAccFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAccImportError('');
    setIsAccImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const detected = detectFileType(file.name);
      if (detected === 'emory_parc') {
        const res = parseSpreadsheet(arrayBuffer, file.name, budget.bills || []);
        if (!res.success) throw new Error(res.error || 'Failed to parse workbook.');
        const matchingAcc = res.budget?.accounts?.[0];
        const txns = res.budget?.transactions || [];
        setAccImportPayload({
          records: txns,
          importedLedgerRows: matchingAcc?.importedLedgerRows || {},
        });
        setNewAccForm(prev => ({
          ...prev,
          name: prev.name || matchingAcc?.name || file.name.replace(/\.[^/.]+$/, ''),
        }));
        setAccImportStatus({
          fileName: file.name,
          count: txns.length,
        });
      } else {
        const { headers, rows } = parseGenericFlat(arrayBuffer);
        if (headers.length === 0) throw new Error('No valid columns found.');
        const { mapping } = autoMatchColumns(headers, 'transactions');
        const { records, importedLedgerRows, earliestDate } = applyTransactionMapping(rows, mapping);
        setAccImportPayload({
          records,
          importedLedgerRows,
        });
        setNewAccForm(prev => ({
          ...prev,
          name: prev.name || file.name.replace(/\.[^/.]+$/, ''),
        }));
        setAccImportStatus({
          fileName: file.name,
          count: records.length,
        });
      }
    } catch (err) {
      setAccImportError(err.message || 'Failed to parse file.');
    } finally {
      setIsAccImporting(false);
      e.target.value = '';
    }
  };

  const addAccountModalRef = useRef(null);
  const addPersonModalRef = useRef(null);
  const addBillModalRef = useRef(null);

  const trapFocus = (e, modalElement) => {
    if (!modalElement) return;
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const focusable = Array.from(focusableElements).filter(
      el => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first || !modalElement.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !modalElement.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isAddAccountModalOpen) {
        if (e.key === 'Escape') setIsAddAccountModalOpen(false);
        else trapFocus(e, addAccountModalRef.current);
        return;
      }
      if (isAddPersonModalOpen) {
        if (e.key === 'Escape') setIsAddPersonModalOpen(false);
        else trapFocus(e, addPersonModalRef.current);
        return;
      }
      if (isAddBillModalOpen) {
        if (e.key === 'Escape') setIsAddBillModalOpen(false);
        else trapFocus(e, addBillModalRef.current);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddAccountModalOpen, isAddPersonModalOpen, isAddBillModalOpen]);

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAccForm.name) return;
    addAccount(newAccForm);
    setNewAccForm({ name: '', type: 'checking', saveExtraMonthly: 0, enableExtraSavings: true, color: 'blue', notes: '' });
    setIsAddAccountModalOpen(false);
  };

  const handleAddPerson = (e) => {
    e.preventDefault();
    if (!newPersonForm.name) return;
    addPerson(newPersonForm);
    setNewPersonForm({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
    setIsAddPersonModalOpen(false);
  };

  const handleAddBill = (e) => {
    e.preventDefault();
    if (!newBillForm.name) return;
    addBill(newBillForm);
    setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', notes: '' });
    setIsAddBillModalOpen(false);
  };


  // Keep newBillForm accountId synced if current account list changes
  useEffect(() => {
    if (!newBillForm.accountId && budget.accounts.length > 0) {
      setNewBillForm(prev => ({ ...prev, accountId: budget.accounts[0].id }));
    }
  }, [budget.accounts, newBillForm.accountId]);

  const [billFilterTab, setBillFilterTab] = useState('active'); // 'active' | 'archived'
  const [setupSubTab, setSetupSubTab] = useState('accounts'); // 'accounts' | 'bills'
  const [billsSubView, setBillsSubView] = useState('list'); // 'list' | 'splits'
  const [jsonStatus, setJsonStatus] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);

  const { user, updateProfile } = useAuth();
  const [profileForm, setProfileForm] = useState(() => ({
    name: user?.name || '',
    email: user?.email || '',
    securityQuestion: user?.securityQuestion || PRESET_SECURITY_QUESTIONS[0],
    securityAnswer: '',
    currentPassword: '',
    newPassword: ''
  }));
  const [profileStatus, setProfileStatus] = useState(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileStatus(null);
    setIsUpdatingProfile(true);
    try {
      const res = await updateProfile(profileForm);
      setProfileStatus({ type: 'success', message: res.message || 'Profile and security settings updated successfully!' });
      setProfileForm(prev => ({ ...prev, securityAnswer: '', currentPassword: '', newPassword: '' }));
    } catch (err) {
      setProfileStatus({ type: 'error', message: err.message || 'Failed to update profile.' });
    } finally {
      setIsUpdatingProfile(false);
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

  const SETUP_TABS = ['accounts', 'people', 'splits', 'bills'];
  const activeSection = SETUP_TABS.includes(settingsTab) ? 'setup' : settingsTab;

  const knownAccountIds = new Set(budget.accounts.map(a => a.id));
  const hasOrphanedBills = budget.bills.some(b => !knownAccountIds.has(b.accountId));
  const displayAccounts = hasOrphanedBills 
    ? [...budget.accounts, { id: 'unassigned', name: 'Unassigned / Orphaned Bills', type: 'system' }]
    : budget.accounts;

  const sidebarNav = [
    { id: 'setup',     label: 'Setup',     icon: Users,          desc: 'Accounts, Earners & Bills', badge: budget.accounts.length + budget.people.length + budget.bills.filter(b => !b.isArchived).length },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Widgets & Theme',          badge: null },
    { id: 'import',    label: 'Import',    icon: Upload,         desc: 'Excel, CSV & JSON Backup',  badge: null },
    { id: 'sync',      label: 'Sync',      icon: Cloud,          desc: 'Cloud Vault & Auto-Sync',  badge: null },
    { id: 'security',  label: 'Security',  icon: ShieldCheck,    desc: 'Profile & Password',        badge: null },
  ];

  const setupSubNavItems = [
    { id: 'accounts', label: 'Accounts & Earners', icon: Users,    count: budget.accounts.length + budget.people.length },
    { id: 'bills',    label: 'Bills & Splits',     icon: Receipt,  count: budget.bills.filter(b => !b.isArchived).length },
  ];

  const handleSidebarNav = (sectionId) => {
    if (sectionId === 'setup') {
      setSettingsTab(SETUP_TABS.includes(settingsTab) ? settingsTab : setupSubTab);
    } else {
      setSettingsTab(sectionId);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-slate-100">
      
      {/* Dedicated View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-slate-950 shadow-lg shadow-amber-500/20">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
              Settings &amp; Setup
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage accounts, earners, recurring bills, transaction splits, dashboard widgets, and data security.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            onClick={() => setActiveView('dashboard')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 cursor-pointer shadow-md"
          >
            <ArrowLeft className="w-4 h-4 text-blue-400" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>

      {/* Main View Layout: Horizontal Nav + Content Panel */}
      <div className="flex flex-col gap-6 min-h-[650px]">

        {/* Top Section Navigation (Horizontal Bar) */}
        <aside className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-1.5 sm:p-2 flex flex-col gap-1.5 shadow-xl">
          <div className="flex items-center justify-between px-2 pt-1 pb-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              Configuration Sections
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse block" />
            </p>
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <span>Auto-saves to local storage</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500/70" />
            </div>
          </div>
          
          <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1 scrollbar-hide px-1">
            {sidebarNav.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => handleSidebarNav(section.id)}
                  className={`flex-1 min-w-[140px] flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all cursor-pointer text-left group ${
                    isActive
                      ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30 shadow-sm shadow-blue-500/10 font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <span className={`p-2 rounded-xl flex-shrink-0 transition-all ${
                    isActive ? 'bg-blue-600/25 text-blue-400 border border-blue-500/20' : 'bg-slate-950/60 border border-slate-800/80 text-slate-400 group-hover:text-slate-200'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs truncate ${isActive ? 'text-blue-100' : 'text-slate-200 font-medium'}`}>
                      {section.label}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate leading-tight mt-0.5">{section.desc}</div>
                  </div>
                  {section.badge !== null && section.badge > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold flex-shrink-0 ${
                      isActive ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}>
                      {section.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Setup Sub-Items (Accounts vs Bills) */}
          {activeSection === 'setup' && (
            <div className="flex items-center gap-2 pt-1.5 px-2 pb-0.5 border-t border-slate-800/60 overflow-x-auto">
              {setupSubNavItems.map(sub => {
                const SubIcon = sub.icon;
                const isSubActive = settingsTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => { setSettingsTab(sub.id); setSetupSubTab(sub.id); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                      isSubActive
                        ? 'bg-blue-600/20 text-blue-200 font-bold border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <SubIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isSubActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="whitespace-nowrap">{sub.label}</span>
                    {sub.count !== null && (
                      <span className={`ml-1.5 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${isSubActive ? 'text-blue-300 bg-blue-950/60' : 'text-slate-500'}`}>
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
        <div className="flex-1 min-w-0 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl">

          {/* TAB 0: DASHBOARD WIDGETS MANAGER */}
          {settingsTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in">
              {/* Color Theme Preference Selector */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-400" />}
                    App Color Theme
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Choose your preferred application background appearance and visual style.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`p-3.5 rounded-xl border transition-all text-left flex items-center justify-between ${
                      theme !== 'light'
                        ? 'bg-slate-950 text-slate-100 border-blue-500 shadow-md ring-1 ring-blue-500'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-700 flex items-center justify-center">
                        <Moon className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">Dark Theme</span>
                        <span className="text-[10px] text-slate-400">Black/slate background</span>
                      </div>
                    </div>
                    {theme !== 'light' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`p-3.5 rounded-xl border transition-all text-left flex items-center justify-between ${
                      theme === 'light'
                        ? 'bg-white text-slate-900 border-blue-500 shadow-md ring-1 ring-blue-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center">
                        <Sun className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block text-slate-900">Light Theme</span>
                        <span className="text-[10px] text-slate-500">White background</span>
                      </div>
                    </div>
                    {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-blue-400" />
                    Dashboard Widget Visibility &amp; Placement Order
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Toggle which data widgets appear on your Financial Dashboard and arrange their display placement order.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetDashboardWidgets}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Defaults
                </button>
              </div>

              <div className="space-y-3">
                {dashboardWidgets.map((widget, idx) => (
                  <div
                    key={widget.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      widget.visible
                        ? 'bg-slate-900/90 border-slate-700/80 shadow-md'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => reorderDashboardWidgets(idx, idx - 1)}
                          className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-colors text-[10px]"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === dashboardWidgets.length - 1}
                          onClick={() => reorderDashboardWidgets(idx, idx + 1)}
                          className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-colors text-[10px]"
                          title="Move Down"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{widget.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                            {widget.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{widget.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-semibold mr-1">Size:</span>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'third')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                            (widget.width || 'third') === 'third' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          1/3 Small
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'half')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                            widget.width === 'half' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          1/2 Medium
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'full')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                            widget.width === 'full' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Full
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleDashboardWidgetVisibility(widget.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          widget.visible
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {widget.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                        {widget.visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETUP: ACCOUNTS & EARNERS */}
          {(settingsTab === 'accounts' || settingsTab === 'people') && (
            <div className="space-y-10 animate-fade-in">
              {/* Accounts Header & Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-100 tracking-tight">
                      Active Household Accounts ({budget.accounts.length})
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 pl-10">
                    Set up starting balances, initial dates, and extra savings goals for checking, savings, and credit cards.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(true)}
                  className="self-start sm:self-center flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Account</span>
                </button>
              </div>

              {/* Accounts Soft Cards List */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {budget.accounts.map(acc => (
                  <div 
                    key={acc.id} 
                    className="p-5 sm:p-6 rounded-2xl bg-slate-900/40 hover:bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 shadow-lg shadow-black/20 backdrop-blur-xl transition-all duration-300 space-y-5"
                  >
                    {/* Header: Icon, Editable Title & Delete */}
                    <div className="flex items-center justify-between gap-3 pb-1 border-b border-slate-800/40">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={acc.name}
                          onChange={e => updateAccount(acc.id, { name: e.target.value })}
                          className="w-full bg-transparent font-bold text-slate-100 text-sm sm:text-base focus:bg-slate-950/80 focus:outline-none focus:ring-1 focus:ring-blue-500/40 rounded-lg px-2 py-1 transition-all truncate"
                          placeholder="Account Name"
                        />
                      </div>
                      <button
                        onClick={() => deleteAccount(acc.id)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all shrink-0 cursor-pointer"
                        title="Delete Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Account Controls Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Account Type</label>
                        <select
                          value={acc.type}
                          onChange={e => updateAccount(acc.id, { type: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 transition-all cursor-pointer [color-scheme:dark]"
                        >
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                          <option value="credit">Credit Card</option>
                        </select>
                      </div>
                    </div>

                    {/* Extra Savings Toggle Switch */}
                    <div className="pt-2 flex items-center gap-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={acc.enableExtraSavings !== false}
                        onClick={() => updateAccount(acc.id, { enableExtraSavings: acc.enableExtraSavings === false })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${acc.enableExtraSavings !== false ? 'bg-blue-600' : 'bg-slate-700'}`}
                        id={`chk-extra-${acc.id}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${acc.enableExtraSavings !== false ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                      </button>
                      <label htmlFor={`chk-extra-${acc.id}`} className="text-xs text-slate-300 font-medium cursor-pointer select-none">
                        Track Extra Savings Bucket
                      </label>
                    </div>

                    {/* Extra Savings Sub-Card */}
                    {acc.enableExtraSavings !== false && (
                      <div className="p-4 bg-slate-950/60 border border-slate-800/60 rounded-xl space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-[11px] font-semibold text-indigo-300 block mb-1.5">Save Extra Target ($/mo)</label>
                            <input
                              type="number"
                              step="10"
                              value={acc.saveExtraMonthly || 0}
                              onChange={e => updateAccount(acc.id, { saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-emerald-400 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Extra Current Balance ($)</label>
                            <p className="text-xs text-slate-500 italic">Derived from transaction history</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Earners Section Header & Action Bar */}
              <div className="pt-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-100 tracking-tight">
                        Household Members &amp; Earners ({budget.people.length})
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 pl-10">
                      Configure earners, pay frequencies, and net/gross income schedules.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPersonModalOpen(true)}
                    className="self-start sm:self-center flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Member</span>
                  </button>
                </div>

                {/* Earners Soft Cards List */}
                <div className="space-y-4">
                  {budget.people.map(person => (
                    <div 
                      key={person.id} 
                      className="p-5 sm:p-6 rounded-2xl bg-slate-900/40 hover:bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 shadow-lg shadow-black/20 backdrop-blur-xl transition-all duration-300 space-y-5"
                    >
                      <div className="flex items-center justify-between gap-3 pb-1 border-b border-slate-800/40">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={person.name}
                            onChange={e => updatePerson(person.id, { name: e.target.value })}
                            className="w-full bg-transparent font-bold text-slate-100 text-sm sm:text-base focus:bg-slate-950/80 focus:outline-none focus:ring-1 focus:ring-purple-500/40 rounded-lg px-2 py-1 transition-all truncate"
                            placeholder="Member Name"
                          />
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0">
                            {person.payFrequency}
                          </span>
                        </div>
                        <button
                          onClick={() => deletePerson(person.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all shrink-0 cursor-pointer"
                          title="Delete Member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Pay Frequency</label>
                          <select
                            value={person.payFrequency}
                            onChange={e => updatePerson(person.id, { payFrequency: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/80 transition-all cursor-pointer [color-scheme:dark]"
                          >
                            <option value="bi-weekly">Bi-weekly (26/yr)</option>
                            <option value="semi-monthly">Semi-Monthly (24/yr)</option>
                            <option value="monthly">Monthly (12/yr)</option>
                            <option value="weekly">Weekly (52/yr)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Gross Per Pay ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={person.grossPerPay}
                            onChange={e => updatePerson(person.id, { grossPerPay: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/80 transition-all"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Net Per Pay ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={person.netPerPay}
                            onChange={e => updatePerson(person.id, { netPerPay: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-2 text-emerald-400 font-bold font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/80 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETUP: BILLS & SPLITS */}
          {(settingsTab === 'bills' || settingsTab === 'splits') && (
            <div className="space-y-6">
              {/* Bills Header & Info Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    Unified Bills & Earner Splits Manager
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Manage recurring bills, due dates, assigned accounts, and responsible earner splits in one place.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddBillModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Bill
                </button>
              </div>

              {/* Unified Bills Manager Table Grouped by Account */}
              <div className="space-y-6">
                {displayAccounts.map(account => {
                  const accountBills = budget.bills.filter(b => 
                    (account.id === 'unassigned' ? !knownAccountIds.has(b.accountId) : b.accountId === account.id) && 
                    (billFilterTab === 'archived' ? b.isArchived : !b.isArchived)
                  );
                  const accountTotal = accountBills.reduce((sum, b) => {
                    const amt = b.amount || 0;
                    return sum + (b.period === 'Annual' ? amt / 12 : b.period === 'Semi-Annual' ? amt / 6 : amt);
                  }, 0);

                  return (
                    <div key={account.id} className="rounded-xl border border-slate-800 glass-card overflow-hidden">
                      <div className="bg-slate-900/95 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                          <h4 className="text-xs font-bold text-slate-200">{account.name}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">{account.type}</span>
                          <span className="text-[10px] text-slate-500">({accountBills.length} bill{accountBills.length !== 1 ? 's' : ''})</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          Account Subtotal: <span className="font-bold text-rose-400 font-mono">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
                        </span>
                      </div>

                      <div className="overflow-x-auto matrix-scrollbar">
                        <table className="w-full text-left text-[11px] text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
                            <tr>
                              <th className="px-2 py-2 w-[22%]">Bill Name</th>
                              <th className="px-2 py-2 w-[11%]">Amount ($)</th>
                              <th className="px-2 py-2 w-[12%]">Frequency</th>
                              <th className="px-2 py-2 w-[10%]">Due Day</th>
                              <th className="px-2 py-2 w-[18%]">Assigned Account</th>
                              <th className="px-2 py-2 w-[22%]">Responsible / Split</th>
                              <th className="px-2 py-2 w-[5%] text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                            {accountBills.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-4 text-center text-slate-500 italic text-xs">
                                  No bills assigned to this account
                                </td>
                              </tr>
                            ) : (
                              accountBills.map(bill => (
                                <tr key={bill.id} className="hover:bg-slate-900/60 transition-colors">
                                  <td className="px-2 py-1.5 font-semibold text-slate-200">
                                    <input
                                      type="text"
                                      value={bill.name}
                                      onChange={e => updateBill(bill.id, { name: e.target.value })}
                                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none w-full truncate text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 font-mono">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={bill.amount}
                                      onChange={e => updateBill(bill.id, { amount: parseFloat(e.target.value) || 0 })}
                                      className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select
                                      value={bill.period || 'Monthly'}
                                      onChange={e => updateBill(bill.id, { period: e.target.value })}
                                      className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200 text-[11px] truncate focus:border-emerald-500 focus:outline-none"
                                    >
                                      <option value="Monthly">Monthly</option>
                                      <option value="Quarterly">Quarterly</option>
                                      <option value="Semi-Annual">Semi-Annual</option>
                                      <option value="Annual">Annual</option>
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400 text-[10px]">Day</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={bill.dueDay || 1}
                                        onChange={e => updateBill(bill.id, { dueDay: parseInt(e.target.value, 10) || 1 })}
                                        className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200 text-center font-mono text-[11px] focus:border-emerald-500 focus:outline-none"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select
                                      value={bill.accountId}
                                      onChange={e => updateBill(bill.id, { accountId: e.target.value })}
                                      className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200 text-[11px] truncate focus:border-emerald-500 focus:outline-none"
                                    >
                                      {budget.accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {budget.people.map(p => {
                                          const val = bill.splits?.[p.id] ?? (100 / (budget.people.length || 1));
                                          return (
                                            <div key={p.id} className="inline-flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">
                                              <span className="text-slate-400 font-medium truncate max-w-[45px]">{p.name.split(' ')[0]}:</span>
                                              <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={val}
                                                onChange={e => {
                                                  const num = parseFloat(e.target.value) || 0;
                                                  const newSplits = { ...bill.splits, [p.id]: num };
                                                  updateBillSplits(bill.id, newSplits);
                                                }}
                                                className="w-9 bg-transparent text-center font-mono font-bold text-slate-200 focus:outline-none focus:bg-slate-800 rounded"
                                              />
                                              <span className="text-slate-500">%</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {budget.people.length > 1 && (
                                        <div className="flex items-center gap-1 text-[9px]">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const splits = {};
                                              const count = budget.people.length || 1;
                                              budget.people.forEach(p => splits[p.id] = 100 / count);
                                              updateBillSplits(bill.id, splits);
                                            }}
                                            className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                                          >
                                            Equal
                                          </button>
                                          {budget.people.map(p => (
                                            <button
                                              key={p.id}
                                              type="button"
                                              onClick={() => {
                                                const splits = {};
                                                budget.people.forEach(person => splits[person.id] = person.id === p.id ? 100 : 0);
                                                updateBillSplits(bill.id, splits);
                                              }}
                                              className="px-1.5 py-0.5 bg-blue-900/40 hover:bg-blue-800/70 text-blue-300 rounded cursor-pointer truncate max-w-[65px]"
                                            >
                                              100% {p.name.split(' ')[0]}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => deleteBill(bill.id)}
                                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                      title="Delete Bill"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: IMPORT DATA & SPREADSHEETS */}
          {activeSection === 'import' && (
            <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/50 shadow-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">Spreadsheet Data Import</h3>
                      <p className="text-xs text-slate-400">Import financial data from Excel (.xlsx) and CSV files</p>
                    </div>
                  </div>
                </div>
              </div>

              <SpreadsheetImporter />
            </div>
          )}

          {/* TAB: CLOUD VAULT & AUTOMATIC SYNC */}
          {activeSection === 'sync' && (
            <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-blue-950/40 border border-purple-800/50 shadow-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                      <Cloud className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">Cloud Vault &amp; JSON Backup Sync</h3>
                      <p className="text-xs text-slate-400">Passcode-protected Cloudflare D1 Sync and offline JSON Backup / Restore</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* JSON Backup & Restore Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl glass-card border border-blue-800/60 bg-blue-950/10 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">Export Backup (.json)</h4>
                    <p className="text-xs text-slate-400 mt-1">Download a JSON backup of your current budget data.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportDataClick}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON Backup</span>
                  </button>
                </div>

                <div className="p-5 rounded-2xl glass-card border border-emerald-800/60 bg-emerald-950/10 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">Restore Backup (.json)</h4>
                    <p className="text-xs text-slate-400 mt-1">Restore budget data from a saved JSON snapshot.</p>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleLoadBackupFile} accept=".json" className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Load JSON File</span>
                  </button>
                </div>
              </div>

              {/* Cloudflare D1 Vault Sync Section */}
              <div className="p-5 rounded-2xl glass-card border border-purple-800/60 bg-purple-950/10 space-y-4">
                <div className={`flex items-center justify-between flex-wrap gap-2 transition-opacity ${!isCloudUnlocked ? 'opacity-50' : 'opacity-100'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
                      <Cloud className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">Cloudflare D1 Vault Sync</h4>
                      <p className="text-xs text-slate-400">Passcode-gated encrypted backup on Cloudflare D1</p>
                    </div>
                  </div>
                  {isCloudUnlocked ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                        Vault Unlocked
                      </span>
                      <button
                        type="button"
                        onClick={handleLockCloudVault}
                        className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer font-medium"
                      >
                        Lock Vault
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                      Locked
                    </span>
                  )}
                </div>

                {!isCloudUnlocked ? (
                  <form onSubmit={handleUnlockCloudVault} className="space-y-3 pt-1">
                    <p className="text-xs text-slate-300 opacity-50">
                      Enter Access Passcode to Enable Cloud Sync across device sessions.
                    </p>
                    <div className="flex items-center gap-2 opacity-100">
                      <div className="relative flex-1">
                        <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                        <input
                          type="password"
                          placeholder="Enter Access Passcode..."
                          value={passcodeInput}
                          onChange={e => setPasscodeInput(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isVerifyingCode || !passcodeInput}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        {isVerifyingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        <span>Unlock Vault</span>
                      </button>
                    </div>
                    {passcodeError && (
                      <p className="text-xs text-rose-400 font-semibold opacity-100">{passcodeError}</p>
                    )}
                  </form>
                ) : (
                  <div className="space-y-4 pt-1">
                    {/* Auto Backup Toggle Switch */}
                    <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-200">Automatic Cloud Backup</div>
                        <div className="text-[11px] text-slate-400">
                          {isAutoCloudBackupEnabled
                            ? (lastCloudSyncTime ? `Auto-sync active • Last backed up at ${lastCloudSyncTime}` : 'Auto-sync active • Syncs 3s after local changes')
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
                          : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                      }`}>
                        <span>{cloudSyncStatus.message}</span>
                        <button onClick={() => setCloudSyncStatus(null)} className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer ml-2 font-bold">Dismiss</button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={handlePushCloudBackup}
                        disabled={isCloudSyncing}
                        className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isCloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                        <span>Backup to Cloud</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePullCloudRestore}
                        disabled={isCloudSyncing}
                        className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isCloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                        <span>Restore from Cloud</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Data Section */}
              <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-rose-400 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Clear Local Database
                  </h4>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to purge all local budget data? This action cannot be undone unless you have a JSON backup.')) {
                        await clearAllData();
                        setBackupStatus({ type: 'success', message: 'All local IndexedDB budget data has been cleared.' });
                      }
                    }}
                    className="px-3.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Purge Local Data
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Purges all accounts, earners, bills, and ledger transactions from your local IndexedDB storage.
                </p>
              </div>
            </div>
          )}

          {/* TAB: SECURITY & PROFILE */}
          {settingsTab === 'security' && (
            <div className="space-y-6 max-w-xl mx-auto animate-fade-in">
              <div className="flex items-center space-x-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Account Security &amp; Profile</h3>
                  <p className="text-xs text-slate-400">Update profile credentials, security question, and password</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 glass-card border border-slate-800 rounded-2xl p-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={profileForm.email}
                      onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isUpdatingProfile ? 'Saving...' : 'Save Profile'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}


              {/* Pop-up Modal: Add New Account */}
              {isAddAccountModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
                  <div
                    ref={addAccountModalRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-account-modal-title"
                    className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 id="add-account-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400">
                          <Plus className="w-4 h-4" />
                        </div>
                        Add New Account
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsAddAccountModalOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newAccForm.name) return;
                      const newAccId = `acc-${Date.now()}`;
                      const impRows = accImportPayload?.importedLedgerRows || {};
                      const hasImpRows = Object.keys(impRows).length > 0;

                      addAccount({
                        ...newAccForm,
                        id: newAccId,
                        importedLedgerRows: impRows,
                        ledgerMode: hasImpRows ? 'import' : 'manual'
                      });

                      if (accImportPayload?.records && accImportPayload.records.length > 0) {
                        importSpreadsheetSelective({
                          namespaces: { transactions: true },
                          strategies: { transactions: 'merge' },
                          data: {
                            targetAccountId: newAccId,
                            transactions: accImportPayload.records,
                            importedLedgerRows: impRows,
                          }
                        });
                      }

                      setNewAccForm({ name: '', type: 'checking', saveExtraMonthly: 0, enableExtraSavings: true, color: 'blue', notes: '' });
                      setAccImportPayload(null);
                      setAccImportStatus(null);
                      setAccImportError('');
                      setIsAddAccountModalOpen(false);
                    }} className="space-y-4">
                      {/* Initial Spreadsheet / CSV Upload Dropzone */}
                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Initial Spreadsheet / Bank CSV (Optional)</span>
                          </label>
                          {accImportStatus && (
                            <button
                              type="button"
                              onClick={() => {
                                setAccImportPayload(null);
                                setAccImportStatus(null);
                                setAccImportError('');
                              }}
                              className="text-[10px] text-slate-400 hover:text-rose-400 font-semibold cursor-pointer"
                            >
                              Remove file
                            </button>
                          )}
                        </div>

                        <input
                          ref={accFileInputRef}
                          type="file"
                          accept=".csv,.xlsx"
                          onChange={handleAccFileUpload}
                          className="hidden"
                        />

                        {accImportStatus ? (
                          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-white block truncate">{accImportStatus.fileName}</span>
                              <span className="text-[11px] text-emerald-400/90">
                                {accImportStatus.count} transactions parsed &bull; auto-bound to this new account
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => accFileInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900/50 hover:bg-slate-900 cursor-pointer transition-all text-xs text-slate-400 hover:text-slate-200"
                          >
                            {isAccImporting ? (
                              <div className="flex items-center gap-2 text-indigo-300">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Analyzing spreadsheet...</span>
                              </div>
                            ) : (
                              <>
                                <Upload className="w-4 h-4 text-indigo-400" />
                                <span>Click to upload <strong className="text-slate-300">.csv</strong> or <strong className="text-slate-300">.xlsx</strong> to auto-fill</span>
                              </>
                            )}
                          </div>
                        )}

                        {accImportError && (
                          <p className="text-[11px] text-rose-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{accImportError}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Account Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. USAA Bills Checking - 7071"
                          value={newAccForm.name}
                          onChange={e => setNewAccForm({ ...newAccForm, name: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Account Type</label>
                          <select
                            value={newAccForm.type}
                            onChange={e => setNewAccForm({ ...newAccForm, type: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500"
                          >
                            <option value="checking">Checking Account</option>
                            <option value="savings">Savings Account</option>
                            <option value="credit">Credit Card Account</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="chk-new-extra"
                            checked={newAccForm.enableExtraSavings !== false}
                            onChange={e => setNewAccForm({ ...newAccForm, enableExtraSavings: e.target.checked })}
                            className="rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-0 cursor-pointer"
                          />
                          <label htmlFor="chk-new-extra" className="text-xs font-medium text-slate-300 cursor-pointer">
                            Track Extra Savings Bucket
                          </label>
                        </div>

                        {newAccForm.enableExtraSavings !== false && (
                          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                            <div>
                              <label className="block text-xs font-medium text-indigo-300 mb-1">Save Extra Target ($/mo)</label>
                              <input
                                type="number"
                                step="10"
                                placeholder="0"
                                value={newAccForm.saveExtraMonthly || 0}
                                onChange={e => setNewAccForm({ ...newAccForm, saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">Extra Current Balance ($)</label>
                              <p className="text-xs text-slate-500 italic">Derived from transaction history</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setAccImportPayload(null);
                            setAccImportStatus(null);
                            setAccImportError('');
                            setIsAddAccountModalOpen(false);
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                        >
                          Create Account
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {/* Pop-up Modal: Add New Person */}
              {isAddPersonModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
                  <div
                    ref={addPersonModalRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-person-modal-title"
                    className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 id="add-person-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center text-purple-400">
                          <Plus className="w-4 h-4" />
                        </div>
                        Add Household Member
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsAddPersonModalOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newPersonForm.name) return;
                      addPerson(newPersonForm);
                      setNewPersonForm({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
                      setIsAddPersonModalOpen(false);
                    }} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Member Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Jon Kemp"
                          value={newPersonForm.name}
                          onChange={e => setNewPersonForm({ ...newPersonForm, name: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Pay Schedule</label>
                          <select
                            value={newPersonForm.payFrequency}
                            onChange={e => setNewPersonForm({ ...newPersonForm, payFrequency: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                          >
                            <option value="bi-weekly">Bi-weekly (26/yr)</option>
                            <option value="semi-monthly">Semi-Monthly (24/yr)</option>
                            <option value="monthly">Monthly (12/yr)</option>
                            <option value="weekly">Weekly (52/yr)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Role / Title</label>
                          <input
                            type="text"
                            placeholder="e.g. Primary Earner"
                            value={newPersonForm.role || ''}
                            onChange={e => setNewPersonForm({ ...newPersonForm, role: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>

                      {/* Pay Dates Customization & Presets */}
                      {(() => {
                        const isMulti = newPersonForm.payFrequency === 'bi-weekly' || newPersonForm.payFrequency === 'semi-monthly';
                        return (
                          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs font-semibold text-purple-300">Payment Dates / Schedule</label>
                              {isMulti && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setNewPersonForm({ ...newPersonForm, payDay1: '1st', payDay2: '15th' })}
                                    className="px-2 py-0.5 text-[10px] rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                                  >
                                    1st & 15th
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setNewPersonForm({ ...newPersonForm, payDay1: '15th', payDay2: 'End of Month' })}
                                    className="px-2 py-0.5 text-[10px] rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                                  >
                                    15th & End
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setNewPersonForm({ ...newPersonForm, payDay1: 'Every 2 Wks', payDay2: 'Fridays' })}
                                    className="px-2 py-0.5 text-[10px] rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                                  >
                                    Bi-Weekly
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className={`grid gap-3 ${isMulti ? 'grid-cols-3' : 'grid-cols-2'}`}>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">
                                  {isMulti ? 'Pay Date 1 (e.g. 1st / 1)' : 'Pay Date (e.g. 1st / 15th)'}
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. 1st or 1"
                                  value={newPersonForm.payDay1 || ''}
                                  onChange={e => setNewPersonForm({ ...newPersonForm, payDay1: e.target.value })}
                                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
                                />
                              </div>
                              {isMulti && (
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">Pay Date 2 (e.g. 15th / 15)</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. 15th or 15"
                                    value={newPersonForm.payDay2 || ''}
                                    onChange={e => setNewPersonForm({ ...newPersonForm, payDay2: e.target.value })}
                                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
                                  />
                                </div>
                              )}
                              <div>
                                <label className="block text-[10px] text-amber-300 font-semibold mb-1">Early Pay Deposit Offset</label>
                                <select
                                  value={newPersonForm.payOffsetDays ?? 0}
                                  onChange={e => setNewPersonForm({ ...newPersonForm, payOffsetDays: parseInt(e.target.value) || 0 })}
                                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-amber-500/40 rounded-lg text-amber-200 focus:outline-none focus:border-purple-500 font-mono"
                                >
                                  <option value={0}>Exact Payday (0 Days)</option>
                                  <option value={-1}>1 Day Early (-1 Day)</option>
                                  <option value={-2}>2 Days Early (-2 Days e.g. USAA)</option>
                                  <option value={-3}>3 Days Early (-3 Days)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Per-Account Direct Deposit Allocations (if multiple accounts exist) */}
                      {budget.accounts.length > 1 && (
                        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-semibold text-purple-300">Direct Deposit Allocations (Per Paycheck)</label>
                            {(() => {
                              const allocs = newPersonForm.accountAllocations || {};
                              const totalAllocated = Object.values(allocs).reduce((/** @type {number} */ sum, /** @type {any} */ val) => sum + (val === 'remaining' ? 0 : (parseFloat(val) || 0)), 0);
                              const hasRemaining = Object.values(allocs).includes('remaining');
                              const netPay = parseFloat(newPersonForm.netPerPay) || 0;
                              const remVal = Math.max(0, netPay - totalAllocated);
                              const isBalanced = (hasRemaining && totalAllocated <= netPay) || (Math.abs(totalAllocated - netPay) < 0.01 && netPay > 0);
                              return (
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                  isBalanced
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}>
                                  Allocated: ${totalAllocated.toLocaleString('en-US', { minimumFractionDigits: 2 })} {hasRemaining ? `+ Remaining ($${remVal.toLocaleString('en-US', { minimumFractionDigits: 2 })})` : `/ $${netPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {budget.accounts.map(acc => {
                              const rawVal = newPersonForm.accountAllocations?.[acc.id];
                              const isRemaining = rawVal === 'remaining';
                              const val = isRemaining ? '' : (rawVal ?? '');
                              return (
                                <div key={acc.id} className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
                                  isRemaining ? 'bg-emerald-950/40 border border-emerald-800/60' : 'bg-slate-900/80 border border-slate-800'
                                }`}>
                                  <span className="text-slate-300 font-medium truncate max-w-[110px]">{acc.name}</span>
                                  <div className="flex items-center gap-1.5">
                                    {!isRemaining ? (
                                      <>
                                        <span className="text-slate-500 font-mono">$</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          placeholder="0.00"
                                          value={val}
                                          onChange={e => {
                                            const amount = parseFloat(e.target.value) || 0;
                                            setNewPersonForm({
                                              ...newPersonForm,
                                              accountAllocations: { ...(newPersonForm.accountAllocations || {}), [acc.id]: amount }
                                            });
                                          }}
                                          className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-right text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                                        />
                                      </>
                                    ) : (
                                      <span className="text-[10px] font-mono font-semibold text-emerald-400 px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 rounded">
                                        Remaining
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentAlloc = { ...(newPersonForm.accountAllocations || {}) };
                                        if (isRemaining) {
                                          delete currentAlloc[acc.id];
                                        } else {
                                          Object.keys(currentAlloc).forEach(k => {
                                            if (currentAlloc[k] === 'remaining') delete currentAlloc[k];
                                          });
                                          currentAlloc[acc.id] = 'remaining';
                                        }
                                        setNewPersonForm({
                                          ...newPersonForm,
                                          accountAllocations: currentAlloc
                                        });
                                      }}
                                      className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                                        isRemaining
                                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                          : 'bg-slate-800 text-slate-300 hover:bg-purple-950 hover:text-purple-300 border border-slate-700'
                                      }`}
                                      title="Toggle Remaining (allocates all unallocated paycheck income to this account)"
                                    >
                                      {isRemaining ? 'Remaining ✓' : 'Set Remaining'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Gross Per Paycheck ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="3000.00"
                            value={newPersonForm.grossPerPay || 0}
                            onChange={e => setNewPersonForm({ ...newPersonForm, grossPerPay: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Net Per Paycheck ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="2200.00"
                            value={newPersonForm.netPerPay || 0}
                            onChange={e => setNewPersonForm({ ...newPersonForm, netPerPay: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsAddPersonModalOpen(false)}
                          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                        >
                          Add Member
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {/* Pop-up Modal: Add New Bill */}
              {isAddBillModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
                  <div
                    ref={addBillModalRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="add-bill-modal-title"
                    className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 id="add-bill-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center text-emerald-400">
                          <Plus className="w-4 h-4" />
                        </div>
                        Add New Bill & Assign to Account
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsAddBillModalOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newBillForm.name) return;
                      addBill(newBillForm);
                      setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, paymentSource: 'Auto Pay', notes: '' });
                      setIsAddBillModalOpen(false);
                    }} className="space-y-4 pb-12">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Bill Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Comcast Cable / Electric Utility"
                          value={newBillForm.name}
                          onChange={e => setNewBillForm({ ...newBillForm, name: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Amount ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="100.00"
                            value={newBillForm.amount}
                            onChange={e => setNewBillForm({ ...newBillForm, amount: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Billing Period</label>
                          <select
                            value={newBillForm.period}
                            onChange={e => {
                              const p = e.target.value;
                              let defaultM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                              if (p === 'Annual') defaultM = [1];
                              else if (p === 'Semi-Annual') defaultM = [1, 7];
                              else if (p === 'Quarterly') defaultM = [1, 4, 7, 10];
                              setNewBillForm({ ...newBillForm, period: p, dueMonths: defaultM });
                            }}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Semi-Annual">Semi-Annual</option>
                            <option value="Annual">Annual</option>
                          </select>
                        </div>
                      </div>

                      {newBillForm.period !== 'Monthly' && (
                        <div className="pt-2 border-t border-slate-800">
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            Due Month(s) <span className="text-emerald-400 font-normal">({newBillForm.period})</span>
                          </label>
                          <div className="grid grid-cols-6 gap-1.5">
                            {MONTH_SHORT_NAMES.map((mName, idx) => {
                              const mNum = idx + 1;
                              const isSelected = (newBillForm.dueMonths || []).includes(mNum);
                              return (
                                <button
                                  key={mNum}
                                  type="button"
                                  onClick={() => {
                                    const current = newBillForm.dueMonths || [];
                                    let updated;
                                    if (current.includes(mNum)) {
                                      if (current.length === 1) return;
                                      updated = current.filter(m => m !== mNum);
                                    } else {
                                      updated = [...current, mNum].sort((a, b) => a - b);
                                    }
                                    setNewBillForm({ ...newBillForm, dueMonths: updated });
                                  }}
                                  className={`px-2 py-1 rounded text-xs font-semibold text-center transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                                  }`}
                                >
                                  {mName}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Account</label>
                          <select
                            value={newBillForm.accountId}
                            onChange={e => setNewBillForm({ ...newBillForm, accountId: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                          >
                            {budget.accounts.map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Due Date & Months</label>
                          <NoYearCalendarPicker
                            dueDay={newBillForm.dueDay}
                            dueMonths={newBillForm.dueMonths}
                            period={newBillForm.period}
                            onChange={({ dueDay, dueMonths }) => setNewBillForm({ ...newBillForm, dueDay, dueMonths })}
                            className="w-full justify-between px-3 py-2 bg-slate-950 rounded-xl"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Payment Notes / Method</label>
                        <input
                          type="text"
                          placeholder="e.g. Auto Pay / Credit Card"
                          value={newBillForm.paymentSource || ''}
                          onChange={e => setNewBillForm({ ...newBillForm, paymentSource: e.target.value, paymentNotes: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsAddBillModalOpen(false)}
                          className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          Add Bill
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

        </div>
      </div>
    </div>
  );
}
