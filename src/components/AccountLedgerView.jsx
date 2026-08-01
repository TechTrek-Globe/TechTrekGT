import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import { Wallet, Calendar, AlertCircle, ArrowDownRight, ArrowUpRight, Filter } from 'lucide-react';

export function AccountLedgerView() {
  const { budget, getBillMonthlyCost, isPersonDepositDay, getPersonDepositAmountForAccount } = useBudget();
  const [selectedAccountId, setSelectedAccountId] = useState(budget.accounts[0]?.id || 'all');

  const selectedAccount = budget.accounts.find(a => a.id === selectedAccountId);

  // Generate 30-day ledger projection starting from today
  const generateLedger = () => {
    const today = new Date();
    const ledgerDays = [];
    
    // Filter bills relevant to account selection
    const relevantBills = selectedAccountId === 'all' 
      ? budget.bills 
      : budget.bills.filter(b => b.accountId === selectedAccountId);

    // Initial balance sum
    let currentBalance = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + a.startingBalance, 0)
      : (selectedAccount?.startingBalance || 0);

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayOfMonth = date.getDate();
      const isLastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() === dayOfMonth;

      let dailyDeposits = 0;
      let dailyDeductions = 0;
      const transactions = [];

      // Check paycheck deposits
      budget.people.forEach(person => {
        const isDepDay = isPersonDepositDay(person, date.getFullYear(), date.getMonth(), dayOfMonth);
        if (isDepDay) {
          const depositAmt = getPersonDepositAmountForAccount(person, selectedAccountId);
          if (depositAmt > 0) {
            dailyDeposits += depositAmt;
            transactions.push({
              title: `Paycheck Deposit - ${person.name}`,
              amount: depositAmt,
              type: 'deposit'
            });
          }
        }
      });

      // Check bill payment deductions on this day
      relevantBills.forEach(bill => {
        if (bill.dueDay === dayOfMonth) {
          const cost = getBillMonthlyCost(bill);
          dailyDeductions += cost;
          transactions.push({
            title: bill.name,
            amount: cost,
            type: 'deduction',
            accountName: budget.accounts.find(a => a.id === bill.accountId)?.name
          });
        }
      });

      const startingBal = currentBalance;
      currentBalance = currentBalance + dailyDeposits - dailyDeductions;

      ledgerDays.push({
        dateFormatted: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        dayOfMonth,
        startingBal,
        dailyDeposits,
        dailyDeductions,
        endingBal: currentBalance,
        transactions,
        isNegative: currentBalance < 0
      });
    }

    return ledgerDays;
  };

  const ledgerDays = generateLedger();

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            30-Day Cash Flow Register & Daily Balance Forecast
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automated daily deposits, scheduled bill deductions, and running account balances
          </p>
        </div>

        {/* Account Selector Filter */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <Filter className="w-4 h-4 text-slate-400" />
          <label className="text-xs text-slate-400">Account:</label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none"
          >
            <option value="all">All Linked Accounts (Combined)</option>
            {budget.accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/90 text-slate-400 uppercase font-medium border-b border-slate-800">
            <tr>
              <th className="p-3.5">Date</th>
              <th className="p-3.5">Scheduled Events</th>
              <th className="p-3.5 text-right">Deposits (+)</th>
              <th className="p-3.5 text-right">Deductions (-)</th>
              <th className="p-3.5 text-right">Ending Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-950/20">
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
                          <span className={t.type === 'deposit' ? 'text-emerald-300 font-medium' : 'text-slate-300'}>
                            {t.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-600 italic">No scheduled activity</span>
                  )}
                </td>
                <td className="p-3.5 text-right font-mono font-semibold text-emerald-400">
                  {day.dailyDeposits > 0 ? `+$${day.dailyDeposits.toFixed(2)}` : '—'}
                </td>
                <td className="p-3.5 text-right font-mono font-semibold text-rose-400">
                  {day.dailyDeductions > 0 ? `-$${day.dailyDeductions.toFixed(2)}` : '—'}
                </td>
                <td className="p-3.5 text-right font-mono font-bold">
                  <span className={day.isNegative ? 'text-rose-400 animate-pulse' : 'text-slate-100'}>
                    ${day.endingBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {day.isNegative && (
                    <span className="ml-2 inline-flex items-center text-[10px] text-rose-400">
                      <AlertCircle className="w-3 h-3 mr-0.5" /> Deficit
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
