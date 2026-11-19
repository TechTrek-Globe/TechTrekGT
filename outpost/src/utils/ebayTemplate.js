/**
 * eBay HTML Listing Generator for Outpost Tracker
 * Generates an advanced dark-theme, modular card layout compatible with
 * eBay Sell Inventory API and Outpost inventory schema.
 */

/**
 * Strips internal warehouse, auction lot, invoice, and tracking metadata
 * (e.g., 'Inventory tracked: Lot #12862710, Item #8183938', 'Lot #12862710 · Item #8183938',
 * Amazon order IDs, ASINs, etc.) from public-facing listing copy.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripInternalTrackingNotes(text) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text;

  // 1. Remove explicit 'Inventory tracked: ...' blocks (up to period, pipe, or newline)
  cleaned = cleaned.replace(/Inventory\s+tracked\s*:[^.\n\r|]*(?:\.|$)/gi, '');
  cleaned = cleaned.replace(/Inventory\s+tracked\s*:?[^\n\r|]*/gi, '');

  // 2. Remove 'Lot #... · Item #...' or 'Lot #..., Item #...' or standalone 'Lot #...'
  cleaned = cleaned.replace(/Lot\s*#?\s*\d+\s*[·•,;&|/-]?\s*(?:Item\s*#?\s*\d+)?/gi, '');

  // 3. Remove standalone 'Item #...' (when followed by numbers, e.g. Item #8183938)
  cleaned = cleaned.replace(/Item\s*#\s*\d+/gi, '');

  // 4. Remove internal Amazon/Vine order IDs and ASIN markers
  cleaned = cleaned.replace(/Order\s*ID\s*:?\s*[\d-]+/gi, '');
  cleaned = cleaned.replace(/\bASIN\s*:?\s*B0[A-Z0-9]{8}\b/gi, '');
  cleaned = cleaned.replace(/Imported\s+via\s+VineScout/gi, '');
  cleaned = cleaned.replace(/Sold\s+on\s+eBay[^\n\r|]*/gi, '');

  // 5. Clean up dangling delimiters like ' · ', ' | ', ' - ', leading/trailing commas, multiple spaces
  cleaned = cleaned
    .split('\n')
    .map(line => {
      let l = line.trim();
      l = l.replace(/^[\s|·•,;:/-]+|[\s|·•,;:/-]+$/g, '').trim();
      l = l.replace(/[\s|·•,;:/-]*[|·•][\s|·•,;:/-]*/g, ' · ').trim();
      l = l.replace(/^[\s|·•,;:/-]+|[\s|·•,;:/-]+$/g, '').trim();
      return l;
    })
    .filter(Boolean)
    .join('\n')
    .trim();

  return cleaned;
}

/**
 * Escapes unsafe characters for HTML/XML text nodes and attribute values.
 *
 * @param {*} val
 * @returns {string}
 */
export function escapeHtml(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strict HTML allowlist sanitization for listing templates and AI-generated copy.
 * Strips active scripts, iframes, embed/object tags, inline event handlers (on*),
 * and dangerous URI schemes while preserving safe layout formatting.
 *
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeListingHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let out = raw;
  // 1. Strip dangerous tags and their contents
  out = out.replace(/<\s*(?:script|style|iframe|object|embed|applet|form|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|style|iframe|object|embed|applet|form|svg|math)\s*>/gi, '');
  // 2. Strip standalone or self-closing disallowed tags
  out = out.replace(/<\s*\/?\s*(?:script|style|iframe|object|embed|applet|form|input|button|textarea|select|link|meta|base|svg|math|frame|frameset)\b[^>]*>/gi, '');
  // 3. Strip all inline on* event handler attributes
  out = out.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
  // 4. Strip dangerous URI schemes from href/src/action
  out = out.replace(/\s+(?:href|src|action)\s*=\s*(?:['"]\s*(?:javascript|vbscript|data):[^'"]*['"]|[^\s>]*(?:javascript|vbscript):[^\s>]*)/gi, '');
  // 5. Strip expression() or url(javascript:...) in style attributes
  out = out.replace(/style\s*=\s*(['"])(?:(?!\1)[\s\S])*?(?:expression\(|url\s*\(\s*['"]?\s*javascript:)(?:(?!\1)[\s\S])*?\1/gi, '');
  // 6. Zero em-dash invariant
  out = out.replace(/[\u2014\u2013]/g, '-');
  return out.trim();
}

/**
 * Resolves high-level item category bucket for tailored SEO hooks and packaging notes.
 */
function detectEbayTemplateCategory(item = {}, parsedAttrs = {}) {
  const text = [
    item.category,
    item.productType,
    item.product_type,
    item.sportOrGenre,
    item.sport_genre,
    item.title,
    item.item_name,
    parsedAttrs.category,
    parsedAttrs.product_type
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\b(guitar|pickguard|acoustic|electric guitar)\b/.test(text)) return 'guitar';
  if (/\b(cd|vinyl|lp|album|drumhead|drum head|music|concert|band|record)\b/.test(text)) return 'music';
  if (/\b(jersey|shirt|t-shirt|hoodie|jacket|hat|cap|apparel|sweatshirt|vest)\b/.test(text)) return 'apparel';
  if (/\b(baseball|football|basketball|hockey|puck|helmet|mini helmet|golf|soccer|sports|card)\b/.test(text)) return 'sports';
  if (/\b(glass|vase|crystal|milk glass|fenton|pyrex|ceramic|porcelain|pottery|antique|vintage)\b/.test(text)) return 'vintage_glass';
  if (/\b(drill|driver|saw|wrench|tool|dewalt|milwaukee|makita|ryobi|bosch|utv|atv|windshield|automotive|hardware)\b/.test(text)) return 'tools';
  if (/\b(headphone|earbud|speaker|camera|lens|laptop|tablet|monitor|router|keyboard|mouse|electronics|sony|apple|samsung|bose|canon|nikon|gopro)\b/.test(text)) return 'electronics';
  return 'general';
}

/**
 * Truncates text cleanly on a word boundary to stay strictly under maxChars.
 */
function truncateAtWordBoundary(text, maxChars) {
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
 * Builds a category-tailored ~160-character SEO lead hook for Block 1 <span property="description">.
 */
function buildCategorySeoHook(ctx) {
  const {
    title,
    brand,
    model,
    athlete,
    teamOrBand,
    size,
    condition,
    isAutographed,
    isCustomJersey,
    isPickguardSignedGuitar,
    authentication,
    categoryBucket
  } = ctx;

  const authShort = authentication?.provider
    ? ` with ${authentication.provider}${authentication.certNumber && authentication.certNumber !== 'N/A' ? ` #${authentication.certNumber}` : ''} authentication`
    : '';
  const condClean = (condition || 'Excellent').replace(/\s*\/\s*/g, ' / ');
  const brandPrefix = brand && brand.toLowerCase() !== 'unbranded' ? `${brand} ` : '';
  const subjectName = athlete || title;

  let hook = '';
  if (isPickguardSignedGuitar) {
    hook = `${subjectName} hand-signed custom insert pickguard mounted on a new 38-inch display acoustic guitar${authShort}. Ready for wall display.`;
  } else if (isCustomJersey) {
    hook = `${subjectName} hand-signed ${teamOrBand ? `${teamOrBand} ` : ''}custom stitched jersey${size ? ` (${size})` : ''}${authShort}. Clean display piece shipped protected.`;
  } else if (isAutographed && (categoryBucket === 'music' || categoryBucket === 'guitar')) {
    hook = `${subjectName} hand-signed ${teamOrBand ? `${teamOrBand} ` : ''}music collectible${authShort}. Genuine memorabilia packed safely with tracking.`;
  } else if (isAutographed) {
    hook = `${subjectName} hand-signed ${teamOrBand ? `${teamOrBand} ` : ''}collectible${authShort}. Verified memorabilia carefully packed and shipped fast.`;
  } else if (categoryBucket === 'electronics') {
    hook = `${brandPrefix}${model || title} in ${condClean.toLowerCase()} condition. Inspected for reliable performance and packed securely for fast shipping.`;
  } else if (categoryBucket === 'tools') {
    hook = `${brandPrefix}${model || title} in ${condClean.toLowerCase()} condition. Inspected and ready for the jobsite or garage, packed safely with tracking.`;
  } else if (categoryBucket === 'vintage_glass') {
    hook = `${brandPrefix}${title} in ${condClean.toLowerCase()} condition. Carefully inspected vintage piece, double-padded for safe insured delivery.`;
  } else if (categoryBucket === 'apparel') {
    hook = `${brandPrefix}${title}${size ? ` (Size ${size})` : ''} in ${condClean.toLowerCase()} condition. Clean garment from a smoke-free home, shipped fast.`;
  } else {
    hook = `${brandPrefix}${title} in ${condClean.toLowerCase()} condition. Exact item pictured, inspected and packed carefully for prompt delivery.`;
  }

  return truncateAtWordBoundary(hook.replace(/\s+/g, ' ').trim(), 160);
}

/**
 * Resolves protective packaging method tailored to the item category.
 */
function resolvePackagingSummary(categoryBucket, item = {}) {
  const custom = (item.packagingMethod || item.packaging_method || '').trim();
  if (custom) return custom;
  if (categoryBucket === 'guitar') {
    return 'Double-boxed with corner protection, internal cushioning, and full neck support';
  }
  if (categoryBucket === 'apparel') {
    return 'Poly-bagged and sealed inside a sturdy weather-resistant shipping box';
  }
  if (categoryBucket === 'vintage_glass') {
    return 'Individually bubble-wrapped and double-boxed with protective cushioning fill';
  }
  if (categoryBucket === 'sports') {
    const text = `${item.title || ''} ${item.item_name || ''} ${item.productType || ''}`.toLowerCase();
    if (/\b(baseball|puck)\b/.test(text)) {
      return 'UV-protected display cube inside a bubble-wrapped shipping box';
    }
    if (/\b(photo|8x10|11x14|16x20|card)\b/.test(text)) {
      return 'Rigid protective mailer with sleeve and corner protectors';
    }
    return 'Poly-bagged and packed inside a sturdy corrugated box with cushioning fill';
  }
  if (categoryBucket === 'music') {
    return 'Rigid mailer or padded corrugated carton with corner protection';
  }
  return 'Packed securely in a padded parcel with protective fill and tracking';
}

/**
 * Strips protected jersey brand / official / authentic jersey claims on custom stitched display jerseys.
 */
export function scrubCustomJerseyClaims(text) {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  out = out.replace(/\b(?:official|authentic)\s+(?:[A-Za-z0-9'.-]+\s+){0,3}?jersey\b/gi, 'custom stitched jersey');
  out = out.replace(/\b(?:Nike|Adidas|Mitchell\s*&\s*Ness|Reebok|Fanatics|Authentic|Official|NFL|MLB|NBA|NHL|NCAA)\b/gi, '');
  return out.replace(/ {2,}/g, ' ').replace(/ \./g, '.').replace(/ ,/g, ',').trim();
}

/**
 * Normalizes AI-generated middle HTML so it renders cleanly inside the single Block 2
 * Clean White Specifications Card without duplicating <span property="description">,
 * dark #111111 wrappers, or redundant Authentication sections.
 */
function normalizeAiMiddleForBlock2(rawAiHtml, { hasAuthenticationBlock = false } = {}) {
  let html = sanitizeListingHtml(stripInternalTrackingNotes(String(rawAiHtml || '').trim()));
  if (!html) return '';

  // 1. Strip any duplicate <span property="description"> wrappers
  html = html.replace(/<span\b[^>]*property\s*=\s*(['"])description\1[^>]*>([\s\S]*?)<\/span>/gi, '$2');

  // 2. Strip any redundant Authentication card/section if Block 3 will render
  if (hasAuthenticationBlock) {
    html = html.replace(/<div\b[^>]*>\s*<h[23][^>]*>\s*Authentication[^<]*<\/h[23]>[\s\S]*?<\/div>/gi, '');
    html = html.replace(/<h[23][^>]*>\s*Authentication[^<]*<\/h[23]>(?:\s*<p\b[^>]*>[\s\S]*?<\/p>)?(?:\s*<ul\b[^>]*>[\s\S]*?<\/ul>)?/gi, '');
  }

  // 3. Strip dark wrapper <div style="...background-color: #111111..."> tags (keep non-styled semantic divs like class="ai-custom-card")
  html = html.replace(/<div\b[^>]*style\s*=\s*(['"])[^'"]*background-color\s*:[^'"]*\1[^>]*>/gi, '');
  // Balance stray closing </div> tags only if we stripped opening <div style="...background-color:..."> tags
  const openDivs = (html.match(/<div\b/gi) || []).length;
  let closeDivs = (html.match(/<\/div>/gi) || []).length;
  while (closeDivs > openDivs) {
    const lastIdx = html.lastIndexOf('</div>');
    if (lastIdx === -1) break;
    html = html.slice(0, lastIdx) + html.slice(lastIdx + 6);
    closeDivs--;
  }

  // 4. Normalize light-on-dark inline text colors to #111111 for the white card
  html = html.replace(/color\s*:\s*(?:#fff(?:fff)?|#e0e0e0|#f1c15b|rgb\(\s*241\s*,\s*193\s*,\s*91\s*\)|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, 'color: #111111');

  // 5. Strip any leading or inner Item Details / Specifications headings (Block 2 renders the styled heading)
  html = html.replace(/<h[23]\b[^>]*>[\s\S]*?(?:Item\s+Details|Specifications)[\s\S]*?<\/h[23]>\s*/gi, '');

  // 6. Strip duplicate custom jersey / collector disclosures from Block 2 (disclosure belongs strictly in Block 4)
  html = html.replace(/<p\b[^>]*>\s*(?:<strong>)?\s*(?:(?:Collectible\s+)?Custom\s+Jersey\s+Disclosure|Collector\s+Disclosure):?[\s\S]*?<\/p>\s*/gi, '');
  html = html.replace(/<div\b[^>]*>\s*(?:<strong>)?\s*(?:(?:Collectible\s+)?Custom\s+Jersey\s+Disclosure|Collector\s+Disclosure):?[\s\S]*?<\/div>\s*/gi, '');
  html = html.replace(/<li\b[^>]*>\s*(?:<strong>)?\s*(?:(?:Collectible\s+)?Custom\s+Jersey\s+Disclosure|Collector\s+Disclosure):?[\s\S]*?<\/li>\s*/gi, '');

  // 7. Fix grammar and format-neutral phrasing in lead paragraphs
  html = html.replace(/\b(?:This|In\s+this)\s+auction\s+features\s+an?\s+custom\b/gi, 'This listing features a custom');
  html = html.replace(/\bThis\s+auction\s+features\s+an\b/gi, 'This listing features a');
  html = html.replace(/\bThis\s+auction\s+features\b/gi, 'This listing features');
  html = html.replace(/\bIn\s+this\s+auction\b/gi, 'In this listing');
  html = html.replace(/\bin\s+this\s+auction\b/gi, 'in this listing');
  html = html.replace(/\ban\s+custom\b/gi, 'a custom');
  html = html.replace(/\bthis\s+auction\b/gi, 'this listing');

  return `  <!-- Block 2: Clean White Specifications Card -->
  <div style="background-color: #ffffff; border: 1px solid #dddddd; color: #111111; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
    <h3 style="color: #111111; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #b37a16;">Item Details &amp; Specifications</h3>
    ${html.trim()}
  </div>`;
}

/**
 * Wraps inner eBay listing cards with the official TechTrek Outpost header banner,
 * Schema.org Product microdata, ADD/END LISTING INFO delimiters, and compact dark footer.
 */
export const wrapEbayFullTemplate = (insertHtml, options = {}) => {
  const storeBanner = options.storeBannerUrl || 'https://i.ebayimg.com/images/g/fe4AAeSwSO1q8G1~/s-l1600.webp';
  const storeName = options.storeName || 'TechTrek Outpost';
  const storeUrl = options.storeUrl || 'https://www.ebay.com/usr/tt_globetrotter';

  return sanitizeListingHtml(`<div vocab="https://schema.org/" typeof="Product" style="max-width: 900px; margin: 0 auto; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff; color: #111111; box-sizing: border-box; line-height: 1.5;">

  <!-- Header Banner -->
  <div style="width: 100%; margin-bottom: 20px; border-bottom: 2px solid #e5e5e5; padding-bottom: 12px; box-sizing: border-box;">
    <img src="${escapeHtml(storeBanner)}" alt="" width="950" height="100" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px;">
  </div>

  <!-- Content Container -->
  <div style="font-size: 15px; background-color: #ffffff; color: #111111; margin-bottom: 20px; box-sizing: border-box;">

<!-- =======================================================
       ADD LISTING INFO HERE
====================================================== -->

${insertHtml}

<!-- =======================================================
       END LISTING INFO HERE
======================================================= -->

  </div>

  <!-- Compact Dark Footer Strip -->
  <table role="presentation" style="width: 100%; background-color: #111111; border-radius: 6px; padding: 12px 16px; margin-top: 24px; border-collapse: collapse; box-sizing: border-box;">
    <tbody>
      <tr>
        <td style="color: #e0e0e0; font-size: 13px; font-family: Arial, Helvetica, sans-serif; text-align: left; vertical-align: middle;">
          <strong style="color: #f1c15b;">${escapeHtml(storeName)}</strong> &nbsp;|&nbsp; Clear Item Details &nbsp;•&nbsp; Exact Photos &nbsp;•&nbsp; Carefully Packed
        </td>
        <td style="text-align: right; vertical-align: middle;">
          <a href="${escapeHtml(storeUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 7px 15px; background-color: #b37a16; color: #ffffff !important; text-decoration: none; font-size: 12px; font-weight: bold; border-radius: 4px; white-space: nowrap; font-family: Arial, Helvetica, sans-serif;">
            Browse All Listings
          </a>
        </td>
      </tr>
    </tbody>
  </table>

</div>`.trim());
};

export const generateEbayListingHtml = (item = {}) => {
  // Parse Outpost attributes if stored as JSON string
  let parsedAttrs = {};
  if (typeof item.attributes === 'string') {
    try {
      parsedAttrs = JSON.parse(item.attributes);
    } catch {
      parsedAttrs = {};
    }
  } else if (item.attributes && typeof item.attributes === 'object') {
    parsedAttrs = item.attributes;
  }

  // Dynamic mapping with Outpost inventory schema fallbacks
  const title = (item.title || item.item_name || parsedAttrs.title || 'Authentic Collectible').trim();
  const rawDescription = (item.description || item.notes || item.additional_description || parsedAttrs.description || '').trim();
  const description = stripInternalTrackingNotes(rawDescription);

  const condition = (item.item_condition || item.condition || parsedAttrs.condition || '').trim();
  const conditionHeader = (item.conditionHeader || parsedAttrs.condition_header || '').trim();
  const conditionSubheader = (item.conditionSubheader || item.condition_notes || parsedAttrs.condition_subheader || '').trim();
  const rawConditionDetails = (
    item.conditionDetails ||
    item.condition_details ||
    item.condition_notes ||
    (conditionHeader && conditionSubheader ? `${conditionHeader}: ${conditionSubheader}` : '') ||
    (condition ? `${condition}. Please review all photos carefully for the exact condition, quality, and details.` : '') ||
    parsedAttrs.conditionDetails ||
    'Please review all photos carefully for the exact condition, quality, and details.'
  ).trim();
  const conditionDetails = stripInternalTrackingNotes(rawConditionDetails) || 'Please review all photos carefully for the exact condition, quality, and details.';

  const brand = (item.brand || parsedAttrs.brand || '').trim();
  const model = (item.model || parsedAttrs.model || '').trim();
  const productType = (item.productType || item.product_type || parsedAttrs.product_type || '').trim();
  const category = (item.category || parsedAttrs.category || '').trim();
  const sportOrGenre = (item.sportOrGenre || item.sport_genre || parsedAttrs.sport_genre || '').trim();
  const athlete = (item.athlete || item.athlete_person || item.signer || parsedAttrs.athlete_person || '').trim();
  const teamOrBand = (item.teamOrBand || item.team_or_band || item.team || parsedAttrs.team_or_band || '').trim();
  const inscription = (item.inscription || parsedAttrs.inscription || '').trim();
  const size = (item.size || item.wearableSize || item.dimensions || parsedAttrs.size || parsedAttrs.dimensions || '').trim();
  const material = (item.material || item.finish || item.instrument_finish || item.photo_finish || parsedAttrs.material || parsedAttrs.finish || parsedAttrs.instrument_finish || parsedAttrs.photo_finish || '').trim();
  const itemSubtype = (item.item_subtype || parsedAttrs.item_subtype || '').trim();
  const color = (item.color || parsedAttrs.color || '').trim();
  const framingStatus = (item.framing_status || parsedAttrs.framing_status || '').trim();
  const frameDimensions = (item.frame_dimensions || parsedAttrs.frame_dimensions || '').trim();
  const inkColor = (item.ink_color || parsedAttrs.ink_color || '').trim();
  const signatureLocation = (item.signature_location || item.signed_surface || parsedAttrs.signature_location || parsedAttrs.signed_surface || '').trim();
  const colorway = (item.colorway || parsedAttrs.colorway || '').trim();
  const equipmentModel = (item.equipment_model || parsedAttrs.equipment_model || '').trim();
  const albumTitle = (item.album_title || parsedAttrs.album_title || '').trim();
  const mediaFormat = (item.media_format || parsedAttrs.media_format || '').trim();
  const cardYear = (item.card_year || parsedAttrs.card_year || '').trim();
  const cardSet = (item.card_set || parsedAttrs.card_set || '').trim();
  const cardNumber = (item.card_number || parsedAttrs.card_number || '').trim();
  const parallelSerial = (item.parallel_serial || parsedAttrs.parallel_serial || '').trim();
  const cardGrade = (item.card_grade || parsedAttrs.card_grade || '').trim();
  const autoGrade = (item.auto_grade || parsedAttrs.auto_grade || '').trim();

  const combinedText = `${title} ${productType} ${category} ${description}`.toLowerCase();
  const isCustomJersey = Boolean(
    item.isCustomJersey ?? item.is_custom_jersey ?? parsedAttrs.is_custom_jersey ??
    (/\bcustom\b/.test(combinedText) && /\bjersey\b/.test(combinedText))
  );
  const isPickguardSignedGuitar = Boolean(
    item.isPickguardSignedGuitar ?? item.is_pickguard_guitar ?? parsedAttrs.is_pickguard_guitar ??
    (/\bpickguard\b/.test(combinedText) && /\bguitar\b/.test(combinedText))
  );
  const isWearable = Boolean(
    item.isWearable ?? item.is_wearable ?? parsedAttrs.is_wearable ??
    /\b(jersey|shirt|t-shirt|tee|hoodie|jacket|sweatshirt|pullover|apparel|vest)\b/i.test(combinedText)
  );

  // Handle features (array, string, or parsed attributes)
  let rawFeatures = item.features || parsedAttrs.features || [];
  if (typeof rawFeatures === 'string') {
    rawFeatures = rawFeatures.split('\n').map(f => f.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  }
  const features = Array.isArray(rawFeatures) ? rawFeatures.map(f => stripInternalTrackingNotes(String(f || ''))).filter(Boolean) : [];

  // Handle specs (array of {label, value}, object, or string)
  let parsedSpecs = [];
  const rawSpecs = item.specs || parsedAttrs.specs;
  if (Array.isArray(rawSpecs)) {
    parsedSpecs = rawSpecs.filter(s => s && s.label && s.value).map(s => ({ label: String(s.label).trim(), value: String(s.value).trim() }));
  } else if (rawSpecs && typeof rawSpecs === 'object') {
    parsedSpecs = Object.entries(rawSpecs).filter(([, v]) => v != null && String(v).trim() !== '').map(([label, value]) => ({ label: label.trim(), value: String(value).trim() }));
  } else if (typeof rawSpecs === 'string' && rawSpecs.trim()) {
    parsedSpecs = rawSpecs.split('\n').map(line => {
      const idx = line.indexOf(':');
      if (idx === -1) return null;
      const label = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      return (label && value) ? { label, value } : null;
    }).filter(Boolean);
  }

  // Intelligently resolve authentication
  let authentication = null;
  const rawAuth = (item.authenticator || parsedAttrs.authenticator || '').trim();
  const certNum = (item.certNumber || item.cert_number || parsedAttrs.cert_number || '').trim();
  const isCertified = Boolean(rawAuth && !['Raw', 'Uncertified', 'None', 'Other', 'N/A', ''].includes(rawAuth));
  const isAutographed = Boolean(
    (item.authentication && typeof item.authentication === 'object') ||
    athlete ||
    isCertified ||
    inscription ||
    /\b(signed|autograph|autographed)\b/i.test(title)
  );

  if (item.authentication && typeof item.authentication === 'object') {
    authentication = item.authentication;
  } else {
    const authType = (item.authType || item.auth_type || parsedAttrs.auth_type || (athlete ? `Witnessed / Autograph (${athlete})` : 'Professional Certification')).trim();
    if (isCertified || (isAutographed && certNum)) {
      authentication = {
        provider: rawAuth || 'Certified Authentication',
        certNumber: certNum || 'N/A',
        type: authType || 'Witnessed',
        verificationUrl: item.certUrl || item.cert_url || parsedAttrs.cert_url || null
      };
    }
  }

  // Handle included items (array, string, or parsed attributes)
  let rawIncluded = item.includedItems || item.included_items || item.includedInSale || parsedAttrs.included_items || parsedAttrs.included_in_sale || [];
  if (typeof rawIncluded === 'string') {
    rawIncluded = rawIncluded.split('\n').map(i => i.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  }
  const includedItems = Array.isArray(rawIncluded) ? rawIncluded.map(i => stripInternalTrackingNotes(String(i || ''))).filter(Boolean) : [];

  const categoryBucket = detectEbayTemplateCategory(item, parsedAttrs);
  const isMusic = categoryBucket === 'music' || categoryBucket === 'guitar';

  // Dynamic header subtitle bar
  const subtitleParts = isAutographed
    ? [
        authentication ? `${authentication.provider} Authenticated` : 'Hand-Signed Collectible',
        authentication?.certNumber && authentication.certNumber !== 'N/A' ? `Cert #${authentication.certNumber}` : '',
        inscription ? `Inscription: "${inscription}"` : ''
      ].filter(Boolean)
    : [
        brand ? `Brand: ${brand}` : '',
        model ? `Model: ${model}` : (productType || (category && category !== 'General' ? category : '')),
        condition ? `Condition: ${condition}` : ''
      ].filter(Boolean);
  const headerSubtitle = subtitleParts.length > 0
    ? subtitleParts.join(' | ')
    : 'TechTrek Outpost | Inspected & Ready to Ship';

  // Block 1: 160-char SEO hook (or cleaned seller summary strictly < 800 chars) inside <span property="description">
  const customSeoHook = (item.seoSummary || item.seo_summary || '').trim();
  const autoSeoHook = buildCategorySeoHook({
    title,
    brand: isCustomJersey ? '' : brand,
    model,
    athlete,
    teamOrBand,
    size: isWearable ? size : '',
    condition: condition || 'Excellent',
    isAutographed,
    isCustomJersey,
    isPickguardSignedGuitar,
    authentication,
    categoryBucket
  });
  let schemaDescription = customSeoHook || description || autoSeoHook;
  let overflowDescription = '';
  if (schemaDescription.length > 780) {
    schemaDescription = truncateAtWordBoundary(schemaDescription, 780);
    overflowDescription = description;
  }
  if (isCustomJersey) {
    schemaDescription = scrubCustomJerseyClaims(schemaDescription);
    if (overflowDescription) overflowDescription = scrubCustomJerseyClaims(overflowDescription);
  }

  // Block 2: Dynamic non-empty Specifications list (Clean White Card)
  const specRows = [];
  const addSpec = (label, value) => {
    let cleanVal = stripInternalTrackingNotes(String(value || '')).trim();
    if (isCustomJersey) cleanVal = scrubCustomJerseyClaims(cleanVal);
    if (!cleanVal || cleanVal.toLowerCase() === 'n/a') return;
    if (!specRows.some(r => r.label.toLowerCase() === label.toLowerCase())) {
      specRows.push({ label, value: cleanVal });
    }
  };

  if (athlete) addSpec(isMusic ? 'Artist / Signer' : 'Signer / Subject', athlete);
  if (teamOrBand) addSpec(isMusic ? 'Band / Act' : 'Team / Franchise', teamOrBand);
  if (sportOrGenre) addSpec(isMusic ? 'Genre' : 'Sport / Category', sportOrGenre);
  if (isCustomJersey || isPickguardSignedGuitar) {
    addSpec('Brand', 'Unbranded');
  } else if (brand) {
    addSpec('Brand', brand);
  }
  if (model) addSpec('Model', model);
  if (productType || (category && category !== 'General')) {
    addSpec('Item Type', itemSubtype ? `${productType || category} (${itemSubtype})` : (productType || category));
  }
  if (equipmentModel) addSpec('Equipment Model', equipmentModel);
  if (albumTitle) addSpec('Album / Release', mediaFormat ? `${albumTitle} (${mediaFormat})` : albumTitle);
  if (cardYear || cardSet) addSpec('Card Set', [cardYear, cardSet, cardNumber, parallelSerial].filter(Boolean).join(' '));
  if (cardGrade) addSpec('Grade', autoGrade ? `${cardGrade} / ${autoGrade}` : cardGrade);
  if (size && (isWearable || !isAutographed || categoryBucket === 'sports' || /\b(photo|poster)\b/i.test(`${category} ${productType}`))) {
    addSpec(isWearable ? 'Size' : 'Size / Dimensions', size);
  }
  if (color) addSpec('Color', color);
  if (colorway && colorway.toLowerCase() !== color.toLowerCase()) addSpec('Colorway', colorway);
  if (material) addSpec('Material / Finish', material);
  if (inkColor) addSpec('Ink Color', inkColor);
  if (signatureLocation) addSpec('Signature Placement', signatureLocation);
  if (framingStatus && framingStatus !== 'Unframed') {
    addSpec('Display / Framing', frameDimensions ? `${framingStatus} (${frameDimensions})` : framingStatus);
  }
  if (inscription) addSpec('Inscription', `"${inscription}"`);
  addSpec('Condition', conditionHeader && conditionSubheader ? `${conditionHeader} - ${conditionSubheader}` : (condition || 'Pre-Owned / See Photos'));
  for (const s of parsedSpecs) {
    addSpec(s.label, s.value);
  }

  const specBulletsHtml = specRows
    .map(r => `<li><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}</li>`)
    .join('\n      ');

  // Block 3: Conditional Dark Authentication Card OR Key Features Card (for non-autographed goods)
  let block3Html = '';
  if (authentication) {
    block3Html = `
  <!-- Block 3: Authentication Card -->
  <div style="background-color: #111111; border: 1px solid #333333; color: #e0e0e0; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
    <h3 style="color: #f1c15b; margin-top: 0;">Authentication</h3>
    <p style="color: #e0e0e0; margin-bottom: 10px;">This item has been professionally authenticated.</p>
    <ul style="margin: 0; padding-left: 20px; color: #e0e0e0;">
      <li>Authenticator: ${escapeHtml(authentication.provider)}</li>
      ${authentication.certNumber && authentication.certNumber !== 'N/A' ? `<li>Certification Number: ${escapeHtml(authentication.certNumber)}</li>` : ''}
      <li>Details: ${escapeHtml(authentication.type)}</li>
      <li>Verification: Verify ${authentication.certNumber && authentication.certNumber !== 'N/A' ? `serial number ${escapeHtml(authentication.certNumber)} directly ` : ''}in the ${escapeHtml(authentication.provider)} online certification database.</li>
    </ul>
  </div>`;
  } else if (features.length > 0) {
    block3Html = `
  <!-- Block 3: Key Features Card -->
  <div style="background-color: #111111; border: 1px solid #333333; color: #e0e0e0; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
    <h3 style="color: #f1c15b; margin-top: 0;">Key Features</h3>
    <ul style="margin: 0; padding-left: 20px; color: #e0e0e0;">
      ${features.map(f => `<li>${escapeHtml(f)}</li>`).join('\n      ')}
    </ul>
  </div>`;
  }

  // Resolve middle section: AI-generated content normalized into Block 2 Clean White Card, or deterministic Block 2 + Block 3
  const hasAiMiddle = typeof item.aiGeneratedMiddleSection === 'string' && item.aiGeneratedMiddleSection.trim().length > 0;
  let middleSectionHtml = '';
  if (hasAiMiddle) {
    let normalizedAi = normalizeAiMiddleForBlock2(item.aiGeneratedMiddleSection, {
      hasAuthenticationBlock: Boolean(authentication)
    });
    if (isCustomJersey) normalizedAi = scrubCustomJerseyClaims(normalizedAi);
    middleSectionHtml = normalizedAi + block3Html;
  } else {
    middleSectionHtml = `  <!-- Block 2: Clean White Specifications Card -->
  <div style="background-color: #ffffff; border: 1px solid #dddddd; color: #111111; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
    <h3 style="color: #111111; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 2px solid #b37a16;">Item Details &amp; Specifications</h3>
    <ul style="margin: 0; padding-left: 20px; color: #111111; line-height: 1.7;">
      ${specBulletsHtml}
    </ul>
  </div>${block3Html}`;
  }

  // Block 4: What's Included & Collector/Buyer Notes
  const includedBullets = includedItems.length > 0
    ? includedItems.map(i => `<li>${escapeHtml(i)}</li>`)
    : [
        `<li>${escapeHtml(title)}</li>`,
        authentication ? `<li>${escapeHtml(authentication.provider)} COA / Tamper-Proof Hologram${authentication.certNumber && authentication.certNumber !== 'N/A' ? ` (#${escapeHtml(authentication.certNumber)})` : ''}</li>` : ''
      ].filter(Boolean);

  const packagingMethod = resolvePackagingSummary(categoryBucket, { ...item, title });
  let conditionalDisclosure = '';
  if (isCustomJersey) {
    conditionalDisclosure = '<li>Collector Disclosure: Custom stitched display jersey with sewn tackle-twill name and numbers; not affiliated with or manufactured by any pro sports league or apparel brand.</li>';
  } else if (isPickguardSignedGuitar) {
    conditionalDisclosure = '<li>Collector Disclosure: Autograph is on the custom insert pickguard mounted to a brand-new, non-stage-played 38-inch display acoustic guitar intended for wall or case display.</li>';
  } else {
    conditionalDisclosure = `<li>Buyer Note: ${escapeHtml(conditionDetails)}</li>`;
  }

  const block4Heading = isAutographed
    ? "What's Included &amp; Collector Notes"
    : "What's Included &amp; Buyer Notes";

  return `
<div style="font-family: Arial, Helvetica, sans-serif; background-color: #ffffff; color: #111111; max-width: 900px; margin: 0 auto; line-height: 1.5;">

  <!-- Dark Gold Title Header Card -->
  <div style="background-color: #111111; border: 1px solid #d6b56d; color: #e0e0e0; padding: 18px; margin-bottom: 15px; border-radius: 6px; text-align: center;">
    <h2 style="color: #f1c15b; margin: 0 0 6px 0; font-size: 20px; line-height: 1.3;">${escapeHtml(title)}</h2>
    <p style="margin: 0; color: #e0e0e0; font-size: 13px;">${escapeHtml(headerSubtitle)}</p>
  </div>

  <!-- Block 1: Light Gold Tint Summary Card -->
  <div style="background-color: #faf6ee; border: 1px solid #e2c992; color: #111111; padding: 18px; margin-bottom: 15px; border-radius: 6px;">
    <p style="margin: 0; color: #111111; font-size: 15px; line-height: 1.6;"><span property="description">${escapeHtml(schemaDescription)}</span></p>
    ${overflowDescription ? `<p style="margin: 10px 0 0 0; color: #111111; font-size: 14px;">${escapeHtml(overflowDescription)}</p>` : ''}
  </div>

${middleSectionHtml}

  <!-- Block 4: Dark What's Included & Notes Card -->
  <div style="background-color: #111111; border: 1px solid #333333; color: #e0e0e0; padding: 18px; border-radius: 6px;">
    <h3 style="color: #f1c15b; margin-top: 0;">${block4Heading}</h3>
    <ul style="margin: 0; padding-left: 20px; color: #e0e0e0; line-height: 1.7;">
      ${includedBullets.join('\n      ')}
      <li>Smoke-Free Collection: Stored in a clean, smoke-free, climate-controlled collection.</li>
      <li>Packaging &amp; Shipping: ${escapeHtml(packagingMethod)}</li>
      ${conditionalDisclosure}
    </ul>
  </div>

</div>
  `.trim();
};
