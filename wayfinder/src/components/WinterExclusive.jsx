import React from 'react';
import { Snowflake } from 'lucide-react';

/**
 * Renders a seasonal 'Winter Exclusive' tag/badge.
 * Displayed on MustSeeCard when sight.isWinterExclusive is true.
 */
export function WinterExclusive({ label }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-blue-950/60 border border-blue-400/30 text-blue-200 rounded-md px-2.5 py-1 mt-2">
      <Snowflake className="w-3 h-3 text-blue-300 shrink-0" aria-hidden="true" />
      <span className="text-[10px] font-black uppercase tracking-wider">{label || 'Winter Exclusive'}</span>
    </div>
  );
}

export default WinterExclusive;
