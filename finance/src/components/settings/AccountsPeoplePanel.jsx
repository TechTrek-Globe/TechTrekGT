// @ts-nocheck
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBudgetMetadata, useLedgerDataDispatch } from '../../context/BudgetContext';
import { 
  Plus, 
  Trash2, 
  RotateCcw, 
  CreditCard, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Upload, 
  FileSpreadsheet, 
  Loader2, 
  X,
  Target,
  PiggyBank,
  Sparkles,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../../utils/spreadsheetParser';
import { detectFileType, parseGenericFlat, autoMatchColumns, applyTransactionMapping } from '../../utils/importer';
import { fmtMoney } from '../../utils/formatters';
import { 
  getPersonBillMonthlyPortionForAccount, 
  getPersonBillPerPaycheckPortionForAccount, 
  getPersonDepositAmountForAccount, 
  getPersonExtraSavingsDepositAmountForAccount 
} from '../../utils/paydayUtils';
import { logTransaction } from '../../utils/logger';

export function AccountsPeoplePanel() {
  const {
    budget,
    addAccount,
    updateAccount,
    deleteAccount,
    addPerson,
    updatePerson,
    deletePerson,
    updateBill
  } = useBudgetMetadata();

  const {
    importSpreadsheetSelective,
    clearAccountTransactions
  } = useLedgerDataDispatch();

  // Modals & form state
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isAddPersonModalOpen, setIsAddPersonModalOpen] = useState(false);
  const [allocEditingPerson, setAllocEditingPerson] = useState(null);
  const [clearAccId, setClearAccId] = useState('');
  const [isClearAccConfirmOpen, setIsClearAccConfirmOpen] = useState(false);
  const [clearAccStatus, setClearAccStatus] = useState(null);

  const [newAccForm, setNewAccForm] = useState({
    name: '',
    type: 'checking',
    startingBalance: 0,
    startDate: '2026-01-01',
    saveExtraMonthly: 0,
    enableExtraSavings: true,
    color: 'blue',
    notes: ''
  });

  const getAccountEffectiveStartDate = useCallback((acc) => {
    if (acc.startDate) return acc.startDate;
    if (acc.balanceAsOfDate) return acc.balanceAsOfDate;
    if (acc.importedLedgerRows && typeof acc.importedLedgerRows === 'object') {
      const dates = Object.keys(acc.importedLedgerRows).sort();
      if (dates.length > 0) return dates[0];
    }
    return '2026-01-01';
  }, []);

  const handleAccountDateChange = useCallback((accId, newDate) => {
    if (!newDate) return;
    const targetAcc = budget.accounts.find(a => a.id === accId);
    if (!targetAcc) return;

    updateAccount(accId, {
      startDate: newDate,
      balanceAsOfDate: newDate
    });
  }, [budget.accounts, updateAccount]);

  const handleAccountTotalBalanceChange = useCallback((accId, newTotalVal) => {
    const targetAcc = budget.accounts.find(a => a.id === accId);
    if (!targetAcc) return;
    const newTotal = parseFloat(newTotalVal) || 0;
    const extraBal = targetAcc.enableExtraSavings !== false ? (parseFloat(targetAcc.extraStartingBalance) || 0) : 0;
    let newStartingBalance = newTotal;
    if (extraBal > 0) {
      newStartingBalance = Math.round((newTotal - extraBal) * 100) / 100;
    }

    const patches = {
      startingBalance: newStartingBalance
    };

    // If account has importedLedgerRows, synchronize all entries with the new baseline
    if (targetAcc.importedLedgerRows && typeof targetAcc.importedLedgerRows === 'object') {
      const dates = Object.keys(targetAcc.importedLedgerRows).sort();
      const firstDate = dates[0];
      const currentReg = parseFloat(targetAcc.startingBalance) || 0;
      const deltaReg = Math.round((newStartingBalance - currentReg) * 100) / 100;

      if (deltaReg !== 0) {
        const updatedImportRows = {};
        for (const [dKey, rData] of Object.entries(targetAcc.importedLedgerRows)) {
          if (!rData || typeof rData !== 'object') {
            updatedImportRows[dKey] = rData;
            continue;
          }
          if (dKey === firstDate) {
            updatedImportRows[dKey] = {
              ...rData,
              regBeg: newStartingBalance,
              totalBeg: Math.round((newStartingBalance + extraBal) * 100) / 100,
              regEnding: Math.round(((rData.regEnding ?? newStartingBalance) + deltaReg) * 100) / 100,
              totalEnding: Math.round((((rData.regEnding ?? newStartingBalance) + deltaReg) + (rData.extraEnding ?? extraBal)) * 100) / 100
            };
          } else {
            const nextRegBeg = rData.regBeg !== undefined ? Math.round((rData.regBeg + deltaReg) * 100) / 100 : rData.regBeg;
            const nextRegEnd = rData.regEnding !== undefined ? Math.round((rData.regEnding + deltaReg) * 100) / 100 : rData.regEnding;
            updatedImportRows[dKey] = {
              ...rData,
              regBeg: nextRegBeg,
              totalBeg: (nextRegBeg !== undefined && rData.extraBeg !== undefined) ? Math.round((nextRegBeg + rData.extraBeg) * 100) / 100 : rData.totalBeg,
              regEnding: nextRegEnd,
              totalEnding: (nextRegEnd !== undefined && rData.extraEnding !== undefined) ? Math.round((nextRegEnd + rData.extraEnding) * 100) / 100 : rData.totalEnding
            };
          }
        }
        patches.importedLedgerRows = updatedImportRows;
      }
    }

    updateAccount(accId, patches);
  }, [budget.accounts, updateAccount]);

  const [newPersonForm, setNewPersonForm] = useState({
    name: '',
    role: 'Member',
    payFrequency: 'bi-weekly',
    grossPerPay: 0,
    netPerPay: 0,
    payDay1: 15,
    payDay2: 'last',
    payOffsetDays: 0
  });

  // Account creation spreadsheet import state
  const [accImportPayload, setAccImportPayload] = useState(null);
  const [accImportStatus, setAccImportStatus] = useState(null);
  const [accImportError, setAccImportError] = useState('');
  const [isAccImporting, setIsAccImporting] = useState(false);
  const accFileInputRef = useRef(null);
  const addAccountModalRef = useRef(null);
  const addPersonModalRef = useRef(null);

  useEffect(() => {
    if (!clearAccId && budget.accounts?.length > 0) {
      setClearAccId(budget.accounts[0].id);
    }
  }, [budget.accounts, clearAccId]);

  const handleAccFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAccImportError('');
    setIsAccImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const previewRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      const firstHeaderRow = previewRows.find(r => r && r.some(c => String(c).toLowerCase().includes('date'))) || [];
      const sampleHeaders = firstHeaderRow.map(c => String(c).trim());

      const detected = detectFileType(file.name, wb.SheetNames, sampleHeaders);
      if (detected === 'emory_parc') {
        const res = parseSpreadsheet(arrayBuffer, file.name, budget.bills || []);
        if (!res.success) throw new Error(res.error || 'Failed to parse workbook.');
        const matchingAcc = res.budget?.accounts?.[0];
        const txns = res.budget?.transactions || [];
        setAccImportPayload({
          records: txns,
          importedLedgerRows: matchingAcc?.importedLedgerRows || {},
        });
        setNewAccForm(prev => ({
          ...prev,
          name: prev.name || matchingAcc?.name || file.name.replace(/\.[^/.]+$/, ''),
        }));
        logTransaction('PARSE_ACC_TXNS', `Parsed ${txns.length} transactions from "${file.name}" for account setup`, {
          fileName: file.name,
          txnCount: txns.length,
          type: 'emory_parc'
        });
        setAccImportStatus({
          fileName: file.name,
          count: txns.length,
        });
      } else {
        const { headers, rows } = parseGenericFlat(arrayBuffer);
        if (headers.length === 0) throw new Error('No valid columns found.');
        const { mapping } = autoMatchColumns(headers, 'transactions');
        const { records, importedLedgerRows } = applyTransactionMapping(rows, mapping);
        setAccImportPayload({
          records,
          importedLedgerRows,
        });
        setNewAccForm(prev => ({
          ...prev,
          name: prev.name || file.name.replace(/\.[^/.]+$/, ''),
        }));
        logTransaction('PARSE_ACC_TXNS', `Parsed ${records.length} transactions from flat file "${file.name}"`, {
          fileName: file.name,
          txnCount: records.length,
          type: 'generic_flat'
        });
        setAccImportStatus({
          fileName: file.name,
          count: records.length,
        });
      }
    } catch (err) {
      setAccImportError(err.message || 'Failed to parse file.');
    } finally {
      setIsAccImporting(false);
      e.target.value = '';
    }
  };

  const handleClearAccountData = (accId) => {
    if (!accId) return;
    logTransaction('USER_INITIATE_CLEAR_ACCOUNT', `User confirmed transaction purge for account ${accId}`, { accountId: accId });
    const ok = clearAccountTransactions(accId);
    if (ok) {
      setClearAccStatus({ type: 'success', message: 'Transactions cleared and account reset to initial starting balance.' });
    } else {
      setClearAccStatus({ type: 'error', message: 'Failed to clear transactions.' });
    }
    setIsClearAccConfirmOpen(false);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Clear Account Confirm Alert Modal */}
      {isClearAccConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Clear Account History?</h3>
                <p className="text-xs text-slate-400">This will wipe transactions &amp; imported history for this account.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              Account: <strong className="text-slate-100">{budget.accounts.find(a => a.id === clearAccId)?.name || clearAccId}</strong>
              <br />
              Starting balance will remain preserved. All imported rows and ledger entries will be erased.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAccConfirmOpen(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleClearAccountData(clearAccId)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}

      {clearAccStatus && (
        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
          clearAccStatus.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <span>{clearAccStatus.message}</span>
          <button onClick={() => setClearAccStatus(null)} className="text-slate-400 hover:text-white font-bold text-xs ml-3">✕</button>
        </div>
      )}

      {/* Accounts Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <h3 className="text-base font-semibold text-slate-100 tracking-tight">
              Active Household Accounts ({budget.accounts.length})
            </h3>
          </div>
          <p className="text-xs text-slate-400 pl-10">
            Set up starting balances, initial dates, and extra savings goals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddAccountModalOpen(true)}
          className="self-start sm:self-center flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Account</span>
        </button>
      </div>

      {/* Pop-up Modal: Add New Account */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div
            ref={addAccountModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-modal-title"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="add-account-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400">
                  <Plus className="w-4 h-4" />
                </div>
                Add New Account
              </h3>
              <button
                type="button"
                onClick={() => setIsAddAccountModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!newAccForm.name) return;
              const newAccId = `acc-${Date.now()}`;
              const impRows = accImportPayload?.importedLedgerRows || {};
              const hasImpRows = Object.keys(impRows).length > 0;

              addAccount({
                ...newAccForm,
                id: newAccId,
                importedLedgerRows: impRows,
                ledgerMode: hasImpRows ? 'import' : 'manual'
              });

              if (accImportPayload?.records && accImportPayload.records.length > 0) {
                importSpreadsheetSelective({
                  namespaces: { transactions: true },
                  strategies: { transactions: 'merge' },
                  data: {
                    targetAccountId: newAccId,
                    transactions: accImportPayload.records,
                    importedLedgerRows: impRows,
                  }
                });
              }

              setNewAccForm({ name: '', type: 'checking', startingBalance: 0, startDate: '2026-01-01', saveExtraMonthly: 0, enableExtraSavings: true, color: 'blue', notes: '' });
              setAccImportPayload(null);
              setAccImportStatus(null);
              setAccImportError('');
              setIsAddAccountModalOpen(false);
            }} className="space-y-4">
              {/* Initial Spreadsheet / CSV Upload Dropzone */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Initial Spreadsheet / Bank CSV (Optional)</span>
                  </label>
                  {accImportStatus && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccImportPayload(null);
                        setAccImportStatus(null);
                        setAccImportError('');
                      }}
                      className="text-[10px] text-slate-400 hover:text-rose-400 font-semibold cursor-pointer"
                    >
                      Remove file
                    </button>
                  )}
                </div>

                <input
                  ref={accFileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleAccFileUpload}
                  className="hidden"
                />

                {accImportStatus ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-white block truncate">{accImportStatus.fileName}</span>
                      <span className="text-[11px] text-emerald-400/90">
                        {accImportStatus.count} transactions parsed &bull; auto-bound to this new account
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => accFileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900/50 hover:bg-slate-900 cursor-pointer transition-all text-xs text-slate-400 hover:text-slate-200"
                  >
                    {isAccImporting ? (
                      <div className="flex items-center gap-2 text-indigo-300">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing spreadsheet...</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-indigo-400" />
                        <span>Click to upload <strong className="text-slate-300">.csv</strong> or <strong className="text-slate-300">.xlsx</strong> to auto-fill</span>
                      </>
                    )}
                  </div>
                )}

                {accImportError && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{accImportError}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Account Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. USAA Bills Checking - 7071"
                  value={newAccForm.name}
                  onChange={e => setNewAccForm({ ...newAccForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Account Type</label>
                  <select
                    value={newAccForm.type}
                    onChange={e => setNewAccForm({ ...newAccForm, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="checking">Checking Account</option>
                    <option value="savings">Savings Account</option>
                    <option value="credit">Credit Card Account</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Initial Start Date</label>
                  <input
                    type="date"
                    value={newAccForm.startDate || '2026-01-01'}
                    onChange={e => setNewAccForm({ ...newAccForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Total Starting Bal ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newAccForm.startingBalance || ''}
                    onChange={e => setNewAccForm({ ...newAccForm, startingBalance: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chk-new-extra"
                    checked={newAccForm.enableExtraSavings !== false}
                    onChange={e => setNewAccForm({ ...newAccForm, enableExtraSavings: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="chk-new-extra" className="text-xs font-medium text-slate-300 cursor-pointer">
                    Track Extra Savings Bucket
                  </label>
                </div>

                {newAccForm.enableExtraSavings !== false && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <div>
                      <label className="block text-xs font-medium text-indigo-300 mb-1">Save Extra Target ($/mo)</label>
                      <input
                        type="number"
                        step="10"
                        placeholder="0"
                        value={newAccForm.saveExtraMonthly || 0}
                        onChange={e => setNewAccForm({ ...newAccForm, saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Extra Current Balance ($)</label>
                      <p className="text-xs text-slate-500 italic">Derived from transaction history</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAccImportPayload(null);
                    setAccImportStatus(null);
                    setAccImportError('');
                    setIsAddAccountModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* High-Density Accounts Table */}
      <div className="overflow-x-auto matrix-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
            <tr>
              <th className="px-3 py-2 w-[18%]">Account Name</th>
              <th className="px-2 py-2 w-[10%]">Type</th>
              <th className="px-2 py-2 w-[13%]">Start Date</th>
              <th className="px-2 py-2 w-[14%]">Total Starting Bal</th>
              <th className="px-2 py-2 w-[17%]">Extra Savings Goal</th>
              <th className="px-2 py-2 w-[24%]">Active Earners &amp; Savings Split</th>
              <th className="px-3 py-2 w-[4%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {budget.accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-500 italic text-xs">No accounts found.</td>
              </tr>
            ) : (
              budget.accounts.map(acc => {
                const enabledList = (acc.enabledEarners && Array.isArray(acc.enabledEarners))
                  ? acc.enabledEarners
                  : budget.people.map(person => person.id);

                return (
                  <tr key={acc.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-3 py-1.5 font-bold text-slate-200">
                      <input
                        type="text"
                        value={acc.name}
                        onChange={e => updateAccount(acc.id, { name: e.target.value })}
                        className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none w-full text-xs font-bold text-slate-100"
                        placeholder="Account Name"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={acc.type}
                        onChange={e => updateAccount(acc.id, { type: e.target.value })}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-1.5 py-0.5 text-slate-300 text-xs font-medium focus:border-blue-500 focus:outline-none cursor-pointer w-full"
                      >
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                        <option value="credit">Credit Card</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-0.5 text-xs">
                        <input
                          type="date"
                          value={getAccountEffectiveStartDate(acc)}
                          onChange={e => handleAccountDateChange(acc.id, e.target.value)}
                          className="w-full bg-transparent text-slate-200 font-mono text-[11px] focus:outline-none cursor-pointer"
                          title="Initial Setup Start Date"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-800 rounded-lg px-1.5 py-0.5 text-xs">
                        <span className="text-[10px] text-slate-500 font-mono">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={Math.round(((parseFloat(acc.startingBalance) || 0) + (acc.enableExtraSavings !== false ? (parseFloat(acc.extraStartingBalance) || 0) : 0)) * 100) / 100}
                          onChange={e => handleAccountTotalBalanceChange(acc.id, e.target.value)}
                          className="w-20 bg-transparent text-blue-300 font-mono font-bold text-xs focus:outline-none text-right"
                          title={
                            acc.enableExtraSavings !== false && (parseFloat(acc.extraStartingBalance) || 0) > 0
                              ? `Total Starting Balance: $${(((parseFloat(acc.startingBalance) || 0) + (parseFloat(acc.extraStartingBalance) || 0))).toFixed(2)} (Reg: $${(parseFloat(acc.startingBalance) || 0).toFixed(2)} + Extra: $${(parseFloat(acc.extraStartingBalance) || 0).toFixed(2)})`
                              : "Total Starting Balance"
                          }
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={acc.enableExtraSavings !== false}
                          onClick={() => updateAccount(acc.id, { enableExtraSavings: acc.enableExtraSavings === false })}
                          className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${acc.enableExtraSavings !== false ? 'bg-emerald-600' : 'bg-slate-700'}`}
                          title="Toggle Extra Savings Goal"
                        >
                          <span
                            className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${acc.enableExtraSavings !== false ? 'translate-x-2.5' : 'translate-x-0.5'} mt-0.5`}
                          />
                        </button>
                        {acc.enableExtraSavings !== false ? (
                          <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-800 rounded-lg px-1.5 py-0.5 text-xs">
                            <span className="text-[10px] text-slate-500 font-mono">$</span>
                            <input
                              type="number"
                              step="10"
                              value={acc.saveExtraMonthly || 0}
                              onChange={e => updateAccount(acc.id, { saveExtraMonthly: parseFloat(e.target.value) || 0 })}
                              className="w-14 bg-transparent text-emerald-400 font-mono font-bold text-xs focus:outline-none text-right"
                            />
                            <span className="text-[9px] text-slate-500">/mo</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Off</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto py-0.5">
                        {budget.people.map(p => {
                          const isChecked = enabledList.includes(p.id);
                          const isCredit = p.name.toLowerCase() === 'credit' || p.role === 'Credit';
                          const activeNonCredits = budget.people.filter(pe => enabledList.includes(pe.id) && pe.name.toLowerCase() !== 'credit' && pe.role !== 'Credit');
                          const defaultSplit = isCredit ? 0 : (100 / Math.max(1, activeNonCredits.length));
                          const currentVal = acc.saveExtraSplits?.[p.id] !== undefined
                            ? parseFloat(acc.saveExtraSplits[p.id])
                            : Math.round(defaultSplit * 10) / 10;
                          const showSplitInput = isChecked && acc.enableExtraSavings !== false && parseFloat(acc.saveExtraMonthly) > 0;

                          return (
                            <div
                              key={p.id}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
                                isChecked
                                  ? 'bg-purple-950/70 border-purple-600/60 text-purple-200'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-500 opacity-50 hover:opacity-90'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  let updated;
                                  if (isChecked) {
                                    if (enabledList.length <= 1) return;
                                    updated = enabledList.filter(id => id !== p.id);
                                  } else {
                                    updated = [...enabledList, p.id];
                                  }
                                  updateAccount(acc.id, { enabledEarners: updated });

                                  // Propagate earner change to all bills assigned to this account
                                  const activePeopleIds = updated.filter(id => {
                                    const person = budget.people.find(pe => pe.id === id);
                                    return person && person.name.toLowerCase() !== 'credit' && person.role !== 'Credit';
                                  });
                                  const billsForAccount = budget.bills.filter(b => b.accountId === acc.id && !b.isArchived);
                                  billsForAccount.forEach(b => {
                                    const count = activePeopleIds.length;
                                    if (count === 0) return;
                                    const evenSplit = Math.round((100 / count) * 100) / 100;
                                    const newSplits = {};
                                    budget.people.forEach(pe => { newSplits[pe.id] = 0; });
                                    activePeopleIds.forEach((id, idx) => {
                                      // Last person gets remainder to ensure exact 100%
                                      if (idx === count - 1) {
                                        const soFar = activePeopleIds.slice(0, -1).reduce((s, pid) => s + (newSplits[pid] || 0), 0);
                                        newSplits[id] = Math.round((100 - soFar) * 100) / 100;
                                      } else {
                                        newSplits[id] = evenSplit;
                                      }
                                    });
                                    updateBill(b.id, { splits: newSplits });
                                  });
                                }}
                                className="flex items-center gap-1 cursor-pointer hover:text-white"
                                title={isChecked ? `Click to exclude ${p.name}` : `Click to include ${p.name}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-purple-400' : 'bg-slate-600'}`} />
                                <span>{p.name.split(' ')[0]}</span>
                                {!showSplitInput && <span className="text-[10px]">{isChecked ? '✓' : '—'}</span>}
                              </button>

                              {showSplitInput && (
                                <div className="inline-flex items-center gap-0.5 pl-1.5 border-l border-purple-800/60">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={currentVal}
                                    onChange={e => {
                                      const val = e.target.value.replace(/[^0-9.]/g, '');
                                      const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
                                      const activeEarners = budget.people.filter(pe => enabledList.includes(pe.id));
                                      let nextSplits = { ...(acc.saveExtraSplits || {}) };
                                      if (activeEarners.length === 2) {
                                        const other = activeEarners.find(pe => pe.id !== p.id);
                                        nextSplits[p.id] = num;
                                        if (other) nextSplits[other.id] = Math.max(0, 100 - num);
                                      } else {
                                        nextSplits[p.id] = num;
                                      }
                                      updateAccount(acc.id, { saveExtraSplits: nextSplits });
                                    }}
                                    className="w-8 text-center font-mono font-bold text-emerald-400 bg-slate-900/90 rounded px-1 py-0 border border-purple-500/40 focus:border-emerald-400 focus:outline-none text-xs"
                                  />
                                  <span className="text-purple-300 text-[10px] font-bold">%</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setClearAccId(acc.id);
                            setIsClearAccConfirmOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-950/40 rounded transition-colors cursor-pointer"
                          title={`Clear all transactions and reset balance for ${acc.name}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAccount(acc.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                          title="Delete Account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* SETUP: EARNERS */}
      <div className="space-y-3 pt-3">
        {/* Earners Header & Action Bar */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-slate-100">
              Household Earners ({budget.people.length})
            </h3>
            <span className="text-[11px] text-slate-400 hidden sm:inline">&bull; Configure incomes and pay frequency schedules</span>
          </div>
          <button
            type="button"
            onClick={() => setIsAddPersonModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>
        </div>

        {/* Pop-up Modal: Add New Person */}
        {isAddPersonModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
            <div
              ref={addPersonModalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-person-modal-title"
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 id="add-person-modal-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center text-purple-400">
                    <Plus className="w-4 h-4" />
                  </div>
                  Add Household Earner
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddPersonModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                if (!newPersonForm.name) return;
                addPerson(newPersonForm);
                setNewPersonForm({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
                setIsAddPersonModalOpen(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name / Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Taylor Swift"
                    value={newPersonForm.name}
                    onChange={e => setNewPersonForm({ ...newPersonForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Role / Description</label>
                    <input
                      type="text"
                      placeholder="Primary / Secondary"
                      value={newPersonForm.role}
                      onChange={e => setNewPersonForm({ ...newPersonForm, role: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Pay Frequency</label>
                    <select
                      value={newPersonForm.payFrequency}
                      onChange={e => setNewPersonForm({ ...newPersonForm, payFrequency: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                    >
                      <option value="bi-weekly">Bi-weekly (26/yr)</option>
                      <option value="semi-monthly">Semi-Monthly (24/yr)</option>
                      <option value="monthly">Monthly (12/yr)</option>
                      <option value="weekly">Weekly (52/yr)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Gross Per Pay ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={newPersonForm.grossPerPay}
                      onChange={e => setNewPersonForm({ ...newPersonForm, grossPerPay: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Net Per Pay ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={newPersonForm.netPerPay}
                      onChange={e => setNewPersonForm({ ...newPersonForm, netPerPay: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddPersonModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                  >
                    Add Earner
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* High-Density Earners Table */}
        <div className="overflow-x-auto matrix-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 uppercase font-medium text-[9px] border-b border-slate-800">
              <tr>
                <th className="px-3 py-2 w-[24%]">Member Name</th>
                <th className="px-3 py-2 w-[18%]">Pay Frequency</th>
                <th className="px-3 py-2 w-[15%]">Gross / Pay ($)</th>
                <th className="px-3 py-2 w-[15%]">Net / Pay ($)</th>
                <th className="px-3 py-2 w-[22%]">Account Goals / Allocations</th>
                <th className="px-3 py-2 w-[6%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {budget.people.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500 italic text-xs">No earners found.</td>
                </tr>
              ) : (
                budget.people.map(person => {
                  const allocCount = person.accountAllocations && typeof person.accountAllocations === 'object'
                    ? Object.values(person.accountAllocations).filter(v => parseFloat(v) > 0 || v === 'remaining').length
                    : 0;

                  return (
                    <tr key={person.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-3 py-1.5 font-bold text-slate-200">
                        <input
                          type="text"
                          value={person.name}
                          onChange={e => updatePerson(person.id, { name: e.target.value })}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-purple-500 focus:outline-none w-full text-xs font-bold text-slate-100"
                          placeholder="Member Name"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={person.payFrequency}
                          onChange={e => updatePerson(person.id, { payFrequency: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:border-purple-500 focus:outline-none cursor-pointer"
                        >
                          <option value="bi-weekly">Bi-weekly (26/yr)</option>
                          <option value="semi-monthly">Semi-Monthly (24/yr)</option>
                          <option value="monthly">Monthly (12/yr)</option>
                          <option value="weekly">Weekly (52/yr)</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={person.grossPerPay}
                            onChange={e => updatePerson(person.id, { grossPerPay: parseFloat(e.target.value) || 0 })}
                            className="w-20 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:border-purple-500 focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-1.5 font-mono">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-emerald-500 font-bold">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={person.netPerPay}
                            onChange={e => updatePerson(person.id, { netPerPay: parseFloat(e.target.value) || 0 })}
                            className="w-20 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-bold font-mono text-xs focus:border-purple-500 focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => setAllocEditingPerson(person)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border border-purple-800/50 hover:border-purple-700 transition-all cursor-pointer"
                          title="Configure Direct Deposit Allocations & Funding Goals"
                        >
                          <Target className="w-3.5 h-3.5 text-purple-400" />
                          <span>{allocCount > 0 ? `${allocCount} Goal${allocCount > 1 ? 's' : ''} Set` : 'Set Goals / Allocations'}</span>
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => deletePerson(person.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                          title="Delete Member"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Direct Deposit & Goal Allocation Modal */}
        {allocEditingPerson && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span>Account Funding Goals & Allocations</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-950 border border-purple-800 text-purple-300 font-normal font-mono">
                        {allocEditingPerson.name} ({allocEditingPerson.payFrequency})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Set target deposit goals per account. Projected bills are paid first, and any extra automatically flows to savings.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAllocEditingPerson(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Net Pay Overview Bar */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between font-mono text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-sans uppercase">Net Pay / Paycheck</span>
                  <span className="text-emerald-400 font-bold text-sm">{fmtMoney(allocEditingPerson.netPerPay)}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] font-sans uppercase">Total Monthly Net</span>
                  <span className="text-slate-200 font-bold text-sm">
                    {fmtMoney(
                      allocEditingPerson.payFrequency === 'semi-monthly' ? allocEditingPerson.netPerPay * 2 :
                      allocEditingPerson.payFrequency === 'bi-weekly' ? (allocEditingPerson.netPerPay * 26) / 12 :
                      allocEditingPerson.payFrequency === 'weekly' ? (allocEditingPerson.netPerPay * 52) / 12 :
                      allocEditingPerson.netPerPay
                    )}
                    <span className="text-[10px] text-slate-400 font-normal"> / mo</span>
                  </span>
                </div>
              </div>

              {/* Account Allocation Rows */}
              <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
                {(budget.accounts || []).map(acc => {
                  const currentAllocations = allocEditingPerson.accountAllocations || {};
                  const rawVal = currentAllocations[acc.id];
                  const billPortionMonthly = getPersonBillMonthlyPortionForAccount(allocEditingPerson, acc.id, budget);
                  const billPortionPerPay = getPersonBillPerPaycheckPortionForAccount(allocEditingPerson, acc.id, budget);
                  const depositAmt = getPersonDepositAmountForAccount(allocEditingPerson, acc.id, budget);
                  const extraBufferAmt = getPersonExtraSavingsDepositAmountForAccount(allocEditingPerson, acc.id, budget);
                  const isRemaining = rawVal === 'remaining';
                  const hasExplicitNumber = !isRemaining && rawVal !== undefined && rawVal !== null && rawVal !== '' && parseFloat(rawVal) > 0;

                  const handleValueChange = (newVal) => {
                    const updated = { ...currentAllocations };
                    if (newVal === '' || newVal === undefined || newVal === null) {
                      delete updated[acc.id];
                    } else if (newVal === 'remaining') {
                      updated[acc.id] = 'remaining';
                    } else {
                      const num = parseFloat(newVal);
                      if (isNaN(num) || num < 0) {
                        delete updated[acc.id];
                      } else {
                        updated[acc.id] = num;
                      }
                    }
                    updatePerson(allocEditingPerson.id, { accountAllocations: updated });
                    setAllocEditingPerson(prev => prev ? { ...prev, accountAllocations: updated } : prev);
                  };

                  return (
                    <div key={acc.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700/80 transition-all space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full bg-${acc.color || 'blue'}-500`} />
                          <span className="font-bold text-slate-100 text-xs">{acc.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded uppercase">{acc.type}</span>
                        </div>
                        <div className="text-right font-mono text-[11px]">
                          <span className="text-slate-400">Projected Bills: </span>
                          <span className="text-slate-200 font-semibold">{fmtMoney(billPortionPerPay)}</span>
                          <span className="text-[10px] text-slate-500"> / pay ({fmtMoney(billPortionMonthly)}/mo)</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-850">
                        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                          <label className="text-[11px] font-medium text-slate-300 shrink-0">Goal / Allocation:</label>
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">$</span>
                            <input
                              type="number"
                              step="0.01"
                              disabled={isRemaining}
                              placeholder={billPortionPerPay > 0 ? `${billPortionPerPay.toFixed(2)} (dynamic)` : '0.00'}
                              value={isRemaining ? '' : (rawVal ?? '')}
                              onChange={e => handleValueChange(e.target.value)}
                              className="w-full pl-6 pr-2 py-1 bg-slate-900 border border-slate-700/70 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-purple-500 disabled:opacity-50"
                            />
                          </div>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleValueChange(billPortionPerPay > 0 ? billPortionPerPay : '')}
                            className="px-2 py-1 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                            title="Set allocation exactly equal to current projected bills"
                          >
                            Exact Bills
                          </button>
                          <button
                            type="button"
                            onClick={() => handleValueChange(isRemaining ? '' : 'remaining')}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer border ${
                              isRemaining 
                                ? 'bg-purple-600 text-white border-purple-500' 
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                            title="Assign all remaining unallocated net pay to this account"
                          >
                            Remaining
                          </button>
                          <button
                            type="button"
                            onClick={() => handleValueChange('')}
                            className="px-2 py-1 rounded text-[10px] font-medium bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                            title="Clear custom allocation and dynamically track bill splits"
                          >
                            Clear (Auto)
                          </button>
                        </div>
                      </div>

                      {/* Live Auto-Buffer Savings Badge */}
                      <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                        <div className="flex items-center gap-1.5">
                          {extraBufferAmt > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                              <PiggyBank className="w-3 h-3 text-emerald-400" />
                              <span>+{fmtMoney(extraBufferAmt)} / pay ({fmtMoney(allocEditingPerson.payFrequency === 'semi-monthly' ? extraBufferAmt * 2 : (extraBufferAmt * 26) / 12)}/mo) → Auto Extra Savings</span>
                            </span>
                          ) : hasExplicitNumber && depositAmt < billPortionPerPay ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/50 border border-amber-800/40 px-2 py-0.5 rounded-md text-[10px]">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              <span>Funding Shortfall: -{fmtMoney(billPortionPerPay - depositAmt)} / pay</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 text-[10px]">
                              <Check className="w-3 h-3 text-slate-500" />
                              <span>100% covers projected bills</span>
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px]">Total Deposit: </span>
                          <span className="text-purple-300 font-bold">{fmtMoney(depositAmt)}</span>
                          <span className="text-[10px] text-slate-500"> / pay</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <p className="text-[11px] text-slate-400">
                  Changes save automatically and update all Dashboard & Transaction projections.
                </p>
                <button
                  type="button"
                  onClick={() => setAllocEditingPerson(null)}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
