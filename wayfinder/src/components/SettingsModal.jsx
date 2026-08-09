import React from 'react';
import { X, Settings, Thermometer, Coins, Map } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

export function SettingsModal({ isOpen, onClose }) {
  const { settings, updateSettings } = useSettings();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md glass-panel rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-wf-navy/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-wf-blue/20 text-wf-blue-lt">
              <Settings className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">Preferences</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-wf-muted hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
          
          {/* Currency */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-wf-amber font-bold text-xs uppercase tracking-wider">
              <Coins className="w-4 h-4" />
              <span>Base Currency</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['USD', 'EUR', 'GBP'].map(curr => (
                <button
                  key={curr}
                  onClick={() => updateSettings({ currency: curr })}
                  className={`py-2 px-3 rounded-xl border font-bold text-sm transition-all ${
                    settings.currency === curr 
                      ? 'bg-wf-amber/20 border-wf-amber/50 text-wf-amber shadow-inner'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
            <p className="text-xs text-wf-muted">Set the currency used for conversions and estimates.</p>
          </div>

          {/* Temperature */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sky-400 font-bold text-xs uppercase tracking-wider">
              <Thermometer className="w-4 h-4" />
              <span>Temperature</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateSettings({ temperature: 'C' })}
                className={`py-2 px-3 rounded-xl border font-bold text-sm transition-all ${
                  settings.temperature === 'C' 
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-400 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                Celsius (°C)
              </button>
              <button
                onClick={() => updateSettings({ temperature: 'F' })}
                className={`py-2 px-3 rounded-xl border font-bold text-sm transition-all ${
                  settings.temperature === 'F' 
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-400 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                Fahrenheit (°F)
              </button>
            </div>
          </div>

          {/* Distance */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <Map className="w-4 h-4" />
              <span>Distance</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateSettings({ distance: 'km' })}
                className={`py-2 px-3 rounded-xl border font-bold text-sm transition-all ${
                  settings.distance === 'km' 
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                Kilometers (km)
              </button>
              <button
                onClick={() => updateSettings({ distance: 'mi' })}
                className={`py-2 px-3 rounded-xl border font-bold text-sm transition-all ${
                  settings.distance === 'mi' 
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                Miles (mi)
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
