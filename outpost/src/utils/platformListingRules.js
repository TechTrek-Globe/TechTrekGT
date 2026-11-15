/**
 * Multi-Platform Listing Rules Registry & Validation Engine for TechTrek Outpost.
 * Shared pure ESM module consumed by both the React frontend and Cloudflare Worker.
 * Covers: ebay, facebook, mercari, whatnot, reverb.
 */

import { getCertVerificationUrl } from './certLookup.js';
import { stripInternalTrackingNotes, escapeHtml, sanitizeListingHtml } from './ebayTemplate.js';

export const SUPPORTED_PLATFORMS = Object.freeze([
  'ebay',
  'facebook',
  'mercari',
  'whatnot',
  'reverb'
]);

export const HARD_EMOJI_BLOCKLIST = Object.freeze([
  '🔥', '🚨', '⭐', '🌟', '👀', '✅', '💯', '💥', '⚡', '💎', '👑', '🏆', '💰', '❗', '‼️'
]);

export const BANNED_HYPE_WORDS = Object.freeze([
  'LOOK', 'WOW', 'RARE', 'HTF', 'MUST SEE', 'MINT', 'NICE',
  'GREAT GIFT', 'INVEST', 'NR', 'NO LOWBALLS'
]);

export const ALLOWED_UPPERCASE_ACRONYMS = new Set([
  'JSA', 'PSA', 'DNA', 'BAS', 'COA', 'LOA', 'HOF', 'MVP', 'OML', 'ONL',
  'MLB', 'NFL', 'NBA', 'NHL', 'NCAA', 'UGA', 'SWAU', 'CD', 'LP', 'EP',
  'DVD', 'TV', 'VIP', 'OEM', 'USA', 'NASA', 'BGS', 'UDA', 'BAM', 'F1',
  'WWE', 'UFC', 'MMA', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL',
  'II', 'III', 'IV', 'JR', 'SR', 'QT', 'UV', 'ACOA', 'SGC', 'CGC'
]);

export const APPROVED_AUTHENTICATORS = Object.freeze([
  'PSA/DNA', 'PSA', 'JSA', 'Beckett/BAS', 'Beckett', 'BAS', 'Fanatics',
  'Steiner', 'Upper Deck', 'UDA', 'Tristar', 'MLB Authenticated',
  'NFL Authenticated', 'NBA Authenticated', 'Schwartz', 'SWAU', 'B.A.M.'
]);

export const BANNED_COA_ISSUERS = Object.freeze([
  'ACE Authentic', "Coach's Corner", 'Christopher L. Morales', 'CSC Collectibles',
  'Donald Frangipani', 'Forensic Document Services', 'Hollywood Dreams',
  'InPerson Authentics', 'J. DiMaggio Co.', 'Legends Sports Memorabilia',
  "Nathan's Autographs", 'Nicholas Burczyk', 'Pro Sports Memorabilia',
  'Rare and Signed', 'Robert Prouty', "R.R.'s Sports Cards", 'SCAA',
  'Slamdunk Sportscards', 'Sports Alley', 'Sports Management Group',
  "Stan's Sports", 'TTA/STAT Authentic', 'Universal Memorabilia',
  'USA Authentics', 'Operation Bullpen'
]);

export const PROTECTED_JERSEY_BRANDS = Object.freeze([
  'Nike', 'Adidas', 'Mitchell & Ness', 'Reebok', 'Fanatics', 'Authentic',
  'Official', 'NFL', 'MLB', 'NBA', 'NHL', 'NCAA'
]);

export const PROTECTED_GUITAR_BRANDS = Object.freeze([
  'Fender', 'Gibson', 'Martin', 'Taylor', 'Epiphone'
]);

export const VALID_WEARABLE_SIZES = Object.freeze([
  'S', 'M', 'L', 'XL', '2XL', '3XL', '48', '50', '52', '54', '56'
]);

export const CATEGORY_EMOJI_LOOKUP = Object.freeze({
  football: '🏈',
  baseball: '⚾',
  softball: '⚾',
  basketball: '🏀',
  hockey: '🏒',
  golf: '⛳',
  soccer: '⚽',
  tennis: '🎾',
  pickleball: '🎾',
  boxing: '🥊',
  mma: '🥊',
  ufc: '🥊',
  wrestling: '🤼',
  wwe: '🤼',
  racing: '🏁',
  nascar: '🏁',
  f1: '🏁',
  olympics: '🏅',
  track: '🏅',
  guitar: '🎸',
  rock: '🎸',
  country: '🎸',
  vocals: '🎤',
  music: '🎵',
  cd: '🎵',
  vinyl: '🎵',
  drumhead: '🥁',
  drummer: '🥁',
  piano: '🎹',
  keys: '🎹',
  movie: '🎬',
  tv: '🎬',
  hollywood: '🎬',
  soundtrack: '🎬',
  comic: '🦸',
  art: '🎨',
  gaming: '🎮',
  esports: '🎮',
  book: '📚',
  author: '✒️',
  space: '🚀',
  nasa: '🚀',
  politics: '🇺🇸',
  president: '🇺🇸'
});

export const ALLOWED_FALLBACK_EMOJIS = Object.freeze([
  '🎺', '🎷', '🎻', '🎱', '🎳', '🎭', '🛠️', '🏡'
]);

export const PLATFORM_RULES_REGISTRY = Object.freeze({
  ebay: {
    id: 'ebay',
    name: 'eBay',
    shortLabel: 'eBay',
    tagline: 'SEO & Clean HTML',
    titleMaxUtf16: 80,
    titleTargetMin: 68,
    titleTargetMax: 80,
    descriptionFormat: 'html',
    descriptionMaxChars: null,
    supportsRelistTitle: false,
    supportsHashtags: false,
    supportsProductTags: false,
    requiresApprovedAuth: true,
    feeFormulaLabel: '13.6% + $0.40 + 12% offer buffer',
    photoOrder: [
      'Photo 1: Clean full-item hero shot on uncluttered background',
      'Photo 2: Tight macro close-up of signature and tamper-proof hologram',
      'Photo 3: Physical COA card or authentication letter',
      'Photo 4: Back, tags, seams, or condition detail shot'
    ]
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook Marketplace',
    shortLabel: 'Facebook',
    tagline: 'Local Pickup & Shipping',
    titleMaxUtf16: 80,
    titleTargetMin: 60,
    titleTargetMax: 78,
    descriptionFormat: 'plain_text',
    descriptionMaxChars: null,
    supportsRelistTitle: true,
    supportsHashtags: false,
    supportsProductTags: true,
    requiresApprovedAuth: false,
    feeFormulaLabel: 'Target net + 15% negotiation buffer',
    photoOrder: [
      'Photo 1: Thumb-stopping feed hero shot in bright natural light',
      'Photo 2: Signature and tamper-proof hologram close-up',
      'Photo 3: Physical COA card or letter showing matching Cert #',
      'Photo 4: Back, detail, and scale comparison shot'
    ]
  },
  mercari: {
    id: 'mercari',
    name: 'Mercari',
    shortLabel: 'Mercari',
    tagline: 'Plain Text <=1000 & Hashtags',
    titleMaxUtf16: 80,
    titleTargetMin: 65,
    titleTargetMax: 80,
    descriptionFormat: 'plain_text',
    descriptionMaxChars: 1000,
    supportsRelistTitle: false,
    supportsHashtags: true,
    supportsProductTags: false,
    requiresApprovedAuth: false,
    feeFormulaLabel: 'Target net + 18% Smart Offer/Promote buffer',
    photoOrder: [
      'Photo 1: Clean 1:1 square hero shot (Mercari crops thumbnails to 1:1)',
      'Photo 2: Signature and hologram close-up',
      'Photo 3: Physical COA card showing matching Cert #',
      'Photo 4: Back, tags, and condition detail shot'
    ]
  },
  whatnot: {
    id: 'whatnot',
    name: 'Whatnot',
    shortLabel: 'Whatnot',
    tagline: '2-Sec Hobby Scan & Stream',
    titleMaxUtf16: 80,
    titleTargetMin: 60,
    titleTargetMax: 78,
    descriptionFormat: 'plain_text',
    descriptionMaxChars: null,
    supportsRelistTitle: false,
    supportsHashtags: false,
    supportsProductTags: false,
    requiresApprovedAuth: true,
    feeFormulaLabel: '8% + 2.9% + $0.30 (~10.9%) + 12% offer buffer',
    photoOrder: [
      'Photo 1: Full item + COA visible together (Whatnot mandates actual item photo)',
      'Photo 2: Tight macro on signature + tamper hologram',
      'Photo 3: Physical Certification Card front/back (required except Beckett sticker-only)',
      'Photo 4: Back and side condition check'
    ]
  },
  reverb: {
    id: 'reverb',
    name: 'Reverb',
    shortLabel: 'Reverb',
    tagline: 'Music Memorabilia & Gear',
    titleMaxUtf16: 80,
    titleTargetMin: 65,
    titleTargetMax: 80,
    descriptionFormat: 'html',
    descriptionMaxChars: null,
    supportsRelistTitle: false,
    supportsHashtags: false,
    supportsProductTags: false,
    requiresApprovedAuth: true,
    feeFormulaLabel: '5% + 3.19% + $0.49 (~8.19%) + 12% offer buffer',
    photoOrder: [
      'Photo 1: Full 3/4 angle guitar/item hero shot on clean background (min 620x620px)',
      'Photo 2: Close-up of signature + authenticator hologram on pickguard/surface',
      'Photo 3: Physical COA card or certificate',
      'Photo 4: Headstock, back of body, and finish inspection shots'
    ]
  }
});

/**
 * Returns rules metadata for a given platform id (defaults to ebay).
 */
