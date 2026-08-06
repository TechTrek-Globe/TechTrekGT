import React, { useState, useEffect } from 'react';
import { useBudget } from '../context/BudgetContext';
import {
  ArrowRightLeft,
  Filter,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { fmtMoney } from '../utils/formatters';
import { getAccountSaveExtraPersonPortion } from '../utils/paydayUtils';

// Account Funding & Transfer Breakdown Component
export function AccountTransferSummary() {
  const {
    budget,
    getAccountMonthlyExpenses,
    getBillPersonMonthlyPortion,
    getTotalMonthlyExpenses,
    getPersonDepositAmountForAccount
  } = useBudget();

  // State to toggle which earner columns are visible in this table
  const [visiblePersonIds, setVisiblePersonIds] = useState(() => new Set(budget.people.map(p => p.id)));
  // State for earner portion mode override: personId -> 'monthly' | 'paycheck'
  const [personPortionModes, setPersonPortionModes] = useState({});
  // Calculation Basis: 'auto' | 'direct_deposit' | 'bills'
  const [basisMode, setBasisMode] = useState('auto');

  // Keep visiblePersonIds in sync if people change
  useEffect(() => {
    setVisiblePersonIds(prev => {
      const next = new Set();
      budget.people.forEach(p => {
        if (prev.has(p.id) || prev.size === 0) {
          next.add(p.id);
        }
      });
      return next.size > 0 ? next : new Set(budget.people.map(p => p.id));
    });
  }, [budget.people]);

  const togglePersonVisibility = (id) => {
    setVisiblePersonIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const togglePersonMode = (id, currentMode) => {
    setPersonPortionModes(prev => ({
      ...prev,
      [id]: currentMode === 'paycheck' ? 'monthly' : 'paycheck'
    }));
  };

  const visiblePeople = budget.people.filter(p => visiblePersonIds.has(p.id));

  // Compute per-account rows data
  const accountRows = budget.accounts.map(acc => {
    const accountBills = budget.bills.filter(b => b.accountId === acc.id);
    const monthlyExpenses = getAccountMonthlyExpenses(acc.id);

    // Earner portions for this account
    const earnerPortions = {};
    visiblePeople.forEach(p => {
      const defaultMode = (p.payFrequency === 'bi-weekly' || p.payFrequency === 'semi-monthly' || p.payFrequency === 'weekly') ? 'paycheck' : 'monthly';
      const mode = personPortionModes[p.id] || defaultMode;
      const hasAllocations = p.accountAllocations && typeof p.accountAllocations === 'object' && Object.values(p.accountAllocations).some(v => parseFloat(v) > 0 || v === 'remaining');

      let rawPortion = 0;
      if (basisMode === 'direct_deposit' || (basisMode === 'auto' && hasAllocations)) {
        const perPaycheckDeposit = getPersonDepositAmountForAccount(p, acc.id);
        if (mode === 'paycheck') {
          rawPortion = perPaycheckDeposit;
        } else {
          if (p.payFrequency === 'bi-weekly') {
            rawPortion = (perPaycheckDeposit * 26) / 12;
          } else if (p.payFrequency === 'weekly') {
            rawPortion = (perPaycheckDeposit * 52) / 12;
          } else if (p.payFrequency === 'semi-monthly') {
            rawPortion = perPaycheckDeposit * 2;
          } else {
            rawPortion = perPaycheckDeposit;
          }
        }
      } else {
        const extraPortion = getAccountSaveExtraPersonPortion(acc, p, budget);
        const monthlyPortion = accountBills.reduce((sum, b) => sum + getBillPersonMonthlyPortion(b, p.id), 0) + extraPortion;
        rawPortion = mode === 'paycheck'
          ? (p.payFrequency === 'weekly' ? (monthlyPortion * 12) / 52 : monthlyPortion / 2)
          : monthlyPortion;
      }

      earnerPortions[p.id] = Math.round(rawPortion * 100) / 100;
    });

    const regBal = parseFloat(acc.startingBalance) || 0;
    const extraBal = parseFloat(acc.extraStartingBalance) || 0;
    const totalBal = regBal + extraBal;
    const isOk = totalBal >= monthlyExpenses;

    return {
      account: acc,
      earnerPortions,
      regBal,
      extraBal,
      totalBal,
      monthlyExpenses,
      isOk
    };
  });

  // Calculate Column Grand Totals for Footer Row
  const totalRegBal = accountRows.reduce((sum, r) => sum + r.regBal, 0);
  const totalExtraBal = accountRows.reduce((sum, r) => sum + r.extraBal, 0);
  const grandTotalBal = accountRows.reduce((sum, r) => sum + r.totalBal, 0);
  const totalExpenses = getTotalMonthlyExpenses();
  const isOverallOk = grandTotalBal >= totalExpenses;

  const earnerGrandTotals = {};
  visiblePeople.forEach(p => {
    earnerGrandTotals[p.id] = accountRows.reduce((sum, r) => sum + (r.earnerPortions[p.id] || 0), 0);
  });

  const isLight = budget?.theme === 'light';

  return (
    <div className={`p-5 rounded-2xl space-y-4 border ${
      isLight ? 'bg-white border-slate-200 text-slate-900 shadow-md' : 'border-emerald-900/40 bg-gradient-to-b from-slate-900/90 to-slate-950/90 text-slate-100'
    }`}>
      {/* Header & Controls Bar */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-2 border-b ${
        isLight ? 'border-slate-200' : 'border-slate-800'
      }`}>
        <div>
          <h3 className={`text-sm font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            <ArrowRightLeft className="w-4 h-4 text-emerald-500" />
            Account Funding &amp; Transfer Breakdown
          </h3>
          <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Calculates funds to transfer into separate accounts based on {basisMode === 'bills' ? 'earner bill split allocations' : 'earner Direct Deposit per-account setup'}
          </p>
        </div>

        {/* Control Options */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Basis Mode Toggle Pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}>
            <span className={`text-[10px] font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Basis:
            </span>
            <button
              type="button"
              onClick={() => setBasisMode(prev => {
                if (prev === 'auto') return 'bills';
                if (prev === 'bills') return 'direct_deposit';
                return 'auto';
              })}
              className={`px-2 py-0.5 text-[10px] rounded-lg font-bold transition-all ${
                basisMode === 'bills'
                  ? isLight ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-purple-950 text-purple-300 border border-purple-800'
                  : basisMode === 'direct_deposit'
                    ? isLight ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-blue-950 text-blue-300 border border-blue-800'
                    : isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm' : 'bg-emerald-950 text-emerald-300 border border-emerald-800/80 shadow-sm'
              }`}
              title="Click to cycle basis: Auto -> Bill Split Ratios -> Direct Deposit -> Auto"
            >
              {basisMode === 'bills' ? 'Bill Split Ratios' : basisMode === 'direct_deposit' ? 'Direct Deposit' : 'Auto Setup'}
            </button>
          </div>

          {/* Earner Column Display Options */}
          <div className={`flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl border ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}>
            <span className={`text-[10px] font-semibold flex items-center gap-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <Filter className="w-3 h-3 text-emerald-500" />
              Tracked Earners:
            </span>
            {budget.people.map(p => {
              const isVisible = visiblePersonIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePersonVisibility(p.id)}
                  className={`px-2 py-0.5 text-[10px] rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    isVisible
                      ? isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm' : 'bg-emerald-950 text-emerald-300 border border-emerald-800/80 shadow-sm'
                      : isLight ? 'bg-slate-200 text-slate-400 border border-slate-300 line-through opacity-60' : 'bg-slate-900 text-slate-500 border border-slate-800 line-through opacity-60'
                  }`}
                  title={isVisible ? `Hide ${p.name} from transfer summary` : `Show ${p.name} in transfer summary`}
                >
                  {isVisible ? <Eye className="w-2.5 h-2.5 text-emerald-500" /> : <EyeOff className="w-2.5 h-2.5" />}
                  {p.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`overflow-x-auto matrix-scrollbar rounded-xl border shadow-lg ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
        <table className="w-full text-left text-xs border-collapse">
          {/* Header Row: High-Contrast Green Header Bar */}
          <thead className={`${isLight ? 'bg-emerald-800 text-white' : 'bg-emerald-950/90 text-emerald-100'} font-extrabold text-[11px] border-b ${isLight ? 'border-emerald-700' : 'border-emerald-800/60'}`}>
            <tr>
              <th className="p-3 bg-emerald-950 text-emerald-200">Account Name</th>
              {visiblePeople.map(p => {
                const defaultMode = (p.payFrequency === 'bi-weekly' || p.payFrequency === 'semi-monthly' || p.payFrequency === 'weekly') ? 'paycheck' : 'monthly';
                const mode = personPortionModes[p.id] || defaultMode;
                const isPerPaycheck = mode === 'paycheck';
                const labelText = isPerPaycheck
                  ? (p.payFrequency === 'semi-monthly' ? 'Semi-Monthly' : 'Per Paycheck')
                  : 'Monthly';
                return (
                  <th key={`hdr-p-${p.id}`} className="p-3 text-right bg-emerald-950">
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-emerald-100">{p.name.split(' ')[0]} Portion</span>
                      <button
                        type="button"
                        onClick={() => togglePersonMode(p.id, mode)}
                        className="text-xs font-mono text-emerald-400 hover:text-emerald-200 underline transition-colors"
                        title="Click to toggle between Monthly and Per-Paycheck target"
                      >
                        ({labelText})
                      </button>
                    </div>
                  </th>
                );
              })}
              <th className="p-3 text-right bg-emerald-950 text-emerald-200">Current Regular Balance</th>
              <th className="p-3 text-right bg-emerald-950 text-emerald-200">Extra Balance</th>
              <th className="p-3 text-right bg-emerald-950 text-emerald-100 font-black">Total Current Balance</th>
              <th className="p-3 text-center bg-emerald-950 text-emerald-200">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
            {accountRows.map((r, idx) => {
              const bgStyle = idx % 3 === 0
                ? 'bg-purple-950/15 hover:bg-purple-950/25'
                : idx % 3 === 1
                  ? 'bg-rose-950/15 hover:bg-rose-950/25'
                  : 'bg-blue-950/15 hover:bg-blue-950/25';

              return (
                <tr key={r.account.id} className={`${bgStyle} transition-colors`}>
                  {/* Account Name */}
                  <td className="p-3 font-semibold text-purple-300 font-sans">
                    Amount To {r.account.name}
                  </td>

                  {/* Earner Portions */}
                  {visiblePeople.map(p => (
                    <td key={`cell-p-${r.account.id}-${p.id}`} className="p-3 text-right text-purple-300/90 font-medium">
                      {fmtMoney(r.earnerPortions[p.id])}
                    </td>
                  ))}

                  {/* Current Regular Balance */}
                  <td className="p-3 text-right text-rose-300/90 font-medium">
                    {fmtMoney(r.regBal)}
                  </td>

                  {/* Extra Balance */}
                  <td className="p-3 text-right text-rose-300/90 font-medium">
                    {fmtMoney(r.extraBal)}
                  </td>

                  {/* Total Current Balance */}
                  <td className="p-3 text-right font-black text-rose-300">
                    {fmtMoney(r.totalBal)}
                  </td>

                  {/* Status */}
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      r.isOk
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                    }`}>
                      {r.isOk ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          OK
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          LOW
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Footer Row: TOTAL ALL ACCOUNTS (Dark Green Footer Bar) */}
          <tfoot className="bg-emerald-950 text-emerald-100 font-black text-xs border-t-2 border-emerald-700">
            <tr>
              <td className="p-3 font-sans uppercase tracking-wider bg-emerald-950 text-emerald-200">
                TOTAL ALL ACCOUNTS
              </td>
              {visiblePeople.map(p => (
                <td key={`foot-p-${p.id}`} className="p-3 text-right font-mono text-emerald-300">
                  {fmtMoney(earnerGrandTotals[p.id])}
                </td>
              ))}
              <td className="p-3 text-right font-mono text-emerald-300">
                {fmtMoney(totalRegBal)}
              </td>
              <td className="p-3 text-right font-mono text-emerald-300">
                {fmtMoney(totalExtraBal)}
              </td>
              <td className="p-3 text-right font-mono text-emerald-100 font-extrabold text-sm">
                {fmtMoney(grandTotalBal)}
              </td>
              <td className="p-3 text-center bg-emerald-900/60">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                  isOverallOk
                    ? 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}>
                  {isOverallOk ? <CheckCircle2 className="w-3 h-3 text-emerald-300" /> : <AlertTriangle className="w-3 h-3 text-rose-400" />}
                  {isOverallOk ? 'OK' : 'LOW'}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
