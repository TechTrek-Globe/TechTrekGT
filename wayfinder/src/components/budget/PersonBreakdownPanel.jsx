import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Users, ChevronDown, ChevronUp, Info, CreditCard, Receipt, 
  Plane, Building, Train, Utensils, ShoppingBag, CheckCircle2, 
  Filter, X 
} from 'lucide-react';
import { 
  formatCurrency, 
  convertCurrency, 
  computePersonCategoryBreakdown, 
  computePersonPaymentMethods, 
  buildNetFormula 
} from '../../utils/expenseLedger';

const CATEGORY_ICONS = {
  flight:    Plane,
  lodging:   Building,
  transit:   Train,
  activity:  ShoppingBag,
  dining:    Utensils,
  market:    ShoppingBag,
  other:     Receipt
};

const CATEGORY_LABELS = {
  flight:    'Flights',
  lodging:   'Hotels',
  transit:   'Rail/Trans',
  activity:  'Activities',
  dining:    'Dining',
  market:    'Markets',
  other:     'Other'
};

const CATEGORY_COLORS = {
  flight:    'text-sky-400 bg-sky-500/15 border-sky-500/30',
  lodging:   'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  transit:   'text-amber-400 bg-amber-500/15 border-amber-500/30',
  activity:  'text-violet-400 bg-violet-500/15 border-violet-500/30',
  dining:    'text-orange-400 bg-orange-500/15 border-orange-500/30',
  market:    'text-purple-400 bg-purple-500/15 border-purple-500/30',
  other:     'text-slate-400 bg-slate-500/15 border-slate-500/30'
};

const CATEGORY_ORDER = ['flight', 'lodging', 'transit', 'activity', 'dining', 'market', 'other'];

