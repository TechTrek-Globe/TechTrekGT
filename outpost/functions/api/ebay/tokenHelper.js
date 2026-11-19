/**
 * tokenHelper.js - eBay user-level OAuth token retrieval for the Outpost Worker.
 *
 * Mirrors the getEbayUserToken function from landing/src/gateway/ebayOAuth.js,
 * operating against the Outpost's own D1 bindings.
 *
 * Eliminates the server-to-server gateway fetch pattern that caused the
 * "Endpoint not found" loopback bug in find-listings.js.
 *
 * Required env bindings: DB, TOKEN_ENCRYPTION_KEY, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
 * Optional: EBAY_ENV (set to 'sandbox' to use sandbox API URLs)
 *
 * FAIL-CLOSED: TOKEN_ENCRYPTION_KEY must be bound. JWT_SECRET is NEVER substituted.
 */

import { daysBetween, markItemSold } from '../../utils/auction.js';
import {
  DEFAULT_PLATFORM_FEE_PCT,
  DEFAULT_PLATFORM_FLAT_FEE,
  DEFAULT_TARGET_MARGIN_PCT
} from '../../utils/constants.js';
import {
  calculateEbayCategoryFees as resolveEbayCategoryFees,
  getActiveFeeSchedule
} from '../../utils/ebayFeeSchedule.js';

// --- Token Crypto (AES-GCM, re-exported from canonical outpost/functions/utils/tokenCrypto.js) ---
import {
  OLD_SALT,
  NEW_SALT,
  PBKDF2_ITERATIONS_V1,
  PBKDF2_ITERATIONS_V2,
  PBKDF2_ITERATIONS,
  PBKDF2_WORKERD_CEILING,
  deriveKey,
  decryptToken,
  encryptToken
} from '../../utils/tokenCrypto.js';

export {
  OLD_SALT,
  NEW_SALT,
  PBKDF2_ITERATIONS_V1,
  PBKDF2_ITERATIONS_V2,
  PBKDF2_ITERATIONS,
  PBKDF2_WORKERD_CEILING,
  deriveKey,
  decryptToken,
  encryptToken
};

export const DEFAULT_EXTERNAL_TIMEOUT_MS = 15000;

/**
 * Fetch wrapper that enforces a strict timeout on external requests.
 * Uses AbortSignal.timeout() when available, with fallback to AbortController.
 *
 * @param {string} url
 * @param {RequestInit} [options={}]
 * @param {number} [timeoutMs=DEFAULT_EXTERNAL_TIMEOUT_MS]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  let timerId;
  let signal = options.signal;

  if (!signal) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(timeoutMs);
    } else {
      const controller = new AbortController();
      timerId = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
      signal = controller.signal;
    }
  }

  try {
    const res = await fetch(url, { ...options, signal });
    return res;
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout|aborted/i.test(err.message)) {
      let host = 'external service';
      try { host = new URL(url).hostname; } catch (_) {}
      const timeoutErr = new Error(`External request to ${host} timed out after ${timeoutMs}ms`);
      timeoutErr.name = 'TimeoutError';
      timeoutErr.isTimeout = true;
      timeoutErr.statusCode = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

// --- URL Normalization ---

export function normalizeHttps(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://');
  return trimmed;
}

// --- XML Extraction Helper (eBay Trading API) ---

/**
 * Shared XML tag extractor for eBay Trading API responses.
 * Extracts the inner text of <tag>...</tag> and unwraps CDATA if present.
 *
 * @param {string} xml - XML string or isolated XML block
 * @param {string} tag - Tag name to extract
 * @returns {string|null}
 */
export function extractXmlTag(xml, tag) {
  if (!xml || typeof xml !== 'string' || !tag) return null;
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  const val = m[1].trim();
  const cdata = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdata ? cdata[1].trim() : val;
}

// --- eBay endpoint resolution ---

function isEbaySandbox(env) {
  const clientId = String(env.EBAY_CLIENT_ID || '').trim();
  return (
    (env.EBAY_ENV && env.EBAY_ENV.toLowerCase() === 'sandbox') ||
    clientId.toUpperCase().includes('-SBX-') ||
    clientId.toUpperCase().includes('SANDBOX')
  );
}

function getEbayOAuthUrl(env) {
  const base = isEbaySandbox(env)
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
  return `${base}/identity/v1/oauth2/token`;
}

export function getEbayApiBase(env) {
  return isEbaySandbox(env)
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
}

// --- Token retrieval with auto-refresh ---

/**
 * Retrieves a valid user-level eBay access token for the given userId.
 * Auto-refreshes the access token if within 5 minutes of expiry.
 * Throws if:
 *   - No eBay token row exists for this user (not connected)
 *   - The refresh token has expired (user must reconnect)
 *   - Token refresh fails (eBay API error)
 *
 * @param {object} env - Worker env bindings (DB, JWT_SECRET, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET)
 * @param {string} userId - Authenticated user's ID
 * @returns {Promise<string>} Plain-text eBay access token
 */
