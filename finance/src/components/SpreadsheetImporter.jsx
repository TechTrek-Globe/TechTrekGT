// @ts-nocheck
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  matchCreditToEarner,
  INTERNAL_TRANSACTION_FIELDS,
  INTERNAL_BILL_FIELDS,
} from '../utils/importer';
import { getLedgerRunningBalanceAsOfDate } from '../utils/spreadsheet';
import { useBudgetMetadataState, useBudgetMetadataDispatch, useLedgerDataDispatch } from '../context/BudgetContext';
import { logDebug, logInfo, logWarn, logError } from '../utils/debugLogger';

// --- Stage constants ---
const STAGE = {
  IDLE: 'idle',
  PARSING: 'parsing',
  SHEET_SELECT: 'sheet_select',
  SHEET_WIZARD: 'sheet_wizard',
  MAPPING: 'mapping',
  SELECTING: 'selecting',
  RECONCILIATION: 'reconciliation',
  BALANCE_CHECK: 'balance_check',
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
  const { budget } = useBudgetMetadataState();
  const { updateBill, updatePerson } = useBudgetMetadataDispatch();
  const { importSpreadsheetSelective } = useLedgerDataDispatch();
  const [savedAliases, setSavedAliases] = useState({});

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
  const [nsEnabled, setNsEnabled] = useState({ people: false, accounts: false, bills: false, transactions: true, loans: false });
  const [nsStrategy, setNsStrategy] = useState({ people: 'merge', accounts: 'merge', bills: 'merge', transactions: 'merge', loans: 'merge' });
  const [nsCollapsed, setNsCollapsed] = useState({ people: false, accounts: false, bills: false, transactions: false, loans: false });

  // Parsed data ready for commit
  const [parsedPayload, setParsedPayload] = useState(null);
  // Full preview modal state
  const [fullPreviewNs, setFullPreviewNs] = useState(null);

  // Reconciliation state
  const [conflicts, setConflicts] = useState([]);
  const [resolutions, setResolutions] = useState({});
  const [balanceDetails, setBalanceDetails] = useState({ stated: 0, calculated: 0, delta: 0, maxImportDate: null });

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

  const handleSaveAlias = useCallback((targetType, targetId, rawDesc) => {
    if (!targetId || !rawDesc) return;
    const cleanDesc = rawDesc.replace(/^Other\s*\$?\s*\(?(.*?)\)?$/i, '$1').trim();
    if (!cleanDesc) return;

    if (targetType === 'bill') {
      const targetBill = (budget?.bills || []).find(b => b.id === targetId);
      if (!targetBill) return;

      const existingAliases = targetBill.bankMatchNames || targetBill.matchingKey || '';
      const aliasesList = existingAliases
        ? existingAliases.split(/[,;\n\r|]+/).map(a => a.trim().toLowerCase())
        : [];

      if (!aliasesList.includes(cleanDesc.toLowerCase())) {
        const updatedAliases = existingAliases ? `${existingAliases}, ${cleanDesc}` : cleanDesc;
        if (typeof updateBill === 'function') {
          updateBill(targetId, {
            bankMatchNames: updatedAliases,
            matchingKey: updatedAliases
          });
        }
        setSavedAliases(prev => ({ ...prev, [`bill_${targetId}_${cleanDesc.toLowerCase()}`]: true }));
      }
    } else if (targetType === 'person') {
      const targetPerson = (budget?.people || []).find(p => p.id === targetId);
      if (!targetPerson) return;

      const existingAliases = targetPerson.bankMatchNames || targetPerson.matchingKey || '';
      const aliasesList = existingAliases
        ? existingAliases.split(/[,;\n\r|]+/).map(a => a.trim().toLowerCase())
        : [];

      if (!aliasesList.includes(cleanDesc.toLowerCase())) {
        const updatedAliases = existingAliases ? `${existingAliases}, ${cleanDesc}` : cleanDesc;
        if (typeof updatePerson === 'function') {
          updatePerson(targetId, {
            bankMatchNames: updatedAliases,
            matchingKey: updatedAliases
          });
        }
        setSavedAliases(prev => ({ ...prev, [`person_${targetId}_${cleanDesc.toLowerCase()}`]: true }));
      }
    }
  }, [budget?.bills, budget?.people, updateBill, updatePerson]);

  const handleTransactionMappingChange = useCallback((txnId, newSelectVal) => {
    setParsedPayload(prev => {
      if (!prev || !prev.transactions) return prev;
      const updatedTxns = prev.transactions.map(t => {
        if (t.id !== txnId) return t;
        if (!newSelectVal) {
          return {
            ...t,
            billId: null,
            personId: null,
            isOther: true
          };
        }
        if (newSelectVal.startsWith('bill:')) {
          const bId = newSelectVal.replace('bill:', '');
          const targetBill = (budget?.bills || []).find(b => b.id === bId);
          return {
            ...t,
            billId: bId,
            personId: null,
            isOther: false,
            category: targetBill?.category || t.category || 'Utilities'
          };
        }
        if (newSelectVal.startsWith('person:')) {
          const pId = newSelectVal.replace('person:', '');
          return {
            ...t,
            personId: pId,
            billId: null,
            isOther: false,
            category: 'Income / Transfer'
          };
        }
        return t;
      });
      return { ...prev, transactions: updatedTxns };
    });
  }, [budget?.bills]);

  const renderCell = (rec, col, nsKey = null) => {
    const val = rec[col];
    if (col === 'accountId') return resolveAccountName(val);
    if (col === 'splits') return renderSplitsText(val);
    if (col === 'amount' && val !== undefined) {
      const n = Number(val);
      if (!isNaN(n)) return n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
    }
    if (col === 'mapping') {
      const isDebit = Number(rec.amount) < 0;
      const mappedBill = (budget?.bills || []).find(b => b.id === rec.billId);
      const mappedPerson = (budget?.people || []).find(p => p.id === rec.personId);
      const selectValue = rec.billId ? `bill:${rec.billId}` : (rec.personId ? `person:${rec.personId}` : '');

      let canSaveAlias = false;
      let targetType = null;
      let targetId = null;

      if (mappedBill && rec.description) {
        const cleanDesc = rec.description.trim().toLowerCase();
        const existing = (mappedBill.bankMatchNames || mappedBill.matchingKey || '').toLowerCase();
        const aliases = existing.split(/[,;\n\r|]+/).map(a => a.trim());
        if (!aliases.includes(cleanDesc) && !mappedBill.name.toLowerCase().includes(cleanDesc)) {
          canSaveAlias = true;
          targetType = 'bill';
          targetId = mappedBill.id;
        }
      } else if (mappedPerson && rec.description) {
        const cleanDesc = rec.description.trim().toLowerCase();
        const existing = (mappedPerson.bankMatchNames || mappedPerson.matchingKey || '').toLowerCase();
        const aliases = existing.split(/[,;\n\r|]+/).map(a => a.trim());
        if (!aliases.includes(cleanDesc) && !mappedPerson.name.toLowerCase().includes(cleanDesc)) {
          canSaveAlias = true;
          targetType = 'person';
          targetId = mappedPerson.id;
        }
      }

      const aliasKey = targetId ? `${targetType}_${targetId}_${rec.description?.trim().toLowerCase()}` : '';
      const isSaved = Boolean(savedAliases[aliasKey]);

      const activeBills = (budget?.bills || []).filter(b => !b.isArchived);
      const people = budget?.people || [];

      return (
        <div className="flex items-center gap-1.5 min-w-[200px] max-w-[280px]" onClick={e => e.stopPropagation()}>
          <select
            value={selectValue}
            onChange={(e) => handleTransactionMappingChange(rec.id, e.target.value)}
            className={`w-full text-[10px] font-sans rounded-lg px-2 py-1 border transition-all cursor-pointer truncate ${
              mappedBill
                ? 'bg-emerald-950/60 border-emerald-700/80 text-emerald-300 font-semibold focus:ring-1 focus:ring-emerald-500'
                : mappedPerson
                ? 'bg-purple-950/60 border-purple-700/80 text-purple-300 font-semibold focus:ring-1 focus:ring-purple-500'
                : 'bg-slate-900 border-amber-800/60 text-amber-300/90 hover:border-slate-600 focus:ring-1 focus:ring-indigo-500'
            }`}
            title={mappedBill ? `Mapped to Bill: ${mappedBill.name}` : mappedPerson ? `Mapped to Earner: ${mappedPerson.name}` : 'Unmapped (Will route to Other Expenses)'}
          >
            <option value="" className="bg-slate-900 text-amber-300">
              ⚠️ Unmapped (Other {isDebit ? 'Expense' : 'Income'})
            </option>
            {isDebit ? (
              <>
                <optgroup label="Bills (Matching Expense)" className="bg-slate-900 text-slate-200">
                  {activeBills.map(b => (
                    <option key={b.id} value={`bill:${b.id}`} className="bg-slate-900 text-slate-200">
                      🧾 {b.name} (${Number(b.amount || 0).toFixed(2)})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Household Earners (Transfer)" className="bg-slate-900 text-slate-200">
                  {people.map(p => (
                    <option key={p.id} value={`person:${p.id}`} className="bg-slate-900 text-slate-200">
                      👤 Transfer: {p.name}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              <>
                <optgroup label="Household Earners (Deposit)" className="bg-slate-900 text-slate-200">
                  {people.map(p => (
                    <option key={p.id} value={`person:${p.id}`} className="bg-slate-900 text-slate-200">
                      👤 Deposit: {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Bills (Refund / Credit)" className="bg-slate-900 text-slate-200">
                  {activeBills.map(b => (
                    <option key={b.id} value={`bill:${b.id}`} className="bg-slate-900 text-slate-200">
                      🧾 Credit: {b.name}
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>

          {canSaveAlias && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSaveAlias(targetType, targetId, rec.description);
              }}
              disabled={isSaved}
              className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all cursor-pointer ${
                isSaved
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800 cursor-default'
                  : 'bg-indigo-950/80 text-indigo-300 border-indigo-700/80 hover:bg-indigo-900 hover:text-white shadow-sm'
              }`}
              title={isSaved ? 'Alias saved!' : `Save "${rec.description}" as alias for ${targetType === 'bill' ? mappedBill?.name : mappedPerson?.name}`}
            >
              {isSaved ? '✓ Saved' : '+ Alias'}
            </button>
          )}
        </div>
      );
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
      // UX-1: Yield to browser so the PARSING spinner paints before synchronous XLSX CPU work begins
      await new Promise(resolve => setTimeout(resolve, 0));
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
    setNsEnabled({ people: false, accounts: false, bills: false, transactions: true, loans: false });
    setNsStrategy({ people: 'merge', accounts: 'merge', bills: 'merge', transactions: 'merge', loans: 'merge' });
    setConflicts([]);
    setResolutions({});
    setBalanceDetails({ stated: 0, calculated: 0, delta: 0, maxImportDate: null });
  };

  const handleForceBalanceAdjustment = () => {
    if (!parsedPayload) return;
    const targetAccId = parsedPayload.targetAccountId || targetAccountId || selectedTargetAccountId || budget.accounts[0]?.id || '';
    const adjDate = balanceDetails.maxImportDate || new Date().toISOString().split('T')[0];
    
    parsedPayload.transactions.push({
      id: `txn-${Date.now()}-adj`,
      date: adjDate,
      description: 'Reconciliation Adjustment',
      amount: Math.round((balanceDetails.stated - balanceDetails.calculated) * 100) / 100,
      accountId: targetAccId,
      category: 'Adjustment',
      notes: `Auto-generated to match file balance as of ${adjDate}`
    });

    const result = importSpreadsheetSelective({
      namespaces: nsEnabled,
      strategies: nsStrategy,
      data: parsedPayload,
      resolutions
    });

    if (result.success) {
      if (!completedSheetNames.includes(selectedSheetName)) {
        setCompletedSheetNames(prev => [...prev, selectedSheetName]);
      }
      setResultMsg(`Import complete (with adjustment) for "${selectedSheetName}".`);
      setStage(STAGE.DONE);
      if (onImportComplete) {
        onImportComplete({ success: true, payload: parsedPayload });
      }
    } else {
      setParseError(result.error || 'Import failed.');
    }
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
        existingPeople: budget.people || [],
        existingAccounts: budget.accounts || []
      });

      // Detect if there are newly discovered accounts or genuine updates to existing accounts
      const existingAcc = (budget.accounts || []).find(a => a.id === targetAccId);
      const isNewAccount = !existingAcc && Boolean(targetAccId);

      const newLedgerRows = parsedSheet.importedLedgerRows || {};
      const existingLedgerRows = existingAcc?.importedLedgerRows || {};
      const hasNewLedgerData = Object.keys(newLedgerRows).length > 0 && Object.entries(newLedgerRows).some(([date, val]) => {
        const ex = existingLedgerRows[date];
        if (!ex) return true;
        const incVal = typeof val === 'object' ? (val.totalEnding ?? val.regEnding) : val;
        const exVal = typeof ex === 'object' ? (ex.totalEnding ?? ex.regEnding) : ex;
        return Math.abs((Number(incVal) || 0) - (Number(exVal) || 0)) > 0.001;
      });

      const changedAccounts = [];
      if (isNewAccount) {
        changedAccounts.push({
          id: targetAccId,
          name: targetAcc?.name || selectedSheetName,
          type: 'checking',
          enableExtraSavings: true,
          saveExtraMonthly: 0,
          importedLedgerRows: newLedgerRows,
          ledgerMode: Object.keys(newLedgerRows).length > 0 ? 'import' : 'manual'
        });
      } else if (hasNewLedgerData && existingAcc) {
        changedAccounts.push({
          ...existingAcc,
          importedLedgerRows: {
            ...existingLedgerRows,
            ...newLedgerRows
          },
          ledgerMode: 'import'
        });
      }

      // Check for any additional accounts discovered in the sheet
      const discoveredAccs = Array.isArray(parsedSheet.discoveredAccounts) ? parsedSheet.discoveredAccounts : [];
      discoveredAccs.forEach(da => {
        if (!changedAccounts.some(a => a.id === da.id) && !(budget.accounts || []).some(a => a.id === da.id)) {
          changedAccounts.push(da);
        }
      });

      const rawTransactions = parsedSheet.transactions || [];
      const resolvedTransactions = rawTransactions.map(t => {
        if (Number(t.amount) > 0 && !t.personId) {
          const match = matchCreditToEarner({
            amount: t.amount,
            description: t.description,
            notes: t.notes,
            category: t.category,
            targetAccountId: targetAccId,
            people: budget.people || [],
            bills: budget.bills || [],
            accounts: budget.accounts || []
          });
          if (match) {
            return {
              ...t,
              personId: match.person.id,
              isOther: false,
              category: 'Income / Transfer'
            };
          }
        }
        return t;
      });

      const payload = {
        people: parsedSheet.discoveredPeople || [],
        accounts: changedAccounts,
        bills: parsedSheet.discoveredBills || [],
        loans: [],
        transactions: resolvedTransactions,
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

      const nsEnabledNext = {
        people: payload.people.length > 0,
        accounts: payload.accounts.length > 0,
        bills: payload.bills.length > 0,
        loans: false,
        transactions: payload.transactions.length > 0,
      };

      // UX-2: Guard against empty-payload advancing to a useless SELECTING stage
      const hasAnyData = Object.values(nsEnabledNext).some(Boolean);
      if (!hasAnyData) {
        setParseError(
          `No importable data found in worksheet "${selectedSheetName}". The sheet may have no transaction rows, ` +
          `no recognizable header columns, or an incorrect header row selection. ` +
          `Try adjusting the Header Row setting and re-parsing.`
        );
        return;
      }

      setNsEnabled(nsEnabledNext);
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
      sheetName: selectedSheetName
    });

    if (stage === STAGE.SELECTING || stage === STAGE.RECONCILIATION) {
      logDebug('IMPORT', 'Running dry-run reconciliation check');
      const dryResult = importSpreadsheetSelective({
        namespaces: nsEnabled,
        strategies: nsStrategy,
        data: parsedPayload,
        dryRun: true,
        resolutions
      });

      if (dryResult.requiresResolution) {
        setConflicts(dryResult.conflicts);
        setStage(STAGE.RECONCILIATION);
        return;
      }

      // Check date-matched balance as of latest import date
      if (dryResult.projected) {
        const targetAccId = parsedPayload.targetAccountId || targetAccountId || selectedTargetAccountId || budget.accounts[0]?.id || '';
        
        // Extract latest transaction/row date from the imported payload
        const txnDates = (parsedPayload.transactions || [])
          .map(t => t.date)
          .filter(Boolean);
        const ledgerDates = Object.keys(parsedPayload.importedLedgerRows || {}).filter(Boolean);
        const allImportDates = Array.from(new Set([...txnDates, ...ledgerDates])).sort();
        const maxImportDate = allImportDates.length > 0 ? allImportDates[allImportDates.length - 1] : null;

        // Extract the stated balance from the imported file as of maxImportDate
        let stated = null;
        if (ledgerDates.length > 0) {
          const targetDateKey = (maxImportDate && parsedPayload.importedLedgerRows[maxImportDate] !== undefined)
            ? maxImportDate
            : ledgerDates[ledgerDates.length - 1];
          const row = parsedPayload.importedLedgerRows[targetDateKey];
          if (typeof row === 'number') {
            stated = row;
          } else if (row && typeof row === 'object') {
            stated = row.totalEnding ?? row.regEnding ?? row.totalBeg ?? null;
          }
        }

        if ((stated === null || stated === undefined || isNaN(stated)) && parsedPayload.transactions?.length > 0) {
          const txnsWithBal = parsedPayload.transactions
            .filter(t => t.balance !== undefined && t.balance !== null && !isNaN(parseFloat(t.balance)))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          if (txnsWithBal.length > 0) {
            const matchTxn = (maxImportDate ? [...txnsWithBal].reverse().find(t => t.date === maxImportDate) : null)
              || txnsWithBal[txnsWithBal.length - 1];
            stated = parseFloat(matchTxn.balance);
          }
        }

        if (stated !== null && stated !== undefined && !isNaN(stated)) {
          stated = Math.round(stated * 100) / 100;
        } else {
          stated = null;
        }

        // Fetch the ledger's calculated running balance exactly as of the import date
        let calculated = 0;
        if (maxImportDate) {
          calculated = getLedgerRunningBalanceAsOfDate({
            targetAccountId: targetAccId,
            targetDate: maxImportDate,
            metadataState: dryResult.projected.metadataState || { accounts: budget.accounts, people: budget.people, bills: budget.bills },
            dailyMatrix: dryResult.projected.dailyMatrix || {},
            transactions: dryResult.projected.transactions || []
          });
        } else {
          const projAccounts = dryResult.projected.metadataState?.accounts || budget.accounts || [];
          const projAcc = projAccounts.find(a => a.id === targetAccId);
          const startingBal = projAcc?.startingBalance || 0;
          const extraBal = projAcc?.enableExtraSavings !== false ? (projAcc?.extraStartingBalance || 0) : 0;
          const projTxns = (dryResult.projected.transactions || []).filter(t => t.accountId === targetAccId);
          const sumTxns = projTxns.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
          calculated = Math.round((startingBal + extraBal + sumTxns) * 100) / 100;
        }

        const delta = stated !== null ? Math.round(Math.abs(calculated - stated) * 100) / 100 : 0;

        logDebug('RECONCILE', `Balance check as of import date "${maxImportDate || 'all'}"`, {
          maxImportDate,
          stated,
          calculated,
          delta,
          targetAccId
        });

        if (delta > 0.01 && stated !== null && typeof stated === 'number') {
          setBalanceDetails({ stated, calculated, delta, maxImportDate });
          setStage(STAGE.BALANCE_CHECK);
          return;
        }
      }
    }

    const result = importSpreadsheetSelective({
      namespaces: nsEnabled,
      strategies: nsStrategy,
      data: parsedPayload,
      resolutions
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
      previewCols: ['date', 'description', 'amount', 'accountId', 'category', 'mapping'],
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
                  <div className="border-t border-slate-800/60 overflow-x-auto matrix-scrollbar max-h-80 overflow-y-auto">
                    <table className="w-full text-[10px] text-slate-400" style={{ minWidth: ns.key === 'transactions' ? '720px' : '480px' }}>
                      <thead className="bg-slate-900/80 sticky top-0 z-10">
                        <tr>
                          {ns.previewCols.map(col => (
                            <th key={col} className={`px-3 py-1.5 text-left text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap ${col === 'mapping' ? 'min-w-[210px] text-slate-300' : ''}`}>
                              {col === 'accountId' ? 'Account' : col === 'splits' ? 'Splits' : col === 'mapping' ? 'Mapped Target' : col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {(ns.key === 'transactions' ? ns.records.slice(0, 50) : ns.records.slice(0, 8)).map((rec, i) => (
                          <tr key={i} className="hover:bg-slate-900/30">
                            {ns.previewCols.map(col => (
                              <td key={col} className={`px-3 py-1 font-mono text-slate-300 ${col === 'mapping' ? 'min-w-[210px]' : 'max-w-[160px] truncate'}`}>
                                {renderCell(rec, col, ns.key)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {ns.key !== 'transactions' && count > 8 && (
                          <tr>
                            <td colSpan={ns.previewCols.length} className="px-3 py-1 text-slate-600 italic">
                              ...and {count - 8} more rows
                            </td>
                          </tr>
                        )}
                        {ns.key === 'transactions' && count > 50 && (
                          <tr>
                            <td colSpan={ns.previewCols.length} className="px-3 py-1 text-slate-600 italic">
                              ...and {count - 50} more rows
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

      {/* ---- STAGE: RECONCILIATION ---- */}
      {stage === STAGE.RECONCILIATION && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 bg-orange-950/40 border border-orange-800/60 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-orange-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-orange-200">Action Required: Data Conflicts Detected</h3>
            </div>
            <p className="text-xs text-orange-300">
              We found {conflicts.length} incoming transaction(s) that match existing ledger entries but have some ambiguity (mismatched amounts, potential duplicates, etc). You must explicitly resolve them before importing. The imported file data is the absolute truth.
            </p>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto matrix-scrollbar pr-2">
            {conflicts.map((conf, idx) => {
              const inc = conf.incoming;
              const res = resolutions[inc.id] || { action: 'skip', targetId: null };
              return (
                <div key={inc.id || idx} className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-xl space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Incoming Row</span>
                      <p className="text-xs font-medium text-slate-200">{inc.date} • {inc.description}</p>
                      <p className="text-xs text-emerald-400 font-mono">${parseFloat(inc.amount).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="pl-3 border-l-2 border-slate-700 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Potential Matches in Ledger</span>
                    {conf.matches.map(ex => (
                      <label key={ex.id} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                        <input
                          type="radio"
                          name={`res-${inc.id}`}
                          checked={res.action === 'merge' && res.targetId === ex.id}
                          onChange={() => setResolutions(prev => ({ ...prev, [inc.id]: { action: 'merge', targetId: ex.id } }))}
                          className="mt-0.5 accent-indigo-500"
                        />
                        <div>
                          <p className="text-xs text-slate-300">{ex.date} • {ex.description}</p>
                          <p className="text-[11px] text-emerald-500/70 font-mono">${parseFloat(ex.amount).toFixed(2)}</p>
                        </div>
                      </label>
                    ))}
                    <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                      <input
                        type="radio"
                        name={`res-${inc.id}`}
                        checked={res.action === 'new'}
                        onChange={() => setResolutions(prev => ({ ...prev, [inc.id]: { action: 'new', targetId: null } }))}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <span className="text-xs text-emerald-300">Import as New (Do not merge)</span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                      <input
                        type="radio"
                        name={`res-${inc.id}`}
                        checked={res.action === 'skip'}
                        onChange={() => setResolutions(prev => ({ ...prev, [inc.id]: { action: 'skip', targetId: null } }))}
                        className="mt-0.5 accent-rose-500"
                      />
                      <span className="text-xs text-rose-300">Skip / Ignore this incoming row</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStage(STAGE.SELECTING)}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-700 rounded-xl"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleApplyImport}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
            >
              Confirm Resolutions & Continue
            </button>
          </div>
        </div>
      )}

      {/* ---- STAGE: BALANCE_CHECK ---- */}
      {stage === STAGE.BALANCE_CHECK && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-5 bg-rose-950/40 border border-rose-800/60 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-sm text-rose-200">Reconciliation Failed</h3>
            </div>
            <p className="text-xs text-rose-300">
              The calculated running balance of your ledger as of {balanceDetails.maxImportDate ? `the import date (${balanceDetails.maxImportDate})` : 'the latest transaction date'} does not match the stated balance on the imported file. The import queue has been paused to enforce strict Single Source of Truth rules.
            </p>
            
            <div className="grid grid-cols-2 gap-4 p-4 bg-black/40 rounded-lg">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500">Stated Balance (File)</p>
                <p className="text-lg font-mono text-emerald-400">${balanceDetails.stated.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500">
                  Calculated Balance (Ledger{balanceDetails.maxImportDate ? ` as of ${balanceDetails.maxImportDate}` : ''})
                </p>
                <p className="text-lg font-mono text-rose-400">${balanceDetails.calculated.toFixed(2)}</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-rose-800/30">
                <p className="text-[10px] uppercase font-bold text-slate-500">Discrepancy (Delta)</p>
                <p className="text-sm font-mono text-rose-300">${balanceDetails.delta.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStage(STAGE.SELECTING)}
                className="px-4 py-2 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium"
              >
                Go Back (Abort)
              </button>
              <button
                type="button"
                onClick={handleForceBalanceAdjustment}
                className="px-4 py-2 text-xs text-white bg-rose-700 hover:bg-rose-600 rounded-lg font-bold shadow-lg shadow-rose-900/50"
              >
                Force Match (Add Adjustment Txn)
              </button>
            </div>
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
      {fullPreviewNs && parsedPayload && typeof document !== 'undefined' && createPortal(
        (() => {
          const ns = nsConfig.find(n => n.key === fullPreviewNs);
          if (!ns) return null;
          const records = ns.records;
          const rawCols = getFullCols(records);
          const cols = ns.key === 'transactions'
            ? ['date', 'description', 'amount', 'mapping', 'accountId', 'category', ...rawCols.filter(c => !['date', 'description', 'amount', 'mapping', 'accountId', 'category', 'billId', 'personId', 'isOther'].includes(c))]
            : rawCols;
          const colLabel = (c) => c === 'accountId' ? 'Account' : c === 'splits' ? 'Splits' : c === 'mapping' ? 'Mapped Target' : c;
          return (
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
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
                          <th key={col} className={`px-2.5 py-2 text-left font-semibold border-b border-r border-slate-800 whitespace-nowrap uppercase tracking-wide text-[9px] ${col === 'mapping' ? 'text-slate-300 min-w-[210px]' : 'text-slate-400'}`}>
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
                            <td key={col} className={`px-2.5 py-1.5 font-mono border-r border-slate-800/30 ${col === 'mapping' ? 'min-w-[210px]' : 'max-w-[180px]'}`}>
                              <div className={col === 'mapping' ? '' : 'truncate'}>{renderCell(rec, col, ns.key)}</div>
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
        })(),
        document.body
      )}
    </>
  );
}

