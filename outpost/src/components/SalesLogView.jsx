import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Plus, Search, RefreshCw, Loader2, AlertCircle,
  Pencil, Trash2, DollarSign, Calendar, Tag, Package, Percent, Clock, ArrowUpRight
} from 'lucide-react';
import { getSales, deleteSale, getPlatforms } from '../utils/auctionApi';
import { LogSaleModal } from './LogSaleModal';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';

export function SalesLogView() {
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

  const [modalOpen, setModalOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  const handleOpenNewSale = () => {
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
    <div className="flex-1 flex flex-col min-h-0 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-amber-400" />
            Sales Log & Realized Profit
          </h1>
        </div>
        <button
          id="btn-log-sale"
          onClick={handleOpenNewSale}
          className="btn-primary w-auto px-5 py-2.5 text-sm flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Log Sale
        </button>
      </div>

      {/* KPI Cards Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-shrink-0">
        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Net Profit</p>
          <p className={`text-xl font-black mt-1 ${summary.total_net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtCurrency(summary.total_net_profit)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">After cost & fees</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Gross Sales Volume</p>
          <p className="text-xl font-black text-amber-400 mt-1">
            {fmtCurrency(summary.total_gross)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Total buyer payment</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Net Proceeds</p>
          <p className="text-xl font-black text-white mt-1">
            {fmtCurrency(summary.total_net_proceeds)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Bank deposit total</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Overall ROI</p>
          <p className="text-xl font-black text-emerald-400 mt-1">
            {fmtPct(summary.blended_roi)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Completed orders</p>
        </div>

        <div className="glass-card rounded-xl p-4 border border-slate-800 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Avg Days to Sell</p>
          <p className="text-xl font-black text-blue-400 mt-1">
            {summary.avg_days_to_sell} <span className="text-xs font-normal text-slate-400">days</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Inventory turnover</p>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10 pointer-events-none" />
            <input
              id="sales-search-input"
              type="text"
              className="input-field !pl-10 text-xs"
              placeholder="Search items, athlete, buyer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            id="refresh-sales-btn"
            onClick={() => fetchSales(pagination.page)}
            className="w-9 h-9 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all"
            title="Refresh sales list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Platform filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPlatformFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${!platformFilter ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}
          >
            All Platforms
          </button>
          {platforms.map(p => (
            <button
              key={p.id || p.name}
              onClick={() => setPlatformFilter(platformFilter === p.name ? '' : p.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${platformFilter === p.name ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Sales Data Table */}
      <div className="w-full glass-card rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 relative">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-900 shadow-md">
              <tr className="border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md">
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
                    className={`px-4 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap sticky top-0 bg-slate-900 border-b border-slate-700/80 shadow-md ${
                      idx === 1 ? 'sticky left-0 z-40 border-r border-slate-700/80' : 'z-30'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && sales.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                    <p className="text-sm">Loading sales log...</p>
                  </td>
                </tr>
              )}
              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <TrendingUp className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-400 font-semibold text-sm">No sales recorded yet</p>
                    <p className="text-slate-600 text-xs mt-1">Record a sale from this tab or click "Log Sale" from your inventory.</p>
                  </td>
                </tr>
              )}
              {sales.map((sale, i) => {
                const totalDeductions = sale.platform_fees_amt + sale.actual_shipping_cost + sale.payment_processing_amt + sale.promoted_listing_fee;
                return (
                  <tr
                    key={sale.id}
                    className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group ${i % 2 === 0 ? 'bg-transparent' : 'bg-slate-950/20'}`}
                  >
                    {/* Sale Date */}
                    <td className="px-4 py-3 text-slate-300 font-medium whitespace-nowrap">
                      {sale.sale_date}
                    </td>

                    {/* Item & Details */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <p className="text-slate-200 font-semibold text-xs leading-snug line-clamp-2" title={sale.item_name}>
                        {sale.item_name}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span>{sale.category}</span>
                        {sale.athlete_person && <span>· {sale.athlete_person}</span>}
                        {sale.invoice_ref && <span>· Inv: {sale.invoice_ref}</span>}
                      </div>
                    </td>

                    {/* Platform / Buyer */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20">
                        {sale.platform}
                      </span>
                      {sale.buyer_handle && (
                        <p className="text-[10px] text-slate-500 mt-0.5">@{sale.buyer_handle}</p>
                      )}
                    </td>

                    {/* Gross Sale */}
                    <td className="px-4 py-3 font-bold text-slate-100 whitespace-nowrap">
                      {fmtCurrency(sale.gross_sale_price)}
                    </td>

                    {/* Landed Cost */}
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {fmtCurrency(sale.true_total_cost)}
                    </td>

                    {/* Platform Fee */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-300">{fmtCurrency(sale.platform_fees_amt)}</span>
                      {totalDeductions > sale.platform_fees_amt && (
                        <p className="text-[10px] text-slate-600" title="Total fees & shipping deductions">
                          All: -{fmtCurrency(totalDeductions)}
                        </p>
                      )}
                    </td>

                    {/* Net Proceeds */}
                    <td className="px-4 py-3 font-medium text-slate-200 whitespace-nowrap">
                      {fmtCurrency(sale.net_proceeds)}
                    </td>

                    {/* Net Profit */}
                    <td className="px-4 py-3 font-bold whitespace-nowrap">
                      <span className={sale.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {fmtCurrency(sale.net_profit)}
                      </span>
                    </td>

                    {/* ROI % */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${sale.roi_pct >= 0 ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}`}>
                        {fmtPct(sale.roi_pct)}
                      </span>
                    </td>

                    {/* Days to Sell */}
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {sale.days_to_sell != null ? `${sale.days_to_sell}d` : '--'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditSale(sale)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-amber-900/20 transition-all"
                          title="Edit transaction"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSale(sale.id)}
                          disabled={deletingId === sale.id}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-all"
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
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/40 bg-slate-950/20">
            <span className="text-xs text-slate-500">
              Page {pagination.page} of {pagination.pages} ({pagination.total} sales)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchSales(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchSales(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
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
        platforms={platforms}
        onClose={() => {
          setModalOpen(false);
          setSaleToEdit(null);
        }}
        onSaved={() => {
          fetchSales(1);
        }}
      />
    </div>
  );
}