export async function getEbayUserToken(env, userId) {
  if (!env.DB) throw new Error('DB binding not available');

  if (!env.TOKEN_ENCRYPTION_KEY) {
    console.error('[tokenHelper] FATAL: TOKEN_ENCRYPTION_KEY is not bound. eBay integration unavailable.');
    throw Object.assign(
      new Error('eBay integration is temporarily unavailable due to a server configuration issue. Please contact support.'),
      { statusCode: 503 }
    );
  }
  const encKey = env.TOKEN_ENCRYPTION_KEY;

  console.log('[tokenHelper] TOKEN_ENCRYPTION_KEY binding present: yes');

  const row = await env.DB.prepare(
    'SELECT * FROM ebay_oauth_tokens WHERE user_id = ?'
  ).bind(userId).first();

  if (!row) {
    throw new Error('eBay account not connected. Go to Settings > eBay Integration to connect.');
  }

  const now = Date.now();
  const accessExp = new Date(row.access_token_exp).getTime();
  const refreshExp = new Date(row.refresh_token_exp).getTime();

  if (refreshExp < now) {
    if (env.DB) {
      await env.DB.prepare('DELETE FROM ebay_oauth_tokens WHERE user_id = ?').bind(userId).run();
    }
    throw new Error('eBay refresh token has expired. Please reconnect your eBay account in Settings.');
  }

  // Helper: decrypt and re-encrypt legacy tokens in-place to drain the v1 path
  async function decryptAndMigrate(encrypted, column) {
    const { plaintext, wasLegacy } = await decryptToken(encrypted, encKey);
    if (wasLegacy && plaintext) {
      try {
        const reencrypted = await encryptToken(plaintext, encKey);
        const stmt = column === 'access_token'
          ? env.DB.prepare('UPDATE ebay_oauth_tokens SET access_token = ? WHERE user_id = ?')
          : env.DB.prepare('UPDATE ebay_oauth_tokens SET refresh_token = ? WHERE user_id = ?');
        await stmt.bind(reencrypted, userId).run();
        console.log(`[tokenHelper] Migrated legacy ${column} to v2 envelope for user ${userId}`);
      } catch (migrateErr) {
        console.error(`[tokenHelper] Failed to persist migrated ${column}:`, migrateErr);
        // Non-fatal: continue with the decrypted plaintext
      }
    }
    return plaintext;
  }

  // Access token still valid (>5 min remaining) - return it directly
  if (accessExp > now + 5 * 60 * 1000) {
    return decryptAndMigrate(row.access_token, 'access_token');
  }

  // Access token expired or near-expiry - refresh it
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not configured on this worker. Cannot refresh token.');
  }

  const refreshToken = await decryptAndMigrate(row.refresh_token, 'refresh_token');
  const clientId = String(env.EBAY_CLIENT_ID).trim().replace(/^['"]|['"]$/g, '');
  const clientSecret = String(env.EBAY_CLIENT_SECRET).trim().replace(/^['"]|['"]$/g, '');
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const oauthUrl = getEbayOAuthUrl(env);

  let res;
  try {
    res = await fetchWithTimeout(oauthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    }, 15000);
  } catch (fetchErr) {
    if (fetchErr.isTimeout || fetchErr.name === 'TimeoutError') {
      console.error('[tokenHelper] eBay token refresh timed out:', fetchErr);
      const err = new Error('eBay token refresh timed out. Please try again.');
      err.isTimeout = true;
      err.statusCode = 504;
      throw err;
    }
    throw fetchErr;
  }

  if (!res.ok) {
    // If refresh fails but access token is still within validity window, return existing
    if (accessExp > now) {
      const { plaintext } = await decryptToken(row.access_token, encKey);
      if (plaintext) return plaintext;
    }
    const text = await res.text().catch(() => '');
    console.error(`[tokenHelper] eBay token refresh failed (${res.status}):`, text);
    if ((res.status === 400 || res.status === 401) && env.DB) {
      await env.DB.prepare('DELETE FROM ebay_oauth_tokens WHERE user_id = ?').bind(userId).run();
    }
    const err = new Error(
      res.status === 429
        ? 'eBay API rate limit exceeded during token refresh. Please try again later.'
        : 'eBay token refresh failed. Please reconnect your eBay account.'
    );
    err.statusCode = res.status === 429 ? 429 : 401;
    throw err;
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpMs = Date.now() + (data.expires_in || 7200) * 1000;
  const newExpIso = new Date(newExpMs).toISOString();

  const encAccess = await encryptToken(newAccessToken, encKey);

  await env.DB.prepare(`
    UPDATE ebay_oauth_tokens SET
      access_token = ?,
      access_token_exp = ?,
      last_refreshed_at = datetime('now')
    WHERE user_id = ?
  `).bind(encAccess, newExpIso, userId).run();

  return newAccessToken;
}

/**
 * Fetches all active eBay listings for a seller.
 * Uses a dual-strategy approach:
 * 1. eBay Trading API (GetMyeBaySelling): Fetches all active items listed on eBay
 *    (created via web, app, or third-party tools), including 12-digit ItemID, Title, Price, SKU, Quantity.
 * 2. eBay Sell Inventory API (/sell/inventory/v1/inventory_item + offer): Fetches items created via Inventory API.
 * 3. Merges and deduplicates listings by listing_id and sku.
 */
export async function fetchEbayActiveSellerListings(env, accessToken) {
  const isSandbox = isEbaySandbox(env);
  const tradingBase = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';
  const restBase = isSandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';

  const listingsMap = new Map();

  // 1. Try eBay Trading API (GetMyeBaySelling) - captures all active web & app listings
  try {
    const xmlReq = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;

    const tradingRes = await fetchWithTimeout(tradingBase, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlReq
    }, 15000);

    if (tradingRes.ok) {
      const xmlText = await tradingRes.text();
      const itemBlocks = xmlText.match(/<Item[\s>][\s\S]*?<\/Item>/g) || [];

      for (const block of itemBlocks) {
        const listingId = extractXmlTag(block, 'ItemID');
        const title = extractXmlTag(block, 'Title');
        const currentPriceStr = extractXmlTag(block, 'CurrentPrice') || extractXmlTag(block, 'BuyItNowPrice') || '0';
        const qtyStr = extractXmlTag(block, 'QuantityAvailable') || extractXmlTag(block, 'Quantity') || '1';
        const qtySoldStr = extractXmlTag(block, 'QuantitySold') || '0';
        const listingStatus = extractXmlTag(block, 'ListingStatus') || 'Active';
        const sku = extractXmlTag(block, 'SKU') || null;

        // Extract shipping from block
        const freeShip = block.includes('<FreeShipping>true</FreeShipping>');
        let shipCost = 0;
        const scm = block.match(/<ShippingServiceCost[^>]*>([0-9.]+)<\/ShippingServiceCost>/i) ||
                    block.match(/<ShippingCost[^>]*>([0-9.]+)<\/ShippingCost>/i);
        if (scm) {
          shipCost = parseFloat(scm[1]) || 0;
        } else {
          const spm = block.match(/<ShippingProfileName[^>]*>(.*?)<\/ShippingProfileName>/i);
          if (spm) {
            const dm = spm[1].match(/\$([0-9]+(?:\.[0-9]{2})?)/);
            if (dm) shipCost = parseFloat(dm[1]) || 0;
          }
        }
        // Extract gallery or picture image if present
        const galleryMatch = block.match(/<GalleryURL[^>]*>(.*?)<\/GalleryURL>/i) ||
                             block.match(/<PictureURL[^>]*>(.*?)<\/PictureURL>/i) ||
                             block.match(/<PictureDetails>[\s\S]*?<PictureURL[^>]*>(.*?)<\/PictureURL>/i);
        const galleryUrl = galleryMatch ? normalizeHttps(galleryMatch[1].trim()) : null;

        if (listingId || title) {
          const key = listingId || sku || title;
          listingsMap.set(key, {
            sku: sku || null,
            listing_id: listingId || null,
            title: title || '',
            price: parseFloat(currentPriceStr) || 0,
            quantity: parseInt(qtyStr, 10) || 1,
            quantity_sold: parseInt(qtySoldStr, 10) || 0,
            buyer_shipping_cost: shipCost,
            is_free_shipping: freeShip || (shipCost === 0),
            condition: 'Active',
            status: (listingStatus === 'Completed' || listingStatus === 'Ended')
              ? (parseInt(qtySoldStr, 10) > 0 ? 'Sold' : 'Unsold')
              : (listingStatus === 'Active' ? 'Listed' : listingStatus),
            image_url: galleryUrl,
            listing_url: listingId ? `https://www.ebay.com/itm/${listingId}` : null
          });
        }
      }
    } else {
      const errText = await tradingRes.text().catch(() => '');
      console.warn(`[tokenHelper] Trading API GetMyeBaySelling error (${tradingRes.status}):`, errText.slice(0, 200));
    }
  } catch (e) {
    console.warn('[tokenHelper] Trading API GetMyeBaySelling exception:', e.message || e);
  }

  // 2. Also try Sell Inventory API to capture inventory-model listings
  try {
    const invRes = await fetchWithTimeout(`${restBase}/sell/inventory/v1/inventory_item?limit=100&offset=0`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }, 10000);

    if (invRes.ok) {
      const invData = await invRes.json();
      const inventoryItems = invData.inventoryItems || [];

      for (const inv of inventoryItems) {
        try {
          const offerRes = await fetchWithTimeout(
            `${restBase}/sell/inventory/v1/offer?sku=${encodeURIComponent(inv.sku)}&limit=1`,
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
            5000
          );
          if (offerRes.ok) {
            const offerData = await offerRes.json();
            const offer = offerData.offers?.[0];
            const listingId = offer?.listingId || null;
            const key = listingId || inv.sku;
            if (!listingsMap.has(key)) {
              listingsMap.set(key, {
                sku: inv.sku,
                listing_id: listingId,
                title: inv.product?.title || '',
                condition: inv.condition || 'Active',
                price: parseFloat(offer?.pricingSummary?.price?.value || '0'),
                quantity: inv.availability?.shipToLocationAvailability?.quantity || 1,
                status: offer?.status || 'Active',
                image_url: normalizeHttps(inv.product?.imageUrls?.[0]) || null,
                listing_url: listingId ? `https://www.ebay.com/itm/${listingId}` : null
              });
            }
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[tokenHelper] Sell Inventory API exception:', e);
  }

  return Array.from(listingsMap.values());
}

/**
 * Calculates eBay category-specific final value fee rate and flat fee.
 *
 * T-10 item 8: the rates and category IDs now live in the versioned schedule at
 * utils/ebayFeeSchedule.js. This function is kept as the module-local entry
 * point so existing callers do not change, and it now also returns which
 * schedule produced the numbers, so an estimate can be audited later.
 *
 * @param {string|null} categoryId
 * @param {string|null} categoryName
 * @param {number} currentPrice
 * @returns {{ fee_pct: number, flat_fee: number, category_tier: string,
 *             category_tier_id: string, schedule_version: string,
 *             schedule_effective_date: string }}
 */
export function calculateEbayCategoryFees(categoryId, categoryName, currentPrice = 0) {
  return resolveEbayCategoryFees(categoryId, categoryName, currentPrice, {
    defaultFeePct: DEFAULT_PLATFORM_FEE_PCT
  });
}

/**
 * Returns the eBay fee schedule in force today. Exposed so operators can see
 * which version produced recent estimates.
 */
export { getActiveFeeSchedule };

/**
 * Fetches expanded details for a single eBay listing by its 12-digit ItemID.
 * Queries the eBay Trading API (GetItem) with ReturnAll detail level.
 *
 * @param {object} env
 * @param {string} accessToken
 * @param {string} listingId - 12-digit eBay ItemID
 * @returns {Promise<object|null>} Expanded listing details object
 */
export async function fetchSingleEbayListing(env, accessToken, listingId, campaignCache = null) {
  if (!listingId) return null;
  const cleanId = String(listingId).trim();
  const isSandbox = isEbaySandbox(env);
  const tradingBase = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  try {
    const xmlReq = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${cleanId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

    const res = await fetchWithTimeout(tradingBase, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlReq
    }, 10000);

    if (res.ok) {
      const xmlText = await res.text();
      const itemId = extractXmlTag(xmlText, 'ItemID');
      const title = extractXmlTag(xmlText, 'Title');
      const currentPriceStr = extractXmlTag(xmlText, 'CurrentPrice') || extractXmlTag(xmlText, 'BuyItNowPrice') || '0';
      const price = parseFloat(currentPriceStr) || 0;
      const startTime = extractXmlTag(xmlText, 'StartTime');
      const listingStatus = extractXmlTag(xmlText, 'ListingStatus') || 'Active';
      const qtyStr = extractXmlTag(xmlText, 'QuantityAvailable') || extractXmlTag(xmlText, 'Quantity') || '1';
      const qtySoldStr = extractXmlTag(xmlText, 'QuantitySold') || '0';
      const sku = extractXmlTag(xmlText, 'SKU') || null;
      const listingType = extractXmlTag(xmlText, 'ListingType') || 'FixedPriceItem';

      // Picture / Image details
      const galleryUrl = normalizeHttps(extractXmlTag(xmlText, 'GalleryURL'));
      const pictureUrls = [];
      const picRegex = /<PictureURL[^>]*>(.*?)<\/PictureURL>/g;
      let pMatch;
      while ((pMatch = picRegex.exec(xmlText)) !== null) {
        if (pMatch[1] && pMatch[1].trim()) {
          const norm = normalizeHttps(pMatch[1].trim());
          if (norm) pictureUrls.push(norm);
        }
      }
      const imageUrl = pictureUrls[0] || galleryUrl || null;

      // Category details
      const categoryId = extractXmlTag(xmlText, 'CategoryID');
      const categoryName = extractXmlTag(xmlText, 'CategoryName');
      const feeStructure = calculateEbayCategoryFees(categoryId, categoryName, price);

      // Shipping details (Free shipping vs Buyer pays flat/calculated)
      let isFreeShipping = false;
      let buyerShippingCost = 0;
      let shippingService = 'Standard Shipping';

      // 1. Direct FreeShipping boolean tag
      const freeShippingMatch = xmlText.match(/<FreeShipping[^>]*>(.*?)<\/FreeShipping>/i);
      if (freeShippingMatch && freeShippingMatch[1].trim().toLowerCase() === 'true') {
        isFreeShipping = true;
      }

      // 2. Direct ShippingServiceCost tags (e.g. <ShippingServiceCost currencyID="USD">15.95</ShippingServiceCost>)
      const shippingCostMatch = xmlText.match(/<ShippingServiceCost[^>]*>([0-9.]+)<\/ShippingServiceCost>/i) ||
                                xmlText.match(/<ShippingCost[^>]*>([0-9.]+)<\/ShippingCost>/i) ||
                                xmlText.match(/<FlatShippingRate[^>]*>([0-9.]+)<\/FlatShippingRate>/i);
      if (shippingCostMatch) {
        const parsedCost = parseFloat(shippingCostMatch[1]);
        if (parsedCost > 0) {
          buyerShippingCost = parsedCost;
          isFreeShipping = false;
        } else if (parsedCost === 0) {
          isFreeShipping = true;
        }
      }

      // 3. Business Policies Shipping Profile Name (e.g. "Flat Rate $15.95 (2 listings)" or "$15.95 Flat")
      const profileNameMatch = xmlText.match(/<ShippingProfileName[^>]*>(.*?)<\/ShippingProfileName>/i) ||
                               xmlText.match(/<SellerShippingProfile[^>]*>[\s\S]*?<ShippingProfileName[^>]*>(.*?)<\/ShippingProfileName>/i);
      if (profileNameMatch) {
        const pName = profileNameMatch[1].trim();
        if (pName.toLowerCase().includes('free')) {
          isFreeShipping = true;
          buyerShippingCost = 0;
        } else {
          const dollarMatch = pName.match(/\$([0-9]+(?:\.[0-9]{2})?)/) || pName.match(/(?:^|\s)([0-9]+(?:\.[0-9]{2}))(?:\s|$)/);
          if (dollarMatch) {
            const val = parseFloat(dollarMatch[1]);
            if (val > 0) {
              buyerShippingCost = val;
              isFreeShipping = false;
            }
          }
        }
      }

      // 4. Any ShippingDetails block containing currency/price
      if (buyerShippingCost === 0 && !isFreeShipping) {
        const shipBlockMatch = xmlText.match(/<ShippingDetails[\s>][\s\S]*?<\/ShippingDetails>/i);
        if (shipBlockMatch) {
          const block = shipBlockMatch[0];
          const costInBlock = block.match(/<ShippingServiceCost[^>]*>([0-9.]+)<\/ShippingServiceCost>/i) ||
                              block.match(/>\$?([0-9]+\.[0-9]{2})</);
          if (costInBlock) {
            const val = parseFloat(costInBlock[1]);
            if (val > 0) {
              buyerShippingCost = val;
              isFreeShipping = false;
            }
          }
        }
      }

      // 5. Try Browse API for exact buyer-facing shipping cost if not yet found
      if (buyerShippingCost === 0 && !isFreeShipping) {
        try {
          const browseUrl = isSandbox
            ? `https://api.sandbox.ebay.com/buy/browse/v1/item/v1|${cleanId}|0`
            : `https://api.ebay.com/buy/browse/v1/item/v1|${cleanId}|0`;
          const browseRes = await fetchWithTimeout(browseUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
              'Content-Type': 'application/json'
            }
          }, 8000);
          if (browseRes.ok) {
            const bData = await browseRes.json();
            if (bData.shippingOptions && bData.shippingOptions.length > 0) {
              const shipOpt = bData.shippingOptions[0];
              if (shipOpt.shippingCost?.value) {
                const sc = parseFloat(shipOpt.shippingCost.value);
                if (sc > 0) {
                  buyerShippingCost = sc;
                  isFreeShipping = false;
                } else if (sc === 0 || shipOpt.shippingCostType === 'FREE') {
                  isFreeShipping = true;
                }
              }
            }
          }
        } catch (_) {}
      }

      // 6. Try Sell Account Fulfillment Policy API if buyer shipping cost still 0
      if (buyerShippingCost === 0 && !isFreeShipping) {
        try {
          const policyUrl = isSandbox
            ? `https://api.sandbox.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`
            : `https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`;
          const polRes = await fetchWithTimeout(policyUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
          }, 8000);
          if (polRes.ok) {
            const polData = await polRes.json();
            const policies = polData.fulfillmentPolicies || [];
            const profileIdMatch = xmlText.match(/<ShippingProfileID[^>]*>([0-9]+)<\/ShippingProfileID>/i);
            const profileId = profileIdMatch ? profileIdMatch[1] : null;

            for (const pol of policies) {
              if (profileId && pol.fulfillmentPolicyId === profileId) {
                const costVal = pol.shippingOptions?.[0]?.shippingServices?.[0]?.shippingCost?.value;
                if (costVal && parseFloat(costVal) > 0) {
                  buyerShippingCost = parseFloat(costVal);
                  isFreeShipping = false;
                  break;
                }
              }
              if (pol.name && (pol.name.includes('Flat Rate') || pol.name.includes('$'))) {
                const dm = pol.name.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
                if (dm && parseFloat(dm[1]) > 0) {
                  const costVal = pol.shippingOptions?.[0]?.shippingServices?.[0]?.shippingCost?.value || dm[1];
                  if (costVal && parseFloat(costVal) > 0) {
                    buyerShippingCost = parseFloat(costVal);
                    isFreeShipping = false;
                    break;
                  }
                }
              }
            }
          }
        } catch (_) {}
      }

      const serviceMatch = xmlText.match(/<ShippingService[^>]*>(.*?)<\/ShippingService>/i);
      if (serviceMatch) {
        shippingService = serviceMatch[1].trim();
      }

      // Item Specifics (Athlete, Cert Number, Grader/Authenticator, Sport)
      const specifics = {};
      let athlete = null;
      let certNumber = null;
      let authenticator = null;
      let sport = null;

      const nvRegex = /<NameValueList>([\s\S]*?)<\/NameValueList>/g;
      let nvMatch;
      while ((nvMatch = nvRegex.exec(xmlText)) !== null) {
        const block = nvMatch[1];
        const n = extractXmlTag(block, 'Name');
        const v = extractXmlTag(block, 'Value');
        if (n && v) {
          const key = n.toLowerCase().trim();
          specifics[key] = v.trim();
          
          if (key === 'athlete' || key.includes('player')) athlete = v.trim();
          if (key.includes('cert') || key.includes('certification number')) certNumber = v.trim();
          if (key.includes('authenticator') || key.includes('professional grader')) authenticator = v.trim();
          if (key === 'sport') sport = v.trim();
        }
      }

      // Auto-detect active Promoted Listings ad rate (Trading API XML + Marketing API)
      let autoPromotedRate = null;
      let promotedRateSource = null;

      // 1. Check Trading API response XML for any embedded ad rate / promoted rate tags
      const xmlRateMatch = xmlText.match(/<(?:BidPercentage|AdRate|PromotedRate|AdPercentage)[^>]*>([0-9.]+)<\/(?:BidPercentage|AdRate|PromotedRate|AdPercentage)>/i) ||
                           xmlText.match(/<PromotedListing[^>]*>[\s\S]*?<BidPercentage[^>]*>([0-9.]+)<\/BidPercentage>/i);
      if (xmlRateMatch) {
        const r = parseFloat(xmlRateMatch[1]);
        if (r > 0) {
          autoPromotedRate = r;
          promotedRateSource = 'trading_xml';
        }
      }

      // 2. Query eBay Marketing API (Promoted Listings Standard)
      if (autoPromotedRate == null) {
        try {
          const mktBase = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
          if (!campaignCache) campaignCache = new Map();

          let campaigns = null;
          let campPromise = campaignCache.get('__campaigns__');
          if (campPromise) {
            campaigns = campPromise instanceof Promise ? await campPromise : campPromise;
          } else {
            const fetchCamp = (async () => {
              const campRes = await fetchWithTimeout(`${mktBase}/sell/marketing/v1/ad_campaign?limit=50`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: 'application/json',
                  'Content-Type': 'application/json'
                }
              }, 8000);

              if (campRes.ok) {
                const campData = await campRes.json();
                return campData.campaigns || [];
              }
              return [];
            })();

            campaignCache.set('__campaigns__', fetchCamp);
            campaigns = await fetchCamp;
            campaignCache.set('__campaigns__', campaigns);
          }

          if (campaigns && campaigns.length > 0) {
            for (const camp of campaigns) {
              if (!camp.campaignId) continue;

              // Check in-memory campaignCache first for this campaignId (HIGH-8)
              if (campaignCache.has(camp.campaignId)) {
                let cachedVal = campaignCache.get(camp.campaignId);
                if (cachedVal instanceof Promise) {
                  cachedVal = await cachedVal;
                }
                const cachedRate = (typeof cachedVal === 'object' && cachedVal.adsByListing && cachedVal.adsByListing[cleanId])
                  ? cachedVal.adsByListing[cleanId]
                  : (typeof cachedVal === 'object' ? cachedVal.promotedRate : cachedVal);
                if (cachedRate != null && cachedRate > 0) {
                  autoPromotedRate = cachedRate;
                  promotedRateSource = (typeof cachedVal === 'object' && cachedVal.promotedRateSource) || 'ad_level';
                  break;
                }
              }

              // In-flight deduplication / discovery promise for this campaign
              const discoverAdPromise = (async () => {
                let foundRate = null;
                let foundSource = null;
                const adsByListing = {};

                // 1. Query campaign ads specifically for this listing ID (using singular listing_id query parameter)
                try {
                  const adRes = await fetchWithTimeout(`${mktBase}/sell/marketing/v1/ad_campaign/${camp.campaignId}/ad?listing_id=${cleanId}`, {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      Accept: 'application/json',
                      'Content-Type': 'application/json'
                    }
                  }, 8000);
                  if (adRes.ok) {
                    const adData = await adRes.json();
                    const ads = adData.ads || [];
                    for (const a of ads) {
                      if (a.listingId && a.bidPercentage) {
                        const r = parseFloat(a.bidPercentage);
                        if (r > 0) adsByListing[String(a.listingId).trim()] = r;
                      }
                    }
                    const matchedAd = ads.find(a => String(a.listingId) === cleanId || String(a.listingId).includes(cleanId));
                    if (matchedAd?.bidPercentage) {
                      const r = parseFloat(matchedAd.bidPercentage);
                      if (r > 0) {
                        foundRate = r;
                        foundSource = 'ad_level';
                      }
                    }
                  }
                } catch (_) {}

                // 2. Also check campaign ads collection up to limit 200
                if (foundRate == null) {
                  try {
                    const checkAds = await fetchWithTimeout(`${mktBase}/sell/marketing/v1/ad_campaign/${camp.campaignId}/ad?limit=200`, {
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                      }
                    }, 8000);
                    if (checkAds.ok) {
                      const checkData = await checkAds.json();
                      const ads = checkData.ads || [];
                      for (const a of ads) {
                        if (a.listingId && a.bidPercentage) {
                          const rate = parseFloat(a.bidPercentage);
                          if (rate > 0) adsByListing[String(a.listingId).trim()] = rate;
                        }
                      }
                      const specificAd = ads.find(a => String(a.listingId) === cleanId || String(a.listingId).includes(cleanId));
                      if (specificAd?.bidPercentage) {
                        const r = parseFloat(specificAd.bidPercentage);
                        if (r > 0) {
                          foundRate = r;
                          foundSource = 'ad_level';
                        }
                      } else if (Object.keys(adsByListing).length > 0) {
                        foundRate = Object.values(adsByListing)[0];
                        foundSource = 'ad_level';
                      }
                    }
                  } catch (_) {}
                }

                // 3. Fallback to campaign funding strategy bidPercentage (e.g. campaign-level 7.0%)
                if (foundRate == null && camp.fundingStrategy?.bidPercentage) {
                  const r = parseFloat(camp.fundingStrategy.bidPercentage);
                  if (r > 0) {
                    foundRate = r;
                    foundSource = 'campaign_default';
                  }
                }

                return {
                  promotedRate: foundRate,
                  promotedRateSource: foundSource,
                  adsByListing
                };
              })();

              campaignCache.set(camp.campaignId, discoverAdPromise);
              const result = await discoverAdPromise;
              campaignCache.set(camp.campaignId, result);

              const chosenRate = (result.adsByListing && result.adsByListing[cleanId])
                ? result.adsByListing[cleanId]
                : result.promotedRate;

              if (chosenRate != null && chosenRate > 0) {
                autoPromotedRate = chosenRate;
                promotedRateSource = result.promotedRateSource || 'ad_level';
                break;
              }
            }

            // If still null and there's exactly 1 campaign with a valid fundingStrategy rate, use it
            if (autoPromotedRate == null && campaigns.length > 0) {
              const candidate = campaigns.find(c => c.fundingStrategy?.bidPercentage && parseFloat(c.fundingStrategy.bidPercentage) > 0);
              if (candidate) {
                autoPromotedRate = parseFloat(candidate.fundingStrategy.bidPercentage);
                promotedRateSource = 'campaign_default';
                if (candidate.campaignId) {
                  const existing = campaignCache.get(candidate.campaignId) || {};
                  const adsByListing = (typeof existing === 'object' && existing.adsByListing) ? { ...existing.adsByListing } : {};
                  campaignCache.set(candidate.campaignId, { promotedRate: autoPromotedRate, promotedRateSource: 'campaign_default', adsByListing });
                }
              }
            }
          }
        } catch (mktErr) {
          console.warn('[tokenHelper] Marketing API query exception:', mktErr);
        }
      }

      if (itemId || title) {
        return {
          listing_id: itemId || cleanId,
          title: title || '',
          price: price,
          date_listed: startTime ? startTime.slice(0, 10) : new Date().toISOString().split('T')[0],
          status: (listingStatus === 'Completed' || listingStatus === 'Ended')
            ? ((parseInt(qtySoldStr, 10) || 0) > 0 ? 'Sold' : 'Unsold')
            : (listingStatus === 'Active' ? 'Listed' : 'Listed'),
          raw_status: listingStatus,
          quantity: parseInt(qtyStr, 10) || 1,
          quantity_sold: parseInt(qtySoldStr, 10) || 0,
          sku: sku,
          listing_type: listingType,
          promoted_rate: autoPromotedRate,
          promoted_rate_source: promotedRateSource,
          // Expanded Category & Fees
          category_id: categoryId,
          category_name: categoryName,
          platform_fee_pct: feeStructure.fee_pct,
          platform_flat_fee: feeStructure.flat_fee,
          category_tier: feeStructure.category_tier,
          // Expanded Shipping
          is_free_shipping: isFreeShipping,
          buyer_shipping_cost: buyerShippingCost,
          shipping_service: shippingService,
          // Expanded Specifics
          specifics: {
            athlete,
            cert_number: certNumber,
            authenticator,
            sport
          },
          image_url: imageUrl,
          picture_urls: pictureUrls,
          listing_url: `https://www.ebay.com/itm/${itemId || cleanId}`
        };
      }
    }
  } catch (e) {
    console.warn(`[tokenHelper] GetItem for ${cleanId} failed:`, e);
  }

  // Fallback: Check if item is in the active listings collection
  const allListings = await fetchEbayActiveSellerListings(env, accessToken);
  const found = allListings.find(l => String(l.listing_id) === cleanId || String(l.sku) === cleanId);
  if (found) {
    const feeStructure = calculateEbayCategoryFees(null, found.title, found.price || 0);
    return {
      listing_id: found.listing_id || cleanId,
      title: found.title || '',
      price: found.price || 0,
      date_listed: new Date().toISOString().split('T')[0],
      status: (found.status === 'Completed' || found.status === 'Ended')
        ? (found.quantity_sold > 0 ? 'Sold' : 'Unsold')
        : (found.status === 'Active' ? 'Listed' : (found.status || 'Listed')),
      quantity: found.quantity || 1,
      quantity_sold: 0,
      sku: found.sku,
      listing_type: 'FixedPriceItem',
      category_id: null,
      category_name: null,
      platform_fee_pct: feeStructure.fee_pct,
      platform_flat_fee: feeStructure.flat_fee,
      category_tier: feeStructure.category_tier,
      is_free_shipping: true,
      buyer_shipping_cost: 0,
      shipping_service: 'Standard',
      specifics: {},
      listing_url: found.listing_url || `https://www.ebay.com/itm/${cleanId}`
    };
  }

  return null;
}

