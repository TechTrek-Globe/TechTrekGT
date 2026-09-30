/**
 * ebayFeeSchedule.js - VERSIONED eBay final-value-fee schedules (T-10 item 8).
 *
 * WHY VERSIONED: eBay changes category rates without notice and there is no
 * "current rate" endpoint. Without a version + effective date, an estimate
 * written today cannot be re-derived or audited later. Every estimate this
 * module produces carries `schedule_version` and `schedule_effective_date`
 * so the record states which schedule produced it.
 *
 * TO UPDATE RATES: append a NEW entry to EBAY_FEE_SCHEDULES with the next
 * version string and a later effective_date. Never edit a shipped entry - that
 * would silently rewrite the meaning of historical estimates.
 */

import { DEFAULT_PLATFORM_FEE_PCT, DEFAULT_PLATFORM_FLAT_FEE } from './constants.js';

/**
 * Each schedule entry:
 *   version              - opaque id recorded on every estimate
 *   effective_date       - ISO date this schedule starts applying
 *   default_flat_fee     - flat fee used by tiers that do not override it
 *   tiers                - ordered list; FIRST matching tier wins
 *     id                 - stable tier key
 *     label              - human label stored on the estimate
 *     fee_pct            - fraction (0.1325 = 13.25%), or null -> defaultFeePct
 *     flat_fee           - flat fee override, or null -> schedule default
 *     category_ids       - exact eBay category IDs in this tier
 *     keywords           - lowercase substrings matched against category name
 *     flat_fee_under_10  - optional reduced flat fee when price <= $10
 */
export const EBAY_FEE_SCHEDULES = [
  {
    version: '2024-06',
    effective_date: '2024-06-01',
    default_flat_fee: DEFAULT_PLATFORM_FLAT_FEE,
    tiers: [
      {
        id: 'trading_cards',
        label: 'Trading Cards (13.25%)',
        fee_pct: 0.1325,
        flat_fee: null,
        flat_fee_under_10: 0.30,
        category_ids: ['213', '214', '215', '216', '261328', '183454', '183050', '261068'],
        keywords: [
          'trading card', 'baseball card', 'football card', 'basketball card',
          'hockey card', 'soccer card', 'pokemon', 'magic: the gathering'
        ]
      },
      {
        id: 'media_books',
        label: 'Media / Books (14.95%)',
        fee_pct: 0.1495,
        flat_fee: 0.40,
        category_ids: ['267', '11232', '11233', '176984'],
        keywords: ['books & magazines', 'dvds & movies', 'music']
      },
      {
        id: 'consumer_electronics',
        label: 'Electronics (13.25%)',
        fee_pct: 0.1325,
        flat_fee: 0.40,
        category_ids: ['9355', '175672', '177'],
        keywords: ['computers/tablets', 'cell phones & smartphones']
      },
      {
        id: 'standard',
        label: 'Standard / Sports Mem',
        fee_pct: null, // resolved to the DEFAULT_PLATFORM_FEE_PCT at lookup time
        flat_fee: null,
        category_ids: [],
        keywords: []
      }
    ]
  }
];

/**
 * Resolves the schedule in force on `now` (defaults to today).
 * Highest effective_date <= now wins. Throws if the schedule list is empty or
 * every entry starts in the future - that is a deployment error, not a
 * recoverable runtime condition.
 *
 * @param {Date|string|number} [now]
 * @returns {object} the active schedule entry
 */
export function getActiveFeeSchedule(now = new Date()) {
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  const applicable = EBAY_FEE_SCHEDULES
    .filter(s => s.effective_date <= nowIso)
    .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));

  if (applicable.length === 0) {
    throw new Error(`No eBay fee schedule is effective on ${nowIso}. Add a schedule with an earlier effective_date.`);
  }
  return applicable[0];
}

/**
 * Calculates the eBay fee structure for a category at a given price.
 *
 * Behaviour is identical to the previous hardcoded implementation; only the
 * source of the rates and the added version metadata are new.
 *
 * @param {string|null} categoryId
 * @param {string|null} categoryName
 * @param {number} currentPrice
 * @param {object} [opts]
 * @param {Date|string|number} [opts.now] - override "today" for schedule lookup
 * @param {number} [opts.defaultFeePct] - fallback rate for the standard tier
 * @returns {{ fee_pct: number, flat_fee: number, category_tier: string,
 *             category_tier_id: string, schedule_version: string,
 *             schedule_effective_date: string }}
 */
export function calculateEbayCategoryFees(categoryId, categoryName, currentPrice = 0, opts = {}) {
  const schedule = getActiveFeeSchedule(opts.now);
  const standardTier = schedule.tiers.find(t => t.id === 'standard');
  // The standard tier stores fee_pct: null so the rate lives in constants.js, not
  // in the schedule. Falling back to DEFAULT_PLATFORM_FEE_PCT here (rather than
  // only honouring opts.defaultFeePct) keeps the documented contract true for
  // every caller: a null fee_pct can no longer escape and be treated as 0%.
  const defaultFeePct = opts.defaultFeePct ?? standardTier.fee_pct ?? DEFAULT_PLATFORM_FEE_PCT;
  const catLower = String(categoryName || '').toLowerCase();
  const idStr = String(categoryId || '');

  for (const tier of schedule.tiers) {
    if (tier.id === 'standard') continue; // default tier, handled below

    const idMatch = tier.category_ids.includes(idStr);
    const keywordMatch = tier.keywords.some(k => catLower.includes(k));
    if (!idMatch && !keywordMatch) continue;

    let flatFee = tier.flat_fee;
    if (flatFee == null) {
      flatFee = tier.flat_fee_under_10 != null && currentPrice > 0 && currentPrice <= 10.0
        ? tier.flat_fee_under_10
        : schedule.default_flat_fee;
    }
    return {
      fee_pct: tier.fee_pct ?? defaultFeePct,
      flat_fee: flatFee,
      category_tier: tier.label,
      category_tier_id: tier.id,
      schedule_version: schedule.version,
      schedule_effective_date: schedule.effective_date
    };
  }

  return {
    fee_pct: standardTier.fee_pct ?? defaultFeePct,
    flat_fee: standardTier.flat_fee ?? schedule.default_flat_fee,
    category_tier: standardTier.label,
    category_tier_id: 'standard',
    schedule_version: schedule.version,
    schedule_effective_date: schedule.effective_date
  };
}