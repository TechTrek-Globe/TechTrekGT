import React, { useState, useMemo, useEffect } from 'react';
import { useBudget } from '../context/BudgetContext';
import { InlineEdit } from './InlineEdit';
import { AccountTransferSummary } from './AccountTransferSummary';
import { getPersonDepositAmountForAccount } from '../utils/paydayUtils';
import {
  DollarSign,
  TrendingUp,
  Clock,
  PieChart as PieIcon,
  ShieldCheck,
  Zap,
  GripVertical,
  EyeOff,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  X,
  Users,
  AlertCircle,
  Info
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { fmtMoney, fmtPct } from '../utils/formatters';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ACCOUNT_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Radial health gauge (SVG-based, memoized to prevent animation thrashing)
const HealthGauge = React.memo(function HealthGauge({ score }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = useMemo(() => circumference - (score / 100) * circumference, [score, circumference]);
  const color = useMemo(() => (score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#f43f5e'), [score]);
  const label = useMemo(() => (score >= 70 ? 'Healthy' : score >= 40 ? 'Fair' : 'At Risk'), [score]);

  return (
    <div
      className="flex flex-col items-center justify-center gap-1"
      role="img"
      aria-label={`Budget health score: ${score} out of 100 (${label})`}
    >
      <svg width="90" height="90" viewBox="0 0 100 100" className="-rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="text-center -mt-14">
        <span className="text-xl font-black font-mono" style={{ color }}>{score}</span>
        <p className="text-xs font-semibold" style={{ color }}>{label}</p>
      </div>
    </div>
  );
});

// Draggable Sortable Dashboard Widget Item
function SortableDashboardWidget({
  widget,
  idx,
  isLight,
  currentWidth,
  customSize,
  columnSpanClass,
  widgetTitle,
  cardStyle,
  renderWidgetContent,
  handlePresetWidth,
  reorderDashboardWidgets,
  toggleDashboardWidgetVisibility,
  startCornerResize,
  totalWidgetsCount
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: widget.id });

  const style = {
    ...cardStyle,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${columnSpanClass} rounded-2xl border ${
        isLight
          ? isDragging
            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/80 shadow-2xl scale-[1.01]'
            : 'bg-white border-slate-200 shadow-md hover:border-slate-300 text-slate-900'
          : isDragging
            ? 'border-blue-500 ring-2 ring-blue-500/80 shadow-2xl scale-[1.01] bg-slate-800/95 text-slate-100'
            : 'bg-slate-900/90 border-slate-800/90 shadow-xl hover:border-slate-700 text-slate-100'
      } ${widget.id === 'split_pairings' ? 'overflow-visible z-20' : 'overflow-hidden'} transition-all duration-200 group/card`}
    >
      {/* Header Drag, Reorder & Size Bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b text-xs ${
        isLight ? 'bg-slate-100/90 border-slate-200 text-slate-700' : 'bg-slate-950/80 border-slate-800 text-slate-300'
      }`}>
        <div
          {...attributes}
          {...listeners}
          className={`flex items-center gap-2 font-bold cursor-grab active:cursor-grabbing select-none truncate ${
            isLight ? 'text-slate-800' : 'text-slate-300'
          }`}
        >
          <GripVertical className={`w-4 h-4 flex-shrink-0 transition-colors ${
            isLight ? 'text-slate-400 hover:text-blue-600' : 'text-slate-500 hover:text-blue-400'
          }`} />
          <span className="truncate">{widgetTitle}</span>
        </div>

        {/* Size Selector, Move Up/Down & Hide Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {/* Quick Box Sizing Pill */}
          <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-lg border ${
            isLight ? 'bg-slate-200/80 border-slate-300' : 'bg-slate-900 border-slate-800'
          }`}>
            <button
              type="button"
              onClick={() => handlePresetWidth(widget.id, 'third')}
              className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                currentWidth === 'third' && !customSize.customWidth
                  ? 'bg-blue-600 text-white'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Make Box Small (1/3 Width Side Card)"
              aria-label="Set widget width to 1/3 small"
            >
              1/3
            </button>
            <button
              type="button"
              onClick={() => handlePresetWidth(widget.id, 'half')}
              className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                currentWidth === 'half' && !customSize.customWidth
                  ? 'bg-blue-600 text-white'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Make Box Medium (1/2 Width)"
              aria-label="Set widget width to 1/2 medium"
            >
              1/2
            </button>
            <button
              type="button"
              onClick={() => handlePresetWidth(widget.id, 'full')}
              className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                currentWidth === 'full' && !customSize.customWidth
                  ? 'bg-blue-600 text-white'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Make Box Full Width"
              aria-label="Set widget width to full width"
            >
              Full
            </button>
          </div>

          {/* Move Up/Down */}
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => reorderDashboardWidgets(idx, idx - 1)}
            className={`px-1.5 py-0.5 rounded disabled:opacity-30 transition-colors text-[10px] font-mono ${
              isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            title="Move Up"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={idx === totalWidgetsCount - 1}
            onClick={() => reorderDashboardWidgets(idx, idx + 1)}
            className={`px-1.5 py-0.5 rounded disabled:opacity-30 transition-colors text-[10px] font-mono ${
              isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            title="Move Down"
          >
            ▼
          </button>

          {/* Hide / X button */}
          <button
            type="button"
            onClick={() => toggleDashboardWidgetVisibility(widget.id)}
            className={`p-1 rounded transition-colors ${
              isLight
                ? 'bg-slate-200 hover:bg-rose-100 text-slate-600 hover:text-rose-600'
                : 'bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300'
            }`}
            title="Close / Hide this box from Dashboard (Click X to close)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Widget Body */}
      <div
        className="p-4 overflow-y-auto"
        style={{ maxHeight: customSize.customHeight ? `${customSize.customHeight - 42}px` : undefined }}
      >
        {renderWidgetContent(widget.id, currentWidth, customSize.customWidth)}
      </div>

      {/* Interactive Bottom-Right Corner Drag-to-Resize Handle */}
      <div
        onMouseDown={(e) => startCornerResize(e, widget.id, customSize.customWidth, customSize.customHeight)}
        className="absolute bottom-1 right-1 w-5 h-5 cursor-se-resize flex items-center justify-center text-slate-500 hover:text-blue-400 opacity-40 group-hover/card:opacity-100 transition-all select-none z-20"
        title="Click and drag corner to resize this box to any custom width or height"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 2L2 10M10 6L6 10M10 10L10 10" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export function DashboardView() {
  const {
    budget,
    hideDashboardHeader,
    toggleHideDashboardHeader,
    dashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    setDashboardWidgetCustomSize,
    reorderDashboardWidgets,
    setIsSettingsOpen,
    setSettingsTab,
    getMonthlyNetIncome,
    getTotalMonthlyNetIncome,
    getTotalMonthlyExpenses,
    getTotalCashOnHand,
    getAccountMonthlyExpenses,
    getUpcomingBills,
    getBillMonthlyCost,
    getBillPersonMonthlyPortion,
    getPersonMonthlyTotal,
    getPersonPerPaycheckTotal,
    getTotalActualExpenses,
    getAccountActualExpenses,
    getAccountActualEndBalance,
    updateAccount,
    updateBillSplits,
    getPersonDepositAmountForAccount
  } = useBudget();

  const [resizingSizes, setResizingSizes] = useState({});
  const [activeWidgetId, setActiveWidgetId] = useState(null);
  const [pinnedSplitTooltip, setPinnedSplitTooltip] = useState(null);

  useEffect(() => {
    if (!pinnedSplitTooltip) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-split-tooltip]')) {
        setPinnedSplitTooltip(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [pinnedSplitTooltip]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const visibleWidgets = useMemo(
    () => dashboardWidgets.filter(w => w.visible),
    [dashboardWidgets]
  );

  const visibleWidgetIds = useMemo(
    () => visibleWidgets.map(w => w.id),
    [visibleWidgets]
  );

  const handleDragStart = (event) => {
    setActiveWidgetId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = dashboardWidgets.findIndex(w => w.id === active.id);
      const newIndex = dashboardWidgets.findIndex(w => w.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderDashboardWidgets(oldIndex, newIndex);
      }
    }
    setActiveWidgetId(null);
  };

  const handleDragCancel = () => {
    setActiveWidgetId(null);
  };

  const activeWidget = useMemo(
    () => dashboardWidgets.find(w => w.id === activeWidgetId),
    [dashboardWidgets, activeWidgetId]
  );

  const isLight = budget?.theme === 'light';

  const dismissHeader = () => {
    toggleHideDashboardHeader(true);
  };

  const today    = new Date();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const netIncome     = useMemo(() => getTotalMonthlyNetIncome(), [budget?.people]);
  const totalExpenses  = useMemo(() => getTotalMonthlyExpenses(), [budget?.bills]);
  const netCashFlow   = useMemo(() => netIncome - totalExpenses, [netIncome, totalExpenses]);
  const savingsRate   = useMemo(() => netIncome > 0 ? ((netCashFlow / netIncome) * 100) : 0, [netIncome, netCashFlow]);
  const cashOnHand    = useMemo(() => getTotalCashOnHand(), [budget?.accounts]);
  const upcomingBills = useMemo(() => getUpcomingBills(5), [budget?.bills, getUpcomingBills]);

  // Budget health score (0-100)
  const healthScore = useMemo(() => {
    let score = 100;
    if (netIncome > 0) {
      const expenseRatio = totalExpenses / netIncome;
      if (expenseRatio > 1.0)  score -= 40;
      else if (expenseRatio > 0.9) score -= 20;
      else if (expenseRatio > 0.75) score -= 10;
    } else { score -= 30; }
    if (savingsRate < 10) score -= 15;
    else if (savingsRate < 20) score -= 5;
    (budget?.accounts || []).forEach(acc => {
      const expenses = getAccountMonthlyExpenses(acc.id);
      if ((acc.startingBalance || 0) - expenses < 0) score -= 10;
    });
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [budget?.accounts, getAccountMonthlyExpenses, netIncome, totalExpenses, savingsRate]);

  // Chart data (memoized)
  const accountChartData = useMemo(() =>
    (budget?.accounts || []).map((acc, i) => ({
      name: (acc.name || '').split('-')[0].trim(),
      value: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
      color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]
    })).filter(d => d.value > 0),
    [budget?.accounts, budget?.bills, getAccountMonthlyExpenses]
  );

  const projActualData = useMemo(() =>
    (budget?.accounts || []).map((acc, i) => ({
      name: (acc.name || '').split('-')[0].trim(),
      projected: parseFloat(getAccountMonthlyExpenses(acc.id).toFixed(2)),
      actual: parseFloat(getAccountActualExpenses(acc.id, monthKey).toFixed(2)),
    })).filter(d => d.projected > 0),
    [budget?.accounts, budget?.bills, budget?.lineItems, monthKey, getAccountMonthlyExpenses, getAccountActualExpenses]
  );

  const getWidthClass = (w) => {
    switch (w) {
      case 'full':
        return 'col-span-1 md:col-span-2 lg:col-span-3';
      case 'half':
        return 'col-span-1 md:col-span-2 lg:col-span-2';
      case 'third':
      default:
        return 'col-span-1';
    }
  };

  // Interactive Corner Drag Resizer Logic
  const startCornerResize = (e, widgetId, initialWidth, initialHeight) => {
    e.preventDefault();
    e.stopPropagation();

    const cardElement = e.currentTarget.parentElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = cardElement.getBoundingClientRect();
    const startW = initialWidth || rect.width;
    const startH = initialHeight || rect.height;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(260, Math.round(startW + (moveEvent.clientX - startX)));
      const newHeight = Math.max(140, Math.round(startH + (moveEvent.clientY - startY)));
      setResizingSizes(prev => ({
        ...prev,
        [widgetId]: { customWidth: newWidth, customHeight: newHeight }
      }));
    };

    const onMouseUp = (upEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalWidth = Math.max(260, Math.round(startW + (upEvent.clientX - startX)));
      const finalHeight = Math.max(140, Math.round(startH + (upEvent.clientY - startY)));
      setDashboardWidgetCustomSize(widgetId, { customWidth: finalWidth, customHeight: finalHeight });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handlePresetWidth = (widgetId, widthType) => {
    setResizingSizes(prev => {
      const next = { ...prev };
      delete next[widgetId];
      return next;
    });
    setDashboardWidgetWidth(widgetId, widthType);
  };

  // Render widget body content based on widget ID
  const renderWidgetContent = (id, width, customWidth) => {
    const effectiveWidth = customWidth || (width === 'full' ? 900 : width === 'half' ? 600 : 320);
    const isCompact = effectiveWidth < 520;

    switch (id) {
      case 'kpi_hero':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Box 1: Total Cash on Hand */}
            <div className="p-3.5 rounded-2xl glass-panel border border-blue-900/40 bg-blue-950/20 flex items-center justify-between gap-2 overflow-hidden min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-slate-400 block truncate">Total Cash on Hand</span>
                <div className="text-lg font-black text-slate-100 font-mono mt-0.5 truncate">{fmtMoney(cashOnHand)}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] truncate">
                  <span className="text-slate-500">Net Flow:</span>
                  <span className={`font-mono font-bold ${netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {netCashFlow >= 0 ? '+' : ''}{fmtMoney(netCashFlow)}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            {/* Box 2: Monthly Income vs Expenses */}
            <div className="p-3.5 rounded-2xl glass-panel border border-emerald-900/40 bg-emerald-950/20 flex items-center justify-between gap-2 overflow-hidden min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-slate-400 block truncate">Monthly Income vs Expenses</span>
                <div className="text-lg font-black text-emerald-400 font-mono mt-0.5 truncate">{fmtMoney(netIncome)}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] truncate">
                  <span className="text-slate-400 font-mono">Exp: <span className="font-bold text-rose-400">{fmtMoney(totalExpenses)}</span></span>
                  <span className="text-slate-500 font-sans">&bull; {(budget?.people || []).length} earners</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
            </div>

            {/* Box 3: Savings Rate */}
            <div className="p-3.5 rounded-2xl glass-panel border border-purple-900/40 bg-purple-950/20 flex items-center justify-between gap-2 overflow-hidden min-w-0">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-slate-400 block truncate">Savings Rate</span>
                <div className="text-lg font-black text-purple-400 font-mono mt-0.5 truncate">{fmtPct(savingsRate)}</div>
                <div className="flex items-center gap-1.5 mt-1 text-[10px] truncate">
                  <span className="text-slate-500">Target 20%:</span>
                  <span className={`font-semibold ${savingsRate >= 20 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {savingsRate >= 20 ? 'On Target' : 'Below Target'}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
                <PieIcon className="w-4 h-4 text-purple-400" />
              </div>
            </div>
          </div>
        );

      case 'transfer_summary':
        return <AccountTransferSummary />;

      case 'account_cards':
        return (
          <div className={`grid gap-3 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {(budget?.accounts || []).map((acc, i) => {
              const monthlyCost = getAccountMonthlyExpenses(acc.id);
              const actualCost  = getAccountActualExpenses(acc.id, monthKey);
              const actualEnd   = getAccountActualEndBalance(acc.id, monthKey);
              const projEnd     = (acc.startingBalance || 0) - monthlyCost;
              const accentColor = ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
              const hasActualOverride = Math.abs(monthlyCost - actualCost) > 0.001;

              return (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 hover:border-slate-700 transition-all"
                  style={{ borderLeftColor: accentColor, borderLeftWidth: '4px' }}
                  aria-label={`Account summary for ${acc.name}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{acc.name}</h4>
                      <span className="text-xs text-slate-500 capitalize">{acc.type}</span>
                    </div>
                    <div className="text-right">
                      <InlineEdit
                        value={acc.startingBalance || 0}
                        type="currency"
                        onCommit={v => updateAccount(acc.id, { startingBalance: v })}
                        className="text-xs font-black text-slate-100 font-mono justify-end"
                      />
                      <span className="text-xs text-slate-500 block mt-0.5">Current Balance</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-sans">Monthly Exp:</span>
                    <div className="text-right">
                      <span className="text-rose-400 font-bold">{fmtMoney(actualCost)}</span>
                      {hasActualOverride && (
                        <span className="text-xs text-slate-500 block font-sans">Proj: {fmtMoney(monthlyCost)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 font-sans">End Balance (Actual):</span>
                    <span className={`font-bold ${actualEnd < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {fmtMoney(actualEnd)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'upcoming_bills':
        return (
          <div className="space-y-2">
            {(upcomingBills || []).map(bill => (
              <div key={bill.id} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-200 truncate text-[11px]">{bill.name}</h4>
                  <p className="text-xs text-slate-400">{bill.dueDateFormatted}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="font-bold text-rose-400 font-mono text-[11px] block">{fmtMoney(bill.monthlyCost)}</span>
                  <span className={`inline-block text-xs px-1.5 py-0.2 rounded font-bold mt-0.5 ${
                    bill.daysUntilDue <= 3
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}>
                    {bill.daysUntilDue === 0 ? 'Due Today' : `${bill.daysUntilDue}d left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'expenses_pie':
        return (
          <div className="space-y-3">
            <div className="h-48">
              {accountChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={accountChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                      {accountChartData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-500 text-center py-10">No expense data</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800 text-[11px]" aria-label="Expenses by account legend">
              {accountChartData.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 bg-slate-900/60 rounded-lg">
                  <div className="flex items-center gap-1.5 truncate">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} aria-hidden="true" />
                    <span className="sr-only">Indicator color for {d.name}: </span>
                    <span className="text-slate-300 font-medium truncate">{d.name}</span>
                  </div>
                  <span className="font-mono text-slate-200 font-bold">{fmtMoney(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'proj_vs_actual':
        return (
          <div className="h-52">
            {projActualData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projActualData} barGap={4} barCategoryGap="20%">
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={45} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                  <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }} />
                  <Bar dataKey="projected" fill="#334155" radius={[3, 3, 0, 0]} name="Projected" />
                  <Bar dataKey="actual" fill="#10b981" radius={[3, 3, 0, 0]} name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-500 text-center py-10">No data available</p>
            )}
          </div>
        );

      case 'budget_health':
        return (
          <div className={`flex items-center gap-4 ${isCompact ? 'flex-col text-center' : 'flex-row'}`}>
            <HealthGauge score={healthScore} />
            <div className="flex-1 space-y-2 text-xs w-full">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Savings Target (20%):</span>
                <span className={savingsRate >= 20 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {savingsRate >= 20 ? 'Met' : 'Below Target'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60">
                <span className="text-slate-400">Expense Limit vs Income:</span>
                <span className={totalExpenses <= netIncome ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {totalExpenses <= netIncome ? 'Within Limits' : 'Exceeds'}
                </span>
              </div>
            </div>
          </div>
        );

      case 'earner_splits': {
        const peopleList = budget?.people || [];
        const totalNetMonthly = peopleList.reduce((sum, p) => sum + getMonthlyNetIncome(p), 0);
        const totalTargetMonthly = peopleList.reduce((sum, p) => sum + getPersonMonthlyTotal(p.id), 0);
        const totalSurplusMonthly = totalNetMonthly - totalTargetMonthly;

        return (
          <div className="space-y-3">
            {peopleList.length > 0 && Math.abs(totalSurplusMonthly) >= 0.01 && (
              <div className={`p-2.5 rounded-xl flex items-center justify-between font-mono text-xs ${
                totalSurplusMonthly > 0 
                  ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-200' 
                  : 'bg-rose-950/50 border border-rose-800/60 text-rose-200'
              }`}>
                <span className="font-sans font-semibold text-slate-300">
                  {totalSurplusMonthly > 0 ? 'Total Household Available for Savings:' : 'Household Budget Shortfall:'}
                </span>
                <span className="font-bold text-sm">
                  {totalSurplusMonthly > 0 ? `+${fmtMoney(totalSurplusMonthly)}` : fmtMoney(totalSurplusMonthly)}
                  <span className="text-[10px] font-normal text-slate-400 ml-1">/ mo</span>
                </span>
              </div>
            )}

            <div className={`grid gap-3 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {peopleList.map(p => {
                const monthlyInc = getMonthlyNetIncome(p);
                const billPortionSum = getPersonMonthlyTotal(p.id);
                const perPaycheckBill = getPersonPerPaycheckTotal(p.id);
                const pctOfNet = monthlyInc > 0 ? (billPortionSum / monthlyInc) * 100 : 0;

                const totalPerPaycheckDeposit = (budget?.accounts || []).reduce((sum, acc) => {
                  return sum + getPersonDepositAmountForAccount(p, acc.id);
                }, 0);
                let totalMonthlyDeposit = totalPerPaycheckDeposit;
                if (p.payFrequency === 'semi-monthly') totalMonthlyDeposit = totalPerPaycheckDeposit * 2;
                else if (p.payFrequency === 'bi-weekly') totalMonthlyDeposit = (totalPerPaycheckDeposit * 26) / 12;
                else if (p.payFrequency === 'weekly') totalMonthlyDeposit = (totalPerPaycheckDeposit * 52) / 12;

                return (
                  <div key={p.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-200">{p.name}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 font-semibold capitalize">
                        {p.payFrequency}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                      <div>
                        <span className="text-slate-500 block font-sans">Net / Pay:</span>
                        <span className="text-slate-200 font-bold">{fmtMoney(p.netPerPay || 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block font-sans">Monthly Net:</span>
                        <span className="text-emerald-400 font-bold">{fmtMoney(monthlyInc)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between font-mono text-[11px]">
                      <span className="text-slate-400 font-sans">Monthly Bill &amp; Savings Share:</span>
                      <span className="text-purple-300 font-bold">{fmtMoney(billPortionSum)} ({fmtPct(pctOfNet)})</span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-slate-400 font-sans">Per Paycheck Target:</span>
                      <span className="text-blue-300 font-bold">{fmtMoney(perPaycheckBill)}</span>
                    </div>

                    {p.accountAllocations && typeof p.accountAllocations === 'object' && Object.values(p.accountAllocations).some(v => parseFloat(v) > 0 || v === 'remaining') && (
                      <div className="pt-2 border-t border-slate-800 space-y-1">
                        <span className="text-[10px] text-purple-300 font-semibold block font-sans">Direct Deposit Allocations (Per Paycheck):</span>
                        <div className="space-y-0.5 font-mono text-[10px]">
                          {(budget?.accounts || []).map(acc => {
                            const rawVal = p.accountAllocations?.[acc.id];
                            if (!rawVal && rawVal !== 0 && rawVal !== 'remaining') return null;
                            const depositAmt = getPersonDepositAmountForAccount(p, acc.id);
                            if (depositAmt <= 0 && rawVal !== 'remaining') return null;
                            const isRemaining = rawVal === 'remaining';

                            let monthlyAccDeposit = depositAmt;
                            if (p.payFrequency === 'semi-monthly') monthlyAccDeposit = depositAmt * 2;
                            else if (p.payFrequency === 'bi-weekly') monthlyAccDeposit = (depositAmt * 26) / 12;
                            else if (p.payFrequency === 'weekly') monthlyAccDeposit = (depositAmt * 52) / 12;

                            return (
                              <div key={acc.id} className="flex items-center justify-between text-slate-300">
                                <span className="font-sans text-slate-400 truncate max-w-[140px]">{acc.name}:</span>
                                <div className="text-right">
                                  <span className="font-bold text-emerald-400">{fmtMoney(depositAmt)}</span>
                                  {isRemaining && <span className="text-xs text-emerald-300/80 font-normal ml-1">(Remaining)</span>}
                                  {p.payFrequency !== 'monthly' && (
                                    <span className="text-xs text-slate-400 font-normal ml-1.5">({fmtMoney(monthlyAccDeposit)}/mo)</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {p.payFrequency !== 'monthly' && (
                          <div className="pt-1.5 mt-1 border-t border-slate-800/80 flex items-center justify-between font-mono text-[10px]">
                            <span className="text-slate-400 font-sans font-medium">Total Per Paycheck:</span>
                            <span className="text-emerald-400 font-bold">{fmtMoney(totalPerPaycheckDeposit)}</span>
                          </div>
                        )}
                        <div className={p.payFrequency !== 'monthly' ? "pt-1 flex items-center justify-between font-mono text-[10px]" : "pt-1.5 mt-1 border-t border-slate-800/80 flex items-center justify-between font-mono text-[10px]"}>
                          <span className="text-slate-400 font-sans font-medium">Total Monthly Deposit:</span>
                          <span className="text-emerald-400 font-bold">{fmtMoney(totalMonthlyDeposit)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case 'split_pairings': {
        const splitGroups = {};
        const peopleList = budget?.people || [];
        const wageEarners = peopleList.filter(p => !p.name.toLowerCase().includes('credit') && p.role !== 'Credit' && p.role !== 'Reimbursement');
        const activePeople = wageEarners.length > 0 ? wageEarners : peopleList;

        // 1. Group Bills
        (budget?.bills || []).filter(b => !b.isArchived).forEach(b => {
          const monthlyCost = getBillMonthlyCost(b);
          if (monthlyCost <= 0) return;
          const splits = b.splits || {};
          const activeEntries = Object.entries(splits).filter(([_, pct]) => parseFloat(pct) > 0);

          let groupLabel = 'Unassigned';
          if (activeEntries.length === 1) {
            const pId = activeEntries[0][0];
            const person = peopleList.find(p => p.id === pId);
            groupLabel = `100% ${person ? person.name : pId}`;
          } else if (activeEntries.length > 1) {
            const names = activeEntries.map(([pId]) => {
              const person = peopleList.find(p => p.id === pId);
              return person ? person.name : pId;
            });
            groupLabel = names.join(' & ');
          }

          if (!splitGroups[groupLabel]) {
            splitGroups[groupLabel] = {
              label: groupLabel,
              totalMonthlyCost: 0,
              billsCount: 0,
              savingsCount: 0,
              participantPortions: {},
              participantItems: {},
              unassignedBills: []
            };
          }

          splitGroups[groupLabel].totalMonthlyCost += monthlyCost;
          splitGroups[groupLabel].billsCount += 1;

          if (groupLabel === 'Unassigned') {
            const acc = (budget?.accounts || []).find(a => a.id === b.accountId);
            splitGroups[groupLabel].unassignedBills.push({
              id: b.id,
              name: b.name,
              amount: b.amount,
              monthlyCost,
              accountName: acc?.name || 'Unassigned Account'
            });
          } else {
            activeEntries.forEach(([pId, pct]) => {
              const person = peopleList.find(p => p.id === pId);
              const pName = person ? person.name : pId;
              const splitPct = parseFloat(pct) || 0;
              const portion = (monthlyCost * splitPct) / 100;
              if (!splitGroups[groupLabel].participantPortions[pName]) {
                splitGroups[groupLabel].participantPortions[pName] = 0;
                splitGroups[groupLabel].participantItems[pName] = [];
              }
              splitGroups[groupLabel].participantPortions[pName] += portion;
              const acc = (budget?.accounts || []).find(a => a.id === b.accountId);
              splitGroups[groupLabel].participantItems[pName].push({
                type: 'bill',
                name: b.name,
                fullAmount: monthlyCost,
                splitPct,
                portionAmt: portion,
                accountName: acc?.name || 'Account'
              });
            });
          }
        });

        // 2. Group Account Extra Savings
        (budget?.accounts || []).filter(acc => acc.saveExtraMonthly > 0 && acc.enableExtraSavings !== false).forEach(acc => {
          const extraAmt = parseFloat(acc.saveExtraMonthly) || 0;
          if (extraAmt <= 0) return;

          const splits = acc.saveExtraSplits || {};
          let activeEntries = Object.entries(splits).filter(([pId, val]) => {
            if (parseFloat(val) <= 0) return false;
            if (acc.enabledEarners && Array.isArray(acc.enabledEarners) && acc.enabledEarners.length > 0) {
              return acc.enabledEarners.includes(pId);
            }
            return true;
          });

          if (activeEntries.length === 0) {
            const rawEarners = (acc.enabledEarners && Array.isArray(acc.enabledEarners) && acc.enabledEarners.length > 0)
              ? acc.enabledEarners
              : (activePeople.length > 0 ? activePeople.map(p => p.id) : peopleList.map(p => p.id));

            const enabledPeople = peopleList.filter(p => rawEarners.includes(p.id));
            const nonCreditEarners = enabledPeople.filter(p => !p.name.toLowerCase().includes('credit') && p.role !== 'Credit' && p.role !== 'Reimbursement');
            const targetEarners = nonCreditEarners.length > 0 ? nonCreditEarners : enabledPeople;

            if (targetEarners.length > 0) {
              const equalPct = 100 / targetEarners.length;
              activeEntries = targetEarners.map(p => [p.id, equalPct]);
            }
          }

          let groupLabel = 'Unassigned Savings';
          if (activeEntries.length === 1) {
            const pId = activeEntries[0][0];
            const person = peopleList.find(p => p.id === pId);
            groupLabel = `100% ${person ? person.name : pId}`;
          } else if (activeEntries.length > 1) {
            const names = activeEntries.map(([pId]) => {
              const person = peopleList.find(p => p.id === pId);
              return person ? person.name : pId;
            });
            groupLabel = names.join(' & ');
          }

          if (!splitGroups[groupLabel]) {
            splitGroups[groupLabel] = {
              label: groupLabel,
              totalMonthlyCost: 0,
              billsCount: 0,
              savingsCount: 0,
              participantPortions: {},
              participantItems: {},
              unassignedBills: []
            };
          }

          splitGroups[groupLabel].totalMonthlyCost += extraAmt;
          splitGroups[groupLabel].savingsCount += 1;

          activeEntries.forEach(([pId, val]) => {
            const person = peopleList.find(p => p.id === pId);
            const pName = person ? person.name : pId;
            const splitType = acc.saveExtraSplitType || 'percentage';
            let portion = 0;
            let splitPct = 0;
            if (splitType === 'amount') {
              portion = parseFloat(val) || 0;
              splitPct = extraAmt > 0 ? Math.round((portion / extraAmt) * 100) : 0;
            } else {
              splitPct = parseFloat(val) || 0;
              portion = (extraAmt * splitPct) / 100;
            }
            if (!splitGroups[groupLabel].participantPortions[pName]) {
              splitGroups[groupLabel].participantPortions[pName] = 0;
              splitGroups[groupLabel].participantItems[pName] = [];
            }
            splitGroups[groupLabel].participantPortions[pName] += portion;
            splitGroups[groupLabel].participantItems[pName].push({
              type: 'savings',
              name: `${acc.name} (Extra Savings)`,
              fullAmount: extraAmt,
              splitPct,
              portionAmt: portion,
              accountName: acc.name
            });
          });
        });

        const handleAssignBill = (billId, targetValue) => {
          if (!targetValue) return;
          if (targetValue.startsWith('single:')) {
            const personId = targetValue.replace('single:', '');
            updateBillSplits(billId, { [personId]: 100 });
          } else if (targetValue === 'equal') {
            const count = activePeople.length || 1;
            const share = Math.floor(100 / count);
            const splits = {};
            activePeople.forEach((p, idx) => {
              splits[p.id] = (idx === count - 1) ? (100 - share * (count - 1)) : share;
            });
            updateBillSplits(billId, splits);
          }
        };

        const groupsList = Object.values(splitGroups);

        if (groupsList.length === 0) {
          return (
            <div className="p-4 text-center text-xs text-slate-500 font-mono">
              No split bills or extra savings items found.
            </div>
          );
        }

        return (
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2">
            {groupsList.map(group => {
              const isUnassigned = group.label === 'Unassigned' || group.label === 'Unassigned Savings';
              const itemsCountText = [
                group.billsCount > 0 ? `${group.billsCount} bill${group.billsCount !== 1 ? 's' : ''}` : '',
                group.savingsCount > 0 ? `${group.savingsCount} savings bucket${group.savingsCount !== 1 ? 's' : ''}` : ''
              ].filter(Boolean).join(' + ');

              if (isUnassigned) {
                return (
                  <div key={group.label} className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/60 space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-800/40">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="font-sans font-bold text-amber-300 text-[12px]">Unassigned / Unknown Bills</span>
                      </div>
                      <span className="font-bold text-amber-400 text-[12px]">
                        {fmtMoney(group.totalMonthlyCost)}
                        <span className="text-xs text-amber-400/70 font-normal font-sans ml-1">/ mo ({itemsCountText})</span>
                      </span>
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <p className="text-[10px] text-amber-300/80 font-sans">
                        Newly discovered or unassigned bills. Assign each bill to an earner split group below:
                      </p>
                      {group.unassignedBills.map(bill => (
                        <div key={bill.id} className="p-2 rounded-lg bg-slate-900/80 border border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-sans font-semibold text-slate-200 truncate">{bill.name}</p>
                            <p className="text-[10px] text-slate-400 font-sans">{bill.accountName} • <span className="text-emerald-400 font-mono font-bold">{fmtMoney(bill.monthlyCost)}/mo</span></p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <select
                              defaultValue=""
                              onChange={e => {
                                handleAssignBill(bill.id, e.target.value);
                                e.target.value = '';
                              }}
                              className="px-2 py-1 bg-slate-950 border border-amber-700/60 hover:border-amber-500 rounded-lg text-amber-200 text-[10px] font-sans font-semibold focus:outline-none cursor-pointer"
                            >
                              <option value="" disabled>Assign to Group...</option>
                              {activePeople.map(p => (
                                <option key={p.id} value={`single:${p.id}`} className="bg-slate-900 text-slate-100">
                                  100% {p.name}
                                </option>
                              ))}
                              {activePeople.length >= 2 && (
                                <option value="equal" className="bg-slate-900 text-slate-100">
                                  Equal Split ({activePeople.map(p => p.name.split(' ')[0]).join(' & ')})
                                </option>
                              )}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              const isGroupPinned = Boolean(pinnedSplitTooltip && pinnedSplitTooltip.startsWith(group.label + '___'));

              return (
                <div key={group.label} className={`p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs font-mono relative transition-all ${isGroupPinned ? 'z-30' : 'hover:z-20'}`}>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <span className="font-sans font-bold text-purple-300 text-[12px]">{group.label}</span>
                    <span className="font-bold text-emerald-400 text-[12px]">
                      {fmtMoney(group.totalMonthlyCost)}
                      <span className="text-xs text-slate-400 font-normal font-sans ml-1">/ mo ({itemsCountText})</span>
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    {Object.entries(group.participantPortions).map(([pName, portionAmt]) => {
                      const person = peopleList.find(p => p.name === pName || p.id === pName);
                      const isCredit = person && (person.name.toLowerCase().includes('credit') || person.role === 'Credit' || person.role === 'Reimbursement');
                      const isNonMonthly = person && !isCredit && (person.payFrequency === 'semi-monthly' || person.payFrequency === 'bi-weekly' || person.payFrequency === 'weekly');
                      const items = group.participantItems?.[pName] || [];
                      const tooltipKey = `${group.label}___${pName}`;
                      const isPinned = pinnedSplitTooltip === tooltipKey;
                      
                      let perPaycheckAmt = portionAmt;
                      if (person?.payFrequency === 'semi-monthly' || person?.payFrequency === 'bi-weekly') {
                        perPaycheckAmt = portionAmt / 2;
                      } else if (person?.payFrequency === 'weekly') {
                        perPaycheckAmt = (portionAmt * 12) / 52;
                      }

                      return (
                        <div
                          key={pName}
                          data-split-tooltip="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPinnedSplitTooltip(prev => prev === tooltipKey ? null : tooltipKey);
                          }}
                          className={`group/row relative flex items-center justify-between text-slate-300 py-1 px-1.5 -mx-1.5 rounded-lg transition-all cursor-pointer select-none ${
                            isPinned
                              ? 'bg-slate-800 ring-1 ring-purple-500/60 shadow-md text-slate-100 z-30'
                              : 'hover:bg-slate-800/60 hover:text-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-sans text-slate-400 font-medium">
                            <span className={isPinned ? 'text-purple-300 font-semibold' : 'group-hover/row:text-slate-100 transition-colors'}>
                              {pName}:
                            </span>
                            <Info className={`w-3 h-3 transition-colors ${
                              isPinned ? 'text-purple-400' : 'text-slate-500 group-hover/row:text-blue-400'
                            }`} />
                          </div>

                          <span className="font-bold text-slate-200">
                            {fmtMoney(portionAmt)}
                            <span className="text-xs text-slate-400 font-normal ml-1">/mo</span>
                            {isNonMonthly && (
                              <span className="text-[9px] text-blue-300 font-normal ml-1.5">
                                ({fmtMoney(perPaycheckAmt)}/pay)
                              </span>
                            )}
                          </span>

                          {/* Hover/Pinned Tooltip showing itemized breakdown */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute right-0 top-full mt-1.5 flex-col w-72 sm:w-84 p-3 bg-slate-950/98 border rounded-xl shadow-2xl backdrop-blur-md z-50 text-[11px] font-sans transition-all cursor-default pointer-events-auto ${
                              isPinned
                                ? 'flex border-purple-500/70 ring-1 ring-purple-500/40 shadow-purple-950/40'
                                : 'hidden group-hover/row:flex border-slate-700 hover:flex'
                            }`}
                          >
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 font-bold text-slate-200">
                              <span className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${isPinned ? 'bg-purple-400 animate-pulse' : 'bg-blue-400'}`}></span>
                                {pName}'s Allocated Items
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-400 font-mono">{fmtMoney(portionAmt)}/mo</span>
                                {isPinned && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPinnedSplitTooltip(null);
                                    }}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer transition-colors"
                                    title="Close (unpin)"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto matrix-scrollbar my-1.5 space-y-1 pr-0.5">
                              {items.length === 0 ? (
                                <p className="text-slate-500 italic py-1 text-[10px]">No specific items recorded.</p>
                              ) : (
                                items.map((item, i) => (
                                  <div key={i} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-200 truncate">{item.name}</p>
                                      <p className="text-[9px] text-slate-400">
                                        <span className={item.type === 'savings' ? 'text-amber-400 font-semibold' : 'text-blue-400 font-semibold'}>
                                          {item.type === 'savings' ? 'Savings' : 'Bill'}
                                        </span>
                                        {' '}• {item.accountName} • {Math.round(item.splitPct * 10) / 10}% of {fmtMoney(item.fullAmount)}
                                      </p>
                                    </div>
                                    <span className="font-mono font-bold text-slate-200 shrink-0">
                                      {fmtMoney(item.portionAmt)}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>

                            <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <span>{items.length} item{items.length !== 1 ? 's' : ''} total</span>
                                {isPinned && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800/60 text-[9px] font-semibold">
                                    Pinned
                                  </span>
                                )}
                              </span>
                              {isNonMonthly && (
                                <span className="text-blue-300 font-mono font-semibold">
                                  {fmtMoney(perPaycheckAmt)}/pay
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'recent_activity':
        return (
          <div className="space-y-2 text-xs font-mono">
            <p className="text-[10px] text-slate-400 font-sans">Upcoming Earner Paydays &amp; Scheduled Deductions</p>
            {(budget?.people || []).map(p => (
              <div key={p.id} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-300 font-sans font-medium text-[11px]">{p.name} ({p.payFrequency})</span>
                <span className="text-emerald-400 font-bold">{fmtMoney(getPersonPerPaycheckTotal(p.id))}</span>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">

      {/* Page Header */}
      {!hideDashboardHeader && (
        <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 rounded-xl border shadow-md relative transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50' : 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-slate-950/50'
        }`}>
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <span>Financial Dashboard</span>
            </h2>
            <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {MONTHS[today.getMonth()]} {today.getFullYear()} &bull; Drag bottom-right corner to resize, drag headers to reorder
            </p>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSettingsTab('dashboard'); setIsSettingsOpen(true); }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-semibold shadow shadow-blue-900/30 transition-colors flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Customize Layout
            </button>
            <button
              onClick={() => { setSettingsTab('bills'); setIsSettingsOpen(true); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              Manage Bills
            </button>
            <button
              type="button"
              onClick={dismissHeader}
              className={`p-1.5 rounded-lg border transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-slate-300' : 'bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border-slate-700'
              }`}
              title="Close / Hide Financial Dashboard header banner (Click X to dismiss)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Responsive Masonry Columns with @dnd-kit Sortable Context */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={visibleWidgetIds} strategy={rectSortingStrategy}>
          <div className="columns-1 md:columns-2 lg:columns-3 gap-6">
            {dashboardWidgets.map((widget, idx) => {
              if (!widget.visible) return null;
              const currentWidth = widget.width || 'third';
              const customSize = resizingSizes[widget.id] || { customWidth: widget.customWidth, customHeight: widget.customHeight };

              const isFullWidth = currentWidth === 'full' || (customSize.customWidth && customSize.customWidth > 780);
              const columnSpanClass = isFullWidth ? '[column-span:all] w-full mb-6' : 'break-inside-avoid inline-block w-full mb-6';

              const widgetTitle = widget.id === 'kpi_hero' || widget.title === 'Executive KPI Summary'
                ? 'Key Financial Summary'
                : widget.title;

              const cardStyle = {
                width: customSize.customWidth ? `${customSize.customWidth}px` : undefined,
                minHeight: customSize.customHeight ? `${customSize.customHeight}px` : undefined,
                height: customSize.customHeight ? `${customSize.customHeight}px` : undefined,
                maxWidth: '100%'
              };

              return (
                <SortableDashboardWidget
                  key={widget.id}
                  widget={widget}
                  idx={idx}
                  isLight={isLight}
                  currentWidth={currentWidth}
                  customSize={customSize}
                  columnSpanClass={columnSpanClass}
                  widgetTitle={widgetTitle}
                  cardStyle={cardStyle}
                  renderWidgetContent={renderWidgetContent}
                  handlePresetWidth={handlePresetWidth}
                  reorderDashboardWidgets={reorderDashboardWidgets}
                  toggleDashboardWidgetVisibility={toggleDashboardWidgetVisibility}
                  startCornerResize={startCornerResize}
                  totalWidgetsCount={dashboardWidgets.length}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay
          dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
              styles: {
                active: {
                  opacity: '0.4'
                }
              }
            })
          }}
        >
          {activeWidget ? (
            <div className={`rounded-2xl border ${
              isLight ? 'bg-white/95 border-blue-500 shadow-2xl text-slate-900' : 'bg-slate-900/95 border-blue-500 shadow-2xl text-slate-100'
            } overflow-hidden scale-105 pointer-events-none ring-2 ring-blue-500/80`}>
              <div className={`flex items-center justify-between px-4 py-2 border-b text-xs ${
                isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center gap-2 font-bold text-blue-400">
                  <GripVertical className="w-4 h-4 text-blue-400" />
                  <span>{activeWidget.id === 'kpi_hero' || activeWidget.title === 'Executive KPI Summary' ? 'Key Financial Summary' : activeWidget.title}</span>
                </div>
              </div>
              <div className="p-4 opacity-90">
                {renderWidgetContent(activeWidget.id, activeWidget.width, activeWidget.customWidth)}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

    </div>
  );
}





