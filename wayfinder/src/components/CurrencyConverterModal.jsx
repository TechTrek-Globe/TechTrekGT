import React, { useState, useEffect } from 'react';
import { RefreshCw, ArrowLeftRight, Coins, Delete, X } from 'lucide-react';
import { useExchangeRate } from '../hooks/useExchangeRate';

export function CurrencyConverterModal({ isOpen, onClose }) {
  const { activeCurrency, loading, lastUpdated, isOfflineFallback, refreshRates } = useExchangeRate();
  const [foreignValue, setForeignValue] = useState('50');
  const [usdValue, setUsdValue] = useState('');
  const [lastEdited, setLastEdited] = useState('FOREIGN'); // 'FOREIGN' or 'USD'

  const { code, symbol, rate, country, presets } = activeCurrency || {
    code: 'PLN',
    symbol: 'zł',
    rate: 3.73,
    country: 'Poland',
    presets: [10, 25, 50, 100, 200],
  };

  // Recalculate whenever inputs or exchange rates change
  useEffect(() => {
    if (!rate || rate <= 0) return;

    if (lastEdited === 'FOREIGN') {
      if (foreignValue === '' || isNaN(parseFloat(foreignValue))) {
        setUsdValue('');
      } else {
        const calculated = (parseFloat(foreignValue) / rate).toFixed(2);
        setUsdValue(calculated);
      }
    } else {
      if (usdValue === '' || isNaN(parseFloat(usdValue))) {
        setForeignValue('');
      } else {
        const calculated = (parseFloat(usdValue) * rate).toFixed(2);
        setForeignValue(calculated);
      }
    }
  }, [foreignValue, usdValue, lastEdited, rate]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleForeignChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setLastEdited('FOREIGN');
      setForeignValue(val);
    }
  };

  const handleUsdChange = (e) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
      setLastEdited('USD');
      setUsdValue(val);
    }
  };

  const applyPreset = (amount) => {
    setLastEdited('FOREIGN');
    setForeignValue(amount.toString());
  };

  const handleClear = () => {
    setForeignValue('');
    setUsdValue('');
  };

  return (
    <>
      {/* Outside click backdrop layer */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      />

      {/* Floating Popover Card: Floating near top header, about 20% of screen (~300px wide) */}
      <div className="fixed top-16 right-3 sm:right-8 md:right-14 z-[100] w-72 sm:w-80 max-w-[92vw] bg-wf-navy/95 border border-white/20 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden text-white animate-in zoom-in-95 duration-150">
        
        {/* Compact Header */}
        <div className="px-3 py-2.5 border-b border-white/10 glass-panel flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Coins className="w-4 h-4 text-wf-amber" />
            <span className="font-bold text-xs text-white">Currency Converter</span>
            <span className="text-[10px] bg-wf-amber/20 text-wf-amber px-1.5 py-0.5 rounded font-semibold">
              {country} ({code})
            </span>
          </div>

          {/* X Close Button */}
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-white/5 hover:bg-white/20 border border-white/10 text-wf-muted hover:text-white transition-all active:scale-95"
            title="Close Converter"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Content Body */}
        <div className="p-3 space-y-2.5">
          {/* Rate Banner */}
          <div className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-1 text-wf-muted">
              <span>Rate:</span>
              <span className="font-bold text-wf-amber">1 USD = {rate.toFixed(2)} {code}</span>
            </div>
            <button
              onClick={refreshRates}
              disabled={loading}
              className="p-1 text-wf-amber hover:text-white transition-colors disabled:opacity-50"
              title="Refresh Rate"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Micro Inputs */}
          <div className="space-y-1.5 relative">
            {/* Active Destination Foreign Currency Input */}
            <div className="p-2 rounded-lg bg-wf-navy-mid/80 border border-wf-amber/40 focus-within:border-wf-amber transition-all">
              <div className="flex items-center justify-between text-[10px] font-bold text-wf-muted uppercase">
                <span>{code} ({country})</span>
                <span className="text-wf-amber font-extrabold">{symbol}</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={foreignValue}
                onChange={handleForeignChange}
                placeholder="0.00"
                className="w-full bg-transparent text-xl font-bold text-white focus:outline-none placeholder-white/20"
              />
            </div>

            {/* Swap Icon */}
            <div className="flex justify-center -my-2 relative z-10 pointer-events-none">
              <div className="p-1 rounded-full bg-wf-navy border border-white/20 text-wf-amber text-[10px]">
                <ArrowLeftRight className="w-3 h-3" />
              </div>
            </div>

            {/* US Dollar (USD) Input */}
            <div className="p-2 rounded-lg bg-wf-navy-mid/80 border border-wf-blue/40 focus-within:border-wf-blue transition-all">
              <div className="flex items-center justify-between text-[10px] font-bold text-wf-muted uppercase">
                <span>USD (United States)</span>
                <span className="text-wf-blue-lt font-extrabold">$</span>
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
              Quick Amounts ({code})
            </div>
            <div className="flex flex-wrap gap-1">
              {presets.map((amt) => (
                <button
                  key={amt}
                  onClick={() => applyPreset(amt)}
                  className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-bold text-wf-amber hover:text-white transition-all active:scale-95"
                >
                  {amt}{symbol}
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
    </>
  );
}
