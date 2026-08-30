import React from 'react';
import { Copy, DollarSign, Trash2, Pencil, Loader2, Edit3, ShoppingBag } from 'lucide-react';
import { InlineEditCell } from './InlineEditCell';
import { InlineStatusSelect } from './InlineStatusSelect';
import { InlineSelectCell } from './InlineSelectCell';
import { MarginHealthBadge } from './MarginHealthBadge';
import { cleanItemDescription, cleanAthleteName } from '../../utils/spreadsheetParser';
import { LISTING_FORMATS } from '../../utils/constants';

export function InventoryGridRow({
  item,
  index,
  columnVisibility = {},
  columnWidths = {},
  DEFAULT_COLUMNS = [],
  categoryOptions = [],
  platformOptions = [],
  deleting,
  onUpdateItem,
  onDelete,
  onOpenEditModal,
  onOpenQuickEdit,
  onOpenCopyModal,
  onOpenSaleModal,
  onOpenListingIdModal,
  onMarkSold,
}) {
  const isEven = index % 2 === 0;
  const rowBg = isEven ? 'bg-[#0b101d]' : 'bg-[#141d30]';
  const stickyBg = isEven ? 'bg-[#0b101d]' : 'bg-[#141d30]';

  return (
    <tr className={`border-b border-slate-800/70 transition-colors group ${rowBg} hover:bg-amber-500/[0.08]`}>
      {/* 1. Actions (Sticky Left) */}
      {columnVisibility.actions !== false && (
        <td
          style={{
            width: `${columnWidths.actions || 120}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'actions')?.minWidth || 100}px`,
            maxWidth: `${columnWidths.actions || 120}px`
          }}
          className={`px-2 py-1.5 whitespace-nowrap overflow-hidden sticky left-0 z-10 border-r border-slate-800/80 shadow-r transition-colors ${stickyBg} group-hover:bg-[#1a263d]`}
        >
          <div className="flex items-center gap-1">
            {/* Quick Edit Drawer Button */}
            <button
              onClick={() => onOpenQuickEdit && onOpenQuickEdit(item)}
              title="Open Quick Edit & Pricing Drawer"
              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-amber-500/15 transition-all"
            >
              <Edit3 className="w-3 h-3" />
            </button>

            {/* eBay Listing ID Link Button */}
            <button
              onClick={() => onOpenListingIdModal && onOpenListingIdModal(item)}
              title={item.ebay_listing_id ? `Linked to eBay #${item.ebay_listing_id} (click to view / edit)` : 'Link to active eBay listing'}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                item.ebay_listing_id
                  ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800/80'
              }`}
            >
              <ShoppingBag className="w-3 h-3" />
            </button>

            {/* Listing Copy Button */}
            <button
              onClick={() => onOpenCopyModal && onOpenCopyModal(item)}
              title="Generate listing copy"
              className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-amber-400 hover:bg-slate-800/80 transition-all"
            >
              <Copy className="w-3 h-3" />
            </button>

            {/* Log Sale Button */}
            {item.status !== 'Sold' && (
              <button
                onClick={() => onOpenSaleModal && onOpenSaleModal(item)}
                title="Record sale"
                className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-emerald-400 hover:bg-slate-800/80 transition-all"
              >
                <DollarSign className="w-3 h-3" />
              </button>
            )}

            {/* Delete Item Button */}
            <button
              onClick={() => onDelete && onDelete(item.id)}
              disabled={deleting === item.id || item.status === 'Sold'}
              title={item.status === 'Sold' ? 'Cannot delete a sold item' : 'Delete item'}
              className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-slate-800/80 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            >
              {deleting === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        </td>
      )}

      {/* 2. Item Name & Thumbnail */}
      {columnVisibility.item_name !== false && (
        <td
          style={{
            width: `${columnWidths.item_name || 220}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'item_name')?.minWidth || 160}px`,
            maxWidth: `${columnWidths.item_name || 220}px`
          }}
          className="px-3 py-1.5 border-r border-slate-800/60 transition-colors overflow-hidden text-xs"
        >
          <div
            onClick={() => onOpenEditModal && onOpenEditModal(item)}
            className="group/name cursor-pointer flex items-center justify-between gap-1.5 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors"
            title="Click to view & edit full item details"
          >
            <span className="text-slate-200 font-medium group-hover/name:text-amber-400 group-hover/name:underline transition-colors truncate text-xs">
              {cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
            </span>
            <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover/name:text-amber-400 transition-colors opacity-0 group-hover/name:opacity-100 flex-shrink-0" />
          </div>
          {item.athlete_person && !item.item_name?.toLowerCase().includes(item.athlete_person.toLowerCase()) && (
            <p className="text-slate-500 text-[10px] pointer-events-none truncate leading-none">{cleanAthleteName(item.athlete_person)}</p>
          )}
        </td>
      )}

      {/* 3. SKU / Custom Label */}
      {columnVisibility.sku !== false && (
        <td
          style={{
            width: `${columnWidths.sku || 100}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'sku')?.minWidth || 80}px`,
            maxWidth: `${columnWidths.sku || 100}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono"
        >
          <InlineEditCell
            value={item.sku}
            itemId={item.id}
            field="sku"
            placeholder="-- SKU --"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 4. Margin Health */}
      {columnVisibility.margin_health !== false && (
        <td
          style={{
            width: `${columnWidths.margin_health || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'margin_health')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.margin_health || 110}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs"
        >
          <MarginHealthBadge marginPct={item._computedMargin} netProfit={item._computedNetProfit} showLabel={false} />
        </td>
      )}

      {/* 5. Status */}
      {columnVisibility.status !== false && (
        <td
          style={{
            width: `${columnWidths.status || 120}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'status')?.minWidth || 100}px`,
            maxWidth: `${columnWidths.status || 120}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-visible text-xs relative"
        >
          <InlineStatusSelect
            itemId={item.id}
            current={item.status}
            item={item}
            onUpdated={onUpdateItem}
            onMarkSold={onMarkSold}
          />
        </td>
      )}

      {/* 6. Listing Format */}
      {columnVisibility.listing_format !== false && (
        <td
          style={{
            width: `${columnWidths.listing_format || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'listing_format')?.minWidth || 90}px`,
            maxWidth: `${columnWidths.listing_format || 110}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs"
        >
          <InlineSelectCell
            value={item.listing_format}
            itemId={item.id}
            field="listing_format"
            options={LISTING_FORMATS}
            placeholder="-- Format --"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 7. Current List Price */}
      {columnVisibility.current_list_price !== false && (
        <td
          style={{
            width: `${columnWidths.current_list_price || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'current_list_price')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.current_list_price || 110}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono font-bold"
        >
          <InlineEditCell
            value={item.current_list_price}
            itemId={item.id}
            field="current_list_price"
            type="number"
            prefix="$"
            className="text-amber-300 font-bold"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 8. True Landed Cost (COGS) */}
      {columnVisibility.true_total_cost !== false && (
        <td
          style={{
            width: `${columnWidths.true_total_cost || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'true_total_cost')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.true_total_cost || 110}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono"
        >
          <InlineEditCell
            value={item.true_total_cost}
            itemId={item.id}
            field="true_total_cost"
            type="number"
            prefix="$"
            className="text-slate-300 font-semibold"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 9. Floor Price */}
      {columnVisibility.floor_price !== false && (
        <td
          style={{
            width: `${columnWidths.floor_price || 100}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'floor_price')?.minWidth || 85}px`,
            maxWidth: `${columnWidths.floor_price || 100}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono"
        >
          <InlineEditCell
            value={item.floor_price || item._computedFloor || item.min_sell_price}
            itemId={item.id}
            field="floor_price"
            type="number"
            prefix="$"
            className="text-cyan-400"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 10. Suggested List Price */}
      {columnVisibility.suggested_list_price !== false && (
        <td
          style={{
            width: `${columnWidths.suggested_list_price || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'suggested_list_price')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.suggested_list_price || 110}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono"
        >
          <InlineEditCell
            value={item.suggested_list_price}
            itemId={item.id}
            field="suggested_list_price"
            type="number"
            prefix="$"
            className="text-blue-400"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 11. Athlete / Signer */}
      {columnVisibility.athlete_person !== false && (
        <td
          style={{
            width: `${columnWidths.athlete_person || 140}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'athlete_person')?.minWidth || 110}px`,
            maxWidth: `${columnWidths.athlete_person || 140}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs"
        >
          <InlineEditCell
            value={item.athlete_person}
            itemId={item.id}
            field="athlete_person"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 12. Category */}
      {columnVisibility.category !== false && (
        <td
          style={{
            width: `${columnWidths.category || 120}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'category')?.minWidth || 100}px`,
            maxWidth: `${columnWidths.category || 120}px`
          }}
          className="px-3 py-1.5 text-slate-400 whitespace-nowrap overflow-hidden text-xs"
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

      {/* 13. Authenticator */}
      {columnVisibility.authenticator !== false && (
        <td
          style={{
            width: `${columnWidths.authenticator || 120}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'authenticator')?.minWidth || 100}px`,
            maxWidth: `${columnWidths.authenticator || 120}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs"
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

      {/* 14. Cert # */}
      {columnVisibility.cert_number !== false && (
        <td
          style={{
            width: `${columnWidths.cert_number || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'cert_number')?.minWidth || 90}px`,
            maxWidth: `${columnWidths.cert_number || 110}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono"
        >
          <InlineEditCell
            value={item.cert_number}
            itemId={item.id}
            field="cert_number"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 15. Platform */}
      {columnVisibility.platform !== false && (
        <td
          style={{
            width: `${columnWidths.platform || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'platform')?.minWidth || 90}px`,
            maxWidth: `${columnWidths.platform || 110}px`
          }}
          className="px-3 py-1.5 text-slate-400 whitespace-nowrap overflow-hidden text-xs"
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

      {/* 16. Quantity */}
      {columnVisibility.quantity !== false && (
        <td
          style={{
            width: `${columnWidths.quantity || 80}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'quantity')?.minWidth || 60}px`,
            maxWidth: `${columnWidths.quantity || 80}px`
          }}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono text-center"
        >
          <InlineEditCell
            value={item.quantity ?? 1}
            itemId={item.id}
            field="quantity"
            type="number"
            onUpdated={onUpdateItem}
          />
        </td>
      )}

      {/* 17. Invoice Ref */}
      {columnVisibility.invoice_ref !== false && (
        <td
          style={{
            width: `${columnWidths.invoice_ref || 100}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'invoice_ref')?.minWidth || 80}px`,
            maxWidth: `${columnWidths.invoice_ref || 100}px`
          }}
          className="px-3 py-1.5 text-slate-500 whitespace-nowrap overflow-hidden text-xs"
        >
          <InlineEditCell
            value={item.invoice_ref}
            itemId={item.id}
            field="invoice_ref"
            onUpdated={onUpdateItem}
          />
        </td>
      )}
    </tr>
  );
}
