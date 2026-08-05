import * as XLSX from 'xlsx';

/**
 * Convert Excel serial date to YYYY-MM-DD string
 * @param {number|string} serial
 * @returns {string|null}
 */
export function formatExcelDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(serial)) return serial.slice(0, 10);
    const parsed = new Date(serial);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return serial;
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
 * Parse an Excel or CSV file buffer and extract Auction entities
 * @param {ArrayBuffer} buffer
 * @returns {{ invoices: any[], items: any[], sales: any[], comps: any[], summary: any }}
 */
export function parseAuctionWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetNames = wb.SheetNames;

  let rawInventory = [];
  let rawSales = [];
  let rawComps = [];

  // Look for known sheet names or use first sheet
  const invSheetName = sheetNames.find(s => /inventory/i.test(s));
  const salesSheetName = sheetNames.find(s => /sale/i.test(s));
  const compsSheetName = sheetNames.find(s => /pricing|comp/i.test(s));

  if (invSheetName) {
    rawInventory = XLSX.utils.sheet_to_json(wb.Sheets[invSheetName], { defval: '' });
  } else if (sheetNames.length > 0) {
    // Fallback: entire first sheet as inventory
    rawInventory = XLSX.utils.sheet_to_json(wb.Sheets[sheetNames[0]], { defval: '' });
  }

  if (salesSheetName) {
    rawSales = XLSX.utils.sheet_to_json(wb.Sheets[salesSheetName], { header: 1, defval: '' });
  }

  if (compsSheetName) {
    rawComps = XLSX.utils.sheet_to_json(wb.Sheets[compsSheetName], { header: 1, defval: '' });
  }

  // Parse Invoices & Items from rawInventory
  const invoiceMap = new Map();
  const items = [];

  rawInventory.forEach((row, idx) => {
    // Skip empty or header-like rows
    const itemName = String(row['Item Name'] || row['item_name'] || row['Item'] || row['Name'] || '').trim();
    if (!itemName || itemName.toLowerCase() === 'item name') return;

    const invoiceRef = String(row['Invoice ID'] || row['invoice_id'] || row['Invoice'] || '4809173').trim();
    const unitPrice = parseFloat(row['Unit Price'] || row['unit_price'] || row['Price'] || 0) || 0;
    const trueCost = parseFloat(row['True Total Cost'] || row['true_total_cost'] || row['Total Cost'] || unitPrice) || unitPrice;
    const invBaseTotal = parseFloat(row['Invoice Base Total'] || 0) || 0;
    const invDiscount = parseFloat(row['Invoice Total Discount'] || 0) || 0;
    const invShipping = parseFloat(row['Invoice Total Shipping'] || 0) || 0;
    const invTax = parseFloat(row['Invoice Total Tax'] || 0) || 0;
    const dateAcquired = formatExcelDate(row['Date Acquired'] || row['date_acquired']);
    const dateListed = formatExcelDate(row['Date Listed'] || row['date_listed']);
    const dateSold = formatExcelDate(row['Date Sold'] || row['date_sold']);

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
      if (invDiscount > cur.discount) cur.discount = invDiscount;
      if (invShipping > cur.shipping) cur.shipping = invShipping;
      if (invTax > cur.tax) cur.tax = invTax;
    }

    const item = {
      id: `item-${crypto.randomUUID()}`,
      invoice_ref: invoiceRef,
      item_name: itemName,
      category: String(row['Category'] || row['category'] || 'Memorabilia').trim(),
      sport_genre: String(row['Sport / Genre'] || row['sport_genre'] || row['Sport'] || '').trim(),
      athlete_person: String(row['Athlete / Person'] || row['athlete_person'] || row['Athlete'] || '').trim(),
      authenticator: String(row['Authenticator'] || row['authenticator'] || row['Auth'] || '').trim(),
      cert_number: String(row['Cert #'] || row['cert_number'] || row['Cert'] || '').trim(),
      unit_price: unitPrice,
      item_base_total: parseFloat(row['Item Base Total'] || unitPrice) || unitPrice,
      proration_weight: parseFloat(row['Proration Weight'] || 0) || 0,
      prorated_discount: parseFloat(row['Prorated Discount'] || 0) || 0,
      prorated_shipping: parseFloat(row['Prorated Shipping'] || 0) || 0,
      prorated_tax: parseFloat(row['Prorated Tax'] || 0) || 0,
      true_total_cost: trueCost,
      status: String(row['Status'] || row['status'] || 'Available').trim(),
      platform: String(row['Platform'] || row['platform'] || 'eBay').trim(),
      platform_fee_pct: parseFloat(row['Platform Fee %'] || 0.136) || 0.136,
      platform_flat_fee: parseFloat(row['Platform Flat Fee'] || 0.40) || 0.40,
      est_shipping_cost: parseFloat(row['Est. Shipping Cost'] || 6.50) || 6.50,
      boost_pct: parseFloat(row['Boost %'] || 0) || 0,
      min_sell_price: parseFloat(row['Min Sell Price'] || 0) || 0,
      suggested_list_price: parseFloat(row['Suggested List Price'] || 0) || 0,
      current_list_price: row['Current List Price'] ? parseFloat(row['Current List Price']) : null,
      actual_sell_price: row['Actual Sell Price'] ? parseFloat(row['Actual Sell Price']) : null,
      target_margin_pct: parseFloat(row['Margin % (Target)'] || 0.30) || 0.30,
      date_acquired: dateAcquired,
      date_listed: dateListed,
      date_sold: dateSold,
      days_on_market: parseInt(row['Days on Market'], 10) || null,
      notes: String(row['Notes'] || row['notes'] || '').trim(),
      best_listing_window: String(row['Best Listing Window'] || '').trim()
    };

    items.push(item);
  });

  const invoices = Array.from(invoiceMap.values());

  // Parse Sales Log rows
  const sales = [];
  if (rawSales.length > 0) {
    // Find header index in raw sales sheet
    let headerIdx = -1;
    for (let r = 0; r < Math.min(rawSales.length, 10); r++) {
      const row = rawSales[r];
      if (Array.isArray(row) && row.some(cell => /Item Name|Sale Date|Gross Sale/i.test(String(cell)))) {
        headerIdx = r;
        break;
      }
    }

    if (headerIdx >= 0) {
      const headers = rawSales[headerIdx].map(h => String(h || '').trim());
      const nameCol = headers.findIndex(h => /Item Name/i.test(h));
      const dateCol = headers.findIndex(h => /Sale Date/i.test(h));
      const platformCol = headers.findIndex(h => /Platform/i.test(h));
      const buyerCol = headers.findIndex(h => /Buyer/i.test(h));
      const grossCol = headers.findIndex(h => /Gross Sale Price/i.test(h));
      const buyerShipCol = headers.findIndex(h => /Buyer Shipping/i.test(h));
      const actShipCol = headers.findIndex(h => /Actual Shipping/i.test(h));
      const feePctCol = headers.findIndex(h => /Platform Fee %/i.test(h));
      const flatFeeCol = headers.findIndex(h => /Platform Flat Fee/i.test(h));
      const daysCol = headers.findIndex(h => /Days to Sell/i.test(h));

      for (let r = headerIdx + 1; r < rawSales.length; r++) {
        const row = rawSales[r];
        if (!row || !Array.isArray(row)) continue;
        const itemName = String(row[nameCol] || '').trim();
        const gross = parseFloat(row[grossCol]) || 0;
        if (!itemName || gross <= 0) continue;

        sales.push({
          id: `sale-${crypto.randomUUID()}`,
          item_name: itemName,
          sale_date: formatExcelDate(row[dateCol]) || new Date().toISOString().split('T')[0],
          platform: String(row[platformCol] || 'eBay').trim(),
          buyer_handle: String(row[buyerCol] || '').trim(),
          gross_sale_price: gross,
          buyer_shipping_paid: parseFloat(row[buyerShipCol]) || 0,
          actual_shipping_cost: parseFloat(row[actShipCol]) || 0,
          platform_fee_pct: parseFloat(row[feePctCol]) || 0.136,
          platform_flat_fee: parseFloat(row[flatFeeCol]) || 0.40,
          days_to_sell: parseInt(row[daysCol], 10) || null
        });
      }
    }
  }

  // Parse Pricing Intelligence / Comps rows
  const comps = [];
  if (rawComps.length > 0) {
    let headerIdx = -1;
    for (let r = 0; r < Math.min(rawComps.length, 10); r++) {
      const row = rawComps[r];
      if (Array.isArray(row) && row.some(cell => /Manual Comp|Live Avg|Comp #1/i.test(String(cell)))) {
        headerIdx = r;
        break;
      }
    }

    if (headerIdx >= 0) {
      const headers = rawComps[headerIdx].map(h => String(h || '').trim());
      const nameCol = headers.findIndex(h => /Item Name/i.test(h));
      const c1Col = headers.findIndex(h => /Manual Comp #1|Comp 1/i.test(h));
      const c2Col = headers.findIndex(h => /Manual Comp #2|Comp 2/i.test(h));
      const c3Col = headers.findIndex(h => /Manual Comp #3|Comp 3/i.test(h));
      const recCol = headers.findIndex(h => /Recommended List/i.test(h));

      for (let r = headerIdx + 1; r < rawComps.length; r++) {
        const row = rawComps[r];
        if (!row || !Array.isArray(row)) continue;
        const itemName = String(row[nameCol] || '').trim();
        if (!itemName) continue;

        const c1 = row[c1Col] ? parseFloat(row[c1Col]) : null;
        const c2 = row[c2Col] ? parseFloat(row[c2Col]) : null;
        const c3 = row[c3Col] ? parseFloat(row[c3Col]) : null;

        if (c1 || c2 || c3) {
          comps.push({
            item_name: itemName,
            comp_1: c1,
            comp_2: c2,
            comp_3: c3,
            recommended_list_price: row[recCol] ? parseFloat(row[recCol]) : null
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
