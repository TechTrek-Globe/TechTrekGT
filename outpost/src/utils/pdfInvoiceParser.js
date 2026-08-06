import { parseCleanNumber, formatExcelDate, extractMetadataFromTitle } from './spreadsheetParser.js';
import { computePricingFloors } from './formulaPreview.js';

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
 * @returns {{ invoice: any, items: any[], summary: any }}
 */
export function parsePristineAuctionInvoiceText(rawText, fallbackDate = null) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('No readable text provided for PDF parsing.');
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // 1. Extract Header Metadata (Invoice #, Date, Order #)
  let invoiceRef = '';
  let dateAcquired = fallbackDate || null;

  for (const line of lines) {
    // Invoice # matching: "Invoice #: 4809173", "Invoice # 4809173", "Invoice: 4809173"
    const invMatch = line.match(/(?:invoice\s*(?:#|number|ref|id)?[:\s]+)([A-Za-z0-9-]+)/i);
    if (invMatch && !invoiceRef) {
      invoiceRef = invMatch[1].trim();
    }

    // Date matching: "Invoice Date: 06/24/2026", "Date: 2026-06-24", "June 24, 2026"
    const dateMatch = line.match(/(?:invoice\s*date|date\s*acquired|date)[:\s]+([A-Za-z0-9/,\s-]+)/i);
    if (dateMatch && !dateAcquired) {
      dateAcquired = formatExcelDate(dateMatch[1].trim());
    }
  }

  // If invoiceRef was not found in specific regex, look for standalone 7-digit invoice numbers
  if (!invoiceRef) {
    for (const line of lines.slice(0, 15)) {
      const standaloneMatch = line.match(/\b(48\d{5}|49\d{5}|50\d{5}|\d{7})\b/);
      if (standaloneMatch) {
        invoiceRef = standaloneMatch[1];
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

  // 2. State-machine to parse "AUCTIONS WON" and "ADJUSTMENTS"
  const rawWonItems = [];
  let adjustments = {
    discount: 0,
    shipping: 0,
    tax: 0,
    buyersPremium: 0,
    total: 0
  };

  let section = 'HEADER'; // 'HEADER' | 'AUCTIONS_WON' | 'ADJUSTMENTS' | 'SUMMARY'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section transition detection
    if (/auctions\s*won/i.test(line)) {
      section = 'AUCTIONS_WON';
      continue;
    }

    if (/adjustments|invoice\s*breakdown|charges\s*&\s*credits/i.test(line)) {
      section = 'ADJUSTMENTS';
      continue;
    }

    if (/^(invoice\s*total|total\s*due|amount\s*paid|grand\s*total)/i.test(line)) {
      section = 'SUMMARY';
    }

    // --- AUCTIONS WON PARSING ---
    if (section === 'AUCTIONS_WON') {
      // Skip header row if encountered
      if (/lot\s*#|item\s*#|final\s*price|winning\s*bid/i.test(line) && /title|description/i.test(line)) {
        continue;
      }

      // Check if line contains a price at the end: e.g. "... $17.01" or "... 17.01"
      // Pristine format: [Lot #] [Item #] [Title Description] [Final Price]
      const rowRegex = /^([A-Za-z0-9-]+)\s+(\d+)\s+(.+?)\s+\$?([0-9,]+\.\d{2})$/;
      const match = line.match(rowRegex);

      if (match) {
        const lotNum = match[1].trim();
        const itemNum = match[2].trim();
        const title = match[3].trim();
        const finalPrice = parseCleanNumber(match[4], 0);

        rawWonItems.push({
          lotNum,
          itemNum,
          title,
          finalPrice
        });
      } else {
        // Fallback for multi-line titles or tab-separated lines
        const priceAtEndMatch = line.match(/\$?([0-9,]+\.\d{2})\s*$/);
        if (priceAtEndMatch && !/subtotal|total|tax|shipping|discount|balance/i.test(line)) {
          const finalPrice = parseCleanNumber(priceAtEndMatch[1], 0);
          const remainder = line.substring(0, priceAtEndMatch.index).trim();

          // Try to extract leading Lot # and Item #
          const idPrefixMatch = remainder.match(/^([A-Za-z0-9-]+)\s+(\d+)\s+(.+)$/);
          if (idPrefixMatch) {
            rawWonItems.push({
              lotNum: idPrefixMatch[1].trim(),
              itemNum: idPrefixMatch[2].trim(),
              title: idPrefixMatch[3].trim(),
              finalPrice
            });
          } else if (remainder.length > 5) {
            // General title with price
            rawWonItems.push({
              lotNum: '',
              itemNum: '',
              title: remainder,
              finalPrice
            });
          }
        }
      }
    }

    // --- ADJUSTMENTS PARSING ---
    if (section === 'ADJUSTMENTS' || section === 'SUMMARY') {
      const lower = line.toLowerCase();
      const amountMatch = line.match(/\(?\$?([0-9,]+\.\d{2})\)?/);
      const val = amountMatch ? parseCleanNumber(amountMatch[0], 0) : 0;

      if (val !== 0) {
        if (/shipping|freight|delivery|handling/i.test(lower)) {
          adjustments.shipping += Math.abs(val);
        } else if (/sales\s*tax|tax/i.test(lower)) {
          adjustments.tax += Math.abs(val);
        } else if (/discount|promo|credit|coupon|voucher/i.test(lower)) {
          adjustments.discount += Math.abs(val);
        } else if (/buyer'?s?\s*premium|bp/i.test(lower)) {
          adjustments.buyersPremium += Math.abs(val);
        } else if (/total|amount\s*paid|grand\s*total/i.test(lower)) {
          adjustments.total = Math.abs(val);
        }
      }
    }
  }

  if (rawWonItems.length === 0) {
    throw new Error('No items could be extracted from "AUCTIONS WON" section in PDF text.');
  }

  // 3. Build Invoices & Items Structure
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

  const items = rawWonItems.map((won, idx) => {
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
    if (won.itemNum) notesParts.push(`Item #${won.itemNum}`);

    return {
      id: `item-${crypto.randomUUID()}`,
      invoice_ref: invoiceRef,
      item_name: won.title,
      category: inferred.category || 'Memorabilia',
      sport_genre: inferred.sport_genre || '',
      athlete_person: inferred.athlete_person || '',
      authenticator: inferred.authenticator || '',
      cert_number: inferred.cert_number || (won.itemNum ? String(won.itemNum) : ''),
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
 * Parses raw ArrayBuffer of a PDF in the browser or Cloudflare Worker environment.
 * Extracts text stream and passes through the Pristine Auction Parser.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }>}
 */
export async function parsePristineAuctionPdf(buffer) {
  // 1. If running in a browser environment with pdfjs-dist available
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return parsePristineAuctionInvoiceText(fullText);
  }

  // 2. Fast fallback for pure binary PDF text streams: extract text streams from PDF raw bytes
  const bytes = new Uint8Array(buffer);
  const textDecoder = new TextDecoder('latin1');
  const rawString = textDecoder.decode(bytes);

  // Extract text within stream chunks or standard PDF text objects (BT ... ET)
  const textChunks = [];
  const btRegex = /BT[\s\S]*?ET/g;
  let btMatch;

  while ((btMatch = btRegex.exec(rawString)) !== null) {
    const block = btMatch[0];
    // Extract strings in parentheses e.g. (Shawn Kemp Signed...) Tj
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let tjMatch;
    const lineParts = [];
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      lineParts.push(tjMatch[1]);
    }
    if (lineParts.length > 0) {
      textChunks.push(lineParts.join(' '));
    }
  }

  if (textChunks.length > 0) {
    return parsePristineAuctionInvoiceText(textChunks.join('\n'));
  }

  // If no PDF streams were decoded, try clean UTF-8 text fallback
  const fallbackStr = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return parsePristineAuctionInvoiceText(fallbackStr);
}
