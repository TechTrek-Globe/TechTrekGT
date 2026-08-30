import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings, Download, RefreshCw, Plus, Edit2, Trash2,
  CheckCircle2, AlertCircle, Loader2, Save, FileText, Database, ShieldCheck,
  FileSpreadsheet, Upload, ArrowRightLeft, Sparkles, Boxes, Calculator, LayoutGrid,
  ArrowUp, ArrowDown, Eye, EyeOff, ShoppingCart, Copy, RotateCcw, Plug, User,
  DollarSign, Package, Layers, Sliders, HardDrive
} from 'lucide-react';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';
import { FinanceSyncModal } from './FinanceSyncModal';
import { SuppliesTrackerModal } from './SuppliesTrackerModal';
import { TaxReportModal } from './TaxReportModal';
import { EbayConnectBanner } from './EbayConnectBanner';
import { ListingMatchReviewModal } from './ListingMatchReviewModal';
import { useAuth } from '../context/AuthContext';
import {
  getPlatforms, createPlatform, updatePlatform, deletePlatform, resetPlatforms,
  getItems, getSales, getInvoices, getComps, getApiUrl
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
  const [suppliesOpen, setSuppliesOpen] = useState(false);
  const [taxReportOpen, setTaxReportOpen] = useState(false);

  // Add platform modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ name: '', fee_pct: '', flat_fee: '', notes: '', is_default: false });

  // eBay listing discovery state
  const [listingMatches, setListingMatches] = useState([]);
  const [listingMatchOpen, setListingMatchOpen] = useState(false);

  // User Preferences (Column Visibility & Category Ordering)
  const [userSettings, setUserSettingsState] = useState(getStoredUserSettings);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Export state
  const [exporting, setExporting] = useState(false);

  // VineScout / Amazon API token
  const [amazonToken, setAmazonToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenRotating, setTokenRotating] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
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
    if (userSettings.categoryOrder.includes(name)) {
      alert(`Category '${name}' already exists.`);
      return;
    }
    const categories = [...userSettings.categoryOrder, name];
    const newSettings = saveUserSettings({ ...userSettings, categoryOrder: categories });
    setUserSettingsState(newSettings);
    setNewCategoryInput('');
    showSuccess(`Added new category '${name}'.`);
  };

  const handleDeleteCategory = (cat) => {
    if (userSettings.categoryOrder.length <= 1) {
      alert('Must keep at least one category.');
      return;
    }
    if (!window.confirm(`Remove category '${cat}' from list?`)) return;
    const categories = userSettings.categoryOrder.filter(c => c !== cat);
    const newSettings = saveUserSettings({ ...userSettings, categoryOrder: categories });
    setUserSettingsState(newSettings);
    showSuccess(`Removed category '${cat}'.`);
  };

  // Platform Actions
  const handleStartEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      fee_pct: String(Math.round(p.fee_pct * 1000) / 10),
      flat_fee: String(p.flat_fee),
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
        alert('No inventory items found to export.');
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
      alert(`Export failed: ${err.message}`);
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
        alert('No sales records found to export.');
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
      alert(`Export failed: ${err.message}`);
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
      alert(`Backup failed: ${err.message}`);
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
                                    className="input-field py-1 pl-2 pr-6 text-xs font-mono"
                                  />
                                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                                </div>
                              ) : (
                                <span className="font-mono text-amber-400 font-semibold">{fmtPct(p.fee_pct)}</span>
                              )}
                            </td>

                            {/* Flat Fee */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <div className="relative w-24">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">$</span>
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={editForm.flat_fee}
                                    onChange={e => setEditForm(prev => ({ ...prev, flat_fee: e.target.value }))}
                                    className="input-field py-1 pl-6 pr-2 text-xs font-mono"
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
                onFindListings={(matches) => {
                  setListingMatches(matches);
                  setListingMatchOpen(true);
                }}
              />
            </div>

            {/* 2. VineScout / Amazon Integration */}
            <VineScoutSection
              token={amazonToken}
              loading={tokenLoading}
              rotating={tokenRotating}
              copied={tokenCopied}
              onLoad={async () => {
                setTokenLoading(true);
                try {
                  const res = await fetch(getApiUrl('/api/import/amazon-token'), { credentials: 'include' });
                  const d = await res.json();
                  setAmazonToken(d.token || null);
                } catch (e) { console.error(e); } finally { setTokenLoading(false); }
              }}
              onRotate={async () => {
                if (!window.confirm('Regenerate your API token? The old token will stop working immediately.')) return;
                setTokenRotating(true);
                try {
                  const res = await fetch(getApiUrl('/api/import/amazon-token'), { method: 'POST', credentials: 'include' });
                  const d = await res.json();
                  setAmazonToken(d.token || null);
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

            {/* 3. TechTrek Finance Integration Card */}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              {/* Supplies Tracker */}
              <div className="glass-card rounded-2xl p-5 border border-blue-500/30 bg-blue-500/5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Supplies & Packaging Overhead</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Track recurring shipping supplies (bubble mailers, PSA graded sleeves, top-loaders) and deduct them against gross profits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuppliesOpen(true)}
                  className="w-full py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-blue-400 to-indigo-400 hover:from-blue-300 hover:to-indigo-300 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Open Supplies Center</span>
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
                  <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Registered Email</span>
                  <p className="text-base font-bold text-slate-100 mt-1">{user?.email || 'N/A'}</p>
                </div>
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
                      className="input-field pr-6"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Flat Fee ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">$</span>
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

      <SuppliesTrackerModal
        isOpen={suppliesOpen}
        onClose={() => setSuppliesOpen(false)}
      />

      <TaxReportModal
        isOpen={taxReportOpen}
        onClose={() => setTaxReportOpen(false)}
      />

      <ListingMatchReviewModal
        isOpen={listingMatchOpen}
        matches={listingMatches}
        onClose={() => setListingMatchOpen(false)}
        onSaved={() => {}}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VineScout / Amazon Integration Section
// ---------------------------------------------------------------------------
function VineScoutSection({ token, loading, rotating, copied, onLoad, onRotate, onCopy }) {
  const [revealed, setRevealed] = React.useState(false);

  const displayToken = token
    ? (revealed ? token : token.slice(0, 6) + '••••••••••••••••••••••••••••••••••')
    : null;

  return (
    <div className="glass-card rounded-2xl p-6 border border-orange-900/30 bg-orange-950/10 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-orange-400" />
            VineScout / Amazon Integration
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Push Amazon Vine items directly into Outpost from your VineScout Chrome extension
          </p>
        </div>
        {!token && (
          <button
            onClick={onLoad}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-orange-300 bg-orange-950/60 hover:bg-orange-900/60 border border-orange-500/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
            {loading ? 'Loading...' : 'Show API Token'}
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        {[
          { step: '1', text: 'Copy your API token below' },
          { step: '2', text: 'Paste it in VineScout → Outpost Settings' },
          { step: '3', text: 'Click "Send to Outpost" on any Vine item page' }
        ].map(({ step, text }) => (
          <div key={step} className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold flex items-center justify-center mx-auto mb-1.5">{step}</div>
            <p className="text-[11px] text-slate-400">{text}</p>
          </div>
        ))}
      </div>

      {/* API Token */}
      {token ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
              Your API Token
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-amber-300 overflow-hidden whitespace-nowrap overflow-ellipsis">
                {displayToken}
              </div>
              <button
                type="button"
                onClick={() => setRevealed(r => !r)}
                className="px-3 py-2.5 rounded-xl text-xs border border-slate-700 text-slate-400 hover:text-slate-200 transition-all"
                title={revealed ? 'Hide token' : 'Reveal token'}
              >
                {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={onCopy}
                className={`px-3 py-2.5 rounded-xl text-xs border transition-all flex items-center gap-1.5 ${
                  copied
                    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30'
                    : 'text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title="Copy token"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
              Endpoint URL
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-blue-300 overflow-hidden whitespace-nowrap">
                https://techtrekgt.com/outpost/api/import/amazon
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText('https://techtrekgt.com/outpost/api/import/amazon')}
                className="px-3 py-2.5 rounded-xl text-xs border border-slate-700 text-slate-400 hover:text-slate-200 transition-all"
                title="Copy endpoint URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
            <p className="text-[11px] text-slate-500">Token is user-scoped and never expires unless rotated.</p>
            <button
              type="button"
              onClick={onRotate}
              disabled={rotating}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-red-400 bg-red-950/40 hover:bg-red-900/40 border border-red-800/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {rotating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Rotate Token
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-2">Click "Show API Token" above to reveal your integration credentials.</p>
      )}
    </div>
  );
}
