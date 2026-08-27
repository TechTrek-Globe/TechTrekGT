// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useBudgetMetadata } from '../../context/BudgetContext';
import { 
  Bug, 
  Terminal, 
  Copy, 
  Check, 
  Search, 
  Sparkles, 
  Download, 
  Trash2,
  RefreshCw,
  ArrowLeftRight,
  Calendar,
  Wallet,
  Compass,
  FileSpreadsheet,
  CheckSquare,
  XSquare,
  RotateCcw,
  Sliders
} from 'lucide-react';
import { DebugPayloadInspector } from '../DebugPayloadInspector';
import { CATEGORY_METADATA } from '../../utils/logger';

const CATEGORY_ICONS = {
  sync: RefreshCw,
  transactions: ArrowLeftRight,
  matrix: Calendar,
  accounts_ledgers: Wallet,
  nav_state: Compass,
  import: FileSpreadsheet
};

export function DebugConsolePanel() {
  const {
    isDebugMode = false,
    setDebugMode,
    categoryStates = {},
    toggleCategory,
    enableAllCategories,
    disableAllCategories,
    resetCategories,
    debugLogs = [],
    clearDebugLogs,
    addDebugLog
  } = useBudgetMetadata();

  const [debugFilterLevel, setDebugFilterLevel] = useState('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [debugSearchQuery, setDebugSearchQuery] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState(new Set());
  const [copiedLogId, setCopiedLogId] = useState(null);
  const [copiedAllLogs, setCopiedAllLogs] = useState(false);

  const toggleExpandLog = (id) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyLog = (log) => {
    const text = JSON.stringify(log, null, 2);
    navigator.clipboard?.writeText(text);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleCopyAllLogs = () => {
    const text = JSON.stringify(debugLogs, null, 2);
    navigator.clipboard?.writeText(text);
    setCopiedAllLogs(true);
    setTimeout(() => setCopiedAllLogs(false), 2000);
  };

  const handleExportLogsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(debugLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `finance-debug-logs-${new Date().toISOString().slice(0, 19).replace(/[:]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: (debugLogs || []).length };
    Object.keys(CATEGORY_METADATA).forEach(cat => {
      counts[cat] = 0;
    });
    (debugLogs || []).forEach(log => {
      const cat = (log.category || '').toLowerCase();
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [debugLogs]);

  const handleGenerateTestLogs = () => {
    addDebugLog('sync', 'Pushed cloud backup snapshot to Cloudflare D1', {
      byteLength: 4820,
      accountsCount: 3,
      billsCount: 14,
      cloudTimestamp: new Date().toISOString()
    }, 'info', 'PUSH_SUCCESS');

    addDebugLog('transactions', 'Updated matrix cell amount: Checking_2026-08_15_other_amount', {
      accountId: 'acc-1',
      monthKey: '2026-08',
      day: 15,
      field: 'other_amount',
      previousValue: 120,
      newValue: 150,
      diff: 30
    }, 'info', 'AMOUNT_CHANGE');

    addDebugLog('matrix', 'Evaluated recurring bill due date for "Mortgage/Rent"', {
      billId: 'bill-mortgage',
      dueDay: 1,
      period: 'Monthly',
      calculatedPortion: 1650.00
    }, 'info', 'SCHEDULE_RECALC');

    addDebugLog('accounts_ledgers', 'Calculated true running balance for Primary Checking', {
      accountId: 'acc-checking',
      asOfDate: '2026-08-27',
      calculatedBalance: 4250.75,
      unreconciledCount: 0
    }, 'info', 'BALANCE_UPDATE');

    addDebugLog('nav_state', 'SPA pushState navigation: /finance/dashboard -> /finance/settings', {
      from: '/finance/dashboard',
      to: '/finance/settings',
      targetView: 'settings'
    }, 'info', 'ROUTER_PUSHSTATE');

    addDebugLog('import', 'CSV header auto-matching complete: 5/5 columns resolved', {
      fileName: 'Transactions_Aug2026.csv',
      mappedHeaders: { Date: 'date', Description: 'description', Amount: 'amount' }
    }, 'info', 'CSV_MATCH');
  };

  const filteredLogs = (debugLogs || []).filter(log => {
    if (debugFilterLevel !== 'all' && log.level !== debugFilterLevel) return false;
    const cat = (log.category || '').toLowerCase();
    if (selectedCategoryFilter !== 'all' && cat !== selectedCategoryFilter) return false;
    if (debugSearchQuery) {
      const q = debugSearchQuery.toLowerCase();
      const matchMsg = (log.message || '').toLowerCase().includes(q);
      const matchCat = (log.category || '').toLowerCase().includes(q);
      const matchSub = (log.subcategory || '').toLowerCase().includes(q);
      const matchPayload = log.payload ? JSON.stringify(log.payload).toLowerCase().includes(q) : false;
      return matchMsg || matchCat || matchSub || matchPayload;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Bug className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              System &amp; Data Pipeline Debugger
            </h3>
            <p className="text-xs text-slate-400">
              Granular categorized telemetry across sync, transaction mutations, bill matrices, accounts, and navigation.
            </p>
          </div>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 self-start sm:self-center">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-200 block">Master Switch</span>
            <span className={`text-[10px] font-semibold ${isDebugMode ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isDebugMode ? 'Active / Logging' : 'Disabled'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDebugMode(!isDebugMode)}
            aria-label="Toggle Debug Mode"
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isDebugMode ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isDebugMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Category Master Controls & Toggle Cards */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <div>
              <h4 className="text-sm font-bold text-slate-100">Granular Diagnostic Categories</h4>
              <p className="text-[11px] text-slate-400">Toggle individual subsystem telemetry to isolate events without noise.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
            <button
              type="button"
              onClick={enableAllCategories}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              title="Enable all categories"
            >
              <CheckSquare className="w-3 h-3 text-emerald-400" />
              <span>Enable All</span>
            </button>
            <button
              type="button"
              onClick={disableAllCategories}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              title="Disable all categories"
            >
              <XSquare className="w-3 h-3 text-rose-400" />
              <span>Disable All</span>
            </button>
            <button
              type="button"
              onClick={resetCategories}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset to default categories"
            >
              <RotateCcw className="w-3 h-3 text-indigo-400" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(CATEGORY_METADATA).map(([key, meta]) => {
            const isEnabled = categoryStates[key] !== false;
            const Icon = CATEGORY_ICONS[key] || Terminal;
            const eventCount = categoryCounts[key] || 0;

            return (
              <div
                key={key}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isEnabled && isDebugMode
                    ? 'bg-slate-950/80 border-slate-700/80 shadow-md'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${meta.badgeClass} border`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-100 block">{meta.label}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {eventCount} {eventCount === 1 ? 'event' : 'events'}
                      </span>
                    </div>
                  </div>

                  {/* Switch */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(key, !isEnabled)}
                    aria-label={`Toggle ${meta.label}`}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isEnabled && isDebugMode ? 'bg-indigo-600' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isEnabled && isDebugMode ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {meta.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Alert Banner */}
      {isDebugMode ? (
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/60 text-indigo-300 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>
              <strong>Active Diagnostic Pipeline:</strong> Application events matching enabled categories are streaming to the live console below.
            </span>
          </div>
          <button
            type="button"
            onClick={handleGenerateTestLogs}
            className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded-lg text-[11px] font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-indigo-300" />
            <span>Simulate All Categories</span>
          </button>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
            <span>
              Debug mode is currently disabled. Toggle the Master Switch ON above to begin capturing telemetry across all enabled categories.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDebugMode(true)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition-colors shrink-0 cursor-pointer"
          >
            Enable Master Switch
          </button>
        </div>
      )}

      {/* Control Toolbar */}
      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
        {/* Top Row: Search + Level Filters + Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search traces..."
                value={debugSearchQuery}
                onChange={e => setDebugSearchQuery(e.target.value)}
                className="pl-7 pr-3 py-1 bg-slate-950 border border-slate-700 rounded-lg text-[11px] text-slate-100 font-mono focus:outline-none focus:border-indigo-500 w-36 sm:w-44"
              />
              {debugSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDebugSearchQuery('')}
                  className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300 text-xs"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Level Filter Pills */}
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-[10px]">
              {['all', 'info', 'warn', 'error'].map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDebugFilterLevel(lvl)}
                  className={`px-2 py-0.5 rounded capitalize font-semibold transition-all cursor-pointer ${
                    debugFilterLevel === lvl
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons (Compact & Scaled) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyAllLogs}
              disabled={!debugLogs || debugLogs.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-md text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
              title="Copy all logs to clipboard"
            >
              {copiedAllLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedAllLogs ? 'Copied' : 'Copy All'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportLogsJson}
              disabled={!debugLogs || debugLogs.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-md text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
              title="Download logs as JSON file"
            >
              <Download className="w-3 h-3 text-indigo-400" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={clearDebugLogs}
              disabled={!debugLogs || debugLogs.length === 0}
              className="flex items-center gap-1 px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-50 disabled:cursor-not-allowed text-rose-300 rounded-md text-[11px] font-semibold border border-rose-900/60 transition-colors cursor-pointer"
              title="Clear log console"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Category Filter Pills */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-[10px] overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-2 py-0.5 rounded font-semibold transition-all whitespace-nowrap cursor-pointer ${
              selectedCategoryFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({categoryCounts.all})
          </button>
          {Object.entries(CATEGORY_METADATA).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCategoryFilter(key)}
              className={`px-2 py-0.5 rounded font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                selectedCategoryFilter === key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{meta.label.split(' ')[0]}</span>
              <span className="text-[9px] opacity-70">({categoryCounts[key] || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Log Console Window */}
      <div className="bg-slate-950 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
        {/* Console Top Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-mono font-bold text-slate-300">Live Console Output</span>
            <span className="text-[10px] text-slate-500 font-mono">
              ({filteredLogs.length} / {(debugLogs || []).length} events)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span className={`w-2 h-2 rounded-full ${isDebugMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span>{isDebugMode ? 'LISTENING' : 'IDLE'}</span>
            </span>
          </div>
        </div>

        {/* Console Log List */}
        <div className="p-3 max-h-[550px] overflow-y-auto space-y-2 font-mono text-xs scrollbar-thin">
          {filteredLogs.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <Terminal className="w-8 h-8 text-slate-700 mx-auto" />
              <p className="text-xs text-slate-400 font-sans font-medium">
                {(!debugLogs || debugLogs.length === 0)
                  ? 'No debug events captured yet.'
                  : 'No logs match your filter criteria.'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto font-sans">
                Ensure Debug Mode is active and the relevant category is enabled, then trigger actions (cell edit, drag move, cloud sync, account clear) to stream live telemetry.
              </p>
              {(!debugLogs || debugLogs.length === 0) && isDebugMode && (
                <button
                  type="button"
                  onClick={handleGenerateTestLogs}
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer"
                >
                  Generate Sample Telemetry for All Categories
                </button>
              )}
            </div>
          ) : (
            filteredLogs.map(log => {
              const isExpanded = expandedLogIds.has(log.id);
              const hasPayload = log.payload !== null && log.payload !== undefined;
              const levelColor =
                log.level === 'error'
                  ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                  : log.level === 'warn'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                  : 'bg-blue-950/80 text-blue-300 border-blue-800';

              const catLower = (log.category || '').toLowerCase();
              const meta = CATEGORY_METADATA[catLower];
              const categoryBadgeClass = meta ? meta.badgeClass : 'bg-slate-800 text-slate-300 border-slate-700';

              return (
                <div
                  key={log.id}
                  className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${levelColor}`}>
                        {log.level}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${categoryBadgeClass}`}>
                        {meta?.label || log.category}
                        {log.subcategory && (
                          <span className="font-mono text-[9px] opacity-85 ml-1">:{log.subcategory}</span>
                        )}
                      </span>
                      <span className="text-slate-200 font-sans font-medium text-xs break-all">
                        {log.message}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasPayload && (
                        <button
                          type="button"
                          onClick={() => toggleExpandLog(log.id)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors cursor-pointer"
                        >
                          {isExpanded ? 'Hide Payload' : 'Inspect Payload'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyLog(log)}
                        className="p-1 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Copy log entry JSON"
                      >
                        {copiedLogId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Payload Inspector */}
                  {isExpanded && hasPayload && (
                    <DebugPayloadInspector payload={log.payload} logId={log.id} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
