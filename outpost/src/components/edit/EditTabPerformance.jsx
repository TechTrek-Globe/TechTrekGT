import React from 'react';
import {
  BarChart2, Eye, TrendingUp, DollarSign, RefreshCw, Loader2,
  AlertTriangle, CheckCircle2, ExternalLink, Zap, ShieldAlert,
  ArrowUpRight, Info, Calendar, Sparkles, HelpCircle
} from 'lucide-react';

/**
 * Interactive Explanatory Tooltip Component
 */
function InfoTooltip({ title, children, formula, benchmark, position = 'top', align = 'center' }) {
  const alignClasses = {
    center: 'left-1/2 -translate-x-1/2',
    left: 'left-0',
    right: 'right-0'
  }[align] || 'left-1/2 -translate-x-1/2';

  const positionClasses = position === 'bottom'
    ? 'top-full mt-2'
    : 'bottom-full mb-2';

  return (
    <span className="relative inline-flex items-center group/tip cursor-help select-none" tabIndex={0} role="tooltip">
      <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-amber-400 focus:text-amber-400 transition-colors ml-1 flex-shrink-0" />
      <span className={`absolute ${positionClasses} ${alignClasses} hidden group-hover/tip:flex group-focus-within/tip:flex flex-col w-64 sm:w-72 p-3 bg-slate-950/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md z-50 pointer-events-none text-left transition-opacity duration-150`}>
        {title && (
          <span className="text-[11px] font-bold text-amber-300 pb-1 mb-1 border-b border-slate-800 flex items-center gap-1.5">
            <Info className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span>{title}</span>
          </span>
        )}
        <span className="text-[11px] leading-relaxed text-slate-300 font-normal whitespace-normal">
          {children}
        </span>
        {formula && (
          <span className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] font-mono text-cyan-300 bg-slate-900/60 px-2 py-1 rounded">
            <strong>Formula:</strong> {formula}
          </span>
        )}
        {benchmark && (
          <span className="mt-1.5 text-[10px] text-slate-400 leading-normal">
            <span className="text-emerald-400 font-semibold">Benchmark:</span> {benchmark}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Pure SVG Sparkline Component
 */
function MiniSparkline({ data = [], color = '#f59e0b', height = 36, width = 120 }) {
  if (!data || data.length < 2) {
    return <div className="h-9 w-full bg-slate-900/50 rounded flex items-center justify-center text-[10px] text-slate-600">No trend data</div>;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 3;
  const innerHeight = height - padding * 2;
  const innerWidth = width - padding * 2;

  const points = data.map((val, idx) => {
    const x = padding + (idx / (data.length - 1)) * innerWidth;
    const y = height - padding - ((val - min) / range) * innerHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-9 overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
        fill={`url(#grad-${color.replace('#', '')})`}
      />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

/**
 * Pure SVG Stacked Bar Chart for Daily Impressions (Promoted + Organic) & Page Views Line
 */
function ImpressionsAndViewsChart({ dates = [], impressions = [], promotedSeries = [], pageViews = [] }) {
  if (!dates || dates.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs">
        <BarChart2 className="w-8 h-8 text-slate-600 mb-2" />
        <span>No daily impressions data recorded for this date range.</span>
      </div>
    );
  }

  const chartWidth = 720;
  const chartHeight = 220;
  const paddingLeft = 45;
  const paddingRight = 45;
  const paddingTop = 25;
  const paddingBottom = 35;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const maxImpression = Math.max(...impressions, 10);
  const maxPageView = Math.max(...pageViews, 5);

  const n = dates.length;
  const barWidth = Math.max(3, Math.min(18, (plotWidth / n) * 0.7));
  const slotWidth = plotWidth / n;

  // Grid steps (4 horizontal guide lines)
  const yTicks = [0, 0.33, 0.66, 1.0];

  // Page views polyline points
  const viewPoints = pageViews.map((pv, idx) => {
    const x = paddingLeft + idx * slotWidth + slotWidth / 2;
    const y = paddingTop + plotHeight - (pv / maxPageView) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
      <div className="min-w-[580px]">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto text-slate-400 select-none">
          {/* Horizontal Grid Lines */}
          {yTicks.map((ratio, idx) => {
            const y = paddingTop + plotHeight - ratio * plotHeight;
            const impVal = Math.round(ratio * maxImpression);
            const viewVal = Math.round(ratio * maxPageView);
            return (
              <g key={idx} className="text-[10px] font-mono">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray={idx === 0 ? "none" : "3,3"}
                  strokeWidth="1"
                />
                {/* Left Y Axis (Impressions) */}
                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fill="#94a3b8" className="text-[9px]">
                  {impVal}
                </text>
                {/* Right Y Axis (Page Views) */}
                <text x={chartWidth - paddingRight + 8} y={y + 3} textAnchor="start" fill="#38bdf8" className="text-[9px]">
                  {viewVal}
                </text>
              </g>
            );
          })}

          {/* Stacked Bars for each day */}
          {dates.map((dateStr, idx) => {
            const totalImp = impressions[idx] || 0;
            const promImp = promotedSeries[idx] || 0;
            const orgImp = Math.max(0, totalImp - promImp);

            const x = paddingLeft + idx * slotWidth + (slotWidth - barWidth) / 2;

            const totalHeight = (totalImp / maxImpression) * plotHeight;
            const promHeight = (promImp / maxImpression) * plotHeight;
            const orgHeight = totalHeight - promHeight;

            const totalY = paddingTop + plotHeight - totalHeight;
            const promY = paddingTop + plotHeight - promHeight;
            const pv = pageViews[idx] || 0;

            const isKeyDate = idx === 0 || idx === Math.floor(n / 2) || idx === n - 1 || idx % Math.ceil(n / 6) === 0;

            return (
              <g key={dateStr}>
                {/* Organic Base Bar */}
                {orgHeight > 0 && (
                  <rect
                    x={x}
                    y={totalY}
                    width={barWidth}
                    height={orgHeight}
                    fill="#334155"
                    rx="1.5"
                    className="hover:fill-slate-400 transition-colors"
                  >
                    <title>{`${dateStr}: ${totalImp} Total Impressions (${orgImp} Organic, ${promImp} Promoted) | ${pv} Page Views`}</title>
                  </rect>
                )}

                {/* Promoted Top Bar */}
                {promHeight > 0 && (
                  <rect
                    x={x}
                    y={totalY + orgHeight}
                    width={barWidth}
                    height={promHeight}
                    fill="#f59e0b"
                    rx="1.5"
                    className="hover:fill-amber-300 transition-colors"
                  >
                    <title>{`${dateStr}: ${totalImp} Total Impressions (${orgImp} Organic, ${promImp} Promoted) | ${pv} Page Views`}</title>
                  </rect>
                )}

                {/* Zero bar placeholder */}
                {totalHeight === 0 && (
                  <rect
                    x={x}
                    y={paddingTop + plotHeight - 1}
                    width={barWidth}
                    height={1}
                    fill="#1e293b"
                  >
                    <title>{`${dateStr}: 0 Impressions | ${pv} Page Views`}</title>
                  </rect>
                )}

                {/* X Axis Date Label */}
                {isKeyDate && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fill="#64748b"
                    className="text-[9px] font-mono"
                  >
                    {dateStr.slice(5)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Page Views Overlay Line */}
          {pageViews.length > 1 && (
            <>
              <polyline
                fill="none"
                stroke="#0284c7"
                strokeWidth="4"
                strokeOpacity="0.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={viewPoints}
              />
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={viewPoints}
              />
              {/* Dot markers on page views */}
              {pageViews.map((pv, idx) => {
                if (pv === 0 && n > 20) return null;
                const cx = paddingLeft + idx * slotWidth + slotWidth / 2;
                const cy = paddingTop + plotHeight - (pv / maxPageView) * plotHeight;
                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r={pv > 0 ? 3 : 1.5}
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="1"
                    className="hover:r-4 transition-all"
                  >
                    <title>{`${dates[idx]}: ${pv} Page Views`}</title>
                  </circle>
                );
              })}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * Pure SVG Dual Line Chart for CTR & Sales Conversion Rate Trends
 */
function ConversionAndCtrChart({ dates = [], ctrSeries = [], conversionSeries = [] }) {
  if (!dates || dates.length === 0) return null;

  const chartWidth = 720;
  const chartHeight = 180;
  const paddingLeft = 45;
  const paddingRight = 45;
  const paddingTop = 20;
  const paddingBottom = 35;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const maxRate = Math.max(
    Math.max(...ctrSeries, 0),
    Math.max(...conversionSeries, 0),
    0.05
  );

  const n = dates.length;
  const slotWidth = plotWidth / n;

  const ctrPoints = ctrSeries.map((val, idx) => {
    const x = paddingLeft + idx * slotWidth + slotWidth / 2;
    const y = paddingTop + plotHeight - (val / maxRate) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const convPoints = conversionSeries.map((val, idx) => {
    const x = paddingLeft + idx * slotWidth + slotWidth / 2;
    const y = paddingTop + plotHeight - (val / maxRate) * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const yTicks = [0, 0.5, 1.0];

  return (
    <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
      <div className="min-w-[580px]">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto text-slate-400 select-none">
          {/* Guide Lines */}
          {yTicks.map((ratio, idx) => {
            const y = paddingTop + plotHeight - ratio * plotHeight;
            const pctLabel = `${(ratio * maxRate * 100).toFixed(1)}%`;
            return (
              <g key={idx} className="text-[9px] font-mono">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray={idx === 0 ? "none" : "3,3"}
                  strokeWidth="1"
                />
                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fill="#94a3b8">
                  {pctLabel}
                </text>
              </g>
            );
          })}

          {/* Polyline: CTR (Purple) */}
          <polyline
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={ctrPoints}
          />

          {/* Polyline: Conversion Rate (Emerald) */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={convPoints}
          />

          {/* Markers */}
          {dates.map((d, idx) => {
            const cx = paddingLeft + idx * slotWidth + slotWidth / 2;
            const ctr = ctrSeries[idx] || 0;
            const conv = conversionSeries[idx] || 0;
            const cyCtr = paddingTop + plotHeight - (ctr / maxRate) * plotHeight;
            const cyConv = paddingTop + plotHeight - (conv / maxRate) * plotHeight;

            const isKeyDate = idx === 0 || idx === Math.floor(n / 2) || idx === n - 1 || idx % Math.ceil(n / 6) === 0;

            return (
              <g key={idx}>
                {ctr > 0 && (
                  <circle cx={cx} cy={cyCtr} r="2.5" fill="#c084fc">
                    <title>{`${d}: CTR ${(ctr * 100).toFixed(2)}%`}</title>
                  </circle>
                )}
                {conv > 0 && (
                  <circle cx={cx} cy={cyConv} r="2.5" fill="#34d399">
                    <title>{`${d}: Conversion Rate ${(conv * 100).toFixed(2)}%`}</title>
                  </circle>
                )}
                {isKeyDate && (
                  <text
                    x={cx}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fill="#64748b"
                    className="text-[9px] font-mono"
                  >
                    {d.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/**
 * EditTabPerformance Component
 */
export function EditTabPerformance({
  item,
  form,
  analytics,
  loadingAnalytics,
  analyticsError,
  analyticsRange,
  setAnalyticsRange,
  onFetchAnalytics
}) {
  const isLinked = Boolean(form.ebay_listing_id);

  if (!isLinked) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-white">Item Not Connected to eBay</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            To view live traffic reports, search impressions, and buyer conversion rates, connect this inventory piece to an active eBay store listing in the <strong className="text-amber-300 font-semibold">Listing, Pricing & Fees</strong> tab.
          </p>
        </div>
      </div>
    );
  }

  const needsReauth = analytics?.needsReauth === true;

  return (
    <div className="space-y-5">
      {/* 1. Header Toolbar & Range Filter */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <BarChart2 className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              eBay Listing Traffic & Conversion
            </span>
            <InfoTooltip
              title="eBay Telemetry Synchronization"
              position="bottom"
              align="left"
            >
              Official seller performance data ingested from eBay's Sell Analytics REST API. Reports search visibility, buyer page visits, and conversion rates with a 1-day reporting lag (T-1) in Pacific Time.
            </InfoTooltip>
          </div>

          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            <span>Listing #{form.ebay_listing_id}</span>
            <InfoTooltip
              title="eBay Listing ID"
              position="bottom"
              align="center"
            >
              The 12-digit eBay store item number. Telemetry queries filter directly by this ID to isolate metrics for this exact inventory unit.
            </InfoTooltip>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Time Range Selector */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {[30, 60, 90].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setAnalyticsRange(r);
                    onFetchAnalytics(r, false);
                  }}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${
                    analyticsRange === r
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r} Days
                </button>
              ))}
            </div>
            <InfoTooltip
              title="Reporting Window"
              position="bottom"
              align="right"
            >
              Aggregates metrics over rolling 30, 60, or 90 calendar days ending yesterday (T-1). Dates before listing creation are recorded as 0 activity.
            </InfoTooltip>
          </div>

          {/* Force Refresh Button */}
          <button
            type="button"
            disabled={loadingAnalytics}
            onClick={() => onFetchAnalytics(analyticsRange, true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
            title="Force refresh traffic report from eBay Analytics API"
          >
            {loadingAnalytics ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{loadingAnalytics ? 'Updating...' : 'Force Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Re-authorization Alert Banner */}
      {needsReauth && (
        <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="text-xs font-bold text-purple-300">eBay Analytics Scope Approval Required</h5>
            <p className="text-xs text-slate-300">
              Listing traffic reports require the <code className="text-purple-300 font-mono bg-purple-900/40 px-1 py-0.5 rounded">sell.analytics.readonly</code> permission. Re-connect your eBay account in <strong className="text-white">Settings &gt; eBay Integration</strong> to authorize analytics ingestion.
            </p>
            <a
              href="/outpost/settings"
              className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-bold underline pt-1"
            >
              Go to Settings &gt; eBay Integration <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* 2b. Completed Sale Telemetry Banner */}
      {(form.status === 'Sold' || item?.status === 'Sold') && analytics && (
        <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-bold flex items-center gap-1">
              <span>Completed Sale Telemetry</span>
              <InfoTooltip
                title="Completed Listing Telemetry"
                position="bottom"
                align="left"
              >
                Because this inventory piece has been sold, metrics represent the final lifetime search impressions, visitor views, and conversion efficiency from when it was active on eBay. Historical telemetry is preserved for post-sale performance review.
              </InfoTooltip>
            </span>
            <span className="text-slate-300 font-normal">
              Final lifetime listing traffic preserved ({analytics.total_impressions || 0} impressions, {analytics.total_page_views || 0} views, {analytics.units_sold || 1} confirmed order).
            </span>
          </div>
          <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {((analytics.sales_conversion_rate || 0)).toFixed(2)}% Conversion
          </span>
        </div>
      )}

      {/* 2c. eBay Daily Quota Notice Banner */}
      {analytics && analytics.quota_limited && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-amber-300">eBay Daily Analytics Quota Reached (100 Calls / Day)</span>
            <p className="text-slate-300">
              {analytics.quota_warning || 'eBay Sell Analytics API limits queries to 100 calls per 24 hours. The quota resets at midnight Pacific Time (07:00 UTC / 3:00 AM EDT). Baseline telemetry is active until the quota resets.'}
            </p>
          </div>
        </div>
      )}

      {/* Partial / Missing Traffic Data Banner (Active listings only, not shown if quota notice active) */}
      {!(form.status === 'Sold' || item?.status === 'Sold') && analytics && !analytics.quota_limited && analytics.data_complete === false && (analytics.missing_dates || []).length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-amber-300">Partial Traffic Data</span>
            <p className="text-slate-300">
              eBay reported no activity for {analytics.missing_dates.length} date{analytics.missing_dates.length === 1 ? '' : 's'} in this range ({analytics.missing_dates.slice(0, 3).join(', ')}{analytics.missing_dates.length > 3 ? '...' : ''}). Missing dates are excluded without synthetic interpolation.
            </p>
          </div>
        </div>
      )}

      {/* 3. Error Banner */}
      {analyticsError && !needsReauth && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="font-semibold">{analyticsError}</span>
            </div>
            <button
              type="button"
              disabled={loadingAnalytics}
              onClick={() => onFetchAnalytics(analyticsRange, true)}
              className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800/80 border border-red-500/40 text-xs text-red-200 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
          {(analyticsError.toLowerCase().includes('unauthorized') || analyticsError.toLowerCase().includes('token')) && (
            <div className="text-xs text-slate-300 pt-1 space-y-1.5 border-t border-red-500/20">
              <p>Your TechTrek Outpost login session has expired. Please log in again to refresh your credentials.</p>
              <a
                href="/outpost/login"
                className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 hover:text-amber-300 underline"
              >
                Log In to Outpost ↗
              </a>
            </div>
          )}
        </div>
      )}

      {/* 4. Loading Spinner */}
      {loadingAnalytics && !analytics && (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Fetching real-time eBay traffic report...</p>
        </div>
      )}

      {/* 4b. Empty / Error Retry State */}
      {!analytics && !loadingAnalytics && analyticsError && (
        <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-white">Traffic Telemetry Temporarily Paused</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {analyticsError.includes('rate limit')
                ? 'eBay restricts traffic report queries to protect API stability. Please allow 1 to 2 minutes for the cooldown window before retrying.'
                : 'Unable to retrieve traffic telemetry for this listing at this time. Click retry to query eBay again.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onFetchAnalytics(analyticsRange, true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Report</span>
          </button>
        </div>
      )}

      {/* 5. Analytics KPI Cards Grid */}
      {analytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Impressions Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-0.5">
                  <span>Total Impressions</span>
                  <InfoTooltip
                    title="Total Search & Browse Impressions"
                    position="top"
                    align="left"
                    benchmark="Higher impressions mean greater search discovery. Optimize keywords, item specifics, and titles to boost search ranking."
                  >
                    The total number of times your listing appeared to shoppers across eBay search results, category browse pages, and related item recommendation carousels.
                  </InfoTooltip>
                </span>
                <span className="text-amber-400 font-mono text-[10px] flex items-center gap-0.5">
                  <span>Search &amp; Ads</span>
                  <InfoTooltip
                    title="Promoted vs. Organic Impressions"
                    position="top"
                    align="left"
                  >
                    • Ad (Promoted): Impressions driven by eBay Promoted Listings Standard ad placements.
                    • Org (Organic): Natural impressions driven by keyword relevance, item specifics, and eBay Best Match ranking without ad fees.
                  </InfoTooltip>
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-white font-mono">
                  {(analytics.total_impressions || 0).toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-amber-400 font-bold font-mono">
                    {(analytics.promoted_impressions || 0).toLocaleString()} <span className="text-slate-500 font-normal">Ad</span>
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400 font-mono">
                    {(analytics.organic_impressions || 0).toLocaleString()} <span className="text-slate-500 font-normal">Org</span>
                  </span>
                </div>
              </div>
              <MiniSparkline data={analytics.impressions} color="#f59e0b" />
            </div>

            {/* Total Page Views Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-0.5">
                  <span>Listing Page Views</span>
                  <InfoTooltip
                    title="Shopper Listing Visits"
                    position="top"
                    align="center"
                    formula="Total buyer visits / page clicks"
                    benchmark="High page views relative to impressions indicate that your primary photo, title clarity, and search price are compelling."
                  >
                    The number of times shoppers clicked into your listing from search results or direct links to inspect full photos, read descriptions, verify shipping, or check specifications.
                  </InfoTooltip>
                </span>
                <Eye className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-sky-400 font-mono">
                  {(analytics.total_page_views || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                  <span>{analytics.range_days || 30}d Total</span>
                  <InfoTooltip
                    title="Period Aggregate Views"
                    position="top"
                    align="center"
                  >
                    Cumulative buyer page visits recorded during the selected {analytics.range_days || 30}-day date window.
                  </InfoTooltip>
                </span>
              </div>
              <MiniSparkline data={analytics.page_views} color="#38bdf8" />
            </div>

            {/* Click-Through Rate (CTR) Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-0.5">
                  <span>Click-Through Rate</span>
                  <InfoTooltip
                    title="Click-Through Rate (CTR)"
                    position="top"
                    align="center"
                    formula="(Listing Page Views / Total Impressions) x 100"
                    benchmark="1.5% to 3.5% is typical on eBay. Rates above 4.0% indicate exceptional primary photo appeal and competitive pricing."
                  >
                    The percentage of search impressions that prompted a shopper to click and open your listing page. Measures how effectively your primary photo, title, and asking price stand out against competitors in search.
                  </InfoTooltip>
                </span>
                <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-purple-300 font-mono">
                  {(analytics.click_through_rate || 0).toFixed(2)}%
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                  <span>Views / Impressions</span>
                </span>
              </div>
              <MiniSparkline data={(analytics.ctr_series || []).map(v => v * 100)} color="#a855f7" />
            </div>

            {/* Sales Conversion Rate Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-0.5">
                  <span>Sales Conversion Rate</span>
                  <InfoTooltip
                    title="Sales Conversion Rate"
                    position="top"
                    align="right"
                    formula="(Confirmed Orders / Listing Page Views) x 100"
                    benchmark="1.0% to 3.0% is average on eBay. For 1-of-1 items, a completed sale equals 100% / Total Page Views."
                  >
                    The percentage of shoppers who viewed this item and completed checkout. Measures the persuasiveness of your description, photo gallery, item condition, shipping options, and return policy.
                  </InfoTooltip>
                </span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {(analytics.sales_conversion_rate || 0).toFixed(2)}%
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                  <span>{analytics.units_sold ? `${analytics.units_sold} Order${analytics.units_sold === 1 ? '' : 's'} / Views` : 'Orders / Views'}</span>
                  <InfoTooltip
                    title="Confirmed Orders Basis"
                    position="top"
                    align="right"
                  >
                    Reconciled from confirmed eBay sales. Ensures that completed transactions are accurately reflected in conversion efficiency calculations.
                  </InfoTooltip>
                </span>
              </div>
              <MiniSparkline data={(analytics.conversion_series || []).map(v => v * 100)} color="#10b981" />
            </div>
          </div>

          {/* 6. Chart 1: Impressions & Page Views Time Series */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="space-y-0.5">
                <h5 className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Daily Search Impressions &amp; Page Views</span>
                  <InfoTooltip
                    title="Search Discovery vs. Shopper Visits"
                    position="bottom"
                    align="left"
                  >
                    Visualizes daily buyer discovery versus page visits. Stacked bars illustrate Promoted ad impressions (amber) versus Organic search impressions (slate), while the sky blue polyline tracks shopper page views on the right vertical axis.
                  </InfoTooltip>
                  <span className="text-[10px] text-slate-500 font-normal">({analytics.period_start} to {analytics.period_end})</span>
                </h5>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[11px] font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-slate-300">Promoted Ad</span>
                  <InfoTooltip title="Promoted Ad Impressions" position="bottom" align="center">
                    Daily impressions driven by eBay Promoted Listings Standard ad campaigns.
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
                  <span className="text-slate-300">Organic</span>
                  <InfoTooltip title="Organic Search Impressions" position="bottom" align="center">
                    Natural search and browse impressions from eBay Best Match ranking without ad fees.
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-sky-400" />
                  <span className="text-sky-400">Page Views (Right Axis)</span>
                  <InfoTooltip title="Daily Page Views" position="bottom" align="right">
                    Shopper visits to this listing page, measured on the right vertical axis.
                  </InfoTooltip>
                </div>
              </div>
            </div>

            <ImpressionsAndViewsChart
              dates={analytics.dates}
              impressions={analytics.impressions}
              promotedSeries={analytics.promoted_impressions_series}
              pageViews={analytics.page_views}
            />
          </div>

          {/* 7. Chart 2: CTR & Conversion Rate Trends */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h5 className="text-xs font-bold text-white flex items-center gap-2">
                <span>Click-Through Rate (CTR) &amp; Buyer Conversion Efficiency</span>
                <InfoTooltip
                  title="Engagement & Purchase Efficiency"
                  position="bottom"
                  align="left"
                  benchmark="Spikes in conversion rate pinpoint the exact calendar dates when buyer orders were completed."
                >
                  Compares search click-through interest (purple) against checkout conversion (emerald) over time.
                </InfoTooltip>
              </h5>

              <div className="flex items-center gap-4 text-[11px] font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-purple-400" />
                  <span className="text-purple-400">CTR (%)</span>
                  <InfoTooltip title="Daily CTR (%)" position="bottom" align="center">
                    Daily percentage of search impressions that converted into page visits (purple line).
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-emerald-400" />
                  <span className="text-emerald-400">Conversion Rate (%)</span>
                  <InfoTooltip title="Daily Conversion Rate (%)" position="bottom" align="right">
                    Daily percentage of page visitors who completed a purchase (emerald line).
                  </InfoTooltip>
                </div>
              </div>
            </div>

            <ConversionAndCtrChart
              dates={analytics.dates}
              ctrSeries={analytics.ctr_series}
              conversionSeries={analytics.conversion_series}
            />
          </div>

          {/* 8. Summary Callout & External Hub Link */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                {analytics.cached ? (
                  <>Served from 12h cache (updated {new Date(analytics.fetched_at).toLocaleTimeString()}).</>
                ) : (
                  <>Fresh data retrieved from eBay Sell Analytics API.</>
                )}
                {' '}
                {analytics.click_through_rate >= 5.0 ? (
                  <strong className="text-emerald-300 font-semibold">High CTR indicates strong buyer interest.</strong>
                ) : (
                  <span className="text-slate-400">Optimize title and primary photo to increase CTR.</span>
                )}
              </span>
            </div>

            <a
              href={`https://www.ebay.com/sh/performance/traffic?listing_id=${form.ebay_listing_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-bold underline"
            >
              <span>View in eBay Seller Hub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
