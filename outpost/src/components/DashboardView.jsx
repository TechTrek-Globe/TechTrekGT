import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, Package, Gavel, Clock, BarChart2,
  RefreshCw, Loader2, AlertCircle,
  ShieldCheck, ShoppingBag, Layers, Tag
} from 'lucide-react';
import { getDashboard } from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { MarketAlertsPanel } from './dashboard/MarketAlertsPanel';

export function DashboardView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getDashboard();
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

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
  const categories = data?.categories || [];
  const authenticators = data?.authenticators || [];
  const platformStats = data?.platforms || [];
  const monthlyTrend = data?.monthly_trend || [];
  const recentSales = data?.recent_sales || [];
  const recentAcquisitions = data?.recent_acquisitions || [];

  const activeCount = (inv.available_items || 0) + (inv.listed_items || 0);
  const listingCoveragePct = activeCount > 0 ? (inv.listed_items || 0) / activeCount : 0;

  // Max value for monthly chart scaling
  const maxMonthlyGross = Math.max(...monthlyTrend.map(m => m.gross_volume || 0), 100);

  return (
    <div className="w-full flex-1 min-h-0 overflow-y-auto space-y-6 pb-8 pr-1">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-amber-400" />
            Executive Portfolio Dashboard
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            TechTrek Outpost & Financial Intelligence
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* KPI Cards Grid (6 High-Impact Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Capital Tied Up */}
        <div className="glass-card rounded-xl p-4 border border-blue-500/20 hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Capital Tied Up</span>
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-white mt-2">
            {fmtCurrency(inv.capital_tied_up)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {activeCount} active pieces
          </p>
        </div>

        {/* Realized Net Profit */}
        <div className="glass-card rounded-xl p-4 border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Realized Gain</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black mt-2 ${sales.total_net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtCurrency(sales.total_net_profit)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            from {sales.total_sales} sold items
          </p>
        </div>

        {/* Blended ROI */}
        <div className="glass-card rounded-xl p-4 border border-amber-500/20 hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Blended ROI</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <BarChart2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className={`text-xl font-black mt-2 ${sales.blended_roi >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {fmtPct(sales.blended_roi)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Cost: {fmtCurrency(sales.total_sold_cost)}
          </p>
        </div>

        {/* Gross Sales */}
        <div className="glass-card rounded-xl p-4 border border-purple-500/20 hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Gross Volume</span>
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-white mt-2">
            {fmtCurrency(sales.total_gross_sales)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Net: {fmtCurrency(sales.total_net_proceeds)}
          </p>
        </div>

        {/* Inventory Distribution */}
        <div className="glass-card rounded-xl p-4 border border-slate-700/60 hover:border-slate-600 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Listed Status</span>
            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
              <Gavel className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-amber-300 mt-2">
            {inv.listed_items} <span className="text-xs font-normal text-slate-400">/ {activeCount}</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {fmtPct(listingCoveragePct)} listed for sale
          </p>
        </div>

        {/* Velocity */}
        <div className="glass-card rounded-xl p-4 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Avg Turnaround</span>
            <div className="w-6 h-6 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-xl font-black text-cyan-300 mt-2">
            {sales.avg_days_to_sell} <span className="text-xs font-normal text-slate-400">days</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            average days to sell
          </p>
        </div>
      </div>

      {/* Main Analytics Row: Monthly Velocity + Category Breakdown */}
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

      {/* Secondary Distribution Matrix: Authenticators + Platform Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Authenticator Distribution */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              Authentication & Certification Mix
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
              Sales Channels & Platform Velocity
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

      {/* Three-Column Feeds: Alerts vs Recent Sales vs Recent Acquisitions */}
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

        {/* Recent Inventory Additions */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800 h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-400" />
              Latest Inventory Intake
            </h3>
            {onNavigate && (
              <button
                onClick={() => onNavigate('inventory')}
                className="text-xs text-amber-400 hover:text-amber-300 font-medium"
              >
                Full Inventory ({inv.total_items}) →
              </button>
            )}
          </div>

          {recentAcquisitions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600">
              No inventory intake logged yet. Click "Add Invoice" to add items.
            </div>
          ) : (
            <div className="space-y-2">
              {recentAcquisitions.map(item => (
                <div key={item.id} className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold text-slate-200 truncate">{item.item_name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {item.category} · {item.athlete_person || 'Unspecified'} · Inv: {item.invoice_ref || 'None'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-bold text-amber-400">{fmtCurrency(item.true_total_cost)}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Min: {fmtCurrency(item.min_sell_price)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
