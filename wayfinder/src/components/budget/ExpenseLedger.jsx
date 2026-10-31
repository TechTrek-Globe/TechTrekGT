import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, Receipt, Plus, ArrowRight, CheckCircle2, Trash2, 
  RefreshCw, Users, CreditCard, Sparkles, Plane, Building, Train, 
  Utensils, ShoppingBag, AlertCircle, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  convertCurrency, formatCurrency, splitEqually, calculateSettleUp, DEFAULT_EXCHANGE_RATES 
} from '../../utils/expenseLedger';

const CATEGORIES = [
  { id: 'all',       label: 'All Categories' },
  { id: 'flight',    label: 'Flights',    icon: Plane,       badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { id: 'lodging',   label: 'Hotels',     icon: Building,    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { id: 'transit',   label: 'Rail/Trans', icon: Train,       badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { id: 'dining',    label: 'Dining',     icon: Utensils,    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  { id: 'market',    label: 'Markets',    icon: ShoppingBag, badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  { id: 'other',     label: 'Other',      icon: Receipt,     badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' }
];

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

export function ExpenseLedger({ journeyId = 'poland-christmas-2026' }) {
  const { user, isAuthenticated, setIsAuthModalOpen } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Preference state
  const [displayCurrency, setDisplayCurrency] = useState('PLN');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [activeTransferToSettle, setActiveTransferToSettle] = useState(null);
  const [settleMethod, setSettleMethod] = useState('revolut');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state for new expense
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('dining');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState('PLN');
  const [formPayer, setFormPayer] = useState('self');
  const [formSplitType, setFormSplitType] = useState('equal'); // 'equal' or 'self'

  const currentUserId = user?.userId || 'usr-jonathan-kemp';
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
      const res = await fetch(`/api/wayfinder/expenses?journey_id=${journeyId}`);
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

  // Settle-up calculations
  const { balances, transfers, totalSpendByCurrency } = useMemo(() => {
    return calculateSettleUp(expenses, settlements, displayCurrency);
  }, [expenses, settlements, displayCurrency]);

  const userBalance = useMemo(() => {
    return balances.find(b => b.id === currentUserId) || { paid: 0, owed: 0, net: 0 };
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
    if (selectedCategory === 'all') return expenses;
    return expenses.filter(e => (e.category || 'other').toLowerCase() === selectedCategory);
  }, [expenses, selectedCategory]);

  // Handle Preset Seed
  const handleSeedPresets = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/wayfinder/expenses/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Handle Add Expense Submit
  const handleAddExpense = async (e) => {
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

      const payload = {
        journey_id: journeyId,
        description: formDesc.trim(),
        category: formCategory,
        amount_original: amt,
        currency_original: formCurrency,
        paid_by_name: formPayer === 'self' ? currentUserName : partnerName,
        paid_by_id: formPayer === 'self' ? currentUserId : partnerId,
        splits: splits.map(s => ({
          user_id: s.userId,
          user_name: s.userName,
          amount_owed: s.amountOwed,
          percentage: s.percentage
        }))
      };

      const res = await fetch('/api/wayfinder/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to record expense');
      setIsAddModalOpen(false);
      setFormDesc('');
      setFormAmount('');
      await loadExpenses();
    } catch (err) {
      alert('Error creating expense: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Settle-Up Submit
  const handleSettleUp = async () => {
    if (!activeTransferToSettle) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/wayfinder/expenses/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey_id: journeyId,
          from_user_id: activeTransferToSettle.fromUserId,
          from_user_name: activeTransferToSettle.fromUserName,
          to_user_id: activeTransferToSettle.toUserId,
          to_user_name: activeTransferToSettle.toUserName,
          amount: activeTransferToSettle.amount,
          currency: activeTransferToSettle.currency,
          method: settleMethod,
          notes: `Settled via ${settleMethod.toUpperCase()}`
        })
      });

      if (!res.ok) throw new Error('Failed to record settlement');
      setIsSettleModalOpen(false);
      setActiveTransferToSettle(null);
      await loadExpenses();
    } catch (e) {
      alert('Settlement recording error: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Expense
  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      const res = await fetch(`/api/wayfinder/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      alert('Failed to delete expense: ' + e.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
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
          {/* Currency Pill Selector */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-xs font-bold">
            {CURRENCIES.map(cur => (
              <button
                key={cur}
                type="button"
                onClick={() => setDisplayCurrency(cur)}
                className={`px-2.5 py-1 rounded-lg transition-all ${displayCurrency === cur ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                {cur}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
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
          <span className="text-[11px] text-slate-400">Direct bookings & purchases</span>
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
              : '0.00 zł'}
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
            <h3 className="text-sm sm:text-base font-bold">Simplified Settle-Up Transfers</h3>
          </div>
          <p className="text-xs text-slate-300">
            Our greedy graph algorithm resolved all group splits into the minimum required transfers:
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
                      Amount: <strong className="text-white">{formatCurrency(tx.amount, tx.currency)}</strong>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTransferToSettle(tx);
                    setIsSettleModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 font-bold text-xs flex items-center space-x-1 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Settle Up</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
            const catMeta = CATEGORIES.find(c => c.id === exp.category) || CATEGORIES[6];
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
                      {exp.splits && exp.splits.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-300 font-medium">
                            Split ({exp.splits.map(s => `${s.user_name?.split(' ')[0]}: ${formatCurrency(s.amount_owed, cur)}`).join(', ')})
                          </span>
                        </>
                      )}
                    </div>
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

                  <button
                    type="button"
                    onClick={() => handleDeleteExpense(exp.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete expense"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-amber-300">{s.from_user_name}</span>
                  <span>paid</span>
                  <span className="font-bold text-emerald-400">{s.to_user_name}</span>
                  <span className="text-slate-500">via {s.method || 'cash'}</span>
                </div>
                <div className="font-mono font-bold text-white">
                  {formatCurrency(s.amount, s.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-3xl border border-amber-500/30 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-black text-white flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <span>Add Trip Expense</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4 text-xs sm:text-sm">
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

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Settle-Up Modal */}
      {isSettleModalOpen && activeTransferToSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-sm p-6 rounded-3xl border border-emerald-500/30 bg-slate-900 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Record Debt Settlement</span>
            </h3>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-1">
              <div className="text-xs text-slate-400">Transfer:</div>
              <div className="text-sm font-bold text-white flex items-center space-x-2">
                <span className="text-amber-300">{activeTransferToSettle.fromUserName}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-emerald-400">{activeTransferToSettle.toUserName}</span>
              </div>
              <div className="text-lg font-black font-mono text-white pt-1">
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
                <option value="revolut">Revolut</option>
                <option value="blik">BLIK (Poland Phone Pay)</option>
                <option value="cash">Cash in PLN</option>
                <option value="transfer">Bank Transfer / Venmo</option>
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
                {isSubmitting ? 'Recording...' : 'Confirm Settle-Up'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
