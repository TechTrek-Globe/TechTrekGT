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

import { fmtMoney, fmtNum } from '../utils/formatters';
import { isBillDueInMonth } from '../utils/paydayUtils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper to format currency for grid display ($1,000.00 or $ -)
function fmtGrid(val) {
  if (val === undefined || val === null || isNaN(val) || val === 0) {
    return '$ -';
  }
  return fmtMoney(val);
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
          className={`font-mono text-[10px] ${
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
    updateAccount,
    isPersonDepositDay,
    getPersonDepositAmountForAccount
  } = useBudget();

  const today = new Date();
  const [selectedAccountId, setSelectedAccountId] = useState(budget.accounts[0]?.id || 'all');
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

  const isProgrammaticScrollRef = useRef(false);
  const firstSelectedMonthRowRef = useRef(null);

  // Generous continuous 36-month timeline window (18 months back, 18 months forward)
  const monthList = useMemo(() => {
    const list = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const startBase = new Date(currentYear, currentMonth - 18, 1);

    for (let offset = 0; offset <= 36; offset++) {
      const d = new Date(startBase.getFullYear(), startBase.getMonth() + offset, 1);
      const mYear = d.getFullYear();
      const mMonth = d.getMonth();
      const mKey = `${mYear}-${String(mMonth + 1).padStart(2, '0')}`;
      const mDays = new Date(mYear, mMonth + 1, 0).getDate();
      list.push({
        year: mYear,
        month: mMonth,
        monthKey: mKey,
        daysInMonth: mDays,
        offset
      });
    }
    return list;
  }, []);

  // Generate continuous daily matrix rows across monthList
  const matrixData = useMemo(() => {
    const rows = [];
    if (monthList.length === 0) return rows;

    let runningRegBeg = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.startingBalance) || 0), 0)
      : (parseFloat(selectedAccount?.startingBalance) || 0);

    let runningExtraBeg = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.extraStartingBalance) || 0), 0)
      : (parseFloat(selectedAccount?.extraStartingBalance) || 0);

    monthList.forEach(mItem => {
      const { year, month, monthKey, daysInMonth } = mItem;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayOfWeekName = DAYS_OF_WEEK[dateObj.getDay()];
        const isPayday = people.some(p => isPersonDepositDay(p, year, month, day));
        const isToday = todayObj.getFullYear() === year && todayObj.getMonth() === month && todayObj.getDate() === day;

        // 1. Credits (Deposits)
        const personCredits = {};
        const personExtraCredits = {};

        people.forEach(p => {
          const customCredit = getDailyMatrixCell(selectedAccountId, monthKey, day, `credit_${p.id}`);
          const customExtraCredit = getDailyMatrixCell(selectedAccountId, monthKey, day, `extra_credit_${p.id}`);

          if (customCredit !== undefined) {
            personCredits[p.id] = parseFloat(customCredit) || 0;
          } else {
            const isDepDay = isPersonDepositDay(p, year, month, day);
            personCredits[p.id] = isDepDay ? getPersonDepositAmountForAccount(p, selectedAccountId) : 0;
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
          } else if (parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
            amt = parseFloat(b.amount) || 0;
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
          rowKey: `${monthKey}-${day}`,
          day,
          month,
          year,
          monthKey,
          isFirstDayOfMonth: day === 1,
          monthLabel: `${MONTHS[month]} ${year}`,
          dateFormatted: `${month + 1}/${day}/${year}`,
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
    });

    return rows;
  }, [
    monthList,
    selectedAccountId,
    selectedAccount,
    budget.accounts,
    accountBills,
    people,
    getDailyMatrixCell,
    todayObj
  ]);

  // Group matrix rows by month so each month gets its own tbody with a sticky month banner
  const monthGroups = useMemo(() => {
    const groups = [];
    let currentGroup = null;
    matrixData.forEach(row => {
      if (!currentGroup || currentGroup.monthKey !== row.monthKey) {
        currentGroup = {
          monthKey: row.monthKey,
          month: row.month,
          year: row.year,
          monthLabel: row.monthLabel,
          rows: []
        };
        groups.push(currentGroup);
      }
      currentGroup.rows.push(row);
    });
    return groups;
  }, [matrixData]);

  const containerRef = useRef(null);

  // Sync toolbar Month & Year selector to currently visible row as user scrolls
  const handleScroll = () => {
    if (!containerRef.current || isProgrammaticScrollRef.current) return;

    const containerBounds = containerRef.current.getBoundingClientRect();
    const sampleY = containerBounds.top + 80;
    const rowEls = containerRef.current.querySelectorAll('tr[data-month]');

    for (let el of rowEls) {
      const rect = el.getBoundingClientRect();
      if (rect.top <= sampleY && rect.bottom >= sampleY) {
        const m = parseInt(el.getAttribute('data-month'));
        const y = parseInt(el.getAttribute('data-year'));
        if (!isNaN(m) && !isNaN(y) && (m !== selectedMonth || y !== selectedYear)) {
          isProgrammaticScrollRef.current = true;
          setSelectedMonth(m);
          setSelectedYear(y);
          setTimeout(() => { isProgrammaticScrollRef.current = false; }, 100);
        }
        break;
      }
    }
  };

  // Scroll to selected month when user picks a new month from the dropdown
  const handleMonthSelect = (m) => {
    setSelectedMonth(m);
    const targetKey = `${selectedYear}-${String(m + 1).padStart(2, '0')}-1`;
    const targetEl = containerRef.current?.querySelector(`tr[data-rowkey="${targetKey}"]`);
    if (targetEl) {
      isProgrammaticScrollRef.current = true;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { isProgrammaticScrollRef.current = false; }, 400);
    }
  };

  // Scroll to selected year when user changes year
  const handleYearSelect = (y) => {
    setSelectedYear(y);
    const targetKey = `${y}-${String(selectedMonth + 1).padStart(2, '0')}-1`;
    const targetEl = containerRef.current?.querySelector(`tr[data-rowkey="${targetKey}"]`);
    if (targetEl) {
      isProgrammaticScrollRef.current = true;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { isProgrammaticScrollRef.current = false; }, 400);
    }
  };

  // Initial scroll to today on mount
  useEffect(() => {
    if (todayRowRef.current) {
      todayRowRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, []);

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

    const selectedMonthRows = matrixData.filter(r => r.month === selectedMonth && r.year === selectedYear);

    selectedMonthRows.forEach(r => {
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
  }, [matrixData, selectedMonth, selectedYear, people, accountBills]);

  const finalEndingBalance = matrixData[matrixData.length - 1]?.totalEnd || 0;

  const showExtraColumns = selectedAccountId === 'all'
    ? budget.accounts.some(a => a.enableExtraSavings !== false)
    : (selectedAccount?.enableExtraSavings !== false);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* SPREADSHEET MATRIX TABLE CONTAINER (Top-Level Viewport Locked) */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto matrix-scrollbar rounded-2xl border border-slate-800 glass-panel shadow-2xl relative"
      >

        {/* Compact Sticky Toolbar - Tier 1 (top-0 z-40 h-9) */}
        <div className="sticky top-0 z-40 bg-slate-950 border-b border-slate-800 px-3 py-1 h-9 flex items-center justify-between gap-2 shadow-md overflow-x-auto whitespace-nowrap text-xs">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <h3 className="text-[11px] font-black text-slate-100 uppercase tracking-wider hidden sm:inline">Daily Register Matrix</h3>
          </div>

          {/* Integrated KPI Metrics Pill Bar */}
          <div className="hidden xl:flex items-center gap-2.5 bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800 text-[10px] font-mono flex-shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Start:</span>
              <span className="text-slate-200 font-bold">{fmtMoney(matrixData[0]?.regBeg || 0)}</span>
            </div>
            <div className="h-2.5 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Deposits:</span>
              <span className="text-emerald-400 font-bold">+{fmtMoney(columnTotals.totalRegCredits)}</span>
            </div>
            <div className="h-2.5 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Bills:</span>
              <span className="text-rose-400 font-bold">-{fmtMoney(columnTotals.totalBills)}</span>
            </div>
            <div className="h-2.5 w-px bg-slate-800" />
            <div className="flex items-center gap-1">
              <span className="text-slate-400">End Total:</span>
              <span className={`font-bold ${finalEndingBalance < 0 ? 'text-rose-400' : 'text-blue-400'}`}>
                {fmtMoney(finalEndingBalance)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Account Selector */}
            <div className="flex items-center gap-1 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700 hover:border-blue-500/50 shadow-sm transition-all text-xs">
              <Filter className="w-3 h-3 text-blue-400" />
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-slate-100 py-1">All Accounts Combined</option>
                {budget.accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100 py-1">{acc.name}</option>
                ))}
              </select>
            </div>

            {/* Month / Year Selector */}
            <div className="flex items-center gap-1 bg-slate-800/90 hover:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700 hover:border-blue-500/50 shadow-sm transition-all text-xs">
              <Calendar className="w-3 h-3 text-blue-400" />
              <select
                value={selectedMonth}
                onChange={e => handleMonthSelect(parseInt(e.target.value))}
                className="bg-transparent text-[11px] font-bold text-slate-100 focus:outline-none cursor-pointer"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i} className="bg-slate-900 text-slate-100 py-1">{m}</option>
                ))}
              </select>
              <input
                type="number"
                value={selectedYear}
                onChange={e => handleYearSelect(parseInt(e.target.value) || todayObj.getFullYear())}
                className="w-12 bg-slate-900/60 border border-slate-700/80 rounded px-1 py-0.5 text-[11px] font-mono text-slate-100 font-bold focus:outline-none text-center focus:border-blue-400"
              />
            </div>

            {/* Today Quick-Jump Button */}
            <button
              onClick={() => {
                const now = new Date();
                handleMonthSelect(now.getMonth());
                handleYearSelect(now.getFullYear());
                setTimeout(() => {
                  if (todayRowRef.current) {
                    todayRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 50);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 hover:border-amber-400 font-bold text-[11px] shadow-sm transition-all cursor-pointer active:scale-95"
              title="Jump to Today's Date"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Today</span>
            </button>

            {/* Archived Bills Drawer Toggle */}
            {archivedBills.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchivedBills(!showArchivedBills)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border font-bold text-[11px] shadow-sm transition-all cursor-pointer ${
                  showArchivedBills
                    ? 'bg-amber-600/20 text-amber-300 border-amber-500/60'
                    : 'bg-slate-800/90 hover:bg-slate-800 text-amber-400 border-slate-700'
                }`}
                title="View & Restore Archived Bills"
              >
                <Archive className="w-3 h-3 text-amber-400" />
                <span>Archived ({archivedBills.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* ARCHIVED BILLS RESTORATION DRAWER */}
        {showArchivedBills && archivedBills.length > 0 && (
          <div className="p-2 bg-amber-950/20 border-b border-amber-800/40 flex flex-wrap items-center justify-between gap-2 text-xs animate-fade-in">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <Archive className="w-3.5 h-3.5 text-amber-400" />
              <span>Archived Bills</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {archivedBills.map(b => (
                <div key={b.id} className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-medium text-[11px]">
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

        <table className="w-full text-left text-[10px] border-separate border-spacing-0">
          {/* Header Row 1 & 2: Sticky Tier 2 */}
          <thead>
            {/* Header Row 1: Category Banners & Spanning Headers */}
            <tr className="bg-slate-950 text-slate-300 uppercase font-extrabold text-[9px] tracking-wider h-6">
              {/* Date & Day (Frozen Left Spanning Both Rows) */}
              <th rowSpan={2} className="p-1 min-w-[70px] w-[70px] max-w-[70px] bg-slate-950 text-slate-200 font-bold sticky left-0 top-[36px] z-50 align-middle text-center border-b-2 border-blue-500 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                Date
              </th>
              <th rowSpan={2} className="p-1 min-w-[48px] w-[48px] max-w-[48px] bg-slate-950 text-slate-200 font-bold border-r border-slate-700 sticky left-[70px] top-[36px] z-50 align-middle text-center border-b-2 border-blue-500 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">
                Day
              </th>

              {/* Beg Balances Banner */}
              <th colSpan={showExtraColumns ? 2 : 1} className="p-1 text-center border-r-2 border-blue-600 bg-blue-950 text-blue-100 font-black shadow-sm sticky top-[36px] z-35">Beg Balances</th>
              <th colSpan={people.length * (showExtraColumns ? 2 : 1)} className="p-1 text-center border-r border-slate-800 bg-emerald-950 text-emerald-300 sticky top-[36px] z-35">Credits (Deposits)</th>
              <th colSpan={accountBills.length + 1} className="p-1 text-center border-r border-slate-800 bg-rose-950 text-rose-300 sticky top-[36px] z-35">Bills &amp; Deductions</th>
              <th colSpan={showExtraColumns ? 3 : 2} className="p-1 text-center border-r border-slate-800 bg-purple-950 text-purple-300 sticky top-[36px] z-35">Ending Balances</th>
              <th rowSpan={2} className="p-1 min-w-[90px] bg-slate-950 text-slate-300 font-bold sticky top-[36px] z-35 align-middle text-left border-b-2 border-blue-500">
                <div className="flex flex-col items-start leading-tight text-[10px]">
                  <span>Other</span>
                  <span>Desc</span>
                </div>
              </th>
            </tr>

            {/* Header Row 2: Individual Columns (Stacked titles) */}
            <tr className="bg-slate-950 text-slate-300 font-bold text-[10px]">
              {/* Beg Balances */}
              <th className="p-1 text-right min-w-[65px] bg-blue-950 text-blue-200 font-extrabold border-r border-blue-900/60 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                <div className="flex flex-col items-end leading-tight text-[10px]">
                  <span>Beg</span>
                  <span>Bal</span>
                </div>
              </th>
              {showExtraColumns && (
                <th className="p-1 text-right min-w-[65px] border-r-2 border-blue-600 bg-blue-950 text-blue-200 font-extrabold align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end leading-tight text-[10px]">
                    <span>Extra</span>
                    <span>Beg</span>
                  </div>
                </th>
              )}

              {/* Credits */}
              {people.map(p => (
                <th key={`hdr-cred-${p.id}`} className="p-1 text-right min-w-[60px] text-emerald-400 bg-slate-950 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end leading-tight text-[10px]">
                    <span>{p.name.split(' ')[0]}</span>
                    <span>Credit</span>
                  </div>
                </th>
              ))}
              {showExtraColumns && people.map(p => (
                <th key={`hdr-ext-cred-${p.id}`} className="p-1 text-right min-w-[60px] text-emerald-300 bg-slate-950 border-r border-slate-800 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end leading-tight text-[10px]">
                    <span>{p.name.split(' ')[0]}</span>
                    <span>Extra</span>
                  </div>
                </th>
              ))}

              {/* Bill Columns */}
              {accountBills.map(b => (
                <th key={`hdr-bill-${b.id}`} className="p-1 text-right min-w-[70px] max-w-[80px] text-rose-300 bg-slate-950 group align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                  <div className="flex items-end justify-end gap-0.5">
                    <div className="flex flex-col items-end leading-tight text-right break-words text-[10px] max-w-[60px]">
                      {b.name.split(' ').map((word, idx) => (
                        <span key={idx} className="block truncate max-w-[60px]">{word}</span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => archiveBill(b.id)}
                      className="opacity-70 group-hover:opacity-100 hover:scale-110 p-0.5 text-slate-400 hover:text-amber-400 transition-all rounded mb-0.5 flex-shrink-0"
                      title={`Archive bill "${b.name}"`}
                    >
                      <Archive className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-1 text-right min-w-[55px] text-rose-300 bg-slate-950 border-r border-slate-800 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                <div className="flex flex-col items-end leading-tight text-[10px]">
                  <span>Other</span>
                </div>
              </th>

              {/* Ending Balances */}
              <th className="p-1 text-right min-w-[65px] text-slate-200 bg-slate-950 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                <div className="flex flex-col items-end leading-tight text-[10px]">
                  <span>Reg</span>
                  <span>Ending</span>
                </div>
              </th>
              {showExtraColumns && (
                <th className="p-1 text-right min-w-[65px] text-slate-200 bg-slate-950 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end leading-tight text-[10px]">
                    <span>Extra</span>
                    <span>Ending</span>
                  </div>
                </th>
              )}
              <th className="p-1 text-right min-w-[65px] text-blue-300 font-extrabold bg-slate-950 border-r border-slate-800 align-bottom sticky top-[60px] z-35 border-b-2 border-blue-500">
                <div className="flex flex-col items-end leading-tight text-[10px]">
                  <span>Total</span>
                  <span>End</span>
                </div>
              </th>
            </tr>
          </thead>

          {/* Matrix Rows (Continuous Multi-Month Stream with Sticky Month Banners) */}
          {monthGroups.map(group => (
            <tbody key={group.monthKey} className="divide-y divide-slate-800/50 font-mono text-[10px]">
              {/* Sticky Month Divider Bar pinned right beneath the table header */}
              <tr className="sticky top-[86px] z-30 shadow-md">
                <td
                  colSpan={100}
                  className="py-1 px-3 bg-blue-950 text-blue-200 border-y border-blue-700/80 sticky left-0 top-[86px] z-30 shadow-sm"
                >
                  <div className="flex items-center gap-2 font-mono uppercase tracking-widest text-[11px] font-black">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>{group.monthLabel}</span>
                  </div>
                </td>
              </tr>

              {group.rows.map(row => {
                const isFirstSelectedDay = row.month === selectedMonth && row.year === selectedYear && row.day === 1;
                const rowRef = row.isToday ? todayRowRef : (isFirstSelectedDay ? firstSelectedMonthRowRef : null);

                return (
                  <tr
                    key={row.rowKey}
                    ref={rowRef}
                    data-month={row.month}
                    data-year={row.year}
                    data-rowkey={row.rowKey}
                    className={`transition-colors ${
                      row.isToday
                        ? 'bg-amber-950/70 border-l-4 border-l-amber-400 border-r-2 border-r-amber-400 border-y border-y-amber-400/80 ring-1 ring-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.35)] font-extrabold text-amber-100 z-20'
                        : row.isDeficit
                          ? 'bg-rose-950/30 hover:bg-slate-800/40'
                          : row.isPayday
                            ? 'bg-emerald-950/25 border-l-2 border-l-emerald-500 hover:bg-slate-800/40'
                            : 'hover:bg-slate-800/40'
                    }`}
                  >
                      {/* Date (Frozen Left & Today Highlight) */}
                      <td className={`p-1 font-black whitespace-nowrap min-w-[70px] w-[70px] max-w-[70px] sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.4)] ${
                        row.isToday ? 'bg-amber-950 text-amber-300 border-l-4 border-l-amber-400 border-y border-y-amber-400/80' : 'bg-slate-900 text-slate-300'
                      }`}>
                        <span>{row.dateFormatted}</span>
                        {row.isToday && (
                          <span className="ml-1 px-1 py-0.2 rounded bg-amber-400 text-slate-950 text-[8px] font-black uppercase tracking-wider animate-pulse inline-block">
                            NOW
                          </span>
                        )}
                      </td>

                      {/* Day of Week (Frozen Left & Today Highlight) */}
                      <td className={`p-1 whitespace-nowrap min-w-[48px] w-[48px] max-w-[48px] border-r border-slate-700 sticky left-[70px] z-20 shadow-[4px_0_8px_rgba(0,0,0,0.5)] ${
                        row.isToday ? 'bg-amber-950 text-amber-300 border-y border-y-amber-400/80' : 'bg-slate-900 text-slate-300'
                      }`}>
                        <span className={`px-1 py-0.5 rounded text-[9px] ${
                          row.isToday
                            ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                            : row.isPayday
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                              : 'text-slate-400 font-semibold'
                        }`}>
                          {row.dayOfWeekName.substring(0, 3)}
                        </span>
                      </td>

                      {/* Beg Balance */}
                      <td className={`p-1 text-right font-black border-r border-blue-900/60 ${
                        row.isToday ? 'bg-amber-950/90 text-amber-200 border-y border-y-amber-400/80' : 'bg-blue-950/40 text-blue-200'
                      }`}>{fmtMoney(row.regBeg)}</td>

                      {/* Extra Beg Balance */}
                      {showExtraColumns && (
                        <td className={`p-1 text-right font-black border-r-2 border-blue-600/80 ${
                          row.isToday ? 'bg-amber-950/90 text-amber-200 border-y border-y-amber-400/80' : 'bg-blue-950/40 text-blue-200'
                        }`}>{fmtMoney(row.extraBeg)}</td>
                      )}

                      {/* Earner Credits */}
                      {people.map(p => (
                        <td key={`cred-${row.rowKey}-${p.id}`} className="p-1 text-right">
                          <MatrixCell
                            value={row.personCredits[p.id]}
                            isCredit
                            onCommit={val => updateDailyMatrixCell(selectedAccountId, row.monthKey, row.day, `credit_${p.id}`, val)}
                          />
                        </td>
                      ))}

                      {/* Earner Extra Credits */}
                      {showExtraColumns && people.map(p => (
                        <td key={`ext-cred-${row.rowKey}-${p.id}`} className="p-1 text-right border-r border-slate-800/80">
                          <MatrixCell
                            value={row.personExtraCredits[p.id]}
                            isCredit
                            onCommit={val => updateDailyMatrixCell(selectedAccountId, row.monthKey, row.day, `extra_credit_${p.id}`, val)}
                          />
                        </td>
                      ))}

                      {/* Individual Bill Columns */}
                      {accountBills.map(b => (
                        <td key={`bill-${row.rowKey}-${b.id}`} className="p-1 text-right">
                          <MatrixCell
                            value={row.billValues[b.id]}
                            isBill
                            onCommit={val => updateDailyMatrixCell(selectedAccountId, row.monthKey, row.day, `bill_${b.id}`, val)}
                          />
                        </td>
                      ))}

                      {/* Other Expense Column */}
                      <td className="p-1 text-right border-r border-slate-800/80">
                        <MatrixCell
                          value={row.otherAmt}
                          isBill
                          onCommit={val => updateDailyMatrixCell(selectedAccountId, row.monthKey, row.day, 'other_amount', val)}
                        />
                      </td>

                      {/* Regular Ending Balance */}
                      <td className="p-1 text-right font-bold text-slate-200">{fmtMoney(row.regEnding)}</td>

                      {/* Extra Ending Balance */}
                      {showExtraColumns && (
                        <td className="p-1 text-right text-slate-300">{fmtMoney(row.extraEnding)}</td>
                      )}

                      {/* Total End Balance */}
                      <td className={`p-1 text-right font-extrabold border-r border-slate-800/80 ${row.isDeficit ? 'text-rose-400 animate-pulse' : 'text-blue-300'}`}>
                        {fmtMoney(row.totalEnd)}
                      </td>

                      {/* Other Description */}
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="—"
                          value={row.otherDesc}
                          onChange={e => updateDailyMatrixCell(selectedAccountId, row.monthKey, row.day, 'other_desc', e.target.value)}
                          className="bg-transparent text-[10px] text-slate-300 hover:bg-slate-800/60 focus:bg-slate-800 px-1 py-0.5 rounded outline-none w-full"
                        />
                      </td>
                    </tr>
                );
              })}
            </tbody>
          ))}

          {/* Matrix Footers (Sticky Totals) */}
          <tfoot className="sticky bottom-0 z-30 bg-slate-900 font-extrabold text-[10px] text-slate-100 border-t-2 border-slate-700 shadow-lg">
            <tr>
              <td colSpan={2} className="p-1 text-slate-300 bg-slate-900 border-r border-slate-700 sticky left-0 z-40 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">Monthly Subtotals</td>
              <td className="p-1 text-right text-slate-400 bg-slate-900">&mdash;</td>
              {showExtraColumns && (
                <td className="p-1 text-right text-slate-400 bg-slate-900 border-r border-slate-800">&mdash;</td>
              )}

              {/* Credit Subtotals */}
              {people.map(p => (
                <td key={`tot-cred-${p.id}`} className="p-1 text-right text-emerald-400 font-mono bg-slate-900">
                  +{fmtMoney(columnTotals.regCredits[p.id])}
                </td>
              ))}
              {showExtraColumns && people.map(p => (
                <td key={`tot-ext-cred-${p.id}`} className="p-1 text-right text-emerald-300 font-mono bg-slate-900 border-r border-slate-800">
                  +{fmtMoney(columnTotals.extraCredits[p.id])}
                </td>
              ))}

              {/* Bill Subtotals */}
              {accountBills.map(b => (
                <td key={`tot-bill-${b.id}`} className="p-1 text-right text-rose-400 font-mono bg-slate-900">
                  -{fmtMoney(columnTotals.bills[b.id])}
                </td>
              ))}
              <td className="p-1 text-right text-rose-300 font-mono bg-slate-900 border-r border-slate-800">
                -{fmtMoney(columnTotals.other)}
              </td>

              {/* Ending Balances Subtotals */}
              <td className="p-1 text-right font-mono text-slate-200 bg-slate-900">&mdash;</td>
              {showExtraColumns && (
                <td className="p-1 text-right font-mono text-slate-200 bg-slate-900">&mdash;</td>
              )}
              <td className="p-1 text-right font-mono text-blue-400 font-black bg-slate-900 border-r border-slate-800">
                {fmtMoney(finalEndingBalance)}
              </td>
              <td className="p-1 bg-slate-900">&mdash;</td>
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
