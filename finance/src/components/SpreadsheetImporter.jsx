// @ts-nocheck
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, ArrowRight, RotateCcw,
  Users, Receipt, CreditCard, Loader2, X, Check, Eye,
  Layers, Table, Sparkles, HelpCircle, ArrowLeft, Radio
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet, parseSingleSheet } from '../utils/spreadsheetParser';
import {
  detectFileType,
  parseGenericFlat,
  autoMatchColumns,
  applyTransactionMapping,
  applyBillMapping,
  inspectWorkbookSheets,
  detectExtraHeaderRow,
  INTERNAL_TRANSACTION_FIELDS,
  INTERNAL_BILL_FIELDS,
} from '../utils/importer';
import { useBudget } from '../context/BudgetContext';
import { logDebug, logInfo, logWarn, logError } from '../utils/debugLogger';

// --- Stage constants ---
const STAGE = {
  IDLE: 'idle',
  PARSING: 'parsing',
  SHEET_SELECT: 'sheet_select',
  SHEET_WIZARD: 'sheet_wizard',
  MAPPING: 'mapping',
  SELECTING: 'selecting',
  DONE: 'done',
};

// --- Strategy toggle pill component ---
function StrategyToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-bold">
      <button
        type="button"
        onClick={() => onChange('override')}
        className={`px-3 py-1 rounded-lg transition-all ${
          value === 'override'
            ? 'bg-rose-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Override
      </button>
      <button
        type="button"
        onClick={() => onChange('merge')}
        className={`px-3 py-1 rounded-lg transition-all ${
          value === 'merge'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Merge / Upsert
      </button>
    </div>
  );
}

// --- Column field select dropdown ---
function FieldSelect({ value, onChange, schema }) {
  const fields = schema === 'bills' ? INTERNAL_BILL_FIELDS : INTERNAL_TRANSACTION_FIELDS;
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-[11px] bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
    >
      <option value="__ignore__">-- Ignore --</option>
      {fields.map(f => (
        <option key={f.key} value={f.key}>
          {f.label}{f.required ? ' *' : ''}
        </option>
      ))}
    </select>
  );
}

