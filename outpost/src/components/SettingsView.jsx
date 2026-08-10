import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Shield, Download, RefreshCw, Plus, Edit2, Trash2,
  CheckCircle2, AlertCircle, Loader2, Save, FileText, Database, User, ShieldCheck,
  FileSpreadsheet, Upload, ArrowRightLeft, Sparkles, Boxes, Calculator, LayoutGrid, ArrowUp, ArrowDown, Eye, EyeOff
} from 'lucide-react';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';
import { FinanceSyncModal } from './FinanceSyncModal';
import { SuppliesTrackerModal } from './SuppliesTrackerModal';
import { TaxReportModal } from './TaxReportModal';
import { useAuth } from '../context/AuthContext';
import {
  getPlatforms, createPlatform, updatePlatform, deletePlatform, resetPlatforms,
  getItems, getSales, getInvoices, getComps
} from '../utils/auctionApi';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { DEFAULT_COLUMNS, DEFAULT_CATEGORIES, getStoredUserSettings, saveUserSettings, resetColumnWidths } from '../utils/userSettings';

export function SettingsView() {
  const { user } = useAuth();
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
  const [addForm, setAddForm] = useState({ name: '', fee_pct: '', flat_fee: '', notes: '', is_default: false });

  // User Preferences (Column Visibility & Category Ordering)
  const [userSettings, setUserSettingsState] = useState(getStoredUserSettings);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Export state
  const [exporting, setExporting] = useState(false);

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

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleStartEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      fee_pct: String(Math.round(p.fee_pct * 1000) / 10), // convert 0.136 to 13.6
      flat_fee: String(p.flat_fee),
      notes: p.notes || '',
      is_default: Boolean(p.is_default)
    });
  };

  const handleSaveEdit = async (id) => {
    try {
      await updatePlatform(id, {
        name: editForm.name,
        fee_pct: Number(editForm.fee_pct) / 100, // convert 13.6 to 0.136
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
      setNewPlatform({ name: '', fee_pct: '0.10', flat_fee: '0.30', notes: '', is_default: false });
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
    <div className="w-full flex-1 min-h-0 overflow-y-auto space-y-8 pb-12 pr-1">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-amber-400" />
          Settings & Fee Management
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Configure marketplace fee schedules, platform defaults, and export ledger backups
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Section 1: Platform Fee Schedules */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              Marketplace & Selling Platform Fee Schedules
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              These rates automatically compute your break-even floor prices and net sales proceeds
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> Reset Defaults
            </button>
            <button
              onClick={() => setAddModalOpen(true)}
              className="btn-primary w-auto px-3.5 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Platform
            </button>
          </div>
        </div>

        {loading && platforms.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto mb-2" />
            <p className="text-xs">Loading platform fees...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3">Fee Rate</th>
                  <th className="py-2.5 px-3">Flat Fee</th>
                  <th className="py-2.5 px-3">Notes & Tier Details</th>
                  <th className="py-2.5 px-3">Default</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {platforms.map(p => {
                  const isEditing = editingId === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Name */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            className="input-field py-1 px-2 text-xs font-semibold"
                          />
                        ) : (
                          <span className="font-bold text-slate-200">{p.name}</span>
                        )}
                      </td>

                      {/* Fee Pct */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <div className="relative w-20">
                            <input
                              type="number"
                              step="0.1"
                              value={editForm.fee_pct}
                              onChange={e => setEditForm(prev => ({ ...prev, fee_pct: e.target.value }))}
                              className="input-field py-1 pl-2 pr-5 text-xs font-mono"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                          </div>
                        ) : (
                          <span className="font-mono text-amber-400 font-semibold">{fmtPct(p.fee_pct)}</span>
                        )}
                      </td>

                      {/* Flat Fee */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <div className="relative w-20">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                            <input
                              type="number"
                              step="0.05"
                              value={editForm.flat_fee}
                              onChange={e => setEditForm(prev => ({ ...prev, flat_fee: e.target.value }))}
                              className="input-field py-1 pl-5 pr-2 text-xs font-mono"
                            />
                          </div>
                        ) : (
                          <span className="font-mono text-slate-300">{fmtCurrency(p.flat_fee)}</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.notes}
                            onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                            className="input-field py-1 px-2 text-xs"
                          />
                        ) : (
                          <span className="text-slate-400 text-[11px]">{p.notes || '--'}</span>
                        )}
                      </td>

                      {/* Default */}
                      <td className="py-3 px-3">
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
                            Primary
                          </span>
                        ) : (
                          <span className="text-slate-600">--</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(p.id)}
                              className="p-1 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all font-bold"
                              title="Save Changes"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-all"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleStartEdit(p)}
                              className="p-1 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                              title="Edit Fees"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePlatform(p.id, p.name)}
                              className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-all"
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

      {/* Section 2: Data Export Center */}
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
          <div className="glass-card-light rounded-xl p-4 border border-slate-800 flex flex-col justify-between space-y-3">
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
              onClick={exportInventoryCSV}
              disabled={exporting}
              className="w-full py-2 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all flex items-center justify-center gap-1.5"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export Inventory (.CSV)
            </button>
          </div>

          {/* Export Sales CSV */}
          <div className="glass-card-light rounded-xl p-4 border border-slate-800 flex flex-col justify-between space-y-3">
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
              onClick={exportSalesCSV}
              disabled={exporting}
              className="w-full py-2 rounded-xl text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export Sales (.CSV)
            </button>
          </div>

          {/* Full Database Backup JSON */}
          <div className="glass-card-light rounded-xl p-4 border border-slate-800 flex flex-col justify-between space-y-3">
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
              onClick={exportFullBackupJSON}
              disabled={exporting}
              className="w-full py-2 rounded-xl text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all flex items-center justify-center gap-1.5"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Full Backup (.JSON)
            </button>
          </div>

          {/* Import Spreadsheet (.xlsx / .csv) */}
          <div className="glass-card-light rounded-xl p-4 border border-amber-500/30 bg-amber-500/5 flex flex-col justify-between space-y-3 md:col-span-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-white">Spreadsheet Data Importer & Excel Migration</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Upload your Pristine Auction Tracker workbook (.xlsx, .xls, .csv) to batch-import or replace your inventory, purchase batches, and sales log.
                </p>
              </div>
              <button
                onClick={() => setImporterOpen(true)}
                className="btn-primary w-auto px-4 py-2 text-xs flex items-center gap-2 flex-shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Launch Spreadsheet Importer</span>
              </button>
            </div>
          </div>

          {/* Supplies & Packaging Tracker */}
          <div className="glass-card-light rounded-xl p-4 border border-blue-500/30 bg-blue-500/5 flex flex-col justify-between space-y-3 md:col-span-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-white">Packaging & Supplies Overhead Tracker</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Track recurring supply expenses (bubble mailers, PSA graded sleeves, top-loaders, thermal labels) and deduct them against gross profits.
                </p>
              </div>
              <button
                onClick={() => setSuppliesOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-blue-400 to-indigo-400 hover:from-blue-300 hover:to-indigo-300 transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-blue-500/20"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Open Supplies Center</span>
              </button>
            </div>
          </div>

          {/* IRS Schedule C & Tax Valuation Report */}
          <div className="glass-card-light rounded-xl p-4 border border-amber-500/30 bg-amber-500/5 flex flex-col justify-between space-y-3 md:col-span-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-white">Year-End IRS Schedule C & Inventory Valuation</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Generate CPA-ready Schedule C tax reports with gross receipts, cost of goods sold (COGS), platform fees, shipping costs, and ending inventory valuation.
                </p>
              </div>
              <button
                onClick={() => setTaxReportOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-amber-500/20"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Generate Tax Report</span>
              </button>
            </div>
          </div>

          {/* TechTrek Finance Cross-Portal Sync */}
          <div className="glass-card-light rounded-xl p-4 border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between space-y-3 md:col-span-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-white">TechTrek Finance Household Sync</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Connect your cumulative realized auction profits directly to your TechTrek Finance household budget accounts in Cloudflare D1.
                </p>
              </div>
              <button
                onClick={() => setFinanceSyncOpen(true)}
                className="px-4 py-2 rounded-xl text-xs font-black text-slate-950 bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 transition-all flex items-center gap-2 flex-shrink-0 shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Launch Finance Sync</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2.5: Inventory View Columns & Category Customization */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
        <div className="border-b border-slate-800/60 pb-4">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-amber-400" />
            Inventory Table Customization & Category Ordering
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure column visibility for all inventory views and re-order product categories
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column Visibility & Width Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                Column Visibility & Width Defaults
              </h3>
              <button
                type="button"
                onClick={handleResetColumnWidths}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 transition-all flex items-center gap-1"
                title="Reset column widths to factory defaults"
              >
                <RefreshCw className="w-3 h-3" /> Reset Column Widths
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              {DEFAULT_COLUMNS.map(col => {
                const isVisible = userSettings.columnVisibility[col.key] !== false;
                return (
                  <label
                    key={col.key}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
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
                className="btn-primary w-auto px-3 py-1.5 text-xs flex items-center gap-1 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1.5 max-h-72 overflow-y-auto">
              {userSettings.categoryOrder.map((cat, idx) => (
                <div
                  key={cat}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-200"
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

      {/* Section 3: Profile & Security Summary */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
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
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800">
            <span className="text-slate-500 font-medium">Logged in Name</span>
            <p className="text-sm font-bold text-slate-200 mt-0.5">{user?.name || 'Account Holder'}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800">
            <span className="text-slate-500 font-medium">Registered Email</span>
            <p className="text-sm font-bold text-slate-200 mt-0.5">{user?.email || 'N/A'}</p>
          </div>
        </div>
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
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Flat Fee ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
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

      {/* Spreadsheet Importer Modal */}
      <SpreadsheetImporterModal
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
        onImportSuccess={() => showSuccess('Spreadsheet data successfully imported into your account!')}
      />

      {/* TechTrek Finance Sync Modal */}
      <FinanceSyncModal
        isOpen={financeSyncOpen}
        onClose={() => setFinanceSyncOpen(false)}
      />

      {/* Supplies & Packaging Modal */}
      <SuppliesTrackerModal
        isOpen={suppliesOpen}
        onClose={() => setSuppliesOpen(false)}
      />

      {/* Year-End Tax & Schedule C Report Modal */}
      <TaxReportModal
        isOpen={taxReportOpen}
        onClose={() => setTaxReportOpen(false)}
      />
    </div>
  );
}
