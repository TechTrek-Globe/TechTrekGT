import { getApiUrl } from '../utils/api';
export { getApiUrl };

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const OPTS = { credentials: 'include' };

/**
 * Resolves the landing API gateway base URL.
 * In local dev (localhost) routes to wrangler dev port 8787.
 * In production routes to https://techtrekgt.com (techtrek-landing Worker).
 */
function getGatewayBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8787';
  }
  return 'https://techtrekgt.com';
}

async function apiFetch(path, options = {}) {
  const res = await fetch(getApiUrl(path), { ...OPTS, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// --- Invoices ---
export const getInvoices = () =>
  apiFetch('/api/invoices');

export const createInvoice = (body) =>
  apiFetch('/api/invoices', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const updateInvoice = (id, body) =>
  apiFetch(`/api/invoices/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const deleteInvoice = (id) =>
  apiFetch(`/api/invoices/${id}`, { method: 'DELETE' });

// --- Items ---
export const getItems = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return apiFetch(`/api/items${qs ? `?${qs}` : ''}`);
};

export const getEnrichedItems = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return apiFetch(`/api/items/enriched${qs ? `?${qs}` : ''}`);
};

export const updateItem = (id, body) =>
  apiFetch(`/api/items/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const deleteItem = (id) =>
  apiFetch(`/api/items/${id}`, { method: 'DELETE' });


// --- Sales ---
export const getSales = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return apiFetch(`/api/sales${qs ? `?${qs}` : ''}`);
};

export const getSale = (id) =>
  apiFetch(`/api/sales/${id}`);

export const createSale = (body) =>
  apiFetch('/api/sales', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const updateSale = (id, body) =>
  apiFetch(`/api/sales/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const deleteSale = (id) =>
  apiFetch(`/api/sales/${id}`, { method: 'DELETE' });

// --- Platforms ---
export const getPlatforms = () =>
  apiFetch('/api/platforms');

export const createPlatform = (body) =>
  apiFetch('/api/platforms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const updatePlatform = (id, body) =>
  apiFetch(`/api/platforms/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const deletePlatform = (id) =>
  apiFetch(`/api/platforms/${id}`, { method: 'DELETE' });

export const resetPlatforms = () =>
  apiFetch('/api/platforms', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action: 'reset_defaults' })
  });

// --- Comps / Pricing Intelligence ---
export const getComps = (params = {}) => {
  const q = new URLSearchParams();
  if (params.item_id) q.set('item_id', params.item_id);
  if (params.status) q.set('status', params.status);
  const qs = q.toString();
  return apiFetch(`/api/comps${qs ? `?${qs}` : ''}`);
};

export const saveComp = (body) =>
  apiFetch('/api/comps', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const updateComp = (id, body) =>
  apiFetch(`/api/comps/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const deleteComp = (id) =>
  apiFetch(`/api/comps/${id}`, { method: 'DELETE' });

// --- Dashboard ---
export const getDashboard = () =>
  apiFetch('/api/dashboard');

// --- Live eBay Comps (via Central API Gateway) ---
// Gateway endpoint: POST https://techtrekgt.com/api/ebay/comps
// Uses official eBay REST API (Marketplace Insights + Browse fallback).
// Option A: gateway returns raw data; caller uses saveComp() to persist to D1 if itemId is set.
export const fetchLiveComps = (query, itemId = null) =>
  fetch(`${getGatewayBase()}/api/ebay/comps`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_HEADERS,
    body: JSON.stringify({ query, itemId })
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });

// --- eBay Catalog Search (via Central API Gateway) ---
export const fetchEbayCatalog = (query) =>
  fetch(`${getGatewayBase()}/api/ebay/catalog?q=${encodeURIComponent(query)}`, {
    credentials: 'include',
    headers: JSON_HEADERS
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });

// --- eBay Item Details (via Central API Gateway) ---
export const fetchEbayItemDetail = (itemId) =>
  fetch(`${getGatewayBase()}/api/ebay/item/${encodeURIComponent(itemId)}`, {
    credentials: 'include',
    headers: JSON_HEADERS
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });

// --- Amazon Product Fetch (via Central API Gateway) ---
// Gateway endpoint: POST https://techtrekgt.com/api/amazon/fetch
// Scrapes/parses Amazon product metadata from a URL or ASIN.
export const fetchAmazonProduct = (input) =>
  fetch(`${getGatewayBase()}/api/amazon/fetch`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_HEADERS,
    body: JSON.stringify({ input })
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  });

// --- TechTrek Finance Cross-Portal Sync ---
export const getFinanceSyncMetrics = () =>
  apiFetch('/api/sync/finance');

export const syncToFinance = (options = {}) =>
  apiFetch('/api/sync/finance', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(options)
  });

// --- Supplies & Packaging Expense Tracker ---
export const getSupplies = () =>
  apiFetch('/api/supplies');

export const createSupply = (body) =>
  apiFetch('/api/supplies', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const updateSupply = (id, body) =>
  apiFetch(`/api/supplies/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

export const deleteSupply = (id) =>
  apiFetch(`/api/supplies/${id}`, { method: 'DELETE' });

// --- Year-End Tax & Schedule C Reports ---
export const getTaxReport = (year = '') =>
  apiFetch(`/api/reports/tax${year ? `?year=${encodeURIComponent(year)}` : ''}`);

// ============================================================
// PHASE 3 - eBay Real-Time Sync Engine API Utilities
// ============================================================

// --- eBay OAuth Status ---
export const getEbayOAuthStatus = () =>
  apiFetch('/api/ebay/oauth-status');

// --- eBay Listing ID (PATCH item) ---
export const saveEbayListingId = (itemId, ebayListingId, certVerificationUrl = null, ebayPromotedRate = null) =>
  apiFetch(`/api/items/${itemId}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ebay_listing_id: ebayListingId || null,
      cert_verification_url: certVerificationUrl || null,
      ebay_promoted_rate: ebayPromotedRate != null ? parseFloat(ebayPromotedRate) : null
    })
  });

// --- eBay Delist Pending: mark item Sold from the delist alert ---
export const resolveDelistPending = (itemId) =>
  apiFetch(`/api/items/${itemId}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status: 'Sold' })
  });

// --- eBay Active Listing Discovery ---
export const findEbayListings = () =>
  apiFetch('/api/ebay/find-listings');

// --- eBay Active Listings (On-Demand Picker) ---
export const getActiveEbayListings = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiFetch(`/api/ebay/active-listings${qs ? `?${qs}` : ''}`);
};

// --- eBay Fee Reconciliation ---
export const reconcileSaleFees = (saleId, ebayOrderId) =>
  apiFetch('/api/ebay/reconcile', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ sale_id: saleId, ebay_order_id: ebayOrderId })
  });


