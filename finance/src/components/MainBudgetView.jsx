import React, { useState } from 'react';
import { useBudgetMetadata } from '../context/BudgetContext';
import { ReceiptText, Plus, Filter } from 'lucide-react';
import { InlineEdit } from './InlineEdit';
import { formatBillDueMonths } from '../utils/paydayUtils';

export function MainBudgetView({ onNavigateView }) {
  const {
    budget,
    setIsSettingsOpen,
    setSettingsTab,
    getBillMonthlyCost,
    getBillPersonMonthlyPortion,
    updateBill,
  } = useBudgetMetadata();

  const [selectedAccountId, setSelectedAccountId] = useState('all');

  const displayedAccounts = selectedAccountId === 'all'
    ? budget.accounts
    : budget.accounts.filter((/** @type {any} */ a) => a.id === selectedAccountId);

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* Header with Account Filter & Add Bill Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 shadow-lg backdrop-blur">
        <div>
          <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-blue-400" />
            Bills
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any <span className="text-blue-400 font-medium">name</span>,{' '}
            <span className="text-blue-400 font-medium">amount</span>, or{' '}
            <span className="text-blue-400 font-medium">due day</span> to edit inline
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Account Filter Selector */}
          <div className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm text-xs transition-colors">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-100 py-1">All Accounts Combined</option>
              {budget.accounts.map((/** @type {any} */ acc) => (
                <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100 py-1">{acc.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setSettingsTab('bills');
              if (onNavigateView) {
                onNavigateView('settings');
              } else {
                window.history.pushState({}, '', '/finance/settings');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add / Edit Bills
          </button>
        </div>
      </div>

      {/* Per-account tables with Sticky Headers */}
      {displayedAccounts.map((/** @type {any} */ account) => {
        const accountBills = budget.bills.filter((/** @type {any} */ b) => b.accountId === account.id && !b.isArchived);
        if (accountBills.length === 0 && selectedAccountId === 'all') return null;
        const accountTotal = accountBills.reduce((/** @type {number} */ sum, /** @type {any} */ b) => sum + getBillMonthlyCost(b), 0);

        const accountPeople = (account.enabledEarners && Array.isArray(account.enabledEarners))
          ? budget.people.filter((/** @type {any} */ p) => account.enabledEarners.includes(p.id))
          : budget.people;

        return (
          <div key={account.id} className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="text-sm font-bold text-slate-200">{account.name}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">{account.type}</span>
              </div>
              <span className="text-xs text-slate-400">
                Subtotal: <span className="font-bold text-rose-400 font-mono">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</span>
              </span>
            </div>

            <div className="overflow-x-auto matrix-scrollbar rounded-2xl border border-slate-800 glass-panel relative shadow-xl">
              <table className="w-full text-left text-xs text-slate-300 border-separate border-spacing-0">
                {/* Sticky Header Row */}
                <thead className="sticky top-0 z-20 bg-slate-950 text-slate-300 uppercase font-bold text-[10px] tracking-wider border-b border-slate-700 shadow-md">
                  <tr>
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-slate-200">Bill Name</th>
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-right text-slate-200">Monthly Amount</th>
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-right text-slate-200">Bi-Weekly (Per Pay)</th>
                    {accountPeople.map((/** @type {any} */ p) => (
                      <th key={p.id} className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-right text-emerald-300">{p.name.split(' ')[0]} Portion</th>
                    ))}
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-slate-200">Due Day</th>
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-slate-200">Payment Notes</th>
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-slate-200">Bank Match Names</th>
                    <th className="p-3.5 sticky top-0 z-20 bg-slate-950 border-b border-slate-700 text-slate-200">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {accountBills.length === 0 ? (
                    <tr>
                      <td colSpan={7 + accountPeople.length} className="p-8 text-center text-slate-500 italic">
                        No active bills assigned to this account.
                      </td>
                    </tr>
                  ) : (
                    accountBills.map((/** @type {any} */ bill) => {
                      const monthlyCost  = getBillMonthlyCost(bill);
                      const biWeeklyCost = monthlyCost / 2;

                      return (
                        <tr key={bill.id} className="hover:bg-slate-900/40 transition-colors group/row">

                          {/* Bill Name - inline editable */}
                          <td className="p-3.5 font-semibold">
                            <div className="flex items-center gap-2 flex-wrap">
                              <InlineEdit
                                value={bill.name}
                                type="text"
                                onCommit={(/** @type {string} */ v) => updateBill(bill.id, { name: v })}
                                className="text-slate-200 font-semibold text-xs"
                              />
                              {(!bill.splits || Object.keys(bill.splits).length === 0 || Object.values(bill.splits).every(v => !parseFloat(v))) && (
                                <span className="text-[9px] bg-amber-950/80 text-amber-300 border border-amber-800/60 px-1.5 py-0.2 rounded font-sans font-semibold">
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Monthly Amount - inline editable (writes to bill.amount) */}
                          <td className="p-3.5 text-right">
                            <InlineEdit
                              value={bill.amount}
                              type="currency"
                              onCommit={(/** @type {number} */ v) => updateBill(bill.id, { amount: v })}
                              className="font-mono text-slate-100 text-xs justify-end"
                            />
                          </td>

                          {/* Bi-weekly - derived, read-only */}
                          <td className="p-3.5 text-right font-mono text-blue-400 text-xs">
                            ${biWeeklyCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Person portions - derived */}
                          {accountPeople.map((/** @type {any} */ p) => {
                            const portion = getBillPersonMonthlyPortion(bill, p.id);
                            return (
                              <td key={p.id} className="p-3.5 text-right font-mono text-purple-300 text-xs">
                                ${portion.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            );
                          })}

                          {/* Due Day - inline editable */}
                          <td className="p-3.5 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <InlineEdit
                                value={bill.dueDay}
                                type="integer"
                                prefix="Day "
                                min={1}
                                max={31}
                                onCommit={(/** @type {number} */ v) => updateBill(bill.id, { dueDay: v })}
                                className="font-mono text-slate-400 text-xs justify-center"
                              />
                              {bill.period !== 'Monthly' && (
                                <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.2 rounded bg-emerald-950/60 border border-emerald-800/40">
                                  {formatBillDueMonths(bill)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Payment Notes - inline editable */}
                          <td className="p-3.5 text-slate-300 text-xs">
                            <InlineEdit
                              value={bill.paymentNotes || bill.paymentSource || ''}
                              type="text"
                              onCommit={(/** @type {string} */ v) => updateBill(bill.id, { paymentNotes: v, paymentSource: v })}
                              className="text-slate-300 text-xs"
                              displayFn={(/** @type {string} */ v) => v || '—'}
                            />
                          </td>

                          {/* Bank Match Names - inline editable */}
                          <td className="p-3.5 text-slate-300 text-xs">
                            <InlineEdit
                              value={bill.bankMatchNames || bill.matchingKey || ''}
                              type="text"
                              onCommit={(/** @type {string} */ v) => updateBill(bill.id, { matchingKey: v, bankMatchNames: v })}
                              className="text-slate-300 text-xs"
                              placeholder="e.g. GA POWER, COMCAST"
                              displayFn={(/** @type {string} */ v) => v ? <span className="px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800/50 text-blue-300 font-mono text-[10px]">{v}</span> : <span className="text-slate-600 italic">-</span>}
                            />
                          </td>

                          {/* Notes */}
                          <td className="p-3.5 text-slate-500 italic max-w-xs truncate text-xs">
                            <InlineEdit
                              value={bill.notes || ''}
                              type="text"
                              onCommit={(/** @type {string} */ v) => updateBill(bill.id, { notes: v })}
                              className="text-slate-500 italic max-w-xs truncate text-xs"
                              displayFn={(/** @type {string} */ v) => v || '—'}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-900 font-bold border-t-2 border-slate-700 text-slate-200 sticky bottom-0 z-10 shadow-lg">
                  <tr>
                    <td className="p-3.5 text-slate-400">Account Subtotal</td>
                    <td className="p-3.5 text-right font-mono text-rose-400">${accountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="p-3.5 text-right font-mono text-blue-400">${(accountTotal / 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    {accountPeople.map((/** @type {any} */ p) => {
                      const pTotal = accountBills.reduce((/** @type {number} */ s, /** @type {any} */ b) => s + getBillPersonMonthlyPortion(b, p.id), 0);
                      return (
                        <td key={p.id} className="p-3.5 text-right font-mono text-purple-300">${pTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      );
                    })}
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

    </div>
  );
}
