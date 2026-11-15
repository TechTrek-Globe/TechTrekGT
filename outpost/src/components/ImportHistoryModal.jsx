import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, FileSpreadsheet, History, Eye, Download, ChevronDown,
  ChevronRight, Loader2, AlertCircle, X, ExternalLink, Package, Receipt, RefreshCw
} from 'lucide-react';
import {
  getImportBatches,
  getImportBatch,
  getImportBatchFileUrl
} from '../utils/auctionApi';
import { fmtCurrency } from '../utils/formulaPreview';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function getSourceBadge(sourceType) {
  const t = String(sourceType || '').toLowerCase();
  if (t === 'pdf') {
    return { label: 'PDF', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', icon: FileText };
  }
  if (t === 'xlsx' || t === 'xls' || t === 'csv') {
    return { label: t.toUpperCase(), cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: FileSpreadsheet };
  }
  if (t === 'legacy_batch') {
    return { label: 'Legacy', cls: 'bg-slate-700/60 text-slate-300 border-slate-600/50', icon: History };
  }
  return { label: 'Batch', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: FileSpreadsheet };
}

/**
 * Reusable modal that fetches an archived PDF with credentials: 'include'
 * and renders it inside an isolated blob: URL iframe with download & new-tab controls.
 */
export function SourceFilePreviewModal({ isOpen, batch, onClose }) {
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqIdRef = useRef(0);
  const activeBlobUrlRef = useRef('');

  useEffect(() => {
    const revoke = () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = '';
      }
    };

    if (!isOpen || !batch?.id) {
      revoke();
      setBlobUrl('');
      setError('');
      return undefined;
    }

    const reqId = ++reqIdRef.current;
    let active = true;

    const loadPreview = async () => {
      setLoading(true);
      setError('');
      revoke();
      try {
        const res = await fetch(getImportBatchFileUrl(batch.id, false), {
          credentials: 'include',
          cache: 'no-store'
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Failed to load archived file (${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!active || reqId !== reqIdRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        activeBlobUrlRef.current = url;
        setBlobUrl(url);
      } catch (err) {
        if (active && reqId === reqIdRef.current) {
          setError(err.message || 'Unable to preview archived file.');
        }
      } finally {
        if (active && reqId === reqIdRef.current) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      active = false;
      revoke();
    };
  }, [isOpen, batch?.id]);

  if (!isOpen || !batch) return null;

  const downloadUrl = getImportBatchFileUrl(batch.id, true);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[88dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-300 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                {batch.file_name || `Import Batch ${batch.id}`}
              </h3>
              <p className="text-[11px] text-slate-400">
                Archived {batch.source_type?.toUpperCase()} ({formatBytes(batch.file_size)})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">New Tab</span>
              </a>
            )}
            <a
              href={downloadUrl}
              download={batch.file_name || undefined}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-950 relative min-h-0">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
              <p className="text-xs font-semibold">Loading archived file...</p>
            </div>
          )}
          {error && !loading && (
            <div className="p-6 max-w-md mx-auto mt-12 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {blobUrl && !loading && !error && (
            <iframe
              src={blobUrl}
              title={batch.file_name || 'Archived Import PDF'}
              className="w-full h-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Embeddable Import History panel for viewing past PDFs, spreadsheets, and legacy batch records.
 */
export function ImportHistoryPanel({ refreshSignal = 0 }) {
  const [batches, setBatches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detailMap, setDetailMap] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [previewBatch, setPreviewBatch] = useState(null);

  const listReqIdRef = useRef(0);
  const detailReqIdRef = useRef(0);

  const loadBatches = useCallback(async (page = 1) => {
    const reqId = ++listReqIdRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await getImportBatches(page, 20);
      if (reqId === listReqIdRef.current) {
        setBatches(res.batches || []);
        setPagination(res.pagination || { page, total: 0, totalPages: 1 });
      }
    } catch (err) {
      if (reqId === listReqIdRef.current) {
        setError(err.message || 'Failed to load import history.');
      }
    } finally {
      if (reqId === listReqIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadBatches(1);
  }, [loadBatches, refreshSignal]);

  const handleToggleExpand = async (batch) => {
    if (expandedId === batch.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(batch.id);
    if (detailMap[batch.id]) return;

    const reqId = ++detailReqIdRef.current;
    setDetailLoadingId(batch.id);
    try {
      const res = await getImportBatch(batch.id);
      if (reqId === detailReqIdRef.current) {
        setDetailMap(prev => ({ ...prev, [batch.id]: res }));
      }
    } catch (err) {
      if (reqId === detailReqIdRef.current) {
        setError(err.message || 'Failed to load import batch details.');
      }
    } finally {
      if (reqId === detailReqIdRef.current) {
        setDetailLoadingId(null);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>Archived Imports &amp; Source Sheets</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Review past PDF invoices, Excel/CSV workbooks, and linked inventory cost basis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadBatches(pagination.page || 1)}
          disabled={loading}
          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && batches.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
          <p className="text-xs">Loading import archive...</p>
        </div>
      ) : batches.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-xl bg-slate-950/50 border border-slate-800">
          <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-300">No import batches archived yet</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Upload a Pristine Auction PDF or Excel/CSV workbook to archive it here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => {
            const badge = getSourceBadge(b.source_type);
            const BadgeIcon = badge.icon;
            const isExpanded = expandedId === b.id;
            const detail = detailMap[b.id];
            const hasFile = Number(b.has_file_blob) === 1;
            const isPdf = String(b.source_type || '').toLowerCase() === 'pdf';
            const downloadUrl = getImportBatchFileUrl(b.id, true);

            return (
              <div
                key={b.id}
                className="rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors overflow-hidden"
              >
                <div className="p-3 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleExpand(b)}
                    className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <span className="mt-0.5 text-slate-500 flex-shrink-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.cls}`}>
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                        <span className="text-xs font-bold text-white truncate max-w-[260px]">
                          {b.file_name || (b.invoice_refs ? `Invoices: ${b.invoice_refs}` : `Batch ${b.id.slice(0, 8)}`)}
                        </span>
                        {b.strategy === 'replace' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                            Replace
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1">
                        <span>{b.created_at ? new Date(b.created_at + (b.created_at.includes('Z') ? '' : 'Z')).toLocaleString() : '--'}</span>
                        <span>{b.invoice_count || 0} inv · {b.item_count || 0} items</span>
                        <span className="font-mono font-semibold text-amber-300">
                          {fmtCurrency(b.total_cost_basis || 0)}
                        </span>
                        {hasFile && b.file_size > 0 && (
                          <span className="text-slate-500">{formatBytes(b.file_size)}</span>
                        )}
                        {!hasFile && (
                          <span className="text-slate-500 italic">Metadata only</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {hasFile && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isPdf && (
                        <button
                          type="button"
                          onClick={() => setPreviewBatch(b)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Preview archived PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview PDF</span>
                        </button>
                      )}
                      <a
                        href={downloadUrl}
                        download={b.file_name || undefined}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
                        title="Download original file"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>Download</span>
                      </a>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-3 pt-2 border-t border-slate-800/80 bg-slate-900/40 space-y-3">
                    {detailLoadingId === b.id ? (
                      <div className="py-4 flex items-center gap-2 text-xs text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Loading batch records...</span>
                      </div>
                    ) : detail ? (
                      <>
                        {detail.invoices?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                              <Receipt className="w-3 h-3 text-amber-400" />
                              Linked Invoices ({detail.invoices.length})
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {detail.invoices.map(inv => {
                                const netInv = Number(inv.base_total || 0) - Number(inv.discount || 0) + Number(inv.shipping || 0) + Number(inv.tax || 0);
                                return (
                                  <div key={inv.id} className="px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                                    <div className="min-w-0 pr-2">
                                      <p className="font-semibold text-slate-200 truncate">#{inv.invoice_ref}</p>
                                      <p className="text-[10px] text-slate-500 truncate">{inv.date_acquired || 'No date'}</p>
                                    </div>
                                    <span className="font-mono font-bold text-amber-300 flex-shrink-0">{fmtCurrency(netInv)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {detail.items?.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                              <Package className="w-3 h-3 text-blue-400" />
                              Imported Items ({detail.items.length})
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                              {detail.items.map(it => (
                                <div key={it.id} className="px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60 flex items-center justify-between gap-2 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-slate-200 truncate">{it.item_name}</span>
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border flex-shrink-0 ${
                                        it.is_vinescout
                                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                          : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                      }`}>
                                        {it.is_vinescout ? 'VineScout' : 'Paid Invoice'}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-mono">
                                      {it.sku || 'No SKU'} · {it.status}
                                    </p>
                                  </div>
                                  <span className="font-mono font-semibold text-slate-200 flex-shrink-0">
                                    {fmtCurrency(it.true_total_cost || 0)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 italic">
                            No active items remain linked to this batch (items may have been replaced or deleted).
                          </p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} batches)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadBatches(pagination.page - 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadBatches(pagination.page + 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <SourceFilePreviewModal
        isOpen={Boolean(previewBatch)}
        batch={previewBatch}
        onClose={() => setPreviewBatch(null)}
      />
    </div>
  );
}

/**
 * Standalone modal wrapper for ImportHistoryPanel.
 */
export function ImportHistoryModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import History &amp; File Archive</h2>
              <p className="text-xs text-slate-400">Browse archived PDF invoices, Excel workbooks, and batch records</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <ImportHistoryPanel />
        </div>
      </div>
    </div>
  );
}

export default ImportHistoryModal;
