// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useBudgetMetadata } from '../../context/BudgetContext';
import { 
  Plus, 
  Trash2, 
  Archive, 
  RotateCcw, 
  Filter, 
  Calendar, 
  Search, 
  Pencil, 
  Tag, 
  AlertTriangle, 
  CheckCircle2, 
  DollarSign, 
  Clock, 
  Receipt,
  X,
  CreditCard,
  Users
} from 'lucide-react';
import { MONTH_SHORT_NAMES, getBillDueMonths, formatBillDueMonths } from '../../utils/paydayUtils';
import { BillEditorModal } from './BillEditorModal';

/**
 * Clean, scannable Bills & Splits management panel.
 * Replaces high-density inline table inputs with read-optimized visual tokens,
 * statement alias pill tags, recurrence badges, and segmented earner split indicators.
 * Provides unified modal editing for adding and updating bills.
 */
export function BillsSplitsPanel() {
  const {
    budget,
    addBill,
    updateBill,
    deleteBill,
    archiveBill,
    unarchiveBill,
    getBillMonthlyCost
  } = useBudgetMetadata();

  // Filter & Search state
  const [billFilterTab, setBillFilterTab] = useState('active');
  const [selectedBillsAccountId, setSelectedBillsAccountId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('add'); // 'add' | 'edit'
  const [editingBill, setEditingBill] = useState(null);
  const [deleteConfirmBill, setDeleteConfirmBill] = useState(null);

  // Active wage earners (non-credit role)
  const allEarners = useMemo(() => {
    return (budget?.people || []).filter(p => 
      p.name.toLowerCase() !== 'credit' && p.role !== 'Credit'
    );
  }, [budget?.people]);

  // Filtered bills list
  const filteredBills = useMemo(() => {
    return (budget?.bills || []).filter(bill => {
      // Tab filter
      if (billFilterTab === 'active' && bill.isArchived) return false;
      if (billFilterTab === 'archived' && !bill.isArchived) return false;

      // Account filter
      if (selectedBillsAccountId !== 'all' && bill.accountId !== selectedBillsAccountId) return false;

      // Search query filter (matches name, aliases, account name, notes)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const bName = (bill.name || '').toLowerCase();
        const bAliases = (bill.bankMatchNames || bill.matchingKey || '').toLowerCase();
        const bNotes = (bill.notes || '').toLowerCase();
        const acc = (budget?.accounts || []).find(a => a.id === bill.accountId);
        const aName = (acc?.name || '').toLowerCase();

        const matches = bName.includes(query) ||
                        bAliases.includes(query) ||
                        bNotes.includes(query) ||
                        aName.includes(query);
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => (a.dueDay || 1) - (b.dueDay || 1));
  }, [budget?.bills, budget?.accounts, billFilterTab, selectedBillsAccountId, searchQuery]);

  // KPI Vitals metrics
  const activeBills = useMemo(() => {
    return (budget?.bills || []).filter(b => !b.isArchived);
  }, [budget?.bills]);

  const archivedBills = useMemo(() => {
    return (budget?.bills || []).filter(b => b.isArchived);
  }, [budget?.bills]);

  const totalActiveMonthlyCost = useMemo(() => {
    return activeBills.reduce((sum, b) => sum + getBillMonthlyCost(b), 0);
  }, [activeBills, getBillMonthlyCost]);

  const accountsInUseCount = useMemo(() => {
    const accIds = new Set(activeBills.map(b => b.accountId).filter(Boolean));
    return accIds.size;
  }, [activeBills]);

  // Check split integrity for all active bills
  const unbalancedBills = useMemo(() => {
    return activeBills.filter(bill => {
      const splits = bill.splits || {};
      const total = Object.values(splits).reduce((s, val) => s + (parseFloat(val) || 0), 0);
      return Math.abs(total - 100) > 0.5;
    });
  }, [activeBills]);

  // Modal Open Handlers
  const handleOpenAddModal = () => {
    setEditingBill(null);
    setEditorMode('add');
    setIsEditorModalOpen(true);
  };

  const handleOpenEditModal = (bill) => {
    setEditingBill(bill);
    setEditorMode('edit');
    setIsEditorModalOpen(true);
  };

  const handleSaveBill = (payload) => {
    if (editorMode === 'edit' && editingBill?.id) {
      updateBill(editingBill.id, payload);
    } else {
      addBill(payload);
    }
  };

  const handleDeleteBill = (billId) => {
    deleteBill(billId);
    setDeleteConfirmBill(null);
  };

  // Helper: Format Ordinal Day
  const getOrdinalDay = (n) => {
    const day = parseInt(n, 10) || 1;
    const s = ['th', 'st', 'nd', 'rd'];
    const v = day % 100;
    return day + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Helper: Format Money
  const fmtMoney = (amount) => {
    return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper: Recurrence Badge Styling
  const getRecurrenceBadge = (bill) => {
    const period = bill.period || 'Monthly';
    if (period === 'Monthly') {
      return { label: 'Monthly', badgeClass: 'bg-blue-950/80 border-blue-800/60 text-blue-300' };
    }
    if (period === 'Quarterly') {
      const dueMonths = getBillDueMonths(bill);
      const mNames = dueMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ');
      return { label: `Quarterly (${mNames})`, badgeClass: 'bg-purple-950/80 border-purple-800/60 text-purple-300' };
    }
    if (period === 'Semi-Annual') {
      const dueMonths = getBillDueMonths(bill);
      const mNames = dueMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ');
      return { label: `Semi-Annual (${mNames})`, badgeClass: 'bg-indigo-950/80 border-indigo-800/60 text-indigo-300' };
    }
    if (period === 'Annual') {
      const dueMonths = getBillDueMonths(bill);
      const mNames = dueMonths.map(m => MONTH_SHORT_NAMES[m - 1]).join(', ') || 'Jan';
      return { label: `Annual (${mNames})`, badgeClass: 'bg-amber-950/80 border-amber-800/60 text-amber-300' };
    }
    return { label: `Custom (${formatBillDueMonths(bill)})`, badgeClass: 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' };
  };

  // Earner color mapping for segmented progress bars
  const earnerColorPalette = [
    { bg: 'bg-purple-500', text: 'text-purple-300', border: 'border-purple-800/60', badgeBg: 'bg-purple-950/70' },
    { bg: 'bg-emerald-500', text: 'text-emerald-300', border: 'border-emerald-800/60', badgeBg: 'bg-emerald-950/70' },
    { bg: 'bg-cyan-500', text: 'text-cyan-300', border: 'border-cyan-800/60', badgeBg: 'bg-cyan-950/70' },
    { bg: 'bg-amber-500', text: 'text-amber-300', border: 'border-amber-800/60', badgeBg: 'bg-amber-950/70' },
    { bg: 'bg-rose-500', text: 'text-rose-300', border: 'border-rose-800/60', badgeBg: 'bg-rose-950/70' }
  ];

  return (
    <div className="space-y-2.5 animate-fade-in text-slate-100">
      
      {/* 1. KPI Vitals & Metric Strip (Compact) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Total Monthly Obligation */}
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block truncate">Monthly Total</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-emerald-400 block truncate">
              {fmtMoney(totalActiveMonthlyCost)}
            </span>
          </div>
        </div>

        {/* Active Bills Count */}
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
            <Receipt className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block truncate">Active Bills</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-blue-400 block truncate">
              {activeBills.length} <span className="text-[10px] text-slate-500 font-normal">({archivedBills.length} arch)</span>
            </span>
          </div>
        </div>

        {/* Accounts In Use */}
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0">
            <CreditCard className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block truncate">Accounts Linked</span>
            <span className="text-xs sm:text-sm font-bold font-mono text-indigo-300 block truncate">
              {accountsInUseCount} <span className="text-[10px] text-slate-500 font-normal">of {budget?.accounts?.length || 0}</span>
            </span>
          </div>
        </div>

        {/* Split Integrity Health */}
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            unbalancedBills.length === 0
              ? 'bg-emerald-950/80 border border-emerald-800/60 text-emerald-400'
              : 'bg-rose-950/80 border border-rose-800/60 text-rose-400'
          }`}>
            {unbalancedBills.length === 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider block truncate">Splits Health</span>
            <span className={`text-xs font-bold font-mono block truncate ${
              unbalancedBills.length === 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {unbalancedBills.length === 0 ? '100% Balanced' : `${unbalancedBills.length} Unbalanced`}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Control Bar: Filter Tabs, Search & Add Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-0.5 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {/* Active / Archived Toggle */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setBillFilterTab('active')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                billFilterTab === 'active'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active ({activeBills.length})
            </button>
            <button
              type="button"
              onClick={() => setBillFilterTab('archived')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                billFilterTab === 'archived'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Archived ({archivedBills.length})
            </button>
          </div>

          {/* Real-time Search Input */}
          <div className="relative flex-1 min-w-[170px] max-w-xs">
            <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search bills, aliases..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-6 py-1 text-[11px] bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Account Filter Dropdown */}
          <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800 text-[11px] shrink-0">
            <Filter className="w-3 h-3 text-blue-400" />
            <select
              value={selectedBillsAccountId}
              onChange={e => setSelectedBillsAccountId(e.target.value)}
              className="bg-transparent text-[11px] font-semibold text-slate-200 focus:outline-none cursor-pointer py-0.5"
            >
              <option value="all" className="bg-slate-900 text-slate-100 py-1">All Accounts ({activeBills.length})</option>
              {budget?.accounts?.map(acc => {
                const count = activeBills.filter(b => b.accountId === acc.id).length;
                return (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100 py-1">
                    {acc.name} ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Primary CTA: Add Bill */}
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="flex items-center justify-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Bill</span>
        </button>
      </div>

      {/* 3. Scannable Read-Optimized Data Table with Sticky Header & Always Visible Scrollbar */}
      <div className="overflow-auto matrix-scrollbar max-h-[calc(100vh-270px)] rounded-xl border border-slate-800 bg-slate-950/60 shadow-md">
        <table className="w-full min-w-[920px] text-left text-[11px] text-slate-300">
          <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 uppercase font-semibold text-[9px] tracking-wider border-b border-slate-800 shadow-sm">
            <tr>
              <th className="px-2.5 py-1.5 min-w-[180px] w-[22%]">Bill Name &amp; Details</th>
              <th className="px-2 py-1.5 min-w-[140px] w-[16%]">Statement Aliases</th>
              <th className="px-2 py-1.5 min-w-[100px] w-[12%]">Scheduled Amount</th>
              <th className="px-2 py-1.5 min-w-[120px] w-[13%]">Due Date &amp; Recurrence</th>
              <th className="px-2 py-1.5 min-w-[170px] w-[18%]">Funding Account</th>
              <th className="px-2 py-1.5 min-w-[150px] w-[14%]">Earner Split (%)</th>
              <th className="px-2.5 py-1.5 min-w-[60px] w-[5%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filteredBills.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  <Receipt className="w-6 h-6 mx-auto mb-1.5 text-slate-600 opacity-60" />
                  <p className="text-xs font-semibold text-slate-400">No {billFilterTab} bills found</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {searchQuery ? `No bills matched "${searchQuery}". Try clearing your search.` : 'Click "+ Add Bill" to create your first scheduled bill.'}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-2 px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Clear Search
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filteredBills.map(bill => {
                const acc = (budget?.accounts || []).find(a => a.id === bill.accountId);
                const monthlyCost = getBillMonthlyCost(bill);
                const isNonMonthly = bill.period && bill.period !== 'Monthly';
                const recurrence = getRecurrenceBadge(bill);

                // Parse statement aliases
                const rawAliases = bill.bankMatchNames ?? bill.matchingKey ?? '';
                const aliases = typeof rawAliases === 'string'
                  ? rawAliases.split(',').map(s => s.trim()).filter(Boolean)
                  : [];

                // Active earners calculation for split rendering
                const allEnabledIds = acc?.enabledEarners && Array.isArray(acc.enabledEarners) && acc.enabledEarners.length > 0
                  ? acc.enabledEarners
                  : (budget?.people || []).map(p => p.id);

                const activeEarners = (budget?.people || []).filter(p =>
                  allEnabledIds.includes(p.id) &&
                  p.name.toLowerCase() !== 'credit' &&
                  p.role !== 'Credit'
                );

                const currentSplits = {};
                activeEarners.forEach(p => {
                  currentSplits[p.id] = bill.splits?.[p.id] !== undefined
                    ? parseFloat(bill.splits[p.id])
                    : 0;
                });

                const activeTotal = activeEarners.reduce((s, p) => s + (currentSplits[p.id] || 0), 0);
                const totalIsOff = Math.abs(activeTotal - 100) > 0.5;

                return (
                  <tr
                    key={bill.id}
                    onClick={() => handleOpenEditModal(bill)}
                    className="hover:bg-slate-900/80 transition-colors cursor-pointer group"
                  >
                    {/* 1. Bill Name & Details */}
                    <td className="px-2.5 py-1.5 min-w-[180px]">
                      <div className="font-bold text-slate-100 text-xs group-hover:text-blue-400 transition-colors truncate" title={bill.name}>
                        {bill.name}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                        {bill.paymentSource && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-slate-800/90 text-slate-300 border border-slate-700/60">
                            {bill.paymentSource}
                          </span>
                        )}
                        {bill.notes && (
                          <span className="text-slate-500 italic truncate max-w-[120px] text-[10px]" title={bill.notes}>
                            {bill.notes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Statement Aliases Tags */}
                    <td className="px-2 py-1.5 min-w-[140px]">
                      {aliases.length === 0 ? (
                        <span className="text-slate-600 font-mono text-[10px] italic">—</span>
                      ) : (
                        <div className="flex items-center flex-wrap gap-1">
                          {aliases.slice(0, 2).map((alias, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-950/70 border border-blue-800/60 text-blue-300 truncate max-w-[130px]"
                              title={alias}
                            >
                              {alias}
                            </span>
                          ))}
                          {aliases.length > 2 && (
                            <span
                              className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-800 border border-slate-700 text-slate-400"
                              title={aliases.slice(2).join(', ')}
                            >
                              +{aliases.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 3. Scheduled Amount & Monthly Equivalent */}
                    <td className="px-2 py-1.5 min-w-[100px] font-mono">
                      <span className="text-slate-100 font-bold text-xs">
                        {fmtMoney(bill.amount)}
                      </span>
                      {isNonMonthly && (
                        <span className="text-[9px] text-slate-400 block font-sans">
                          ~{fmtMoney(monthlyCost)} / mo
                        </span>
                      )}
                    </td>

                    {/* 4. Due Date & Recurrence */}
                    <td className="px-2 py-1.5 min-w-[120px]">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-200">
                        <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{getOrdinalDay(bill.dueDay)} of mo</span>
                      </div>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-semibold border ${recurrence.badgeClass}`}>
                        {recurrence.label}
                      </span>
                    </td>

                    {/* 5. Assigned Account */}
                    <td className="px-2 py-1.5 min-w-[170px]">
                      {acc ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          <span className="font-semibold text-slate-200 truncate max-w-[145px]" title={acc.name}>
                            {acc.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Unassigned</span>
                      )}
                    </td>

                    {/* 6. Compact Earner Split Indicator */}
                    <td className="px-2 py-1.5 min-w-[150px]">
                      <div className="space-y-1 min-w-[130px]">
                        {/* Segmented multi-earner progress bar */}
                        <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden flex">
                          {activeEarners.map((person, idx) => {
                            const pct = currentSplits[person.id] || 0;
                            if (pct <= 0) return null;
                            const palette = earnerColorPalette[idx % earnerColorPalette.length];
                            return (
                              <div
                                key={person.id}
                                style={{ width: `${pct}%` }}
                                className={`h-full ${palette.bg}`}
                                title={`${person.name}: ${pct}%`}
                              />
                            );
                          })}
                        </div>

                        {/* Earner Ratio Pills + Total Validation */}
                        <div className="flex items-center gap-1 flex-wrap text-[9px]">
                          {activeEarners.map((person, idx) => {
                            const pct = currentSplits[person.id] || 0;
                            const palette = earnerColorPalette[idx % earnerColorPalette.length];
                            return (
                              <span
                                key={person.id}
                                className={`px-1 py-0.2 rounded border font-mono font-bold ${palette.badgeBg} ${palette.border} ${palette.text}`}
                              >
                                {person.name.split(' ')[0]}: {pct}%
                              </span>
                            );
                          })}

                          {totalIsOff && (
                            <span className="px-1 py-0.2 rounded font-mono font-bold bg-rose-950/80 border border-rose-800 text-rose-300" title="Splits do not sum to 100%">
                              ⚠ {Math.round(activeTotal)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 7. Row Actions */}
                    <td className="px-2.5 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(bill)}
                          className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Edit Bill Details"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => bill.isArchived ? unarchiveBill(bill.id) : archiveBill(bill.id)}
                          className="p-1 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title={bill.isArchived ? 'Unarchive Bill' : 'Archive Bill'}
                        >
                          {bill.isArchived ? <RotateCcw className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmBill(bill)}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Delete Bill"
                        >
                          <Trash2 className="w-3 h-3" />
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

      {/* 4. Delete Confirmation Dialog */}
      {deleteConfirmBill && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmBill(null);
          }}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-4 sm:p-5 shadow-2xl space-y-3 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="w-8 h-8 rounded-xl bg-rose-950/60 border border-rose-800 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Delete Scheduled Bill?</h3>
                <p className="text-[11px] text-slate-400">Permanently remove this bill record.</p>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 font-mono text-xs space-y-0.5">
              <p className="text-slate-200 font-bold">{deleteConfirmBill.name}</p>
              <p className="text-slate-400 text-[11px]">Scheduled Amount: {fmtMoney(deleteConfirmBill.amount)}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmBill(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBill(deleteConfirmBill.id)}
                className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                Delete Bill
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 5. Unified Bill Editor Modal (Add & Edit) */}
      <BillEditorModal
        isOpen={isEditorModalOpen}
        onClose={() => setIsEditorModalOpen(false)}
        bill={editingBill}
        mode={editorMode}
        budget={budget}
        onSave={handleSaveBill}
        onDelete={handleDeleteBill}
      />

    </div>
  );
}
