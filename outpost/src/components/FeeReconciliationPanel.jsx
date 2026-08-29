import React, { useState } from 'react';
import {
  DollarSign, CheckCircle2, AlertTriangle, Loader2,
  TrendingDown, TrendingUp, Minus, HelpCircle
} from 'lucide-react';
import { reconcileSaleFees } from '../utils/auctionApi';

/**
 * FeeReconciliationPanel
 *
 * Inline panel rendered inside SalesLogView for a specific sale row.
 * Shows actual vs estimated eBay fees from the Finances API.
 *
 * Props:
 *   sale          - auction_sales row (with optional fr.* columns from JOIN)
 *   onReconciled  - (updatedSale) => void
 */
export function FeeReconciliationPanel({ sale, onReconciled }) {
  const [ebayOrderId, setEbayOrderId] = useState(sale?.ebay_order_id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingScope, setPendingScope] = useState(false);
  const [result, setResult] = useState(
    sale?.fee_reconciled_at
      ? {
          reconciled: true,
          fee_breakdown: {
            final_value_fee: sale.total_ebay_fees ?? null,
            promoted_listing_fee: null,
            shipping_label_cost: null,
            payment_processing_fee: null,
            regulatory_fee: null,
            total_ebay_fees: sale.total_ebay_fees ?? null
          },
          estimated_fees: sale.platform_fees_amt,
          fee_delta: sale.fee_delta,
          reconciled_net_profit: sale.reconciled_net_profit,
          promoted_listing_active: sale.promoted_listing_active
        }
      : null
  );

  const handleReconcile = async () => {
    const trimmedId = ebayOrderId.trim();
    if (!trimmedId) { setError('Enter the eBay Order ID to reconcile.'); return; }

    setLoading(true);
    setError('');
    setPendingScope(false);

    try {
      const data = await reconcileSaleFees(sale.id, trimmedId);
      if (data.pending_scope_approval) {
        setPendingScope(true);
        return;
      }
      setResult(data);
      if (onReconciled) onReconciled({ ...sale, ebay_order_id: trimmedId, fee_reconciled_at: new Date().toISOString(), ...data });
    } catch (e) {
      setError(e.message || 'Reconciliation failed');
    } finally {
      setLoading(false);
    }
  };

  const isEbayPlatform = (sale?.platform || '').toLowerCase().includes('ebay');
  if (!isEbayPlatform) return null;

  const alreadyReconciled = !!result?.reconciled;
  const feeDelta = alreadyReconciled ? (result.fee_delta ?? 0) : 0;
  const deltaColor = feeDelta > 0 ? 'text-red-400' : feeDelta < 0 ? 'text-green-400' : 'text-slate-400';
  const DeltaIcon = feeDelta > 0 ? TrendingUp : feeDelta < 0 ? TrendingDown : Minus;

  return (
    <div className="mt-2 p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <DollarSign className="w-3.5 h-3.5 text-amber-400" />
          eBay Fee Reconciliation
        </div>
        {alreadyReconciled && (
          <div className="flex items-center gap-1 text-[10px] text-green-400">
            <CheckCircle2 className="w-3 h-3" /> Reconciled
          </div>
        )}
      </div>

      {pendingScope && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300">
          <HelpCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>eBay Finances API (sell.finances) scope not yet approved. Apply at developer.ebay.com under "Application Access Requests."</span>
        </div>
      )}

      {/* Reconciled breakdown */}
      {alreadyReconciled && result.fee_breakdown && (
        <div className="space-y-1">
          <FeeRow label="Final Value Fee" value={result.fee_breakdown.final_value_fee} />
          {result.fee_breakdown.promoted_listing_fee != null && result.fee_breakdown.promoted_listing_fee > 0 && (
            <FeeRow label="Promoted Listings" value={result.fee_breakdown.promoted_listing_fee} highlight />
          )}
          {result.fee_breakdown.shipping_label_cost != null && result.fee_breakdown.shipping_label_cost > 0 && (
            <FeeRow label="Shipping Label" value={result.fee_breakdown.shipping_label_cost} />
          )}
          {result.fee_breakdown.payment_processing_fee != null && result.fee_breakdown.payment_processing_fee > 0 && (
            <FeeRow label="Payment Processing" value={result.fee_breakdown.payment_processing_fee} />
          )}
          {result.fee_breakdown.regulatory_fee != null && result.fee_breakdown.regulatory_fee > 0 && (
            <FeeRow label="Regulatory Fee" value={result.fee_breakdown.regulatory_fee} />
          )}

          <div className="border-t border-slate-800 pt-1.5 mt-1.5 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Estimated fees</span>
              <span className="text-slate-300">${(result.estimated_fees || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-slate-400">Actual fees</span>
              <span className="text-slate-200">${(result.fee_breakdown.total_ebay_fees || 0).toFixed(2)}</span>
            </div>
            <div className={`flex items-center justify-between text-[11px] font-semibold ${deltaColor}`}>
              <span className="flex items-center gap-1">
                <DeltaIcon className="w-3 h-3" />
                Fee delta
              </span>
              <span>{feeDelta >= 0 ? '+' : ''}{feeDelta.toFixed(2)}</span>
            </div>
          </div>

          {result.reconciled_net_profit != null && (
            <div className="flex items-center justify-between text-xs font-bold mt-1.5 pt-1.5 border-t border-slate-800">
              <span className="text-slate-300">Reconciled Net Profit</span>
              <span className={result.reconciled_net_profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                ${result.reconciled_net_profit.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Order ID input + Reconcile button */}
      {!alreadyReconciled && (
        <div className="flex items-center gap-2">
          <input
            id={`fee-recon-order-id-${sale.id}`}
            type="text"
            value={ebayOrderId}
            onChange={e => { setEbayOrderId(e.target.value); setError(''); }}
            placeholder="eBay Order ID"
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
          <button
            id={`fee-recon-btn-${sale.id}`}
            onClick={handleReconcile}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all disabled:opacity-50 flex-shrink-0"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
            {loading ? 'Loading...' : 'Reconcile'}
          </button>
        </div>
      )}

      {alreadyReconciled && (
        <button
          id={`fee-recon-redo-${sale.id}`}
          onClick={() => setResult(null)}
          className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Re-reconcile with different Order ID
        </button>
      )}

      {error && (
        <div className="flex items-center gap-1 text-[10px] text-red-400">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}

function FeeRow({ label, value, highlight }) {
  if (value == null) return null;
  return (
    <div className={`flex justify-between text-[11px] ${highlight ? 'text-amber-300' : 'text-slate-400'}`}>
      <span>{label}</span>
      <span className={highlight ? 'font-semibold' : ''}>${Number(value).toFixed(2)}</span>
    </div>
  );
}
