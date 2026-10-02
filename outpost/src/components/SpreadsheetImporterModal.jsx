import React, { useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle,
  X, Loader2, ArrowRight, Database, RefreshCw, Layers, Check
} from 'lucide-react';
import { getApiUrl } from '../utils/api';

/**
 * @param {{ isOpen: boolean, onClose: () => void, onImportSuccess: () => void }} props
 */
export function SpreadsheetImporterModal({ isOpen, onClose, onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [strategy, setStrategy] = useState('append'); // 'append' | 'replace'
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  const [confirmReplace, setConfirmReplace] = useState('');

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) processFile(dropped);
  };

  const processFile = async (fileObj) => {
    setError('');
    setFile(fileObj);
    setIsProcessing(true);
    setParseProgress('Reading file...');
    try {
      const buffer = await fileObj.arrayBuffer();
      const isPdf = fileObj.name.toLowerCase().endsWith('.pdf');
      let result;
      if (isPdf) {
        setParseProgress('Parsing PDF invoice...');
        const { parsePristineAuctionPdf } = await import('../utils/pdfInvoiceParser');
        result = await parsePristineAuctionPdf(buffer);
      } else {
        setParseProgress('Parsing spreadsheet in background worker...');
        const { parseAuctionWorkbookAsync } = await import('../utils/spreadsheetWorkerClient');
        result = await parseAuctionWorkbookAsync(buffer, (prog) => {
          if (typeof prog === 'string') setParseProgress(prog);
          else if (prog?.message) setParseProgress(prog.message);
        });
      }

      if (!result || !result.items || result.items.length === 0) {
        throw new Error('No valid inventory items found in file. Check sheet structure or PDF content.');
      }
      setParsedData(result);
      setParseProgress('');
    } catch (err) {
      setError(err.message || 'Failed to parse file.');
      setParsedData(null);
      setParseProgress('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitImport = async () => {
    if (!parsedData) return;
    if (strategy === 'replace' && confirmReplace.trim() !== 'REPLACE') {
      setError('Type REPLACE in the confirmation field to proceed with replace strategy.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch(getApiUrl('/api/import/batch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          strategy,
          confirmReplace: strategy === 'replace',
          invoices: parsedData.invoices,
          items: parsedData.items,
          sales: parsedData.sales,
          comps: parsedData.comps
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Parse structured validation errors (from batch.js server-side validation)
        let errMsg = data.error || 'Import failed';
        try {
          const parsed = JSON.parse(typeof errMsg === 'string' ? errMsg : '{}');
          if (parsed.errors && Array.isArray(parsed.errors)) {
            errMsg = parsed.errors.join('\n');
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      setSuccessResult(data.imported);
      onImportSuccess?.();
    } catch (err) {
      setError(err.message || 'Import failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setParsedData(null);
    setError('');
    setParseProgress('');
    setSuccessResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Workbook & PDF Invoice Importer</h2>
              <p className="text-xs text-slate-400">Import Excel workbooks (`.xlsx`, `.xls`, `.csv`) or Pristine Auction PDF invoices</p>
            </div>
          </div>
          <button
            onClick={() => { resetState(); onClose(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 flex items-start gap-2.5 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successResult ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Migration Completed Successfully!</h3>
                <p className="text-xs text-slate-400 mt-1">Your imported records are now live in your database.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto pt-2">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Invoices</p>
                  <p className="text-base font-black text-amber-400 mt-0.5">{successResult.invoices}</p>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Items</p>
                  <p className="text-base font-black text-white mt-0.5">{successResult.items}</p>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Sales</p>
                  <p className="text-base font-black text-emerald-400 mt-0.5">{successResult.sales}</p>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Comps</p>
                  <p className="text-base font-black text-cyan-400 mt-0.5">{successResult.comps}</p>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => { resetState(); onClose(); }}
                  className="btn-primary px-6"
                >
                  View Updated Inventory
                </button>
              </div>
            </div>
          ) : !parsedData ? (
            /* Upload State */
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500/50 bg-slate-950/40 hover:bg-slate-950/70 transition-all rounded-2xl p-8 text-center cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv, .pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-3 group-hover:scale-110 transition-transform">
                  {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </div>
                <p className="text-sm font-semibold text-slate-200" role="status" aria-live="polite">
                  {isProcessing ? (parseProgress || 'Parsing file in background worker...') : 'Choose or drop your Pristine Tracker workbook or PDF invoice'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {isProcessing ? 'Background worker active - UI remains fully responsive' : 'Supports .xlsx, .xls, .csv, or .pdf (Pristine Invoices)'}
                </p>
              </div>

              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Automatic Sheet & Format Recognition</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Automatically parses purchase invoices, auctions won, adjustments, proration weights, true landed costs, and pricing floors from Excel workbooks or Pristine Auction PDF invoices.
                </p>
              </div>
            </div>
          ) : (
            /* Review & Strategy State */
            <div className="space-y-5">
              {/* File Pill */}
              <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                  <div>
                    <p className="text-xs font-bold text-white">{file?.name}</p>
                    <p className="text-[10px] text-slate-500">{(file?.size ? (file.size / 1024).toFixed(1) : 0)} KB</p>
                  </div>
                </div>
                <button
                  onClick={resetState}
                  className="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Change File
                </button>
              </div>

              {/* Data Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold">Invoices</p>
                  <p className="text-base font-black text-amber-400 mt-0.5">{parsedData.summary.invoiceCount}</p>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold">Items</p>
                  <p className="text-base font-black text-white mt-0.5">{parsedData.summary.itemCount}</p>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold">Sales</p>
                  <p className="text-base font-black text-emerald-400 mt-0.5">{parsedData.summary.salesCount}</p>
                </div>
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-[10px] uppercase font-bold">Capital Value</p>
                  <p className="text-base font-black text-cyan-400 mt-0.5">
                    ${parsedData.summary.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Items Preview Table */}
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">Item Sample Preview (First 5 Items)</p>
                <div className="border border-slate-800 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2">Item Name</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2 text-right">Landed Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {parsedData.items.slice(0, 5).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 text-slate-200 truncate max-w-[200px]">{it.item_name}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              it.status === 'Sold' ? 'bg-emerald-500/15 text-emerald-400' :
                              it.status === 'Listed' ? 'bg-blue-500/15 text-blue-400' :
                              'bg-amber-500/15 text-amber-400'
                            }`}>
                              {it.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400">{it.category}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-400">
                            ${(it.true_total_cost || it.unit_price).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Strategy Picker */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-slate-300">Import Strategy</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStrategy('append')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      strategy === 'append'
                        ? 'border-amber-500 bg-amber-500/10 text-white'
                        : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Merge / Append</span>
                      {strategy === 'append' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Add items alongside existing records without deleting anything.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStrategy('replace')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      strategy === 'replace'
                        ? 'border-rose-500 bg-rose-500/10 text-white'
                        : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-400">Clean Replace</span>
                      {strategy === 'replace' && <Check className="w-3.5 h-3.5 text-rose-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Wipe old inventory for your account and replace with this workbook.</p>
                  </button>
                </div>

                {strategy === 'replace' && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                    <p className="text-xs font-semibold text-rose-300 mb-1">DANGER: This will DELETE all existing data</p>
                    <p className="text-[11px] text-slate-400 mb-2">Type <span className="font-mono font-bold text-rose-300">REPLACE</span> to confirm:</p>
                    <input
                      type="text" autoComplete="off"
                      className="input-field w-full"
                      placeholder="Type REPLACE to confirm"
                      value={confirmReplace}
                      onChange={e => setConfirmReplace(e.target.value)}
                    />
                  </div>
                )}

              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { resetState(); onClose(); }}
            className="btn-ghost"
          >
            Cancel
          </button>

          {parsedData && !successResult && (
            <button
              type="button"
              id="confirm-import-btn"
              onClick={handleCommitImport}
              disabled={isSubmitting || (strategy === 'replace' && confirmReplace.trim() !== 'REPLACE')}
              className="btn-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Importing Data...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Execute Import ({parsedData.summary?.itemCount || parsedData.items?.length || 0} Items)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

export { SpreadsheetImporterModal as ImportView };
export default SpreadsheetImporterModal;
