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
  X,
  Bug,
  Terminal,
  Copy,
  Check,
  Search,
  Filter,
  Code,
  Sparkles,
  ChevronRight,
  ChevronDown
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
import { DebugPayloadInspector } from './DebugPayloadInspector';

export function SettingsView({ onNavigateView }) {
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
    loadDemoPreset,
    syncPasscode: cloudPasscode,
    setSyncPasscode: setCloudPasscode,
    isSyncUnlocked: isCloudUnlocked,
    setIsSyncUnlocked: setIsCloudUnlocked,
    isDebugMode,
    setDebugMode,
    debugLogs,
    clearDebugLogs,
    addDebugLog
  } = useBudget();

  // Debugging tab filter and interaction state
  const [debugFilterLevel, setDebugFilterLevel] = useState('all');
  const [debugSearchQuery, setDebugSearchQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [copiedLogId, setCopiedLogId] = useState(null);
  const [copiedAllLogs, setCopiedAllLogs] = useState(false);

  const toggleExpandLog = (id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyLog = (log) => {
    const text = JSON.stringify(log, null, 2);
    navigator.clipboard?.writeText(text);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleCopyAllLogs = () => {
    const text = JSON.stringify(debugLogs, null, 2);
    navigator.clipboard?.writeText(text);
    setCopiedAllLogs(true);
    setTimeout(() => setCopiedAllLogs(false), 2000);
  };

  const handleExportLogsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(debugLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `finance-debug-logs-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleGenerateTestLogs = () => {
    addDebugLog('SYSTEM', 'Diagnostic test log triggered manually', { triggeredAt: new Date().toISOString() }, 'info');
    addDebugLog('IMPORT', 'Sample Import Phase: Ingested file "Checking_Aug_2026.csv"', {
      fileName: 'Checking_Aug_2026.csv',
      sizeBytes: 12450,
      headers: ['Post Date', 'Vendor Description', 'Debit', 'Credit', 'Bal']
    }, 'info');
    addDebugLog('MATCH', 'Auto-matched 4 columns with 1 missing required field', {
      confidence: 0.75,
      missingRequired: ['account_id'],
      matchDetails: [
        { header: 'Post Date', matchedField: 'date', confidence: 1.0, matchType: 'synonym' },
        { header: 'Vendor Description', matchedField: 'description', confidence: 1.0, matchType: 'synonym' },
        { header: 'Debit', matchedField: 'amount', confidence: 0.9, matchType: 'heuristic' },
        { header: 'Bal', matchedField: 'balance', confidence: 0.8, matchType: 'prefix' }
      ],
      firstRowSample: {
        'Post Date': '08/01/2026',
        'Vendor Description': 'PUBLIX #1042',
        'Debit': '45.12',
        'Credit': '',
        'Bal': '1240.50'
      }
    }, 'info');
    addDebugLog('NORMALIZE', 'Record Normalization: 18 parsed records, 2 skipped due to invalid date/amount format', {
      totalParsed: 18,
      validRecords: 16,
      skippedCount: 2,
      skippedSamples: [
        {
          rowNumber: 4,
          reason: 'Missing or unparseable date value: "PENDING"',
          rawDate: 'PENDING',
          normalizedDate: null,
          rawAmount: '30.00',
          parsedAmount: 30.00,
          rawData: { 'Post Date': 'PENDING', 'Vendor Description': 'SHELL OIL', 'Debit': '30.00' }
        },
        {
          rowNumber: 12,
          reason: 'Zero or unparseable amount value: "$0.00 / N/A"',
          rawDate: '08/14/2026',
          normalizedDate: '2026-08-14',
          rawAmount: '$0.00 / N/A',
          parsedAmount: NaN,
          rawData: { 'Post Date': '08/14/2026', 'Vendor Description': 'ATM INQUIRY FEE WAIVED', 'Debit': '$0.00 / N/A' }
        }
      ]
    }, 'warn');
    addDebugLog('RECONCILE', 'Matched debit $142.50 to bill "Georgia Power" via Bank Document Key "GEORGIA POWER"', {
      billId: 'bill-gapower',
      matchingKey: 'GEORGIA POWER',
      matchSource: 'exact_document_key'
    }, 'info');
    addDebugLog('MATCH', 'Debit $38.99 unmatched to any recurring bill; routed to Other Expense', {
      desc: 'TARGET T-1029',
      amount: 38.99,
      account: 'Primary Checking'
    }, 'warn');
  };

  const filteredLogs = (debugLogs || []).filter(log => {
    if (debugFilterLevel !== 'all' && log.level !== debugFilterLevel) return false;
    if (debugSearchQuery) {
      const q = debugSearchQuery.toLowerCase();
      const matchMsg = (log.message || '').toLowerCase().includes(q);
      const matchCat = (log.category || '').toLowerCase().includes(q);
      const matchPayload = log.payload ? JSON.stringify(log.payload).toLowerCase().includes(q) : false;
      return matchMsg || matchCat || matchPayload;
    }
    return true;
  });

  // Local form state for new item creation
  const fileInputRef = useRef(null);
  const [backupStatus, setBackupStatus] = useState(null);

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
  const [billFilterTab, setBillFilterTab] = useState('active');
  const [selectedBillsAccountId, setSelectedBillsAccountId] = useState('all');
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'checking', saveExtraMonthly: 0, enableExtraSavings: true, color: 'blue', notes: '' });
  const [newPersonForm, setNewPersonForm] = useState({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
  const [newBillForm, setNewBillForm] = useState({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', matchingKey: '', notes: '' });

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
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const previewRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      const firstHeaderRow = previewRows.find(r => r && r.some(c => String(c).toLowerCase().includes('date'))) || [];
      const sampleHeaders = firstHeaderRow.map(c => String(c).trim());

      const detected = detectFileType(file.name, wb.SheetNames, sampleHeaders);
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
    { id: 'debug',     label: 'Debugging', icon: Bug,            desc: 'Real-time Logs & Tracing',  badge: isDebugMode ? 'ACTIVE' : null },
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
          onClick={() => (onNavigateView ? onNavigateView('dashboard') : (window.location.pathname = '/finance/dashboard'))}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-blue-400" />
          <span>Dashboard</span>
        </button>
      </div>

      {/* Main View Layout: Horizontal Nav + Content Panel */}
      <div className="flex flex-col gap-3.5">

        {/* Top Section Navigation (Horizontal Bar) */}
        <aside className="w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 rounded-xl p-1.5 flex flex-col gap-1 shadow-md">
          <div className="flex items-center justify-between px-2 py-0.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Sections
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
                  onClick={() => handleSidebarNav(section.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all cursor-pointer text-xs font-semibold group ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-200 border border-blue-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span>{section.label}</span>
                  {section.badge !== null && section.badge > 0 && (
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isActive ? 'bg-blue-500/25 text-blue-300' : 'bg-slate-950 text-slate-500 border border-slate-800'
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
                const isSubActive = settingsTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => { setSettingsTab(sub.id); setSetupSubTab(sub.id); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer font-medium ${
                      isSubActive
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <SubIcon className="w-3.5 h-3.5" />
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
        <div className="flex-1 min-w-0 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-md">

          {/* TAB 0: DASHBOARD WIDGETS MANAGER */}
          {settingsTab === 'dashboard' && (
            <div className="space-y-4 animate-fade-in">
              {/* Color Theme Preference Selector */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-400" />}
                    App Color Theme
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Choose your preferred application background appearance and visual style.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`p-2.5 rounded-lg border transition-all text-left flex items-center justify-between ${
                      theme !== 'light'
                        ? 'bg-slate-950 text-slate-100 border-blue-500 shadow-sm ring-1 ring-blue-500'
                        : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-slate-950 border border-slate-700 flex items-center justify-center">
                        <Moon className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">Dark Theme</span>
                        <span className="text-[10px] text-slate-400">Black/slate</span>
                      </div>
                    </div>
                    {theme !== 'light' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`p-2.5 rounded-lg border transition-all text-left flex items-center justify-between ${
                      theme === 'light'
                        ? 'bg-white text-slate-900 border-blue-500 shadow-sm ring-1 ring-blue-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-slate-100 border border-slate-300 flex items-center justify-center">
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
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

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-blue-400" />
                    Dashboard Widget Visibility &amp; Placement Order
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Toggle which data widgets appear on your Financial Dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetDashboardWidgets}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              <div className="space-y-2">
                {dashboardWidgets.map((widget, idx) => (
                  <div
                    key={widget.id}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      widget.visible
                        ? 'bg-slate-900/90 border-slate-700/80 shadow-sm'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => reorderDashboardWidgets(idx, idx - 1)}
                          className="p-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-colors text-[9px]"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === dashboardWidgets.length - 1}
                          onClick={() => reorderDashboardWidgets(idx, idx + 1)}
                          className="p-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-colors text-[9px]"
                          title="Move Down"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-200">{widget.title}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                            {widget.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{widget.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800">
                        <span className="text-[9px] text-slate-500 font-semibold mr-0.5">Size:</span>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'third')}
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${
                            (widget.width || 'third') === 'third' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          1/3
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'half')}
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${
                            widget.width === 'half' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          1/2
                        </button>
                        <button
                          type="button"
                          onClick={() => setDashboardWidgetWidth(widget.id, 'full')}
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all ${
                            widget.width === 'full' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Full
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleDashboardWidgetVisibility(widget.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                          widget.visible
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {widget.visible ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
                        {widget.visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETUP: ACCOUNTS & EARNERS (ULTRA-COMPACT DENSITY) */}
          {(settingsTab === 'accounts' || settingsTab === 'people') && (
            <div className="space-y-4 animate-fade-in">
              {/* Accounts Header & Action Bar */}
              <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-slate-100">
                    Accounts ({budget.accounts.length})
                  </h3>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">• Balances, type, extra savings, and split earners</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Account</span>
                </button>
              </div>

              {/* High-Density Accounts Table */}
              <div className="overflow-x-auto matrix-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2 w-[28%]">Account Name</th>
                      <th className="px-3 py-2 w-[16%]">Type</th>
                      <th className="px-3 py-2 w-[22%]">Extra Savings Target</th>
                      <th className="px-3 py-2 w-[28%]">Active Split Earners</th>
                      <th className="px-3 py-2 w-[6%] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {budget.accounts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500 italic text-xs">No accounts found.</td>
                      </tr>
                    ) : (
                      budget.accounts.map(acc => {
                        const enabledList = (acc.enabledEarners && Array.isArray(acc.enabledEarners))
                          ? acc.enabledEarners
                          : budget.people.map(person => person.id);

                        return (
                          <tr key={acc.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="px-3 py-1.5 font-bold text-slate-200">
                              <input
                                type="text"
                                value={acc.name}
                                onChange={e => updateAccount(acc.id, { name: e.target.value })}
                                className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none w-full text-xs font-bold text-slate-100"
                                placeholder="Account Name"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={acc.type}
                                onChange={e => updateAccount(acc.id, { type: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                              >
                                <option value="checking">Checking</option>
                                <option value="savings">Savings</option>
                                <option value="credit">Credit Card</option>
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={acc.enableExtraSavings !== false}
                                  onClick={() => updateAccount(acc.id, { enableExtraSavings: acc.enableExtraSavings === false })}
                                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${acc.enableExtraSavings !== false ? 'bg-blue-600' : 'bg-slate-700'}`}
                                  title="Toggle Extra Savings Goal"
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${acc.enableExtraSavings !== false ? 'translate-x-3' : 'translate-x-0'}`}
                                  />
                                </button>
                                {acc.enableExtraSavings !== false ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] text-slate-400 font-mono">$</span>
                                    <input
                                      type="number"
                                      step="10"
                                      value={acc.saveExtraMonthly || 0}
                                      onChange={e => updateAccount(acc.id, { saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                                      className="w-18 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-emerald-400 font-mono text-xs focus:border-blue-500 focus:outline-none"
                                    />
                                    <span className="text-[10px] text-slate-500">/mo</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic">Off</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {budget.people.map(p => {
                                  const isChecked = enabledList.includes(p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => {
                                        let updated;
                                        if (isChecked) {
                                          if (enabledList.length <= 1) return;
                                          updated = enabledList.filter(id => id !== p.id);
                                        } else {
                                          updated = [...enabledList, p.id];
                                        }
                                        updateAccount(acc.id, { enabledEarners: updated });
                                      }}
                                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                        isChecked
                                          ? 'bg-purple-950/70 border-purple-600/60 text-purple-200'
                                          : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-60 hover:opacity-100'
                                      }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-purple-400' : 'bg-slate-600'}`} />
                                      <span>{p.name.split(' ')[0]}</span>
                                      <span className="text-[9px]">{isChecked ? '✓' : '—'}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <button
                                onClick={() => deleteAccount(acc.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                title="Delete Account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Earners Section */}
              <div className="pt-3 space-y-3">
                <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <h3 className="text-xs font-bold text-slate-100">
                      Household Earners ({budget.people.length})
                    </h3>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">• Configure incomes and pay frequency schedules</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPersonModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Member</span>
                  </button>
                </div>

                {/* High-Density Earners Table */}
                <div className="overflow-x-auto matrix-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2 w-[30%]">Member Name</th>
                        <th className="px-3 py-2 w-[24%]">Pay Frequency</th>
                        <th className="px-3 py-2 w-[20%]">Gross Per Pay ($)</th>
                        <th className="px-3 py-2 w-[20%]">Net Per Pay ($)</th>
                        <th className="px-3 py-2 w-[6%] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {budget.people.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-500 italic text-xs">No earners found.</td>
                        </tr>
                      ) : (
                        budget.people.map(person => (
                          <tr key={person.id} className="hover:bg-slate-900/50 transition-colors">
                            <td className="px-3 py-1.5 font-bold text-slate-200">
                              <input
                                type="text"
                                value={person.name}
                                onChange={e => updatePerson(person.id, { name: e.target.value })}
                                className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-purple-500 focus:outline-none w-full text-xs font-bold text-slate-100"
                                placeholder="Member Name"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={person.payFrequency}
                                onChange={e => updatePerson(person.id, { payFrequency: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:border-purple-500 focus:outline-none cursor-pointer"
                              >
                                <option value="bi-weekly">Bi-weekly (26/yr)</option>
                                <option value="semi-monthly">Semi-Monthly (24/yr)</option>
                                <option value="monthly">Monthly (12/yr)</option>
                                <option value="weekly">Weekly (52/yr)</option>
                              </select>
                            </td>
                            <td className="px-3 py-1.5 font-mono">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-slate-500">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={person.grossPerPay}
                                  onChange={e => updatePerson(person.id, { grossPerPay: parseFloat(e.target.value) || 0 })}
                                  className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:border-purple-500 focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-1.5 font-mono">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-emerald-500 font-bold">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={person.netPerPay}
                                  onChange={e => updatePerson(person.id, { netPerPay: parseFloat(e.target.value) || 0 })}
                                  className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-bold font-mono text-xs focus:border-purple-500 focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <button
                                onClick={() => deletePerson(person.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                title="Delete Member"
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
            </div>
          )}

          {/* SETUP: BILLS & SPLITS */}
          {(settingsTab === 'bills' || settingsTab === 'splits') && (() => {
            const knownAccountIds = new Set(budget.accounts.map(a => a.id));
            const displayAccounts = selectedBillsAccountId === 'all'
              ? budget.accounts
              : budget.accounts.filter(a => a.id === selectedBillsAccountId);

            return (
              <div className="space-y-6">
                {/* Bills Header & Info Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-emerald-400" />
                      Unified Bills & Earner Splits Manager
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Manage recurring bills, due dates, assigned accounts, and responsible earner splits in one place.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Active / Archived Filter */}
                    <div className="flex items-center bg-slate-900 rounded-xl p-0.5 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setBillFilterTab('active')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          billFilterTab === 'active'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Active ({budget.bills.filter(b => !b.isArchived).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillFilterTab('archived')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          billFilterTab === 'archived'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Archived ({budget.bills.filter(b => b.isArchived).length})
                      </button>
                    </div>

                    {/* Account Selector Dropdown */}
                    <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-750 border-slate-700 shadow-sm text-xs">
                      <Filter className="w-3.5 h-3.5 text-blue-400" />
                      <select
                        value={selectedBillsAccountId}
                        onChange={e => setSelectedBillsAccountId(e.target.value)}
                        className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
                      >
                        <option value="all" className="bg-slate-900 text-slate-100 py-1">All Accounts Combined</option>
                        {budget.accounts.map(acc => (
                          <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100 py-1">{acc.name}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddBillModalOpen(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Bill
                    </button>
                  </div>
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

                    const accountEnabledEarners = (account.enabledEarners && Array.isArray(account.enabledEarners))
                      ? account.enabledEarners
                      : budget.people.map(p => p.id);

                    const eligiblePeople = budget.people.filter(p => accountEnabledEarners.includes(p.id));

                    return (
                      <div key={account.id} className="rounded-xl border border-slate-800 glass-card overflow-hidden shadow-lg">
                        <div className="bg-slate-900/95 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
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

                        {/* Master Earner & Split Participant Selector for this Account */}
                        <div className="bg-slate-900/60 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-slate-300 font-semibold text-[11px]">Participating Split Earners for {account.name}:</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {budget.people.map(p => {
                              const isChecked = accountEnabledEarners.includes(p.id);

                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    let updated;
                                    if (isChecked) {
                                      if (accountEnabledEarners.length <= 1) return;
                                      updated = accountEnabledEarners.filter(id => id !== p.id);
                                    } else {
                                      updated = [...accountEnabledEarners, p.id];
                                    }
                                    updateAccount(account.id, { enabledEarners: updated });
                                  }}
                                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                                    isChecked
                                      ? 'bg-purple-950/80 border-purple-500/70 text-purple-200 shadow-sm'
                                      : 'bg-slate-900 border-slate-800 text-slate-500 opacity-60 hover:opacity-100 hover:border-slate-700'
                                  }`}
                                  title={`Toggle whether ${p.name} participates in bills and credits on ${account.name}`}
                                >
                                  <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-purple-400' : 'bg-slate-600'}`} />
                                  <span>{p.name.split(' ')[0]}</span>
                                  <span className="text-[9px] font-mono">{isChecked ? '✓' : '—'}</span>
                                </button>
                              );
                            })}
                          </div>
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
                                    No {billFilterTab === 'archived' ? 'archived' : 'active'} bills assigned to this account
                                  </td>
                                </tr>
                              ) : (
                                accountBills.map(bill => {
                                  const sumSplits = eligiblePeople.reduce((sum, p) => sum + (parseFloat(bill.splits?.[p.id]) || 0), 0);
                                  const isValid100 = Math.abs(sumSplits - 100) < 0.01;

                                  const handleSplitChange = (personId, valStr) => {
                                    let num = Math.max(0, Math.min(100, parseFloat(valStr) || 0));
                                    if (eligiblePeople.length === 2) {
                                      const otherP = eligiblePeople.find(p => p.id !== personId);
                                      const otherVal = Math.max(0, Math.min(100, Math.round((100 - num) * 100) / 100));
                                      updateBillSplits(bill.id, {
                                        ...(bill.splits || {}),
                                        [personId]: num,
                                        [otherP.id]: otherVal
                                      });
                                    } else {
                                      const otherSum = eligiblePeople
                                        .filter(p => p.id !== personId)
                                        .reduce((sum, p) => sum + (parseFloat(bill.splits?.[p.id]) || 0), 0);
                                      const maxVal = Math.max(0, 100 - otherSum);
                                      const clamped = Math.min(num, maxVal);
                                      updateBillSplits(bill.id, {
                                        ...(bill.splits || {}),
                                        [personId]: clamped
                                      });
                                    }
                                  };

                                  return (
                                    <tr key={bill.id} className="hover:bg-slate-900/60 transition-colors">
                                      <td className="px-2 py-1.5 font-semibold text-slate-200">
                                        <input
                                          type="text"
                                          value={bill.name}
                                          onChange={e => updateBill(bill.id, { name: e.target.value })}
                                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none w-full truncate text-xs"
                                        />
                                        <input
                                          type="text"
                                          placeholder="Match key (e.g. GA POWER, COMCAST)"
                                          value={bill.matchingKey || ''}
                                          onChange={e => updateBill(bill.id, { matchingKey: e.target.value })}
                                          className="bg-transparent text-[10px] text-blue-400 placeholder:text-slate-600 border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none w-full truncate font-mono mt-0.5"
                                          title="Bank Document Matching Key for reconciliation"
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
                                            {eligiblePeople.map(p => {
                                              const val = bill.splits?.[p.id] ?? (eligiblePeople.length > 0 ? (100 / eligiblePeople.length) : 100);
                                              return (
                                                <div key={p.id} className="inline-flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">
                                                  <span className="text-slate-400 font-medium truncate max-w-[45px]">{p.name.split(' ')[0]}:</span>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                    value={Math.round(val * 10) / 10}
                                                    onChange={e => handleSplitChange(p.id, e.target.value)}
                                                    className="w-9 bg-transparent text-center font-mono font-bold text-slate-200 focus:outline-none focus:bg-slate-800 rounded"
                                                  />
                                                  <span className="text-slate-500">%</span>
                                                </div>
                                              );
                                            })}
                                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                                              isValid100
                                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                                : 'bg-rose-950/80 text-rose-300 border-rose-800/60 animate-pulse'
                                            }`}>
                                              {Math.round(sumSplits)}%
                                            </span>
                                          </div>
                                          {eligiblePeople.length > 1 && (
                                            <div className="flex items-center gap-1 text-[9px] flex-wrap">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const splits = {};
                                                  const count = eligiblePeople.length || 1;
                                                  eligiblePeople.forEach(p => splits[p.id] = Math.round((100 / count) * 100) / 100);
                                                  updateBillSplits(bill.id, splits);
                                                }}
                                                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                                              >
                                                Equal
                                              </button>
                                              {eligiblePeople.map(p => (
                                                <button
                                                  key={p.id}
                                                  type="button"
                                                  onClick={() => {
                                                    const splits = {};
                                                    eligiblePeople.forEach(person => splits[person.id] = person.id === p.id ? 100 : 0);
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
            );
          })()}

          {/* TAB: IMPORT DATA & SPREADSHEETS */}
          {activeSection === 'import' && (
            <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-800/50 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100">Spreadsheet Data Import</h3>
                    <p className="text-[11px] text-slate-400">Import financial data from Excel (.xlsx) and CSV files</p>
                  </div>
                </div>
              </div>

              <SpreadsheetImporter />
            </div>
          )}

          {/* TAB: CLOUD VAULT & AUTOMATIC SYNC */}
          {activeSection === 'sync' && (
            <div className="space-y-4 max-w-3xl mx-auto animate-fade-in">
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-blue-950/40 border border-purple-800/50 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100">Cloud Vault &amp; JSON Backup Sync</h3>
                    <p className="text-[11px] text-slate-400">Passcode-protected Cloudflare D1 Sync and offline JSON Backup / Restore</p>
                  </div>
                </div>
              </div>

              {/* JSON Backup & Restore Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl glass-card border border-blue-800/60 bg-blue-950/10 space-y-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">Export Backup (.json)</h4>
                    <p className="text-[11px] text-slate-400">Download a JSON backup of your current budget data.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportDataClick}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON Backup</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-xl glass-card border border-emerald-800/60 bg-emerald-950/10 space-y-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">Restore Backup (.json)</h4>
                    <p className="text-[11px] text-slate-400">Restore budget data from a saved JSON snapshot.</p>
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleLoadBackupFile} accept=".json" className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Load JSON File</span>
                  </button>
                </div>
              </div>

              {/* Cloudflare D1 Vault Sync Section */}
              <div className="p-3.5 rounded-xl glass-card border border-purple-800/60 bg-purple-950/10 space-y-3">
                <div className={`flex items-center justify-between flex-wrap gap-2 transition-opacity ${!isCloudUnlocked ? 'opacity-50' : 'opacity-100'}`}>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30">
                      <Cloud className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">Cloudflare D1 Vault Sync</h4>
                      <p className="text-[10px] text-slate-400">Passcode-gated encrypted backup on Cloudflare D1</p>
                    </div>
                  </div>
                  {isCloudUnlocked ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                        Vault Unlocked
                      </span>
                      <button
                        type="button"
                        onClick={handleLockCloudVault}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer font-medium"
                      >
                        Lock Vault
                      </button>
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                      Locked
                    </span>
                  )}
                </div>

                {!isCloudUnlocked ? (
                  <form onSubmit={handleUnlockCloudVault} className="space-y-2 pt-1">
                    <p className="text-[11px] text-slate-400">
                      Enter Access Passcode to Enable Cloud Sync across device sessions.
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <KeyRound className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                        <input
                          type="password"
                          placeholder="Enter Access Passcode..."
                          value={passcodeInput}
                          onChange={e => setPasscodeInput(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isVerifyingCode || !passcodeInput}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        {isVerifyingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                        <span>Unlock</span>
                      </button>
                    </div>
                    {passcodeError && (
                      <p className="text-[11px] text-rose-400 font-semibold">{passcodeError}</p>
                    )}
                  </form>
                ) : (
                  <div className="space-y-3 pt-1">
                    {/* Auto Backup Toggle Switch */}
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-200">Automatic Cloud Backup</div>
                        <div className="text-[10px] text-slate-400">
                          {isAutoCloudBackupEnabled
                            ? (lastCloudSyncTime ? `Auto-sync active • Last: ${lastCloudSyncTime}` : 'Auto-sync active • Syncs 3s after local changes')
                            : 'Disabled • Local edits will not push to D1 automatically'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleAutoCloudBackup(!isAutoCloudBackupEnabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isAutoCloudBackupEnabled ? 'bg-purple-600' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            isAutoCloudBackupEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {cloudSyncStatus && (
                      <div className={`p-2 rounded-lg text-xs flex items-center justify-between ${
                        cloudSyncStatus.type === 'success'
                          ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                      }`}>
                        <span>{cloudSyncStatus.message}</span>
                        <button onClick={() => setCloudSyncStatus(null)} className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer ml-2 font-bold">Dismiss</button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handlePushCloudBackup}
                        disabled={isCloudSyncing}
                        className="py-2 px-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {isCloudSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                        <span>Backup to Cloud</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePullCloudRestore}
                        disabled={isCloudSyncing}
                        className="py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {isCloudSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}
                        <span>Restore from Cloud</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Data Section */}
              <div className="p-3 rounded-xl border border-rose-900/40 bg-rose-950/10 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> Clear Local Database
                  </h4>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm('Are you sure you want to purge all local budget data? This action cannot be undone unless you have a JSON backup.')) {
                        await clearAllData();
                        setBackupStatus({ type: 'success', message: 'All local IndexedDB budget data has been cleared.' });
                      }
                    }}
                    className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Purge Data
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Purges all accounts, earners, bills, and ledger transactions from your local IndexedDB storage.
                </p>
              </div>
            </div>
          )}

          {/* TAB: SECURITY & PROFILE */}
          {settingsTab === 'security' && (
            <div className="space-y-4 max-w-xl mx-auto animate-fade-in">
              <div className="flex items-center space-x-2.5 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-100">Account Security &amp; Profile</h3>
                  <p className="text-[10px] text-slate-400">Update profile credentials, security question, and password</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3 glass-card border border-slate-800 rounded-xl p-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      value={profileForm.email}
                      onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isUpdatingProfile ? 'Saving...' : 'Save Profile'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB: DEBUGGING & REAL-TIME LOGS */}
          {activeSection === 'debug' && (
            <div className="space-y-4 max-w-4xl mx-auto animate-fade-in">
              {/* Header Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Bug className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                      System &amp; Import Debugger
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      Real-time execution tracing, parsing diagnostics, and payload inspection.
                    </p>
                  </div>
                </div>

                {/* Master Toggle */}
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-950/80 border border-slate-800 self-start sm:self-center">
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-200 block">Debug Mode</span>
                    <span className={`text-[9px] font-semibold ${isDebugMode ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {isDebugMode ? 'Active / Logging' : 'Disabled'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDebugMode(!isDebugMode)}
                    aria-label="Toggle Debug Mode"
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isDebugMode ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isDebugMode ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Status Alert Banner */}
              {isDebugMode ? (
                <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-800/60 text-indigo-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span className="text-[11px]">
                      <strong>Verbose Logging Enabled:</strong> The Import engine will record all parsing steps and matching scores.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateTestLogs}
                    className="px-2 py-0.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded text-[10px] font-semibold transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-300" />
                    <span>Test Log</span>
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                    <span className="text-[11px]">
                      Debug mode is disabled. Toggle ON to capture execution telemetry during imports.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDebugMode(true)}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-bold transition-colors shrink-0 cursor-pointer"
                  >
                    Enable
                  </button>
                </div>
              )}

              {/* Control Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter logs..."
                      value={debugSearchQuery}
                      onChange={e => setDebugSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 w-40 sm:w-48"
                    />
                    {debugSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDebugSearchQuery('')}
                        className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  {/* Level Filter Pills */}
                  <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                    {['all', 'info', 'warn', 'error'].map(lvl => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setDebugFilterLevel(lvl)}
                        className={`px-2.5 py-1 rounded-md capitalize font-semibold transition-all cursor-pointer ${
                          debugFilterLevel === lvl
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleCopyAllLogs}
                    disabled={debugLogs.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                    title="Copy all logs to clipboard"
                  >
                    {copiedAllLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAllLogs ? 'Copied All' : 'Copy All'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportLogsJson}
                    disabled={debugLogs.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                    title="Download logs as JSON file"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Export JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={clearDebugLogs}
                    disabled={debugLogs.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-50 disabled:cursor-not-allowed text-rose-300 rounded-lg text-xs font-semibold border border-rose-900/60 transition-colors cursor-pointer"
                    title="Clear log console"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* Real-time Log Console Window */}
              <div className="bg-slate-950 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
                {/* Console Top Bar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-mono font-bold text-slate-300">Live Console Output</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({filteredLogs.length} / {debugLogs.length} events)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${isDebugMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span>{isDebugMode ? 'LISTENING' : 'IDLE'}</span>
                    </span>
                  </div>
                </div>

                {/* Console Log List */}
                <div className="p-3 max-h-[550px] overflow-y-auto space-y-2 font-mono text-xs scrollbar-thin">
                  {filteredLogs.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-3">
                      <Terminal className="w-8 h-8 text-slate-700 mx-auto" />
                      <p className="text-xs text-slate-400 font-sans font-medium">
                        {debugLogs.length === 0
                          ? 'No debug events captured yet.'
                          : 'No logs match your filter criteria.'}
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto font-sans">
                        Enable Debug Mode, then perform an action (e.g. import a CSV/spreadsheet or create an account) to inspect real-time execution steps and data payloads.
                      </p>
                      {debugLogs.length === 0 && isDebugMode && (
                        <button
                          type="button"
                          onClick={handleGenerateTestLogs}
                          className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer"
                        >
                          Generate Sample Telemetry Logs
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredLogs.map(log => {
                      const isExpanded = expandedLogIds.has(log.id);
                      const hasPayload = log.payload !== null && log.payload !== undefined;
                      const levelColor =
                        log.level === 'error'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                          : log.level === 'warn'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                          : 'bg-blue-950/80 text-blue-300 border-blue-800';

                      const categoryColor =
                        log.category === 'IMPORT'
                          ? 'text-indigo-400'
                          : log.category === 'MATCH'
                          ? 'text-emerald-400'
                          : log.category === 'RECONCILE'
                          ? 'text-purple-400'
                          : log.category === 'PARSER'
                          ? 'text-amber-400'
                          : 'text-slate-400';

                      return (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 transition-colors space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${levelColor}`}>
                                {log.level}
                              </span>
                              <span className={`text-[10px] font-bold ${categoryColor}`}>
                                [{log.category}]
                              </span>
                              <span className="text-slate-200 font-sans text-xs break-all">
                                {log.message}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                              {hasPayload && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandLog(log.id)}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-sans flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  <span>{isExpanded ? 'Hide Payload' : 'View Payload'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleCopyLog(log)}
                                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Copy log JSON"
                              >
                                {copiedLogId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded JSON Payload Inspector */}
                          {isExpanded && hasPayload && (
                            <DebugPayloadInspector payload={log.payload} logId={log.id} />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
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
                      setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', matchingKey: '', notes: '' });
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
                        <label className="block text-xs font-medium text-slate-300 mb-1">Bank Document Matching Key</label>
                        <input
                          type="text"
                          placeholder="e.g. GEORGIA POWER, COMCAST, PROGRESSIVE (comma-separated)"
                          value={newBillForm.matchingKey || ''}
                          onChange={e => setNewBillForm({ ...newBillForm, matchingKey: e.target.value })}
                          className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Automatic account reconciliation key used to match bank statement rows</p>
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
