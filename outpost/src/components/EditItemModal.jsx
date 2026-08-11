import React, { useState, useEffect } from 'react';
import {
  Package, X, Save, Loader2, ExternalLink, ShieldCheck, Tag,
  DollarSign, Calendar, FileText, Sparkles, CheckCircle2, AlertCircle, Copy
} from 'lucide-react';
import { updateItem } from '../utils/auctionApi';
import { getCertVerificationUrl, getAuthenticatorMeta } from '../utils/certLookup';
import { fmtCurrency, fmtPct } from '../utils/formulaPreview';
import { cleanItemName, cleanAthleteName, cleanItemDescription } from '../utils/spreadsheetParser';

const PLATFORM_FEE_PRESETS = {
  'eBay':         { fee_pct: 13.5, flat_fee: 0.40 },
  'Whatnot':      { fee_pct: 8.0,  flat_fee: 0.30 },
  'Mercari':      { fee_pct: 10.0, flat_fee: 0.50 },
  'Poshmark':     { fee_pct: 20.0, flat_fee: 0.00 },
  'SidelineSwap': { fee_pct: 12.0, flat_fee: 0.50 },
  'StockX':       { fee_pct: 10.0, flat_fee: 0.00 },
  'Private Sale': { fee_pct: 0.0,  flat_fee: 0.00 },
};

