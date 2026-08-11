import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Search, Filter, RefreshCw, Loader2, AlertCircle,
  Package, Pencil, Trash2, Check, X, ChevronDown, ExternalLink,
  ArrowUpDown, Eye, EyeOff, DollarSign
} from 'lucide-react';
import { getItems, updateItem, deleteItem, getInvoices } from '../utils/auctionApi';
import { AddInvoiceModal } from './AddInvoiceModal';
import { LogSaleModal } from './LogSaleModal';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';
import { ListingCopyModal } from './ListingCopyModal';
import { EditItemModal } from './EditItemModal';
import { AmazonItemModal } from './AmazonItemModal';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { getApiUrl } from '../utils/api';
import { FileSpreadsheet, ShieldCheck, Copy, Upload, ShoppingCart } from 'lucide-react';
import { getCertVerificationUrl, getAuthenticatorMeta } from '../utils/certLookup';
import { DEFAULT_COLUMNS, DEFAULT_CATEGORIES, getStoredUserSettings, saveUserSettings } from '../utils/userSettings';
import { cleanItemName, cleanAthleteName, cleanItemDescription } from '../utils/spreadsheetParser';

const STATUS_META = {
  'Available':     { color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20' },
  'Listed':        { color: 'text-blue-400',    bg: 'bg-blue-500/10',     border: 'border-blue-500/20'    },
  'Sold':          { color: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/20'   },
  'Kept for Self': { color: 'text-violet-400',  bg: 'bg-violet-500/10',   border: 'border-violet-500/20'  },
  'Returned':      { color: 'text-red-400',     bg: 'bg-red-500/10',      border: 'border-red-500/20'     },
};
const ALL_STATUSES = Object.keys(STATUS_META);

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META['Available'];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${m.color} ${m.bg} border ${m.border}`}>
      {status}
    </span>
  );
}

function InlineStatusSelect({ itemId, current, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const choose = async (status) => {
    if (status === current) { setOpen(false); return; }
    setSaving(true);
    try {
      await updateItem(itemId, { status });
      onUpdated(itemId, { status });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 group">
        <StatusBadge status={current} />
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
          : <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 glass-card rounded-xl border border-slate-700 shadow-xl min-w-[140px] overflow-hidden">
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={() => choose(s)} className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800/60 transition-colors flex items-center gap-2 ${s === current ? 'text-amber-400' : 'text-slate-300'}`}>
              {s === current && <Check className="w-3 h-3 flex-shrink-0" />}
              <span className={s !== current ? 'ml-5' : ''}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineEditCell({ value, itemId, field, type = 'text', prefix, suffix, className = '', onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const startEdit = () => {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    const parsed = type === 'number' ? (parseFloat(draft) || 0) : draft.trim();
    if (parsed === value) { cancel(); return; }
    setSaving(true);
    try {
      await updateItem(itemId, { [field]: parsed });
      if (onUpdated) onUpdated(itemId, { [field]: parsed });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 w-full">
        {prefix && <span className="text-slate-500 text-xs">{prefix}</span>}
        <input
          ref={inputRef}
          type={type}
          step={type === 'number' ? '0.01' : undefined}
          className="w-full min-w-[70px] bg-slate-800 border border-amber-500/60 rounded px-2 py-0.5 text-xs text-slate-100 outline-none focus:border-amber-500"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          autoFocus
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />}
      </div>
    );
  }

  const display = value != null && value !== '' ? `${prefix || ''}${type === 'number' ? Number(value).toFixed(2) : value}${suffix || ''}` : '--';

  return (
    <div
      onClick={startEdit}
      className={`group cursor-pointer flex items-center justify-between gap-1 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors ${className}`}
      title="Click to edit cell"
    >
      <span className={value != null && value !== '' ? 'text-slate-200' : 'text-slate-600'}>{display}</span>
      <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
    </div>
  );
}

function InlineSelectCell({ value, itemId, field, options = [], onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const choose = async (val) => {
    if (val === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await updateItem(itemId, { [field]: val });
      if (onUpdated) onUpdated(itemId, { [field]: val });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    const safeOptions = Array.isArray(options) ? options : [];
    return (
      <div className="flex items-center gap-1 w-full">
        <select
          autoFocus
          className="w-full bg-slate-800 border border-amber-500/60 rounded px-2 py-0.5 text-xs text-slate-100 outline-none focus:border-amber-500"
          value={value || ''}
          onChange={e => choose(e.target.value)}
          onBlur={() => setEditing(false)}
        >
          <option value="">-- None --</option>
          {safeOptions.map(opt => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.label : opt;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />}
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="group cursor-pointer flex items-center justify-between gap-1 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors"
      title="Click to edit cell"
    >
      <span className={value ? 'text-slate-200' : 'text-slate-600'}>{value || '--'}</span>
      <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
    </div>
  );
}

/**
 * Main inventory table view.
 */
export function InventoryView() {
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [amazonModalOpen, setAmazonModalOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [copyModalItem, setCopyModalItem] = useState(null);
  const [editModalItem, setEditModalItem] = useState(null);
  const [itemToSell, setItemToSell] = useState(null);
  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [deleting,  setDeleting]  = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Settings: Column Visibility & Column Widths
  const [userSettings, setUserSettings] = useState(getStoredUserSettings);

  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      if (e.detail) setUserSettings(e.detail);
    };
    window.addEventListener('outpost-settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('outpost-settings-updated', handleSettingsUpdate);
  }, []);

  const { columnVisibility = {}, columnWidths = {} } = userSettings || {};

  const platformOptions = useMemo(() => {
    const custom = Array.isArray(platforms) ? platforms.map(p => (typeof p === 'string' ? p : (p?.name || ''))).filter(Boolean) : [];
    const defaults = ['eBay', 'Pristine Auction', 'Mercari', 'Whatnot', 'Private Sale', 'Other'];
    return Array.from(new Set([...custom, ...defaults]));
  }, [platforms]);

  const categoryOptions = useMemo(() => {
    const configured = userSettings?.categoryOrder || DEFAULT_CATEGORIES;
    const itemCats = items.map(it => it.category).filter(Boolean);
    return Array.from(new Set([...configured, ...itemCats]));
  }, [userSettings?.categoryOrder, items]);

  const handleSort = (key) => {
    if (key === 'actions') return;
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedItems = useMemo(() => {
    if (!sortConfig.key) return items;
    return [...items].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      if (valA == null) valA = '';
      if (valB == null) valB = '';
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }
      
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, sortConfig]);

  // Column Resizing Handler
  const handleResizeStart = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const colDef = DEFAULT_COLUMNS.find(c => c.key === colKey) || { minWidth: 80, defaultWidth: 120 };
    const startWidth = columnWidths[colKey] || colDef.defaultWidth;
    let latestWidth = startWidth;

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = Math.max(colDef.minWidth, startWidth + delta);
      setUserSettings(prev => ({
        ...prev,
        columnWidths: { ...prev.columnWidths, [colKey]: latestWidth }
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setUserSettings(prev => {
        const finalWidths = { ...prev.columnWidths, [colKey]: latestWidth };
        saveUserSettings({ ...prev, columnWidths: finalWidths });
        return { ...prev, columnWidths: finalWidths };
      });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const fetchItems = useCallback(async (page = 1) => {
    setLoading(true); setError('');
    try {
      const params = { page, limit: 50 };
      if (search)       params.q      = search;
      if (statusFilter) params.status = statusFilter;
      const data = await getItems(params);
      setItems(data.items || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/platforms'), { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setPlatforms(d.platforms || []);
      }
    } catch (e) {}
  }, []);

  useEffect(() => { fetchPlatforms(); }, []);
  useEffect(() => { fetchItems(1); }, [search, statusFilter]);

  const handleItemUpdated = (id, patch) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await deleteItem(id);
      setItems(prev => prev.filter(it => it.id !== id));
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const statusCounts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = items.filter(it => it.status === s).length;
    return acc;
  }, {});

  const visibleColumns = DEFAULT_COLUMNS.filter(col => columnVisibility[col.key] !== false);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden space-y-3">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-white">Inventory</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {pagination.total} item{pagination.total !== 1 ? 's' : ''} · {fmtCurrency(items.reduce((s, it) => s + (it.true_total_cost || 0), 0))} total landed cost
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            id="import-excel-btn"
            onClick={() => setImporterOpen(true)}
            className="btn-primary w-auto px-5 py-2.5 text-sm flex items-center gap-2 font-bold shadow-lg shadow-amber-500/20 cursor-pointer"
            title="Import items in bulk from CSV, Excel, or Pristine Auction spreadsheets"
          >
            <Upload className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>Import Spreadsheet</span>
          </button>
          <button
            id="add-amazon-item-btn"
            onClick={() => setAmazonModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-orange-300 bg-orange-950/60 hover:bg-orange-900/60 border border-orange-500/40 hover:border-orange-500/60 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Import an Amazon item by ASIN or product URL"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Amazon Item
          </button>
          <button
            id="add-invoice-btn"
            onClick={() => setModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-amber-500/40 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Manually enter a single item invoice"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" /> Manual Invoice
          </button>
          <button
            id="log-sale-header-btn"
            onClick={() => {
              setItemToSell(null);
              setSaleModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 hover:border-emerald-500/60 transition-all flex items-center gap-1.5 shadow-lg cursor-pointer"
            title="Log a new completed sale"
          >
            <DollarSign className="w-3.5 h-3.5" /> Log Sale
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${!statusFilter ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}
        >
          All ({pagination.total})
        </button>
        {ALL_STATUSES.map(s => {
          const m = STATUS_META[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${active ? `${m.color} ${m.bg} ${m.border}` : 'text-slate-500 border-slate-800 hover:text-slate-300'}`}
            >
              {s} ({statusCounts[s]})
            </button>
          );
        })}
      </div>

      {/* Search + refresh */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 z-10 pointer-events-none" />
          <input
            id="inventory-search"
            type="text"
            className="input-field !pl-10 text-sm"
            placeholder="Search items, athletes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          id="refresh-btn"
          onClick={() => fetchItems(pagination.page)}
          className="w-9 h-9 rounded-xl border border-slate-700 flex items-center justify-center text-slate-500 hover:text-amber-400 hover:border-amber-500/40 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-sm flex gap-2 flex-shrink-0">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
        </div>
      )}

      {/* Table with Full Width & Vertical Extension, Sticky Header, Horizontal Scroll, Resizable Columns */}
      <div className="w-full glass-card rounded-xl overflow-hidden border border-slate-800/80 shadow-2xl flex-1 flex flex-col min-h-0">
        <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 relative">
          <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-30 bg-slate-900 shadow-md">
              <tr className="border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md">
                {visibleColumns.map(col => {
                  const width = columnWidths[col.key] || col.defaultWidth;
                  const isItemName = col.key === 'item_name';
                  const isSorted = sortConfig.key === col.key;
                  const isAction = col.key === 'actions';
                  return (
                    <th
                      key={col.key}
                      style={{ width: `${width}px`, minWidth: `${col.minWidth}px`, maxWidth: `${width}px` }}
                      className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap relative select-none group/th sticky top-0 bg-slate-900 border-b border-slate-700/80 shadow-md ${
                        isItemName ? 'left-0 z-40 border-r border-slate-700/80 shadow-r' : 'z-30'
                      } ${!isAction ? 'cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors' : ''} ${
                        isSorted ? 'text-amber-400 font-bold' : 'text-slate-400'
                      }`}
                      onClick={() => handleSort(col.key)}
                      title={!isAction ? `Sort by ${col.label}` : undefined}
                    >
                      <div className="flex items-center gap-1.5 pr-2">
                        <span>{col.label}</span>
                        {!isAction && (
                          <ArrowUpDown className={`w-3 h-3 transition-opacity ${
                            isSorted ? 'opacity-100 text-amber-400' : 'opacity-30 group-hover/th:opacity-75'
                          }`} />
                        )}
                      </div>
                      <div
                        onMouseDown={(e) => handleResizeStart(col.key, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-amber-500/40 group-hover/th:bg-slate-700/60 transition-colors z-30"
                        title="Drag to resize column"
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-16 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                    <p className="text-sm">Loading inventory...</p>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-16 text-center">
                    <Package className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-400 font-semibold text-sm">No items yet</p>
                    <p className="text-slate-600 text-xs mt-1">Click "Add Invoice" to import your first batch of memorabilia.</p>
                  </td>
                </tr>
              )}
              {sortedItems.map((item, i) => (
                <tr
                  key={item.id}
                  className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group ${i % 2 === 0 ? 'bg-transparent' : 'bg-slate-950/20'}`}
                >
                  {/* Item Name (Locked Column 1) */}
                  {columnVisibility.item_name !== false && (
                    <td
                      style={{
                        width: `${columnWidths.item_name || 220}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'item_name')?.minWidth || 150}px`,
                        maxWidth: `${columnWidths.item_name || 220}px`
                      }}
                      className={`px-4 py-3 sticky left-0 z-10 border-r border-slate-800/80 shadow-r transition-colors overflow-hidden ${
                        i % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900'
                      } group-hover:bg-slate-900`}
                    >
                      <div
                        onClick={() => setEditModalItem(item)}
                        className="group/name cursor-pointer flex items-center justify-between gap-1.5 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors"
                        title="Click to view & edit full item details"
                      >
                        <span className="text-slate-200 font-medium group-hover/name:text-amber-400 group-hover/name:underline transition-colors truncate">
                          {cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
                        </span>
                        <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover/name:text-amber-400 transition-colors opacity-0 group-hover/name:opacity-100 flex-shrink-0" />
                      </div>
                      {item.athlete_person && !item.item_name?.toLowerCase().includes(item.athlete_person.toLowerCase()) && (
                        <p className="text-slate-500 text-[10px] mt-0.5 pointer-events-none truncate">{cleanAthleteName(item.athlete_person)}</p>
                      )}
                    </td>
                  )}

                  {/* Athlete / Signer */}
                  {columnVisibility.athlete_person !== false && (
                    <td
                      style={{
                        width: `${columnWidths.athlete_person || 150}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'athlete_person')?.minWidth || 120}px`,
                        maxWidth: `${columnWidths.athlete_person || 150}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.athlete_person}
                        itemId={item.id}
                        field="athlete_person"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Status */}
                  {columnVisibility.status !== false && (
                    <td
                      style={{
                        width: `${columnWidths.status || 130}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'status')?.minWidth || 100}px`,
                        maxWidth: `${columnWidths.status || 130}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineStatusSelect
                        itemId={item.id}
                        current={item.status}
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Category */}
                  {columnVisibility.category !== false && (
                    <td
                      style={{
                        width: `${columnWidths.category || 120}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'category')?.minWidth || 100}px`,
                        maxWidth: `${columnWidths.category || 120}px`
                      }}
                      className="px-4 py-3 text-slate-400 whitespace-nowrap overflow-hidden"
                    >
                      <InlineSelectCell
                        value={item.category}
                        itemId={item.id}
                        field="category"
                        options={categoryOptions}
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Authenticator Company */}
                  {columnVisibility.authenticator !== false && (
                    <td
                      style={{
                        width: `${columnWidths.authenticator || 130}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'authenticator')?.minWidth || 110}px`,
                        maxWidth: `${columnWidths.authenticator || 130}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineSelectCell
                        value={item.authenticator ? item.authenticator.replace(/#.*$/, '').trim() : ''}
                        itemId={item.id}
                        field="authenticator"
                        options={['Beckett', 'JSA', 'PSA', 'ACOA', 'Upper Deck', 'Fanatics', 'Tristar', 'Steiner', 'Schwartz', 'Other']}
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Cert / Authenticator # */}
                  {columnVisibility.cert_number !== false && (
                    <td
                      style={{
                        width: `${columnWidths.cert_number || 120}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'cert_number')?.minWidth || 100}px`,
                        maxWidth: `${columnWidths.cert_number || 120}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.cert_number}
                        itemId={item.id}
                        field="cert_number"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* True Cost */}
                  {columnVisibility.true_total_cost !== false && (
                    <td
                      style={{
                        width: `${columnWidths.true_total_cost || 120}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'true_total_cost')?.minWidth || 100}px`,
                        maxWidth: `${columnWidths.true_total_cost || 120}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.true_total_cost}
                        itemId={item.id}
                        field="true_total_cost"
                        type="number"
                        prefix="$"
                        className="font-semibold"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Min Sell */}
                  {columnVisibility.min_sell_price !== false && (
                    <td
                      style={{
                        width: `${columnWidths.min_sell_price || 110}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'min_sell_price')?.minWidth || 90}px`,
                        maxWidth: `${columnWidths.min_sell_price || 110}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.min_sell_price}
                        itemId={item.id}
                        field="min_sell_price"
                        type="number"
                        prefix="$"
                        className="text-emerald-400 font-semibold"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Suggested List */}
                  {columnVisibility.suggested_list_price !== false && (
                    <td
                      style={{
                        width: `${columnWidths.suggested_list_price || 130}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'suggested_list_price')?.minWidth || 110}px`,
                        maxWidth: `${columnWidths.suggested_list_price || 130}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.suggested_list_price}
                        itemId={item.id}
                        field="suggested_list_price"
                        type="number"
                        prefix="$"
                        className="text-blue-400 font-semibold"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Current List */}
                  {columnVisibility.current_list_price !== false && (
                    <td
                      style={{
                        width: `${columnWidths.current_list_price || 130}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'current_list_price')?.minWidth || 110}px`,
                        maxWidth: `${columnWidths.current_list_price || 130}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.current_list_price}
                        itemId={item.id}
                        field="current_list_price"
                        type="number"
                        prefix="$"
                        className="text-amber-300 font-semibold"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Platform */}
                  {columnVisibility.platform !== false && (
                    <td
                      style={{
                        width: `${columnWidths.platform || 120}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'platform')?.minWidth || 100}px`,
                        maxWidth: `${columnWidths.platform || 120}px`
                      }}
                      className="px-4 py-3 text-slate-400 whitespace-nowrap overflow-hidden"
                    >
                      <InlineSelectCell
                        value={item.platform}
                        itemId={item.id}
                        field="platform"
                        options={platformOptions}
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Invoice Ref */}
                  {columnVisibility.invoice_ref !== false && (
                    <td
                      style={{
                        width: `${columnWidths.invoice_ref || 110}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'invoice_ref')?.minWidth || 90}px`,
                        maxWidth: `${columnWidths.invoice_ref || 110}px`
                      }}
                      className="px-4 py-3 text-slate-500 whitespace-nowrap overflow-hidden"
                    >
                      <InlineEditCell
                        value={item.invoice_ref}
                        itemId={item.id}
                        field="invoice_ref"
                        onUpdated={handleItemUpdated}
                      />
                    </td>
                  )}

                  {/* Actions */}
                  {columnVisibility.actions !== false && (
                    <td
                      style={{
                        width: `${columnWidths.actions || 100}px`,
                        minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'actions')?.minWidth || 80}px`,
                        maxWidth: `${columnWidths.actions || 100}px`
                      }}
                      className="px-4 py-3 whitespace-nowrap overflow-hidden"
                    >
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setCopyModalItem(item)}
                          title="Generate multi-channel listing copy (eBay/Whatnot/Mercari)"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-amber-900/20 transition-all"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {item.status !== 'Sold' && (
                          <button
                            id={`sell-item-${item.id}`}
                            onClick={() => {
                              setItemToSell(item);
                              setSaleModalOpen(true);
                            }}
                            title="Record sale for this item"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 transition-all"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          id={`delete-item-${item.id}`}
                          onClick={() => handleDelete(item.id)}
                          disabled={deleting === item.id || item.status === 'Sold'}
                          title={item.status === 'Sold' ? 'Cannot delete a sold item' : 'Delete item'}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/40 bg-slate-950/20">
            <span className="text-xs text-slate-500">
              Page {pagination.page} of {pagination.pages} ({pagination.total} items)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchItems(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => fetchItems(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddInvoiceModal
        isOpen={modalOpen}
        platforms={platforms}
        onClose={() => setModalOpen(false)}
        onCreated={() => fetchItems(1)}
      />
      <AmazonItemModal
        isOpen={amazonModalOpen}
        platforms={platforms}
        onClose={() => setAmazonModalOpen(false)}
        onCreated={() => fetchItems(1)}
      />
      <SpreadsheetImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onImportSuccess={() => fetchItems(1)}
      />
      <LogSaleModal
        isOpen={saleModalOpen}
        item={itemToSell}
        platforms={platforms}
        onClose={() => { setSaleModalOpen(false); setItemToSell(null); }}
        onCreated={() => fetchItems(pagination.page)}
      />
      <ListingCopyModal
        isOpen={!!copyModalItem}
        item={copyModalItem}
        onClose={() => setCopyModalItem(null)}
      />
      <EditItemModal
        isOpen={!!editModalItem}
        item={editModalItem}
        categoryOptions={categoryOptions}
        platformOptions={platformOptions}
        onClose={() => setEditModalItem(null)}
        onUpdated={(id, patch) => handleItemUpdated(id, patch)}
      />
    </div>
  );
}
