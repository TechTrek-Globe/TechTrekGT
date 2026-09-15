import { useEffect } from 'react';
import { useVScout } from '../context/VScoutContext.jsx';
import { formatCurrency } from '../utils/formatters.js';
import { Calculator, Info, Loader2, RefreshCw } from 'lucide-react';

export default function TaxView() {
  const { taxSettings, loadingTax, fetchTaxSettings } = useVScout();

  useEffect(() => {
    fetchTaxSettings();
  }, [fetchTaxSettings]);

  if (loadingTax && !taxSettings) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-vs-500" /></div>;
  }

  const s = taxSettings || {};
  const isBusiness = s.filing_status === 'business' || (s.se_tax_rate > 0);
  
  const renderValue = (val, isPct = false) => {
    if (val === null || val === undefined) return <span className="text-slate-500">Not configured</span>;
    return <span className="text-slate-200 font-medium">{isPct ? `${(val * 100).toFixed(2)}%` : val}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tax & ETV Settings</h1>
          <p className="text-sm text-slate-400">Read-only mirror of your VScout extension tax configuration.</p>
        </div>
        <button onClick={fetchTaxSettings} disabled={loadingTax} className="vs-btn-ghost">
          <RefreshCw className={`w-4 h-4 ${loadingTax ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="vs-card">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-vs-400" />
            Federal Profile
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-surface-border">
              <span className="text-slate-400 text-sm">Filing Status</span>
              <span className="capitalize text-slate-200 font-medium">{s.filing_status ? s.filing_status.replace('_', ' ') : 'Single'}</span>
            </div>
            
            {isBusiness && (
              <>
                <div className="flex justify-between items-center py-2 border-b border-surface-border">
                  <span className="text-slate-400 text-sm">Self-Employment Tax</span>
                  {renderValue(s.se_tax_rate, true)}
                </div>
                <div className="flex justify-between items-center py-2 border-b border-surface-border">
                  <span className="text-slate-400 text-sm">SE Deduction</span>
                  {renderValue(s.se_deduction_pct, true)}
                </div>
                <div className="flex justify-between items-center py-2 border-b border-surface-border">
                  <span className="text-slate-400 text-sm">QBI Deduction (20%)</span>
                  <span className={s.use_qbi_deduction ? "text-vs-400 font-medium" : "text-slate-500 font-medium"}>
                    {s.use_qbi_deduction ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="vs-card">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-amber-400" />
            State Profile
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-surface-border">
              <span className="text-slate-400 text-sm">State Code</span>
              {renderValue(s.state_code)}
            </div>
            <div className="flex justify-between items-center py-2 border-b border-surface-border">
              <span className="text-slate-400 text-sm">Tax Type</span>
              <span className="capitalize text-slate-200 font-medium">{s.state_tax_type || 'None'}</span>
            </div>
            {s.state_tax_type === 'flat' && (
              <div className="flex justify-between items-center py-2 border-b border-surface-border">
                <span className="text-slate-400 text-sm">Flat Rate</span>
                {renderValue(s.state_tax_rate, true)}
              </div>
            )}
            {s.state_tax_type === 'bracket' && (
              <div className="flex justify-between items-center py-2 border-b border-surface-border">
                <span className="text-slate-400 text-sm">Custom Brackets</span>
                <span className="text-amber-400 font-medium">Configured</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-surface-hover border border-surface-border rounded-xl p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-400 leading-relaxed">
          The web portal uses these mirrored settings to project the true cost of items. 
          To make changes to your tax brackets or filing status, open the VScout Chrome Extension, edit your Tax Profile, and click <strong>Push to VScout Portal</strong> on the Dashboard.
        </p>
      </div>
    </div>
  );
}
