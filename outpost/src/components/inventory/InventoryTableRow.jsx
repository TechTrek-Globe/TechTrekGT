import React from 'react';
import { Copy, DollarSign, Trash2, Pencil, Loader2 } from 'lucide-react';
import { InlineEditCell } from './InlineEditCell';
import { InlineStatusSelect } from './InlineStatusSelect';
import { InlineSelectCell } from './InlineSelectCell';
import { cleanItemDescription, cleanAthleteName } from '../../utils/spreadsheetParser';
import { PricingDrawer } from './PricingDrawer';

export function InventoryTableRow({
  item,
  index,
  columnVisibility,
  columnWidths,
  DEFAULT_COLUMNS,
  categoryOptions,
  platformOptions,
  deleting,
  onUpdateItem,
  onDelete,
  onOpenEditModal,
  onOpenCopyModal,
  onOpenSaleModal,
  onOpenQueryEdit,
}) {
  const colSpan = Object.values(columnVisibility).filter(v => v !== false).length;

  return (
    <>
      <tr className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors group ${index % 2 === 0 ? 'bg-slate-950/20' : 'bg-transparent'}`}>
        {/* Item Name */}
        {columnVisibility.item_name !== false && (
          <td
            style={{
              width: `${columnWidths.item_name || 220}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'item_name')?.minWidth || 150}px`,
              maxWidth: `${columnWidths.item_name || 220}px`
            }}
            className={`px-4 py-3 sticky left-0 z-10 border-r border-slate-800/80 shadow-r transition-colors overflow-hidden ${
              index % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900'
            } group-hover:bg-slate-900`}
          >
            <div
              onClick={() => onOpenEditModal(item)}
              className="group/name cursor-pointer flex items-center justify-between gap-1.5 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors"
              title="Click to view & edit full item details"
            >
              <span className="text-slate-200 font-medium group-hover/name:text-amber-400 group-hover/name:underline transition-colors truncate">
                {cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
              </span>
              <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover/name:text-amber-400 transition-colors opacity-0 group-hover/name:opacity-100 flex-shrink-0" />
            </div>
            {item.athlete_person && !item.item_name?.toLowerCase().includes(item.athlete_person.toLowerCase()) && (
              <p className="text-slate-500 text-[10px] mt-0.5 pointer-events-none truncate">{cleanAthleteName(item.athlete_person)}</p>
            )}
          </td>
        )}

        {/* Athlete / Signer */}
        {columnVisibility.athlete_person !== false && (
          <td
            style={{
              width: `${columnWidths.athlete_person || 150}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'athlete_person')?.minWidth || 120}px`,
              maxWidth: `${columnWidths.athlete_person || 150}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.athlete_person}
              itemId={item.id}
              field="athlete_person"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Status */}
        {columnVisibility.status !== false && (
          <td
            style={{
              width: `${columnWidths.status || 130}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'status')?.minWidth || 100}px`,
              maxWidth: `${columnWidths.status || 130}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineStatusSelect
              itemId={item.id}
              current={item.status}
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Category */}
        {columnVisibility.category !== false && (
          <td
            style={{
              width: `${columnWidths.category || 120}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'category')?.minWidth || 100}px`,
              maxWidth: `${columnWidths.category || 120}px`
            }}
            className="px-4 py-3 text-slate-400 whitespace-nowrap overflow-hidden"
          >
            <InlineSelectCell
              value={item.category}
              itemId={item.id}
              field="category"
              options={categoryOptions}
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Authenticator Company */}
        {columnVisibility.authenticator !== false && (
          <td
            style={{
              width: `${columnWidths.authenticator || 130}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'authenticator')?.minWidth || 110}px`,
              maxWidth: `${columnWidths.authenticator || 130}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineSelectCell
              value={item.authenticator ? item.authenticator.replace(/#.*$/, '').trim() : ''}
              itemId={item.id}
              field="authenticator"
              options={['Beckett', 'JSA', 'PSA', 'ACOA', 'Upper Deck', 'Fanatics', 'Tristar', 'Steiner', 'Schwartz', 'Other']}
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Cert / Authenticator # */}
        {columnVisibility.cert_number !== false && (
          <td
            style={{
              width: `${columnWidths.cert_number || 120}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'cert_number')?.minWidth || 100}px`,
              maxWidth: `${columnWidths.cert_number || 120}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.cert_number}
              itemId={item.id}
              field="cert_number"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* True Cost */}
        {columnVisibility.true_total_cost !== false && (
          <td
            style={{
              width: `${columnWidths.true_total_cost || 120}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'true_total_cost')?.minWidth || 100}px`,
              maxWidth: `${columnWidths.true_total_cost || 120}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.true_total_cost}
              itemId={item.id}
              field="true_total_cost"
              type="number"
              prefix="$"
              className="font-semibold"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Min Sell */}
        {columnVisibility.min_sell_price !== false && (
          <td
            style={{
              width: `${columnWidths.min_sell_price || 110}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'min_sell_price')?.minWidth || 90}px`,
              maxWidth: `${columnWidths.min_sell_price || 110}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.min_sell_price}
              itemId={item.id}
              field="min_sell_price"
              type="number"
              prefix="$"
              className="text-emerald-400 font-semibold"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Suggested List */}
        {columnVisibility.suggested_list_price !== false && (
          <td
            style={{
              width: `${columnWidths.suggested_list_price || 130}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'suggested_list_price')?.minWidth || 110}px`,
              maxWidth: `${columnWidths.suggested_list_price || 130}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.suggested_list_price}
              itemId={item.id}
              field="suggested_list_price"
              type="number"
              prefix="$"
              className="text-blue-400 font-semibold"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Current List */}
        {columnVisibility.current_list_price !== false && (
          <td
            style={{
              width: `${columnWidths.current_list_price || 130}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'current_list_price')?.minWidth || 110}px`,
              maxWidth: `${columnWidths.current_list_price || 130}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.current_list_price}
              itemId={item.id}
              field="current_list_price"
              type="number"
              prefix="$"
              className="text-amber-300 font-semibold"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Platform */}
        {columnVisibility.platform !== false && (
          <td
            style={{
              width: `${columnWidths.platform || 120}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'platform')?.minWidth || 100}px`,
              maxWidth: `${columnWidths.platform || 120}px`
            }}
            className="px-4 py-3 text-slate-400 whitespace-nowrap overflow-hidden"
          >
            <InlineSelectCell
              value={item.platform}
              itemId={item.id}
              field="platform"
              options={platformOptions}
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Invoice Ref */}
        {columnVisibility.invoice_ref !== false && (
          <td
            style={{
              width: `${columnWidths.invoice_ref || 110}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'invoice_ref')?.minWidth || 90}px`,
              maxWidth: `${columnWidths.invoice_ref || 110}px`
            }}
            className="px-4 py-3 text-slate-500 whitespace-nowrap overflow-hidden"
          >
            <InlineEditCell
              value={item.invoice_ref}
              itemId={item.id}
              field="invoice_ref"
              onUpdated={onUpdateItem}
            />
          </td>
        )}

        {/* Actions */}
        {columnVisibility.actions !== false && (
          <td
            style={{
              width: `${columnWidths.actions || 100}px`,
              minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'actions')?.minWidth || 80}px`,
              maxWidth: `${columnWidths.actions || 100}px`
            }}
            className="px-4 py-3 whitespace-nowrap overflow-hidden"
          >
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onOpenCopyModal(item)}
                title="Generate multi-channel listing copy (eBay/Whatnot/Mercari)"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-amber-900/20 transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {item.status !== 'Sold' && (
                <button
                  onClick={() => onOpenSaleModal(item)}
                  title="Record sale for this item"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-400 hover:bg-emerald-900/20 transition-all"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onDelete(item.id)}
                disabled={deleting === item.id || item.status === 'Sold'}
                title={item.status === 'Sold' ? 'Cannot delete a sold item' : 'Delete item'}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </td>
        )}
      </tr>

      {/* Pricing Drawer */}
      <PricingDrawer
        item={item}
        colSpan={colSpan}
        onItemUpdated={onUpdateItem}
        onOpenCopyModal={onOpenCopyModal}
        onOpenQueryEdit={onOpenQueryEdit}
      />
    </>
  );
}