export function getPlatformRules(platform) {
  const key = String(platform || 'ebay').toLowerCase().trim();
  return PLATFORM_RULES_REGISTRY[key] || PLATFORM_RULES_REGISTRY.ebay;
}

/**
 * Computes UTF-16 code unit length (used by eBay, Mercari, Reverb, etc.).
 */
export function computeUtf16Length(value) {
  return String(value || '').length;
}

/**
 * Strips any em-dash or en-dash characters cleanly.
 */
export function sanitizeNoEmDash(text) {
  if (text == null) return '';
  return String(text).replace(/[\u2014\u2013]/g, '-');
}

/**
 * Normalizes authenticator state and checks approved/banned lists.
 */
export function evaluateAuthenticator(rawAuth) {
  const clean = String(rawAuth || '').trim();
  const isUncertified = !clean || ['raw', 'uncertified', 'none', 'other', 'n/a', 'na'].includes(clean.toLowerCase());
  const lower = clean.toLowerCase();

  const bannedMatch = BANNED_COA_ISSUERS.find(b => lower.includes(b.toLowerCase()));
  const approvedMatch = APPROVED_AUTHENTICATORS.find(a => lower.includes(a.toLowerCase()));

  return {
    raw: clean,
    authenticator: isUncertified ? '' : clean,
    isCertified: !isUncertified,
    isBanned: Boolean(bannedMatch),
    bannedIssuer: bannedMatch || null,
    isApproved: Boolean(approvedMatch) && !bannedMatch
  };
}

/**
 * Determines whether the item is wearable apparel/jersey vs. non-wearable memorabilia.
 */
export function isWearableItem(itemData = {}) {
  if (typeof itemData.isWearable === 'boolean') return itemData.isWearable;
  const text = `${itemData.productType || ''} ${itemData.category || ''} ${itemData.title || ''} ${itemData.item_name || ''}`.toLowerCase();
  const nonWearableHints = [
    'baseball', 'football', 'basketball', 'puck', 'helmet', 'mini helmet',
    'photo', '8x10', '11x14', '16x20', 'card', 'guitar', 'pickguard',
    'drumhead', 'drum head', 'cd', 'vinyl', 'record', 'book', 'bat', 'pylon',
    'poster', 'sheet music', 'ticket', 'magazine', 'funko', 'bobblehead'
  ];
  if (nonWearableHints.some(hint => text.includes(hint))) {
    if (!/\b(jersey|shirt|t-shirt|hoodie|jacket|hat|cap|apparel|sweater|vest)\b/i.test(text)) {
      return false;
    }
  }
  return /\b(jersey|shirt|t-shirt|tee|hoodie|jacket|sweatshirt|pullover|apparel|vest)\b/i.test(text);
}

/**
 * Resolves the standalone wearable size token (S, M, L, XL, 2XL, 3XL, 48, 52)
 * ONLY for wearable apparel/jerseys. Completely independent of emoji logic.
 */
export function resolveWearableSize(itemData = {}) {
  if (!isWearableItem(itemData)) return null;
  const raw = String(itemData.size || itemData.wearableSize || '').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/^(size|sz)\s*[:.-]?\s*/i, '')
    .trim()
    .toUpperCase();

  if (!cleaned) return null;
  if (VALID_WEARABLE_SIZES.includes(cleaned)) return cleaned;

  const match = cleaned.match(/\b(2XL|3XL|4XL|XL|S|M|L|48|50|52|54|56)\b/);
  return match ? match[1] : cleaned;
}

/**
 * Resolves 1 single literal category/subject emoji based on sport/genre/item type.
 * Never returns any emoji from HARD_EMOJI_BLOCKLIST.
 */
export function resolveCategoryEmoji(itemData = {}, platform = 'ebay') {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const text = [
    itemData.sportOrGenre,
    itemData.sport_genre,
    itemData.category,
    itemData.productType,
    itemData.title,
    itemData.item_name,
    itemData.teamOrBand,
    itemData.description
  ].filter(Boolean).join(' ').toLowerCase();

  if (normPlatform === 'reverb') {
    if (/\b(drum|drumhead|snare|cymbal|percussion)\b/.test(text)) return '🥁';
    if (/\b(vocal|singer|microphone|tour|concert|live)\b/.test(text) && !/\b(guitar|pickguard|bass)\b/.test(text)) return '🎤';
    if (/\b(piano|keyboard|keys|synth|organ)\b/.test(text)) return '🎹';
    if (/\b(soundtrack|film|score|movie)\b/.test(text)) return '🎬';
    if (/\b(trumpet|horn)\b/.test(text)) return '🎺';
    if (/\b(sax|saxophone)\b/.test(text)) return '🎷';
    if (/\b(violin|fiddle|cello)\b/.test(text)) return '🎻';
    if (/\b(cd|vinyl|lp|album|sheet music|record)\b/.test(text) && !/\b(guitar|pickguard)\b/.test(text)) return '🎵';
    return '🎸';
  }

  if (/\b(football|nfl|ncaa football|super bowl|heisman|mini helmet|pylon)\b/.test(text)) return '🏈';
  if (/\b(baseball|softball|mlb|oml|onl|world series|bat|home plate)\b/.test(text)) return '⚾';
  if (/\b(basketball|nba|wnba|ncaa basketball)\b/.test(text)) return '🏀';
  if (/\b(hockey|nhl|puck|stanley cup)\b/.test(text)) return '🏒';
  if (/\b(golf|pga|masters|golf ball)\b/.test(text)) return '⛳';
  if (/\b(soccer|fifa|mls|premier league|world cup)\b/.test(text)) return '⚽';
  if (/\b(tennis|pickleball|wimbledon|us open tennis)\b/.test(text)) return '🎾';
  if (/\b(boxing|mma|ufc|glove|fight)\b/.test(text)) return '🥊';
  if (/\b(wrestling|wwe|aew)\b/.test(text)) return '🤼';
  if (/\b(nascar|racing|f1|formula 1|indycar|motorsport)\b/.test(text)) return '🏁';
  if (/\b(olympic|track|field|medal)\b/.test(text)) return '🏅';
  if (/\b(drum|drumhead|snare)\b/.test(text)) return '🥁';
  if (/\b(piano|keyboard)\b/.test(text)) return '🎹';
  if (/\b(guitar|pickguard|bass|rock band|country music)\b/.test(text)) return '🎸';
  if (/\b(vocal|singer|microphone)\b/.test(text)) return '🎤';
  if (/\b(cd|vinyl|lp|album|sheet music|music)\b/.test(text)) return '🎵';
  if (/\b(movie|film|tv|television|hollywood|script|actor|actress|cinema)\b/.test(text)) return '🎬';
  if (/\b(comic|superhero|marvel|dc)\b/.test(text)) return '🦸';
  if (/\b(art|painting|print|sketch|lithograph)\b/.test(text)) return '🎨';
  if (/\b(gaming|esports|video game|xbox|playstation|nintendo)\b/.test(text)) return '🎮';
  if (/\b(book|author|novel|hardcover|paperback|manuscript)\b/.test(text)) return '📚';
  if (/\b(historical|document|letter|autograph card)\b/.test(text)) return '✒️';
  if (/\b(space|nasa|astronaut|apollo)\b/.test(text)) return '🚀';
  if (/\b(president|politics|senator|white house)\b/.test(text)) return '🇺🇸';
  if (/\b(billiards|pool cue)\b/.test(text)) return '🎱';
  if (/\b(bowling)\b/.test(text)) return '🎳';
  if (/\b(broadway|theater|theatre|playbill)\b/.test(text)) return '🎭';

  return '✒️';
}

/**
 * Strips banned hype/marketing words and punctuation spam from title fragments.
 */
