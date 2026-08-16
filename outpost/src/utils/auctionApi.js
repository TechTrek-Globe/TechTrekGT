import { getApiUrl } from '../utils/api';
export { getApiUrl };

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const OPTS = { credentials: 'include' };

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

// --- Live eBay Comps Auto-Fetch ---
export const fetchLiveComps = (query, itemId = null) =>
  apiFetch('/api/comps/live', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ query, itemId })
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

