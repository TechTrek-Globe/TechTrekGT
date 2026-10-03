import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { InventoryGridRow } from './InventoryGridRow';
import { ItemImageHoverTooltip } from './ItemImageHoverTooltip';
import { InventoryPricingTooltip } from './InventoryPricingTooltip';

export const DEFAULT_COLUMNS = [
  { key: 'actions', label: 'Actions', minWidth: 140 },
  { key: 'item_name', label: 'Item / Description', minWidth: 160 },
  { key: 'status', label: 'Status', minWidth: 100 },
  { key: 'current_list_price', label: 'List Price', minWidth: 95 },
  { key: 'landed_floor', label: 'Landed & Floor', minWidth: 130 },
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
  onOpenInvoiceModal,
  onUpdateItemSync,
  onVerifyCert,
  onPromptCertVerify,
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
                      onClick={() => onSort && onSort(key === 'landed_floor' ? 'floor_price' : key)}
                    >
                      {label}
                      {key !== 'actions' && (
                        <ArrowUpDown className={`w-3 h-3 ${(key === 'landed_floor' ? sortConfig?.key === 'floor_price' : sortConfig?.key === key) ? 'text-amber-400' : 'text-slate-600'}`} />
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
                    onOpenInvoiceModal={onOpenInvoiceModal}
                    onUpdateItemSync={onUpdateItemSync}
                    onVerifyCert={onVerifyCert}
                    onPromptCertVerify={onPromptCertVerify}
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
                        onOpenInvoiceModal={onOpenInvoiceModal}
                        onUpdateItemSync={onUpdateItemSync}
                        onVerifyCert={onVerifyCert}
                        onPromptCertVerify={onPromptCertVerify}
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
          key={hoverTooltip.item.id || hoverTooltip.item.ebay_listing_id || hoverTooltip.item.item_name}
          target={hoverTooltip.item}
          rect={hoverTooltip.rect}
        />
      )}

      {/* Unified Pricing Tooltip (List Price + Landed & Floor) */}
      {hoverTooltip && (hoverTooltip.type === 'list' || hoverTooltip.type === 'landed_floor') && (
        <InventoryPricingTooltip item={hoverTooltip.item} rect={hoverTooltip.rect} />
      )}
    </div>
  );
}
