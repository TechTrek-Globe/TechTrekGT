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

// --- Token Crypto (AES-GCM, matches outpost/functions/utils/tokenCrypto.js) ---
//
// v1 (legacy): "<iv_b64>.<ciphertext_b64>"    - PBKDF2 100k iters, OLD_SALT or NEW_SALT
// v2 (current): "v2.<iv_b64>.<ciphertext_b64>" - PBKDF2 310k iters, NEW_SALT
//
// FOLLOW-UP: Remove v1/OLD_SALT decryption path after all tokens re-encrypted. 2026-12-31.

export const OLD_SALT = new TextEncoder().encode('techtrekgt-ebay-token-v1');
export const NEW_SALT = new TextEncoder().encode('techtrekgt-token-encryption-v2');
export const PBKDF2_ITERATIONS_V1 = 100_000;
export const PBKDF2_ITERATIONS_V2 = 310_000;
export const PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V2;

const _V2_PREFIX = 'v2';

export async function deriveKey(secret, salt = NEW_SALT, iterations = PBKDF2_ITERATIONS_V2) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Decrypts a stored eBay token.
 * Returns { plaintext, wasLegacy } - wasLegacy=true signals caller to re-encrypt under v2.
 * Throws a clear error on corrupted ciphertext - never returns null silently.
 * TOKEN_ENCRYPTION_KEY required. No JWT_SECRET substitution.
 */