export function PersonBreakdownPanel({
  participants = [],
  balances = [],
  expenses = [],
  settlements = [],
  displayCurrency = 'USD',
  currentUserId,
  isViewer = false,
  totalExpeditionInDisplay = 0,
  onPersonFilterChange
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTooltipId, setActiveTooltipId] = useState(null);
  const [activeFeedFilter, setActiveFeedFilter] = useState({ personId: null, mode: null });

  const tooltipRef = useRef(null);

  // Close tooltip on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setActiveTooltipId(null);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setActiveTooltipId(null);
      }
    }
    if (activeTooltipId) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTooltipId]);

  // Map participant balances
  const participantBalances = useMemo(() => {
    return participants.map(p => {
      const bal = balances.find(b => 
        b.id === p.id || 
        b.name?.toLowerCase() === p.name?.toLowerCase()
      ) || { id: p.id, name: p.name, paid: 0, owed: 0, net: 0, settlementsPaid: 0, settlementsReceived: 0 };
      
      const formula = buildNetFormula(bal, displayCurrency);
      const contributionPct = totalExpeditionInDisplay > 0 
        ? Math.min(100, Math.round((bal.paid / totalExpeditionInDisplay) * 1000) / 10) 
        : 0;

      const getParticipantFirstName = (uid, fallbackName) => {
        const match = participants.find(part => part.id === uid);
        const full = match?.name || fallbackName || 'Traveler';
        return full.split(' ')[0];
      };

      const matchesIdOrName = (uid, uname) =>
        uid === p.id || (uname && p.name && uname.toLowerCase() === p.name.toLowerCase());

      // Outgoing & incoming settlements from recorded transfers
      const sentList = settlements.filter(s => matchesIdOrName(s.from_user_id || s.fromUserId, s.from_user_name || s.fromUserName));
      const receivedList = settlements.filter(s => matchesIdOrName(s.to_user_id || s.toUserId, s.to_user_name || s.toUserName));

      const sentToNames = [...new Set(
        sentList.map(s => getParticipantFirstName(s.to_user_id || s.toUserId, s.to_user_name || s.toUserName))
      )];
      const receivedFromNames = [...new Set(
        receivedList.map(s => getParticipantFirstName(s.from_user_id || s.fromUserId, s.from_user_name || s.fromUserName))
      )];

      // Fallback from settled splits for recipient inference & total check
      const settledSplitRecipients = [];
      const settledShare = expenses.reduce((sum, exp) => {
        const userSplits = (exp.splits || []).filter(s => s.user_id === p.id && s.is_settled);
        const splitSum = userSplits.reduce((acc, s) => {
          const cur = exp.currency_original || exp.currency || 'PLN';
          const payerId = exp.paid_by_user_id || exp.user_id;
          if (payerId && payerId !== p.id) {
            settledSplitRecipients.push(getParticipantFirstName(payerId, exp.paid_by_name));
          }
          return acc + convertCurrency(Number(s.amount_owed || 0), cur, displayCurrency);
        }, 0);
        return sum + splitSum;
      }, 0);

      const finalSentNames = sentToNames.length > 0 ? sentToNames : [...new Set(settledSplitRecipients)];
      const sentAmount = bal.settlementsPaid > 0 ? bal.settlementsPaid : Math.round(settledShare * 100) / 100;
      const receivedAmount = Math.round((bal.settlementsReceived || 0) * 100) / 100;

      return {
        ...p,
        ...bal,
        formula,
        contributionPct,
        settledShare: sentAmount,
        sentToLabel: finalSentNames.join(', '),
        receivedAmount,
        receivedFromLabel: receivedFromNames.join(', ')
      };
    });
  }, [participants, balances, expenses, settlements, displayCurrency, totalExpeditionInDisplay]);

  // Per-person category data
  const personCategoryData = useMemo(() => {
    const data = {};
    for (const p of participants) {
      data[p.id] = computePersonCategoryBreakdown(expenses, p.id, displayCurrency);
    }
    return data;
  }, [expenses, participants, displayCurrency]);

  // Per-person payment methods
  const personPaymentData = useMemo(() => {
    const data = {};
    for (const p of participants) {
      data[p.id] = computePersonPaymentMethods(expenses, p.id, displayCurrency);
    }
    return data;
  }, [expenses, participants, displayCurrency]);

  // Handle feed filter toggling
  const handleFilterClick = (personId, mode) => {
    let nextFilter;
    if (activeFeedFilter.personId === personId && activeFeedFilter.mode === mode) {
      nextFilter = { personId: null, mode: null };
    } else {
      nextFilter = { personId, mode };
    }
    setActiveFeedFilter(nextFilter);
    if (onPersonFilterChange) {
      onPersonFilterChange(nextFilter.personId, nextFilter.mode);
    }
  };

  const handleClearFilter = () => {
    const nextFilter = { personId: null, mode: null };
    setActiveFeedFilter(nextFilter);
    if (onPersonFilterChange) {
      onPersonFilterChange(null, null);
    }
  };

  // Find other participant name for debt label
  const getOtherParticipantName = (currentPersonId) => {
    const other = participants.find(p => p.id !== currentPersonId);
    return other ? other.name.split(' ')[0] : 'group';
  };

  if (!participants.length) return null;

  return (
    <div className="rounded-2xl glass-panel border border-amber-500/25 bg-slate-900/80 shadow-lg overflow-hidden transition-all">
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        aria-expanded={isExpanded}
        aria-controls="person-breakdown-content"
        className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer select-none group"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
            <Users className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-amber-200 transition-colors">
                Expedition Breakdown by Person
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                {participants.length} Travelers
              </span>
              <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold font-mono">
                Total Trip: {formatCurrency(totalExpeditionInDisplay, displayCurrency)}
              </span>
              {activeFeedFilter.mode && (
                <span className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold animate-pulse">
                  <Filter className="w-2.5 h-2.5" />
                  <span>Filtered Feed Active</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5 line-clamp-1 sm:line-clamp-none">
              Transparent out-of-pocket spend, allocated liability share, and debt settle-up positions.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs text-slate-400 hidden sm:inline">
            {isExpanded ? 'Collapse' : 'Expand'}
          </span>
          <div className="p-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 group-hover:text-white">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Expandable Body */}
      {isExpanded && (
        <div id="person-breakdown-content" className="p-4 sm:p-5 pt-0 space-y-4 border-t border-white/5 animate-fade-in">
          {/* Active Filter Pill Alert Banner (if filtering the ledger feed) */}
          {activeFeedFilter.mode && (
            <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300 gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <Filter className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">
                  Filtering ledger feed: <strong>
                    {activeFeedFilter.mode === 'paid_by' && `Paid by ${participants.find(p => p.id === activeFeedFilter.personId)?.name || 'Traveler'}`}
                    {activeFeedFilter.mode === 'owed_by' && `Owed by ${participants.find(p => p.id === activeFeedFilter.personId)?.name || 'Traveler'} (Unsettled)`}
                    {activeFeedFilter.mode === 'settled' && 'Settled Items Only'}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearFilter}
                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition-colors shrink-0"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          )}

          {/* Total Trip Cost Summary Bar */}
          <div className="mt-3 p-3 sm:p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block leading-tight">
                  Total Trip Cost
                </span>
                <span className="text-[11px] text-slate-400">
                  Combined spend across {expenses.length} recorded {expenses.length === 1 ? 'booking' : 'bookings'}
                </span>
              </div>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-white">
              {formatCurrency(totalExpeditionInDisplay, displayCurrency)}
            </div>
          </div>

          {/* Person Cards Grid - All Details Always Visible */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {participantBalances.map((person) => {
              const isCurrentUser = person.id === currentUserId || person.name?.toLowerCase().includes('jon');
              const isTooltipOpen = activeTooltipId === person.id;
              const initials = person.name.split(' ').map(n => n[0]).join('').slice(0, 2);
              const otherFirstName = getOtherParticipantName(person.id);
              const catBreakdown = personCategoryData[person.id] || {};
              const paymentMethods = personPaymentData[person.id] || [];
              const fairSharePct = totalExpeditionInDisplay > 0
                ? Math.min(100, Math.round((person.owed / totalExpeditionInDisplay) * 1000) / 10)
                : 0;

              return (
                <div
                  key={person.id}
                  className={`relative p-4 sm:p-5 rounded-2xl glass-panel border transition-all space-y-3.5 ${
                    isCurrentUser 
                      ? 'bg-slate-950/70 border-amber-500/30 hover:border-amber-500/50' 
                      : 'bg-slate-950/70 border-sky-500/30 hover:border-sky-500/50'
                  }`}
                >
                  {/* Card Header: Avatar & Identity */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm border shadow-md shrink-0 ${
                        isCurrentUser 
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                          : 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                      }`}>
                        {initials}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-white text-base leading-tight">
                            {person.name}
                          </h4>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {isCurrentUser ? 'Trip Organizer • Primary Payer' : 'Expedition Co-Traveler'}
                        </span>
                      </div>
                    </div>

                    {/* Formula Tooltip Trigger */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveTooltipId(prev => prev === person.id ? null : person.id)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-300 border border-white/10 transition-colors cursor-pointer"
                        title="View mathematical net balance formula"
                        aria-label="View net balance calculation breakdown"
                      >
                        <Info className="w-4 h-4" />
                      </button>

                      {/* Tooltip Popover */}
                      {isTooltipOpen && (
                        <div
                          ref={tooltipRef}
                          className="absolute right-0 top-9 z-30 w-72 max-w-[calc(100vw-3rem)] p-3.5 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-2xl text-xs space-y-2 animate-fade-in"
                        >
                          <div className="flex items-center justify-between pb-1.5 border-b border-white/10 font-bold text-white">
                            <span>Balance Math Formula</span>
                            <button
                              type="button"
                              onClick={() => setActiveTooltipId(null)}
                              className="text-slate-400 hover:text-white"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-sky-300">
                              <span>+ Out-of-Pocket Paid:</span>
                              <strong>{person.formula.paid}</strong>
                            </div>
                            <div className="flex justify-between text-purple-300">
                              <span>- Allocated Share:</span>
                              <strong>{person.formula.share}</strong>
                            </div>
                            {person.settlementsPaid > 0 && (
                              <div className="flex justify-between text-emerald-300">
                                <span>+ Direct Sent Reimbursements:</span>
                                <strong>{person.formula.sent}</strong>
                              </div>
                            )}
                            {person.settlementsReceived > 0 && (
                              <div className="flex justify-between text-amber-300">
                                <span>- Reimbursements Received:</span>
                                <strong>{person.formula.received}</strong>
                              </div>
                            )}
                            <div className="pt-1.5 border-t border-white/10 flex justify-between font-bold text-white text-xs">
                              <span>= Exact Net Position:</span>
                              <span className={person.formula.isPositive ? 'text-emerald-400' : person.formula.isNegative ? 'text-amber-400' : 'text-slate-300'}>
                                {person.formula.net}
                              </span>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400 italic pt-1 border-t border-white/5">
                            Rounded to exact penny with zero floating-point remainder drift.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financial Metrics Stack */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    {/* Out of pocket */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        Paid Out-of-Pocket
                      </span>
                      <div className="text-lg sm:text-xl font-black font-mono text-white">
                        {formatCurrency(person.paid, displayCurrency)}
                      </div>
                      <span className="text-[10px] text-slate-400 block truncate">
                        Direct bookings fronted
                      </span>
                    </div>

                    {/* Fair share */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                        Fair Share (Liability)
                      </span>
                      <div className="text-lg sm:text-xl font-black font-mono text-white">
                        {formatCurrency(person.owed, displayCurrency)}
                      </div>
                      <span className="text-[10px] text-slate-400 block truncate">
                        50/50 of {formatCurrency(totalExpeditionInDisplay, displayCurrency)} trip
                      </span>
                    </div>
                  </div>

                  {/* Settled Reimbursements Row */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 space-y-1.5 text-xs">
                    {(person.settledShare > 0 || person.receivedAmount === 0) && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 flex items-center space-x-1.5 min-w-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">
                            Reimbursements Settled
                            {person.settledShare > 0 && person.sentToLabel ? (
                              <span className="text-slate-200 font-medium"> (to {person.sentToLabel})</span>
                            ) : ''}
                            :
                          </span>
                        </span>
                        <strong className="font-mono text-emerald-300 shrink-0">
                          {formatCurrency(person.settledShare, displayCurrency)}
                        </strong>
                      </div>
                    )}
                    {person.receivedAmount > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 flex items-center space-x-1.5 min-w-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span className="truncate">
                            Reimbursements Received
                            {person.receivedFromLabel ? (
                              <span className="text-slate-200 font-medium"> (from {person.receivedFromLabel})</span>
                            ) : ''}
                            :
                          </span>
                        </span>
                        <strong className="font-mono text-sky-300 shrink-0">
                          {formatCurrency(person.receivedAmount, displayCurrency)}
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Contribution Progress Bars - Cash Fronted vs Fair Share */}
                  <div className="space-y-1.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Cash Fronted</span>
                        <span className="font-mono font-bold text-amber-300">
                          {person.contributionPct}% <span className="text-slate-400 font-normal hidden sm:inline">of {formatCurrency(totalExpeditionInDisplay, displayCurrency)}</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                          style={{ width: `${Math.min(100, person.contributionPct)}%` }}
                          title={`Fronted ${person.contributionPct}% of total expedition cash (${formatCurrency(totalExpeditionInDisplay, displayCurrency)})`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Fair Share (Liability)</span>
                        <span className="font-mono font-bold text-purple-300">
                          {fairSharePct}% <span className="text-slate-400 font-normal hidden sm:inline">of {formatCurrency(totalExpeditionInDisplay, displayCurrency)}</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
                          style={{ width: `${Math.min(100, fairSharePct)}%` }}
                          title={`Responsible for ${fairSharePct}% of total expedition cost`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Net Position Badge */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    person.net > 0.01 
                      ? 'bg-emerald-500/10 border-emerald-500/30' 
                      : person.net < -0.01 
                      ? 'bg-amber-500/10 border-amber-500/30' 
                      : 'bg-white/5 border-white/10'
                  }`}>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Net Position
                      </span>
                      <span className="text-xs font-medium text-slate-300">
                        {person.net > 0.01 
                          ? `Owed by ${otherFirstName}` 
                          : person.net < -0.01 
                          ? `Owes to ${otherFirstName}` 
                          : 'Fully Settled'
                        }
                      </span>
                    </div>
                    <div className={`text-xl font-black font-mono ${
                      person.net > 0.01 
                        ? 'text-emerald-400' 
                        : person.net < -0.01 
                        ? 'text-amber-400' 
                        : 'text-slate-300'
                    }`}>
                      {person.net > 0.01 ? `+${formatCurrency(person.net, displayCurrency)}` : formatCurrency(person.net, displayCurrency)}
                    </div>
                  </div>

                  {/* Category Spending & Fair Share - Always Visible */}
                  <div className="pt-3 border-t border-white/10 space-y-2">
                    <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                      <Receipt className="w-3.5 h-3.5 text-amber-400" />
                      <span>Category Spending & Share</span>
                    </span>
                    <div className="space-y-1.5">
                      {CATEGORY_ORDER.map(catKey => {
                        const Icon = CATEGORY_ICONS[catKey] || Receipt;
                        const label = CATEGORY_LABELS[catKey] || 'Other';
                        const badgeStyle = CATEGORY_COLORS[catKey] || CATEGORY_COLORS.other;
                        const catData = catBreakdown[catKey] || { paidByPerson: 0, shareOwed: 0, settled: 0 };
                        const paidWidth = person.paid > 0 ? Math.min(100, Math.round((catData.paidByPerson / person.paid) * 100)) : 0;
                        const shareWidth = person.owed > 0 ? Math.min(100, Math.round((catData.shareOwed / person.owed) * 100)) : 0;

                        return (
                          <div key={catKey} className="p-2 rounded-xl bg-slate-900/80 border border-white/5 space-y-1 text-xs">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <div className="flex items-center space-x-1.5 min-w-0">
                                <div className={`p-1 rounded-md border shrink-0 ${badgeStyle}`}>
                                  <Icon className="w-3 h-3" />
                                </div>
                                <span className="font-bold text-slate-200">{label}</span>
                              </div>
                              <div className="flex items-center space-x-2 font-mono text-[11px] shrink-0">
                                <span className="text-sky-300">
                                  Paid: <strong>{formatCurrency(catData.paidByPerson, displayCurrency)}</strong>
                                </span>
                                <span className="text-slate-500">•</span>
                                <span className="text-purple-300">
                                  Share: <strong>{formatCurrency(catData.shareOwed, displayCurrency)}</strong>
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-0.5">
                              <div className="space-y-0.5">
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-sky-400 rounded-full" style={{ width: `${paidWidth}%` }} />
                                </div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${shareWidth}%` }} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Instruments - Always Visible */}
                  <div className="space-y-2 pt-1 border-t border-white/5">
                    <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                      <span>Payment Instruments Used by {person.name.split(' ')[0]}</span>
                    </span>
                    {paymentMethods.length === 0 ? (
                      <div className="text-[11px] text-slate-400 p-2.5 rounded-xl bg-slate-900/60 border border-white/5 italic text-center">
                        No direct card charges recorded under this participant.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {paymentMethods.map((pm, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <div className="p-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                <CreditCard className="w-3 h-3" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-200">{pm.method}</span>
                                <span className="text-[10px] text-slate-400 ml-1.5">({pm.count} {pm.count === 1 ? 'charge' : 'charges'})</span>
                              </div>
                            </div>
                            <span className="font-mono font-bold text-white">
                              {formatCurrency(pm.totalPaid, displayCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Filter Ledger Feed Buttons */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Filter Expense List Below
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleFilterClick(person.id, 'paid_by')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          activeFeedFilter.personId === person.id && activeFeedFilter.mode === 'paid_by'
                            ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                            : 'bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/20'
                        }`}
                      >
                        Paid by {person.name.split(' ')[0]}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFilterClick(person.id, 'owed_by')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          activeFeedFilter.personId === person.id && activeFeedFilter.mode === 'owed_by'
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                        }`}
                      >
                        Owed by {person.name.split(' ')[0]} (Unsettled)
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFilterClick(person.id, 'settled')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          activeFeedFilter.mode === 'settled'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        Settled Items
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