export function cleanTitleFragment(text, options = {}) {
  if (!text) return '';
  let out = sanitizeNoEmDash(String(text));

  // Remove punctuation spam (* ! ? ~ @ # $ | /) except inside PSA/DNA or 1/1
  out = out.replace(/[*!?~@#$|]/g, ' ');
  out = out.replace(/(?<!PSA)\/(?!DNA\b|1\b)/gi, ' ');

  // Remove banned hype tokens (case-insensitive whole words)
  for (const word of BANNED_HYPE_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
  }

  // Strip custom jersey spoofed brand tokens if applicable
  if (options.isCustomJersey) {
    for (const brandWord of PROTECTED_JERSEY_BRANDS) {
      const escaped = brandWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
    }
  }

  // Strip spoofed guitar brand tokens if generic/unbranded display guitar (preserving multi-word signer names like Taylor Swift)
  if (options.isPickguardSignedGuitar || options.isUnbrandedGuitar) {
    out = scrubGuitarBrandsSafe(out, options.signerName || '');
  }

  // Strip Size: or Sz: labels (standalone token handled separately)
  out = out.replace(/\b(?:Size|Sz)\s*[:.-]?\s*/gi, '');

  // Remove any emojis inside text fragment (single category emoji appended cleanly at end)
  out = out.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, ' ');

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes unauthorized ALL-CAPS words on eBay while preserving approved acronyms.
 */
export function normalizeUnauthorizedAllCaps(text) {
  return String(text || '')
    .split(' ')
    .map(token => {
      const bare = token.replace(/[^A-Za-z0-9]/g, '');
      if (!bare || bare.length < 2) return token;
      if (bare === bare.toUpperCase() && /[A-Z]{2,}/.test(bare)) {
        if (ALLOWED_UPPERCASE_ACRONYMS.has(bare)) return token;
        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      }
      return token;
    })
    .join(' ');
}

/**
 * Detects whether a title or item represents a custom jersey or unbranded display guitar.
 */
export function detectItemVariantFlags(itemData = {}, options = {}) {
  const combined = [
    itemData.title,
    itemData.item_name,
    itemData.productType,
    itemData.category,
    itemData.description,
    itemData.notes,
    options.title,
    options.productType,
    options.description
  ].filter(Boolean).join(' ').toLowerCase();

  const isCustomJersey = Boolean(
    options.isCustomJersey ??
    itemData.isCustomJersey ??
    (/\bcustom\b/.test(combined) && /\bjersey\b/.test(combined))
  );

  const isPickguardSignedGuitar = Boolean(
    options.isPickguardSignedGuitar ??
    itemData.isPickguardSignedGuitar ??
    (/\bpickguard\b/.test(combined) && /\bguitar\b/.test(combined))
  );

  const isUnbrandedGuitar = Boolean(
    options.isUnbrandedGuitar ??
    itemData.isUnbrandedGuitar ??
    (isPickguardSignedGuitar || (/\bdisplay\b/.test(combined) && /\bguitar\b/.test(combined)))
  );

  return { isCustomJersey, isPickguardSignedGuitar, isUnbrandedGuitar };
}

/**
 * Formats the Authenticator + Type slot cleanly (e.g., "JSA COA", "Beckett BAS", "PSA/DNA", "SWAU COA").
 */
export function formatAuthToken(rawAuth, authType = '') {
  const auth = String(rawAuth || '').trim();
  if (!auth) return '';
  const lower = auth.toLowerCase();
  if (lower === 'psa' || lower.includes('psa/dna')) return 'PSA/DNA';
  if (lower.includes('beckett') || lower === 'bas') {
    return /witness/i.test(authType) ? 'Beckett BAS Witness' : 'Beckett BAS';
  }
  if (lower === 'jsa') return /loa/i.test(authType) ? 'JSA LOA' : 'JSA COA';
  if (lower === 'swau') return 'SWAU COA';
  if (lower === 'fanatics') return 'Fanatics';
  if (lower === 'steiner') return 'Steiner';
  if (lower.includes('upper deck') || lower === 'uda') return 'UDA';
  if (/\b(coa|loa|bas|dna)\b/i.test(auth)) return auth;
  return `${auth} COA`;
}

/**
 * Truncates text cleanly on a word boundary to fit maxChars.
 */
function truncateOnWordBoundary(text, maxChars) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const slice = clean.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxChars * 0.45)) {
    return slice.slice(0, lastSpace).trim();
  }
  return slice.trim();
}

/**
 * Builds a strict slot-ordered, <= 80 UTF-16 character platform title with
 * independent conditional wearable Size token and independent trailing category emoji.
 */
export function buildPlatformTitle(platform, itemData = {}, options = {}) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const flags = {
    ...detectItemVariantFlags(itemData, options),
    signerName: String(options.athlete || itemData.athlete_person || options.signer || itemData.signer || '').trim()
  };
  const authEval = evaluateAuthenticator(options.authenticator || itemData.authenticator);
  const emoji = resolveCategoryEmoji({ ...itemData, ...options }, normPlatform);
  const emojiLen = computeUtf16Length(emoji);
  // Reserve 1 space + emoji UTF-16 units; cap pre-emoji text at 77 max (75 if 4-unit emoji)
  const maxPreEmoji = emojiLen >= 4 ? 75 : Math.min(77, 80 - 1 - emojiLen);

  const signerName = String(options.athlete || itemData.athlete_person || options.signer || itemData.signer || '').trim();
  const safeFlags = { ...flags, signerName };
  const signer = cleanTitleFragment(signerName, { ...safeFlags, isPickguardSignedGuitar: false, isUnbrandedGuitar: false });
  const authVerb = options.authVerb === 'Autographed' ? 'Autographed' : 'Signed';
  const teamOrBand = cleanTitleFragment(options.teamOrBand || itemData.team_or_band || itemData.team || '', safeFlags);
  const rawBaseTitle = cleanTitleFragment(options.title || itemData.item_name || itemData.title || '', flags);
  const rawProductType = cleanTitleFragment(options.productType || itemData.product_type || '', flags);

  let baseItem = rawProductType || rawBaseTitle;
  if (flags.isCustomJersey && baseItem && !/custom/i.test(baseItem)) {
    baseItem = `Custom Stitched ${baseItem}`;
  }
  if (normPlatform === 'reverb' && flags.isPickguardSignedGuitar && !/pickguard/i.test(baseItem)) {
    baseItem = `Custom Pickguard on ${baseItem || '38" Acoustic Guitar'}`;
  }

  const sizeToken = resolveWearableSize({ ...itemData, ...options, title: rawBaseTitle, productType: baseItem });
  const rawInscription = cleanTitleFragment(options.inscription || itemData.inscription || '', flags);
  const inscriptionToken = rawInscription
    ? `"${rawInscription.replace(/^"+|"+$/g, '')}"`
    : '';
  const authToken = authEval.isCertified
    ? formatAuthToken(authEval.authenticator, options.authType || itemData.auth_type)
    : '';

  const slots = [];
  if (signer) {
    slots.push(signer);
    if (authEval.isCertified || signer || rawInscription) {
      slots.push(authVerb);
    }
    if (normPlatform === 'reverb') {
      if (baseItem && !baseItem.toLowerCase().includes(signer.toLowerCase())) {
        slots.push(baseItem);
      } else if (rawBaseTitle) {
        slots.push(rawBaseTitle);
      }
    } else {
      if (teamOrBand) slots.push(teamOrBand);
      if (baseItem) {
        // Avoid repeating signer or team if user typed full phrase into product title
        let strippedBase = baseItem;
        if (signer) {
          strippedBase = strippedBase.replace(new RegExp(signer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim();
        }
        if (teamOrBand) {
          strippedBase = strippedBase.replace(new RegExp(teamOrBand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim();
        }
        strippedBase = strippedBase.replace(/\b(signed|autographed)\b/ig, '').replace(/\s+/g, ' ').trim();
        if (strippedBase) {
          slots.push(strippedBase);
        } else if (!teamOrBand) {
          slots.push(baseItem);
        }
      }
    }
  } else {
    if (teamOrBand && !rawBaseTitle.toLowerCase().includes(teamOrBand.toLowerCase())) {
      slots.push(teamOrBand);
    }
    if (rawBaseTitle) slots.push(rawBaseTitle);
  }

  if (sizeToken && !slots.some(s => new RegExp(`\\b${sizeToken}\\b`, 'i').test(s))) {
    slots.push(sizeToken);
  }
  if (inscriptionToken && !slots.some(s => s.toLowerCase().includes(rawInscription.toLowerCase()))) {
    slots.push(inscriptionToken);
  }
  if (authToken && !slots.some(s => s.toLowerCase().includes(authEval.authenticator.toLowerCase()))) {
    slots.push(authToken);
  }

  let preEmojiText = slots.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!preEmojiText) preEmojiText = 'Autographed Collectible';

  // Drop or shorten optional inscription if exceeding pre-emoji cap while preserving signer, base, size, and auth
  if (computeUtf16Length(preEmojiText) > maxPreEmoji && inscriptionToken) {
    const withoutInscription = slots.filter(s => s !== inscriptionToken).join(' ').replace(/\s+/g, ' ').trim();
    if (computeUtf16Length(withoutInscription) <= maxPreEmoji) {
      preEmojiText = withoutInscription;
    }
  }

  if (computeUtf16Length(preEmojiText) > maxPreEmoji) {
    // Preserve authToken and sizeToken at the tail if possible
    const tailTokens = [sizeToken, authToken].filter(t => t && preEmojiText.includes(t));
    const tailText = tailTokens.join(' ').trim();
    if (tailText && tailText.length + 12 < maxPreEmoji) {
      let headText = preEmojiText;
      for (const t of tailTokens) {
        headText = headText.replace(t, ' ');
      }
      headText = headText.replace(/\s+/g, ' ').trim();
      const headBudget = maxPreEmoji - tailText.length - 1;
      preEmojiText = `${truncateOnWordBoundary(headText, headBudget)} ${tailText}`.trim();
    } else {
      preEmojiText = truncateOnWordBoundary(preEmojiText, maxPreEmoji);
    }
  }

  if (normPlatform === 'ebay') {
    preEmojiText = normalizeUnauthorizedAllCaps(preEmojiText);
  }

  const finalTitle = `${preEmojiText} ${emoji}`.replace(/\s+/g, ' ').trim();
  return finalTitle;
}

/**
 * Generates an alternate Facebook Marketplace relist_title (<= 80 UTF-16 chars)
 * for 14-day duplicate-listing spam avoidance.
 */
export function buildFacebookRelistTitle(itemData = {}, options = {}) {
  const primary = buildPlatformTitle('facebook', itemData, options);
  const altVerb = options.authVerb === 'Autographed' ? 'Signed' : 'Autographed';
  let relist = buildPlatformTitle('facebook', itemData, { ...options, authVerb: altVerb });

  if (relist === primary) {
    const emoji = resolveCategoryEmoji({ ...itemData, ...options }, 'facebook');
    const pre = primary.replace(new RegExp(`\\s*${emoji}$`), '').trim();
    const words = pre.split(' ');
    if (words.length >= 4) {
      const swapped = `${words.slice(0, 2).join(' ')} ${words.slice(3).join(' ')} ${words[2]}`;
      relist = `${truncateOnWordBoundary(swapped, 77)} ${emoji}`;
    }
  }
  return relist;
}

/**
 * Computes exact fee-adjusted pricing guidance for each platform.
 */
export function computePlatformPricing(platform, targetNetInput = null, itemData = {}) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const rawFallback = targetNetInput ?? itemData.targetNet ?? itemData.current_list_price ?? itemData.suggested_list_price ?? itemData.min_sell_price ?? itemData.unit_price ?? 100;
  const targetNet = Math.max(1, Number(rawFallback) || 100);

  if (normPlatform === 'reverb') {
    // 5% selling fee + 3.19% + $0.49 payment processing (~8.19% + $0.49), plus 12% offer buffer
    const minOffer = Math.ceil((targetNet + 0.49) / 0.9181);
    const suggestedList = Math.ceil(((targetNet + 0.49) / 0.9181) * 1.12);
    return {
      target_net: Math.round(targetNet * 100) / 100,
      suggested_list_price: suggestedList,
      minimum_acceptable_offer: minOffer,
      accept_offers: true,
      fee_rate_summary: '5% selling fee + 3.19% + $0.49 processing (~8.19%)'
    };
  }

  if (normPlatform === 'whatnot') {
    // 8% commission + 2.9% + $0.30 payment processing (~10.9% + $0.30), plus 12% offer buffer
    const minAutoAccept = Math.ceil((targetNet + 0.30) / 0.891);
    const binPrice = Math.ceil(((targetNet + 0.30) / 0.891) * 1.12);
    return {
      target_net: Math.round(targetNet * 100) / 100,
      buy_it_now_price: binPrice,
      minimum_offer_auto_accept: minAutoAccept,
      auction_start_price: minAutoAccept,
      fee_rate_summary: '8% commission + 2.9% + $0.30 processing (~10.9%)'
    };
  }

  if (normPlatform === 'mercari') {
    // Target net + 15-20% (18% midpoint) for Mercari Smart Offers / Promote
    const suggestedList = Math.ceil(targetNet * 1.18);
    const minPrice = Math.ceil(targetNet);
    return {
      target_net: Math.round(targetNet * 100) / 100,
      suggested_list_price: suggestedList,
      minimum_acceptable_price: minPrice,
      fee_rate_summary: 'Target net + 18% Smart Offers / Promote buffer'
    };
  }

  if (normPlatform === 'facebook') {
    // Target net rounded up by 15% to absorb Marketplace haggling culture
    const suggestedList = Math.ceil(targetNet * 1.15);
    const minPrice = Math.ceil(targetNet);
    return {
      target_net: Math.round(targetNet * 100) / 100,
      suggested_list_price: suggestedList,
      minimum_acceptable_price: minPrice,
      fee_rate_summary: '0% local cash fee; +15% negotiation buffer'
    };
  }

  // eBay: 13.6% default FVF + $0.40 flat fee + 12% offer buffer
  const minFloor = Math.ceil((targetNet + 0.40) / 0.864);
  const suggestedList = Math.ceil(((targetNet + 0.40) / 0.864) * 1.12);
  return {
    target_net: Math.round(targetNet * 100) / 100,
    suggested_list_price: suggestedList,
    minimum_acceptable_price: minFloor,
    fee_rate_summary: '13.6% FVF + $0.40 flat fee + 12% offer buffer'
  };
}

/**
 * Resolves platform-specific meetup, payment, and shipping logistics.
 */
export function resolvePlatformLogistics(platform, itemData = {}, options = {}) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const authEval = evaluateAuthenticator(options.authenticator || itemData.authenticator);
  const isAutographed = Boolean(
    authEval.isCertified ||
    options.athlete ||
    itemData.athlete_person ||
    options.inscription ||
    itemData.inscription
  );
  const pricing = computePlatformPricing(normPlatform, options.targetNet, itemData);
  const text = `${itemData.item_name || ''} ${options.title || ''} ${options.productType || ''} ${itemData.category || ''}`.toLowerCase();

  if (normPlatform === 'facebook') {
    const highValue = isAutographed || pricing.suggested_list_price >= 150;
    const riskTier = highValue ? 'High-Value Autographed' : 'Standard Lower-Risk';
    const meetupLocation = highValue
      ? 'Local Police Precinct lot or QuikTrip (QT) Safe Place lot'
      : 'Mason Mill Park';

    return {
      risk_tier: riskTier,
      meetup_location: meetupLocation,
      accepted_local_payments: ['Cash', 'Apple Pay'],
      shipping_enabled: true,
      over_500_checkout_note: pricing.suggested_list_price > 500
        ? 'Note: Facebook Checkout natively covers orders up to $500; insured shipping or Local Police Precinct / QT Safe Place meetup available.'
        : null
    };
  }

  if (normPlatform === 'whatnot') {
    let weight = '1-2 lbs';
    let packaging = 'Protective UV display cube / poly-bagged rigid mailer with bubble wrap';
    if (/\b(guitar|acoustic|electric guitar)\b/.test(text)) {
      weight = '8-12 lbs';
      packaging = 'Double-boxed acoustic display guitar carton with headstock and corner foam support';
    } else if (/\b(mini helmet|helmet|football|basketball)\b/.test(text)) {
      weight = '3-5 lbs';
      packaging = 'Double-walled corrugated box with multi-layer bubble wrap and void fill';
    } else if (/\b(photo|8x10|11x14|cd|vinyl|card|sheet music|ticket|book)\b/.test(text)) {
      weight = '8-12 oz';
      packaging = 'Rigid photo/cardboard mailer with top-loader, sleeve, and corner protectors';
    } else if (/\b(jersey|shirt|hoodie|jacket)\b/.test(text)) {
      weight = '1-2 lbs';
      packaging = 'Poly-bagged jersey sealed inside rigid weather-resistant shipping box';
    } else if (/\b(baseball|puck)\b/.test(text)) {
      weight = '1-2 lbs';
      packaging = 'UV-protected ball/puck display cube inside bubble-wrapped shipping box';
    }
    return {
      estimated_packed_weight: weight,
      packaging_method: packaging
    };
  }

  if (normPlatform === 'reverb') {
    return {
      box_dimensions_note: 'Double-boxed with 2 inches of padding on all sides (kept under 48 inches box length to avoid oversize carrier surcharges) and full headstock/neck support',
      handling_days: 3
    };
  }

  if (normPlatform === 'mercari') {
    return {
      shipping_only: true,
      shipping_method: 'Mercari Prepaid Label or Insured Self-Ship (zero local meetup)',
      packaging_method: /\b(guitar)\b/.test(text)
        ? 'Double-boxed with 2 inches of padding and neck support'
        : 'UV cube / poly-bagged rigid box with full transit protection'
    };
  }

  return {
    handling_days: 1,
    packaging_method: /\b(guitar)\b/.test(text)
      ? 'Double-boxed with corner protection and neck support'
      : 'UV-protected display cube or poly-bagged sturdy box with corner protection'
  };
}

