import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, Plus, Search, X, RefreshCw, Loader2, AlertCircle,
  Pencil, Trash2, DollarSign, Calendar, Tag, Package, Percent, Clock, ArrowUpRight, ChevronDown, ChevronUp, ExternalLink, Sparkles
} from 'lucide-react';
import { getSales, deleteSale, getPlatforms, updateSale } from '../utils/auctionApi';
import { getApiUrl } from '../utils/api';
import { LogSaleModal } from './LogSaleModal';
import { EditItemModal } from './EditItemModal';
import { FeeReconciliationPanel } from './FeeReconciliationPanel';
import { fmtCurrency, fmtPct, computeSaleMetrics } from '../utils/formulaPreview';
import { useInventory } from '../context/InventoryContext';
import { DEFAULT_SALES_COLUMNS, saveUserSettings } from '../utils/userSettings';
import { ItemImageHoverTooltip } from './inventory/ItemImageHoverTooltip';
import { SoldEbayVineMatcherModal } from './inventory/SoldEbayVineMatcherModal';
import { InlineEditableCell } from './ui/InlineEditableCell';

export function SalesLogView() {
  const {
    items, categoryOptions, platformOptions, updateItemLocal,
    pendingSaleItem, setPendingSaleItem, ebaySyncing, handleSyncEbay,
    userSettings, setUserSettings
  } = useInventory();
  const searchInputRef = useRef(null);

  const salesColumnWidths = userSettings?.salesColumnWidths || {};
  const [resizingCol, setResizingCol] = useState(null);

  const handleResizeStart = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = salesColumnWidths[colKey] || DEFAULT_SALES_COLUMNS.find(c => c.key === colKey)?.defaultWidth || 80;
    setResizingCol({ key: colKey, startX, startWidth });
  }, [salesColumnWidths]);

  useEffect(() => {
    if (!resizingCol) return;
    const handleMouseMove = (e) => {
      const diff = e.clientX - resizingCol.startX;
      const minW = DEFAULT_SALES_COLUMNS.find(c => c.key === resizingCol.key)?.minWidth || 40;
      const newWidth = Math.max(minW, resizingCol.startWidth + diff);
      const updated = {
        ...userSettings,
        salesColumnWidths: { ...(userSettings?.salesColumnWidths || {}), [resizingCol.key]: newWidth }
      };
      if (setUserSettings) setUserSettings(updated);
      saveUserSettings(updated);
    };
    const handleMouseUp = () => setResizingCol(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, userSettings, setUserSettings]);

  const getColWidth = useCallback((colKey) => {
    const colDef = DEFAULT_SALES_COLUMNS.find(c => c.key === colKey);
    return salesColumnWidths[colKey] || colDef?.defaultWidth || 80;
  }, [salesColumnWidths]);

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
  const [showMetrics, setShowMetrics] = useState(false); // Collapsed by default for maximum table space

  const [modalOpen, setModalOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [expandedFeeRow, setExpandedFeeRow] = useState(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState(null);
  const [soldMatcherOpen, setSoldMatcherOpen] = useState(false);

  const [hoverTooltip, setHoverTooltip] = useState(null);
  const [imageHoverTarget, setImageHoverTarget] = useState(null);
  const [savingCellMap, setSavingCellMap] = useState({});
  const [editingCell, setEditingCell] = useState(null);

  const handleItemNameMouseEnter = (sale, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setImageHoverTarget({ target: sale, rect });
  };

  const handleItemNameMouseLeave = () => {
    setImageHoverTarget(null);
  };

  const showTooltip = (type, sale, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTooltip({ type, sale, rect });
  };

  const hideTooltip = () => {
    setHoverTooltip(null);
  };

  // Focus search on '/' key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const handleInlineSaleUpdate = useCallback(async (saleId, field, newValue) => {
    const oldSale = sales.find(s => s.id === saleId);
    if (!oldSale) return;

    const numVal = parseFloat(newValue) || 0;
    if (Number(oldSale[field] || 0) === numVal) return;

    // Optimistically compute new sale metrics
    const updatedSale = {
      ...oldSale,
      [field]: numVal
    };
    const metrics = computeSaleMetrics(updatedSale);
    const finalSale = {
      ...updatedSale,
      ...metrics
    };

    // Calculate diffs for summary KPI updates
    const grossDiff = (finalSale.gross_sale_price || 0) - (oldSale.gross_sale_price || 0);
    const netProceedsDiff = (finalSale.net_proceeds || 0) - (oldSale.net_proceeds || 0);
    const netProfitDiff = (finalSale.net_profit || 0) - (oldSale.net_profit || 0);

    const prevSales = [...sales];
    const prevSummary = { ...summary };

    // Apply optimistic updates to table rows and summary KPIs
    setSales(prev => prev.map(s => s.id === saleId ? finalSale : s));
    setSummary(prev => {
      const nextGross = Math.max(0, (prev.total_gross || 0) + grossDiff);
      const nextNetProceeds = (prev.total_net_proceeds || 0) + netProceedsDiff;
      const nextProfit = (prev.total_net_profit || 0) + netProfitDiff;
      const totalCost = prev.total_cost || 0;
      const nextRoi = totalCost > 0 ? (nextProfit / totalCost) : 0;
      return {
        ...prev,
        total_gross: nextGross,
        total_net_proceeds: nextNetProceeds,
        total_net_profit: nextProfit,
        blended_roi: nextRoi
      };
    });

    const cellKey = `${saleId}-${field}`;
    setSavingCellMap(prev => ({ ...prev, [cellKey]: true }));

    try {
      await updateSale(saleId, { [field]: numVal });
      if (field === 'gross_sale_price' && oldSale.item_id && updateItemLocal) {
        updateItemLocal(oldSale.item_id, { actual_sell_price: numVal });
      }
    } catch (err) {
      console.error('Failed to update sale inline:', err);
      setSales(prevSales);
      setSummary(prevSummary);
      setError(`Failed to update ${field === 'gross_sale_price' ? 'Gross Sale Price' : 'Shipping Cost'}: ${err.message || 'Server error'}`);
      throw err;
    } finally {
      setSavingCellMap(prev => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
    }
  }, [sales, summary, updateItemLocal]);

  const handleEditSale = (sale) => {
    setSaleToEdit(sale);
    setModalOpen(true);
  };

  const handleViewItemDetails = async (sale) => {
    if (!sale) return;
    // Check in local inventory context first
    let it = (items || []).find(i => String(i.id) === String(sale.item_id));
    if (it) {
      setSelectedDetailItem(it);
      return;
    }

    try {
      if (sale.item_id) {
        const res = await fetch(getApiUrl(`/api/items/${sale.item_id}`), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          it = data.item || data;
        }
      }
    } catch (_) {}

    if (!it) {
      it = {
        id: sale.item_id,
        item_name: sale.item_name,
        category: sale.category,
        athlete_person: sale.athlete_person,
        true_total_cost: sale.true_total_cost,
        status: 'Sold',
        platform: sale.platform || 'eBay',
        current_list_price: sale.gross_sale_price,
        actual_sell_price: sale.gross_sale_price,
        date_listed: sale.date_listed,
        date_sold: sale.sale_date,
        ebay_listing_id: sale.ebay_listing_id || sale.ebay_order_id,
        invoice_ref: sale.invoice_ref
      };
    }
    setSelectedDetailItem(it);
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
    <div className="w-full flex-1 flex flex-col min-h-0 space-y-1">
      {/* Unified Compact Command Bar */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap flex-shrink-0 bg-slate-900/80 px-2 py-1 rounded-xl border border-slate-800/80 backdrop-blur-sm">
        {/* Left: Title + Search Box + Platform Dropdown */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <h1 className="text-xs font-black text-white flex items-center gap-1 flex-shrink-0 mr-1">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>Sales Log</span>
          </h1>

          {/* Search Box */}
          <div className="relative min-w-[130px] max-w-[190px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 z-10 pointer-events-none" />
            <input
              ref={searchInputRef}
              id="sales-search-input"
              type="text"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-7 pr-5 py-0.5 text-[11px] text-slate-100 placeholder-slate-500 outline-none focus:border-amber-500 transition-colors h-7"
              placeholder="Search (/)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Platform Filter Dropdown */}
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className={`bg-slate-950 border rounded-lg py-0.5 px-2 text-[11px] outline-none transition-colors cursor-pointer flex-shrink-0 h-7 ${
              platformFilter
                ? 'border-amber-500/50 text-amber-400 font-semibold bg-amber-500/10'
                : 'border-slate-700/80 text-slate-300 focus:border-amber-500'
            }`}
          >
            <option value="">All Platforms</option>
            {platforms.map(p => (
              <option key={p.id || p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Right: Inline Telemetry Badges + Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          {/* Live Telemetry Micro-Pills */}
          {summary.total_count > 0 && (
            <div className="hidden lg:flex items-center gap-1 text-[10px] mr-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-slate-300 font-medium">
                <span className="font-bold text-white">{summary.total_count}</span> Sold
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium ${
                summary.total_net_profit >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                <span className="opacity-70">Profit:</span>
                <span className="font-bold font-mono">{fmtCurrency(summary.total_net_profit)}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium">
                <span className="text-amber-500/70">Gross:</span>
                <span className="font-bold font-mono">{fmtCurrency(summary.total_gross)}</span>
              </span>
              <span className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                <span className="text-blue-500/70">Net:</span>
                <span className="font-bold font-mono">{fmtCurrency(summary.total_net_proceeds)}</span>
              </span>
              <span className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                <span className="text-emerald-500/70">ROI:</span>
                <span className="font-bold font-mono">{fmtPct(summary.blended_roi)}</span>
              </span>
              <span className="hidden 2xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-medium">
                <span className="text-cyan-500/70">Avg:</span>
                <span className="font-bold font-mono">{summary.avg_days_to_sell}d</span>
              </span>
            </div>
          )}

          {/* Sync eBay Sales Button */}
          <button
            id="sales-sync-ebay-btn"
            onClick={handleSyncEbay}
            disabled={ebaySyncing || loading}
            className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 flex items-center gap-1 transition-all disabled:opacity-50 flex-shrink-0 h-7"
            title="Pull latest eBay orders and reconcile sold items"
          >
            <RefreshCw className={`w-3 h-3 ${ebaySyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync eBay</span>
          </button>

          {/* Match Sold eBay to VScout Button */}
          <button
            id="btn-match-sold-vscout"
            onClick={() => setSoldMatcherOpen(true)}
            className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-sm transition-all flex-shrink-0 h-7"
            title="Match completed eBay orders to Vine Scout items"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="hidden md:inline">Match eBay to VScout</span>
            <span className="md:hidden">Match</span>
          </button>

          {/* Stats Expand Toggle */}
          <button
            onClick={() => setShowMetrics(v => !v)}
            className={`px-1.5 py-0.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1 h-7 ${
              showMetrics
                ? 'bg-slate-800 text-amber-400 border-amber-500/30'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle expanded metrics cards"
          >
            Stats {showMetrics ? '▲' : '▼'}
          </button>

          {/* Log Sale Button */}
          <button
            id="btn-log-sale"
            onClick={handleOpenNewSale}
            className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow-sm transition-all flex-shrink-0 h-7"
            title="Record a completed sale"
          >
            <Plus className="w-3 h-3" />
            <span>+ Log Sale</span>
          </button>

          {/* Refresh Button */}
          <button
            id="refresh-sales-btn"
            onClick={() => fetchSales(pagination.page)}
            className="w-7 h-7 rounded-lg border border-slate-700 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all flex-shrink-0"
            title="Refresh sales list"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Collapsible KPI Cards Strip */}
      {showMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 flex-shrink-0">
          <div className="glass-card rounded-lg px-2 py-1 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[7.5px] uppercase tracking-wider text-slate-400 font-semibold">Total Net Profit</p>
              <p className={`text-xs sm:text-sm font-black font-mono ${summary.total_net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtCurrency(summary.total_net_profit)}
              </p>
            </div>
            <div className={`w-4 h-4 rounded flex items-center justify-center ${summary.total_net_profit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <DollarSign className="w-2.5 h-2.5" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2 py-1 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[7.5px] uppercase tracking-wider text-slate-400 font-semibold">Gross Sales Volume</p>
              <p className="text-xs sm:text-sm font-black font-mono text-amber-400">
                {fmtCurrency(summary.total_gross)}
              </p>
            </div>
            <div className="w-4 h-4 rounded bg-amber-500/10 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-2.5 h-2.5" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2 py-1 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[7.5px] uppercase tracking-wider text-slate-400 font-semibold">Net Proceeds</p>
              <p className="text-xs sm:text-sm font-black font-mono text-blue-400">
                {fmtCurrency(summary.total_net_proceeds)}
              </p>
            </div>
            <div className="w-4 h-4 rounded bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ArrowUpRight className="w-2.5 h-2.5" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2 py-1 border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[7.5px] uppercase tracking-wider text-slate-400 font-semibold">Overall ROI</p>
              <p className={`text-xs sm:text-sm font-black font-mono ${summary.blended_roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPct(summary.blended_roi)}
              </p>
            </div>
            <div className="w-4 h-4 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Percent className="w-2.5 h-2.5" />
            </div>
          </div>

          <div className="glass-card rounded-lg px-2 py-1 border border-slate-800 flex items-center justify-between col-span-2 sm:col-span-1">
            <div>
              <p className="text-[7.5px] uppercase tracking-wider text-slate-400 font-semibold">Avg Days to Sell</p>
              <p className="text-xs sm:text-sm font-black font-mono text-cyan-400">
                {summary.avg_days_to_sell} <span className="text-[9px] font-normal text-slate-400">days</span>
              </p>
            </div>
            <div className="w-4 h-4 rounded bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Clock className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-1.5 bg-red-950/40 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-3 h-3 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Sales Data Table Container - Compact & Fits like Inventory Tracker */}
      <div className="w-full glass-card rounded-xl overflow-hidden border border-slate-800 shadow-xl flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 relative">
          <table className="w-full text-xs border-collapse table-fixed">
            <thead className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md shadow-sm">
              <tr className="border-b border-slate-800 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                {DEFAULT_SALES_COLUMNS.map(col => {
                  const width = getColWidth(col.key);
                  return (
                    <th
                      key={col.key}
                      style={{
                        width: `${width}px`,
                        minWidth: `${col.minWidth}px`,
                        maxWidth: `${width}px`
                      }}
                      className={`py-1.5 px-2 relative select-none whitespace-nowrap overflow-hidden ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      <div className={`flex items-center gap-1 ${
                        col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                      }`}>
                        <span className="truncate">{col.label}</span>
                      </div>
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-500/50 z-40 transition-colors"
                        onMouseDown={e => handleResizeStart(e, col.key)}
                        title="Drag to resize column"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300">
              {loading && sales.length === 0 && (
                <tr>
                  <td colSpan={DEFAULT_SALES_COLUMNS.length} className="py-8 text-center text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-amber-400" />
                    <p className="text-[11px]">Loading sales log...</p>
                  </td>
                </tr>
              )}
              {!loading && sales.length === 0 && (
                <tr>
                  <td colSpan={DEFAULT_SALES_COLUMNS.length} className="py-8 text-center">
                    <TrendingUp className="w-6 h-6 text-slate-700 mx-auto mb-1" />
                    <p className="text-slate-400 font-semibold text-xs">No sales recorded yet</p>
                    <p className="text-slate-600 text-[10px] mt-0.5">Record a sale from this tab or mark an item sold in inventory.</p>
                  </td>
                </tr>
              )}
              {sales.map((sale, i) => {
                const totalDeductions = (sale.platform_fees_amt || 0) + (sale.actual_shipping_cost || 0) + (sale.payment_processing_amt || 0) + (sale.promoted_listing_fee || 0);
                const isEbay = (sale.platform || '').toLowerCase().includes('ebay');
                return (
                  <React.Fragment key={sale.id}>
                    <tr
                      className={`border-b border-slate-800/30 hover:bg-slate-800/40 transition-colors group ${
                        i % 2 === 0 ? 'bg-transparent' : 'bg-slate-950/20'
                      }`}
                    >
                      {/* Sale Date */}
                      <td
                        style={{
                          width: `${getColWidth('sale_date')}px`,
                          minWidth: '75px',
                          maxWidth: `${getColWidth('sale_date')}px`
                        }}
                        className="py-1 px-2 font-mono text-slate-400 whitespace-nowrap text-[11px] overflow-hidden truncate"
                      >
                        {sale.sale_date}
                      </td>

                      {/* Item & Details - Click to open full details */}
                      <td
                        style={{
                          width: `${getColWidth('item_name')}px`,
                          minWidth: '150px',
                          maxWidth: `${getColWidth('item_name')}px`
                        }}
                        className="py-1 px-2.5 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => handleViewItemDetails(sale)}
                          onMouseEnter={(e) => handleItemNameMouseEnter(sale, e)}
                          onMouseLeave={handleItemNameMouseLeave}
                          className="text-left group/item focus:outline-none w-full block cursor-pointer overflow-hidden"
                        >
                          <p
                            className="text-slate-100 font-semibold text-xs leading-tight truncate group-hover/item:text-amber-400 transition-colors flex items-center gap-1 min-w-0"
                            title={`${sale.item_name} - Click for full item details`}
                          >
                            <span className="truncate flex-1 min-w-0">{sale.item_name}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-slate-500 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0" />
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5 truncate min-w-0">
                            {sale.category && <span className="text-slate-400 flex-shrink-0">{sale.category}</span>}
                            {sale.athlete_person && <span className="truncate flex-shrink-0">· {sale.athlete_person}</span>}
                            {sale.invoice_ref && (
                              <span className="text-slate-600 truncate flex-shrink min-w-0" title={sale.invoice_ref}>
                                · {sale.invoice_ref}
                              </span>
                            )}
                          </div>
                        </button>
                      </td>

                      {/* Platform / Buyer */}
                      <td
                        style={{
                          width: `${getColWidth('platform')}px`,
                          minWidth: '90px',
                          maxWidth: `${getColWidth('platform')}px`
                        }}
                        className="py-1 px-2 whitespace-nowrap overflow-hidden text-left"
                      >
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 truncate max-w-full">
                          {sale.platform || 'Direct'}
                        </span>
                        {sale.buyer_handle && (
                          <p className="text-[9.5px] text-slate-400 font-mono mt-0.5 truncate" title={`@${sale.buyer_handle}`}>
                            @{sale.buyer_handle}
                          </p>
                        )}
                      </td>

                      {/* Gross Sale (with Hover Breakdown & Inline Editing) */}
                      <td
                        onMouseEnter={(e) => !editingCell && showTooltip('gross', sale, e)}
                        onMouseLeave={hideTooltip}
                        style={{
                          width: `${getColWidth('gross_sale_price')}px`,
                          minWidth: '70px',
                          maxWidth: `${getColWidth('gross_sale_price')}px`
                        }}
                        className="py-1 px-1.5 font-mono font-bold text-slate-100 text-right whitespace-nowrap text-xs overflow-hidden"
                      >
                        <InlineEditableCell
                          value={sale.gross_sale_price}
                          displayValue={fmtCurrency(sale.gross_sale_price)}
                          onSave={(newVal) => handleInlineSaleUpdate(sale.id, 'gross_sale_price', newVal)}
                          isSaving={Boolean(savingCellMap[`${sale.id}-gross_sale_price`])}
                          ariaLabel={`Gross sale price for ${sale.item_name}`}
                          colHeader="Gross Sale Price"
                          align="right"
                          textClassName="font-bold text-slate-100 underline decoration-dotted decoration-slate-700 hover:decoration-amber-400"
                          onEditStart={() => {
                            setEditingCell(`${sale.id}-gross_sale_price`);
                            hideTooltip();
                          }}
                          onEditEnd={() => setEditingCell(null)}
                          onMobileFallback={() => handleEditSale(sale)}
                        />
                      </td>

                      {/* Actual Shipping Cost (with Inline Editing) */}
                      <td
                        style={{
                          width: `${getColWidth('actual_shipping_cost')}px`,
                          minWidth: '65px',
                          maxWidth: `${getColWidth('actual_shipping_cost')}px`
                        }}
                        className="py-1 px-1.5 font-mono text-slate-300 text-right whitespace-nowrap text-xs overflow-hidden"
                      >
                        <InlineEditableCell
                          value={sale.actual_shipping_cost ?? 0}
                          displayValue={fmtCurrency(sale.actual_shipping_cost ?? 0)}
                          onSave={(newVal) => handleInlineSaleUpdate(sale.id, 'actual_shipping_cost', newVal)}
                          isSaving={Boolean(savingCellMap[`${sale.id}-actual_shipping_cost`])}
                          ariaLabel={`Actual shipping cost for ${sale.item_name}`}
                          colHeader="Actual Shipping Cost"
                          align="right"
                          textClassName="text-slate-300 underline decoration-dotted decoration-slate-700 hover:decoration-amber-400"
                          onEditStart={() => {
                            setEditingCell(`${sale.id}-actual_shipping_cost`);
                            hideTooltip();
                          }}
                          onEditEnd={() => setEditingCell(null)}
                          onMobileFallback={() => handleEditSale(sale)}
                        />
                      </td>

                      {/* Landed Cost (with Hover Breakdown) */}
                      <td
                        onMouseEnter={(e) => showTooltip('cost', sale, e)}
                        onMouseLeave={hideTooltip}
                        style={{
                          width: `${getColWidth('true_total_cost')}px`,
                          minWidth: '65px',
                          maxWidth: `${getColWidth('true_total_cost')}px`
                        }}
                        className="py-1 px-2 font-mono text-slate-400 text-right whitespace-nowrap text-xs cursor-help hover:text-amber-300 transition-colors overflow-hidden truncate"
                      >
                        <span className="underline decoration-dotted decoration-slate-700 hover:decoration-amber-400">
                          {fmtCurrency(sale.true_total_cost)}
                        </span>
                      </td>

                      {/* Fees & Shipping (with Hover Breakdown) */}
                      <td
                        onMouseEnter={(e) => showTooltip('fees', sale, e)}
                        onMouseLeave={hideTooltip}
                        style={{
                          width: `${getColWidth('fees_shipping')}px`,
                          minWidth: '75px',
                          maxWidth: `${getColWidth('fees_shipping')}px`
                        }}
                        className="py-1 px-2 font-mono text-right whitespace-nowrap text-xs cursor-help hover:text-red-300 transition-colors overflow-hidden truncate"
                      >
                        <span className="underline decoration-dotted decoration-slate-700 hover:decoration-red-400 text-slate-300">
                          {fmtCurrency(sale.platform_fees_amt)}
                        </span>
                        {totalDeductions > (sale.platform_fees_amt || 0) && (
                          <p className="text-[8.5px] text-slate-500 font-mono truncate" title="Total fees & shipping deductions">
                            All: -{fmtCurrency(totalDeductions)}
                          </p>
                        )}
                      </td>

                      {/* Net Proceeds (with Hover Breakdown) */}
                      <td
                        onMouseEnter={(e) => showTooltip('proceeds', sale, e)}
                        onMouseLeave={hideTooltip}
                        style={{
                          width: `${getColWidth('net_proceeds')}px`,
                          minWidth: '75px',
                          maxWidth: `${getColWidth('net_proceeds')}px`
                        }}
                        className="py-1 px-2 font-mono font-semibold text-blue-300 text-right whitespace-nowrap text-xs cursor-help hover:text-blue-200 transition-colors overflow-hidden truncate"
                      >
                        <span className="underline decoration-dotted decoration-slate-700 hover:decoration-blue-400">
                          {fmtCurrency(sale.net_proceeds)}
                        </span>
                      </td>

                      {/* Net Profit (with Hover Breakdown) */}
                      <td
                        onMouseEnter={(e) => showTooltip('profit', sale, e)}
                        onMouseLeave={hideTooltip}
                        style={{
                          width: `${getColWidth('net_profit')}px`,
                          minWidth: '75px',
                          maxWidth: `${getColWidth('net_profit')}px`
                        }}
                        className="py-1 px-2 font-mono font-black text-right whitespace-nowrap text-xs cursor-help hover:opacity-80 transition-opacity overflow-hidden truncate"
                      >
                        <span className={`underline decoration-dotted decoration-slate-700 hover:decoration-amber-400 ${sale.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtCurrency(sale.net_profit)}
                        </span>
                      </td>

                      {/* ROI % */}
                      <td
                        style={{
                          width: `${getColWidth('roi_pct')}px`,
                          minWidth: '60px',
                          maxWidth: `${getColWidth('roi_pct')}px`
                        }}
                        className="py-1 px-2 font-mono text-right whitespace-nowrap overflow-hidden"
                      >
                        <span className={`inline-flex items-center px-1 py-0.2 rounded text-[9.5px] font-bold ${
                          sale.roi_pct >= 0
                            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                            : 'text-red-400 bg-red-500/10 border border-red-500/20'
                        }`}>
                          {fmtPct(sale.roi_pct)}
                        </span>
                      </td>

                      {/* Days to Sell */}
                      <td
                        style={{
                          width: `${getColWidth('days_to_sell')}px`,
                          minWidth: '45px',
                          maxWidth: `${getColWidth('days_to_sell')}px`
                        }}
                        className="py-1 px-2 font-mono text-slate-400 text-right whitespace-nowrap text-[11px] overflow-hidden truncate"
                      >
                        {sale.days_to_sell != null ? `${sale.days_to_sell}d` : '--'}
                      </td>

                      {/* Actions */}
                      <td
                        style={{
                          width: `${getColWidth('actions')}px`,
                          minWidth: '65px',
                          maxWidth: `${getColWidth('actions')}px`
                        }}
                        className="py-1 px-2 whitespace-nowrap text-center overflow-hidden"
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          {isEbay && (
                            <button
                              onClick={() => setExpandedFeeRow(prev => prev === sale.id ? null : sale.id)}
                              className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                                expandedFeeRow === sale.id
                                  ? 'text-amber-400 bg-amber-500/20 border border-amber-500/40'
                                  : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                              }`}
                              title="Reconcile eBay fees"
                            >
                              <DollarSign className="w-2.5 h-2.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditSale(sale)}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-all"
                            title="Edit sale details"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSale(sale.id)}
                            disabled={deletingId === sale.id}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
                            title="Delete sale and revert item"
                          >
                            {deletingId === sale.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-2.5 h-2.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Fee Reconciliation Sub-Row (eBay only) */}
                    {expandedFeeRow === sale.id && (
                      <tr key={`recon-${sale.id}`} className="bg-slate-950/70 border-b border-slate-800">
                        <td colSpan={DEFAULT_SALES_COLUMNS.length} className="px-3 py-2">
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

        {/* Pagination Toolbar */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-2.5 py-1 border-t border-slate-800/60 bg-slate-950/60 flex-shrink-0 text-[10px]">
            <span className="text-slate-500">
              Page {pagination.page} of {pagination.pages} ({pagination.total} sales)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchSales(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-1.5 py-0.5 rounded text-[10px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchSales(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-1.5 py-0.5 rounded text-[10px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Calculation Tooltip */}
      {hoverTooltip && (
        <div
          className="fixed z-50 w-72 p-3 rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.max(10, hoverTooltip.rect.top - 10 > 240 ? hoverTooltip.rect.top - 8 : hoverTooltip.rect.bottom + 8),
            left: Math.min(window.innerWidth - 300, Math.max(10, hoverTooltip.rect.right - 280)),
            transform: hoverTooltip.rect.top - 10 > 240 ? 'translateY(-100%)' : 'none'
          }}
        >
          {/* 1. Landed Cost Breakdown */}
          {hoverTooltip.type === 'cost' && (() => {
            const sale = hoverTooltip.sale;
            const unitPrice = Number(sale.unit_price) || 0;
            const trueCost = Number(sale.true_total_cost) || 0;
            const isAmazon = (sale.category || '').toLowerCase().includes('amazon') ||
                             (sale.invoice_ref || '').toLowerCase().includes('amazon') ||
                             (sale.invoice_ref || '').toLowerCase().includes('vine');

            // Calculate precise item proration weight across the full invoice
            const invSubtotal = Number(sale.invoice_subtotal || 0);
            const recordedWeight = Number(sale.proration_weight || 0);
            const weight = recordedWeight > 0
              ? recordedWeight
              : (invSubtotal > 0 && unitPrice > 0 ? unitPrice / invSubtotal : 0);

            // Proportional allocations (Weighted per item, NEVER the full invoice total)
            const proratedShip = sale.prorated_shipping != null && Number(sale.prorated_shipping) > 0
              ? Number(sale.prorated_shipping)
              : (weight > 0 && sale.invoice_shipping ? weight * Number(sale.invoice_shipping) : 0);

            const proratedTax = sale.prorated_tax != null && Number(sale.prorated_tax) > 0
              ? Number(sale.prorated_tax)
              : (weight > 0 && sale.invoice_tax ? weight * Number(sale.invoice_tax) : 0);

            const proratedDiscount = sale.prorated_discount != null && Number(sale.prorated_discount) > 0
              ? Number(sale.prorated_discount)
              : (weight > 0 && sale.invoice_discount ? weight * Number(sale.invoice_discount) : 0);

            const hasProration = (proratedShip > 0 || proratedTax > 0 || proratedDiscount > 0);
            const basePrice = unitPrice > 0
              ? unitPrice
              : (hasProration ? Math.max(0, trueCost - proratedShip - proratedTax + proratedDiscount) : trueCost);

            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-slate-200 flex items-center gap-1">
                    📦 Landed Cost Calculation
                  </span>
                  {sale.invoice_ref && (
                    <span className="text-[10px] text-amber-400 font-mono">
                      Batch: {sale.invoice_ref}
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      {isAmazon ? 'Amazon Acquisition / ETV:' : 'Unit / Hammer Base Price:'}
                    </span>
                    <span className="text-slate-200">
                      {fmtCurrency(basePrice)}
                    </span>
                  </div>

                  {proratedShip > 0 && (
                    <div className="flex justify-between">
                      <div>
                        <span className="text-slate-400 block">Allocated Inbound Shipping:</span>
                        {sale.invoice_shipping != null && Number(sale.invoice_shipping) > 0 && (
                          <span className="text-[9px] text-slate-500 block font-sans">
                            ({(weight > 0 ? (weight * 100).toFixed(1) : ((proratedShip / Number(sale.invoice_shipping)) * 100).toFixed(1))}% of {fmtCurrency(sale.invoice_shipping)} invoice shipping)
                          </span>
                        )}
                      </div>
                      <span className="text-slate-200">+{fmtCurrency(proratedShip)}</span>
                    </div>
                  )}

                  {proratedTax > 0 && (
                    <div className="flex justify-between">
                      <div>
                        <span className="text-slate-400 block">Allocated Sales Tax:</span>
                        {sale.invoice_tax != null && Number(sale.invoice_tax) > 0 && (
                          <span className="text-[9px] text-slate-500 block font-sans">
                            ({(weight > 0 ? (weight * 100).toFixed(1) : ((proratedTax / Number(sale.invoice_tax)) * 100).toFixed(1))}% of {fmtCurrency(sale.invoice_tax)} invoice tax)
                          </span>
                        )}
                      </div>
                      <span className="text-slate-200">+{fmtCurrency(proratedTax)}</span>
                    </div>
                  )}

                  {proratedDiscount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <div>
                        <span className="block">Allocated Invoice Discount:</span>
                        {sale.invoice_discount != null && Number(sale.invoice_discount) > 0 && (
                          <span className="text-[9px] text-emerald-500/80 block font-sans">
                            ({(weight > 0 ? (weight * 100).toFixed(1) : ((proratedDiscount / Number(sale.invoice_discount)) * 100).toFixed(1))}% of -{fmtCurrency(sale.invoice_discount)} invoice discount)
                          </span>
                        )}
                      </div>
                      <span>-{fmtCurrency(proratedDiscount)}</span>
                    </div>
                  )}

                  {isAmazon && !hasProration && (
                    <div className="flex justify-between text-slate-500 text-[10px]">
                      <span>Inbound Shipping & Tax:</span>
                      <span>$0.00 (Prime / Direct)</span>
                    </div>
                  )}

                  <div className="border-t border-slate-800 pt-1 flex justify-between font-bold">
                    <span className="text-amber-400">True Landed Cost:</span>
                    <span className="text-amber-400">{fmtCurrency(trueCost)}</span>
                  </div>
                </div>
                <p className="text-[9px] text-slate-500 italic pt-0.5 border-t border-slate-800/60">
                  {isAmazon
                    ? 'Amazon item acquisition (single unit price, $0 inbound freight/tax).'
                    : 'Formula: Base Price + Allocated Shipping + Allocated Tax - Allocated Discount. Invoice discounts and shipping apply across the full original invoice and are prorated to each piece based on acquisition weight.'}
                </p>
              </div>
            );
          })()}

          {/* 2. Gross Sale Breakdown */}
          {hoverTooltip.type === 'gross' && (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <span className="font-bold text-slate-200 flex items-center gap-1">
                  🏷️ Gross Sale Details
                </span>
                <span className="text-[9.5px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                  {hoverTooltip.sale.platform || 'eBay'}
                </span>
              </div>
              <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Item Selling Price:</span>
                  <span className="text-slate-200 font-bold">{fmtCurrency(hoverTooltip.sale.gross_sale_price)}</span>
                </div>
                {hoverTooltip.sale.buyer_shipping_paid != null && Number(hoverTooltip.sale.buyer_shipping_paid) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Buyer Shipping Paid:</span>
                    <span className="text-blue-300">+{fmtCurrency(hoverTooltip.sale.buyer_shipping_paid)}</span>
                  </div>
                )}
                <div className="border-t border-slate-800 pt-1 flex justify-between font-bold">
                  <span className="text-amber-400">Total Buyer Paid:</span>
                  <span className="text-amber-400">
                    {fmtCurrency((hoverTooltip.sale.gross_sale_price || 0) + (hoverTooltip.sale.buyer_shipping_paid || 0))}
                  </span>
                </div>
              </div>
              <div className="pt-1 border-t border-slate-800/60 text-[10px] text-slate-400 space-y-0.5">
                {hoverTooltip.sale.buyer_handle && <div>Buyer: <strong className="text-slate-200">@{hoverTooltip.sale.buyer_handle}</strong></div>}
                {hoverTooltip.sale.ebay_order_id && <div>Order ID: <strong className="text-slate-200">{hoverTooltip.sale.ebay_order_id}</strong></div>}
                {hoverTooltip.sale.sale_date && <div>Sale Date: <strong className="text-slate-200">{hoverTooltip.sale.sale_date}</strong></div>}
              </div>
            </div>
          )}

          {/* 3. Fees & Shipping Breakdown */}
          {hoverTooltip.type === 'fees' && (() => {
            const sale = hoverTooltip.sale;
            const totalDeductions = (sale.platform_fees_amt || 0) + (sale.actual_shipping_cost || 0) + (sale.payment_processing_amt || 0) + (sale.promoted_listing_fee || 0);
            const isEbay = (sale.platform || '').toLowerCase().includes('ebay');

            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-slate-200 flex items-center gap-1">
                    🧾 Fees & Shipping Breakdown
                  </span>
                  <span className="text-[9.5px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                    {sale.platform || 'Direct'}
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between text-red-400/90">
                    <span>Platform Fees {sale.platform_fee_pct > 0 ? `(${(sale.platform_fee_pct * 100).toFixed(1)}%):` : ':'}</span>
                    <span>-{fmtCurrency(sale.platform_fees_amt)}</span>
                  </div>

                  {sale.actual_shipping_cost != null && Number(sale.actual_shipping_cost) > 0 && (
                    <div className="flex justify-between text-red-400/90">
                      <span>Outbound Shipping Label:</span>
                      <span>-{fmtCurrency(sale.actual_shipping_cost)}</span>
                    </div>
                  )}

                  {sale.payment_processing_amt != null && Number(sale.payment_processing_amt) > 0 && (
                    <div className="flex justify-between text-red-400/90">
                      <span>Payment Processing:</span>
                      <span>-{fmtCurrency(sale.payment_processing_amt)}</span>
                    </div>
                  )}

                  {sale.promoted_listing_fee != null && Number(sale.promoted_listing_fee) > 0 && (
                    <div className="flex justify-between text-red-400/90">
                      <span>Promoted Ad Fee:</span>
                      <span>-{fmtCurrency(sale.promoted_listing_fee)}</span>
                    </div>
                  )}

                  <div className="border-t border-slate-800 pt-1 flex justify-between font-bold text-red-400">
                    <span>Total Channel Deductions:</span>
                    <span>-{fmtCurrency(totalDeductions)}</span>
                  </div>
                </div>

                <div className="pt-1 border-t border-slate-800/60 text-[9.5px] text-slate-400">
                  {sale.fee_reconciled_at ? (
                    <p className="text-emerald-400 font-medium">✓ Reconciled with live eBay Finances API</p>
                  ) : (
                    <p className="italic text-slate-500">
                      {isEbay ? 'Calculated via standard eBay Sell fee schedules.' : 'Direct / Custom channel sales deductions.'}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 4. Net Proceeds (Payout) Calculation */}
          {hoverTooltip.type === 'proceeds' && (() => {
            const sale = hoverTooltip.sale;
            const totalDeductions = (sale.platform_fees_amt || 0) + (sale.actual_shipping_cost || 0) + (sale.payment_processing_amt || 0) + (sale.promoted_listing_fee || 0);
            const totalInflow = (sale.gross_sale_price || 0) + (sale.buyer_shipping_paid || 0);

            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-slate-200 flex items-center gap-1">
                    💵 Net Proceeds (Payout) Calculation
                  </span>
                  <span className="text-[9.5px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.2 rounded border border-blue-500/20">
                    Payout
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Item Selling Price:</span>
                    <span className="text-slate-200">+{fmtCurrency(sale.gross_sale_price)}</span>
                  </div>

                  {sale.buyer_shipping_paid != null && Number(sale.buyer_shipping_paid) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Buyer Shipping Paid:</span>
                      <span className="text-blue-300">+{fmtCurrency(sale.buyer_shipping_paid)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-semibold text-slate-200 border-t border-slate-800/80 pt-0.5">
                    <span>Total Inflow (Buyer Paid):</span>
                    <span>+{fmtCurrency(totalInflow)}</span>
                  </div>

                  <div className="flex justify-between text-red-400/90">
                    <span>Total Fees & Shipping Deductions:</span>
                    <span>-{fmtCurrency(totalDeductions)}</span>
                  </div>

                  <div className="border-t border-slate-800 pt-1 flex justify-between font-bold text-blue-300 text-xs">
                    <span>Realized Net Proceeds (Payout):</span>
                    <span>{fmtCurrency(sale.net_proceeds)}</span>
                  </div>
                </div>

                <p className="text-[9px] text-slate-500 italic pt-0.5 border-t border-slate-800/60">
                  Formula: (Gross Sale + Buyer Shipping) - Total Fees & Label Cost = Net Proceeds
                </p>
              </div>
            );
          })()}

          {/* 5. Net Profit & Realized ROI Calculation */}
          {hoverTooltip.type === 'profit' && (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <span className="font-bold text-slate-200 flex items-center gap-1">
                  💰 Net Profit & ROI Calculation
                </span>
                <span className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${hoverTooltip.sale.roi_pct >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                  ROI: {fmtPct(hoverTooltip.sale.roi_pct)}
                </span>
              </div>
              <div className="space-y-1 text-slate-300 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Gross Sale Price:</span>
                  <span className="text-slate-200">+{fmtCurrency(hoverTooltip.sale.gross_sale_price)}</span>
                </div>
                {hoverTooltip.sale.buyer_shipping_paid != null && Number(hoverTooltip.sale.buyer_shipping_paid) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Buyer Shipping:</span>
                    <span className="text-slate-300">+{fmtCurrency(hoverTooltip.sale.buyer_shipping_paid)}</span>
                  </div>
                )}
                {hoverTooltip.sale.platform_fees_amt != null && Number(hoverTooltip.sale.platform_fees_amt) > 0 && (
                  <div className="flex justify-between text-red-400/90">
                    <span>Platform Fees ({(hoverTooltip.sale.platform_fee_pct * 100).toFixed(1)}%):</span>
                    <span>-{fmtCurrency(hoverTooltip.sale.platform_fees_amt)}</span>
                  </div>
                )}
                {hoverTooltip.sale.actual_shipping_cost != null && Number(hoverTooltip.sale.actual_shipping_cost) > 0 && (
                  <div className="flex justify-between text-red-400/90">
                    <span>Outbound Shipping Label:</span>
                    <span>-{fmtCurrency(hoverTooltip.sale.actual_shipping_cost)}</span>
                  </div>
                )}
                {hoverTooltip.sale.promoted_listing_fee != null && Number(hoverTooltip.sale.promoted_listing_fee) > 0 && (
                  <div className="flex justify-between text-red-400/90">
                    <span>Promoted Ad Fee:</span>
                    <span>-{fmtCurrency(hoverTooltip.sale.promoted_listing_fee)}</span>
                  </div>
                )}
                {hoverTooltip.sale.payment_processing_amt != null && Number(hoverTooltip.sale.payment_processing_amt) > 0 && (
                  <div className="flex justify-between text-red-400/90">
                    <span>Payment Processing:</span>
                    <span>-{fmtCurrency(hoverTooltip.sale.payment_processing_amt)}</span>
                  </div>
                )}
                <div className="border-t border-slate-800 pt-0.5 flex justify-between font-semibold text-blue-300">
                  <span>Realized Net Proceeds:</span>
                  <span>{fmtCurrency(hoverTooltip.sale.net_proceeds)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Less Landed Cost:</span>
                  <span className="text-red-400">-{fmtCurrency(hoverTooltip.sale.true_total_cost)}</span>
                </div>
                <div className="border-t border-slate-700 pt-1 flex justify-between font-black text-[11px]">
                  <span className={hoverTooltip.sale.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>Net Realized Profit:</span>
                  <span className={hoverTooltip.sale.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtCurrency(hoverTooltip.sale.net_profit)}</span>
                </div>
              </div>
              <p className="text-[9px] text-slate-500 italic pt-0.5 border-t border-slate-800/60">
                Formula: Net Proceeds ({fmtCurrency(hoverTooltip.sale.net_proceeds)}) - Landed Cost ({fmtCurrency(hoverTooltip.sale.true_total_cost)}) = {fmtCurrency(hoverTooltip.sale.net_profit)}
              </p>
            </div>
          )}
        </div>
      )}

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

      {/* Full Item Details Modal (Invoked on item click) */}
      <EditItemModal
        isOpen={Boolean(selectedDetailItem)}
        item={selectedDetailItem}
        initialTab="financial"
        categoryOptions={categoryOptions}
        platformOptions={platformOptions}
        onClose={() => setSelectedDetailItem(null)}
        onUpdated={(id, patch) => {
          updateItemLocal(id, patch);
          fetchSales(pagination.page);
        }}
      />

      {/* Floating Product Photo Tooltip (eBay or Amazon) */}
      {imageHoverTarget && (
        <ItemImageHoverTooltip
          target={imageHoverTarget.target}
          rect={imageHoverTarget.rect}
        />
      )}

      {/* Match Sold eBay to Vine Scout Modal */}
      <SoldEbayVineMatcherModal
        isOpen={soldMatcherOpen}
        onClose={() => setSoldMatcherOpen(false)}
        onMatched={() => {
          fetchSales(pagination.page);
        }}
      />
    </div>
  );
}

