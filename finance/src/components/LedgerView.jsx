import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useBudget } from '../context/BudgetContext';
import {
  Wallet,
  Calendar,
  Filter,
  Users,
  Check,
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
  GripVertical,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import { InlineEdit } from './InlineEdit';
import { SpreadsheetImporter } from './SpreadsheetImporter';

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
  useDndContext,
  pointerWithin,
  closestCenter,
  DragOverlay
} from '@dnd-kit/core';

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
  isOther = false,
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
    isDragging
  } = useDraggable({
    id: cellId,
    data: payload,
    disabled: !draggable
  });

  return (
    <div
      ref={setNodeRef}
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
                : isOther
                  ? isZero
                    ? 'text-slate-600'
                    : value > 0
                      ? 'text-emerald-400 font-semibold'
                      : 'text-rose-300 font-semibold'
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
}, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.monthKey === nextProps.monthKey &&
    prevProps.day === nextProps.day &&
    prevProps.field === nextProps.field &&
    prevProps.isCredit === nextProps.isCredit &&
    prevProps.isBill === nextProps.isBill &&
    prevProps.isOther === nextProps.isOther &&
    prevProps.isTotal === nextProps.isTotal &&
    prevProps.isNegative === nextProps.isNegative &&
    prevProps.draggable === nextProps.draggable &&
    prevProps.dragLabel === nextProps.dragLabel &&
    prevProps.otherDesc === nextProps.otherDesc &&
    prevProps.selectedAccountId === nextProps.selectedAccountId
  );
});

// Custom matrix collision detection:
// 1. Filters droppable containers to only those matching the dragged item's field
// 2. Uses exact pointer coordinates (pointerWithin) for pixel-perfect drop targeting under the cursor
// 3. Falls back to closestCenter among the valid column cells if cursor is on cell boundaries
const matrixCollisionDetection = (args) => {
  const activeField = args.active?.data?.current?.field;
  const filteredContainers = activeField
    ? args.droppableContainers.filter(c => c.data?.current?.field === activeField)
    : args.droppableContainers;

  const filteredArgs = activeField ? { ...args, droppableContainers: filteredContainers } : args;

  const pointerCollisions = pointerWithin(filteredArgs);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }

  return closestCenter(filteredArgs);
};

