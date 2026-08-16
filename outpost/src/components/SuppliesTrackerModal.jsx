import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Package, Plus, Trash2, Download,
  Loader2, CheckCircle2, AlertCircle
} from 'lucide-react';
import { getSupplies, createSupply, deleteSupply } from '../utils/auctionApi';

const SUPPLY_CATEGORIES = [
  'Bubble Mailers',
  'Graded Slab Sleeves',
  'Toploaders & Semi-Rigids',
  'Thermal Shipping Labels',
  'Shipping Boxes & Tape',
  'Storage Bins & Organizers',
  'Other Materials'
];

export function SuppliesTrackerModal({ isOpen, onClose }) {
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    category: 'Bubble Mailers',
    purchase_date: new Date().toISOString().split('T')[0],
    cost: '',
    quantity: '1',
    notes: ''
  });

  const loadSuppliesData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSupplies();
      setSupplies(res.supplies || []);
    } catch (err) {
      setError(err.message || 'Failed to load supplies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSuppliesData();
      setShowAddForm(false);
    }
  }, [isOpen]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Item name is required');
      return;
    }
    if (!form.cost || parseFloat(form.cost) < 0) {
      setError('Valid cost is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await createSupply({
        name: form.name,
        category: form.category,
        purchase_date: form.purchase_date,
        cost: parseFloat(form.cost),
        quantity: parseInt(form.quantity, 10) || 1,
        notes: form.notes
      });
      setSuccessMsg('Supply expense logged successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      setForm({
        name: '',
        category: 'Bubble Mailers',
        purchase_date: new Date().toISOString().split('T')[0],
        cost: '',
        quantity: '1',
        notes: ''
      });
      setShowAddForm(false);
      await loadSuppliesData();
    } catch (err) {
      setError(err.message || 'Failed to save supply entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete supply record "${name}"?`)) return;
    try {
      await deleteSupply(id);
      setSupplies(prev => prev.filter(s => s.id !== id));
      setSuccessMsg('Supply record removed.');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      setError(err.message || 'Failed to delete supply record');
    }
  };

  // Metrics
  const metrics = useMemo(() => {
    let totalCost = 0;
    let totalUnits = 0;
    for (const s of supplies) {
      totalCost += s.cost || 0;
      totalUnits += s.quantity || 0;
    }
    const avgUnitCost = totalUnits > 0 ? totalCost / totalUnits : 0;
    return { totalCost, totalUnits, avgUnitCost };
  }, [supplies]);

  // Filtered List
  const filteredSupplies = useMemo(() => {
    if (selectedCategory === 'All') return supplies;
    return supplies.filter(s => s.category === selectedCategory);
  }, [supplies, selectedCategory]);

  const exportSuppliesCSV = () => {
    if (!supplies.length) return;
    const headers = ['Date', 'Item Name', 'Category', 'Quantity', 'Total Cost', 'Unit Cost', 'Notes'];
    const rows = supplies.map(s => [
      s.purchase_date,
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${s.category || ''}"`,
      s.quantity,
      (s.cost || 0).toFixed(2),
      (s.unit_cost || 0).toFixed(4),
      `"${(s.notes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `techtrek-supplies-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-4xl glass-card rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden my-auto animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 flex items-center gap-2">
                Packaging & Shipping Supplies Expense Center
              </h2>
              <p className="text-[11px] text-slate-400">
                Track bubble mailers, graded slab sleeves, top-loaders, and shipping overhead deductions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportSuppliesCSV}
              disabled={!supplies.length}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1.5 disabled:opacity-50"
              title="Export Supplies CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl glass-card-light border border-slate-800 bg-slate-900/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Supplies Invested</span>
              <div className="text-xl font-black text-white mt-1">
                ${metrics.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500">Deductible business expense</span>
            </div>

            <div className="p-4 rounded-xl glass-card-light border border-slate-800 bg-slate-900/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Units Acquired</span>
              <div className="text-xl font-black text-blue-400 mt-1">
                {metrics.totalUnits.toLocaleString()} units
              </div>
              <span className="text-[10px] text-slate-500">Across {supplies.length} supply logs</span>
            </div>

            <div className="p-4 rounded-xl glass-card-light border border-slate-800 bg-slate-900/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Blended Unit Overhead</span>
              <div className="text-xl font-black text-amber-400 mt-1">
                ${metrics.avgUnitCost.toFixed(3)} / unit
              </div>
              <span className="text-[10px] text-slate-500">Average packaging cost</span>
            </div>
          </div>

          {/* Action & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['All', ...SUPPLY_CATEGORIES].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-blue-400 to-indigo-400 hover:from-blue-300 hover:to-indigo-300 transition-all flex items-center gap-1.5 flex-shrink-0 shadow-md shadow-blue-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'Cancel Entry' : 'Log Supply Purchase'}</span>
            </button>
          </div>

          {/* Add Supply Purchase Form */}
          {showAddForm && (
            <form onSubmit={handleCreate} className="p-4 rounded-2xl bg-slate-900/90 border border-blue-500/30 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-400" />
                  New Supply Expense Entry
                </h3>
                <span className="text-[10px] text-slate-400">All fields automatically compute unit costs</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supply Item Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4x7 Padded Bubble Mailers (250 Pack)"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-400"
                  >
                    {SUPPLY_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchase Date</label>
                  <input
                    type="date"
                    value={form.purchase_date}
                    onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cost ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="29.99"
                    value={form.cost}
                    onChange={e => setForm({ ...form, cost: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quantity (Units)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="250"
                    value={form.quantity}
                    onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400 font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unit Cost Preview</label>
                  <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-400 font-mono flex items-center justify-between">
                    <span>Computed Unit Price:</span>
                    <span className="font-bold">
                      ${form.cost && form.quantity && parseFloat(form.quantity) > 0
                        ? (parseFloat(form.cost) / parseFloat(form.quantity)).toFixed(4)
                        : '0.0000'} / unit
                    </span>
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-4">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Purchased from Amazon / Uline"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-blue-400 hover:bg-blue-300 transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Save Supply Expense</span>
                </button>
              </div>
            </form>
          )}

          {/* Supplies Ledger Table */}
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/50">
            {loading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="text-xs font-bold">Loading supply inventory...</span>
              </div>
            ) : filteredSupplies.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Package className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs font-bold text-slate-300">No supply entries found</p>
                <p className="text-[11px] text-slate-500">Log packaging materials, boxes, and top-loaders to calculate true overhead.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    <tr>
                      <th className="p-3">Purchase Date</th>
                      <th className="p-3">Supply Item</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-right">Quantity</th>
                      <th className="p-3 text-right">Total Cost</th>
                      <th className="p-3 text-right">Unit Overhead</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredSupplies.map(sup => (
                      <tr key={sup.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 text-slate-400 whitespace-nowrap font-mono">{sup.purchase_date}</td>
                        <td className="p-3 font-bold text-white">
                          <div>{sup.name}</div>
                          {sup.notes && <div className="text-[10px] text-slate-500 font-normal">{sup.notes}</div>}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                            {sup.category}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-300">
                          {(sup.quantity || 1).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-100">
                          ${(sup.cost || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-400 font-bold">
                          ${(sup.unit_cost || 0).toFixed(3)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDelete(sup.id, sup.name)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
