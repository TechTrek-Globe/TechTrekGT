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
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../utils/spreadsheetParser';

export function SettingsModal() {
  const { 
    budget, 
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
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'checking', startingBalance: 0, color: 'blue', notes: '' });
  const [newPersonForm, setNewPersonForm] = useState({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last' });
  const [newBillForm, setNewBillForm] = useState({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, paymentSource: 'Auto Pay', notes: '' });
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

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'accounts', label: 'Accounts', icon: CreditCard, count: budget.accounts.length },
    { id: 'people', label: 'People', icon: Users, count: budget.people.length },
    { id: 'bills', label: 'Bills', icon: Receipt, count: budget.bills.length },
    { id: 'splits', label: 'Splits', icon: PieChart },
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
    setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, paymentSource: 'Auto Pay', notes: '' });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                <Receipt className="w-5 h-5" />
              </span>
              Dynamic Budget Settings
            </h2>
            <p className="text-xs text-slate-400">Configure accounts, income, bills, and household split ratios</p>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Navigation Tabs */}
        <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                className={`flex items-center justify-center space-x-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] rounded-full bg-slate-800 text-slate-300 font-mono">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Contents Area */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950/20">

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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
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
                      setNewAccForm({ name: '', type: 'checking', startingBalance: 0, saveExtraMonthly: 0, extraStartingBalance: 0, enableExtraSavings: true, color: 'blue', notes: '' });
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

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
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
                          <label className="block text-xs font-medium text-slate-400 mb-1">Extra Starting Balance ($)</label>
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
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="text-slate-500 block">Account Type</label>
                          <select
                            value={acc.type}
                            onChange={e => updateAccount(acc.id, { type: e.target.value })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-full"
                          >
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                            <option value="credit">Credit Card</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-500 block">Current Balance ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={acc.startingBalance}
                            onChange={e => updateAccount(acc.id, { startingBalance: parseFloat(e.target.value) || 0 })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-full"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-800/80">
                        <div>
                          <label className="text-indigo-300 font-medium block">Save Extra Target ($/mo)</label>
                          <input
                            type="number"
                            step="10"
                            value={acc.saveExtraMonthly || 0}
                            onChange={e => updateAccount(acc.id, { saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-emerald-400 font-mono font-bold w-full"
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 block">Extra Beg Balance ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={acc.extraStartingBalance || 0}
                            onChange={e => updateAccount(acc.id, { extraStartingBalance: parseFloat(e.target.value) || 0 })}
                            className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono w-full"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id={`chk-extra-${acc.id}`}
                          checked={acc.enableExtraSavings !== false}
                          onChange={e => updateAccount(acc.id, { enableExtraSavings: e.target.checked })}
                          className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                        />
                        <label htmlFor={`chk-extra-${acc.id}`} className="text-xs text-slate-400 cursor-pointer">
                          Track Extra Savings Bucket
                        </label>
                      </div>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
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
                      setNewPersonForm({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last' });
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
                {budget.people.map(person => (
                  <div key={person.id} className="p-4 rounded-xl glass-card border border-slate-800 space-y-3">
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="text-slate-500">Pay Frequency</label>
                        <select
                          value={person.payFrequency}
                          onChange={e => updatePerson(person.id, { payFrequency: e.target.value })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-full"
                        >
                          <option value="bi-weekly">Bi-weekly (26/yr)</option>
                          <option value="monthly">Monthly (12/yr)</option>
                          <option value="weekly">Weekly (52/yr)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-500">Gross Per Pay ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={person.grossPerPay}
                          onChange={e => updatePerson(person.id, { grossPerPay: parseFloat(e.target.value) || 0 })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-full"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500">Net Per Pay ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={person.netPerPay}
                          onChange={e => updatePerson(person.id, { netPerPay: parseFloat(e.target.value) || 0 })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-full"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500">Pay Day 1 / Date</label>
                        <input
                          type="text"
                          value={person.payDay1}
                          onChange={e => updatePerson(person.id, { payDay1: e.target.value })}
                          className="mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-full"
                          placeholder="e.g. 15th"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BILLS & ACCOUNT ASSIGNMENTS */}
          {settingsTab === 'bills' && (
            <div className="space-y-6">
              {/* Active / Archived Bills Filter Bar & Add Bill Button */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
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
                    }} className="space-y-4">
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
                            onChange={e => setNewBillForm({ ...newBillForm, period: e.target.value })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="Monthly">Monthly</option>
                            <option value="Semi-Annual">Semi-Annual</option>
                            <option value="Annual">Annual</option>
                          </select>
                        </div>
                      </div>

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
                          <label className="block text-xs font-medium text-slate-300 mb-1">Due Day (1-31)</label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            placeholder="15"
                            value={newBillForm.dueDay}
                            onChange={e => setNewBillForm({ ...newBillForm, dueDay: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-center focus:outline-none focus:border-emerald-500"
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
                          <thead className="sticky top-[37px] z-10 bg-slate-900 text-slate-400 uppercase font-medium text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="p-3 bg-slate-900">Bill Name</th>
                              <th className="p-3 bg-slate-900">Amount</th>
                              <th className="p-3 bg-slate-900">Period</th>
                              <th className="p-3 bg-slate-900">Assigned Account</th>
                              <th className="p-3 bg-slate-900">Due Day</th>
                              <th className="p-3 bg-slate-900">Payment Notes</th>
                              <th className="p-3 text-right bg-slate-900">Actions</th>
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
                                      onChange={e => updateBill(bill.id, { period: e.target.value })}
                                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                                    >
                                      <option value="Monthly">Monthly</option>
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
                                    <input
                                      type="number"
                                      min="1"
                                      max="31"
                                      value={bill.dueDay}
                                      onChange={e => updateBill(bill.id, { dueDay: parseInt(e.target.value) || 1 })}
                                      className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-center font-mono"
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
                          <thead className="sticky top-[37px] z-10 bg-slate-900 text-slate-400 uppercase font-medium text-[10px] border-b border-slate-800">
                            <tr>
                              <th className="p-3 bg-slate-900">Bill Name</th>
                              <th className="p-3 bg-slate-900">Monthly Cost</th>
                              {budget.people.map(p => (
                                <th key={p.id} className="p-3 text-center bg-slate-900">{p.name} Split (%)</th>
                              ))}
                              <th className="p-3 text-center bg-slate-900">Status</th>
                              <th className="p-3 text-right bg-slate-900">Quick Presets</th>
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
