/**
 * User Settings Management for TechTrek Outpost
 * Manages column visibility, column widths, and category ordering.
 * Persists immediately to localStorage for snappy UX and syncs to backend.
 */

export const DEFAULT_COLUMNS = [
  { key: 'item_name',            label: 'Item Description', defaultVisible: true, minWidth: 150, defaultWidth: 220 },
  { key: 'status',               label: 'Status',          defaultVisible: true, minWidth: 100, defaultWidth: 130 },
  { key: 'category',             label: 'Category',        defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'authenticator',        label: 'Authenticator',   defaultVisible: true, minWidth: 110, defaultWidth: 130 },
  { key: 'cert_number',          label: 'Cert #',          defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'true_total_cost',      label: 'True Cost',       defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'min_sell_price',       label: 'Min Sell',        defaultVisible: true, minWidth: 90,  defaultWidth: 110 },
  { key: 'suggested_list_price', label: 'Suggested List',  defaultVisible: true, minWidth: 110, defaultWidth: 130 },
  { key: 'current_list_price',   label: 'Current List',    defaultVisible: true, minWidth: 110, defaultWidth: 130 },
  { key: 'platform',             label: 'Platform',        defaultVisible: true, minWidth: 100, defaultWidth: 120 },
  { key: 'invoice_ref',          label: 'Invoice',         defaultVisible: true, minWidth: 90,  defaultWidth: 110 },
  { key: 'actions',              label: 'Actions',         defaultVisible: true, minWidth: 80,  defaultWidth: 100 },
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

const STORAGE_KEY = 'outpost_user_settings_v1';

export function getStoredUserSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultUserSettings();
    const parsed = JSON.parse(raw);
    return {
      columnVisibility: { ...getDefaultVisibility(), ...(parsed.columnVisibility || {}) },
      columnWidths: { ...getDefaultWidths(), ...(parsed.columnWidths || {}) },
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
    categoryOrder: [...DEFAULT_CATEGORIES]
  };
}

export function saveUserSettings(settings) {
  try {
    const current = getStoredUserSettings();
    const updated = {
      columnVisibility: settings.columnVisibility || current.columnVisibility,
      columnWidths: settings.columnWidths || current.columnWidths,
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
  return saveUserSettings({ ...current, columnWidths: resetWidths });
}


