/**
 * User Settings Management for TechTrek Outpost
 * Manages column visibility, column widths, and category ordering.
 * Persists immediately to localStorage for snappy UX and syncs to backend.
 */

export const DEFAULT_COLUMNS = [
  { key: 'actions',              label: 'Actions',          defaultVisible: true, minWidth: 140, defaultWidth: 160 },
  { key: 'item_name',            label: 'Item / Description', defaultVisible: true, minWidth: 160, defaultWidth: 220 },
  { key: 'sku',                  label: 'SKU / Label',      defaultVisible: true, minWidth: 80,  defaultWidth: 100 },
  { key: 'status',               label: 'Status',           defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'current_list_price',   label: 'List Price',       defaultVisible: true, minWidth: 95,  defaultWidth: 110 },
  { key: 'net_profit',           label: 'Net Profit',       defaultVisible: true, minWidth: 95,  defaultWidth: 110 },
  { key: 'margin_health',        label: 'Margin %',         defaultVisible: true, minWidth: 95,  defaultWidth: 110 },
  { key: 'true_total_cost',      label: 'Landed COGS',      defaultVisible: true, minWidth: 95,  defaultWidth: 110 },
  { key: 'floor_price',          label: 'Floor Price',      defaultVisible: true, minWidth: 85,  defaultWidth: 100 },
  { key: 'suggested_list_price', label: 'Suggested List',   defaultVisible: true, minWidth: 95,  defaultWidth: 110 },
  { key: 'listing_format',       label: 'Format',           defaultVisible: true, minWidth: 90,  defaultWidth: 110 },
  { key: 'athlete_person',       label: 'Athlete / Signer', defaultVisible: true, minWidth: 110, defaultWidth: 140 },
  { key: 'category',             label: 'Category',         defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'authenticator',        label: 'Authenticator',    defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'cert_number',          label: 'Cert #',           defaultVisible: true, minWidth: 90,  defaultWidth: 110 },
  { key: 'platform',             label: 'Platform',         defaultVisible: true, minWidth: 90,  defaultWidth: 110 },
  { key: 'quantity',             label: 'Qty',              defaultVisible: true, minWidth: 60,  defaultWidth: 80 },
  { key: 'invoice_ref',          label: 'Invoice Ref',      defaultVisible: true, minWidth: 80,  defaultWidth: 100 },
];

export const DEFAULT_CATEGORIES = [
  'Jersey',
  'Photo',
  'Card',
  'Baseball',
  'Bat',
  'Football',
  'Helmet',
  'Glove',
  'Poster',
  'Puck',
  'Other'
];

export const DEFAULT_SALES_COLUMNS = [
  { key: 'sale_date',        label: 'Sale Date',            defaultVisible: true, minWidth: 75,  defaultWidth: 85,  align: 'left' },
  { key: 'item_name',        label: 'Item & Details',       defaultVisible: true, minWidth: 150, defaultWidth: 260, align: 'left' },
  { key: 'platform',         label: 'Platform / Buyer',     defaultVisible: true, minWidth: 90,  defaultWidth: 120, align: 'left' },
  { key: 'gross_sale_price', label: 'Gross',                defaultVisible: true, minWidth: 70,  defaultWidth: 85,  align: 'right' },
  { key: 'true_total_cost',  label: 'Cost',                 defaultVisible: true, minWidth: 65,  defaultWidth: 80,  align: 'right' },
  { key: 'fees_shipping',    label: 'Fees & Ship',          defaultVisible: true, minWidth: 75,  defaultWidth: 95,  align: 'right' },
  { key: 'net_proceeds',     label: 'Net Proceeds',         defaultVisible: true, minWidth: 75,  defaultWidth: 95,  align: 'right' },
  { key: 'net_profit',       label: 'Net Profit',           defaultVisible: true, minWidth: 75,  defaultWidth: 95,  align: 'right' },
  { key: 'roi_pct',          label: 'ROI %',                defaultVisible: true, minWidth: 60,  defaultWidth: 70,  align: 'right' },
  { key: 'days_to_sell',     label: 'Days',                 defaultVisible: true, minWidth: 45,  defaultWidth: 55,  align: 'right' },
  { key: 'actions',          label: 'Actions',              defaultVisible: true, minWidth: 65,  defaultWidth: 75,  align: 'center' },
];

const STORAGE_KEY = 'outpost_user_settings_v1';

export function getDefaultSalesWidths() {
  const widths = {};
  DEFAULT_SALES_COLUMNS.forEach(col => { widths[col.key] = col.defaultWidth; });
  return widths;
}

export function getStoredUserSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultUserSettings();
    const parsed = JSON.parse(raw);
    return {
      columnVisibility: { ...getDefaultVisibility(), ...(parsed.columnVisibility || {}) },
      columnWidths: { ...getDefaultWidths(), ...(parsed.columnWidths || {}) },
      salesColumnWidths: { ...getDefaultSalesWidths(), ...(parsed.salesColumnWidths || {}) },
      categoryOrder: Array.isArray(parsed.categoryOrder) && parsed.categoryOrder.length > 0
        ? parsed.categoryOrder
        : DEFAULT_CATEGORIES
    };
  } catch (e) {
    return getDefaultUserSettings();
  }
}

export function getDefaultVisibility() {
  const vis = {};
  DEFAULT_COLUMNS.forEach(col => { vis[col.key] = col.defaultVisible; });
  return vis;
}

export function getDefaultWidths() {
  const widths = {};
  DEFAULT_COLUMNS.forEach(col => { widths[col.key] = col.defaultWidth; });
  return widths;
}

export function getDefaultUserSettings() {
  return {
    columnVisibility: getDefaultVisibility(),
    columnWidths: getDefaultWidths(),
    salesColumnWidths: getDefaultSalesWidths(),
    categoryOrder: [...DEFAULT_CATEGORIES]
  };
}

export function saveUserSettings(settings) {
  try {
    const current = getStoredUserSettings();
    const updated = {
      columnVisibility: settings.columnVisibility || current.columnVisibility,
      columnWidths: settings.columnWidths || current.columnWidths,
      salesColumnWidths: settings.salesColumnWidths || current.salesColumnWidths,
      categoryOrder: settings.categoryOrder || current.categoryOrder
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // Dispatch custom event so open views react instantly
    window.dispatchEvent(new CustomEvent('outpost-settings-updated', { detail: updated }));

    return updated;
  } catch (e) {
    console.error('Failed to save user settings:', e);
    return settings;
  }
}

export function resetColumnWidths() {
  const current = getStoredUserSettings();
  const resetWidths = getDefaultWidths();
  const resetSalesWidths = getDefaultSalesWidths();
  return saveUserSettings({ ...current, columnWidths: resetWidths, salesColumnWidths: resetSalesWidths });
}


