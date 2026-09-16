
/**
 * Convert Excel serial date or date string to YYYY-MM-DD string
 * @param {number|string} serial
 * @returns {string|null}
 */
export function formatExcelDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') {
    const trimmed = serial.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    // Handle MM/DD/YYYY or MM-DD-YYYY
    const usDateMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (usDateMatch) {
      const year = usDateMatch[3].length === 2 ? `20${usDateMatch[3]}` : usDateMatch[3];
      const month = usDateMatch[1].padStart(2, '0');
      const day = usDateMatch[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return trimmed;
  }
  if (typeof serial === 'number' && serial > 20000 && serial < 60000) {
    // Excel base date Dec 30 1899
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return dateInfo.toISOString().split('T')[0];
  }
  return null;
}

/**
 * Clean and parse numeric/currency values (handles $, commas, and negative parens)
 * @param {any} val
 * @param {number} defaultVal
 * @returns {number}
 */
export function parseCleanNumber(val, defaultVal = 0) {
  if (val == null || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  const str = String(val).trim();
  if (!str) return defaultVal;
  const isNegative = str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'));
  const cleaned = str.replace(/[^0-9.]/g, '');
  if (!cleaned) return defaultVal;
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : (isNegative ? -num : num);
}

export function cleanItemName(title) {
  if (!title || typeof title !== 'string') return '';
  let cleaned = title.trim();

  // 1. Strip trailing dollar prices, fee numbers, e.g. "$52.61 $8.94", "$10.50 $1.79", "$18.00 $3.06", "$52.61"
  cleaned = cleaned.replace(/(?:\s*\$?\d+(?:,\d{3})*(?:\.\d{2})?){1,4}\s*$/gi, '');

  // 2. Strip trailing orphaned prepositions/connectors left behind e.g. "Box of", "Jersey for", "-"
  cleaned = cleaned.replace(/\s+(?:of|for|at|with|and|[-–—:])\s*$/gi, '');

  // 3. Strip leading Item # or Lot # prefixes e.g. "Item #3931984", "Lot #1234", "3931984 - ", "#3931984"
  cleaned = cleaned.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  cleaned = cleaned.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  cleaned = cleaned.replace(/^\d{5,12}\s+(?=[A-Za-z])/g, '');

  // 4. Strip standalone non-year 5-12 digit numbers trailing at the end (unless 4-digit year like 1996, 2024)
  cleaned = cleaned.replace(/\s+\b(?!(?:19|20)\d{2})\d{5,12}\b\s*$/g, '');

  return cleaned.replace(/\s+/g, ' ').trim() || title.trim();
}

/**
 * Normalize string key for flexible header matching
 * @param {string} str
 * @returns {string}
 */
export function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/#/g, 'num')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Find the table header row index and normalized header map from raw 2D sheet data
 * @param {any[][]} rows
 * @param {string[]} targetKeys
 * @param {number} minMatches
 * @param {number} maxScanRows
 * @returns {{ headerIdx: number, headerMap: Map<string, number>, headers: string[] }}
 */
export function findTableHeaders(rows, targetKeys, minMatches = 1, maxScanRows = 25) {
  let bestIdx = -1;
  let bestScore = 0;
  let bestHeaders = [];

  for (let r = 0; r < Math.min(rows.length, maxScanRows); r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Check if row is a single long commentary/instruction block
    const nonBlankCells = row.filter(c => c != null && String(c).trim() !== '');
    if (nonBlankCells.length === 1 && String(nonBlankCells[0]).length > 60) continue;

    let score = 0;
    const normRow = row.map(cell => normalizeKey(cell));
    for (const cell of normRow) {
      if (!cell) continue;
      if (targetKeys.some(tk => cell === tk || cell.includes(tk))) {
        score++;
      }
    }

    if (score >= minMatches && score > bestScore) {
      bestScore = score;
      bestIdx = r;
      bestHeaders = row.map(c => String(c || '').trim());
    }
  }

  const headerMap = new Map();
  if (bestIdx >= 0) {
    bestHeaders.forEach((h, colIdx) => {
      const norm = normalizeKey(h);
      if (norm && !headerMap.has(norm)) {
        headerMap.set(norm, colIdx);
      }
    });
  }

  return { headerIdx: bestIdx, headerMap, headers: bestHeaders, score: bestScore };
}

/**
 * Helper to retrieve cell value by checking alias list
 * @param {any[]} row
 * @param {Map<string, number>} headerMap
 * @param {string[]} aliases
 * @returns {any}
 */
export function getRowValue(row, headerMap, aliases) {
  if (!row || !Array.isArray(row)) return undefined;
  for (const alias of aliases) {
    const norm = normalizeKey(alias);
    if (headerMap.has(norm)) {
      const idx = headerMap.get(norm);
      if (row[idx] !== undefined && row[idx] !== '') {
        return row[idx];
      }
    }
  }
  return undefined;
}

export function cleanAthleteName(athlete) {
  if (!athlete || typeof athlete !== 'string') return '';
  let cleaned = athlete.trim();

  // Strip leading Item #, Lot #, or standalone 4-12 digit numbers (e.g. "3931984 Raul Rosas Jr." -> "Raul Rosas Jr.")
  cleaned = cleaned.replace(/^(?:item\s*#?|lot\s*#?|#)\s*\d{4,12}(?:\s*[-–—:]\s*|\s+)?/gi, '');
  cleaned = cleaned.replace(/^\d{5,12}\s*[-–—:]\s*/g, '');
  cleaned = cleaned.replace(/^\d{5,12}\s+/g, '');

  return cleaned.trim() || athlete.trim();
}

/**
 * Strips Athlete/Signer Name and Authenticator badges from Item Title/Description
 * e.g. "Raul Rosas Jr. Signed Venum Trunks (PSA)" + Athlete "Raul Rosas Jr." + Auth "PSA" -> "Signed Venum Trunks"
 */
export function cleanItemDescription(itemName, athletePerson, authenticator) {
  if (!itemName || typeof itemName !== 'string') return '';
  let desc = cleanItemName(itemName);

  // 1. Remove athlete/person name from description if present
  if (athletePerson && athletePerson.trim()) {
    const cleanAthlete = cleanAthleteName(athletePerson);
    if (cleanAthlete) {
      const athleteRegex = new RegExp(cleanAthlete.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\.?\\s*', 'gi');
      desc = desc.replace(athleteRegex, '');
    }
  }

  // 2. Remove authenticator company names/badges e.g. (PSA), PSA, (Beckett), Beckett, JSA, (JSA), ACOA, COA, etc.
  if (authenticator && authenticator.trim()) {
    const cleanAuth = authenticator.replace(/#.*$/, '').trim();
    if (cleanAuth) {
      const authRegex = new RegExp('(?:\\(?\\b' + cleanAuth.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b\\)?|\\bCOA\\b)', 'gi');
      desc = desc.replace(authRegex, '');
    }
  }

  // Strip common generic authenticator/COA terms e.g. (PSA), (Beckett), (JSA), COA
  desc = desc.replace(/\b\((?:JSA|Beckett|BAS|BGS|PSA|ACOA|SGC|CGC|Fanatics|Upper Deck|UDA|Tristar|Steiner|Schwartz)\)/gi, '');
  desc = desc.replace(/\b(?:COA|LOA)\b/gi, '');

  // Strip leading/trailing hyphens, colons, or orphaned punctuation
  desc = desc.replace(/^[\s\-–—:]+/g, '');
  desc = desc.replace(/[\s\-–—:]+$/g, '');

  return desc.replace(/\s+/g, ' ').trim() || cleanItemName(itemName);
}

/**
 * Extract metadata (authenticator, category, sport_genre, athlete_person, cert_number) from item title.
 * @param {string} title
 * @returns {{ authenticator?: string, category?: string, sport_genre?: string, athlete_person?: string, cert_number?: string }}
 */
export function extractMetadataFromTitle(title) {
  const result = {};
  if (!title) return result;
  const cleanT = cleanItemName(title);
  const t = cleanT || String(title).trim();

  // 1. Authenticator extraction (e.g., (JSA), (Beckett), PSA, ACOA, SGC, etc.)
  const authMatch = t.match(/\b\((JSA|Beckett|BAS|BGS|PSA|ACOA|SGC|CGC|Fanatics|Upper Deck|UDA|Tristar|Steiner|Schwartz)\)|\b(JSA|Beckett|PSA|ACOA|SGC|CGC|Fanatics|Upper Deck|Tristar|Steiner)\b/i);
  if (authMatch) {
    result.authenticator = authMatch[1] || authMatch[2];
    if (/bas|bgs/i.test(result.authenticator)) result.authenticator = 'Beckett';
    if (/uda/i.test(result.authenticator)) result.authenticator = 'Upper Deck';
  }

  // 2. Category inference
  if (/\b(jersey|uniform)\b/i.test(t)) result.category = 'Jersey';
  else if (/\b(photo|8x10|16x20|picture|print|lithograph|litho)\b/i.test(t)) result.category = 'Photo';
  else if (/\b(card|rc|rookie|prizm|optic|hoops|topps|bowman|panini|fleer|slab|gem|graded)\b/i.test(t)) result.category = 'Card';
  else if (/\b(baseball|rawlings|official league)\b/i.test(t)) result.category = 'Baseball';
  else if (/\b(bat)\b/i.test(t)) result.category = 'Bat';
  else if (/\b(football|wilson football|duke)\b/i.test(t)) result.category = 'Football';
  else if (/\b(helmet|mini helmet|full size helmet)\b/i.test(t)) result.category = 'Helmet';
  else if (/\b(mask|jason voorhees mask)\b/i.test(t)) result.category = 'Mask';
  else if (/\b(glove|boxing glove)\b/i.test(t)) result.category = 'Glove';
  else if (/\b(poster)\b/i.test(t)) result.category = 'Poster';
  else if (/\b(puck)\b/i.test(t)) result.category = 'Puck';
  else if (/\b(drum stick|drumstick)\b/i.test(t)) result.category = 'Drum Stick';
  else if (/\b(funko|pop)\b/i.test(t)) result.category = 'Other';
  else result.category = 'Memorabilia';

  // 3. Sport / Genre inference
  if (/\b(basketball|nba|hoops|spalding|lakers|bulls|celtics|warriors|kemp|jordan|lebron|bryant|curry)\b/i.test(t)) result.sport_genre = 'Basketball';
  else if (/\b(baseball|mlb|yankees|dodgers|red sox|trout|ohtani|judge|jeter)\b/i.test(t)) result.sport_genre = 'Baseball';
  else if (/\b(football|nfl|chiefs|cowboys|49ers|packers|steelers|mahomes|brady|montana)\b/i.test(t)) result.sport_genre = 'Football';
  else if (/\b(hockey|nhl|gretzky|mcdavid|penguins|bruins)\b/i.test(t)) result.sport_genre = 'Hockey';
  else if (/\b(boxing|ufc|mma|ali|tyson|mcgregor)\b/i.test(t)) result.sport_genre = 'Combat Sports';
  else if (/\b(movie|film|lion king|friday the 13th|star wars|marvel|simpsons|actor|voice actor|director)\b/i.test(t)) result.sport_genre = 'Movie';
  else if (/\b(music|band|rock|guitar|singer)\b/i.test(t)) result.sport_genre = 'Music';

  // 4. Athlete / Person extraction (e.g. "Shawn Kemp Signed ...", "Mark Henn Signed ...")
  const personMatch = t.match(/^([^—–\(\)"]+?)\s+(?:Signed|Autographed|Auto'd|Inscribed|Signed & Inscribed)\b/i);
  if (personMatch) {
    const rawPerson = cleanAthleteName(personMatch[1]);
    if (rawPerson.length > 1 && rawPerson.length < 50 && !/^(official|authentic|vintage|rare|lot of)/i.test(rawPerson)) {
      result.athlete_person = rawPerson;
    }
  }

  // 5. Cert # extraction (e.g. #WA123456, Cert # 123456, Cert: 123456)
  const certMatch = t.match(/(?:cert(?:ificate)?\s*(?:#|:)?|coa\s*(?:#|:)?|hologram\s*(?:#|:)?|(?:psa|jsa|beckett|bas|sgc|bgs)\s*#)\s*([A-Za-z0-9]{4,15})\b/i) ||
                    t.match(/\b#(?=[0-9]*[A-Za-z])([A-Za-z0-9]{4,15})\b/i);
  if (certMatch) {
    result.cert_number = certMatch[1];
  }

  return result;
}

// Column Alias Dictionaries
const ITEM_NAME_ALIASES = [
  'title', 'itemname', 'itemtitle', 'lottitle', 'description', 'itemdescription',
  'lotdescription', 'lotname', 'product', 'memorabilia', 'itemdetails', 'auctionitem', 'name'
];

const UNIT_PRICE_ALIASES = [
  'finalprice', 'winningbid', 'hammerprice', 'unitprice', 'price',
  'bidamount', 'amount', 'soldprice', 'cost', 'totalcost', 'purchaseprice',
  'itembasetotal', 'winningprice', 'itemprice', 'wonfor'
];

const INVOICE_REF_ALIASES = [
  'invoiceid', 'invoiceref', 'invoice', 'invoicenum', 'invoicenumber', 'invoiceno',
  'orderid', 'ordernum', 'orderno', 'order', 'batch', 'batchid', 'lotnum', 'lot'
];

const ITEM_ID_ALIASES = ['itemnum', 'itemnumber', 'itemno', 'itemid', 'itemcode'];
const LOT_NUM_ALIASES = ['lotnum', 'lotnumber', 'lotno', 'lotid'];

const CATEGORY_ALIASES = ['category', 'itemcategory', 'type', 'itemtype', 'cat'];
const SPORT_ALIASES = ['sportgenre', 'sport', 'genre', 'league'];
const ATHLETE_ALIASES = ['athleteperson', 'athlete', 'person', 'player', 'signer', 'subject', 'signedby'];
const AUTH_ALIASES = ['authenticator', 'auth', 'authentication', 'coa', 'gradingcompany', 'certauth'];
const CERT_ALIASES = ['certnum', 'certnumber', 'certno', 'cert', 'certificate', 'coanumber', 'psacert'];
const DATE_ACQUIRED_ALIASES = ['dateacquired', 'date', 'purchasedate', 'invoicedate', 'acquired', 'boughtdate'];
const DATE_LISTED_ALIASES = ['datelisted', 'listeddate', 'datelist'];
const DATE_SOLD_ALIASES = ['datesold', 'solddate'];
const STATUS_ALIASES = ['status', 'itemstatus', 'listingstatus', 'state'];
const PLATFORM_ALIASES = ['platform', 'site', 'marketplace', 'channel'];
const NOTES_ALIASES = ['notes', 'note', 'comments', 'comment', 'descriptionnotes'];

/**
 * Parse an Excel or CSV file buffer and extract Auction entities
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }>}
 */
export async function parseAuctionWorkbook(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames;

  let rawInventoryRows = [];
  let rawSalesRows = [];
  let rawCompsRows = [];

  // Look for known sheet names or search sheets
  const invSheetName = sheetNames.find(s => /inventory/i.test(s));
  const salesSheetName = sheetNames.find(s => /sale/i.test(s));
  const compsSheetName = sheetNames.find(s => /pricing|comp/i.test(s));

  if (invSheetName) {
    rawInventoryRows = XLSX.utils.sheet_to_json(wb.Sheets[invSheetName], { header: 1, defval: '' });
  } else {
    // Scan all sheets to find which sheet has inventory headers
    let bestSheetName = sheetNames[0];
    let bestScore = -1;

    for (const s of sheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '' });
      const { score } = findTableHeaders(rows, [...ITEM_NAME_ALIASES, ...UNIT_PRICE_ALIASES], 1);
      if (score > bestScore) {
        bestScore = score;
        bestSheetName = s;
      }
    }
    if (bestSheetName) {
      rawInventoryRows = XLSX.utils.sheet_to_json(wb.Sheets[bestSheetName], { header: 1, defval: '' });
    }
  }

  if (salesSheetName) {
    rawSalesRows = XLSX.utils.sheet_to_json(wb.Sheets[salesSheetName], { header: 1, defval: '' });
  }

  if (compsSheetName) {
    rawCompsRows = XLSX.utils.sheet_to_json(wb.Sheets[compsSheetName], { header: 1, defval: '' });
  }

  // Parse Invoices & Items from rawInventoryRows
  const invoiceMap = new Map();
  const items = [];

  const { headerIdx: invHeaderIdx, headerMap: invHeaderMap } = findTableHeaders(
    rawInventoryRows,
    [...ITEM_NAME_ALIASES, ...UNIT_PRICE_ALIASES, ...INVOICE_REF_ALIASES],
    1
  );

  if (invHeaderIdx >= 0) {
    for (let r = invHeaderIdx + 1; r < rawInventoryRows.length; r++) {
      const row = rawInventoryRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rawItemName = getRowValue(row, invHeaderMap, ITEM_NAME_ALIASES);
      const itemName = String(rawItemName || '').trim();
      if (!itemName || normalizeKey(itemName) === 'itemname' || normalizeKey(itemName) === 'title') continue;

      const inferred = extractMetadataFromTitle(itemName);

      const invoiceRef = String(getRowValue(row, invHeaderMap, INVOICE_REF_ALIASES) || 'Imported').trim();
      const rawPrice = getRowValue(row, invHeaderMap, UNIT_PRICE_ALIASES);
      const unitPrice = parseCleanNumber(rawPrice, 0);

      const rawTrueCost = getRowValue(row, invHeaderMap, ['truetotalcost', 'true_total_cost', 'totalcost', 'landedcost']);
      const trueCost = parseCleanNumber(rawTrueCost, unitPrice);

      const invBaseTotal = parseCleanNumber(getRowValue(row, invHeaderMap, ['invoicebasetotal', 'basetotal']), 0);
      const invDiscount = parseCleanNumber(getRowValue(row, invHeaderMap, ['invoicetotaldiscount', 'discount', 'discounts']), 0);
      const invShipping = parseCleanNumber(getRowValue(row, invHeaderMap, ['invoicetotalshipping', 'shipping', 'shippinghandling']), 0);
      const invTax = parseCleanNumber(getRowValue(row, invHeaderMap, ['invoicetotaltax', 'tax', 'salestax']), 0);

      const dateAcquired = formatExcelDate(getRowValue(row, invHeaderMap, DATE_ACQUIRED_ALIASES));
      const dateListed = formatExcelDate(getRowValue(row, invHeaderMap, DATE_LISTED_ALIASES));
      const dateSold = formatExcelDate(getRowValue(row, invHeaderMap, DATE_SOLD_ALIASES));

      // Track invoice aggregation
      if (!invoiceMap.has(invoiceRef)) {
        invoiceMap.set(invoiceRef, {
          invoice_ref: invoiceRef,
          description: `Batch ${invoiceRef}`,
          base_total: invBaseTotal > 0 ? invBaseTotal : unitPrice,
          discount: invDiscount,
          shipping: invShipping,
          tax: invTax,
          date_acquired: dateAcquired,
          item_count: 1
        });
      } else {
        const cur = invoiceMap.get(invoiceRef);
        cur.item_count += 1;
        if (invBaseTotal > cur.base_total) cur.base_total = invBaseTotal;
        else if (invBaseTotal === 0) cur.base_total += unitPrice;
        if (invDiscount > cur.discount) cur.discount = invDiscount;
        if (invShipping > cur.shipping) cur.shipping = invShipping;
        if (invTax > cur.tax) cur.tax = invTax;
        if (!cur.date_acquired && dateAcquired) cur.date_acquired = dateAcquired;
      }

      const rawCategory = getRowValue(row, invHeaderMap, CATEGORY_ALIASES);
      const rawSport = getRowValue(row, invHeaderMap, SPORT_ALIASES);
      const rawAthlete = getRowValue(row, invHeaderMap, ATHLETE_ALIASES);
      const rawAuth = getRowValue(row, invHeaderMap, AUTH_ALIASES);
      const rawCert = getRowValue(row, invHeaderMap, CERT_ALIASES);
      const rawStatus = getRowValue(row, invHeaderMap, STATUS_ALIASES);
      const rawPlatform = getRowValue(row, invHeaderMap, PLATFORM_ALIASES);
      const rawNotes = getRowValue(row, invHeaderMap, NOTES_ALIASES);

      const item = {
        id: `item-${crypto.randomUUID()}`,
        invoice_ref: invoiceRef,
        item_name: cleanItemName(itemName),
        category: String(rawCategory || inferred.category || 'Memorabilia').trim(),
        sport_genre: String(rawSport || inferred.sport_genre || '').trim(),
        athlete_person: String(rawAthlete || inferred.athlete_person || '').trim(),
        authenticator: String(rawAuth || inferred.authenticator || '').trim(),
        cert_number: String(rawCert || inferred.cert_number || '').trim(),
        unit_price: unitPrice,
        item_base_total: parseCleanNumber(getRowValue(row, invHeaderMap, ['itembasetotal']), unitPrice) || unitPrice,
        proration_weight: parseCleanNumber(getRowValue(row, invHeaderMap, ['prorationweight']), 0),
        prorated_discount: parseCleanNumber(getRowValue(row, invHeaderMap, ['prorateddiscount']), 0),
        prorated_shipping: parseCleanNumber(getRowValue(row, invHeaderMap, ['proratedshipping']), 0),
        prorated_tax: parseCleanNumber(getRowValue(row, invHeaderMap, ['proratedtax']), 0),
        true_total_cost: trueCost,
        status: String(rawStatus || 'Available').trim(),
        platform: String(rawPlatform || 'eBay').trim(),
        platform_fee_pct: parseCleanNumber(getRowValue(row, invHeaderMap, ['platformfeepct', 'platformfee']), 0.136),
        platform_flat_fee: parseCleanNumber(getRowValue(row, invHeaderMap, ['platformflatfee']), 0.40),
        est_shipping_cost: parseCleanNumber(getRowValue(row, invHeaderMap, ['estshippingcost', 'estshipping']), 6.50),
        boost_pct: parseCleanNumber(getRowValue(row, invHeaderMap, ['boostpct', 'boost']), 0),
        min_sell_price: parseCleanNumber(getRowValue(row, invHeaderMap, ['minsellprice']), 0),
        suggested_list_price: parseCleanNumber(getRowValue(row, invHeaderMap, ['suggestedlistprice']), 0),
        current_list_price: parseCleanNumber(getRowValue(row, invHeaderMap, ['currentlistprice']), null),
        actual_sell_price: parseCleanNumber(getRowValue(row, invHeaderMap, ['actualsellprice']), null),
        target_margin_pct: Math.round(parseCleanNumber(getRowValue(row, invHeaderMap, ['marginpcttarget', 'targetmargin']), 0.15) * 10000) / 10000,
        date_acquired: dateAcquired,
        date_listed: dateListed,
        date_sold: dateSold,
        days_on_market: parseInt(getRowValue(row, invHeaderMap, ['daysonmarket']), 10) || null,
        notes: String(rawNotes || '').trim(),
        best_listing_window: String(getRowValue(row, invHeaderMap, ['bestlistingwindow']) || '').trim()
      };

      items.push(item);
    }
  }

  // Proration and pricing floor post-pass
  items.forEach(item => {
    const inv = invoiceMap.get(item.invoice_ref);
    if (inv && inv.base_total > 0) {
      if (item.proration_weight === 0) {
        item.proration_weight = item.unit_price / inv.base_total;
      }
      if (item.prorated_discount === 0 && inv.discount > 0) {
        item.prorated_discount = item.proration_weight * inv.discount;
      }
      if (item.prorated_shipping === 0 && inv.shipping > 0) {
        item.prorated_shipping = item.proration_weight * inv.shipping;
      }
      if (item.prorated_tax === 0 && inv.tax > 0) {
        item.prorated_tax = item.proration_weight * inv.tax;
      }
      if (item.true_total_cost === item.unit_price && (inv.discount > 0 || inv.shipping > 0 || inv.tax > 0)) {
        item.true_total_cost = item.unit_price - item.prorated_discount + item.prorated_shipping + item.prorated_tax;
      }
    }
    // Compute pricing floors if not present
    if (item.min_sell_price === 0 && item.true_total_cost > 0) {
      const divisor = 1 - item.platform_fee_pct - item.boost_pct;
      item.min_sell_price = divisor > 0
        ? Math.round(((item.true_total_cost + item.est_shipping_cost + item.platform_flat_fee) / divisor) * 100) / 100
        : 0;
      item.suggested_list_price = Math.round((item.min_sell_price * (1 + item.target_margin_pct)) * 100) / 100;
    }
  });

  const invoices = Array.from(invoiceMap.values());

  // Parse Sales Log rows
  const sales = [];
  if (rawSalesRows.length > 0) {
    const { headerIdx: salesHeaderIdx, headerMap: salesHeaderMap } = findTableHeaders(
      rawSalesRows,
      ['saleid', 'saledate', 'itemname', 'grosssaleprice', 'grosssale', 'platformsold'],
      2
    );

    if (salesHeaderIdx >= 0) {
      for (let r = salesHeaderIdx + 1; r < rawSalesRows.length; r++) {
        const row = rawSalesRows[r];
        if (!row || !Array.isArray(row)) continue;

        const itemName = String(getRowValue(row, salesHeaderMap, ['itemname', 'item', 'title']) || '').trim();
        const gross = parseCleanNumber(getRowValue(row, salesHeaderMap, ['grosssaleprice', 'grosssale', 'saleprice', 'gross']), 0);
        if (!itemName || gross <= 0) continue;

        sales.push({
          id: `sale-${crypto.randomUUID()}`,
          item_name: itemName,
          sale_date: formatExcelDate(getRowValue(row, salesHeaderMap, ['saledate', 'date'])) || new Date().toISOString().split('T')[0],
          platform: String(getRowValue(row, salesHeaderMap, ['platformsold', 'platform']) || 'eBay').trim(),
          buyer_handle: String(getRowValue(row, salesHeaderMap, ['buyerhandle', 'buyer', 'buyerhandle']) || '').trim(),
          gross_sale_price: gross,
          buyer_shipping_paid: parseCleanNumber(getRowValue(row, salesHeaderMap, ['buyershippingpaid', 'buyershipping']), 0),
          actual_shipping_cost: parseCleanNumber(getRowValue(row, salesHeaderMap, ['actualshippingcost', 'actualshipping']), 0),
          platform_fee_pct: parseCleanNumber(getRowValue(row, salesHeaderMap, ['platformfeepct', 'platformfee']), 0.136),
          platform_flat_fee: parseCleanNumber(getRowValue(row, salesHeaderMap, ['platformflatfee']), 0.40),
          days_to_sell: parseInt(getRowValue(row, salesHeaderMap, ['daystosell']), 10) || null
        });
      }
    }
  }

  // Parse Pricing Intelligence / Comps rows
  const comps = [];
  if (rawCompsRows.length > 0) {
    const { headerIdx: compsHeaderIdx, headerMap: compsHeaderMap } = findTableHeaders(
      rawCompsRows,
      ['manualcomp1', 'manualcomp2', 'manualcomp3', 'manualavg', 'liveavg', 'recommendedlistprice'],
      2
    );

    if (compsHeaderIdx >= 0) {
      for (let r = compsHeaderIdx + 1; r < rawCompsRows.length; r++) {
        const row = rawCompsRows[r];
        if (!row || !Array.isArray(row)) continue;

        const itemName = String(getRowValue(row, compsHeaderMap, ['itemname', 'item', 'title']) || '').trim();
        if (!itemName || normalizeKey(itemName) === 'itemname') continue;

        const c1Raw = getRowValue(row, compsHeaderMap, ['manualcomp1', 'comp1', 'manualcomp#1']);
        const c2Raw = getRowValue(row, compsHeaderMap, ['manualcomp2', 'comp2', 'manualcomp#2']);
        const c3Raw = getRowValue(row, compsHeaderMap, ['manualcomp3', 'comp3', 'manualcomp#3']);
        const recRaw = getRowValue(row, compsHeaderMap, ['recommendedlistprice', 'recommendedlist', 'recprice']);

        const c1 = c1Raw !== undefined && c1Raw !== '' ? parseCleanNumber(c1Raw, null) : null;
        const c2 = c2Raw !== undefined && c2Raw !== '' ? parseCleanNumber(c2Raw, null) : null;
        const c3 = c3Raw !== undefined && c3Raw !== '' ? parseCleanNumber(c3Raw, null) : null;

        if (c1 || c2 || c3) {
          comps.push({
            item_name: itemName,
            comp_1: c1,
            comp_2: c2,
            comp_3: c3,
            recommended_list_price: recRaw !== undefined && recRaw !== '' ? parseCleanNumber(recRaw, null) : null
          });
        }
      }
    }
  }

  return {
    invoices,
    items,
    sales,
    comps,
    summary: {
      invoiceCount: invoices.length,
      itemCount: items.length,
      salesCount: sales.length,
      compsCount: comps.length,
      totalCapital: items.reduce((sum, it) => sum + (it.true_total_cost || it.unit_price), 0)
    }
  };
}