// Droppable Table Cell TD Wrapper for Matrix
const DroppableCellTd = React.memo(function DroppableCellTd({
  row,
  field,
  children,
  className,
  isBillField = false
}) {
  const dropId = `drop-${row.monthKey}-${row.day}-${field}`;

  const dropPayload = useMemo(() => ({
    rowKey: row.rowKey,
    monthKey: row.monthKey,
    day: row.day,
    field
  }), [row.rowKey, row.monthKey, row.day, field]);

  const { isOver, setNodeRef, active } = useDroppable({
    id: dropId,
    data: dropPayload
  });

  const isMatchingField = active?.data?.current?.field === field;
  const activeHighlight = isOver && isMatchingField
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

// Floating drag preview reading directly from DndContext to isolate renders from table
function MatrixDragOverlay() {
  const { active } = useDndContext();
  const activeData = active?.data?.current;

  if (!activeData) return null;

  return (
    <div className="bg-slate-900/95 border border-blue-500 text-blue-100 px-3 py-1.5 rounded-full shadow-2xl backdrop-blur flex items-center gap-2 text-xs font-mono font-bold pointer-events-none scale-105 ring-2 ring-blue-500/80 z-50">
      <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 animate-spin" />
      <span>{activeData.label} ({fmtMoney(activeData.value)})</span>
    </div>
  );
}

// Fully isolated text input for descriptions with interactive focus states and instant commit
const IsolatedTextInput = React.memo(function IsolatedTextInput({ 
  value, 
  monthKey, 
  day, 
  field, 
  onCommit, 
  placeholder = '—', 
  className 
}) {
  const [draft, setDraft] = useState(value || '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const handleBlur = () => {
    setIsFocused(false);
    if (draft !== value && onCommit) {
      onCommit(monthKey, day, field, draft);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setDraft(value || '');
      e.target.blur();
    }
  };

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={draft}
      title={draft || value || 'Click to edit description'}
      onFocus={() => setIsFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`${className} ${isFocused ? 'bg-slate-800 text-white ring-1 ring-blue-500 border border-blue-500 rounded px-1' : ''}`}
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [billDraftName, setBillDraftName] = useState('');
  const [billToArchive, setBillToArchive] = useState(null);
  const [selectedRowKey, setSelectedRowKey] = useState(null);


  // Drag and drop sensor configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4
      }
    }),
    useSensor(KeyboardSensor)
  );

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
  }, [moveDailyMatrixCell, selectedAccountId]);

  const handleCellCommit = useCallback((monthKey, day, field, val) => {
    const targetAccId = selectedAccountId === 'all' ? (budget.accounts[0]?.id || 'all') : selectedAccountId;
    updateDailyMatrixCell(targetAccId, monthKey, day, field, val);
  }, [updateDailyMatrixCell, selectedAccountId, budget.accounts]);


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

  // Earner filter dropdown state
  const [showEarnerDropdown, setShowEarnerDropdown] = useState(false);
  const earnerDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (earnerDropdownRef.current && !earnerDropdownRef.current.contains(e.target)) {
        setShowEarnerDropdown(false);
      }
    };
    if (showEarnerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showEarnerDropdown]);

  // Relevant active earners/creditors assigned to this account
  const accountPeople = useMemo(() => {
    if (selectedAccountId === 'all') return people;
    if (selectedAccount?.enabledEarners && Array.isArray(selectedAccount.enabledEarners)) {
      return people.filter(p => selectedAccount.enabledEarners.includes(p.id));
    }
    return people;
  }, [people, selectedAccountId, selectedAccount]);

  const handleToggleEarner = (personId) => {
    if (!selectedAccount) return;
    const currentEnabled = selectedAccount.enabledEarners && Array.isArray(selectedAccount.enabledEarners)
      ? selectedAccount.enabledEarners
      : people.map(p => p.id);

    let updated;
    if (currentEnabled.includes(personId)) {
      updated = currentEnabled.filter(id => id !== personId);
    } else {
      updated = [...currentEnabled, personId];
    }
    updateAccount(selectedAccountId, { enabledEarners: updated });
  };

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

  // Rolling window: previous, current, and next month for smooth scrolling
  const monthList = useMemo(() => {
    const list = [];
    
    // Start window 1 month before selected, but don't go before account start date
    let cur = new Date(selectedYear, selectedMonth - 1, 1);
    const startMonthDate = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1);
    
    if (cur < startMonthDate) {
      cur = new Date(startMonthDate);
    }

    let offset = 0;
    // Generate exactly 3 months (e.g. previous, current, next)
    for (let i = 0; i < 3; i++) {
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
  }, [startDateObj, selectedYear, selectedMonth]);

  const showExtraColumns = selectedAccountId === 'all'
    ? budget.accounts.some(a => a.enableExtraSavings !== false)
    : (selectedAccount?.enableExtraSavings !== false);

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

    // Fast-Forward Math Loop wrapped in strict useMemo to prevent recalculating years of history on every UI change
    const { initialRegBeg, initialExtraBeg } = useMemo(() => {
      let regBeg = selectedAccountId === 'all'
        ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.startingBalance) || 0), 0)
        : (parseFloat(selectedAccount?.startingBalance) || 0);

      let extraBeg = selectedAccountId === 'all'
        ? budget.accounts.reduce((sum, a) => sum + (parseFloat(a.extraStartingBalance) || 0), 0)
        : (parseFloat(selectedAccount?.extraStartingBalance) || 0);

      if (monthList.length > 0) {
        const firstMonthStart = new Date(monthList[0].year, monthList[0].month, 1);
        if (firstMonthStart > startDateObj) {
          let cur = new Date(startDateObj);
          while (cur < firstMonthStart) {
            const y = cur.getFullYear();
            const m = cur.getMonth();
            const d = cur.getDate();
            const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;

            let dayCredits = 0;
            let dayExtraCredits = 0;
            people.forEach(p => {
              const customCredit = getDailyMatrixCell(selectedAccountId, mKey, d, `credit_${p.id}`);
              if (customCredit !== undefined) dayCredits += parseFloat(customCredit) || 0;
              const customExtra = getDailyMatrixCell(selectedAccountId, mKey, d, `extra_credit_${p.id}`);
              if (customExtra !== undefined) dayExtraCredits += parseFloat(customExtra) || 0;
            });

            let dayBills = 0;
            accountBills.forEach(b => {
              const customBill = getDailyMatrixCell(selectedAccountId, mKey, d, `bill_${b.id}`);
              if (customBill !== undefined) dayBills += parseFloat(customBill) || 0;
            });

            const customOther = getDailyMatrixCell(selectedAccountId, mKey, d, 'other_amount');
            const dayOther = customOther !== undefined ? (parseFloat(customOther) || 0) : 0;

            const customOtherCredit = getDailyMatrixCell(selectedAccountId, mKey, d, 'other_credit_amount');
            const dayOtherCredit = customOtherCredit !== undefined ? (parseFloat(customOtherCredit) || 0) : 0;

            const tentativeRegEnding = regBeg + dayCredits - dayBills;
            const tentativeExtraEnding = extraBeg + dayExtraCredits + dayOtherCredit + dayOther;

            let customRegEnd;
            let customExtraEnd;
            if (selectedAccountId === 'all') {
              const allReg = getDailyMatrixCell('all', mKey, d, 'reg_ending');
              const allExtra = getDailyMatrixCell('all', mKey, d, 'extra_ending');
              if (allReg !== undefined && allReg !== null && allReg !== '') customRegEnd = parseFloat(allReg);
              if (allExtra !== undefined && allExtra !== null && allExtra !== '') customExtraEnd = parseFloat(allExtra);
            } else {
              const accReg = getDailyMatrixCell(selectedAccountId, mKey, d, 'reg_ending');
              const accExtra = getDailyMatrixCell(selectedAccountId, mKey, d, 'extra_ending');
              if (accReg !== undefined && accReg !== null && accReg !== '') customRegEnd = parseFloat(accReg);
              if (accExtra !== undefined && accExtra !== null && accExtra !== '') customExtraEnd = parseFloat(accExtra);
            }

            let reg = customRegEnd !== undefined && !isNaN(customRegEnd) ? customRegEnd : tentativeRegEnding;
            let extra = customExtraEnd !== undefined && !isNaN(customExtraEnd) ? customExtraEnd : tentativeExtraEnding;

            if (customRegEnd === undefined && customExtraEnd === undefined) {
              if (reg < 0 && extra > 0) {
                const transfer = Math.min(extra, -reg);
                reg += transfer;
                extra -= transfer;
              } else if (extra < 0 && reg > 0) {
                const transfer = Math.min(reg, -extra);
                extra += transfer;
                reg -= transfer;
              }
            }

            regBeg = Math.round(reg * 100) / 100 || 0;
            extraBeg = Math.round(extra * 100) / 100 || 0;

            cur.setDate(cur.getDate() + 1);
          }
        }
      }

      return { initialRegBeg: regBeg, initialExtraBeg: extraBeg };
    }, [
      selectedAccountId,
      budget.accounts,
      selectedAccount,
      startDateObj,
      monthList.length > 0 ? monthList[0].monthKey : null,
      people,
      accountBills,
      getDailyMatrixCell
    ]);

    let runningRegBeg = initialRegBeg;
    let runningExtraBeg = initialExtraBeg;

    monthList.forEach(mItem => {
      const { year, month, monthKey, daysInMonth } = mItem;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);

        // Filter out dates before startDateObj - nothing before start date
        if (dateObj < startDateObj) {
          continue;
        }

        const dayOfWeekName = DAYS_OF_WEEK[dateObj.getDay()];
        const isPayday = people.some(p => isPersonDepositDay(p, year, month, day));
        const isToday = todayObj.getFullYear() === year && todayObj.getMonth() === month && todayObj.getDate() === day;

        const isPastDate = dateObj < new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isLockedDay = isImportMode && importedRows[isoDate] !== undefined;

        // 1. Credits (Deposits) for enabled account earners
        const personCredits = {};

        accountPeople.forEach(p => {
          const customCredit = getDailyMatrixCell(selectedAccountId, monthKey, day, `credit_${p.id}`);

          if (customCredit !== undefined) {
            personCredits[p.id] = parseFloat(customCredit) || 0;
          } else if (!isPastDate && !isLockedDay) {
            const isDepDay = isPersonDepositDay(p, year, month, day);
            personCredits[p.id] = isDepDay ? getPersonDepositAmountForAccount(p, selectedAccountId) : 0;
          } else {
            personCredits[p.id] = 0;
          }
        });

        const totalRegCredits = Object.values(personCredits).reduce((s, v) => s + v, 0);

        // 2. Individual Bill Deductions
        const billValues = {};
        let totalDayBills = 0;

        accountBills.forEach(b => {
          const customBillVal = getDailyMatrixCell(selectedAccountId, monthKey, day, `bill_${b.id}`);
          let amt = 0;

          if (customBillVal !== undefined) {
            // Tier 1: manual dailyMatrix override (drag-drop, inline edit, or actual transaction) wins outright
            amt = parseFloat(customBillVal) || 0;
          } else if (!isPastDate && !isLockedDay) {
            // Tier 2: month-scoped actual amount from import reconciliation
            const actualAmt = getActualAmount(b.id, monthKey);
            if (actualAmt !== null && parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
              amt = actualAmt;
            } else if (actualAmt !== null) {
              amt = 0;
            } else if (parseInt(b.dueDay) === day && isBillDueInMonth(b, month, true)) {
              // Tier 3: standard projection for future scheduled bills
              amt = parseFloat(b.amount) || 0;
            }
          } else {
            // On past or historical locked dates with no recorded transaction, do not add phantom scheduled bills
            amt = 0;
          }

          billValues[b.id] = amt;
          totalDayBills += amt;
        });

        // 3. Other (consolidated credit and debit)
        let otherAmt = 0;
        let rawOtherDesc = '';

        if (selectedAccountId === 'all') {
          budget.accounts.forEach(a => {
            const accOther = getDailyMatrixCell(a.id, monthKey, day, 'other_amount');
            if (accOther !== undefined) otherAmt += parseFloat(accOther) || 0;
            const accOtherCredit = getDailyMatrixCell(a.id, monthKey, day, 'other_credit_amount');
            if (accOtherCredit !== undefined) otherAmt += parseFloat(accOtherCredit) || 0;

            const accDesc = getDailyMatrixCell(a.id, monthKey, day, 'other_desc');
            if (accDesc) {
              rawOtherDesc = rawOtherDesc ? `${rawOtherDesc} | ${accDesc}` : accDesc;
            }
            const accCreditDesc = getDailyMatrixCell(a.id, monthKey, day, 'other_credit_desc');
            if (accCreditDesc) {
              rawOtherDesc = rawOtherDesc ? `${rawOtherDesc} | ${accCreditDesc}` : accCreditDesc;
            }
          });
          const allOther = getDailyMatrixCell('all', monthKey, day, 'other_amount');
          if (allOther !== undefined) otherAmt += parseFloat(allOther) || 0;
          const allOtherCredit = getDailyMatrixCell('all', monthKey, day, 'other_credit_amount');
          if (allOtherCredit !== undefined) otherAmt += parseFloat(allOtherCredit) || 0;

          const allDesc = getDailyMatrixCell('all', monthKey, day, 'other_desc');
          if (allDesc) {
            rawOtherDesc = rawOtherDesc ? `${rawOtherDesc} | ${allDesc}` : allDesc;
          }
          const allCreditDesc = getDailyMatrixCell('all', monthKey, day, 'other_credit_desc');
          if (allCreditDesc) {
            rawOtherDesc = rawOtherDesc ? `${rawOtherDesc} | ${allCreditDesc}` : allCreditDesc;
          }
        } else {
          const customOther = getDailyMatrixCell(selectedAccountId, monthKey, day, 'other_amount');
          const customOtherCredit = getDailyMatrixCell(selectedAccountId, monthKey, day, 'other_credit_amount');
          if (customOther !== undefined) otherAmt += parseFloat(customOther) || 0;
          if (customOtherCredit !== undefined) otherAmt += parseFloat(customOtherCredit) || 0;

          const d1 = getDailyMatrixCell(selectedAccountId, monthKey, day, 'other_desc') || '';
          const d2 = getDailyMatrixCell(selectedAccountId, monthKey, day, 'other_credit_desc') || '';
          rawOtherDesc = d1 && d2 ? `${d1} | ${d2}` : (d1 || d2);
        }

        const customOtherDesc = rawOtherDesc.replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();

        // 4. Determine Beginning and Ending Balances
        let dayExtraAdd = 0;
        accountPeople.forEach(p => {
          const customExtra = getDailyMatrixCell(selectedAccountId, monthKey, day, `extra_credit_${p.id}`);
          if (customExtra !== undefined) {
            dayExtraAdd += parseFloat(customExtra) || 0;
          }
        });

        const tentativeRegEnding = runningRegBeg + totalRegCredits - totalDayBills;
        const tentativeExtraEnding = runningExtraBeg + dayExtraAdd + otherAmt;

        let customRegEnd;
        let customExtraEnd;

        if (selectedAccountId === 'all') {
          const allReg = getDailyMatrixCell('all', monthKey, day, 'reg_ending');
          const allExtra = getDailyMatrixCell('all', monthKey, day, 'extra_ending');
          if (allReg !== undefined && allReg !== null && allReg !== '') customRegEnd = parseFloat(allReg);
          if (allExtra !== undefined && allExtra !== null && allExtra !== '') customExtraEnd = parseFloat(allExtra);
        } else {
          const accReg = getDailyMatrixCell(selectedAccountId, monthKey, day, 'reg_ending');
          const accExtra = getDailyMatrixCell(selectedAccountId, monthKey, day, 'extra_ending');
          if (accReg !== undefined && accReg !== null && accReg !== '') customRegEnd = parseFloat(accReg);
          if (accExtra !== undefined && accExtra !== null && accExtra !== '') customExtraEnd = parseFloat(accExtra);
        }

        if (customRegEnd === undefined && isImportMode && importedRows[isoDate]?.regEnding !== undefined) {
          customRegEnd = importedRows[isoDate].regEnding;
        }
        if (customExtraEnd === undefined && isImportMode && importedRows[isoDate]?.extraEnding !== undefined) {
          customExtraEnd = importedRows[isoDate].extraEnding;
        }

        let reg = customRegEnd !== undefined && !isNaN(customRegEnd) ? customRegEnd : tentativeRegEnding;
        let extra = customExtraEnd !== undefined && !isNaN(customExtraEnd) ? customExtraEnd : tentativeExtraEnding;

        if (customRegEnd === undefined && customExtraEnd === undefined) {
          if (reg < 0 && extra > 0) {
            const transfer = Math.min(extra, -reg);
            reg += transfer;
            extra -= transfer;
          } else if (extra < 0 && reg > 0) {
            const transfer = Math.min(reg, -extra);
            extra += transfer;
            reg -= transfer;
          }
        }

        const regEnding = Math.round(reg * 100) / 100 || 0;
        const extraEnding = Math.round(extra * 100) / 100 || 0;

        const totalEnd = Math.round((regEnding + (showExtraColumns ? extraEnding : 0)) * 100) / 100;
        const isHistoricalLock = isLockedDay;
        const totalBeg = Math.round((runningRegBeg + (showExtraColumns ? runningExtraBeg : 0)) * 100) / 100;

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
          totalBeg,
          regBeg: Math.round(runningRegBeg * 100) / 100,
          extraBeg: Math.round(runningExtraBeg * 100) / 100,
          personCredits,
          totalRegCredits,
          billValues,
          otherAmt: Math.round(otherAmt * 100) / 100,
          otherDesc: customOtherDesc,
          regEnding,
          extraEnding,
          totalEnd,
          isDeficit: totalEnd < 0,
          isHistoricalLock
        });

        // Carry ending balances forward as the next day's opening
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
    startDateObj,
    showExtraColumns
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

  // Sync toolbar Month & Year selector using IntersectionObserver on month headers (zero forced reflows)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const headers = container.querySelectorAll('tr[data-month-header]');
    if (!headers.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const raw = entry.target.getAttribute('data-month-header');
            if (raw) {
              const [yStr, mStr] = raw.split('-');
              const y = parseInt(yStr, 10);
              const m = parseInt(mStr, 10);
              if (!isNaN(y) && !isNaN(m)) {
                setSelectedMonth(m);
                setSelectedYear(y);
              }
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '0px 0px -75% 0px',
        threshold: 0
      }
    );

    headers.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, [monthGroups]);

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
      bills: {},
      other: 0,
      totalRegCredits: 0,
      totalBills: 0
    };

    accountPeople.forEach(p => {
      totals.regCredits[p.id] = 0;
    });

    accountBills.forEach(b => {
      totals.bills[b.id] = 0;
    });

    const selectedMonthRows = matrixData.filter(r => r.month === selectedMonth && r.year === selectedYear);

    selectedMonthRows.forEach(r => {
      accountPeople.forEach(p => {
        totals.regCredits[p.id] += r.personCredits[p.id] || 0;
      });

      accountBills.forEach(b => {
        totals.bills[b.id] += r.billValues[b.id] || 0;
      });

      totals.other += r.otherAmt || 0;
      totals.totalRegCredits += r.totalRegCredits;
    });

    totals.other = Math.round(totals.other * 100) / 100;
    totals.totalBills = Object.values(totals.bills).reduce((s, v) => s + v, 0);

    return totals;
  }, [matrixData, selectedMonth, selectedYear, accountPeople, accountBills]);

  const finalEndingBalance = matrixData[matrixData.length - 1]?.totalEnd || 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={matrixCollisionDetection}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border border-slate-800 glass-panel shadow-2xl">

      {/* Compact Fixed Toolbar Header - Scooted to Left for Maximum Workspace */}
      <div className="relative z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-3 py-1.5 min-h-[42px] flex items-center justify-between gap-3 shadow-lg shrink-0 whitespace-nowrap text-xs">
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Account Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-blue-500/50 shadow-sm transition-all text-xs">
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

          {/* Earner / Creditor Filter Popover */}
          <div className="relative" ref={earnerDropdownRef}>
            <button
              type="button"
              onClick={() => setShowEarnerDropdown(!showEarnerDropdown)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold text-xs shadow-sm transition-all cursor-pointer ${
                accountPeople.length < people.length
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 hover:bg-emerald-900/80'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
              title="Filter Creditors / Earners shown for this account"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Earners ({accountPeople.length}/{people.length})</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showEarnerDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showEarnerDropdown && (
              <div className="absolute left-0 mt-2 w-60 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-3 z-[100] space-y-2 animate-fade-in text-xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                  <span className="font-bold text-slate-200 text-[11px]">Creditors for {selectedAccount?.name || 'View'}</span>
                  {selectedAccountId !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = people.map(p => p.id);
                        updateAccount(selectedAccountId, { enabledEarners: allIds });
                      }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Select All
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {people.map(p => {
                    const isChecked = accountPeople.some(ap => ap.id === p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-colors ${
                          isChecked ? 'bg-slate-800/80 text-slate-100' : 'text-slate-400 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleEarner(p.id)}
                            disabled={selectedAccountId === 'all'}
                            className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 focus:outline-none cursor-pointer"
                          />
                          <span className="font-medium text-xs">{p.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{p.role || 'Earner'}</span>
                      </label>
                    );
                  })}
                </div>
                {selectedAccountId === 'all' && (
                  <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-800">
                    Select a specific account above to customize its creditors.
                  </p>
                )}
              </div>
            )}
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 hover:border-amber-400 font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
            title="Jump to Today's Date"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Today</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Account-Bound Import Button */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm shadow-indigo-600/30 transition-all cursor-pointer active:scale-95 flex-shrink-0"
            title={selectedAccountId !== 'all' && selectedAccount ? `Import CSV or Spreadsheet directly into ${selectedAccount.name}` : 'Import CSV or Spreadsheet'}
          >
            <Upload className="w-3.5 h-3.5 text-indigo-200" />
            <span>Import CSV/Spreadsheet</span>
          </button>

          {/* Archived Bills Drawer Toggle */}
          {archivedBills.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchivedBills(!showArchivedBills)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-xs shadow-sm transition-all cursor-pointer ${
                showArchivedBills
                  ? 'bg-amber-600/20 text-amber-300 border-amber-500/60'
                  : 'bg-slate-800/90 hover:bg-slate-800 text-amber-400 border-slate-700'
              }`}
              title="View & Restore Archived Bills"
            >
              <Archive className="w-3.5 h-3.5 text-amber-400" />
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
        className="flex-1 min-h-0 overflow-auto matrix-scrollbar relative"
      >
        <table className="w-full text-left text-[10px] border-separate border-spacing-0">
          {/* Header Row 1 & 2: Sticky Matrix Header */}
          <thead>
            {/* Header Row 1: Category Banners & Spanning Headers */}
            <tr className="bg-slate-950 text-slate-300 uppercase font-extrabold text-[9px] tracking-wider h-6">
              {/* Date, Day & Total Beg Banner Container */}
              <th colSpan={3} className="p-0 h-6 bg-slate-950 border-r border-slate-700 sticky left-0 top-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.5)]"></th>

              {/* Beg Balances Banner */}
              <th colSpan={showExtraColumns ? 2 : 1} className="px-2 h-6 text-center border-r-2 border-blue-600 bg-blue-950 text-blue-200 font-black sticky top-0 z-20 align-middle">Beg Balances</th>
              <th colSpan={accountPeople.length} className="px-2 h-6 text-center border-r border-slate-800 bg-emerald-950 text-emerald-300 font-black sticky top-0 z-20 align-middle">Credits (Deposits)</th>
              <th colSpan={accountBills.length + 2} className="px-2 h-6 text-center border-r border-slate-800 bg-rose-950 text-rose-300 font-black sticky top-0 z-20 align-middle">Bills &amp; Deductions</th>
              <th colSpan={showExtraColumns ? 2 : 1} className="px-2 h-6 text-center border-r border-slate-800 bg-purple-950 text-purple-300 font-black sticky top-0 z-20 align-middle">Ending Balances</th>
              
              {/* Total End Banner Container */}
              <th colSpan={1} className="p-0 h-6 min-w-[76px] w-[76px] max-w-[76px] bg-slate-950 border-l border-slate-700 sticky right-0 top-0 z-30 shadow-[-4px_0_8px_rgba(0,0,0,0.5)]"></th>
            </tr>

            {/* Header Row 2: Individual Columns (2-Line Responsive Headers, Full Legibility) */}
            <tr className="bg-slate-900 text-slate-300 font-bold text-xs h-10">
              {/* Date & Day Subheaders */}
              <th className="px-1 h-10 min-w-[80px] w-[80px] max-w-[80px] bg-slate-950 text-slate-200 font-bold text-center align-middle sticky left-0 top-[24px] z-30 border-b border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                Date
              </th>
              <th className="px-1 h-10 min-w-[46px] w-[46px] max-w-[46px] bg-slate-950 text-slate-200 font-bold text-center align-middle sticky left-[80px] top-[24px] z-30 border-b border-slate-700">
                Day
              </th>

              {/* Total Beg (Sticky Frozen Left) */}
              <th className="px-1.5 h-10 min-w-[76px] w-[76px] max-w-[76px] bg-slate-950 text-blue-300 font-black text-right align-middle sticky left-[126px] top-[24px] z-30 border-b border-slate-700 border-r border-slate-700 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">
                <span className="block text-[11px] leading-tight">Total<br/>Beg</span>
              </th>

              {/* Regular Beg Balance */}
              <th className="px-1.5 h-10 text-right min-w-[72px] bg-slate-900 text-blue-300 font-bold border-r border-blue-900/80 align-middle sticky top-[24px] z-20 border-b border-slate-700">
                <span className="block text-[11px] leading-tight">Reg<br/>Beg</span>
              </th>
              {showExtraColumns && (
                <th className="px-1.5 h-10 text-right min-w-[72px] border-r-2 border-blue-600 bg-slate-900 text-blue-300 font-bold align-middle sticky top-[24px] z-20 border-b border-slate-700">
                  <span className="block text-[11px] leading-tight">Extra<br/>Beg</span>
                </th>
              )}

              {/* Credits */}
              {accountPeople.map(p => (
                <th key={`hdr-cred-${p.id}`} className="px-2 h-10 text-right min-w-[85px] text-emerald-400 bg-slate-900 border-r border-slate-800 align-middle sticky top-[24px] z-20 border-b border-slate-700 font-bold" title={`${p.name} Deposit`}>
                  <span className="block text-[11px] leading-tight break-words whitespace-normal text-right">{p.name}</span>
                </th>
              ))}

              {/* Bill Columns with Direct Inline Editing and 2nd Confirmation Archive */}
              {accountBills.map(b => (
                <th key={`hdr-bill-${b.id}`} className="px-2 h-10 text-right min-w-[115px] text-rose-300 bg-slate-900 group align-middle sticky top-[24px] z-20 border-b border-slate-700 border-r border-slate-800 relative font-bold" title={`${b.name} ($${b.amount})`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBillToArchive(b);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:scale-110 p-0.5 text-slate-400 hover:text-amber-400 transition-all rounded absolute top-1 left-0.5 z-10 cursor-pointer"
                    title={`Archive bill "${b.name}"`}
                  >
                    <Archive className="w-3 h-3" />
                  </button>
                  {editingBillId === b.id ? (
                    <input
                      type="text"
                      value={billDraftName}
                      autoFocus
                      onChange={e => setBillDraftName(e.target.value)}
                      onBlur={() => {
                        if (billDraftName.trim() && billDraftName.trim() !== b.name) {
                          updateBill(b.id, { name: billDraftName.trim() });
                        }
                        setEditingBillId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') setEditingBillId(null);
                      }}
                      className="bg-slate-950 text-rose-200 border border-rose-500 rounded px-1 py-0.5 text-[11px] font-bold text-right w-full outline-none"
                    />
                  ) : (
                    <div
                      onClick={() => {
                        setEditingBillId(b.id);
                        setBillDraftName(b.name);
                      }}
                      className="cursor-pointer hover:text-white hover:underline transition-colors block text-[11px] leading-tight font-bold text-rose-300 break-words whitespace-normal text-right"
                      title={`Click to rename "${b.name}"`}
                    >
                      {b.name}
                    </div>
                  )}
                </th>
              ))}
              <th className="px-1.5 h-10 text-right min-w-[65px] text-amber-300 bg-slate-900 align-middle sticky top-[24px] z-20 border-b border-slate-700 border-r border-slate-800 font-bold">
                <span className="block text-[11px] leading-tight">Other<br/>$</span>
              </th>
              <th className="px-2 h-10 text-left min-w-[120px] text-amber-300/80 bg-slate-900 border-r border-slate-800 align-middle sticky top-[24px] z-20 border-b border-slate-700 font-semibold">
                <span className="block text-[11px] leading-tight">Other<br/>Description</span>
              </th>

              {/* Ending Balances */}
              <th className="px-1.5 h-10 text-right min-w-[72px] text-purple-300 bg-slate-900 align-middle sticky top-[24px] z-20 border-b border-slate-700 border-r border-slate-800 font-bold" title="Click any row cell below to edit Regular Ending Balance">
                <span className="block text-[11px] leading-tight">Reg<br/>End</span>
              </th>
              {showExtraColumns && (
                <th className="px-1.5 h-10 text-right min-w-[72px] text-purple-300 bg-slate-900 border-r border-slate-800 align-middle sticky top-[24px] z-20 border-b border-slate-700 font-bold" title="Click any row cell below to edit Extra Ending Balance">
                  <span className="block text-[11px] leading-tight">Extra<br/>End</span>
                </th>
              )}

              {/* Total End Subheader */}
              <th className="px-1.5 h-10 min-w-[76px] w-[76px] max-w-[76px] bg-slate-950 text-blue-300 font-black sticky right-0 top-[24px] z-30 align-middle text-right border-b border-slate-700 border-l border-slate-700 shadow-[-4px_0_8px_rgba(0,0,0,0.5)]">
                <span className="block text-[11px] leading-tight">Total<br/>End</span>
              </th>
            </tr>
          </thead>

          {/* Matrix Rows (Continuous Multi-Month Stream with Natural In-Flow Month Banners) */}
          {monthGroups.map(group => (
            <tbody key={group.monthKey} className="divide-y divide-slate-800/50 font-mono text-[10px]">
              {/* Natural In-Flow Month Header Row (Non-sticky so it never obscures date rows) */}
              <tr
                className="bg-slate-950 border-b border-slate-800"
                data-month-header={`${group.year}-${group.month}`}
              >
                <td
                  colSpan={100}
                  className="py-1 px-3 bg-slate-950 text-slate-300 border-b border-slate-800"
                >
                  <div className="inline-flex items-center gap-1.5 font-mono uppercase tracking-wider text-[11px] font-bold text-blue-400">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>{group.monthLabel}</span>
                  </div>
                </td>
              </tr>

              {group.rows.map(row => {
                const isFirstSelectedDay = row.month === selectedMonth && row.year === selectedYear && row.day === 1;
                const rowRef = row.isToday ? todayRowRef : (isFirstSelectedDay ? firstSelectedMonthRowRef : null);
                const isSelected = row.rowKey === selectedRowKey;

                return (
                  <tr
                    key={row.rowKey}
                    ref={rowRef}
                    data-month={row.month}
                    data-year={row.year}
                    data-rowkey={row.rowKey}
                    onClick={(e) => {
                      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                        setSelectedRowKey(prev => prev === row.rowKey ? null : row.rowKey);
                      }
                    }}
                    className={`transition-colors cursor-pointer ${
                      row.isToday && isSelected
                        ? 'bg-amber-900/90 border-l-4 border-l-amber-300 border-r-2 border-r-amber-300 border-y-2 border-y-amber-300 ring-2 ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.6)] font-extrabold text-amber-100 z-10'
                        : row.isToday
                          ? 'bg-amber-950/70 border-l-4 border-l-amber-400 border-r-2 border-r-amber-400 border-y border-y-amber-400/80 ring-1 ring-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.35)] font-extrabold text-amber-100 z-10'
                          : isSelected
                            ? 'bg-blue-950/80 border-l-4 border-l-blue-400 border-r-2 border-r-blue-400 border-y-2 border-y-blue-500 ring-2 ring-blue-500/70 shadow-[0_0_18px_rgba(59,130,246,0.45)] font-bold text-blue-100 z-10'
                            : row.isHistoricalLock
                              ? 'bg-indigo-950/20 border-l-2 border-l-indigo-500/60 opacity-70 hover:opacity-90 hover:bg-indigo-950/30'
                              : row.isDeficit
                                ? 'bg-rose-950/30 hover:bg-slate-800/40'
                                : row.isPayday
                                  ? 'bg-emerald-950/25 border-l-2 border-l-emerald-500 hover:bg-slate-800/40'
                                  : 'hover:bg-slate-800/50'
                    }`}
                  >
                      {/* Date (Frozen Left & Highlight) */}
                      <td className={`p-1 font-black whitespace-nowrap min-w-[80px] w-[80px] max-w-[80px] sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.4)] ${
                        row.isToday
                          ? 'bg-amber-950 text-amber-300 border-l-4 border-l-amber-400 border-y border-y-amber-400/80'
                          : isSelected
                            ? 'bg-blue-950 text-blue-200 border-l-4 border-l-blue-400 border-y border-y-blue-500'
                            : 'bg-slate-900 text-slate-300'
                      }`}>
                        <div className="flex items-center justify-center font-mono">
                          <span>{row.dateFormatted}</span>
                        </div>
                      </td>

                      {/* Day of Week / NOW Highlight (Frozen Left) */}
                      <td className={`p-1 text-center whitespace-nowrap min-w-[46px] w-[46px] max-w-[46px] sticky left-[80px] z-20 ${
                        row.isToday
                          ? 'bg-amber-950 text-amber-300 border-y border-y-amber-400/80'
                          : isSelected
                            ? 'bg-blue-950 text-blue-200 border-y border-y-blue-500'
                            : 'bg-slate-900 text-slate-300'
                      }`}>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          row.isToday
                            ? 'bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow-md animate-pulse'
                            : isSelected
                              ? 'bg-blue-500 text-white font-black shadow-md'
                              : row.isPayday
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'text-slate-400'
                        }`}>
                          {row.isToday ? 'NOW' : row.dayOfWeekName.substring(0, 3)}
                        </span>
                      </td>

                      {/* Total Beg Balance (Frozen Left) */}
                      <td className={`p-1 text-right font-black min-w-[76px] w-[76px] max-w-[76px] sticky left-[126px] z-20 border-r border-slate-700 shadow-[4px_0_8px_rgba(0,0,0,0.5)] ${
                        row.isToday
                          ? 'bg-amber-950 text-amber-200 border-y border-y-amber-400/80'
                          : isSelected
                            ? 'bg-blue-950 text-blue-100 border-y border-y-blue-500'
                            : 'bg-slate-950 text-blue-300'
                      }`}>
                        {fmtMoney(row.totalBeg)}
                      </td>

                      {/* Regular Beg Balance */}
                      <td className={`p-1 text-right font-bold border-r border-blue-900/60 min-w-[66px] ${
                        row.isToday
                          ? 'bg-amber-950/90 text-amber-200 border-y border-y-amber-400/80'
                          : isSelected
                            ? 'bg-blue-900/40 text-blue-100 border-y border-y-blue-500/80'
                            : 'bg-blue-950/40 text-blue-200'
                      }`}>{fmtMoney(row.regBeg)}</td>

                      {/* Extra Beg Balance */}
                      {showExtraColumns && (
                        <td className={`p-1 text-right font-bold border-r-2 border-blue-600/80 min-w-[66px] ${
                          row.isToday
                            ? 'bg-amber-950/90 text-amber-200 border-y border-y-amber-400/80'
                            : isSelected
                              ? 'bg-blue-900/40 text-blue-100 border-y border-y-blue-500/80'
                              : 'bg-blue-950/40 text-blue-200'
                        }`}>{fmtMoney(row.extraBeg)}</td>
                      )}

                      {/* Earner Credits */}
                      {accountPeople.map(p => (
                        <DroppableCellTd
                          key={`cred-${row.rowKey}-${p.id}`}
                          row={row}
                          field={`credit_${p.id}`}
                          className={`p-1 text-right min-w-[65px] border-r border-slate-800/80 transition-colors relative ${
                            isSelected && !row.isToday ? 'bg-blue-950/30' : ''
                          }`}
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

                      {/* Individual Bill Columns */}
                      {accountBills.map(b => (
                        <DroppableCellTd
                          key={`bill-${row.rowKey}-${b.id}`}
                          row={row}
                          field={`bill_${b.id}`}
                          className={`p-1 text-right min-w-[70px] transition-colors relative ${
                            isSelected && !row.isToday ? 'bg-blue-950/30' : ''
                          }`}
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

                      {/* Consolidated Other Column */}
                      <DroppableCellTd
                        row={row}
                        field="other_amount"
                        className={`p-1 text-right min-w-[55px] transition-colors relative ${
                          isSelected && !row.isToday ? 'bg-blue-950/30' : ''
                        }`}
                        isBillField={row.otherAmt < 0}
                      >
                        <MatrixCell
                          value={row.otherAmt}
                          isOther
                          monthKey={row.monthKey}
                          day={row.day}
                          field="other_amount"
                          onCommit={handleCellCommit}
                          draggable={Boolean(row.otherAmt && row.otherAmt !== 0)}
                          dragLabel={row.otherDesc ? `Other (${row.otherDesc})` : 'Other'}
                          otherDesc={row.otherDesc}
                          selectedAccountId={selectedAccountId}
                        />
                      </DroppableCellTd>

                      {/* Single Other Description */}
                      <td className={`p-1 border-r border-slate-800/80 min-w-[120px] ${
                        isSelected && !row.isToday ? 'bg-blue-950/30' : ''
                      }`} title={row.otherDesc || 'Click to edit other description'}>
                        <IsolatedTextInput
                          value={row.otherDesc}
                          monthKey={row.monthKey}
                          day={row.day}
                          field="other_desc"
                          onCommit={handleCellCommit}
                          placeholder="—"
                          className="bg-transparent text-[10px] text-slate-300 hover:bg-slate-800/70 focus:bg-slate-800 focus:text-white px-1.5 py-0.5 rounded outline-none w-full truncate cursor-text transition-colors border border-transparent hover:border-slate-700/60"
                        />
                      </td>

                      {/* Regular Ending Balance (Editable) */}
                      <td className={`p-1 text-right font-bold min-w-[72px] ${
                        isSelected && !row.isToday ? 'text-blue-100 bg-blue-950/40' : (row.regEnding < 0 ? 'text-rose-400' : 'text-slate-200')
                      }`}>
                        <InlineEdit
                          value={row.regEnding}
                          type="currency"
                          onCommit={(val) => handleCellCommit(row.monthKey, row.day, 'reg_ending', val)}
                          displayFn={() => (
                            <span className={`font-mono text-[10px] font-bold ${
                              isSelected && !row.isToday
                                ? 'text-blue-100'
                                : row.regEnding < 0
                                  ? 'text-rose-400'
                                  : 'text-slate-200'
                            }`}>
                              {fmtMoney(row.regEnding)}
                            </span>
                          )}
                          className="justify-end w-full"
                        />
                      </td>

                      {/* Extra Ending Balance (Editable) */}
                      {showExtraColumns && (
                        <td className={`p-1 text-right border-r border-slate-800/80 min-w-[72px] ${
                          isSelected && !row.isToday ? 'bg-blue-950/40 text-blue-100' : (row.extraEnding < 0 ? 'text-rose-400' : 'text-slate-300')
                        }`}>
                          <InlineEdit
                            value={row.extraEnding}
                            type="currency"
                            onCommit={(val) => handleCellCommit(row.monthKey, row.day, 'extra_ending', val)}
                            displayFn={() => (
                              <span className={`font-mono text-[10px] ${
                                isSelected && !row.isToday
                                  ? 'text-blue-100'
                                  : row.extraEnding < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-300'
                              }`}>
                                {fmtMoney(row.extraEnding)}
                              </span>
                            )}
                            className="justify-end w-full"
                          />
                        </td>
                      )}

                      {/* Total End Balance (Sticky Right) */}
                      <td className={`p-1 min-w-[72px] w-[72px] max-w-[72px] text-right font-extrabold sticky right-0 z-20 border-l border-slate-700 shadow-[-4px_0_8px_rgba(0,0,0,0.5)] ${
                        row.isToday
                          ? 'bg-amber-950 text-amber-100 border-y border-y-amber-400/80'
                          : isSelected
                            ? 'bg-blue-950 text-blue-100 border-y border-y-blue-500'
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
              <td colSpan={3} className="p-1 text-slate-300 bg-slate-900 border-r border-slate-700 sticky left-0 z-40 shadow-[4px_0_8px_rgba(0,0,0,0.5)]">Monthly Subtotals</td>
              <td className="p-1 text-right text-slate-400 bg-slate-900">&mdash;</td>
              {showExtraColumns && (
                <td className="p-1 text-right text-slate-400 bg-slate-900 border-r border-slate-800">&mdash;</td>
              )}

              {/* Credit Subtotals */}
              {accountPeople.map(p => {
                const tot = columnTotals.regCredits[p.id] || 0;
                return (
                  <td key={`tot-cred-${p.id}`} className={`p-1 text-right font-mono bg-slate-900 min-w-[72px] border-r border-slate-800 ${tot < 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                    {tot >= 0 ? `+${fmtMoney(tot)}` : fmtMoney(tot)}
                  </td>
                );
              })}

              {/* Bill Subtotals */}
              {accountBills.map(b => (
                <td key={`tot-bill-${b.id}`} className="p-1 text-right text-rose-400 font-mono bg-slate-900 min-w-[82px]">
                  -{fmtMoney(columnTotals.bills[b.id])}
                </td>
              ))}
              <td className={`p-1 text-right font-mono bg-slate-900 min-w-[55px] ${
                columnTotals.other > 0 ? 'text-emerald-400' : columnTotals.other < 0 ? 'text-rose-300 font-semibold' : 'text-slate-400'
              }`}>
                {columnTotals.other !== 0
                  ? columnTotals.other > 0
                    ? `+${fmtMoney(columnTotals.other)}`
                    : fmtMoney(columnTotals.other)
                  : '$ -'}
              </td>
              <td className="p-1 bg-slate-900 border-r border-slate-800">&mdash;</td>

              {/* Ending Balances Subtotals */}
              <td className="p-1 text-right font-mono text-slate-200 bg-slate-900 min-w-[66px]">&mdash;</td>
              {showExtraColumns && (
                <td className="p-1 text-right font-mono text-slate-200 bg-slate-900 border-r border-slate-800 min-w-[66px]">&mdash;</td>
              )}
              {/* Sticky Right Total End Footer */}
              <td className="p-1 text-right font-mono text-blue-400 font-black bg-slate-950 border-l border-slate-700 sticky right-0 z-40 shadow-[-4px_0_8px_rgba(0,0,0,0.5)] min-w-[76px] w-[76px] max-w-[76px]">
                {fmtMoney(finalEndingBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Floating Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        <MatrixDragOverlay />
      </DragOverlay>

      {/* Smart Spreadsheet & Bank Importer Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            <SpreadsheetImporter
              isModal={true}
              onClose={() => setIsImportModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Archive Bill Confirmation Modal (2nd Confirmation Popup) */}
      {billToArchive && (
        <div className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30">
                <Archive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-100">Archive Bill Column?</h4>
                <p className="text-xs text-amber-300/90 font-mono font-bold">"{billToArchive.name}"</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to archive the <strong className="text-white font-bold">{billToArchive.name}</strong> column? It will be hidden from your active spreadsheet register, but you can restore it anytime from the <span className="text-amber-400 font-semibold">Archived Bills</span> drawer.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBillToArchive(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  archiveBill(billToArchive.id);
                  setBillToArchive(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
              >
                Archive Bill
              </button>
            </div>
          </div>
        </div>
      )}
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
