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
  ArrowLeft
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
    setCloudSyncStatus(null);
    setIsCloudSyncing(true);
    try {
      await pushCloudBackup(cloudPasscode);
      setCloudSyncStatus({ type: 'success', message: `Successfully backed up data to Cloud Vault! (${new Date().toLocaleTimeString()})` });
    } catch (err) {
      setCloudSyncStatus({ type: 'error', message: `Cloud backup failed: ${err.message}` });
    } finally {
      setIsCloudSyncing(false);
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

      {/* Main View Layout: Left Nav Column + Scrollable Content */}
      <div className="flex flex-col lg:flex-row gap-6 min-h-[600px]">

        {/* Left Section Navigation */}
        <aside className="w-full lg:w-64 flex-shrink-0 bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 flex flex-col justify-between space-y-1 shadow-lg">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">
              Configuration Sections
            </p>
            {sidebarNav.map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <div key={section.id} className="space-y-0.5">
                  <button
                    onClick={() => handleSidebarNav(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer text-left ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-300 border border-blue-600/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <span className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
                      isActive ? 'bg-blue-600/25 text-blue-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-bold truncate ${isActive ? 'text-blue-200' : 'text-slate-200'}`}>
                        {section.label}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate leading-tight">{section.desc}</div>
                    </div>
                    {section.badge !== null && section.badge > 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex-shrink-0 ${
                        isActive ? 'bg-blue-600/30 text-blue-200' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {section.badge}
                      </span>
                    )}
                  </button>

                  {/* Setup Sub-Items (Accounts vs Bills) */}
                  {section.id === 'setup' && isActive && (
                    <div className="ml-4 pl-2 border-l border-slate-800 mt-1 mb-1 space-y-1">
                      {setupSubNavItems.map(sub => {
                        const SubIcon = sub.icon;
                        const isSubActive = settingsTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => { setSettingsTab(sub.id); setSetupSubTab(sub.id); }}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer text-left ${
                              isSubActive
                                ? 'bg-slate-800 text-slate-100 font-bold border border-slate-700'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                            }`}
                          >
                            <SubIcon className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
                            <span className="truncate">{sub.label}</span>
                            {sub.count !== null && (
                              <span className={`ml-auto text-[10px] font-mono ${isSubActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                {sub.count}
                              </span>
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

          <div className="pt-4 border-t border-slate-800/80 px-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Auto-saves to local storage</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
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
            <div className="space-y-6">
              {/* Accounts Header & Add Button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    Active Household Accounts ({budget.accounts.length})
                  </h3>
                  <p className="text-xs text-slate-400">Configure checking, savings, and credit card accounts</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Account
                </button>
              </div>

              {/* Accounts List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {budget.accounts.map(acc => (
                  <div key={acc.id} className="p-4 rounded-xl glass-card border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-blue-400" />
                        <input
                          type="text"
                          value={acc.name}
                          onChange={e => updateAccount(acc.id, { name: e.target.value })}
                          className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 font-semibold text-slate-100 text-sm focus:outline-none px-1"
                        />
                      </div>
                      <button
                        onClick={() => deleteAccount(acc.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        title="Delete Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="text-slate-400 block font-medium">Account Type</label>
                        <select
                          value={acc.type}
                          onChange={e => updateAccount(acc.id, { type: e.target.value })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 w-full focus:outline-none focus:border-blue-500"
                        >
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                          <option value="credit">Credit Card</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block font-medium">Starting Balance ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={acc.startingBalance}
                          onChange={e => updateAccount(acc.id, { startingBalance: parseFloat(e.target.value) || 0 })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-mono w-full focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-amber-300 font-semibold block">Start Date / Day</label>
                        <input
                          type="date"
                          value={acc.balanceAsOfDate || new Date().toISOString().split('T')[0]}
                          onChange={e => updateAccount(acc.id, { balanceAsOfDate: e.target.value })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-amber-200 font-mono w-full focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                      <input
                        type="checkbox"
                        id={`chk-extra-${acc.id}`}
                        checked={acc.enableExtraSavings !== false}
                        onChange={e => updateAccount(acc.id, { enableExtraSavings: e.target.checked })}
                        className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0 cursor-pointer"
                      />
                      <label htmlFor={`chk-extra-${acc.id}`} className="text-xs text-slate-400 cursor-pointer">
                        Track Extra Savings Bucket
                      </label>
                    </div>

                    {acc.enableExtraSavings !== false && (
                      <div className="space-y-3 p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <label className="text-indigo-300 font-medium block">Save Extra Target ($/mo)</label>
                            <input
                              type="number"
                              step="10"
                              value={acc.saveExtraMonthly || 0}
                              onChange={e => updateAccount(acc.id, { saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                              className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-emerald-400 font-mono font-bold w-full focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-slate-400 block font-medium">Extra Current Balance ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={acc.extraStartingBalance || 0}
                              onChange={e => updateAccount(acc.id, { extraStartingBalance: parseFloat(e.target.value) || 0 })}
                              className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono w-full focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Earners Section */}
              <div className="space-y-6 mt-8 pt-6 border-t border-slate-700">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-400" />
                      Household Members &amp; Earners ({budget.people.length})
                    </h3>
                    <p className="text-xs text-slate-400">Configure household members, pay frequencies, and income</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPersonModalOpen(true)}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Member
                  </button>
                </div>

                <div className="space-y-4">
                  {budget.people.map(person => (
                    <div key={person.id} className="p-4 rounded-xl glass-card border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-purple-400" />
                          <input
                            type="text"
                            value={person.name}
                            onChange={e => updatePerson(person.id, { name: e.target.value })}
                            className="bg-transparent border-b border-transparent hover:border-slate-600 focus:border-purple-500 font-semibold text-slate-100 text-sm focus:outline-none px-1"
                          />
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                            {person.payFrequency}
                          </span>
                        </div>
                        <button
                          onClick={() => deletePerson(person.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-slate-400 font-medium">Pay Frequency</label>
                          <select
                            value={person.payFrequency}
                            onChange={e => updatePerson(person.id, { payFrequency: e.target.value })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 w-full focus:outline-none focus:border-purple-500"
                          >
                            <option value="bi-weekly">Bi-weekly (26/yr)</option>
                            <option value="semi-monthly">Semi-Monthly (24/yr)</option>
                            <option value="monthly">Monthly (12/yr)</option>
                            <option value="weekly">Weekly (52/yr)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 font-medium">Gross Per Pay ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={person.grossPerPay}
                            onChange={e => updatePerson(person.id, { grossPerPay: parseFloat(e.target.value) || 0 })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono w-full focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 font-medium">Net Per Pay ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={person.netPerPay}
                            onChange={e => updatePerson(person.id, { netPerPay: parseFloat(e.target.value) || 0 })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-emerald-400 font-bold font-mono w-full focus:outline-none focus:border-purple-500"
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
              {/* Bills Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBillsSubView('list')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      billsSubView === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Bill List
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillsSubView('splits')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      billsSubView === 'splits' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5" />
                    Split % Matrix
                  </button>
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

              {/* Bills List Sub-View */}
              {billsSubView === 'list' && (
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
                          </div>
                          <span className="text-xs text-slate-400">
                            Subtotal: <span className="font-bold text-rose-400 font-mono">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[10px] border-b border-slate-800">
                              <tr>
                                <th className="p-3">Bill Name</th>
                                <th className="p-3">Amount</th>
                                <th className="p-3">Period</th>
                                <th className="p-3">Assigned Account</th>
                                <th className="p-3">Due Day</th>
                                <th className="p-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                              {accountBills.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="p-3 text-center text-slate-500 italic">
                                    No bills assigned to this account
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
                                    <td className="p-3 font-mono">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={bill.amount}
                                        onChange={e => updateBill(bill.id, { amount: parseFloat(e.target.value) || 0 })}
                                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono"
                                      />
                                    </td>
                                    <td className="p-3">
                                      <select
                                        value={bill.period}
                                        onChange={e => updateBill(bill.id, { period: e.target.value })}
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
                                    <td className="p-3 font-mono">
                                      Day {bill.dueDay}
                                    </td>
                                    <td className="p-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => deleteBill(bill.id)}
                                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                      >
                                        <Trash2 className="w-4 h-4" />
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
              )}
            </div>
          )}

          {/* TAB 5: LOCAL-FIRST DATA MANAGEMENT */}
          {activeSection === 'data' && (
            <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
              <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/50 shadow-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">Local-First Data Storage</h3>
                      <p className="text-xs text-slate-400">IndexedDB Database engine operating isolated within your browser</p>
                    </div>
                  </div>
                </div>
              </div>

              <SpreadsheetImporter />

              {/* Backup & Restore Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl glass-card border border-blue-800/60 bg-blue-950/10 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">Export Backup (.json)</h4>
                    <p className="text-xs text-slate-400 mt-1">Download a JSON backup of your current budget data.</p>
                  </div>
                  <button
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
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Load JSON File</span>
                  </button>
                </div>
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

        </div>
      </div>
    </div>
  );
}
