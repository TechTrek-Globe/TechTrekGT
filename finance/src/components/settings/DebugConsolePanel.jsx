// @ts-nocheck
import React, { useState } from 'react';
import { useBudgetMetadata } from '../../context/BudgetContext';
import { 
  Bug, 
  Terminal, 
  Copy, 
  Check, 
  Search, 
  Sparkles, 
  Download, 
  Trash2 
} from 'lucide-react';
import { DebugPayloadInspector } from '../DebugPayloadInspector';

export function DebugConsolePanel() {
  const {
    isDebugMode,
    setDebugMode,
    debugLogs,
    clearDebugLogs,
    addDebugLog
  } = useBudgetMetadata();

  const [debugFilterLevel, setDebugFilterLevel] = useState('all');
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

  const handleGenerateTestLogs = () => {
    addDebugLog('SYSTEM', 'Diagnostic test log triggered manually', { triggeredAt: new Date().toISOString() }, 'info');
    addDebugLog('IMPORT', 'Sample Import Phase: Ingested file "Checking_Aug_2026.csv"', {
      fileName: 'Checking_Aug_2026.csv',
      sizeBytes: 12450,
      headers: ['Post Date', 'Vendor Description', 'Debit', 'Credit', 'Bal']
    }, 'info');
    addDebugLog('MATCH', 'Auto-matched 4 columns with 1 missing required field', {
      confidence: 0.75,
      missingRequired: ['account_id'],
      matchDetails: [
        { header: 'Post Date', matchedField: 'date', confidence: 1.0, matchType: 'synonym' },
        { header: 'Vendor Description', matchedField: 'description', confidence: 1.0, matchType: 'synonym' },
        { header: 'Debit', matchedField: 'amount', confidence: 0.9, matchType: 'heuristic' },
        { header: 'Bal', matchedField: 'balance', confidence: 0.8, matchType: 'prefix' }
      ],
      firstRowSample: {
        'Post Date': '08/01/2026',
        'Vendor Description': 'PUBLIX #1042',
        'Debit': '45.12',
        'Credit': '',
        'Bal': '1240.50'
      }
    }, 'info');
    addDebugLog('NORMALIZE', 'Record Normalization: 18 parsed records, 2 skipped due to invalid date/amount format', {
      totalParsed: 18,
      validRecords: 16,
      skippedCount: 2,
      skippedSamples: [
        {
          rowNumber: 4,
          reason: 'Missing or unparseable date value: "PENDING"',
          rawDate: 'PENDING',
          normalizedDate: null,
          rawAmount: '30.00',
          parsedAmount: 30.00,
          rawData: { 'Post Date': 'PENDING', 'Vendor Description': 'SHELL OIL', 'Debit': '30.00' }
        },
        {
          rowNumber: 12,
          reason: 'Zero or unparseable amount value: "$0.00 / N/A"',
          rawDate: '08/14/2026',
          normalizedDate: '2026-08-14',
          rawAmount: '$0.00 / N/A',
          parsedAmount: NaN,
          rawData: { 'Post Date': '08/14/2026', 'Vendor Description': 'ATM INQUIRY FEE WAIVED', 'Debit': '$0.00 / N/A' }
        }
      ]
    }, 'warn');
    addDebugLog('RECONCILE', 'Matched debit $142.50 to bill "Georgia Power" via Bank Document Key "GEORGIA POWER"', {
      billId: 'bill-gapower',
      matchingKey: 'GEORGIA POWER',
      matchSource: 'exact_document_key'
    }, 'info');
    addDebugLog('MATCH', 'Debit $38.99 unmatched to any recurring bill; routed to Other Expense', {
      desc: 'TARGET T-1029',
      amount: 38.99,
      account: 'Primary Checking'
    }, 'warn');
  };

  const filteredLogs = (debugLogs || []).filter(log => {
    if (debugFilterLevel !== 'all' && log.level !== debugFilterLevel) return false;
    if (debugSearchQuery) {
      const q = debugSearchQuery.toLowerCase();
      const matchMsg = (log.message || '').toLowerCase().includes(q);
      const matchCat = (log.category || '').toLowerCase().includes(q);
      const matchPayload = log.payload ? JSON.stringify(log.payload).toLowerCase().includes(q) : false;
      return matchMsg || matchCat || matchPayload;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Bug className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              System &amp; Import Debugger
            </h3>
            <p className="text-xs text-slate-400">
              Real-time execution tracing, parsing diagnostics, and data payload inspection.
            </p>
          </div>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 self-start sm:self-center">
          <div className="text-right">
            <span className="text-xs font-bold text-slate-200 block">Debug Mode</span>
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

      {/* Status Alert Banner */}
      {isDebugMode ? (
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/60 text-indigo-300 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span>
              <strong>Verbose Logging Enabled:</strong> The Import engine will record all parsing steps, column matching scores, record normalizations, and reconciliation decisions.
            </span>
          </div>
          <button
            type="button"
            onClick={handleGenerateTestLogs}
            className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded-lg text-[11px] font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-indigo-300" />
            <span>Generate Test Log</span>
          </button>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
            <span>
              Debug mode is currently disabled. Toggle it ON above to capture detailed execution telemetry during spreadsheet/CSV imports.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDebugMode(true)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition-colors shrink-0 cursor-pointer"
          >
            Enable
          </button>
        </div>
      )}

      {/* Control Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={debugSearchQuery}
              onChange={e => setDebugSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 w-40 sm:w-48"
            />
            {debugSearchQuery && (
              <button
                type="button"
                onClick={() => setDebugSearchQuery('')}
                className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          {/* Level Filter Pills */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
            {['all', 'info', 'warn', 'error'].map(lvl => (
              <button
                key={lvl}
                type="button"
                onClick={() => setDebugFilterLevel(lvl)}
                className={`px-2.5 py-1 rounded-md capitalize font-semibold transition-all cursor-pointer ${
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

        {/* Actions */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={handleCopyAllLogs}
            disabled={debugLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Copy all logs to clipboard"
          >
            {copiedAllLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAllLogs ? 'Copied All' : 'Copy All'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportLogsJson}
            disabled={debugLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Download logs as JSON file"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={clearDebugLogs}
            disabled={debugLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-50 disabled:cursor-not-allowed text-rose-300 rounded-lg text-xs font-semibold border border-rose-900/60 transition-colors cursor-pointer"
            title="Clear log console"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
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
              ({filteredLogs.length} / {debugLogs.length} events)
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
                {debugLogs.length === 0
                  ? 'No debug events captured yet.'
                  : 'No logs match your filter criteria.'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto font-sans">
                Enable Debug Mode, then perform an action (e.g. import a CSV/spreadsheet or create an account) to inspect real-time execution steps and data payloads.
              </p>
              {debugLogs.length === 0 && isDebugMode && (
                <button
                  type="button"
                  onClick={handleGenerateTestLogs}
                  className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer"
                >
                  Generate Sample Telemetry Logs
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

              const categoryColor =
                log.category === 'IMPORT'
                  ? 'text-indigo-400'
                  : log.category === 'MATCH'
                  ? 'text-emerald-400'
                  : log.category === 'RECONCILE'
                  ? 'text-purple-400'
                  : log.category === 'PARSER'
                  ? 'text-amber-400'
                  : 'text-slate-400';

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
                      <span className={`text-[10px] font-bold ${categoryColor}`}>
                        [{log.category}]
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
