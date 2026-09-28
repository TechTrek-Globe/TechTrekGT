/**
 * platforms.js - Default marketplace platforms for TechTrek Outpost.
 * Shared between registration seeding and platform management endpoints.
 */

export const DEFAULT_PLATFORMS = [
  { name: 'eBay', fee_pct: 0.136, flat_fee: 0.40, notes: '13.6% final value fee + $0.40 per order (avg)', is_default: 1 },
  { name: 'eBay (Promoted 2%)', fee_pct: 0.156, flat_fee: 0.40, notes: 'FVF + 2% promoted listing rate', is_default: 0 },
  { name: 'eBay (Promoted 5%)', fee_pct: 0.186, flat_fee: 0.40, notes: 'FVF + 5% promoted listing rate', is_default: 0 },
  { name: 'Facebook Marketplace (Local)', fee_pct: 0, flat_fee: 0, notes: 'No fees for local pickup', is_default: 0 },
  { name: 'Facebook Marketplace (Shipped)', fee_pct: 0.05, flat_fee: 0, notes: '5% seller fee on shipped orders', is_default: 0 },
  { name: 'OfferUp', fee_pct: 0.129, flat_fee: 0, notes: '12.9% on shipped orders', is_default: 0 },
  { name: 'Mercari', fee_pct: 0.10, flat_fee: 0, notes: '10% seller fee + payment processing', is_default: 0 },
  { name: 'Whatnot (Live)', fee_pct: 0.08, flat_fee: 0.30, notes: '8% + $0.30, live auction platform', is_default: 0 },
  { name: 'COMC', fee_pct: 0.20, flat_fee: 0, notes: 'Consignment ~20% depending on tier', is_default: 0 },
  { name: 'PWCC', fee_pct: 0.20, flat_fee: 0, notes: 'Vault/consignment ~20%', is_default: 0 },
  { name: 'Craigslist', fee_pct: 0, flat_fee: 0, notes: 'No fees - local only', is_default: 0 },
  { name: 'Other', fee_pct: 0, flat_fee: 0, notes: 'Custom', is_default: 0 },
];
