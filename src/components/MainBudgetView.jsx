import React from 'react';
import { useBudget } from '../context/BudgetContext';
import { ReceiptText, CreditCard, Users, Plus, Check } from 'lucide-react';

export function MainBudgetView() {
  const { 
    budget, 
    setIsSettingsOpen, 
    setSettingsTab,
    getBillMonthlyCost,
    getBillPersonMonthlyPortion,
    getTotalMonthlyExpenses
  } = useBudget();

  const totalMonthlyExpenses = getTotalMonthlyExpenses();

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-blue-400" />
            Bi-Weekly Personal Budget Plan
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Itemized breakdown of all household expenses grouped by account and member allocations
          </p>
        </div>
        <button
          onClick={() => {
            setSettingsTab('bills');
            setIsSettingsOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium shadow-md shadow-blue-600/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add / Edit Bills
        </button>
      </div>

      {/* Tables Grouped by Account */}
      {budget.accounts.map(account => {
        const accountBills = budget.bills.filter(b => b.accountId === account.id);
        const accountTotal = accountBills.reduce((sum, b) => sum + getBillMonthlyCost(b), 0);

        return (
          <div key={account.id} className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="text-base font-bold text-slate-200">{account.name}</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">
                  {account.type}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Subtotal: <span className="font-bold text-rose-400 font-mono text-sm">${accountTotal.toFixed(2)}/mo</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 uppercase font-medium text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Bill Name</th>
                    <th className="p-3.5 text-right">Monthly Amount</th>
                    <th className="p-3.5 text-right">Bi-Weekly (Per Pay)</th>
                    {budget.people.map(p => (
                      <th key={p.id} className="p-3.5 text-right">{p.name} Portion</th>
                    ))}
                    <th className="p-3.5">Due Day</th>
                    <th className="p-3.5">Payment Source</th>
                    <th className="p-3.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/20">
                  {accountBills.map(bill => {
                    const monthlyCost = getBillMonthlyCost(bill);
                    const biWeeklyCost = monthlyCost / 2;

                    return (
                      <tr key={bill.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5 font-semibold text-slate-200">{bill.name}</td>
                        <td className="p-3.5 text-right font-mono text-slate-100">${monthlyCost.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-blue-400">${biWeeklyCost.toFixed(2)}</td>
                        {budget.people.map(p => {
                          const pPortion = getBillPersonMonthlyPortion(bill, p.id);
                          return (
                            <td key={p.id} className="p-3.5 text-right font-mono text-purple-300">
                              ${pPortion.toFixed(2)}
                            </td>
                          );
                        })}
                        <td className="p-3.5 font-mono text-slate-400">Day {bill.dueDay}</td>
                        <td className="p-3.5 text-slate-300">{bill.paymentSource}</td>
                        <td className="p-3.5 text-slate-400 italic max-w-xs truncate">{bill.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-900/80 font-bold border-t border-slate-800 text-slate-200">
                  <tr>
                    <td className="p-3.5 text-slate-300">Account Subtotal</td>
                    <td className="p-3.5 text-right font-mono text-rose-400">${accountTotal.toFixed(2)}</td>
                    <td className="p-3.5 text-right font-mono text-blue-400">${(accountTotal / 2).toFixed(2)}</td>
                    {budget.people.map(p => {
                      const pTotal = accountBills.reduce((sum, b) => sum + getBillPersonMonthlyPortion(b, p.id), 0);
                      return (
                        <td key={p.id} className="p-3.5 text-right font-mono text-purple-300">
                          ${pTotal.toFixed(2)}
                        </td>
                      );
                    })}
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* Summary Grand Total */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Total Monthly Budget Expenses</h3>
          <p className="text-xs text-slate-400">Sum of all accounts combined</p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs text-slate-400 block">Total Monthly</span>
            <span className="text-2xl font-black text-rose-400 font-mono">
              ${totalMonthlyExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <span className="text-xs text-slate-400 block">Bi-Weekly Target</span>
            <span className="text-2xl font-black text-blue-400 font-mono">
              ${(totalMonthlyExpenses / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