/**
 * Strips protected guitar brands while preserving multi-word artist/signer names (e.g., Taylor Swift, Chris Martin).
 */
function maskSignerNames(text, signerName = '') {
  let masked = String(text || '');
  const trimmedSigner = String(signerName || '').trim();
  if (!trimmedSigner || !/\s/.test(trimmedSigner)) {
    return { masked, restore: s => s };
  }
  const escapedSigner = trimmedSigner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compactSigner = trimmedSigner.replace(/\s+/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sentinelFull = '__SIGNER_FULL_NAME__';
  const sentinelCompact = '__SIGNER_COMPACT_NAME__';
  masked = masked.replace(new RegExp(`\\b${escapedSigner}\\b`, 'gi'), sentinelFull);
  if (compactSigner) {
    masked = masked.replace(new RegExp(`\\b${compactSigner}\\b`, 'gi'), sentinelCompact);
  }
  return {
    masked,
    restore: (s) => s
      .replace(new RegExp(sentinelFull, 'g'), trimmedSigner)
      .replace(new RegExp(sentinelCompact, 'g'), trimmedSigner.replace(/\s+/g, '').toLowerCase())
  };
}

function scrubGuitarBrandsSafe(text, signerName = '') {
  const { masked, restore } = maskSignerNames(text, signerName);
  let out = masked;
  for (const guitarBrand of PROTECTED_GUITAR_BRANDS) {
    const escaped = guitarBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  }
  return restore(out);
}

/**
 * Sanitizes text to prevent protected brand/league names from leaking onto custom items.
 */
function scrubProtectedBrandsFromCopy(text, flags) {
  let out = sanitizeNoEmDash(text || '');
  if (flags.isCustomJersey) {
    for (const token of PROTECTED_JERSEY_BRANDS) {
      out = out.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '');
    }
  }
  if (flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar) {
    out = scrubGuitarBrandsSafe(out, flags.signerName || '');
  }
  return out.replace(/ +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Generates policy-safe tags (Facebook) or hashtags (Mercari).
 */
export function buildPlatformTags(platform, itemData = {}, options = {}) {
  const normPlatform = String(platform || 'facebook').toLowerCase().trim();
  const flags = {
    ...detectItemVariantFlags(itemData, options),
    signerName: String(options.athlete || itemData.athlete_person || options.signer || itemData.signer || '').trim()
  };
  const signer = cleanTitleFragment(options.athlete || itemData.athlete_person || '', flags);
  const teamOrBand = cleanTitleFragment(options.teamOrBand || itemData.team_or_band || '', flags);
  const sportOrGenre = cleanTitleFragment(options.sportOrGenre || itemData.sport_genre || itemData.category || '', flags);
  const productType = cleanTitleFragment(options.productType || itemData.product_type || itemData.category || '', flags);
  const authEval = evaluateAuthenticator(options.authenticator || itemData.authenticator);
  const inscription = cleanTitleFragment(options.inscription || itemData.inscription || '', flags);

  const rawCandidates = [];
  if (signer) {
    rawCandidates.push(signer);
    const parts = signer.split(' ').filter(Boolean);
    if (parts.length > 1) rawCandidates.push(parts[parts.length - 1]);
  }
  if (teamOrBand) {
    rawCandidates.push(teamOrBand);
    teamOrBand.split(' ').filter(w => w.length > 2).forEach(w => rawCandidates.push(w));
  }
  if (sportOrGenre) rawCandidates.push(sportOrGenre);
  if (productType) rawCandidates.push(productType);
  if (authEval.isCertified) rawCandidates.push(authEval.authenticator);
  if (inscription) rawCandidates.push(inscription);

  if (signer || authEval.isCertified) {
    rawCandidates.push('signed memorabilia', 'autographed collectible', 'man cave decor', 'fan cave');
    if (flags.isCustomJersey) rawCandidates.push('signed jersey', 'custom stitched jersey');
    if (flags.isPickguardSignedGuitar) rawCandidates.push('signed guitar', 'autographed pickguard');
  } else {
    rawCandidates.push('collectibles', 'gift idea', 'home decor');
  }

  const forbiddenSet = new Set([
    ...(flags.isCustomJersey ? PROTECTED_JERSEY_BRANDS : []),
    ...(flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar ? PROTECTED_GUITAR_BRANDS : [])
  ].map(s => s.toLowerCase()));

  const isForbidden = (val) => {
    const low = val.toLowerCase();
    for (const f of forbiddenSet) {
      if (low.includes(f)) return true;
    }
    return false;
  };

  if (normPlatform === 'mercari') {
    const deduped = [];
    const seen = new Set();
    for (const c of rawCandidates) {
      if (!c || isForbidden(c)) continue;
      const tag = c.replace(/[^a-zA-Z0-9]/g, '');
      if (!tag || tag.length < 2) continue;
      const low = tag.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      deduped.push(`#${tag}`);
      if (deduped.length >= 12) break;
    }
    const fallbacks = ['#SportsMemorabilia', '#Autographed', '#SignedCollectible', '#FanCave', '#CollectorPiece', '#VerifiedCOA', '#SportsFans', '#Memorabilia'];
    for (const fb of fallbacks) {
      if (deduped.length >= 8) break;
      if (!seen.has(fb.slice(1).toLowerCase())) {
        seen.add(fb.slice(1).toLowerCase());
        deduped.push(fb);
      }
    }
    return deduped.slice(0, 12);
  }

  // Facebook lowercase product tags (12-20 tags)
  const fbTags = [];
  const fbSeen = new Set();
  for (const c of rawCandidates) {
    if (!c || isForbidden(c)) continue;
    const tag = c.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!tag || tag.length < 2 || fbSeen.has(tag)) continue;
    fbSeen.add(tag);
    fbTags.push(tag);
    if (fbTags.length >= 20) break;
  }
  const fbExtras = [
    'autographed memorabilia', 'signed collectible', 'sports memorabilia',
    'man cave decor', 'fan cave', 'gift for collector', 'certified autograph',
    'display piece', 'verified coa', 'authentic signature', 'memorabilia', 'collectible'
  ];
  for (const ex of fbExtras) {
    if (fbTags.length >= 14) break;
    if (!fbSeen.has(ex) && !isForbidden(ex)) {
      fbSeen.add(ex);
      fbTags.push(ex);
    }
  }
  return fbTags.slice(0, 20);
}

/**
 * Maps generic item conditions into exact platform-valid condition enums.
 */
export function resolvePlatformCondition(platform, rawCondition) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const c = String(rawCondition || 'Brand New').toLowerCase();

  if (normPlatform === 'reverb') {
    if (c.includes('brand new') || c.includes('new')) return 'Brand New';
    if (c.includes('mint')) return 'Mint';
    if (c.includes('excellent') || c.includes('like new')) return 'Excellent';
    if (c.includes('very good')) return 'Very Good';
    return 'Good';
  }
  if (normPlatform === 'whatnot') {
    if (c.includes('new') || c.includes('mint')) return 'Near Mint or Better';
    if (c.includes('excellent')) return 'Excellent';
    if (c.includes('very good')) return 'Very Good';
    return 'Good';
  }
  if (normPlatform === 'mercari') {
    if (c.includes('brand new') || c === 'new') return 'New';
    if (c.includes('like new') || c.includes('mint') || c.includes('excellent')) return 'Like new';
    if (c.includes('fair')) return 'Fair';
    return 'Good';
  }
  if (normPlatform === 'facebook') {
    if (c.includes('brand new') || c === 'new') return 'New';
    if (c.includes('like new') || c.includes('mint') || c.includes('excellent')) return 'Used - Like New';
    if (c.includes('fair')) return 'Used - Fair';
    return 'Used - Good';
  }
  return rawCondition || 'Brand New / Excellent';
}

