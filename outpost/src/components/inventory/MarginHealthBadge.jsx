import React from 'react';
import { MARGIN_HEALTH_CONFIG, computeMarginHealth } from '../../utils/feeEngine';
import { formatPercent } from '../../utils/formulaPreview';

/**
 * MarginHealthBadge - Visual indicator for item profit margin health.
 * Shows a glowing dot, margin percentage, and tier label with tooltip.
 */
export function MarginHealthBadge({ marginPct, netProfit, showLabel = true, size = 'sm' }) {
  const tier = computeMarginHealth(marginPct);
  const config = MARGIN_HEALTH_CONFIG[tier] || MARGIN_HEALTH_CONFIG.unknown;

  const isNumeric = marginPct != null && !isNaN(Number(marginPct));
  const displayPct = isNumeric ? formatPercent(marginPct, 1) : '--';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold border ${config.bg} ${config.border} ${config.color} transition-all`}
      title={isNumeric ? `Net Margin: ${displayPct} (${config.label}) ${netProfit != null ? `• Net Profit: $${Number(netProfit).toFixed(2)}` : ''}` : 'No price set'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse`} />
      <span className="font-mono">{displayPct}</span>
      {showLabel && (
        <span className="hidden sm:inline text-[10px] opacity-75 font-normal">
          {config.label}
        </span>
      )}
    </div>
  );
}
