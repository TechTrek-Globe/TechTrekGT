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
  CheckCircle2,
  AlertTriangle,
  FileCode
} from 'lucide-react';

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
    updateBillSplits,
    resetToDefaults,
    importBudgetJson
  } = useBudget();

  // Local form state for new item creation
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'checking', startingBalance: 0, color: 'blue', notes: '' });
  const [newPersonForm, setNewPersonForm] = useState({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last' });
  const [newBillForm, setNewBillForm] = useState({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, paymentSource: 'Auto Pay', notes: '' });
  const [jsonInput, setJsonInput] = useState('');
  const [jsonStatus, setJsonStatus] = useState(null);

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'accounts', label: 'Accounts', icon: CreditCard, count: budget.accounts.length },
    { id: 'people', label: 'People & Income', icon: Users, count: budget.people.length },
    { id: 'bills', label: 'Bills & Assignments', icon: Receipt, count: budget.bills.length },
    { id: 'splits', label: 'Bill Splitting', icon: PieChart },
    { id: 'data', label: 'Backup & Presets', icon: FileCode }
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
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                className={`flex items-center space-x-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-300">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Contents Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/20">

          {/* TAB 1: ACCOUNTS */}
          {settingsTab === 'accounts' && (
            <div className="space-y-6">
              {/* Add Account Form */}
              <form onSubmit={handleAddAccount} className="p-4 rounded-xl glass-card border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-400" />
                  Add New Checking or Savings Account
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Account Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Chase Bills Checking"
                      value={newAccForm.name}
                      onChange={e => setNewAccForm({ ...newAccForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Type</label>
                    <select
                      value={newAccForm.type}
                      onChange={e => setNewAccForm({ ...newAccForm, type: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                      <option value="credit">Credit Card</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Starting Balance ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newAccForm.startingBalance}
                      onChange={e => setNewAccForm({ ...newAccForm, startingBalance: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-1.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add Account
                    </button>
                  </div>
                </div>
              </form>

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
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PEOPLE & INCOME */}
          {settingsTab === 'people' && (
            <div className="space-y-6">
              {/* Add Person Form */}
              <form onSubmit={handleAddPerson} className="p-4 rounded-xl glass-card border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  Add Household Member / Income Contributor
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Jon Kemp"
                      value={newPersonForm.name}
                      onChange={e => setNewPersonForm({ ...newPersonForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Pay Schedule</label>
                    <select
                      value={newPersonForm.payFrequency}
                      onChange={e => setNewPersonForm({ ...newPersonForm, payFrequency: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none"
                    >
                      <option value="bi-weekly">Bi-weekly (26/yr)</option>
                      <option value="monthly">Monthly (12/yr)</option>
                      <option value="weekly">Weekly (52/yr)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Net Pay Per Paycheck ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="2200.00"
                      value={newPersonForm.netPerPay}
                      onChange={e => setNewPersonForm({ ...newPersonForm, netPerPay: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-1.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add Member
                    </button>
                  </div>
                </div>
              </form>

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
              {/* Add Bill Form */}
              <form onSubmit={handleAddBill} className="p-4 rounded-xl glass-card border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Add New Bill & Assign to Account
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Bill Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Comcast Cable / Electric"
                      value={newBillForm.name}
                      onChange={e => setNewBillForm({ ...newBillForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="100.00"
                      value={newBillForm.amount}
                      onChange={e => setNewBillForm({ ...newBillForm, amount: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Assigned Account</label>
                    <select
                      value={newBillForm.accountId}
                      onChange={e => setNewBillForm({ ...newBillForm, accountId: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none"
                    >
                      {budget.accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add Bill
                    </button>
                  </div>
                </div>
              </form>

              {/* Bills List Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-medium">
                    <tr>
                      <th className="p-3">Bill Name</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Period</th>
                      <th className="p-3">Assigned Account</th>
                      <th className="p-3">Due Day</th>
                      <th className="p-3">Payment Source</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950/40">
                    {budget.bills.map(bill => (
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
                            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
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
                            className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-center"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={bill.paymentSource}
                            onChange={e => updateBill(bill.id, { paymentSource: e.target.value })}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 w-32"
                          />
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => deleteBill(bill.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-medium">
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
                    {budget.bills.map(bill => {
                      const totalPct = budget.people.reduce((sum, p) => sum + (parseFloat(bill.splits?.[p.id]) || 0), 0);
                      const isValid = Math.abs(totalPct - 100) < 0.1;

                      return (
                        <tr key={bill.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="p-3 font-semibold text-slate-200">{bill.name}</td>
                          <td className="p-3 font-mono">${bill.amount.toFixed(2)}</td>
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
                                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold text-center"
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
                              <span className="inline-flex items-center text-amber-400 gap-1 font-medium" title={`Total is ${totalPct}%`}>
                                <AlertTriangle className="w-4 h-4" /> {totalPct}%
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
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: BACKUP & PRESETS */}
          {settingsTab === 'data' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">Import Custom JSON Budget Configuration</h3>
                <textarea
                  rows={6}
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

              <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 space-y-3">
                <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Reset to Original Excel Spreadsheet Preset
                </h3>
                <p className="text-xs text-amber-200/80">
                  Resets accounts, Jon & Ronnie bi-weekly pay schedules, bills checking, mortgage checking, and HOA savings default amounts extracted from <code>Personal Budget.xlsx</code>.
                </p>
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to reset all budget data?')) {
                      resetToDefaults();
                      setJsonStatus({ type: 'success', message: 'Reset to Excel defaults.' });
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Restore Excel Defaults
                </button>
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
