/**
 * Canonical Item Categories, Product Groups & Domain Presets for TechTrek Outpost.
 * Pure ESM module shared by modals, grid views, and listing/comps utilities.
 */

export const MEMORABILIA_CATEGORIES = Object.freeze([
  'Jersey',
  'Baseball',
  'Football',
  'Basketball',
  'Helmet',
  'Mini Helmet',
  'Bat',
  'Puck',
  'Glove',
  'Mask',
  'Guitar',
  'Pickguard',
  'CD / Vinyl',
  'Album Flat',
  'Drumhead',
  'Drum Stick',
  'Photo',
  'Framed Photo',
  'Poster',
  'Card',
  'Other Memorabilia'
]);

export const GENERAL_CATEGORIES = Object.freeze([
  'Electronics',
  'Tools',
  'Home & Kitchen',
  'Toys & Games',
  'Clothing',
  'Hat / Cap',
  'Books',
  'Automotive',
  'Office',
  'Health',
  'Beauty',
  'Pet Supplies',
  'Sports',
  'Other'
]);

export const ALL_ITEM_CATEGORIES = Object.freeze([
  ...MEMORABILIA_CATEGORIES,
  ...GENERAL_CATEGORIES
]);

export const ITEM_CONDITIONS = Object.freeze([
  'New / Unopened',
  'Mint',
  'Near Mint',
  'Excellent',
  'Very Good',
  'Good',
  'Flawed / As-Is'
]);

export const AUTH_TYPES = Object.freeze([
  'Witnessed',
  'Basic Cert',
  'Full LOA',
  'Graded Slab',
  'Team / League Holo',
  'Uncertified'
]);

export const PREP_STATUSES = Object.freeze([
  'Ready',
  'Needs Auth',
  'At Authenticator',
  'Needs Framing',
  'At Framer',
  'Needs Case/Clean'
]);

export const FRAMING_STATUSES = Object.freeze([
  'Unframed',
  'Framed',
  'Framed + Matted',
  'UV Acrylic Case',
  'Ball Cube',
  'Slab / Top Loader'
]);

export const SOURCE_VENDORS = Object.freeze([
  'Pristine Auction',
  'Heritage',
  'Goldin',
  'eBay',
  'Private Signing',
  'Local Estate',
  'Amazon Vine',
  'Retail',
  'Other'
]);

export const INK_COLORS = Object.freeze([
  'Blue Ballpoint',
  'Black Sharpie',
  'Blue Sharpie',
  'Silver Paint Pen',
  'Gold Paint Pen',
  'White Paint Pen',
  'Red Paint Pen',
  'Other'
]);

export const ITEM_COLOR_PRESETS = Object.freeze([
  'Black',
  'White',
  'Red',
  'Blue',
  'Navy',
  'Royal Blue',
  'Green',
  'Forest Green',
  'Gold',
  'Yellow',
  'Orange',
  'Purple',
  'Silver',
  'Gray',
  'Maroon',
  'Teal',
  'Pink',
  'Brown',
  'Natural / Wood',
  'Sunburst',
  'Chrome',
  'Camo',
  'Multi-Color'
]);

export const JERSEY_STYLES = Object.freeze([
  'Custom Stitched',
  'Replica / Swingman',
  'Authentic / On-Field',
  'Game-Used / Team-Issued'
]);

export const WEARABLE_SIZE_PRESETS = Object.freeze([
  'S', 'M', 'L', 'XL', '2XL', '3XL', '48', '50', '52', '54', '56'
]);

export const PHOTO_DIMENSIONS = Object.freeze([
  '8x10',
  '11x14',
  '16x20',
  '18x24',
  '24x36',
  'Custom'
]);

export const PHOTO_FINISHES = Object.freeze([
  'Glossy',
  'Matte',
  'Canvas',
  'Lithograph / Print'
]);

export const GUITAR_TYPES = Object.freeze([
  'Display Acoustic (38")',
  'Full-Size Acoustic',
  'Electric Guitar',
  'Pickguard Only',
  'Drumhead (14")',
  'Drum Stick Pair'
]);

export const MEDIA_FORMATS = Object.freeze([
  'CD Booklet',
  'Jewel Case + CD',
  '12x12 Album Flat',
  'Vinyl LP Jacket',
  'Vinyl LP + Disc',
  'Concert Poster'
]);

export const SIGNATURE_LOCATIONS = Object.freeze([
  'Sweet Spot',
  'Side Panel',
  'Crown',
  'Front Panel',
  'Barrel',
  'Number',
  'Pickguard',
  'Guitar Body',
  'Headstock',
  'Front Booklet',
  'Album Cover',
  'On-Card',
  'Sticker Auto'
]);

