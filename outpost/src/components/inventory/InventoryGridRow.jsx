import React, { useState } from 'react';
import { Copy, DollarSign, Trash2, Pencil, Loader2, Edit3, ShoppingBag, RefreshCw, Shield, ShieldCheck, ExternalLink } from 'lucide-react';
import { InlineEditCell } from './InlineEditCell';
import { InlineStatusSelect } from './InlineStatusSelect';
import { InlineSelectCell } from './InlineSelectCell';
import { MarginHealthBadge } from './MarginHealthBadge';
import { cleanItemDescription, cleanAthleteName } from '../../utils/spreadsheetParser';
import { LISTING_FORMATS } from '../../utils/constants';
import { fmtCurrency } from '../../utils/formulaPreview';
import { computeFeeBreakdown } from '../../utils/feeEngine';
import { getCertVerificationUrl } from '../../utils/certLookup';

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
  onOpenInvoiceModal,
  onUpdateItemSync,
  onVerifyCert,
  onPromptCertVerify,
  onShowTooltip,
  onHideTooltip
}) {
  const [updating, setUpdating] = useState(false);
  const [editingCert, setEditingCert] = useState(false);
  const [editingInvoiceRef, setEditingInvoiceRef] = useState(false);

  const isEven = index % 2 === 0;
  const rowBg = isEven ? 'bg-[#0b101d]' : 'bg-[#141d30]';
  const stickyBg = isEven ? 'bg-[#0b101d]' : 'bg-[#141d30]';
  const actionsWidth = columnWidths.actions || 140;

  // Detect if item was imported via VScout / Amazon Vine
  const isVineItem = Boolean(
    (item.invoice_ref && item.invoice_ref.startsWith('AMAZON-')) ||
    (item.notes && item.notes.includes('ASIN:')) ||
    (item.attributes && (typeof item.attributes === 'string' ? item.attributes.includes('amazon_vinescout') : item.attributes?.source === 'amazon_vinescout'))
  );

  return (
    <tr className={`border-b border-slate-800/70 transition-colors group ${rowBg} hover:bg-amber-500/[0.08]`}>
      {/* 1. Actions (Sticky Left) */}
      {columnVisibility.actions !== false && (
        <td
          style={{
            width: `${actionsWidth}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'actions')?.minWidth || 100}px`,
            maxWidth: `${actionsWidth}px`
          }}
          className={`px-2 py-1.5 whitespace-nowrap overflow-hidden sticky left-0 z-10 border-r border-slate-800/80 shadow-r transition-colors ${stickyBg} group-hover:bg-[#1a263d]`}
        >
          <div className="flex items-center gap-1">
            {/* Update / Sync Item Button */}
            <button
              onClick={async () => {
                if (updating) return;
                setUpdating(true);
                try {
                  if (onUpdateItemSync) {
                    await onUpdateItemSync(item);
                  }
                } finally {
                  setUpdating(false);
                }
              }}
              disabled={updating}
              title={item.ebay_listing_id ? `Sync with eBay #${item.ebay_listing_id} (orders, fees & live price)` : 'Update / refresh item details'}
              className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                updating
                  ? 'text-cyan-400 bg-cyan-500/20 animate-pulse'
                  : 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/15'
              }`}
            >
              {updating ? <Loader2 className="w-3 h-3 animate-spin text-cyan-400" /> : <RefreshCw className="w-3 h-3" />}
            </button>

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

      {/* 2. Item Name & Thumbnail (Sticky Left next to Actions) */}
      {columnVisibility.item_name !== false && (
        <td
          style={{
            width: `${columnWidths.item_name || 220}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'item_name')?.minWidth || 160}px`,
            maxWidth: `${columnWidths.item_name || 220}px`,
            left: `${actionsWidth}px`
          }}
          className={`px-3 py-1.5 border-r border-slate-800/60 transition-colors overflow-hidden text-xs sticky z-10 ${stickyBg} group-hover:bg-[#1a263d] shadow-r`}
        >
          <div
            onClick={() => onOpenEditModal && onOpenEditModal(item)}
            onMouseEnter={(e) => onShowTooltip && onShowTooltip('item_image', item, e)}
            onMouseLeave={() => onHideTooltip && onHideTooltip()}
            className="group/name cursor-pointer flex items-center justify-between gap-1.5 hover:bg-slate-800/60 rounded px-1 -mx-1 py-0.5 transition-colors"
            title="Click to view & edit full item details"
          >
            <div className="flex items-center gap-1.5 truncate">
              {isVineItem && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 flex-shrink-0 tracking-wide" title="Imported from VScout">
                  VScout
                </span>
              )}
              <span className="text-slate-200 font-medium group-hover/name:text-amber-400 group-hover/name:underline transition-colors truncate text-xs">
                {cleanItemDescription(item.item_name, item.athlete_person, item.authenticator)}
              </span>
            </div>
            <Pencil className="w-2.5 h-2.5 text-slate-500 group-hover/name:text-amber-400 transition-colors opacity-0 group-hover/name:opacity-100 flex-shrink-0" />
          </div>
          {item.athlete_person && (
            <p className="text-slate-400 text-[10px] pointer-events-none truncate leading-none mt-0.5 font-medium">{cleanAthleteName(item.athlete_person)}</p>
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

      {/* 4. Status */}
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

      {/* 5. Current List Price (with Hover Calculation) */}
      {columnVisibility.current_list_price !== false && (
        <td
          style={{
            width: `${columnWidths.current_list_price || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'current_list_price')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.current_list_price || 110}px`
          }}
          onMouseEnter={(e) => onShowTooltip && onShowTooltip('list', item, e)}
          onMouseLeave={onHideTooltip}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono font-bold cursor-help"
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

      {/* 6. Net Profit (with Hover Calculation) */}
      {columnVisibility.net_profit !== false && (
        <td
          style={{
            width: `${columnWidths.net_profit || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'net_profit')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.net_profit || 110}px`
          }}
          onMouseEnter={(e) => onShowTooltip && onShowTooltip('net_profit', item, e)}
          onMouseLeave={onHideTooltip}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono font-bold cursor-help"
        >
          {(() => {
            const hasListPrice = Number(item.current_list_price) > 0 || Number(item.suggested_list_price) > 0;
            if (!hasListPrice) {
              return <span className="text-slate-600 font-normal">--</span>;
            }
            const netProfitVal = item._computedNetProfit != null
              ? Number(item._computedNetProfit)
              : computeFeeBreakdown(item).netProfit;
            const isPositive = netProfitVal > 0;
            const isZero = Math.abs(netProfitVal) < 0.01;
            const textColor = isPositive ? 'text-emerald-400' : isZero ? 'text-slate-400' : 'text-red-400';
            return (
              <span className={`${textColor} font-mono font-bold`}>
                {isPositive ? '+' : ''}{fmtCurrency(netProfitVal)}
              </span>
            );
          })()}
        </td>
      )}

      {/* 7. Margin Health (with Hover Calculation) */}
      {columnVisibility.margin_health !== false && (
        <td
          style={{
            width: `${columnWidths.margin_health || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'margin_health')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.margin_health || 110}px`
          }}
          onMouseEnter={(e) => onShowTooltip && onShowTooltip('margin', item, e)}
          onMouseLeave={onHideTooltip}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs cursor-help"
        >
          <MarginHealthBadge marginPct={item._computedMargin} netProfit={item._computedNetProfit} showLabel={false} />
        </td>
      )}

      {/* 8. True Landed Cost (COGS - with Hover Calculation) */}
      {columnVisibility.true_total_cost !== false && (
        <td
          style={{
            width: `${columnWidths.true_total_cost || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'true_total_cost')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.true_total_cost || 110}px`
          }}
          onMouseEnter={(e) => onShowTooltip && onShowTooltip('cost', item, e)}
          onMouseLeave={onHideTooltip}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono cursor-help"
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

      {/* 9. Floor Price (with Hover Calculation) */}
      {columnVisibility.floor_price !== false && (
        <td
          style={{
            width: `${columnWidths.floor_price || 100}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'floor_price')?.minWidth || 85}px`,
            maxWidth: `${columnWidths.floor_price || 100}px`
          }}
          onMouseEnter={(e) => onShowTooltip && onShowTooltip('floor', item, e)}
          onMouseLeave={onHideTooltip}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono cursor-help"
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

      {/* 10. Suggested List Price (with Hover Calculation) */}
      {columnVisibility.suggested_list_price !== false && (
        <td
          style={{
            width: `${columnWidths.suggested_list_price || 110}px`,
            minWidth: `${DEFAULT_COLUMNS.find(c => c.key === 'suggested_list_price')?.minWidth || 95}px`,
            maxWidth: `${columnWidths.suggested_list_price || 110}px`
          }}
          onMouseEnter={(e) => onShowTooltip && onShowTooltip('suggested', item, e)}
          onMouseLeave={onHideTooltip}
          className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-xs font-mono cursor-help"
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

      {/* 11. Listing Format */}
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

      {/* 12. Athlete / Signer */}
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
          {(() => {
            if (editingCert) {
              return (
                <InlineEditCell
                  value={item.cert_number}
                  itemId={item.id}
                  field="cert_number"
                  onUpdated={(id, patch) => {
                    setEditingCert(false);
                    if (onUpdateItem) onUpdateItem(id, patch);
                  }}
                />
              );
            }

            if (!item.cert_number) {
              return (
                <InlineEditCell
                  value={item.cert_number}
                  itemId={item.id}
                  field="cert_number"
                  placeholder="-- Cert --"
                  onUpdated={onUpdateItem}
                />
              );
            }

            const certUrl = item.cert_verification_url || getCertVerificationUrl(item.authenticator, item.cert_number);
            const isCertVerified = Boolean(
              item.cert_verified ||
              (item.attributes && (typeof item.attributes === 'string' ? item.attributes.includes('"cert_verified":true') : item.attributes?.cert_verified))
            );

            return (
              <div className="group/cert flex items-center justify-between gap-1 w-full">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onVerifyCert) {
                        onVerifyCert(item, !isCertVerified);
                      }
                    }}
                    className="p-0.5 rounded hover:bg-slate-800 transition-colors flex-shrink-0 cursor-pointer"
                    title={isCertVerified
                      ? `Verified Certificate: ${item.authenticator || ''} #${item.cert_number} (Click to unverify / mark not found)`
                      : `Unverified Certificate (Click to mark verified)`
                    }
                  >
                    {isCertVerified ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 hover:text-rose-400 transition-colors" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-slate-500 hover:text-emerald-400 transition-colors" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (certUrl) {
                        window.open(certUrl, '_blank', 'noopener,noreferrer');
                      }
                      if (onPromptCertVerify) {
                        onPromptCertVerify(item, certUrl);
                      }
                    }}
                    className={`cursor-pointer flex items-center gap-1 min-w-0 hover:underline transition-colors text-left text-xs ${
                      isCertVerified ? 'text-emerald-300 hover:text-emerald-200 font-bold' : 'text-cyan-300 hover:text-cyan-200'
                    }`}
                    title={isCertVerified
                      ? `Verified Certificate: ${item.authenticator || ''} #${item.cert_number} (Click to open verification site)`
                      : `Click to open official certificate verification in new tab (${item.authenticator || 'Database'})`
                    }
                  >
                    <span className="truncate">{item.cert_number}</span>
                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 text-slate-500 group-hover/cert:text-cyan-400" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCert(true)}
                  className="opacity-0 group-hover/cert:opacity-100 p-0.5 text-slate-500 hover:text-amber-400 rounded transition-opacity flex-shrink-0"
                  title="Edit cert number"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })()}
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
            isInteger={true}
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
          {(() => {
            if (editingInvoiceRef) {
              return (
                <InlineEditCell
                  value={item.invoice_ref}
                  itemId={item.id}
                  field="invoice_ref"
                  onUpdated={(id, patch) => {
                    setEditingInvoiceRef(false);
                    if (onUpdateItem) onUpdateItem(id, patch);
                  }}
                />
              );
            }

            if (!item.invoice_ref) {
              return (
                <InlineEditCell
                  value={item.invoice_ref}
                  itemId={item.id}
                  field="invoice_ref"
                  placeholder="-- Ref --"
                  onUpdated={onUpdateItem}
                />
              );
            }

            const isAmazon = Boolean(
              (item.invoice_ref && item.invoice_ref.startsWith('AMAZON-')) ||
              item.is_amazon ||
              item.asin ||
              (item.notes && item.notes.includes('ASIN:')) ||
              (item.attributes && (typeof item.attributes === 'string' ? item.attributes.includes('amazon_vinescout') : item.attributes?.source === 'amazon_vinescout'))
            );

            const amazonAsin = item.asin ||
              item.notes?.match(/\b(B0[A-Z0-9]{8})\b/i)?.[1] ||
              item.invoice_ref?.match(/AMAZON-(B0[A-Z0-9]{8})/i)?.[1];
            const amazonOrderId = item.order_id ||
              item.notes?.match(/\b(\d{3}-\d{7}-\d{7})\b/)?.[1] ||
              item.invoice_ref?.match(/AMAZON-ORDER-([\d-]+)/i)?.[1];

            const amazonUrl = amazonAsin
              ? `https://www.amazon.com/dp/${amazonAsin}`
              : amazonOrderId
              ? `https://www.amazon.com/gp/your-account/order-details?orderID=${amazonOrderId}`
              : item.item_name
              ? `https://www.amazon.com/s?k=${encodeURIComponent(item.item_name)}`
              : 'https://www.amazon.com';

            return (
              <div className="group/inv flex items-center justify-between gap-1 w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (isAmazon) {
                      window.open(amazonUrl, '_blank', 'noopener,noreferrer');
                    } else if (onOpenInvoiceModal) {
                      onOpenInvoiceModal(item.invoice_ref, item.invoice_id);
                    }
                  }}
                  className="cursor-pointer flex items-center gap-1 min-w-0 hover:underline transition-colors truncate text-left"
                  title={isAmazon
                    ? `View Amazon Item (${amazonAsin ? `ASIN: ${amazonAsin}` : 'Amazon product'}) ↗`
                    : `Click to view Invoice #${item.invoice_ref} details & items`
                  }
                >
                  <span className={`truncate text-xs font-mono font-medium ${
                    isAmazon
                      ? 'text-teal-400 hover:text-teal-300'
                      : 'text-amber-400/90 hover:text-amber-300'
                  }`}>
                    {item.invoice_ref}
                  </span>
                  <ExternalLink className="w-2.5 h-2.5 text-slate-500 group-hover/inv:text-amber-400 flex-shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingInvoiceRef(true)}
                  className="opacity-0 group-hover/inv:opacity-100 p-0.5 text-slate-500 hover:text-amber-400 rounded transition-opacity flex-shrink-0"
                  title="Edit invoice reference"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })()}
        </td>
      )}
    </tr>
  );
}
