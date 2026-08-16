import React, { useState, useEffect } from 'react';
import {
  X, FileSpreadsheet, Download, Printer,
  Loader2, Calculator, Calendar, Layers, AlertCircle, Building2
} from 'lucide-react';
import { getTaxReport } from '../utils/auctionApi';

export function TaxReportModal({ isOpen, onClose }) {
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReport = async (year) => {
    setLoading(true);
    setError('');
    try {
      const res = await getTaxReport(year);
      setReportData(res);
    } catch (err) {
      setError(err.message || 'Failed to load tax report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadReport(selectedYear);
    }
  }, [isOpen, selectedYear]);

  const handlePrint = () => {
    window.print();
  };

  const exportTaxCSV = () => {
    if (!reportData) return;
    const { taxYear, scheduleC, inventoryValuation, salesLedger, suppliesLedger } = reportData;

    const lines = [
      `"TECHTREK OUTPOST - IRS SCHEDULE C TAX AUDIT WORKPAPER"`,
      `"Tax Year: ${taxYear}"`,
      `"Generated: ${new Date().toLocaleString()}"`,
      '',
      '"--- SCHEDULE C SUMMARY (Form 1040) ---"',
      `"Line 1: Gross Receipts or Sales",${scheduleC.line1_grossReceipts.toFixed(2)}`,
      `"Line 4: Cost of Goods Sold (COGS)",${scheduleC.line4_cogs.toFixed(2)}`,
      `"Line 5: Gross Profit",${scheduleC.line5_grossProfit.toFixed(2)}`,
      `"Line 10: Commissions and Platform Fees",${scheduleC.line10_commissionsAndFees.toFixed(2)}`,
      `"Line 22: Supplies (Packaging/Mailers/Slabs)",${scheduleC.line22_supplies.toFixed(2)}`,
      `"Line 27a: Shipping and Postage Paid",${scheduleC.line27a_shippingExpenses.toFixed(2)}`,
      `"Line 28: Total Deductible Expenses",${scheduleC.line28_totalExpenses.toFixed(2)}`,
      `"Line 31: Net Taxable Business Profit / (Loss)",${scheduleC.line31_netTaxableProfit.toFixed(2)}`,
      '',
      '"--- INVENTORY ASSET VALUATION (Form 1125-A) ---"',
      `"Beginning Inventory Value (Jan 1)",${inventoryValuation.beginningInventory.toFixed(2)}`,
      `"Cost of Goods Sold (COGS)",${scheduleC.line4_cogs.toFixed(2)}`,
      `"Ending Inventory Asset Value (Dec 31)",${inventoryValuation.endingInventory.toFixed(2)}`,
      '',
      '"--- ITEMIZED SALES LEDGER ---"',
      '"Sale Date","Item Name","Category","Platform","Gross Sale","Shipping Collected","Platform Fees","Shipping Cost","COGS","Net Profit"'
    ];

    for (const s of (salesLedger || [])) {
      lines.push([
        s.sale_date,
        `"${(s.item_name || '').replace(/"/g, '""')}"`,
        `"${s.category || ''}"`,
        `"${s.platform || ''}"`,
        (s.gross_sale_price || 0).toFixed(2),
        (s.buyer_shipping_paid || 0).toFixed(2),
        ((s.platform_fees_amt || 0) + (s.payment_processing_amt || 0) + (s.promoted_listing_fee || 0)).toFixed(2),
        (s.actual_shipping_cost || 0).toFixed(2),
        (s.true_total_cost || 0).toFixed(2),
        (s.net_profit || 0).toFixed(2)
      ].join(','));
    }

    lines.push('');
    lines.push('"--- ITEMIZED SUPPLIES & PACKAGING EXPENSES ---"');
    lines.push('"Purchase Date","Item Name","Category","Quantity","Total Cost","Unit Cost"');

    for (const sup of (suppliesLedger || [])) {
      lines.push([
        sup.purchase_date,
        `"${(sup.name || '').replace(/"/g, '""')}"`,
        `"${sup.category || ''}"`,
        sup.quantity,
        (sup.cost || 0).toFixed(2),
        (sup.unit_cost || 0).toFixed(3)
      ].join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + lines.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `techtrek-schedule-c-${taxYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  const sc = reportData?.scheduleC || {};
  const iv = reportData?.inventoryValuation || {};
  const years = reportData?.availableYears || [String(new Date().getFullYear())];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-5xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden my-auto animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                Year-End Tax & Schedule C Inventory Valuation
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  IRS Ready
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Official Form 1040 Schedule C workpaper with COGS, platform fee deductions, and ending inventory
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Year Selector */}
            <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
              >
                {years.map(yr => (
                  <option key={yr} value={yr} className="bg-slate-900 text-white">
                    Tax Year {yr}
                  </option>
                ))}
                <option value="all" className="bg-slate-900 text-white">All-Time Cumulative</option>
              </select>
            </div>

            <button
              onClick={exportTaxCSV}
              disabled={!reportData}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Export Schedule C CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1.5"
              title="Print Tax Summary"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <span className="text-xs font-bold">Compiling tax ledgers and inventory valuations...</span>
            </div>
          ) : reportData ? (
            <>
              {/* Primary KPI Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl glass-card-light border border-slate-800 bg-slate-900/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Line 1: Gross Receipts</span>
                  <div className="text-lg font-black text-white mt-1">
                    ${(sc.line1_grossReceipts || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-500">Gross sales + shipping</span>
                </div>

                <div className="p-4 rounded-xl glass-card-light border border-slate-800 bg-slate-900/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Line 4: Sold COGS</span>
                  <div className="text-lg font-black text-amber-400 mt-1">
                    ${(sc.line4_cogs || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-500">Cost basis of sold pieces</span>
                </div>

                <div className="p-4 rounded-xl glass-card-light border border-slate-800 bg-slate-900/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Line 28: Total Deductions</span>
                  <div className="text-lg font-black text-blue-400 mt-1">
                    ${(sc.line28_totalExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-500">Fees + postage + supplies</span>
                </div>

                <div className="p-4 rounded-xl glass-card-light border border-emerald-500/30 bg-emerald-500/10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Line 31: Net Taxable Profit</span>
                  <div className={`text-xl font-black mt-1 ${sc.line31_netTaxableProfit >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    ${(sc.line31_netTaxableProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-emerald-500/80 font-bold">Schedule C Taxable Income</span>
                </div>
              </div>

              {/* Schedule C Breakdown Table */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* IRS Form 1040 Schedule C Card */}
                <div className="glass-card-light rounded-2xl p-5 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                      IRS Form 1040 (Schedule C) Breakdown
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">Tax Year {selectedYear}</span>
                  </div>

                  <div className="space-y-2 text-xs divide-y divide-slate-800/60">
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-slate-300 font-medium">Line 1: Gross Receipts or Sales</span>
                      <span className="font-mono font-bold text-white">${(sc.line1_grossReceipts || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-amber-400 font-medium">Line 4: Cost of Goods Sold (COGS)</span>
                      <span className="font-mono font-bold text-amber-400">- ${(sc.line4_cogs || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 bg-slate-900/40 px-2 py-1 rounded-lg">
                      <span className="text-white font-bold">Line 5: Gross Profit</span>
                      <span className="font-mono font-black text-white">${(sc.line5_grossProfit || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-slate-300">Line 10: Commissions & Platform Fees (eBay/Whatnot)</span>
                      <span className="font-mono text-slate-300">- ${(sc.line10_commissionsAndFees || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-slate-300">Line 22: Supplies (Mailers, Slab Sleeves, Boxes)</span>
                      <span className="font-mono text-slate-300">- ${(sc.line22_supplies || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-slate-300">Line 27a: Other Expenses (Actual Postage Paid)</span>
                      <span className="font-mono text-slate-300">- ${(sc.line27a_shippingExpenses || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      <span className="text-blue-400 font-bold">Line 28: Total Deductible Operating Expenses</span>
                      <span className="font-mono font-bold text-blue-400">${(sc.line28_totalExpenses || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl">
                      <span className="text-emerald-300 font-black text-xs uppercase tracking-wider">
                        Line 31: Net Business Profit / (Loss)
                      </span>
                      <span className="font-mono font-black text-sm text-emerald-300">
                        ${(sc.line31_netTaxableProfit || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inventory Asset Valuation (Form 1125-A) */}
                <div className="glass-card-light rounded-2xl p-5 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        Inventory Valuation (Form 1125-A / Part III)
                      </h3>
                      <span className="text-[10px] text-slate-400">Lower of Cost or Market</span>
                    </div>

                    <div className="space-y-2.5 text-xs divide-y divide-slate-800/60 mt-3">
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-slate-300">Beginning Inventory Asset Value (Jan 1)</span>
                        <span className="font-mono font-bold text-white">
                          ${(iv.beginningInventory || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-slate-300">Total Realized COGS Deducted</span>
                        <span className="font-mono font-bold text-amber-400">
                          ${(sc.line4_cogs || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5">
                        <span className="text-white font-bold">Ending Inventory Asset Value (Dec 31)</span>
                        <span className="font-mono font-black text-emerald-400">
                          ${(iv.endingInventory || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1.5 bg-slate-900/60 px-2 py-1.5 rounded-lg">
                        <span className="text-slate-400 text-[11px]">Current Active Portfolio Capital</span>
                        <span className="font-mono text-slate-300 font-bold">
                          ${(iv.currentActiveValuation || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-[11px] text-slate-400 leading-relaxed mt-4">
                    <strong className="text-blue-300">Tax Note:</strong> Outpost utilizes the <strong>Specific Identification Method</strong> for Cost of Goods Sold (COGS). Landed costs include unit acquisition price prorated for invoice shipping, taxes, and promotional discounts.
                  </div>
                </div>
              </div>

              {/* Itemized Sales Audit Log */}
              <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/50">
                <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/70 flex items-center justify-between">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                    Itemized Sales Audit Ledger ({reportData.salesLedger?.length || 0} Transactions)
                  </h4>
                  <span className="text-[10px] text-slate-400">Schedule C supporting audit documentation</span>
                </div>

                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold sticky top-0">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Item Name</th>
                        <th className="p-2.5">Platform</th>
                        <th className="p-2.5 text-right">Gross Price</th>
                        <th className="p-2.5 text-right">COGS</th>
                        <th className="p-2.5 text-right">Fees</th>
                        <th className="p-2.5 text-right">Postage</th>
                        <th className="p-2.5 text-right">Net Gain</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {(reportData.salesLedger || []).map(s => (
                        <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-2.5 text-slate-400 font-mono whitespace-nowrap">{s.sale_date}</td>
                          <td className="p-2.5 font-bold text-white max-w-xs truncate">{s.item_name}</td>
                          <td className="p-2.5 text-slate-300">{s.platform}</td>
                          <td className="p-2.5 text-right font-mono text-slate-100">${(s.gross_sale_price || 0).toFixed(2)}</td>
                          <td className="p-2.5 text-right font-mono text-amber-400">${(s.true_total_cost || 0).toFixed(2)}</td>
                          <td className="p-2.5 text-right font-mono text-rose-400">
                            -${((s.platform_fees_amt || 0) + (s.payment_processing_amt || 0) + (s.promoted_listing_fee || 0)).toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-blue-400">-${(s.actual_shipping_cost || 0).toFixed(2)}</td>
                          <td className={`p-2.5 text-right font-mono font-bold ${s.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ${(s.net_profit || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
