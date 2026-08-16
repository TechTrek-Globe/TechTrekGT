import { parseCleanNumber, formatExcelDate, extractMetadataFromTitle, cleanItemName } from './spreadsheetParser.js';
import { computePricingFloors } from './formulaPreview.js';

/**
 * Extract structured text lines from a PDF binary ArrayBuffer using PDF.js
 * Groups tokens by Y-coordinate to reconstruct exact lines and table layouts.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export async function extractTextFromPdfBuffer(buffer) {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  ]);

  // Configure PDF.js worker in browser environments
  if (typeof window !== 'undefined' && pdfWorkerUrl) {
    try {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      }
    } catch {
      // Ignore worker assignment if already set
    }
  }
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false
  });

  const pdf = await loadingTask.promise;
  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by vertical position (Y coordinate)
    const linesByY = new Map();
    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;
      // Round Y to 3pt grid to group text on the same line
      const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
      if (!linesByY.has(y)) {
        linesByY.set(y, []);
      }
      linesByY.get(y).push({
        x: item.transform?.[4] || 0,
        text: item.str
      });
    }

    // Sort lines from top to bottom (descending Y)
    const sortedY = Array.from(linesByY.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const itemsOnLine = linesByY.get(y);
      // Sort tokens from left to right (ascending X)
      itemsOnLine.sort((a, b) => a.x - b.x);
      const lineText = itemsOnLine.map(it => it.text.trim()).filter(Boolean).join(' ');
      if (lineText) {
        allLines.push(lineText);
      }
    }
  }

  return allLines.join('\n');
}

/**
 * Robust Pristine Auction PDF Text Parser.
 * Extracts:
 * - Invoice Reference & Date
 * - "AUCTIONS WON" Table: Lot #, Item #, Title, Final Price
 * - "ADJUSTMENTS" Table: Buyer's Premium, Shipping, Sales Tax, Discounts
 *
 * Computes proration weights, landed costs, min sell prices, and suggested list prices.
 *
 * @param {string} rawText - Extracted text content from the PDF invoice
 * @param {string} [fallbackDate] - Optional fallback acquired date
 * @returns {{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }}
 */