export function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Updates the Custom Label (SKU) on an existing eBay listing using Trading API ReviseFixedPriceItem / ReviseItem.
 *
 * @param {object} env - Cloudflare Worker env
 * @param {string} accessToken - eBay user OAuth access token
 * @param {string} listingId - eBay Item ID (12 digits)
 * @param {string} sku - Custom Label / SKU string (max 50 chars)
 * @returns {Promise<{ success: boolean, message?: string, ack?: string }>}
 */
export async function updateEbayListingSku(env, accessToken, listingId, sku) {
  const cleanId = String(listingId).replace(/[^0-9]/g, '');
  if (!cleanId) throw new Error('Invalid eBay Listing ID');
  const cleanSku = String(sku || '').trim().slice(0, 50);
  if (!cleanSku) throw new Error('SKU cannot be empty');

  const isSandbox = isEbaySandbox(env);
  const tradingEndpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const makeXml = (callName) => `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${xmlEscape(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${xmlEscape(cleanId)}</ItemID>
    <SKU>${xmlEscape(cleanSku)}</SKU>
  </Item>
</${callName}Request>`;

  // 1. Try ReviseFixedPriceItem first
  let res = await fetchWithTimeout(tradingEndpoint, {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml'
    },
    body: makeXml('ReviseFixedPriceItem')
  }, 15000);

  let text = await res.text();
  let ack = extractXmlTag(text, 'Ack') || 'Failure';

  // 2. If item is an Auction format, try ReviseItem
  if (ack !== 'Success' && ack !== 'Warning') {
    res = await fetchWithTimeout(tradingEndpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'ReviseItem',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: makeXml('ReviseItem')
    }, 15000);
    text = await res.text();
    ack = extractXmlTag(text, 'Ack') || 'Failure';
  }

  const errMsg = extractXmlTag(text, 'LongMessage') ||
                 extractXmlTag(text, 'ShortMessage') || null;

  if (ack === 'Success' || ack === 'Warning') {
    return { success: true, message: `SKU '${cleanSku}' successfully pushed to eBay listing #${cleanId}`, ack };
  } else {
    throw new Error(errMsg || `eBay returned Ack=${ack} when updating SKU`);
  }
}

