// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { useBudgetMetadata, useLedgerDataState, useLedgerDataDispatch } from '../context/BudgetContext';
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
  Loader2,
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
import { MONTH_SHORT_NAMES, getBillDueMonths, formatBillDueMonths, getAccountSaveExtraPersonPortion } from '../utils/paydayUtils';
import { NoYearCalendarPicker } from './NoYearCalendarPicker';
import { useAuth } from '../context/AuthContext';
import { PRESET_SECURITY_QUESTIONS } from './AuthModal';
import { getApiUrl } from '../utils/api';
import { SpreadsheetImporter } from './SpreadsheetImporter';
import { DebugPayloadInspector } from './DebugPayloadInspector';

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
    isAutoCloudBackupEnabled,
    toggleAutoCloudBackup,
    lastCloudSyncTime,
    isDebugMode,
    setDebugMode,
    debugLogs,
    clearDebugLogs,
    addDebugLog
  } = useBudgetMetadata();
  const { syncPasscode: cloudPasscode, isSyncUnlocked: isCloudUnlocked } = useLedgerDataState();
  const {
    resetToDefaults,
    clearAllData,
    clearAccountTransactions,
    exportBackupJson,
    restoreFromBackup,
    pushCloudBackup,
    pullCloudRestore,
    importSpreadsheetSelective,
    loadDemoPreset,
    setSyncPasscode: setCloudPasscode,
    setIsSyncUnlocked: setIsCloudUnlocked,
  } = useLedgerDataDispatch();

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
  const [clearAccId, setClearAccId] = useState('');
  const [isClearAccConfirmOpen, setIsClearAccConfirmOpen] = useState(false);
  const [clearAccStatus, setClearAccStatus] = useState(null);

  useEffect(() => {
    if (!clearAccId && budget.accounts?.length > 0) {
      setClearAccId(budget.accounts[0].id);
    }
  }, [budget.accounts, clearAccId]);

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

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAccForm.name) return;
    addAccount(newAccForm);
    setNewAccForm({ name: '', type: 'checking', saveExtraMonthly: 0, enableExtraSavings: true, color: 'blue', notes: '' });
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

              {/* High-Density Accounts Table */}
              <div className="overflow-x-auto matrix-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2 w-[22%]">Account Name</th>
                      <th className="px-2 py-2 w-[13%]">Type</th>
                      <th className="px-2 py-2 w-[20%]">Extra Savings Goal</th>
                      <th className="px-2 py-2 w-[39%]">Active Earners &amp; Savings Split</th>
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
                            <td className="px-2 py-1.5">
                              <select
                                value={acc.type}
                                onChange={e => updateAccount(acc.id, { type: e.target.value })}
                                className="bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-0.5 text-slate-300 text-xs font-medium focus:border-blue-500 focus:outline-none cursor-pointer w-full"
                              >
                                <option value="checking">Checking</option>
                                <option value="savings">Savings</option>
                                <option value="credit">Credit Card</option>
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={acc.enableExtraSavings !== false}
                                  onClick={() => updateAccount(acc.id, { enableExtraSavings: acc.enableExtraSavings === false })}
                                  className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${acc.enableExtraSavings !== false ? 'bg-emerald-600' : 'bg-slate-700'}`}
                                  title="Toggle Extra Savings Goal"
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${acc.enableExtraSavings !== false ? 'translate-x-2.5' : 'translate-x-0.5'} mt-0.5`}
                                  />
                                </button>
                                {acc.enableExtraSavings !== false ? (
                                  <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-800 rounded-lg px-1.5 py-0.5 text-xs">
                                    <span className="text-[10px] text-slate-500 font-mono">$</span>
                                    <input
                                      type="number"
                                      step="10"
                                      value={acc.saveExtraMonthly || 0}
                                      onChange={e => updateAccount(acc.id, { saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                                      className="w-14 bg-transparent text-emerald-400 font-mono font-bold text-xs focus:outline-none text-right"
                                    />
                                    <span className="text-[9px] text-slate-500">/mo</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic">Off</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto py-0.5">
                                {budget.people.map(p => {
                                  const isChecked = enabledList.includes(p.id);
                                  const isCredit = p.name.toLowerCase().includes('credit') || p.role === 'Credit';
                                  const activeNonCredits = budget.people.filter(pe => enabledList.includes(pe.id) && !pe.name.toLowerCase().includes('credit') && pe.role !== 'Credit');
                                  const defaultSplit = isCredit ? 0 : (100 / Math.max(1, activeNonCredits.length));
                                  const currentVal = acc.saveExtraSplits?.[p.id] !== undefined
                                    ? parseFloat(acc.saveExtraSplits[p.id])
                                    : Math.round(defaultSplit * 10) / 10;
                                  const showSplitInput = isChecked && acc.enableExtraSavings !== false && parseFloat(acc.saveExtraMonthly) > 0;

                                  return (
                                    <div
                                      key={p.id}
                                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
                                        isChecked
                                          ? 'bg-purple-950/70 border-purple-600/60 text-purple-200'
                                          : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-50 hover:opacity-90'
                                      }`}
                                    >
                                      <button
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
                                        className="flex items-center gap-1 cursor-pointer hover:text-white"
                                        title={isChecked ? `Click to exclude ${p.name}` : `Click to include ${p.name}`}
                                      >
                                        <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-purple-400' : 'bg-slate-600'}`} />
                                        <span>{p.name.split(' ')[0]}</span>
                                        {!showSplitInput && <span className="text-[10px]">{isChecked ? '✓' : '—'}</span>}
                                      </button>

                                      {showSplitInput && (
                                        <div className="inline-flex items-center gap-0.5 pl-1.5 border-l border-purple-800/60">
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={currentVal}
                                            onChange={e => {
                                              const val = e.target.value.replace(/[^0-9.]/g, '');
                                              const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
                                              const activeEarners = budget.people.filter(pe => enabledList.includes(pe.id));
                                              let nextSplits = { ...(acc.saveExtraSplits || {}) };
                                              if (activeEarners.length === 2) {
                                                const other = activeEarners.find(pe => pe.id !== p.id);
                                                nextSplits[p.id] = num;
                                                if (other) nextSplits[other.id] = Math.max(0, 100 - num);
                                              } else {
                                                nextSplits[p.id] = num;
                                              }
                                              updateAccount(acc.id, { saveExtraSplits: nextSplits });
                                            }}
                                            className="w-8 text-center font-mono font-bold text-emerald-400 bg-slate-900/90 rounded px-1 py-0 border border-purple-500/40 focus:border-emerald-400 focus:outline-none text-xs"
                                          />
                                          <span className="text-purple-300 text-[10px] font-bold">%</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setClearAccId(acc.id);
                                    setIsClearAccConfirmOpen(true);
                                  }}
                                  className="p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-950/40 rounded transition-colors cursor-pointer"
                                  title={`Clear all transactions and reset balance for ${acc.name}`}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteAccount(acc.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
          )}

          {/* SETUP: EARNERS (stacked below Accounts in Accounts & Earners view) */}
          {(settingsTab === 'accounts' || settingsTab === 'people') && (
            <div className="space-y-3 pt-3">
              {/* Earners Header & Action Bar */}
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
          )}

          {/* SETUP: BILLS & SPLITS */}
          {(settingsTab === 'bills' || settingsTab === 'splits') && (
            <div className="space-y-4">
              {/* Active / Archived Bills Filter Bar & Add Bill Button */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
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
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddBillModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
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

              {/* Unified Bills Manager Table Grouped by Account */}
              {(() => {
                const knownAccountIds = new Set(budget.accounts.map(a => a.id));
                const displayAccounts = selectedBillsAccountId === 'all'
                  ? budget.accounts
                  : budget.accounts.filter(a => a.id === selectedBillsAccountId);

                return (
                  <div className="space-y-4">
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
                        {/* Streamlined Combined Account Header */}
                        <div className="bg-slate-900/95 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            <h4 className="text-xs font-bold text-slate-100">{account.name}</h4>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 capitalize font-medium">{account.type}</span>
                            <span className="text-[10px] text-slate-500">({accountBills.length} bill{accountBills.length !== 1 ? 's' : ''})</span>
                          </div>

                          {/* Inline Account Earner Participation Badges */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">Account Earners:</span>
                            <div className="flex items-center gap-1">
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
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer border ${
                                      isChecked
                                        ? 'bg-purple-950/80 border-purple-500/70 text-purple-200'
                                        : 'bg-slate-900 border-slate-800 text-slate-500 opacity-50 hover:opacity-90'
                                    }`}
                                    title={`Toggle ${p.name} on ${account.name}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-purple-400' : 'bg-slate-600'}`} />
                                    <span>{p.name.split(' ')[0]}</span>
                                    <span className="text-[9px] font-mono">{isChecked ? '✓' : '—'}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="text-xs text-slate-400">
                            Subtotal: <span className="font-bold text-rose-400 font-mono text-xs">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
                          </div>
                        </div>

                        {/* Modern List-Row Bill Items */}
                        <div className="divide-y divide-slate-800/70 bg-slate-950/40">
                          {accountBills.length === 0 ? (
                            <div className="p-5 text-center text-slate-500 italic text-xs">
                              No {billFilterTab === 'archived' ? 'archived' : 'active'} bills assigned to this account
                            </div>
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
                                <div
                                  key={bill.id}
                                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-900/60 transition-colors"
                                >
                                  {/* Left: Bill Name & Bank Match Key */}
                                  <div className="flex-1 min-w-[200px]">
                                    <input
                                      type="text"
                                      value={bill.name}
                                      onChange={e => updateBill(bill.id, { name: e.target.value })}
                                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none w-full text-xs font-semibold text-slate-100 placeholder:text-slate-500"
                                      placeholder="Bill Name"
                                    />
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="text-[9px] text-slate-500 font-mono">key:</span>
                                      <input
                                        type="text"
                                        placeholder="Bank match key (e.g. GA POWER, COMCAST)"
                                        value={bill.matchingKey || ''}
                                        onChange={e => updateBill(bill.id, { matchingKey: e.target.value })}
                                        className="bg-transparent text-[10px] text-blue-400 placeholder:text-slate-600 border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none w-full font-mono"
                                        title="Bank Document Matching Key for reconciliation"
                                      />
                                    </div>
                                  </div>

                                  {/* Right Controls Group (Schedule + Splits + Actions) */}
                                  <div className="flex items-center gap-2.5 flex-wrap lg:flex-nowrap shrink-0">
                                    {/* Amount Input */}
                                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                                      <span className="text-slate-500 font-mono text-xs">$</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={bill.amount}
                                        onChange={e => updateBill(bill.id, { amount: parseFloat(e.target.value) || 0 })}
                                        className="w-16 bg-transparent text-slate-100 font-mono font-bold text-xs focus:outline-none"
                                      />
                                    </div>

                                    {/* Frequency & Due Day Pill */}
                                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                                      <select
                                        value={bill.period || 'Monthly'}
                                        onChange={e => updateBill(bill.id, { period: e.target.value })}
                                        className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer"
                                      >
                                        <option value="Monthly" className="bg-slate-900 text-slate-200">Monthly</option>
                                        <option value="Quarterly" className="bg-slate-900 text-slate-200">Quarterly</option>
                                        <option value="Semi-Annual" className="bg-slate-900 text-slate-200">Semi-Annual</option>
                                        <option value="Annual" className="bg-slate-900 text-slate-200">Annual</option>
                                      </select>
                                      <span className="text-slate-600">•</span>
                                      <span className="text-slate-500 text-[11px]">Due</span>
                                      <input
                                        type="number"
                                        min="1"
                                        max="31"
                                        value={bill.dueDay || 1}
                                        onChange={e => updateBill(bill.id, { dueDay: parseInt(e.target.value, 10) || 1 })}
                                        className="w-5 bg-transparent text-slate-100 text-center font-mono font-bold text-xs focus:outline-none"
                                        title="Due day of the month (1-31)"
                                      />
                                    </div>

                                    {/* Earner Split Chips */}
                                    <div className="flex items-center gap-1.5">
                                      {eligiblePeople.map(p => {
                                        const val = bill.splits?.[p.id] !== undefined ? (parseFloat(bill.splits[p.id]) || 0) : 0;
                                        return (
                                          <div
                                            key={p.id}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border border-slate-800 bg-slate-900 text-slate-200"
                                          >
                                            <span className="text-slate-400 font-medium text-[11px] truncate max-w-[50px]">{p.name.split(' ')[0]}:</span>
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              value={Math.round(val * 10) / 10}
                                              onChange={e => {
                                                const clean = e.target.value.replace(/[^0-9.]/g, '');
                                                handleSplitChange(p.id, clean);
                                              }}
                                              className="w-7 text-center font-mono font-bold text-emerald-400 bg-slate-950/80 rounded px-0.5 py-0 border border-slate-700/80 focus:border-emerald-400 focus:outline-none text-xs"
                                            />
                                            <span className="text-slate-500 text-[10px]">%</span>
                                          </div>
                                        );
                                      })}

                                      {/* Split Validation Status Badge */}
                                      {(() => {
                                        const isUnassigned = !bill.splits || Object.keys(bill.splits).length === 0 || Object.values(bill.splits).every(v => !parseFloat(v));
                                        return (
                                          <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded-lg border ${
                                            isValid100
                                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                                              : isUnassigned
                                                ? 'bg-amber-950/80 text-amber-300 border-amber-800/60 animate-pulse'
                                                : 'bg-rose-950/80 text-rose-300 border-rose-800/60 animate-pulse'
                                          }`}>
                                            {isUnassigned ? 'Unassigned' : `${Math.round(sumSplits)}%`}
                                          </span>
                                        );
                                      })()}

                                      {/* ⚡ Quick Split Preset Dropdown */}
                                      {eligiblePeople.length > 1 && (
                                        <select
                                          onChange={e => {
                                            const val = e.target.value;
                                            if (!val) return;
                                            if (val === 'equal') {
                                              const splits = {};
                                              const count = eligiblePeople.length || 1;
                                              eligiblePeople.forEach(p => splits[p.id] = Math.round((100 / count) * 100) / 100);
                                              updateBillSplits(bill.id, splits);
                                            } else if (val.startsWith('100_')) {
                                              const targetPersonId = val.replace('100_', '');
                                              const splits = {};
                                              eligiblePeople.forEach(person => splits[person.id] = person.id === targetPersonId ? 100 : 0);
                                              updateBillSplits(bill.id, splits);
                                            }
                                            e.target.value = '';
                                          }}
                                          defaultValue=""
                                          className="bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none cursor-pointer"
                                          title="Apply quick split preset"
                                        >
                                          <option value="" disabled>⚡ Split</option>
                                          <option value="equal" className="bg-slate-900 text-slate-200">50/50 Equal</option>
                                          {eligiblePeople.map(p => (
                                            <option key={p.id} value={`100_${p.id}`} className="bg-slate-900 text-slate-200">100% {p.name}</option>
                                          ))}
                                        </select>
                                      )}
                                    </div>

                                    {/* Action Buttons (Archive, Delete) */}
                                    <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
                                      {bill.isArchived ? (
                                        <button
                                          type="button"
                                          onClick={() => unarchiveBill(bill.id)}
                                          className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded transition-colors cursor-pointer"
                                          title="Restore Bill"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => archiveBill(bill.id)}
                                          className="p-1 text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 rounded transition-colors cursor-pointer"
                                          title="Archive Bill"
                                        >
                                          <Archive className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => deleteBill(bill.id)}
                                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                                        title="Delete Bill"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                );
              })()}
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

              {/* Clear Specific Account Transactions Section */}
              <div className="p-4 rounded-xl border border-amber-900/40 bg-amber-950/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Clear Account Transactions
                  </h4>
                  {clearAccStatus && (
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {clearAccStatus}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Select a specific financial account to purge all its recorded actual transactions, clear manual ledger adjustments, and reset its opening balance to $0.00.
                </p>

                <div className="flex items-center gap-2.5">
                  <select
                    value={clearAccId}
                    onChange={e => setClearAccId(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500 font-medium cursor-pointer"
                  >
                    {budget.accounts.map(acc => {
                      const count = (budget.transactions || []).filter(t => t.accountId === acc.id).length;
                      return (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({count} transactions)
                        </option>
                      );
                    })}
                  </select>

                  <button
                    type="button"
                    disabled={!clearAccId}
                    onClick={() => setIsClearAccConfirmOpen(true)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Clear Account Data...</span>
                  </button>
                </div>
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

          {/* TAB: DEBUGGING & REAL-TIME LOGS */}
          {activeSection === 'debug' && (
            <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
              {/* Header Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Bug className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      System &amp; Import Debugger
                    </h3>
                    <p className="text-xs text-slate-400">
                      Real-time execution tracing, parsing diagnostics, and data payload inspection.
                    </p>
                  </div>
                </div>

                {/* Master Toggle */}
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 self-start sm:self-center">
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-200 block">Debug Mode</span>
                    <span className={`text-[10px] font-semibold ${isDebugMode ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {isDebugMode ? 'Active / Logging' : 'Disabled'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDebugMode(!isDebugMode)}
                    aria-label="Toggle Debug Mode"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isDebugMode ? 'bg-indigo-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isDebugMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Status Alert Banner */}
              {isDebugMode ? (
                <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/60 text-indigo-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span>
                      <strong>Verbose Logging Enabled:</strong> The Import engine will record all parsing steps, column matching scores, record normalizations, and reconciliation decisions.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateTestLogs}
                    className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded-lg text-[11px] font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-300" />
                    <span>Generate Test Log</span>
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                    <span>
                      Debug mode is currently disabled. Toggle it ON above to capture detailed execution telemetry during spreadsheet/CSV imports.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDebugMode(true)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition-colors shrink-0 cursor-pointer"
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

        {/* 2nd Step Confirmation Modal: Clear Account Transactions */}
        {isClearAccConfirmOpen && (() => {
          const targetAcc = budget.accounts.find(a => a.id === clearAccId);
          const txnCount = (budget.transactions || []).filter(t => t.accountId === clearAccId).length;

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
              <div className="bg-slate-900 border border-amber-800/80 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-2.5 text-amber-400">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <h3 className="text-sm font-bold text-slate-100">
                    Confirm Account Transaction Purge
                  </h3>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200/90 space-y-2">
                  <p>
                    You are about to permanently remove all recorded transactions and reset ledger data for:
                  </p>
                  <p className="font-bold text-white text-sm">
                    {targetAcc?.name || 'Selected Account'}
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1 pt-1">
                    <li><strong>{txnCount}</strong> transaction records will be permanently deleted</li>
                    <li>All daily ledger manual edits & matrix actuals will be cleared</li>
                    <li>Opening starting balance will be reset to <strong>$0.00</strong></li>
                    <li>The account profile and recurring bills will remain safe</li>
                  </ul>
                </div>

                <p className="text-[11px] text-slate-400 italic">
                  Are you sure you want to proceed with this 2nd confirmation?
                </p>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsClearAccConfirmOpen(false)}
                    className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await clearAccountTransactions(clearAccId);
                      setIsClearAccConfirmOpen(false);
                      setClearAccStatus(`Cleared all transactions for ${targetAcc?.name || 'account'}.`);
                      setTimeout(() => setClearAccStatus(null), 4000);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Purge All Transactions</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
