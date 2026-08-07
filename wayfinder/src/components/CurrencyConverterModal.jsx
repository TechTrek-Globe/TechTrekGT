import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, ArrowLeftRight, Coins, Delete, X } from 'lucide-react';
import { useExchangeRate } from '../hooks/useExchangeRate';

export function CurrencyConverterModal({ isOpen, onClose }) {
  const { usdToPln, loading, lastUpdated, isOfflineFallback, refreshRates } = useExchangeRate();
  const [plnValue, setPlnValue] = useState('50');
  const [usdValue, setUsdValue] = useState('');
  const [lastEdited, setLastEdited] = useState('PLN');

  useEffect(() => {
    if (!usdToPln || usdToPln <= 0) return;

    if (lastEdited === 'PLN') {
      if (plnValue === '' || isNaN(parseFloat(plnValue))) {
        setUsdValue('');
      } else {
        const calculated = (parseFloat(plnValue) / usdToPln).toFixed(2);
        setUsdValue(calculated);
      }
    } else {
      if (usdValue === '' || isNaN(parseFloat(usdValue))) {
        setPlnValue('');
      } else {
        const calculated = (parseFloat(usdValue) * usdToPln).toFixed(2);
        setPlnValue(calculated);
      }
    }
  }, [plnValue, usdValue, lastEdited, usdToPln]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePlnChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setLastEdited('PLN');
      setPlnValue(val);
    }
  };

  const handleUsdChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setLastEdited('USD');
      setUsdValue(val);
    }
  };

  const applyPreset = (plnAmount) => {
    setLastEdited('PLN');
    setPlnValue(plnAmount.toString());
  };

  const handleClear = () => {
    setPlnValue('');
    setUsdValue('');
  };

  const presets = [
    { label: '10zł', pln: 10 },
    { label: '25zł', pln: 25 },
    { label: '50zł', pln: 50 },
    { label: '100zł', pln: 100 },
    { label: '200zł', pln: 200 },
  ];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      {/* Pocket-sized Calculator Box: max-w-[300px] on desktop, compact height */}
      <div className="w-full h-full md:h-auto max-w-full md:max-w-[300px] bg-wf-navy/95 border-0 md:border md:border-white/20 md:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-white animate-in zoom-in-95 duration-150">
        
        {/* Compact Header */}
        <div className="px-3 py-2.5 border-b border-white/10 glass-panel flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            {/* Mobile prominent Back button */}
            <button
              onClick={onClose}
              className="md:hidden flex items-center space-x-1 px-2 py-1 rounded-md bg-white/10 text-white font-semibold text-xs transition-all active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-wf-amber" />
              <span>Back</span>
            </button>

            <Coins className="w-4 h-4 text-wf-amber" />
            <span className="font-bold text-xs text-white">Currency Calculator</span>
          </div>

          {/* Dedicated X Close Button */}
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-white/5 hover:bg-white/20 border border-white/10 text-wf-muted hover:text-white transition-all active:scale-95"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Content Body */}
        <div className="flex-1 p-3 space-y-2.5">
          {/* Rate Strip */}
          <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-1 text-wf-muted">
              <span>Rate:</span>
              <span className="font-bold text-wf-amber">1 USD = {usdToPln.toFixed(2)} PLN</span>
            </div>
            <button
              onClick={refreshRates}
              disabled={loading}
              className="p-1 text-wf-amber hover:text-white transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Micro Inputs */}
          <div className="space-y-1.5 relative">
            {/* PLN Input */}
            <div className="p-2 rounded-lg bg-wf-navy-mid/80 border border-wf-amber/40 focus-within:border-wf-amber transition-all">
              <div className="flex items-center justify-between text-[10px] font-bold text-wf-muted uppercase">
                <span>PLN</span>
                <span className="text-wf-amber">zł</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={plnValue}
                onChange={handlePlnChange}
                placeholder="0.00"
                className="w-full bg-transparent text-xl font-bold text-white focus:outline-none placeholder-white/20"
              />
            </div>

            {/* Swap Divider */}
            <div className="flex justify-center -my-2 relative z-10 pointer-events-none">
              <div className="p-1 rounded-full bg-wf-navy border border-white/20 text-wf-amber text-[10px]">
                <ArrowLeftRight className="w-3 h-3" />
              </div>
            </div>

            {/* USD Input */}
            <div className="p-2 rounded-lg bg-wf-navy-mid/80 border border-wf-blue/40 focus-within:border-wf-blue transition-all">
              <div className="flex items-center justify-between text-[10px] font-bold text-wf-muted uppercase">
                <span>USD</span>
                <span className="text-wf-blue-lt">$</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={usdValue}
                onChange={handleUsdChange}
                placeholder="0.00"
                className="w-full bg-transparent text-xl font-bold text-white focus:outline-none placeholder-white/20"
              />
            </div>
          </div>

          {/* Preset Buttons */}
          <div>
            <div className="text-[9px] font-bold text-wf-muted uppercase tracking-wider mb-1">
              Quick Amounts
            </div>
            <div className="flex flex-wrap gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.pln}
                  onClick={() => applyPreset(preset.pln)}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-wf-amber hover:text-white transition-all active:scale-95"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Micro Footer Bar */}
        <div className="p-2 border-t border-white/10 flex items-center gap-1.5 bg-wf-navy">
          <button
            onClick={handleClear}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-wf-muted hover:text-white font-medium text-xs flex items-center space-x-1 active:scale-95"
          >
            <Delete className="w-3 h-3" />
            <span>Clear</span>
          </button>
          
          <button
            onClick={onClose}
            className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-wf-blue to-wf-navy-mid hover:from-wf-blue-lt hover:to-wf-blue border border-wf-blue-lt/30 text-white font-bold text-xs shadow-md transition-all active:scale-95"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
