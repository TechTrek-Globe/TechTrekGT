import React, { useState, useEffect } from 'react';
import { X, Receipt, ExternalLink, Calendar, DollarSign, Package, Loader2, AlertCircle, FileText } from 'lucide-react';
import { getInvoice } from '../utils/auctionApi';
import { fmtCurrency } from '../utils/formulaPreview';
import { cleanItemDescription, cleanAthleteName } from '../utils/spreadsheetParser';

export function ViewInvoiceModal({ isOpen, onClose, invoiceRef, invoiceId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);

  useEffect(() => {
    if (!isOpen || (!invoiceRef && !invoiceId)) {
      setInvoiceData(null);
      setError(null);
      return;
    }

    let active = true;
    const fetchInvoiceData = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryId = invoiceId || invoiceRef;
        const res = await getInvoice(queryId);
        if (active) {
          if (res?.invoice) {
            setInvoiceData(res);
          } else {
            setError('Invoice details could not be found.');
          }
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Failed to load invoice details.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchInvoiceData();
    return () => { active = false; };
  }, [isOpen, invoiceRef, invoiceId]);

  if (!isOpen) return null;

  const invoice = invoiceData?.invoice;
  const items = invoiceData?.items || [];

  const baseTotal = Number(invoice?.base_total || 0);
  const discount = Number(invoice?.discount || 0);
  const shipping = Number(invoice?.shipping || 0);
  const tax = Number(invoice?.tax || 0);
  const netLandedCost = baseTotal - discount + shipping + tax;

  const isPristine = invoice?.description?.toLowerCase().includes('pristine') ||
    (invoice?.invoice_ref && /^\d{6,8}$/.test(String(invoice.invoice_ref).trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in">
      <div className="bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Invoice #{invoice?.invoice_ref || invoiceRef || 'Details'}
                </h2>
                {isPristine && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Pristine Auction
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {invoice?.description || `Purchase batch reference ${invoiceRef || ''}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPristine && (
              <a
                href="https://www.pristineauction.com/my-account/invoices"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>Pristine Dashboard ↗</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-xs font-semibold uppercase tracking-wider">Loading invoice details...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-200">Unable to load invoice</p>
                <p className="text-red-400 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && invoice && (
            <>
              {/* Financial Breakdown Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Date Acquired</p>
                  <p className="text-xs font-mono font-bold text-slate-200 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{invoice.date_acquired || '--'}</span>
                  </p>
                </div>

                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Base Total</p>
                  <p className="text-xs font-mono font-bold text-slate-200 mt-1">
                    {fmtCurrency(baseTotal)}
                  </p>
                </div>

                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Discount</p>
                  <p className="text-xs font-mono font-bold text-emerald-400 mt-1">
                    -{fmtCurrency(discount)}
                  </p>
                </div>

                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Shipping &amp; Hdl</p>
                  <p className="text-xs font-mono font-bold text-slate-300 mt-1">
                    +{fmtCurrency(shipping)}
                  </p>
                </div>

                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">Sales Tax</p>
                  <p className="text-xs font-mono font-bold text-slate-300 mt-1">
                    +{fmtCurrency(tax)}
                  </p>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <p className="text-[10px] text-amber-400/90 uppercase font-bold">Landed Total</p>
                  <p className="text-xs font-mono font-bold text-amber-300 mt-1">
                    {fmtCurrency(netLandedCost)}
                  </p>
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-amber-400" />
                    <span>Allocated Items ({items.length})</span>
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Proration: unit weight based on base auction price
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="py-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 text-xs">
                    No active line items associated with this invoice.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-slate-900/90 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="px-3 py-2">Item Description</th>
                          <th className="px-3 py-2">Signer / Auth</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Prorated Disc</th>
                          <th className="px-3 py-2 text-right">Prorated Ship</th>
                          <th className="px-3 py-2 text-right">Prorated Tax</th>
                          <th className="px-3 py-2 text-right">Landed Cost</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {items.map((it, idx) => (
                          <tr key={it.id || idx} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-2 font-sans font-medium text-slate-200 truncate max-w-xs">
                              {cleanItemDescription(it.item_name, it.athlete_person, it.authenticator)}
                            </td>
                            <td className="px-3 py-2 font-sans text-slate-400 truncate max-w-[140px]">
                              {it.athlete_person ? cleanAthleteName(it.athlete_person) : '--'}
                              {it.authenticator && <span className="text-slate-500 ml-1">({it.authenticator})</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-300">
                              {fmtCurrency(it.unit_price)}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-400">
                              {Number(it.prorated_discount) > 0 ? `-${fmtCurrency(it.prorated_discount)}` : '$0.00'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-400">
                              +{fmtCurrency(it.prorated_shipping)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-400">
                              +{fmtCurrency(it.prorated_tax)}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-amber-300">
                              {fmtCurrency(it.true_total_cost)}
                            </td>
                            <td className="px-3 py-2 text-center font-sans">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                it.status === 'Sold'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : it.status === 'Listed'
                                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}>
                                {it.status || 'Available'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex-shrink-0">
          <p className="text-xs text-slate-500">
            {items.length > 0 ? `Showing ${items.length} item${items.length === 1 ? '' : 's'}` : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