/**
 * Updates the Buy-It-Now or Start Price on an active eBay listing via the eBay Trading API
 * (ReviseFixedPriceItem / ReviseItem).
 *
 * @param {object} env
 * @param {string} accessToken
 * @param {string} listingId - 12-digit numeric eBay Item ID
 * @param {number|string} newPrice - Target price in USD
 * @returns {Promise<{ success: boolean, message?: string, ack?: string, price: string }>}
 */
export async function updateEbayListingPrice(env, accessToken, listingId, newPrice) {
  const cleanId = String(listingId).replace(/[^0-9]/g, '');
  if (!cleanId) throw new Error('Invalid eBay Listing ID');
  const numPrice = Number(newPrice);
  if (isNaN(numPrice) || numPrice <= 0) throw new Error('Price must be a positive number');
  const formattedPrice = numPrice.toFixed(2);

  const isSandbox = isEbaySandbox(env);
  const tradingEndpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const makePriceXml = (callName) => `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${xmlEscape(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${xmlEscape(cleanId)}</ItemID>
    <StartPrice currencyID="USD">${formattedPrice}</StartPrice>
  </Item>
</${callName}Request>`;

  // 1. Try ReviseFixedPriceItem first
  let res = await fetchWithTimeout(tradingEndpoint, {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml'
    },
    body: makePriceXml('ReviseFixedPriceItem')
  }, 15000);

  let text = await res.text();
  let ack = extractXmlTag(text, 'Ack') || 'Failure';

  // 2. Fallback to ReviseItem if listing format is auction
  if (ack !== 'Success' && ack !== 'Warning') {
    res = await fetchWithTimeout(tradingEndpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'ReviseItem',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: makePriceXml('ReviseItem')
    }, 15000);
    text = await res.text();
    ack = extractXmlTag(text, 'Ack') || 'Failure';
  }

  const errMsg = extractXmlTag(text, 'LongMessage') ||
                 extractXmlTag(text, 'ShortMessage') || null;

  if (ack === 'Success' || ack === 'Warning') {
    return { success: true, message: `Price successfully updated to $${formattedPrice} on eBay listing #${cleanId}`, ack, price: formattedPrice };
  } else {
    throw new Error(errMsg || `eBay returned Ack=${ack} when revising price`);
  }
}

/**
 * Creates a new fixed-price Buy-It-Now listing on eBay via Trading API (AddFixedPriceItem).
 *
 * @param {object} env - Cloudflare Worker env
 * @param {string} accessToken - eBay user OAuth access token
 * @param {object} listingData - Listing parameters:
 *   - title: string (max 80 chars)
 *   - descriptionHtml: string (HTML body)
 *   - price: number|string
 *   - sku?: string
 *   - categoryId?: string
 *   - conditionId?: string|number
 *   - condition?: string
 *   - imageUrl?: string (or pictureUrls?: string[])
 *   - isFreeShipping?: boolean
 *   - buyerShippingCost?: number
 *   - postalCode?: string
 *   - quantity?: number
 *   - brand?: string
 *   - specifics?: Array<{ name: string, value: string }> | object
 * @returns {Promise<{ success: boolean, listing_id: string, ebay_url: string, price: string, title: string, ack: string }>}
 */
/**
 * Truncates a raw listing title to eBay's 80-character limit at word boundaries.
 */
function normalizeTradingTitle(rawTitle) {
  let title = String(rawTitle || '').trim();
  if (title.length > 80) {
    const truncated = title.substring(0, 80);
    const lastSpace = truncated.lastIndexOf(' ');
    title = (lastSpace > 40 ? truncated.substring(0, lastSpace) : truncated).trim();
  }
  return title;
}

/**
 * Resolves numeric eBay ConditionID from explicit ID or human-readable condition text.
 */
function resolveEbayConditionId(explicitId, conditionText) {
  if (explicitId) return String(explicitId);
  const c = String(conditionText || '').toLowerCase();
  if (c.includes('brand new') || c === 'new' || c.includes('unopened') || c.includes('in box')) {
    return '1000';
  }
  if (c.includes('like new') || c.includes('near mint') || c.includes('mint')) {
    return '2750';
  }
  if (c.includes('open box')) return '1500';
  if (c.includes('very good')) return '4000';
  if (c.includes('good')) return '5000';
  if (c.includes('acceptable')) return '6000';
  if (c.includes('part') || c.includes('repair')) return '7000';
  return c.includes('used') ? '3000' : '1000';
}

/**
 * Builds ItemSpecifics XML from core listing attributes and custom specifics pairs.
 */
function resolveEbayObjectType(listingData = {}) {
  const explicit = String(listingData.objectType || listingData.object_type || '').trim();
  if (explicit) return explicit;

  const text = `${listingData.productType || ''} ${listingData.title || ''} ${listingData.category || ''}`;
  const patterns = [
    [/\bjersey\b/i, 'Jersey'],
    [/\b(?:guitar|pickguard)\b/i, 'Guitar'],
    [/\bhelmet\b/i, 'Helmet'],
    [/\b(?:photo|photograph|8x10|11x14|16x20)\b/i, 'Photo'],
    [/\bfootball\b/i, 'Football'],
    [/\bbasketball\b/i, 'Basketball'],
    [/\bbaseball\b/i, 'Baseball'],
    [/\bbat\b/i, 'Bat'],
    [/\bpuck\b/i, 'Puck'],
    [/\b(?:trading\s*card|card)\b/i, 'Trading Card'],
    [/\b(?:poster|print|lithograph)\b/i, 'Poster'],
    [/\b(?:vinyl|record|lp|album)\b/i, 'Record'],
    [/\bcd\b/i, 'CD'],
    [/\b(?:hat|cap)\b/i, 'Hat'],
    [/\bglove\b/i, 'Glove'],
    [/\bdrumhead\b/i, 'Drumhead'],
    [/\bbook\b/i, 'Book'],
    [/\bmagazine\b/i, 'Magazine'],
    [/\b(?:funko|figure)\b/i, 'Figure']
  ];
  for (const [re, label] of patterns) {
    if (re.test(text)) return label;
  }

  const pt = String(listingData.productType || '').trim();
  if (pt && !/^(?:general|memorabilia|autographs?|collectibles?|other)$/i.test(pt)) {
    return pt;
  }
  if (listingData.authenticator || /\b(?:signed|autograph|autographed)\b/i.test(text)) {
    return 'Other';
  }
  return '';
}

function buildEbayItemSpecificsXml(listingData = {}, cleanSku = '') {
  const specificsList = [];
  const brandVal = listingData.brand || 'Unbranded';
  specificsList.push({ name: 'Brand', value: brandVal });
  if (cleanSku) specificsList.push({ name: 'MPN', value: cleanSku });
  if (listingData.productType) specificsList.push({ name: 'Type', value: listingData.productType });
  const objectType = resolveEbayObjectType(listingData);
  if (objectType) specificsList.push({ name: 'Object Type', value: objectType });
  if (listingData.sport) specificsList.push({ name: 'Sport', value: listingData.sport });
  if (listingData.athlete) specificsList.push({ name: 'Player/Athlete', value: listingData.athlete });
  if (listingData.team) specificsList.push({ name: 'Team', value: listingData.team });
  if (listingData.size) specificsList.push({ name: 'Size', value: listingData.size });
  if (listingData.authenticator) {
    specificsList.push({ name: 'Autograph Authentication', value: listingData.authenticator });
    specificsList.push({ name: 'Professional Grader', value: listingData.authenticator });
  }
  if (listingData.authType) specificsList.push({ name: 'Autograph Format', value: listingData.authType });
  if (listingData.certNumber) specificsList.push({ name: 'Certification Number', value: String(listingData.certNumber) });
  if (listingData.framingStatus && listingData.framingStatus !== 'Unframed') {
    specificsList.push({ name: 'Framed', value: /^framed/i.test(listingData.framingStatus) ? 'Yes' : listingData.framingStatus });
  }
  if (listingData.color) specificsList.push({ name: 'Color', value: listingData.color });
  if (listingData.inkColor) specificsList.push({ name: 'Ink Color', value: listingData.inkColor });
  if (listingData.cardYear) specificsList.push({ name: 'Season', value: String(listingData.cardYear) });
  if (listingData.cardNumber) specificsList.push({ name: 'Card Number', value: String(listingData.cardNumber) });
  if (listingData.cardGrade) specificsList.push({ name: 'Grade', value: String(listingData.cardGrade) });

  if (Array.isArray(listingData.specifics)) {
    for (const spec of listingData.specifics) {
      if (spec?.name && spec?.value) {
        if (!specificsList.some(s => s.name.toLowerCase() === spec.name.toLowerCase())) {
          specificsList.push({ name: spec.name, value: spec.value });
        }
      } else if (spec?.label && spec?.value) {
        if (!specificsList.some(s => s.name.toLowerCase() === spec.label.toLowerCase())) {
          specificsList.push({ name: spec.label, value: spec.value });
        }
      }
    }
  } else if (listingData.specifics && typeof listingData.specifics === 'object') {
    for (const [k, v] of Object.entries(listingData.specifics)) {
      if (k && v && !specificsList.some(s => s.name.toLowerCase() === k.toLowerCase())) {
        specificsList.push({ name: k, value: String(v) });
      }
    }
  }

  if (specificsList.length === 0) return '';
  return `
    <ItemSpecifics>
      ${specificsList.map(s => `<NameValueList><Name>${xmlEscape(s.name)}</Name><Value>${xmlEscape(s.value)}</Value></NameValueList>`).join('\n      ')}
    </ItemSpecifics>`;
}

/**
 * Extracts the highest-severity Trading API ErrorCode and LongMessage from XML response.
 */
function extractTradingApiError(xmlText, fallbackMsg) {
  const errBlocks = xmlText.match(/<Errors[\s>][\s\S]*?<\/Errors>/gi) || [];
  let chosenBlock = errBlocks.find(b => /<SeverityCode>\s*Error\s*<\/SeverityCode>/i.test(b)) || errBlocks[0] || xmlText;
  const errCode = extractXmlTag(chosenBlock, 'ErrorCode') || extractXmlTag(xmlText, 'ErrorCode');
  const errMsg = extractXmlTag(chosenBlock, 'LongMessage') ||
                 extractXmlTag(chosenBlock, 'ShortMessage') ||
                 extractXmlTag(xmlText, 'LongMessage') ||
                 extractXmlTag(xmlText, 'ShortMessage') ||
                 fallbackMsg;
  return { errCode, errMsg };
}

/**
 * Resolves Business Policies (Shipping, Return, Payment) via eBay Sell Account API.
 * Returns null if seller is not opted into Business Policies or policies are incomplete.
 */
