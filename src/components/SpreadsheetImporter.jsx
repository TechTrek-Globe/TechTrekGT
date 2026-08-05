// @ts-nocheck
import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, ArrowRight, RotateCcw,
  Users, Receipt, CreditCard, Loader2, X, Check, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../utils/spreadsheetParser';
import {
  detectFileType,
  parseGenericFlat,
  autoMatchColumns,
  applyTransactionMapping,
  applyBillMapping,
  INTERNAL_TRANSACTION_FIELDS,
  INTERNAL_BILL_FIELDS,
} from '../utils/importer';
import { useBudget } from '../context/BudgetContext';

// --- Stage constants ---
const STAGE = {
  IDLE: 'idle',
  PARSING: 'parsing',
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

export function SpreadsheetImporter() {
  const { budget, importSpreadsheetSelective } = useBudget();

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Wizard state
  const [stage, setStage] = useState(STAGE.IDLE);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState(null); // 'emory_parc' | 'generic_csv'
  const [parseError, setParseError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  // Generic CSV state
  const [flatHeaders, setFlatHeaders] = useState([]);
  const [flatRows, setFlatRows] = useState([]);
  const [mappingSchema, setMappingSchema] = useState('transactions'); // 'transactions' | 'bills'
  const [columnMap, setColumnMap] = useState({});

  // Namespace selection
  const [nsEnabled, setNsEnabled] = useState({ people: true, bills: true, transactions: false });
  const [nsStrategy, setNsStrategy] = useState({ people: 'merge', bills: 'merge', transactions: 'merge' });
  const [nsCollapsed, setNsCollapsed] = useState({ people: false, bills: false, transactions: false });

  // Parsed data ready for commit
  const [parsedPayload, setParsedPayload] = useState(null); // { people, accounts, bills, loans, transactions }
  // Full preview modal state
  const [fullPreviewNs, setFullPreviewNs] = useState(null); // null | 'people' | 'accounts' | 'bills' | 'transactions' | 'loans'

  // --- Resolve helpers ---
  const resolveAccountName = (accountId) => {
    if (!accountId) return '-';
    // Check parsed payload accounts first
    const payloadAcc = parsedPayload?.accounts?.find(a => a.id === accountId);
    // Next check budget context accounts
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

  // Smart cell renderer - handles accountId, splits, amounts
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

  // Derive all columns for a full preview (excludes internal ids, importedAt)
  const getFullCols = (records) => {
    if (!records.length) return [];
    const skip = new Set(['id', 'importedAt']);
    const keys = new Set();
    records.forEach(r => Object.keys(r).forEach(k => { if (!skip.has(k)) keys.add(k); }));
    return Array.from(keys);
  };

  // --- File processing ---
  const processFile = useCallback(async (file) => {
    if (!file) return;
    setParseError('');
    setFileName(file.name);
    setStage(STAGE.PARSING);

    const arrayBuffer = await file.arrayBuffer();

    try {
      // Detect workbook sheet names for type detection
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const detectedType = detectFileType(file.name, wb.SheetNames);
      setFileType(detectedType);

      if (detectedType === 'emory_parc') {
        // Use existing rich parser - no column mapping needed
        const result = parseSpreadsheet(arrayBuffer, file.name);
        if (!result.success) throw new Error(result.error);

        const payload = {
          people: result.budget.people || [],
          accounts: result.budget.accounts || [],
          bills: result.budget.bills || [],
          loans: result.budget.loans || [],
          transactions: result.budget.transactions || result.budget.lineItems || [],
        };
        setParsedPayload(payload);
        setNsEnabled({
          people: payload.people.length > 0,
          accounts: payload.accounts.length > 0,
          bills: payload.bills.length > 0,
          loans: payload.loans.length > 0,
          transactions: payload.transactions.length > 0,
        });
        setStage(STAGE.SELECTING);
      } else {
        // Generic CSV - parse flat and run auto-match for transactions first
        const { headers, rows } = parseGenericFlat(arrayBuffer);
        if (headers.length === 0) throw new Error('No readable columns found. Ensure the file has a header row.');

        setFlatHeaders(headers);
        setFlatRows(rows);

        const { mapping, confidence } = autoMatchColumns(headers, 'transactions');
        setColumnMap(mapping);
        setMappingSchema('transactions');

        if (confidence >= 1.0) {
          // All required fields matched - skip mapper, go straight to selecting
          const { records } = applyTransactionMapping(rows, mapping);
          setParsedPayload({ people: [], accounts: [], bills: [], loans: [], transactions: records });
          setNsEnabled({ people: false, accounts: false, bills: false, loans: false, transactions: records.length > 0 });
          setStage(STAGE.SELECTING);
        } else {
          // Needs manual column mapping
          setStage(STAGE.MAPPING);
        }
      }
    } catch (err) {
      setParseError(err.message || 'Failed to parse file.');
      setStage(STAGE.IDLE);
    }
  }, []);

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
    setFlatHeaders([]);
    setFlatRows([]);
    setColumnMap({});
    setParsedPayload(null);
    setNsEnabled({ people: true, accounts: true, bills: true, transactions: false, loans: true });
    setNsStrategy({ people: 'merge', accounts: 'merge', bills: 'merge', transactions: 'merge', loans: 'merge' });
  };

  // --- Column mapper confirm ---
  const handleMappingConfirm = () => {
    try {
      let payload = { people: [], accounts: [], bills: [], loans: [], transactions: [] };

      if (mappingSchema === 'transactions') {
        const { records } = applyTransactionMapping(flatRows, columnMap);
        // Resolve _accountName -> accountId by fuzzy name match
        const resolved = records.map(r => {
          if (r._accountName) {
            const match = budget.accounts.find(a =>
              a.name.toLowerCase().includes(r._accountName.toLowerCase()) ||
              r._accountName.toLowerCase().includes(a.name.toLowerCase())
            );
            const { _accountName, ...rest } = r;
            return match ? { ...rest, accountId: match.id } : rest;
          }
          return r;
        });
        payload.transactions = resolved;
        setNsEnabled(prev => ({ ...prev, transactions: resolved.length > 0 }));
      } else {
        const { records } = applyBillMapping(flatRows, columnMap, budget.accounts[0]?.id || '');
        const resolved = records.map(r => {
          if (r._accountName) {
            const match = budget.accounts.find(a =>
              a.name.toLowerCase().includes(r._accountName.toLowerCase()) ||
              r._accountName.toLowerCase().includes(a.name.toLowerCase())
            );
            const { _accountName, ...rest } = r;
            return match ? { ...rest, accountId: match.id } : rest;
          }
          return r;
        });
        payload.bills = resolved;
        setNsEnabled(prev => ({ ...prev, bills: resolved.length > 0 }));
      }

      setParsedPayload(payload);
      setStage(STAGE.SELECTING);
    } catch (err) {
      setParseError(err.message || 'Column mapping failed.');
    }
  };

  // --- Final import commit ---
  const handleApplyImport = () => {
    if (!parsedPayload) return;

    const anyEnabled = Object.values(nsEnabled).some(Boolean);
    if (!anyEnabled) { setParseError('Select at least one data namespace to import.'); return; }

    const result = importSpreadsheetSelective({
      namespaces: nsEnabled,
      strategies: nsStrategy,
      data: parsedPayload,
    });

    if (result.success) {
      const parts = [];
      if (nsEnabled.people && parsedPayload.people?.length) parts.push(`${parsedPayload.people.length} earners`);
      if (nsEnabled.accounts && parsedPayload.accounts?.length) parts.push(`${parsedPayload.accounts.length} accounts`);
      if (nsEnabled.bills && parsedPayload.bills?.length) parts.push(`${parsedPayload.bills.length} bills`);
      if (nsEnabled.transactions && parsedPayload.transactions?.length) parts.push(`${parsedPayload.transactions.length} transactions`);
      if (nsEnabled.loans && parsedPayload.loans?.length) parts.push(`${parsedPayload.loans.length} loans`);
      setResultMsg(`Import complete: ${parts.join(', ')} committed to IndexedDB.`);
      setStage(STAGE.DONE);
    } else {
      setParseError(result.error || 'Import failed.');
    }
  };

  // --- Namespace preview helpers ---
  const PREVIEW_MAX = 5;

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
      previewCols: ['name', 'type', 'startingBalance'],
      description: 'Checking, savings, credit, and mortgage funding accounts.',
    },
    {
      key: 'bills',
      label: 'Bills',
      icon: Receipt,
      color: 'blue',
      records: parsedPayload?.bills || [],
      previewCols: ['name', 'amount', 'period', 'accountId', 'splits'],
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
    {
      key: 'loans',
      label: 'Loan Amortization Schedules',
      icon: FileSpreadsheet,
      color: 'amber',
      records: parsedPayload?.loans || [],
      previewCols: ['description', 'principal', 'annualInterestRate', 'termMonths'],
      description: 'Mortgages and structured loan amortization schedules.',
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
    amber: {
      badge: 'bg-amber-950 text-amber-300 border-amber-800',
      check: 'bg-amber-600 border-amber-600',
      header: 'text-amber-300',
      icon: 'bg-amber-600/20 text-amber-400',
    },
  };

  // =================== RENDER ===================
  return (
    <>
    <div className="p-5 rounded-2xl glass-card border border-indigo-800/50 bg-indigo-950/10 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <FileSpreadsheet className="w-5 h-5" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Smart Spreadsheet Importer</h4>
            <p className="text-xs text-slate-400">Import from XLSX, Google Sheets, or any bank CSV</p>
          </div>
        </div>
        {stage !== STAGE.IDLE && stage !== STAGE.PARSING && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-all"
          >
            <RotateCcw className="w-3 h-3" />
            Start Over
          </button>
        )}
      </div>

      {/* Error Banner */}
      {parseError && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{parseError}</span>
          <button onClick={() => setParseError('')} className="ml-auto text-rose-400 hover:text-rose-200"><X className="w-3.5 h-3.5" /></button>
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
            accept=".csv,.xlsx"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className={`p-4 rounded-2xl transition-all ${isDragging ? 'bg-indigo-600/30' : 'bg-slate-800'}`}>
            <Upload className={`w-8 h-8 transition-all ${isDragging ? 'text-indigo-300' : 'text-slate-400'}`} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-200">Drop your file here, or click to browse</p>
            <p className="text-xs text-slate-500 mt-1">Accepts <span className="font-mono text-slate-400">.csv</span>, <span className="font-mono text-slate-400">.xlsx</span>, or exported Google Sheets</p>
          </div>

        </div>
      )}

      {/* ---- STAGE: PARSING ---- */}
      {stage === STAGE.PARSING && (
        <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm font-semibold">Analyzing <span className="text-indigo-300">{fileName}</span>...</p>
          <p className="text-xs text-slate-500">Detecting schema and auto-matching columns</p>
        </div>
      )}

      {/* ---- STAGE: MAPPING - Column Mapper ---- */}
      {stage === STAGE.MAPPING && (
        <div className="space-y-4 animate-fade-in">
          {/* File detected header */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-200">Flat CSV / Sheet Detected - Column Mapping Required</p>
              <p className="text-[11px] text-amber-400/80 truncate">{fileName}</p>
            </div>
          </div>

          {/* Schema selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-300">Map columns to:</span>
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => { setMappingSchema('transactions'); setColumnMap(autoMatchColumns(flatHeaders, 'transactions').mapping); }}
                className={`px-3 py-1 rounded-lg transition-all ${mappingSchema === 'transactions' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >Transactions</button>
              <button
                type="button"
                onClick={() => { setMappingSchema('bills'); setColumnMap(autoMatchColumns(flatHeaders, 'bills').mapping); }}
                className={`px-3 py-1 rounded-lg transition-all ${mappingSchema === 'bills' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >Bills</button>
            </div>
          </div>

          {/* Column Mapping Table */}
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 border-b border-slate-800">
                <tr>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-semibold w-1/3">Detected Column</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-semibold w-1/3">Map To Field</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-semibold">Preview (first 2 rows)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {flatHeaders.map(header => (
                  <tr key={header} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{header}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <FieldSelect
                        value={columnMap[header] || '__ignore__'}
                        onChange={val => setColumnMap(prev => ({ ...prev, [header]: val }))}
                        schema={mappingSchema}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-0.5">
                        {flatRows.slice(0, 2).map((row, i) => (
                          <div key={i} className="text-[10px] text-slate-500 truncate max-w-[200px]">
                            {row[header] || <span className="text-slate-700 italic">empty</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-slate-500">
              {flatRows.length.toLocaleString()} data rows detected. Required fields marked with *.
            </p>
            <button
              type="button"
              onClick={handleMappingConfirm}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <ArrowRight className="w-4 h-4" />
              Confirm Mapping
            </button>
          </div>
        </div>
      )}

      {/* ---- STAGE: SELECTING - Namespace Selectors ---- */}
      {stage === STAGE.SELECTING && parsedPayload && (
        <div className="space-y-3 animate-fade-in">

          {/* File type badge */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-200">
                {fileType === 'emory_parc' ? 'Multi-Sheet Workbook / Template Detected' : 'Spreadsheet / CSV Parsed'} - Select Data to Import
              </p>
              <p className="text-[11px] text-emerald-400/80 truncate">{fileName}</p>
            </div>
          </div>

          {/* Namespace cards */}
          {nsConfig.map(ns => {
            const c = colorMap[ns.color];
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
                <div className="flex items-center gap-3 p-3.5">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => setNsEnabled(prev => ({ ...prev, [ns.key]: !prev[ns.key] }))}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
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
                      className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                    >
                      {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Preview table */}
                {!collapsed && count > 0 && (
                  <div className="border-t border-slate-800/60 overflow-x-auto matrix-scrollbar max-h-64 overflow-y-auto">
                    <table className="w-full text-[10px] text-slate-400" style={{ minWidth: '520px' }}>
                      <thead className="bg-slate-900/80 sticky top-0 z-10">
                        <tr>
                          {ns.previewCols.map(col => (
                            <th key={col} className="px-3 py-1.5 text-left text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">
                              {col === 'accountId' ? 'Account' : col === 'splits' ? 'Splits' : col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {ns.records.slice(0, 8).map((rec, i) => (
                          <tr key={i} className="hover:bg-slate-900/30">
                            {ns.previewCols.map(col => (
                              <td key={col} className="px-3 py-1.5 font-mono text-slate-300 max-w-[180px] truncate">
                                {renderCell(rec, col)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {count > 8 && (
                          <tr>
                            <td colSpan={ns.previewCols.length} className="px-3 py-1.5 text-slate-600 italic">
                              ...and {count - 8} more — click Preview All to see every row
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Preview All button */}
                {count > 0 && !collapsed && (
                  <div className="px-3.5 pb-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setFullPreviewNs(ns.key)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview All {count} {ns.label} — every field
                    </button>
                  </div>
                )}

                {/* Override warning */}
                {isEnabled && count > 0 && strategy === 'override' && (
                  <div className="mx-3.5 mb-3 p-2 rounded-lg bg-rose-950/50 border border-rose-900 text-[10px] text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Override will replace ALL existing {ns.label.toLowerCase()} in your database.
                  </div>
                )}
              </div>
            );
          })}

          {/* Apply button */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-slate-500">
              {Object.values(nsEnabled).filter(Boolean).length} namespace{Object.values(nsEnabled).filter(Boolean).length !== 1 ? 's' : ''} selected for import.
            </p>
            <button
              type="button"
              onClick={handleApplyImport}
              disabled={!Object.values(nsEnabled).some(Boolean)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              Apply Import
            </button>
          </div>
        </div>
      )}

      {/* ---- STAGE: DONE - Success ---- */}
      {stage === STAGE.DONE && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-950/50 border border-emerald-700/60">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-200">Import Successful</p>
              <p className="text-xs text-emerald-400 mt-0.5">{resultMsg}</p>
              <p className="text-[11px] text-slate-400 mt-1.5">IndexedDB updated. App state refreshed automatically.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Another File
          </button>
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
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Full Preview: {ns.label}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {records.length} records &mdash; {cols.length} fields each &mdash; scroll horizontally and vertically to see all data
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFullPreviewNs(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable table */}
              <div className="overflow-auto matrix-scrollbar flex-1">
                <table className="text-[11px] text-slate-300 border-collapse" style={{ minWidth: `${cols.length * 140}px` }}>
                  <thead className="sticky top-0 z-10 bg-slate-950">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-b border-r border-slate-800 whitespace-nowrap w-10">#</th>
                      {cols.map(col => (
                        <th key={col} className="px-3 py-2.5 text-left text-slate-400 font-semibold border-b border-r border-slate-800 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          {colLabel(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec, i) => (
                      <tr key={i} className={`hover:bg-slate-800/40 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-900/30'}`}>
                        <td className="px-3 py-2 text-slate-600 font-mono border-r border-slate-800/50 whitespace-nowrap">{i + 1}</td>
                        {cols.map(col => (
                          <td key={col} className="px-3 py-2 font-mono border-r border-slate-800/30 max-w-[200px]">
                            <div className="truncate">{renderCell(rec, col)}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between flex-shrink-0">
                <span className="text-[11px] text-slate-500">
                  All {records.length} rows shown &mdash; click outside or close to return
                </span>
                <button
                  type="button"
                  onClick={() => setFullPreviewNs(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all"
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
