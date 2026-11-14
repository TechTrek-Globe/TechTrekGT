import React, { useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, X, Loader2 } from 'lucide-react';

/**
 * ConfirmModal / ConfirmBannerModal
 * Accessible, dark-mode first modal dialog replacing browser native window.confirm().
 */
export function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'primary'
  loading = false,
  onConfirm,
  onCancel
}) {
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;
    if (e.key === 'Escape' && !loading) {
      e.preventDefault();
      onCancel?.();
    }
  }, [isOpen, loading, onCancel]);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const iconColor = isDanger ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-cyan-400';
  const borderColor = isDanger ? 'border-red-500/30' : isWarning ? 'border-amber-500/30' : 'border-cyan-500/30';
  const confirmBtnBg = isDanger
    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/50'
    : isWarning
      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/50 font-bold'
      : 'btn-primary';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      onClick={() => { if (!loading) onCancel?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className={`w-full max-w-md glass-card bg-slate-900/95 border ${borderColor} rounded-2xl shadow-2xl p-5 space-y-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {isDanger && <AlertTriangle className={`w-5 h-5 ${iconColor} flex-shrink-0`} />}
            {isWarning && <AlertCircle className={`w-5 h-5 ${iconColor} flex-shrink-0`} />}
            {!isDanger && !isWarning && <Info className={`w-5 h-5 ${iconColor} flex-shrink-0`} />}
            <h3 id="confirm-modal-title" className="text-sm font-bold text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => { if (!loading) onCancel?.(); }}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-slate-300 leading-relaxed">
          {message}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => { if (!loading) onCancel?.(); }}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700/60 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${confirmBtnBg} disabled:opacity-50`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export const ConfirmBannerModal = ConfirmModal;
export default ConfirmModal;
