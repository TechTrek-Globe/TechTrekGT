import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useBudget } from '../context/BudgetContext';
import { fmtMoney, fmtNum } from '../utils/formatters';
import { formatBillDueMonths } from '../utils/paydayUtils';
import {
  ReceiptText,
  Pencil,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// Inline mini progress bar
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

// Single editable cell
function ActualCell({ bill, projected, actual, isEditing, editValue, onEdit, onCommit, onCancel, onChange }) {
  const isOverridden = actual !== projected;
  const inputRef = useRef(null);

  return isEditing ? (
    <div className="inline-flex items-center gap-1 editing-cell">
      <span className="text-slate-500 text-xs">$</span>
      <input
        ref={inputRef}
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

export function InteractiveBudgetView() {
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
    if (!isNaN(val) && val >= 0) {
      upsertLineItem(billId, monthKey, val);
    }
    setEditingCell(null);
    setEditValue('');
  }, [editValue, monthKey, upsertLineItem]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const toggleAccount = (accountId) => {
    setCollapsedAccounts(prev => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-emerald-400" />
            Interactive Budget Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any actual amount cell to edit &mdash; changes update Dashboard in real time
          </p>
        </div>

        {/* Month / Year picker */}
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value) || today.getFullYear())}
            className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-center transition-colors"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl glass-panel space-y-1">
          <span className="text-xs text-slate-400">Projected</span>
          <span className="text-2xl font-black text-slate-100 font-mono block">{fmtMoney(totalProjected)}</span>
          <div className="h-1 bg-slate-700 rounded-full" />
        </div>
        <div className="p-4 rounded-2xl glass-panel space-y-1">
          <span className="text-xs text-slate-400">Actual ({MONTHS[selectedMonth].slice(0,3)})</span>
          <span className="text-2xl font-black text-emerald-400 font-mono block">{fmtMoney(totalActual)}</span>
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
        <div className={`p-4 rounded-2xl glass-panel space-y-1 ${
          Math.abs(variance) < 0.01 ? '' : variance > 0 ? 'border-rose-800/50' : 'border-emerald-800/50'
        }`}>
          <span className="text-xs text-slate-400">Variance (Actual - Projected)</span>
          <span className={`text-2xl font-black font-mono block ${
            Math.abs(variance) < 0.01 ? 'text-slate-400' : variance > 0 ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {variance >= 0 ? '+' : '-'}{fmtMoney(Math.abs(variance))}
          </span>
          <div className="text-[10px] text-slate-500">
            {Math.abs(variance) < 0.01 ? 'On budget' : variance > 0 ? 'Over budget' : 'Under budget'}
          </div>
        </div>
      </div>

      {/* Tables grouped by Account */}
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
            {/* Account Section Header */}
            <button
              onClick={() => toggleAccount(account.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-t-2xl bg-slate-900/90 border border-slate-800 hover:bg-slate-900 transition-colors text-left"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
              <h3 className="text-sm font-bold text-slate-200 flex-1">{account.name}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize flex-shrink-0">{account.type}</span>
              <div className="flex items-center gap-4 text-xs ml-auto">
                <span className="text-slate-500">
                  Start: <span className="font-mono text-slate-300">{fmtMoney(account.startingBalance || 0)}</span>
                </span>
                <span className="text-slate-500">
                  Proj end: <span className={`font-mono ${projEndBal < 0 ? 'text-rose-400' : 'text-slate-300'}`}>{fmtMoney(projEndBal)}</span>
                </span>
                <span className="text-slate-500">
                  Actual end: <span className={`font-mono ${actualEndBal < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{fmtMoney(actualEndBal)}</span>
                </span>
                {overBudget && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-semibold">Over</span>
                )}
              </div>
            </button>

            {/* Bills Table */}
            {!isCollapsed && (
              <div className="overflow-x-auto border border-t-0 border-slate-800 rounded-b-2xl glass-panel">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-1/4">Bill Name</th>
                      <th className="p-3 text-center w-20">Progress</th>
                      <th className="p-3 text-right">Projected</th>
                      <th className="p-3 text-right">
                        <span className="flex items-center gap-1 justify-end">
                          Actual
                          <Pencil className="w-2.5 h-2.5 text-emerald-600" />
                        </span>
                      </th>
                      <th className="p-3 text-right">Variance</th>
                      <th className="p-3 text-right">Due Day</th>
                      {budget.people.map(p => (
                        <th key={p.id} className="p-3 text-right">{p.name.split(' ')[0]}</th>
                      ))}
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
                        <tr
                          key={bill.id}
                          className={`hover:bg-slate-900/30 transition-colors relative ${isOverridden ? 'row-overridden' : ''}`}
                        >
                          <td className="p-3 font-semibold text-slate-200 pl-5">{bill.name}</td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center">
                              <MiniBar pct={barPct} overBudget={actual > projected} />
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">{fmtMoney(projected)}</td>
                          <td className="p-3 text-right">
                            <ActualCell
                              bill={bill}
                              projected={projected}
                              actual={actual}
                              isEditing={isEditing}
                              editValue={editValue}
                              onEdit={openEditor}
                              onCommit={() => commitEdit(bill.id)}
                              onCancel={cancelEdit}
                              onChange={setEditValue}
                            />
                          </td>
                          <td className="p-3 text-right font-mono">
                            {Math.abs(billVariance) < 0.01 ? (
                              <span className="text-slate-600">&mdash;</span>
                            ) : billVariance > 0 ? (
                              <span className="text-rose-400">+{fmtMoney(billVariance)}</span>
                            ) : (
                              <span className="text-emerald-400">-{fmtMoney(Math.abs(billVariance))}</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500">
                            Day {bill.dueDay}
                            {bill.period !== 'Monthly' && (
                              <span className="block text-[10px] text-emerald-400 font-sans font-semibold">{formatBillDueMonths(bill)}</span>
                            )}
                          </td>
                          {budget.people.map(p => {
                            const portion = getBillPersonMonthlyPortion(bill, p.id);
                            return (
                              <td key={p.id} className="p-3 text-right font-mono text-purple-300/80">{fmtMoney(portion)}</td>
                            );
                          })}
                          <td className="p-3 text-slate-500 italic max-w-xs truncate">{bill.notes || <span className="text-slate-700">&mdash;</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-900/80 font-bold border-t border-slate-700/80 text-slate-200">
                    <tr>
                      <td className="p-3 text-slate-400 pl-5" colSpan={2}>Account Subtotal</td>
                      <td className="p-3 text-right font-mono">{fmtMoney(accountProjTotal)}</td>
                      <td className="p-3 text-right font-mono text-emerald-400">{fmtMoney(accountActual)}</td>
                      <td className="p-3 text-right font-mono">
                        {Math.abs(accountActual - accountProjTotal) < 0.01 ? (
                          <span className="text-slate-600">&mdash;</span>
                        ) : (
                          <span className={accountActual > accountProjTotal ? 'text-rose-400' : 'text-emerald-400'}>
                            {accountActual > accountProjTotal ? '+' : '-'}{fmtMoney(Math.abs(accountActual - accountProjTotal))}
                          </span>
                        )}
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

      {/* Grand Totals Footer */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800/80">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <span className="text-xs text-slate-400 block">Total Projected</span>
            <span className="text-2xl font-black text-slate-100 font-mono">{fmtMoney(totalProjected)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Total Actual &mdash; {MONTHS[selectedMonth]} {selectedYear}</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">{fmtMoney(totalActual)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Net Variance</span>
            <span className={`text-2xl font-black font-mono ${
              Math.abs(variance) < 0.01 ? 'text-slate-400' : variance > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {variance >= 0 ? '+' : '-'}{fmtMoney(Math.abs(variance))}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span>
            Click any Actual cell to override for {MONTHS[selectedMonth]} {selectedYear}. Overrides persist per-bill, per-month.
            Rows with a green left border have been overridden from the projected default.
          </span>
        </div>
      </div>

    </div>
  );
}