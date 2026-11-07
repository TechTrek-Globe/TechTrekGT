import React, { useState } from 'react';
import { X, Settings, Thermometer, Coins, Map, Scale, Clock, Trash2, UserX } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';

export function SettingsModal({ isOpen, onClose }) {
  const { settings, updateSettings } = useSettings();
  const { user, isAuthenticated, deleteAccount } = useAuth();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

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
            <div className="grid grid-cols-4 gap-2">
              {['USD', 'EUR', 'GBP', 'PLN'].map(curr => (
                <button
                  key={curr}
                  onClick={() => updateSettings({ currency: curr })}
                  className={`py-2 px-2.5 rounded-xl border font-bold text-xs sm:text-sm transition-all ${
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
            <p className="text-xs text-wf-muted">Converts walking loop distances, Old Town navigation, and excursion radii.</p>
          </div>

          {/* Time Display */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>Time Display</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => updateSettings({ timeFormat: '12h' })}
                className={`py-2.5 px-3 rounded-xl border font-bold text-sm transition-all flex flex-col items-center justify-center ${
                  (settings.timeFormat || '12h') === '12h' 
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span>12-Hour (AM/PM)</span>
                <span className="text-[10px] font-normal text-slate-400 mt-0.5">e.g. 3:00 PM / 7:30 AM</span>
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ timeFormat: '24h' })}
                className={`py-2.5 px-3 rounded-xl border font-bold text-sm transition-all flex flex-col items-center justify-center ${
                  settings.timeFormat === '24h' 
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span>24-Hour (Military)</span>
                <span className="text-[10px] font-normal text-slate-400 mt-0.5">e.g. 15:00 / 07:30</span>
              </button>
            </div>
            <p className="text-xs text-wf-muted">Switches schedule stops, booking vouchers, and daylight telemetry between standard 12-hour AM/PM and 24-hour military time.</p>
          </div>

          {/* Weight & Luggage */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
              <Scale className="w-4 h-4" />
              <span>Weight & Luggage</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => updateSettings({ weight: 'lbs' })}
                className={`py-2.5 px-3 rounded-xl border font-bold text-sm transition-all flex flex-col items-center justify-center ${
                  (settings.weight || 'lbs') === 'lbs' 
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span>Pounds / Ounces</span>
                <span className="text-[10px] font-normal text-slate-400 mt-0.5">lbs / oz (50.7 lbs checked)</span>
              </button>
              <button
                onClick={() => updateSettings({ weight: 'kg' })}
                className={`py-2.5 px-3 rounded-xl border font-bold text-sm transition-all flex flex-col items-center justify-center ${
                  settings.weight === 'kg' 
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-inner'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <span>Kilograms / Grams</span>
                <span className="text-[10px] font-normal text-slate-400 mt-0.5">kg / g (23.0 kg checked)</span>
              </button>
            </div>
            <p className="text-xs text-wf-muted">Converts suitcase allowance, carry-on weight, and packing checklist gear.</p>
          </div>

          {/* Account & Data Deletion */}
          {isAuthenticated && (
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                <Trash2 className="w-4 h-4" />
                <span>Account &amp; Data Deletion</span>
              </div>
              <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{user?.name || 'Account'}</p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">{user?.email}</p>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-rose-900/40 text-rose-300 border border-rose-800/50">
                    Active
                  </span>
                </div>

                <p className="text-xs text-rose-300/80 leading-relaxed">
                  Permanently erase your account, travel documents, private booking entries, expense splits, and active sessions. This action is irreversible.
                </p>

                {deleteError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                    {deleteError}
                  </div>
                )}

                {!isConfirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmingDelete(true);
                      setDeleteError(null);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 border border-rose-800/60 text-rose-300 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete My Account</span>
                  </button>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-rose-900/40">
                    <p className="text-xs font-semibold text-rose-200">
                      Type <strong className="text-white font-mono uppercase tracking-wider">DELETE</strong> to confirm:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/90 border border-rose-800/80 text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={deleteConfirmText.trim() !== 'DELETE' || isDeleting}
                        onClick={async () => {
                          setIsDeleting(true);
                          setDeleteError(null);
                          try {
                            await deleteAccount();
                            onClose();
                          } catch (err) {
                            setDeleteError(err.message || 'Failed to delete account');
                            setIsDeleting(false);
                          }
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => {
                          setIsConfirmingDelete(false);
                          setDeleteConfirmText('');
                          setDeleteError(null);
                        }}
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
