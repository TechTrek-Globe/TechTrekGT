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
  RotateCcw,
  GripVertical
} from 'lucide-react';
import { InlineEdit } from './InlineEdit';

import { fmtMoney, fmtNum } from '../utils/formatters';
import { isBillDueInMonth } from '../utils/paydayUtils';

import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

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

// Inline cell editor for matrix cells with @dnd-kit Draggable capability
const MatrixCell = React.memo(function MatrixCell({
  value,
  onCommit,
  monthKey,
  day,
  field,
  isCredit = false,
  isBill = false,
  isTotal = false,
  isNegative = false,
  draggable = false,
  dragLabel = '',
  otherDesc = '',
  selectedAccountId
}) {
  const isZero = !value || value === 0;

  const commitHandler = useCallback((val) => {
    if (onCommit) onCommit(monthKey, day, field, val);
  }, [onCommit, monthKey, day, field]);

  const cellId = `${monthKey}-${day}-${field}`;
  const extraData = field === 'other_amount' ? { otherDesc } : {};
  const payload = useMemo(() => ({
    accountId: selectedAccountId,
    sourceMonthKey: monthKey,
    sourceDay: day,
    field,
    value,
    extraData,
    label: dragLabel
  }), [selectedAccountId, monthKey, day, field, value, otherDesc, dragLabel]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: cellId,
    data: payload,
    disabled: !draggable
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform)
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={`group/matrix relative flex items-center justify-end w-full ${
        draggable ? 'cursor-grab active:cursor-grabbing select-none' : ''
      } ${isDragging ? 'opacity-30 scale-90' : ''}`}
      title={draggable ? 'Drag to move to a different date line, or click to edit' : undefined}
    >
      {draggable && (
        <GripVertical className="w-2.5 h-2.5 text-slate-500 opacity-0 group-hover/matrix:opacity-70 transition-opacity absolute -left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}
      <InlineEdit
        value={value || 0}
        type="currency"
        onCommit={commitHandler}
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
    </div>
  );
});

// Droppable Table Cell TD Wrapper for Matrix
const DroppableCellTd = React.memo(function DroppableCellTd({
  row,
  field,
  children,
  className,
  activeCellData,
  isBillField = false
}) {
  const dropId = `drop-${row.monthKey}-${row.day}-${field}`;

  const dropPayload = useMemo(() => ({
    rowKey: row.rowKey,
    monthKey: row.monthKey,
    day: row.day,
    field
  }), [row.rowKey, row.monthKey, row.day, field]);

  const isDisabled = !activeCellData || activeCellData.field !== field;

  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: dropPayload,
    disabled: isDisabled
  });

  const activeHighlight = isOver && activeCellData?.field === field
    ? isBillField
      ? 'bg-rose-500/30 ring-2 ring-rose-400 ring-inset shadow-[0_0_10px_rgba(244,63,94,0.3)]'
      : 'bg-emerald-500/30 ring-2 ring-emerald-400 ring-inset shadow-[0_0_10px_rgba(16,185,129,0.3)]'
    : '';

  return (
    <td
      ref={setNodeRef}
      className={`${className} ${activeHighlight}`}
    >
      {children}
    </td>
  );
});

