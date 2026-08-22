/**
 * eBay search query building utilities for TechTrek Outpost.
 * Extracted from PricingIntelligenceView.jsx to eliminate client-side duplication.
 * Note: The server-side copy in functions/api/comps/index.js is retained
 * separately since Workers cannot import from src/.
 */

/**
 * Cleans and optimizes an item description into a focused eBay search query.
 * Strips lot/item numbers, deduplicates words, appends athlete/authenticator
 * context when missing.
 */
export function cleanEbaySearchQuery(itemName, athlete, authenticator) {
  let text = String(itemName || '').trim();

  // Strip leading Item #, Lot #, or standalone 5-12 digit numbers
  text = text.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-\u2013\u2014:]\s*|\s+)?/gi, '');
  text = text.replace(/^\d{5,12}\s*[-\u2013\u2014:]\s*/g, '');
  text = text.replace(/^\d{5,12}\s+/g, '');

  // Strip standalone non-year 5-12 digit numbers anywhere in text
  text = text.replace(/\b(?!(?:19|20)\d{2})\d{5,12}\b/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  // If athlete provided and not in text, prepend athlete
  if (athlete && athlete.trim()) {
    const cleanAthlete = athlete.replace(/^\d{5,12}\s+/, '').trim();
    if (cleanAthlete && !text.toLowerCase().includes(cleanAthlete.toLowerCase())) {
      text = `${cleanAthlete} ${text}`;
    }
  }

  // If authenticator provided and not in text, append authenticator
  if (authenticator && authenticator.trim() && authenticator.toLowerCase() !== 'other') {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    if (cleanAuth && !text.toLowerCase().includes(cleanAuth.toLowerCase())) {
      text = `${text} ${cleanAuth}`;
    }
  }

  // Clean special characters except word characters, spaces, and hyphens
  text = text.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Builds a full eBay sold-listings search URL from item metadata.
 */
export function buildEbaySearchUrl(itemName, athlete, authenticator) {
  const query = cleanEbaySearchQuery(itemName, athlete, authenticator);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}
