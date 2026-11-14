import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DollarSign, TrendingUp, Package, Gavel, Clock, BarChart2,
  RefreshCw, Loader2, AlertCircle,
  ShieldCheck, ShoppingBag, Layers, Tag, ArrowRight,
  TrendingDown, Sparkles, Plus, Lock, CheckCircle2
} from 'lucide-react';
import { getDashboard } from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { MarketAlertsPanel } from './dashboard/MarketAlertsPanel';
import { AgingMarkdownModal } from './inventory/AgingMarkdownModal';
import { useInventory } from '../context/InventoryContext';

export function DashboardView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [repriceModalOpen, setRepriceModalOpen] = useState(false);
  const [syncingEbayLocal, setSyncingEbayLocal] = useState(false);
  const fetchRequestIdRef = useRef(0);

  // Safe access to InventoryContext if available
  let inventoryCtx = null;
  try {
    inventoryCtx = useInventory();
  } catch (_) {
    // Rendered outside of InventoryProvider (e.g. in isolated test)
  }

  const setStatusFilter = inventoryCtx?.setStatusFilter;
  const setSearch = inventoryCtx?.setSearch;
  const handleSyncEbay = inventoryCtx?.handleSyncEbay;
  const isEbaySyncing = Boolean(inventoryCtx?.ebaySyncing || syncingEbayLocal);

  const fetchDashboard = useCallback(async () => {
    const reqId = ++fetchRequestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await getDashboard();
      if (reqId === fetchRequestIdRef.current) {
        setData(res);
      }
    } catch (err) {
      if (reqId === fetchRequestIdRef.current) {
        setError(err.message || 'Failed to load dashboard.');
      }
    } finally {
      if (reqId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onTriggerEbaySync = async () => {
    if (isEbaySyncing) return;
    setSyncingEbayLocal(true);
    try {
      if (handleSyncEbay) {
        await handleSyncEbay();
      }
      await fetchDashboard();
    } catch (err) {
      setError(err?.message || 'eBay sync failed');
    } finally {
      setSyncingEbayLocal(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-3" />
        <p className="text-sm font-semibold text-slate-300">Loading Portfolio Analytics...</p>
        <p className="text-xs text-slate-500 mt-1">Aggregating inventory capital and sales velocity</p>
      </div>
    );
  }

  if (!data && !loading && error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-400 max-w-md mx-auto text-center p-6">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">Unable to Load Dashboard</h2>
        <p className="text-sm text-slate-400 mb-6">{error}</p>
        <button
          onClick={fetchDashboard}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  const inv = data?.inventory || {};
  const sales = data?.sales || {};
  const agingSummary = data?.aging_summary || {
    fresh_count: 0,
    decay_10_count: 0,
    decay_20_count: 0,
    liquidation_count: 0,
    locked_count: 0,
    aging_candidates_count: 0
  };
  const stagnantListings = data?.stagnant_listings || [];
  const unlistedQueue = data?.unlisted_queue || [];
  const categories = data?.categories || [];
  const authenticators = data?.authenticators || [];
  const platformStats = data?.platforms || [];
  const monthlyTrend = data?.monthly_trend || [];
  const recentSales = data?.recent_sales || [];

  const activeCount = (inv.available_items || 0) + (inv.listed_items || 0);
  const listingCoveragePct = activeCount > 0 ? (inv.listed_items || 0) / activeCount : 0;
  const maxMonthlyGross = Math.max(...monthlyTrend.map(m => m.gross_volume || 0), 100);

  return (
    <div className="w-full flex-1 min-h-0 overflow-y-auto space-y-6 pb-8 pr-1">
      {/* 1. Top Header & Operational Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-amber-400" />
            Executive Resale Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Portfolio Valuation, Inventory Velocity &amp; Operational Action Queue
          </p>
        </div>

        {/* Quick Action Hub */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Reprice Engine Trigger with Aging Count Pill */}
          <button
            id="dash-reprice-btn"
            onClick={() => setRepriceModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              agingSummary.aging_candidates_count > 0
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 animate-pulse'
                : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
            }`}
            title="Launch Automated Repricing & Aging Decay Engine"
          >
            <TrendingDown className="w-4 h-4 flex-shrink-0" />
            <span>Reprice Engine</span>
            {agingSummary.aging_candidates_count > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-slate-950 text-amber-300 ml-0.5">
                {agingSummary.aging_candidates_count}
              </span>
            )}
          </button>

          {/* Unlisted Queue Trigger */}
          {inv.available_items > 0 && (
            <button
              onClick={() => {
                if (setStatusFilter) setStatusFilter('Available');
                if (onNavigate) onNavigate('inventory');
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5 transition-all"
              title="View items in intake waiting to be listed"
            >
              <Package className="w-4 h-4 text-blue-400" />
              <span>Unlisted Stock ({inv.available_items})</span>
            </button>
          )}

          {/* eBay Quick Sync */}
          <button
            onClick={onTriggerEbaySync}
            disabled={isEbaySyncing}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Sync live eBay listings, orders & traffic metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isEbaySyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync eBay</span>
          </button>

          {/* All Sales Shortcut */}
          {onNavigate && (
            <button
              onClick={() => onNavigate('sales')}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
              title="Open Sales Log & Closed Transactions"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Sales Log</span>
            </button>
          )}

          {/* Refresh Dashboard Button */}
          <button
            id="refresh-dashboard-btn"
            onClick={fetchDashboard}
            className="w-9 h-9 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 2. Executive KPI Cards Grid (6 High-Impact Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Active Capital Tied Up */}
        <div className="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Active Capital</span>
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-white mt-2 font-mono">
            {fmtCurrency(inv.capital_tied_up)}
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">
            Listed: <strong className="text-slate-300">{fmtCurrency(inv.listed_capital)}</strong> · Idle: <strong className="text-blue-300">{fmtCurrency(inv.available_capital)}</strong>
          </p>
        </div>

        {/* Expected Gross Realization (List Value) */}
        <div className="glass-card rounded-xl p-4 border border-amber-500/20 hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Potential Gross</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Tag className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-amber-300 mt-2 font-mono">
            {fmtCurrency(inv.listed_potential_revenue)}
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">
            Unrealized: <strong className="text-emerald-400">+{fmtCurrency(inv.unrealized_profit)}</strong>
          </p>
        </div>

        {/* Realized Net Profit (Lifetime) */}
        <div className="glass-card rounded-xl p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Realized Net Gain</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black mt-2 font-mono ${sales.total_net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {sales.total_net_profit >= 0 ? '+' : ''}{fmtCurrency(sales.total_net_profit)}
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">
            from <strong className="text-slate-200">{sales.total_sales}</strong> sold items
          </p>
        </div>

        {/* Blended ROI & Cash Turnaround */}
        <div className="glass-card rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Blended ROI</span>
            <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <BarChart2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black mt-2 font-mono ${sales.blended_roi >= 0 ? 'text-cyan-300' : 'text-red-400'}`}>
            {fmtPct(sales.blended_roi)}
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">
            Avg Turn: <strong className="text-slate-300">{sales.avg_days_to_sell} days</strong>
          </p>
        </div>

        {/* Active Listing Coverage */}
        <div className="glass-card rounded-xl p-4 border border-purple-500/20 hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Listing Coverage</span>
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Gavel className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-purple-300 mt-2 font-mono">
            {inv.listed_items} <span className="text-xs font-normal text-slate-400">/ {activeCount}</span>
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">
            <strong className="text-slate-200">{fmtPct(listingCoveragePct)}</strong> active for sale
          </p>
        </div>

        {/* Stagnant Listings Radar Card */}
        <div className={`glass-card rounded-xl p-4 border transition-all ${
          agingSummary.aging_candidates_count > 0 ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Aging Listings</span>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              agingSummary.aging_candidates_count > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-400'
            }`}>
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black mt-2 font-mono ${
            agingSummary.aging_candidates_count > 0 ? 'text-amber-400' : 'text-slate-300'
          }`}>
            {agingSummary.aging_candidates_count} <span className="text-xs font-normal text-slate-400">items</span>
          </p>
          <p className="text-[10.5px] text-slate-400 mt-1">
            {agingSummary.liquidation_count > 0 ? (
              <span className="text-red-400 font-semibold">{agingSummary.liquidation_count} in liquidation (90d+)</span>
            ) : (
              <span>{agingSummary.fresh_count} fresh listings</span>
            )}
          </p>
        </div>
      </div>

      {/* 3. Operational Action Center: Aging Radar & Unlisted Intake Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Aging Inventory & Repricing Radar */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Aging Inventory &amp; Repricing Radar</h3>
                  <p className="text-[11px] text-slate-400">
                    {agingSummary.aging_candidates_count > 0 ? (
                      <span className="text-amber-400 font-semibold">{agingSummary.aging_candidates_count} actively listed items warrant markdown review</span>
                    ) : (
                      'All active listings are fresh (<30 days old)'
                    )}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setRepriceModalOpen(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm transition-all"
              >
                <span>Launch Engine</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Visual 4-Tier Distribution Bar */}
            <div className="grid grid-cols-4 gap-2 mb-4 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center font-mono">
              <div className="p-1.5 rounded-lg bg-slate-900/60">
                <span className="text-[10px] text-slate-400 block font-sans">0-30d Fresh</span>
                <span className="text-sm font-black text-emerald-400">{agingSummary.fresh_count}</span>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-900/60">
                <span className="text-[10px] text-slate-400 block font-sans">31-60d (-10%)</span>
                <span className="text-sm font-black text-amber-400">{agingSummary.decay_10_count}</span>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-900/60">
                <span className="text-[10px] text-slate-400 block font-sans">61-90d (-20%)</span>
                <span className="text-sm font-black text-orange-400">{agingSummary.decay_20_count}</span>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-900/60">
                <span className="text-[10px] text-slate-400 block font-sans">90d+ Liq</span>
                <span className="text-sm font-black text-red-400">{agingSummary.liquidation_count}</span>
              </div>
            </div>

            {/* List of Oldest Stagnant Listings */}
            <div className="space-y-2">
              <span className="text-[10.5px] uppercase font-bold text-slate-400 tracking-wider block">
                Oldest Active Listings on Market
              </span>
              {stagnantListings.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 rounded-xl bg-slate-950/30 border border-slate-900">
                  No active listings found.
                </div>
              ) : (
                stagnantListings.map(item => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/70 hover:border-slate-700 flex items-center justify-between transition-colors">
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-200 truncate">{item.item_name}</span>
                        {item.reprice_locked ? (
                          <span title="Price locked from markdown"><Lock className="w-3 h-3 text-amber-400 flex-shrink-0" /></span>
                        ) : null}
                      </div>
                      <p className="text-[10.5px] text-slate-500 mt-0.5 font-mono">
                        {item.sku || 'No SKU'} · <span className="text-amber-400">{item.platform || 'eBay'}</span> · Cost: {fmtCurrency(item.true_total_cost)} · Floor: {fmtCurrency(item.min_sell_price)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        item.days_listed > 90
                          ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : item.days_listed > 60
                          ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                          : item.days_listed > 30
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {item.days_listed}d
                      </span>
                      <span className="text-xs font-bold text-slate-200 font-mono">
                        {fmtCurrency(item.current_list_price)}
                      </span>
                      <button
                        onClick={() => setRepriceModalOpen(true)}
                        className="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all"
                      >
                        Reprice
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Card B: Action Required: Unlisted Intake Queue */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Unlisted Intake Queue</h3>
                  <p className="text-[11px] text-slate-400">
                    {inv.available_items > 0 ? (
                      <span><strong className="text-blue-400">{fmtCurrency(inv.available_capital)}</strong> idle capital across <strong className="text-white">{inv.available_items}</strong> unlisted items</span>
                    ) : (
                      'All acquired inventory is actively listed'
                    )}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  if (setStatusFilter) setStatusFilter('Available');
                  if (onNavigate) onNavigate('inventory');
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-400 text-slate-950 flex items-center gap-1 shadow-sm transition-all"
              >
                <span>View All ({inv.available_items})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List of Top Capital Unlisted Items */}
            <div className="space-y-2 mt-4">
              <span className="text-[10.5px] uppercase font-bold text-slate-400 tracking-wider block">
                Highest-Capital Items Awaiting Listing
              </span>
              {unlistedQueue.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 rounded-xl bg-slate-950/30 border border-slate-900">
                  Zero backlog! 100% of available inventory is actively listed for sale.
                </div>
              ) : (
                unlistedQueue.map(item => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/70 hover:border-slate-700 flex items-center justify-between transition-colors">
                    <div className="min-w-0 pr-3">
                      <p className="text-xs font-semibold text-slate-200 truncate">{item.item_name}</p>
                      <p className="text-[10.5px] text-slate-500 mt-0.5 font-mono">
                        {item.category || 'General'} · Inv: {item.invoice_ref || 'None'} · Floor: {fmtCurrency(item.min_sell_price)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-bold text-blue-400 font-mono block">
                          {fmtCurrency(item.true_total_cost)}
                        </span>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          Target: {fmtCurrency(item.suggested_list_price)}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (setSearch) setSearch(item.sku || item.item_name);
                          if (setStatusFilter) setStatusFilter('Available');
                          if (onNavigate) onNavigate('inventory');
                        }}
                        className="px-2 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1"
                      >
                        <span>List</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Main Analytics Row: Monthly Velocity + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Sales Performance Bar Chart */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  Monthly Realized Performance
                </h3>
                <p className="text-xs text-slate-500">Gross revenue vs realized net gain by month</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/80"></span> Gross
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> Net Profit
                </span>
              </div>
            </div>

            {monthlyTrend.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-slate-600">
                <Clock className="w-6 h-6 mb-2 text-slate-700" />
                <p className="text-xs">No historical monthly sales logged yet</p>
              </div>
            ) : (
              <div className="h-48 flex items-end gap-3 pt-6 pb-2 px-2 overflow-x-auto">
                {monthlyTrend.map((m) => {
                  const grossHeight = Math.max(8, Math.min(100, (m.gross_volume / maxMonthlyGross) * 100));
                  const profitHeight = Math.max(4, Math.min(100, (Math.max(0, m.net_profit) / maxMonthlyGross) * 100));
                  return (
                    <div key={m.month} className="flex-1 min-w-[48px] flex flex-col items-center gap-1 group">
                      <div className="w-full flex items-end justify-center gap-1 h-36">
                        {/* Gross Bar */}
                        <div
                          style={{ height: `${grossHeight}%` }}
                          className="w-3 rounded-t bg-purple-500/60 group-hover:bg-purple-400 transition-all relative"
                          title={`Gross: ${fmtCurrency(m.gross_volume)}`}
                        />
                        {/* Net Profit Bar */}
                        <div
                          style={{ height: `${profitHeight}%` }}
                          className={`w-3 rounded-t transition-all ${m.net_profit >= 0 ? 'bg-emerald-500 group-hover:bg-emerald-400' : 'bg-red-500'}`}
                          title={`Profit: ${fmtCurrency(m.net_profit)}`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap mt-1 font-mono">
                        {m.month.slice(5)}/{m.month.slice(2, 4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span>Total Lifetime Sales Volume: <strong className="text-slate-200">{fmtCurrency(sales.total_gross_sales)}</strong></span>
            <span>Platform Fees Paid: <strong className="text-red-400">-{fmtCurrency(sales.total_platform_fees)}</strong></span>
          </div>
        </div>

        {/* Category Capital Allocation Breakdown */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Capital by Category
              </h3>
              <span className="text-xs text-slate-500">{categories.length} categories</span>
            </div>

            {categories.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-slate-600">
                <Package className="w-6 h-6 mb-2 text-slate-700" />
                <p className="text-xs">No active inventory categories</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {categories.map((c) => {
                  const pct = inv.capital_tied_up > 0 ? (c.capital_tied_up / inv.capital_tied_up) * 100 : 0;
                  return (
                    <div key={c.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-1.5">
                          <Tag className="w-3 h-3 text-amber-400/70" />
                          {c.category}
                        </span>
                        <div className="text-right">
                          <span className="text-slate-200 font-semibold">{fmtCurrency(c.capital_tied_up)}</span>
                          <span className="text-[10px] text-slate-500 ml-1.5">({c.item_count} items)</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, pct)}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <span>Active Capital: <strong className="text-amber-400">{fmtCurrency(inv.capital_tied_up)}</strong></span>
            {onNavigate && (
              <button
                onClick={() => onNavigate('inventory')}
                className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
              >
                View Inventory →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 5. Secondary Distribution Matrix: Authenticators + Platform Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Authenticator Distribution */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              Authentication &amp; Certification Mix
            </h3>
            <span className="text-xs text-slate-500">{authenticators.length} entities</span>
          </div>

          {authenticators.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600">
              No authentication data recorded
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {authenticators.map(a => (
                <div key={a.authenticator} className="glass-card-light rounded-xl p-2.5 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 truncate" title={a.authenticator}>
                      {a.authenticator}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-400 bg-blue-500/10">
                      {a.count} pcs
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Value: <strong className="text-slate-300">{fmtCurrency(a.capital_tied_up)}</strong>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Marketplace / Platform Performance */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              Sales Channels &amp; Platform Velocity
            </h3>
            <span className="text-xs text-slate-500">{platformStats.length} channels</span>
          </div>

          {platformStats.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600">
              No platform sales records logged yet
            </div>
          ) : (
            <div className="space-y-2">
              {platformStats.map(p => (
                <div key={p.platform} className="glass-card-light rounded-xl p-3 border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-400">{p.platform}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{p.sales_count} sales completed</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-200">{fmtCurrency(p.gross_volume)}</span>
                    <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">+{fmtCurrency(p.net_profit)} profit</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. Three-Column Feeds: Alerts vs Recent Sales vs Latest Intake */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Market Alerts Panel */}
        <div className="h-96">
          <MarketAlertsPanel />
        </div>

        {/* Recent Closed Sales */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Recent Closed Transactions
            </h3>
            {onNavigate && (
              <button
                onClick={() => onNavigate('sales')}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium"
              >
                All Sales ({sales.total_sales}) →
              </button>
            )}
          </div>

          {recentSales.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600">
              No sales logged yet. Record your first sale using the button above.
            </div>
          ) : (
            <div className="space-y-2">
              {recentSales.map(s => (
                <div key={s.id} className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold text-slate-200 truncate">{s.item_name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {s.sale_date} · <span className="text-amber-400">{s.platform}</span> · {s.athlete_person || s.category}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-2 justify-end">
                      <span className="text-xs font-bold text-slate-200">{fmtCurrency(s.gross_sale_price)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.net_profit >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                        {fmtPct(s.roi_pct)}
                      </span>
                    </div>
                    <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">+{fmtCurrency(s.net_profit)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Nav & Help Strip */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 h-96 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Resale Command Shortcuts
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Direct access to essential operational workflows and tools:
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => setRepriceModalOpen(true)}
                className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-left transition-all flex items-center justify-between group"
              >
                <div>
                  <span className="text-xs font-bold text-amber-300 block group-hover:text-amber-200">
                    Repricing &amp; Markdown Engine
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {agingSummary.aging_candidates_count} items eligible for decay review
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-amber-400 transition-colors" />
              </button>

              <button
                onClick={() => {
                  if (setStatusFilter) setStatusFilter('Available');
                  if (onNavigate) onNavigate('inventory');
                }}
                className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-left transition-all flex items-center justify-between group"
              >
                <div>
                  <span className="text-xs font-bold text-blue-300 block group-hover:text-blue-200">
                    Intake &amp; Unlisted Queue
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {inv.available_items} items awaiting listing ({fmtCurrency(inv.available_capital)})
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
              </button>

              <button
                onClick={() => {
                  if (onNavigate) onNavigate('settings');
                }}
                className="w-full p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-left transition-all flex items-center justify-between group"
              >
                <div>
                  <span className="text-xs font-bold text-purple-300 block group-hover:text-purple-200">
                    Platform Commissions &amp; Settings
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Manage fee structures, eBay sync &amp; columns
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 text-[10.5px] text-slate-500 flex items-center justify-between">
            <span>TechTrek Outpost v1.0</span>
            <span className="text-slate-400 font-mono">Press / to search anytime</span>
          </div>
        </div>
      </div>

      {/* 7. Mounted Aging Markdown Modal for 1-Click Operations */}
      <AgingMarkdownModal
        isOpen={repriceModalOpen}
        onClose={() => setRepriceModalOpen(false)}
        onApplied={() => {
          fetchDashboard();
        }}
      />
    </div>
  );
}
