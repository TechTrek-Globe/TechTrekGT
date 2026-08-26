// @ts-nocheck
import React from 'react';
import { useBudgetMetadata } from '../../context/BudgetContext';
import { 
  Sun, 
  Moon, 
  LayoutDashboard, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  CheckCircle2 
} from 'lucide-react';

export function DashboardSettingsPanel() {
  const {
    theme,
    setTheme,
    dashboardWidgets,
    toggleDashboardWidgetVisibility,
    setDashboardWidgetWidth,
    reorderDashboardWidgets,
    resetDashboardWidgets,
  } = useBudgetMetadata();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Color Theme Preference Selector */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            {theme === 'light' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-400" />}
            App Color Theme
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Choose your preferred application background appearance and visual style.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-3.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
              theme !== 'light'
                ? 'bg-slate-950 text-slate-100 border-blue-500 shadow-md shadow-blue-950/40 ring-1 ring-blue-500'
                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-700 flex items-center justify-center">
                <Moon className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <span className="text-xs font-bold block">Dark Theme</span>
                <span className="text-[10px] text-slate-400">Black/slate background</span>
              </div>
            </div>
            {theme !== 'light' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-3.5 rounded-xl border transition-all text-left flex items-center justify-between cursor-pointer ${
              theme === 'light'
                ? 'bg-white text-slate-900 border-blue-500 shadow-md ring-1 ring-blue-500'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-300 flex items-center justify-center">
                <Sun className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <span className="text-xs font-bold block text-slate-900">Light Theme</span>
                <span className="text-[10px] text-slate-500">White background</span>
              </div>
            </div>
            {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
          </button>
        </div>
      </div>

      {/* Widget Grid Management Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-blue-400" />
            Dashboard Widget Visibility &amp; Placement Order
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Toggle which data widgets appear on your Financial Dashboard and arrange their display placement order.
          </p>
        </div>
        <button
          type="button"
          onClick={resetDashboardWidgets}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Widgets List */}
      <div className="space-y-3">
        {dashboardWidgets.map((widget, idx) => (
          <div
            key={widget.id}
            className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              widget.visible
                ? 'bg-slate-900/90 border-slate-700/80 shadow-md'
                : 'bg-slate-950/40 border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Reorder Buttons */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => reorderDashboardWidgets(idx, idx - 1)}
                  className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors text-[10px] cursor-pointer"
                  title="Move Up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={idx === dashboardWidgets.length - 1}
                  onClick={() => reorderDashboardWidgets(idx, idx + 1)}
                  className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 transition-colors text-[10px] cursor-pointer"
                  title="Move Down"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">{widget.title}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                    {widget.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{widget.description}</p>
              </div>
            </div>

            {/* Width Selector & Visibility Toggle */}
            <div className="flex items-center gap-3 self-end sm:self-center">
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-semibold mr-1">Size:</span>
                <button
                  type="button"
                  onClick={() => setDashboardWidgetWidth(widget.id, 'third')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    (widget.width || 'third') === 'third'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Small (1/3 width side card)"
                >
                  1/3 Small
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardWidgetWidth(widget.id, 'half')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    widget.width === 'half'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Medium (1/2 width card)"
                >
                  1/2 Medium
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardWidgetWidth(widget.id, 'full')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    widget.width === 'full'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Full Width"
                >
                  Full
                </button>
              </div>

              <button
                type="button"
                onClick={() => toggleDashboardWidgetVisibility(widget.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  widget.visible
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-sm'
                    : 'bg-slate-900 text-slate-500 border border-slate-800'
                }`}
              >
                {widget.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                <span>{widget.visible ? 'Visible' : 'Hidden'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
