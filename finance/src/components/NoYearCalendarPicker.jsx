import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, X, Check, ChevronDown } from 'lucide-react';
import { MONTH_SHORT_NAMES, getBillDueMonths } from '../utils/paydayUtils';

/**
 * Custom Popover Calendar Picker (No Year) for selecting due month and day.
 *
 * @param {object} props
 * @param {number} props.dueDay - Day of month (1-31)
 * @param {number[]} [props.dueMonths] - 1-based month numbers (1-12)
 * @param {string} [props.period] - 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual' | 'Custom'
 * @param {function} props.onChange - Callback ({ dueDay, period, dueMonths })
 * @param {function} [props.onClose] - Optional close callback
 * @param {string} [props.className] - Optional extra class names for trigger button
 */
export function NoYearCalendarPicker({
  dueDay = 1,
  dueMonths,
  period = 'Monthly',
  onChange,
  onClose,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Compute normalized dueMonths using paydayUtils helper
  const currentMonths = getBillDueMonths({ period, dueMonths });
  const safeDay = Math.max(1, Math.min(31, parseInt(dueDay, 10) || 1));

  // Close popup when pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        if (onClose) onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Format ordinal day e.g. 1st, 2nd, 3rd, 6th
  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Build trigger button summary label
  const getTriggerLabel = () => {
    if (period === 'Monthly') {
      return `Every Month (${getOrdinal(safeDay)})`;
    }
    if (period === 'Annual') {
      const mName = MONTH_SHORT_NAMES[(currentMonths[0] || 1) - 1] || 'Jan';
      return `${mName} (${getOrdinal(safeDay)})`;
    }
    if (currentMonths.length === 12) {
      return `Every Month (${getOrdinal(safeDay)})`;
    }
    if (currentMonths.length === 0) {
      return `None (${getOrdinal(safeDay)})`;
    }
    const monthNames = currentMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ');
    return `${monthNames} (${getOrdinal(safeDay)})`;
  };

  // Handle day selection
  const handleSelectDay = (day) => {
    if (onChange) {
      onChange({ dueDay: day, period, dueMonths: currentMonths });
    }
  };

  // Handle period (frequency) change from within the popup
  const handlePeriodChange = (newPeriod) => {
    let newMonths;
    switch (newPeriod) {
      case 'Annual':
        newMonths = [currentMonths[0] || 1];
        break;
      case 'Semi-Annual':
        newMonths = [1, 7];
        break;
      case 'Quarterly':
        newMonths = [1, 4, 7, 10];
        break;
      case 'Custom':
        newMonths = currentMonths.length > 0 ? currentMonths : [1];
        break;
      default:
        newMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    }
    if (onChange) onChange({ dueDay: safeDay, period: newPeriod, dueMonths: newMonths });
  };

  // Handle month selection/toggling based on current period
  const handleSelectMonth = (mNum) => {
    let updatedPeriod = period;
    let updatedMonths;

    if (period === 'Monthly') {
      // Clicking a month in Monthly switches to Custom and excludes that month
      updatedPeriod = 'Custom';
      updatedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => m !== mNum);
    } else if (period === 'Annual') {
      updatedMonths = [mNum];
    } else if (period === 'Semi-Annual') {
      const second = ((mNum + 5) % 12) + 1;
      updatedMonths = [mNum, second].sort((a, b) => a - b);
    } else if (period === 'Quarterly') {
      updatedMonths = [
        mNum,
        ((mNum + 2) % 12) + 1,
        ((mNum + 5) % 12) + 1,
        ((mNum + 8) % 12) + 1
      ].sort((a, b) => a - b);
    } else {
      // Custom / Specific Months toggle
      if (currentMonths.includes(mNum)) {
        if (currentMonths.length === 1) return; // Keep at least one month
        updatedMonths = currentMonths.filter(m => m !== mNum);
      } else {
        updatedMonths = [...currentMonths, mNum].sort((a, b) => a - b);
      }
      if (updatedMonths.length === 12) {
        updatedPeriod = 'Monthly';
      }
    }

    if (onChange) {
      onChange({ dueDay: safeDay, period: updatedPeriod, dueMonths: updatedMonths });
    }
  };

  // Semi-Annual Preset options
  const semiAnnualPresets = [
    { label: 'Jan & Jul', months: [1, 7] },
    { label: 'Feb & Aug', months: [2, 8] },
    { label: 'Mar & Sep', months: [3, 9] },
    { label: 'Apr & Oct', months: [4, 10] },
    { label: 'May & Nov', months: [5, 11] },
    { label: 'Jun & Dec', months: [6, 12] }
  ];

  // Quarterly Preset options
  const quarterlyPresets = [
    { label: 'Jan, Apr, Jul, Oct', months: [1, 4, 7, 10] },
    { label: 'Feb, May, Aug, Nov', months: [2, 5, 8, 11] },
    { label: 'Mar, Jun, Sep, Dec', months: [3, 6, 9, 12] }
  ];

  const daysArray = Array.from({ length: 31 }, (_, i) => i + 1);

  const PERIODS = [
    { key: 'Monthly', label: 'Monthly' },
    { key: 'Quarterly', label: 'Quarterly' },
    { key: 'Semi-Annual', label: 'Semi-Annual' },
    { key: 'Annual', label: 'Once a Year' },
    { key: 'Custom', label: 'Specific Months' }
  ];

  return (
    <div className="w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Click to change due day and frequency"
        className={`flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs transition-colors cursor-pointer w-full text-left ${className}`}
      >
        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        <span className="truncate">{getTriggerLabel()}</span>
        <ChevronDown className="w-3 h-3 text-slate-500 ml-auto shrink-0" />
      </button>

      {/* Centered Floating Overlay Modal (Portaled to document.body to escape table overflow clipping) */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
          onClick={() => { setIsOpen(false); if (onClose) onClose(); }}
        >
          <div
            className="w-full max-w-sm p-4 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl shadow-black/90 space-y-3.5 max-h-[90vh] overflow-y-auto text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-100">Due Schedule & Frequency</span>
              </div>
              <button
                type="button"
                onClick={() => { setIsOpen(false); if (onClose) onClose(); }}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Frequency (Period) Selector */}
            <div>
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">
                Billing Frequency
              </span>
              <div className="grid grid-cols-3 gap-1 mb-1">
                {PERIODS.slice(0, 3).map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handlePeriodChange(p.key)}
                    className={`py-1 px-1.5 rounded text-[11px] font-semibold transition-all text-center cursor-pointer ${
                      period === p.key
                        ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-blue-600 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {PERIODS.slice(3).map(p => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handlePeriodChange(p.key)}
                    className={`py-1 px-1.5 rounded text-[11px] font-semibold transition-all text-center cursor-pointer ${
                      period === p.key
                        ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-blue-600 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Month Selection Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Due Month(s)
                </span>
                {period === 'Custom' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (onChange) onChange({ dueDay: safeDay, period: 'Monthly', dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
                      }}
                      className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                    >
                      All Months
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (onChange) onChange({ dueDay: safeDay, period: 'Custom', dueMonths: [1] });
                      }}
                      className="text-[10px] text-slate-400 hover:underline cursor-pointer"
                    >
                      Reset (Jan)
                    </button>
                  </div>
                )}
              </div>

              {/* Context Hint */}
              <div className="text-[10px] text-slate-400 mb-2">
                {period === 'Monthly' && (
                  <span>Due <strong className="text-emerald-400">every month</strong> (12x/yr). Click any month to toggle specific months:</span>
                )}
                {period === 'Annual' && (
                  <span>Due <strong className="text-emerald-400">once a year</strong>. Select the due month:</span>
                )}
                {period === 'Semi-Annual' && (
                  <span>Due <strong className="text-emerald-400">twice a year</strong> (every 6 months). Pick a preset or month:</span>
                )}
                {period === 'Quarterly' && (
                  <span>Due <strong className="text-emerald-400">4 times a year</strong> (every 3 months). Pick a preset or month:</span>
                )}
                {period === 'Custom' && (
                  <span>Due in <strong className="text-emerald-400">{currentMonths.length} specific month(s)</strong>. Toggle months on/off:</span>
                )}
              </div>

              {/* Quick Presets for Semi-Annual */}
              {period === 'Semi-Annual' && (
                <div className="grid grid-cols-3 gap-1 mb-2">
                  {semiAnnualPresets.map(pr => {
                    const isSelected = JSON.stringify(currentMonths) === JSON.stringify(pr.months);
                    return (
                      <button
                        key={pr.label}
                        type="button"
                        onClick={() => {
                          if (onChange) onChange({ dueDay: safeDay, period: 'Semi-Annual', dueMonths: pr.months });
                        }}
                        className={`py-0.5 px-1 rounded text-[10px] font-medium transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {pr.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quick Presets for Quarterly */}
              {period === 'Quarterly' && (
                <div className="flex flex-col gap-1 mb-2">
                  {quarterlyPresets.map(pr => {
                    const isSelected = JSON.stringify(currentMonths) === JSON.stringify(pr.months);
                    return (
                      <button
                        key={pr.label}
                        type="button"
                        onClick={() => {
                          if (onChange) onChange({ dueDay: safeDay, period: 'Quarterly', dueMonths: pr.months });
                        }}
                        className={`py-0.5 px-1.5 rounded text-[10px] font-medium transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {pr.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 12 Months Grid */}
              <div className="grid grid-cols-4 gap-1">
                {MONTH_SHORT_NAMES.map((mName, idx) => {
                  const mNum = idx + 1;
                  const isSelected = currentMonths.includes(mNum);
                  return (
                    <button
                      key={mNum}
                      type="button"
                      onClick={() => handleSelectMonth(mNum)}
                      className={`py-1 rounded text-xs font-semibold transition-all text-center cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-sm font-bold ring-1 ring-emerald-400'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {mName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Day of Month Selector (1-31 Grid) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Day of Month</span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">{getOrdinal(safeDay)}</span>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {daysArray.map((d) => {
                  const isSelected = d === safeDay;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleSelectDay(d)}
                      className={`h-6 rounded text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white font-bold shadow-sm ring-1 ring-emerald-400 scale-105'
                          : 'bg-slate-950/80 text-slate-300 hover:bg-emerald-950 hover:text-emerald-200 border border-slate-800/80'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]" title={getTriggerLabel()}>
                {getTriggerLabel()}
              </span>
              <button
                type="button"
                onClick={() => { setIsOpen(false); if (onClose) onClose(); }}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
              >
                <Check className="w-3 h-3" /> Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
