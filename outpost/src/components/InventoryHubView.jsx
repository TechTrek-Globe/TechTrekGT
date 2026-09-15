import React, { useState, useMemo } from 'react';
import { Package, AlertCircle, CheckCircle2, Loader2, UploadCloud, Tag, RefreshCw, TableProperties, LayoutGrid, Shield, ShieldCheck, X } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { deleteItem, syncEbayItem, getItem, updateItem } from '../utils/auctionApi';
import { cleanEbaySearchQuery } from '../utils/ebaySearch';
import { fmtCurrency, formatPercent } from '../utils/formulaPreview';
import { computeFeeBreakdown } from '../utils/feeEngine';

// Sub-components
import { InventoryCommandBar } from './inventory/InventoryCommandBar';
import { InventoryMetricsStrip } from './inventory/InventoryMetricsStrip';
import { InventoryDataGrid } from './inventory/InventoryDataGrid';
import { PricingCardGrid } from './inventory/PricingCardGrid';
import { QuickEditDrawer } from './inventory/QuickEditDrawer';
import { QueryEditModal } from './inventory/QueryEditModal';

// Modals
import { AddInvoiceModal } from './AddInvoiceModal';
import { ViewInvoiceModal } from './ViewInvoiceModal';
import { AmazonItemModal } from './AmazonItemModal';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';
import { LogSaleModal } from './LogSaleModal';
import { ListingCopyModal } from './ListingCopyModal';
import { EditItemModal } from './EditItemModal';
import { DelistPendingAlert } from './DelistPendingAlert';
import { EbayListingIdModal } from './EbayListingIdModal';
import { SoldEbayVineMatcherModal } from './inventory/SoldEbayVineMatcherModal';

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
    updateItemLocal,
    ebaySyncing, handleSyncEbay
  } = useInventory();

  // --- Sync toast state ---
  const [syncResult, setSyncResult] = useState(null);
  const [soldMatcherOpen, setSoldMatcherOpen] = useState(false);

  // Wrap context handler to add local toast feedback
  const handleSyncEbayWithToast = async () => {
    setSyncResult(null);
    try {
      await handleSyncEbay();
      setSyncResult({ ok: true, msg: 'eBay sync complete.' });
    } catch (e) {
      setSyncResult({ ok: false, msg: e?.message || 'eBay sync failed.' });
    } finally {
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  // --- View State ---
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'pricing'
  const [showMetrics, setShowMetrics] = useState(false);

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
  const [viewingInvoice, setViewingInvoice] = useState(null); // { invoiceRef, invoiceId }

  const displayItems = sortedItems;

  // Header totals & summary calculations
  const activeItems = useMemo(() =>
    items.filter(it => it.status === 'Available' || it.status === 'Listed' || it.status === 'Draft'),
    [items]
  );

  const totalCost = useMemo(() =>
    activeItems.reduce((s, it) => s + (Number(it.true_total_cost) || 0), 0),
    [activeItems]
  );

  const totalListValue = useMemo(() =>
    activeItems.reduce((s, it) => s + (Number(it.current_list_price) || Number(it.suggested_list_price) || 0), 0),
    [activeItems]
  );

  const { totalPotentialProfit, overallMargin, itemsWithComps } = useMemo(() => {
    let profit = 0;
    activeItems.forEach(it => {
      const feeData = computeFeeBreakdown(it);
      profit += feeData.netProfit;
    });
    const margin = totalListValue > 0 ? (profit / totalListValue) : 0;
    const compsCount = activeItems.filter(it =>
      it.comp_1 > 0 || it.comp_2 > 0 || it.comp_3 > 0 || it.manual_avg > 0 ||
      it.active_comp_1 > 0 || it.active_comp_2 > 0 || it.active_comp_3 > 0 || it.active_avg > 0
    ).length;

    return {
      totalPotentialProfit: profit,
      overallMargin: margin,
      itemsWithComps: compsCount
    };
  }, [activeItems, totalListValue]);

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

  const handleUpdateItemSync = async (item) => {
    try {
      let updatedData = null;
      if (item.ebay_listing_id || item.sku) {
        try {
          const res = await syncEbayItem(item.id);
          if (res?.item) {
            updatedData = res.item;
          }
        } catch (syncErr) {
          console.warn('eBay sync failed, falling back to direct item refresh:', syncErr);
        }
      }
      if (!updatedData) {
        const res = await getItem(item.id);
        if (res?.item) {
          updatedData = res.item;
        }
      }
      if (updatedData) {
        updateItemLocal(item.id, updatedData);
        setSyncResult({ ok: true, msg: `Updated "${item.item_name || 'Item'}".` });
      } else {
        setSyncResult({ ok: true, msg: 'Item refreshed.' });
      }
    } catch (err) {
      setSyncResult({ ok: false, msg: err.message || 'Failed to update item.' });
    } finally {
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  const [pendingCertPrompt, setPendingCertPrompt] = useState(null);

  const handleToggleCertVerified = async (item, targetStatus) => {
    try {
      const isVerified = typeof targetStatus === 'boolean' ? targetStatus : !item.cert_verified;
      await updateItem(item.id, { cert_verified: isVerified });
      const currentAttrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes || '{}') : (item.attributes || {});
      updateItemLocal(item.id, {
        cert_verified: isVerified,
        attributes: {
          ...currentAttrs,
          cert_verified: isVerified,
          cert_verified_at: isVerified ? new Date().toISOString() : null
        }
      });
      setSyncResult({
        ok: true,
        msg: isVerified
          ? `Marked certificate as Verified for "${item.item_name || 'Item'}".`
          : `Marked certificate as Unverified / Not Found for "${item.item_name || 'Item'}".`
      });
      setTimeout(() => setSyncResult(null), 3500);
    } catch (err) {
      console.error('Failed to update certificate verification status:', err);
      setSyncResult({ ok: false, msg: 'Failed to update certificate status.' });
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 space-y-1.5">
      {pendingCertPrompt && (
        <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-3 shadow-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 text-xs text-slate-200 min-w-0">
            <Shield className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <span className="truncate">
                Official lookup opened for <strong className="text-cyan-300 font-mono">{pendingCertPrompt.item.authenticator || 'Cert'} #{pendingCertPrompt.item.cert_number}</strong>:
              </span>
              <span className="text-slate-400 text-[11px]">Did the official database find and verify this certificate?</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                handleToggleCertVerified(pendingCertPrompt.item, true);
                setPendingCertPrompt(null);
              }}
              className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified ✓</span>
            </button>
            <button
              onClick={() => {
                handleToggleCertVerified(pendingCertPrompt.item, false);
                setPendingCertPrompt(null);
              }}
              className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Not Found / Unverified</span>
            </button>
            <button
              onClick={() => setPendingCertPrompt(null)}
              className="p-1 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
              title="Dismiss prompt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Unified Command & Filter Bar */}
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
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        statusCounts={statusCounts}
        totalCount={pagination.total}
        showMetrics={showMetrics}
        setShowMetrics={setShowMetrics}
        loading={loading}
        onRefresh={refreshAll}
        onOpenAddInvoice={() => setModalOpen(true)}
        onOpenAmazonModal={() => setAmazonModalOpen(true)}
        onOpenImporter={() => setImporterOpen(true)}
        activeCount={activeItems.length}
        totalCost={totalCost}
        totalListValue={totalListValue}
        totalPotentialProfit={totalPotentialProfit}
        overallMargin={overallMargin}
        onSyncEbay={handleSyncEbayWithToast}
        syncing={ebaySyncing}
        onOpenSoldMatcher={() => setSoldMatcherOpen(true)}
      />

      {/* eBay Sync result toast */}
      {syncResult && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border flex-shrink-0 ${
          syncResult.ok
            ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
            : 'bg-red-950/40 border-red-500/30 text-red-400'
        }`}>
          {syncResult.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />}
          <span>{syncResult.msg}</span>
        </div>
      )}

      {/* Expanded Metrics Strip (Collapsible) */}
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
        <div className="p-2 bg-red-950/40 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

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
            onOpenInvoiceModal={(ref, id) => setViewingInvoice({ invoiceRef: ref, invoiceId: id })}
            onUpdateItemSync={handleUpdateItemSync}
            onVerifyCert={handleToggleCertVerified}
            onPromptCertVerify={(item, url) => setPendingCertPrompt({ item, url })}
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
      <ViewInvoiceModal
        isOpen={Boolean(viewingInvoice)}
        invoiceRef={viewingInvoice?.invoiceRef}
        invoiceId={viewingInvoice?.invoiceId}
        onClose={() => setViewingInvoice(null)}
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
        onOpenCopyModal={() => setCopyModalItem(editModalItem)}
        onUpdated={(id, patch, meta) => {
          updateItemLocal(id, patch);
          if (patch?.status === 'Sold' && !meta?.fromEbaySync && !meta?.sale) {
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
      <SoldEbayVineMatcherModal
        isOpen={soldMatcherOpen}
        onClose={() => setSoldMatcherOpen(false)}
        onMatched={refreshAll}
      />
    </div>
  );
}
