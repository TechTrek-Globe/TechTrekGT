import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { InventoryGridRow } from './InventoryGridRow';
import { fmtCurrency } from '../../utils/formulaPreview';
import { computeFeeBreakdown } from '../../utils/feeEngine';
import { ItemImageHoverTooltip } from './ItemImageHoverTooltip';

export const DEFAULT_COLUMNS = [
  { key: 'actions', label: 'Actions', minWidth: 100 },
  { key: 'item_name', label: 'Item / Description', minWidth: 160 },
  { key: 'sku', label: 'SKU / Label', minWidth: 80 },
  { key: 'status', label: 'Status', minWidth: 100 },
  { key: 'current_list_price', label: 'List Price', minWidth: 95 },
  { key: 'net_profit', label: 'Net Profit', minWidth: 95 },
  { key: 'margin_health', label: 'Margin %', minWidth: 95 },
  { key: 'true_total_cost', label: 'Landed COGS', minWidth: 95 },
  { key: 'floor_price', label: 'Floor Price', minWidth: 85 },
  { key: 'suggested_list_price', label: 'Suggested', minWidth: 95 },
  { key: 'listing_format', label: 'Format', minWidth: 90 },
  { key: 'athlete_person', label: 'Athlete / Signer', minWidth: 110 },
  { key: 'category', label: 'Category', minWidth: 100 },
  { key: 'authenticator', label: 'Authenticator', minWidth: 100 },
  { key: 'cert_number', label: 'Cert #', minWidth: 90 },
  { key: 'platform', label: 'Platform', minWidth: 90 },
  { key: 'quantity', label: 'Qty', minWidth: 60 },
  { key: 'invoice_ref', label: 'Invoice Ref', minWidth: 80 }
];