export async function decryptToken(encrypted, tokenEncryptionKey) {
  if (!encrypted) return { plaintext: null, wasLegacy: false };
  if (!tokenEncryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY binding is required for decryption');

  // --- v2 path ---
  if (encrypted.startsWith(`${_V2_PREFIX}.`)) {
    const rest = encrypted.slice(_V2_PREFIX.length + 1);
    const dotIdx = rest.indexOf('.');
    if (dotIdx === -1) throw new Error('Invalid v2 encrypted token format');
    const iv = base64ToBuf(rest.slice(0, dotIdx));
    const cipherBuf = base64ToBuf(rest.slice(dotIdx + 1));
    const key = await deriveKey(tokenEncryptionKey, NEW_SALT, PBKDF2_ITERATIONS_V2);
    let plainBuf;
    try {
      plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    } catch (_) {
      throw new Error('Failed to decrypt v2 token: invalid key or ciphertext corrupted');
    }
    return { plaintext: new TextDecoder().decode(plainBuf), wasLegacy: false };
  }

  // --- v1 (legacy) path ---
  const dotIdx = encrypted.indexOf('.');
  if (dotIdx === -1) throw new Error('Invalid encrypted token format');
  const iv = base64ToBuf(encrypted.slice(0, dotIdx));
  const cipherBuf = base64ToBuf(encrypted.slice(dotIdx + 1));

  try {
    const key = await deriveKey(tokenEncryptionKey, NEW_SALT, PBKDF2_ITERATIONS_V1);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    return { plaintext: new TextDecoder().decode(plainBuf), wasLegacy: true };
  } catch (_) { /* fall through */ }

  try {
    const key = await deriveKey(tokenEncryptionKey, OLD_SALT, PBKDF2_ITERATIONS_V1);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    return { plaintext: new TextDecoder().decode(plainBuf), wasLegacy: true };
  } catch (_) { /* both paths exhausted */ }

  throw new Error('Failed to decrypt token: invalid key or ciphertext corrupted');
}

/**
 * Encrypts a plain-text token. Returns v2 versioned envelope.
 * TOKEN_ENCRYPTION_KEY required. Throws if absent.
 */
export async function encryptToken(plaintext, tokenEncryptionKey) {
  if (!tokenEncryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY binding is required');
  const key = await deriveKey(tokenEncryptionKey, NEW_SALT, PBKDF2_ITERATIONS_V2);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${_V2_PREFIX}.${bufToBase64(iv)}.${bufToBase64(cipherBuf)}`;
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
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
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

  const res = await fetch(oauthUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[tokenHelper] eBay token refresh failed (${res.status}):`, text);
    throw new Error('eBay token refresh failed. Please reconnect your eBay account.');
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

    const tradingRes = await fetch(tradingBase, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlReq
    });

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
            status: listingStatus === 'Completed' ? 'Sold' : listingStatus,
            image_url: galleryUrl,
            listing_url: listingId ? `https://www.ebay.com/itm/${listingId}` : null
          });
        }
      }
    }
  } catch (e) {
    console.warn('[tokenHelper] Trading API GetMyeBaySelling exception:', e);
  }

  // 2. Also try Sell Inventory API to capture inventory-model listings
  try {
    const invRes = await fetch(`${restBase}/sell/inventory/v1/inventory_item?limit=100&offset=0`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (invRes.ok) {
      const invData = await invRes.json();
      const inventoryItems = invData.inventoryItems || [];

      for (const inv of inventoryItems) {
        try {
          const offerRes = await fetch(
            `${restBase}/sell/inventory/v1/offer?sku=${encodeURIComponent(inv.sku)}&limit=1`,
            { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
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

    const res = await fetch(tradingBase, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlReq
    });

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
          const browseRes = await fetch(browseUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
              'Content-Type': 'application/json'
            }
          });
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
          const polRes = await fetch(policyUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
          });
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
              const campRes = await fetch(`${mktBase}/sell/marketing/v1/ad_campaign?limit=50`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: 'application/json',
                  'Content-Type': 'application/json'
                }
              });

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
                  const adRes = await fetch(`${mktBase}/sell/marketing/v1/ad_campaign/${camp.campaignId}/ad?listing_id=${cleanId}`, {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      Accept: 'application/json',
                      'Content-Type': 'application/json'
                    }
                  });
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
                    const checkAds = await fetch(`${mktBase}/sell/marketing/v1/ad_campaign/${camp.campaignId}/ad?limit=200`, {
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                      }
                    });
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
          status: listingStatus === 'Completed' ? 'Sold' : 'Listed',
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
      status: found.status === 'Completed' ? 'Sold' : 'Listed',
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
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${cleanId}</ItemID>
    <SKU>${cleanSku.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</SKU>
  </Item>
</${callName}Request>`;

  // 1. Try ReviseFixedPriceItem first
  let res = await fetch(tradingEndpoint, {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml'
    },
    body: makeXml('ReviseFixedPriceItem')
  });

  let text = await res.text();
  let ack = extractXmlTag(text, 'Ack') || 'Failure';

  // 2. If item is an Auction format, try ReviseItem
  if (ack !== 'Success' && ack !== 'Warning') {
    res = await fetch(tradingEndpoint, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'ReviseItem',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: makeXml('ReviseItem')
    });
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
    const res = await fetch(`${restBase}/sell/fulfillment/v1/order?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

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

      const tRes = await fetch(tradingBase, {
        method: 'POST',
        headers: {
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-CALL-NAME': 'GetItemTransactions',
          'X-EBAY-API-IAF-TOKEN': accessToken,
          'Content-Type': 'text/xml'
        },
        body: xmlReq
      });

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

    const oRes = await fetch(tradingBase, {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetOrders',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      body: xmlOrdersReq
    });

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
    const res = await fetch(`${financesBase}/sell/finances/v1/transaction?filter=orderId:{${encodeURIComponent(cleanOrderId)}}&limit=100`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

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

  let grossSalePrice = 0;
  if (financeData?.gross_sale_amount && financeData.gross_sale_amount > 0) {
    grossSalePrice = financeData.gross_sale_amount;
  } else if (orderData?.lineItemCost && orderData.lineItemCost > 0) {
    grossSalePrice = orderData.lineItemCost;
  } else if (item.current_list_price && item.current_list_price > 0) {
    grossSalePrice = item.current_list_price;
  } else if (item.actual_sell_price && item.actual_sell_price > 0) {
    grossSalePrice = item.actual_sell_price;
  }

  const buyerShippingPaid = orderData?.deliveryCost != null
    ? orderData.deliveryCost
    : (item.buyer_shipping_cost || 0);

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
    await env.DB.prepare('DELETE FROM auction_sales WHERE id = ? AND user_id = ?').bind(saleId, userId).run().catch(() => {});
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



