import React from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle, Copy, X } from 'lucide-react';

export function EditModalFooter({
  isDirty,
  saving,
  saveSuccess,
  error,
  success,
  onClose,
  onOpenCopyModal
}) {
  return (
    <div className="border-t border-slate-800 bg-slate-950/95 backdrop-blur-md px-6 py-3.5 flex items-center justify-between gap-3 flex-shrink-0">
      {/* Left side actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-colors disabled:opacity-50"
        >
          Cancel
        </button>

        {onOpenCopyModal && (
          <button
            type="button"
            onClick={onOpenCopyModal}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-400/90 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-colors"
            title="Generate AI & Template Listing Copy"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Listing Copy</span>
          </button>
        )}
      </div>

      {/* Center status / dirty warning indicator */}
      <div className="flex-1 text-center px-2 min-w-0">
        {error ? (
          <div className="text-xs text-red-400 flex items-center justify-center gap-1.5 truncate">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        ) : success ? (
          <div className="text-xs text-emerald-400 flex items-center justify-center gap-1.5 truncate">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{success}</span>
          </div>
        ) : isDirty ? (
          <div className="text-[11px] text-amber-400/80 flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>You have unsaved changes</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            All changes up to date
          </span>
        )}
      </div>

      {/* Right side Save button */}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          form="edit-item-form"
          disabled={saving}
          className={`px-5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 ${
            saveSuccess
              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
          }`}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : saveSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
