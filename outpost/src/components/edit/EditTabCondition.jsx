import React from 'react';
import { ShieldCheck, ExternalLink, Award, FileText, CheckCircle2 } from 'lucide-react';
import { AUTHENTICATORS, getCertVerificationUrl, getAuthenticatorMeta } from '../../utils/certLookup';

export function EditTabCondition({ form, updateField }) {
  const certMeta = getAuthenticatorMeta(form.authenticator);
  const autoCertUrl = getCertVerificationUrl(form.authenticator, form.cert_number);
  const effectiveCertUrl = form.cert_verification_url || autoCertUrl;

  return (
    <div className="space-y-4">
      {/* Authentication & Cert Verification Card */}
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

      {/* Memorabilia Condition, Framing & Inscription Details */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200">Condition Notes & Inscriptions</span>
        </div>

        <p className="text-[11px] text-slate-400">
          Document ink color, pen type, inscriptions (e.g. "SB LVII MVP"), framing dimensions, UV acrylic condition, and any defects.
        </p>

        <textarea
          rows={4}
          value={form.notes || ''}
          onChange={e => updateField('notes', e.target.value)}
          className="input-field text-xs resize-none"
          placeholder="Condition details: Mint silver Sharpie signature, 'SB LIV MVP' inscription, framed with double matting, UV museum glass..."
        />
      </div>
    </div>
  );
}
