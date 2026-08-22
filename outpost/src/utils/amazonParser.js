/**
 * amazonParser.js
 * Client-Side Smart Parsing Utility for Amazon Product Detail Pages.
 *
 * Extracts Title, Brand, Price, Features (bullets), Technical Specifications,
 * and Description from raw copied text or pasted HTML.
 */

/**
 * Strips HTML tags and decodes basic HTML entities.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts product details from pasted Amazon HTML.
 * @param {string} html
 * @returns {object}
 */
export function parseAmazonHtml(html) {
  if (!html || typeof html !== 'string') return {};

  const result = {
    title: '',
    brand: '',
    price: null,
    features: [],
    specs: {},
    description: '',
    image: null,
    category: ''
  };

  // 1. Title Extraction
  const titleMatch = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)
    || html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<title>([\s\S]*?)<\/title>/i);

  if (titleMatch) {
    let cleanTitle = stripHtml(titleMatch[1]);
    cleanTitle = cleanTitle
      .replace(/^Amazon\.com\s*:\s*/i, '')
      .replace(/\s*:\s*Amazon\.com.*$/i, '')
      .replace(/\s*:\s*Automotive.*$/i, '')
      .replace(/\s*:\s*Home & Kitchen.*$/i, '')
      .trim();
    if (cleanTitle && !cleanTitle.toLowerCase().includes('robot check')) {
      result.title = cleanTitle;
    }
  }

  // 2. Brand Extraction
  const brandRowMatch = html.match(/<tr[^>]*class=["'][^"']*po-brand[^"']*["'][^>]*>[\s\S]*?<td[^>]*class=["'][^"']*a-span9[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*a-size-base[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  if (brandRowMatch) {
    result.brand = stripHtml(brandRowMatch[1]);
  }
  if (!result.brand) {
    const bylineMatch = html.match(/<a[^>]*id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
    if (bylineMatch) {
      let bText = stripHtml(bylineMatch[1]);
      bText = bText.replace(/^(?:Brand|Visit the)\s*:\s*/i, '').replace(/\s+Store$/i, '').trim();
      if (bText) result.brand = bText;
    }
  }

  // 3. Price Extraction
  const priceMatch = html.match(/<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*\$([\d.,]+)\s*<\/span>/i)
    || html.match(/class=["']a-price-whole["']>([\d.,]+)<\/span>/i);
  if (priceMatch) {
    const parsed = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      result.price = parsed;
    }
  }

  // 4. Bullet Points / Features Extraction
  const featureBulletsMatch = html.match(/<div[^>]*id=["'](?:feature-bullets|featurebullets_feature_div)["'][^>]*>([\s\S]*?)<\/div>/i);
  if (featureBulletsMatch) {
    const itemMatches = featureBulletsMatch[1].matchAll(/<span[^>]*class=["']a-list-item["'][^>]*>([\s\S]*?)<\/span>/gi);
    for (const match of itemMatches) {
      const cleanBullet = stripHtml(match[1]);
      if (
        cleanBullet &&
        !cleanBullet.toLowerCase().includes('make sure this fits') &&
        !result.features.includes(cleanBullet)
      ) {
        result.features.push(cleanBullet);
      }
    }
  }

  // 5. Product Overview Specs (Table with Brand, Material, Color, etc.)
  const overviewMatch = html.match(/<div[^>]*id=["']productOverview_feature_div["'][^>]*>([\s\S]*?)<\/div>/i);
  if (overviewMatch) {
    const rowMatches = overviewMatch[1].matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*class=["'][^"']*a-span3[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<td[^>]*class=["'][^"']*a-span9[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/tr>/gi);
    for (const rm of rowMatches) {
      const key = stripHtml(rm[1]);
      const val = stripHtml(rm[2]);
      if (key && val) {
        result.specs[key] = val;
        if (key.toLowerCase() === 'brand' && !result.brand) {
          result.brand = val;
        }
      }
    }
  }

  // Technical Details / Tech Specs Table
  const techTableMatch = html.match(/<table[^>]*id=["'](?:productDetails_techSpec_section_1|tech-specs-table)["'][^>]*>([\s\S]*?)<\/table>/i);
  if (techTableMatch) {
    const rowMatches = techTableMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi);
    for (const rm of rowMatches) {
      const key = stripHtml(rm[1]);
      const val = stripHtml(rm[2]);
      if (key && val && !result.specs[key]) {
        result.specs[key] = val;
      }
    }
  }

  // 6. Product Description
  const descMatch = html.match(/<div[^>]*id=["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    const cleanDesc = stripHtml(descMatch[1]);
    if (cleanDesc && cleanDesc.length > 20) {
      result.description = cleanDesc;
    }
  }

  // 7. Image Extraction
  const imgMatch = html.match(/<img[^>]*id=["']landingImage["'][^>]*data-old-hires=["']([^"']+)["']/i)
    || html.match(/<img[^>]*id=["']landingImage["'][^>]*src=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (imgMatch && !imgMatch[1].includes('captcha')) {
    result.image = imgMatch[1];
  }

  return result;
}

/**
 * Extracts product details from plain copied text from an Amazon page.
 * @param {string} text
 * @returns {object}
 */
export function parseAmazonText(text) {
  if (!text || typeof text !== 'string') return {};

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result = {
    title: '',
    brand: '',
    price: null,
    features: [],
    specs: {},
    description: '',
    image: null,
    category: ''
  };

  if (lines.length === 0) return result;

  let currentSection = 'header';
  const descLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Price detection: "$29.99" or "Price: $29.99" or "$14.99 with 20% savings"
    if (!result.price) {
      const priceMatch = line.match(/(?:^|\s)\$([0-9]{1,4}\.[0-9]{2})(?:\s|$)/);
      if (priceMatch) {
        const parsed = parseFloat(priceMatch[1]);
        if (!isNaN(parsed) && parsed > 0 && parsed < 100000) {
          result.price = parsed;
        }
      }
    }

    // Brand detection: "Brand: KEMIMOTO" or "Visit the KEMIMOTO Store"
    if (!result.brand) {
      const brandMatch = line.match(/^(?:Brand|Manufacturer)\s*:\s*(.+)$/i)
        || line.match(/^Visit the\s+(.+)\s+Store$/i);
      if (brandMatch) {
        result.brand = brandMatch[1].trim();
      }
    }

    // Section Switching
    if (/^About this item/i.test(line)) {
      currentSection = 'features';
      continue;
    } else if (/^(?:Product Description|From the manufacturer|Item Description)/i.test(line)) {
      currentSection = 'description';
      continue;
    } else if (/^(?:Product Specifications|Technical Details|Product information)/i.test(line)) {
      currentSection = 'specs';
      continue;
    }

    // Key-Value Spec Detection: "Material: Polycarbonate" or "Color: Clear"
    const kvMatch = line.match(/^([A-Za-z0-9\s/_-]{2,30})\s*:\s*(.+)$/);
    if (kvMatch && !line.startsWith('http')) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      const lowerKey = key.toLowerCase();
      if (['brand', 'manufacturer'].includes(lowerKey) && !result.brand) {
        result.brand = val;
      }
      if (['material', 'color', 'size', 'vehicle service type', 'placement', 'item weight', 'fit type', 'auto part position', 'orientation'].includes(lowerKey) || currentSection === 'specs') {
        result.specs[key] = val;
      }
    }

    // Bullet Points (Features)
    if (currentSection === 'features' || line.startsWith('•') || line.startsWith('- ') || line.startsWith('* ')) {
      const cleanBullet = line.replace(/^[•\-*]\s*/, '').trim();
      if (
        cleanBullet &&
        cleanBullet.length > 5 &&
        !cleanBullet.toLowerCase().includes('make sure this fits') &&
        !cleanBullet.toLowerCase().includes('report an issue') &&
        !result.features.includes(cleanBullet)
      ) {
        result.features.push(cleanBullet);
      }
    } else if (currentSection === 'description') {
      if (!line.toLowerCase().includes('customer reviews') && !line.toLowerCase().includes('top reviews')) {
        descLines.push(line);
      }
    } else if (currentSection === 'header' && !result.title && i < 5) {
      // First substantial line is often the title if not a navigation line
      if (
        line.length > 15 &&
        !line.toLowerCase().startsWith('back to') &&
        !line.toLowerCase().startsWith('amazon') &&
        !line.toLowerCase().startsWith('deliver to') &&
        !line.toLowerCase().startsWith('skip to')
      ) {
        result.title = line.replace(/^Amazon\.com\s*:\s*/i, '').trim();
      }
    }
  }

  if (descLines.length > 0) {
    result.description = descLines.join('\n\n');
  }

  return result;
}

/**
 * Universal smart parser that detects whether the input is HTML or plain text,
 * and extracts all product details.
 * @param {string} input
 * @returns {object}
 */
export function parseAmazonProductContent(input) {
  if (!input || typeof input !== 'string') return {};
  const trimmed = input.trim();

  // Check if content contains HTML tags
  if (/<(?:div|span|h1|tr|td|table|p|img|a|section)\b/i.test(trimmed)) {
    const htmlResult = parseAmazonHtml(trimmed);
    // If HTML result extracted title or features, return it
    if (htmlResult.title || htmlResult.features.length > 0 || Object.keys(htmlResult.specs).length > 0) {
      return htmlResult;
    }
  }

  // Fallback to text parsing
  return parseAmazonText(trimmed);
}