export function EditItemModal({ isOpen, item, categoryOptions = [], platformOptions = [], onClose, onUpdated }) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'financials' | 'status'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    item_name: '',
    category: '',
    sport_genre: '',
    athlete_person: '',
    authenticator: '',
    cert_number: '',
    status: 'Available',
    platform: '',
    platform_fee_pct: '13.5',
    platform_flat_fee: '0.40',
    current_list_price: '',
    target_margin_pct: '',
    boost_pct: '',
    est_shipping_cost: '',
    date_listed: '',
    date_sold: '',
    best_listing_window: '',
    notes: ''
  });

  useEffect(() => {
    if (item) {
      setForm({
        item_name: cleanItemDescription(item.item_name || '', item.athlete_person, item.authenticator),
        category: item.category || '',
        sport_genre: item.sport_genre || '',
        athlete_person: cleanAthleteName(item.athlete_person || ''),
        authenticator: item.authenticator ? item.authenticator.replace(/#.*$/, '').trim() : '',
        cert_number: item.cert_number || '',
        status: item.status || 'Available',
        platform: item.platform || '',
        platform_fee_pct: item.platform_fee_pct != null ? String(parseFloat((item.platform_fee_pct * 100).toFixed(4))) : '13.5',
        platform_flat_fee: item.platform_flat_fee != null ? String(item.platform_flat_fee) : '0.40',
        current_list_price: item.current_list_price != null ? String(item.current_list_price) : '',
        target_margin_pct: item.target_margin_pct != null ? String(item.target_margin_pct * 100) : '20',
        boost_pct: item.boost_pct != null ? String(item.boost_pct * 100) : '0',
        est_shipping_cost: item.est_shipping_cost != null ? String(item.est_shipping_cost) : '0',
        date_listed: item.date_listed || '',
        date_sold: item.date_sold || '',
        best_listing_window: item.best_listing_window || '',
        notes: item.notes || ''
      });
      setError('');
      setSuccess('');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const certMeta = getAuthenticatorMeta(form.authenticator);
  const certUrl = getCertVerificationUrl(form.authenticator, form.cert_number);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.item_name.trim()) {
      setError('Item name is required.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        item_name: form.item_name.trim(),
        category: form.category,
        sport_genre: form.sport_genre.trim(),
        athlete_person: form.athlete_person.trim(),
        authenticator: form.authenticator,
        cert_number: form.cert_number.trim(),
        status: form.status,
        platform: form.platform,
        platform_fee_pct: form.platform_fee_pct !== '' ? parseFloat(form.platform_fee_pct) / 100 : 0.135,
        platform_flat_fee: form.platform_flat_fee !== '' ? parseFloat(form.platform_flat_fee) : 0.40,
        current_list_price: form.current_list_price !== '' ? parseFloat(form.current_list_price) : null,
        target_margin_pct: form.target_margin_pct !== '' ? parseFloat(form.target_margin_pct) / 100 : 0.20,
        boost_pct: form.boost_pct !== '' ? parseFloat(form.boost_pct) / 100 : 0,
        est_shipping_cost: form.est_shipping_cost !== '' ? parseFloat(form.est_shipping_cost) : 0,
        date_listed: form.date_listed || null,
        date_sold: form.date_sold || null,
        best_listing_window: form.best_listing_window.trim(),
        notes: form.notes.trim()
      };

      const res = await updateItem(item.id, payload);
      setSuccess('Item details updated successfully.');
      if (onUpdated) {
        onUpdated(item.id, {
          ...payload,
          min_sell_price: res.min_sell_price ?? item.min_sell_price,
          suggested_list_price: res.suggested_list_price ?? item.suggested_list_price
        });
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message || 'Failed to update item.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlatformChange = (selectedPlatform) => {
    const preset = PLATFORM_FEE_PRESETS[selectedPlatform];
    if (preset) {
      setForm(prev => ({
        ...prev,
        platform: selectedPlatform,
        platform_fee_pct: String(preset.fee_pct),
        platform_flat_fee: String(preset.flat_fee)
      }));
    } else {
      setForm(prev => ({ ...prev, platform: selectedPlatform }));
    }
  };

  const liveDivisor = 1 - (parseFloat(form.platform_fee_pct || 0) / 100) - (parseFloat(form.boost_pct || 0) / 100);
  const liveMinSell = liveDivisor > 0
    ? Math.round(((item.true_total_cost + (parseFloat(form.est_shipping_cost || 0)) + (parseFloat(form.platform_flat_fee || 0))) / liveDivisor) * 100) / 100
    : 0;
  const liveSuggestedList = Math.round((liveMinSell * (1 + (parseFloat(form.target_margin_pct || 0) / 100))) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="glass-card rounded-2xl border border-slate-800 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh] my-auto">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-tight flex items-center gap-2">
                Edit Item Details
                <span className="text-xs font-mono font-normal text-slate-500">#{item.id?.slice(0, 8)}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-md">
                {item.item_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 border-b border-slate-800/80 bg-slate-950/40 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'details'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" /> General & Authentication
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('financials')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'financials'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" /> Costs & Pricing Floors
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'status'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Status & Notes
          </button>
        </div>

        {/* Alert Notifications */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Form Body */}
        <form id="edit-item-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* TAB 1: GENERAL & AUTHENTICATION */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Item Description <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.item_name}
                  onChange={e => setForm({ ...form, item_name: e.target.value })}
                  className="input-field text-sm font-medium"
                  placeholder="e.g. Patrick Mahomes Signed Red Jersey JSA COA"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="input-field text-xs"
                  >
                    <option value="">-- Select Category --</option>
                    {categoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Sport / Genre</label>
                  <input
                    type="text"
                    value={form.sport_genre}
                    onChange={e => setForm({ ...form, sport_genre: e.target.value })}
                    className="input-field text-xs"
                    placeholder="e.g. Football, Baseball, Basketball"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Athlete / Signer Person</label>
                  <input
                    type="text"
                    value={form.athlete_person}
                    onChange={e => setForm({ ...form, athlete_person: e.target.value })}
                    className="input-field text-xs"
                    placeholder="e.g. Derek Jeter"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Authenticator Company</label>
                  <select
                    value={form.authenticator}
                    onChange={e => setForm({ ...form, authenticator: e.target.value })}
                    className="input-field text-xs"
                  >
                    <option value="">-- None / Raw --</option>
                    {['Beckett', 'JSA', 'PSA', 'ACOA', 'Upper Deck', 'Fanatics', 'Tristar', 'Steiner', 'Schwartz', 'Other'].map(auth => (
                      <option key={auth} value={auth}>{auth}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300">Certification / Serial #</label>
                  {certUrl && (
                    <a
                      href={certUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <ShieldCheck className="w-3 h-3" /> Verify Cert on {form.authenticator} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <input
                  type="text"
                  value={form.cert_number}
                  onChange={e => setForm({ ...form, cert_number: e.target.value })}
                  className="input-field text-xs font-mono"
                  placeholder="e.g. WIT384910 or 104928"
                />
              </div>
            </div>
          )}

          {/* TAB 2: COSTS & PRICING FLOORS */}
          {activeTab === 'financials' && (
            <div className="space-y-4">
              {/* Landed cost summary callout */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total Landed Cost (True Cost)</p>
                  <p className="text-xl font-black text-amber-400 mt-0.5">{fmtCurrency(item.true_total_cost)}</p>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Unit Price: {fmtCurrency(item.unit_price)}</p>
                  <p>Tax & Shipping: {fmtCurrency((item.prorated_tax || 0) + (item.prorated_shipping || 0))}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Selling Platform</label>
                  <select
                    value={form.platform}
                    onChange={e => handlePlatformChange(e.target.value)}
                    className="input-field text-xs font-semibold text-amber-300"
                  >
                    <option value="">-- Select Platform --</option>
                    {platformOptions.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Current Active List Price ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.current_list_price}
                      onChange={e => setForm({ ...form, current_list_price: e.target.value })}
                      className="input-field text-xs pl-7"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Listing Company Fees & Rates */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <span>Listing Company Fee Breakdown</span>
                    <span className="text-[10px] font-mono font-normal text-slate-400">({form.platform || 'Custom'})</span>
                  </p>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {form.platform_fee_pct || 0}% + ${form.platform_flat_fee || '0.00'} per order
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Platform Fee Rate (%) <span className="text-slate-500 font-normal">(eBay 13.5%)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.05"
                        value={form.platform_fee_pct}
                        onChange={e => setForm({ ...form, platform_fee_pct: e.target.value })}
                        className="input-field text-xs pr-7 font-mono text-amber-300 font-bold"
                        placeholder="13.5"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Per-Order Flat Fee ($) <span className="text-slate-500 font-normal">(eBay $0.40)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                      <input
                        type="number"
                        step="0.05"
                        value={form.platform_flat_fee}
                        onChange={e => setForm({ ...form, platform_flat_fee: e.target.value })}
                        className="input-field text-xs pl-7 font-mono text-amber-300 font-bold"
                        placeholder="0.40"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Target Margin %</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      value={form.target_margin_pct}
                      onChange={e => setForm({ ...form, target_margin_pct: e.target.value })}
                      className="input-field text-xs pr-6"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Promoted Listing Boost %</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={form.boost_pct}
                      onChange={e => setForm({ ...form, boost_pct: e.target.value })}
                      className="input-field text-xs pr-6"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Est. Outbound Shipping ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                    <input
                      type="number"
                      step="0.5"
                      value={form.est_shipping_cost}
                      onChange={e => setForm({ ...form, est_shipping_cost: e.target.value })}
                      className="input-field text-xs pl-7"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Min Floor Break-Even</span>
                  <p className="text-base font-black text-emerald-400 mt-0.5">{fmtCurrency(liveMinSell)}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Suggested List Price</span>
                  <p className="text-base font-black text-blue-400 mt-0.5">{fmtCurrency(liveSuggestedList)}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STATUS & NOTES */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Inventory Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    className="input-field text-xs font-semibold"
                  >
                    <option value="Available">Available</option>
                    <option value="Listed">Listed</option>
                    <option value="Sold">Sold</option>
                    <option value="Kept for Self">Kept for Self</option>
                    <option value="Returned">Returned</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Date Listed</label>
                  <input
                    type="date"
                    value={form.date_listed}
                    onChange={e => setForm({ ...form, date_listed: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Date Sold</label>
                  <input
                    type="date"
                    value={form.date_sold}
                    onChange={e => setForm({ ...form, date_sold: e.target.value })}
                    className="input-field text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Best Target Selling Window</label>
                <input
                  type="text"
                  value={form.best_listing_window}
                  onChange={e => setForm({ ...form, best_listing_window: e.target.value })}
                  className="input-field text-xs"
                  placeholder="e.g. NFL Season Kickoff, Playoffs, Christmas"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Notes & Memorabilia Details</label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input-field text-xs"
                  placeholder="Condition notes, inscription details, framing dimensions..."
                />
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-slate-500">
              Invoice Ref: <span className="text-slate-300 font-mono">{item.invoice_ref || '--'}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary w-auto px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary w-auto px-5 py-2 text-xs flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
