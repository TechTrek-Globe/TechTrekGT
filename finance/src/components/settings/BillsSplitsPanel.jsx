// @ts-nocheck
import React, { useState, useRef } from 'react';
import { useBudgetMetadata } from '../../context/BudgetContext';
import { 
  Plus, 
  Trash2, 
  Archive, 
  RotateCcw, 
  Receipt, 
  PieChart, 
  Filter, 
  X, 
  Calendar 
} from 'lucide-react';
import { MONTH_SHORT_NAMES, getBillDueMonths, formatBillDueMonths } from '../../utils/paydayUtils';
import { NoYearCalendarPicker } from '../NoYearCalendarPicker';

export function BillsSplitsPanel() {
  const {
    budget,
    addBill,
    updateBill,
    deleteBill,
    archiveBill,
    unarchiveBill,
    updateBillSplits,
    getBillMonthlyCost,
    getBillPersonMonthlyPortion
  } = useBudgetMetadata();

  const [billFilterTab, setBillFilterTab] = useState('active');
  const [selectedBillsAccountId, setSelectedBillsAccountId] = useState('all');
  const [isAddBillModalOpen, setIsAddBillModalOpen] = useState(false);
  const [calendarPickerBillId, setCalendarPickerBillId] = useState(null);

  const [newBillForm, setNewBillForm] = useState({
    name: '',
    amount: 0,
    period: 'Monthly',
    accountId: budget.accounts[0]?.id || '',
    dueDay: 1,
    dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    paymentSource: 'Auto Pay',
    matchingKey: '',
    bankMatchNames: '',
    notes: ''
  });

  const addBillModalRef = useRef(null);

  const filteredBills = budget.bills.filter(bill => {
    if (billFilterTab === 'active' && bill.isArchived) return false;
    if (billFilterTab === 'archived' && !bill.isArchived) return false;
    if (selectedBillsAccountId !== 'all' && bill.accountId !== selectedBillsAccountId) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
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
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm text-xs">
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
          <span>Add Bill</span>
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
                Add New Bill &amp; Assign to Account
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
              setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', matchingKey: '', bankMatchNames: '', notes: '' });
              setIsAddBillModalOpen(false);
            }} className="space-y-4 pb-4">
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
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {mName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Due Day of Month</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={newBillForm.dueDay}
                    onChange={e => setNewBillForm({ ...newBillForm, dueDay: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Payment Source</label>
                  <select
                    value={newBillForm.paymentSource}
                    onChange={e => setNewBillForm({ ...newBillForm, paymentSource: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Auto Pay">Auto Pay</option>
                    <option value="Manual">Manual</option>
                    <option value="Direct Debit">Direct Debit</option>
                    <option value="Credit Card">Credit Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Account *</label>
                <select
                  value={newBillForm.accountId}
                  onChange={e => setNewBillForm({ ...newBillForm, accountId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {budget.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">Bank Match Names (Statement Aliases)</label>
                  <span className="text-[10px] text-blue-400 font-mono">Statement auto-match</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. COMCAST, XFINITY, 800-COMCAST"
                  value={newBillForm.bankMatchNames ?? newBillForm.matchingKey ?? ''}
                  onChange={e => setNewBillForm({ ...newBillForm, matchingKey: e.target.value, bankMatchNames: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Comma-separated keywords or statement descriptors. The importer matches these before using heuristics.
                </p>
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
                  Create Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Density Bills Table */}
      <div className="overflow-x-auto matrix-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
            <tr>
              <th className="px-3 py-2 w-[22%]">Bill Name</th>
              <th className="px-2 py-2 w-[12%]">Amount</th>
              <th className="px-2 py-2 w-[16%]">Due Day / Frequency</th>
              <th className="px-2 py-2 w-[18%]">Payment Source &amp; Account</th>
              <th className="px-2 py-2 w-[24%]">Earner Split (%)</th>
              <th className="px-3 py-2 w-[8%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredBills.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-500 italic text-xs">
                  No {billFilterTab} bills found matching this filter.
                </td>
              </tr>
            ) : (
              filteredBills.map(bill => {
                const acc = budget.accounts.find(a => a.id === bill.accountId);
                const monthlyCost = getBillMonthlyCost(bill);
                const isNonMonthly = bill.period && bill.period !== 'Monthly';

                return (
                  <tr key={bill.id} className="hover:bg-slate-900/50 transition-colors">
                    {/* Bill Name & Bank Match Names */}
                    <td className="px-3 py-1.5 font-bold text-slate-200">
                      <input
                        type="text"
                        value={bill.name}
                        onChange={e => updateBill(bill.id, { name: e.target.value })}
                        className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none w-full text-xs font-bold text-slate-100"
                        placeholder="Bill Name"
                      />
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[9px] font-mono text-slate-500 uppercase shrink-0 font-semibold" title="Bank Statement Match Names">
                          Aliases:
                        </span>
                        <input
                          type="text"
                          value={bill.bankMatchNames ?? bill.matchingKey ?? ''}
                          onChange={e => updateBill(bill.id, { matchingKey: e.target.value, bankMatchNames: e.target.value })}
                          className="w-full bg-slate-900/90 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded px-1.5 py-0.5 text-[10px] font-mono text-blue-300 focus:outline-none placeholder:text-slate-600 placeholder:italic"
                          placeholder="e.g. COMCAST, XFINITY"
                          title="Bank statement match names/aliases (comma-separated)"
                        />
                      </div>
                    </td>

                    {/* Amount & Monthly Equiv */}
                    <td className="px-2 py-1.5 font-mono">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={bill.amount}
                          onChange={e => updateBill(bill.id, { amount: parseFloat(e.target.value) || 0 })}
                          className="w-20 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      {isNonMonthly && (
                        <span className="text-[10px] text-slate-500 block font-sans">
                          ~${monthlyCost.toFixed(2)}/mo
                        </span>
                      )}
                    </td>

                    {/* Due Date & Popover */}
                    <td className="px-2 py-1.5 relative">
                      <button
                        type="button"
                        onClick={() => setCalendarPickerBillId(calendarPickerBillId === bill.id ? null : bill.id)}
                        className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs transition-colors cursor-pointer w-full text-left"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{formatBillDueMonths(bill)}</span>
                      </button>

                      {calendarPickerBillId === bill.id && (
                        <div className="absolute top-full left-0 mt-1 z-50 animate-fade-in shadow-2xl">
                          <NoYearCalendarPicker
                            dueDay={bill.dueDay || 1}
                            period={bill.period || 'Monthly'}
                            dueMonths={getBillDueMonths(bill)}
                            onChange={({ dueDay, period, dueMonths }) => {
                              updateBill(bill.id, { dueDay, period, dueMonths });
                            }}
                            onClose={() => setCalendarPickerBillId(null)}
                          />
                        </div>
                      )}
                    </td>

                    {/* Payment Account */}
                    <td className="px-2 py-1.5">
                      <select
                        value={bill.accountId || ''}
                        onChange={e => updateBill(bill.id, { accountId: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                      >
                        {budget.accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Split Sliders - Active Earners Only */}
                    <td className="px-2 py-1.5">
                      {(() => {
                        const acc = budget.accounts.find(a => a.id === bill.accountId);
                        const allEnabledIds = acc?.enabledEarners && Array.isArray(acc.enabledEarners) && acc.enabledEarners.length > 0
                          ? acc.enabledEarners
                          : budget.people.map(p => p.id);

                        // Active earners = enabled, non-credit people for this account
                        const activeEarners = budget.people.filter(p =>
                          allEnabledIds.includes(p.id) &&
                          !p.name.toLowerCase().includes('credit') &&
                          p.role !== 'Credit'
                        );
                        const inactiveEarners = budget.people.filter(p => !activeEarners.some(a => a.id === p.id));

                        // Get current splits, defaulting inactive to 0
                        const currentSplits = {};
                        budget.people.forEach(p => {
                          currentSplits[p.id] = bill.splits?.[p.id] !== undefined
                            ? parseFloat(bill.splits[p.id])
                            : 0;
                        });
                        // Force inactive earners to 0
                        inactiveEarners.forEach(p => { currentSplits[p.id] = 0; });

                        const activeTotal = activeEarners.reduce((s, p) => s + (currentSplits[p.id] || 0), 0);
                        const totalIsOff = Math.abs(activeTotal - 100) > 0.5;

                        const handleSplitChange = (personId, rawVal) => {
                          const num = Math.max(0, Math.min(100, parseFloat(rawVal.replace(/[^0-9.]/g, '')) || 0));
                          const nextSplits = { ...currentSplits };
                          nextSplits[personId] = num;
                          // Force inactive to 0
                          inactiveEarners.forEach(p => { nextSplits[p.id] = 0; });
                          // Auto-balance second earner when only 2 active
                          if (activeEarners.length === 2) {
                            const other = activeEarners.find(p => p.id !== personId);
                            if (other) nextSplits[other.id] = Math.round(Math.max(0, 100 - num) * 100) / 100;
                          }
                          updateBillSplits(bill.id, nextSplits);
                        };

                        return (
                          <div className="flex items-center gap-1.5 flex-wrap py-0.5">
                            {/* Active earners with editable split */}
                            {activeEarners.map(person => (
                              <div key={person.id} className="inline-flex items-center gap-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 text-[11px]">
                                <span className="text-slate-300 font-semibold">{person.name.split(' ')[0]}:</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={currentSplits[person.id] ?? 0}
                                  onChange={e => handleSplitChange(person.id, e.target.value)}
                                  className="w-8 text-center font-mono font-bold text-blue-400 bg-slate-950 rounded px-1 py-0 border border-slate-700 focus:border-blue-500 focus:outline-none text-[11px]"
                                />
                                <span className="text-slate-500 text-[10px]">%</span>
                              </div>
                            ))}
                            {/* Inactive/disabled earners shown at 0% greyed out */}
                            {inactiveEarners.map(person => (
                              <div key={person.id} className="inline-flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[11px] opacity-40" title={`${person.name.split(' ')[0]} is not an active earner on this account`}>
                                <span className="text-slate-600 font-semibold">{person.name.split(' ')[0]}:</span>
                                <span className="font-mono font-bold text-slate-600 w-8 text-center">0</span>
                                <span className="text-slate-600 text-[10px]">%</span>
                              </div>
                            ))}
                            {/* Total badge */}
                            <div className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ml-0.5 ${
                              totalIsOff
                                ? 'bg-rose-950/60 border-rose-700 text-rose-300'
                                : 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                            }`}>
                              {Math.round(activeTotal * 10) / 10}%
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => bill.isArchived ? unarchiveBill(bill.id) : archiveBill(bill.id)}
                          className="p-1 text-slate-400 hover:text-amber-400 rounded transition-colors cursor-pointer"
                          title={bill.isArchived ? 'Unarchive Bill' : 'Archive Bill'}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBill(bill.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                          title="Delete Bill"
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
  );
}
