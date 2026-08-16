import React from 'react';
import { Clock, Sun, Sparkles, Coffee } from 'lucide-react';
import { FormatText } from '../Formatters';

export function QuickReferenceBar({ city }) {
  const quick = city.quickReference || {
    dates: city.dates,
    daylight: 'Sunrise ~7:30 AM | Sunset ~3:30 PM (~8 hrs daylight)',
    peakHours: '5:30 PM - 8:00 PM (Dusk illuminations & caroling)',
    kaucja: `${city.kaucja} deposit per mug`
  };

  const kaucjaDeposit = typeof city.kaucjaCallout === 'object' ? city.kaucjaCallout.deposit : (city.kaucja || '20-30 PLN');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Market Dates</span>
        </div>
        <p className="text-xs sm:text-sm text-white font-bold leading-snug">
          {quick.dates}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
          <Sun className="w-4 h-4 shrink-0" />
          <span>Daylight & Sunset</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-snug font-medium">
          {quick.daylight}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Peak Atmosphere</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-snug font-medium">
          {quick.peakHours}
        </p>
      </div>

      <div className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-amber-400/50 space-y-1.5 shadow-md flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
          <Coffee className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Mug Deposit (Kaucja)</span>
        </div>
        <p className="text-xs sm:text-sm text-amber-100/90 leading-snug font-medium">
          <FormatText text={kaucjaDeposit} /> deposit per mug. <strong className="text-amber-300">EXACT CASH REQUIRED</strong> for deposit.
        </p>
      </div>
    </div>
  );
}

export default QuickReferenceBar;
