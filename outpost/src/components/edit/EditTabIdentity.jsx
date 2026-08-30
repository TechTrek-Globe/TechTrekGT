import React from 'react';
import { Tag, Hash, Trophy, User, Layers, Calendar, FileText } from 'lucide-react';

export function EditTabIdentity({ form, updateField, allCategories = [] }) {
  return (
    <div className="space-y-4">
      {/* Title / Description */}
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

      {/* SKU & Category & Quantity */}
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

      {/* Sport/Genre & Athlete/Signer */}
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

      {/* Best Listing Window */}
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

      {/* Notes & Description */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <span>General Notes & Memorabilia Details</span>
        </label>
        <textarea
          rows={3}
          value={form.notes || ''}
          onChange={e => updateField('notes', e.target.value)}
          className="input-field text-xs resize-none"
          placeholder="Item background, provenance notes, storage bin location, custom inscriptions..."
        />
      </div>
    </div>
  );
}
