import React, { useState } from 'react';
import { Package, DollarSign, UploadCloud, Tag, AlertCircle, Loader2 } from 'lucide-react';
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

export function InventoryHubView() {
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
    userSettings, setUserSettings,
    fetchItems, refreshAll,
    updateItemLocal, handleFieldSave
  } = useInventory();

  // --- View State ---
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'pricing'

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

  // Filter sorted items by category if selected
  const displayItems = categoryFilter === 'All'
    ? sortedItems
    : sortedItems.filter(i => i.category === categoryFilter);

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
    <div className="w-full flex-1 flex flex-col min-h-0 space-y-4">
      {/* Header & Main Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-400" />
            Inventory & Pricing Hub
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your stock, calculate break-evens, and find market comps
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setImporterOpen(true)}
            className="btn-secondary"
            title="Import Excel or CSV sheet"
          >
            <UploadCloud className="w-4 h-4" /> Import Sheet
          </button>
          <button
            onClick={() => setAmazonModalOpen(true)}
            className="btn-secondary"
            title="Import item directly via Amazon ASIN"
          >
            <Tag className="w-4 h-4 text-[#ff9900]" /> Amazon Item
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary"
            title="Add a manual purchase or wholesale invoice"
          >
            <Package className="w-4 h-4" /> Manual Invoice
          </button>
        </div>
      </div>

      <InventoryMetrics items={items} />

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400 mb-3" />
          <p className="text-sm font-semibold">Loading Inventory...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 space-y-4">
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

          {viewMode === 'table' ? (
            <InventoryTable
              items={displayItems}
              pagination={pagination}
              onPageChange={fetchItems}
              sortConfig={sortConfig}
              onSort={handleSort}
              categoryOptions={categoryOptions}
              platformOptions={platformOptions}
              deleting={deleting}
              onUpdateItem={handleFieldSave}
              onDelete={handleDelete}
              onOpenEditModal={setEditModalItem}
              onOpenCopyModal={setCopyModalItem}
              onOpenSaleModal={(it) => { setItemToSell(it); setSaleModalOpen(true); }}
              onOpenQueryEdit={handleOpenQueryEdit}
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
              onItemUpdated={handleFieldSave}
            />
          )}
        </div>
      )}

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
        onUpdated={(id, patch) => handleFieldSave(id, patch)}
      />
      <QueryEditModal
        queryEditModal={queryEditModal}
        setQueryEditModal={setQueryEditModal}
        onConfirmSearch={handleConfirmSearch}
      />
    </div>
  );
}
