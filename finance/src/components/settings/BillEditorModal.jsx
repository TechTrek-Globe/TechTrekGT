// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Plus, 
  Trash2, 
  Calendar, 
  Tag, 
  Percent, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  HelpCircle,
  Users
} from 'lucide-react';
import { MONTH_SHORT_NAMES, getBillDueMonths } from '../../utils/paydayUtils';

/**
 * Unified modal dialog for creating new bills and editing existing bills.
 * Portaled to document.body to ensure perfect viewport centering above all layout wrappers.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 * @param {object|null} props.bill - Null for 'add' mode, bill object for 'edit' mode
 * @param {'add'|'edit'} [props.mode='add']
 * @param {object} props.budget - Budget state containing accounts and people
 * @param {function} props.onSave - Callback with bill data payload
 * @param {function} [props.onDelete] - Optional callback to delete bill
 */
export function BillEditorModal({
  isOpen,
  onClose,
  bill = null,
  mode = 'add',
  budget,
  onSave,
  onDelete
}) {
  const modalRef = useRef(null);
  const aliasInputRef = useRef(null);

  // Parse initial aliases from bankMatchNames / matchingKey
  const initialAliases = useMemo(() => {
    const raw = bill?.bankMatchNames ?? bill?.matchingKey ?? '';
    if (!raw || typeof raw !== 'string') return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }, [bill]);

  // Form State
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [period, setPeriod] = useState('Monthly');
  const [accountId, setAccountId] = useState('');
  const [dueDay, setDueDay] = useState(1);
  const [dueMonths, setDueMonths] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [paymentSource, setPaymentSource] = useState('Auto Pay');
  const [notes, setNotes] = useState('');
  const [aliasTags, setAliasTags] = useState([]);
  const [aliasInput, setAliasInput] = useState('');
  const [splits, setSplits] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Active household earners for the selected account
  const activeEarners = useMemo(() => {
    if (!budget?.people || budget.people.length === 0) return [];
    const acc = budget.accounts?.find(a => a.id === accountId);
    const allEnabledIds = acc?.enabledEarners && Array.isArray(acc.enabledEarners) && acc.enabledEarners.length > 0
      ? acc.enabledEarners
      : budget.people.map(p => p.id);

    const filtered = budget.people.filter(p =>
      allEnabledIds.includes(p.id) &&
      p.name.toLowerCase() !== 'credit' &&
      p.role !== 'Credit'
    );

    if (filtered.length > 0) return filtered;
    const nonCredit = budget.people.filter(p => p.name.toLowerCase() !== 'credit' && p.role !== 'Credit');
    return nonCredit.length > 0 ? nonCredit : budget.people;
  }, [budget?.people, budget?.accounts, accountId]);

  // Populate state whenever modal opens or bill changes
  useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      return;
    }

    if (mode === 'edit' && bill) {
      setName(bill.name || '');
      setAmount(bill.amount !== undefined ? bill.amount : 0);
      setPeriod(bill.period || 'Monthly');
      setAccountId(bill.accountId || budget?.accounts?.[0]?.id || '');
      setDueDay(bill.dueDay || 1);
      setDueMonths(getBillDueMonths(bill));
      setPaymentSource(bill.paymentSource || 'Auto Pay');
      setNotes(bill.notes || '');
      setAliasTags(initialAliases);
      setAliasInput('');

      // Initialize splits with existing bill splits
      const billSplits = bill.splits || {};
      const newSplits = {};
      activeEarners.forEach(p => {
        if (billSplits[p.id] !== undefined) {
          newSplits[p.id] = parseFloat(billSplits[p.id]) || 0;
        } else {
          newSplits[p.id] = activeEarners.length > 0 ? Math.round(100 / activeEarners.length) : 0;
        }
      });
      setSplits(newSplits);
    } else {
      // 'add' mode defaults
      const defaultAccId = budget?.accounts?.[0]?.id || '';
      setName('');
      setAmount(0);
      setPeriod('Monthly');
      setAccountId(defaultAccId);
      setDueDay(1);
      setDueMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      setPaymentSource('Auto Pay');
      setNotes('');
      setAliasTags([]);
      setAliasInput('');

      // Equal split among active earners
      const newSplits = {};
      const count = activeEarners.length || 1;
      activeEarners.forEach(p => {
        newSplits[p.id] = Math.round((100 / count) * 10) / 10;
      });
      if (activeEarners.length === 2) {
        newSplits[activeEarners[0].id] = 50;
        newSplits[activeEarners[1].id] = 50;
      }
      setSplits(newSplits);
    }
  }, [isOpen, mode, bill, budget?.accounts, initialAliases, activeEarners]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDeleteConfirm, onClose]);

  // Recurrence Period change handler
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === 'Monthly') {
      setDueMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    } else if (newPeriod === 'Quarterly') {
      setDueMonths([1, 4, 7, 10]);
    } else if (newPeriod === 'Semi-Annual') {
      setDueMonths([1, 7]);
    } else if (newPeriod === 'Annual') {
      setDueMonths(dueMonths.length > 0 ? [dueMonths[0]] : [1]);
    } else if (newPeriod === 'Custom' || newPeriod === 'Specific Months') {
      if (!dueMonths || dueMonths.length === 0) {
        setDueMonths([1]);
      }
    }
  };

  // Toggle specific due month in interactive 12-month selector
  const toggleDueMonth = (mNum) => {
    let updated;
    if (dueMonths.includes(mNum)) {
      if (dueMonths.length === 1) return;
      updated = dueMonths.filter(m => m !== mNum);
    } else {
      updated = [...dueMonths, mNum].sort((a, b) => a - b);
    }
    setDueMonths(updated);

    // Auto-detect period if month set changes
    if (updated.length === 12) {
      setPeriod('Monthly');
    } else if (updated.length === 4 && JSON.stringify(updated) === JSON.stringify([1, 4, 7, 10])) {
      setPeriod('Quarterly');
    } else if (updated.length === 2 && JSON.stringify(updated) === JSON.stringify([1, 7])) {
      setPeriod('Semi-Annual');
    } else if (updated.length === 1) {
      setPeriod('Annual');
    } else {
      setPeriod('Custom');
    }
  };

  // Alias tagger functions
  const handleAddAlias = (rawInput) => {
    const cleaned = rawInput.trim().replace(/^[,]+|[,]+$/g, '');
    if (!cleaned) return;
    const pieces = cleaned.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const updated = [...aliasTags];
    pieces.forEach(p => {
      if (!updated.includes(p)) {
        updated.push(p);
      }
    });
    setAliasTags(updated);
    setAliasInput('');
  };

  const handleRemoveAlias = (tagToRemove) => {
    setAliasTags(aliasTags.filter(t => t !== tagToRemove));
  };

  const handleAliasKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddAlias(aliasInput);
    } else if (e.key === 'Backspace' && !aliasInput && aliasTags.length > 0) {
      setAliasTags(aliasTags.slice(0, -1));
    }
  };

  // Split calculation & auto-balancing
  const handleSplitChange = (personId, newPct) => {
    const num = Math.max(0, Math.min(100, parseFloat(newPct) || 0));
    const next = { ...splits };
    next[personId] = num;

    // Two-earner auto-balance
    if (activeEarners.length === 2) {
      const other = activeEarners.find(p => p.id !== personId);
      if (other) {
        next[other.id] = Math.round(Math.max(0, 100 - num) * 100) / 100;
      }
    }
    setSplits(next);
  };

  // Equalize splits across all active earners
  const handleSplitEvenly = () => {
    if (activeEarners.length === 0) return;
    const count = activeEarners.length;
    const evenVal = Math.round((100 / count) * 10) / 10;
    const next = {};
    activeEarners.forEach((p, idx) => {
      if (idx === count - 1) {
        const soFar = (count - 1) * evenVal;
        next[p.id] = Math.round((100 - soFar) * 10) / 10;
      } else {
        next[p.id] = evenVal;
      }
    });
    setSplits(next);
  };

  // Split total and balance validation
  const splitTotal = useMemo(() => {
    return activeEarners.reduce((sum, p) => sum + (parseFloat(splits[p.id]) || 0), 0);
  }, [activeEarners, splits]);

  const isSplitBalanced = Math.abs(splitTotal - 100) <= 0.5;

  // Normalized monthly equivalent calculation for preview
  const monthlyEquivalent = useMemo(() => {
    const amt = Math.abs(parseFloat(amount) || 0);
    if (period === 'Semi-Annual') return amt / 6;
    if (period === 'Annual') return amt / 12;
    if (period === 'Quarterly') return amt / 3;
    if (period === 'Weekly') return (amt * 52) / 12;
    if (period === 'Custom' || period === 'Specific Months') {
      const count = Array.isArray(dueMonths) && dueMonths.length > 0 ? dueMonths.length : 12;
      return (amt * count) / 12;
    }
    return amt;
  }, [amount, period, dueMonths]);

  // Form submission handler
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isSplitBalanced) return;

    // Flush any pending alias text
    let finalAliases = [...aliasTags];
    if (aliasInput.trim()) {
      const extra = aliasInput.trim().split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      extra.forEach(x => {
        if (!finalAliases.includes(x)) finalAliases.push(x);
      });
    }

    const aliasString = finalAliases.join(', ');

    const payload = {
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      period,
      accountId,
      dueDay: parseInt(dueDay, 10) || 1,
      dueMonths,
      paymentSource,
      notes: notes.trim(),
      matchingKey: aliasString,
      bankMatchNames: aliasString,
      splits
    };

    onSave(payload);
    onClose();
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-editor-title"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[90vh] overflow-y-auto my-auto text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
              mode === 'edit'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {mode === 'edit' ? <FileText className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="bill-editor-title" className="text-sm font-bold text-slate-100">
                  {mode === 'edit' ? 'Edit Bill & Split Schedule' : 'Add New Scheduled Bill'}
                </h3>
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  mode === 'edit' ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {mode === 'edit' ? 'Edit' : 'New'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Configure billing details, statement auto-matching aliases, and earner splits
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close dialog (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Delete Confirmation Banner */}
        {showDeleteConfirm && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 space-y-2 text-rose-200 animate-fade-in">
            <div className="flex items-center gap-2 text-[11px] font-bold text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Permanently delete this bill?</span>
            </div>
            <p className="text-[11px] text-rose-200/90 font-mono">
              Bill: "{name || bill?.name}" &bull; ${(parseFloat(amount) || 0).toFixed(2)}
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  if (onDelete && bill?.id) {
                    onDelete(bill.id);
                  }
                  onClose();
                }}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm shadow-rose-600/20"
              >
                Yes, Delete
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* SECTION 1: IDENTITY & STATEMENT ALIASES */}
          <div className="space-y-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              <FileText className="w-3 h-3" />
              <span>Bill Identity &amp; Bank Matching</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                Bill Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Comcast High-Speed Internet"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus={mode === 'add'}
              />
            </div>

            {/* Interactive Statement Aliases Tagger */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-blue-400" />
                  <span>Statement Aliases (Bank Match Names)</span>
                </label>
                <span className="text-[9px] text-blue-400 font-mono">Enter or comma to add</span>
              </div>

              {/* Tag Badges Container */}
              <div className="min-h-[34px] p-1 bg-slate-900 border border-slate-700 rounded-lg flex items-center flex-wrap gap-1 focus-within:border-blue-500 transition-colors">
                {aliasTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-950/80 border border-blue-700/60 text-blue-300 shadow-sm"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(tag)}
                      className="text-blue-400 hover:text-blue-200 transition-colors cursor-pointer"
                      title={`Remove alias ${tag}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  ref={aliasInputRef}
                  type="text"
                  placeholder={aliasTags.length === 0 ? "Type statement keywords e.g. COMCAST..." : "Add keyword..."}
                  value={aliasInput}
                  onChange={e => setAliasInput(e.target.value)}
                  onKeyDown={handleAliasKeyDown}
                  onBlur={() => {
                    if (aliasInput.trim()) handleAddAlias(aliasInput);
                  }}
                  className="flex-1 min-w-[120px] px-1.5 py-0.5 bg-transparent text-[11px] text-slate-100 font-mono focus:outline-none placeholder:text-slate-500 placeholder:italic"
                />
              </div>

              <p className="text-[10px] text-slate-500 mt-1">
                Used by spreadsheet importer to automatically match bank statement lines to this bill.
              </p>
            </div>
          </div>

          {/* SECTION 2: FINANCIAL SCHEDULE & RECURRENCE */}
          <div className="space-y-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              <Calendar className="w-3 h-3" />
              <span>Cost, Frequency &amp; Account</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                  Scheduled Amount ($)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-[11px] text-slate-500 font-mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount || ''}
                    onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono font-bold focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                {period !== 'Monthly' && monthlyEquivalent > 0 && (
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">
                    ~${monthlyEquivalent.toFixed(2)}/mo
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                  Billing Recurrence
                </label>
                <select
                  value={period}
                  onChange={e => handlePeriodChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Semi-Annual">Semi-Annual</option>
                  <option value="Annual">Annual</option>
                  <option value="Custom">Custom Months</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                  Due Day of Month
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={e => setDueDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono font-bold focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* 12-Month Interactive Due Month Selector */}
            <div className="pt-1.5 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-slate-300">
                  Due Months <span className="text-emerald-400 font-mono">({dueMonths.length}/12)</span>
                </label>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <button
                    type="button"
                    onClick={() => handlePeriodChange('Monthly')}
                    className="text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer underline"
                  >
                    All
                  </button>
                  <span className="text-slate-600">&bull;</span>
                  <button
                    type="button"
                    onClick={() => handlePeriodChange('Quarterly')}
                    className="text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer underline"
                  >
                    Quarterly
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                {MONTH_SHORT_NAMES.map((mName, idx) => {
                  const mNum = idx + 1;
                  const isSelected = dueMonths.includes(mNum);
                  return (
                    <button
                      key={mNum}
                      type="button"
                      onClick={() => toggleDueMonth(mNum)}
                      className={`py-1 px-0.5 rounded text-[10px] font-bold text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                          : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      {mName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account and Payment Source */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                  Funding Account <span className="text-rose-400">*</span>
                </label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                >
                  {budget?.accounts?.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type || 'Checking'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
                  Payment Method
                </label>
                <select
                  value={paymentSource}
                  onChange={e => setPaymentSource(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                >
                  <option value="Auto Pay">Auto Pay</option>
                  <option value="Manual">Manual</option>
                  <option value="Direct Debit">Direct Debit</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 3: EARNER SPLIT ALLOCATION */}
          <div className="space-y-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                <Percent className="w-3 h-3" />
                <span>Household Earner Split Allocation</span>
              </div>
              <button
                type="button"
                onClick={handleSplitEvenly}
                className="text-[10px] text-purple-400 hover:text-purple-300 font-medium underline transition-colors cursor-pointer"
              >
                Split Evenly (50/50)
              </button>
            </div>

            {/* Split Sliders and Inputs */}
            <div className="space-y-2">
              {activeEarners.map(person => {
                const currentPct = splits[person.id] !== undefined ? parseFloat(splits[person.id]) : 0;
                const personMonthlyPortion = (monthlyEquivalent * currentPct) / 100;

                return (
                  <div key={person.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-purple-400" />
                        <span>{person.name}</span>
                      </span>
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-400 font-mono text-[10px]">
                          ${personMonthlyPortion.toFixed(2)}/mo
                        </span>
                        <div className="flex items-center gap-0.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={currentPct}
                            onChange={e => handleSplitChange(person.id, e.target.value)}
                            className="w-12 px-1 py-0.5 text-center font-mono font-bold text-[11px] bg-slate-950 border border-slate-700 rounded text-purple-300 focus:border-purple-500 focus:outline-none"
                          />
                          <span className="text-slate-500 text-[10px] font-bold">%</span>
                        </div>
                      </div>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={currentPct}
                      onChange={e => handleSplitChange(person.id, e.target.value)}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                );
              })}
            </div>

            {/* Live Split Total & Validation Banner */}
            <div className={`p-2 rounded-lg flex items-center justify-between text-[11px] font-mono ${
              isSplitBalanced
                ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/60 border border-rose-800 text-rose-300'
            }`}>
              <div className="flex items-center gap-1.5">
                {isSplitBalanced ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
                <span className="font-sans font-semibold">
                  {isSplitBalanced ? 'Splits Balanced:' : 'Must Total 100%:'}
                </span>
              </div>
              <span className="font-bold text-xs">
                {Math.round(splitTotal * 10) / 10}%
              </span>
            </div>
          </div>

          {/* SECTION 4: NOTES */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">
              Notes &amp; Contract Details (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Account # 12345, Contract renewed Jan 2026"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            {mode === 'edit' && onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isSplitBalanced || !name.trim()}
                className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer ${
                  isSplitBalanced && name.trim()
                    ? mode === 'edit'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                }`}
              >
                {mode === 'edit' ? 'Save Changes' : 'Create Bill'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
