/**
 * eBay search query building utilities for TechTrek Outpost.
 * Extracted from PricingIntelligenceView.jsx to eliminate client-side duplication.
 * Note: The server-side copy in functions/api/comps/index.js is retained
 * separately since Workers cannot import from src/.
 */

/**
 * Intelligently extracts and constructs a structured comp search query from an item's fields:
 * - Person / Athlete (e.g. "Ronald Acuna Jr.")
 * - Autograph status (e.g. "Signed")
 * - Category / Type (e.g. "Jersey", "Bat", "Photo", "Puck", "Helmet", "Trunks")
 * - Inscription / Quotes (e.g. "El Abusador", "ROY", "WS MVP", "HOF")
 * - Team / League (e.g. "Braves", "Oilers", "UFC", "MLB")
 * - Authenticator (e.g. "JSA", "Beckett", "PSA")
 */
export function buildStructuredCompQuery(itemOrName, athlete, category, authenticator) {
  let itemObj = typeof itemOrName === 'object' && itemOrName !== null
    ? itemOrName
    : { item_name: itemOrName, athlete_person: athlete, category, authenticator };

  const rawTitle = String(itemObj.item_name || '').trim();
  const person = String(itemObj.athlete_person || athlete || '').trim();
  const cat = String(itemObj.category || category || '').trim();
  const auth = String(itemObj.authenticator || authenticator || '').trim();

  // 1. Extract quoted inscriptions e.g. "El Abusador", "The Kid", "Iron Mike"
  const quoteMatch = rawTitle.match(/["“']([^"”']{2,30})["”']/);
  const inscription = quoteMatch ? quoteMatch[1].trim() : '';

  // 2. Identify Item Type / Category
  let type = '';
  if (/\b(jersey|uniform)\b/i.test(rawTitle) || /\bjersey\b/i.test(cat)) type = 'Jersey';
  else if (/\b(bat|slugger|louisville)\b/i.test(rawTitle) || /\bbat\b/i.test(cat)) type = 'Bat';
  else if (/\b(helmet|mini helmet)\b/i.test(rawTitle) || /\bhelmet\b/i.test(cat)) type = 'Helmet';
  else if (/\b(puck|hockey puck)\b/i.test(rawTitle) || /\bpuck\b/i.test(cat)) type = 'Puck';
  else if (/\b(trunks|shorts|venum)\b/i.test(rawTitle) || /\btrunks\b/i.test(cat)) type = 'Trunks';
  else if (/\b(glove|boxing glove)\b/i.test(rawTitle) || /\bglove\b/i.test(cat)) type = 'Glove';
  else if (/\b(photo|8x10|16x20|picture)\b/i.test(rawTitle) || /\bphoto\b/i.test(cat)) type = 'Photo';
  else if (/\b(card|slab|graded)\b/i.test(rawTitle) || /\bcard\b/i.test(cat)) type = 'Card';
  else if (/\b(baseball|official league|rawlings)\b/i.test(rawTitle) || /\bbaseball\b/i.test(cat)) type = 'Baseball';
  else if (/\b(football|wilson|duke)\b/i.test(rawTitle) || /\bfootball\b/i.test(cat)) type = 'Football';
  else if (cat && !/^(memorabilia|other|generic|general)$/i.test(cat.trim())) type = cat.trim();

  // 3. Autograph Indicator
  const isSigned = /\b(signed|autograph|auto|inscribed|auto'd)\b/i.test(rawTitle) || Boolean(person);

  // 4. Team / League / Brand extraction
  const brandMatch = rawTitle.match(/\b(Venum|Louisville|Slugger|Rawlings|Wilson|Duke|Spalding|Nike|Adidas|Riddell|Schutt|Topps|Panini|Bowman|Upper Deck|Fleer|Donruss|Funko)\b/i);
  const brand = brandMatch ? brandMatch[1] : '';

  const teamMatch = rawTitle.match(/\b(Braves|Oilers|Canucks|Yankees|Dodgers|Red Sox|Chiefs|Cowboys|49ers|Packers|Steelers|Lakers|Bulls|Celtics|Warriors|Penguins|Bruins|Eagles|Patriots|Giants|Mets|Cubs|Phillies|Astros|UFC|MLB|NFL|NBA|NHL)\b/i);
  const team = teamMatch ? teamMatch[1] : '';

  // 5. Clean Authenticator
  const cleanAuth = auth && !['other', 'none', 'unknown', 'n/a'].includes(auth.trim().toLowerCase())
    ? auth.replace(/#.*$/, '').trim()
    : '';

  // Assemble tokens
  const tokens = [];
  if (person) tokens.push(person);
  if (isSigned && !tokens.some(t => /signed|auto/i.test(t))) tokens.push('Signed');
  if (team && !tokens.some(t => t.toLowerCase() === team.toLowerCase())) tokens.push(team);
  if (brand && !tokens.some(t => t.toLowerCase() === brand.toLowerCase())) tokens.push(brand);
  if (type && !tokens.some(t => t.toLowerCase() === type.toLowerCase())) tokens.push(type);
  if (inscription && !tokens.some(t => t.toLowerCase().includes(inscription.toLowerCase()))) tokens.push(inscription);
  if (cleanAuth && !tokens.some(t => t.toLowerCase() === cleanAuth.toLowerCase())) tokens.push(cleanAuth);

  // If structured tokens give high context (e.g. >= 2 items), use them!
  if (tokens.length >= 2) {
    return tokens.join(' ');
  }

  // Otherwise fall back to cleaned raw title
  return cleanEbaySearchQuery(rawTitle, person, cleanAuth);
}

/**
 * Cleans and optimizes an item description into a focused eBay search query.
 * Strips invoice/lot numbers, marketing buzzwords, and redundant terms.
 * Appends athlete/authenticator context when missing.
 */
export function cleanEbaySearchQuery(itemName, athlete, authenticator) {
  let text = String(itemName || '').trim();
  if (!text) return '';

  // 1. Normalize unicode quotes, dashes, spaces
  text = text.replace(/[\u2018\u2019\u201B\u2032]/g, "'");
  text = text.replace(/[\u201C\u201D\u2033]/g, '"');
  text = text.replace(/[\u2013\u2014\u2015]/g, '-');

  // 2. Normalize year ranges (e.g. 2021/22 or 2021-2022 -> 2021-22)
  text = text.replace(/\b(19\d{2}|20\d{2})\/(2\d|\d{2})\b/g, '$1-$2');
  text = text.replace(/\b(19\d{2}|20\d{2})-(?:19|20)(\d{2})\b/g, '$1-$2');

  // 3. Strip invoice, order, auction, lot, SKU, ASIN prefixes and item numbers
  text = text.replace(/^(?:item|lot|inv|sku|asin|order|po|ref|id|auction|part)\s*#?\s*[:\-\s]*\w+\s*[:\-\s]*/gi, '');
  text = text.replace(/^\s*#\s*\d{4,14}\s*[:\-\s]*/g, '');
  text = text.replace(/^\s*\d{5,14}\s*[:\-\s]+/g, '');

  // 4. Strip promotional and auction noise phrases / buzzwords
  const noisePatterns = [
    /\b(?:l[@o]{2}k|look|must\s+see|wow|rare|super\s+rare|grail|invest!?|fire!?|holy\s+grail)\b/gi,
    /\b(?:free\s+ship(?:ping)?|fast\s+ship(?:ping)?|ships?\s+(?:fast|asap|today|same\s+day)|same\s+day\s+shipping)\b/gi,
    /\b(?:read\s+desc(?:ription)?|check\s+pics|see\s+pics|see\s+photos|look\s+at\s+pics)\b/gi,
    /\b(?:no\s+reserve|nr|obo|or\s+best\s+offer|estate\s+sale|consignment|wholesale|liquidation)\b/gi,
    /\b(?:brand\s+new(?:\s+in\s+box|\s+sealed)?|bnib|nib|nwt|nwot|factory\s+sealed|sealed\s+box)\b/gi,
    /\b(?:great\s+condition|very\s+nice|excellent\s+condition|awesome|authentic\s+original)\b/gi,
    /\b(?:pristine\s+auction|whatnot|mercari|ebay\s+store)\b/gi,
  ];
  for (const np of noisePatterns) {
    text = text.replace(np, ' ');
  }

  // 5. Normalize "Last, First" in title (e.g. "Mahomes, Patrick" -> "Patrick Mahomes")
  text = text.replace(/\b([A-Z][a-z]+),\s+([A-Z][a-z]+)\b/g, '$2 $1');

  // 6. Normalize athlete name
  if (athlete && athlete.trim()) {
    let cleanAthlete = athlete.trim();
    if (cleanAthlete.includes(',')) {
      const parts = cleanAthlete.split(',').map(p => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        cleanAthlete = `${parts[1]} ${parts[0]}`;
      }
    }
    cleanAthlete = cleanAthlete.replace(/^\d{5,12}\s+/, '').trim();

    const athleteLower = cleanAthlete.toLowerCase();
    if (athleteLower && !text.toLowerCase().includes(athleteLower)) {
      const athleteParts = athleteLower.split(/\s+/).filter(Boolean);
      if (!athleteParts.every(p => text.toLowerCase().includes(p))) {
        text = `${cleanAthlete} ${text}`;
      }
    }
  }

  // 7. Normalize authenticator
  if (authenticator && authenticator.trim() && !['other', 'none', 'unknown', 'n/a'].includes(authenticator.trim().toLowerCase())) {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    const authLower = cleanAuth.toLowerCase();
    if (authLower && !text.toLowerCase().includes(authLower)) {
      text = `${text} ${cleanAuth}`;
    }
  }

  // 8. Clean unwanted special characters but preserve serial numbers (/25), card numbers (#15), hyphens
  text = text.replace(/(?<!\d)\/|\/(?!\d)/g, ' ');
  text = text.replace(/[^\w\s\-\.#/]/g, ' ');
  text = text.replace(/(?<=\s)#(?=\s|$)/g, '');
  text = text.replace(/(?<=\s)-(?=\s|$)/g, '');

  // 9. Deduplicate tokens and limit word count to top 12 most relevant keywords
  const rawWords = text.split(/\s+/).filter(Boolean);
  const uniqueWords = [];
  const seen = new Set();
  for (const w of rawWords) {
    const wClean = w.replace(/^[.,\-]+|[.,\-]+$/g, '');
    if (!wClean) continue;
    const wLower = wClean.toLowerCase();
    if (!seen.has(wLower)) {
      seen.add(wLower);
      uniqueWords.push(wClean);
    }
    if (uniqueWords.length >= 12) break;
  }

  return uniqueWords.join(' ');
}

/**
 * Builds a full eBay sold-listings search URL from item metadata.
 */
export function buildEbaySearchUrl(itemOrName, athlete, categoryOrAuth, maybeAuth) {
  let query = '';
  if (typeof itemOrName === 'object' && itemOrName !== null) {
    query = buildStructuredCompQuery(itemOrName);
  } else if (maybeAuth) {
    query = buildStructuredCompQuery(itemOrName, athlete, categoryOrAuth, maybeAuth);
  } else {
    query = cleanEbaySearchQuery(itemOrName, athlete, categoryOrAuth);
  }
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}