export const SUBTYPE_PRESETS_BY_GROUP = Object.freeze({
  jersey_apparel: ['Custom Stitched', 'Nike Game', 'Mitchell & Ness', 'Authentic On-Field', 'Replica', 'Signed Cap / Hat'],
  sports_gear: ['OMLB Official MLB', 'Black Pearl Baseball', 'World Series Ball', 'NFL Duke Football', 'Riddell Speed Full-Size', 'Riddell Speed Mini', 'Lunar Eclipse Mini', 'Pro Model Bat', 'Official Game Puck', 'Boxing Glove'],
  music_instrument: ['Display Acoustic (38")', 'Full-Size Acoustic', 'Electric Guitar', 'Signed Pickguard Only', '14" Drumhead', 'Drum Stick Pair'],
  music_media: ['CD Booklet Insert', 'Jewel Case + CD', '12x12 Album Flat', 'Vinyl LP Jacket', 'Vinyl LP + Record'],
  photo_print: ['8x10 Photo', '11x14 Photo', '16x20 Photo', 'Framed 8x10', 'Framed 16x20', 'Concert / Event Poster'],
  trading_card: ['Graded Slab', 'Raw Single', 'Autograph Patch (RPA)', 'Rookie Card', 'Sealed Wax / Box'],
  general: ['New Retail', 'Open Box', 'Used / Pre-Owned', 'Collectible Figure', 'Accessory / Part']
});

export const CATEGORY_GROUP_LABELS = Object.freeze({
  jersey_apparel: 'Jersey & Apparel Specifics',
  sports_gear: 'Ball, Helmet & Equipment Specifics',
  music_instrument: 'Guitar, Pickguard & Music Gear Specifics',
  music_media: 'CD, Vinyl & Album Flat Specifics',
  photo_print: 'Photo & Print Specifics',
  trading_card: 'Trading Card Specifics',
  general: 'Product & Retail Specifics'
});

/**
 * Resolves a category + optional item title into one of 7 product groups
 * driving conditional inputs in EditTabDetails.
 *
 * @param {string} category
 * @param {string} [itemName]
 * @returns {'jersey_apparel'|'sports_gear'|'music_instrument'|'music_media'|'photo_print'|'trading_card'|'general'}
 */
export function resolveCategoryGroup(category = '', itemName = '') {
  const cat = String(category || '').toLowerCase().trim();
  const text = `${cat} ${String(itemName || '').toLowerCase()}`.trim();

  if (cat) {
    if (['jersey', 'clothing', 'hat / cap'].includes(cat)) return 'jersey_apparel';
    if (['baseball', 'football', 'basketball', 'helmet', 'mini helmet', 'bat', 'puck', 'glove', 'mask'].includes(cat)) return 'sports_gear';
    if (['guitar', 'pickguard', 'drumhead', 'drum stick'].includes(cat)) return 'music_instrument';
    if (['cd / vinyl', 'album flat'].includes(cat)) return 'music_media';
    if (['photo', 'framed photo', 'poster'].includes(cat)) return 'photo_print';
    if (['card', 'trading card', 'sports cards'].includes(cat)) return 'trading_card';
    if (GENERAL_CATEGORIES.some(g => g.toLowerCase() === cat)) return 'general';
  }

  // Fallback heuristics when category is blank or "Memorabilia" / "Other Memorabilia"
  if (/\b(jersey|shirt|hoodie|jacket|hat|cap)\b/.test(text)) return 'jersey_apparel';
  if (/\b(guitar|pickguard|pick guard|drumhead|drum head|drum stick|drumstick)\b/.test(text)) return 'music_instrument';
  if (/\b(cd|vinyl|lp|album flat|record sleeve|booklet)\b/.test(text)) return 'music_media';
  if (/\b(photo|8x10|11x14|16x20|poster|print|lithograph)\b/.test(text)) return 'photo_print';
  if (/\b(trading card|rookie card|panini|prizm|topps|bowman|psa 10|bgs 9|sgc 10|\bcard\b)\b/.test(text)) return 'trading_card';
  if (/\b(baseball|football|basketball|helmet|bat|puck|glove|mask|omlb|rawlings|riddell)\b/.test(text)) return 'sports_gear';

  return 'general';
}

/**
 * Returns true when the category belongs to the memorabilia domain (auto-expands Subject/Auth cards).
 */
export function isMemorabiliaCategory(category = '', itemName = '') {
  const group = resolveCategoryGroup(category, itemName);
  if (group !== 'general') return true;
  const cat = String(category || '').toLowerCase().trim();
  if (cat === 'other memorabilia' || cat === 'memorabilia') return true;
  return /\b(signed|autograph|autographed|jsa|beckett|psa\/dna|coa)\b/i.test(String(itemName || ''));
}

/**
 * Returns true if framing_status indicates a framed display requiring frame dimensions.
 */
export function isFramedStatus(framingStatus = '') {
  const s = String(framingStatus || '').toLowerCase();
  return s === 'framed' || s === 'framed + matted' || s.startsWith('framed');
}
