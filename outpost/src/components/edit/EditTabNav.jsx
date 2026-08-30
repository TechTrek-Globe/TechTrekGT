import React from 'react';
import { Tag, ListChecks, DollarSign, TrendingUp, Receipt, ShieldCheck } from 'lucide-react';

export const TABS = [
  { id: 'identity',    label: 'Identity & SKU',      icon: Tag },
  { id: 'listing',     label: 'Listing & Status',    icon: ListChecks },
  { id: 'pricing',     label: 'Pricing & Fee Engine', icon: DollarSign },
  { id: 'comps',       label: 'Market Comps',        icon: TrendingUp },
  { id: 'consignment', label: 'Consignment & Cost',  icon: Receipt },
  { id: 'condition',   label: 'Condition & Auth',    icon: ShieldCheck },
];

export function EditTabNav({ activeTab, setActiveTab, form }) {
  return (
    <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-4 sm:px-6 gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 flex-shrink-0">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        // Visual indicator badges for tabs with linked / enriched state
        const showEbayDot = tab.id === 'listing' && Boolean(form.ebay_listing_id);
        const showCertDot = tab.id === 'condition' && Boolean(form.cert_number || form.authenticator);
        const showCompsDot = tab.id === 'comps' && Boolean(form.comp_1 || form.active_comp_1);

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 px-3 sm:px-3.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 ${
              isActive
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
            <span>{tab.label}</span>

            {showEbayDot && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm"
                title={`Linked to eBay Listing #${form.ebay_listing_id}`}
              />
            )}
            {showCertDot && (
              <span
                className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm"
                title="Authentication cert configured"
              />
            )}
            {showCompsDot && (
              <span
                className="w-2 h-2 rounded-full bg-blue-400 shadow-sm"
                title="Market comps entered"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