async function resolveSellerBusinessProfiles(env, accessToken, { isFreeShipping, buyerShippingCost }) {
  const restBase = getEbayApiBase(env);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  try {
    const [fulfillRes, returnRes, paymentRes] = await Promise.allSettled([
      fetchWithTimeout(`${restBase}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, { headers }, 6000),
      fetchWithTimeout(`${restBase}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, { headers }, 6000),
      fetchWithTimeout(`${restBase}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, { headers }, 6000)
    ]);

    const parseJsonSafe = async (settled) => {
      if (settled.status !== 'fulfilled' || !settled.value?.ok) return null;
      const text = await settled.value.text().catch(() => '');
      if (!text || text.trim().startsWith('<')) return null;
      try { return JSON.parse(text); } catch (_) { return null; }
    };

    const [fulfillData, returnData, paymentData] = await Promise.all([
      parseJsonSafe(fulfillRes),
      parseJsonSafe(returnRes),
      parseJsonSafe(paymentRes)
    ]);

    const excludeMotorsOnly = (list) => {
      const filtered = (list || []).filter(p => !(p.categoryTypes || []).every(c => c.name === 'MOTORS_VEHICLES'));
      return filtered.length > 0 ? filtered : (list || []);
    };

    const fulfillPolicies = excludeMotorsOnly(fulfillData?.fulfillmentPolicies);
    const returnPolicies = excludeMotorsOnly(returnData?.returnPolicies);
    const paymentPolicies = excludeMotorsOnly(paymentData?.paymentPolicies);

    if (fulfillPolicies.length === 0 || returnPolicies.length === 0 || paymentPolicies.length === 0) {
      return null;
    }

    // Filter out freight-only fulfillment policies and locate domestic option
    const domesticPolicies = fulfillPolicies.filter(p =>
      !p.freightShipping &&
      (p.shippingOptions || []).some(o => o.optionType === 'DOMESTIC')
    );
    const candidateFulfill = domesticPolicies.length > 0 ? domesticPolicies : fulfillPolicies;

    const getDomesticOption = (p) => (p.shippingOptions || []).find(o => o.optionType === 'DOMESTIC') || p.shippingOptions?.[0];
    const getFirstServiceCost = (p) => {
      const dom = getDomesticOption(p);
      const svc = dom?.shippingServices?.[0];
      if (!svc) return null;
      if (svc.freeShipping === true) return 0;
      const val = parseFloat(svc.shippingCost?.value);
      return Number.isFinite(val) ? val : null;
    };
    const isFlatRate = (p) => getDomesticOption(p)?.costType === 'FLAT_RATE';

    let chosenFulfill = null;
    if (isFreeShipping) {
      chosenFulfill = candidateFulfill.find(p => {
        const dom = getDomesticOption(p);
        const svc = dom?.shippingServices?.[0];
        return svc?.freeShipping === true || getFirstServiceCost(p) === 0 || /\bfree\b/i.test(p.name || '');
      });
    } else if (buyerShippingCost > 0) {
      const targetStr = `$${Number(buyerShippingCost).toFixed(2)}`;
      chosenFulfill = candidateFulfill.find(p => {
        const cost = getFirstServiceCost(p);
        return isFlatRate(p) && ((cost != null && Math.abs(cost - buyerShippingCost) <= 0.05) || (p.name || '').includes(targetStr));
      });
    }

    if (!chosenFulfill) {
      chosenFulfill = candidateFulfill.find(p => isFlatRate(p) && (p.categoryTypes || []).some(c => c.default))
        || candidateFulfill.find(p => isFlatRate(p))
        || candidateFulfill.find(p => (p.categoryTypes || []).some(c => c.default))
        || candidateFulfill[0];
    }

    const chosenReturn = returnPolicies.find(p => (p.categoryTypes || []).some(c => c.default)) || returnPolicies[0];
    const chosenPayment = paymentPolicies.find(p => (p.categoryTypes || []).some(c => c.default)) || paymentPolicies[0];

    if (!chosenFulfill?.fulfillmentPolicyId || !chosenReturn?.returnPolicyId || !chosenPayment?.paymentPolicyId) {
      return null;
    }

    const domOpt = getDomesticOption(chosenFulfill);
    return {
      shipping: {
        id: chosenFulfill.fulfillmentPolicyId,
        name: chosenFulfill.name || 'Default Shipping',
        isCalculated: domOpt?.costType === 'CALCULATED'
      },
      returnPolicy: {
        id: chosenReturn.returnPolicyId,
        name: chosenReturn.name || 'Default Returns'
      },
      payment: {
        id: chosenPayment.paymentPolicyId,
        name: chosenPayment.name || 'Default Payment'
      }
    };
  } catch (e) {
    console.warn('[tokenHelper] Business Policies lookup fallback:', e.message || e);
    return null;
  }
}

/**
 * Queries eBay Trading API GeteBayDetails for a currently active domestic Flat-rate ShippingService.
 */
async function discoverTradingFlatShippingService(tradingEndpoint, accessToken) {
  try {
    const detailsXml = `<?xml version="1.0" encoding="utf-8"?>
<GeteBayDetailsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${xmlEscape(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <DetailName>ShippingServiceDetails</DetailName>
</GeteBayDetailsRequest>`;

    const res = await fetchWithTimeout(tradingEndpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GeteBayDetails',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: detailsXml
    }, 10000);

    if (!res.ok) return null;
    const xml = await res.text();
    const blocks = xml.match(/<ShippingServiceDetails[\s>][\s\S]*?<\/ShippingServiceDetails>/gi) || [];
    const candidates = [];
    for (const b of blocks) {
      const valid = /<ValidForSellingFlow>\s*true\s*<\/ValidForSellingFlow>/i.test(b);
      const isIntl = /<InternationalService>\s*true\s*<\/InternationalService>/i.test(b);
      const isFlat = /<ServiceType>\s*Flat\s*<\/ServiceType>/i.test(b);
      if (!valid || isIntl || !isFlat) continue;
      const code = extractXmlTag(b, 'ShippingService');
      const desc = extractXmlTag(b, 'Description') || '';
      if (code) candidates.push({ code, desc });
    }
    if (candidates.length === 0) return null;
    const preferred =
      candidates.find(c => /ground\s*advantage/i.test(c.desc) || c.code === 'USPSGroundAdvantage') ||
      candidates.find(c => c.code === 'ShippingMethodStandard') ||
      candidates.find(c => c.code === 'USPSPriority') ||
      candidates.find(c => c.code === 'USPSParcel') ||
      candidates[0];
    return preferred.code;
  } catch (_) {
    return null;
  }
}

/**
 * Revises an existing active eBay listing via Trading API (ReviseFixedPriceItem / ReviseItem).
 * Preserves existing live photos and shipping configuration unless explicitly requested.
 *
 * @param {object} env - Cloudflare Worker env
 * @param {string} accessToken - eBay user OAuth access token
 * @param {string} listingId - Existing 12-digit eBay ItemID
 * @param {object} listingData - Updated listing fields
 * @returns {Promise<{ success: boolean, action: string, listing_id: string, ebay_url: string, price: string, title: string, ack: string }>}
 */
export async function reviseEbayListing(env, accessToken, listingId, listingData = {}) {
  if (!accessToken) throw new Error('eBay access token is required');
  const cleanId = String(listingId || '').replace(/[^0-9]/g, '');
  if (!cleanId) throw new Error('Invalid eBay Listing ID');

  const title = listingData.title ? normalizeTradingTitle(listingData.title) : '';
  const numPrice = listingData.price != null ? Number(listingData.price) : null;
  if (numPrice !== null && (isNaN(numPrice) || numPrice <= 0)) {
    throw new Error('Listing price must be a positive number');
  }
  const formattedPrice = numPrice !== null ? numPrice.toFixed(2) : null;
  const cleanSku = String(listingData.sku || '').trim().slice(0, 50);

  const rawHtml = listingData.descriptionHtml || listingData.htmlBody || listingData.description || '';
  const cleanCdataHtml = rawHtml ? String(rawHtml).replace(/\]\]>/g, ']]&gt;') : '';

  const titleXml = title ? `<Title>${xmlEscape(title)}</Title>` : '';
  const descXml = cleanCdataHtml ? `<Description><![CDATA[${cleanCdataHtml}]]></Description>` : '';
  const priceXml = formattedPrice ? `<StartPrice currencyID="USD">${formattedPrice}</StartPrice>` : '';
  const conditionXml = (listingData.conditionId || listingData.condition)
    ? `<ConditionID>${resolveEbayConditionId(listingData.conditionId, listingData.condition)}</ConditionID>`
    : '';
  const explicitCategoryId = String(listingData.categoryId || listingData.category_id || '').trim();
  const categoryXml = explicitCategoryId
    ? `<PrimaryCategory><CategoryID>${xmlEscape(explicitCategoryId)}</CategoryID></PrimaryCategory>`
    : '';
  const skuXml = cleanSku ? `<SKU>${xmlEscape(cleanSku)}</SKU>` : '';
  const specificsXml = buildEbayItemSpecificsXml(listingData, cleanSku);

  const isSandbox = isEbaySandbox(env);
  const tradingEndpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const buildReviseXml = (callName, includeSpecifics = true) => `<?xml version="1.0" encoding="utf-8"?>
<${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${xmlEscape(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${xmlEscape(cleanId)}</ItemID>
    ${titleXml}
    ${descXml}
    ${priceXml}
    ${conditionXml}
    ${categoryXml}
    ${skuXml}${includeSpecifics ? specificsXml : ''}
  </Item>
</${callName}Request>`;

  const sendReviseCall = async (callName, includeSpecifics = true) => {
    const r = await fetchWithTimeout(tradingEndpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': callName,
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: buildReviseXml(callName, includeSpecifics)
    }, 20000);
    const bodyText = await r.text();
    return { text: bodyText, ack: extractXmlTag(bodyText, 'Ack') || 'Failure' };
  };

  let activeCallName = 'ReviseFixedPriceItem';
  let { text, ack } = await sendReviseCall(activeCallName, true);

  // Fallback to ReviseItem if existing listing is an Auction-format item
  if (ack !== 'Success' && ack !== 'Warning') {
    const firstErr = extractTradingApiError(text, '');
    if (/auction|fixed\s*price|ReviseItem/i.test(firstErr.errMsg || '')) {
      activeCallName = 'ReviseItem';
      ({ text, ack } = await sendReviseCall(activeCallName, true));
    }
  }

  // If a category-specific required ItemSpecific (e.g. 21919303) is still rejected,
  // retry without <ItemSpecifics> so the existing live eBay specifics are preserved.
  if (ack !== 'Success' && ack !== 'Warning' && specificsXml) {
    const specErr = extractTradingApiError(text, '');
    if (String(specErr.errCode) === '21919303') {
      ({ text, ack } = await sendReviseCall(activeCallName, false));
    }
  }

  if (ack === 'Success' || ack === 'Warning') {
    const returnedId = extractXmlTag(text, 'ItemID') || cleanId;
    return {
      success: true,
      action: 'revised',
      listing_id: returnedId,
      ebay_url: `https://www.ebay.com/itm/${returnedId}`,
      price: formattedPrice || '',
      title: title,
      ack
    };
  }

  const { errCode, errMsg } = extractTradingApiError(text, 'eBay returned an unknown error revising listing');
  const err = new Error(`[eBay ${errCode || 'Error'}] ${errMsg}`);
  err.ebayErrorCode = errCode;
  throw err;
}

/**
 * Creates a new fixed-price Buy-It-Now listing on eBay via Trading API (AddFixedPriceItem).
 * Automatically resolves seller Business Policies (SellerProfiles) when opted in, or uses
 * compliant inline flat-rate shipping with GeteBayDetails fallback on Error 37.
 *
 * @param {object} env - Cloudflare Worker env
 * @param {string} accessToken - eBay user OAuth access token
 * @param {object} listingData - Listing parameters
 * @returns {Promise<{ success: boolean, action: string, listing_id: string, ebay_url: string, price: string, title: string, ack: string }>}
 */
export async function createEbayListing(env, accessToken, listingData = {}) {
  if (!accessToken) throw new Error('eBay access token is required');

  const rawTitle = String(listingData.title || '').trim();
  if (!rawTitle) throw new Error('Listing title is required');

  const title = normalizeTradingTitle(rawTitle);

  const numPrice = Number(listingData.price);
  if (isNaN(numPrice) || numPrice <= 0) {
    throw new Error('Listing price must be a positive number');
  }
  const formattedPrice = numPrice.toFixed(2);

  const cleanSku = String(listingData.sku || '').trim().slice(0, 50);
  const conditionId = resolveEbayConditionId(listingData.conditionId, listingData.condition);

  // Category ID resolution
  let categoryId = String(listingData.categoryId || listingData.category_id || '').trim();
  if (!categoryId) {
    const cat = String(listingData.category || '').toLowerCase();
    const ttl = title.toLowerCase();
    if (cat.includes('card') || ttl.includes('card') || ttl.includes('psa') || ttl.includes('bgs') || ttl.includes('beckett')) {
      categoryId = '213';
    } else if (cat.includes('media') || cat.includes('book') || cat.includes('dvd')) {
      categoryId = '267';
    } else if (cat.includes('electronic') || cat.includes('computer')) {
      categoryId = '9355';
    } else {
      categoryId = '212';
    }
  }

  // Picture handling - eBay requires at least one PictureURL
  let pictureUrls = [];
  if (Array.isArray(listingData.pictureUrls) && listingData.pictureUrls.length > 0) {
    pictureUrls = listingData.pictureUrls.map(u => String(u).trim()).filter(Boolean);
  } else if (listingData.imageUrl || listingData.image_url) {
    pictureUrls = [String(listingData.imageUrl || listingData.image_url).trim()];
  }
  if (pictureUrls.length === 0) {
    pictureUrls = ['https://i.ebayimg.com/images/g/fe4AAeSwSO1q8G1~/s-l1600.webp'];
  }

  // Description handling - CDATA with safe closing tag escaping
  const rawHtml = listingData.descriptionHtml || listingData.htmlBody || listingData.description || `<p>${xmlEscape(title)}</p>`;
  const cleanCdataHtml = String(rawHtml).replace(/\]\]>/g, ']]&gt;');

  // Shipping & Policies
  const parsedShippingCost = Number(listingData.buyerShippingCost);
  const isFreeShipping = Boolean(
    listingData.isFreeShipping ||
    (Number.isFinite(parsedShippingCost) && parsedShippingCost <= 0)
  );
  const shippingCost = isFreeShipping
    ? '0.00'
    : (Number.isFinite(parsedShippingCost) && parsedShippingCost > 0 ? parsedShippingCost : 4.95).toFixed(2);
  const postalCode = listingData.postalCode || '95125';
  const quantity = Math.max(1, parseInt(listingData.quantity, 10) || 1);

  const isSandbox = isEbaySandbox(env);
  const tradingEndpoint = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  const picturesXml = pictureUrls
    .map(url => `<PictureURL>${xmlEscape(url)}</PictureURL>`)
    .join('\n      ');

  const specificsXml = buildEbayItemSpecificsXml(listingData, cleanSku);
  const skuXml = cleanSku ? `<SKU>${xmlEscape(cleanSku)}</SKU>` : '';

  // Detect seller Business Policies via Account API before building XML
  const sellerProfiles = await resolveSellerBusinessProfiles(env, accessToken, {
    isFreeShipping,
    buyerShippingCost: Number(shippingCost)
  });

  const buildAddXml = ({ useProfiles = Boolean(sellerProfiles), shippingService = 'ShippingMethodStandard' } = {}) => {
    const policySectionXml = useProfiles && sellerProfiles
      ? `${sellerProfiles.shipping.isCalculated ? `
    <ShippingPackageDetails>
      <MeasurementUnit>English</MeasurementUnit>
      <WeightMajor unit="lbs">1</WeightMajor>
      <WeightMinor unit="oz">0</WeightMinor>
      <PackageDepth>2</PackageDepth>
      <PackageLength>12</PackageLength>
      <PackageWidth>10</PackageWidth>
      <ShippingPackage>PackageThickEnvelope</ShippingPackage>
    </ShippingPackageDetails>` : ''}
    <SellerProfiles>
      <SellerShippingProfile>
        <ShippingProfileID>${xmlEscape(sellerProfiles.shipping.id)}</ShippingProfileID>
        <ShippingProfileName>${xmlEscape(sellerProfiles.shipping.name)}</ShippingProfileName>
      </SellerShippingProfile>
      <SellerReturnProfile>
        <ReturnProfileID>${xmlEscape(sellerProfiles.returnPolicy.id)}</ReturnProfileID>
        <ReturnProfileName>${xmlEscape(sellerProfiles.returnPolicy.name)}</ReturnProfileName>
      </SellerReturnProfile>
      <SellerPaymentProfile>
        <PaymentProfileID>${xmlEscape(sellerProfiles.payment.id)}</PaymentProfileID>
        <PaymentProfileName>${xmlEscape(sellerProfiles.payment.name)}</PaymentProfileName>
      </SellerPaymentProfile>
    </SellerProfiles>`
      : `
    <DispatchTimeMax>1</DispatchTimeMax>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <RefundOption>MoneyBack</RefundOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${xmlEscape(shippingService)}</ShippingService>
        <ShippingServiceCost currencyID="USD">${shippingCost}</ShippingServiceCost>${isFreeShipping ? '\n        <FreeShipping>true</FreeShipping>' : ''}
      </ShippingServiceOptions>
    </ShippingDetails>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${xmlEscape(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${xmlEscape(title)}</Title>
    <Description><![CDATA[${cleanCdataHtml}]]></Description>
    <PrimaryCategory>
      <CategoryID>${xmlEscape(categoryId)}</CategoryID>
    </PrimaryCategory>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <StartPrice currencyID="USD">${formattedPrice}</StartPrice>
    <ConditionID>${conditionId}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>${quantity}</Quantity>
    ${skuXml}
    <PictureDetails>
      ${picturesXml}
    </PictureDetails>
    <PostalCode>${xmlEscape(postalCode)}</PostalCode>${policySectionXml}${specificsXml}
  </Item>
</AddFixedPriceItemRequest>`;
  };

  const postAddRequest = async (xmlBody) => {
    const res = await fetchWithTimeout(tradingEndpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlBody
    }, 20000);
    return res.text();
  };

  let text = await postAddRequest(buildAddXml({ useProfiles: Boolean(sellerProfiles), shippingService: 'ShippingMethodStandard' }));
  let ack = extractXmlTag(text, 'Ack') || 'Failure';
  let itemId = extractXmlTag(text, 'ItemID');

  // Automatic fallback if Error 37 occurs on inline ShippingDetails / ShippingService
  if (ack !== 'Success' && ack !== 'Warning' && !sellerProfiles) {
    const firstErr = extractTradingApiError(text, '');
    if (firstErr.errCode === '37' || /ShippingDetails|ShippingService/i.test(firstErr.errMsg || '')) {
      const discoveredService = await discoverTradingFlatShippingService(tradingEndpoint, accessToken);
      if (discoveredService && discoveredService !== 'ShippingMethodStandard') {
        text = await postAddRequest(buildAddXml({ useProfiles: false, shippingService: discoveredService }));
        ack = extractXmlTag(text, 'Ack') || 'Failure';
        itemId = extractXmlTag(text, 'ItemID');
      }
    }
  } else if (ack !== 'Success' && ack !== 'Warning' && sellerProfiles) {
    const firstErr = extractTradingApiError(text, '');
    if (/SellerProfiles|not opted into business policies/i.test(firstErr.errMsg || '')) {
      text = await postAddRequest(buildAddXml({ useProfiles: false, shippingService: 'ShippingMethodStandard' }));
      ack = extractXmlTag(text, 'Ack') || 'Failure';
      itemId = extractXmlTag(text, 'ItemID');
    }
  }

  if ((ack === 'Success' || ack === 'Warning') && itemId) {
    return {
      success: true,
      action: 'created',
      listing_id: itemId,
      ebay_url: `https://www.ebay.com/itm/${itemId}`,
      price: formattedPrice,
      title: title,
      ack: ack
    };
  }

  const { errCode, errMsg } = extractTradingApiError(text, 'eBay returned an unknown error creating listing');
  const err = new Error(`[eBay ${errCode || 'Error'}] ${errMsg}`);
  err.ebayErrorCode = errCode;
  throw err;
}

/**
 * Fetches recent seller orders from the eBay Fulfillment API (/sell/fulfillment/v1/order).
 * Returns an array of up to limit order objects.
 *
 * @param {object} env
 * @param {string} accessToken
 * @param {number} [limit=100]
 * @returns {Promise<Array<object>>}
 */
export async function fetchEbayRecentOrders(env, accessToken, limit = 100) {
  const isSandbox = isEbaySandbox(env);
  const restBase = isSandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';

  try {
    const res = await fetchWithTimeout(`${restBase}/sell/fulfillment/v1/order?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    }, 15000);

    if (res.ok) {
      const data = await res.json();
      return data.orders || [];
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[tokenHelper] fetchEbayRecentOrders status ${res.status}:`, errText.slice(0, 200));
    }
  } catch (e) {
    console.warn('[tokenHelper] fetchEbayRecentOrders exception:', e);
  }
  return [];
}

/**
 * Fetches the eBay order corresponding to an eBay listing ID, SKU, or Title.
 * Uses a multi-tiered strategy:
 * 1. eBay Fulfillment API (/sell/fulfillment/v1/order)
 * 2. eBay Trading API GetItemTransactions (exact listing transaction fallback)
 * 3. eBay Trading API GetOrders (30-day completed seller orders fallback)
 *
 * @param {object} env
 * @param {string} accessToken
 * @param {string|null} listingId - eBay 12-digit ItemID
 * @param {string|null} [sku] - Item SKU if available
 * @param {string|null} [title] - Item name / title if available
 * @returns {Promise<object|null>} Order metadata or null
 */
export async function fetchEbayOrderForListing(env, accessToken, listingId, sku = null, title = null) {
  const cleanId = listingId ? String(listingId).trim() : null;
  const cleanSku = sku ? String(sku).trim() : null;
  const cleanTitle = title ? String(title).trim().toLowerCase() : null;
  const isSandbox = isEbaySandbox(env);
  const restBase = isSandbox
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
  const tradingBase = isSandbox
    ? 'https://api.sandbox.ebay.com/ws/api.dll'
    : 'https://api.ebay.com/ws/api.dll';

  // 1. Try eBay Fulfillment API (/sell/fulfillment/v1/order)
  try {
    const orders = await fetchEbayRecentOrders(env, accessToken, 100);
    for (const order of orders) {
      const lineItems = order.lineItems || [];
        let isExactMatch = false;
        const matchedLine = lineItems.find(li => {
          const lineItemIdMatch = cleanId && (
            String(li.legacyItemId) === cleanId ||
            String(li.lineItemId || '').includes(cleanId) ||
            String(li.itemId || '') === cleanId
          );
          const lineSkuMatch = cleanSku && (String(li.sku || '').toLowerCase() === cleanSku.toLowerCase());
          if (lineItemIdMatch || lineSkuMatch) {
            isExactMatch = true;
            return true;
          }
          const lineTitle = String(li.title || '').toLowerCase();
          const titleMatch = cleanTitle && (
            lineTitle === cleanTitle ||
            (cleanTitle.length >= 20 && (lineTitle.includes(cleanTitle) || cleanTitle.includes(lineTitle)))
          );
          if (titleMatch) {
            isExactMatch = false;
            return true;
          }
          return false;
        });

        if (matchedLine) {
          const orderId = order.orderId;
          const creationDate = order.creationDate || null;
          const saleDate = creationDate ? creationDate.split('T')[0] : new Date().toISOString().split('T')[0];
          const buyerHandle = order.buyer?.username || '';
          const orderStatus = order.orderPaymentStatus || order.orderFulfillmentStatus || 'PAID';
          const lineItemCost = parseFloat(matchedLine.lineItemCost?.value || '0');
          const deliveryCost = parseFloat(matchedLine.deliveryCost?.shippingCost?.value || order.pricingSummary?.deliveryCost?.value || '0');

          return {
            orderId,
            legacyOrderId: order.legacyOrderId || null,
            creationDate,
            saleDate,
            buyerHandle,
            orderStatus,
            salePrice: lineItemCost,
            lineItemCost,
            deliveryCost,
            matchedLine,
            rawOrder: order,
            isExactMatch,
            source: 'fulfillment_api'
          };
        }
      }
  } catch (e) {
    console.warn('[tokenHelper] Fulfillment API fetch order exception:', e);
  }

  // 2. Fallback: eBay Trading API (GetItemTransactions) if listingId is present
  if (cleanId && /^\d+$/.test(cleanId)) {
    try {
      const xmlReq = `<?xml version="1.0" encoding="utf-8"?>
<GetItemTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${cleanId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemTransactionsRequest>`;

      const tRes = await fetchWithTimeout(tradingBase, {
        method: 'POST',
        headers: {
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-CALL-NAME': 'GetItemTransactions',
          'X-EBAY-API-IAF-TOKEN': accessToken,
          'Content-Type': 'text/xml'
        },
        body: xmlReq
      }, 15000);

      if (tRes.ok) {
        const xml = await tRes.text();
        const txnBlockMatch = xml.match(/<Transaction[\s>][\s\S]*?<\/Transaction>/i);
        if (txnBlockMatch) {
          const block = txnBlockMatch[0];
          const buyerHandle = extractXmlTag(block, 'UserID') || extractXmlTag(block, 'Email') || '';
          const createdDate = extractXmlTag(block, 'CreatedDate') || extractXmlTag(block, 'PaidTime');
          const saleDate = createdDate ? createdDate.split('T')[0] : new Date().toISOString().split('T')[0];
          const amountPaid = parseFloat(extractXmlTag(block, 'AmountPaid') || extractXmlTag(block, 'TransactionPrice') || '0');
          const fvf = parseFloat(extractXmlTag(block, 'FinalValueFee') || '0');
          const orderId = extractXmlTag(block, 'OrderID') || extractXmlTag(block, 'OrderLineItemID') || `${cleanId}-sale`;
          const shipCostMatch = block.match(/<ShippingServiceCost[^>]*>([0-9.]+)<\/ShippingServiceCost>/i) ||
                                block.match(/<ShippingCost[^>]*>([0-9.]+)<\/ShippingCost>/i);
          const shipCost = shipCostMatch ? parseFloat(shipCostMatch[1]) : 0;

          if (amountPaid > 0 || buyerHandle) {
            return {
              orderId,
              legacyOrderId: orderId,
              creationDate: createdDate,
              saleDate,
              buyerHandle,
              orderStatus: 'PAID',
              salePrice: amountPaid,
              lineItemCost: amountPaid,
              deliveryCost: shipCost,
              finalValueFee: fvf,
              isExactMatch: true,
              source: 'trading_transactions'
            };
          }
        }
      }
    } catch (tErr) {
      console.warn('[tokenHelper] GetItemTransactions fallback exception:', tErr);
    }
  }

  // 3. Fallback: eBay Trading API (GetOrders) for recent completed seller orders
  try {
    const xmlOrdersReq = `<?xml version="1.0" encoding="utf-8"?>
<GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <OrderRole>Seller</OrderRole>
  <OrderStatus>Completed</OrderStatus>
  <NumberOfDays>30</NumberOfDays>
  <DetailLevel>ReturnAll</DetailLevel>
</GetOrdersRequest>`;

    const oRes = await fetchWithTimeout(tradingBase, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetOrders',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlOrdersReq
    }, 15000);

    if (oRes.ok) {
      const xml = await oRes.text();
      const orderBlocks = xml.match(/<Order[\s>][\s\S]*?<\/Order>/g) || [];

      for (const block of orderBlocks) {
        const itemIdInOrder = extractXmlTag(block, 'ItemID');
        const skuInOrder = extractXmlTag(block, 'SKU');
        const titleInOrder = (extractXmlTag(block, 'Title') || '').toLowerCase();

        const matchId = cleanId && (itemIdInOrder === cleanId || block.includes(`<ItemID>${cleanId}</ItemID>`));
        const matchSku = cleanSku && (skuInOrder?.toLowerCase() === cleanSku.toLowerCase());
        const matchTitle = cleanTitle && (
          titleInOrder === cleanTitle ||
          (cleanTitle.length >= 20 && (titleInOrder.includes(cleanTitle) || cleanTitle.includes(titleInOrder)))
        );

        if (matchId || matchSku || matchTitle) {
          const isExactMatch = Boolean(matchId || matchSku);
          const orderId = extractXmlTag(block, 'OrderID') || extractXmlTag(block, 'ExtendedOrderID') || `${cleanId || 'order'}-sale`;
          const buyerHandle = extractXmlTag(block, 'BuyerUserID') || extractXmlTag(block, 'UserID') || '';
          const createdDate = extractXmlTag(block, 'CreatedTime') || extractXmlTag(block, 'PaidTime');
          const saleDate = createdDate ? createdDate.split('T')[0] : new Date().toISOString().split('T')[0];
          const totalPaid = parseFloat(extractXmlTag(block, 'AmountPaid') || extractXmlTag(block, 'Total') || '0');
          const subtotal = parseFloat(extractXmlTag(block, 'Subtotal') || extractXmlTag(block, 'TransactionPrice') || String(totalPaid));
          const shipCost = parseFloat(extractXmlTag(block, 'ShippingServiceCost') || extractXmlTag(block, 'ShippingCost') || '0');
          const fvf = parseFloat(extractXmlTag(block, 'FinalValueFee') || '0');

          return {
            orderId,
            legacyOrderId: orderId,
            creationDate: createdDate,
            saleDate,
            buyerHandle,
            orderStatus: 'PAID',
            salePrice: subtotal > 0 ? subtotal : totalPaid,
            lineItemCost: subtotal > 0 ? subtotal : totalPaid,
            deliveryCost: shipCost,
            finalValueFee: fvf,
            isExactMatch,
            source: 'trading_orders'
          };
        }
      }
    }
  } catch (oErr) {
    console.warn('[tokenHelper] GetOrders fallback exception:', oErr);
  }

  return null;
}

/**
 * Fetches transaction and fee breakdown details for an eBay order from the Finances API.
 * Endpoint: GET /sell/finances/v1/transaction?orderId={orderId}&limit=100
 *
 * @param {object} env
 * @param {string} accessToken
 * @param {string} orderId
 * @returns {Promise<object>} Financial fee breakdown
 */
export async function fetchEbayOrderFinances(env, accessToken, orderId) {
  if (!orderId) return { finances_available: false, error: 'Order ID is required' };
  const cleanOrderId = String(orderId).trim();
  const isSandbox = isEbaySandbox(env);
  const financesBase = isSandbox
    ? 'https://apiz.sandbox.ebay.com'
    : 'https://apiz.ebay.com';

  try {
    const res = await fetchWithTimeout(`${financesBase}/sell/finances/v1/transaction?filter=orderId:{${encodeURIComponent(cleanOrderId)}}&limit=100`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    }, 15000);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 403) {
        console.warn('[tokenHelper] Finances API 403 - scope pending approval');
        return {
          finances_available: false,
          pending_scope_approval: true,
          message: 'eBay Finances API access requires sell.finances scope approval.'
        };
      }
      if (res.status === 429) {
        console.warn('[tokenHelper] Finances API 429 - rate limit exceeded');
        return {
          finances_available: false,
          rate_limited: true,
          error: 'eBay Finances API rate limit exceeded. Please try again later.'
        };
      }
      console.warn(`[tokenHelper] Finances API error (${res.status}):`, text);
      return { finances_available: false, error: 'eBay Finances request failed. Please check your eBay connection.' };
    }

    const data = await res.json();
    const transactions = data.transactions || [];

    let finalValueFee = 0;
    let promotedListingFee = 0;
    let shippingLabelCost = 0;
    let paymentProcessingFee = 0;
    let regulatoryFee = 0;
    let promotedListingRate = null;
    let promotedListingActive = false;
    let grossSaleAmount = 0;

    for (const txn of transactions) {
      const type = (txn.transactionType || '').toUpperCase();
      const amount = Math.abs(parseFloat(txn.amount?.value || '0'));

      if (type === 'SALE') {
        const basis = parseFloat(txn.totalFeeBasisAmount?.value || txn.orderLineItems?.[0]?.feeBasisAmount?.value || txn.amount?.value || '0');
        if (basis > 0) grossSaleAmount = basis;

        // Parse order line item marketplace fees
        const orderLineItems = txn.orderLineItems || [];
        for (const oli of orderLineItems) {
          if (oli.promotedListingRate) {
            promotedListingRate = parseFloat(oli.promotedListingRate);
            promotedListingActive = true;
          }
          const mpFees = oli.marketplaceFees || [];
          for (const mf of mpFees) {
            const fType = (mf.feeType || '').toUpperCase();
            const fAmount = Math.abs(parseFloat(mf.amount?.value || '0'));
            if (fType.includes('FINAL_VALUE')) {
              finalValueFee += fAmount;
            } else if (fType.includes('AD_FEE') || fType.includes('PROMOTED')) {
              promotedListingFee += fAmount;
              promotedListingActive = true;
            } else if (fType.includes('REGULATORY')) {
              regulatoryFee += fAmount;
            } else {
              paymentProcessingFee += fAmount;
            }
          }
        }

        // Fallback: If no marketplaceFees breakdown but totalFeeAmount is provided
        if (finalValueFee === 0 && txn.totalFeeAmount?.value) {
          finalValueFee = Math.abs(parseFloat(txn.totalFeeAmount.value));
        }
      } else if (type === 'SHIPPING_LABEL') {
        shippingLabelCost += amount;
      } else if (type === 'NON_SALE_CHARGE') {
        const feeType = (txn.feeType || txn.orderLineItems?.[0]?.feeType || '').toUpperCase();
        if (feeType.includes('FINAL_VALUE')) {
          finalValueFee += amount;
        } else if (feeType.includes('AD_FEE') || feeType.includes('PROMOTED')) {
          promotedListingFee += amount;
          promotedListingActive = true;
          if (txn.orderLineItems?.[0]?.promotedListingRate) {
            promotedListingRate = parseFloat(txn.orderLineItems[0].promotedListingRate);
          }
        } else if (feeType.includes('REGULATORY')) {
          regulatoryFee += amount;
        } else {
          paymentProcessingFee += amount;
        }
      }
    }

    const totalEbayFees = finalValueFee + promotedListingFee + shippingLabelCost + paymentProcessingFee + regulatoryFee;

    return {
      finances_available: true,
      order_id: cleanOrderId,
      gross_sale_amount: parseFloat(grossSaleAmount.toFixed(2)),
      final_value_fee: parseFloat(finalValueFee.toFixed(2)),
      promoted_listing_fee: parseFloat(promotedListingFee.toFixed(2)),
      shipping_label_cost: parseFloat(shippingLabelCost.toFixed(2)),
      payment_processing_fee: parseFloat(paymentProcessingFee.toFixed(2)),
      regulatory_fee: parseFloat(regulatoryFee.toFixed(2)),
      total_ebay_fees: parseFloat(totalEbayFees.toFixed(2)),
      promoted_listing_rate: promotedListingRate,
      promoted_listing_active: promotedListingActive,
      transaction_count: transactions.length,
      raw: transactions
    };
  } catch (e) {
    if (e?.isTimeout || e?.name === 'TimeoutError') {
      console.warn(`[tokenHelper] Finances API timeout for order ${cleanOrderId}`);
      return { finances_available: false, timeout: true, error: 'eBay Finances request timed out. Please try again.' };
    }
    console.warn('[tokenHelper] Finances API exception:', e);
    return { finances_available: false, error: 'Failed to retrieve eBay finances data.' };
  }
}

