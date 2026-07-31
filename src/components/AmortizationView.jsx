import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import { Calculator, DollarSign, TrendingDown, Clock, ShieldCheck, Sparkles } from 'lucide-react';

export function AmortizationView() {
  const { budget, updateLoan } = useBudget();
  const loan = budget.loan;

  const [description, setDescription] = useState(loan.description || 'Home Loan');
  const [principal, setPrincipal] = useState(loan.principal || 285000);
  const [interestRate, setInterestRate] = useState(loan.annualInterestRate || 6.25);
  const [termMonths, setTermMonths] = useState(loan.termMonths || 360);
  const [extraPayment, setExtraPayment] = useState(loan.extraPayment || 200);

  // Calculate scheduled monthly payment (P&I formula)
  const monthlyRate = interestRate / 100 / 12;
  const scheduledPayment = monthlyRate > 0 
    ? (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
    : principal / termMonths;

  // Generate Amortization Schedule with and without extra payments
  const calculateSchedule = (withExtra = true) => {
    let balance = parseFloat(principal) || 0;
    const schedule = [];
    let month = 1;
    let totalInterest = 0;
    const extra = withExtra ? (parseFloat(extraPayment) || 0) : 0;

    while (balance > 0.01 && month <= 600) {
      const interestForMonth = balance * monthlyRate;
      let principalPortion = scheduledPayment - interestForMonth;
      
      if (balance < principalPortion) {
        principalPortion = balance;
      }

      let actualExtra = extra;
      if (balance - principalPortion < actualExtra) {
        actualExtra = Math.max(0, balance - principalPortion);
      }

      const totalPrincipalThisMonth = principalPortion + actualExtra;
      const endingBalance = Math.max(0, balance - totalPrincipalThisMonth);
      totalInterest += interestForMonth;

      schedule.push({
        month,
        beginningBalance: balance,
        scheduledPayment,
        extraPayment: actualExtra,
        totalPayment: principalPortion + interestForMonth + actualExtra,
        principalPortion: totalPrincipalThisMonth,
        interestPortion: interestForMonth,
        endingBalance
      });

      balance = endingBalance;
      month++;
    }

    return { schedule, totalInterest, totalMonths: month - 1 };
  };

  const withExtraResult = calculateSchedule(true);
  const withoutExtraResult = calculateSchedule(false);

  const interestSaved = Math.max(0, withoutExtraResult.totalInterest - withExtraResult.totalInterest);
  const monthsSaved = Math.max(0, withoutExtraResult.totalMonths - withExtraResult.totalMonths);

  // Payoff date estimation
  const startDate = new Date();
  const payoffDate = new Date(startDate.getFullYear(), startDate.getMonth() + withExtraResult.totalMonths, 1);

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-400" />
            Mortgage & Loan Amortization Calculator
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Simulate principal payoff acceleration and interest savings from extra monthly payments
          </p>
        </div>
      </div>

      {/* Input Form & Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Inputs Card */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            Loan Parameters
          </h3>
          
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Purchase Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Principal Loan Amount ($)</label>
              <input
                type="number"
                step="1000"
                value={principal}
                onChange={e => setPrincipal(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.125"
                  value={interestRate}
                  onChange={e => setInterestRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Term (Months)</label>
                <input
                  type="number"
                  value={termMonths}
                  onChange={e => setTermMonths(parseInt(e.target.value) || 360)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-indigo-300 font-semibold block mb-1">Extra Principal Payment / Mo ($)</label>
              <input
                type="number"
                step="50"
                value={extraPayment}
                onChange={e => setExtraPayment(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-indigo-950/60 border border-indigo-700 rounded-lg text-indigo-200 font-mono font-bold focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Loan Summary Metrics Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Payoff Acceleration Highlight */}
          <div className="sm:col-span-2 p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-teal-900/40 to-slate-900 border border-emerald-800/60 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <Sparkles className="w-4 h-4" />
              Payoff Savings Summary
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <span className="text-xs text-slate-400 block">Total Interest Saved</span>
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  ${interestSaved.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Time Saved</span>
                <span className="text-2xl font-black text-teal-300 font-mono">
                  {(monthsSaved / 12).toFixed(1)} Years ({monthsSaved} mos)
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-1">
            <span className="text-xs text-slate-400 block">Monthly P&I Payment</span>
            <span className="text-xl font-bold text-slate-100 font-mono">
              ${scheduledPayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-1">
            <span className="text-xs text-slate-400 block">Est. Payoff Date</span>
            <span className="text-xl font-bold text-indigo-400 font-mono">
              {payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-1">
            <span className="text-xs text-slate-400 block">Total Interest (with extra)</span>
            <span className="text-xl font-bold text-rose-400 font-mono">
              ${withExtraResult.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-5 rounded-2xl glass-panel space-y-1">
            <span className="text-xs text-slate-400 block">Total Cost of Loan</span>
            <span className="text-xl font-bold text-purple-400 font-mono">
              ${(principal + withExtraResult.totalInterest).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

        </div>

      </div>

      {/* Full Amortization Schedule Table */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-slate-200">Amortization Schedule (First 36 Months Preview)</h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-medium border-b border-slate-800">
              <tr>
                <th className="p-3">Payment #</th>
                <th className="p-3 text-right">Beginning Balance</th>
                <th className="p-3 text-right">Regular Payment</th>
                <th className="p-3 text-right">Extra Payment</th>
                <th className="p-3 text-right">Principal</th>
                <th className="p-3 text-right">Interest</th>
                <th className="p-3 text-right">Ending Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 font-mono">
              {withExtraResult.schedule.slice(0, 36).map(row => (
                <tr key={row.month} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-3 font-semibold text-slate-300">#{row.month}</td>
                  <td className="p-3 text-right text-slate-300">${row.beginningBalance.toFixed(2)}</td>
                  <td className="p-3 text-right text-slate-300">${row.scheduledPayment.toFixed(2)}</td>
                  <td className="p-3 text-right text-indigo-400 font-bold">${row.extraPayment.toFixed(2)}</td>
                  <td className="p-3 text-right text-emerald-400">${row.principalPortion.toFixed(2)}</td>
                  <td className="p-3 text-right text-rose-400">${row.interestPortion.toFixed(2)}</td>
                  <td className="p-3 text-right text-slate-100 font-bold">${row.endingBalance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
