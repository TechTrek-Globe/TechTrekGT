import React from 'react';
import { Tag, DollarSign, TrendingUp, BarChart2, ShoppingBag } from 'lucide-react';

export const TABS = [
  { id: 'details',         label: 'Item Details',            icon: Tag },
  { id: 'listing_pricing', label: 'Listing, Pricing & Fees', icon: DollarSign },
  { id: 'comps',           label: 'Market Comps',            icon: TrendingUp },
  { id: 'performance',     label: 'Performance & Traffic',   icon: BarChart2 },
  { id: 'vinescout',       label: '🔗 VineScout / Vine',      icon: ShoppingBag },
];

export function EditTabNav({ activeTab, setActiveTab, form }) {
  return (
    <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-4 sm:px-6 gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 flex-shrink-0">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        // Visual indicator badges for tabs with linked / enriched state
        const showDetailsDot = tab.id === 'details' && Boolean(form.cert_number || form.authenticator || form.true_total_cost);
        const showListingDot = tab.id === 'listing_pricing' && Boolean(form.ebay_listing_id);
        const showCompsDot = tab.id === 'comps' && Boolean(form.comp_1 || form.active_comp_1);
        const showPerfDot = tab.id === 'performance' && Boolean(form.analytics_fetched_at || form.ebay_listing_id);
        const showVineDot = tab.id === 'vinescout' && Boolean(form.is_vinescout || form.asin || form.order_id);

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`py-3 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0 ${
              isActive
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
            <span>{tab.label}</span>

            {showDetailsDot && (
              <span
                className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm"
                title="Details / Auth / Cost configured"
              />
            )}
            {showListingDot && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm"
                title={`Linked to eBay Listing #${form.ebay_listing_id}`}
              />
            )}
            {showCompsDot && (
              <span
                className="w-2 h-2 rounded-full bg-blue-400 shadow-sm"
                title="Market comps entered"
              />
            )}
            {showPerfDot && (
              <span
                className="w-2 h-2 rounded-full bg-purple-400 shadow-sm"
                title="Performance analytics active"
              />
            )}
            {showVineDot && (
              <span
                className="w-2 h-2 rounded-full bg-teal-400 shadow-sm"
                title="Linked to VineScout / Vine"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