/**
 * Minimizes eBay finances transaction data into a bounded, structured summary
 * containing only the financial audit fields used by Outpost, preventing
 * raw PII retention liability and ensuring valid parseable JSON (PRIV-002 / FUNC-020).
 *
 * @param {Array} rawTransactions - Raw transaction list from eBay Finances API
 * @param {number} retentionDays - Retention period in days (default: 90)
 * @returns {string} Serialized valid JSON summary
 */
export function buildFinancesSummary(rawTransactions, retentionDays = 90) {
  const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];
  const now = new Date();
  const retentionUntil = new Date(now.getTime() + retentionDays * 86400000).toISOString();

  const summary = {
    version: '1.0',
    reconciled_at: now.toISOString(),
    retention_days: retentionDays,
    retention_until: retentionUntil,
    transaction_count: transactions.length,
    transactions: transactions.slice(0, 50).map(t => {
      const fees = [];
      const orderLineItems = Array.isArray(t.orderLineItems) ? t.orderLineItems : [];
      for (const oli of orderLineItems) {
        if (Array.isArray(oli.marketplaceFees)) {
          for (const mf of oli.marketplaceFees) {
            fees.push({
              feeType: mf.feeType || null,
              amount: mf.amount?.value ? parseFloat(mf.amount.value) : null
            });
          }
        }
      }
      return {
        transactionId: t.transactionId || null,
        transactionType: t.transactionType || null,
        transactionDate: t.transactionDate || null,
        amount: t.amount?.value ? parseFloat(t.amount.value) : (typeof t.amount === 'number' ? t.amount : null),
        feeBasisAmount: t.totalFeeBasisAmount?.value
          ? parseFloat(t.totalFeeBasisAmount.value)
          : (orderLineItems[0]?.feeBasisAmount?.value ? parseFloat(orderLineItems[0].feeBasisAmount.value) : null),
        feeType: t.feeType || orderLineItems[0]?.feeType || null,
        fees: fees.length > 0 ? fees : undefined
      };
    })
  };

  return JSON.stringify(summary);
}

