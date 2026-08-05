// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { useBudget } from '../context/BudgetContext';
import { 
  X, 
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
  FileCode,
  Upload,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  Eye,
  EyeOff,
  GripVertical,
  Sun,
  Moon,
  ShieldCheck,
  Cloud,
  CloudUpload,
  CloudDownload,
  Lock,
  KeyRound,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../utils/spreadsheetParser';
import { MONTH_SHORT_NAMES, getBillDueMonths, formatBillDueMonths, getAccountSaveExtraPersonPortion } from '../utils/paydayUtils';
import { NoYearCalendarPicker } from './NoYearCalendarPicker';
import { useAuth } from '../context/AuthContext';
import { PRESET_SECURITY_QUESTIONS } from './AuthModal';
import { getApiUrl } from '../utils/api';
import { SpreadsheetImporter } from './SpreadsheetImporter';

export function SettingsModal() {
  const { 
    budget, 
    theme,
    setTheme,
    dashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    reorderDashboardWidgets,
    resetDashboardWidgets,
    isSettingsOpen, 
    setIsSettingsOpen,
    settingsTab,
    setSettingsTab,
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
    isAutoCloudBackupEnabled,
    toggleAutoCloudBackup,
    lastCloudSyncTime
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
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'checking', startingBalance: 0, balanceAsOfDate: new Date().toISOString().split('T')[0], saveExtraMonthly: 0, extraStartingBalance: 0, enableExtraSavings: true, color: 'blue', notes: '' });
  const [newPersonForm, setNewPersonForm] = useState({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
  const [newBillForm, setNewBillForm] = useState({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', notes: '' });

  const settingsModalRef = useRef(null);
  const addAccountModalRef = useRef(null);
  const addPersonModalRef = useRef(null);
  const addBillModalRef = useRef(null);

  // Focus trap helper for modal keydown events
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

  // Keyboard navigation & Focus trapping across main modal & sub-modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isAddAccountModalOpen) {
        if (e.key === 'Escape') {
          setIsAddAccountModalOpen(false);
          return;
        }
        trapFocus(e, addAccountModalRef.current);
        return;
      }

      if (isAddPersonModalOpen) {
        if (e.key === 'Escape') {
          setIsAddPersonModalOpen(false);
          return;
        }
        trapFocus(e, addPersonModalRef.current);
        return;
      }

      if (isAddBillModalOpen) {
        if (e.key === 'Escape') {
          setIsAddBillModalOpen(false);
          return;
        }
        trapFocus(e, addBillModalRef.current);
        return;
      }

      if (isSettingsOpen) {
        if (e.key === 'Escape') {
          setIsSettingsOpen(false);
          return;
        }
        trapFocus(e, settingsModalRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, isAddAccountModalOpen, isAddPersonModalOpen, isAddBillModalOpen, setIsSettingsOpen]);

  // Keep newBillForm accountId synced if current account list changes
  useEffect(() => {
    if (!newBillForm.accountId && budget.accounts.length > 0) {
      setNewBillForm(prev => ({ ...prev, accountId: budget.accounts[0].id }));
    }
  }, [budget.accounts, newBillForm.accountId]);
  const [billFilterTab, setBillFilterTab] = useState('active'); // 'active' | 'archived'
  const [setupSubTab, setSetupSubTab] = useState('accounts'); // 'accounts' | 'bills'
  const [billsSubView, setBillsSubView] = useState('list'); // 'list' | 'splits'
  const [jsonInput, setJsonInput] = useState('');
  const [jsonStatus, setJsonStatus] = useState(null);
  const [spreadsheetPreview, setSpreadsheetPreview] = useState(null);
  const [spreadsheetMode, setSpreadsheetMode] = useState('replace'); // 'replace' | 'merge'
  const [spreadsheetFileName, setSpreadsheetFileName] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);

  const handleFileUpload = () => {}; // replaced by SpreadsheetImporter
  const handleApplySpreadsheet = () => {}; // replaced by SpreadsheetImporter

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Accounts Sheet
      const accsData = budget.accounts.map(a => ({
        ID: a.id,
        Name: a.name,
        Type: a.type,
        StartingBalance: a.startingBalance,
        Notes: a.notes
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accsData), 'Accounts');

      // 2. People Sheet
      const peopleData = budget.people.map(p => ({
        ID: p.id,
        Name: p.name,
        Role: p.role,
        PayFrequency: p.payFrequency,
        GrossPerPay: p.grossPerPay,
        NetPerPay: p.netPerPay
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peopleData), 'People');

      // 3. Bills Sheet
      const billsData = budget.bills.map(b => ({
        ID: b.id,
        Name: b.name,
        Amount: b.amount,
        Period: b.period,
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

  const handleExportJson = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(budget, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `Personal_Budget_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setJsonStatus({ type: 'success', message: 'Downloaded JSON backup successfully!' });
    } catch (err) {
      setJsonStatus({ type: 'error', message: `JSON export failed: ${err.message}` });
    }
  };

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

  if (!isSettingsOpen) return null;

  const SETUP_TABS = ['accounts', 'people', 'splits', 'bills'];
  const activeSection =
    SETUP_TABS.includes(settingsTab) ? 'setup' :
    settingsTab;

  const knownAccountIds = new Set(budget.accounts.map(a => a.id));
  const hasOrphanedBills = budget.bills.some(b => !knownAccountIds.has(b.accountId));
  const displayAccounts = hasOrphanedBills 
    ? [...budget.accounts, { id: 'unassigned', name: 'Unassigned / Orphaned Bills', type: 'system' }]
    : budget.accounts;

  const sidebarNav = [
    { id: 'setup',     label: 'Setup',     icon: Users,          desc: 'Accounts, Earners & Bills', badge: budget.accounts.length + budget.people.length + budget.bills.filter(b => !b.isArchived).length },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Widgets & Theme',          badge: null },
    { id: 'data',      label: 'Data',      icon: Archive,        desc: 'Backup, Restore & Security',badge: null },
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

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAccForm.name) return;
    addAccount(newAccForm);
    setNewAccForm({ name: '', type: 'checking', startingBalance: 0, color: 'blue', notes: '' });
  };

  const handleAddPerson = (e) => {
    e.preventDefault();
    if (!newPersonForm.name) return;
    addPerson(newPersonForm);
    setNewPersonForm({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last' });
  };

  const handleAddBill = (e) => {
    e.preventDefault();
    if (!newBillForm.name) return;
    addBill(newBillForm);
    setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', notes: '' });
  };

  const handleImportJson = () => {
    const res = importBudgetJson(jsonInput);
    if (res.success) {
      setJsonStatus({ type: 'success', message: 'Budget settings updated successfully!' });
      setJsonInput('');
    } else {
      setJsonStatus({ type: 'error', message: res.error });
    }
  };

  return (
    <div
      ref={settingsModalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-fade-in w-screen h-screen overflow-hidden text-slate-100"
    >
      <div className="bg-slate-900 w-full h-full flex flex-col overflow-hidden">

        {/* Slim Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
              <Receipt className="w-4 h-4" />
            </span>
            <span id="settings-modal-title" className="font-bold text-sm text-slate-100">Settings &amp; Setup</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close settings modal"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close Settings (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: Left Sidebar + Scrollable Content */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left Sidebar Navigation */}
          <aside className="flex-shrink-0 w-14 sm:w-52 bg-slate-950/70 border-r border-slate-800 flex flex-col py-3 overflow-y-auto">
            <div className="px-2 space-y-0.5">
              {sidebarNav.map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <div key={section.id}>
                    <button
                      onClick={() => handleSidebarNav(section.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl transition-all cursor-pointer text-left ${
                        isActive
                          ? 'bg-blue-600/15 text-blue-300 border border-blue-600/25'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <span className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
                        isActive ? 'bg-blue-600/25 text-blue-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="hidden sm:block min-w-0 flex-1">
                        <div className={`text-xs font-bold truncate ${
                          isActive ? 'text-blue-200' : 'text-slate-200'
                        }`}>{section.label}</div>
                        <div className="text-[10px] text-slate-500 truncate leading-tight">{section.desc}</div>
                      </div>
                      {section.badge !== null && section.badge > 0 && (
                        <span className={`hidden sm:inline ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold flex-shrink-0 ${
                          isActive ? 'bg-blue-600/30 text-blue-200' : 'bg-slate-800 text-slate-400'
                        }`}>{section.badge}</span>
                      )}
                    </button>

                    {/* Setup sub-items - shown inline in sidebar on sm+ */}
                    {section.id === 'setup' && isActive && (
                      <div className="hidden sm:block ml-4 mt-0.5 mb-1 space-y-0.5">
                        {setupSubNavItems.map(sub => {
                          const SubIcon = sub.icon;
                          const isSubActive = settingsTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => { setSettingsTab(sub.id); setSetupSubTab(sub.id); }}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-left ${
                                isSubActive
                                  ? 'bg-slate-800 text-slate-100'
                                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                              }`}
                            >
                              <SubIcon className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{sub.label}</span>
                              {sub.count !== null && (
                                <span className={`ml-auto text-[10px] font-mono ${
                                  isSubActive ? 'text-slate-400' : 'text-slate-600'
                                }`}>{sub.count}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex-1" />
            <div className="hidden sm:flex items-center justify-center px-3 py-2 text-[10px] text-slate-700">
              Esc to close
            </div>
          </aside>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-auto p-4 sm:p-5 bg-slate-950/20">

            {/* Mobile sub-nav for Setup section (icon-only sidebar on xs screens) */}
            {activeSection === 'setup' && (
              <div className="flex sm:hidden items-center gap-1 mb-4 p-1 bg-slate-900 rounded-xl border border-slate-800">
                {setupSubNavItems.map(sub => {
                  const SubIcon = sub.icon;
                  const isSubActive = settingsTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => { setSettingsTab(sub.id); setSetupSubTab(sub.id); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSubActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <SubIcon className="w-3.5 h-3.5" />
                      <span>{sub.label}</span>
                      {sub.count !== null && (
                        <span className={`text-[10px] font-mono ${
                          isSubActive ? 'opacity-80' : 'text-slate-500'
                        }`}>({sub.count})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

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
                        ? 'bg-slate-950 text-slate-100 border-blue-500 shadow-md shadow-blue-950/40 ring-1 ring-blue-500'
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
                      {/* Reorder Buttons */}
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => reorderDashboardWidgets(idx, idx - 1)}
                          className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors text-[10px]"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === dashboardWidgets.length - 1}
                          onClick={() => reorderDashboardWidgets(idx, idx + 1)}
                          className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors text-[10px]"
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

                    {/* Width Selector & Visibility Toggle */}
                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-semibold mr-1">Size:</span>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'third')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                            (widget.width || 'third') === 'third'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                          title="Small (1/3 width side card)"
                        >
                          1/3 Small
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'half')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                            widget.width === 'half'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                          title="Medium (1/2 width card)"
                        >
                          1/2 Medium
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'full')}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                            widget.width === 'full'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                          title="Full Width"
                        >
                          Full
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleDashboardWidgetVisibility(widget.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          widget.visible
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm'
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
            <div className="space-y-8">
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
                    Set up starting balances, initial dates, and extra savings goals.
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
                      addAccount(newAccForm);
                      setNewAccForm({ name: '', type: 'checking', startingBalance: 0, balanceAsOfDate: new Date().toISOString().split('T')[0], saveExtraMonthly: 0, extraStartingBalance: 0, enableExtraSavings: true, color: 'blue', notes: '' });
                      setIsAddAccountModalOpen(false);
                    }} className="space-y-4">
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
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">Starting Balance ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={newAccForm.startingBalance}
                            onChange={e => setNewAccForm({ ...newAccForm, startingBalance: parseFloat(e.target.value) || 0 })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-amber-300 mb-1">Start Date / Day</label>
                          <input
                            type="date"
                            value={newAccForm.balanceAsOfDate || new Date().toISOString().split('T')[0]}
                            onChange={e => setNewAccForm({ ...newAccForm, balanceAsOfDate: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-amber-200 font-mono focus:outline-none focus:border-blue-500"
                          />
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
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={newAccForm.extraStartingBalance || 0}
                                onChange={e => setNewAccForm({ ...newAccForm, extraStartingBalance: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsAddAccountModalOpen(false)}
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
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Starting Balance ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={acc.startingBalance}
                          onChange={e => updateAccount(acc.id, { startingBalance: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-2.5 py-2 text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-amber-400/90 block mb-1.5">Start Date / Day</label>
                        <input
                          type="date"
                          value={acc.balanceAsOfDate || new Date().toISOString().split('T')[0]}
                          onChange={e => updateAccount(acc.id, { balanceAsOfDate: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-2.5 py-2 text-amber-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 transition-all [color-scheme:dark]"
                        />
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
                        id={`chk-extra-modal-${acc.id}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${acc.enableExtraSavings !== false ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                      </button>
                      <label htmlFor={`chk-extra-modal-${acc.id}`} className="text-xs text-slate-300 font-medium cursor-pointer select-none">
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
                            <input
                              type="number"
                              step="0.01"
                              value={acc.extraStartingBalance || 0}
                              onChange={e => updateAccount(acc.id, { extraStartingBalance: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETUP: EARNERS (stacked below Accounts in Accounts & Earners view) */}
          {(settingsTab === 'accounts' || settingsTab === 'people') && (
            <div className="space-y-6 pt-6">
              {/* Earners Header & Action Bar */}
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

              {/* People List */}
              <div className="space-y-4">
                {budget.people.map(person => {
                  const isMulti = person.payFrequency === 'bi-weekly' || person.payFrequency === 'semi-monthly';
                  const totalAllocated = Object.values(person.accountAllocations || {}).reduce((/** @type {number} */ sum, /** @type {any} */ val) => sum + (parseFloat(val) || 0), 0);

                  return (
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
                          {person.payOffsetDays ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-mono shrink-0">
                              {person.payOffsetDays}d Early
                            </span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => deletePerson(person.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all shrink-0 cursor-pointer"
                          title="Delete Member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3">
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

                        {/* Pay Dates Bar with Presets & Custom Fields & Early Deposit Offset */}
                        <div className="p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-purple-300">Payment Dates & Deposit Schedule:</span>
                            {isMulti && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => updatePerson(person.id, { payDay1: '1st', payDay2: '15th' })}
                                  className="px-2 py-0.5 text-[10px] rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                                >
                                  1st & 15th
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updatePerson(person.id, { payDay1: '15th', payDay2: 'End of Month' })}
                                  className="px-2 py-0.5 text-[10px] rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                                >
                                  15th & End
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updatePerson(person.id, { payDay1: 'Every 2 Wks', payDay2: 'Fridays' })}
                                  className="px-2 py-0.5 text-[10px] rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 transition-colors"
                                >
                                  Bi-Weekly
                                </button>
                              </div>
                            )}
                          </div>
                          <div className={`grid gap-3 text-xs ${isMulti ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                            <div>
                              <label className="text-slate-400 text-[10px]">
                                {isMulti ? 'Pay Date 1 (e.g. 1st / 1)' : 'Pay Date (e.g. 1st / 15th)'}
                              </label>
                              <input
                                type="text"
                                value={person.payDay1 || ''}
                                onChange={e => updatePerson(person.id, { payDay1: e.target.value })}
                                className="mt-0.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono w-full focus:outline-none focus:border-purple-500"
                                placeholder="e.g. 1st or 1"
                              />
                            </div>
                            {isMulti && (
                              <div>
                                <label className="text-slate-400 text-[10px]">Pay Date 2 (e.g. 15th / 15)</label>
                                <input
                                  type="text"
                                  value={person.payDay2 || ''}
                                  onChange={e => updatePerson(person.id, { payDay2: e.target.value })}
                                  className="mt-0.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono w-full focus:outline-none focus:border-purple-500"
                                  placeholder="e.g. 15th or 15"
                                />
                              </div>
                            )}
                            <div>
                              <label className="text-amber-300 text-[10px] font-semibold">Early Direct Deposit Offset</label>
                              <select
                                value={person.payOffsetDays ?? 0}
                                onChange={e => updatePerson(person.id, { payOffsetDays: parseInt(e.target.value) || 0 })}
                                className="mt-0.5 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-amber-200 font-mono w-full focus:outline-none focus:border-purple-500"
                              >
                                <option value={0}>Exact Payday (0 Days)</option>
                                <option value={-1}>1 Day Early (-1 Day)</option>
                                <option value={-2}>2 Days Early (-2 Days e.g. USAA)</option>
                                <option value={-3}>3 Days Early (-3 Days)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Per-Account Direct Deposit Allocations (if multiple accounts exist) */}
                        {budget.accounts.length > 1 && (
                          <div className="p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-purple-300">Direct Deposit Account Allocations (Per Paycheck):</span>
                              {(() => {
                                const allocs = person.accountAllocations || {};
                                const totalAlloc = Object.values(allocs).reduce((sum, val) => sum + (val === 'remaining' ? 0 : (parseFloat(val) || 0)), 0);
                                const hasRem = Object.values(allocs).includes('remaining');
                                const netPay = parseFloat(person.netPerPay) || 0;
                                const remVal = Math.max(0, netPay - totalAlloc);
                                const isBalanced = (hasRem && totalAlloc <= netPay) || (Math.abs(totalAlloc - netPay) < 0.01 && netPay > 0);
                                return (
                                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                    isBalanced
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}>
                                    Allocated: ${totalAlloc.toLocaleString('en-US', { minimumFractionDigits: 2 })} {hasRem ? `+ Remaining ($${remVal.toLocaleString('en-US', { minimumFractionDigits: 2 })})` : `/ $${netPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              {budget.accounts.map(acc => {
                                const rawVal = person.accountAllocations?.[acc.id];
                                const isRemaining = rawVal === 'remaining';
                                const allocatedVal = isRemaining ? '' : (rawVal ?? '');
                                return (
                                  <div key={acc.id} className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
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
                                            value={allocatedVal}
                                            onChange={e => {
                                              const val = parseFloat(e.target.value) || 0;
                                              const newAlloc = { ...(person.accountAllocations || {}), [acc.id]: val };
                                              updatePerson(person.id, { accountAllocations: newAlloc });
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
                                          const newAlloc = { ...(person.accountAllocations || {}) };
                                          if (isRemaining) {
                                            delete newAlloc[acc.id];
                                          } else {
                                            Object.keys(newAlloc).forEach(k => {
                                              if (newAlloc[k] === 'remaining') delete newAlloc[k];
                                            });
                                            newAlloc[acc.id] = 'remaining';
                                          }
                                          updatePerson(person.id, { accountAllocations: newAlloc });
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SETUP: BILLS & SPLITS */}
          {(settingsTab === 'bills' || settingsTab === 'splits') && (
            <div className="space-y-4">
              {/* Sub-view toggle: Bill List | Split Matrix */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setBillsSubView('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      billsSubView === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Bill List
                  </button>
                  <button
                    onClick={() => setBillsSubView('splits')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      billsSubView === 'splits' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5" />
                    Split %
                  </button>
                </div>
              </div>

              {/* BILL LIST VIEW */}
              {billsSubView === 'list' && (
              <>
              {/* Active / Archived Bills Filter Bar & Add Bill Button */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBillFilterTab('active')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      billFilterTab === 'active'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Active Bills ({budget.bills.filter(b => !b.isArchived).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillFilterTab('archived')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      billFilterTab === 'archived'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Archived Bills ({budget.bills.filter(b => b.isArchived).length})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddBillModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Bill
                </button>
              </div>

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

              {/* Bills List Grouped by Assigned Account */}
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
                      {/* Account Sticky Header Bar */}
                      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                          <h4 className="text-xs font-bold text-slate-200">{account.name}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">{account.type}</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          Subtotal: <span className="font-bold text-rose-400 font-mono">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
                        </span>
                      </div>

                      {/* Account Bills Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="p-3">Bill Name</th>
                              <th className="p-3">Amount</th>
                              <th className="p-3">Period</th>
                              <th className="p-3">Assigned Account</th>
                              <th className="p-3">Due Day & Month(s)</th>
                              <th className="p-3">Payment Notes</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                            {accountBills.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-3 text-center text-slate-500 italic">
                                  No {billFilterTab === 'archived' ? 'archived' : 'active'} bills assigned to this account
                                </td>
                              </tr>
                            ) : (
                              accountBills.map(bill => (
                                <tr key={bill.id} className="hover:bg-slate-900/60 transition-colors">
                                  <td className="p-3 font-semibold text-slate-200">
                                    <input
                                      type="text"
                                      value={bill.name}
                                      onChange={e => updateBill(bill.id, { name: e.target.value })}
                                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none"
                                    />
                                  </td>
                                  <td className="p-3">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={bill.amount}
                                      onChange={e => updateBill(bill.id, { amount: parseFloat(e.target.value) || 0 })}
                                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                                    />
                                  </td>
                                  <td className="p-3">
                                    <select
                                      value={bill.period}
                                      onChange={e => {
                                        const p = e.target.value;
                                        let defaultM = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                                        if (p === 'Annual') defaultM = [(bill.dueMonths?.[0]) || 1];
                                        else if (p === 'Semi-Annual') defaultM = [1, 7];
                                        else if (p === 'Quarterly') defaultM = [1, 4, 7, 10];
                                        updateBill(bill.id, { period: p, dueMonths: defaultM });
                                      }}
                                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                                    >
                                      <option value="Monthly">Monthly</option>
                                      <option value="Quarterly">Quarterly</option>
                                      <option value="Semi-Annual">Semi-Annual</option>
                                      <option value="Annual">Annual</option>
                                    </select>
                                  </td>
                                  <td className="p-3">
                                    <select
                                      value={bill.accountId}
                                      onChange={e => updateBill(bill.id, { accountId: e.target.value })}
                                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                                    >
                                      {budget.accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-3">
                                    <NoYearCalendarPicker
                                      dueDay={bill.dueDay}
                                      dueMonths={bill.dueMonths}
                                      period={bill.period}
                                      onChange={({ dueDay, dueMonths }) => updateBill(bill.id, { dueDay, dueMonths })}
                                    />
                                  </td>
                                  <td className="p-3">
                                    <input
                                      type="text"
                                      value={bill.paymentNotes || bill.paymentSource || ''}
                                      onChange={e => updateBill(bill.id, { paymentNotes: e.target.value, paymentSource: e.target.value })}
                                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-32"
                                    />
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {bill.isArchived ? (
                                        <button
                                          type="button"
                                          onClick={() => unarchiveBill(bill.id)}
                                          className="p-1 text-emerald-400 hover:text-emerald-300 rounded transition-colors"
                                          title="Restore Bill to Active Schedule"
                                        >
                                          <RotateCcw className="w-4 h-4" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => archiveBill(bill.id)}
                                          className="p-1 text-amber-400 hover:text-amber-300 rounded transition-colors"
                                          title="Archive Bill (Hide from active schedule, preserve history)"
                                        >
                                          <Archive className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => deleteBill(bill.id)}
                                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                        title="Delete Bill Permanently"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
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
              </>
            )}



              {/* SPLIT MATRIX VIEW */}
              {billsSubView === 'splits' && (
              <div className="space-y-6">
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-center justify-between">
                <div>
                  <span className="font-semibold">Dynamic Household Bill Split Engine:</span> Define what percentage of each bill is split between members.
                </div>
              </div>

              {/* Bills Split Matrix Grouped by Assigned Account */}
              <div className="space-y-6">
                {displayAccounts.map(account => {
                  const accountBills = budget.bills.filter(b => 
                    account.id === 'unassigned' ? !knownAccountIds.has(b.accountId) : b.accountId === account.id
                  );
                  const accountTotal = accountBills.reduce((sum, b) => {
                    const amt = b.amount || 0;
                    return sum + (b.period === 'Annual' ? amt / 12 : b.period === 'Semi-Annual' ? amt / 6 : amt);
                  }, 0);

                  return (
                    <div key={account.id} className="rounded-xl border border-slate-800 glass-card overflow-hidden">
                      {/* Account Sticky Header Bar */}
                      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                          <h4 className="text-xs font-bold text-slate-200">{account.name}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">{account.type}</span>
                        </div>
                        <span className="text-xs text-slate-400">
                          Subtotal: <span className="font-bold text-rose-400 font-mono">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
                        </span>
                      </div>

                      {/* Account Splits Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300 min-w-[700px]">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="p-3">Bill Name</th>
                              <th className="p-3">Monthly Cost</th>
                              {budget.people.map(p => (
                                <th key={p.id} className="p-3 text-center">{p.name} Split (%)</th>
                              ))}
                              <th className="p-3 text-center">Status</th>
                              <th className="p-3 text-right">Quick Presets</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                            {accountBills.length === 0 ? (
                              <tr>
                                <td colSpan={4 + budget.people.length} className="p-3 text-center text-slate-500 italic">
                                  No bills assigned to this account
                                </td>
                              </tr>
                            ) : (
                              accountBills.map(bill => {
                                const totalPct = budget.people.reduce((sum, p) => sum + (parseFloat(bill.splits?.[p.id]) || 0), 0);
                                const isValid = Math.abs(totalPct - 100) < 0.1;

                                return (
                                  <tr key={bill.id} className="hover:bg-slate-900/60 transition-colors">
                                    <td className="p-3 font-semibold text-slate-200">{bill.name}</td>
                                    <td className="p-3 font-mono">${(bill.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    {budget.people.map(p => (
                                      <td key={p.id} className="p-3 text-center">
                                        <div className="inline-flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={bill.splits?.[p.id] ?? 0}
                                            onChange={e => {
                                              const val = parseFloat(e.target.value) || 0;
                                              const newSplits = { ...bill.splits, [p.id]: val };
                                              updateBillSplits(bill.id, newSplits);
                                            }}
                                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold text-center font-mono"
                                          />
                                          <span className="text-slate-500">%</span>
                                        </div>
                                      </td>
                                    ))}
                                    <td className="p-3 text-center">
                                      {isValid ? (
                                        <span className="inline-flex items-center text-emerald-400 gap-1 font-medium">
                                          <CheckCircle2 className="w-4 h-4" /> 100%
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center text-amber-400 gap-1 font-medium" title={`Total is ${totalPct.toLocaleString('en-US')}%`}>
                                          <AlertTriangle className="w-4 h-4" /> {totalPct.toLocaleString('en-US')}%
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 text-right">
                                      <div className="flex justify-end gap-1">
                                        <button
                                          onClick={() => {
                                            const splits = {};
                                            const count = budget.people.length || 1;
                                            budget.people.forEach(p => splits[p.id] = 100 / count);
                                            updateBillSplits(bill.id, splits);
                                          }}
                                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                                        >
                                          Equal
                                        </button>
                                        {budget.people[0] && (
                                          <button
                                            onClick={() => {
                                              const splits = {};
                                              budget.people.forEach(p => splits[p.id] = p.id === budget.people[0].id ? 100 : 0);
                                              updateBillSplits(bill.id, splits);
                                            }}
                                            className="px-2 py-1 bg-blue-900/60 hover:bg-blue-800/80 text-blue-300 rounded text-[10px]"
                                          >
                                            100% {budget.people[0].name.split(' ')[0]}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
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

            </div>
          )}

          {/* TAB 5: LOCAL-FIRST DATA MANAGEMENT */}
          {activeSection === 'data' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              
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

              {/* Status Feedback Banner */}
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

              {/* Backup &amp; Restore Action Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Export Data Card */}
                <div className="p-5 rounded-2xl glass-card border border-blue-800/60 bg-blue-950/10 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                        <Download className="w-5 h-5" />
                      </span>
                      <h4 className="text-sm font-bold text-slate-100">Export Data (Download Backup)</h4>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Pull current application state from IndexedDB and download a comprehensive JSON backup snapshot file to store on your local device.
                    </p>
                  </div>

                  <button
                    onClick={handleExportDataClick}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Data (.json)</span>
                  </button>
                </div>

                {/* Load Backup Card */}
                <div className="p-5 rounded-2xl glass-card border border-emerald-800/60 bg-emerald-950/10 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                        <Upload className="w-5 h-5" />
                      </span>
                      <h4 className="text-sm font-bold text-slate-100">Load Backup (Restore)</h4>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Upload a previously exported JSON backup file. This clears current IndexedDB state, loads the backup data, and refreshes the application UI immediately.
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
                        onClick={handlePushCloudBackup}
                        disabled={isCloudSyncing}
                        className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isCloudSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                        <span>Backup to Cloud</span>
                      </button>
                      <button
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
            <div className="space-y-6 max-w-xl mx-auto">
              <div className="flex items-center space-x-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Account Security & Profile</h3>
                  <p className="text-xs text-slate-400">Update your email, name, security question, and password</p>
                </div>
              </div>

              {user && !user.hasSecurityQuestion && (
                <div className="p-4 bg-amber-950/60 border border-amber-800/80 rounded-2xl text-amber-300 text-xs space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Security Question Required</span>
                  </div>
                  <p>Please set up a security question and answer below to enable account recovery in case you forget your password.</p>
                </div>
              )}

              {profileStatus && (
                <div className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 ${
                  profileStatus.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-red-950/80 border border-red-800 text-red-300'
                }`}>
                  {profileStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  <span>{profileStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4 glass-card border border-slate-800 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">Profile Information</h4>
                
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

                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 pt-2">Security Question & Answer</h4>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Security Question</label>
                  <select
                    value={profileForm.securityQuestion}
                    onChange={e => setProfileForm({ ...profileForm, securityQuestion: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    {PRESET_SECURITY_QUESTIONS.map((q, idx) => (
                      <option key={idx} value={q}>{q}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">New Security Answer (Leave blank to keep current)</label>
                  <input
                    type="text"
                    placeholder="Enter secret answer"
                    value={profileForm.securityAnswer}
                    onChange={e => setProfileForm({ ...profileForm, securityAnswer: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 pt-2">Change Password (Optional)</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Current Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={profileForm.currentPassword}
                      onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">New Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={profileForm.newPassword}
                      onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* DATA: DANGER ZONE */}
          {activeSection === 'data' && (
            <div className="space-y-4 mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">Danger Zone</h3>
              </div>
              
              {/* Option A: Clear All Data (Clean Slate) */}
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
                        onClick={() => setConfirmClearAll(false)}
                        className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClearAll(true)}
                      className="px-5 py-2.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clear All Data</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Option B: Load 100% Fake Demo Dataset */}
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
                        onClick={() => setConfirmLoadDemo(false)}
                        className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmLoadDemo(true)}
                      className="px-5 py-2.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Load Fake Demo Data</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Option C: Reset to Starter Empty Preset */}
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
                        onClick={() => setConfirmResetDefaults(false)}
                        className="px-3 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
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
          )}

          </div>{/* end content area */}
        </div>{/* end sidebar + content body */}

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <div className="text-xs text-slate-400">
            Changes auto-save instantly to local storage.
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors"
          >
            Done & Apply
          </button>
        </div>

      </div>
    </div>
  );
}