// Fully isolated text input for descriptions to prevent global renders on keystrokes
const IsolatedTextInput = React.memo(function IsolatedTextInput({ 
  value, 
  monthKey, 
  day, 
  field, 
  onCommit, 
  placeholder, 
  className 
}) {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const handleBlur = () => {
    if (draft !== value && onCommit) {
      onCommit(monthKey, day, field, draft);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
});

// ==========================================
// 1. MULTI-COLUMN DAILY SPREADSHEET MATRIX
// ==========================================
function DailySpreadsheetMatrix() {
  const {
    budget,
    getBillMonthlyCost,
    getDailyMatrixCell,
    updateDailyMatrixCell,
    moveDailyMatrixCell,
    updateBill,
    archiveBill,
    unarchiveBill,
    updateAccount,
    getActualAmount,
    isPersonDepositDay,
    getPersonDepositAmountForAccount
  } = useBudget();

  const today = new Date();
  const [selectedAccountId, setSelectedAccountId] = useState(budget.accounts[0]?.id || 'all');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [showArchivedBills, setShowArchivedBills] = useState(false);

  // Timeline window state (default 3 months back to 6 months forward relative to selected month for 75% faster DOM rendering)
  const [monthsBack, setMonthsBack] = useState(3);
  const [monthsForward, setMonthsForward] = useState(6);

  // Drag and drop state for per-day matrix values via @dnd-kit
  const [activeCellData, setActiveCellData] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4
      }
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event) => {
    setActiveCellData(event.active.data.current);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    const activeData = active?.data?.current;
    const overData = over?.data?.current;

    if (activeData && overData && overData.field === activeData.field) {
      if (activeData.sourceMonthKey !== overData.monthKey || activeData.sourceDay !== overData.day) {
        moveDailyMatrixCell(
          activeData.accountId || selectedAccountId,
          activeData.sourceMonthKey,
          activeData.sourceDay,
          overData.monthKey,
          overData.day,
          activeData.field,
          activeData.value,
          activeData.extraData
        );
      }
    }
    setActiveCellData(null);
  }, [moveDailyMatrixCell, selectedAccountId]);

  const handleDragCancel = useCallback(() => {
    setActiveCellData(null);
  }, []);

  const handleCellCommit = useCallback((monthKey, day, field, val) => {
    updateDailyMatrixCell(selectedAccountId, monthKey, day, field, val);
  }, [updateDailyMatrixCell, selectedAccountId]);


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

  // Effective start date based on selected account (or earliest account date when All Accounts is selected)
  const effectiveStartDateStr = useMemo(() => {
    if (selectedAccountId === 'all') {
      if (!budget.accounts || budget.accounts.length === 0) return '2024-01-01';
      const dates = budget.accounts
        .map(a => a.balanceAsOfDate || a.startDate)
        .filter(Boolean)
        .sort();
      return dates[0] || '2024-01-01';
    }
    return selectedAccount?.balanceAsOfDate || selectedAccount?.startDate || '2024-01-01';
  }, [selectedAccountId, selectedAccount, budget.accounts]);

  const startDateObj = useMemo(() => {
    const parts = (effectiveStartDateStr || '').split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return new Date(y, m, d);
      }
    }
    return new Date(2024, 0, 1);
  }, [effectiveStartDateStr]);

  const isProgrammaticScrollRef = useRef(false);
  const firstSelectedMonthRowRef = useRef(null);

  // Optimized continuous timeline window starting from effective start month
  const monthList = useMemo(() => {
    const list = [];
    const baseDate = new Date(selectedYear, selectedMonth, 1);
    const startMonthDate = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1);
    let startBase = new Date(baseDate.getFullYear(), baseDate.getMonth() - monthsBack, 1);
    if (startBase < startMonthDate) {
      startBase = startMonthDate;
    }
    const endBase = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthsForward + 1, 1);

    let cur = new Date(startBase);
    let offset = 0;
    while (cur <= endBase) {
      const mYear = cur.getFullYear();
      const mMonth = cur.getMonth();
      const mKey = `${mYear}-${String(mMonth + 1).padStart(2, '0')}`;
      const mDays = new Date(mYear, mMonth + 1, 0).getDate();
      list.push({
        year: mYear,
        month: mMonth,
        monthKey: mKey,
        daysInMonth: mDays,
        offset: offset++
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [selectedYear, selectedMonth, monthsBack, monthsForward, startDateObj]);

  // Generate continuous daily matrix rows across monthList (starting on startDateObj with no prior dates)
  const matrixData = useMemo(() => {
    const rows = [];
    if (monthList.length === 0) return rows;

    // Rule A: single-account import mode only - 'all' view always projects
    const isImportMode = selectedAccountId !== 'all'
      && selectedAccount?.ledgerMode === 'import';

    const importedRows = isImportMode
      ? (selectedAccount?.importedLedgerRows || {})
      : {};

    let runningRegBeg = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.startingBalance) || 0), 0)
      : (parseFloat(selectedAccount?.startingBalance) || 0);

    let runningExtraBeg = selectedAccountId === 'all'
      ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.extraStartingBalance) || 0), 0)
      : (parseFloat(selectedAccount?.extraStartingBalance) || 0);

    let isFirstRow = true;

    monthList.forEach(mItem => {
      const { year, month, monthKey, daysInMonth } = mItem;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);

        // Filter out dates before startDateObj - nothing before start date
        if (dateObj < startDateObj) {
          continue;
        }

        if (isFirstRow) {
          isFirstRow = false;
          // Re-initialize starting balance for first active date row
          runningRegBeg = selectedAccountId === 'all'
            ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.startingBalance) || 0), 0)
            : (parseFloat(selectedAccount?.startingBalance) || 0);
          runningExtraBeg = selectedAccountId === 'all'
            ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.extraStartingBalance) || 0), 0)
            : (parseFloat(selectedAccount?.extraStartingBalance) || 0);
        }

        const dayOfWeekName = DAYS_OF_WEEK[dateObj.getDay()];
        const isPayday = people.some(p => isPersonDepositDay(p, year, month, day));
        const isToday = todayObj.getFullYear() === year && todayObj.getMonth() === month && todayObj.getDate() === day;

        // --- Rule A: Import Mode lock ---
        // If this ISO date exists in the imported map, use it verbatim as historical fact.
        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (isImportMode && importedRows[isoDate] !== undefined) {
          const lockedEndBal = importedRows[isoDate];
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
            personCredits: {},
            personExtraCredits: {},
            totalRegCredits: 0,
            totalExtraCredits: 0,
            billValues: {},
            otherAmt: 0,
            otherDesc: '',
            regEnding: lockedEndBal,
            extraEnding: runningExtraBeg,
            totalEnd: lockedEndBal + runningExtraBeg,
            isDeficit: lockedEndBal + runningExtraBeg < 0,
            isHistoricalLock: true
          });
          // Carry the locked balance forward as the next day's opening
          runningRegBeg = lockedEndBal;
          continue;
        }

        // --- Rule B: Manual / Forward Projection Mode ---

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
            // Tier 1: manual dailyMatrix override (drag-drop or inline edit) wins outright
            amt = parseFloat(customBillVal) || 0;
          } else {
            // Tier 2: month-scoped actual amount from import reconciliation
            const actualAmt = getActualAmount(b.id, monthKey);
            if (actualAmt !== null && parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
              // Actual amount recorded for this month - use it on the projected due day.
              // If the payment day also shifted, the matrixUpdates from reconciliation will have
              // zeroed this cell and written the real day via getDailyMatrixCell (Tier 1 above).
              amt = actualAmt;
            } else if (actualAmt !== null) {
              // An actual exists but the date shifted - this day's amount is either 0 (projected
              // day was zeroed by matrixUpdate) or the real amount (actual day, handled by Tier 1).
              amt = 0;
            } else if (parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
              // Tier 3: standard projection - no actual recorded, use scheduled bill amount
              amt = parseFloat(b.amount) || 0;
            }
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
          isDeficit: totalEnd < 0,
          isHistoricalLock: false
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
    todayObj,
    startDateObj
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
  const scrollRafRef = useRef(null);

  // Sync toolbar Month & Year selector to currently visible row as user scrolls (throttled with rAF)
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    if (scrollRafRef.current) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!containerRef.current) return;

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
    });
  }, [selectedMonth, selectedYear]);

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

  // Controlled fine-grained mouse wheel scrolling (scrolls 1 day row ~32px per notch)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelStep = (e) => {
      if (Math.abs(e.deltaY) >= 40 && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        e.preventDefault();
        const direction = Math.sign(e.deltaY);
        container.scrollBy({ top: direction * 32, behavior: 'auto' });
      }
    };

    container.addEventListener('wheel', handleWheelStep, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelStep);
    };
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border border-slate-800 glass-panel shadow-2xl">

      {/* Compact Fixed Toolbar Header - Tier 1 (Outside Table Scroll Viewport) */}
      <div className="bg-slate-950 border-b border-slate-800 px-3 py-1.5 h-10 flex items-center justify-between gap-2 shadow-md shrink-0 whitespace-nowrap text-xs z-30">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-[11px] font-black text-slate-100 uppercase tracking-wider hidden sm:inline">Daily Transactions Register</h3>
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
        <div className="p-2 bg-amber-950/20 border-b border-amber-800/40 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs animate-fade-in">
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

      {/* SPREADSHEET MATRIX TABLE CONTAINER (Scrolls table vertically & horizontally) */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto matrix-scrollbar relative"
      >
        <table className="w-full text-left text-[10px] border-separate border-spacing-0">
          {/* Header Row 1 & 2: Sticky Matrix Header */}
          <thead>
            {/* Header Row 1: Category Banners & Spanning Headers */}
            <tr className="bg-slate-950 text-slate-300 uppercase font-extrabold text-xs tracking-wider h-7">
              {/* Date & Day Banner Container */}
              <th colSpan={2} className="p-0 h-7 bg-slate-950 border-r border-slate-700 sticky left-0 top-0 z-50 shadow-[2px_0_5px_rgba(0,0,0,0.5)]"></th>

              {/* Beg Balances Banner */}
              <th colSpan={showExtraColumns ? 2 : 1} className="p-1 h-7 text-center border-r-2 border-blue-600 bg-blue-950 text-blue-100 font-black shadow-sm sticky top-0 z-40 align-middle">Beg Balances</th>
              <th colSpan={people.length * (showExtraColumns ? 2 : 1)} className="p-1 h-7 text-center border-r border-slate-800 bg-emerald-950 text-emerald-300 font-black sticky top-0 z-40 align-middle">Credits (Deposits)</th>
              <th colSpan={accountBills.length + 2} className="p-1 h-7 text-center border-r border-slate-800 bg-rose-950 text-rose-300 font-black sticky top-0 z-40 align-middle">Bills &amp; Deductions</th>
              <th colSpan={showExtraColumns ? 2 : 1} className="p-1 h-7 text-center border-r border-slate-800 bg-purple-950 text-purple-300 font-black sticky top-0 z-40 align-middle">Ending Balances</th>
              
              {/* Total End Banner Container */}
              <th colSpan={1} className="p-0 h-7 min-w-[72px] w-[72px] max-w-[72px] bg-slate-950 border-l border-slate-700 sticky right-0 top-0 z-50 shadow-[-4px_0_8px_rgba(0,0,0,0.5)]"></th>
            </tr>

            {/* Header Row 2: Individual Columns (Stacked titles) */}
            <tr className="bg-slate-950 text-slate-300 font-bold text-xs h-10">
              {/* Date & Day Subheaders */}
              <th className="p-1 h-10 min-w-[90px] w-[90px] max-w-[90px] bg-slate-950 text-slate-200 font-bold text-center align-middle sticky left-0 top-[28px] z-50 border-b-2 border-blue-500 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-center h-full">Date</div>
              </th>
              <th className="p-1 h-10 min-w-[48px] w-[48px] max-w-[48px] bg-slate-950 text-slate-200 font-bold text-center align-middle border-r border-slate-700 sticky left-[90px] top-[28px] z-50 border-b-2 border-blue-500 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-center h-full">Day</div>
              </th>

              {/* Beg Balances */}
              <th className="p-1 h-10 text-right min-w-[65px] bg-blue-950 text-blue-200 font-extrabold border-r border-blue-900/60 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                  <span>Beg</span>
                  <span>Bal</span>
                </div>
              </th>
              {showExtraColumns && (
                <th className="p-1 h-10 text-right min-w-[65px] border-r-2 border-blue-600 bg-blue-950 text-blue-200 font-extrabold align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                    <span>Extra</span>
                    <span>Beg</span>
                  </div>
                </th>
              )}

              {/* Credits */}
              {people.map(p => (
                <th key={`hdr-cred-${p.id}`} className="p-1 h-10 text-right min-w-[60px] text-emerald-400 bg-emerald-950 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                    <span>{p.name.split(' ')[0]}</span>
                    <span>Credit</span>
                  </div>
                </th>
              ))}
              {showExtraColumns && people.map(p => (
                <th key={`hdr-ext-cred-${p.id}`} className="p-1 h-10 text-right min-w-[60px] text-emerald-300 bg-emerald-950 border-r border-slate-800 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                    <span>{p.name.split(' ')[0]}</span>
                    <span>Extra</span>
                  </div>
                </th>
              ))}

              {/* Bill Columns */}
              {accountBills.map(b => (
                <th key={`hdr-bill-${b.id}`} className="p-1 h-10 text-right min-w-[70px] text-rose-300 bg-rose-950 group align-middle sticky top-[28px] z-40 border-b-2 border-blue-500 relative" title={b.name}>
                  <button
                    type="button"
                    onClick={() => archiveBill(b.id)}
                    className="opacity-0 group-hover:opacity-100 hover:scale-110 p-0.5 text-slate-400 hover:text-amber-400 transition-all rounded absolute top-0.5 left-0.5 z-10"
                    title={`Archive bill "${b.name}"`}
                  >
                    <Archive className="w-2.5 h-2.5" />
                  </button>
                  <div className="flex flex-col items-end justify-center leading-tight text-right text-xs w-full h-full" title={b.name}>
                    <span className="block truncate max-w-[85px] font-bold">{b.name}</span>
                  </div>
                </th>
              ))}
              <th className="p-1 h-10 text-right min-w-[55px] text-rose-300 bg-rose-950 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                  <span>Other</span>
                </div>
              </th>
              <th className="p-1 h-10 text-left min-w-[90px] text-rose-300 bg-rose-950 border-r border-slate-800 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                <div className="flex flex-col items-start justify-center leading-tight text-xs h-full">
                  <span>Other</span>
                  <span>Desc</span>
                </div>
              </th>

              {/* Ending Balances */}
              <th className="p-1 h-10 text-right min-w-[65px] text-slate-200 bg-purple-950 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                  <span>Reg</span>
                  <span>Ending</span>
                </div>
              </th>
              {showExtraColumns && (
                <th className="p-1 h-10 text-right min-w-[65px] text-slate-200 bg-purple-950 border-r border-slate-800 align-middle sticky top-[28px] z-40 border-b-2 border-blue-500">
                  <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
                    <span>Extra</span>
                    <span>Ending</span>
                  </div>
                </th>
              )}

              {/* Total End Subheader */}
              <th className="p-1 h-10 min-w-[72px] w-[72px] max-w-[72px] bg-slate-950 text-blue-300 font-black sticky right-0 top-[28px] z-50 align-middle text-right border-b-2 border-blue-500 border-l border-slate-700 shadow-[-4px_0_8px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col items-end justify-center leading-tight text-xs h-full">
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
              <tr className="sticky top-[68px] z-30 shadow-md">
                <td
                  colSpan={100}
                  className="py-1 px-3 bg-blue-950 text-blue-200 border-b border-blue-700/80 sticky left-0 top-[68px] z-30 shadow-sm"
                >
                  <div className="sticky left-[146px] inline-flex items-center gap-2 font-mono uppercase tracking-widest text-[11px] font-black z-30">
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
                    className={`snap-start transition-colors ${
                      row.isToday
                        ? 'bg-amber-950/70 border-l-4 border-l-amber-400 border-r-2 border-r-amber-400 border-y border-y-amber-400/80 ring-1 ring-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.35)] font-extrabold text-amber-100 z-10'
                        : row.isHistoricalLock
                          ? 'bg-indigo-950/20 border-l-2 border-l-indigo-500/60 opacity-70 hover:opacity-90 hover:bg-indigo-950/30'
                          : row.isDeficit
                            ? 'bg-rose-950/30 hover:bg-slate-800/40'
                            : row.isPayday
                              ? 'bg-emerald-950/25 border-l-2 border-l-emerald-500 hover:bg-slate-800/40'
                              : 'hover:bg-slate-800/40'
                    }`}
                  >
                      {/* Date (Frozen Left & Today Highlight) */}
                      <td className={`p-1 font-black whitespace-nowrap min-w-[90px] w-[90px] max-w-[90px] sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.4)] ${
                        row.isToday ? 'bg-amber-950 text-amber-300 border-l-4 border-l-amber-400 border-y border-y-amber-400/80' : 'bg-slate-900 text-slate-300'
                      }`}>
                        <div className="flex items-center justify-between gap-1">
                          <span>{row.dateFormatted}</span>
                          {row.isToday && (
                            <span className="px-1 py-0.2 rounded bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider animate-pulse flex-shrink-0">
                              NOW
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Day of Week (Frozen Left & Today Highlight) */}
                      <td className={`p-1 whitespace-nowrap min-w-[48px] w-[48px] max-w-[48px] border-r border-slate-700 sticky left-[90px] z-20 shadow-[4px_0_8px_rgba(0,0,0,0.5)] ${
                        row.isToday ? 'bg-amber-950 text-amber-300 border-y border-y-amber-400/80' : 'bg-slate-900 text-slate-300'
                      }`}>
                        <span className={`px-1 py-0.5 rounded text-xs ${
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
                        <DroppableCellTd
                          key={`cred-${row.rowKey}-${p.id}`}
                          row={row}
                          field={`credit_${p.id}`}
                          className="p-1 text-right min-w-[60px] transition-colors relative"
                          activeCellData={activeCellData}
                        >
                          <MatrixCell
                            value={row.personCredits[p.id]}
                            isCredit
                            monthKey={row.monthKey}
                            day={row.day}
                            field={`credit_${p.id}`}
                            onCommit={handleCellCommit}
                            draggable={Boolean(row.personCredits[p.id] && row.personCredits[p.id] > 0)}
                            dragLabel={`${p.name.split(' ')[0]} Credit`}
                            selectedAccountId={selectedAccountId}
                          />
                        </DroppableCellTd>
                      ))}

                      {/* Earner Extra Credits */}
                      {showExtraColumns && people.map(p => (
                        <DroppableCellTd
                          key={`ext-cred-${row.rowKey}-${p.id}`}
                          row={row}
                          field={`extra_credit_${p.id}`}
                          className="p-1 text-right border-r border-slate-800/80 min-w-[60px] transition-colors relative"
                          activeCellData={activeCellData}
                        >
                          <MatrixCell
                            value={row.personExtraCredits[p.id]}
                            isCredit
                            monthKey={row.monthKey}
                            day={row.day}
                            field={`extra_credit_${p.id}`}
                            onCommit={handleCellCommit}
                            draggable={Boolean(row.personExtraCredits[p.id] && row.personExtraCredits[p.id] > 0)}
                            dragLabel={`${p.name.split(' ')[0]} Extra`}
                            selectedAccountId={selectedAccountId}
                          />
                        </DroppableCellTd>
                      ))}

                      {/* Individual Bill Columns */}
                      {accountBills.map(b => (
                        <DroppableCellTd
                          key={`bill-${row.rowKey}-${b.id}`}
                          row={row}
                          field={`bill_${b.id}`}
                          className="p-1 text-right min-w-[70px] transition-colors relative"
                          activeCellData={activeCellData}
                          isBillField
                        >
                          <MatrixCell
                            value={row.billValues[b.id]}
                            isBill
                            monthKey={row.monthKey}
                            day={row.day}
                            field={`bill_${b.id}`}
                            onCommit={handleCellCommit}
                            draggable={Boolean(row.billValues[b.id] && row.billValues[b.id] > 0)}
                            dragLabel={b.name}
                            selectedAccountId={selectedAccountId}
                          />
                        </DroppableCellTd>
                      ))}

                      {/* Other Expense Column */}
                      <DroppableCellTd
                        row={row}
                        field="other_amount"
                        className="p-1 text-right min-w-[55px] transition-colors relative"
                        activeCellData={activeCellData}
                        isBillField
                      >
                        <MatrixCell
                          value={row.otherAmt}
                          isBill
                          monthKey={row.monthKey}
                          day={row.day}
                          field="other_amount"
                          onCommit={handleCellCommit}
                          draggable={Boolean(row.otherAmt && row.otherAmt > 0)}
                          dragLabel={row.otherDesc ? `Other (${row.otherDesc})` : 'Other Expense'}
                          otherDesc={row.otherDesc}
                          selectedAccountId={selectedAccountId}
                        />
                      </DroppableCellTd>

                      {/* Other Description */}
                      <td className="p-1 border-r border-slate-800/80">
                        <IsolatedTextInput
                          value={row.otherDesc}
                          monthKey={row.monthKey}
                          day={row.day}
                          field="other_desc"
                          onCommit={handleCellCommit}
                          placeholder="—"
                          className="bg-transparent text-[10px] text-slate-300 hover:bg-slate-800/60 focus:bg-slate-800 px-1 py-0.5 rounded outline-none w-full"
                        />
                      </td>

                      {/* Regular Ending Balance */}
                      <td className="p-1 text-right font-bold text-slate-200">{fmtMoney(row.regEnding)}</td>

                      {/* Extra Ending Balance */}
                      {showExtraColumns && (
                        <td className="p-1 text-right text-slate-300 border-r border-slate-800/80">{fmtMoney(row.extraEnding)}</td>
                      )}

                      {/* Total End Balance (Sticky Right) */}
                      <td className={`p-1 min-w-[72px] w-[72px] max-w-[72px] text-right font-extrabold sticky right-0 z-20 border-l border-slate-700 shadow-[-4px_0_8px_rgba(0,0,0,0.5)] ${
                        row.isToday
                          ? 'bg-amber-950 text-amber-100 border-y border-y-amber-400/80'
                          : row.isDeficit
                            ? 'bg-slate-900 text-rose-400 animate-pulse'
                            : 'bg-slate-900 text-blue-300'
                      }`}>
                        {fmtMoney(row.totalEnd)}
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
              {people.map(p => {
                const tot = columnTotals.regCredits[p.id] || 0;
                return (
                  <td key={`tot-cred-${p.id}`} className={`p-1 text-right font-mono bg-slate-900 min-w-[60px] ${tot < 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    {tot >= 0 ? `+${fmtMoney(tot)}` : fmtMoney(tot)}
                  </td>
                );
              })}
              {showExtraColumns && people.map(p => {
                const tot = columnTotals.extraCredits[p.id] || 0;
                return (
                  <td key={`tot-ext-cred-${p.id}`} className={`p-1 text-right font-mono bg-slate-900 border-r border-slate-800 min-w-[60px] ${tot < 0 ? 'text-rose-400 font-bold' : 'text-emerald-300'}`}>
                    {tot >= 0 ? `+${fmtMoney(tot)}` : fmtMoney(tot)}
                  </td>
                );
              })}

              {/* Bill Subtotals */}
              {accountBills.map(b => (
                <td key={`tot-bill-${b.id}`} className="p-1 text-right text-rose-400 font-mono bg-slate-900 min-w-[70px]">
                  -{fmtMoney(columnTotals.bills[b.id])}
                </td>
              ))}
              <td className="p-1 text-right text-rose-300 font-mono bg-slate-900 min-w-[55px]">
                -{fmtMoney(columnTotals.other)}
              </td>
              <td className="p-1 bg-slate-900 border-r border-slate-800">&mdash;</td>

              {/* Ending Balances Subtotals */}
              <td className="p-1 text-right font-mono text-slate-200 bg-slate-900">&mdash;</td>
              {showExtraColumns && (
                <td className="p-1 text-right font-mono text-slate-200 bg-slate-900 border-r border-slate-800">&mdash;</td>
              )}
              {/* Sticky Right Total End Footer */}
              <td className="p-1 text-right font-mono text-blue-400 font-black bg-slate-900 border-l border-slate-700 sticky right-0 z-40 shadow-[-4px_0_8px_rgba(0,0,0,0.5)]">
                {fmtMoney(finalEndingBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Floating Drag Overlay */}
      <DragOverlay>
        {activeCellData ? (
          <div className="bg-slate-900/95 border border-blue-500 text-blue-100 px-3 py-1.5 rounded-full shadow-2xl backdrop-blur flex items-center gap-2 text-xs font-mono font-bold pointer-events-none scale-105 ring-2 ring-blue-500/80 z-50">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-spin" />
            <span>{activeCellData.label} ({fmtMoney(activeCellData.value)})</span>
          </div>
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  );
}

// ==========================================
// 2. MAIN LEDGER VIEW WRAPPER WITH TABS
// ==========================================
export function LedgerView() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <DailySpreadsheetMatrix />
    </div>
  );
}
