import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useBudget } from '../context/BudgetContext';
import {
  ReceiptText,
  Pencil,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Wallet,
  Calendar,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Filter
} from 'lucide-react';
import { InlineEdit } from './InlineEdit';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// --- Shared sub-components ---

function MiniBar({ pct, overBudget }) {
  const clamped = Math.min(120, Math.max(0, pct));
  return (
    <div className="h-1 w-14 bg-slate-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${overBudget ? 'bg-rose-500' : 'bg-emerald-500'}`}
        style={{ width: `${Math.min(100, clamped)}%` }}
      />
    </div>
  );
}

function ActualCell({ bill, projected, actual, isEditing, editValue, onEdit, onCommit, onCancel, onChange }) {
  const isOverridden = actual !== projected;
  return isEditing ? (
    <div className="inline-flex items-center gap-1 editing-cell">
      <span className="text-slate-500 text-xs">$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={editValue}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); onCommit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="w-20 bg-slate-800 border border-emerald-500/70 rounded px-1.5 py-0.5 text-emerald-300 text-xs text-right font-mono focus:outline-none focus:border-emerald-400"
        autoFocus
      />
      <button onClick={onCommit} className="p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors" title="Commit (Enter)">
        <Check className="w-3 h-3" />
      </button>
      <button onClick={onCancel} className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors" title="Cancel (Esc)">
        <X className="w-3 h-3" />
      </button>
    </div>
  ) : (
    <button
      onClick={() => onEdit(bill.id, actual)}
      className="group/cell flex items-center gap-1.5 text-right w-full justify-end"
      title="Click to edit actual amount"
    >
      <span className={`font-mono text-xs ${isOverridden ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
        ${actual.toFixed(2)}
        {isOverridden && <span className="ml-1 text-[9px] text-blue-400 font-normal">(actual)</span>}
      </span>
      <Pencil className="w-2.5 h-2.5 text-slate-600 group-hover/cell:text-emerald-400 transition-colors opacity-0 group-hover/cell:opacity-100 flex-shrink-0" />
    </button>
  );
}

// --- Tab 1: Monthly Bill Ledger (inline editing) ---

function MonthlyLedger() {
  const {
    budget,
    upsertLineItem,
    getLineItem,
    getBillMonthlyCost,
    getTotalMonthlyExpenses,
    getTotalActualExpenses,
    getAccountActualExpenses,
    getAccountProjectedEndBalance,
    getAccountActualEndBalance,
    getBillPersonMonthlyPortion,
    updateBill,
  } = useBudget();

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear,  setSelectedYear]  = useState(today.getFullYear());
  const [editingCell,   setEditingCell]   = useState(null);
  const [editValue,     setEditValue]     = useState('');
  const [collapsedAccounts, setCollapsedAccounts] = useState({});

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const totalProjected = useMemo(() => getTotalMonthlyExpenses(), [budget.bills]);
  const totalActual    = useMemo(() => getTotalActualExpenses(monthKey), [budget.lineItems, budget.bills, monthKey]);
  const variance       = totalActual - totalProjected;

  const openEditor = useCallback((billId, currentActual) => {
    setEditingCell(billId);
    setEditValue(currentActual.toFixed(2));
  }, []);

  const commitEdit = useCallback((billId) => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) upsertLineItem(billId, monthKey, val);
    setEditingCell(null);
    setEditValue('');
  }, [editValue, monthKey, upsertLineItem]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const toggleAccount = (id) =>
    setCollapsedAccounts(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-slate-400">
          Click any <span className="text-emerald-400 font-medium">Actual</span> cell to override &mdash; changes propagate to the Dashboard instantly.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
          >
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <input
            type="number"
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value) || today.getFullYear())}
            className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-center transition-colors"
          />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl glass-panel space-y-1">
          <span className="text-xs text-slate-400">Projected</span>
          <span className="text-2xl font-black text-slate-100 font-mono block">${totalProjected.toFixed(2)}</span>
          <div className="h-1 bg-slate-700 rounded-full" />
        </div>
        <div className="p-4 rounded-2xl glass-panel space-y-1">
          <span className="text-xs text-slate-400">Actual ({MONTHS[selectedMonth].slice(0, 3)})</span>
          <span className="text-2xl font-black text-emerald-400 font-mono block">${totalActual.toFixed(2)}</span>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, totalProjected > 0 ? (totalActual / totalProjected) * 100 : 0)}%`,
                backgroundColor: totalActual > totalProjected ? '#f43f5e' : '#10b981'
              }}
            />
          </div>
        </div>
        <div className={`p-4 rounded-2xl glass-panel space-y-1 ${Math.abs(variance) < 0.01 ? '' : variance > 0 ? 'border-rose-800/50' : 'border-emerald-800/50'}`}>
          <span className="text-xs text-slate-400">Variance</span>
          <span className={`text-2xl font-black font-mono block ${Math.abs(variance) < 0.01 ? 'text-slate-400' : variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {variance >= 0 ? '+' : ''}{variance.toFixed(2)}
          </span>
          <div className="text-[10px] text-slate-500">{Math.abs(variance) < 0.01 ? 'On budget' : variance > 0 ? 'Over budget' : 'Under budget'}</div>
        </div>
      </div>

      {/* Per-account collapsible tables */}
      {budget.accounts.map(account => {
        const accountBills     = budget.bills.filter(b => b.accountId === account.id);
        if (accountBills.length === 0) return null;
        const accountProjTotal = accountBills.reduce((s, b) => s + getBillMonthlyCost(b), 0);
        const accountActual    = getAccountActualExpenses(account.id, monthKey);
        const projEndBal       = getAccountProjectedEndBalance(account.id, monthKey);
        const actualEndBal     = getAccountActualEndBalance(account.id, monthKey);
        const isCollapsed      = collapsedAccounts[account.id];
        const overBudget       = accountActual > accountProjTotal;

        return (
          <div key={account.id} className="space-y-0">
            <button
              onClick={() => toggleAccount(account.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-t-2xl bg-slate-900/90 border border-slate-800 hover:bg-slate-900 transition-colors text-left"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-200 flex-1">{account.name}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize flex-shrink-0">{account.type}</span>
              <div className="hidden sm:flex items-center gap-4 text-xs ml-auto">
                <span className="text-slate-500">Start: <span className="font-mono text-slate-300">${(account.startingBalance || 0).toFixed(2)}</span></span>
                <span className="text-slate-500">Proj end: <span className={`font-mono ${projEndBal < 0 ? 'text-rose-400' : 'text-slate-300'}`}>${projEndBal.toFixed(2)}</span></span>
                <span className="text-slate-500">Actual end: <span className={`font-mono ${actualEndBal < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>${actualEndBal.toFixed(2)}</span></span>
                {overBudget && <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-semibold">Over</span>}
              </div>
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto border border-t-0 border-slate-800 rounded-b-2xl glass-panel">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-1/4">Bill Name</th>
                      <th className="p-3 text-center w-20">Progress</th>
                      <th className="p-3 text-right">Projected</th>
                      <th className="p-3 text-right">
                        <span className="flex items-center gap-1 justify-end">Actual <Pencil className="w-2.5 h-2.5 text-emerald-600" /></span>
                      </th>
                      <th className="p-3 text-right">Variance</th>
                      <th className="p-3 text-right">Due Day</th>
                      {budget.people.map(p => <th key={p.id} className="p-3 text-right">{p.name.split(' ')[0]}</th>)}
                      <th className="p-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {accountBills.map(bill => {
                      const projected    = getBillMonthlyCost(bill);
                      const li           = getLineItem(bill.id, monthKey);
                      const actual       = li ? li.actualAmount : projected;
                      const billVariance = actual - projected;
                      const isEditing    = editingCell === bill.id;
                      const isOverridden = li !== undefined;
                      const barPct       = projected > 0 ? (actual / projected) * 100 : 0;

                      return (
                        <tr key={bill.id} className={`hover:bg-slate-900/30 transition-colors relative ${isOverridden ? 'row-overridden' : ''}`}>
                          <td className="p-3 font-semibold text-slate-200 pl-5">
                            <InlineEdit
                              value={bill.name}
                              type="text"
                              onCommit={v => updateBill(bill.id, { name: v })}
                              className="text-slate-200 font-semibold text-xs"
                            />
                          </td>
                          <td className="p-3 text-center"><div className="flex justify-center"><MiniBar pct={barPct} overBudget={actual > projected} /></div></td>
                          <td className="p-3 text-right">
                            <InlineEdit
                              value={bill.amount}
                              type="currency"
                              onCommit={v => updateBill(bill.id, { amount: v })}
                              className="font-mono text-slate-300 text-xs justify-end"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <ActualCell
                              bill={bill} projected={projected} actual={actual}
                              isEditing={isEditing} editValue={editValue}
                              onEdit={openEditor} onCommit={() => commitEdit(bill.id)}
                              onCancel={cancelEdit} onChange={setEditValue}
                            />
                          </td>
                          <td className="p-3 text-right font-mono">
                            {Math.abs(billVariance) < 0.01 ? <span className="text-slate-600">&mdash;</span>
                              : billVariance > 0 ? <span className="text-rose-400">+{billVariance.toFixed(2)}</span>
                              : <span className="text-emerald-400">{billVariance.toFixed(2)}</span>}
                          </td>
                          <td className="p-3 text-right">
                            <InlineEdit
                              value={bill.dueDay}
                              type="integer"
                              prefix="Day "
                              min={1}
                              max={31}
                              onCommit={v => updateBill(bill.id, { dueDay: v })}
                              className="font-mono text-slate-500 text-xs justify-end"
                            />
                          </td>
                          {budget.people.map(p => {
                            const portion = getBillPersonMonthlyPortion(bill, p.id);
                            return <td key={p.id} className="p-3 text-right font-mono text-purple-300/80">${portion.toFixed(2)}</td>;
                          })}
                          <td className="p-3 text-slate-500 italic max-w-xs truncate">{bill.notes || <span className="text-slate-700">&mdash;</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-900/80 font-bold border-t border-slate-700/80 text-slate-200">
                    <tr>
                      <td className="p-3 text-slate-400 pl-5" colSpan={2}>Account Subtotal</td>
                      <td className="p-3 text-right font-mono">${accountProjTotal.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400">${accountActual.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono">
                        {Math.abs(accountActual - accountProjTotal) < 0.01
                          ? <span className="text-slate-600">&mdash;</span>
                          : <span className={accountActual > accountProjTotal ? 'text-rose-400' : 'text-emerald-400'}>
                              {accountActual > accountProjTotal ? '+' : ''}{(accountActual - accountProjTotal).toFixed(2)}
                            </span>}
                      </td>
                      <td colSpan={2 + budget.people.length} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Grand footer */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800/80">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <span className="text-xs text-slate-400 block">Total Projected</span>
            <span className="text-2xl font-black text-slate-100 font-mono">${totalProjected.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Total Actual &mdash; {MONTHS[selectedMonth]} {selectedYear}</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">${totalActual.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Net Variance</span>
            <span className={`text-2xl font-black font-mono ${Math.abs(variance) < 0.01 ? 'text-slate-400' : variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {variance >= 0 ? '+' : ''}{variance.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span>Rows with a green left border have an actual override. Overrides are stored per-bill, per-month.</span>
        </div>
      </div>
    </div>
  );
}

// --- Tab 2: 30-Day Cash Flow Register ---

function CashFlowRegister() {
  const { budget, getBillMonthlyCost } = useBudget();
  const [selectedAccountId, setSelectedAccountId] = useState(budget.accounts[0]?.id || 'all');
  const selectedAccount = budget.accounts.find(a => a.id === selectedAccountId);

  const ledgerDays = useMemo(() => {
    const today = new Date();
    const days  = [];
    const relevantBills = selectedAccountId === 'all'
      ? budget.bills
      : budget.bills.filter(b => b.accountId === selectedAccountId);

    let currentBalance = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + a.startingBalance, 0)
      : (selectedAccount?.startingBalance || 0);

    for (let i = 0; i < 30; i++) {
      const date      = new Date(today);
      date.setDate(today.getDate() + i);
      const dayOfMonth = date.getDate();
      const isLastDay  = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === dayOfMonth;

      let dailyDeposits   = 0;
      let dailyDeductions = 0;
      const transactions  = [];

      budget.people.forEach(person => {
        const netPay = person.netPerPay;
        if (person.payFrequency === 'bi-weekly') {
          if (dayOfMonth === 15 || isLastDay) {
            dailyDeposits += netPay;
            transactions.push({ title: `Paycheck - ${person.name}`, amount: netPay, type: 'deposit' });
          }
        } else if (person.payFrequency === 'monthly' && dayOfMonth === 1) {
          dailyDeposits += netPay;
          transactions.push({ title: `Income - ${person.name}`, amount: netPay, type: 'deposit' });
        }
      });

      relevantBills.forEach(bill => {
        if (bill.dueDay === dayOfMonth) {
          const cost = getBillMonthlyCost(bill);
          dailyDeductions += cost;
          transactions.push({ title: bill.name, amount: cost, type: 'deduction' });
        }
      });

      const startingBal  = currentBalance;
      currentBalance     = currentBalance + dailyDeposits - dailyDeductions;

      days.push({
        dateFormatted: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        startingBal,
        dailyDeposits,
        dailyDeductions,
        endingBal: currentBalance,
        transactions,
        isNegative: currentBalance < 0
      });
    }
    return days;
  }, [budget, selectedAccountId, selectedAccount]);

  return (
    <div className="space-y-5">
      {/* Account filter */}
      <div className="flex items-center gap-2 self-start bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <label className="text-xs text-slate-400">Account:</label>
        <select
          value={selectedAccountId}
          onChange={e => setSelectedAccountId(e.target.value)}
          className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none"
        >
          <option value="all">All Accounts (Combined)</option>
          {budget.accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
        </select>
      </div>

      {/* Ledger table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-800">
            <tr>
              <th className="p-3.5">Date</th>
              <th className="p-3.5">Scheduled Events</th>
              <th className="p-3.5 text-right">Deposits (+)</th>
              <th className="p-3.5 text-right">Deductions (-)</th>
              <th className="p-3.5 text-right">Ending Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {ledgerDays.map((day, idx) => (
              <tr key={idx} className={`hover:bg-slate-900/40 transition-colors ${day.isNegative ? 'bg-rose-950/20' : ''}`}>
                <td className="p-3.5 font-semibold text-slate-200 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{day.dateFormatted}</span>
                  </div>
                </td>
                <td className="p-3.5">
                  {day.transactions.length > 0 ? (
                    <div className="space-y-1">
                      {day.transactions.map((t, tidx) => (
                        <div key={tidx} className="flex items-center gap-2 text-xs">
                          {t.type === 'deposit' ? (
                            <span className="p-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                              <ArrowUpRight className="w-3 h-3" />
                            </span>
                          ) : (
                            <span className="p-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
                              <ArrowDownRight className="w-3 h-3" />
                            </span>
                          )}
                          <span className={t.type === 'deposit' ? 'text-emerald-300 font-medium' : 'text-slate-300'}>{t.title}</span>
                          <span className={`ml-auto font-mono text-[10px] ${t.type === 'deposit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.type === 'deposit' ? '+' : '-'}${t.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-600 italic text-[10px]">No scheduled activity</span>
                  )}
                </td>
                <td className="p-3.5 text-right font-mono font-semibold text-emerald-400">
                  {day.dailyDeposits > 0 ? `+$${day.dailyDeposits.toFixed(2)}` : <span className="text-slate-700">&mdash;</span>}
                </td>
                <td className="p-3.5 text-right font-mono font-semibold text-rose-400">
                  {day.dailyDeductions > 0 ? `-$${day.dailyDeductions.toFixed(2)}` : <span className="text-slate-700">&mdash;</span>}
                </td>
                <td className="p-3.5 text-right font-mono font-bold">
                  <span className={day.isNegative ? 'text-rose-400 animate-pulse' : 'text-slate-100'}>
                    ${day.endingBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {day.isNegative && (
                    <span className="ml-2 inline-flex items-center text-[10px] text-rose-400">
                      <AlertCircle className="w-3 h-3 mr-0.5" />Deficit
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Combined LedgerView with tabs ---

const TABS = [
  { id: 'monthly', label: 'Monthly Bill Ledger', icon: ReceiptText,  desc: 'Edit actuals, view projected vs. actual variance' },
  { id: 'cashflow', label: '30-Day Cash Flow',   icon: Wallet,        desc: 'Daily balance forecast with deposits & deductions' },
];

export function LedgerView() {
  const [activeTab, setActiveTab] = useState('monthly');
  const Tab = TABS.find(t => t.id === activeTab);

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-black text-slate-100">Ledger &amp; Cash Flow</h2>
        <p className="text-xs text-slate-400 mt-0.5">Bill tracking, actuals editing, and 30-day daily balance forecast</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 p-1 bg-slate-900/70 rounded-2xl border border-slate-800/60 w-fit">
        {TABS.map(tab => {
          const Icon    = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600/25 text-blue-300 border border-blue-500/30 shadow-inner'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab description */}
      <p className="text-[11px] text-slate-500 -mt-3">{Tab?.desc}</p>

      {/* Tab content */}
      {activeTab === 'monthly'  && <MonthlyLedger />}
      {activeTab === 'cashflow' && <CashFlowRegister />}
    </div>
  );
}