/**
 * Reconciles and atomically saves a completed eBay sale into Cloudflare D1.
 * Upserts auction_sales, ebay_fee_reconciliations, and updates auction_items.
 *
 * @param {object} env
 * @param {string} userId
 * @param {object} item - auction_items row
 * @param {object|null} orderData - Result from fetchEbayOrderForListing
 * @param {object|null} financeData - Result from fetchEbayOrderFinances
 * @returns {Promise<{ sale: object, reconciliation: object, item: object }>}
 */
export async function reconcileAndSaveEbaySale(env, userId, item, orderData = null, financeData = null) {
  const saleDate = orderData?.saleDate || item.date_sold || new Date().toISOString().split('T')[0];
  const buyerHandle = orderData?.buyerHandle || '';
  const ebayOrderId = orderData?.orderId || financeData?.order_id || null;

  const buyerShippingPaid = orderData?.deliveryCost != null
    ? orderData.deliveryCost
    : (item.buyer_shipping_cost || 0);

  let grossSalePrice = 0;
  if (orderData?.lineItemCost && orderData.lineItemCost > 0) {
    grossSalePrice = orderData.lineItemCost;
  } else if (financeData?.gross_sale_amount && financeData.gross_sale_amount > 0) {
    if (buyerShippingPaid > 0 && financeData.gross_sale_amount > buyerShippingPaid) {
      grossSalePrice = parseFloat((financeData.gross_sale_amount - buyerShippingPaid).toFixed(2));
    } else {
      grossSalePrice = financeData.gross_sale_amount;
    }
  } else if (item.current_list_price && item.current_list_price > 0) {
    grossSalePrice = item.current_list_price;
  } else if (item.actual_sell_price && item.actual_sell_price > 0) {
    grossSalePrice = item.actual_sell_price;
  }

  let finalValueFee = 0;
  let promotedListingFee = 0;
  let shippingLabelCost = 0;
  let paymentProcessingFee = 0;
  let regulatoryFee = 0;
  let totalEbayFees = 0;
  let promotedRate = item.ebay_promoted_rate || (item.boost_pct ? item.boost_pct * 100 : 0);
  let promotedActive = false;

  // T-10 item 3: one fee default, hoisted so both the estimate branch and the
  // reconciliation estimate below read the same numbers.
  const feePct = item.platform_fee_pct ?? DEFAULT_PLATFORM_FEE_PCT;
  const flatFee = item.platform_flat_fee ?? DEFAULT_PLATFORM_FLAT_FEE;

  if (financeData?.finances_available) {
    finalValueFee = financeData.final_value_fee || 0;
    promotedListingFee = financeData.promoted_listing_fee || 0;
    shippingLabelCost = financeData.shipping_label_cost || (item.est_shipping_cost || 0);
    paymentProcessingFee = financeData.payment_processing_fee || 0;
    regulatoryFee = financeData.regulatory_fee || 0;
    totalEbayFees = financeData.total_ebay_fees || (finalValueFee + promotedListingFee + shippingLabelCost + paymentProcessingFee + regulatoryFee);
    promotedRate = financeData.promoted_listing_rate ?? promotedRate;
    promotedActive = Boolean(financeData.promoted_listing_active || promotedListingFee > 0);
  } else {
    finalValueFee = parseFloat((grossSalePrice * feePct + flatFee).toFixed(2));
    promotedListingFee = promotedRate > 0 ? parseFloat((grossSalePrice * (promotedRate / 100)).toFixed(2)) : 0;
    shippingLabelCost = item.est_shipping_cost || 0;
    totalEbayFees = parseFloat((finalValueFee + promotedListingFee + shippingLabelCost).toFixed(2));
    promotedActive = promotedListingFee > 0;
  }

  const platformFeesAmt = parseFloat((finalValueFee + promotedListingFee + paymentProcessingFee + regulatoryFee).toFixed(2));
  const actualShippingCost = shippingLabelCost;
  const netProceeds = parseFloat((grossSalePrice + buyerShippingPaid - platformFeesAmt - actualShippingCost).toFixed(2));
  const trueCost = item.true_total_cost || (item.unit_price || 0);
  const netProfit = parseFloat((netProceeds - trueCost).toFixed(2));
  // T-09 item 2: roi_pct is NOT computed here. normalizeSaleInput derives it from
  // computeSaleMetrics using the same net_proceeds and true_total_cost, so this
  // path cannot drift from the other three.

  // T-11 item 8: daysBetween returns null for an invalid ordering (sale date
  // before acquisition). That null is passed straight through so the row is
  // EXCLUDED from AVG(days_to_sell) instead of contributing a phantom zero.
  const startDate = item.date_listed || item.date_acquired;
  const daysToSell = daysBetween(startDate, saleDate);

  const priorSale = await env.DB.prepare(
    'SELECT id FROM auction_sales WHERE item_id = ? AND user_id = ?'
  ).bind(item.id, userId).first();

  let savedSale = await markItemSold(env, userId, item, {
    sale_date: saleDate,
    platform: 'eBay',
    buyer_handle: buyerHandle || null,
    ebay_order_id: ebayOrderId || null,
    gross_sale_price: grossSalePrice,
    buyer_shipping_paid: buyerShippingPaid,
    actual_shipping_cost: actualShippingCost,
    platform_fee_pct: feePct,
    platform_flat_fee: flatFee,
    platform_fees_amt: platformFeesAmt,
    payment_processing_amt: paymentProcessingFee,
    promoted_listing_fee: promotedListingFee,
    net_proceeds: netProceeds,
    true_total_cost: trueCost,
    days_to_sell: daysToSell,
    // T-12 item 1: the flag must describe what actually happened. The estimate
    // branch above (finances_available false) derives fees from platform_fee_pct
    // and never contacts the Finances API, so nothing was reconciled. Stamping
    // fee_reconciled_at there marked a row as verified while the
    // ebay_fee_reconciliations insert below was skipped, producing a reconciled
    // timestamp with no reconciliation record and no order id.
    fee_reconciled: Boolean(financeData?.finances_available)
  });
  let saleId = savedSale.id;

  // Upsert ebay_fee_reconciliations if ebayOrderId is known. T-12 item 2: an
  // order id alone is not enough, because without Finances API data this row
  // would store estimate-derived fees in a table whose every other row holds
  // eBay-verified amounts.
  let reconRow = null;
  try {
    if (ebayOrderId && financeData?.finances_available) {
      const reconId = `recon-${crypto.randomUUID()}`;
      const estimatedFees = parseFloat((item.platform_fees_amt || (grossSalePrice * feePct + flatFee)).toFixed(2));
      const feeDelta = parseFloat((totalEbayFees - estimatedFees).toFixed(4));

      await env.DB.prepare(`
        INSERT INTO ebay_fee_reconciliations (
          id, sale_id, user_id, ebay_order_id,
          final_value_fee, promoted_listing_fee, shipping_label_cost,
          payment_processing_fee, regulatory_fee,
          total_ebay_fees, estimated_fees, fee_delta, reconciled_net_profit,
          promoted_listing_rate, promoted_listing_active, finances_api_raw,
          reconciled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(sale_id) DO UPDATE SET
          ebay_order_id           = excluded.ebay_order_id,
          final_value_fee         = excluded.final_value_fee,
          promoted_listing_fee    = excluded.promoted_listing_fee,
          shipping_label_cost     = excluded.shipping_label_cost,
          payment_processing_fee  = excluded.payment_processing_fee,
          regulatory_fee          = excluded.regulatory_fee,
          total_ebay_fees         = excluded.total_ebay_fees,
          estimated_fees          = excluded.estimated_fees,
          fee_delta               = excluded.fee_delta,
          reconciled_net_profit   = excluded.reconciled_net_profit,
          promoted_listing_rate   = excluded.promoted_listing_rate,
          promoted_listing_active = excluded.promoted_listing_active,
          finances_api_raw        = excluded.finances_api_raw,
          reconciled_at           = datetime('now')
      `).bind(
        reconId,
        saleId,
        userId,
        ebayOrderId,
        finalValueFee,
        promotedListingFee,
        shippingLabelCost,
        paymentProcessingFee,
        regulatoryFee,
        totalEbayFees,
        estimatedFees,
        feeDelta,
        netProfit,
        promotedRate,
        promotedActive ? 1 : 0,
        buildFinancesSummary(financeData?.raw || [])
      ).run();

      reconRow = {
        id: reconId,
        sale_id: saleId,
        ebay_order_id: ebayOrderId,
        final_value_fee: finalValueFee,
        promoted_listing_fee: promotedListingFee,
        shipping_label_cost: shippingLabelCost,
        payment_processing_fee: paymentProcessingFee,
        regulatory_fee: regulatoryFee,
        total_ebay_fees: totalEbayFees,
        reconciled_net_profit: netProfit,
        fee_delta: feeDelta
      };
    }

    // Update auction_items status & pricing
    await env.DB.prepare(`
      UPDATE auction_items SET
        status = 'Sold',
        actual_sell_price = ?,
        date_sold = ?,
        days_on_market = ?,
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(
      grossSalePrice,
      saleDate,
      daysToSell,
      item.id,
      userId
    ).run();
  } catch (postSaleErr) {
    console.error(`[reconcileAndSaveEbaySale] Error updating reconciliations or item for item ${item.id}:`, postSaleErr);
    await env.DB.prepare('DELETE FROM ebay_fee_reconciliations WHERE sale_id = ? AND user_id = ?').bind(saleId, userId).run().catch(() => {});
    if (!priorSale) {
      await env.DB.prepare('DELETE FROM auction_sales WHERE id = ? AND user_id = ?').bind(saleId, userId).run().catch(() => {});
    }
    await env.DB.prepare(`
      UPDATE auction_items SET
        status = ?, actual_sell_price = ?, date_sold = ?, days_on_market = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).bind(item.status, item.actual_sell_price, item.date_sold, item.days_on_market, item.id, userId).run().catch(() => {});
    throw postSaleErr;
  }

  const updatedItem = await env.DB.prepare(
    'SELECT * FROM auction_items WHERE id = ? AND user_id = ?'
  ).bind(item.id, userId).first();

  savedSale = await env.DB.prepare(
    'SELECT * FROM auction_sales WHERE id = ? AND user_id = ?'
  ).bind(saleId, userId).first();

  return {
    item: updatedItem,
    sale: savedSale,
    reconciliation: reconRow
  };
}



