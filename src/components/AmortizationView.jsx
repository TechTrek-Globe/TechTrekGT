import React, { useState, useMemo } from 'react';
import { useBudget } from '../context/BudgetContext';
import { Calculator, DollarSign, TrendingDown, Clock, ShieldCheck, Sparkles, Plus, Trash2, Edit2, Check, CreditCard, Building, RefreshCw, Layers, Archive, RotateCcw } from 'lucide-react';

export function AmortizationView() {
  const { budget, addLoan, updateLoan, archiveLoan, unarchiveLoan, deleteLoan, addBill, updateBill } = useBudget();

  // Normalize loans array
  const loans = useMemo(() => {
    if (Array.isArray(budget.loans)) return budget.loans;
    if (budget.loan) {
      return [{
        id: 'loan-1',
        name: budget.loan.name || 'Primary Mortgage',
        description: budget.loan.description || 'Home Loan Mortgage',
        principal: budget.loan.principal || 285000,
        annualInterestRate: budget.loan.annualInterestRate || 6.25,
        termMonths: budget.loan.termMonths || 360,
        monthlyPayment: budget.loan.monthlyPayment || 1756.20,
        extraPayment: budget.loan.extraPayment || 200,
        accountId: 'acc-2',
        interestCompounding: 'monthly',
        paymentFrequency: 'monthly',
        paymentType: 'amortizing',
        isArchived: false,
        startDate: budget.loan.startDate || '2024-01-01'
      }];
    }
    return [];
  }, [budget.loans, budget.loan]);

  const activeLoans = useMemo(() => loans.filter(l => !l.isArchived), [loans]);
  const archivedLoans = useMemo(() => loans.filter(l => l.isArchived), [loans]);

  const [showArchivedLoans, setShowArchivedLoans] = useState(false);
  const [activeLoanId, setActiveLoanId] = useState(activeLoans[0]?.id || loans[0]?.id || 'loan-1');
  const activeLoan = loans.find(l => l.id === activeLoanId) || activeLoans[0] || loans[0] || {};

  const [editingTitleId, setEditingTitleId] = useState(null);
  const [tempTitle, setTempTitle] = useState('');

  // Active Loan Inputs
  const loanName = activeLoan.name || activeLoan.description || 'Loan Schedule';
  const principal = parseFloat(activeLoan.principal) || 0;
  const interestRate = parseFloat(activeLoan.annualInterestRate) || 0;
  const termMonths = parseInt(activeLoan.termMonths) || 360;
  const extraPayment = parseFloat(activeLoan.extraPayment) || 0;
  const linkedAccountId = activeLoan.accountId || '';

  // Mode Switches
  const interestCompounding = activeLoan.interestCompounding || 'monthly'; // 'monthly' | 'daily365' | 'daily360'
  const paymentFrequency = activeLoan.paymentFrequency || 'monthly'; // 'monthly' | 'biweekly' | 'weekly'
  const paymentType = activeLoan.paymentType || 'amortizing'; // 'amortizing' | 'interest_only'

  // Payment periods per year based on frequency
  const periodsPerYear = paymentFrequency === 'weekly' ? 52 : paymentFrequency === 'biweekly' ? 26 : 12;
  const totalPeriods = Math.round(termMonths * (periodsPerYear / 12));

  // Effective interest rate per period
  const periodInterestRate = useMemo(() => {
    const annualDecimal = interestRate / 100;
    if (interestCompounding === 'daily365') {
      // Daily 365 compounding per payment period
      const daysPerPeriod = 365 / periodsPerYear;
      return (annualDecimal / 365) * daysPerPeriod;
    } else if (interestCompounding === 'daily360') {
      // Daily 360 commercial compounding
      const daysPerPeriod = 360 / periodsPerYear;
      return (annualDecimal / 360) * daysPerPeriod;
    } else {
      // Standard monthly compounding
      return annualDecimal / periodsPerYear;
    }
  }, [interestRate, interestCompounding, periodsPerYear]);

  // Calculate scheduled payment per period
  const scheduledPaymentPerPeriod = useMemo(() => {
    if (paymentType === 'interest_only') {
      return principal * periodInterestRate;
    }

    if (periodInterestRate > 0) {
      return (principal * periodInterestRate * Math.pow(1 + periodInterestRate, totalPeriods)) / (Math.pow(1 + periodInterestRate, totalPeriods) - 1);
    }
    return principal / totalPeriods;
  }, [principal, periodInterestRate, totalPeriods, paymentType]);

  // Normalize monthly equivalent payment for display & budgeting
  const monthlyEquivalentPayment = scheduledPaymentPerPeriod * (periodsPerYear / 12);
  const extraPaymentPerPeriod = extraPayment / (periodsPerYear / 12);
  const totalPeriodPayment = scheduledPaymentPerPeriod + extraPaymentPerPeriod;
  const totalMonthlyPayment = monthlyEquivalentPayment + extraPayment;

  // Generate Amortization Schedule with and without extra payments
  const calculateSchedule = (withExtra = true) => {
    let balance = principal;
    const schedule = [];
    let period = 1;
    let totalInterest = 0;
    const extra = withExtra ? extraPaymentPerPeriod : 0;

    while (balance > 0.01 && period <= 1200) {
      const interestForPeriod = balance * periodInterestRate;
      let principalPortion = 0;

      if (paymentType === 'interest_only') {
        principalPortion = 0;
      } else {
        principalPortion = scheduledPaymentPerPeriod - interestForPeriod;
        if (balance < principalPortion) {
          principalPortion = balance;
        }
      }

      let actualExtra = extra;
      if (balance - principalPortion < actualExtra) {
        actualExtra = Math.max(0, balance - principalPortion);
      }

      const totalPrincipalThisPeriod = principalPortion + actualExtra;
      const endingBalance = Math.max(0, balance - totalPrincipalThisPeriod);
      totalInterest += interestForPeriod;

      schedule.push({
        period,
        monthEquivalent: Math.ceil(period / (periodsPerYear / 12)),
        beginningBalance: balance,
        scheduledPayment: scheduledPaymentPerPeriod,
        extraPayment: actualExtra,
        totalPayment: principalPortion + interestForPeriod + actualExtra,
        principalPortion: totalPrincipalThisPeriod,
        interestPortion: interestForPeriod,
        endingBalance
      });

      balance = endingBalance;
      period++;

      // Safety exit for interest-only without extra payments
      if (paymentType === 'interest_only' && extra === 0 && period > totalPeriods) {
        break;
      }
    }

    return { schedule, totalInterest, totalPeriods: period - 1 };
  };

  const withExtraResult = calculateSchedule(true);
  const withoutExtraResult = calculateSchedule(false);

  const interestSaved = Math.max(0, withoutExtraResult.totalInterest - withExtraResult.totalInterest);
  const periodsSaved = Math.max(0, withoutExtraResult.totalPeriods - withExtraResult.totalPeriods);
  const monthsSaved = Math.round(periodsSaved / (periodsPerYear / 12));

  // Payoff date estimation
  const startDate = new Date();
  const payoffMonths = Math.round(withExtraResult.totalPeriods / (periodsPerYear / 12));
  const payoffDate = new Date(startDate.getFullYear(), startDate.getMonth() + payoffMonths, 1);

  // Check if a bill exists matching this loan name and account
  const matchingBill = budget.bills.find(b => b.name.toLowerCase().includes(loanName.toLowerCase()) || (linkedAccountId && b.accountId === linkedAccountId && b.amount === Math.round(totalMonthlyPayment)));

  // Sync / Link payment as a bill to the chosen bank account
  const handleSyncBillToAccount = () => {
    if (!linkedAccountId) return;
    const account = budget.accounts.find(a => a.id === linkedAccountId);
    if (!account) return;

    const billData = {
      name: `${loanName} Payment`,
      amount: parseFloat(totalMonthlyPayment.toFixed(2)),
      period: 'Monthly',
      accountId: linkedAccountId,
      dueDay: 1,
      paymentSource: account.name,
      notes: `Amortization schedule payment (${interestCompounding} compounding, ${paymentFrequency}) for ${loanName}`
    };

    if (matchingBill) {
      updateBill(matchingBill.id, billData);
    } else {
      addBill(billData);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-400" />
            Mortgage & Loan Amortization Tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Simulate Daily vs. Monthly interest compounding, bi-weekly acceleration, and linked bank account payments
          </p>
        </div>
      </div>

      {/* MULTI-LOAN TABS NAVIGATION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {(activeLoans.length > 0 ? activeLoans : loans).map(l => {
            const isActive = l.id === activeLoanId;
            const isEditing = editingTitleId === l.id;

            return (
              <div
                key={l.id}
                onClick={() => {
                  setActiveLoanId(l.id);
                  setShowArchivedLoans(false);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  isActive && !showArchivedLoans
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-md'
                    : 'bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 border-slate-800'
                }`}
              >
                <Building className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tempTitle}
                      onChange={e => setTempTitle(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="bg-slate-900 text-slate-100 px-2 py-0.5 rounded border border-indigo-500 text-xs font-bold outline-none"
                      autoFocus
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tempTitle.trim()) {
                          updateLoan(l.id, { name: tempTitle.trim() });
                        }
                        setEditingTitleId(null);
                      }}
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="truncate max-w-[140px]">{l.name || l.description || 'Loan Schedule'}</span>
                )}

                {isActive && !isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTitleId(l.id);
                      setTempTitle(l.name || l.description || '');
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-200 transition-colors"
                    title="Rename Loan"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}

                {isActive && !isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveLoan(l.id);
                      const next = activeLoans.find(other => other.id !== l.id);
                      if (next) setActiveLoanId(next.id);
                    }}
                    className="p-0.5 text-amber-400/80 hover:text-amber-300 transition-colors ml-0.5"
                    title="Archive Loan Schedule (Hide from active tabs, save schedule & history)"
                  >
                    <Archive className="w-3 h-3" />
                  </button>
                )}

                {loans.length > 1 && isActive && !isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete loan amortization schedule "${l.name}"?`)) {
                        deleteLoan(l.id);
                        setActiveLoanId(loans.find(other => other.id !== l.id)?.id || 'loan-1');
                      }
                    }}
                    className="p-0.5 text-rose-400/70 hover:text-rose-300 transition-colors ml-0.5"
                    title="Delete Loan Schedule Permanently"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add New Loan Button */}
          <button
            onClick={() => {
              const newLoanId = `loan-${Date.now()}`;
              addLoan({
                name: `Loan #${loans.length + 1}`,
                description: 'Mortgage or Debt Loan',
                principal: 200000,
                annualInterestRate: 5.5,
                termMonths: 360,
                extraPayment: 100,
                accountId: '',
                interestCompounding: 'monthly',
                paymentFrequency: 'monthly',
                paymentType: 'amortizing'
              });
              setActiveLoanId(newLoanId);
              setShowArchivedLoans(false);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/80 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Add Loan Schedule</span>
          </button>
        </div>

        {/* ARCHIVED LOANS TOGGLE */}
        {archivedLoans.length > 0 && (
          <button
            onClick={() => setShowArchivedLoans(!showArchivedLoans)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              showArchivedLoans
                ? 'bg-amber-600/20 text-amber-300 border-amber-500/60 shadow-sm'
                : 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-800'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Archived Loans ({archivedLoans.length})</span>
          </button>
        )}
      </div>

      {/* ARCHIVED LOANS PANEL */}
      {showArchivedLoans && archivedLoans.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-800/40 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-amber-900/40 pb-2">
            <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-amber-400" />
              Archived Loan Schedules & Paid-Off Mortgages
            </h3>
            <span className="text-[10px] text-slate-400">
              Archived loans are preserved with full schedules and interest calculations.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {archivedLoans.map(arch => (
              <div key={arch.id} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">{arch.name}</span>
                  <button
                    onClick={() => {
                      unarchiveLoan(arch.id);
                      setActiveLoanId(arch.id);
                      setShowArchivedLoans(false);
                    }}
                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                  <div>Principal: ${parseFloat(arch.principal || 0).toLocaleString()}</div>
                  <div>Interest: {arch.annualInterestRate}% &bull; {arch.termMonths} mos</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Form & Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Inputs Card */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            Loan Parameters ({loanName})
          </h3>
          
          <div className="space-y-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Loan Schedule Name</label>
              <input
                type="text"
                value={loanName}
                onChange={e => updateLoan(activeLoan.id, { name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Principal Loan Amount ($)</label>
              <input
                type="number"
                step="1000"
                value={principal}
                onChange={e => updateLoan(activeLoan.id, { principal: parseFloat(e.target.value) || 0 })}
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
                  onChange={e => updateLoan(activeLoan.id, { annualInterestRate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Term (Months)</label>
                <input
                  type="number"
                  value={termMonths}
                  onChange={e => updateLoan(activeLoan.id, { termMonths: parseInt(e.target.value) || 360 })}
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
                onChange={e => updateLoan(activeLoan.id, { extraPayment: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-indigo-950/60 border border-indigo-700 rounded-lg text-indigo-200 font-mono font-bold focus:outline-none"
              />
            </div>

            {/* SWITCH 1: INTEREST COMPOUNDING METHOD */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <label className="text-slate-300 font-bold block flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Interest Compounding Frequency</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => updateLoan(activeLoan.id, { interestCompounding: 'monthly' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    interestCompounding === 'monthly'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => updateLoan(activeLoan.id, { interestCompounding: 'daily365' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    interestCompounding === 'daily365'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Actual / 365 Days per Year"
                >
                  Daily (365)
                </button>
                <button
                  onClick={() => updateLoan(activeLoan.id, { interestCompounding: 'daily360' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    interestCompounding === 'daily360'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Commercial 30 / 360 Days per Year"
                >
                  Daily (360)
                </button>
              </div>
            </div>

            {/* SWITCH 2: PAYMENT FREQUENCY */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-bold block flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Payment Schedule</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => updateLoan(activeLoan.id, { paymentFrequency: 'monthly' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    paymentFrequency === 'monthly'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => updateLoan(activeLoan.id, { paymentFrequency: 'biweekly' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    paymentFrequency === 'biweekly'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="26 Bi-Weekly Payments / Year"
                >
                  Bi-Weekly
                </button>
                <button
                  onClick={() => updateLoan(activeLoan.id, { paymentFrequency: 'weekly' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    paymentFrequency === 'weekly'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="52 Weekly Payments / Year"
                >
                  Weekly
                </button>
              </div>
            </div>

            {/* SWITCH 3: PAYMENT TYPE */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-bold block flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Payment Mode</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => updateLoan(activeLoan.id, { paymentType: 'amortizing' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    paymentType === 'amortizing'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Principal + Interest
                </button>
                <button
                  onClick={() => updateLoan(activeLoan.id, { paymentType: 'interest_only' })}
                  className={`py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    paymentType === 'interest_only'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Interest Only
                </button>
              </div>
            </div>

            {/* LINKED BANK ACCOUNT SELECTION */}
            <div className="pt-2 border-t border-slate-800">
              <label className="text-slate-300 font-bold block mb-1 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                <span>Payment Account Source</span>
              </label>
              <select
                value={linkedAccountId}
                onChange={e => updateLoan(activeLoan.id, { accountId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:outline-none focus:border-blue-500 text-xs cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-400">Do Not Link to Account (Not Shown)</option>
                {budget.accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100">
                    {acc.name}
                  </option>
                ))}
              </select>

              {linkedAccountId && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-blue-950/40 border border-blue-800/60 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-blue-300 font-semibold">Monthly Equivalent Payment:</span>
                    <span className="font-mono font-bold text-slate-100">${totalMonthlyPayment.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={handleSyncBillToAccount}
                    className="w-full py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{matchingBill ? 'Update Linked Bill' : 'Add Monthly Bill to Account'}</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Loan Summary Metrics Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Payoff Acceleration Highlight */}
          <div className="sm:col-span-2 p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-teal-900/40 to-slate-900 border border-emerald-800/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Sparkles className="w-4 h-4" />
                Payoff Savings Summary ({loanName})
              </div>
              <span className="text-[10px] text-slate-400 font-mono bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-800">
                {interestCompounding.toUpperCase()} COMPOUNDING
              </span>
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
            <span className="text-xs text-slate-400 block">Payment / {paymentFrequency === 'weekly' ? 'Week' : paymentFrequency === 'biweekly' ? '2 Weeks' : 'Month'}</span>
            <span className="text-xl font-bold text-slate-100 font-mono">
              ${scheduledPaymentPerPeriod.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 block">(${monthlyEquivalentPayment.toFixed(2)} / mo eq.)</span>
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
        <h3 className="text-base font-bold text-slate-200">
          Amortization Schedule for {loanName} ({paymentFrequency.toUpperCase()} &bull; {interestCompounding.toUpperCase()} COMPOUNDING)
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 glass-panel">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-medium border-b border-slate-800">
              <tr>
                <th className="p-3">Period #</th>
                <th className="p-3 text-right">Beginning Balance</th>
                <th className="p-3 text-right">Scheduled Payment</th>
                <th className="p-3 text-right">Extra Payment</th>
                <th className="p-3 text-right">Principal</th>
                <th className="p-3 text-right">Interest</th>
                <th className="p-3 text-right">Ending Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 font-mono">
              {withExtraResult.schedule.slice(0, 36).map(row => (
                <tr key={row.period} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-3 font-semibold text-slate-300">#{row.period}</td>
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
