import React, { useState, useMemo, useCallback } from 'react';
import { useBudget } from '../context/BudgetContext';
import {
  Wallet,
  Calendar,
  Filter,
  ReceiptText,
  Pencil,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Info
} from 'lucide-react';
import { InlineEdit } from './InlineEdit';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper to format currency for grid display ($100.00 or $ -)
function fmtGrid(val) {
  if (val === undefined || val === null || isNaN(val) || val === 0) {
    return '$ -';
  }
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Inline cell editor for matrix cells
function MatrixCell({ value, onCommit, isCredit = false, isBill = false, isTotal = false, isNegative = false }) {
  const isZero = !value || value === 0;

  return (
    <InlineEdit
      value={value || 0}
      type="currency"
      onCommit={onCommit}
      displayFn={() => (
        <span
          className={`font-mono text-xs ${
            isTotal
              ? isNegative ? 'text-rose-400 font-bold' : 'text-slate-100 font-bold'
              : isCredit
                ? isZero ? 'text-slate-600' : 'text-emerald-400 font-semibold'
                : isBill
                  ? isZero ? 'text-slate-600' : 'text-rose-300 font-semibold'
                  : isZero ? 'text-slate-600' : 'text-slate-300'
          }`}
        >
          {fmtGrid(value)}
        </span>
      )}
      className="justify-end w-full"
    />
  );
}

// ==========================================
// 1. MULTI-COLUMN DAILY SPREADSHEET MATRIX
// ==========================================
function DailySpreadsheetMatrix() {
  const {
    budget,
    getBillMonthlyCost,
    getDailyMatrixCell,
    updateDailyMatrixCell,
    updateBill,
    updateAccount
  } = useBudget();

  const today = new Date();
  const [selectedAccountId, setSelectedAccountId] = useState(budget.accounts[1]?.id || budget.accounts[0]?.id || 'all');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  // Active account(s)
  const selectedAccount = budget.accounts.find(a => a.id === selectedAccountId);

  // Relevant bills assigned to this account
  const accountBills = useMemo(() => {
    if (selectedAccountId === 'all') return budget.bills;
    return budget.bills.filter(b => b.accountId === selectedAccountId);
  }, [budget.bills, selectedAccountId]);

  // Household earners
  const people = budget.people || [];

  // Generate daily matrix rows
  const matrixData = useMemo(() => {
    const rows = [];

    // Starting balances
    let runningRegBeg = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.startingBalance) || 0), 0)
      : (parseFloat(selectedAccount?.startingBalance) || 0);

    let runningExtraBeg = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.extraStartingBalance) || 0), 0)
      : (parseFloat(selectedAccount?.extraStartingBalance) || 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(selectedYear, selectedMonth, day);
      const dayOfWeekName = DAYS_OF_WEEK[dateObj.getDay()];
      const isMonday = dateObj.getDay() === 1;
      const isFirstOr15th = day === 1 || day === 15;
      const isPayday = isMonday || isFirstOr15th;

      // 1. Credits (Deposits)
      const personCredits = {};
      const personExtraCredits = {};

      people.forEach(p => {
        const customCredit = getDailyMatrixCell(selectedAccountId, monthKey, day, `credit_${p.id}`);
        const customExtraCredit = getDailyMatrixCell(selectedAccountId, monthKey, day, `extra_credit_${p.id}`);

        if (customCredit !== undefined) {
          personCredits[p.id] = parseFloat(customCredit) || 0;
        } else {
          // Auto-calculate payday deposits
          let autoDep = 0;
          if (p.payFrequency === 'bi-weekly' && (day === 15 || day === 28 || (isMonday && day <= 14))) {
            autoDep = p.netPerPay || 0;
          } else if (p.payFrequency === 'monthly' && day === 1) {
            autoDep = p.netPerPay || 0;
          }
          personCredits[p.id] = autoDep;
        }

        personExtraCredits[p.id] = customExtraCredit !== undefined ? (parseFloat(customExtraCredit) || 0) : 0;
      });

      const totalRegCredits = Object.values(personCredits).reduce((s, v) => s + v, 0);
      const totalExtraCredits = Object.values(personExtraCredits).reduce((s, v) => s + v, 0);

      // 2. Bill Deductions
      const billValues = {};
      let totalDayBills = 0;

      accountBills.forEach(b => {
        const customBillVal = getDailyMatrixCell(selectedAccountId, monthKey, day, `bill_${b.id}`);
        let amt = 0;

        if (customBillVal !== undefined) {
          amt = parseFloat(customBillVal) || 0;
        } else if (parseInt(b.dueDay) === day) {
          amt = getBillMonthlyCost(b);
        }

        billValues[b.id] = amt;
        totalDayBills += amt;
      });

      // 3. Other Expense
      const customOther = getDailyMatrixCell(selectedAccountId, monthKey, day, 'other_amount');
      const otherAmt = customOther !== undefined ? (parseFloat(customOther) || 0) : 0;
      const customOtherDesc = getDailyMatrixCell(selectedAccountId, monthKey, day, 'other_desc') || '';
      totalDayBills += otherAmt;

      // 4. Calculate Ending Balances
      const regEnding = runningRegBeg + totalRegCredits - totalDayBills;
      const extraEnding = runningExtraBeg + totalExtraCredits;
      const totalEnd = regEnding + extraEnding;

      rows.push({
        day,
        dateFormatted: `${selectedMonth + 1}/${day}/${selectedYear}`,
        dayOfWeekName,
        isPayday,
        regBeg: runningRegBeg,
        extraBeg: runningExtraBeg,
        personCredits,
        personExtraCredits,
        totalRegCredits,
        totalExtraCredits,
        billValues,
        otherAmt,
        otherDesc: customOtherDesc,
        regEnding,
        extraEnding,
        totalEnd,
        isDeficit: totalEnd < 0
      });

      // Carry forward to next day
      runningRegBeg = regEnding;
      runningExtraBeg = extraEnding;
    }

    return rows;
  }, [
    selectedAccountId,
    selectedMonth,
    selectedYear,
    daysInMonth,
    selectedAccount,
    budget.accounts,
    accountBills,
    people,
    getDailyMatrixCell,
    getBillMonthlyCost
  ]);

  // Column totals
  const columnTotals = useMemo(() => {
    const totals = {
      regCredits: {},
      extraCredits: {},
      bills: {},
      other: 0,
      totalRegCredits: 0,
      totalExtraCredits: 0,
      totalBills: 0
    };

    people.forEach(p => {
      totals.regCredits[p.id] = 0;
      totals.extraCredits[p.id] = 0;
    });

    accountBills.forEach(b => {
      totals.bills[b.id] = 0;
    });

    matrixData.forEach(r => {
      people.forEach(p => {
        totals.regCredits[p.id] += r.personCredits[p.id] || 0;
        totals.extraCredits[p.id] += r.personExtraCredits[p.id] || 0;
      });

      accountBills.forEach(b => {
        totals.bills[b.id] += r.billValues[b.id] || 0;
      });

      totals.other += r.otherAmt || 0;
      totals.totalRegCredits += r.totalRegCredits;
      totals.totalExtraCredits += r.totalExtraCredits;
    });

    totals.totalBills = Object.values(totals.bills).reduce((s, v) => s + v, 0) + totals.other;

    return totals;
  }, [matrixData, people, accountBills]);

  const finalEndingBalance = matrixData[matrixData.length - 1]?.totalEnd || 0;

  const showExtraColumns = selectedAccountId === 'all'
    ? budget.accounts.some(a => a.enableExtraSavings !== false)
    : (selectedAccount?.enableExtraSavings !== false);

  return (
    <div className="space-y-4">

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl glass-panel space-y-0.5">
          <span className="text-[11px] text-slate-400 block">Month Start Balance</span>
          <span className="text-lg font-black text-slate-100 font-mono block">
            ${(matrixData[0]?.regBeg || 0).toFixed(2)}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl glass-panel space-y-0.5">
          <span className="text-[11px] text-slate-400 block">Total Deposits (+)</span>
          <span className="text-lg font-black text-emerald-400 font-mono block">
            +${columnTotals.totalRegCredits.toFixed(2)}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl glass-panel space-y-0.5">
          <span className="text-[11px] text-slate-400 block">Total Bill Deductions (-)</span>
          <span className="text-lg font-black text-rose-400 font-mono block">
            -${columnTotals.totalBills.toFixed(2)}
          </span>
        </div>

        <div className="p-3.5 rounded-2xl glass-panel space-y-0.5">
          <span className="text-[11px] text-slate-400 block">Month End Total Balance</span>
          <span className={`text-lg font-black font-mono block ${finalEndingBalance < 0 ? 'text-rose-400' : 'text-blue-400'}`}>
            ${finalEndingBalance.toFixed(2)}
          </span>
        </div>
      </div>

      {/* SPREADSHEET MATRIX TABLE CONTAINER (Sticky at top-14 Red Line) */}
      <div className="sticky top-14 z-30 overflow-auto max-h-[calc(100vh-75px)] min-h-[500px] rounded-2xl border border-slate-800 glass-panel shadow-2xl relative">

        {/* Compact Sticky Toolbar - Tier 1 (top-0 z-40) */}
        <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">Daily Register Matrix &amp; Cash Flow</h3>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Account Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
              <Filter className="w-3 h-3 text-slate-400" />
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none"
              >
                <option value="all">All Accounts Combined</option>
                {budget.accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>

            {/* Month / Year Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
              <Calendar className="w-3 h-3 text-slate-400" />
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={selectedYear}
                onChange={e => setSelectedYear(parseInt(e.target.value) || today.getFullYear())}
                className="w-14 bg-transparent text-xs font-mono text-slate-200 focus:outline-none text-center"
              />
            </div>
          </div>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          {/* Header Row 1 & 2: Sticky Tier 2 (top-[37px] z-30) */}
          <thead className="sticky top-[37px] z-30 bg-slate-900 shadow-md">
            <tr className="bg-slate-900 text-slate-400 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-800">
              <th colSpan={2} className="p-2.5 text-center border-r border-slate-800 bg-slate-900">Date &amp; Day</th>
              <th colSpan={showExtraColumns ? 2 : 1} className="p-2.5 text-center border-r border-slate-800 bg-blue-950/80 text-blue-300">Beginning Balances</th>
              <th colSpan={people.length * (showExtraColumns ? 2 : 1)} className="p-2.5 text-center border-r border-slate-800 bg-emerald-950/80 text-emerald-300">Credits (Deposits)</th>
              <th colSpan={accountBills.length + 1} className="p-2.5 text-center border-r border-slate-800 bg-rose-950/80 text-rose-300">Bills &amp; Scheduled Deductions</th>
              <th colSpan={showExtraColumns ? 3 : 2} className="p-2.5 text-center border-r border-slate-800 bg-purple-950/80 text-purple-300">Ending Balances</th>
              <th className="p-2.5 text-center bg-slate-900">Notes</th>
            </tr>

            {/* Header Row 2: Individual Columns */}
            <tr className="bg-slate-900 text-slate-300 font-bold text-[11px] border-b border-slate-800">
              {/* Date & Day */}
              <th className="p-2.5 min-w-[80px] bg-slate-900">Date</th>
              <th className="p-2.5 min-w-[90px] bg-slate-900 border-r border-slate-800">Day</th>

              {/* Beg Balances */}
              <th className="p-2.5 text-right min-w-[95px] bg-slate-900">Beg Balance</th>
              {showExtraColumns && (
                <th className="p-2.5 text-right min-w-[95px] border-r border-slate-800 bg-slate-900">Extra Beg</th>
              )}

              {/* Credits */}
              {people.map(p => (
                <th key={`hdr-cred-${p.id}`} className="p-2.5 text-right min-w-[95px] text-emerald-400 bg-slate-900">
                  {p.name.split(' ')[0]} Credit
                </th>
              ))}
              {showExtraColumns && people.map(p => (
                <th key={`hdr-ext-cred-${p.id}`} className="p-2.5 text-right min-w-[95px] text-emerald-300 bg-slate-900 border-r border-slate-800">
                  {p.name.split(' ')[0]} Extra
                </th>
              ))}

              {/* Bill Columns */}
              {accountBills.map(b => (
                <th key={`hdr-bill-${b.id}`} className="p-2.5 text-right min-w-[110px] text-rose-300 bg-slate-900">
                  {b.name}
                </th>
              ))}
              <th className="p-2.5 text-right min-w-[85px] text-rose-300 bg-slate-900 border-r border-slate-800">Other</th>

              {/* Ending Balances */}
              <th className="p-2.5 text-right min-w-[100px] text-slate-200 bg-slate-900">Reg Ending</th>
              {showExtraColumns && (
                <th className="p-2.5 text-right min-w-[100px] text-slate-200 bg-slate-900">Extra Ending</th>
              )}
              <th className="p-2.5 text-right min-w-[105px] text-blue-300 font-extrabold bg-slate-900 border-r border-slate-800">Total End</th>

              {/* Notes */}
              <th className="p-2.5 min-w-[140px] bg-slate-900">Other Description</th>
            </tr>
          </thead>

          {/* Matrix Rows (1 per day) */}
          <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
            {matrixData.map(row => (
              <tr
                key={row.day}
                className={`transition-colors hover:bg-slate-800/40 ${
                  row.isDeficit
                    ? 'bg-rose-950/30'
                    : row.isPayday
                      ? 'bg-emerald-950/25 border-l-4 border-l-emerald-500'
                      : ''
                }`}
              >
                {/* Date */}
                <td className="p-2.5 font-semibold text-slate-300 whitespace-nowrap">{row.dateFormatted}</td>

                {/* Day of Week */}
                <td className="p-2.5 whitespace-nowrap border-r border-slate-800/40">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    row.isPayday
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400'
                  }`}>
                    {row.dayOfWeekName}
                  </span>
                </td>

                {/* Beg Balance */}
                <td className="p-2.5 text-right text-slate-400">${row.regBeg.toFixed(2)}</td>

                {/* Extra Beg Balance */}
                {showExtraColumns && (
                  <td className="p-2.5 text-right text-slate-400 border-r border-slate-800/80">${row.extraBeg.toFixed(2)}</td>
                )}

                {/* Earner Credits (Inline Editable) */}
                {people.map(p => (
                  <td key={`cred-${row.day}-${p.id}`} className="p-2.5 text-right">
                    <MatrixCell
                      value={row.personCredits[p.id]}
                      isCredit
                      onCommit={val => updateDailyMatrixCell(selectedAccountId, monthKey, row.day, `credit_${p.id}`, val)}
                    />
                  </td>
                ))}

                {/* Earner Extra Credits (Inline Editable) */}
                {showExtraColumns && people.map(p => (
                  <td key={`ext-cred-${row.day}-${p.id}`} className="p-2.5 text-right border-r border-slate-800/80">
                    <MatrixCell
                      value={row.personExtraCredits[p.id]}
                      isCredit
                      onCommit={val => updateDailyMatrixCell(selectedAccountId, monthKey, row.day, `extra_credit_${p.id}`, val)}
                    />
                  </td>
                ))}

                {/* Individual Bill Columns (Inline Editable) */}
                {accountBills.map(b => (
                  <td key={`bill-${row.day}-${b.id}`} className="p-2.5 text-right">
                    <MatrixCell
                      value={row.billValues[b.id]}
                      isBill
                      onCommit={val => updateDailyMatrixCell(selectedAccountId, monthKey, row.day, `bill_${b.id}`, val)}
                    />
                  </td>
                ))}

                {/* Other Expense Column */}
                <td className="p-2.5 text-right border-r border-slate-800/80">
                  <MatrixCell
                    value={row.otherAmt}
                    isBill
                    onCommit={val => updateDailyMatrixCell(selectedAccountId, monthKey, row.day, 'other_amount', val)}
                  />
                </td>

                {/* Regular Ending Balance */}
                <td className="p-2.5 text-right font-bold text-slate-200">${row.regEnding.toFixed(2)}</td>

                {/* Extra Ending Balance */}
                {showExtraColumns && (
                  <td className="p-2.5 text-right text-slate-300">${row.extraEnding.toFixed(2)}</td>
                )}

                {/* Total End Balance */}
                <td className={`p-2.5 text-right font-extrabold border-r border-slate-800/80 ${row.isDeficit ? 'text-rose-400 animate-pulse' : 'text-blue-300'}`}>
                  ${row.totalEnd.toFixed(2)}
                </td>

                {/* Other Description */}
                <td className="p-2.5">
                  <input
                    type="text"
                    placeholder="—"
                    value={row.otherDesc}
                    onChange={e => updateDailyMatrixCell(selectedAccountId, monthKey, row.day, 'other_desc', e.target.value)}
                    className="bg-transparent text-xs text-slate-300 hover:bg-slate-800/60 focus:bg-slate-800 px-1.5 py-0.5 rounded outline-none w-full"
                  />
                </td>
              </tr>
            ))}
          </tbody>

          {/* Matrix Footers (Sticky Totals) */}
          <tfoot className="sticky bottom-0 z-30 bg-slate-900 font-extrabold text-xs text-slate-100 border-t-2 border-slate-700 shadow-lg">
            <tr>
              <td colSpan={2} className="p-3 text-slate-300 bg-slate-900 border-r border-slate-800">Monthly Subtotals</td>
              <td className="p-3 text-right text-slate-400 bg-slate-900">&mdash;</td>
              {showExtraColumns && (
                <td className="p-3 text-right text-slate-400 bg-slate-900 border-r border-slate-800">&mdash;</td>
              )}

              {/* Credit Subtotals */}
              {people.map(p => (
                <td key={`tot-cred-${p.id}`} className="p-3 text-right text-emerald-400 font-mono bg-slate-900">
                  +${columnTotals.regCredits[p.id].toFixed(2)}
                </td>
              ))}
              {showExtraColumns && people.map(p => (
                <td key={`tot-ext-cred-${p.id}`} className="p-3 text-right text-emerald-300 font-mono bg-slate-900 border-r border-slate-800">
                  +${columnTotals.extraCredits[p.id].toFixed(2)}
                </td>
              ))}

              {/* Bill Subtotals */}
              {accountBills.map(b => (
                <td key={`tot-bill-${b.id}`} className="p-3 text-right text-rose-400 font-mono bg-slate-900">
                  -${columnTotals.bills[b.id].toFixed(2)}
                </td>
              ))}
              <td className="p-3 text-right text-rose-300 font-mono bg-slate-900 border-r border-slate-800">
                -${columnTotals.other.toFixed(2)}
              </td>

              {/* Ending Balances Subtotals */}
              <td className="p-3 text-right font-mono text-slate-200 bg-slate-900">&mdash;</td>
              {showExtraColumns && (
                <td className="p-3 text-right font-mono text-slate-200 bg-slate-900">&mdash;</td>
              )}
              <td className="p-3 text-right font-mono text-blue-400 font-black bg-slate-900 border-r border-slate-800">
                ${finalEndingBalance.toFixed(2)}
              </td>
              <td className="p-3 bg-slate-900">&mdash;</td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  );
}

// ==========================================
// 2. MAIN LEDGER VIEW WRAPPER WITH TABS
// ==========================================
export function LedgerView() {
  return (
    <div className="space-y-4 pb-[300px]">
      <DailySpreadsheetMatrix />
    </div>
  );
}
