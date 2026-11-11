import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, Receipt, Plus, ArrowRight, CheckCircle2, Trash2, Edit2,
  RefreshCw, Users, CreditCard, Sparkles, Plane, Building, Train, 
  Utensils, ShoppingBag, ShoppingCart, Globe, AlertCircle, ArrowUpRight, ArrowDownLeft, RotateCcw, ShieldCheck, X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { getApiUrl } from '../../utils/api';
import { resilientFetch } from '../../utils/mutationQueue';
import { 
  convertCurrency, formatCurrency, splitEqually, calculateSettleUp, DEFAULT_EXCHANGE_RATES,
  buildNetFormula 
} from '../../utils/expenseLedger';
import { PersonBreakdownPanel } from './PersonBreakdownPanel.jsx';

// Map DB category values to display metadata (including legacy aliases)
const CATEGORY_MAP = {
  flight:    { label: 'Flights',    icon: Plane,       badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  lodging:   { label: 'Hotels',     icon: Building,    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  hotel:     { label: 'Hotels',     icon: Building,    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  transit:   { label: 'Rail/Trans', icon: Train,       badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  train:     { label: 'Rail/Trans', icon: Train,       badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  rail:      { label: 'Rail/Trans', icon: Train,       badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  dining:    { label: 'Dining',     icon: Utensils,    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  restaurant:{ label: 'Dining',     icon: Utensils,    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  market:    { label: 'Markets',    icon: ShoppingBag, badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  activity:  { label: 'Activities', icon: ShoppingBag, badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  excursion: { label: 'Activities', icon: ShoppingBag, badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  tour:      { label: 'Activities', icon: ShoppingBag, badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  other:     { label: 'Other',      icon: Receipt,     badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' }
};

const CATEGORIES = [
  { id: 'all',       label: 'All Categories' },
  { id: 'flight',    label: 'Flights',    icon: Plane,       badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { id: 'lodging',   label: 'Hotels',     icon: Building,    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { id: 'transit',   label: 'Rail/Trans', icon: Train,       badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { id: 'activity',  label: 'Activities', icon: ShoppingBag, badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  { id: 'dining',    label: 'Dining',     icon: Utensils,    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  { id: 'market',    label: 'Markets',    icon: ShoppingBag, badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  { id: 'other',     label: 'Other',      icon: Receipt,     badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' }
];

// Normalize category aliases for filtering
function normalizeCategory(cat) {
  const c = (cat || 'other').toLowerCase();
  if (c === 'hotel') return 'lodging';
  if (c === 'train' || c === 'rail') return 'transit';
  if (c === 'restaurant') return 'dining';
  if (c === 'excursion' || c === 'tour') return 'activity';
  return c;
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

const SETTLE_METHOD_MAP = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  zelle: 'Zelle',
  venmo: 'Venmo',
  apple_pay: 'Apple Pay',
  cash_app: 'Cash App',
  both_paid_separately: 'Both Paid Separately',
  paypal: 'PayPal',
  credit_card_split: 'Credit Card (Split at POS)',
  revolut_wise: 'Revolut / Wise',
  other: 'Other',
  apple_cash: 'Apple Pay',
  revolut: 'Revolut',
  blik: 'BLIK',
  transfer: 'Bank Transfer'
};

export function ExpenseLedger({ journeyId = 'poland-christmas-2026', agendaRole = null }) {
  const { user, isAuthenticated, setIsAuthModalOpen } = useAuth();
  const { settings, openSettings } = useSettings();
  const isViewer = agendaRole === 'viewer';
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Display currency from Settings (user sets it in the global Settings modal)
  const displayCurrency = settings.currency || 'USD';
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [activeTransferToSettle, setActiveTransferToSettle] = useState(null);
  const [activeItemToSettle, setActiveItemToSettle] = useState(null); // { expense, split }
  const [settleMethod, setSettleMethod] = useState('venmo');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Person-by-Person breakdown panel filter state
  const [activePersonId, setActivePersonId] = useState(null);
  const [personFilter, setPersonFilter] = useState(null); // null | 'paid_by' | 'owed_by' | 'settled'

  // Form state for new expense
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('dining');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState(displayCurrency);
  const [formPayer, setFormPayer] = useState('self');
  const [formSplitType, setFormSplitType] = useState('equal'); // 'equal' or 'self'
  const [formSite, setFormSite] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('');

  // Persistent Trip Payment Methods Store
  const [savedPaymentMethods, setSavedPaymentMethods] = useState(() => {
    try {
      const stored = localStorage.getItem(`wf_payment_methods_${journeyId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveTripPaymentMethod = useCallback((newMethod) => {
    const trimmed = (newMethod || '').trim();
    if (!trimmed) return;
    setSavedPaymentMethods(prev => {
      const exists = prev.some(m => m.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      const updated = [...prev, trimmed];
      try {
        localStorage.setItem(`wf_payment_methods_${journeyId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('[ExpenseLedger] failed to cache payment method:', e);
      }
      return updated;
    });
  }, [journeyId]);

  const removeTripPaymentMethod = useCallback((methodToRemove, e) => {
    if (e) e.stopPropagation();
    setSavedPaymentMethods(prev => {
      const updated = prev.filter(m => m.toLowerCase() !== methodToRemove.toLowerCase());
      try {
        localStorage.setItem(`wf_payment_methods_${journeyId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('[ExpenseLedger] failed to update cached payment methods:', e);
      }
      return updated;
    });
    if (formPaymentMethod.toLowerCase() === methodToRemove.toLowerCase()) {
      setFormPaymentMethod('');
    }
  }, [journeyId, formPaymentMethod]);

  // Combined list of trip payment methods (expenses + saved custom methods + defaults)
  const availablePaymentMethods = useMemo(() => {
    const baseDefaults = ['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'PayPal', 'Cash'];
    const fromExpenses = (expenses || [])
      .map(e => (e.payment_method || '').trim())
      .filter(Boolean);

    const merged = [];
    const seen = new Set();
    for (const m of [...savedPaymentMethods, ...fromExpenses, ...baseDefaults]) {
      const lower = m.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        merged.push(m);
      }
    }
    return merged;
  }, [expenses, savedPaymentMethods]);

  // Persistent Trip Booking Sites / Vendors Store
  const [savedBookingSites, setSavedBookingSites] = useState(() => {
    try {
      const stored = localStorage.getItem(`wf_booking_sites_${journeyId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveTripBookingSite = useCallback((newSite) => {
    const trimmed = (newSite || '').trim();
    if (!trimmed) return;
    setSavedBookingSites(prev => {
      const exists = prev.some(s => s.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      const updated = [...prev, trimmed];
      try {
        localStorage.setItem(`wf_booking_sites_${journeyId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('[ExpenseLedger] failed to cache booking site:', e);
      }
      return updated;
    });
  }, [journeyId]);

  const availableBookingSites = useMemo(() => {
    const baseDefaults = ['Booking.com', 'Hotels.com', 'Delta.com', 'PKP Intercity', 'GetYourGuide', 'On-Site'];
    const fromExpenses = (expenses || [])
      .map(e => (e.purchase_site || '').trim())
      .filter(Boolean);

    const merged = [];
    const seen = new Set();
    for (const s of [...savedBookingSites, ...fromExpenses, ...baseDefaults]) {
      const lower = s.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        merged.push(s);
      }
    }
    return merged;
  }, [expenses, savedBookingSites]);

  // Use real user.id (matches D1 stored user_id), with safe fallback
  const currentUserId = user?.id || user?.userId || 'usr-1785511589441-3fvgv';
  const currentUserName = user?.name || user?.email?.split('@')[0] || 'Jonathan Kemp';
  const partnerId = 'usr-ronald-few';
  const partnerName = 'Ronald Milton Few';

  const participants = useMemo(() => [
    { id: currentUserId, name: currentUserName },
    { id: partnerId, name: partnerName }
  ], [currentUserId, currentUserName]);

  // Load expenses from D1
  const loadExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/wayfinder/expenses?journey_id=${journeyId}`), {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExpenses(data.expenses || []);
      setSettlements(data.settlements || []);
    } catch (e) {
      console.warn('[ExpenseLedger] failed to fetch from backend:', e.message);
      setError('Unable to fetch remote expenses. Displaying offline workspace preview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [journeyId]);

  // Refresh expenses from server when offline mutations complete syncing
  useEffect(() => {
    const handleSyncComplete = (e) => {
      if (e.detail?.syncedCount > 0) {
        loadExpenses();
      }
    };
    window.addEventListener('wayfinder:sync-complete', handleSyncComplete);
    return () => window.removeEventListener('wayfinder:sync-complete', handleSyncComplete);
  }, [journeyId]);

  // Settle-up calculations
  const { balances, transfers, totalSpendByCurrency } = useMemo(() => {
    return calculateSettleUp(expenses, settlements, displayCurrency);
  }, [expenses, settlements, displayCurrency]);

  const userBalance = useMemo(() => {
    return balances.find(b => 
      b.id === currentUserId || 
      b.id === 'usr-1785511589441-3fvgv' || 
      b.name?.toLowerCase().includes('jon')
    ) || { paid: 0, owed: 0, net: 0 };
  }, [balances, currentUserId]);

  const totalExpeditionInDisplay = useMemo(() => {
    let sum = 0;
    for (const [cur, val] of Object.entries(totalSpendByCurrency)) {
      sum += convertCurrency(val, cur, displayCurrency);
    }
    return Math.round(sum * 100) / 100;
  }, [totalSpendByCurrency, displayCurrency]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    let result = selectedCategory === 'all' ? expenses : expenses.filter(e => normalizeCategory(e.category) === selectedCategory);
    if (personFilter === 'paid_by' && activePersonId) {
      result = result.filter(e => (e.paid_by_user_id || e.user_id) === activePersonId);
    } else if (personFilter === 'owed_by' && activePersonId) {
      result = result.filter(e => e.splits?.some(s => s.user_id === activePersonId && !s.is_settled));
    } else if (personFilter === 'settled') {
      result = result.filter(e => e.splits?.length > 0 && e.splits.every(s => Boolean(s.is_settled)));
    }
    return result;
  }, [expenses, selectedCategory, personFilter, activePersonId]);

  // Handle Preset Seed
  const handleSeedPresets = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(getApiUrl('/api/wayfinder/expenses/preset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ journey_id: journeyId })
      });
      if (!res.ok) throw new Error('Preset creation failed');
      await loadExpenses();
    } catch (e) {
      console.error(e);
      alert('Failed to load sample expenses: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Modal open handlers
  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormDesc('');
    setFormCategory('dining');
    setFormAmount('');
    setFormCurrency(displayCurrency);
    setFormPayer('self');
    setFormSplitType('equal');
    setFormSite('');
    setFormPaymentMethod('');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (exp) => {
    setEditingExpense(exp);
    setFormDesc(exp.description || '');
    setFormCategory(normalizeCategory(exp.category || 'dining'));
    setFormAmount(String(exp.amount_original || ''));
    setFormCurrency(exp.currency_original || displayCurrency);
    setFormSite(exp.purchase_site || '');
    setFormPaymentMethod(exp.payment_method || '');

    // Determine who paid
    const payerId = exp.paid_by_user_id || exp.user_id;
    if (payerId === currentUserId || exp.paid_by_name?.toLowerCase().includes('jon')) {
      setFormPayer('self');
    } else {
      setFormPayer('partner');
    }

    // Determine split type
    if (exp.splits && exp.splits.length === 1 && exp.splits[0].percentage === 100) {
      setFormSplitType('self');
    } else {
      setFormSplitType('equal');
    }

    setIsAddModalOpen(true);
  };

  // Handle Save Expense Submit (creates new or updates existing)
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!formDesc || !formAmount || Number(formAmount) <= 0) return;

    setIsSubmitting(true);
    try {
      const amt = Number(formAmount);
      let splits = [];

      if (formSplitType === 'equal') {
        splits = splitEqually(amt, participants);
      } else {
        // Paid for self only
        const payerObj = formPayer === 'self'
          ? { id: currentUserId, name: currentUserName }
          : { id: partnerId, name: partnerName };
        splits = [{ userId: payerObj.id, userName: payerObj.name, amountOwed: amt, percentage: 100 }];
      }

      const amtInUsd = convertCurrency(amt, formCurrency, 'USD');
      const payload = {
        journey_id: journeyId,
        description: formDesc.trim(),
        category: formCategory,
        amount_original: amt,
        currency_original: formCurrency,
        amount_usd: amtInUsd,
        paid_by_name: formPayer === 'self' ? currentUserName : partnerName,
        paid_by_user_id: formPayer === 'self' ? currentUserId : partnerId,
        purchase_site: formSite.trim() || null,
        payment_method: formPaymentMethod.trim() || null,
        splits: splits.map(s => ({
          user_id: s.userId,
          user_name: s.userName,
          amount_owed: s.amountOwed,
          percentage: s.percentage
        }))
      };

      const url = editingExpense
        ? getApiUrl(`/api/wayfinder/expenses/${editingExpense.id}`)
        : getApiUrl('/api/wayfinder/expenses');

      const res = await resilientFetch(url, {
        method: editingExpense ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      }, {
        entityType: 'expense',
        entityId: editingExpense?.id,
        action: `${editingExpense ? 'Edit' : 'Add'} expense: ${formDesc.trim()}`
      });

      if (!res.ok) {
        if (res.status === 401) { setIsAuthModalOpen(true); throw new Error('Session expired. Please sign in again.'); }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      if (formPaymentMethod.trim()) {
        saveTripPaymentMethod(formPaymentMethod.trim());
      }
      if (formSite.trim()) {
        saveTripBookingSite(formSite.trim());
      }
      setIsAddModalOpen(false);
      setEditingExpense(null);
      setFormDesc('');
      setFormAmount('');
      await loadExpenses();
    } catch (err) {
      alert(`Error saving expense: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Settle-Up Submit
  const handleSettleUp = async () => {
    if (!activeTransferToSettle) return;
    setIsSubmitting(true);
    try {
      const res = await resilientFetch(getApiUrl('/api/wayfinder/expenses/settle'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          journey_id: journeyId,
          from_user_id: activeTransferToSettle.fromUserId,
          from_user_name: activeTransferToSettle.fromUserName,
          to_user_id: activeTransferToSettle.toUserId,
          to_user_name: activeTransferToSettle.toUserName,
          amount: activeTransferToSettle.amount,
          currency: activeTransferToSettle.currency,
          method: settleMethod,
          notes: `Settled via ${SETTLE_METHOD_MAP[settleMethod] || settleMethod}`
        })
      }, {
        entityType: 'settlement',
        action: `Settle ${formatCurrency(activeTransferToSettle.amount, activeTransferToSettle.currency)} from ${activeTransferToSettle.fromUserName} to ${activeTransferToSettle.toUserName}`
      });

      if (!res.ok) {
        if (res.status === 401) { setIsAuthModalOpen(true); throw new Error('Session expired. Please sign in again.'); }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      setIsSettleModalOpen(false);
      setActiveTransferToSettle(null);
      await loadExpenses();
    } catch (e) {
      alert('Settlement recording error: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Item-by-Item Settle Submit
  const handleConfirmItemSettle = async () => {
    if (!activeItemToSettle) return;
    const { expense, split } = activeItemToSettle;
    setIsSubmitting(true);
    try {
      const fromUserId = split.user_id;
      const fromUserName = split.user_name || 'Member';
      const toUserId = expense.paid_by_user_id || expense.user_id;
      const toUserName = expense.paid_by_name || 'Member';

      const res = await resilientFetch(getApiUrl('/api/wayfinder/expenses/settle'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          journey_id: journeyId,
          from_user_id: fromUserId,
          from_user_name: fromUserName,
          to_user_id: toUserId,
          to_user_name: toUserName,
          amount: split.amount_owed,
          currency: expense.currency_original || 'USD',
          method: settleMethod,
          notes: `Settled ${expense.description}`,
          expense_id: expense.id,
          split_id: split.id
        })
      }, {
        entityType: 'settlement',
        action: `Settle item: ${expense.description} (${fromUserName})`
      });

      if (!res.ok) {
        if (res.status === 401) { setIsAuthModalOpen(true); throw new Error('Session expired. Please sign in again.'); }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      setActiveItemToSettle(null);
      await loadExpenses();
    } catch (e) {
      alert('Error settling item: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Undo Settlement for a specific split
  const handleUndoSplit = async (splitId, desc = 'item') => {
    if (!window.confirm(`Undo settlement for ${desc} and mark balance as owed?`)) return;
    setIsSubmitting(true);
    try {
      const res = await resilientFetch(getApiUrl(`/api/wayfinder/expenses/settle?split_id=${splitId}`), {
        method: 'DELETE',
        credentials: 'include'
      }, {
        entityType: 'settlement',
        action: `Undo settlement for ${desc}`
      });
      if (!res.ok) {
        if (res.status === 401) { setIsAuthModalOpen(true); throw new Error('Session expired. Please sign in again.'); }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      await loadExpenses();
    } catch (e) {
      alert('Error undoing settlement: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Undo / Delete recorded settlement
  const handleUndoSettlement = async (settlementId) => {
    if (!window.confirm('Undo and delete this settlement payment record?')) return;
    setIsSubmitting(true);
    try {
      const res = await resilientFetch(getApiUrl(`/api/wayfinder/expenses/settle?settlement_id=${settlementId}`), {
        method: 'DELETE',
        credentials: 'include'
      }, {
        entityType: 'settlement',
        action: 'Delete settlement record'
      });
      if (!res.ok) {
        if (res.status === 401) { setIsAuthModalOpen(true); throw new Error('Session expired. Please sign in again.'); }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      await loadExpenses();
    } catch (e) {
      alert('Error undoing settlement: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Expense
  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      const res = await resilientFetch(getApiUrl(`/api/wayfinder/expenses/${id}`), { 
        method: 'DELETE',
        credentials: 'include'
      }, {
        entityType: 'expense',
        entityId: id,
        action: 'Delete expense'
      });
      if (!res.ok) {
        if (res.status === 401) { setIsAuthModalOpen(true); throw new Error('Session expired. Please sign in again.'); }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      alert('Failed to delete expense: ' + e.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {isViewer && (
        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 text-sky-300 text-xs flex items-center space-x-2.5 shadow-sm">
          <ShieldCheck className="w-4 h-4 shrink-0 text-sky-400" />
          <span>Viewing shared expedition ledger with real-time currency conversion and 50/50 balance splits (read-only collaborator access).</span>
        </div>
      )}

      {/* Top Controls & Currency Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl glass-panel border border-amber-500/20 bg-slate-900/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center space-x-2.5">
            <Receipt className="w-6 h-6 text-amber-400" />
            <span>Shared Expense Ledger</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
            Multi-currency cost tracker with 50/50 splits and debt settle-up simplification.
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-center">
          {/* Display currency indicator - controlled via Settings */}
          <button
            type="button"
            onClick={openSettings}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-500/30 hover:border-amber-400 text-xs text-amber-300 font-bold transition-all cursor-pointer shadow-sm group"
            title="Click to change base currency in Settings"
          >
            <span className="text-slate-400 font-medium">Display:</span>
            <span className="font-mono text-white group-hover:text-amber-200">{displayCurrency}</span>
            <span className="text-amber-400/80 group-hover:text-amber-300 underline text-[11px] font-normal ml-0.5">(change in Settings)</span>
          </button>

          {!isViewer && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Expense</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Spend Card */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-white/10 bg-slate-900/60 space-y-1.5">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Expedition Spend</span>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {formatCurrency(totalExpeditionInDisplay, displayCurrency)}
          </div>
          <span className="text-[11px] text-slate-400">
            Across {expenses.length} recorded payments
          </span>
        </div>

        {/* You Paid Card */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-sky-500/20 bg-sky-950/20 space-y-1.5">
          <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">You Paid Out-of-Pocket</span>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {formatCurrency(userBalance.paid, displayCurrency)}
          </div>
          <span className="text-[11px] text-slate-400">
            {userBalance.settlementsPaid > 0
              ? `Direct bookings (excl. ${formatCurrency(userBalance.settlementsPaid, displayCurrency)} sent)`
              : 'Direct bookings & purchases'
            }
          </span>
        </div>

        {/* Your Share Card */}
        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-purple-500/20 bg-purple-950/20 space-y-1.5">
          <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Your Total Share</span>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {formatCurrency(userBalance.owed, displayCurrency)}
          </div>
          <span className="text-[11px] text-slate-400">Your split liability</span>
        </div>

        {/* Net Balance Card */}
        <div className={`p-4 sm:p-5 rounded-2xl glass-panel border space-y-1.5 ${
          userBalance.net > 0.01 
            ? 'border-emerald-500/30 bg-emerald-950/25' 
            : userBalance.net < -0.01 
            ? 'border-amber-500/30 bg-amber-950/25' 
            : 'border-white/10 bg-slate-900/60'
        }`}>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Your Net Balance</span>
          <div className={`text-2xl sm:text-3xl font-black ${
            userBalance.net > 0.01 ? 'text-emerald-400' : userBalance.net < -0.01 ? 'text-amber-400' : 'text-slate-300'
          }`}>
            {userBalance.net > 0.01 
              ? `+${formatCurrency(userBalance.net, displayCurrency)}` 
              : userBalance.net < -0.01 
              ? formatCurrency(userBalance.net, displayCurrency) 
              : formatCurrency(0, displayCurrency)}
          </div>
          <span className="text-[11px] font-medium text-slate-300">
            {userBalance.net > 0.01 
              ? 'You are owed money' 
              : userBalance.net < -0.01 
              ? 'You owe money to group' 
              : 'All debts are fully settled'}
          </span>
        </div>
      </div>

      {/* Debt Settle-Up Suggestion Banner */}
      {transfers.length > 0 && (
        <div className="p-5 rounded-2xl glass-panel border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-950 shadow-lg space-y-3">
          <div className="flex items-center space-x-2 text-amber-300">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-bold">Total Remaining Net Balance</h3>
          </div>
          <p className="text-xs text-slate-300">
            Outstanding balance across all bookings. You can settle individual bookings on each card below, or settle the total remaining balance:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {transfers.map(tx => (
              <div 
                key={tx.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between gap-3 shadow-inner"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white flex items-center space-x-1.5">
                      <span className="text-amber-300">{tx.fromUserName}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-emerald-400">{tx.toUserName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Remaining Total: <strong className="text-white">{formatCurrency(tx.amount, tx.currency)}</strong>
                    </div>
                  </div>
                </div>

                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTransferToSettle(tx);
                      setIsSettleModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Settle Total Balance</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Person-by-Person Expedition Breakdown Panel */}
      <PersonBreakdownPanel
        participants={participants}
        balances={balances}
        expenses={expenses}
        settlements={settlements}
        displayCurrency={displayCurrency}
        currentUserId={currentUserId}
        isViewer={isViewer}
        totalExpeditionInDisplay={totalExpeditionInDisplay}
        onPersonFilterChange={(userId, filterMode) => {
          setActivePersonId(userId);
          setPersonFilter(filterMode);
        }}
      />

      {/* Filter Tabs & Empty State Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        {/* Category Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat.id 
                  ? 'bg-amber-500 text-slate-950 shadow-sm' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {expenses.length === 0 && (
          <button
            type="button"
            onClick={handleSeedPresets}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 font-bold text-xs flex items-center space-x-1.5 transition-all self-start sm:self-center"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Poland 2026 Sample Expenses</span>
          </button>
        )}
      </div>

      {/* Expense Items List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading expense ledger...</div>
      ) : filteredExpenses.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl glass-panel border border-white/10 bg-slate-900/40 space-y-3">
          <Receipt className="w-10 h-10 text-slate-500 mx-auto" />
          <h4 className="text-lg font-bold text-white">No expenses in this category</h4>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            Add your shared hotel stays, train tickets, and Christmas market purchases to calculate balances.
          </p>
          <button
            type="button"
            onClick={handleSeedPresets}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center space-x-1.5 shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            <span>Load Poland 2026 Sample Expenses</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((exp) => {
            const catKey = normalizeCategory(exp.category);
            const catMeta = CATEGORY_MAP[catKey] || CATEGORY_MAP.other;
            const Icon = catMeta.icon || Receipt;
            const cur = exp.currency_original || 'PLN';
            const amt = Number(exp.amount_original || 0);

            return (
              <div
                key={exp.id}
                className="p-4 rounded-2xl glass-panel border border-white/10 hover:border-amber-500/30 bg-slate-900/80 transition-all shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="flex items-start sm:items-center space-x-3 min-w-0">
                  <div className={`p-2.5 rounded-xl border ${catMeta.badge || 'bg-white/10'} shrink-0 mt-0.5 sm:mt-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-sm sm:text-base leading-tight group-hover:text-amber-200 transition-colors">
                      {exp.description}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>Paid by <strong className="text-slate-200">{exp.paid_by_name || 'Member'}</strong></span>
                      <span>•</span>
                      <span className="capitalize">{exp.category || 'expense'}</span>
                      {exp.purchase_site && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[11px] font-medium" title="Where purchased / booking site">
                            <ShoppingCart className="w-3 h-3 text-sky-400" />
                            <span>{exp.purchase_site}</span>
                          </span>
                        </>
                      )}
                      {exp.payment_method && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium" title="Payment method">
                            <CreditCard className="w-3 h-3 text-amber-400" />
                            <span>{exp.payment_method}</span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* Item-by-item split & settlement controls */}
                    {exp.splits && exp.splits.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {exp.splits.map((s) => {
                          const isPayer = s.user_id === (exp.paid_by_user_id || exp.user_id);
                          const isCurrentUserSplit = s.user_id === currentUserId;
                          const isSettled = Boolean(s.is_settled);
                          const firstName = s.user_name?.split(' ')[0] || 'Member';

                          if (isPayer) {
                            return (
                              <span 
                                key={s.id || s.user_id} 
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300"
                              >
                                <span>
                                  {firstName}: {formatCurrency(s.amount_owed, cur)}
                                  {cur !== displayCurrency && (
                                    <span className="text-slate-400 font-normal ml-1">
                                      (≈ {formatCurrency(convertCurrency(s.amount_owed, cur, displayCurrency), displayCurrency)})
                                    </span>
                                  )}
                                </span>
                                <span className="text-slate-500 font-normal">(Paid)</span>
                              </span>
                            );
                          }

                          // Debtor's split
                          return isSettled ? (
                            <div 
                              key={s.id || s.user_id} 
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="font-bold">
                                {firstName}: {formatCurrency(s.amount_owed, cur)}
                                {cur !== displayCurrency && (
                                  <span className="text-emerald-400/70 font-normal ml-1">
                                    (≈ {formatCurrency(convertCurrency(s.amount_owed, cur, displayCurrency), displayCurrency)})
                                  </span>
                                )}
                              </span>
                              <span className="text-emerald-400 font-medium">
                                ✓ Settled {s.settle_method ? `via ${SETTLE_METHOD_MAP[s.settle_method] || s.settle_method}` : ''}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUndoSplit(s.id, exp.description);
                                }}
                                className="ml-1 text-slate-400 hover:text-red-300 underline text-[10px] cursor-pointer"
                                title="Undo settlement for this item"
                              >
                                Undo
                              </button>
                            </div>
                          ) : (
                            <div 
                              key={s.id || s.user_id} 
                              className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px]"
                            >
                              <span className="text-amber-300 font-bold">
                                {isCurrentUserSplit
                                  ? `You owe ${exp.paid_by_name?.split(' ')[0] || 'Payer'}: ${formatCurrency(s.amount_owed, cur)}`
                                  : `${firstName} owes ${formatCurrency(s.amount_owed, cur)}`
                                }
                                {cur !== displayCurrency && (
                                  <span className="text-amber-200/70 font-normal ml-1">
                                    (≈ {formatCurrency(convertCurrency(s.amount_owed, cur, displayCurrency), displayCurrency)})
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveItemToSettle({ expense: exp, split: s });
                                }}
                                className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] transition-all cursor-pointer shadow-sm"
                                title={`Settle ${firstName}'s share of this item`}
                              >
                                Settle Item
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center">
                  <div className="text-right">
                    <div className="font-mono font-black text-sm sm:text-base text-white">
                      {formatCurrency(amt, cur)}
                    </div>
                    {cur !== displayCurrency && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        ≈ {formatCurrency(convertCurrency(amt, cur, displayCurrency), displayCurrency)}
                      </div>
                    )}
                  </div>

                  {!isViewer && (
                    <div className="flex items-center space-x-1 sm:space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(exp)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                        title="Edit expense details and who paid"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Delete expense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past Settlement History Accordion */}
      {settlements.length > 0 && (
        <div className="pt-4 border-t border-white/10 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Settlement Payment Log</span>
          </h4>
          <div className="space-y-2">
            {settlements.map((s) => (
              <div 
                key={s.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between text-xs text-slate-300"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="font-bold text-amber-300 shrink-0">{s.from_user_name}</span>
                  <span className="shrink-0">{s.method === 'both_paid_separately' ? 'settled with' : 'paid'}</span>
                  <span className="font-bold text-emerald-400 shrink-0">{s.to_user_name}</span>
                  <span className="text-slate-500 shrink-0">via {SETTLE_METHOD_MAP[s.method] || s.method || 'Cash'}</span>
                  {s.notes && <span className="text-slate-400 text-[11px] truncate italic">({s.notes})</span>}
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <div className="font-mono font-bold text-white">
                    {formatCurrency(s.amount, s.currency)}
                  </div>
                  {!isViewer && (
                    <button
                      type="button"
                      onClick={() => handleUndoSettlement(s.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center space-x-1 cursor-pointer"
                      title="Undo this settlement payment"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="text-[10px] hidden sm:inline">Undo</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-amber-500/30 bg-slate-900 shadow-2xl overflow-hidden my-auto">
            <form onSubmit={handleSaveExpense} className="flex flex-col max-h-[90vh] h-full text-xs sm:text-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-5 sm:px-6 py-4 flex-shrink-0 bg-slate-900">
                <h3 className="text-lg font-black text-white flex items-center space-x-2">
                  {editingExpense ? (
                    <>
                      <Edit2 className="w-5 h-5 text-amber-400" />
                      <span>Edit Expense & Payer</span>
                    </>
                  ) : (
                    <>
                      <Receipt className="w-5 h-5 text-amber-400" />
                      <span>Add Trip Expense</span>
                    </>
                  )}
                </h3>
                <button 
                  type="button" 
                  onClick={() => { setIsAddModalOpen(false); setEditingExpense(null); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-4 flex-1">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="e.g. PKP Intercity Wrocław to Poznań"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Currency</label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white focus:outline-none focus:border-amber-400"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Live conversion indicator */}
              {Number(formAmount) > 0 && formCurrency !== displayCurrency && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
                  <span className="text-slate-300">Converts to display currency:</span>
                  <span className="font-mono font-bold text-white">
                    ≈ {formatCurrency(convertCurrency(formAmount, formCurrency, displayCurrency), displayCurrency)}
                  </span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-300 mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white focus:outline-none focus:border-amber-400 capitalize"
                >
                  {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Who Paid?</label>
                  <select
                    value={formPayer}
                    onChange={(e) => setFormPayer(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="self">You ({currentUserName})</option>
                    <option value="partner">{partnerName}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Split Strategy</label>
                  <select
                    value={formSplitType}
                    onChange={(e) => setFormSplitType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="equal">Split Equally (50/50)</option>
                    <option value="self">Paid for Self Only</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-300 flex items-center space-x-1.5 text-xs sm:text-sm">
                      <ShoppingCart className="w-3.5 h-3.5 text-sky-400" />
                      <span>Where Purchased? (Site / Vendor)</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    list="trip-booking-sites-list"
                    value={formSite}
                    onChange={(e) => setFormSite(e.target.value)}
                    placeholder="e.g. Booking.com, Hotels.com, Delta.com"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-xs sm:text-sm"
                  />
                  <datalist id="trip-booking-sites-list">
                    {availableBookingSites.map((site) => (
                      <option key={site} value={site} />
                    ))}
                  </datalist>
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-24 overflow-y-auto pr-1">
                    {availableBookingSites.map((site) => (
                      <button
                        key={site}
                        type="button"
                        onClick={() => setFormSite(site)}
                        className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                          formSite === site 
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold' 
                            : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'
                        }`}
                      >
                        {site}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-300 flex items-center space-x-1.5 text-xs sm:text-sm">
                      <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                      <span>How was it paid? (Payment Method)</span>
                    </label>
                    {formPaymentMethod.trim() && !availablePaymentMethods.some(m => m.toLowerCase() === formPaymentMethod.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => saveTripPaymentMethod(formPaymentMethod.trim())}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center space-x-1 cursor-pointer"
                        title="Save to this trip's payment methods list"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>Save to Trip</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    list="trip-payment-methods-list"
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    placeholder="e.g. US Bank VISA, Apple Pay, Mastercard"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 text-xs sm:text-sm"
                  />
                  <datalist id="trip-payment-methods-list">
                    {availablePaymentMethods.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <div className="flex flex-wrap gap-1 mt-1.5 max-h-24 overflow-y-auto pr-1">
                    {availablePaymentMethods.map((m) => {
                      const isDefault = ['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'PayPal', 'Cash'].some(d => d.toLowerCase() === m.toLowerCase());
                      const isSelected = formPaymentMethod.toLowerCase() === m.toLowerCase();
                      const isRemovable = !isDefault && savedPaymentMethods.some(s => s.toLowerCase() === m.toLowerCase());
                      return (
                        <span
                          key={m}
                          onClick={() => setFormPaymentMethod(m)}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm' 
                              : !isDefault
                              ? 'bg-amber-500/15 text-amber-200 border-amber-500/40 hover:bg-amber-500/25 font-medium'
                              : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200 hover:bg-white/10'
                          }`}
                          title={!isDefault ? 'Saved for this trip' : m}
                        >
                          {!isDefault && <CreditCard className={`w-2.5 h-2.5 mr-1 ${isSelected ? 'text-slate-950' : 'text-amber-400'}`} />}
                          <span>{m}</span>
                          {isRemovable && !isSelected && (
                            <button
                              type="button"
                              onClick={(e) => removeTripPaymentMethod(m, e)}
                              className="ml-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 rounded p-0.5 cursor-pointer"
                              title={`Remove "${m}" from saved trip list`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              </div>

              {/* Pinned Footer with Action Buttons */}
              <div className="border-t border-white/10 px-5 sm:px-6 py-3.5 bg-slate-900/95 backdrop-blur-sm flex items-center justify-end space-x-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setEditingExpense(null); }}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Total Settle-Up Modal */}
      {isSettleModalOpen && activeTransferToSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 rounded-3xl border border-emerald-500/30 bg-slate-900 shadow-2xl space-y-4 my-auto">
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Settle Total Remaining Balance</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Settles the entire remaining net balance between travelers. To settle a single booking instead, use "Settle Item" on that card.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-1">
              <div className="text-xs text-slate-400">Total Balance Transfer:</div>
              <div className="text-sm font-bold text-white flex items-center space-x-2">
                <span className="text-amber-300">{activeTransferToSettle.fromUserName}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-emerald-400">{activeTransferToSettle.toUserName}</span>
              </div>
              <div className="text-xl font-black font-mono text-white pt-1">
                {formatCurrency(activeTransferToSettle.amount, activeTransferToSettle.currency)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Payment Method</label>
              <select
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white text-xs focus:outline-none focus:border-emerald-400"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="cash_app">Cash App</option>
                <option value="both_paid_separately">Both Paid Separately</option>
                <option value="paypal">PayPal</option>
                <option value="credit_card_split">Credit Card (Split at POS)</option>
                <option value="revolut_wise">Revolut / Wise</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsSettleModalOpen(false);
                  setActiveTransferToSettle(null);
                }}
                className="px-3 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSettleUp}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Recording...' : 'Confirm Total Settle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Item-by-Item Settle Modal */}
      {activeItemToSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 rounded-3xl border border-amber-500/40 bg-slate-900 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <span>Settle Item Booking</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setActiveItemToSettle(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-1.5">
              <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Booking / Item</div>
              <div className="text-sm font-bold text-white truncate">
                {activeItemToSettle.expense.description}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-xs">
                <span className="text-amber-300 font-bold">{activeItemToSettle.split.user_name}</span>
                <span className="text-slate-400">pays</span>
                <span className="text-emerald-400 font-bold">{activeItemToSettle.expense.paid_by_name}</span>
              </div>
              <div className="text-xl font-black font-mono text-white pt-1">
                {formatCurrency(activeItemToSettle.split.amount_owed, activeItemToSettle.expense.currency_original || 'USD')}
                {(activeItemToSettle.expense.currency_original || 'USD') !== displayCurrency && (
                  <span className="text-xs sm:text-sm text-slate-400 font-normal ml-2">
                    ≈ {formatCurrency(convertCurrency(activeItemToSettle.split.amount_owed, activeItemToSettle.expense.currency_original || 'USD', displayCurrency), displayCurrency)}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Payment Method</label>
              <select
                value={settleMethod}
                onChange={(e) => setSettleMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white text-xs focus:outline-none focus:border-amber-400"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="cash_app">Cash App</option>
                <option value="both_paid_separately">Both Paid Separately</option>
                <option value="paypal">PayPal</option>
                <option value="credit_card_split">Credit Card (Split at POS)</option>
                <option value="revolut_wise">Revolut / Wise</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setActiveItemToSettle(null)}
                className="px-3 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmItemSettle}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Recording...' : `Confirm Settle (${formatCurrency(activeItemToSettle.split.amount_owed, activeItemToSettle.expense.currency_original)})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
