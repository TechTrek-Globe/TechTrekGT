import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Plus, Search, RefreshCw, Loader2, AlertCircle,
  Pencil, Trash2, DollarSign, Calendar, Tag, Package, Percent, Clock, ArrowUpRight
} from 'lucide-react';
import { getSales, deleteSale, getPlatforms } from '../utils/auctionApi';
import { LogSaleModal } from './LogSaleModal';
import { FeeReconciliationPanel } from './FeeReconciliationPanel';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { useInventory } from '../context/InventoryContext';

export function SalesLogView() {
  const { pendingSaleItem, setPendingSaleItem } = useInventory();
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({
    total_count: 0,
    total_gross: 0,
    total_net_proceeds: 0,
    total_cost: 0,
    total_net_profit: 0,
    blended_roi: 0,
    avg_days_to_sell: 0
  });
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [showMetrics, setShowMetrics] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedFeeRow, setExpandedFeeRow] = useState(null);

  const fetchSales = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 50 };
      if (search) params.q = search;
      if (platformFilter) params.platform = platformFilter;
      const data = await getSales(params);
      setSales(data.sales || []);
      setSummary(data.summary || {
        total_count: 0,
        total_gross: 0,
        total_net_proceeds: 0,
        total_cost: 0,
        total_net_profit: 0,
        blended_roi: 0,
        avg_days_to_sell: 0
      });
      setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load sales log.');
    } finally {
      setLoading(false);
    }
  }, [search, platformFilter]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const data = await getPlatforms();
      setPlatforms(data.platforms || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchPlatforms();
  }, [fetchPlatforms]);

  useEffect(() => {
    fetchSales(1);
  }, [fetchSales]);

  useEffect(() => {
    if (pendingSaleItem) {
      setSaleToEdit(null);
      setModalOpen(true);
    }
  }, [pendingSaleItem]);

  const handleOpenNewSale = () => {
    setPendingSaleItem(null);
    setSaleToEdit(null);
    setModalOpen(true);
  };

  const handleEditSale = (sale) => {
    setSaleToEdit(sale);
    setModalOpen(true);
  };

  const handleDeleteSale = async (id) => {
    if (!window.confirm('Delete this sale record? The item will be reverted back to active inventory.')) return;
    setDeletingId(id);
    try {
      await deleteSale(id);
      await fetchSales(pagination.page);
    } catch (err) {
      alert(err.message || 'Failed to delete sale.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 space-y-2">
      {/* Header & Main Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black text-white flex items-center gap-1.5 whitespace-nowrap">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            Sales Log & Realized Profit
          </h1>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-slate-900 border border-slate-800 text-slate-400">
            <span className="text-slate-200 font-semibold">{summary.total_count} sales</span>
            <span>•</span>
            <span className={`font-semibold ${summary.total_net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtCurrency(summary.total_net_profit)} profit
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowMetrics(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
              showMetrics
                ? 'bg-slate-800 text-amber-400 border-amber-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle metrics cards"
          >
            Stats {showMetrics ? '▲' : '▼'}
          </button>
          <button
            id="btn-log-sale"
            onClick={handleOpenNewSale}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-all flex-shrink-0"
            title="Record a completed sale"
          >
            <Plus className="w-3.5 h-3.5" /> Log Sale
          </button>
        </div>
      </div>

      {/* KPI Cards Summary Strip */}
      {showMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-shrink-0">
          <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Total Net Profit</p>
              <p className={`text-sm font-black ${summary.total_net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtCurrency(summary.total_net_profit)}
              </p>
            </div>
            <div className={`w-5 h-5 rounded-md flex items-center justify-center ${summary.total_net_profit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <DollarSign className="w-3 h-3" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Gross Sales Volume</p>
              <p className="text-sm font-black text-amber-400">
                {fmtCurrency(summary.total_gross)}
              </p>
            </div>
            <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-3 h-3" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Net Proceeds</p>
              <p className="text-sm font-black text-white">
                {fmtCurrency(summary.total_net_proceeds)}
              </p>
            </div>
            <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Overall ROI</p>
              <p className={`text-sm font-black ${summary.blended_roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPct(summary.blended_roi)}
              </p>
            </div>
            <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Percent className="w-3 h-3" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2.5 py-1.5 border border-slate-800 flex items-center justify-between col-span-2 sm:col-span-1">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Avg Days to Sell</p>
              <p className="text-sm font-black text-cyan-400">
                {summary.avg_days_to_sell} <span className="text-[10px] font-normal text-slate-400">days</span>
              </p>
            </div>
            <div className="w-5 h-5 rounded-md bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Clock className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {/* Platform Dropdown */}
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-lg py-1 px-2.5 text-xs text-slate-300 outline-none focus:border-amber-500 flex-shrink-0"
          >
            <option value="">All Platforms</option>
            {platforms.map(p => (
              <option key={p.id || p.name} value={p.name}>{p.name}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 z-10 pointer-events-none" />
            <input
              id="sales-search-input"
              type="text"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
              placeholder="Search items, athlete, buyer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Refresh Button */}
        <button
          id="refresh-sales-btn"
          onClick={() => fetchSales(pagination.page)}
          className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all flex-shrink-0"
          title="Refresh sales list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-2 bg-red-950/40 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Sales Data Table */}
      <div className="w-full glass-card rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 relative">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-900 shadow-sm">
              <tr className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
                {[
                  'Sale Date',
                  'Item & Details',
                  'Platform / Buyer',
                  'Gross Sale',
                  'Landed Cost',
                  'Platform Fee',
                  'Net Proceeds',
                  'Net Profit',
                  'ROI %',
                  'Days',
                  'Actions'
                ].map((h, idx) => (
                  <th
                    key={h}
                    className={`py-2 px-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-slate-900 border-b border-slate-800 shadow-sm ${
                      idx === 1 ? 'sticky left-0 z-40 border-r border-slate-800' : 'z-30'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300">
              {loading && sales.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                    <p className="text-xs">Loading sales log...</p>
                  </td>
                </tr>
              )}
              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <TrendingUp className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-400 font-semibold text-xs">No sales recorded yet</p>
                    <p className="text-slate-600 text-[11px] mt-0.5">Record a sale from this tab or click "Log Sale" from your inventory.</p>
                  </td>
                </tr>
              )}
              {sales.map((sale, i) => {
                const totalDeductions = (sale.platform_fees_amt || 0) + (sale.actual_shipping_cost || 0) + (sale.payment_processing_amt || 0) + (sale.promoted_listing_fee || 0);
                return (
                  <React.Fragment key={sale.id}>
                    <tr
                      className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group ${i % 2 === 0 ? 'bg-transparent' : 'bg-slate-950/20'}`}
                    >
                      {/* Sale Date */}
                      <td className="py-2 px-3 text-slate-300 font-medium whitespace-nowrap">
                        {sale.sale_date}
                      </td>

                      {/* Item & Details */}
                      <td className="py-2 px-3 max-w-[200px]">
                        <p className="text-slate-200 font-semibold text-xs leading-snug line-clamp-2" title={sale.item_name}>
                          {sale.item_name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                          <span>{sale.category}</span>
                          {sale.athlete_person && <span>· {sale.athlete_person}</span>}
                          {sale.invoice_ref && <span>· Inv: {sale.invoice_ref}</span>}
                        </div>
                      </td>

                      {/* Platform / Buyer */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20">
                          {sale.platform}
                        </span>
                        {sale.buyer_handle && (
                          <p className="text-[10px] text-slate-500 mt-0.5">@{sale.buyer_handle}</p>
                        )}
                      </td>

                      {/* Gross Sale */}
                      <td className="py-2 px-3 font-bold text-slate-100 whitespace-nowrap">
                        {fmtCurrency(sale.gross_sale_price)}
                      </td>

                      {/* Landed Cost */}
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                        {fmtCurrency(sale.true_total_cost)}
                      </td>

                      {/* Platform Fee */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="text-slate-300">{fmtCurrency(sale.platform_fees_amt)}</span>
                        {totalDeductions > (sale.platform_fees_amt || 0) && (
                          <p className="text-[10px] text-slate-600" title="Total fees & shipping deductions">
                            All: -{fmtCurrency(totalDeductions)}
                          </p>
                        )}
                      </td>

                      {/* Net Proceeds */}
                      <td className="py-2 px-3 font-medium text-slate-200 whitespace-nowrap">
                        {fmtCurrency(sale.net_proceeds)}
                      </td>

                      {/* Net Profit */}
                      <td className="py-2 px-3 font-bold whitespace-nowrap">
                        <span className={sale.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {fmtCurrency(sale.net_profit)}
                        </span>
                      </td>

                      {/* ROI % */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${sale.roi_pct >= 0 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                          {fmtPct(sale.roi_pct)}
                        </span>
                      </td>

                      {/* Days to Sell */}
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                        {sale.days_to_sell != null ? `${sale.days_to_sell}d` : '--'}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(sale.platform || '').toLowerCase().includes('ebay') && (
                            <button
                              onClick={() => setExpandedFeeRow(prev => prev === sale.id ? null : sale.id)}
                              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                                expandedFeeRow === sale.id
                                  ? 'text-amber-400 bg-amber-900/20'
                                  : 'text-slate-500 hover:text-amber-400 hover:bg-amber-900/20'
                              }`}
                              title="Reconcile eBay fees"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditSale(sale)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-amber-900/20 transition-all"
                            title="Edit transaction"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSale(sale.id)}
                            disabled={deletingId === sale.id}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-all"
                            title="Delete sale and restore item"
                          >
                            {deletingId === sale.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Fee Reconciliation sub-row (eBay only) */}
                    {expandedFeeRow === sale.id && (
                      <tr key={`recon-${sale.id}`} className="bg-slate-950/60">
                        <td colSpan={11} className="px-6 pb-3 pt-0">
                          <FeeReconciliationPanel
                            sale={sale}
                            onReconciled={(updated) => setSales(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800/40 bg-slate-950/40 flex-shrink-0">
            <span className="text-[11px] text-slate-500">
              Page {pagination.page} of {pagination.pages} ({pagination.total} sales)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fetchSales(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-2.5 py-1 rounded-md text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchSales(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-2.5 py-1 rounded-md text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log / Edit Sale Modal */}
      <LogSaleModal
        open={modalOpen}
        saleToEdit={saleToEdit}
        item={pendingSaleItem}
        platforms={platforms}
        onClose={() => {
          setModalOpen(false);
          setSaleToEdit(null);
          setPendingSaleItem(null);
        }}
        onSaved={() => {
          fetchSales(1);
          setPendingSaleItem(null);
        }}
      />
    </div>
  );
}
