// @ts-nocheck
import React, { useState } from 'react';
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
  ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../utils/spreadsheetParser';
import { MONTH_SHORT_NAMES, getBillDueMonths, formatBillDueMonths, getAccountSaveExtraPersonPortion } from '../utils/paydayUtils';
import { NoYearCalendarPicker } from './NoYearCalendarPicker';
import { useAuth } from '../context/AuthContext';
import { PRESET_SECURITY_QUESTIONS } from './AuthModal';

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
    loadDemoPreset,
    importBudgetJson,
    importParsedSpreadsheet
  } = useBudget();

  // Local form state for new item creation
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [isAddBillModalOpen, setIsAddBillModalOpen] = useState(false);
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'checking', startingBalance: 0, balanceAsOfDate: new Date().toISOString().split('T')[0], saveExtraMonthly: 0, extraStartingBalance: 0, enableExtraSavings: true, color: 'blue', notes: '' });
  const [newPersonForm, setNewPersonForm] = useState({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
  const [newBillForm, setNewBillForm] = useState({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', notes: '' });
  const [billFilterTab, setBillFilterTab] = useState('active'); // 'active' | 'archived'
  const [jsonInput, setJsonInput] = useState('');
  const [jsonStatus, setJsonStatus] = useState(null);
  const [spreadsheetPreview, setSpreadsheetPreview] = useState(null);
  const [spreadsheetMode, setSpreadsheetMode] = useState('replace'); // 'replace' | 'merge'
  const [spreadsheetFileName, setSpreadsheetFileName] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState(false);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);

  // Granular import selection state
  const [selectedImportAccounts, setSelectedImportAccounts] = useState(new Set());
  const [selectedImportPeople, setSelectedImportPeople] = useState(new Set());
  const [selectedImportBills, setSelectedImportBills] = useState(new Set());
  const [selectedImportLoans, setSelectedImportLoans] = useState(new Set());

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSpreadsheetFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      const arrayBuffer = evt.target.result;
      const res = parseSpreadsheet(arrayBuffer, file.name);
      if (res.success && res.budget) {
        setSpreadsheetPreview(res.budget);
        setSelectedImportAccounts(new Set(res.budget.accounts.map(a => a.id)));
        setSelectedImportPeople(new Set(res.budget.people.map(p => p.id)));
        setSelectedImportBills(new Set(res.budget.bills.map(b => b.id)));
        setSelectedImportLoans(new Set(res.budget.loans.map(l => l.id)));
        setJsonStatus({ type: 'success', message: `Parsed ${file.name} successfully! Select items to import below.` });
      } else {
        setJsonStatus({ type: 'error', message: res.error });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleApplySpreadsheet = () => {
    if (!spreadsheetPreview) return;

    const filteredBudget = {
      accounts: spreadsheetPreview.accounts.filter(a => selectedImportAccounts.has(a.id)),
      people: spreadsheetPreview.people.filter(p => selectedImportPeople.has(p.id)),
      bills: spreadsheetPreview.bills.filter(b => selectedImportBills.has(b.id)),
      loans: spreadsheetPreview.loans.filter(l => selectedImportLoans.has(l.id))
    };

    const res = importParsedSpreadsheet(filteredBudget, spreadsheetMode);
    if (res.success) {
      setJsonStatus({
        type: 'success',
        message: `Successfully imported ${filteredBudget.accounts.length} accounts, ${filteredBudget.people.length} earners, and ${filteredBudget.bills.length} bills!`
      });
      setSpreadsheetPreview(null);
      setSpreadsheetFileName('');
    } else {
      setJsonStatus({ type: 'error', message: res.error });
    }
  };

  const toggleAccountSelection = (id) => {
    setSelectedImportAccounts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllAccounts = (selectAll) => {
    if (selectAll && spreadsheetPreview) {
      setSelectedImportAccounts(new Set(spreadsheetPreview.accounts.map(a => a.id)));
    } else {
      setSelectedImportAccounts(new Set());
    }
  };

  const toggleBillSelection = (id) => {
    setSelectedImportBills(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllBills = (selectAll) => {
    if (selectAll && spreadsheetPreview) {
      setSelectedImportBills(new Set(spreadsheetPreview.bills.map(b => b.id)));
    } else {
      setSelectedImportBills(new Set());
    }
  };

  const togglePersonSelection = (id) => {
    setSelectedImportPeople(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllPeople = (selectAll) => {
    if (selectAll && spreadsheetPreview) {
      setSelectedImportPeople(new Set(spreadsheetPreview.people.map(p => p.id)));
    } else {
      setSelectedImportPeople(new Set());
    }
  };

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

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', label: 'Accounts', icon: CreditCard, count: budget.accounts.length },
    { id: 'people', label: 'People', icon: Users, count: budget.people.length },
    { id: 'bills', label: 'Bills', icon: Receipt, count: budget.bills.length },
    { id: 'splits', label: 'Splits', icon: PieChart },
    { id: 'security', label: 'Security & Profile', icon: ShieldCheck },
    { id: 'import', label: 'Import', icon: Upload },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'reset', label: 'Reset', icon: RotateCcw }
  ];

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
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-fade-in w-screen h-screen overflow-hidden text-slate-100">
      <div className="bg-slate-900 w-full h-full flex flex-col overflow-hidden">
        
        {/* Compact Single-Row Header Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
              <Receipt className="w-4 h-4" />
            </span>
            <span className="font-bold text-xs sm:text-sm text-slate-100 hidden md:inline">Settings &amp; Setup</span>
          </div>

          {/* Compact Navigation Tab Pills */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar scrollbar-none flex-1 justify-center max-w-4xl">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = settingsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold rounded-lg transition-all flex-shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
                      isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex-shrink-0"
            title="Close Settings (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Contents Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-5 bg-slate-950/20">

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

          {/* TAB 1: ACCOUNTS */}
          {settingsTab === 'accounts' && (
            <div className="space-y-6">
              {/* Header & Add Account Button */}
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
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Account
                </button>
              </div>

              {/* Pop-up Modal: Add New Account */}
              {isAddAccountModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
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

                      <div className="grid grid-cols-2 gap-3">
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

              {/* Accounts List */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Active Accounts ({budget.accounts.length})</h3>
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
                          <label className="text-slate-500 block font-medium">Account Type</label>
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
                          <label className="text-slate-500 block font-medium">Starting Balance ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={acc.startingBalance}
                            onChange={e => updateAccount(acc.id, { startingBalance: parseFloat(e.target.value) || 0 })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-mono w-full focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-amber-300 font-semibold block">As Of Date</label>
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

                          {/* Save Extra Earner Split Breakdown & % / $ Validation */}
                          {acc.saveExtraMonthly > 0 && (budget.people || []).length > 0 && (() => {
                            const people = budget.people || [];
                            const splitType = acc.saveExtraSplitType || 'percentage'; // 'percentage' | 'amount'
                            const isMultiPerson = people.length > 1;

                            // Compute current split values
                            const currentSplits = acc.saveExtraSplits || {};
                            
                            // Calculate total split allocated
                            let totalAllocated = 0;
                            people.forEach(p => {
                              if (currentSplits[p.id] !== undefined) {
                                totalAllocated += parseFloat(currentSplits[p.id]) || 0;
                              } else {
                                if (splitType === 'percentage') {
                                  totalAllocated += 100 / people.length;
                                } else {
                                  totalAllocated += acc.saveExtraMonthly / people.length;
                                }
                              }
                            });

                            const isValid = splitType === 'percentage'
                              ? Math.abs(totalAllocated - 100) < 0.1
                              : Math.abs(totalAllocated - acc.saveExtraMonthly) < 0.05;

                            return (
                              <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                                {/* Header & Mode Switcher */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-indigo-300">Earner Extra Savings Split:</span>
                                    {isValid ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {splitType === 'percentage' ? '100% Valid' : `$${totalAllocated.toFixed(2)} Valid`}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800 animate-pulse">
                                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                                        {splitType === 'percentage' ? `${totalAllocated.toFixed(1)}% (Must equal 100%)` : `$${totalAllocated.toFixed(2)} (Must equal $${acc.saveExtraMonthly.toFixed(2)})`}
                                      </span>
                                    )}
                                  </div>

                                  {/* % vs $ Toggle */}
                                  {isMultiPerson && (
                                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newSplits = {};
                                          people.forEach(p => {
                                            newSplits[p.id] = Math.round((100 / people.length) * 10) / 10;
                                          });
                                          updateAccount(acc.id, { saveExtraSplitType: 'percentage', saveExtraSplits: newSplits });
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                                          splitType === 'percentage'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        % Percentage
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newSplits = {};
                                          people.forEach(p => {
                                            newSplits[p.id] = Math.round((acc.saveExtraMonthly / people.length) * 100) / 100;
                                          });
                                          updateAccount(acc.id, { saveExtraSplitType: 'amount', saveExtraSplits: newSplits });
                                        }}
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${
                                          splitType === 'amount'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        $ Amount
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Quick Presets for Multi-Person */}
                                {isMultiPerson && (
                                  <div className="flex items-center justify-end gap-1.5 text-[10px]">
                                    <span className="text-slate-500">Presets:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newSplits = {};
                                        people.forEach(p => {
                                          newSplits[p.id] = splitType === 'percentage'
                                            ? Math.round((100 / people.length) * 10) / 10
                                            : Math.round((acc.saveExtraMonthly / people.length) * 100) / 100;
                                        });
                                        updateAccount(acc.id, { saveExtraSplits: newSplits });
                                      }}
                                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                                    >
                                      Equal Split
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const totalNet = people.reduce((sum, p) => {
                                          const net = parseFloat(p.netPerPay) || 0;
                                          const freq = p.payFrequency || 'bi-weekly';
                                          const mNet = freq === 'bi-weekly' ? (net * 26) / 12 : freq === 'weekly' ? (net * 52) / 12 : net * 2;
                                          return sum + mNet;
                                        }, 0);

                                        const newSplits = {};
                                        people.forEach(p => {
                                          const net = parseFloat(p.netPerPay) || 0;
                                          const freq = p.payFrequency || 'bi-weekly';
                                          const mNet = freq === 'bi-weekly' ? (net * 26) / 12 : freq === 'weekly' ? (net * 52) / 12 : net * 2;
                                          const ratio = totalNet > 0 ? mNet / totalNet : 1 / people.length;

                                          newSplits[p.id] = splitType === 'percentage'
                                            ? Math.round(ratio * 1000) / 10
                                            : Math.round((acc.saveExtraMonthly * ratio) * 100) / 100;
                                        });
                                        updateAccount(acc.id, { saveExtraSplits: newSplits });
                                      }}
                                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                                    >
                                      Income Ratio
                                    </button>
                                  </div>
                                )}

                                {/* Per-Earner Editable Input Fields */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {people.map(p => {
                                    const monthlyPortion = getAccountSaveExtraPersonPortion(acc, p, budget);
                                    const paycheckPortion = (p.payFrequency === 'bi-weekly' || p.payFrequency === 'semi-monthly')
                                      ? monthlyPortion / 2
                                      : p.payFrequency === 'weekly'
                                        ? (monthlyPortion * 12) / 52
                                        : monthlyPortion;

                                    const defaultVal = splitType === 'percentage'
                                      ? Math.round((100 / people.length) * 10) / 10
                                      : Math.round((acc.saveExtraMonthly / people.length) * 100) / 100;

                                    const currentVal = currentSplits[p.id] !== undefined ? currentSplits[p.id] : defaultVal;

                                    return (
                                      <div key={p.id} className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <span className="text-xs font-bold text-slate-200 block truncate">{p.name}</span>
                                          <span className="text-[10px] text-indigo-300 font-mono font-semibold">
                                            ${monthlyPortion.toFixed(2)}/mo
                                          </span>
                                        </div>

                                        {/* Editable Input for % or $ */}
                                        {isMultiPerson ? (
                                          <div className="flex items-center gap-1">
                                            {splitType === 'amount' && <span className="text-xs text-slate-400 font-mono">$</span>}
                                            <input
                                              type="number"
                                              step={splitType === 'percentage' ? '1' : '5'}
                                              min="0"
                                              max={splitType === 'percentage' ? '100' : acc.saveExtraMonthly}
                                              value={currentVal}
                                              onChange={e => {
                                                const val = parseFloat(e.target.value) || 0;
                                                const updated = { ...currentSplits, [p.id]: val };
                                                updateAccount(acc.id, { saveExtraSplits: updated });
                                              }}
                                              className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-bold font-mono text-emerald-400 text-center focus:outline-none focus:border-blue-500"
                                            />
                                            {splitType === 'percentage' && <span className="text-xs text-slate-400">%</span>}
                                          </div>
                                        ) : (
                                          <div className="text-right">
                                            <span className="text-emerald-400 font-mono font-bold text-xs block">
                                              ${paycheckPortion.toFixed(2)}
                                            </span>
                                            <span className="text-[9px] text-slate-500 font-sans uppercase">
                                              / {p.payFrequency === 'bi-weekly' ? 'check' : p.payFrequency === 'weekly' ? 'wk' : 'check'}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PEOPLE & INCOME */}
          {settingsTab === 'people' && (
            <div className="space-y-6">
              {/* Header & Add Member Button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    Household Members & Earners ({budget.people.length})
                  </h3>
                  <p className="text-xs text-slate-400">Configure household members, pay frequencies, and income</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddPersonModalOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Member
                </button>
              </div>

              {/* Pop-up Modal: Add New Person */}
              {isAddPersonModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
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
                          {person.payOffsetDays ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                              {person.payOffsetDays}d Early Deposit
                            </span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => deletePerson(person.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          <div>
                            <label className="text-slate-500 font-medium">Pay Frequency</label>
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
                            <label className="text-slate-500 font-medium">Gross Per Pay ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={person.grossPerPay}
                              onChange={e => updatePerson(person.id, { grossPerPay: parseFloat(e.target.value) || 0 })}
                              className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono w-full focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-slate-500 font-medium">Net Per Pay ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={person.netPerPay}
                              onChange={e => updatePerson(person.id, { netPerPay: parseFloat(e.target.value) || 0 })}
                              className="mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-emerald-400 font-bold font-mono w-full focus:outline-none focus:border-purple-500"
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

          {/* TAB 3: BILLS & ACCOUNT ASSIGNMENTS */}
          {settingsTab === 'bills' && (
            <div className="space-y-4">
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
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
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
                {budget.accounts.map(account => {
                  const accountBills = budget.bills.filter(b => 
                    b.accountId === account.id && (billFilterTab === 'archived' ? b.isArchived : !b.isArchived)
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
            </div>
          )}

          {/* TAB 4: BILL SPLITTING MATRIX */}
          {settingsTab === 'splits' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-center justify-between">
                <div>
                  <span className="font-semibold">Dynamic Household Bill Split Engine:</span> Define what percentage of each bill is split between members.
                </div>
              </div>

              {/* Bills Split Matrix Grouped by Assigned Account */}
              <div className="space-y-6">
                {budget.accounts.map(account => {
                  const accountBills = budget.bills.filter(b => b.accountId === account.id);
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

          {/* TAB 5: IMPORT */}
          {settingsTab === 'import' && (
            <div className="space-y-6">
              
              {/* Excel (.xlsx / .csv) Spreadsheet Importer Card */}
              <div className="p-5 rounded-xl glass-card border border-emerald-800/60 bg-emerald-950/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    Import Excel (.xlsx) or CSV Spreadsheet
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-800">
                    100% Client-Side Local Parser
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Select or drag &amp; drop your budget spreadsheet (e.g. <code>Personal Budget.xlsx</code> or custom CSV). The parser automatically extracts Accounts, Income/Contributors, Bills, and Loan schedules directly in your browser.
                </p>

                {/* Dropzone File Input */}
                <div className="relative border-2 border-dashed border-emerald-600/50 hover:border-emerald-400 rounded-xl p-6 text-center transition-colors bg-slate-900/60">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Upload className="w-8 h-8 text-emerald-400 animate-bounce" />
                    <div className="text-xs font-bold text-slate-200">
                      {spreadsheetFileName ? (
                        <span className="text-emerald-400 font-mono">Selected: {spreadsheetFileName}</span>
                      ) : (
                        <span>Click to choose or drop <strong>.xlsx / .csv</strong> file here</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">Supports multi-tab workbooks &amp; standard register formats</span>
                  </div>
                </div>

                {/* Live Granular Item Selection Checklist */}
                {spreadsheetPreview && (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-4 animate-fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Select Items to Import from {spreadsheetFileName}
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Uncheck any items you do not wish to import into your budget.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="text-slate-400 font-medium">Mode:</label>
                        <select
                          value={spreadsheetMode}
                          onChange={e => setSpreadsheetMode(e.target.value)}
                          className="bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-2.5 py-1 font-bold text-xs focus:outline-none focus:border-emerald-500"
                        >
                          <option value="replace">Replace Current Budget</option>
                          <option value="merge">Merge with Existing</option>
                        </select>
                      </div>
                    </div>

                    {/* Category Selection Summary Tabs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium">Accounts Selected</span>
                        <span className="font-bold text-blue-400">{selectedImportAccounts.size} / {spreadsheetPreview.accounts.length}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-400 text-[11px] font-medium">Earners Selected</span>
                        <span className="font-bold text-purple-400">{selectedImportPeople.size} / {spreadsheetPreview.people.length}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between col-span-2 sm:col-span-1">
                        <span className="text-slate-400 text-[11px] font-medium">Bills Selected</span>
                        <span className="font-bold text-emerald-400">{selectedImportBills.size} / {spreadsheetPreview.bills.length}</span>
                      </div>
                    </div>

                    {/* SECTION 1: ACCOUNTS CHECKLIST */}
                    {spreadsheetPreview.accounts.length > 0 && (
                      <div className="space-y-2 border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-blue-300">
                            Bank Accounts ({selectedImportAccounts.size} of {spreadsheetPreview.accounts.length})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAllAccounts(true)}
                              className="text-[10px] text-blue-400 hover:underline cursor-pointer font-medium"
                            >
                              Select All
                            </button>
                            <span className="text-slate-600 text-[10px]">|</span>
                            <button
                              type="button"
                              onClick={() => toggleAllAccounts(false)}
                              className="text-[10px] text-slate-400 hover:underline cursor-pointer font-medium"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {spreadsheetPreview.accounts.map(acc => {
                            const isChecked = selectedImportAccounts.has(acc.id);
                            return (
                              <label
                                key={acc.id}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                                  isChecked
                                    ? 'bg-blue-950/40 border-blue-800/60 text-slate-200'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleAccountSelection(acc.id)}
                                    className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0 cursor-pointer"
                                  />
                                  <span className="font-semibold">{acc.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 capitalize text-slate-400">{acc.type}</span>
                                </div>
                                <span className="font-mono text-xs font-bold text-blue-300">${acc.startingBalance.toFixed(2)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SECTION 2: EARNERS / PEOPLE CHECKLIST */}
                    {spreadsheetPreview.people.length > 0 && (
                      <div className="space-y-2 border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-300">
                            Household Earners ({selectedImportPeople.size} of {spreadsheetPreview.people.length})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAllPeople(true)}
                              className="text-[10px] text-purple-400 hover:underline cursor-pointer font-medium"
                            >
                              Select All
                            </button>
                            <span className="text-slate-600 text-[10px]">|</span>
                            <button
                              type="button"
                              onClick={() => toggleAllPeople(false)}
                              className="text-[10px] text-slate-400 hover:underline cursor-pointer font-medium"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {spreadsheetPreview.people.map(person => {
                            const isChecked = selectedImportPeople.has(person.id);
                            return (
                              <label
                                key={person.id}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                                  isChecked
                                    ? 'bg-purple-950/40 border-purple-800/60 text-slate-200'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePersonSelection(person.id)}
                                    className="rounded border-slate-700 bg-slate-900 text-purple-500 focus:ring-0 cursor-pointer"
                                  />
                                  <span className="font-semibold">{person.name}</span>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">{person.role}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* SECTION 3: RECURRING BILLS CHECKLIST */}
                    {spreadsheetPreview.bills.length > 0 && (
                      <div className="space-y-2 border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-300">
                            Recurring Bills ({selectedImportBills.size} of {spreadsheetPreview.bills.length})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleAllBills(true)}
                              className="text-[10px] text-emerald-400 hover:underline cursor-pointer font-medium"
                            >
                              Select All
                            </button>
                            <span className="text-slate-600 text-[10px]">|</span>
                            <button
                              type="button"
                              onClick={() => toggleAllBills(false)}
                              className="text-[10px] text-slate-400 hover:underline cursor-pointer font-medium"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                          {spreadsheetPreview.bills.map(bill => {
                            const isChecked = selectedImportBills.has(bill.id);
                            const acc = spreadsheetPreview.accounts.find(a => a.id === bill.accountId);
                            return (
                              <label
                                key={bill.id}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                                  isChecked
                                    ? 'bg-emerald-950/30 border-emerald-800/60 text-slate-200'
                                    : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleBillSelection(bill.id)}
                                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 cursor-pointer shrink-0"
                                  />
                                  <span className="font-semibold truncate">{bill.name}</span>
                                  {acc && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 truncate shrink-0 max-w-[120px]">
                                      {acc.name}
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-xs font-bold text-emerald-300 shrink-0 font-mono">${bill.amount.toFixed(2)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setSpreadsheetPreview(null)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplySpreadsheet}
                        disabled={selectedImportAccounts.size === 0 && selectedImportPeople.size === 0 && selectedImportBills.size === 0}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Import Selected Items ({selectedImportAccounts.size + selectedImportPeople.size + selectedImportBills.size})</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* JSON Import Card */}
              <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">Import Custom JSON Budget Configuration</h3>
                <textarea
                  rows={4}
                  placeholder="Paste JSON budget configuration here..."
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleImportJson}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Load JSON Configuration
                  </button>
                  {jsonStatus && (
                    <span className={`text-xs ${jsonStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {jsonStatus.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Clear Budget Card */}
              <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 space-y-3">
                <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Reset Budget Data to Cleared Defaults
                </h3>
                <p className="text-xs text-amber-200/80">
                  Clears all accounts, members, bills, loans, and register entries to a clean slate.
                </p>
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear all budget data?')) {
                      resetToDefaults();
                      setJsonStatus({ type: 'success', message: 'Cleared all budget data.' });
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Clear All Budget Data
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: EXPORT */}
          {settingsTab === 'export' && (
            <div className="space-y-6">
              
              {/* Export to Excel Workbook Card */}
              <div className="p-5 rounded-xl glass-card border border-blue-800/60 bg-blue-950/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-300 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                    Export Active Budget to Excel (.xlsx) Workbook
                  </h3>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-950 px-2.5 py-1 rounded-full border border-blue-800">
                    Multi-Tab Excel Format
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Downloads a structured Excel workbook with dedicated sheets for Accounts, People &amp; Income, Bills, and Loans. Compatible with Microsoft Excel, Google Sheets, and Apple Numbers.
                </p>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-slate-400 font-mono">
                    Includes {budget.accounts.length} accounts, {budget.bills.length} bills, {budget.people.length} earners
                  </div>
                  <button
                    onClick={handleExportExcel}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Excel Workbook (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Export to JSON Backup Card */}
              <div className="p-5 rounded-xl glass-card border border-purple-800/60 bg-purple-950/10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-purple-400" />
                    Download Complete JSON Backup File
                  </h3>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-950 px-2.5 py-1 rounded-full border border-purple-800">
                    Full Snapshot Backup
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Generates a full JSON backup file containing all configuration settings, line item registers, custom splits, and loan schedules. Perfect for restoring or transferring to another device.
                </p>

                <div className="flex items-center justify-between pt-2">
                  {jsonStatus && (
                    <span className={`text-xs ${jsonStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {jsonStatus.message}
                    </span>
                  )}
                  <button
                    onClick={handleExportJson}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer ml-auto"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download JSON Backup File</span>
                  </button>
                </div>
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

          {/* TAB 7: RESET DATA */}
          {settingsTab === 'reset' && (
            <div className="space-y-6">
              
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

        </div>

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