/**
 * Builds deterministic, policy-compliant platform payloads matching each platform's exact output schema.
 */
export function buildPlatformPayload(platform, itemData = {}, options = {}) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const rules = getPlatformRules(normPlatform);
  const flags = {
    ...detectItemVariantFlags(itemData, options),
    signerName: String(options.athlete || itemData.athlete_person || options.signer || itemData.signer || '').trim()
  };
  const authEval = evaluateAuthenticator(options.authenticator || itemData.authenticator);
  const certNumber = String(options.certNumber || itemData.cert_number || '').trim();
  const signer = cleanTitleFragment(options.athlete || itemData.athlete_person || '', flags);
  const teamOrBand = cleanTitleFragment(options.teamOrBand || itemData.team_or_band || '', flags);
  const sportOrGenre = cleanTitleFragment(options.sportOrGenre || itemData.sport_genre || itemData.category || '', flags);
  const inscription = cleanTitleFragment(options.inscription || itemData.inscription || '', flags);
  const size = resolveWearableSize({ ...itemData, ...options });
  const pricing = computePlatformPricing(normPlatform, options.targetNet, itemData);
  const logistics = resolvePlatformLogistics(normPlatform, itemData, options);
  const title = buildPlatformTitle(normPlatform, itemData, options);
  const titleUtf16Count = computeUtf16Length(title);
  const cleanNotes = scrubProtectedBrandsFromCopy(
    stripInternalTrackingNotes(options.description || options.notes || itemData.description || itemData.notes || ''),
    flags
  );
  const certUrl = (authEval.isCertified && certNumber)
    ? getCertVerificationUrl(authEval.authenticator, certNumber)
    : null;
  const rawBrand = String(options.brand || itemData.brand || '').trim();

  // Brand attribution per platform guardrails
  let resolvedBrand = rawBrand;
  if (flags.isCustomJersey || flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar) {
    if (normPlatform === 'facebook') {
      resolvedBrand = null;
    } else if (normPlatform === 'mercari') {
      resolvedBrand = 'No Brand';
    } else {
      resolvedBrand = 'Unbranded';
    }
  } else if (normPlatform === 'facebook' && !rawBrand) {
    resolvedBrand = null;
  }

  if (normPlatform === 'reverb') {
    const model = flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar
      ? 'Custom Display Acoustic Guitar'
      : (cleanTitleFragment(options.productType || itemData.category || 'Autographed Music Memorabilia', flags) || 'Music Memorabilia');
    const reverbCategory = /\b(guitar)\b/i.test(`${title} ${options.productType || ''}`) && !flags.isPickguardSignedGuitar
      ? 'Acoustic Guitars > Dreadnought'
      : 'Accessories > Memorabilia & Collectibles > Autographs';
    const condition = resolvePlatformCondition('reverb', options.condition || itemData.condition);
    const finish = String(options.finish || itemData.finish || 'Natural / Gloss').trim();

    const pickguardDisclosure = flags.isPickguardSignedGuitar
      ? 'Signed on a custom insert pickguard mounted to a brand-new, non-stage-played 38-inch display acoustic guitar.'
      : '';
    const leadText = [
      signer ? `${signer} autographed` : 'Autographed',
      flags.isPickguardSignedGuitar ? 'custom insert pickguard mounted on a 38-inch display acoustic guitar' : (options.productType || itemData.item_name || 'music memorabilia'),
      authEval.isCertified ? `authenticated by ${authEval.authenticator}${certNumber ? ` (Cert #${certNumber})` : ''}.` : '.',
      pickguardDisclosure
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const descriptionHtml = sanitizeListingHtml([
      `<p><strong>${escapeHtml(leadText)}</strong></p>`,
      '<ul>',
      `<li><strong>Artist / Signer:</strong> ${escapeHtml(signer || 'Featured Artist')}${teamOrBand ? ` (${escapeHtml(teamOrBand)})` : ''}</li>`,
      `<li><strong>Authentication:</strong> ${escapeHtml(authEval.authenticator || 'Third-Party Authenticator')}${certNumber ? ` - Cert #${escapeHtml(certNumber)}` : ''}${certUrl ? ` (Verify online at ${escapeHtml(certUrl)})` : ''}</li>`,
      `<li><strong>Signature &amp; Ink Details:</strong> Hand-signed${inscription ? ` with inscription "${escapeHtml(inscription)}"` : ''}. Exact placement shown in high-resolution photos.</li>`,
      '</ul>',
      '<ul>',
      `<li><strong>Base Instrument / Item Specs:</strong> ${escapeHtml(model)}, condition: ${escapeHtml(condition)}.</li>`,
      flags.isPickguardSignedGuitar
        ? '<li><strong>Display vs. Stage-Played Disclosure:</strong> Note: The autograph is on the custom insert pickguard mounted to a brand-new, non-stage-played display instrument intended for wall or case display.</li>'
        : '',
      cleanNotes ? `<li><strong>Condition Notes:</strong> ${escapeHtml(cleanNotes)}</li>` : '',
      '</ul>',
      `<p><strong>Packaging &amp; Insured Shipping:</strong> ${escapeHtml(logistics.box_dimensions_note)}. Ships insured within ${logistics.handling_days} business days.</p>`
    ].filter(Boolean).join('\n'));

    const payload = {
      title,
      title_char_count: titleUtf16Count,
      reverb_category: reverbCategory,
      brand: resolvedBrand || 'Unbranded',
      model,
      finish,
      condition,
      size,
      shipping_profile: logistics,
      pricing_guidance: {
        suggested_list_price: pricing.suggested_list_price,
        minimum_acceptable_offer: pricing.minimum_acceptable_offer,
        accept_offers: true
      },
      description_html: descriptionHtml,
      recommended_photo_order: rules.photoOrder,
      validation_passed: true
    };
    const validation = validatePlatformPayload('reverb', payload, { ...itemData, ...options });
    payload.validation_passed = validation.passed;
    return { payload, validation };
  }

  if (normPlatform === 'whatnot') {
    const condition = resolvePlatformCondition('whatnot', options.condition || itemData.condition);
    const isMusic = /\b(guitar|music|cd|vinyl|drum|band)\b/i.test(`${sportOrGenre} ${title}`);
    const whatnotCategory = isMusic
      ? 'Music & Entertainment > Autographs'
      : 'Sports Memorabilia > Autographed Memorabilia';
    const bullets = [
      `${signer ? `${signer} signed ` : ''}${teamOrBand ? `${teamOrBand} ` : ''}${options.productType || itemData.item_name || 'collectible'}${inscription ? ` ("${inscription}")` : ''}${authEval.isCertified ? ` - ${authEval.authenticator}${certNumber ? ` Cert #${certNumber}` : ''}` : ''}.`,
      '',
      `• Authentication: ${authEval.authenticator || 'Approved Authenticator'}${certNumber ? ` (Cert #${certNumber})` : ''} - verifiable in the authenticator official online database.`,
      `• Signature & Ink: Bold hand-signed autograph${inscription ? ` with verbatim inscription "${inscription}"` : ''}; review macro photos for ink and placement.`,
      `• Item Specs & Condition: ${condition}${size ? ` | Size ${size}` : ''}${cleanNotes ? ` | ${cleanNotes}` : '.'}`,
      flags.isCustomJersey ? '• Note: Custom stitched display jersey; not affiliated with or manufactured by any pro sports league or apparel brand.' : null,
      flags.isPickguardSignedGuitar ? '• Note: Autograph is on the custom pickguard mounted to a brand-new, non-stage-played display guitar.' : null,
      `• Packaging Guarantee: ${logistics.packaging_method} (${logistics.estimated_packed_weight}).`
    ].filter(line => line !== null);

    const payload = {
      title,
      title_char_count: titleUtf16Count,
      whatnot_category: whatnotCategory,
      listing_format_recommendation: pricing.buy_it_now_price >= 150 ? 'Buy It Now (Accepting Offers)' : 'Live Auction (Pre-Bids Enabled)',
      condition,
      size,
      shipping_profile: logistics,
      pricing_guidance: {
        buy_it_now_price: pricing.buy_it_now_price,
        minimum_offer_auto_accept: pricing.minimum_offer_auto_accept,
        auction_start_price: pricing.auction_start_price
      },
      description_plain_text: scrubProtectedBrandsFromCopy(bullets.join('\n'), flags),
      recommended_photo_order: rules.photoOrder,
      validation_passed: true
    };
    const validation = validatePlatformPayload('whatnot', payload, { ...itemData, ...options });
    payload.validation_passed = validation.passed;
    return { payload, validation };
  }

  if (normPlatform === 'mercari') {
    const condition = resolvePlatformCondition('mercari', options.condition || itemData.condition);
    const hashtags = buildPlatformTags('mercari', itemData, options);
    const hashtagLine = hashtags.join(' ');
    const authName = authEval.authenticator || 'JSA/Beckett/PSA/SWAU';
    const verifyLine = certNumber
      ? `Verify cert #${certNumber} in the official ${authName} database.`
      : `Authenticated by ${authName}.`;

    const bodyParts = [
      `${signer ? `${signer} signed ` : ''}${options.productType || itemData.item_name || 'collectible'}${inscription ? ` ("${inscription}")` : ''} - 100% authentic with ${authName}${certNumber ? ` #${certNumber}` : ''}.`,
      '',
      `• Signer: ${signer || 'Featured Subject'}${teamOrBand ? ` (${teamOrBand})` : ''}`,
      `• Authentication: ${authName}${certNumber ? ` Cert #${certNumber}` : ''}. ${verifyLine}`,
      `• Autograph: Hand-signed${inscription ? ` with inscription "${inscription}"` : ''}.`,
      `• Item & Condition: ${condition}${size ? ` (Size ${size})` : ''}${cleanNotes ? ` - ${cleanNotes}` : ''}`,
      flags.isCustomJersey ? '• Note: Custom stitched display jersey. Not affiliated with or manufactured by any pro sports league or apparel brand.' : null,
      flags.isPickguardSignedGuitar ? '• Note: Hand-signed on the custom pickguard mounted to a brand-new, non-stage-played display guitar.' : null,
      `• Shipping: ${logistics.packaging_method}. Reasonable offers welcome via Mercari Offer button.`,
      '',
      hashtagLine
    ].filter(line => line !== null);

    let plainText = scrubProtectedBrandsFromCopy(bodyParts.join('\n'), flags);
    // Strip URLs on Mercari (zero http/www/.com allowed)
    plainText = plainText.replace(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org)\b/gi, '');
    if (plainText.length > 1000) {
      const budgetForBody = 1000 - hashtagLine.length - 2;
      const bodyOnly = plainText.slice(0, plainText.lastIndexOf(hashtagLine)).trim();
      plainText = `${truncateOnWordBoundary(bodyOnly, Math.max(100, budgetForBody))}\n\n${hashtagLine}`;
    }

    const payload = {
      title,
      title_char_count: titleUtf16Count,
      category_path: sportOrGenre ? `Collectibles > ${sportOrGenre}` : 'Collectibles > Autographs',
      condition,
      brand: resolvedBrand || 'No Brand',
      size,
      pricing_guidance: {
        suggested_list_price: pricing.suggested_list_price,
        minimum_acceptable_price: pricing.minimum_acceptable_price
      },
      hashtags,
      description_plain_text: plainText.trim(),
      recommended_photo_order: rules.photoOrder,
      validation_passed: true
    };
    const validation = validatePlatformPayload('mercari', payload, { ...itemData, ...options });
    payload.validation_passed = validation.passed;
    return { payload, validation };
  }

  if (normPlatform === 'facebook') {
    const condition = resolvePlatformCondition('facebook', options.condition || itemData.condition);
    const relistTitle = buildFacebookRelistTitle(itemData, options);
    const productTags = buildPlatformTags('facebook', itemData, options);
    const isSports = /\b(football|baseball|basketball|hockey|golf|soccer|tennis|boxing|mma|ufc|wrestling|racing|sports)\b/i.test(`${sportOrGenre} ${title}`);
    const marketplaceCategory = (signer || authEval.isCertified)
      ? (isSports ? 'Collectibles > Sports Memorabilia' : 'Collectibles > Celebrity Memorabilia')
      : (options.productType || itemData.category || 'Collectibles');

    const hookLine = `${signer ? `${signer} signed ` : ''}${options.productType || itemData.item_name || 'item'}${inscription ? ` ("${inscription}")` : ''} - 100% genuine${authEval.isCertified ? ` (${authEval.authenticator}${certNumber ? ` #${certNumber}` : ''})` : ''}. Ready for fan-cave display.`;
    const verifyUrlText = certUrl ? ` Verify online: ${certUrl}` : '';
    const pickupText = logistics.risk_tier === 'High-Value Autographed'
      ? 'Local meetup at a Local Police Precinct lot or QuikTrip (QT) Safe Place lot only. Cash or Apple Pay accepted at pickup.'
      : 'Local meetup at Mason Mill Park. Cash or Apple Pay accepted at pickup.';

    const bodyLines = [
      hookLine,
      '',
      signer ? `• Signer: ${signer}${teamOrBand ? ` (${teamOrBand})` : ''}` : null,
      authEval.isCertified || certNumber
        ? `• Authentication: ${authEval.authenticator || 'Certified'}${certNumber ? ` Cert #${certNumber}` : ''}.${verifyUrlText}`
        : null,
      `• Autograph & Inscription: Hand-signed${inscription ? ` with inscription "${inscription}"` : ''}; see close-up photos.`,
      `• Item & Condition: ${condition}${size ? `, Size ${size}` : ''}${cleanNotes ? `. ${cleanNotes}` : '.'}`,
      flags.isCustomJersey ? '• Note: Custom-made display jersey with sewn tackle-twill name and numbers. Not affiliated with or manufactured by any pro sports league or apparel brand.' : null,
      flags.isPickguardSignedGuitar ? '• Note: Hand-signed on the custom pickguard mounted to a brand-new, non-stage-played display acoustic guitar.' : null,
      `• Pickup & Payment: ${pickupText}`,
      `• Shipping: Shipping available - packaged securely for transit (UV display cube / poly-bagged box / double-boxed).${logistics.over_500_checkout_note ? ` ${logistics.over_500_checkout_note}` : ''}`,
      'If this listing is active, it is still available. Message with questions or to arrange pickup/shipping.'
    ].filter(line => line !== null);

    const payload = {
      title,
      relist_title: relistTitle,
      char_count: titleUtf16Count,
      marketplace_category: marketplaceCategory,
      condition,
      brand: (flags.isCustomJersey || flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar) ? null : (resolvedBrand || null),
      size,
      logistics: {
        risk_tier: logistics.risk_tier,
        meetup_location: logistics.meetup_location,
        accepted_local_payments: logistics.accepted_local_payments,
        shipping_enabled: true
      },
      pricing_guidance: {
        suggested_list_price: pricing.suggested_list_price,
        minimum_acceptable_price: pricing.minimum_acceptable_price
      },
      product_tags: productTags,
      description_plain_text: scrubProtectedBrandsFromCopy(bodyLines.join('\n'), flags),
      recommended_photo_order: rules.photoOrder,
      validation_passed: true
    };
    const validation = validatePlatformPayload('facebook', payload, { ...itemData, ...options });
    payload.validation_passed = validation.passed;
    return { payload, validation };
  }

  // eBay payload
  const isEnt = /\b(guitar|music|cd|vinyl|drum|movie|tv|actor|comic|book|concert|band)\b/i.test(`${sportOrGenre} ${title}`);
  const categoryPath = isEnt
    ? 'Entertainment Memorabilia > Autographs-Original'
    : 'Sports Mem, Cards & Fan Shop > Autographs-Original';
  const metaHook = `${signer ? `${signer} signed ` : ''}${teamOrBand ? `${teamOrBand} ` : ''}${options.productType || itemData.item_name || 'collectible'}${inscription ? ` "${inscription}"` : ''}${authEval.isCertified ? ` authenticated by ${authEval.authenticator}${certNumber ? ` Cert #${certNumber}` : ''}` : ''}.`.slice(0, 160);
  const ebayHtml = sanitizeListingHtml([
    `<p><strong>${escapeHtml(metaHook)}</strong></p>`,
    '<ul>',
    `<li><strong>Signer &amp; Accolades:</strong> ${escapeHtml(signer || 'Featured Signer')}${teamOrBand ? ` - ${escapeHtml(teamOrBand)}` : ''}</li>`,
    `<li><strong>Authentication &amp; Verification:</strong> ${escapeHtml(authEval.authenticator || 'Certified')}${certNumber ? ` (Cert #${escapeHtml(certNumber)})` : ''}${certUrl ? ` - Verify online at ${escapeHtml(certUrl)}` : ''}</li>`,
    `<li><strong>Autograph Details:</strong> Hand-signed${inscription ? ` with inscription "${escapeHtml(inscription)}"` : ''}. Exact placement shown in photos.</li>`,
    `<li><strong>Item &amp; Condition Details:</strong> ${escapeHtml(options.condition || itemData.condition || 'Brand New / Excellent')}${size ? `, Size ${escapeHtml(size)}` : ''}${cleanNotes ? `. ${escapeHtml(cleanNotes)}` : ''}</li>`,
    '</ul>',
    flags.isCustomJersey ? '<p><em>Note: This is a custom-made jersey featuring stitched name and numbers. It is not affiliated with, licensed by, or manufactured by any professional sports league or apparel brand.</em></p>' : '',
    flags.isPickguardSignedGuitar ? '<p><em>Note: The autograph is on the custom pickguard mounted to a brand-new, non-stage-played display guitar.</em></p>' : '',
    `<p><strong>Packaging &amp; Shipping Confidence:</strong> ${escapeHtml(logistics.packaging_method)}. Ships with tracking within ${logistics.handling_days} business day.</p>`
  ].filter(Boolean).join('\n'));

  const payload = {
    title,
    ebay_char_count: titleUtf16Count,
    category_path: categoryPath,
    item_specifics: {
      'Original/Reprint': 'Original',
      Signed: 'Yes',
      Player_or_Signer: signer || 'N/A',
      Team_or_Band: teamOrBand || 'N/A',
      Sport_or_Genre: sportOrGenre || 'Memorabilia',
      Product: options.productType || itemData.category || 'Collectible',
      Autograph_Authentication: authEval.authenticator || 'N/A',
      Authentication_Number: certNumber || 'N/A',
      Brand: flags.isCustomJersey ? 'Unbranded' : (resolvedBrand || 'Unbranded'),
      Size: size,
      Additional_Keywords_Specifics: [
        flags.isCustomJersey ? 'Jersey Type: Custom' : null,
        inscription ? `Inscription: ${inscription}` : null
      ].filter(Boolean)
    },
    pricing_guidance: {
      suggested_list_price: pricing.suggested_list_price,
      minimum_acceptable_price: pricing.minimum_acceptable_price
    },
    description_html: ebayHtml,
    recommended_photo_order: rules.photoOrder,
    validation_passed: true
  };
  const validation = validatePlatformPayload('ebay', payload, { ...itemData, ...options });
  payload.validation_passed = validation.passed;
  return { payload, validation };
}

/**
 * Executes all Pre-Publish Validation Gate checks for the active platform.
 */
export function validatePlatformPayload(platform, payload = {}, itemData = {}) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const flags = detectItemVariantFlags(itemData, {});
  const authEval = evaluateAuthenticator(itemData.authenticator || payload?.item_specifics?.Autograph_Authentication);
  const title = String(payload.title || '');
  const titleLen = computeUtf16Length(title);
  const descText = String(payload.description_plain_text || payload.description_html || '');
  const checks = [];

  // 1. Title UTF-16 budget <= 80
  checks.push({
    id: 'title_length',
    label: 'Title <= 80 UTF-16 chars',
    passed: titleLen > 0 && titleLen <= 80,
    detail: `${titleLen}/80 UTF-16 chars`
  });

  // 2. Ends with 1 allowed literal emoji (and none from blocklist)
  const blocklistedUsed = HARD_EMOJI_BLOCKLIST.filter(e => title.includes(e));
  const emojiMatches = title.match(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?/gu) || [];
  const endsWithEmoji = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?$/u.test(title.trim());
  checks.push({
    id: 'trailing_emoji',
    label: 'Single allowed trailing emoji',
    passed: blocklistedUsed.length === 0 && emojiMatches.length === 1 && endsWithEmoji,
    detail: blocklistedUsed.length > 0
      ? `Blocked emoji found: ${blocklistedUsed.join(' ')}`
      : (emojiMatches.length === 1 && endsWithEmoji ? `Trailing ${emojiMatches[0]}` : 'Must end with exactly 1 literal category emoji')
  });

  // 3. Independent wearable Size check
  const wearable = isWearableItem({ ...itemData, title });
  const hasSizeLabel = /\b(size|sz)\s*[:.-]/i.test(title);
  checks.push({
    id: 'wearable_size',
    label: 'Independent wearable Size rule',
    passed: !hasSizeLabel && (wearable || payload.size == null),
    detail: hasSizeLabel
      ? 'Never write "Size:" or "Sz" in title'
      : (wearable ? `Wearable item (${payload.size || 'no size set'})` : 'Non-wearable: size omitted')
  });

  // 4. Banned COA / Authenticator check
  const requiresAuth = getPlatformRules(normPlatform).requiresApprovedAuth;
  const authOk = !authEval.isBanned && (!requiresAuth || !itemData.athlete_person || authEval.isCertified);
  checks.push({
    id: 'auth_gate',
    label: 'Approved authenticator & COA gate',
    passed: authOk,
    detail: authEval.isBanned
      ? `Banned COA issuer: ${authEval.bannedIssuer}`
      : (authEval.isCertified ? `${authEval.authenticator} verified` : (requiresAuth ? 'Requires approved third-party COA for signed items' : 'Optional for uncertified goods'))
  });

  // 5. Anti-spoofing check (custom jerseys & unbranded display guitars)
  const fullCorpus = `${title} ${descText} ${payload.brand || ''} ${(payload.product_tags || []).join(' ')} ${(payload.hashtags || []).join(' ')}`;
  let spoofError = '';
  if (flags.isCustomJersey) {
    const found = PROTECTED_JERSEY_BRANDS.find(b => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(fullCorpus));
    if (found) spoofError = `Protected jersey token "${found}" found on custom jersey`;
  }
  if (!spoofError && (flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar)) {
    const signerName = String(itemData.athlete_person || itemData.athlete || itemData.signer || '').trim();
    const { masked: maskedCorpus } = maskSignerNames(fullCorpus, signerName);
    const brandFieldStr = String(payload.brand || payload.item_specifics?.Brand || '');
    const guitarCorpus = `${maskedCorpus} ${brandFieldStr}`;
    const found = PROTECTED_GUITAR_BRANDS.find(b => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(guitarCorpus));
    if (found) spoofError = `Protected guitar brand "${found}" found on unbranded display guitar`;
  }
  if (!spoofError && normPlatform === 'facebook' && (flags.isCustomJersey || flags.isPickguardSignedGuitar || flags.isUnbrandedGuitar) && payload.brand !== null) {
    spoofError = 'Facebook brand field must be strictly null for custom jerseys and unbranded display guitars';
  }
  checks.push({
    id: 'anti_spoofing',
    label: 'Zero brand-spoofing guardrails',
    passed: !spoofError,
    detail: spoofError || 'Clean brand attribution'
  });

  // 6. Zero em-dashes & banned hype tokens
  const hasEmDash = /[\u2014\u2013]/.test(`${title} ${descText}`);
  const hypeFound = BANNED_HYPE_WORDS.find(w => new RegExp(`\\b${w}\\b`, 'i').test(title));
  checks.push({
    id: 'hype_punctuation',
    label: 'Zero hype spam & zero em dashes',
    passed: !hasEmDash && !hypeFound,
    detail: hasEmDash
      ? 'Em dash or en dash detected'
      : (hypeFound ? `Banned hype token in title: ${hypeFound}` : 'Clean copy')
  });

  // 7. Platform-specific format checks
  if (normPlatform === 'mercari') {
    const lenOk = descText.length <= 1000;
    const hasHtml = /<[a-z][\s\S]*>/i.test(descText);
    const hasUrl = /https?:\/\/|www\.|\.com\b/i.test(descText);
    const tagCount = Array.isArray(payload.hashtags) ? payload.hashtags.length : 0;
    checks.push({
      id: 'mercari_limits',
      label: 'Mercari <=1000 plain text, 0 URLs, <=12 hashtags',
      passed: lenOk && !hasHtml && !hasUrl && tagCount <= 12,
      detail: `${descText.length}/1000 chars, ${tagCount} hashtags`
    });
  } else if (normPlatform === 'facebook') {
    const relistLen = computeUtf16Length(payload.relist_title || '');
    const hasHtml = /<[a-z][\s\S]*>/i.test(descText);
    const pays = payload?.logistics?.accepted_local_payments || [];
    const payOk = pays.includes('Cash') && pays.includes('Apple Pay') && pays.length === 2;
    checks.push({
      id: 'facebook_logistics',
      label: 'Facebook relist title, plain text & Cash/Apple Pay',
      passed: relistLen > 0 && relistLen <= 80 && !hasHtml && payOk,
      detail: `Relist ${relistLen}/80 chars | ${payload?.logistics?.meetup_location || ''}`
    });
  } else if (normPlatform === 'reverb') {
    const pickguardOk = !flags.isPickguardSignedGuitar || (/pickguard/i.test(title) && /pickguard/i.test(descText));
    checks.push({
      id: 'reverb_pickguard',
      label: 'Reverb pickguard disclosure & clean HTML',
      passed: pickguardOk && /<p>|<ul/i.test(descText),
      detail: pickguardOk ? 'Clean Reverb HTML & disclosures verified' : 'Pickguard disclosure required in title and Block 1'
    });
  } else if (normPlatform === 'whatnot') {
    const hasHtml = /<[a-z][\s\S]*>/i.test(descText);
    const hasUrl = /https?:\/\/|www\./i.test(descText);
    checks.push({
      id: 'whatnot_plain',
      label: 'Whatnot plain text & zero external links',
      passed: !hasHtml && !hasUrl,
      detail: !hasHtml && !hasUrl ? 'Plain text bullet format verified' : 'Remove HTML tags or external URLs'
    });
  } else {
    checks.push({
      id: 'ebay_specifics',
      label: 'eBay Original/Signed specifics & HTML',
      passed: payload?.item_specifics?.['Original/Reprint'] === 'Original' && /<p>|<ul/i.test(descText),
      detail: 'Original=Yes & clean semantic HTML verified'
    });
  }

  const errors = checks.filter(c => !c.passed).map(c => `${c.label}: ${c.detail}`);
  return {
    passed: errors.length === 0,
    checks,
    errors,
    warnings: []
  };
}

/**
 * Returns the platform-specific Gemini system prompt (with zero em dashes).
 */
export function buildPlatformSystemPrompt(platform) {
  const normPlatform = String(platform || 'ebay').toLowerCase().trim();
  const baseHeader = [
    'Strict Punctuation Rule: NEVER use em dashes or en dashes anywhere. Use standard hyphens (-), colons (:), or parentheses () exclusively.',
    'Strict Privacy Rule: NEVER include internal warehouse, lot, item, order ID, or ASIN metadata.',
    'Emoji Rule: End the title with 1 single literal category/subject emoji preceded by 1 space. NEVER use hype emojis (🔥, 🚨, ⭐, 🌟, 👀, ✅, 💯, 💥, ⚡, 💎, 👑, 🏆, 💰, ❗, ‼️).',
    'Wearable Size Rule: Include standalone size token (S, M, L, XL, 2XL, 3XL, 48, 52) ONLY when the item is wearable apparel/jersey. Omit completely for balls, guitars, pickguards, drumheads, helmets, CDs, and photos. Never write Size: or Sz.'
  ].join('\n');

  if (normPlatform === 'reverb') {
    return [
      'You are an expert Reverb Music Memorabilia & Autographed Instrument Listing Optimization Agent.',
      'Title budget: <= 80 UTF-16 chars (cap text before emoji at 77 chars). Front-load first 55 chars with Artist, Signed, and Signed Component (e.g. Signed Pickguard on 38" Acoustic Guitar).',
      'NEVER spoof Fender, Gibson, Martin, Taylor, or Epiphone on unbranded/generic display guitars. Use brand="Unbranded" and model="Custom Display Acoustic Guitar".',
      'If signed on a pickguard mounted to a display guitar, explicitly disclose in BOTH title and Block 1 of description_html.',
      'Description: clean semantic HTML (<p>, <ul>, <li>, <strong>) following the 4-block structure.',
      'Fee formula: suggested_list_price = ceil((target_net + 0.49) / 0.9181 * 1.12); minimum_acceptable_offer = ceil((target_net + 0.49) / 0.9181).',
      baseHeader,
      'Respond ONLY with a valid JSON object matching keys: title, title_char_count, reverb_category, brand, model, finish, condition, size, shipping_profile, pricing_guidance, description_html, recommended_photo_order, validation_passed.'
    ].join('\n\n');
  }

  if (normPlatform === 'whatnot') {
    return [
      'You are an expert Whatnot Autographed Memorabilia Listing Optimization Agent.',
      'Title budget: <= 80 UTF-16 chars (target 60-78). Front-load first 48-55 chars for 2-second live-show scannability.',
      'Require approved verifiable authenticator (JSA, PSA/DNA, Beckett/BAS, Fanatics, B.A.M., UDA, Steiner, MLB/NFL/NBA, SWAU, Schwartz) and exact Cert #.',
      'Custom jerseys: NEVER use Nike, Adidas, Mitchell & Ness, Reebok, Fanatics, or Authentic. Label as Custom Stitched Jersey.',
      'Description: plain text with bullet points (•), zero HTML, zero external links, zero unsubstantiated retail value claims.',
      'Fee formula: buy_it_now_price = ceil((target_net + 0.30) / 0.891 * 1.12); minimum_offer_auto_accept = ceil((target_net + 0.30) / 0.891).',
      baseHeader,
      'Respond ONLY with a valid JSON object matching keys: title, title_char_count, whatnot_category, listing_format_recommendation, condition, size, shipping_profile, pricing_guidance, description_plain_text, recommended_photo_order, validation_passed.'
    ].join('\n\n');
  }

  if (normPlatform === 'mercari') {
    return [
      'You are an expert Mercari Autographed Memorabilia Listing Optimization Agent.',
      'Title budget: <= 80 UTF-16 chars (target 65-80). Front-load first 50 chars.',
      'Custom jerseys: brand="No Brand". NEVER write Nike, Adidas, Mitchell & Ness, Reebok, Fanatics, Authentic, Official, NFL, MLB, NBA, NHL, or NCAA in title, description, or hashtags.',
      'Custom display guitars: NEVER write Fender, Gibson, Martin, Taylor, or Epiphone.',
      'Description: plain text ONLY (zero HTML, zero URLs like http/www/.com), strictly <= 1000 chars total including 8-12 hashtags at bottom.',
      'Pricing: suggested_list_price = ceil(target_net * 1.18) for Smart Offers/Promote; minimum_acceptable_price = ceil(target_net).',
      baseHeader,
      'Respond ONLY with a valid JSON object matching keys: title, title_char_count, category_path, condition, brand, size, pricing_guidance, hashtags, description_plain_text, recommended_photo_order, validation_passed.'
    ].join('\n\n');
  }

  if (normPlatform === 'facebook') {
    return [
      'You are an expert Facebook Marketplace Autographed Memorabilia & General Goods Listing Optimization Agent.',
      'Title budget: <= 80 UTF-16 chars (target 60-78). Also generate relist_title (<= 80 chars, varied phrasing for 14-day refresh).',
      'Custom jerseys & unbranded display guitars: brand MUST be strictly null. NEVER use protected brand/league tokens (Nike, Adidas, Mitchell & Ness, Reebok, Fanatics, Authentic, Official, NFL, MLB, NBA, NHL, NCAA, Fender, Gibson, Martin, Taylor, Epiphone) in title, tags, or description.',
      'Logistics: Tier 1 High-Value Autographed meetup at Local Police Precinct lot or QuikTrip (QT) Safe Place lot; Tier 2 Standard Lower-Risk at Mason Mill Park. Accepted local payments strictly ["Cash", "Apple Pay"]. Always set shipping_enabled: true.',
      'Pricing: suggested_list_price = ceil(target_net * 1.15); minimum_acceptable_price = ceil(target_net).',
      'Description: plain text ONLY (zero HTML), 12-20 lowercase product_tags.',
      baseHeader,
      'Respond ONLY with a valid JSON object matching keys: title, relist_title, char_count, marketplace_category, condition, brand, size, logistics, pricing_guidance, product_tags, description_plain_text, recommended_photo_order, validation_passed.'
    ].join('\n\n');
  }

  return [
    'You are an expert eBay Autographed Memorabilia Listing Optimization Agent.',
    'Title budget: <= 80 eBay UTF-16 chars (target 68-80). Front-load first 55-60 chars.',
    'Zero marketing clickbait (LOOK, WOW, RARE, HTF, MUST SEE, MINT, NICE, INVEST, NR), zero unauthorized ALL-CAPS, zero brand-spoofing on custom jerseys.',
    'Category lock: Sports Mem, Cards & Fan Shop > Autographs-Original or Entertainment Memorabilia > Autographs-Original. Reject banned COA issuers.',
    'Description: clean semantic HTML (<p>, <ul>, <li>, <strong>) with Google Meta-Description Hook in first 150-160 chars, specs, disclosures, and packaging confidence.',
    baseHeader,
    'Respond ONLY with a valid JSON object matching keys: title, ebay_char_count, category_path, item_specifics, description_html, recommended_photo_order, validation_passed.'
  ].join('\n\n');
}
