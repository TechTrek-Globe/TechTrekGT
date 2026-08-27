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
 * @param {string} [props.period] - 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual'
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
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle day selection
  const handleSelectDay = (day) => {
    if (onChange) {
      onChange({ dueDay: day, dueMonths: currentMonths });
    }
  };

  // Handle month selection/toggling based on period
  const handleSelectMonth = (mNum) => {
    let updated;
    if (period === 'Annual') {
      updated = [mNum];
    } else if (period === 'Semi-Annual') {
      if (currentMonths.includes(mNum)) {
        updated = currentMonths;
      } else {
        const second = ((mNum + 5) % 12) + 1;
        updated = [mNum, second].sort((a, b) => a - b);
      }
    } else if (period === 'Quarterly') {
      if (currentMonths.includes(mNum)) {
        updated = currentMonths;
      } else {
        updated = [
          mNum,
          ((mNum + 2) % 12) + 1,
          ((mNum + 5) % 12) + 1,
          ((mNum + 8) % 12) + 1
        ].sort((a, b) => a - b);
      }
    } else {
      updated = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    }

    if (onChange) {
      onChange({ dueDay: safeDay, dueMonths: updated });
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

  // Format ordinal day e.g. 1st, 2nd, 3rd, 6th
  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Build trigger button summary label
  const getTriggerLabel = () => {
    if (period === 'Monthly') {
      return `Day ${safeDay}`;
    }
    if (period === 'Annual') {
      const mName = MONTH_SHORT_NAMES[(currentMonths[0] || 1) - 1] || 'Jan';
      return `${mName} ${safeDay}`;
    }
    const monthNames = currentMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ');
    return `${monthNames} (${getOrdinal(safeDay)})`;
  };

  // Handle period (frequency) change from within the popup
  const handlePeriodChange = (newPeriod) => {
    let newMonths;
    switch (newPeriod) {
      case 'Annual': newMonths = [currentMonths[0] || 1]; break;
      case 'Semi-Annual': newMonths = [1, 7]; break;
      case 'Quarterly': newMonths = [1, 4, 7, 10]; break;
      default: newMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    }
    if (onChange) onChange({ dueDay: safeDay, period: newPeriod, dueMonths: newMonths });
  };

  const daysArray = Array.from({ length: 31 }, (_, i) => i + 1);

  const PERIODS = ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];

  return (
    <div className="inline-block">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Click to select month and day"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700/80 hover:border-emerald-500/80 text-xs text-slate-200 font-medium transition-all cursor-pointer shadow-sm hover:shadow-emerald-950/20 group ${className}`}
      >
        <Calendar className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform flex-shrink-0" />
        <span className="font-mono text-xs">{getTriggerLabel()}</span>
        <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-200 transition-colors flex-shrink-0" />
      </button>

      {/* Centered Floating Overlay Modal (Portaled to document.body to escape glass-card backdrop filters) */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-xs p-4 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl shadow-black/90 space-y-3 max-h-[90vh] overflow-y-auto text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-100">Due Schedule</span>
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
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block mb-1.5">Frequency</span>
              <div className="grid grid-cols-4 gap-1">
                {PERIODS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePeriodChange(p)}
                    className={`py-1 rounded text-[10px] font-semibold transition-all text-center cursor-pointer ${
                      period === p
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-blue-600 hover:text-slate-200'
                    }`}
                  >
                    {p === 'Semi-Annual' ? 'Semi' : p === 'Quarterly' ? 'Qrtly' : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Month Section (Tailored by Period) */}
            {period === 'Monthly' && (
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-center">
                <p className="text-[11px] text-slate-400">
                  This bill is due <strong className="text-emerald-400 font-semibold">every month</strong>. Pick the due day below:
                </p>
              </div>
            )}

            {period === 'Annual' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Due Month</span>
                  <span className="text-[10px] text-slate-400">Select 1 month</span>
                </div>
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
                            ? 'bg-emerald-600 text-white shadow-sm font-bold'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        {mName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {period === 'Semi-Annual' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Due Months (2x / year)</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {semiAnnualPresets.map((preset) => {
                    const isSelected = JSON.stringify(currentMonths) === JSON.stringify(preset.months);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (onChange) onChange({ dueDay: safeDay, dueMonths: preset.months });
                        }}
                        className={`py-1 px-2 rounded text-[11px] font-medium transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold shadow-sm'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {period === 'Quarterly' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Due Months (4x / year)</span>
                </div>
                <div className="flex flex-col gap-1">
                  {quarterlyPresets.map((preset) => {
                    const isSelected = JSON.stringify(currentMonths) === JSON.stringify(preset.months);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (onChange) onChange({ dueDay: safeDay, dueMonths: preset.months });
                        }}
                        className={`py-1 px-2 rounded text-[11px] font-medium transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold shadow-sm'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Day of Month Selector (1-31 Grid) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Day of Month</span>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">{getOrdinal(safeDay)}</span>
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
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[170px]">
                {getTriggerLabel()}
              </span>
              <button
                type="button"
                onClick={() => { setIsOpen(false); if (onClose) onClose(); }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0"
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
