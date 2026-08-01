// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X, Check } from 'lucide-react';
import { MONTH_SHORT_NAMES, getBillDueMonths } from '../utils/paydayUtils';

/**
 * Custom Popover Calendar Picker (No Year) for selecting due month and day.
 *
 * @param {object} props
 * @param {number} props.dueDay - Day of month (1-31)
 * @param {number[]} [props.dueMonths] - 1-based month numbers (1-12)
 * @param {string} [props.period] - 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual'
 * @param {function} props.onChange - Callback ({ dueDay, dueMonths })
 * @param {string} [props.className] - Optional extra class names for trigger button
 */
export function NoYearCalendarPicker({
  dueDay = 1,
  dueMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  period = 'Monthly',
  onChange,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Normalize current dueMonths
  const currentMonths = (Array.isArray(dueMonths) && dueMonths.length > 0)
    ? dueMonths.map(Number).filter(m => m >= 1 && m <= 12).sort((a, b) => a - b)
    : getBillDueMonths({ period, dueMonths });

  const safeDay = Math.max(1, Math.min(31, parseInt(dueDay, 10) || 1));

  // Close popup when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Handle day selection
  const handleSelectDay = (day) => {
    if (onChange) {
      onChange({ dueDay: day, dueMonths: currentMonths });
    }
  };

  // Handle month selection
  const handleToggleMonth = (mNum) => {
    let updated;
    if (period === 'Annual') {
      updated = [mNum];
    } else if (period === 'Monthly') {
      // Monthly bill applies to all months
      updated = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    } else {
      // Semi-Annual, Quarterly, Custom
      if (currentMonths.includes(mNum)) {
        if (currentMonths.length === 1) return; // keep at least 1 month
        updated = currentMonths.filter(m => m !== mNum);
      } else {
        updated = [...currentMonths, mNum].sort((a, b) => a - b);
      }
    }

    if (onChange) {
      onChange({ dueDay: safeDay, dueMonths: updated });
    }
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
    // Semi-Annual / Quarterly
    const monthStr = currentMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ');
    if (monthStr.length > 12) {
      return `${currentMonths.length} mos • Day ${safeDay}`;
    }
    return `${monthStr} • Day ${safeDay}`;
  };

  // 1-31 Days array
  const daysArray = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Click to select month and day"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 hover:border-emerald-500/80 text-xs text-slate-200 transition-all cursor-pointer shadow-sm hover:shadow-emerald-950/20 group ${className}`}
      >
        <Calendar className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform flex-shrink-0" />
        <span className="font-mono font-medium">{getTriggerLabel()}</span>
      </button>

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/80 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">Due Schedule (No Year)</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Month Selector */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Month</span>
              {period === 'Monthly' && (
                <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60">
                  Every Month
                </span>
              )}
            </div>

            <div className="grid grid-cols-6 gap-1">
              {MONTH_SHORT_NAMES.map((mName, idx) => {
                const mNum = idx + 1;
                const isSelected = currentMonths.includes(mNum);
                const isMonthly = period === 'Monthly';

                return (
                  <button
                    key={mNum}
                    type="button"
                    disabled={isMonthly}
                    onClick={() => handleToggleMonth(mNum)}
                    className={`py-1 rounded text-[10px] font-semibold transition-all text-center ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950 font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                    } ${isMonthly ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}
                  >
                    {mName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day Selector (1-31 Grid) */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Day of Month</span>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold">Day {safeDay}</span>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {daysArray.map((d) => {
                const isSelected = d === safeDay;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectDay(d)}
                    className={`h-7 rounded text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950 ring-1 ring-emerald-400 scale-105'
                        : 'bg-slate-950/80 text-slate-300 hover:bg-emerald-950/80 hover:text-emerald-300 hover:border-emerald-700/60 border border-slate-800/80'
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
            <span className="text-[11px] text-slate-400 font-mono">
              Selected: <strong className="text-slate-200 font-semibold">{getTriggerLabel()}</strong>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3 h-3" /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
