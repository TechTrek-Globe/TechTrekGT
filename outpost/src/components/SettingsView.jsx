import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings, Download, RefreshCw, Plus, Edit2, Trash2,
  CheckCircle2, AlertCircle, Loader2, Save, FileText, Database, ShieldCheck,
  FileSpreadsheet, Upload, ArrowRightLeft, Sparkles, Calculator, LayoutGrid,
  ArrowUp, ArrowDown, Eye, EyeOff, ShoppingCart, Copy, RotateCcw, Plug, User,
  DollarSign, Package, Layers, Sliders, HardDrive, Key
} from 'lucide-react';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';
import { FinanceSyncModal } from './FinanceSyncModal';
import { TaxReportModal } from './TaxReportModal';
import { EbayConnectBanner } from './EbayConnectBanner';
import { ListingMatchReviewModal } from './ListingMatchReviewModal';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import {
  getPlatforms, createPlatform, updatePlatform, deletePlatform, resetPlatforms,
  getItems, getSales, getInvoices, getComps, getApiUrl,
  autoAssignSkus, pushAllSkusToEbay,
  getSyncSettings, updateSyncSettings, syncAllEbayItems, getVineScoutCatalog,
  getIntegrations, createIntegration, revokeIntegration
} from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { DEFAULT_COLUMNS, DEFAULT_CATEGORIES, getStoredUserSettings, saveUserSettings, resetColumnWidths } from '../utils/userSettings';

const TABS = [
  { id: 'platforms', label: 'Marketplace Fees', icon: DollarSign, badge: null },
  { id: 'integrations', label: 'Integrations & API', icon: Plug, badge: 'Live' },
  { id: 'data', label: 'Data & Reports', icon: FileSpreadsheet, badge: null },
  { id: 'preferences', label: 'View & Categories', icon: Sliders, badge: null },
  { id: 'account', label: 'Account & Security', icon: ShieldCheck, badge: null }
];

