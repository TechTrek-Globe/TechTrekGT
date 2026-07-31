import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
  Info,
  Archive,
  RotateCcw
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
    archiveBill,
    unarchiveBill,
    updateAccount
  } = useBudget();

  const today = new Date();
  const [selectedAccountId, setSelectedAccountId] = useState(budget.accounts[1]?.id || budget.accounts[0]?.id || 'all');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [showArchivedBills, setShowArchivedBills] = useState(false);

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  const todayRowRef = useRef(null);

  // Active account(s)
  const selectedAccount = budget.accounts.find(a => a.id === selectedAccountId);

  // Today's date matching
  const todayObj = useMemo(() => new Date(), []);
  const isCurrentMonthView = todayObj.getMonth() === selectedMonth && todayObj.getFullYear() === selectedYear;
  const currentDayNum = todayObj.getDate();

  // Relevant active bills assigned to this account
  const accountBills = useMemo(() => {
    if (selectedAccountId === 'all') return budget.bills.filter(b => !b.isArchived);
    return budget.bills.filter(b => b.accountId === selectedAccountId && !b.isArchived);
  }, [budget.bills, selectedAccountId]);

  // Archived bills list for this account
  const archivedBills = useMemo(() => {
    if (selectedAccountId === 'all') return budget.bills.filter(b => b.isArchived);
    return budget.bills.filter(b => b.accountId === selectedAccountId && b.isArchived);
  }, [budget.bills, selectedAccountId]);

  // Household earners
  const people = budget.people || [];

  // Generate daily matrix rows for selected month
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
      const isToday = isCurrentMonthView && day === currentDayNum;

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

      // 2. Individual Bill Deductions
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
        isToday,
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
    getBillMonthlyCost,
    isCurrentMonthView,
    currentDayNum
  ]);

  // Auto-scroll to today's row when matrix loads or filters change
  useEffect(() => {
    if (todayRowRef.current) {
      todayRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedMonth, selectedYear, selectedAccountId]);

  // Column totals for selected month
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
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* SPREADSHEET MATRIX TABLE CONTAINER (Top-Level Viewport Locked) */}
      <div className="flex-1 min-h-0 overflow-auto matrix-scrollbar rounded-2xl border border-slate-800 glass-panel shadow-2xl relative">

        {/* Compact Sticky Toolbar - Tier 1 (top-0 z-40) */}
        <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">Daily Register Matrix &amp; Cash Flow</h3>
          </div>

          {/* Integrated KPI Metrics Pill Bar */}
          <div className="hidden xl:flex items-center gap-3 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 text-[11px] font-mono">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Start:</span>
              <span className="text-slate-200 font-bold">${(matrixData[0]?.regBeg || 0).toFixed(2)}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Deposits:</span>
              <span className="text-emerald-400 font-bold">+${columnTotals.totalRegCredits.toFixed(2)}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Bills:</span>
              <span className="text-rose-400 font-bold">-${columnTotals.totalBills.toFixed(2)}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <span className="text-slate-400">End Total:</span>
              <span className={`font-bold ${finalEndingBalance < 0 ? 'text-rose-400' : 'text-blue-400'}`}>
                ${finalEndingBalance.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Account Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-blue-500/50 shadow-sm transition-all text-xs">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-slate-100 py-1">All Accounts Combined</option>
                {budget.accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100 py-1">{acc.name}</option>
                ))}
              </select>
            </div>

            {/* Month / Year Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 hover:border-blue-500/50 shadow-sm transition-all text-xs">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold text-slate-100 focus:outline-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i} className="bg-slate-900 text-slate-100 py-1">{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={selectedYear}
                onChange={e => setSelectedYear(parseInt(e.target.value) || todayObj.getFullYear())}
                className="w-14 bg-slate-900/60 border border-slate-700/80 rounded px-1 py-0.5 text-xs font-mono text-slate-100 font-bold focus:outline-none text-center focus:border-blue-400"
              />
            </div>

            {/* Today Quick-Jump Button */}
            <button
              onClick={() => {
                const now = new Date();
                setSelectedMonth(now.getMonth());
                setSelectedYear(now.getFullYear());
                setTimeout(() => {
                  if (todayRowRef.current) {
                    todayRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 50);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 hover:border-amber-400 font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
              title="Jump to Today's Date"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Today</span>
            </button>

            {/* Archived Bills Drawer Toggle */}
            {archivedBills.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchivedBills(!showArchivedBills)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs shadow-sm transition-all cursor-pointer ${
                  showArchivedBills
                    ? 'bg-amber-600/20 text-amber-300 border-amber-500/60'
                    : 'bg-slate-800/90 hover:bg-slate-800 text-amber-400 border-slate-700'
                }`}
                title="View & Restore Archived Bills"
              >
                <Archive className="w-3.5 h-3.5 text-amber-400" />
                <span>Archived Bills ({archivedBills.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* ARCHIVED BILLS RESTORATION DRAWER */}
        {showArchivedBills && archivedBills.length > 0 && (
          <div className="p-3 bg-amber-950/20 border-b border-amber-800/40 flex flex-wrap items-center justify-between gap-2 text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <Archive className="w-4 h-4 text-amber-400" />
              <span>Archived Bills (Preserved in Historical Matrix)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {archivedBills.map(b => (
                <div key={b.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-medium text-xs">
                  <span>{b.name} (${b.amount})</span>
                  <button
                    type="button"
                    onClick={() => unarchiveBill(b.id)}
                    className="p-0.5 text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 font-bold text-[10px]"
                    title="Restore Bill Column to Active Register"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <table className="w-full text-left text-xs border-collapse">
          {/* Header Row 1 & 2: Sticky Tier 2 (top-[37px] z-30) */}
          <thead className="sticky top-[37px] z-30 bg-slate-900 shadow-md">
            <tr className="bg-slate-900 text-slate-400 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-800">
              <th colSpan={2} className="p-2.5 text-center border-r border-slate-700 bg-slate-900 sticky left-0 z-40 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">Date &amp; Day</th>
              <th colSpan={showExtraColumns ? 2 : 1} className="p-2.5 text-center border-r-2 border-blue-600 bg-blue-900/90 text-blue-100 font-black shadow-sm">Beginning Balances (Opening)</th>
              <th colSpan={people.length * (showExtraColumns ? 2 : 1)} className="p-2.5 text-center border-r border-slate-800 bg-emerald-950/80 text-emerald-300">Credits (Deposits)</th>
              <th colSpan={accountBills.length + 1} className="p-2.5 text-center border-r border-slate-800 bg-rose-950/80 text-rose-300">Bills &amp; Scheduled Deductions</th>
              <th colSpan={showExtraColumns ? 3 : 2} className="p-2.5 text-center border-r border-slate-800 bg-purple-950/80 text-purple-300">Ending Balances</th>
              <th className="p-2.5 text-center bg-slate-900">Notes</th>
            </tr>

            {/* Header Row 2: Individual Columns */}
            <tr className="bg-slate-900 text-slate-300 font-bold text-[11px] border-b border-slate-800">
              {/* Date & Day (Frozen Left) */}
              <th className="p-2.5 min-w-[85px] w-[85px] bg-slate-900 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.4)]">Date</th>
              <th className="p-2.5 min-w-[95px] w-[95px] bg-slate-900 border-r border-slate-700 sticky left-[85px] z-30 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">Day</th>

              {/* Beg Balances (High Contrast Blue) */}
              <th className="p-2.5 text-right min-w-[100px] bg-blue-950/90 text-blue-200 font-extrabold border-r border-blue-900/60">Beg Balance</th>
              {showExtraColumns && (
                <th className="p-2.5 text-right min-w-[100px] border-r-2 border-blue-600 bg-blue-950/90 text-blue-200 font-extrabold">Extra Beg</th>
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
                <th key={`hdr-bill-${b.id}`} className="p-2.5 text-right min-w-[120px] text-rose-300 bg-slate-900 group">
                  <div className="flex items-center justify-end gap-1">
                    <span className="truncate">{b.name}</span>
                    <button
                      type="button"
                      onClick={() => archiveBill(b.id)}
                      className="opacity-70 group-hover:opacity-100 hover:scale-110 p-0.5 text-slate-400 hover:text-amber-400 transition-all rounded"
                      title={`Archive bill "${b.name}" (hide column from active register, keep history)`}
                    >
                      <Archive className="w-3 h-3" />
                    </button>
                  </div>
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

          {/* Matrix Rows (Continuous Multi-Month Stream) */}
          <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
            {matrixData.map(row => (
              <tr
                key={row.day}
                ref={row.isToday ? todayRowRef : null}
                className={`transition-colors ${
                  row.isToday
                    ? 'bg-amber-950/70 border-l-8 border-l-amber-400 border-r-4 border-r-amber-400 border-y-2 border-y-amber-400/80 ring-2 ring-amber-400/50 shadow-[0_0_25px_rgba(251,191,36,0.45)] font-extrabold text-amber-100 z-20'
                    : row.isDeficit
                      ? 'bg-rose-950/30 hover:bg-slate-800/40'
                      : row.isPayday
                        ? 'bg-emerald-950/25 border-l-4 border-l-emerald-500 hover:bg-slate-800/40'
                        : 'hover:bg-slate-800/40'
                }`}
              >
                  {/* Date (Frozen Left & Today Highlight) */}
                  <td className={`p-2.5 font-black whitespace-nowrap min-w-[85px] w-[85px] sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.4)] ${
                    row.isToday ? 'bg-amber-950 text-amber-300 border-l-8 border-l-amber-400 border-y-2 border-y-amber-400/80' : 'bg-slate-900 text-slate-300'
                  }`}>
                    <span>{row.dateFormatted}</span>
                    {row.isToday && (
                      <span className="ml-1.5 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-pulse inline-block">
                        TODAY
                      </span>
                    )}
                  </td>

                  {/* Day of Week (Frozen Left & Today Highlight) */}
                  <td className={`p-2.5 whitespace-nowrap min-w-[95px] w-[95px] border-r border-slate-700 sticky left-[85px] z-20 shadow-[4px_0_8px_rgba(0,0,0,0.5)] ${
                    row.isToday ? 'bg-amber-950 text-amber-300 border-y-2 border-y-amber-400/80' : 'bg-slate-900 text-slate-300'
                  }`}>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      row.isToday
                        ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                        : row.isPayday
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                          : 'text-slate-400 font-semibold'
                    }`}>
                      {row.dayOfWeekName}
                    </span>
                  </td>

                  {/* Beg Balance (High Contrast Blue) */}
                  <td className={`p-2.5 text-right font-black border-r border-blue-900/60 ${
                    row.isToday ? 'bg-amber-950/90 text-amber-200 border-y-2 border-y-amber-400/80' : 'bg-blue-950/40 text-blue-200'
                  }`}>${row.regBeg.toFixed(2)}</td>

                  {/* Extra Beg Balance (High Contrast Blue) */}
                  {showExtraColumns && (
                    <td className={`p-2.5 text-right font-black border-r-2 border-blue-600/80 ${
                      row.isToday ? 'bg-amber-950/90 text-amber-200 border-y-2 border-y-amber-400/80' : 'bg-blue-950/40 text-blue-200'
                    }`}>${row.extraBeg.toFixed(2)}</td>
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
              <td colSpan={2} className="p-3 text-slate-300 bg-slate-900 border-r border-slate-700 sticky left-0 z-40 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">Monthly Subtotals</td>
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
    <div className="h-[calc(100vh-125px)] flex flex-col overflow-hidden">
      <DailySpreadsheetMatrix />
    </div>
  );
}