export function parsePristineAuctionInvoiceText(rawText, fallbackDate = null) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('No readable text found in PDF document.');
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // 1. Extract Header Metadata (Invoice #, Date, Order #)
  let invoiceRef = '';
  let dateAcquired = fallbackDate || null;

  for (const line of lines) {
    // Invoice # matching: "Invoice #: 4809173", "Invoice # 4809173", "Invoice: 4809173", "Invoice 4809173"
    const invMatch = line.match(/(?:invoice\s*(?:#|number|ref|id|no)?[:\s]+)([A-Za-z0-9-]+)/i);
    if (invMatch && !invoiceRef) {
      invoiceRef = invMatch[1].trim();
    }

    // Date matching: "Invoice Date: 06/24/2026", "Date: 2026-06-24", "June 24, 2026"
    const dateMatch = line.match(/(?:invoice\s*date|date\s*acquired|date)[:\s]+([A-Za-z0-9/,\s-]+)/i);
    if (dateMatch && !dateAcquired) {
      const parsedDate = formatExcelDate(dateMatch[1].trim());
      if (parsedDate) dateAcquired = parsedDate;
    }
  }

  // If invoiceRef was not found in specific regex, look for standalone 6-8 digit invoice numbers
  if (!invoiceRef) {
    for (const line of lines.slice(0, 20)) {
      const standaloneMatch = line.match(/\b(48\d{5}|49\d{5}|50\d{5}|\d{7})\b/);
      if (standaloneMatch) {
        invoiceRef = standaloneMatch[1];
        break;
      }
    }
  }

  // Date fallback scan
  if (!dateAcquired) {
    for (const line of lines.slice(0, 20)) {
      const dateScanMatch = line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
      if (dateScanMatch) {
        dateAcquired = formatExcelDate(dateScanMatch[1]);
        break;
      }
    }
  }

  if (!invoiceRef) {
    invoiceRef = dateAcquired ? `Pristine-${dateAcquired}` : `Pristine-${new Date().toISOString().slice(0, 10)}`;
  }

  if (!dateAcquired) {
    dateAcquired = new Date().toISOString().split('T')[0];
  }

  // 2. State-machine & line scanning to parse "AUCTIONS WON" and "ADJUSTMENTS"
  const rawWonItems = [];
  const adjustments = {
    discount: 0,
    shipping: 0,
    tax: 0,
    buyersPremium: 0,
    total: 0
  };

  let inAuctionsWonSection = false;
  let inAdjustmentsSection = false;

  const SUMMARY_KEYWORDS = /subtotal|total\s*due|amount\s*paid|grand\s*total|invoice\s*total|balance/i;
  const ADJUSTMENT_KEYWORDS = /shipping|freight|handling|s&h|sales\s*tax|tax|discount|promo|credit|coupon|buyer'?s?\s*premium|bp/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Section transitions
    if (/auctions\s*won|won\s*items|items\s*won|items\s*purchased|winning\s*bids/i.test(line)) {
      inAuctionsWonSection = true;
      inAdjustmentsSection = false;
      continue;
    }

    if (/adjustments|invoice\s*breakdown|charges\s*&\s*credits|payment\s*summary|order\s*summary/i.test(line)) {
      inAdjustmentsSection = true;
      inAuctionsWonSection = false;
      continue;
    }

    if (SUMMARY_KEYWORDS.test(line) && !inAuctionsWonSection) {
      inAdjustmentsSection = true;
    }

    // --- AUCTIONS WON PARSING ---
    if (inAuctionsWonSection) {
      // Check if we hit the adjustments or totals section
      if (ADJUSTMENT_KEYWORDS.test(line) && /\$?[0-9,]+\.\d{2}/.test(line)) {
        inAuctionsWonSection = false;
        inAdjustmentsSection = true;
      } else if (SUMMARY_KEYWORDS.test(line) && /\$?[0-9,]+\.\d{2}/.test(line)) {
        inAuctionsWonSection = false;
        inAdjustmentsSection = true;
      }
    }

    if (inAuctionsWonSection) {
      // Skip header labels row
      if ((/lot\s*#|item\s*#|final\s*price|winning\s*bid/i.test(line)) && (/title|description/i.test(line))) {
        continue;
      }

      // Format 1: [Lot #] [Item #] [Title] [Final Price] e.g. "4809173-1 8192031 Shawn Kemp Signed Card $17.01"
      const fullMatch = line.match(/^([A-Za-z0-9-]+)\s+(\d{4,10})\s+(.+?)\s+\$?([0-9,]+\.\d{2})$/);
      if (fullMatch) {
        rawWonItems.push({
          lotNum: fullMatch[1].trim(),
          itemNum: fullMatch[2].trim(),
          title: fullMatch[3].trim(),
          finalPrice: parseCleanNumber(fullMatch[4], 0)
        });
        continue;
      }

      // Format 2: [Item # or Lot #] [Title] [Final Price] e.g. "8192031 Shawn Kemp Signed Card $17.01"
      const idTitleMatch = line.match(/^([A-Za-z0-9-]+)\s+(.+?)\s+\$?([0-9,]+\.\d{2})$/);
      if (idTitleMatch && !SUMMARY_KEYWORDS.test(line) && !ADJUSTMENT_KEYWORDS.test(line)) {
        const firstToken = idTitleMatch[1].trim();
        const titleText = idTitleMatch[2].trim();
        const price = parseCleanNumber(idTitleMatch[3], 0);

        if (titleText.length >= 3 && price > 0) {
          rawWonItems.push({
            lotNum: /^\d+-\d+$/.test(firstToken) ? firstToken : '',
            itemNum: /^\d{5,10}$/.test(firstToken) ? firstToken : '',
            title: titleText,
            finalPrice: price
          });
          continue;
        }
      }

      // Format 3: Title ending with price
      const priceEndMatch = line.match(/^(.+?)\s+\$?([0-9,]+\.\d{2})$/);
      if (priceEndMatch && !SUMMARY_KEYWORDS.test(line) && !ADJUSTMENT_KEYWORDS.test(line)) {
        const titleText = priceEndMatch[1].trim();
        const price = parseCleanNumber(priceEndMatch[2], 0);
        if (titleText.length >= 5 && price > 0) {
          rawWonItems.push({
            lotNum: '',
            itemNum: '',
            title: titleText,
            finalPrice: price
          });
        }
      }
    }

    // --- ADJUSTMENTS & SUMMARY PARSING ---
    if (inAdjustmentsSection || ADJUSTMENT_KEYWORDS.test(line) || SUMMARY_KEYWORDS.test(line)) {
      const amountMatch = line.match(/\(?\$?([0-9,]+\.\d{2})\)?/);
      if (amountMatch) {
        const val = parseCleanNumber(amountMatch[0], 0);
        if (/shipping|freight|delivery|handling|s&h/i.test(lower)) {
          adjustments.shipping = Math.abs(val);
        } else if (/sales\s*tax|tax/i.test(lower) && !/tax\s*id|exempt/i.test(lower)) {
          adjustments.tax = Math.abs(val);
        } else if (/discount|promo|credit|coupon|voucher|rebate/i.test(lower)) {
          adjustments.discount = Math.abs(val);
        } else if (/buyer'?s?\s*premium|bp/i.test(lower)) {
          adjustments.buyersPremium = Math.abs(val);
        } else if (/total|amount\s*paid|grand\s*total/i.test(lower)) {
          adjustments.total = Math.abs(val);
        }
      }
    }
  }

  // Fallback scan across all lines if no section header was encountered
  if (rawWonItems.length === 0) {
    for (const line of lines) {
      if (SUMMARY_KEYWORDS.test(line) || ADJUSTMENT_KEYWORDS.test(line)) continue;
      if (/invoice|page\s*\d|customer|billing|shipping\s*to|date|thank\s*you/i.test(line)) continue;

      const fullMatch = line.match(/^([A-Za-z0-9-]+)\s+(\d{4,10})\s+(.+?)\s+\$?([0-9,]+\.\d{2})$/);
      if (fullMatch) {
        rawWonItems.push({
          lotNum: fullMatch[1].trim(),
          itemNum: fullMatch[2].trim(),
          title: fullMatch[3].trim(),
          finalPrice: parseCleanNumber(fullMatch[4], 0)
        });
        continue;
      }

      const idTitleMatch = line.match(/^([A-Za-z0-9-]+)\s+([A-Za-z].+?)\s+\$?([0-9,]+\.\d{2})$/);
      if (idTitleMatch) {
        const firstToken = idTitleMatch[1].trim();
        const titleText = idTitleMatch[2].trim();
        const price = parseCleanNumber(idTitleMatch[3], 0);
        if (titleText.length >= 4 && price > 0) {
          rawWonItems.push({
            lotNum: /^\d+-\d+$/.test(firstToken) ? firstToken : '',
            itemNum: /^\d{5,10}$/.test(firstToken) ? firstToken : '',
            title: titleText,
            finalPrice: price
          });
        }
      }
    }
  }

  if (rawWonItems.length === 0) {
    throw new Error('No items could be extracted from "AUCTIONS WON" section in PDF text.');
  }

  // 3. Build Invoices & Items Structure with full proration
  const baseTotal = rawWonItems.reduce((sum, it) => sum + it.finalPrice, 0);

  const invoice = {
    invoice_ref: invoiceRef,
    description: `Pristine Auction - Invoice #${invoiceRef}`,
    base_total: baseTotal,
    discount: adjustments.discount,
    shipping: adjustments.shipping,
    tax: adjustments.tax,
    date_acquired: dateAcquired,
    item_count: rawWonItems.length
  };

  const items = rawWonItems.map((won) => {
    const inferred = extractMetadataFromTitle(won.title);
    const unitPrice = won.finalPrice;

    // Proration weights
    const weight = baseTotal > 0 ? unitPrice / baseTotal : 0;
    const proratedDiscount = weight * invoice.discount;
    const proratedShipping = weight * invoice.shipping;
    const proratedTax = weight * invoice.tax;
    const trueTotalCost = unitPrice - proratedDiscount + proratedShipping + proratedTax;

    const defaultPlatform = { fee_pct: 0.136, flat_fee: 0.40, est_shipping: 6.50 };
    const floors = computePricingFloors({
      true_total_cost: trueTotalCost,
      est_shipping_cost: defaultPlatform.est_shipping,
      platform_fee_pct: defaultPlatform.fee_pct,
      platform_flat_fee: defaultPlatform.flat_fee,
      boost_pct: 0,
      target_margin_pct: 0.30
    });

    const notesParts = [];
    if (won.lotNum) notesParts.push(`Lot #${won.lotNum}`);

    return {
      id: `item-${crypto.randomUUID()}`,
      invoice_ref: invoiceRef,
      item_name: cleanItemName(won.title),
      category: inferred.category || 'Memorabilia',
      sport_genre: inferred.sport_genre || '',
      athlete_person: inferred.athlete_person || '',
      authenticator: inferred.authenticator || '',
      cert_number: inferred.cert_number || '',
      unit_price: unitPrice,
      item_base_total: unitPrice,
      proration_weight: weight,
      prorated_discount: proratedDiscount,
      prorated_shipping: proratedShipping,
      prorated_tax: proratedTax,
      true_total_cost: trueTotalCost,
      status: 'Available',
      platform: 'eBay',
      platform_fee_pct: defaultPlatform.fee_pct,
      platform_flat_fee: defaultPlatform.flat_fee,
      est_shipping_cost: defaultPlatform.est_shipping,
      boost_pct: 0,
      min_sell_price: floors.min_sell_price,
      suggested_list_price: floors.suggested_list_price,
      current_list_price: null,
      actual_sell_price: null,
      target_margin_pct: 0.30,
      date_acquired: dateAcquired,
      date_listed: null,
      date_sold: null,
      days_on_market: null,
      notes: notesParts.join(' · '),
      best_listing_window: 'Year-Round'
    };
  });

  return {
    invoices: [invoice],
    items,
    sales: [],
    comps: [],
    summary: {
      invoiceCount: 1,
      itemCount: items.length,
      salesCount: 0,
      compsCount: 0,
      totalCapital: items.reduce((sum, it) => sum + it.true_total_cost, 0)
    }
  };
}

/**
 * Parses raw ArrayBuffer of a PDF in the browser or Worker environment.
 * Extracts text stream and passes through the Pristine Auction Parser.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }>}
 */
export async function parsePristineAuctionPdf(buffer) {
  const extractedText = await extractTextFromPdfBuffer(buffer);
  return parsePristineAuctionInvoiceText(extractedText);
}

