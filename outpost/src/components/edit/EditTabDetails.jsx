import React from 'react';
import {
  Tag, Hash, Trophy, User, Layers, Calendar, FileText,
  ShieldCheck, ExternalLink, Award, CheckCircle2, Receipt, Calculator
} from 'lucide-react';
import { AUTHENTICATORS, getCertVerificationUrl, getAuthenticatorMeta } from '../../utils/certLookup';
import { fmtCurrency } from '../../utils/formulaPreview';

export function EditTabDetails({ form, updateField, allCategories = [], item }) {
  const certMeta = getAuthenticatorMeta(form.authenticator);
  const autoCertUrl = getCertVerificationUrl(form.authenticator, form.cert_number);
  const effectiveCertUrl = form.cert_verification_url || autoCertUrl;

  const proratedTax = Number(item?.prorated_tax || 0);
  const proratedShip = Number(item?.prorated_shipping || 0);
  const proratedDisc = Number(item?.prorated_discount || 0);
  const proratedNet = proratedTax + proratedShip - proratedDisc;

  return (
    <div className="space-y-4">
      {/* 1. Primary Title / Description */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>Item Title & Description <span className="text-amber-400">*</span></span>
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            Primary title used for marketplace listings & comps matching
          </span>
        </label>
        <input
          type="text"
          required
          value={form.item_name}
          onChange={e => updateField('item_name', e.target.value)}
          className="input-field text-sm font-medium text-white placeholder-slate-500"
          placeholder="e.g. Patrick Mahomes Signed Red Jersey JSA COA"
        />
      </div>

      {/* 2. SKU & Category & Quantity */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-amber-400/80" />
            <span>Store SKU / Code</span>
          </label>
          <input
            type="text"
            value={form.sku || ''}
            onChange={e => updateField('sku', e.target.value)}
            className="input-field text-xs font-mono text-amber-300 font-semibold"
            placeholder="e.g. TT-NFL-0042"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Category</span>
          </label>
          <select
            value={form.category || ''}
            onChange={e => updateField('category', e.target.value)}
            className="input-field text-xs font-semibold text-slate-200"
          >
            <option value="">-- Select Category --</option>
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Quantity</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={form.quantity ?? 1}
            onChange={e => updateField('quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="input-field text-xs font-mono text-slate-200"
            placeholder="1"
          />
        </div>
      </div>

      {/* 3. Sport/Genre & Athlete/Signer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-slate-400" />
            <span>Sport / Genre</span>
          </label>
          <input
            type="text"
            value={form.sport_genre || ''}
            onChange={e => updateField('sport_genre', e.target.value)}
            className="input-field text-xs"
            placeholder="e.g. NFL, MLB, Entertainment, Marvel"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>Athlete / Signer / Subject</span>
          </label>
          <input
            type="text"
            value={form.athlete_person || ''}
            onChange={e => updateField('athlete_person', e.target.value)}
            className="input-field text-xs"
            placeholder="e.g. Patrick Mahomes, Michael Jordan"
          />
        </div>
      </div>

      {/* 4. Integrated Acquisition, Landed Cost & Consignment Section */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Acquisition & Landed Cost (COGS)
            </span>
          </div>

          {item?.invoice_ref && (
            <span className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              Batch: {item.invoice_ref}
            </span>
          )}
        </div>

        {/* Cost Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Base Unit Purchase Price ($)</span>
              <span className="text-[10px] text-slate-400 font-normal">Invoice line price</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.unit_price ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  const parsed = parseFloat(val);
                  const autoLanded = !isNaN(parsed) ? (parsed + proratedNet).toFixed(2) : '';
                  updateField('unit_price', val);
                  updateField('true_total_cost', autoLanded);
                }}
                className="input-field text-sm pl-8 font-mono font-bold text-white bg-slate-950"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Total Landed Cost / COGS ($)</span>
              <span className="text-[10px] text-amber-400 font-semibold">True Cost Basis</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs font-bold pointer-events-none">$</span>
              <input
                type="number"
                step="0.01"
                value={form.true_total_cost ?? ''}
                onChange={e => updateField('true_total_cost', e.target.value)}
                className="input-field text-sm pl-8 font-mono font-black text-amber-400 bg-slate-950 border-amber-500/40"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Compact Prorated Invoicing Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Prorated Tax</span>
            <span className="text-xs font-semibold text-slate-200">{fmtCurrency(proratedTax)}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Prorated Shipping</span>
            <span className="text-xs font-semibold text-slate-200">{fmtCurrency(proratedShip)}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Prorated Discount</span>
            <span className="text-xs font-semibold text-emerald-400">-{fmtCurrency(proratedDisc)}</span>
          </div>
          <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block">Net Proration</span>
            <span className="text-xs font-bold text-amber-300">+{fmtCurrency(proratedNet)}</span>
          </div>
        </div>
      </div>

      {/* 5. Authentication & Cert Verification Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Authentication & Certification</span>
          </div>

          {effectiveCertUrl && (
            <a
              href={effectiveCertUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/30 transition-all hover:bg-emerald-500/20"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Verify in Official Database ↗</span>
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Authenticator Company
            </label>
            <select
              value={form.authenticator || ''}
              onChange={e => {
                const newAuth = e.target.value;
                updateField('authenticator', newAuth);
                const generated = getCertVerificationUrl(newAuth, form.cert_number);
                if (generated) updateField('cert_verification_url', generated);
              }}
              className="input-field text-xs font-semibold text-amber-300"
            >
              <option value="">-- Unauthenticated / Raw --</option>
              {AUTHENTICATORS.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {form.authenticator && certMeta?.name && (
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Recognized: <strong className="text-slate-200">{certMeta.name}</strong></span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Certificate / Serial / Hologram #
            </label>
            <input
              type="text"
              value={form.cert_number || ''}
              onChange={e => {
                const newCert = e.target.value;
                updateField('cert_number', newCert);
                const generated = getCertVerificationUrl(form.authenticator, newCert);
                if (generated) updateField('cert_verification_url', generated);
              }}
              className="input-field text-xs font-mono text-cyan-300 font-bold"
              placeholder="e.g. WIT384919, 104928, or PSA cert #"
            />
          </div>
        </div>

        {/* Verification URL (Auto-Generated or Custom) */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
            <span>Official Verification URL</span>
            <span className="text-[10px] text-slate-400 font-normal">Auto-generated or custom web link</span>
          </label>
          <input
            type="url"
            value={form.cert_verification_url || ''}
            onChange={e => updateField('cert_verification_url', e.target.value)}
            className="input-field text-xs font-mono text-slate-300"
            placeholder="https://..."
          />
        </div>
      </div>

      {/* 6. Best Listing Window */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Target Listing Window & Seasonality</span>
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            When this item yields peak market demand
          </span>
        </label>
        <input
          type="text"
          value={form.best_listing_window || ''}
          onChange={e => updateField('best_listing_window', e.target.value)}
          className="input-field text-xs"
          placeholder="e.g. NFL Season Kickoff, Playoffs, Super Bowl Week, Christmas"
        />
      </div>

      {/* 7. Condition & Memorabilia Notes */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-amber-400" />
          <span>Condition Notes & Inscriptions</span>
        </label>
        <textarea
          rows={3}
          value={form.notes || ''}
          onChange={e => updateField('notes', e.target.value)}
          className="input-field text-xs resize-none"
          placeholder="Item condition, ink color, inscriptions (e.g. 'SB LIV MVP'), framing dimensions, storage bin location..."
        />
      </div>
    </div>
  );
}