export function SettingsView() {
  const { user } = useAuth();

  // Active Tab state (auto-select 'integrations' if ebay callback query param is present)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('ebay') || params.get('tab') === 'integrations') return 'integrations';
      if (params.get('tab')) return params.get('tab');
    }
    return 'platforms';
  });

  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', fee_pct: '', flat_fee: '', notes: '', is_default: false });
  const [financeSyncOpen, setFinanceSyncOpen] = useState(false);
  const [taxReportOpen, setTaxReportOpen] = useState(false);

  // Add platform modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ name: '', fee_pct: '', flat_fee: '', notes: '', is_default: false });

  // eBay listing discovery state
  const [listingMatches, setListingMatches] = useState([]);
  const [listingMatchData, setListingMatchData] = useState(null);
  const [listingMatchOpen, setListingMatchOpen] = useState(false);

  // User Preferences (Column Visibility & Category Ordering)
  const [userSettings, setUserSettingsState] = useState(getStoredUserSettings);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Export state
  const [exporting, setExporting] = useState(false);

  // VineScout / Amazon API token
  const [amazonToken, setAmazonToken] = useState(null);
  const [hasAmazonToken, setHasAmazonToken] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenRotating, setTokenRotating] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [skuActionLoading, setSkuActionLoading] = useState(false);

  // Pull sync engine state from InventoryContext (context owns the polling loop)
  const {
    syncSettings, setSyncSettings,
    ebaySyncing, vscoutSyncing,
    handleSyncEbay, handleSyncVScout
  } = useInventory();

  // Track local syncing states for Settings-triggered manual syncs with success feedback
  const [ebaySyncMsg, setEbaySyncMsg] = useState(null);
  const [vscoutSyncMsg, setVscoutSyncMsg] = useState(null);

  // Auto-fetch API token when visiting the integrations tab
  useEffect(() => {
    if (activeTab === 'integrations' && !amazonToken && !hasAmazonToken && !tokenLoading) {
      setTokenLoading(true);
      fetch(getApiUrl('/api/import/amazon-token'), { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (d.token) setAmazonToken(d.token);
          if (d.hasToken) setHasAmazonToken(true);
        })
        .catch(err => console.error('Failed to auto-fetch API token:', err))
        .finally(() => setTokenLoading(false));
    }
  }, [activeTab]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleAutoAssignSkus = async () => {
    if (!window.confirm('Auto-assign unique, structured SKUs (OP-YYMMDD-XXXX) to all inventory items currently missing one?')) return;
    setSkuActionLoading(true);
    try {
      const res = await autoAssignSkus();
      showSuccess(res.message || `Auto-assigned SKUs to ${res.count} items.`);
    } catch (e) {
      setError(`Failed to auto-assign SKUs: ${e.message}`);
    } finally {
      setSkuActionLoading(false);
    }
  };

  const handlePushAllSkusToEbay = async () => {
    if (!window.confirm('Push all Outpost SKUs/Custom Labels to your active linked eBay listings?')) return;
    setSkuActionLoading(true);
    try {
      const res = await pushAllSkusToEbay();
      showSuccess(res.message || `Pushed ${res.synced} SKUs to eBay.`);
    } catch (e) {
      setError(`Failed to push SKUs to eBay: ${e.message}`);
    } finally {
      setSkuActionLoading(false);
    }
  };

  // P7: Sync engine handlers (delegate to InventoryContext, show local toast feedback)
  const handleManualEbaySync = async () => {
    setEbaySyncMsg(null);
    try {
      await handleSyncEbay();
      setEbaySyncMsg({ ok: true, msg: 'eBay sync complete. Inventory updated.' });
    } catch (e) {
      setEbaySyncMsg({ ok: false, msg: e?.message || 'eBay sync failed.' });
    } finally {
      setTimeout(() => setEbaySyncMsg(null), 5000);
    }
  };

  const handleManualVScoutSync = async () => {
    setVscoutSyncMsg(null);
    try {
      await handleSyncVScout();
      setVscoutSyncMsg({ ok: true, msg: 'VScout catalog refreshed.' });
    } catch (e) {
      setVscoutSyncMsg({ ok: false, msg: e?.message || 'VScout sync failed.' });
    } finally {
      setTimeout(() => setVscoutSyncMsg(null), 5000);
    }
  };

  const handleToggleSyncPref = async (key, val) => {
    const updated = { ...(syncSettings || {}), [key]: val ? 1 : 0 };
    try {
      const res = await updateSyncSettings({ [key]: val ? 1 : 0 });
      setSyncSettings(res.settings || res);
    } catch (e) {
      setError(`Failed to save sync setting: ${e.message}`);
    }
  };

  const handleSyncIntervalChange = async (key, rawVal) => {
    const val = Math.max(5, parseInt(rawVal, 10) || 30);
    try {
      const res = await updateSyncSettings({ [key]: val });
      setSyncSettings(res.settings || res);
    } catch (e) {
      setError(`Failed to save interval: ${e.message}`);
    }
  };


  const fetchPlatformsList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getPlatforms();
      setPlatforms(res.platforms || []);
    } catch (err) {
      setError(err.message || 'Failed to load platforms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlatformsList();
  }, [fetchPlatformsList]);

  // Column Visibility & Widths
  const toggleColumnVisibility = (colKey) => {
    const updated = {
      ...userSettings.columnVisibility,
      [colKey]: !userSettings.columnVisibility[colKey]
    };
    const newSettings = saveUserSettings({ ...userSettings, columnVisibility: updated });
    setUserSettingsState(newSettings);
    showSuccess(`Updated visibility for column '${colKey}'`);
  };

  const handleResetColumnWidths = () => {
    const updated = resetColumnWidths();
    setUserSettingsState(updated);
    showSuccess('Reset column widths to factory defaults.');
  };

  // Category Ordering
  const moveCategory = (index, direction) => {
    const categories = [...userSettings.categoryOrder];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    const temp = categories[index];
    categories[index] = categories[targetIdx];
    categories[targetIdx] = temp;

    const newSettings = saveUserSettings({ ...userSettings, categoryOrder: categories });
    setUserSettingsState(newSettings);
    showSuccess('Updated category ordering.');
  };

  const handleAddCategory = () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    if ((userSettings?.categoryOrder || DEFAULT_CATEGORIES).includes(name)) {
      setError(`Category '${name}' already exists.`);
      return;
    }
    const categories = [...(userSettings?.categoryOrder || DEFAULT_CATEGORIES), name];
    const newSettings = saveUserSettings({ ...userSettings, categoryOrder: categories });
    setUserSettingsState(newSettings);
    setNewCategoryInput('');
    showSuccess(`Added new category '${name}'.`);
  };

  const handleDeleteCategory = (cat) => {
    if ((userSettings?.categoryOrder || DEFAULT_CATEGORIES).length <= 1) {
      setError('Must keep at least one category.');
      return;
    }
    if (!window.confirm(`Remove category '${cat}' from list?`)) return;
    const categories = (userSettings?.categoryOrder || DEFAULT_CATEGORIES).filter(c => c !== cat);
    const newSettings = saveUserSettings({ ...userSettings, categoryOrder: categories });
    setUserSettingsState(newSettings);
    showSuccess(`Removed category '${cat}'.`);
  };

  // Platform Actions
  const handleStartEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      fee_pct: String(parseFloat((p.fee_pct * 100).toFixed(2))),
      flat_fee: Number(p.flat_fee || 0).toFixed(2),
      notes: p.notes || '',
      is_default: Boolean(p.is_default)
    });
  };

  const handleSaveEdit = async (id) => {
    try {
      await updatePlatform(id, {
        name: editForm.name,
        fee_pct: Number(editForm.fee_pct) / 100,
        flat_fee: Number(editForm.flat_fee) || 0,
        notes: editForm.notes,
        is_default: editForm.is_default ? 1 : 0
      });
      setEditingId(null);
      showSuccess('Platform fees updated.');
      fetchPlatformsList();
    } catch (err) {
      setError(err.message || 'Failed to update platform.');
    }
  };

  const handleDeletePlatform = async (id, name) => {
    if (!window.confirm(`Delete platform '${name}'?`)) return;
    try {
      await deletePlatform(id);
      showSuccess(`Deleted platform ${name}`);
      fetchPlatformsList();
    } catch (err) {
      setError(err.message || 'Failed to delete platform');
    }
  };

  const handleAddPlatform = async (e) => {
    e.preventDefault();
    if (!newPlatform.name.trim()) return;
    try {
      await createPlatform({
        name: newPlatform.name.trim(),
        fee_pct: Number(newPlatform.fee_pct) / 100,
        flat_fee: Number(newPlatform.flat_fee) || 0,
        notes: newPlatform.notes.trim(),
        is_default: newPlatform.is_default ? 1 : 0
      });
      setAddModalOpen(false);
      setNewPlatform({ name: '', fee_pct: '', flat_fee: '', notes: '', is_default: false });
      showSuccess('Platform added successfully.');
      fetchPlatformsList();
    } catch (err) {
      setError(err.message || 'Failed to add platform');
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset all platforms to standard factory default fee schedules? Any custom fee tweaks will be overwritten.')) return;
    try {
      await resetPlatforms();
      showSuccess('Reset to factory platform schedules.');
      fetchPlatformsList();
    } catch (err) {
      setError(err.message || 'Failed to reset platforms');
    }
  };

  // CSV Exporter Helpers
  const downloadCSV = (filename, csvContent) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportInventoryCSV = async () => {
    setExporting(true);
    try {
      const res = await getItems({ limit: 10000 });
      const items = res.items || [];
      if (items.length === 0) {
        setError('No inventory items found to export.');
        return;
      }

      const headers = [
        'ID', 'Item Name', 'Category', 'Athlete/Person', 'Authenticator', 'Cert #',
        'Invoice Ref', 'Status', 'Platform', 'Unit Price', 'Prorated Discount',
        'Prorated Shipping', 'Prorated Tax', 'True Total Cost', 'Break-Even Min Price',
        'Current List Price', 'Date Acquired', 'Date Listed', 'Notes'
      ];

      const rows = items.map(i => [
        `"${i.id}"`,
        `"${(i.item_name || '').replace(/"/g, '""')}"`,
        `"${(i.category || '').replace(/"/g, '""')}"`,
        `"${(i.athlete_person || '').replace(/"/g, '""')}"`,
        `"${(i.authenticator || '').replace(/"/g, '""')}"`,
        `"${(i.cert_number || '').replace(/"/g, '""')}"`,
        `"${(i.invoice_ref || '').replace(/"/g, '""')}"`,
        `"${i.status || ''}"`,
        `"${i.platform || ''}"`,
        i.unit_price || 0,
        i.prorated_discount || 0,
        i.prorated_shipping || 0,
        i.prorated_tax || 0,
        i.true_total_cost || 0,
        i.min_sell_price || 0,
        i.current_list_price || '',
        `"${i.date_acquired || ''}"`,
        `"${i.date_listed || ''}"`,
        `"${(i.notes || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const filename = `TechTrek_Outpost_Inventory_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(filename, csvContent);
      showSuccess(`Exported ${items.length} inventory items to CSV.`);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const exportSalesCSV = async () => {
    setExporting(true);
    try {
      const res = await getSales({ limit: 10000 });
      const sales = res.sales || [];
      if (sales.length === 0) {
        setError('No sales records found to export.');
        return;
      }

      const headers = [
        'Sale ID', 'Item Name', 'Category', 'Athlete', 'Sale Date', 'Platform',
        'Buyer Handle', 'Gross Sale Price', 'Buyer Shipping Paid', 'Actual Shipping Cost',
        'Platform Fee %', 'Platform Fees Amt', 'Payment Processing Amt', 'Promoted Fee',
        'Net Proceeds', 'True Total Cost', 'Net Profit', 'ROI %', 'Days to Sell'
      ];

      const rows = sales.map(s => [
        `"${s.id}"`,
        `"${(s.item_name || '').replace(/"/g, '""')}"`,
        `"${(s.category || '').replace(/"/g, '""')}"`,
        `"${(s.athlete_person || '').replace(/"/g, '""')}"`,
        `"${s.sale_date || ''}"`,
        `"${s.platform || ''}"`,
        `"${(s.buyer_handle || '').replace(/"/g, '""')}"`,
        s.gross_sale_price || 0,
        s.buyer_shipping_paid || 0,
        s.actual_shipping_cost || 0,
        s.platform_fee_pct || 0,
        s.platform_fees_amt || 0,
        s.payment_processing_amt || 0,
        s.promoted_listing_fee || 0,
        s.net_proceeds || 0,
        s.true_total_cost || 0,
        s.net_profit || 0,
        s.roi_pct || 0,
        s.days_to_sell || 0
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const filename = `TechTrek_Outpost_Sales_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(filename, csvContent);
      showSuccess(`Exported ${sales.length} sales records to CSV.`);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const exportFullBackupJSON = async () => {
    setExporting(true);
    try {
      const [invRes, itemsRes, salesRes, compsRes, platformsRes] = await Promise.all([
        getInvoices(),
        getItems({ limit: 10000 }),
        getSales({ limit: 10000 }),
        getComps(),
        getPlatforms()
      ]);

      const backup = {
        exported_at: new Date().toISOString(),
        user_email: user?.email,
        invoices: invRes.invoices || [],
        items: itemsRes.items || [],
        sales: salesRes.sales || [],
        comps: compsRes.comps || [],
        platforms: platformsRes.platforms || []
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `TechTrek_Outpost_FullBackup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      showSuccess('Exported complete JSON system backup.');
    } catch (err) {
      setError(`Backup failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col space-y-6 pb-8 pr-1">
      {/* Header with Title & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Settings className="w-4 h-4 text-amber-400" />
            </div>
            <span>Settings & Fee Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure marketplace fee schedules, platform integrations, backup ledgers, and view preferences
          </p>
        </div>

        {/* Global Quick Action */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPlatformsList}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 transition-all flex items-center gap-1.5"
            title="Refresh settings and platform fees"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in shadow-lg shadow-emerald-950/30">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-400 text-xs flex items-center gap-2 animate-fade-in shadow-lg shadow-red-950/30">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Modern Top Segmented Tabs Navigation */}
      <div className="bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800/80 flex flex-wrap gap-1.5 backdrop-blur-md shadow-xl flex-shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[130px] sm:min-w-[150px] py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 ${
                isActive
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 scale-[1.01]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  isActive
                    ? 'bg-slate-950 text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {/* ============================================================ */}
        {/* TAB 1: MARKETPLACE FEES                                      */}
        {/* ============================================================ */}
        {activeTab === 'platforms' && (
          <div className="space-y-6 animate-fade-in">
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    Marketplace & Selling Platform Fee Schedules
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    These rates automatically compute your break-even floor prices and net sales proceeds
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-850 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/80 transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(true)}
                    className="btn-primary w-auto px-3.5 py-1.5 text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Platform
                  </button>
                </div>
              </div>

              {loading && platforms.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader2 className="w-7 h-7 animate-spin text-amber-400 mx-auto mb-2" />
                  <p className="text-xs">Loading platform fee matrix...</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px] bg-slate-900/60">
                        <th className="py-3 px-4">Platform</th>
                        <th className="py-3 px-4">Fee Rate</th>
                        <th className="py-3 px-4">Flat Fee</th>
                        <th className="py-3 px-4">Notes & Tier Details</th>
                        <th className="py-3 px-4">Default</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {platforms.map(p => {
                        const isEditing = editingId === p.id;
                        return (
                          <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                            {/* Name */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.name}
                                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                  className="input-field py-1 px-2.5 text-xs font-semibold max-w-[160px]"
                                />
                              ) : (
                                <span className="font-bold text-slate-200">{p.name}</span>
                              )}
                            </td>

                            {/* Fee Pct */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <div className="relative w-24">
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={editForm.fee_pct}
                                    onChange={e => setEditForm(prev => ({ ...prev, fee_pct: e.target.value }))}
                                    className="input-field py-1 pl-2 pr-7 text-xs font-mono"
                                  />
                                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                                </div>
                              ) : (
                                <span className="font-mono text-amber-400 font-semibold">{fmtPct(p.fee_pct)}</span>
                              )}
                            </td>

                            {/* Flat Fee */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <div className="relative w-24">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={editForm.flat_fee}
                                    onChange={e => setEditForm(prev => ({ ...prev, flat_fee: e.target.value }))}
                                    className="input-field py-1 pl-7 pr-2 text-xs font-mono"
                                  />
                                </div>
                              ) : (
                                <span className="font-mono text-slate-300">{fmtCurrency(p.flat_fee)}</span>
                              )}
                            </td>

                            {/* Notes */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.notes}
                                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                                  className="input-field py-1 px-2.5 text-xs w-full min-w-[200px]"
                                />
                              ) : (
                                <span className="text-slate-400 text-[11px]">{p.notes || '--'}</span>
                              )}
                            </td>

                            {/* Default */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editForm.is_default}
                                    onChange={e => setEditForm(prev => ({ ...prev, is_default: e.target.checked }))}
                                    className="rounded border-slate-700 bg-slate-900 text-amber-500"
                                  />
                                  <span className="text-[10px] text-slate-400">Default</span>
                                </label>
                              ) : p.is_default ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  Primary Default
                                </span>
                              ) : (
                                <span className="text-slate-600">--</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(p.id)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all font-bold flex items-center gap-1"
                                    title="Save Changes"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Save</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId(null)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-all"
                                    title="Cancel"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(p)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                                    title="Edit Platform Fees"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePlatform(p.id, p.name)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition-all"
                                    title="Delete Platform"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: INTEGRATIONS & API                                    */}
        {/* ============================================================ */}
        {activeTab === 'integrations' && (
          <div className="space-y-6 animate-fade-in">
            {/* 1. eBay Integration */}
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="border-b border-slate-800/60 pb-4">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-amber-400" />
                  eBay Integration (Phase 3 Sync Engine)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connect your eBay seller account for real-time webhook notifications, automated Finances API fee reconciliation, and listing discovery
                </p>
              </div>
              <EbayConnectBanner
                onFindListings={(matches, rawData) => {
                  setListingMatches(matches);
                  setListingMatchData(rawData || { matches });
                  setListingMatchOpen(true);
                }}
              />

              {/* SKU & Custom Label Synchronization Sub-Card */}
              <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                      <span>Auto-Assign Missing SKUs</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Scans your database and generates unique, timestamped SKUs (<code className="text-amber-300/80">OP-YYMMDD-XXXX</code>) for any items currently missing an identifier.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={skuActionLoading}
                    onClick={handleAutoAssignSkus}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {skuActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Auto-Assign Blank SKUs</span>
                  </button>
                </div>

                <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1">
                      <ShoppingCart className="w-3.5 h-3.5 text-blue-400" />
                      <span>Push All SKUs to eBay</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Transmits your Outpost SKUs directly to eBay, updating the <strong>Custom Label (SKU)</strong> on all active linked store listings.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={skuActionLoading}
                    onClick={handlePushAllSkusToEbay}
                    className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    {skuActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>Push SKUs to eBay</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. VineScout / Amazon Integration */}
            <VineScoutSection
              token={amazonToken}
              hasToken={hasAmazonToken}
              loading={tokenLoading}
              rotating={tokenRotating}
              copied={tokenCopied}
              onLoad={async () => {
                setTokenLoading(true);
                try {
                  const res = await fetch(getApiUrl('/api/import/amazon-token'), { credentials: 'include' });
                  const d = await res.json();
                  if (d.token) setAmazonToken(d.token);
                  if (d.hasToken) setHasAmazonToken(true);
                } catch (e) { console.error(e); } finally { setTokenLoading(false); }
              }}
              onRotate={async () => {
                if (!window.confirm('Regenerate your API token? The old token will stop working immediately.')) return;
                setTokenRotating(true);
                try {
                  const res = await fetch(getApiUrl('/api/import/amazon-token'), { method: 'POST', credentials: 'include' });
                  const d = await res.json();
                  if (d.token) setAmazonToken(d.token);
                  if (d.hasToken) setHasAmazonToken(true);
                  showSuccess('API token regenerated successfully.');
                } catch (e) { console.error(e); } finally { setTokenRotating(false); }
              }}
              onCopy={() => {
                if (!amazonToken) return;
                navigator.clipboard.writeText(amazonToken);
                setTokenCopied(true);
                setTimeout(() => setTokenCopied(false), 2000);
              }}
            />

            {/* 2b. API Integrations & Programmatic Access (MED-4) */}
            <ApiIntegrationsSection />

            {/* 3. eBay Auto-Sync Card */}
            <div className="glass-card rounded-2xl p-6 border border-blue-500/20 space-y-4">
              <div className="border-b border-slate-800/60 pb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-400" />
                    eBay Sales Auto-Sync
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Automatically polls eBay Fulfillment API on a schedule to mark sold items and reconcile fees.
                  </p>
                </div>
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleSyncPref('ebay_auto_sync', !syncSettings?.ebay_auto_sync)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    syncSettings?.ebay_auto_sync ? 'bg-blue-500' : 'bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={!!syncSettings?.ebay_auto_sync}
                  id="toggle-ebay-auto-sync"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${syncSettings?.ebay_auto_sync ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 bg-slate-900/80 rounded-xl p-3.5 border border-slate-800">
                  <p className="text-[11px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">Poll Interval</p>
                  <div className="flex items-center gap-2">
                    <input
                      id="ebay-sync-interval-input"
                      type="number"
                      min="5"
                      max="1440"
                      step="5"
                      value={syncSettings?.ebay_sync_interval_m ?? 30}
                      onChange={e => handleSyncIntervalChange('ebay_sync_interval_m', e.target.value)}
                      disabled={!syncSettings?.ebay_auto_sync}
                      className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-blue-500 disabled:opacity-40"
                    />
                    <span className="text-xs text-slate-400">minutes</span>
                  </div>
                  {syncSettings?.last_ebay_sync_status === 'failed' ? (
                    <div className="text-[11px] text-rose-400 mt-2 p-2 rounded-lg bg-rose-950/30 border border-rose-500/20 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Last sync failed:</span> {syncSettings.last_ebay_sync_error || 'Network error or timeout'}
                        {syncSettings.last_ebay_sync_at && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Last successful sync: {new Date(syncSettings.last_ebay_sync_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : syncSettings?.last_ebay_sync_status === 'partial' ? (
                    <div className="text-[11px] text-amber-400 mt-2 p-2 rounded-lg bg-amber-950/30 border border-amber-500/20 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Partial sync:</span> {syncSettings.last_ebay_sync_error || 'Some items failed to sync'}
                        {syncSettings.last_ebay_sync_at && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Last successful sync: {new Date(syncSettings.last_ebay_sync_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : syncSettings?.last_ebay_sync_at ? (
                    <p className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Last sync: {new Date(syncSettings.last_ebay_sync_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    id="btn-manual-ebay-sync"
                    type="button"
                    onClick={handleManualEbaySync}
                    disabled={ebaySyncing}
                    className="w-full h-full min-h-[64px] rounded-xl text-xs font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${ebaySyncing ? 'animate-spin' : ''}`} />
                    <span>{ebaySyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                  {ebaySyncMsg && (
                    <div className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg border ${ebaySyncMsg.ok ? 'text-emerald-400 border-emerald-500/20 bg-emerald-950/40' : 'text-red-400 border-red-500/20 bg-red-950/30'}`}>
                      {ebaySyncMsg.ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                      {ebaySyncMsg.msg}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 4. VScout Auto-Sync Card */}
            <div className="glass-card rounded-2xl p-6 border border-purple-500/20 space-y-4">
              <div className="border-b border-slate-800/60 pb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-purple-400" />
                    VScout Catalog Auto-Sync
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Periodically refreshes VScout-sourced Amazon Vine items in your local catalog and updates sold status write-backs.
                  </p>
                </div>
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleSyncPref('vscout_auto_sync', !syncSettings?.vscout_auto_sync)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    syncSettings?.vscout_auto_sync ? 'bg-purple-500' : 'bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={!!syncSettings?.vscout_auto_sync}
                  id="toggle-vscout-auto-sync"
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${syncSettings?.vscout_auto_sync ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 bg-slate-900/80 rounded-xl p-3.5 border border-slate-800">
                  <p className="text-[11px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">Poll Interval</p>
                  <div className="flex items-center gap-2">
                    <input
                      id="vscout-sync-interval-input"
                      type="number"
                      min="5"
                      max="1440"
                      step="5"
                      value={syncSettings?.vscout_sync_interval_m ?? 60}
                      onChange={e => handleSyncIntervalChange('vscout_sync_interval_m', e.target.value)}
                      disabled={!syncSettings?.vscout_auto_sync}
                      className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-purple-500 disabled:opacity-40"
                    />
                    <span className="text-xs text-slate-400">minutes</span>
                  </div>
                  {syncSettings?.last_vscout_sync_status === 'failed' ? (
                    <div className="text-[11px] text-rose-400 mt-2 p-2 rounded-lg bg-rose-950/30 border border-rose-500/20 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Last sync failed:</span> {syncSettings.last_vscout_sync_error || 'Network error'}
                        {syncSettings.last_vscout_sync_at && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Last successful sync: {new Date(syncSettings.last_vscout_sync_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : syncSettings?.last_vscout_sync_at ? (
                    <p className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Last sync: {new Date(syncSettings.last_vscout_sync_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    id="btn-manual-vscout-sync"
                    type="button"
                    onClick={handleManualVScoutSync}
                    disabled={vscoutSyncing}
                    className="w-full h-full min-h-[64px] rounded-xl text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${vscoutSyncing ? 'animate-spin' : ''}`} />
                    <span>{vscoutSyncing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                  {vscoutSyncMsg && (
                    <div className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg border ${vscoutSyncMsg.ok ? 'text-emerald-400 border-emerald-500/20 bg-emerald-950/40' : 'text-red-400 border-red-500/20 bg-red-950/30'}`}>
                      {vscoutSyncMsg.ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                      {vscoutSyncMsg.msg}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 5. TechTrek Finance Integration Card */}
            <div className="glass-card rounded-2xl p-6 border border-emerald-500/30 bg-emerald-950/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-base font-bold text-white">TechTrek Finance D1 Cross-Portal Bridge</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Synchronize your realized memorabilia net profits directly to your household budget accounts in Cloudflare D1
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFinanceSyncOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-emerald-500/20"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Launch Finance Bridge</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Shared single sign-on authentication allows zero-friction balance syncing to personal finance ledgers.
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: DATA & REPORTS                                        */}
        {/* ============================================================ */}
        {activeTab === 'data' && (
          <div className="space-y-6 animate-fade-in">
            {/* Quick Action Tools Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Spreadsheet Importer */}
              <div className="glass-card rounded-2xl p-5 border border-amber-500/30 bg-amber-500/5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Spreadsheet Data Importer</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Upload Pristine Auction Tracker Excel workbooks (.xlsx, .csv) to batch-import inventory, purchase batches, and sales records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImporterOpen(true)}
                  className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Launch Importer</span>
                </button>
              </div>

              {/* Tax Report */}
              <div className="glass-card rounded-2xl p-5 border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">IRS Schedule C Tax Reports</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Generate CPA-ready Schedule C tax reports with gross receipts, COGS, platform fees, shipping expenses, and ending valuation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTaxReportOpen(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Generate Tax Report</span>
                </button>
              </div>
            </div>

            {/* Data Export & Backup Center */}
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
              <div className="border-b border-slate-800/60 pb-4">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  Data Export & Backup Center
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download your inventory, sales transactions, and full database backups in spreadsheet-ready CSV or JSON formats
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Export Inventory CSV */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-400" />
                      <h3 className="text-xs font-bold text-slate-100">Inventory Ledger CSV</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Full list of all items, prorated costs, certifications, athletes, and minimum floor prices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportInventoryCSV}
                    disabled={exporting}
                    className="w-full py-2 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Export Inventory (.CSV)
                  </button>
                </div>

                {/* Export Sales CSV */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-bold text-slate-100">Sales History Ledger CSV</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Complete sales transactions with buyer info, fee deductions, net profits, and ROI metrics.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportSalesCSV}
                    disabled={exporting}
                    className="w-full py-2 rounded-xl text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Export Sales (.CSV)
                  </button>
                </div>

                {/* Full Database Backup JSON */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-400" />
                      <h3 className="text-xs font-bold text-slate-100">Full System Backup JSON</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Complete snapshot of all invoices, items, comps, platforms, and sales for safekeeping.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportFullBackupJSON}
                    disabled={exporting}
                    className="w-full py-2 rounded-xl text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Full Backup (.JSON)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: VIEW PREFERENCES & CATEGORIES                         */}
        {/* ============================================================ */}
        {activeTab === 'preferences' && (
          <div className="space-y-6 animate-fade-in">
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
              <div className="border-b border-slate-800/60 pb-4">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  Inventory Table Customization & Category Ordering
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure default column visibility for all inventory views and manage custom category sorting
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Column Visibility & Width Toggles */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-amber-400" />
                      Column Visibility Defaults
                    </h3>
                    <button
                      type="button"
                      onClick={handleResetColumnWidths}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-slate-400 bg-slate-850 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/80 transition-all flex items-center gap-1"
                      title="Reset column widths to factory defaults"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset Widths
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                    {DEFAULT_COLUMNS.map(col => {
                      const isVisible = userSettings.columnVisibility[col.key] !== false;
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer border transition-all ${
                            isVisible
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 font-semibold'
                              : 'bg-slate-950/40 text-slate-500 border-slate-800'
                          }`}
                        >
                          <span>{col.label}</span>
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleColumnVisibility(col.key)}
                            className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/30"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Category Ordering & Management */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                    Custom Category Order & Management
                  </h3>

                  {/* Add custom category input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCategoryInput}
                      onChange={e => setNewCategoryInput(e.target.value)}
                      placeholder="Add custom category..."
                      className="input-field py-1.5 px-3 text-xs flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="btn-primary w-auto px-3.5 py-1.5 text-xs flex items-center gap-1 flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1.5 max-h-72 overflow-y-auto">
                    {userSettings.categoryOrder.map((cat, idx) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-200"
                      >
                        <span className="font-medium">{idx + 1}. {cat}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveCategory(idx, -1)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === userSettings.categoryOrder.length - 1}
                            onClick={() => moveCategory(idx, 1)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 ml-1"
                            title="Remove Category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: ACCOUNT & SECURITY                                    */}
        {/* ============================================================ */}
        {activeTab === 'account' && (
          <div className="space-y-6 animate-fade-in">
            <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
              <div className="border-b border-slate-800/60 pb-4">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  Account & Security Credentials
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Single sign-on authenticated session shared with TechTrek Finance
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Logged In Account</span>
                  <p className="text-base font-bold text-slate-100 mt-1">{user?.name || 'Account Holder'}</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Registered Email</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      user?.emailVerified
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                        : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                    }`}>
                      {user?.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  <p className="text-base font-bold text-slate-100 mt-1">{user?.email || 'N/A'}</p>
                </div>
                {user?.pendingEmail && (
                  <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 col-span-1 sm:col-span-2">
                    <span className="text-amber-400 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Pending Email Confirmation
                    </span>
                    <p className="text-xs text-amber-200 mt-1">
                      A change request to <span className="font-mono font-bold text-white">{user.pendingEmail}</span> is awaiting confirmation. Please check the verification link sent to that address.
                    </p>
                  </div>
                )}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Database Connection</span>
                  <p className="text-xs font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Cloudflare D1 (personal-budget-db)
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Auth Architecture</span>
                  <p className="text-xs font-semibold text-amber-400 mt-1">
                    HttpOnly Cookie JWT SSO
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 col-span-1 sm:col-span-2">
                  <div>
                    <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">API Integrations & Quota</span>
                    <p className="text-sm font-bold text-slate-100 mt-0.5">
                      External programmatic access tokens & VineScout keys
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Active limit: 10 integrations per account. Prune unused keys to stay within quota.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('integrations')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-950/30 hover:bg-amber-950/60 border border-amber-900/40 transition-all flex items-center justify-center gap-1.5 flex-shrink-0"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Manage & Prune Keys</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Platform Modal */}
      {addModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" /> Add Custom Platform
              </h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-500 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddPlatform} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Platform Name</label>
                <input
                  type="text"
                  placeholder="e.g. StockX, CardHobby, Local Consignment"
                  required
                  value={newPlatform.name}
                  onChange={e => setNewPlatform(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Fee Percentage (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      required
                      placeholder="12.5"
                      value={newPlatform.fee_pct}
                      onChange={e => setNewPlatform(prev => ({ ...prev, fee_pct: e.target.value }))}
                      className="input-field pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Flat Fee ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
                    <input
                      type="number"
                      step="0.05"
                      placeholder="0.30"
                      value={newPlatform.flat_fee}
                      onChange={e => setNewPlatform(prev => ({ ...prev, flat_fee: e.target.value }))}
                      className="input-field pl-7"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="Optional details or tier requirements"
                  value={newPlatform.notes}
                  onChange={e => setNewPlatform(prev => ({ ...prev, notes: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="new-platform-default"
                  checked={newPlatform.is_default}
                  onChange={e => setNewPlatform(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500"
                />
                <label htmlFor="new-platform-default" className="text-xs text-slate-300 cursor-pointer">
                  Set as primary default selling platform
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary w-auto px-5 py-2 text-xs"
                >
                  Save Platform
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modals */}
      <SpreadsheetImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onImportSuccess={() => showSuccess('Spreadsheet data successfully imported into your account!')}
      />

      <FinanceSyncModal
        isOpen={financeSyncOpen}
        onClose={() => setFinanceSyncOpen(false)}
      />

      <TaxReportModal
        isOpen={taxReportOpen}
        onClose={() => setTaxReportOpen(false)}
      />

      <ListingMatchReviewModal
        isOpen={listingMatchOpen}
        matches={listingMatches}
        matchData={listingMatchData}
        onClose={() => setListingMatchOpen(false)}
        onSaved={() => {}}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VineScout / Amazon Integration Section
// ---------------------------------------------------------------------------
function VineScoutSection({ token, hasToken, loading, rotating, copied, onLoad, onRotate, onCopy }) {
  const [revealed, setRevealed] = React.useState(false);
  const [urlCopied, setUrlCopied] = React.useState(false);

  // Auto-detect current instance base URL (falls back to production domain)
  const baseUrl = React.useMemo(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      const path = window.location.pathname.startsWith('/outpost') ? '/outpost' : '';
      return `${window.location.origin}${path}`;
    }
    return 'https://techtrekgt.com/outpost';
  }, []);

  const displayToken = token
    ? (revealed ? token : '••••••••••••••••••••••••••••••••••••••••')
    : null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-teal-500/30 bg-teal-950/10 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-teal-400" />
            VScout Extension Integration
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect your VScout Chrome extension for real-time item sync and automated sold reconciliation
          </p>
        </div>
        {!token && !hasToken && (
          <button
            onClick={onLoad}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-teal-300 bg-teal-950/60 hover:bg-teal-900/60 border border-teal-500/40 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            {loading ? 'Loading...' : 'Generate API Key'}
          </button>
        )}
      </div>

      {/* Pairing Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        {[
          { step: '1', text: 'Copy the Outpost Tracker URL and API Secret Key below' },
          { step: '2', text: 'In VScout Settings, unlock "Outpost Sync" with password Outpost' },
          { step: '3', text: 'Paste both credentials and VScout will sync items and sales automatically' }
        ].map(({ step, text }) => (
          <div key={step} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80">
            <div className="w-6 h-6 rounded-full bg-teal-500/20 border border-teal-500/30 text-teal-400 text-xs font-bold flex items-center justify-center mx-auto mb-1.5">{step}</div>
            <p className="text-[11px] text-slate-300 leading-snug">{text}</p>
          </div>
        ))}
      </div>

      {/* Credentials */}
      <div className="space-y-4 pt-1">
        {/* Outpost Tracker URL */}
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wide">
            Outpost Tracker URL (Paste into VScout)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-teal-300 overflow-hidden whitespace-nowrap">
              {baseUrl}
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                urlCopied
                  ? 'text-teal-300 border-teal-500/50 bg-teal-950/40'
                  : 'text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800'
              }`}
              title="Copy Outpost Tracker URL"
            >
              {urlCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
              {urlCopied ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>

        {/* API Secret Key */}
        {token ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                API Secret Key (Paste into VScout)
              </label>
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/40">
                Shown Once Upon Generation
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-amber-300 overflow-hidden whitespace-nowrap overflow-ellipsis"
                role="text"
                aria-label={revealed ? "API Secret Key" : "Masked API Secret Key"}
              >
                {displayToken}
              </div>
              <button
                type="button"
                onClick={() => setRevealed(r => !r)}
                className="px-3 py-2.5 rounded-xl text-xs border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                title={revealed ? 'Hide secret key' : 'Reveal secret key'}
              >
                {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={onCopy}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  copied
                    ? 'text-emerald-300 border-emerald-500/50 bg-emerald-950/40'
                    : 'text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800'
                }`}
                title="Copy API Secret Key"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy Key'}
              </button>
            </div>
            <p className="text-[11px] text-amber-300/80 mt-2">
              Make sure to copy your key now. For your security, raw credentials are never stored or displayed again.
            </p>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/60">
              <p className="text-[11px] text-slate-400">Key is user-scoped and never expires unless rotated.</p>
              <button
                type="button"
                onClick={onRotate}
                disabled={rotating}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {rotating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                <span>Rotate Key</span>
              </button>
            </div>
          </div>
        ) : hasToken ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                API Secret Key (Active)
              </label>
              <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">
                SHA-256 Hashed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-slate-400 select-none">
                ••••••••••••••••••••••••••••••••••••••••
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/60">
              <p className="text-[11px] text-slate-400">
                Your key is active and securely hashed. For security, raw keys cannot be viewed again. If you lost your key, rotate below.
              </p>
              <button
                type="button"
                onClick={onRotate}
                disabled={rotating}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-950/30 hover:bg-amber-950/60 border border-amber-900/40 transition-all flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
              >
                {rotating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                <span>Rotate Key</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-400 mb-2">Click "Generate API Key" above to create and reveal your initial API Secret Key.</p>
            <button
              onClick={onLoad}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-teal-300 bg-teal-950/60 hover:bg-teal-900/60 border border-teal-500/40 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>Generate API Key</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Integrations Section (MED-4: Active Quota & Pruning)
// ---------------------------------------------------------------------------
function ApiIntegrationsSection() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [createdSecret, setCreatedSecret] = useState(null);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await getIntegrations();
      if (res && Array.isArray(res.integrations)) {
        setIntegrations(res.integrations);
      }
    } catch (e) {
      console.error('Failed to load integrations:', e);
      setErrorMsg(e.message || 'Failed to load API integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const activeIntegrations = useMemo(
    () => integrations.filter(i => !i.revoked_at),
    [integrations]
  );
  const activeCount = activeIntegrations.length;
  const isAtLimit = activeCount >= 10;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (isAtLimit) {
      setErrorMsg('Maximum number of active API integrations (10) reached. Revoke an existing integration before creating a new one.');
      return;
    }
    setCreating(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const res = await createIntegration({ label: newLabel.trim() || undefined });
      if (res && res.integration) {
        setCreatedSecret(res.integration);
        setNewLabel('');
        setStatusMsg('New API integration created. Copy the secret now - it will never be displayed again.');
        await loadIntegrations();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create integration');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id, label) => {
    if (!window.confirm(`Revoke API integration "${label || id}"? Any external client using this key will immediately lose access.`)) {
      return;
    }
    setRevokingId(id);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await revokeIntegration(id);
      setStatusMsg('Integration revoked successfully. An active slot has been freed.');
      await loadIntegrations();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to revoke integration');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-slate-100">API Integrations & External Keys</h2>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
              isAtLimit
                ? 'bg-red-950/60 text-red-400 border-red-800/60'
                : 'bg-amber-950/40 text-amber-400 border-amber-800/40'
            }`}>
              {activeCount} / 10 Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage granular API tokens for VineScout, background daemons, and programmatic integrations. Quota limit: 10 active keys.
          </p>
        </div>
        <button
          type="button"
          onClick={loadIntegrations}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-700 transition-all flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
          title="Refresh integrations list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Newly Created Secret Modal / Alert */}
      {createdSecret && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Key className="w-3.5 h-3.5" />
              New Secret Key Generated: {createdSecret.label}
            </span>
            <button
              type="button"
              onClick={() => setCreatedSecret(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ✕ Dismiss
            </button>
          </div>
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            Please copy this secret immediately. For security, raw secret keys are cryptographically hashed and cannot be retrieved again.
          </p>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 font-mono text-xs text-amber-300 overflow-x-auto whitespace-nowrap"
              role="text"
              aria-label={secretRevealed ? "API Secret Key" : "Masked API Secret Key"}
            >
              {secretRevealed ? createdSecret.secret : (createdSecret.secret ? '••••••••••••••••••••••••••••••••••••••••' : '')}
            </div>
            <button
              type="button"
              onClick={() => setSecretRevealed(r => !r)}
              className="px-3 py-2 rounded-xl text-xs border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
              title={secretRevealed ? 'Mask secret' : 'Reveal secret'}
            >
              {secretRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(createdSecret.secret)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                copiedSecret
                  ? 'text-emerald-300 border-emerald-500/50 bg-emerald-950/40'
                  : 'text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800'
              }`}
            >
              {copiedSecret ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSecret ? 'Copied!' : 'Copy Secret'}
            </button>
          </div>
        </div>
      )}

      {/* Create Integration Form */}
      <form onSubmit={handleCreate} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
          Issue New Integration Key
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="e.g. Home Desktop VineScout, Laptop Extension"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            disabled={isAtLimit || creating}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-amber-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isAtLimit || creating}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all flex-shrink-0 ${
              isAtLimit
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm'
            }`}
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{creating ? 'Creating...' : 'Create Key'}</span>
          </button>
        </div>
        {isAtLimit && (
          <p className="text-[11px] text-red-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Maximum quota reached (10/10 active keys). Revoke an existing integration below to issue a new key.
          </p>
        )}
      </form>

      {/* Integrations Table / List */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
          Existing Keys ({integrations.length})
        </h3>
        {loading && integrations.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>Loading integrations...</span>
          </div>
        ) : integrations.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
            No API integrations found. Use the form above to generate your first key.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Label / Name</th>
                  <th className="px-4 py-3">Integration ID</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {integrations.map((item) => {
                  const isRevoked = !!item.revoked_at;
                  return (
                    <tr key={item.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <span className="text-slate-100">{item.label || 'API Integration'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                        {item.id ? `${item.id.slice(0, 8)}...` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-[11px]">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        {isRevoked ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            Revoked
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isRevoked ? (
                          <span className="text-[11px] text-slate-500 italic">Inactive</span>
                        ) : (
                          <button
                            type="button"
                            disabled={revokingId === item.id}
                            onClick={() => handleRevoke(item.id, item.label)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/40 transition-all inline-flex items-center gap-1 disabled:opacity-50"
                            title="Revoke this integration key to free an active slot"
                          >
                            {revokingId === item.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                            <span>Revoke</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
