import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { InventoryTableRow } from './InventoryTableRow';

const DEFAULT_COLUMNS = [
  { key: 'actions', label: 'Actions', minWidth: 100 },
  { key: 'item_name', label: 'Item / Description', minWidth: 150 },
  { key: 'athlete_person', label: 'Athlete / Signer', minWidth: 120 },
  { key: 'status', label: 'Status', minWidth: 100 },
  { key: 'category', label: 'Category', minWidth: 100 },
  { key: 'authenticator', label: 'Authenticator', minWidth: 110 },
  { key: 'cert_number', label: 'Cert #', minWidth: 100 },
  { key: 'true_total_cost', label: 'True Cost', minWidth: 100 },
  { key: 'min_sell_price', label: 'Min Sell (Floor)', minWidth: 90 },
  { key: 'suggested_list_price', label: 'Suggested List', minWidth: 110 },
  { key: 'current_list_price', label: 'Current List', minWidth: 110 },
  { key: 'platform', label: 'Platform', minWidth: 100 },
  { key: 'invoice_ref', label: 'Invoice Ref', minWidth: 90 }
];

export function InventoryTable({
  items,
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
  onOpenCopyModal,
  onOpenSaleModal,
  onOpenQueryEdit,
  onOpenListingIdModal,
  onMarkSold,
  userSettings,
  setUserSettings
}) {
  const columnVisibility = userSettings?.columnVisibility || {};
  const columnWidths = userSettings?.columnWidths || {};
  const [resizingCol, setResizingCol] = useState(null);
  const tableRef = useRef(null);

  const visibleColCount = DEFAULT_COLUMNS.filter(c => columnVisibility[c.key] !== false).length;

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
          <thead className="bg-slate-900/90 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-20 shadow-sm backdrop-blur-md">
            <tr>
              {DEFAULT_COLUMNS.map(({ key, label, minWidth }) => {
                if (columnVisibility[key] === false) return null;
                const width = columnWidths[key] || minWidth;
                return (
                  <th
                    key={key}
                    style={{ width: `${width}px`, minWidth: `${minWidth}px`, maxWidth: `${width}px` }}
                    className={`font-semibold py-2 px-3 border-b border-slate-800 relative select-none text-[11px] ${
                      key === 'actions' ? 'sticky left-0 bg-slate-900/95 shadow-r z-30' : ''
                    }`}
                  >
                    <div
                      className="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 transition-colors"
                      onClick={() => onSort(key)}
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
                <td colSpan={visibleColCount} className="px-4 py-8 text-center text-slate-500">
                  No inventory items match your filters.
                </td>
              </tr>
            ) : (
              <>
                {/* Active Items */}
                {activeItems.map((item, i) => (
                  <InventoryTableRow
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
                    onOpenCopyModal={onOpenCopyModal}
                    onOpenSaleModal={onOpenSaleModal}
                    onOpenQueryEdit={onOpenQueryEdit}
                    onOpenListingIdModal={onOpenListingIdModal}
                    onMarkSold={onMarkSold}
                  />
                ))}

                {/* Sold Items Section (Positioned at Bottom) */}
                {soldItems.length > 0 && (
                  <>
                    {activeItems.length > 0 && (
                      <tr className="bg-slate-950/90 border-t-2 border-b border-slate-700/80 sticky z-10">
                        <td
                          colSpan={visibleColCount}
                          className="px-3 py-1.5 bg-slate-950/90 text-xs font-bold text-slate-400 uppercase tracking-wider"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                              <span className="text-slate-200">Sold Items</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-emerald-400 font-semibold border border-emerald-500/20">
                                {soldItems.length}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-normal">Completed Transactions</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {soldItems.map((item, i) => (
                      <InventoryTableRow
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
                        onOpenCopyModal={onOpenCopyModal}
                        onOpenSaleModal={onOpenSaleModal}
                        onOpenQueryEdit={onOpenQueryEdit}
                        onOpenListingIdModal={onOpenListingIdModal}
                        onMarkSold={onMarkSold}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800/40 bg-slate-950/40">
          <span className="text-[11px] text-slate-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} items)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-2.5 py-1 rounded-md text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="px-2.5 py-1 rounded-md text-[11px] border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
