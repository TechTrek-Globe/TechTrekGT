import React from 'react';
import { Receipt, DollarSign, Calculator, HelpCircle, FileText, ArrowRight } from 'lucide-react';
import { fmtCurrency } from '../../utils/formulaPreview';

export function EditTabConsignment({ form, updateField, item }) {
  const proratedTax = Number(item?.prorated_tax || 0);
  const proratedShip = Number(item?.prorated_shipping || 0);
  const proratedDisc = Number(item?.prorated_discount || 0);
  const proratedNet = proratedTax + proratedShip - proratedDisc;

  return (
    <div className="space-y-4">
      {/* Batch & Invoicing Context Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Purchase Batch & Invoicing Context</span>
          </div>
          {item?.invoice_ref && (
            <span className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Batch: {item.invoice_ref}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Invoice Reference</span>
            <span className="text-xs font-semibold text-slate-200 block mt-0.5">
              {item?.invoice_ref || item?.invoice_id ? (item.invoice_ref || item.invoice_id.slice(0, 10)) : 'Manual / Individual'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Acquisition Date</span>
            <span className="text-xs font-semibold text-slate-200 block mt-0.5">
              {form.date_acquired || form.purchase_date || item?.date_acquired || '--'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Batch Weight</span>
            <span className="text-xs font-semibold text-slate-200 block mt-0.5">
              {item?.proration_weight ? `${(Number(item.proration_weight) * 100).toFixed(1)}% weight` : '100% (Individual)'}
            </span>
          </div>
        </div>
      </div>

      {/* Landed Cost & Unit Price Editor */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div>
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Calculator className="w-4 h-4" />
            <span>Landed Cost Calculations & Overrides</span>
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Adjusting unit purchase price will automatically recalculate total landed cost including prorations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Base Unit Purchase Price ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.unit_price ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  const parsed = parseFloat(val);
                  const autoLanded = !isNaN(parsed) ? (parsed + proratedNet).toFixed(2) : '';
                  updateField('unit_price', val);
                  updateField('true_total_cost', autoLanded);
                }}
                className="input-field text-sm pl-8 font-mono font-bold text-white bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Total Landed Cost / COGS ($)</span>
              <span className="text-[10px] text-amber-400 font-semibold">True Cost</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.true_total_cost ?? ''}
                onChange={e => updateField('true_total_cost', e.target.value)}
                className="input-field text-sm pl-8 font-mono font-black text-amber-400 bg-slate-950 border-amber-500/40"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Prorated Expenses Breakdown */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
            Invoice Proration Breakdown (From Batch Ingestion)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Prorated Tax</span>
              <span className="text-xs font-semibold text-slate-200">{fmtCurrency(proratedTax)}</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Prorated Shipping</span>
              <span className="text-xs font-semibold text-slate-200">{fmtCurrency(proratedShip)}</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Prorated Discount</span>
              <span className="text-xs font-semibold text-emerald-400">-{fmtCurrency(proratedDisc)}</span>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Net Proration</span>
              <span className="text-xs font-bold text-amber-300">+{fmtCurrency(proratedNet)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
