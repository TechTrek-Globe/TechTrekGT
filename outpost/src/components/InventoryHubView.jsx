import React, { useState } from 'react';
import { Package, UploadCloud, Tag, AlertCircle, Loader2 } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { deleteItem } from '../utils/auctionApi';

import { InventoryMetrics } from './inventory/InventoryMetrics';
import { InventoryFilters } from './inventory/InventoryFilters';
import { InventoryTable } from './inventory/InventoryTable';
import { PricingCardList } from './inventory/PricingCardList';
import { QueryEditModal } from './inventory/QueryEditModal';
import { cleanEbaySearchQuery } from '../utils/ebaySearch';

// Modals
import { AddInvoiceModal } from './AddInvoiceModal';
import { AmazonItemModal } from './AmazonItemModal';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';
import { LogSaleModal } from './LogSaleModal';
import { ListingCopyModal } from './ListingCopyModal';
import { EditItemModal } from './EditItemModal';
import { DelistPendingAlert } from './DelistPendingAlert';
import { EbayListingIdModal } from './EbayListingIdModal';

export function InventoryHubView({ onNavigate }) {
  const {
    items,
    sortedItems,
    platforms,
    platformOptions,
    categoryOptions,
    pagination,
    statusCounts,
    search, setSearch,
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    sortConfig, handleSort,
    loading, error,
    pendingSaleItem, setPendingSaleItem,
    userSettings, setUserSettings,
    fetchItems, refreshAll,
    updateItemLocal, handleFieldSave
  } = useInventory();

  // --- View State ---
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'pricing'
  const [showMetrics, setShowMetrics] = useState(true);

  // --- Modal States ---
  const [modalOpen, setModalOpen] = useState(false);
  const [amazonModalOpen, setAmazonModalOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [itemToSell, setItemToSell] = useState(null);
  const [editModalItem, setEditModalItem] = useState(null);
  const [copyModalItem, setCopyModalItem] = useState(null);
  const [queryEditModal, setQueryEditModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [listingIdModalItem, setListingIdModalItem] = useState(null);
  const [delistDismissed, setDelistDismissed] = useState(false);

  // Items are category-filtered server-side via InventoryContext
  const displayItems = sortedItems;

  // Quick summary numbers for header
  const activeCount = items.filter(it => it.status === 'Available' || it.status === 'Listed').length;
  const totalCost = items.filter(it => it.status === 'Available' || it.status === 'Listed').reduce((s, it) => s + (it.true_total_cost || 0), 0);
  const delistPendingItems = items.filter(it => it.status === 'delist_pending');

  // --- Actions ---
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item completely?')) return;
    setDeleting(id);
    try {
      await deleteItem(id);
      refreshAll();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
      setDeleting(null);
    }
  };

  const handleMarkSold = (item) => {
    setPendingSaleItem(item);
    if (onNavigate) {
      onNavigate('sales');
    } else {
      window.history.pushState({}, '', '/outpost/sales');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleOpenQueryEdit = (item, onConfirm) => {
    const q = cleanEbaySearchQuery(item.item_name, item.athlete_person, item.authenticator);
    setQueryEditModal({ item, query: q, onConfirm });
  };

  const handleConfirmSearch = (item, query) => {
    if (queryEditModal?.onConfirm) {
      queryEditModal.onConfirm(query);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 space-y-2">
      {/* Header & Main Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black text-white flex items-center gap-1.5">
            <Package className="w-5 h-5 text-amber-400" />
            Inventory & Pricing
          </h1>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-slate-900 border border-slate-800 text-slate-400">
            <span className="text-slate-200 font-semibold">{activeCount} active</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowMetrics(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
              showMetrics
                ? 'bg-slate-800 text-amber-400 border-amber-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Toggle metrics cards"
          >
            Stats {showMetrics ? '▲' : '▼'}
          </button>
          <button
            onClick={() => setImporterOpen(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 flex items-center gap-1.5 transition-all"
            title="Import Excel or CSV sheet"
          >
            <UploadCloud className="w-3.5 h-3.5 text-slate-400" /> Import
          </button>
          <button
            onClick={() => setAmazonModalOpen(true)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 flex items-center gap-1.5 transition-all"
            title="Import item directly via Amazon ASIN"
          >
            <Tag className="w-3.5 h-3.5 text-[#ff9900]" /> Amazon
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm transition-all"
            title="Add a manual purchase or wholesale invoice"
          >
            <Package className="w-3.5 h-3.5" /> + Invoice
          </button>
        </div>
      </div>

      {showMetrics && <InventoryMetrics items={items} />}

      {/* Delist Pending Alert - shown when eBay webhook fires ITEM_SOLD */}
      {!delistDismissed && delistPendingItems.length > 0 && (
        <DelistPendingAlert
          items={delistPendingItems}
          onResolved={(itemId) => updateItemLocal(itemId, { status: 'Sold' })}
          onDismiss={() => setDelistDismissed(true)}
        />
      )}

      {error && (
        <div className="p-2 bg-red-950/40 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      <InventoryFilters
        viewMode={viewMode}
        setViewMode={setViewMode}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categoryOptions={categoryOptions}
        statusCounts={statusCounts}
        totalCount={pagination.total}
        loading={loading}
        onRefresh={refreshAll}
      />

      <div className="flex-1 flex flex-col min-h-0 space-y-1.5 relative">
        {loading && items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-3" />
            <p className="text-sm font-semibold">Loading Inventory...</p>
          </div>
        ) : viewMode === 'table' ? (
          <InventoryTable
              items={displayItems}
              pagination={pagination}
              onPageChange={fetchItems}
              sortConfig={sortConfig}
              onSort={handleSort}
              categoryOptions={categoryOptions}
              platformOptions={platformOptions}
              deleting={deleting}
              onUpdateItem={updateItemLocal}
              onDelete={handleDelete}
              onOpenEditModal={setEditModalItem}
              onOpenCopyModal={setCopyModalItem}
              onOpenSaleModal={handleMarkSold}
              onOpenQueryEdit={handleOpenQueryEdit}
              onMarkSold={handleMarkSold}
              userSettings={userSettings}
              setUserSettings={setUserSettings}
            />
          ) : (
            <PricingCardList
              items={displayItems}
              pagination={pagination}
              onPageChange={fetchItems}
              onOpenCopyModal={setCopyModalItem}
              onOpenQueryEdit={handleOpenQueryEdit}
              onItemUpdated={updateItemLocal}
            />
          )}
        </div>

      {/* Modals */}
      <AddInvoiceModal
        isOpen={modalOpen}
        platforms={platforms}
        onClose={() => setModalOpen(false)}
        onCreated={() => fetchItems(1)}
      />
      <AmazonItemModal
        isOpen={amazonModalOpen}
        platforms={platforms}
        onClose={() => setAmazonModalOpen(false)}
        onCreated={() => fetchItems(1)}
      />
      <SpreadsheetImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onImportSuccess={() => fetchItems(1)}
      />
      <LogSaleModal
        isOpen={saleModalOpen}
        item={itemToSell}
        platforms={platforms}
        onClose={() => { setSaleModalOpen(false); setItemToSell(null); }}
        onCreated={() => fetchItems(pagination.page)}
      />
      <ListingCopyModal
        isOpen={!!copyModalItem}
        item={copyModalItem}
        onClose={() => setCopyModalItem(null)}
      />
      <EditItemModal
        isOpen={!!editModalItem}
        item={editModalItem}
        categoryOptions={categoryOptions}
        platformOptions={platformOptions}
        onClose={() => setEditModalItem(null)}
        onUpdated={(id, patch) => {
          updateItemLocal(id, patch);
          if (patch?.status === 'Sold') {
            const fullItem = items.find(it => it.id === id);
            handleMarkSold(fullItem ? { ...fullItem, ...patch } : { id, ...patch });
          }
        }}
      />
      <QueryEditModal
        queryEditModal={queryEditModal}
        setQueryEditModal={setQueryEditModal}
        onConfirmSearch={handleConfirmSearch}
      />
      <EbayListingIdModal
        isOpen={!!listingIdModalItem}
        item={listingIdModalItem}
        onClose={() => setListingIdModalItem(null)}
        onSaved={(id, patch) => { updateItemLocal(id, patch); setListingIdModalItem(null); }}
      />
    </div>
  );
}