export function InventoryDataGrid({
  items = [],
  pagination,
  onPageChange,
  sortConfig,
  onSort,
  categoryOptions,
  platformOptions,
  deleting,
  onUpdateItem,
  onDelete,
  onOpenEditModal,
  onOpenQuickEdit,
  onOpenCopyModal,
  onOpenSaleModal,
  onOpenListingIdModal,
  onMarkSold,
  userSettings,
  setUserSettings
}) {
  const columnVisibility = userSettings?.columnVisibility || {};
  const columnWidths = userSettings?.columnWidths || {};
  const [resizingCol, setResizingCol] = useState(null);
  const [hoverTooltip, setHoverTooltip] = useState(null);
  const tableRef = useRef(null);

  const actionsWidth = columnWidths.actions || 120;
  const visibleColCount = DEFAULT_COLUMNS.filter(c => columnVisibility[c.key] !== false).length;

  const showTooltip = (type, item, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverTooltip({ type, item, rect });
  };

  const hideTooltip = () => {
    setHoverTooltip(null);
  };

  // Separate active items and sold items so sold items are grouped at the bottom
  const { activeItems, soldItems } = useMemo(() => {
    const active = [];
    const sold = [];
    (items || []).forEach(it => {
      if (it.status === 'Sold') {
        sold.push(it);
      } else {
        active.push(it);
      }
    });
    return { activeItems: active, soldItems: sold };
  }, [items]);

  // Column resizing logic
  const handleResizeStart = useCallback((e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || DEFAULT_COLUMNS.find(c => c.key === colKey)?.minWidth || 100;
    setResizingCol({ key: colKey, startX, startWidth });
  }, [columnWidths]);

  useEffect(() => {
    if (!resizingCol) return;
    const handleMouseMove = (e) => {
      const diff = e.clientX - resizingCol.startX;
      const newWidth = Math.max(50, resizingCol.startWidth + diff);
      setUserSettings(prev => ({
        ...prev,
        columnWidths: { ...prev.columnWidths, [resizingCol.key]: newWidth }
      }));
    };
    const handleMouseUp = () => setResizingCol(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, setUserSettings]);

  return (
    <div className="flex-1 min-h-0 flex flex-col glass-panel rounded-2xl overflow-hidden border border-slate-800">
      <div className="flex-1 overflow-auto" ref={tableRef}>
        <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
          <thead className="bg-slate-900/95 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-20 shadow-sm backdrop-blur-md">
            <tr>
              {DEFAULT_COLUMNS.map(({ key, label, minWidth }) => {
                if (columnVisibility[key] === false) return null;
                const width = columnWidths[key] || minWidth;
                const isStickyLeft = key === 'actions' || key === 'item_name';
                const stickyLeftVal = key === 'actions' ? 0 : key === 'item_name' ? `${actionsWidth}px` : undefined;

                return (
                  <th
                    key={key}
                    style={{ 
                      width: `${width}px`, 
                      minWidth: `${minWidth}px`, 
                      maxWidth: `${width}px`,
                      left: stickyLeftVal
                    }}
                    className={`font-semibold py-2 px-3 border-b border-slate-800 relative select-none text-[11px] ${
                      isStickyLeft ? 'sticky bg-slate-900 shadow-r z-30' : ''
                    }`}
                  >
                    <div
                      className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => onSort && onSort(key)}
                    >
                      {label}
                      {key !== 'actions' && (
                        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === key ? 'text-amber-400' : 'text-slate-600'}`} />
                      )}
                    </div>
                    {key !== 'actions' && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/50 z-40 transition-colors"
                        onMouseDown={e => handleResizeStart(e, key)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-slate-300">
            {items.length === 0 ? (
              <tr>
                <td colSpan={visibleColCount} className="px-4 py-12 text-center text-slate-500">
                  <p className="text-sm font-semibold">No inventory items match your current filter criteria.</p>
                  <p className="text-xs text-slate-600 mt-1">Try resetting filters or adjusting search terms.</p>
                </td>
              </tr>
            ) : (
              <>
                {/* Active Items */}
                {activeItems.map((item, i) => (
                  <InventoryGridRow
                    key={item.id}
                    item={item}
                    index={i}
                    columnVisibility={columnVisibility}
                    columnWidths={columnWidths}
                    DEFAULT_COLUMNS={DEFAULT_COLUMNS}
                    categoryOptions={categoryOptions}
                    platformOptions={platformOptions}
                    deleting={deleting}
                    onUpdateItem={onUpdateItem}
                    onDelete={onDelete}
                    onOpenEditModal={onOpenEditModal}
                    onOpenQuickEdit={onOpenQuickEdit}
                    onOpenCopyModal={onOpenCopyModal}
                    onOpenSaleModal={onOpenSaleModal}
                    onOpenListingIdModal={onOpenListingIdModal}
                    onMarkSold={onMarkSold}
                    onShowTooltip={showTooltip}
                    onHideTooltip={hideTooltip}
                  />
                ))}

                {/* Sold Items Section Divider */}
                {soldItems.length > 0 && (
                  <>
                    {activeItems.length > 0 && (
                      <tr className="bg-slate-950/80 border-t-2 border-slate-800">
                        <td colSpan={visibleColCount} className="px-3 py-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                Sold Items ({soldItems.length})
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-normal">Completed Transactions</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {soldItems.map((item, i) => (
                      <InventoryGridRow
                        key={item.id}
                        item={item}
                        index={activeItems.length + i}
                        columnVisibility={columnVisibility}
                        columnWidths={columnWidths}
                        DEFAULT_COLUMNS={DEFAULT_COLUMNS}
                        categoryOptions={categoryOptions}
                        platformOptions={platformOptions}
                        deleting={deleting}
                        onUpdateItem={onUpdateItem}
                        onDelete={onDelete}
                        onOpenEditModal={onOpenEditModal}
                        onOpenQuickEdit={onOpenQuickEdit}
                        onOpenCopyModal={onOpenCopyModal}
                        onOpenSaleModal={onOpenSaleModal}
                        onOpenListingIdModal={onOpenListingIdModal}
                        onMarkSold={onMarkSold}
                        onShowTooltip={showTooltip}
                        onHideTooltip={hideTooltip}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800/40 bg-slate-950/40">
          <span className="text-[11px] text-slate-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} items)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-2.5 py-1 rounded-md text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all cursor-pointer"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="px-2.5 py-1 rounded-md text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all cursor-pointer"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Floating Product Photo Tooltip (eBay or Amazon) */}
      {hoverTooltip && hoverTooltip.type === 'item_image' && (
        <ItemImageHoverTooltip
          target={hoverTooltip.item}
          rect={hoverTooltip.rect}
        />
      )}

      {/* Floating Calculation Tooltip for Inventory Prices */}
      {hoverTooltip && hoverTooltip.type !== 'item_image' && (
        <div
          className="fixed z-50 w-72 p-3 rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.max(10, hoverTooltip.rect.top - 10 > 240 ? hoverTooltip.rect.top - 8 : hoverTooltip.rect.bottom + 8),
            left: Math.min(window.innerWidth - 300, Math.max(10, hoverTooltip.rect.right - 280)),
            transform: hoverTooltip.rect.top - 10 > 240 ? 'translateY(-100%)' : 'none'
          }}
        >
          {/* 1. Landed Cost Breakdown */}
          {hoverTooltip.type === 'cost' && (() => {
            const item = hoverTooltip.item;
            const unitPrice = Number(item.unit_price) || 0;
            const trueCost = Number(item.true_total_cost) || 0;
            const isAmazon = (item.category || '').toLowerCase().includes('amazon') ||
                             (item.invoice_ref || '').toLowerCase().includes('amazon') ||
                             (item.invoice_ref || '').toLowerCase().includes('vine');

            const proratedShip = Number(item.prorated_shipping || 0);
            const proratedTax = Number(item.prorated_tax || 0);
            const proratedDiscount = Number(item.prorated_discount || 0);

            const hasProration = (proratedShip > 0 || proratedTax > 0 || proratedDiscount > 0);
            const basePrice = unitPrice > 0
              ? unitPrice
              : (hasProration ? Math.max(0, trueCost - proratedShip - proratedTax + proratedDiscount) : trueCost);

            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-slate-200 flex items-center gap-1">
                    📦 Landed Cost (COGS) Breakdown
                  </span>
                  {item.invoice_ref && (
                    <span className="text-[10px] text-amber-400 font-mono">
                      Batch: {item.invoice_ref}
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">
                      {isAmazon ? 'Acquisition / ETV Price:' : 'Unit / Hammer Base Price:'}
                    </span>
                    <span className="text-slate-200">{fmtCurrency(basePrice)}</span>
                  </div>

                  {proratedShip > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Allocated Inbound Shipping:</span>
                      <span className="text-slate-200">+{fmtCurrency(proratedShip)}</span>
                    </div>
                  )}

                  {proratedTax > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Allocated Sales Tax:</span>
                      <span className="text-slate-200">+{fmtCurrency(proratedTax)}</span>
                    </div>
                  )}

                  {proratedDiscount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Allocated Invoice Discount:</span>
                      <span>-{fmtCurrency(proratedDiscount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold text-amber-300">
                    <span>True Total Landed COGS:</span>
                    <span>{fmtCurrency(trueCost)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. Floor Price Breakdown */}
          {hoverTooltip.type === 'floor' && (() => {
            const item = hoverTooltip.item;
            const feeData = computeFeeBreakdown(item);
            const floorVal = Number(item.floor_price || item._computedFloor || item.min_sell_price || feeData.breakEvenFloorPrice || 0);
            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-cyan-400 flex items-center gap-1">
                    🛡️ Minimum Floor Price (Breakeven)
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">0% Profit</span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">True Landed COGS:</span>
                    <span className="text-slate-200">{fmtCurrency(feeData.cogs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Platform Fee Rate:</span>
                    <span className="text-slate-200">{(feeData.platformFeePct * 100).toFixed(2)}%</span>
                  </div>
                  {feeData.estShippingCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Est. Outbound Shipping:</span>
                      <span className="text-slate-200">+{fmtCurrency(feeData.estShippingCost)}</span>
                    </div>
                  )}
                  {feeData.platformFlatFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Per-Order Flat Fee:</span>
                      <span className="text-slate-200">+{fmtCurrency(feeData.platformFlatFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold text-cyan-300">
                    <span>Zero-Loss Floor Price:</span>
                    <span>{fmtCurrency(floorVal)}</span>
                  </div>
                </div>
                <p className="text-[9.5px] text-slate-500 pt-0.5 border-t border-slate-900">
                  Formula: (COGS + Shipping + Flat Fee) / (1 - Platform Fee %)
                </p>
              </div>
            );
          })()}

          {/* 3. Suggested List Price Breakdown */}
          {hoverTooltip.type === 'suggested' && (() => {
            const item = hoverTooltip.item;
            const feeData = computeFeeBreakdown(item);
            const targetMargin = Number(item.target_margin_pct) || 0.15;
            const suggested = Number(item.suggested_list_price) || 0;
            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-blue-400 flex items-center gap-1">
                    💡 Suggested List Price
                  </span>
                  <span className="text-[10px] text-blue-300 font-mono">
                    Target: {(targetMargin > 1 ? targetMargin : targetMargin * 100).toFixed(0)}% Margin
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">True Landed COGS:</span>
                    <span className="text-slate-200">{fmtCurrency(feeData.cogs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Platform Deductions:</span>
                    <span className="text-slate-200">~{(feeData.platformFeePct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Projected Net Profit:</span>
                    <span className="text-emerald-400">+{fmtCurrency(suggested * (targetMargin > 1 ? targetMargin / 100 : targetMargin))}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold text-blue-300">
                    <span>Suggested Asking Price:</span>
                    <span>{fmtCurrency(suggested)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 4. Current List Price Breakdown */}
          {hoverTooltip.type === 'list' && (() => {
            const item = hoverTooltip.item;
            const feeData = computeFeeBreakdown(item);
            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-amber-300 flex items-center gap-1">
                    🏷️ List Price & Financial Breakdown
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {item.status || 'Active'}
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current List Price:</span>
                    <span className="text-slate-100 font-bold">{fmtCurrency(feeData.sellPrice)}</span>
                  </div>
                  <div className="flex justify-between text-red-300">
                    <span>Platform Fee ({(feeData.platformFeePct * 100).toFixed(2)}%):</span>
                    <span>-{fmtCurrency(feeData.finalValueFee || feeData.platformFeeAmt)}</span>
                  </div>
                  {feeData.promotedFee > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Promoted Ad Fee ({(feeData.promotedDecimal * 100).toFixed(1)}%):</span>
                      <span>-{fmtCurrency(feeData.promotedFee)}</span>
                    </div>
                  )}
                  {feeData.platformFlatFee > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Platform Flat Fee:</span>
                      <span>-{fmtCurrency(feeData.platformFlatFee)}</span>
                    </div>
                  )}
                  {feeData.estShippingCost > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Est. Outbound Shipping:</span>
                      <span>-{fmtCurrency(feeData.estShippingCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>Landed Cost (COGS):</span>
                    <span>-{fmtCurrency(feeData.cogs)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold">
                    <span className={feeData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      Projected Net Profit:
                    </span>
                    <span className={feeData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {feeData.netProfit >= 0 ? '+' : ''}{fmtCurrency(feeData.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Profit Margin:</span>
                    <span className={`font-bold ${feeData.marginPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(feeData.marginPct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Return on Investment (ROI):</span>
                    <span className={`font-bold ${feeData.roiPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(feeData.roiPct * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 5. Net Profit Full Calculation Tooltip */}
          {hoverTooltip.type === 'net_profit' && (() => {
            const item = hoverTooltip.item;
            const feeData = computeFeeBreakdown(item);
            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    💵 Net Profit Full Calculation
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {item.platform || 'eBay'}
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Gross Asking Price:</span>
                    <span className="text-slate-100 font-bold">{fmtCurrency(feeData.sellPrice)}</span>
                  </div>
                  <div className="flex justify-between text-red-300">
                    <span>Less Platform Fee ({(feeData.platformFeePct * 100).toFixed(2)}%):</span>
                    <span>-{fmtCurrency(feeData.finalValueFee || feeData.platformFeeAmt)}</span>
                  </div>
                  {feeData.promotedFee > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Less Promoted Ad Fee ({(feeData.promotedDecimal * 100).toFixed(1)}%):</span>
                      <span>-{fmtCurrency(feeData.promotedFee)}</span>
                    </div>
                  )}
                  {feeData.platformFlatFee > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Less Order Flat Fee:</span>
                      <span>-{fmtCurrency(feeData.platformFlatFee)}</span>
                    </div>
                  )}
                  {feeData.estShippingCost > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Less Outbound Shipping:</span>
                      <span>-{fmtCurrency(feeData.estShippingCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>Less True Landed COGS:</span>
                    <span>-{fmtCurrency(feeData.cogs)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold text-base">
                    <span className={feeData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      True Net Profit:
                    </span>
                    <span className={feeData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {feeData.netProfit >= 0 ? '+' : ''}{fmtCurrency(feeData.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10.5px] border-t border-slate-900 pt-0.5 font-semibold">
                    <span className="text-slate-400">Net Profit Margin:</span>
                    <span className={feeData.marginPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {(feeData.marginPct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[10.5px] font-semibold">
                    <span className="text-slate-400">Return on Investment (ROI):</span>
                    <span className={feeData.roiPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {(feeData.roiPct * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 6. Margin Health Breakdown */}
          {hoverTooltip.type === 'margin' && (() => {
            const item = hoverTooltip.item;
            const feeData = computeFeeBreakdown(item);
            return (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    📊 Profit Margin & Return on Investment
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">List Price:</span>
                    <span className="text-slate-200">{fmtCurrency(feeData.sellPrice)}</span>
                  </div>
                  <div className="flex justify-between text-red-300">
                    <span>Platform Fee ({(feeData.platformFeePct * 100).toFixed(2)}%):</span>
                    <span>-{fmtCurrency(feeData.finalValueFee || feeData.platformFeeAmt)}</span>
                  </div>
                  {feeData.promotedFee > 0 && (
                    <div className="flex justify-between text-red-300">
                      <span>Promoted Ad Fee ({(feeData.promotedDecimal * 100).toFixed(1)}%):</span>
                      <span>-{fmtCurrency(feeData.promotedFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Landed COGS:</span>
                    <span className="text-slate-200">{fmtCurrency(feeData.cogs)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold">
                    <span className={feeData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>Net Profit:</span>
                    <span className={feeData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {feeData.netProfit >= 0 ? '+' : ''}{fmtCurrency(feeData.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-300">Net Margin %:</span>
                    <span className={feeData.marginPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {(feeData.marginPct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-300">ROI %:</span>
                    <span className={feeData.roiPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {(feeData.roiPct * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
