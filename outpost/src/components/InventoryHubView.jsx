import React, { useState } from 'react';
import { Package, AlertCircle, Loader2 } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { deleteItem } from '../utils/auctionApi';
import { cleanEbaySearchQuery } from '../utils/ebaySearch';

// Sub-components
import { InventoryCommandBar } from './inventory/InventoryCommandBar';
import { InventoryMetricsStrip } from './inventory/InventoryMetricsStrip';
import { StatusFilterBar } from './inventory/StatusFilterBar';
import { InventoryDataGrid } from './inventory/InventoryDataGrid';
import { PricingCardGrid } from './inventory/PricingCardGrid';
import { QuickEditDrawer } from './inventory/QuickEditDrawer';
import { QueryEditModal } from './inventory/QueryEditModal';

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
    listingFormatFilter, setListingFormatFilter,
    sortConfig, handleSort,
    sortPreset, applySortPreset,
    loading, error,
    setPendingSaleItem,
    userSettings, setUserSettings,
    fetchItems, refreshAll,
    updateItemLocal
  } = useInventory();

  // --- View State ---
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'pricing'
  const [showMetrics, setShowMetrics] = useState(true);

  // --- Drawer & Modal States ---
  const [drawerItem, setDrawerItem] = useState(null);
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

  const displayItems = sortedItems;

  // Header totals
  const activeCount = items.filter(it => it.status === 'Available' || it.status === 'Listed' || it.status === 'Draft').length;
  const totalCost = items
    .filter(it => it.status === 'Available' || it.status === 'Listed' || it.status === 'Draft')
    .reduce((s, it) => s + (Number(it.true_total_cost) || 0), 0);
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
    } finally {
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
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black text-white flex items-center gap-1.5">
            <Package className="w-5 h-5 text-amber-400" />
            Inventory &amp; Pricing
          </h1>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-slate-900 border border-slate-800 text-slate-400">
            <span className="text-slate-200 font-semibold">{activeCount} active items</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} landed</span>
          </span>
        </div>
      </div>

      {/* Top Metric Strip */}
      {showMetrics && <InventoryMetricsStrip items={items} />}

      {/* Delist Pending Alert - shown when eBay webhook fires ITEM_SOLD */}
      {!delistDismissed && delistPendingItems.length > 0 && (
        <DelistPendingAlert
          items={delistPendingItems}
          onResolved={(itemId) => updateItemLocal(itemId, { status: 'Sold' })}
          onDismiss={() => setDelistDismissed(true)}
        />
      )}

      {error && (
        <div className="p-2.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Command & Filter Bar */}
      <InventoryCommandBar
        viewMode={viewMode}
        setViewMode={setViewMode}
        search={search}
        setSearch={setSearch}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        categoryOptions={categoryOptions}
        listingFormatFilter={listingFormatFilter}
        setListingFormatFilter={setListingFormatFilter}
        sortPreset={sortPreset}
        applySortPreset={applySortPreset}
        showMetrics={showMetrics}
        setShowMetrics={setShowMetrics}
        loading={loading}
        onRefresh={refreshAll}
        onOpenAddInvoice={() => setModalOpen(true)}
        onOpenAmazonModal={() => setAmazonModalOpen(true)}
        onOpenImporter={() => setImporterOpen(true)}
      />

      {/* Status Filter Pills */}
      <StatusFilterBar
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        statusCounts={statusCounts}
        totalCount={pagination.total}
      />

      {/* Main Grid / Cards Container */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {loading && items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 glass-card rounded-2xl border border-slate-800">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-3" />
            <p className="text-sm font-semibold text-slate-300">Loading Inventory &amp; Pricing...</p>
          </div>
        ) : viewMode === 'table' ? (
          <InventoryDataGrid
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
            onOpenQuickEdit={setDrawerItem}
            onOpenCopyModal={setCopyModalItem}
            onOpenSaleModal={handleMarkSold}
            onOpenListingIdModal={setListingIdModalItem}
            onMarkSold={handleMarkSold}
            userSettings={userSettings}
            setUserSettings={setUserSettings}
          />
        ) : (
          <PricingCardGrid
            items={displayItems}
            pagination={pagination}
            onPageChange={fetchItems}
            onOpenCopyModal={setCopyModalItem}
            onOpenQueryEdit={handleOpenQueryEdit}
            onItemUpdated={updateItemLocal}
            onOpenQuickEdit={setDrawerItem}
            onOpenListingIdModal={setListingIdModalItem}
          />
        )}
      </div>

      {/* Quick Edit Slide-Out Drawer */}
      <QuickEditDrawer
        item={drawerItem}
        isOpen={Boolean(drawerItem)}
        onClose={() => setDrawerItem(null)}
        categoryOptions={categoryOptions}
        platformOptions={platformOptions}
        onItemUpdated={(id, patch) => {
          updateItemLocal(id, patch);
          setDrawerItem(prev => (prev?.id === id ? { ...prev, ...patch } : prev));
        }}
        onOpenCopyModal={setCopyModalItem}
        onOpenQueryEdit={handleOpenQueryEdit}
      />

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
        isOpen={Boolean(copyModalItem)}
        item={copyModalItem}
        onClose={() => setCopyModalItem(null)}
      />
      <EditItemModal
        isOpen={Boolean(editModalItem)}
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
        isOpen={Boolean(listingIdModalItem)}
        item={listingIdModalItem}
        onClose={() => setListingIdModalItem(null)}
        onSaved={(id, patch) => {
          updateItemLocal(id, patch);
          setListingIdModalItem(null);
        }}
      />
    </div>
  );
}
