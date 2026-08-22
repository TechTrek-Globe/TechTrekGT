/**
 * Shared constants for TechTrek Outpost components.
 * Extracted from InventoryView and PricingIntelligenceView to avoid duplication.
 */

export const STATUS_META = {
  'Available':     { color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20' },
  'Listed':        { color: 'text-blue-400',    bg: 'bg-blue-500/10',     border: 'border-blue-500/20'    },
  'Sold':          { color: 'text-amber-400',   bg: 'bg-amber-500/10',    border: 'border-amber-500/20'   },
  'Kept for Self': { color: 'text-violet-400',  bg: 'bg-violet-500/10',   border: 'border-violet-500/20'  },
  'Returned':      { color: 'text-red-400',     bg: 'bg-red-500/10',      border: 'border-red-500/20'     },
};

export const ALL_STATUSES = Object.keys(STATUS_META);
