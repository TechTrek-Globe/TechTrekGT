import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { getApiUrl } from '../utils/api';
import { FileSpreadsheet, ShieldCheck, Copy } from 'lucide-react';
import { getCertVerificationUrl, getAuthenticatorMeta } from '../utils/certLookup';

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

function InlineEditCell({ value, itemId, field, type = 'text', prefix, suffix, onUpdated }) {
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
      onUpdated(itemId, { [field]: parsed });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        {prefix && <span className="text-slate-500 text-xs">{prefix}</span>}
        <input
          ref={inputRef}
          type={type}
          className="w-24 bg-slate-800 border border-amber-500/40 rounded-md px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-500"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          autoFocus
        />
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />
          : <>
            <button onClick={save} className="w-5 h-5 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-900/30 transition-colors"><Check className="w-3 h-3" /></button>
            <button onClick={cancel} className="w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 transition-colors"><X className="w-3 h-3" /></button>
          </>}
      </div>
    );
  }

  const display = value != null ? `${prefix || ''}${type === 'number' ? Number(value).toFixed(2) : value}${suffix || ''}` : '--';

  return (
    <button onClick={startEdit} className="group flex items-center gap-1 text-left hover:text-amber-300 transition-colors">
      <span className={value != null ? 'text-slate-200' : 'text-slate-600'}>{display}</span>
      <Pencil className="w-3 h-3 text-slate-700 group-hover:text-amber-400/60 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" />
    </button>
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
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [copyModalItem, setCopyModalItem] = useState(null);
  const [itemToSell, setItemToSell] = useState(null);
  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [deleting,  setDeleting]  = useState(null);

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

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
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
            className="btn-secondary w-auto px-4 py-2.5 text-sm flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            <span>Import Spreadsheet</span>
          </button>
          <button
            id="add-invoice-btn"
            onClick={() => setModalOpen(true)}
            className="btn-primary w-auto px-5 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" /> Add Invoice
          </button>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-2 flex-wrap">
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
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            id="inventory-search"
            type="text"
            className="input-field pl-10 text-sm"
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
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800/60 bg-slate-950/40">
                {[
                  'Item',
                  'Status',
                  'Category',
                  'Authenticator',
                  'True Cost',
                  'Min Sell',
                  'Suggested List',
                  'Current List',
                  'Platform',
                  'Invoice',
                  ''
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                    <p className="text-sm">Loading inventory...</p>
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center">
                    <Package className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-400 font-semibold text-sm">No items yet</p>
                    <p className="text-slate-600 text-xs mt-1">Click "Add Invoice" to import your first batch of memorabilia.</p>
                  </td>
                </tr>
              )}
              {items.map((item, i) => (
                <tr
                  key={item.id}
                  className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group ${i % 2 === 0 ? 'bg-transparent' : 'bg-slate-950/20'}`}
                >
                  {/* Item Name */}
                  <td className="px-4 py-3 max-w-[220px]">
                    <p className="text-slate-200 font-medium text-xs leading-snug line-clamp-2" title={item.item_name}>
                      {item.item_name}
                    </p>
                    {item.athlete_person && (
                      <p className="text-slate-500 text-[10px] mt-0.5">{item.athlete_person}</p>
                    )}
                  </td>

                  {/* Status - inline dropdown */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <InlineStatusSelect
                      itemId={item.id}
                      current={item.status}
                      onUpdated={handleItemUpdated}
                    />
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{item.category || '--'}</td>

                  {/* Auth & Cert Verification */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {item.authenticator ? (
                      <div>
                        {getCertVerificationUrl(item.authenticator, item.cert_number) ? (
                          <a
                            href={getCertVerificationUrl(item.authenticator, item.cert_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 hover:text-blue-200 transition-colors"
                            title={`Verify with ${item.authenticator} Official Database`}
                          >
                            <ShieldCheck className="w-3 h-3 text-blue-400" />
                            <span>{item.authenticator}</span>
                            {item.cert_number && <span className="font-mono text-slate-400">#{item.cert_number}</span>}
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            <ShieldCheck className="w-3 h-3 text-slate-400" />
                            <span>{item.authenticator}</span>
                            {item.cert_number && <span className="font-mono text-slate-400">#{item.cert_number}</span>}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600 text-xs">--</span>
                    )}
                  </td>

                  {/* True Cost */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-slate-200 font-semibold">{fmtCurrency(item.true_total_cost)}</span>
                    <div className="text-[10px] text-slate-600 mt-0.5 space-x-1">
                      <span title="Discount">-{fmtCurrency(item.prorated_discount)}</span>
                      <span title="Shipping">+{fmtCurrency(item.prorated_shipping)}</span>
                      <span title="Tax">+{fmtCurrency(item.prorated_tax)}</span>
                    </div>
                  </td>

                  {/* Min Sell */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-emerald-400 font-semibold">{fmtCurrency(item.min_sell_price)}</span>
                  </td>

                  {/* Suggested List */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-blue-400 font-semibold">{fmtCurrency(item.suggested_list_price)}</span>
                  </td>

                  {/* Current List - inline editable */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <InlineEditCell
                      value={item.current_list_price}
                      itemId={item.id}
                      field="current_list_price"
                      type="number"
                      prefix="$"
                      onUpdated={handleItemUpdated}
                    />
                  </td>

                  {/* Platform */}
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    <div>{item.platform || '--'}</div>
                    {item.platform_fee_pct > 0 && (
                      <div className="text-[10px] text-slate-600">{fmtPct(item.platform_fee_pct)} fee</div>
                    )}
                  </td>

                  {/* Invoice Ref */}
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {item.invoice_ref || '--'}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
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
        onClose={() => setModalOpen(false)}
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
        onClose={() => { setSaleModalOpen(false); setItemToSell(null); }}
        onCreated={() => fetchItems(pagination.page)}
      />
      <ListingCopyModal
        isOpen={!!copyModalItem}
        item={copyModalItem}
        onClose={() => setCopyModalItem(null)}
      />
    </div>
  );
}