export function SpreadsheetImporter({
  targetAccountId = null,
  targetAccountName = null,
  isModal = false,
  onClose = null,
  onImportComplete = null,
}) {
  const { budget, importSpreadsheetSelective } = useBudget();

  // Target Account selection (locked if targetAccountId prop is passed)
  const [selectedTargetAccountId, setSelectedTargetAccountId] = useState(targetAccountId || '');

  useEffect(() => {
    if (targetAccountId) {
      setSelectedTargetAccountId(targetAccountId);
    }
  }, [targetAccountId]);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Wizard state
  const [stage, setStage] = useState(STAGE.IDLE);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState(null);
  const [parseError, setParseError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  // Multi-Sheet & Workbook inspection state
  const [workbookSheets, setWorkbookSheets] = useState([]);
  const [selectedSheetName, setSelectedSheetName] = useState(''); // Only 1 sheet at a time
  const [completedSheetNames, setCompletedSheetNames] = useState([]); // Track imported sheets
  const [sheetConfigs, setSheetConfigs] = useState({}); // { [sheetName]: { targetAccountId, headerRowIdx } }

  // Generic CSV state
  const [flatHeaders, setFlatHeaders] = useState([]);
  const [flatRows, setFlatRows] = useState([]);
  const [mappingSchema, setMappingSchema] = useState('transactions');
  const [columnMap, setColumnMap] = useState({});

  // Namespace selection
  const [nsEnabled, setNsEnabled] = useState({ people: true, accounts: true, bills: true, transactions: true, loans: true });
  const [nsStrategy, setNsStrategy] = useState({ people: 'merge', accounts: 'merge', bills: 'merge', transactions: 'merge', loans: 'merge' });
  const [nsCollapsed, setNsCollapsed] = useState({ people: false, accounts: false, bills: false, transactions: false, loans: false });

  // Parsed data ready for commit
  const [parsedPayload, setParsedPayload] = useState(null);
  // Full preview modal state
  const [fullPreviewNs, setFullPreviewNs] = useState(null);

  // --- Resolve helpers ---
  const resolveAccountName = (accountId) => {
    if (!accountId) return '-';
    const payloadAcc = parsedPayload?.accounts?.find(a => a.id === accountId);
    const budgetAcc = budget.accounts?.find(a => a.id === accountId);
    const acc = payloadAcc || budgetAcc;
    if (acc) return acc.name;
    return accountId;
  };

  const renderSplitsText = (splits) => {
    if (!splits || typeof splits !== 'object' || Object.keys(splits).length === 0) return '-';
    const parts = Object.entries(splits)
      .filter(([, pct]) => Number(pct) > 0)
      .map(([pid, pct]) => {
        const p = budget.people.find(p => p.id === pid);
        const name = p ? (p.name || '').split(' ')[0] : pid.slice(0, 6);
        return `${name} ${pct}%`;
      });
    return parts.length ? parts.join(' / ') : '-';
  };

  const renderCell = (rec, col) => {
    const val = rec[col];
    if (col === 'accountId') return resolveAccountName(val);
    if (col === 'splits') return renderSplitsText(val);
    if (col === 'amount' && val !== undefined) {
      const n = Number(val);
      if (!isNaN(n)) return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
    }
    if (val === undefined || val === '' || val === null) return <span className="text-slate-700 italic">-</span>;
    if (typeof val === 'object') return <span className="text-slate-500 italic">{JSON.stringify(val).slice(0, 30)}</span>;
    return String(val);
  };

  const getFullCols = (records) => {
    if (!records.length) return [];
    const skip = new Set(['id', 'importedAt']);
    const keys = new Set();
    records.forEach(r => Object.keys(r).forEach(k => { if (!skip.has(k)) keys.add(k); }));
    return Array.from(keys);
  };

  // --- File processing & Multi-Sheet Detection ---
  const processFile = useCallback(async (file) => {
    if (!file) return;
    logDebug('IMPORT', `Ingesting file "${file.name}"`, { fileName: file.name, sizeBytes: file.size, mimeType: file.type });
    setParseError('');
    setFileName(file.name);
    setStage(STAGE.PARSING);
    setCompletedSheetNames([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const inspection = inspectWorkbookSheets(arrayBuffer, file.name, budget.accounts || []);

      if (!inspection.sheetNames || inspection.sheetNames.length === 0) {
        throw new Error('No readable sheets found in the spreadsheet.');
      }

      setWorkbookSheets(inspection.sheetsInfo);

      // Initialize default sheet configs
      const initialConfigs = {};
      inspection.sheetsInfo.forEach(s => {
        initialConfigs[s.name] = {
          targetAccountId: s.suggestedAccountId || targetAccountId || selectedTargetAccountId || budget.accounts[0]?.id || '',
          headerRowIdx: s.hasExtraHeader ? s.suggestedHeaderIdx : 0
        };
      });
      setSheetConfigs(initialConfigs);

      // If workbook has multiple sheets -> select 1 worksheet
      if (inspection.isWorkbook && inspection.sheetNames.length > 1) {
        logDebug('IMPORT', `Multi-sheet workbook with ${inspection.sheetNames.length} tabs detected. Route to 1-sheet selection.`, { sheets: inspection.sheetNames });
        // Pick first data sheet as default selection
        const defaultSheet = inspection.sheetsInfo.find(s => !s.name.toLowerCase().includes('instruction') && !s.name.toLowerCase().includes('readme')) || inspection.sheetsInfo[0];
        setSelectedSheetName(defaultSheet.name);
        setStage(STAGE.SHEET_SELECT);
      } else {
        // Single sheet or CSV -> go straight to sheet wizard
        logDebug('IMPORT', `Single sheet / CSV detected: "${inspection.sheetNames[0]}"`, { sheet: inspection.sheetNames[0] });
        setSelectedSheetName(inspection.sheetNames[0]);
        setStage(STAGE.SHEET_WIZARD);
      }

    } catch (err) {
      logError('IMPORT', `File inspection failed: ${err.message}`, { error: err.message, stack: err.stack });
      setParseError(err.message || 'Failed to parse file.');
      setStage(STAGE.IDLE);
    }
  }, [budget.accounts, targetAccountId, selectedTargetAccountId]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleReset = () => {
    setStage(STAGE.IDLE);
    setFileName('');
    setFileType(null);
    setParseError('');
    setWorkbookSheets([]);
    setSelectedSheetName('');
    setCompletedSheetNames([]);
    setSheetConfigs({});
    setFlatHeaders([]);
    setFlatRows([]);
    setColumnMap({});
    setParsedPayload(null);
    setNsEnabled({ people: true, accounts: true, bills: true, transactions: true, loans: true });
    setNsStrategy({ people: 'merge', accounts: 'merge', bills: 'merge', transactions: 'merge', loans: 'merge' });
  };

  const handleStartSheetWizard = () => {
    if (!selectedSheetName) {
      setParseError('Please select a worksheet to import.');
      return;
    }
    setStage(STAGE.SHEET_WIZARD);
  };

  // --- Sheet Wizard Parse Handler (Parses the 1 Selected Sheet) ---
  const handleParseSelectedSheet = () => {
    try {
      const sheetInfo = workbookSheets.find(s => s.name === selectedSheetName);
      if (!sheetInfo) throw new Error(`Sheet "${selectedSheetName}" not found.`);

      const config = sheetConfigs[selectedSheetName] || {
        targetAccountId: targetAccountId || selectedTargetAccountId || sheetInfo.suggestedAccountId || '',
        headerRowIdx: sheetInfo.hasExtraHeader ? sheetInfo.suggestedHeaderIdx : 0
      };

      const targetAccId = config.targetAccountId || targetAccountId || selectedTargetAccountId || budget.accounts[0]?.id || '';
      const targetAcc = budget.accounts.find(a => a.id === targetAccId);

      logDebug('IMPORT', `Parsing single sheet: "${selectedSheetName}"`, {
        headerRowIdx: config.headerRowIdx,
        targetAccId,
        targetAccName: targetAcc?.name
      });

      const parsedSheet = parseSingleSheet({
        rawRows: sheetInfo.rawRows || [],
        sheetName: selectedSheetName,
        headerRowIdx: config.headerRowIdx,
        targetAccountId: targetAccId,
        targetAccountName: targetAcc?.name || selectedSheetName,
        existingBills: budget.bills || [],
        existingPeople: budget.people || []
      });

      // Construct accounts map
      const accountsMap = new Map();
      (budget.accounts || []).forEach(a => accountsMap.set(a.id, { ...a }));

      if (targetAccId && Object.keys(parsedSheet.importedLedgerRows || {}).length > 0) {
        const acc = accountsMap.get(targetAccId) || {
          id: targetAccId,
          name: targetAcc?.name || selectedSheetName,
          type: 'checking',
          enableExtraSavings: true,
          saveExtraMonthly: 0
        };
        acc.importedLedgerRows = {
          ...(acc.importedLedgerRows || {}),
          ...parsedSheet.importedLedgerRows
        };
        acc.ledgerMode = 'import';
        accountsMap.set(targetAccId, acc);
      }

      const payload = {
        people: parsedSheet.discoveredPeople || [],
        accounts: Array.from(accountsMap.values()),
        bills: parsedSheet.discoveredBills || [],
        loans: [],
        transactions: parsedSheet.transactions || [],
        targetAccountId: targetAccId,
        sheetName: selectedSheetName,
        importedLedgerRows: parsedSheet.importedLedgerRows || {}
      };

      logInfo('IMPORT', `Parsed sheet "${selectedSheetName}": ${payload.transactions.length} txns, ${payload.bills.length} bills`, {
        txnCount: payload.transactions.length,
        billsCount: payload.bills.length,
        peopleCount: payload.people.length
      });

      setParsedPayload(payload);
      setNsEnabled({
        people: payload.people.length > 0,
        accounts: payload.accounts.length > 0,
        bills: payload.bills.length > 0,
        loans: false,
        transactions: payload.transactions.length > 0,
      });
      setStage(STAGE.SELECTING);
    } catch (err) {
      logError('IMPORT', `Error parsing sheet: ${err.message}`, { error: err.message });
      setParseError(`Error in sheet "${selectedSheetName}": ${err.message}`);
    }
  };

  // --- Final import commit ---
  const handleApplyImport = () => {
    if (!parsedPayload) return;

    const anyEnabled = Object.values(nsEnabled).some(Boolean);
    if (!anyEnabled) { setParseError('Select at least one data namespace to import.'); return; }

    logDebug('IMPORT', 'Applying selective import with user-selected namespaces and strategies', {
      namespaces: nsEnabled,
      strategies: nsStrategy,
      sheetName: selectedSheetName,
      payloadSummary: {
        people: parsedPayload.people?.length || 0,
        accounts: parsedPayload.accounts?.length || 0,
        bills: parsedPayload.bills?.length || 0,
        transactions: parsedPayload.transactions?.length || 0,
      }
    });

    const result = importSpreadsheetSelective({
      namespaces: nsEnabled,
      strategies: nsStrategy,
      data: parsedPayload,
    });

    if (result.success) {
      logInfo('IMPORT', `Import committed successfully for sheet "${selectedSheetName}"`);
      const parts = [];
      if (nsEnabled.people && parsedPayload.people?.length) parts.push(`${parsedPayload.people.length} earners`);
      if (nsEnabled.accounts && parsedPayload.accounts?.length) parts.push(`${parsedPayload.accounts.length} accounts`);
      if (nsEnabled.bills && parsedPayload.bills?.length) parts.push(`${parsedPayload.bills.length} bills`);
      if (nsEnabled.transactions && parsedPayload.transactions?.length) parts.push(`${parsedPayload.transactions.length} transactions`);

      // Track completed sheet
      if (!completedSheetNames.includes(selectedSheetName)) {
        setCompletedSheetNames(prev => [...prev, selectedSheetName]);
      }

      setResultMsg(`Import complete for "${selectedSheetName}": ${parts.join(', ')} committed.`);
      setStage(STAGE.DONE);

      if (onImportComplete) {
        onImportComplete({ success: true, payload: parsedPayload });
      }
    } else {
      logError('IMPORT', `importSpreadsheetSelective failed: ${result.error}`, { error: result.error });
      setParseError(result.error || 'Import failed.');
    }
  };

  // --- Action: Import Another Sheet from This Workbook ---
  const handleSelectAnotherSheet = () => {
    // Find next sheet in workbook that hasn't been imported yet
    const nextSheet = workbookSheets.find(s => !completedSheetNames.includes(s.name) && s.name !== selectedSheetName) || workbookSheets[0];
    if (nextSheet) {
      setSelectedSheetName(nextSheet.name);
    }
    setParsedPayload(null);
    setParseError('');
    setStage(STAGE.SHEET_SELECT);
  };

  // --- Namespace preview configs ---
  const nsConfig = [
    {
      key: 'people',
      label: 'Users / Earners',
      icon: Users,
      color: 'purple',
      records: parsedPayload?.people || [],
      previewCols: ['name', 'role', 'payFrequency'],
      description: 'Household members and income earner profiles.',
    },
    {
      key: 'accounts',
      label: 'Financial Accounts',
      icon: CreditCard,
      color: 'indigo',
      records: parsedPayload?.accounts || [],
      previewCols: ['name', 'type', 'color'],
      description: 'Checking, savings, credit, and mortgage funding accounts.',
    },
    {
      key: 'bills',
      label: 'Bills',
      icon: Receipt,
      color: 'blue',
      records: parsedPayload?.bills || [],
      previewCols: ['name', 'amount', 'matchingKey', 'period', 'accountId', 'splits'],
      description: 'Recurring bill schedules and payment allocations.',
    },
    {
      key: 'transactions',
      label: 'Transactions',
      icon: CreditCard,
      color: 'emerald',
      records: parsedPayload?.transactions || [],
      previewCols: ['date', 'description', 'amount', 'accountId', 'category'],
      description: 'Bank CSV transaction rows (date, description, amount, account).',
    },
  ];

  const colorMap = {
    purple: {
      badge: 'bg-purple-950 text-purple-300 border-purple-800',
      check: 'bg-purple-600 border-purple-600',
      header: 'text-purple-300',
      icon: 'bg-purple-600/20 text-purple-400',
    },
    indigo: {
      badge: 'bg-indigo-950 text-indigo-300 border-indigo-800',
      check: 'bg-indigo-600 border-indigo-600',
      header: 'text-indigo-300',
      icon: 'bg-indigo-600/20 text-indigo-400',
    },
    blue: {
      badge: 'bg-blue-950 text-blue-300 border-blue-800',
      check: 'bg-blue-600 border-blue-600',
      header: 'text-blue-300',
      icon: 'bg-blue-600/20 text-blue-400',
    },
    emerald: {
      badge: 'bg-emerald-950 text-emerald-300 border-emerald-800',
      check: 'bg-emerald-600 border-emerald-600',
      header: 'text-emerald-300',
      icon: 'bg-emerald-600/20 text-emerald-400',
    },
  };

  // =================== RENDER ===================
  const effectiveTargetAccount = budget.accounts.find(a => a.id === (targetAccountId || selectedTargetAccountId));
  const currentSheet = workbookSheets.find(s => s.name === selectedSheetName);
  const currentConfig = sheetConfigs[selectedSheetName] || {
    targetAccountId: targetAccountId || selectedTargetAccountId || currentSheet?.suggestedAccountId || '',
    headerRowIdx: currentSheet?.hasExtraHeader ? currentSheet.suggestedHeaderIdx : 0
  };

  const remainingSheets = workbookSheets.filter(s => !completedSheetNames.includes(s.name));

  return (
    <>
    <div className="p-4 sm:p-5 rounded-2xl glass-card border border-indigo-800/50 bg-indigo-950/10 space-y-4">

      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <FileSpreadsheet className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-xs font-bold text-slate-100">
              {targetAccountName ? `Import to ${targetAccountName}` : 'Smart Spreadsheet & Bank Importer'}
            </h4>
            <p className="text-[11px] text-slate-400">
              {targetAccountId
                ? `Upload bank CSV or XLSX spreadsheet directly into ${targetAccountName || effectiveTargetAccount?.name || 'this account'}`
                : 'Import one worksheet at a time with automatic offset header detection'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stage !== STAGE.IDLE && stage !== STAGE.PARSING && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Start Over
            </button>
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Importer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {parseError && (
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{parseError}</span>
          <button onClick={() => setParseError('')} className="ml-auto text-rose-400 hover:text-rose-200 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ---- STAGE: IDLE - Drag & Drop Zone ---- */}
      {stage === STAGE.IDLE && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Upload CSV or Excel file"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/40 scale-[1.01]'
              : 'border-slate-700 hover:border-slate-500 bg-slate-950/30 hover:bg-slate-950/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className={`p-3.5 rounded-2xl transition-all ${isDragging ? 'bg-indigo-600/30' : 'bg-slate-800'}`}>
            <Upload className={`w-6 h-6 transition-all ${isDragging ? 'text-indigo-300' : 'text-slate-400'}`} />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-slate-200">Drop your file here, or click to browse</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Accepts <span className="font-mono text-slate-400">.csv</span>, <span className="font-mono text-slate-400">.xlsx</span>, or exported Google Sheets</p>
          </div>
        </div>
      )}

      {/* ---- STAGE: PARSING ---- */}
      {stage === STAGE.PARSING && (
        <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          <p className="text-xs font-semibold">Analyzing <span className="text-indigo-300">{fileName}</span>...</p>
          <p className="text-[11px] text-slate-500">Detecting sheets and header row structures</p>
        </div>
      )}

      {/* ---- STAGE: SHEET_SELECT (Step 1: Select 1 Worksheet) ---- */}
      {stage === STAGE.SHEET_SELECT && (
        <div className="space-y-3 animate-fade-in">
          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/60 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-indigo-200">Select 1 Worksheet to Import</h4>
              <p className="text-[11px] text-slate-400">
                Choose one worksheet from <strong>{fileName}</strong> to configure and import:
              </p>
            </div>
            {completedSheetNames.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                {completedSheetNames.length} of {workbookSheets.length} imported
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto matrix-scrollbar">
            {workbookSheets.map(s => {
              const isSelected = selectedSheetName === s.name;
              const isAlreadyImported = completedSheetNames.includes(s.name);

              return (
                <div
                  key={s.name}
                  onClick={() => setSelectedSheetName(s.name)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-400 text-white shadow-sm'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-indigo-400 bg-indigo-600' : 'border-slate-600 bg-slate-950'
                    }`}>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{s.name}</span>
                        {isAlreadyImported && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] font-semibold">
                            ✓ Imported
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {s.rowCount} rows • {s.hasExtraHeader ? 'Offset category header detected' : 'Standard header'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800 shrink-0">
                    {s.suggestedAccountName ? `→ ${s.suggestedAccountName}` : 'Unassigned'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-500">
              Selected: <strong className="text-slate-300">{selectedSheetName}</strong>
            </span>
            <button
              type="button"
              disabled={!selectedSheetName}
              onClick={handleStartSheetWizard}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <span>Configure Worksheet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ---- STAGE: SHEET_WIZARD (Step 2: Sheet Setup Wizard) ---- */}
      {stage === STAGE.SHEET_WIZARD && currentSheet && (
        <div className="space-y-4 animate-fade-in">

          {/* Step Banner */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold shrink-0">
                Worksheet Setup
              </span>
              <span className="text-xs font-bold text-white truncate">{currentSheet.name}</span>
            </div>
            {workbookSheets.length > 1 && (
              <button
                type="button"
                onClick={() => setStage(STAGE.SHEET_SELECT)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
              >
                Change Worksheet
              </button>
            )}
          </div>

          {/* Section 1: Destination Account */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                <span>1. Destination Account:</span>
              </div>
              <span className="text-[10px] text-slate-500">Transactions will import to this account</span>
            </div>
            <select
              value={currentConfig.targetAccountId}
              onChange={e => {
                const val = e.target.value;
                setSheetConfigs(prev => ({
                  ...prev,
                  [selectedSheetName]: { ...prev[selectedSheetName], targetAccountId: val }
                }));
              }}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
            >
              <option value="">-- Select Destination Account --</option>
              {budget.accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {/* Section 2: Header Row Detection & Visual Preview */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Table className="w-3.5 h-3.5 text-indigo-400" />
                <span>2. Column Header Row Confirmation:</span>
              </div>
              {currentSheet.hasExtraHeader && (
                <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-semibold shrink-0">
                  Extra Header Row Detected
                </span>
              )}
            </div>

            {currentSheet.hasExtraHeader && (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[11px] text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Category Header Detected on Row 1:</strong> Row 1 contains grouping labels (e.g. <em>Credits / Outgoing Payments</em>). We recommend ignoring Row 1 and using <strong>Row 2</strong> as the column headers.
                </span>
              </div>
            )}

            {/* Header Row Selection Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSheetConfigs(prev => ({
                    ...prev,
                    [selectedSheetName]: { ...prev[selectedSheetName], headerRowIdx: 1 }
                  }));
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  currentConfig.headerRowIdx === 1
                    ? 'bg-indigo-950/50 border-indigo-600 text-white shadow-sm ring-1 ring-indigo-500'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Ignore Row 1 & Use Row 2</span>
                  {currentSheet.hasExtraHeader && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] font-bold">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Skips category groupings and uses column names on Row 2 (Date, Balances, Debits).
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSheetConfigs(prev => ({
                    ...prev,
                    [selectedSheetName]: { ...prev[selectedSheetName], headerRowIdx: 0 }
                  }));
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  currentConfig.headerRowIdx === 0
                    ? 'bg-indigo-950/50 border-indigo-600 text-white shadow-sm ring-1 ring-indigo-500'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Use Row 1 as Header</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Standard format where Row 1 contains all column headers.
                </p>
              </button>
            </div>

            {/* Visual Row Preview Table */}
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-900/80 border-b border-slate-800 text-[10px] font-semibold text-slate-400">
                Top Rows Preview from "{currentSheet.name}"
              </div>
              <div className="overflow-x-auto matrix-scrollbar max-h-48">
                <table className="w-full text-[10px] text-slate-300">
                  <tbody className="divide-y divide-slate-800/60">
                    {(currentSheet.previewRows || []).slice(0, 4).map((row, rIdx) => {
                      const isHeaderRow = currentConfig.headerRowIdx === rIdx;
                      const isIgnoredRow = currentConfig.headerRowIdx > rIdx;

                      return (
                        <tr
                          key={rIdx}
                          className={`transition-colors ${
                            isHeaderRow
                              ? 'bg-indigo-950/40 font-semibold'
                              : isIgnoredRow
                              ? 'bg-rose-950/10 opacity-50'
                              : 'bg-slate-900/20'
                          }`}
                        >
                          <td className="px-2.5 py-1.5 font-mono text-[9px] text-slate-500 whitespace-nowrap w-24 border-r border-slate-800">
                            {isHeaderRow ? (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">Row {rIdx + 1} (Header)</span>
                            ) : isIgnoredRow ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">Row {rIdx + 1} (Ignored)</span>
                            ) : (
                              <span className="text-slate-400">Row {rIdx + 1} (Data)</span>
                            )}
                          </td>
                          {(row || []).slice(0, 8).map((cell, cIdx) => (
                            <td key={cIdx} className="px-2.5 py-1.5 font-mono text-slate-300 truncate max-w-[140px] border-r border-slate-800/40">
                              {cell ? String(cell).trim() : <span className="text-slate-700 italic">-</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Navigation Actions */}
          <div className="flex items-center justify-between pt-1">
            {workbookSheets.length > 1 ? (
              <button
                type="button"
                onClick={() => setStage(STAGE.SHEET_SELECT)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sheets
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              disabled={!currentConfig.targetAccountId}
              onClick={handleParseSelectedSheet}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <span>Parse & Review Data</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ---- STAGE: SELECTING - Namespace Selectors ---- */}
      {stage === STAGE.SELECTING && parsedPayload && (
        <div className="space-y-3 animate-fade-in">

          {/* File & Sheet badge */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-200">
                Worksheet "{selectedSheetName}" Parsed &mdash; Review & Select Data to Commit
              </p>
              <p className="text-[11px] text-emerald-400/80 truncate">
                {parsedPayload.transactions.length} transactions, {parsedPayload.bills.length} bills, {parsedPayload.people.length} earners
              </p>
            </div>
          </div>

          {/* Namespace cards */}
          {nsConfig.map(ns => {
            const c = colorMap[ns.color] || colorMap.blue;
            const Icon = ns.icon;
            const isEnabled = nsEnabled[ns.key];
            const strategy = nsStrategy[ns.key];
            const collapsed = nsCollapsed[ns.key];
            const count = ns.records.length;

            return (
              <div
                key={ns.key}
                className={`rounded-xl border transition-all ${
                  isEnabled
                    ? `border-${ns.color}-800/60 bg-${ns.color}-950/10`
                    : 'border-slate-800 bg-slate-900/30 opacity-60'
                }`}
              >
                {/* Namespace header row */}
                <div className="flex items-center gap-3 p-3">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => setNsEnabled(prev => ({ ...prev, [ns.key]: !prev[ns.key] }))}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                      isEnabled ? `${c.check} text-white` : 'border-slate-600 bg-transparent'
                    }`}
                    aria-label={`Toggle ${ns.label} import`}
                  >
                    {isEnabled && <Check className="w-3 h-3" />}
                  </button>

                  <span className={`p-1.5 rounded-lg ${c.icon} flex-shrink-0`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${c.header}`}>{ns.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-semibold ${c.badge}`}>
                        {count} records
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{ns.description}</p>
                  </div>

                  {/* Strategy toggle (only if enabled) */}
                  {isEnabled && count > 0 && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StrategyToggle
                        value={strategy}
                        onChange={val => setNsStrategy(prev => ({ ...prev, [ns.key]: val }))}
                      />
                    </div>
                  )}

                  {/* Collapse toggle */}
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={() => setNsCollapsed(prev => ({ ...prev, [ns.key]: !prev[ns.key] }))}
                      className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 cursor-pointer"
                    >
                      {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Preview table */}
                {!collapsed && count > 0 && (
                  <div className="border-t border-slate-800/60 overflow-x-auto matrix-scrollbar max-h-56 overflow-y-auto">
                    <table className="w-full text-[10px] text-slate-400" style={{ minWidth: '480px' }}>
                      <thead className="bg-slate-900/80 sticky top-0 z-10">
                        <tr>
                          {ns.previewCols.map(col => (
                            <th key={col} className="px-3 py-1 text-left text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">
                              {col === 'accountId' ? 'Account' : col === 'splits' ? 'Splits' : col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {ns.records.slice(0, 8).map((rec, i) => (
                          <tr key={i} className="hover:bg-slate-900/30">
                            {ns.previewCols.map(col => (
                              <td key={col} className="px-3 py-1 font-mono text-slate-300 max-w-[160px] truncate">
                                {renderCell(rec, col)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {count > 8 && (
                          <tr>
                            <td colSpan={ns.previewCols.length} className="px-3 py-1 text-slate-600 italic">
                              ...and {count - 8} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Preview All button */}
                {count > 0 && !collapsed && (
                  <div className="px-3 pb-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setFullPreviewNs(ns.key)}
                      className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview All {count} {ns.label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Navigation and Apply Actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setStage(STAGE.SHEET_WIZARD)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-700 rounded-xl transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Wizard
            </button>

            <button
              type="button"
              onClick={handleApplyImport}
              disabled={!Object.values(nsEnabled).some(Boolean)}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Apply Import ({selectedSheetName})
            </button>
          </div>
        </div>
      )}

      {/* ---- STAGE: DONE - Success & Additional Sheet Popup ---- */}
      {stage === STAGE.DONE && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-700/60">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-200">Import Successful</p>
              <p className="text-xs text-emerald-400 mt-0.5">{resultMsg}</p>
              <p className="text-[10px] text-slate-400 mt-1">IndexedDB updated. App state refreshed automatically.</p>
            </div>
          </div>

          {/* Popup Question: Import Additional Sheets */}
          {workbookSheets.length > 1 && (
            <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/60 space-y-3 animate-fade-in">
              <div className="flex items-start gap-2.5">
                <Layers className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-indigo-200">
                    Import Additional Worksheets from This Workbook?
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    This workbook contains <strong>{workbookSheets.length}</strong> total sheets ({completedSheetNames.length} imported so far). Would you like to select and import another worksheet?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSelectAnotherSheet}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Yes, Import Another Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => { if (isModal && onClose) onClose(); else handleReset(); }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  No, Finish Import
                </button>
              </div>
            </div>
          )}

          {/* Standard Exit / New File Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Different File
            </button>
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>

      {/* ---- FULL PREVIEW MODAL ---- */}
      {fullPreviewNs && parsedPayload && (() => {
        const ns = nsConfig.find(n => n.key === fullPreviewNs);
        if (!ns) return null;
        const records = ns.records;
        const cols = getFullCols(records);
        const colLabel = (c) => c === 'accountId' ? 'Account' : c === 'splits' ? 'Splits' : c;
        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)' }}
            onClick={e => { if (e.target === e.currentTarget) setFullPreviewNs(null); }}
          >
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-slate-100">
                    Full Preview: {ns.label} ({selectedSheetName})
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {records.length} records &mdash; {cols.length} fields each
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFullPreviewNs(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-auto matrix-scrollbar flex-1">
                <table className="text-[10px] text-slate-300 border-collapse" style={{ minWidth: `${cols.length * 130}px` }}>
                  <thead className="sticky top-0 z-10 bg-slate-950">
                    <tr>
                      <th className="px-2.5 py-2 text-left text-slate-500 font-semibold border-b border-r border-slate-800 whitespace-nowrap w-8">#</th>
                      {cols.map(col => (
                        <th key={col} className="px-2.5 py-2 text-left text-slate-400 font-semibold border-b border-r border-slate-800 whitespace-nowrap uppercase tracking-wide text-[9px]">
                          {colLabel(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec, i) => (
                      <tr key={i} className={`hover:bg-slate-800/40 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                        <td className="px-2.5 py-1.5 text-slate-600 font-mono border-r border-slate-800/50 whitespace-nowrap">{i + 1}</td>
                        {cols.map(col => (
                          <td key={col} className="px-2.5 py-1.5 font-mono border-r border-slate-800/30 max-w-[180px]">
                            <div className="truncate">{renderCell(rec, col)}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] text-slate-500">
                  All {records.length} rows shown
                </span>
                <button
                  type="button"
                  onClick={() => setFullPreviewNs(null)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

