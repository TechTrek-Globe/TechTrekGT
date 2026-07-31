import React, { useState, useMemo } from 'react';
import { useBudget } from '../context/BudgetContext';
import { ReceiptText, Pencil, Check, X, AlertTriangle } from 'lucide-react';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

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
    getBillPersonMonthlyPortion
  } = useBudget();

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [editingCell, setEditingCell] = useState(null); // { billId: string } or null
  const [editValue, setEditValue] = useState('');

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const totalProjected = useMemo(() => getTotalMonthlyExpenses(), [budget.bills]);
  const totalActual = useMemo(() => getTotalActualExpenses(monthKey), [budget.lineItems, budget.bills, monthKey]);
  const variance = totalActual - totalProjected;

  const openEditor = (billId, currentEffective) => {
    setEditingCell(billId);
    setEditValue(currentEffective.toFixed(2));
  };

  const commitEdit = (billId) => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) {
      upsertLineItem(billId, monthKey, val);
    }
    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const clearOverride = (billId) => {
    upsertLineItem(billId, monthKey, getBillMonthlyCost(budget.bills.find(b => b.id === billId)));
    setEditingCell(null);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-16">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-emerald-400" />
            Interactive Budget Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Inline edit actual amounts &mdash; projected vs actual with real-time recalculation
          </p>
        </div>

        {/* Month/Year Selector */}
        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(parseInt(e.target.value))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value) || today.getFullYear())}
            className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-center"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl glass-panel space-y-1">
          <span className="text-xs text-slate-400">Projected Expenses</span>
          <span className="text-2xl font-bold text-slate-100 font-mono">
            ${totalProjected.toFixed(2)}
          </span>
        </div>
        <div className="p-5 rounded-2xl glass-panel space-y-1">
          <span className="text-xs text-slate-400">Actual Expenses</span>
          <span className="text-2xl font-bold text-emerald-400 font-mono">
            ${totalActual.toFixed(2)}
          </span>
        </div>
        <div className={`p-5 rounded-2xl glass-panel space-y-1 ${Math.abs(variance) < 0.01 ? '' : variance > 0 ? 'border-rose-800/60' : 'border-emerald-800/60'}`}>
          <span className="text-xs text-slate-400">Variance (Actual - Projected)</span>
          <span className={`text-2xl font-bold font-mono ${Math.abs(variance) < 0.01 ? 'text-slate-400' : variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {variance >= 0 ? '+' : ''}{variance.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Tables Grouped by Account */}
      {budget.accounts.map(account => {
        const accountBills = budget.bills.filter(b => b.accountId === account.id);
        if (accountBills.length === 0) return null;

        const accountProjTotal = accountBills.reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
        const accountActualTotal = getAccountActualExpenses(account.id, monthKey);
        const projEndBal = getAccountProjectedEndBalance(account.id, monthKey);
        const actualEndBal = getAccountActualEndBalance(account.id, monthKey);
        const balVariance = actualEndBal - projEndBal;

        return (
          <div key={account.id} className="space-y-3">
            {/* Account Header */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="text-base font-bold text-slate-200">{account.name}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">
                  {account.type}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-400">
                  Start: <span className="font-mono text-slate-200">${(account.startingBalance || 0).toFixed(2)}</span>
                </span>
                <span className="text-slate-400">
                  Proj End: <span className={`font-mono ${projEndBal < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                    ${projEndBal.toFixed(2)}
                  </span>
                </span>
                <span className="text-slate-400">
                  Actual End: <span className={`font-mono ${actualEndBal < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    ${actualEndBal.toFixed(2)}
                  </span>
                </span>
              </div>
            </div>

            {/* Bills Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-medium text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5 w-1/4">Bill Name</th>
                    <th className="p-3.5 text-right">Projected</th>
                    <th className="p-3.5 text-right">Actual</th>
                    <th className="p-3.5 text-right">Variance</th>
                    <th className="p-3.5 text-right">Due Day</th>
                    {budget.people.map(p => (
                      <th key={p.id} className="p-3.5 text-right">{p.name}</th>
                    ))}
                    <th className="p-3.5">Notes</th>
                    <th className="p-3.5 text-center">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/20">
                  {accountBills.map(bill => {
                    const projected = getBillMonthlyCost(bill);
                    const li = getLineItem(bill.id, monthKey);
                    const actual = li ? li.actualAmount : projected;
                    const billVariance = actual - projected;
                    const isEditing = editingCell === bill.id;
                    const isOverridden = li !== undefined;

                    return (
                      <tr key={bill.id} className={`hover:bg-slate-900/40 transition-colors ${isOverridden ? 'bg-blue-950/20' : ''}`}>
                        <td className="p-3.5 font-semibold text-slate-200">{bill.name}</td>
                        <td className="p-3.5 text-right font-mono text-slate-300">
                          ${projected.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitEdit(bill.id);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                className="w-20 bg-slate-800 border border-emerald-600 rounded px-2 py-1 text-emerald-300 text-xs text-right font-mono focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => commitEdit(bill.id)} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
                              <button onClick={cancelEdit} className="p-0.5 text-slate-400 hover:text-rose-400"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : (
                            <span className={`${isOverridden ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>
                              ${actual.toFixed(2)}
                              {isOverridden && <span className="ml-1 text-[10px] text-blue-400 font-normal">(override)</span>}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-mono">
                          {Math.abs(billVariance) < 0.01 ? (
                            <span className="text-slate-500">&mdash;</span>
                          ) : billVariance > 0 ? (
                            <span className="text-rose-400">+{billVariance.toFixed(2)}</span>
                          ) : (
                            <span className="text-emerald-400">{billVariance.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-mono text-slate-400">Day {bill.dueDay}</td>
                        {budget.people.map(p => {
                          const portion = getBillPersonMonthlyPortion(bill, p.id);
                          return (
                            <td key={p.id} className="p-3.5 text-right font-mono text-purple-300">
                              ${portion.toFixed(2)}
                            </td>
                          );
                        })}
                        <td className="p-3.5 text-slate-400 italic max-w-xs truncate">{bill.notes || '&mdash;'}</td>
                        <td className="p-3.5 text-center">
                          {isEditing ? null : (
                            <button
                              onClick={() => openEditor(bill.id, actual)}
                              className="p-1 text-slate-500 hover:text-emerald-400 rounded transition-colors"
                              title="Edit actual amount"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Account Subtotal Row */}
                <tfoot className="bg-slate-900/80 font-bold border-t border-slate-800 text-slate-200">
                  <tr>
                    <td className="p-3.5 text-slate-300">Account Subtotal</td>
                    <td className="p-3.5 text-right font-mono text-slate-100">
                      ${accountProjTotal.toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-emerald-400">
                      ${accountActualTotal.toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right font-mono">
                      {Math.abs(accountActualTotal - accountProjTotal) < 0.01 ? (
                        <span className="text-slate-500">&mdash;</span>
                      ) : (
                        <span className={accountActualTotal > accountProjTotal ? 'text-rose-400' : 'text-emerald-400'}>
                          ${(accountActualTotal - accountProjTotal).toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td colSpan={3 + budget.people.length}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* Grand Totals Footer */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-slate-400 block">Total Projected</span>
            <span className="text-2xl font-black text-slate-100 font-mono">
              ${totalProjected.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Total Actual ({MONTHS[selectedMonth]} {selectedYear})</span>
            <span className="text-2xl font-black text-emerald-400 font-mono">
              ${totalActual.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Net Variance</span>
            <span className={`text-2xl font-black font-mono ${Math.abs(variance) < 0.01 ? 'text-slate-400' : variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {variance >= 0 ? '+' : ''}{variance.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Actual overrides are per-bill, per-month. Empty cells use projected defaults.
          </span>
        </div>
      </div>

    </div>
  );
}