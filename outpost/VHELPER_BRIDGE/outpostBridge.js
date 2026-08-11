/**
 * outpostBridge.js
 * VineScout Chrome Extension - TechTrek Outpost Integration
 *
 * Pushes Amazon Vine item data to TechTrek Outpost inventory via the
 * POST /api/import/amazon endpoint, authenticated with a user API token.
 *
 * Usage:
 *   import { pushToOutpost } from './outpostBridge.js';
 *   await pushToOutpost({ asin, title, category, vine_value, tax_value, page_url, image_url });
 */

const OUTPOST_ENDPOINT = 'https://techtrekgt.com/outpost/api/import/amazon';
const STORAGE_KEY_TOKEN = 'outpost_api_token';
const STORAGE_KEY_ENABLED = 'outpost_sync_enabled';

/**
 * Read the stored Outpost API token from chrome.storage.sync.
 * @returns {Promise<string|null>}
 */
async function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY_TOKEN, STORAGE_KEY_ENABLED], (result) => {
      if (!result[STORAGE_KEY_ENABLED]) {
        resolve(null);
        return;
      }
      resolve(result[STORAGE_KEY_TOKEN] || null);
    });
  });
}

/**
 * Push a Vine item to TechTrek Outpost.
 *
 * @param {{
 *   asin:        string,
 *   title:       string,
 *   category?:   string,
 *   vine_value?: number,
 *   tax_value?:  number,
 *   image_url?:  string,
 *   page_url?:   string,
 *   notes?:      string
 * }} itemData
 *
 * @returns {Promise<{ success: boolean, item_id?: string, invoice_ref?: string, error?: string }>}
 */
export async function pushToOutpost(itemData) {
  const token = await getStoredToken();

  if (!token) {
    console.warn('[OutpostBridge] Outpost sync is disabled or no API token configured.');
    return { success: false, error: 'Outpost sync disabled or no token configured.' };
  }

  if (!itemData.asin || !itemData.title) {
    return { success: false, error: 'ASIN and title are required.' };
  }

  try {
    const res = await fetch(OUTPOST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        asin:       itemData.asin,
        title:      itemData.title,
        category:   itemData.category || 'Other',
        vine_value: itemData.vine_value || 0,
        tax_value:  itemData.tax_value  || 0,
        image_url:  itemData.image_url  || null,
        page_url:   itemData.page_url   || null,
        notes:      itemData.notes      || 'Imported via VineScout'
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[OutpostBridge] Push failed:', data.error);
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }

    console.log('[OutpostBridge] Item pushed successfully:', data.item_id);
    return { success: true, item_id: data.item_id, invoice_ref: data.invoice_ref };

  } catch (err) {
    console.error('[OutpostBridge] Network error:', err);
    return { success: false, error: err.message || 'Network error' };
  }
}

/**
 * Test the connection with the stored token.
 * Sends a dry-run style invalid ASIN which will return 400, confirming auth is OK.
 *
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function testOutpostConnection() {
  const token = await getStoredToken();
  if (!token) return { ok: false, message: 'No API token configured.' };

  try {
    const res = await fetch(OUTPOST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ asin: '', title: '' }) // intentionally empty to trigger 400
    });

    if (res.status === 401) {
      return { ok: false, message: 'Invalid or expired API token.' };
    }

    // A 400 (bad request) with valid auth means connection is working
    if (res.status === 400 || res.status === 201) {
      return { ok: true, message: 'Connection to TechTrek Outpost verified.' };
    }

    return { ok: false, message: `Unexpected response: HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}
