import { getApiUrl } from '../utils/api';

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

